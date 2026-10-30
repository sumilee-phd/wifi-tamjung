// 공개 사이트 실시간 전파지도: 강연 노트북(app/server.py --live)이 ntfy 공개 채널로 올린 구역별 값을 받아 그린다.
// 올라오는 값은 구역별 신호 세기 가운데 값과 표본 수, 방 배치뿐이다. 그리는 방식은 강연 앱 drawRoom과 같다(IDW 보간 + 구역 원).
(function () {
  "use strict";
  // app/config.json live.topic과 같아야 한다. 시험할 때는 주소 뒤에 ?live=시험채널
  var TOPIC = new URLSearchParams(location.search).get("live") || "wifi-tamjung-yanggok-fbd09edb9d";
  var BASE = "https://ntfy.sh/" + TOPIC;
  var FRESH = 240;    // 초. 서버가 변화 없을 때 180초마다 보내므로 이 안에 받은 값이면 '실시간'
  var ZONE_R = 0.95;  // 구역 원 반지름(m). 휴대폰에서도 글자가 읽히게 강연 앱(0.75)보다 크게
  // 값이 오기 전에 빈 지도를 그릴 방 배치 (app/config.json과 같음)
  var ROOM = {
    room: { width_m: 10, depth_m: 14, stage_depth_m: 1.9, rows: 6, row_start_m: 3.2, row_gap_m: 1.8,
            blocks: { L: { w: 1.6, a: 3.6 }, R: { a: 6.4, w: 8.4 } } },
    zones: { ST: ["강단", 5, 1], LW: ["왼쪽 벽", 0.7, 7.8], CT: ["가운데", 5, 7.8], RW: ["오른쪽 벽", 9.3, 7.8], EX: ["비상구 쪽", 5, 12.7] },
    ap: [0.9, 0.8],
    nets: { ap: "우리 공유기(노트북)", lib: "도서관 와이파이", cell: "휴대폰 데이터(LTE·5G)" }
  };

  var S = window.WTSignal, box = document.getElementById("live");
  if (!S || !box) return;
  var cv = document.getElementById("liveMap"), stateEl = document.getElementById("liveState"), ageEl = document.getElementById("liveAge");
  var net = "ap", last = null, lastTime = 0;

  function idw(x, y, pts) {
    var num = 0, den = 0;
    for (var i = 0; i < pts.length; i++) {
      var d2 = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d2 < 1e-4) return pts[i].v;
      var w = 1 / d2; num += w * pts[i].v; den += w;
    }
    return num / den;
  }

  function fitText(ctx, t, x, y, maxW, size) {
    ctx.font = "bold " + size + "px sans-serif";
    while (ctx.measureText(t).width > maxW && size > 11) { size -= 1; ctx.font = "bold " + size + "px sans-serif"; }
    ctx.fillText(t, x, y);
  }

  function draw() {
    var d = last || ROOM, R = d.room, Z = d.zones, ctx = cv.getContext("2d"), sc = cv.width / R.width_m;
    var cells = (last && last.cells[net]) || {}, vals = {}, pts = [], said = [];
    Object.keys(Z).forEach(function (c) {
      if (cells[c] && cells[c][0] !== null) { vals[c] = cells[c][0]; pts.push({ x: Z[c][1], y: Z[c][2], v: cells[c][0] }); }
    });
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
    if (pts.length >= 2) {
      var step = 0.25;
      ctx.globalAlpha = 0.3;
      for (var y = R.stage_depth_m; y < R.depth_m; y += step) for (var x = 0; x < R.width_m; x += step) {
        ctx.fillStyle = S.level(idw(x + step / 2, y + step / 2, pts)).color;
        ctx.fillRect(Math.round(x * sc), Math.round(y * sc), Math.ceil(step * sc), Math.ceil(step * sc));  // 겹치면 반투명 격자 줄이 생긴다
      }
      ctx.globalAlpha = 1;
    }
    // 책상 줄 (배경 참고용)
    ctx.fillStyle = "rgba(160,176,182,.22)";
    Object.keys(R.blocks).forEach(function (b) {
      var xs = Object.keys(R.blocks[b]).map(function (k) { return R.blocks[b][k]; });
      var x0 = Math.min.apply(null, xs) - 0.9, x1 = Math.max.apply(null, xs) + 0.9;
      for (var r = 0; r < R.rows; r++) {
        var yy = R.row_start_m + r * R.row_gap_m;
        ctx.fillRect(x0 * sc, (yy - 0.35) * sc, (x1 - x0) * sc, 0.7 * sc);
      }
    });
    // 앞쪽(단상)
    ctx.fillStyle = "#E9DCC6"; ctx.fillRect(0, 0, cv.width, R.stage_depth_m * sc);
    ctx.fillStyle = "#6B5B45"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("앞 · TV", cv.width - 12, R.stage_depth_m * sc / 2);

    Object.keys(Z).forEach(function (c) {
      var cx = Z[c][1] * sc, cy = Z[c][2] * sc, rad = ZONE_R * sc, v = vals[c], lv = v !== undefined ? S.level(v) : null;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = lv ? lv.color : "#FFFFFF"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#5E7178"; ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = lv && (lv.bars === 2 || lv.bars === 3) ? "#102026" : lv ? "#FFFFFF" : "#3E545C";
      fitText(ctx, Z[c][0], cx, cy - (lv ? 13 : 0), rad * 2 - 10, 23);
      if (lv) { fitText(ctx, lv.word, cx, cy + 16, rad * 2 - 10, 20); said.push(Z[c][0] + " " + lv.word); }
    });
    // 노트북 핫스팟(AP)
    var ap = d.ap;
    ctx.fillStyle = "#14264F"; ctx.beginPath(); ctx.arc(ap[0] * sc, ap[1] * sc, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 19px sans-serif"; ctx.textAlign = "center"; ctx.fillText("AP", ap[0] * sc, ap[1] * sc + 1);
    // 어느 신호의 지도인지는 위 버튼이 알려 준다. 값이 없을 때만 지도 가운데에 적는다
    if (!pts.length) {
      var msg = d.nets[net] + " · 아직 측정값 없음", my = (R.row_start_m + R.row_gap_m * 0.5) * sc;
      ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
      var mw = ctx.measureText(msg).width + 32;
      ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect((cv.width - mw) / 2, my - 22, mw, 44);
      ctx.fillStyle = "#3E545C"; ctx.fillText(msg, cv.width / 2, my);
    }
    cv.setAttribute("aria-label", "강연장 실시간 전파지도, " + d.nets[net] + ": " + (said.length ? said.join(", ") : "아직 측정값 없음"));
  }

  function status() {
    if (!last) { box.classList.remove("on"); stateEl.textContent = "강연이 시작되면 실시간으로 채워져요"; ageEl.textContent = ""; return; }
    var age = Math.max(0, Math.round(Date.now() / 1000 - lastTime)), on = age < FRESH;
    var tag = last.label && last.label !== "본강연" ? " (" + last.label + ")" : "";
    box.classList.toggle("on", on);
    if (on) {
      stateEl.textContent = "실시간 측정 중" + tag;
      ageEl.textContent = (age < 60 ? age + "초 전" : Math.floor(age / 60) + "분 전") + " 갱신 · 측정 기기 " + last.alive + "대";
    } else {
      var t = new Date(lastTime * 1000);
      stateEl.textContent = "마지막으로 받은 측정값" + tag;
      ageEl.textContent = (t.getMonth() + 1) + "월 " + t.getDate() + "일 " + t.getHours() + ":" + ("0" + t.getMinutes()).slice(-2);
    }
  }

  function take(m) {  // ntfy 메시지 한 건 {event, time, message}
    if (!m || m.event !== "message") return;
    try {
      var d = JSON.parse(m.message);
      if (d.v !== 1 || !d.cells || !d.room || !d.zones) return;
      last = d; lastTime = m.time || d.t;
      draw(); status();
    } catch (e) { /* 다른 형식의 메시지는 무시 */ }
  }

  document.querySelectorAll("#liveNets button").forEach(function (b) {
    b.addEventListener("click", function () {
      net = b.dataset.net;
      document.querySelectorAll("#liveNets button").forEach(function (o) {
        o.classList.toggle("on", o === b); o.setAttribute("aria-pressed", o === b);
      });
      draw();
    });
  });

  draw(); status();
  // 처음 열면 마지막 한 건을 받아 오고(ntfy는 12시간 보관), 이어서 새 값을 실시간으로 받는다
  fetch(BASE + "/json?poll=1&since=latest").then(function (r) { return r.text(); }).then(function (t) {
    t.trim().split("\n").forEach(function (line) { if (line) take(JSON.parse(line)); });
  }).catch(function () {});
  if (window.EventSource) {
    new EventSource(BASE + "/sse").onmessage = function (e) { try { take(JSON.parse(e.data)); } catch (x) {} };
  } else {
    setInterval(function () {
      fetch(BASE + "/json?poll=1&since=latest").then(function (r) { return r.text(); }).then(function (t) {
        t.trim().split("\n").forEach(function (line) { if (line) take(JSON.parse(line)); });
      }).catch(function () {});
    }, 20000);
  }
  setInterval(status, 5000);
})();
