# Facebook Ads Dashboard — 專案筆記

> 這份筆記給**新對話的 Claude** 讀的。用戶透過 vibe coding 方式跟 Claude 一起打造這個 dashboard，開新對話時請先讀這份文件來快速進入狀況。

---

## 📍 專案基本資訊

- **位置**：`~/Claudeforyoung/fb-ads-dashboard/`（= `/Users/bmpsst510/Claudeforyoung/fb-ads-dashboard/`）
- **用戶作業系統**：macOS（Apple Silicon）
- **Node 版本**：v25.9.0（透過 Homebrew 安裝）
- **Dev server**：`npm run dev` → http://localhost:3000
- **語言**：回應請用**繁體中文**

## 🛠 技術棧

- **Next.js 16.2.3**（App Router, Turbopack, TypeScript, `src/` dir）
  - ⚠️ 這是 Next.js 16，不是訓練資料中常見的 13/14。有疑慮請看 `node_modules/next/dist/docs/` 的最新文件（專案根目錄的 `AGENTS.md` 也有提醒）
- **Tailwind CSS v4**
- **Recharts**（AreaChart 為主，不要用 LineChart，我們用漸層面積風格）
- **date-fns, clsx** 已安裝但用得不多

## 🔑 環境變數（`.env.local`，已 gitignore）

```
FB_AD_ACCOUNT_ID=act_9177740032347247
FB_ACCESS_TOKEN=<用戶自己的 token, 短期 token 會過期>
FB_API_VERSION=v21.0
```

⚠️ **Token 可能隨時過期**。如果用戶回報 API 400/401/190，通常是 token 過期 → 請他到 [Graph API Explorer](https://developers.facebook.com/tools/explorer/) 換新的再改 `.env.local`。

## 📁 重要檔案

| 檔案 | 作用 |
|---|---|
| `src/app/page.tsx` | **主 dashboard UI**（所有 client-side 邏輯） |
| `src/app/api/insights/route.ts` | Next.js API route，代理 FB API（避免 token 外流） |
| `src/lib/fb.ts` | FB Marketing API 封裝：**自動分段 (chunking)、重試、合併、normalize** |
| `src/lib/format.ts` | 金額、百分比、日期範圍 preset helpers |
| `src/app/layout.tsx` | 深色主題 root |
| `.env.local` | FB 憑證（勿 commit, 勿 zip） |

## ⚙️ 架構特色

### 1. FB API chunking（重要！）
FB Marketing API 對資料量有保護機制（error code 1 / "reduce the amount of data"）。`src/lib/fb.ts` 會依照 level + breakdowns + timeIncrement 自動把長日期切塊並行請求，非 time_increment 的結果還會合併去重並重算衍生指標（CTR/CPC/CPM/ROAS/CPA）。修改這邊要小心別破壞合併邏輯。

### 2. 維度系統（DIMENSIONS）
`src/app/page.tsx` 裡有 `DIMENSIONS` 陣列，目前支援：
campaign / adset / ad / placement / publisher_platform / device / age / gender / country / region

每個維度定義 `level`、`breakdowns`、`getKey`、`getName`。要加新維度（例如 hourly_stats、dma）只要加一項並在 `fb.ts` 的 `normalize()` 加對應欄位即可。

### 3. 雙重日期範圍
- **全站日期**（header）：影響 KPI + 總趨勢圖
- **維度日期**（dimension 區塊內）：獨立可覆寫，用琥珀色邊框表示已覆寫

### 4. 控制項清單（vibe coding 過程累積的）
- 日期 preset 按鈕 + 全站自訂日期 + 維度自訂日期
- KPI 卡片 10 張，每張有 vs 上期的 %（依指標方向判定紅綠）
- 主趨勢圖：多選指標（MultiPicker）
- 維度 chip 切換（10 個），有發光效果
- 維度 Top N 趨勢圖：指標下拉 + Top N 下拉 + **自選項目 MultiPicker（可搜尋）** + 重置
- 表格：可排序、**熱度顏色**（依指標方向 up/down 綠紅配色）、欄位 MultiPicker

## 🏷 Git 版本

```bash
git log --oneline
# 1b3435b Build FB Ads dashboard with filters, dimensions and trends  ← tag: v1.0-stable
# 410d026 Initial commit from Create Next App
```

**Tags**
- `v1.0-stable` — 第一個功能完整版（深色主題、維度系統、自選項目、維度日期、dot nodes）
- `v1.1-stable` — 修復購買數/購買值/ATC 被重複計算 3 倍的 bug（`pickAction` 改為取優先順序第一個，而非加總）

### 還原到穩定版的指令
```bash
cd ~/Claudeforyoung/fb-ads-dashboard
git reset --hard v1.0-stable          # 完全回到穩定版（丟掉之後的所有 commit）
# 或
git checkout .                         # 只丟掉未 commit 的修改
# 或
git checkout v1.0-stable -- .         # 從穩定版取回檔案但保留 commit history
```

### 要 commit 新版並打新 tag
```bash
cd ~/Claudeforyoung/fb-ads-dashboard
git add -A
git -c commit.gpgsign=false commit -m "描述"
git tag v1.X-stable
```
⚠️ 用戶尚未設定 git user.name / user.email，commit 會顯示系統預設。不影響本機使用。

## 📦 Zip 備份

- `~/Claudeforyoung/fb-ads-dashboard-20260415.zip`（84KB）
- 已排除：`node_modules/`, `.next/`, `.env.local`, `.git/`

## 🎯 用戶的使用情境

- **給自己看用**（不是給客戶 / 團隊）
- 主要在本機跑 dev server
- 幣別：**TWD**（`format.ts` 內 hard-code 了，要改別的幣別要調整）
- 不需要「互動/未互動受眾」功能（明確表示過先不做）

## 💬 跟用戶溝通的風格

- 用戶喜歡「先討論方向、再動手」的節奏。動手前會列出計畫選項讓他挑（A/B/C），他挑完才實作
- 喜歡看到**為什麼這樣做**的解釋，不只是「做完了」
- 不是工程師背景，避免過度技術術語，但他願意學
- 動手修改完後會附上「這次做了什麼 + 怎麼使用 + 下一步建議」
- 遇到選擇（例如幣別、技術棧）會明確提出讓他決定

## 🚀 常用指令速查

```bash
# 啟動開發（用戶平常這樣用）
cd ~/Claudeforyoung/fb-ads-dashboard && npm run dev

# 看 dev log（若背景跑）
tail -30 /tmp/fbads-dev.log

# 測 FB API 通不通
curl -s "http://localhost:3000/api/insights?since=2026-04-08&until=2026-04-14&level=account&time_increment=1" | head -c 500

# Production build（尚未用過）
npm run build && npm start
```

## 📝 未來可能的新功能（用戶未要求但提過）

- 表格每列的 sparkline（mini 迷你趨勢）
- 匯出 CSV
- 多 Ad Account 切換
- 自訂受眾 / 互動受眾分類（目前用戶表示不需要）
- 部署到 Vercel（需處理 token 環境變數）
