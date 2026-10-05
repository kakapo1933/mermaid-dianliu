#!/usr/bin/env node
// 從一個設計 token 的 dist 目錄讀出色值，產生本機覆蓋檔 renderer/local.tokens.mjs。
// 覆蓋檔不進版控（見 .gitignore）：個人的配色只留在自己的機器上。
//
// 用法：node tools/sync-tokens.mjs <dist 目錄>   第一次要給路徑
//       node tools/sync-tokens.mjs               之後沿用覆蓋檔裡記下的路徑
//       node tools/sync-tokens.mjs --check       只比對，覆蓋檔過期時 exit 1
//
// dist 目錄要有：
//   tokens.css            `:root { ... }` 是淺色、`:root[data-theme="dark"] { ... }` 是深色，
//                         各自定義 renderer/default.tokens.mjs 那十個 token 的 `--名稱: #hex`
//   classdefs-light.mmd   每行 `classDef 名稱 屬性:值,屬性:值`
//   classdefs-dark.mmd    同上，類別與屬性要和淺色一致
//   mermaid-light.mmd     Mermaid 的 init 指令，取裡面的 "fontFamily"

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { TOKENS as DEFAULT_TOKENS } from '../renderer/default.tokens.mjs'

// 預設主題有哪些 UI token，覆蓋檔就要有哪些。
const REQUIRED_TOKENS = Object.keys(DEFAULT_TOKENS.light)

const args = process.argv.slice(2)
const isCheck = args.includes('--check')
const out = join(dirname(fileURLToPath(import.meta.url)), '../renderer/local.tokens.mjs')

// 上一次同步用的路徑記在覆蓋檔裡，所以它和色值一樣不進版控。
const remembered = existsSync(out) ? await import(pathToFileURL(out).href).then(m => m.SOURCE_DIST, () => undefined) : undefined
const given = args.find(a => !a.startsWith('--'))
const dist = given ? resolve(given) : remembered
if (!dist) {
  console.error('請給 dist 目錄：node tools/sync-tokens.mjs <dist 目錄>')
  process.exit(2)
}

const read = name => readFileSync(join(dist, name), 'utf8')

/** 取出某個選擇器後第一個 { ... } 區塊裡的 --name: #hex。 */
function tokensOf(css, selector) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`tokens.css 找不到 ${selector} 區塊`)
  const block = css.slice(start, css.indexOf('}', start))
  const found = Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)].map(m => [m[1], m[2].toLowerCase()]))
  const missing = REQUIRED_TOKENS.filter(name => !(name in found))
  if (missing.length > 0) throw new Error(`tokens.css 的 ${selector} 缺少：${missing.join(', ')}`)
  return Object.fromEntries(REQUIRED_TOKENS.map(name => [name, found[name]]))
}

/** classdefs-*.mmd：每行 `classDef 名稱 屬性:值,屬性:值`。 */
function classDefsOf(text) {
  const defs = {}
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^classDef\s+(\w+)\s+(.+)$/)
    if (!m) continue
    defs[m[1]] = Object.fromEntries(
      m[2].split(',').map(pair => {
        const at = pair.indexOf(':')
        return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()]
      }),
    )
  }
  return defs
}

const css = read('tokens.css')
const tokens = { light: tokensOf(css, ':root'), dark: tokensOf(css, ':root[data-theme="dark"]') }
const classDefs = { light: classDefsOf(read('classdefs-light.mmd')), dark: classDefsOf(read('classdefs-dark.mmd')) }

const font = read('mermaid-light.mmd').match(/"fontFamily":\s*"([^"]+)"/)?.[1]
if (!font) throw new Error('mermaid-light.mmd 找不到 fontFamily')

const body = `// 本機覆蓋檔，由 tools/sync-tokens.mjs 產生。不進版控，也不要手改：
// 改色請改來源的設計 token，再重跑 node tools/sync-tokens.mjs。

export const SOURCE_DIST = ${JSON.stringify(dist)}

export const FONT = ${JSON.stringify(font)}

export const TOKENS = ${JSON.stringify(tokens, null, 2)}

export const CLASSDEFS = ${JSON.stringify(classDefs, null, 2)}
`

if (isCheck) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : ''
  if (current !== body) {
    console.error('renderer/local.tokens.mjs 與來源不同步，請重跑 node tools/sync-tokens.mjs')
    process.exit(1)
  }
  console.log('renderer/local.tokens.mjs 與來源同步')
} else {
  writeFileSync(out, body)
  console.log(`已寫入 ${out}`)
}
