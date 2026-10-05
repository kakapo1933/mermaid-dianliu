# mermaid-dianliu

Claude Code 的 mod：在 Claude 桌面版的 Code 分頁，把助理回覆裡的 ` ```mermaid ` 區塊畫成 SVG，主題可以換成自己的配色。只改畫面，對話紀錄與 Claude 讀到的內容都不變。

## 它做什麼

1. `hooks/register.tsx` 掛在 `AssistantMessage` 的 `ui.render`，只處理桌面版（`e.surface === 'desktop'`），其他介面原樣交回引擎。
2. `hooks/split.ts` 找出已閉合的 mermaid 區塊。還在串流的、或包在其他 fence 裡的不動。
3. 每張圖用 `node`（找不到就 `bun`）執行 `renderer/render.mjs` 轉成 SVG，以原始碼為 key 快取。
4. 轉完後用 `Svg` 元件畫在原位；前後文字照舊。

畫不出來時（不支援的圖種、語法錯誤、SVG 超過元件上限、找不到 node 與 bun）維持原本的程式碼區塊，原因寫進 debug log。

## 主題

主題分兩層，`renderer/tokens.mjs` 決定用哪一層：

| 檔案 | 進版控 | 用途 |
|---|---|---|
| `renderer/default.tokens.mjs` | 是 | 預設主題，中性灰階。clone 下來就是這個樣子 |
| `renderer/local.tokens.mjs` | 否（在 `.gitignore`） | 本機覆蓋。檔案存在就整份取代預設 |

`renderer/theme.mjs` 不含任何色值，只決定哪個 token 用在圖的哪個部位，所以換主題不必動轉圖邏輯。

- 深淺兩組色值都放進 SVG，由 `prefers-color-scheme` 切換。
- 每張圖有自己的底板（頁面底色、1px 邊框、8px 圓角）。
- flowchart 內建 `gate`、`port`、`boundary`、`store` 四個語意類別，直接寫 `:::gate` 即可；來源自己貼的同名 `classDef` 會被主題版本蓋過。
- 來源裡的 `%%{init: ...}%%` 與 YAML front matter 會被拿掉，主題一律由本 mod 套。

### 套自己的配色

兩種做法擇一：

1. 照 `default.tokens.mjs` 的形狀手寫一份 `renderer/local.tokens.mjs`（匯出 `FONT`、`TOKENS`、`CLASSDEFS`）。
2. 如果你的設計 token 已經有一個 `dist/` 目錄，用同步腳本產生：

   ```bash
   node tools/sync-tokens.mjs /路徑/到/dist
   ```

   目錄裡要有 `tokens.css`（`:root` 是淺色、`:root[data-theme="dark"]` 是深色，定義預設主題那十個 token）、`classdefs-light.mmd`、`classdefs-dark.mmd`、`mermaid-light.mmd`（取 `fontFamily`）。路徑會記在覆蓋檔裡，之後不帶參數重跑即可。

想看預設主題的樣子而不刪覆蓋檔，設環境變數 `MERMAID_DIANLIU_THEME=default`。

## 需求

- Claude 桌面版的 Code 分頁（mod 只在 `desktop` 介面作用）。官方文件寫 mod 需要 Claude Code 2.1.287 以上；實測桌面版自帶的 2.1.286 引擎也會載入。
- `PATH` 上有 `node` 或 `bun`。

## 安裝與維護

這個 repo 本身就是一個 marketplace（`.claude-plugin/marketplace.json`，名稱 `mermaid-dianliu-local`）。clone 到一個固定位置後，以 user scope 安裝：

```bash
claude plugin marketplace add /絕對路徑/mermaid-dianliu
claude plugin install mermaid-dianliu@mermaid-dianliu-local
```

用本機資料夾登記時，引擎直接執行這個資料夾裡的檔案（2.1.286 實測），所以資料夾不能搬動或刪除；改檔後新開的 session 就會用新內容，checkout 到別的 commit 也一樣。

停用、啟用、移除：

```bash
claude plugin disable mermaid-dianliu@mermaid-dianliu-local
claude plugin enable mermaid-dianliu@mermaid-dianliu-local
claude plugin uninstall mermaid-dianliu@mermaid-dianliu-local
```

桌面版也可以從「+ > Plugins > Manage plugins」操作。型別檔不放在這裡；要在編輯器裡有型別提示，在 Claude Code 終端機 session 執行 `/plugin-types`。

## 指令

```bash
node tools/sync-tokens.mjs [dist 目錄]  # 產生或更新本機覆蓋的主題
node tools/sync-tokens.mjs --check    # 檢查覆蓋檔是否與來源同步
bash tools/build-vendor.sh            # 重建 renderer/vendor/beautiful-mermaid.mjs
node --test renderer/render.test.mjs  # 轉圖腳本的測試
claude plugin validate . --strict     # 引擎讀到的 hook 與呼叫
claude plugin test .                  # hook 的測試（桌面版與終端機兩種介面）
```

## 已知限制

- 支援的圖種取決於 beautiful-mermaid：flowchart、sequence、state、class、ER、xychart。pie、gantt、mindmap 等會維持程式碼區塊。
- `classDef` 只在 flowchart 有效；虛線邊框由主題樣式補上。
- 節點寬度是函式庫估算的，不是實際量字，極端長的標籤可能略有出入。
- 圖畫出來後看不到原始碼；要複製原始碼請看對話紀錄或暫時停用本 mod。
- 區塊前後的文字改由 `Markdown` 元件畫；單一段落超過 10,000 字元時，整則回覆退回引擎原樣顯示。

## 第三方元件

`renderer/vendor/beautiful-mermaid.mjs` 打包自 npm 的 beautiful-mermaid（MIT）、elkjs（EPL-2.0）、entities（BSD-2-Clause），授權全文在同一個資料夾。
