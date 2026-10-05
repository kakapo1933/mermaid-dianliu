// 主題：把 tokens.mjs 選出的色值接到 beautiful-mermaid 產出的 SVG 上。
// 這裡不寫任何色值，只決定「哪個 token 用在圖的哪個部位」。

import { CLASSDEFS, FONT, TOKENS } from './tokens.mjs'

const isColor = value => value.startsWith('#')
const classVar = (name, prop) => `--dl-class-${name}-${prop}`

/** 某個深淺模式下的全部 CSS 變數：UI token 加上各語意類別的色值。 */
function variables(scheme) {
  const pairs = Object.entries(TOKENS[scheme]).map(([name, value]) => [`--dl-${name}`, value])
  for (const [name, props] of Object.entries(CLASSDEFS[scheme])) {
    for (const [prop, value] of Object.entries(props)) {
      if (isColor(value)) pairs.push([classVar(name, prop), value])
    }
  }
  return pairs.map(([name, value]) => `${name}:${value}`).join(';')
}

// beautiful-mermaid 的 classDef 只認 fill／stroke／stroke-width／color，
// 所以虛線改用 CSS 補：選中「邊框是該類別變數」的圖形。
const dashRules = Object.entries(CLASSDEFS.light)
  .filter(([, props]) => props['stroke-dasharray'] && props.stroke)
  .map(([name, props]) => `[stroke="var(${classVar(name, 'stroke')})"]{stroke-dasharray:${props['stroke-dasharray']}}`)
  .join('\n')

export const STYLE = `
svg{${variables('light')}}
@media (prefers-color-scheme: dark){svg{${variables('dark')}}}
svg{
  --bg:var(--dl-bg);--fg:var(--dl-text);
  --_text:var(--dl-text);--_text-sec:var(--dl-text-body);
  --_text-muted:var(--dl-text-muted);--_text-faint:var(--dl-text-faint);
  --_line:var(--dl-text-muted);--_arrow:var(--dl-text-muted);
  --_node-fill:var(--dl-surface);--_node-stroke:var(--dl-accent);
  --_group-fill:var(--dl-surface-dim);--_group-hdr:var(--dl-surface-dim);
  --_inner-stroke:var(--dl-border);--_key-badge:var(--dl-surface-dim);
}
text{font-family:${FONT}}
.dl-canvas{fill:var(--dl-bg);stroke:var(--dl-border)}
.subgraph rect{stroke:var(--dl-text-faint)}
.subgraph text{fill:var(--dl-text-muted)}
.edge-label text{fill:var(--dl-text-faint)}
.actor rect{stroke:var(--dl-border)}
.lifeline{stroke:var(--dl-border);stroke-dasharray:4 4}
.message text{fill:var(--dl-text-body)}
.note polygon{fill:var(--dl-surface);stroke:var(--dl-warn)}
.note text{fill:var(--dl-warn)}
[data-shape="state-start"] circle{fill:var(--dl-accent)}
${dashRules}
`

/**
 * 主題的語意類別（預設是 gate、port、boundary、store），寫成 classDef 接在 flowchart 後面：
 * 色值換成 CSS 變數，圖就能跟著深淺模式切換；來源自己貼的同名 classDef 會被這份蓋過。
 */
export const CLASS_LINES = Object.entries(CLASSDEFS.light)
  .map(([name, props]) => {
    const parts = Object.entries(props)
      .filter(([prop]) => prop !== 'stroke-dasharray')
      .map(([prop, value]) => `${prop}:${isColor(value) ? `var(${classVar(name, prop)})` : value}`)
    return `classDef ${name} ${parts.join(',')}`
  })
  .join('\n')
