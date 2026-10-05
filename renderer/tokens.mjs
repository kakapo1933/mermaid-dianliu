// 決定用哪一份主題：本機覆蓋檔 local.tokens.mjs 存在就用它，否則用 default.tokens.mjs。
// local.tokens.mjs 不進版控，個人的配色只留在自己的機器上。
// 環境變數 MERMAID_DIANLIU_THEME=default 可強制用預設（看公開版的樣子、跑測試時用）。

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as defaults from './default.tokens.mjs'

// 預設主題就是形狀的基準：它有的 UI token，覆蓋檔也必須齊全。
const REQUIRED_TOKENS = Object.keys(defaults.TOKENS.light)

const local = new URL('./local.tokens.mjs', import.meta.url)
const isLocal = process.env.MERMAID_DIANLIU_THEME !== 'default' && existsSync(fileURLToPath(local))
const active = isLocal ? await import(local.href) : defaults

export const THEME_SOURCE = isLocal ? 'local' : 'default'
export const { FONT, TOKENS, CLASSDEFS } = active

// 形狀不對就在這裡講清楚，免得畫出缺色的圖。
const file = `${THEME_SOURCE}.tokens.mjs`
if (typeof FONT !== 'string' || !TOKENS || !CLASSDEFS) throw new Error(`${file} 必須匯出 FONT、TOKENS、CLASSDEFS`)
for (const scheme of ['light', 'dark']) {
  const missing = REQUIRED_TOKENS.filter(name => typeof TOKENS[scheme]?.[name] !== 'string')
  if (missing.length > 0) throw new Error(`${file} 的 TOKENS.${scheme} 缺少：${missing.join(', ')}`)
  if (!CLASSDEFS[scheme]) throw new Error(`${file} 的 CLASSDEFS 缺少 ${scheme}`)
}
const shape = defs => JSON.stringify(Object.entries(defs).map(([name, props]) => [name, Object.keys(props)]))
if (shape(CLASSDEFS.light) !== shape(CLASSDEFS.dark)) throw new Error(`${file} 的 CLASSDEFS 深淺兩組的類別或屬性不一致`)
