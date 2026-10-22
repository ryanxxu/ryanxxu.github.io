# Ryan's Space — 旅遊手冊

三層結構（都是純靜態檔案，直接放 GitHub Pages）：

```
index.html                       第 1 層：入口頁（卡片）
travel/index.html + trips.js     第 2 層：旅遊列表（新增旅程在 trips.js 加一筆）
travel/hokkaido-2026/            第 3 層：單趟行程手冊
  index.html  css/style.css  js/app.js（程式，不用改）
  js/data.js                     ← 行程資料，唯一需要維護的檔案
tools/encrypt.mjs                資料加密工具（選用，建議）
```

## 維護行程
編輯 `travel/hokkaido-2026/js/data.js`，存檔後重新整理即可。重點欄位：
- `start`：Day 1 日期，其餘天數自動推算。`days[]` 每一天：`area`（區域 id）、`title`、`reminders`（黃色提醒）、`notes`（備案）、`items`（時間軸）。
- `items`：`time`/`end`（可省略＝全天）、`cat`（sight/food/stay/move/shop/other）、`title`、`place`（有填才有地圖連結）、`note`、`cost`、`status`（`confirmed`／`candidate`）。
- `pending`：尚待確認事項；`day` 填第幾天會出現「前往 Day N」。
- `hotels`：連住多天只要一筆（`inn` 入住、`out` 退房），各天頁面會自動顯示「今日住宿」。
- `people`：同行名單（分帳會用）。`pool`：備選清單。`areas`：區域、代表色、座標（天氣與日落用）。

## 新增一趟旅程
1. 複製 `travel/hokkaido-2026/` 成 `travel/<新資料夾>/`，改 `js/data.js`（`id` 也要改）。
2. 在 `travel/trips.js` 加一筆。入口頁 `index.html` 的 `TRAVEL` 陣列也可加卡片。

## 隱私（重要）
GitHub Pages 網站是公開的，`data.js` 會被任何人讀到。建議加密：
```
node tools/encrypt.mjs 你的密碼(至少8字)  travel/hokkaido-2026
```
會產生 `js/data.enc.js`。**只上傳它，不要上傳 `data.js`**（`.gitignore` 已排除 `data.js`）。開啟網頁時輸入密碼才會解密，可勾選「記住這台裝置」。
- 資料一旦 commit 進過 git，就會留在歷史紀錄裡；請從第一次上傳就用加密版。
- 密碼要夠長；忘記密碼無法救回，保留本機的 `data.js` 就能重新加密。
- **免密碼分享連結**：在行程網址後加 `#k=<密碼>`（例：`.../travel/hokkaido-2026/#k=你的密碼`），朋友點開即自動解鎖並記住裝置，密碼會立刻從網址列移除。這個連結等同密碼，被轉傳就等於公開；換密碼後舊連結即失效。

## 功能與限制
- 開啟時若今天在旅程期間，會自動跳到當天；時間以目的地時區（`tz`）判斷。
- 天氣（Open-Meteo，免費、免金鑰）：16 天內顯示預報，更早顯示「去年同日參考」。需要網路。
- 匯率（open.er-api.com）、日出日落（公式計算，免網路）。
- 勾選的行前準備、分帳成員與支出只存在**各裝置的瀏覽器**，不同步。
