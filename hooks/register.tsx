import type { EngineInterface, Register, RenderElement } from 'claude-code'

import { chunkMarkdown, splitMermaid } from './split'

// 把助理回覆裡已閉合的 ```mermaid 區塊畫成套好主題的 SVG。只改畫面，
// 對話紀錄不動。轉圖由 node（找不到就 bun）執行 renderer/render.mjs：
// 排版引擎 ELK 超過 hook 模組可載入的大小，所以不能直接 import。
// 畫不出來的圖（不支援的圖種、語法錯誤、SVG 過大）維持原本的程式碼區塊。

type Entry =
  | { status: 'pending' }
  | { status: 'done'; svg: string }
  // isFinal：腳本明確回報畫不出來，不必再試；否則是執行環境的問題，之後重試。
  | { status: 'failed'; isFinal: boolean; attempts: number }

// Svg 元件的原始碼上限。
const MAX_SVG = 131072
const MAX_ATTEMPTS = 3
const RUNTIMES = ['node', 'bun']

// 以 mermaid 原始碼為 key：重畫（捲動、縮放視窗、串流中的每次更新）不會重轉。
const cache = new Map<string, Entry>()

type Outcome = { svg: string } | { reason: string; isFinal: boolean }

async function render($: EngineInterface, source: string): Promise<Outcome> {
  const script = `${$.plugin.root}/renderer/render.mjs`
  let reason = '找不到 node 或 bun'
  for (const bin of RUNTIMES) {
    try {
      const ran = await $.process.run([bin, script], { stdin: source, timeoutMs: 20000 })
      // 腳本一律以 JSON 回報；啟動不了或讀不到 JSON 就換下一個執行環境。
      const result = JSON.parse(ran.stdout) as { ok: boolean; svg?: string; reason?: string }
      if (result.ok && typeof result.svg === 'string') {
        if (result.svg.length > MAX_SVG) return { reason: 'SVG 超過 Svg 元件上限', isFinal: true }
        return { svg: result.svg }
      }
      return { reason: result.reason ?? '轉圖失敗', isFinal: true }
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
    }
  }
  return { reason, isFinal: false }
}

/** 查快取；沒有就在背景開始轉圖，轉完要求重畫。 */
function lookup($: EngineInterface, source: string): Entry {
  const known = cache.get(source)
  if (known && !(known.status === 'failed' && !known.isFinal && known.attempts < MAX_ATTEMPTS)) return known
  const attempts = known?.status === 'failed' ? known.attempts + 1 : 1
  if (cache.size > 200) cache.clear()
  cache.set(source, { status: 'pending' })
  void render($, source).then(outcome => {
    if ('svg' in outcome) {
      cache.set(source, { status: 'done', svg: outcome.svg })
    } else {
      cache.set(source, { status: 'failed', isFinal: outcome.isFinal, attempts })
      $.ui.log(`mermaid-dianliu：這張圖維持程式碼區塊（${outcome.reason}）`, { to: 'debug' })
    }
    // 轉圖失敗又還能重試時不主動重畫，等下一次自然重畫再試，避免空轉。
    if ('svg' in outcome || outcome.isFinal) $.ui.invalidate('ui.render')
  })
  return { status: 'pending' }
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // 這個 mod 只處理桌面版；其他介面照引擎原樣畫。
    if (e.surface !== 'desktop') return next(e)

    const segments = splitMermaid(e.props.text)
    if (!segments.some(s => s.kind === 'mermaid')) return next(e)

    const entries = segments.map(s => (s.kind === 'mermaid' ? lookup($, s.source) : undefined))
    // 全部轉完才一起換上，避免同一則回覆一張一張跳動。
    if (entries.some(entry => entry?.status === 'pending')) return next(e)
    if (!entries.some(entry => entry?.status === 'done')) return next(e)

    const { Box, Markdown, Svg } = $.ui.resolve(e)
    const children: RenderElement[] = []
    for (const [i, segment] of segments.entries()) {
      const entry = entries[i]
      if (segment.kind === 'mermaid' && entry?.status === 'done') {
        const firstLine = segment.source.trim().split('\n')[0] ?? ''
        children.push(
          <Box key={`diagram-${i}`} marginY={1}>
            <Svg source={entry.svg} alt={`Mermaid 圖：${firstLine.trim()}`} />
          </Box>,
        )
        continue
      }
      // 一般文字，或畫不出來而保留程式碼區塊的圖。
      const text = segment.kind === 'mermaid' ? segment.raw : segment.text
      if (text.trim() === '') continue
      if (children.length === 0) {
        // 開頭的文字交回引擎自己畫，保留它原本的樣子。
        children.push(await next({ ...e, props: { ...e.props, text } }))
        continue
      }
      const chunks = chunkMarkdown(text)
      // 有一段長到 Markdown 元件放不下：整則回覆退回引擎原樣。
      if (chunks === undefined) return next(e)
      chunks.forEach((chunk, j) => children.push(<Markdown key={`md-${i}-${j}`} text={chunk} />))
    }

    return <Box flexDirection="column">{children}</Box>
  })
}
