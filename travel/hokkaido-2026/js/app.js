/* 旅遊手冊主程式：讀取 window.TRIP（js/data.js）或解密 window.TRIP_ENC（js/data.enc.js）後渲染。
 * 路由（hash）：#/ 總覽　#/prep 行前準備　#/area/<id> 區域　#/day/<n> 單日 */
(function (root) {
  'use strict';

  var CAT = {
    sight: { n: '景點', c: '#3d86c6' }, food: { n: '餐飲', c: '#d9772b' }, shop: { n: '購物', c: '#2f9488' }, stay: { n: '住宿', c: '#6f5fb0' },
    move: { n: '交通', c: '#8a94a3' }, other: { n: '其他', c: '#64748b' }
  };
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
  function dayColor(T, i) { var a = areaOf(T, i); return a ? a.color : GREY; }
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
  function decoRidge() {
    return '<svg class="deco" viewBox="0 0 390 150" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#f7f9fb"/></linearGradient></defs>' +
      '<path d="M0 110 L55 62 L88 88 L140 28 L190 84 L232 52 L290 100 L335 44 L390 96 L390 150 L0 150Z" fill="url(#rg)"/>' +
      '<path d="M140 28 L124 49 L136 45 L146 53 L158 44Z M335 44 L322 62 L332 58 L342 65 L352 56Z M55 62 L44 76 L54 72 L62 78Z" fill="#fff"/>' +
      '<path d="M0 110 L55 62 L88 88 L140 28 L190 84 L232 52 L290 100 L335 44 L390 96" fill="none" stroke="#6fa8d6" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  function decoDots() {
    var o = '';
    for (var i = 0; i < 46; i++) {
      var r = 1.2 + rnd(i + 9) * 3.6;
      o += '<circle cx="' + (rnd(i + 1) * 390).toFixed(1) + '" cy="' + (rnd(i + 77) * 140).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + (r > 3 ? '#9cc3e6' : '#bcd6ee') + '" opacity="' + (0.45 + rnd(i + 5) * 0.5).toFixed(2) + '"/>';
    }
    return '<svg class="deco" viewBox="0 0 390 150" preserveAspectRatio="xMidYMin slice" aria-hidden="true">' + o + '</svg>';
  }
  function summaryOf(d) {
    if (d.summary) return d.summary;
    var a = sorted((d.items || []).filter(function (x) { return x.cat !== 'move' && x.cat !== 'stay'; })).slice(0, 4).map(function (x) { return x.title; });
    return a.join('、');
  }
  function hasFlight(d) { return (d.items || []).some(function (x) { return /航班|機場|flight/i.test(x.title); }); }
  function wxCell(w) {
    if (!w) return '';
    return '<div class="wx">' + wmo(w.code) + ' ' + Math.round(w.lo) + '°–' + Math.round(w.hi) + '°<small>' + wxLabel(w.src) + '</small></div>';
  }

  function ticket(T, i, ctx) {
    var d = T.days[i], dt = dayDate(T, i), a = areaOf(T, i), isToday = ctx.today === i, p = pendingByDay(T, i);
    return '<a class="tk' + (isToday ? ' today' : '') + '" style="--c:' + tint(a && a.color) + '" href="#/day/' + (i + 1) + '">' +
      '<div class="st"><small>DAY</small><b>' + (i + 1) + '</b><small>' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</small></div>' +
      '<div class="bd">' + wxCell(ctx.wx && ctx.wx[i]) + '<div class="ar">' + esc(a ? a.name : '') + (isToday ? '<em>TODAY</em>' : '') + '</div>' +
      '<div class="tt serif">' + esc(d.title || '') + '</div><div class="ds">' + esc(summaryOf(d)) + '</div>' +
      (p.length ? '<div class="wn">待確認 ' + p.length + ' 項</div>' : '') + (hasFlight(d) ? '<div class="bc"></div>' : '') + '</div></a>';
  }

  function pendingBox(T) {
    return (T.pending || []).map(function (p) {
      return '<div class="pd"><b>' + esc(p.title) + '</b>' + (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') +
        (p.day && T.days[p.day - 1] ? '<a href="#/day/' + p.day + '">前往 Day' + p.day + ' →</a>' : '') + '</div>';
    }).join('');
  }

  function viewHome(T, ctx) {
    var t = nowIn(T.tz).date, diff = Math.round((parse(T.start) - parse(t)) / 864e5);
    var names = (T.areas || []).map(function (a) { return a.name; }).join('、');
    var h = decoRidge() + '<div class="pgtop"></div><h1 class="ttl serif">' + esc(T.title) + '</h1><div class="sub">' + T.days.length + ' 天　' + esc(names) + '</div>';
    h += '<div class="clk" id="clk">' + clockHtml(T) + '</div>';
    if (diff > 0) h += '<div class="cd">距離出發還有 <b>' + diff + '</b> 天</div>';
    if ((T.pending || []).length) h += '<div class="sec">待確認事項 ・ ' + T.pending.length + '</div>' + pendingBox(T);
    h += '<div class="sec">Itinerary<span>' + wxStamp(ctx) + '</span></div>';
    T.days.forEach(function (d, i) { h += ticket(T, i, ctx); });
    return h;
  }

  function hotelsFor(T, dateStr) {
    return (T.hotels || []).filter(function (x) { return x.inn <= dateStr && dateStr < x.out; });
  }
  function nightsOf(x) { return Math.round((parse(x.out) - parse(x.inn)) / 864e5); }
  function hotelHtml(x, tag) {
    var q = x.addr || x.name;
    return '<div class="mini"><div class="a"><small>' + nightsOf(x) + ' NIGHTS</small>' + x.inn.slice(5).replace('-', '/') + '<small>→ ' + x.out.slice(5).replace('-', '/') + '</small></div>' +
      '<div class="b"><b>' + esc(x.name) + '</b>' + (tag ? '<span class="tg">' + tag + '</span>' : '') +
      (x.addr ? '<div>' + esc(x.addr) + '</div>' : '') + (x.conf ? '<div>訂房編號　' + esc(x.conf) + '</div>' : '') +
      (x.phone ? '<div>' + esc(x.phone) + '</div>' : '') + (x.cost ? '<div>' + esc(x.cost) + '</div>' : '') + (x.note ? '<div>' + esc(x.note) + '</div>' : '') +
      '<div class="lks"><a target="_blank" rel="noopener" href="' + mapUrl(q) + '">Map ↗</a></div></div></div>';
  }

  function pageTop(kind, title, sub) {
    return decoDots() + '<div class="pgtop s"></div><h1 class="ttl serif">' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '');
  }

  function viewPrep(T, ctx) {
    var ck = ctx.checks || {}, h = pageTop('prep', '行前準備', '勾選記錄只存在這台裝置');
    h += '<div class="sec">Checklist<span>' + prepProgress(T, ck) + '</span></div>';
    (T.prep || []).forEach(function (x, i) {
      h += '<label class="ck' + (ck[i] ? ' done' : '') + '"><input type="checkbox" data-ck="' + i + '"' + (ck[i] ? ' checked' : '') + '><span>' + esc(x) + '</span></label>';
    });
    if (!(T.prep || []).length) h += '<div class="muted">尚無項目（在 data.js 的 prep 新增）</div>';
    h += '<div class="sec">Stay</div>';
    var hs = (T.hotels || []).slice().sort(function (a, b) { return a.inn < b.inn ? -1 : 1; });
    h += hs.length ? hs.map(function (x) { return hotelHtml(x, ''); }).join('') : '<div class="muted">尚未填寫（在 data.js 的 hotels 新增）</div>';
    h += '<div class="sec">注意事項</div><ul class="ul">' + (T.cautions || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if ((T.shops || []).length) {
      h += '<div class="sec">購物地點營業時間</div>' + T.shops.map(function (s) {
        return '<div class="shop"><div>' + esc(s[0]) + '<small>' + esc(s[1]) + (s[2] ? '・' + esc(s[2]) : '') + '</small></div><a href="' + mapUrl(s[0] + ' 札幌') + '" target="_blank" rel="noopener">Map ↗</a></div>';
      }).join('');
    }
    return h;
  }
  function prepProgress(T, ck) {
    var n = 0; (T.prep || []).forEach(function (x, i) { if (ck[i]) n++; });
    return (T.prep || []).length ? n + '/' + T.prep.length : '';
  }

  function viewArea(T, id, ctx) {
    var a = areaById(T, id); if (!a) return '<div class="empty">找不到這個區域</div>';
    var h = pageTop('area', '<i class="dot" style="background:' + a.color + '"></i>' + esc(a.name), '');
    h += '<div class="sec">Days<span>' + wxStamp(ctx) + '</span></div>';
    T.days.forEach(function (d, i) { if (d.area === id) h += ticket(T, i, ctx); });
    var pool = (T.pool || {})[a.pool];
    if (pool) {
      ['t', 'p', 'f', 'b'].forEach(function (k) {
        var arr = pool[k]; if (!arr || !arr.length) return;
        h += '<div class="sec">' + POOLCAT[k] + '</div>';
        arr.forEach(function (e) {
          var q = e[0] + ' ' + a.pool;
          h += '<div class="pl"><div class="tt serif">' + esc(e[0]) + '</div>' + (e[1] ? '<div class="ds">' + esc(e[1]) + '</div>' : '') +
            (k === 't' ? '' : '<div class="lks"><a target="_blank" rel="noopener" href="' + mapUrl(q) + '">Map ↗</a></div>') + '</div>';
        });
      });
    }
    h += '<div class="sec">Other areas</div><div class="sw">' + (T.areas || []).filter(function (x) { return x.id !== id; }).map(function (x) {
      return '<a style="--c:' + x.color + '" href="#/area/' + x.id + '">' + esc(x.name) + '</a>';
    }).join('') + '</div>';
    return h;
  }

  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function viewDay(T, n, ctx) {
    var i = n - 1, d = T.days[i]; if (!d) return '<div class="empty">找不到這一天</div>';
    var dt = dayDate(T, i), a = areaOf(T, i), ds = ymd(dt), isToday = ctx.today === i;
    var h = decoDots() + '<div class="strip" id="strip">' + T.days.map(function (x, j) {
      var dj = dayDate(T, j);
      return '<a class="sp' + (j === i ? ' on' : '') + '" style="--dc:' + dayColor(T, j) + '" href="#/day/' + (j + 1) + '"><b>' + (dj.getMonth() + 1) + '/' + dj.getDate() + '</b><small>D' + (j + 1) + '</small></a>';
    }).join('') + '</div>';
    var s = sunInfo(T, i), w = ctx.wx && ctx.wx[i];
    h += '<div class="big serif">' + pad(dt.getDate()) + '<small>' + MON[dt.getMonth()] + '</small></div>' +
      '<h1 class="ttl serif sm">' + esc(d.title || (a && a.name) || '') + '</h1>' +
      '<div class="meta">Day ' + (i + 1) + ' / ' + T.days.length + '　' + wd(dt).replace('星期', '週') + (isToday ? '　<b class="tdy">TODAY</b>' : '') +
      (w ? '　' + wmo(w.code) + ' ' + Math.round(w.lo) + '°–' + Math.round(w.hi) + '°' + (w.pp != null ? '　降雨 ' + w.pp + '%' : '') + (w.sn > 0 ? '　降雪 ' + w.sn + ' cm' : '') + '<small>（' + wxLabel(w.src) + '）</small>' : '') +
      (s ? '<br>日出 ' + s.rise + '　日落 ' + s.set + (s.dark ? '　天色全暗約 ' + s.dark : '') : '') + '</div>';
    h += '<div class="clk" id="clk">' + clockHtml(T, a) + '</div>';
    var p = pendingByDay(T, i);
    if (p.length) h += p.map(function (x) { return '<div class="pd"><b>待確認</b><p>' + esc(x.title) + '</p></div>'; }).join('');
    if ((d.reminders || []).length) h += '<div class="rem">' + d.reminders.map(function (x) { return esc(x); }).join('<br>') + '</div>';
    if ((d.notes || []).length) h += '<div class="rem alt"><b>備案</b>' + d.notes.map(function (x) { return esc(x); }).join('<br>') + '</div>';

    var items = sorted(d.items || []), nowT = nowIn(T.tz).time, nowId = -1, sunDone = false, cats = {}, hasCand = false;
    items.forEach(function (x) { if (x.cat !== 'move') cats[x.cat || 'other'] = 1; if (x.status === 'candidate' && x.cat !== 'move') hasCand = true; });
    if (isToday) items.forEach(function (x, k) { if (x.time && x.time <= nowT && (!x.end || nowT < x.end)) nowId = k; });
    var legend = Object.keys(cats).map(function (k) { var c = CAT[k] || CAT.other; return '<span style="--k:' + c.c + '"><i></i>' + c.n + '</span>'; }).join('') + (hasCand ? '<span class="lc">◯ 候選／待確認</span>' : '');
    if (legend) h += '<div class="leg">' + legend + '</div>';
    items.forEach(function (x, k) {
      if (s && !sunDone && x.time && x.time > s.set) { h += '<div class="sun">日落 ' + s.set + (s.dark ? ' ・ 天色全暗約 ' + s.dark : '') + '</div>'; sunDone = true; }
      var c = CAT[x.cat] || CAT.other, mv = x.cat === 'move', q = x.place;
      var dupNote = mv && x.time && x.note && x.note.replace(/\b0/g, '') === (x.time + ' – ' + (x.end || '')).replace(/\b0/g, '');
      h += '<div class="it' + (mv ? ' mv' : '') + (k === nowId ? ' now' : '') + '" style="--k:' + c.c + '"><div class="tm">' + esc(x.time || '全天') + (x.end ? '<small>' + esc(x.end) + '</small>' : '') + '</div><div>' +
        (mv ? '' : '<div class="tag">' + c.n + (x.status === 'candidate' ? '<span class="cand">候選方案</span>' : '') + '</div>') +
        '<div class="tt serif">' + esc(x.title) + '</div>' +
        (x.note && !dupNote ? '<div class="ds">' + esc(x.note) + '</div>' : '') + (x.cost ? '<div class="ds">' + esc(x.cost) + '</div>' : '') +
        (q ? '<div class="lks"><a target="_blank" rel="noopener" href="' + mapUrl(q) + '">Map ↗</a></div>' : '') + '</div></div>';
    });
    if (s && !sunDone && items.length) h += '<div class="sun">日落 ' + s.set + (s.dark ? ' ・ 天色全暗約 ' + s.dark : '') + '</div>';
    if (!items.length) h += '<div class="empty">這天還沒有行程</div>';

    var hs = hotelsFor(T, ds), nx = ymd(addDays(T.start, i + 1));
    if (hs.length) h += '<div class="sec">Stay</div>' + hs.map(function (x) { return hotelHtml(x, (x.inn === ds ? '入住' : '續住') + (x.out === nx ? '・明日退房' : '')); }).join('');
    h += '<div class="pn">' + (i > 0 ? '<a href="#/day/' + i + '">← Day ' + i + '</a>' : '<span></span>') +
      (i < T.days.length - 1 ? '<a href="#/day/' + (i + 2) + '">Day ' + (i + 2) + ' →</a>' : '<span></span>') + '</div>';
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

  function headerHtml(T, route) {
    var tabs = [['#/', '總覽', route.k === 'home'], ['#/prep', '行前準備', route.k === 'prep']];
    var curArea = route.k === 'area' ? route.id : route.k === 'day' ? (T.days[route.n - 1] || {}).area : null;
    (T.areas || []).forEach(function (a) { tabs.push(['#/area/' + a.id, a.name, curArea === a.id]); });
    var last = ymd(addDays(T.start, T.days.length - 1));
    return '<div class="hd-in"><div class="hd-top"><div class="cap"><a class="home" href="../">←</a> ' + esc(T.title) + '<span>' + T.start.slice(5).replace('-', '.') + ' – ' + last.slice(5).replace('-', '.') + (T.people && T.people.length ? '・' + T.people.length + '人' : '') + '</span></div>' +
      '<div class="tools"><button class="tool" data-act="refresh">↻ 更新</button><button class="tool" data-act="fx">¥ 匯率</button><button class="tool" data-act="split">$ 分帳</button></div></div>' +
      '<div class="nav" id="tabs">' + tabs.map(function (t) { return '<a class="' + (t[2] ? 'on' : '') + '" href="' + t[0] + '">' + esc(t[1]) + '</a>'; }).join('') + '</div></div>';
  }

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

  var API = { esc: esc, nowIn: nowIn, sunInfo: sunInfo, groups: groups, todayIdx: todayIdx, viewHome: viewHome, viewPrep: viewPrep, viewArea: viewArea, viewDay: viewDay,
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
  var ctx = { today: -1, wx: null, wxAt: 0, checks: {} };

  function boot() {
    var app = document.getElementById('app');
    if (!root.TRIP && root.TRIP_ENC) {
      var saved = ls('pass');
      var gate = function (msg) {
        app.innerHTML = '<div class="gate"><h2>🔒 旅遊手冊</h2><p class="muted">資料已加密，請輸入密碼</p><input type="password" id="pw" autocomplete="current-password" placeholder="密碼"><label class="muted"><input type="checkbox" id="rm" checked> 記住這台裝置</label><div class="err" id="er">' + esc(msg || '') + '</div><button class="btn pri" id="go">解鎖</button></div>';
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
      if (saved) tryPass(saved, true); else gate('');
    } else if (root.TRIP) start(root.TRIP);
    else app.innerHTML = '<div class="empty">找不到行程資料（js/data.js）</div>';
  }

  function start(t) {
    T = t; document.title = T.title;
    ctx.today = todayIdx(T); ctx.checks = ls('checks') || {};
    var c = ls('wx'); if (c && c.sig === T.start + '|' + T.days.length) { ctx.wx = c.data; ctx.wxAt = c.at; }
    if (!location.hash && ctx.today >= 0) location.replace('#/day/' + (ctx.today + 1));
    root.addEventListener('hashchange', function () { render(true); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { ctx.today = todayIdx(T); render(false); } });
    setInterval(tickClock, 20000);
    bind(); render(true); loadWx(false);
  }

  function render(toTop) {
    var route = parseRoute(location.hash), y = root.scrollY;
    document.getElementById('hd').innerHTML = headerHtml(T, route);
    var html = route.k === 'prep' ? viewPrep(T, ctx) : route.k === 'area' ? viewArea(T, route.id, ctx) : route.k === 'day' ? viewDay(T, route.n, ctx) : viewHome(T, ctx);
    document.getElementById('app').innerHTML = html;
    var on = document.querySelector('#tabs .on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    var sp = document.querySelector('#strip .on'); if (sp && sp.scrollIntoView) sp.scrollIntoView({ inline: 'center', block: 'nearest' });
    root.scrollTo(0, toTop ? 0 : y);
  }
  function tickClock() {
    var h = document.querySelector('[data-clk=home]'), d = document.querySelector('[data-clk=dest]');
    if (h) h.textContent = nowIn(T.homeTz || 'Asia/Taipei').time; if (d) d.textContent = nowIn(T.tz).time;
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
    document.getElementById('hd').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'refresh') { b.style.opacity = .5; loadWx(true).then(function () { b.style.opacity = ''; render(false); }, function () { b.style.opacity = ''; }); }
      else if (a === 'fx') fxModal(); else if (a === 'split') splitModal();
    });
    document.getElementById('app').addEventListener('change', function (e) {
      var c = e.target.closest('[data-ck]'); if (!c) return;
      ctx.checks[c.getAttribute('data-ck')] = c.checked; ls('checks', ctx.checks); render(false);
    });
  }

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
