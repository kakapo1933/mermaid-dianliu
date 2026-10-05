// 從 stdin 讀 Mermaid 原始碼，把套好主題的 SVG 以 JSON 寫到 stdout：
//   {"ok": true, "svg": "<svg ...>"}  或  {"ok": false, "reason": "..."}
// 由 hooks/register.tsx 用 node（或 bun）執行。全程在本機，不連網。

import { CLASS_LINES, STYLE } from './theme.mjs'
import { renderMermaidSVG } from './vendor/beautiful-mermaid.mjs'

/** 轉圖前整理原始碼：拿掉 beautiful-mermaid 不認得的前置內容，補上主題的語意類別。 */
export function prepare(source) {
  const cleaned = source
    .replace(/^\s*---\n[\s\S]*?\n---[ \t]*\n/, '') // YAML front matter
    .replace(/%%\{[\s\S]*?\}%%/g, '') // %%{init: ...}%% 指令（可能跨行）：主題由本 mod 統一套
    .trim()
  const header = cleaned.split('\n').find(line => line.trim() !== '' && !line.trim().startsWith('%%')) ?? ''
  // classDef 只有 flowchart 的解析器認得。
  return /^\s*(flowchart|graph)\b/.test(header) ? `${cleaned}\n${CLASS_LINES}` : cleaned
}

/** 把 beautiful-mermaid 的 SVG 換上主題：去掉網路字型與預設色，加上底板與主題樣式。 */
export function applyTheme(svg) {
  const root = svg.match(/^<svg[^>]*>/)?.[0]
  const width = Number(root?.match(/ width="([\d.]+)"/)?.[1])
  const height = Number(root?.match(/ height="([\d.]+)"/)?.[1])
  if (!root || !(width > 0) || !(height > 0)) throw new Error('看不懂轉圖函式庫輸出的 SVG')
  // 底板：主題的頁面底色加 1px 邊框、8px 圓角，圖在任何 App 背景上都是一張完整的卡。
  const canvas = `<rect class="dl-canvas" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />`
  return svg
    .replace(root, root.replace(/ style="[^"]*"/, ''))
    .replace(/^\s*@import url\([^)]*\);?\s*$/gm, '')
    .replace('</style>', `</style>\n<style>${STYLE}</style>\n${canvas}`)
}

export function render(source) {
  return applyTheme(renderMermaidSVG(prepare(source), { transparent: true }))
}

// 被直接執行時才讀 stdin；被 import（測試）時只提供上面的函式。
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  let source = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) source += chunk
  let result
  try {
    result = { ok: true, svg: render(source) }
  } catch (error) {
    result = { ok: false, reason: String(error?.message ?? error).split('\n')[0].slice(0, 300) }
  }
  process.stdout.write(JSON.stringify(result))
}
