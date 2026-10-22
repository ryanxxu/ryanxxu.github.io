/* 旅遊列表：新增一趟旅行就在這裡加一筆，並把行程資料夾放在 travel/<folder>/
   - start / end 用 YYYY-MM-DD，頁面會依「開始日期的年份」自動分組、新的年份排在前面
   - icon 可放 emoji 或 SVG 字串（日本國旗如下） */
var JP = '<svg width="30" height="20" viewBox="0 0 30 20" style="border-radius:3px;box-shadow:0 0 0 1px #dfe3dc"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/></svg>';
window.TRIPS = [
  { folder: "hokkaido-2026", name: "北海道", start: "2026-11-19", end: "2026-11-23", icon: JP }
];
