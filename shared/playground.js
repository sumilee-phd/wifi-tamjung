// 전파 놀이터: 공유기(AP)와 장애물을 놓으면 모형 신호세기 지도가 바뀐다.
// 모형 = 자유공간 감쇠 20·log10(거리) + 지나간 장애물의 감쇠(dB). 원리 설명용이며 실측값이 아니다.
// 사용: WTPlayground.mount(canvas, { readout: el, onMode: fn })  → { setMode, preset, clear }
(function (root) {
  var ATT = { wall: 8, water: 12, people: 6, foil: 25 };
  var NAMES = { wall: "서가(벽)", water: "물통", people: "사람(인체)", foil: "알루미늄 호일" };
  var ICON = { wall: "▦", water: "◍", people: "●", foil: "◈" };

  function mount(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext("2d");
    var W = 24, H = 14, cw = cv.width / W, ch = cv.height / H;
    var grid, ap = { x: 2, y: 2 }, mode = "ap", drag = false;

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
          ctx.fillStyle = "rgba(20,30,35,.55)"; ctx.fillRect(x * cw, y * ch, cw, ch);
          ctx.fillStyle = "#fff"; ctx.font = "bold " + (ch * .6) + "px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(ICON[grid[y][x]], x * cw + cw / 2, y * ch + ch / 2 + 1);
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
      preset: function () { preset(); draw(); },
      clear: function () { reset(); draw(); },
      redraw: draw
    };
  }

  root.WTPlayground = { mount: mount, ATT: ATT, NAMES: NAMES };
})(typeof window !== "undefined" ? window : this);
