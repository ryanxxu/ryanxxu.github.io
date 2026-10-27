/* 旅遊手冊主程式：讀取 window.TRIP（js/data.js）或解密 window.TRIP_ENC（js/data.enc.js）後渲染。
 * 一頁式：HOME／FLIGHT／DAYS／STAY／NOTES。舊網址 #/day/<n>、#/prep、#/area/<id> 會捲到對應段落 */
(function (root) {
  'use strict';

  var POOLCAT = { t: '交通', p: '景點', f: '吃的', b: '買的' };
  var WDN = ['日', '一', '二', '三', '四', '五', '六'];
  var GREY = '#9ca3af';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2] + n); }
  function wd(d) { return '星期' + WDN[d.getDay()]; }
  function mapUrl(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
  function imgUrl(q) { return 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q); }
  function tint(hex) { return hex || GREY; }

  /* 目的地目前的日期與時間（用目的地時區，而不是裝置時區） */
  function nowIn(tz, at) {
    var d = at || new Date();
    try {
      var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      var p = {}; f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return { date: p.year + '-' + p.month + '-' + p.day, time: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
    } catch (e) { return { date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) }; }
  }

  /* 日出日落（天文公式，不需網路） */
  function sunT(date, lat, lon, rise, zen) {
    var D = Math.PI / 180, N = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 864e5), lh = lon / 15,
      t = N + ((rise ? 6 : 18) - lh) / 24, M = 0.9856 * t - 3.289, L = M + 1.916 * Math.sin(M * D) + 0.020 * Math.sin(2 * M * D) + 282.634;
    L = (L % 360 + 360) % 360;
    var RA = Math.atan(0.91764 * Math.tan(L * D)) / D; RA = (RA % 360 + 360) % 360; RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90; RA /= 15;
    var sd = 0.39782 * Math.sin(L * D), cd = Math.cos(Math.asin(sd)), ch = (Math.cos(zen * D) - sd * Math.sin(lat * D)) / (cd * Math.cos(lat * D));
    if (ch > 1 || ch < -1) return null;
    var H = (rise ? 360 - Math.acos(ch) / D : Math.acos(ch) / D) / 15, T = H + RA - 0.06571 * t - 6.622;
    return ((T - lh) % 24 + 24) % 24;
  }
  function fmtH(h) { h = ((h % 24) + 24) % 24; var m = Math.round(h * 60); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function sunInfo(T, i) {
    var a = areaOf(T, i); if (!a || !a.geo) return null;
    var off = tzOffsetHours(T.tz), d = dayDate(T, i);
    var r = sunT(d, a.geo[0], a.geo[1], true, 90.833), s = sunT(d, a.geo[0], a.geo[1], false, 90.833), k = sunT(d, a.geo[0], a.geo[1], false, 96);
    if (r == null || s == null) return null;
    return { rise: fmtH(r + off), set: fmtH(s + off), dark: k == null ? '' : fmtH(k + off) };
  }
  function tzOffsetHours(tz) {
    var map = { 'Asia/Tokyo': 9, 'Asia/Seoul': 9, 'Asia/Taipei': 8, 'Asia/Hong_Kong': 8, 'Asia/Bangkok': 7 };
    return map[tz] != null ? map[tz] : 9;
  }

  /* ---------- data helpers ---------- */
  function dayDate(T, i) { return addDays(T.start, i); }
  function areaOf(T, i) { var d = T.days[i]; return d ? (T.areas || []).filter(function (a) { return a.id === d.area; })[0] : null; }
  function areaById(T, id) { return (T.areas || []).filter(function (a) { return a.id === id; })[0]; }
  var TONES = ['#17304f', '#4a7aa6', '#8fb6d9', '#6b7f95', '#a9b8c8'];
  function areaTone(T, a) { var k = a ? (T.areas || []).indexOf(a) : -1; return k < 0 ? GREY : TONES[k % TONES.length]; }
  function dayColor(T, i) { return areaTone(T, areaOf(T, i)); }
  function sorted(items) { return items.slice().sort(function (a, b) { return (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0; }); }
  function todayIdx(T) {
    var t = nowIn(T.tz).date;
    for (var i = 0; i < T.days.length; i++) if (ymd(dayDate(T, i)) === t) return i;
    return -1;
  }
  function groups(T) {
    var g = [];
    T.days.forEach(function (d, i) {
      var last = g[g.length - 1];
      if (last && last.area === d.area) last.days.push(i); else g.push({ area: d.area, days: [i] });
    });
    return g;
  }
  function pendingByDay(T, i) { return (T.pending || []).filter(function (p) { return p.day === i + 1; }); }

  /* ---------- weather ---------- */
  function wmo(c) {
    if (c === 0) return '☀️'; if (c <= 2) return '🌤️'; if (c === 3) return '☁️'; if (c === 45 || c === 48) return '🌫️';
    if (c <= 57) return '🌦️'; if (c <= 67) return '🌧️'; if (c <= 77) return '❄️'; if (c <= 82) return '🌦️'; if (c <= 86) return '🌨️'; return '⛈️';
  }
  function wxLabel(src) { return src === 'f' ? '即時預報' : src === 'h' ? '去年同日參考' : '實際天氣'; }
  /* ---------- view builders（純函式，回傳 HTML 字串） ---------- */
  function rnd(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function decoSnow(seed) {
    var o = '';
    for (var i = 0; i < 34; i++) {
      var k = i + seed * 41, r = 1 + rnd(k + 9) * 2.6;
      o += '<circle cx="' + (rnd(k + 1) * 390).toFixed(1) + '" cy="' + (rnd(k + 77) * 120).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#9cc3e6" opacity="' + (0.18 + rnd(k + 5) * 0.32).toFixed(2) + '"/>';
    }
    return '<svg class="snow" viewBox="0 0 390 120" preserveAspectRatio="xMidYMin slice" aria-hidden="true">' + o + '</svg>';
  }
  function decoRidge() {
    return '<svg class="deco" viewBox="0 0 390 150" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#f7f9fb"/></linearGradient></defs>' +
      '<path d="M0 110 L55 62 L88 88 L140 28 L190 84 L232 52 L290 100 L335 44 L390 96 L390 150 L0 150Z" fill="url(#rg)"/>' +
      '<path d="M140 28 L124 49 L136 45 L146 53 L158 44Z M335 44 L322 62 L332 58 L342 65 L352 56Z M55 62 L44 76 L54 72 L62 78Z" fill="#fff"/>' +
      '<path d="M0 110 L55 62 L88 88 L140 28 L190 84 L232 52 L290 100 L335 44 L390 96" fill="none" stroke="#6fa8d6" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  /* =====================================================================
   * 一頁式：HOME → FLIGHT → DAYS → STAY → NOTES，上方固定選單捲動到各段
   * ===================================================================== */
  var SECS = [['home', 'Home'], ['flight', 'Flight'], ['days', 'Days'], ['stay', 'Stay'], ['notes', 'Notes']];
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function md(ds) { return +ds.slice(5, 7) + '/' + +ds.slice(8, 10); }
  function secHead(id, title, meta) {
    return '<div class="sh1"><b>' + title + '</b>' + (meta ? '<span>' + meta + '</span>' : '') + '</div>';
  }
  /* 可折疊段落；收合狀態記在這台裝置（defShut：沒記錄時預設收起） */
  function fold(ctx, key, title, meta, body, defShut) {
    var f = (ctx.fold || {})[key], shut = f == null ? !!defShut : f;
    return '<details class="blk" data-fold="' + key + '"' + (shut ? '' : ' open') + '><summary class="sec2"><b>' + title + '</b>' +
      (meta ? '<span>' + meta + '</span>' : '') + '<i aria-hidden="true"></i></summary>' + body + '</details>';
  }
  function pendingBox(T) {
    return (T.pending || []).map(function (p) {
      return '<div class="pd"><b>' + esc(p.title) + '</b>' + (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') +
        (p.day && T.days[p.day - 1] ? '<button class="lnk" data-day="' + (p.day - 1) + '">前往 Day ' + p.day + ' →</button>' : '') + '</div>';
    }).join('');
  }

  /* ---------- HOME ---------- */
  function homeHtml(T, ctx) {
    var t = nowIn(T.tz).date, diff = Math.round((parse(T.start) - parse(t)) / 864e5);
    var names = (T.areas || []).map(function (a) { return a.name; }).join('、');
    var h = decoRidge() + '<div class="pgtop"></div><h1 class="ttl serif">' + esc(T.title) + '</h1>' +
      '<div class="sub">' + md(T.start) + ' – ' + md(ymd(addDays(T.start, T.days.length - 1))) + '　' + T.days.length + ' 天　' + esc(names) + '</div>';
    h += '<div class="clk" id="clk">' + clockHtml(T) + '</div>';
    if (diff > 0) h += '<div class="cd">距離出發還有 <b>' + diff + '</b> 天</div>';
    else if (ctx.today >= 0) h += '<div class="cd">旅程第 <b>' + (ctx.today + 1) + '</b> 天　<button class="lnk" data-day="' + ctx.today + '">看今天的行程 →</button></div>';
    if (ctx.today >= 0) h += '<div id="nx">' + nextHtml(T, ctx) + '</div>';
    if ((T.pending || []).length) h += '<div class="sec">待確認事項 ・ ' + T.pending.length + '</div>' + pendingBox(T);
    return h;
  }
  /* 旅程中：首頁顯示「進行中／接下來」，點了跳到時間軸上那一列 */
  function nextHtml(T, ctx) {
    var now = nowIn(T.tz).time, toMin = function (t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; };
    var card = function (lbl, d, k, x, when) {
      return '<button class="nxc" data-jump="' + d + ':' + k + '"><span class="nxl">' + lbl + '</span><span class="nxt">' + esc(x.time || '全天') + '</span>' +
        '<b>' + esc(x.title) + '</b>' + (when ? '<small>' + when + '</small>' : '') + '<i aria-hidden="true">→</i></button>';
    };
    var items = dayItems(T, ctx.today), cur = -1, nx = -1;
    items.forEach(function (x, k) {
      if (!x.time) return;
      if (x.time <= now && x.end && now < x.end) cur = k;
      if (nx < 0 && x.time > now) nx = k;
    });
    var h = '';
    if (cur >= 0) h += card('進行中', ctx.today, cur, items[cur], '');
    if (nx >= 0) {
      var m = toMin(items[nx].time) - toMin(now);
      h += card('接下來', ctx.today, nx, items[nx], m < 60 ? m + ' 分鐘後' : Math.floor(m / 60) + ' 小時 ' + (m % 60 ? m % 60 + ' 分' : '') + '後');
    } else if (T.days[ctx.today + 1]) {
      var tm = dayItems(T, ctx.today + 1)[0];
      if (tm) h += card('明天', ctx.today + 1, 0, tm, '今天的行程都結束了');
    }
    return h ? '<div class="nx">' + h + '</div>' : '';
  }

  /* ---------- FLIGHT ---------- */
  function flightTitle(f) { return [f.airline, f.no].filter(Boolean).join(' '); }
  function flightHtml(T) {
    var fs = (T.flights || []).slice().sort(function (a, b) { return (a.date + a.dep) < (b.date + b.dep) ? -1 : 1; });
    if (!fs.length) return '<div class="muted">尚未填寫航班</div>';
    return fs.map(function (f) {
      var d = parse(f.date || T.start);
      return '<div class="bp"><div class="bp-h"><span>' + esc(f.dir || 'FLIGHT') + '</span><span>' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + WDN[d.getDay()] + '）</span></div>' +
        '<div class="bp-r"><div><b>' + esc(f.dep || '--:--') + '</b><small>' + esc(f.from || '') + '</small></div>' +
        '<div class="bp-m"><i></i><span>' + esc(f.no || '✈') + '</span><i></i></div>' +
        '<div class="r"><b>' + esc(f.arr || '--:--') + '</b><small>' + esc(f.to || '') + '</small></div></div>' +
        '<div class="bp-f">' + ['<span>' + esc(flightTitle(f)) + '</span>', f.pnr ? '<span>訂位代號 <b>' + esc(f.pnr) + '</b></span>' : '', f.cost ? '<span>' + esc(f.cost) + '</span>' : ''].join('') +
        (f.note ? '<p>' + esc(f.note) + '</p>' : '') + '</div></div>';
    }).join('');
  }

  /* ---------- DAYS ---------- */
  function dayChips(T, ctx) {
    return '<div class="strip" id="strip">' + T.days.map(function (x, j) {
      var dj = dayDate(T, j), w = ctx.wx && ctx.wx[j];
      return '<button class="sp' + (j === ctx.day ? ' on' : '') + (j === ctx.today ? ' td' : '') + '" style="--dc:' + dayColor(T, j) + '" data-day="' + j + '">' +
        '<small>D' + (j + 1) + '</small><b>' + (dj.getMonth() + 1) + '/' + dj.getDate() + '</b><em>' + WDN[dj.getDay()] + '</em></button>';
    }).join('') + '</div>';
  }
  /* 航班自動排進當天時間軸 */
  function dayItems(T, i) {
    var ds = ymd(dayDate(T, i)), fl = (T.flights || []).filter(function (f) { return f.date === ds; }).map(function (f) {
      var ap = function (x) { return String(x || '').replace(/\s*(國際)?機場.*$/, ''); };
      return { time: f.dep, end: f.arr, cat: 'move', fl: 1, title: (f.no || flightTitle(f)) + '　' + ap(f.from) + ' → ' + ap(f.to) };
    });
    return sorted((T.days[i].items || []).concat(fl));
  }
  /* 名稱後面接線條地圖圖釘；最後一個字和圖釘不分開換行 */
  var PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
  function titleWithMap(t, q) {
    var c = Array.from(String(t)), last = c.pop() || '';
    return esc(c.join('')) + '<span class="nw">' + esc(last) + '<a class="mp" target="_blank" rel="noopener" href="' + mapUrl(q) + '" aria-label="' + esc(t) + ' 地圖">' + PIN + '</a></span>';
  }
  function dayPanel(T, i, ctx) {
    var d = T.days[i]; if (!d) return '<div class="empty">找不到這一天</div>';
    var dt = dayDate(T, i), a = areaOf(T, i), ds = ymd(dt), isToday = ctx.today === i;
    var s = sunInfo(T, i), w = ctx.wx && ctx.wx[i];
    /* 標題：大日期數字的底線和標題底線對齊；月份、Day、星期放在標題上方一行；背景淡淡雪點 */
    var h = decoSnow(i) + '<div class="dh"><div class="big serif">' + pad(dt.getDate()) + '</div>' +
      '<div class="dhr"><div class="dmeta"><span class="mon">' + MON[dt.getMonth()] + '</span>' + wd(dt).replace('星期', '週') + '　Day ' + (i + 1) + ' / ' + T.days.length +
      (isToday ? '<em>TODAY</em>' : '') + '</div>' +
      '<h2 class="ttl serif sm">' + esc(d.title || (a && a.name) || '') + '</h2></div></div>';
    /* 天氣方塊：地區、天氣、溫度、降雨／降雪、日出日落 */
    h += '<div class="wxb"><div class="wxm">' +
      '<div class="area"><span class="dot" style="background:' + areaTone(T, a) + '"></span>' + esc(a ? a.name : '') + '</div>' +
      (w ? '<div class="wxt"><span class="wxi">' + wmo(w.code) + '</span><b>' + Math.round(w.lo) + '° / ' + Math.round(w.hi) + '°</b></div>' +
        '<div class="wxs">' + [w.pp != null ? '降雨 ' + w.pp + '%' : '', w.sn > 0 ? '降雪 ' + (Math.round(w.sn * 10) / 10) + ' cm' : ''].filter(Boolean).join('　') + '<small>' + wxLabel(w.src) + '</small></div>'
        : '<div class="wxs">天氣資料讀取中</div>') + '</div>' +
      (s ? '<dl class="sunl"><div><dt>日出</dt><dd>' + s.rise + '</dd></div><div><dt>日落</dt><dd>' + s.set + '</dd></div>' + (s.dark ? '<div><dt>天黑</dt><dd>' + s.dark + '</dd></div>' : '') + '</dl>' : '') + '</div>';

    /* NOTE：當天的待確認、提醒、備案，以及該地區的 Wishlist（預設收起）集中在最上面 */
    var p = pendingByDay(T, i), rm = d.reminders || [], nt = d.notes || [], wl = wishHtml(T, a, ctx);
    if (p.length || rm.length || nt.length || wl) {
      h += '<div class="note"><div class="nh">Note</div>' +
        p.map(function (x) { return '<div class="nl pdl"><b>待確認</b>' + esc(x.title) + '</div>'; }).join('') +
        rm.map(function (x) { var k = x.indexOf('：'); return '<div class="nl">' + (k > 0 ? '<b>' + esc(x.slice(0, k)) + '</b>' + esc(x.slice(k + 1)) : esc(x)) + '</div>'; }).join('') +
        (nt.length ? '<div class="nl alt"><b>備案</b>' + nt.map(esc).join('、') + '</div>' : '') + wl + '</div>';
    }

    var items = dayItems(T, i), nowT = nowIn(T.tz).time, rows = [];
    /* 依時間排進軸線：行程、日落、現在（只在當天） */
    items.forEach(function (x, k) { rows.push({ t: x.time || '', x: x, k: k }); });
    if (s && items.length) rows.push({ t: s.set, sun: 1 });
    if (isToday && items.length) rows.push({ t: nowT, now: 1 });
    rows.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.now ? 1 : b.now ? -1 : 0); });
    h += '<div class="tl">' + rows.map(function (r) {
      if (r.sun) return '<div class="it sun"><div class="tm">' + r.t + '</div><div class="rl"><i></i></div><div class="bd">日落' + (s.dark ? '・天色全暗約 ' + s.dark : '') + '</div></div>';
      if (r.now) return '<div class="it nowl"><div class="tm">' + r.t + '</div><div class="rl"><i></i></div><div class="bd">NOW</div></div>';
      var x = r.x, mv = x.cat === 'move' && !x.fl, q = x.place;
      var on = isToday && x.time && x.time <= nowT && x.end && nowT < x.end;
      var dupNote = mv && x.time && x.note && x.note.replace(/\b0/g, '') === (x.time + ' – ' + (x.end || '')).replace(/\b0/g, '');
      return '<div class="it' + (mv ? ' mv' : '') + (x.fl ? ' fl' : '') + (x.status === 'candidate' ? ' cd' : '') + (on ? ' now' : '') + '" data-k="' + r.k + '">' +
        '<div class="tm">' + esc(x.time || '全天') + (x.end ? '<small>' + esc(x.end) + '</small>' : '') + '</div><div class="rl"><i></i></div><div class="bd">' +
        (x.status === 'candidate' && !mv ? '<div class="tag"><span class="cand">候選方案</span></div>' : '') +
        '<div class="tt">' + (q && !x.fl ? titleWithMap(x.title, q) : esc(x.title)) + '</div>' +
        (x.note && !dupNote ? '<div class="ds">' + esc(x.note) + '</div>' : '') + (x.cost ? '<div class="ds">' + esc(x.cost) + '</div>' : '') +
        (x.fl ? '<div class="lks"><button class="lnk" data-go="flight">航班資訊 ↓</button></div>' : '') + '</div></div>';
    }).join('') + '</div>';
    if (!items.length) h += '<div class="empty">這天還沒有行程</div>';

    var hs = hotelsFor(T, ds);
    if (hs.length) h += '<div class="tn">今晚住宿　' + hs.map(function (x) { return '<button class="lnk" data-go="stay">' + esc(x.name) + ' ↓</button>'; }).join('') + '</div>';
    h += '<div class="pn">' + (i > 0 ? '<button data-day="' + (i - 1) + '">← Day ' + i + '</button>' : '<span></span>') +
      (i < T.days.length - 1 ? '<button data-day="' + (i + 1) + '">Day ' + (i + 2) + ' →</button>' : '<span></span>') + '</div>';
    return h;
  }

  /* ---------- STAY ---------- */
  function hotelsFor(T, dateStr) {
    return (T.hotels || []).filter(function (x) { return x.inn <= dateStr && dateStr < x.out; });
  }
  function nightsOf(x) { return Math.round((parse(x.out) - parse(x.inn)) / 864e5); }
  function hotelHtml(x, tag) {
    var q = x.addr || x.name;
    return '<div class="mini"><div class="a"><small>' + nightsOf(x) + ' NIGHTS</small>' + md(x.inn) + '<small>→ ' + md(x.out) + '</small></div>' +
      '<div class="b"><b>' + titleWithMap(x.name, q) + '</b>' + (tag ? '<span class="tg">' + tag + '</span>' : '') +
      (x.addr ? '<div>' + esc(x.addr) + '</div>' : '') + (x.conf ? '<div>訂房編號　' + esc(x.conf) + '</div>' : '') +
      (x.phone ? '<div>' + esc(x.phone) + '</div>' : '') + (x.cost ? '<div>' + esc(x.cost) + '</div>' : '') + (x.note ? '<div>' + esc(x.note) + '</div>' : '') + '</div></div>';
  }
  function stayHtml(T, ctx) {
    var hs = (T.hotels || []).slice().sort(function (a, b) { return a.inn < b.inn ? -1 : 1; }), t = nowIn(T.tz).date;
    return hs.length ? hs.map(function (x) { return hotelHtml(x, x.inn <= t && t < x.out ? '今晚' : ''); }).join('') : '<div class="muted">尚未填寫住宿</div>';
  }

  /* ---------- NOTES ---------- */
  /* 該地區的 Wishlist（原備選清單），放在每天 NOTE 裡，預設收起 */
  function wishHtml(T, a, ctx) {
    var pa = a && (T.pool || {})[a.pool]; if (!pa) return '';
    var n = 0, body = ['t', 'p', 'f', 'b'].map(function (k) {
      var arr = pa[k]; if (!arr || !arr.length) return ''; n += arr.length;
      return '<div class="pk"><div class="pkc">' + POOLCAT[k] + '</div>' + arr.map(function (e) {
        return '<div class="pki"><div><b>' + (k === 't' ? esc(e[0]) : titleWithMap(e[0], e[0] + ' ' + a.pool)) + '</b>' + (e[1] ? '<span>' + esc(e[1]) + '</span>' : '') + '</div></div>';
      }).join('') + '</div>';
    }).join('');
    if (!n) return '';
    var key = 'wl-' + a.id, f = (ctx.fold || {})[key], shut = f == null ? true : f;
    return '<details class="wl" data-fold="' + key + '"' + (shut ? '' : ' open') + '><summary><b>Wishlist</b><span>' + esc(a.name) + '・' + n + ' 個</span><i aria-hidden="true"></i></summary>' + body + '</details>';
  }
  function notesHtml(T, ctx) {
    var ck = ctx.checks || {}, h = '<div class="muted">勾選與收合狀態只存在這台裝置</div>';
    var list = T.prep || [], done = list.filter(function (x, i) { return ck[i]; }).length;
    h += fold(ctx, 'check', 'Checklist', list.length ? done + ' / ' + list.length : '', list.length ?
      '<div class="bar"><i style="width:' + Math.round(done / list.length * 100) + '%"></i></div><div class="ckg">' + list.map(function (x, i) {
        return '<label class="ck2' + (ck[i] ? ' done' : '') + '"><input type="checkbox" data-ck="' + i + '"' + (ck[i] ? ' checked' : '') + '><span>' + esc(x) + '</span></label>';
      }).join('') + '</div>' : '<div class="muted">尚無項目</div>');

    if ((T.shops || []).length) {
      h += fold(ctx, 'shops', 'Shop Hours', T.shops.length + ' 家', '<div class="sh">' + T.shops.map(function (s) {
        return '<div class="shr"><div class="shn">' + titleWithMap(s[0], s[0] + ' 札幌') + '</div><div class="sht">' + esc(s[1]) + '</div>' +
          '<div class="shb">' + (s[2] ? '<em>' + esc(s[2]) + '</em>' : '') + '</div></div>';
      }).join('') + '</div>');
    }

    return h;
  }

  function clockHtml(T, area) {
    var home = nowIn(T.homeTz || 'Asia/Taipei').time, dest = nowIn(T.tz).time;
    return '<span>' + esc(T.homeLabel || '台灣') + ' <b data-clk="home">' + home + '</b></span><span>' + esc(T.destLabel || '日本') + (area ? '・' + esc(area.name) : '') + ' <b data-clk="dest">' + dest + '</b></span>';
  }
  function wxStamp(ctx) {
    if (!ctx.wxAt) return '';
    var m = Math.max(0, Math.round((Date.now() - ctx.wxAt) / 60000));
    return '天氣更新於 ' + (m < 1 ? '剛剛' : m + ' 分鐘前');
  }

  function headerHtml(T, cur) {
    var last = ymd(addDays(T.start, T.days.length - 1));
    return '<div class="hd-in"><div class="hd-top"><div class="cap"><a class="home" href="../" aria-label="回旅行清單">←</a> ' + esc(T.title) + '<span>' + md(T.start) + ' – ' + md(last) + (T.people && T.people.length ? '・' + T.people.length + '人' : '') + '</span></div>' +
      '<div class="tools"><button class="tool" data-act="fx">¥ 匯率</button><button class="tool" data-act="split">$ 分帳</button></div></div>' +
      '<nav class="nav" id="tabs">' + SECS.map(function (s) { return '<button class="' + (s[0] === cur ? 'on' : '') + '" data-go="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</nav></div>';
  }
  function pageHtml(T, ctx) {
    return '<section id="s-home">' + homeHtml(T, ctx) + '</section>' +
      '<section id="s-flight">' + secHead('flight', 'Flight', (T.flights || []).length ? T.flights.length + ' 段' : '') + flightHtml(T) + '</section>' +
      '<section id="s-days">' + secHead('days', 'Days', wxStamp(ctx)) + dayChips(T, ctx) + '<div id="dayp">' + dayPanel(T, ctx.day, ctx) + '</div></section>' +
      '<section id="s-stay">' + secHead('stay', 'Stay', (T.hotels || []).length ? T.hotels.length + ' 間' : '') + stayHtml(T, ctx) + '</section>' +
      '<section id="s-notes">' + secHead('notes', 'Notes', '') + notesHtml(T, ctx) + '</section>';
  }

  /* 舊網址相容：#/day/n、#/prep、#/area/<id> */
  function parseRoute(hash) {
    var m = /^#\/(day|area)\/([^/]+)$/.exec(hash || '');
    if (m) return m[1] === 'day' ? { k: 'day', n: +m[2] } : { k: 'area', id: decodeURIComponent(m[2]) };
    if (hash === '#/prep') return { k: 'prep' };
    return { k: 'home' };
  }

  /* ---------- 分帳計算（純函式） ---------- */
  function settle(members, expenses) {
    var bal = {}; members.forEach(function (m) { bal[m] = 0; });
    expenses.forEach(function (e) {
      var sh = (e.shares && e.shares.length ? e.shares : members).filter(function (m) { return m in bal; });
      if (!sh.length || !(e.payer in bal)) return;
      var per = e.amount / sh.length; bal[e.payer] += e.amount; sh.forEach(function (m) { bal[m] -= per; });
    });
    var cr = [], db = [];
    Object.keys(bal).forEach(function (m) { var v = Math.round(bal[m]); if (v > 0) cr.push([m, v]); else if (v < 0) db.push([m, -v]); });
    cr.sort(function (a, b) { return b[1] - a[1]; }); db.sort(function (a, b) { return b[1] - a[1]; });
    var tr = [], i = 0, j = 0;
    while (i < cr.length && j < db.length) {
      var x = Math.min(cr[i][1], db[j][1]); tr.push({ from: db[j][0], to: cr[i][0], amt: x });
      cr[i][1] -= x; db[j][1] -= x; if (!cr[i][1]) i++; if (!db[j][1]) j++;
    }
    return { bal: bal, transfers: tr };
  }

  /* ---------- 加解密 ---------- */
  function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function decryptTrip(enc, pass) {
    var subtle = (root.crypto || {}).subtle; if (!subtle) return Promise.reject(new Error('此瀏覽器不支援解密（需要 https）'));
    var te = new TextEncoder();
    return subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (key) {
      return subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  var API = { esc: esc, nowIn: nowIn, sunInfo: sunInfo, groups: groups, todayIdx: todayIdx, pageHtml: pageHtml, dayPanel: dayPanel, dayItems: dayItems,
    headerHtml: headerHtml, parseRoute: parseRoute, settle: settle, decryptTrip: decryptTrip, hotelsFor: hotelsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.TripLib = API;
  if (typeof document === 'undefined' || !document.getElementById('app')) return;

  /* =====================================================================
   * 以下是瀏覽器端：儲存、天氣、匯率、分帳、事件
   * ===================================================================== */
  var T = null, PFX = 'trip:' + location.pathname + ':';
  function ls(k, v) {
    try { if (v === undefined) { var r = localStorage.getItem(PFX + k); return r ? JSON.parse(r) : null; } localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { return null; }
  }
  var ctx = { today: -1, day: 0, wx: null, wxAt: 0, checks: {}, fold: {} }, curSec = 'home';

  function boot() {
    var app = document.getElementById('app');
    if (!root.TRIP && root.TRIP_ENC) {
      var saved = ls('pass');
      var gate = function (msg) {
        app.innerHTML = '<div class="gate">' + decoRidge() + '<div class="gin"><div class="gey">Private Trip</div><h1 class="ttl serif">' + esc(document.title) + '</h1>' +
          '<p class="gsub">這份行程只開放給同行的朋友，請輸入密碼查看。</p>' +
          '<label class="gl" for="pw">密碼</label><input type="password" id="pw" autocomplete="current-password" placeholder="輸入密碼">' +
          '<label class="grm"><input type="checkbox" id="rm" checked> 記住這台裝置，下次不用再輸入</label><div class="err" id="er">' + esc(msg || '') + '</div>' +
          '<button class="btn pri" id="go">解鎖</button><p class="ghint">有收到分享連結的話，直接點連結就能開啟。</p></div></div>';
        var go = function () {
          var p = document.getElementById('pw').value; if (!p) return;
          tryPass(p, document.getElementById('rm').checked);
        };
        document.getElementById('go').onclick = go;
        document.getElementById('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      };
      var tryPass = function (p, remember) {
        decryptTrip(root.TRIP_ENC, p).then(function (t) { if (remember) ls('pass', p); start(t); }, function () { ls('pass', null); gate('密碼不正確'); });
      };
      /* 免密碼連結：網址 #k=<密碼> 自動解鎖，並立刻從網址列移除密碼 */
      var mk = /^#k=(.+)$/.exec(location.hash), key = null;
      if (mk) {
        try { key = decodeURIComponent(mk[1]); } catch (e) { key = mk[1]; }
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
      }
      if (key) decryptTrip(root.TRIP_ENC, key).then(function (t) { ls('pass', key); start(t); }, function () { gate('連結中的密碼不正確，請手動輸入'); });
      else if (saved) tryPass(saved, true); else gate('');
    } else if (root.TRIP) start(root.TRIP);
    else app.innerHTML = '<div class="empty">找不到行程資料（js/data.js）</div>';
  }

  function start(t) {
    T = t; document.title = T.title;
    ctx.today = todayIdx(T); ctx.checks = ls('checks') || {}; ctx.fold = ls('fold') || {};
    ctx.day = ctx.today >= 0 ? ctx.today : 0;
    var c = ls('wx'); if (c && c.sig === T.start + '|' + T.days.length) { ctx.wx = c.data; ctx.wxAt = c.at; }
    bind(); render(true); go(location.hash || (ctx.today >= 0 ? '#/day/' + (ctx.today + 1) : ''));
    root.addEventListener('hashchange', function () { go(location.hash); });
    root.addEventListener('scroll', spy, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { ctx.today = todayIdx(T); render(false); loadWx(false); } });
    setInterval(tickClock, 20000);
    loadWx(false);
  }
  /* 依網址捲到對應段落（舊的 #/day/n、#/prep、#/area/<id> 也能用） */
  function go(hash) {
    var r = parseRoute(hash);
    if (r.k === 'day' && T.days[r.n - 1]) { pickDay(r.n - 1); scrollToSec('days'); }
    else if (r.k === 'area') { for (var i = 0; i < T.days.length; i++) if (T.days[i].area === r.id) { pickDay(i); break; } scrollToSec('days'); }
    else if (r.k === 'prep') scrollToSec('notes');
  }
  function hdH() { return document.getElementById('hd').offsetHeight; }
  function scrollToSec(id) {
    var el = document.getElementById('s-' + id); if (!el) return;
    root.scrollTo({ top: id === 'home' ? 0 : el.getBoundingClientRect().top + root.scrollY - hdH() + 1, behavior: 'smooth' });
  }
  function pickDay(i) {
    ctx.day = i;
    document.getElementById('dayp').innerHTML = dayPanel(T, i, ctx);
    var st = document.getElementById('strip');
    st.querySelectorAll('.sp').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-day') === i); });
    var on = st.querySelector('.on'); if (on) st.scrollTo({ left: on.offsetLeft - st.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' });
    try { history.replaceState(null, '', '#/day/' + (i + 1)); } catch (e) { }
  }
  /* 捲動時標示目前段落 */
  function spy() {
    var y = hdH() + 8, cur = 'home';
    SECS.forEach(function (s) { var el = document.getElementById('s-' + s[0]); if (el && el.getBoundingClientRect().top <= y) cur = s[0]; });
    if (root.innerHeight + root.scrollY >= document.documentElement.scrollHeight - 2) cur = SECS[SECS.length - 1][0];
    if (cur === curSec) return; curSec = cur;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === cur); });
  }

  function render(toTop) {
    var y = root.scrollY;
    document.getElementById('hd').innerHTML = headerHtml(T, curSec);
    document.getElementById('app').innerHTML = pageHtml(T, ctx);
    var sp = document.querySelector('#strip .on'); if (sp) { var st = sp.parentNode; st.scrollLeft = sp.offsetLeft - st.clientWidth / 2 + sp.offsetWidth / 2; }
    root.scrollTo(0, toTop ? 0 : y);
  }
  function tickClock() {
    var h = document.querySelector('[data-clk=home]'), d = document.querySelector('[data-clk=dest]');
    if (h) h.textContent = nowIn(T.homeTz || 'Asia/Taipei').time; if (d) d.textContent = nowIn(T.tz).time;
    var n = document.getElementById('nx'); if (n && ctx.today >= 0) n.innerHTML = nextHtml(T, ctx);
  }
  /* 跳到某天時間軸上的某一列，並短暫標示 */
  function jumpTo(d, k) {
    pickDay(d);
    var el = document.querySelector('#dayp .it[data-k="' + k + '"]'); if (!el) { scrollToSec('days'); return; }
    root.scrollTo({ top: el.getBoundingClientRect().top + root.scrollY - hdH() - 16, behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  /* 天氣：16 天內用預報；更遠用「去年同日」；已過去用實際資料。需要網路，失敗就不顯示。 */
  function loadWx(force) {
    if (!force && ctx.wxAt && Date.now() - ctx.wxAt < 30 * 60000) return Promise.resolve();
    var today = nowIn(T.tz).date, jobs = [], res = {};
    (T.areas || []).forEach(function (a) {
      var fc = [], hi = [], ac = [];
      T.days.forEach(function (d, i) {
        if (d.area !== a.id) return;
        var ds = ymd(dayDate(T, i)), diff = Math.round((parse(ds) - parse(today)) / 864e5);
        if (diff >= -3 && diff <= 15) fc.push([i, ds]);
        else if (diff > 15) { var p = parse(ds); p.setFullYear(p.getFullYear() - 1); hi.push([i, ymd(p)]); }
        else ac.push([i, ds]);
      });
      var q = function (list, base, daily, src) {
        if (!list.length) return;
        var ds = list.map(function (x) { return x[1]; }).sort();
        var url = base + '?latitude=' + a.geo[0] + '&longitude=' + a.geo[1] + '&daily=' + daily + '&timezone=' + encodeURIComponent(T.tz) + '&start_date=' + ds[0] + '&end_date=' + ds[ds.length - 1];
        jobs.push(fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
          var D = j.daily; if (!D || !D.time) return;
          list.forEach(function (x) {
            var k = D.time.indexOf(x[1]); if (k < 0 || D.temperature_2m_max[k] == null) return;
            res[x[0]] = { code: D.weather_code[k], hi: D.temperature_2m_max[k], lo: D.temperature_2m_min[k], pp: D.precipitation_probability_max ? D.precipitation_probability_max[k] : null, sn: D.snowfall_sum ? D.snowfall_sum[k] : 0, src: src };
          });
        }).catch(function () { }));
      };
      var F = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum', H = 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum';
      q(fc, 'https://api.open-meteo.com/v1/forecast', F, 'f');
      q(hi, 'https://archive-api.open-meteo.com/v1/archive', H, 'h');
      q(ac, 'https://archive-api.open-meteo.com/v1/archive', H, 'a');
    });
    if (typeof fetch !== 'function') return Promise.resolve();
    return Promise.all(jobs).then(function () {
      if (!Object.keys(res).length) return;
      ctx.wx = res; ctx.wxAt = Date.now(); ls('wx', { sig: T.start + '|' + T.days.length, at: ctx.wxAt, data: res });
      render(false);
    });
  }

  /* ---------- modal ---------- */
  var downOnMask = false;
  function openModal(html) { var m = document.getElementById('mask'); m.querySelector('.sheet').innerHTML = html; m.classList.add('show'); }
  function closeModal() { document.getElementById('mask').classList.remove('show'); }

  function fxModal() {
    openModal('<h3>匯率換算（日圓 ⇄ 台幣）<button data-close>✕</button></h3><div id="fxb" class="muted">讀取中…</div>');
    var show = function (rate, at) {
      document.getElementById('fxb').innerHTML = '<div>1 日圓 ≈ <b>' + rate.toFixed(4) + '</b> 台幣</div><div class="muted">匯率更新：' + esc(at) + '（僅供參考，實際以刷卡／換匯為準）</div>' +
        '<label>日圓 JPY</label><input type="number" id="jpy" inputmode="decimal" placeholder="例如 1000"><label>台幣 TWD</label><input type="number" id="twd" inputmode="decimal">';
      var j = document.getElementById('jpy'), t = document.getElementById('twd');
      j.oninput = function () { t.value = j.value === '' ? '' : (j.value * rate).toFixed(0); };
      t.oninput = function () { j.value = t.value === '' ? '' : (t.value / rate).toFixed(0); };
    };
    var c = ls('fx');
    if (c && Date.now() - c.at < 6 * 3600e3) { show(c.rate, c.when); return; }
    fetch('https://open.er-api.com/v6/latest/JPY').then(function (r) { return r.json(); }).then(function (j) {
      var rate = j.rates && j.rates.TWD; if (!rate) throw 0;
      var when = (j.time_last_update_utc || '').slice(0, 16); ls('fx', { rate: rate, when: when, at: Date.now() }); show(rate, when);
    }).catch(function () {
      if (c) show(c.rate, c.when + '（離線舊資料）'); else document.getElementById('fxb').textContent = '目前無法取得匯率，請稍後再試。';
    });
  }

  function members() {
    var m = ls('members'); if (m) return m;
    return (T.people || []).slice();
  }
  function splitModal() {
    var mem = members(), ex = ls('expenses') || [];
    var money = function (n) { return '¥' + Math.round(n).toLocaleString(); };
    var h = '<h3>分帳（日圓）<button data-close>✕</button></h3><div class="muted">資料只存在這台裝置的瀏覽器，不會上傳。</div>';
    h += '<label>成員</label><div class="chips">' + mem.map(function (m, i) { return '<span class="chip">' + esc(m) + '<button data-rmm="' + i + '">✕</button></span>'; }).join('') + '</div>' +
      '<div class="row"><input type="text" id="nm" placeholder="新增成員名稱"><button class="btn sm" data-addm style="flex:none">新增</button></div>';
    if (mem.length >= 2) {
      h += '<label>新增一筆支出</label><input type="text" id="et" placeholder="品項，例如：晚餐"><div class="row"><input type="number" id="ea" inputmode="decimal" placeholder="金額（日圓）"><select id="ep">' +
        mem.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div><div class="muted" style="margin-top:6px">分攤者</div><div class="cks">' +
        mem.map(function (m, i) { return '<label style="margin:0"><input type="checkbox" data-sh="' + i + '" checked> ' + esc(m) + '</label>'; }).join('') + '</div><button class="btn pri" data-addx style="margin-top:10px">加入支出</button>';
      h += '<div class="sec-t"><b>支出紀錄</b></div>' + (ex.length ? ex.map(function (e, i) {
        return '<div class="ex"><div>' + esc(e.title) + '<small>' + esc(e.payer) + ' 付・' + (e.shares || []).length + ' 人分攤</small></div><div>' + money(e.amount) + ' <button data-rmx="' + i + '">🗑️</button></div></div>';
      }).join('') : '<div class="muted">尚無支出</div>');
      var r = settle(mem, ex);
      h += '<div class="sec-t"><b>結算</b></div>' + mem.map(function (m) { var v = Math.round(r.bal[m]); return '<div class="bal"><span>' + esc(m) + '</span><span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '應收 ' : '應付 ') + money(Math.abs(v)) + '</span></div>'; }).join('');
      h += r.transfers.length ? '<div class="muted" style="margin-top:6px">建議轉帳：</div>' + r.transfers.map(function (t) { return '<div class="bal"><span>' + esc(t.from) + ' → ' + esc(t.to) + '</span><b>' + money(t.amt) + '</b></div>'; }).join('') : '<div class="muted">目前不需要轉帳</div>';
    } else h += '<p class="muted">至少需要 2 位成員才能分帳。也可以直接在 data.js 的 people 填寫名單。</p>';
    openModal(h);
  }
  function splitAction(el) {
    var mem = members(), ex = ls('expenses') || [];
    if (el.hasAttribute('data-addm')) { var v = document.getElementById('nm').value.trim(); if (v && mem.indexOf(v) < 0) { mem.push(v); ls('members', mem); } splitModal(); }
    else if (el.hasAttribute('data-rmm')) { mem.splice(+el.getAttribute('data-rmm'), 1); ls('members', mem); splitModal(); }
    else if (el.hasAttribute('data-addx')) {
      var amt = parseFloat(document.getElementById('ea').value), title = document.getElementById('et').value.trim() || '支出';
      var sh = []; document.querySelectorAll('[data-sh]').forEach(function (c) { if (c.checked) sh.push(mem[+c.getAttribute('data-sh')]); });
      if (!(amt > 0) || !sh.length) return;
      ex.push({ title: title, amount: amt, payer: document.getElementById('ep').value, shares: sh }); ls('expenses', ex); splitModal();
    } else if (el.hasAttribute('data-rmx')) { ex.splice(+el.getAttribute('data-rmx'), 1); ls('expenses', ex); splitModal(); }
  }

  function bind() {
    var m = document.getElementById('mask');
    m.addEventListener('pointerdown', function (e) { downOnMask = e.target.id === 'mask'; });
    m.addEventListener('click', function (e) {
      if (e.target.id === 'mask' && downOnMask) { closeModal(); downOnMask = false; return; }
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-close')) closeModal(); else splitAction(b);
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#mask')) return;
      var b = e.target.closest('[data-act],[data-go],[data-day],[data-jump]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'fx') fxModal(); else if (a === 'split') splitModal();
      else if (b.hasAttribute('data-go')) scrollToSec(b.getAttribute('data-go'));
      else if (b.hasAttribute('data-jump')) { var j = b.getAttribute('data-jump').split(':'); jumpTo(+j[0], +j[1]); }
      else if (b.hasAttribute('data-day')) {
        var inPanel = b.closest('#s-days');
        pickDay(+b.getAttribute('data-day'));
        if (!inPanel || b.closest('.pn')) scrollToSec('days');
      }
    });
    document.getElementById('app').addEventListener('toggle', function (e) {
      var d = e.target; if (!d.getAttribute || !d.getAttribute('data-fold')) return;
      ctx.fold[d.getAttribute('data-fold')] = !d.open; ls('fold', ctx.fold);
    }, true);
    document.getElementById('app').addEventListener('change', function (e) {
      var c = e.target.closest('[data-ck]'); if (!c) return;
      ctx.checks[c.getAttribute('data-ck')] = c.checked; ls('checks', ctx.checks); render(false);
    });
  }

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
