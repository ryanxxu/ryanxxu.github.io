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
tools/decrypt.mjs                  node tools/decrypt.mjs <密碼> [folder]（從 data.enc.js 還原 data.js）
```

## 更新行程的流程（新 session 沒有 data.js）
1. 向使用者要密碼（密碼絕不寫進 repo）→ `node tools/decrypt.mjs <密碼>` 還原 data.js。
2. 依使用者描述修改 data.js（欄位見 README）。
3. `node tools/encrypt.mjs <同一組密碼>` → 確認 `git status` 沒有 data.js → commit + push main。
4. 密碼不變，所以 `#k=` 免密碼分享連結繼續有效。

**行程編輯器**（使用者自己改資料用）：私人 Artifact https://claude.ai/artifact/BAZaEjdYMgdaeyr9jgW19R ，資料在其 db `trip/current`（欄位 `json` = JSON.stringify(TRIP)、`savedAt`）。使用者說「改好了」→ ArtifactData get 該文件 → 寫成 data.js → 加密 → push。若自己改了 data.js，也要用 ArtifactData set（帶 if_version）同步回編輯器，否則下次儲存會蓋掉。
- 入口頁北海道卡片連到 `travel/`（第二層），不直接進行程頁。
- 新增旅程：放資料夾 + `travel/trips.js` 加一筆 + 入口頁 `TRAVEL` 陣列加一筆（兩處要同步）。
- 舊的 `ryanxxu/hokkaido` repo 已不用（請使用者自行刪除；本環境無法刪 repo）。

## 行程頁（app.js）— 一頁式
- 上方固定英文選單 HOME｜FLIGHT｜DAYS｜STAY｜NOTES，點了捲到該段，捲動時自動標示（scrollspy）。右上只留「匯率」「分帳」；天氣自動抓、30 分鐘快取，回到頁面時過期就重抓（沒有更新按鈕）。
- HOME：標題、時鐘、倒數、待確認；旅程期間多一張「進行中／接下來」卡片（今天行程結束後顯示「明天」第一項），點了跳到時間軸那一列並閃一下（`nextHtml()`、`jumpTo()`）。FLIGHT：`TRIP.flights[]`（dir、date、airline、no、from、to、dep、arr、pnr、cost、note）登機證卡片，並自動排進當天時間軸，時間軸上用短標題「CI130　桃園 → 新千歲」（不要再在 days.items 放航班）。
- DAYS：D1–D5 切換（只顯示日期與星期，不放天氣；旅程期間預設當天，否則 Day 1）；當天標題區＝大日期數字與標題底部對齊、上方一行「NOV 週四 Day 1/5」；下面一個天氣方塊（地區、天氣圖示、低/高溫、降雨/降雪、資料來源｜右側日出/日落/天黑）；再來 NOTE 框 = 當天待確認＋`reminders`（「名稱：說明」名稱加粗）＋`notes`（備案）＋該地區 Wishlist（`pool`，預設收起）；下面是直式時間軸，**不顯示類別**（使用者覺得花俏）：一般深藍圓點、交通空心點＋灰斜體（`cat:"move"`）、航班 ✈、候選紅圈、日落金點、旅程中的紅色 NOW 線。行程/飯店/航班的 `note` 可含換行，網站分行顯示（pre-wrap）。
- STAY：飯店卡片（`inn <= date < out`）；每日行程底部顯示「今晚住宿」連到 STAY。
- NOTES：CHECKLIST（`prep`）、SHOP HOURS（`shops`）。可折疊並記住狀態。舊的 CAUTIONS 已併入各天 `reminders`，資料不再有 `cautions`；WISHLIST 已移到每天 NOTE 裡。
- 舊網址相容：`#/day/<n>` 切到該天並捲到 DAYS、`#/prep` 捲到 NOTES、`#/area/<id>` 切到該區第一天。
- 字級：內文 17px（iPhone 16 Pro），最小 13px；可點元素外觀不變但觸控範圍放大到約 44pt；使用者偏好段落／選單用英文。
- 「今天」以目的地時區 `Asia/Tokyo` 判斷。localStorage key 前綴 `trip:<pathname>:`。已移除頁內編輯功能。
- 改版前先做在草稿分支並截圖（iPhone 16 Pro 402×874），使用者確認後再併入 main。

## 隱私
GitHub Pages 一定公開 → 行程資料用 AES-256-GCM + PBKDF2(250000) 加密，瀏覽器 WebCrypto 解密，可選擇記住密碼。明文一旦 commit 進 git 歷史就無法收回。

## 設計
- 行程頁：總覽「票券風 + 山稜 SVG」，內頁「極簡雜誌風 + 雪點」。配色 snow #f7f9fb、navy #17304f、ice #6fa8d6、berry #b84a62（候選/待確認）、餐飲橘 #d9772b。大標題粗體；所有地圖連結（時間軸、飯店、營業時間、Wishlist）都是名稱後面的線條地圖圖釘（SVG `PIN`，使用者選的 B 款，`titleWithMap()`）；不顯示 Photos。
- 入口頁／第二層：鼠尾草綠（--bg #f4f4f1、--sage #dfe9df、--ink #1d2b22）。Hero：三層同心圓環（::before）+ ✳（::after，旋轉 -15°）；第二層 hero 與第一層同尺寸（min-height 300）。
- 兩層都加 `html{scrollbar-gutter:stable}`。
- 北海道圖示是使用者自己做的內嵌 SVG 日本國旗（trips.js 的 `JP` 變數、入口頁 TRAVEL 陣列）。
- 視覺要和朋友網站 troyyan.com 不同。

## 待辦
- [x] 已部署並實測（天氣、匯率正常）；已加免密碼分享連結 `#k=<密碼>`。
- [ ] 範例飯店「札幌○○飯店」改成真實資料；填 `people`。
- [ ] 待確認事項與備選清單待使用者逐項確認。
- [ ] `tzOffsetHours` 只認得少數時區，非亞洲旅程需改用 Intl 計算。
