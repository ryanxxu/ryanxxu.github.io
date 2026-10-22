# Ryan's Space（ryanxxu.github.io）

使用者用**繁體中文**溝通。純靜態網站（HTML/CSS/JS），無後端、無 build，部署在 GitHub Pages。

## 架構（使用者決定維持三層）
```
index.html                         第 1 層：入口頁 "Ryan's Space"（以使用者自己維護的版本為準，勿整份覆蓋）
travel/index.html + trips.js       第 2 層：旅行清單（依開始年份分組，狀態標籤：進行中／即將出發／已結束）
travel/hokkaido-2026/              第 3 層：行程頁（2026-11-19 ~ 11-23，札幌、小樽、旭川美瑛、定山溪、札幌）
  index.html  css/style.css  js/app.js
  js/data.js       明文行程 window.TRIP —— .gitignore 排除，絕不上傳
  js/data.enc.js   加密資料 window.TRIP_ENC —— 上傳這個
tools/encrypt.mjs                  node tools/encrypt.mjs <密碼≥8字> [folder]
```
- 新增旅程：放資料夾 + `travel/trips.js` 加一筆 + 入口頁 `TRAVEL` 陣列加一筆（兩處要同步）。
- 另有 `ryanxxu/hokkaido` repo（`/hokkaido/`），內容是舊的單檔 artifact 版，已被 `travel/hokkaido-2026/` 取代。

## 行程頁（app.js）
- 路由：`#/` 總覽、`#/prep`、`#/area/<id>`、`#/day/<n>`；左上「←」`href="../"` 回第二層。
- 「今天」以目的地時區 `Asia/Tokyo` 判斷，旅程期間自動跳到當天。
- 飯店顯示在入住日行程頁最底部（`inn <= date < out`，退房日不顯示）。
- 天氣 Open-Meteo（不放預設文字）、日落/天黑用天文公式、匯率 JPY→TWD（open.er-api.com）、分帳、總覽區塊可折疊、卡片依類別加色條。
- localStorage key 前綴 `trip:<pathname>:`（搬路徑會重置記住的密碼與分帳資料）。
- 已移除頁內編輯功能，行程一律改 `data.js` 後重新加密。

## 隱私
GitHub Pages 一定公開 → 行程資料用 AES-256-GCM + PBKDF2(250000) 加密，瀏覽器 WebCrypto 解密，可選擇記住密碼。明文一旦 commit 進 git 歷史就無法收回。

## 設計
- 行程頁：總覽「票券風 + 山稜 SVG」，內頁「極簡雜誌風 + 雪點」。配色 snow #f7f9fb、navy #17304f、ice #6fa8d6、berry #b84a62（候選/待確認）、餐飲橘 #d9772b。大標題粗體；地圖連結文字 `Map ↗`；不顯示 Photos。
- 入口頁／第二層：鼠尾草綠（--bg #f4f4f1、--sage #dfe9df、--ink #1d2b22）。Hero：三層同心圓環（::before）+ ✳（::after，旋轉 -15°）；第二層 hero 與第一層同尺寸（min-height 300）。
- 兩層都加 `html{scrollbar-gutter:stable}`。
- 北海道圖示是使用者自己做的內嵌 SVG 日本國旗（trips.js 的 `JP` 變數、入口頁 TRAVEL 陣列）。
- 視覺要和朋友網站 troyyan.com 不同。

## 待辦
- [ ] 部署：加密 → 上傳（不含 data.js）→ Settings→Pages 選 main / root。
- [ ] 部署後實測整條流程（入口→清單→行程→密碼→天氣/日落/匯率/分帳）；之前從未在瀏覽器實測過。
- [ ] 範例飯店「札幌○○飯店」改成真實資料；填 `people`。
- [ ] `pending` 的 `day` 欄位疑似少 1（Day2 小樽、Day3 美瑛、Day4 定山溪）。
- [ ] 待確認事項與備選清單待使用者逐項確認。
- [ ] `tzOffsetHours` 只認得少數時區，非亞洲旅程需改用 Intl 計算。
