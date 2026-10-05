// 轉圖腳本的測試，用 node 內建的測試執行器跑：node --test renderer/render.test.mjs
// 有沒有本機覆蓋檔都要過：對色值的斷言一律取自「目前生效的主題」，不寫死。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import * as defaults from './default.tokens.mjs'
import { prepare, render } from './render.mjs'
import { CLASSDEFS, TOKENS } from './tokens.mjs'

const script = fileURLToPath(new URL('./render.mjs', import.meta.url))
const run = (source, env = {}) =>
  JSON.parse(spawnSync(process.execPath, [script], { input: source, encoding: 'utf8', env: { ...process.env, ...env } }).stdout)

const FLOW = 'flowchart TD\n  A[使用者] --> B{需要核准嗎}\n  B -->|是| C[等待確認]:::gate\n  B -->|否| D[(資料庫)]:::store'

test('prepare：拿掉跨行的 init 指令與 front matter', () => {
  const init = '%%{init: {"theme": "base", "themeVariables": {\n  "background": "#123456"\n}}}%%\n'
  assert.equal(prepare(`${init}sequenceDiagram\n  A->>B: hi`), 'sequenceDiagram\n  A->>B: hi')
  assert.equal(prepare('---\ntitle: 測試\n---\nstateDiagram-v2\n  [*] --> A'), 'stateDiagram-v2\n  [*] --> A')
})

test('prepare：只有 flowchart／graph 補上主題的語意類別', () => {
  for (const header of ['flowchart TD', 'graph LR']) {
    const prepared = prepare(`${header}\n  A --> B`)
    for (const name of Object.keys(CLASSDEFS.light)) assert.match(prepared, new RegExp(`\\nclassDef ${name} `))
  }
  assert.doesNotMatch(prepare('sequenceDiagram\n  A->>B: hi'), /classDef/)
})

test('render：輸出是套好主題、不連網、不超過 Svg 上限的 SVG', () => {
  const svg = render(FLOW)
  assert.ok(svg.startsWith('<svg'))
  assert.ok(svg.length <= 131072)
  assert.doesNotMatch(svg, /@import|https?:\/\/(?!www\.w3\.org)/)
  assert.match(svg, /class="dl-canvas"/)
  // 深淺兩組色值都在，由 prefers-color-scheme 切換。
  assert.ok(svg.includes(`--dl-bg:${TOKENS.light.bg}`))
  assert.ok(svg.includes(`@media (prefers-color-scheme: dark){svg{--dl-bg:${TOKENS.dark.bg}`))
  // 函式庫預設的行內底色已拿掉，否則會蓋過主題。
  assert.doesNotMatch(svg.match(/^<svg[^>]*>/)[0], /style=/)
  // 語意類別走 CSS 變數，gate 的虛線由樣式補上。
  assert.match(svg, /stroke="var\(--dl-class-gate-stroke\)"/)
  assert.match(svg, /\[stroke="var\(--dl-class-gate-stroke\)"\]\{stroke-dasharray:6 4\}/)
  // 中文標籤原樣在圖裡。
  assert.match(svg, />需要核准嗎</)
})

test('render：來源自己貼的同名 classDef 會被主題版本蓋過', () => {
  const svg = render(`${FLOW}\nclassDef gate stroke:#ff0000,stroke-dasharray:6 4,color:#ff0000`)
  assert.doesNotMatch(svg, /stroke="#ff0000"/)
  assert.match(svg, /stroke="var\(--dl-class-gate-stroke\)"/)
})

test('render：sequence 與 state 也畫得出來', () => {
  assert.match(render('sequenceDiagram\n  participant U as 使用者\n  U->>U: 自己'), /class="actor"/)
  assert.match(render('stateDiagram-v2\n  [*] --> 等待\n  等待 --> [*]'), /data-shape="state-start"/)
})

test('命令列：成功與失敗都以 JSON 回報，exit code 為 0', () => {
  const ok = run(FLOW)
  assert.equal(ok.ok, true)
  assert.ok(ok.svg.startsWith('<svg'))
  const failed = run('pie title 不支援\n  "A" : 1')
  assert.equal(failed.ok, false)
  assert.match(failed.reason, /Invalid mermaid header/)
})

test('MERMAID_DIANLIU_THEME=default：不論有沒有本機覆蓋檔，都用預設主題', () => {
  const { ok, svg } = run(FLOW, { MERMAID_DIANLIU_THEME: 'default' })
  assert.equal(ok, true)
  assert.ok(svg.includes(`--dl-bg:${defaults.TOKENS.light.bg}`))
  assert.ok(svg.includes(`--dl-class-gate-stroke:${defaults.CLASSDEFS.dark.gate.stroke}`))
})

test('預設主題：深淺兩組的 token 與語意類別齊全且一致', () => {
  assert.deepEqual(Object.keys(defaults.TOKENS.dark), Object.keys(defaults.TOKENS.light))
  for (const scheme of ['light', 'dark']) {
    for (const value of Object.values(defaults.TOKENS[scheme])) assert.match(value, /^#[0-9a-f]{6}$/)
  }
  const shape = defs => Object.entries(defs).map(([name, props]) => [name, Object.keys(props)])
  assert.deepEqual(shape(defaults.CLASSDEFS.dark), shape(defaults.CLASSDEFS.light))
})
