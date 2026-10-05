// 預設主題：中性灰階。沒有本機覆蓋檔（renderer/local.tokens.mjs）時用這一份。
// 要套自己的配色，不要改這裡：用 tools/sync-tokens.mjs 產生本機覆蓋檔，或照同樣的形狀手寫一份。
//
// TOKENS：圖面用到的十個 UI token，深淺各一組。
// CLASSDEFS：flowchart 內建的四個語意類別（:::gate 等），深淺兩組的類別與屬性必須相同，只有色值不同。

export const FONT = 'system-ui, sans-serif'

export const TOKENS = {
  light: {
    bg: '#fafafa',
    surface: '#ffffff',
    'surface-dim': '#f4f4f5',
    border: '#e4e4e7',
    text: '#18181b',
    'text-body': '#3f3f46',
    'text-muted': '#52525b',
    'text-faint': '#71717a',
    accent: '#71717a',
    warn: '#b45309',
  },
  dark: {
    bg: '#18181b',
    surface: '#27272a',
    'surface-dim': '#1f1f23',
    border: '#3f3f46',
    text: '#fafafa',
    'text-body': '#e4e4e7',
    'text-muted': '#a1a1aa',
    'text-faint': '#8e8e99',
    accent: '#a1a1aa',
    warn: '#fbbf24',
  },
}

export const CLASSDEFS = {
  light: {
    gate: { stroke: '#b45309', 'stroke-dasharray': '6 4', color: '#b45309' },
    port: { stroke: '#2563eb', color: '#2563eb', fill: 'none' },
    boundary: { stroke: '#71717a', 'stroke-dasharray': '4 4', fill: 'none', color: '#52525b' },
    store: { stroke: '#0f766e', color: '#0f766e', fill: 'none' },
  },
  dark: {
    gate: { stroke: '#fbbf24', 'stroke-dasharray': '6 4', color: '#fbbf24' },
    port: { stroke: '#60a5fa', color: '#60a5fa', fill: 'none' },
    boundary: { stroke: '#8e8e99', 'stroke-dasharray': '4 4', fill: 'none', color: '#a1a1aa' },
    store: { stroke: '#2dd4bf', color: '#2dd4bf', fill: 'none' },
  },
}
