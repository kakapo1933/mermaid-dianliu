import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { chunkMarkdown, splitMermaid } from '../hooks/split'

const PLUGIN = 'mermaid-dianliu'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'

// 每個測試用不同的圖，免得模組層的快取讓測試互相影響。
const reply = (diagram: string) => ['流程如下：', '', '```mermaid', diagram, '```', '', '以上。'].join('\n')
const props = (text: string) => ({ text, isFirstOfReply: true })

type Answer = { ok: true; svg: string } | { ok: false; reason: string }
type Call = { argv: readonly string[]; stdin: string }

// 站在 mod 底下扮演引擎：引擎自己畫回覆的方式（一個 Markdown）、debug log、以及主機上的轉圖腳本。
function engine(on: On, answer: (call: Call) => Answer | 'missing') {
  const calls: Call[] = []
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => $.ui.resolve(e).Markdown({ key: 'engine', text: e.props.text }))
  on('process.run', ($, e) => {
    const call = { argv: e.argv, stdin: e.init?.stdin ?? '' }
    calls.push(call)
    const answered = answer(call)
    if (answered === 'missing') return { deny: `spawn ${e.argv[0]} ENOENT` }
    return { value: { exitCode: 0, stdout: JSON.stringify(answered), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return calls
}

const mount = ($: Engine, surface: 'desktop' | 'terminal', text: string) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AssistantMessage', props: props(text) })

test('桌面版：mermaid 區塊畫成 Svg，前後文字照舊，同一張圖只轉一次', async ($, on) => {
  const calls = engine(on, () => ({ ok: true, svg: SVG }))
  const text = reply('flowchart TD\n  A --> B')
  for (let round = 0; round < 2; round++) {
    const ui = await mount($, 'desktop', text)
    await ui.redraw()
    expect((await ui.find({ type: 'Svg' }))?.props.source).toBe(SVG)
    expect(await ui.find({ type: 'Markdown', text: /```mermaid/ })).toBeUndefined()
    expect(await ui.find({ type: 'Markdown', text: /流程如下/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /以上。/ })).toBeDefined()
    await ui.unmount()
  }
  expect(calls.length).toBe(1)
  expect(calls[0]?.argv[0]).toBe('node')
  expect(calls[0]?.argv[1]).toMatch(/renderer\/render\.mjs$/)
  expect(calls[0]?.stdin).toBe('flowchart TD\n  A --> B')
})

test('終端機：原樣交給引擎，不啟動轉圖', async ($, on) => {
  const calls = engine(on, () => ({ ok: true, svg: SVG }))
  const ui = await mount($, 'terminal', reply('flowchart TD\n  T1 --> T2'))
  await ui.redraw()
  expect(await ui.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
  expect(calls.length).toBe(0)
  await ui.unmount()
})

test('沒有 mermaid 區塊的回覆不動', async ($, on) => {
  const calls = engine(on, () => ({ ok: true, svg: SVG }))
  const ui = await mount($, 'desktop', '只有文字，還有\n\n```js\nconst a = 1\n```')
  await ui.redraw()
  expect((await ui.find({ key: 'engine' }))?.type).toBe('Markdown')
  expect(calls.length).toBe(0)
  await ui.unmount()
})

test('腳本回報畫不出來：保留程式碼區塊，之後不再重試', async ($, on) => {
  const calls = engine(on, () => ({ ok: false, reason: 'Invalid mermaid header' }))
  const text = reply('pie title 不支援\n  "A" : 1')
  for (let round = 0; round < 2; round++) {
    const ui = await mount($, 'desktop', text)
    await ui.redraw()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
    await ui.unmount()
  }
  expect(calls.length).toBe(1)
})

test('SVG 超過 Svg 元件上限：保留程式碼區塊', async ($, on) => {
  engine(on, () => ({ ok: true, svg: `<svg>${'x'.repeat(131072)}</svg>` }))
  const ui = await mount($, 'desktop', reply('flowchart TD\n  BIG1 --> BIG2'))
  await ui.redraw()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
  await ui.unmount()
})

test('一則回覆兩張圖，其中一張失敗：成功的畫圖，失敗的留程式碼', async ($, on) => {
  engine(on, call => (call.stdin.startsWith('pie') ? { ok: false, reason: 'unsupported' } : { ok: true, svg: SVG }))
  const text = ['```mermaid', 'flowchart LR\n  M1 --> M2', '```', '中間的字', '```mermaid', 'pie title 混合\n  "B" : 2', '```'].join('\n')
  const ui = await mount($, 'desktop', text)
  await ui.redraw()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /中間的字/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /```mermaid\npie/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /flowchart LR/ })).toBeUndefined()
  await ui.unmount()
})

test('找不到 node：改用 bun', async ($, on) => {
  const calls = engine(on, call => (call.argv[0] === 'node' ? 'missing' : { ok: true, svg: SVG }))
  const ui = await mount($, 'desktop', reply('flowchart TD\n  F1 --> F2'))
  await ui.redraw()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(calls.map(c => c.argv[0])).toEqual(['node', 'bun'])
  await ui.unmount()
})

test('node 和 bun 都沒有：保留程式碼區塊，最多重試三次', async ($, on) => {
  const calls = engine(on, () => 'missing')
  const text = reply('flowchart TD\n  N1 --> N2')
  for (let round = 0; round < 5; round++) {
    const ui = await mount($, 'desktop', text)
    await ui.redraw()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Markdown', text: /```mermaid/ })).toBeDefined()
    await ui.unmount()
  }
  expect(calls.length).toBe(6)
})

test('splitMermaid：只認已閉合、且不在其他 fence 裡的 mermaid 區塊', () => {
  expect(splitMermaid('a\n```mermaid\ngraph TD\n```\nb')).toEqual([
    { kind: 'markdown', text: 'a' },
    { kind: 'mermaid', source: 'graph TD', raw: '```mermaid\ngraph TD\n```' },
    { kind: 'markdown', text: 'b' },
  ])
  // 還在串流、尚未閉合。
  expect(splitMermaid('a\n```mermaid\ngraph TD\n  A -->').map(s => s.kind)).toEqual(['markdown'])
  // 包在四個反引號的示範區塊裡。
  expect(splitMermaid('````markdown\n```mermaid\ngraph TD\n```\n````').map(s => s.kind)).toEqual(['markdown'])
  // 清單裡縮排的 fence：內容去掉同樣的縮排。
  expect(splitMermaid('- 項目\n  ```mermaid\n  graph TD\n    A --> B\n  ```')[1]).toEqual({
    kind: 'mermaid',
    source: 'graph TD\n  A --> B',
    raw: '  ```mermaid\n  graph TD\n    A --> B\n  ```',
  })
  // 波浪線 fence、語言名大小寫。
  expect(splitMermaid('~~~Mermaid\ngraph LR\n~~~').map(s => s.kind)).toEqual(['mermaid'])
  // 空的區塊不算。
  expect(splitMermaid('```mermaid\n\n```').map(s => s.kind)).toEqual(['markdown'])
})

test('chunkMarkdown：在段落空行切開，fence 裡的空行不切，單段過長回傳 undefined', () => {
  expect(chunkMarkdown('短短的')).toEqual(['短短的'])
  const para = 'x'.repeat(40)
  expect(chunkMarkdown(`${para}\n\n${para}\n\n${para}`, 90)).toEqual([`${para}\n\n${para}`, para])
  const fenced = `\`\`\`\n${'y'.repeat(30)}\n\n${'y'.repeat(30)}\n\`\`\``
  expect(chunkMarkdown(`${para}\n\n${fenced}`, 80)).toEqual([para, fenced])
  expect(chunkMarkdown('z'.repeat(200), 100)).toBeUndefined()
})
