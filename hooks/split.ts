// 把一段回覆文字切成「一般 markdown」與「mermaid 區塊」。純函式，不碰引擎。

export type Segment = { kind: 'markdown'; text: string } | { kind: 'mermaid'; source: string; raw: string }

// Markdown 元件單段文字的上限。
export const MAX_MARKDOWN = 10000

// 開頭的 fence：縮排、fence 本身、語言名。
const OPEN = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/

function isClose(line: string, fence: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < fence.length) return false
  // 收尾的 fence：同一種字元、長度不短於開頭、後面沒有別的字。
  return trimmed.split('').every(c => c === fence[0])
}

/**
 * 逐行掃，只認「已閉合」的 mermaid fence：還在串流中的區塊維持原樣，
 * 包在其他 fence 裡（例如示範用的 ````markdown）的 mermaid 也不動。
 */
export function splitMermaid(text: string): Segment[] {
  const lines = text.split('\n')
  const segments: Segment[] = []
  let plain: string[] = []
  const flush = () => {
    if (plain.length > 0) segments.push({ kind: 'markdown', text: plain.join('\n') })
    plain = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const open = line.match(OPEN)
    if (!open) {
      plain.push(line)
      i += 1
      continue
    }
    const indent = open[1] ?? ''
    const fence = open[2] ?? ''
    let end = i + 1
    while (end < lines.length && !isClose(lines[end] ?? '', fence)) end += 1
    const closed = end < lines.length
    const block = lines.slice(i, closed ? end + 1 : lines.length)
    const body = lines
      .slice(i + 1, end)
      .map(l => (l.startsWith(indent) ? l.slice(indent.length) : l))
      .join('\n')
    if (closed && (open[3] ?? '').toLowerCase() === 'mermaid' && body.trim() !== '') {
      flush()
      segments.push({ kind: 'mermaid', source: body, raw: block.join('\n') })
    } else {
      plain.push(...block)
    }
    i += block.length
  }
  flush()
  return segments
}

/**
 * 把過長的 markdown 在段落空行處切開，每段不超過 max；
 * 空行在 fence 裡不算段落邊界。單一段落就超過上限時回傳 undefined。
 */
export function chunkMarkdown(text: string, max: number = MAX_MARKDOWN): string[] | undefined {
  if (text.length <= max) return [text]
  const blocks: string[] = []
  let current: string[] = []
  let fence: string | undefined
  for (const line of text.split('\n')) {
    if (fence === undefined) {
      fence = line.match(OPEN)?.[2]
    } else if (isClose(line, fence)) {
      fence = undefined
    }
    if (fence === undefined && line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'))

  const chunks: string[] = []
  let chunk = ''
  for (const block of blocks) {
    if (block.length > max) return undefined
    if (chunk !== '' && chunk.length + 2 + block.length > max) {
      chunks.push(chunk)
      chunk = ''
    }
    chunk = chunk === '' ? block : `${chunk}\n\n${block}`
  }
  if (chunk !== '') chunks.push(chunk)
  return chunks
}
