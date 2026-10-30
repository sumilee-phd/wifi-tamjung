// 전파 놀이터: 공유기(AP)와 장애물을 놓으면 모형 신호세기 지도가 바뀐다.
// 모형 = 자유공간 감쇠 20·log10(거리) + 지나간 장애물의 감쇠(dB). 원리 설명용이며 실측값이 아니다.
// 사용: WTPlayground.mount(canvas, { readout: el, onMode: fn })  → { setMode, preset, clear }
//       WTPlayground.icon(mode) → 도구 버튼에 넣을 아이콘 마크업(지도에 그리는 모양과 같은 경로)
(function (root) {
  var ATT = { wall: 8, water: 12, people: 6, foil: 25 };
  var NAMES = { wall: "서가(벽)", water: "물통", people: "사람(인체)", foil: "알루미늄 호일" };
  // 24×24 SVG 경로. 글꼴 기호(◍·●)는 작게 그리면 물통과 사람이 똑같이 보여서 모양을 직접 그린다.
  var ICON_D = {
    wall: "M2 4h9v4H2zM13 4h9v4h-9zM2 10h4v4H2zM8 10h8v4H8zM18 10h4v4h-4zM2 16h9v4H2zM13 16h9v4h-9z",
    water: "M12 2c3.6 4.7 6.8 8.6 6.8 12.4a6.8 6.8 0 0 1-13.6 0C5.2 10.6 8.4 6.7 12 2z",
    people: "M12 2.5a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM4 21.5c0-4.7 3.6-8.5 8-8.5s8 3.8 8 8.5z",
    foil: "M2 3h20v5H2zM4.5 9.5h15V21L17 19.2 14.5 21 12 19.2 9.5 21 7 19.2 4.5 21z",
    erase: "M5.6 4.2L12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z"
  };
  var PATH = {};

  function icon(m) {
    var inner = m === "ap"
      ? '<circle cx="12" cy="12" r="11" fill="#fff"/><text x="12" y="12.8" text-anchor="middle" dominant-baseline="middle" ' +
        'font-family="sans-serif" font-size="9" font-weight="800" fill="#16252B">AP</text>'
      : '<path d="' + ICON_D[m] + '"/>';
    return '<span class="tic tic-' + m + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + inner + "</svg></span>";
  }

  function mount(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext("2d");
    var W = 24, H = 14, cw = cv.width / W, ch = cv.height / H;
    var grid, ap = { x: 2, y: 2 }, mode = "ap", drag = false;
    var hint = opts.readout ? opts.readout.textContent : "";  // 예시·지우기 뒤에는 이전 칸의 숫자 대신 처음 안내로

    function reset() { grid = []; for (var y = 0; y < H; y++) grid.push(new Array(W).fill(null)); }
    function preset() {
      reset(); ap = { x: 2, y: 2 };
      for (var y = 4; y < 11; y++) { grid[y][7] = "wall"; grid[y][14] = "wall"; }
      for (var x = 10; x < 14; x++) grid[1][x] = "people";
      grid[6][19] = "water"; grid[7][19] = "water"; grid[12][21] = "foil";
    }
    function rssi(x, y) {
      var dx = x - ap.x, dy = y - ap.y, dist = Math.max(0.5, Math.hypot(dx, dy));
      var v = -30 - 20 * Math.log10(dist), n = Math.ceil(dist * 2), seen = {};
      for (var i = 1; i <= n; i++) {
        var gx = Math.round(ap.x + dx * i / n), gy = Math.round(ap.y + dy * i / n), k = gy * W + gx;
        if (!seen[k] && grid[gy] && grid[gy][gx]) { seen[k] = 1; v -= ATT[grid[gy][gx]]; }
      }
      return Math.max(-100, Math.round(v));
    }
    function draw() {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        ctx.fillStyle = root.WTSignal.level(rssi(x, y)).color;
        ctx.fillRect(x * cw, y * ch, cw, ch);
        if (grid[y][x]) {
          var k = grid[y][x];
          ctx.fillStyle = "rgba(20,30,35,.55)"; ctx.fillRect(x * cw, y * ch, cw, ch);
          ctx.save(); ctx.translate(x * cw + cw * .16, y * ch + ch * .16); ctx.scale(cw * .68 / 24, ch * .68 / 24);
          ctx.fillStyle = "#fff"; ctx.fill(PATH[k] || (PATH[k] = new Path2D(ICON_D[k]))); ctx.restore();
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
      for (var gx = 0; gx <= W; gx++) { ctx.beginPath(); ctx.moveTo(gx * cw, 0); ctx.lineTo(gx * cw, cv.height); ctx.stroke(); }
      for (var gy = 0; gy <= H; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * ch); ctx.lineTo(cv.width, gy * ch); ctx.stroke(); }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ap.x * cw + cw / 2, ap.y * ch + ch / 2, cw * .45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#16252B"; ctx.font = "bold " + (ch * .5) + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("AP", ap.x * cw + cw / 2, ap.y * ch + ch / 2 + 1);
    }
    function cell(e) {
      var r = cv.getBoundingClientRect();
      return { x: Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))),
               y: Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / r.height * H))) };
    }
    function put(c) {
      if (mode === "ap") { ap = c; grid[c.y][c.x] = null; }
      else if (mode === "erase") grid[c.y][c.x] = null;
      else if (!(c.x === ap.x && c.y === ap.y)) grid[c.y][c.x] = mode;
      draw();
    }
    function show(c) {
      if (!opts.readout) return;
      var v = rssi(c.x, c.y), lv = root.WTSignal.level(v);
      opts.readout.textContent = root.WTSignal.barsText(lv.bars) + "  " + lv.word + "\n" + v + " dBm · 거리 " +
        Math.hypot(c.x - ap.x, c.y - ap.y).toFixed(1) + " m" + (grid[c.y][c.x] ? "\n장애물: " + NAMES[grid[c.y][c.x]] : "");
    }
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", function (e) { drag = true; var c = cell(e); put(c); show(c); });
    cv.addEventListener("pointermove", function (e) { var c = cell(e); if (drag && mode !== "ap") put(c); show(c); });
    window.addEventListener("pointerup", function () { drag = false; });

    preset(); draw();
    return {
      setMode: function (m) { mode = m; if (opts.onMode) opts.onMode(m); },
      preset: function () { preset(); draw(); if (opts.readout) opts.readout.textContent = hint; },
      clear: function () { reset(); draw(); if (opts.readout) opts.readout.textContent = hint; },
      redraw: draw
    };
  }

  root.WTPlayground = { mount: mount, icon: icon, ATT: ATT, NAMES: NAMES };
})(typeof window !== "undefined" ? window : this);
