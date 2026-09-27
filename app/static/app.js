// 와이파이 탐정단 강연 앱 화면. 서버 /api/state를 1초마다 읽어 현재 단계 화면을 다시 그린다.
(function () {
  "use strict";
  var S = window.WTSignal;
  var cfg = null, st = null;
  var stageIdx = 0, stageStart = Date.now(), ictStep = 0;
  var voteKind = "strong", selNode = null, revealNode = null, frozen = null, mapNet = "ap";
  var pollTimer = null;

  function $(id) { return document.getElementById(id); }
  function api(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch(path, opt).then(function (r) { return r.json(); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function stageKey() { return cfg.stages[stageIdx].key; }

  // ---------- 단계 이동 ----------
  function buildStages() {
    var nav = $("stages");
    cfg.stages.forEach(function (s, i) {
      var b = el("button"); b.innerHTML = "<b>" + i + "</b>"; b.appendChild(document.createTextNode(s.name));
      b.addEventListener("click", function () { go(i); });
      nav.appendChild(b);
    });
  }
  function go(i) {
    stageIdx = Math.max(0, Math.min(cfg.stages.length - 1, i));
    stageStart = Date.now();
    if (stageKey() === "ict") ictStep = 0;
    document.querySelectorAll("section[data-stage]").forEach(function (s) { s.hidden = s.dataset.stage !== stageKey(); });
    [].forEach.call($("stages").children, function (b, k) { b.classList.toggle("on", k === stageIdx); });
    schedulePoll();
    render();
  }
  function next() {
    if (stageKey() === "ict" && ictStep < 4) { ictStep++; renderIct(); return; }
    go(stageIdx + 1);
  }
  function prev() {
    if (stageKey() === "ict" && ictStep > 0) { ictStep--; renderIct(); return; }
    go(stageIdx - 1);
  }
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT") return;
    if (["ArrowRight", "PageDown", " "].indexOf(e.key) >= 0) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "PageUp"].indexOf(e.key) >= 0) { e.preventDefault(); prev(); }
    else if (/^[0-9]$/.test(e.key) && +e.key < cfg.stages.length) go(+e.key);
    else if (e.key === "n" || e.key === "N") { var ks = Object.keys(cfg.nets); setNet(ks[(ks.indexOf(mapNet) + 1) % ks.length]); }
    else if (e.key === "f" || e.key === "F") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
      else document.exitFullscreen();
    }
  });

  function tickTimer() {
    if (!cfg) return;
    var sec = Math.floor((Date.now() - stageStart) / 1000), lim = cfg.stages[stageIdx].min * 60;
    var t = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    $("timer").textContent = cfg.stages[stageIdx].name + " " + t + (lim ? " / " + cfg.stages[stageIdx].min + "분" : "");
    $("timer").classList.toggle("over", lim > 0 && sec > lim);
  }

  // ---------- 서버 폴링 ----------
  function poll() {
    api("/api/state").then(function (s) {
      st = s; $("conn").className = "conn ok"; $("connText").textContent = "서버 연결 · " + s.session.label;
      render();
    }).catch(function () { $("conn").className = "conn err"; $("connText").textContent = "서버 없음"; });
  }
  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, stageKey() === "reveal" ? 500 : 1000);
  }

  // ---------- 강연장 지도 (5구역) ----------
  var ZONE_R = 0.75;
  function zoneName(code) { return cfg.zones[code] ? cfg.zones[code].name : code; }
  function zoneCodes() { return Object.keys(cfg.zones); }

  function idw(x, y, pts) {
    var num = 0, den = 0;
    for (var i = 0; i < pts.length; i++) {
      var d2 = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d2 < 1e-4) return pts[i].v;
      var w = 1 / d2; num += w * pts[i].v; den += w;
    }
    return num / den;
  }
  function zoneValues(net) {
    var out = {}, cells = st && st.cells[net || mapNet];
    if (!cells) return out;
    Object.keys(cells).forEach(function (c) { if (cells[c].rssi !== null && cfg.zones[c]) out[c] = cells[c].rssi; });
    return out;
  }
  function setNet(net) {
    mapNet = net;
    document.querySelectorAll(".netseg button").forEach(function (b) { b.classList.toggle("on", b.dataset.net === net); });
    render();
  }
  function argmax(obj, sign) {
    var best = null;
    Object.keys(obj).forEach(function (k) { if (sign || obj[k] > 0) { if (best === null || (sign || 1) * obj[k] > (sign || 1) * obj[best]) best = k; } });
    return best;
  }

  function drawRoom(cv, mode) {
    var ctx = cv.getContext("2d"), R = cfg.room, sc = cv.width / R.width_m;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
    var vals = zoneValues();
    var pts = Object.keys(vals).map(function (c) { return { x: cfg.zones[c].pos[0], y: cfg.zones[c].pos[1], v: vals[c] }; });

    if (mode !== "vote" && pts.length >= 2) {
      var step = 0.25;
      ctx.globalAlpha = 0.3;
      for (var y = R.stage_depth_m; y < R.depth_m; y += step) for (var x = 0; x < R.width_m; x += step) {
        ctx.fillStyle = S.level(idw(x + step / 2, y + step / 2, pts)).color;
        ctx.fillRect(x * sc, y * sc, step * sc + 1, step * sc + 1);
      }
      ctx.globalAlpha = 1;
    }
    // 책상 (배경 참고용)
    ctx.fillStyle = "rgba(160,176,182,.22)";
    Object.keys(R.blocks).forEach(function (b) {
      var xs = Object.keys(R.blocks[b]).map(function (k) { return R.blocks[b][k]; });
      var x0 = Math.min.apply(null, xs) - 0.9, x1 = Math.max.apply(null, xs) + 0.9;
      for (var r = 0; r < R.rows; r++) {
        var yy = R.row_start_m + r * R.row_gap_m;
        ctx.fillRect(x0 * sc, (yy - 0.35) * sc, (x1 - x0) * sc, 0.7 * sc);
      }
    });
    // 단상
    ctx.fillStyle = "#E9DCC6"; ctx.fillRect(0, 0, cv.width, R.stage_depth_m * sc);

    var votes = st ? st.votes : { strong: {}, weak: {} };
    var r = { actualStrong: argmax(vals, 1), actualWeak: argmax(vals, -1),
              predStrong: argmax(votes.strong, 0), predWeak: argmax(votes.weak, 0) };

    zoneCodes().forEach(function (code) {
      var p = cfg.zones[code].pos, cx = p[0] * sc, cy = p[1] * sc, rad = ZONE_R * sc;
      var v = vals[code], lv = v !== undefined ? S.level(v) : null, show = lv && mode !== "vote";
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = show ? lv.color : "#FFFFFF"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#5E7178"; ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = show && (lv.bars === 2 || lv.bars === 3) ? "#102026" : show ? "#FFFFFF" : "#3E545C";
      ctx.font = "bold 22px sans-serif"; ctx.fillText(cfg.zones[code].name, cx, cy - (show ? 16 : 0));
      if (show) { ctx.font = "900 30px sans-serif"; ctx.fillText(S.barsText(lv.bars), cx, cy + 20); }
      if (mode === "vote" || mode === "declare") {
        var sv = votes.strong[code] || 0, wv = votes.weak[code] || 0;
        ctx.font = "bold 24px sans-serif"; ctx.textAlign = "left";
        if (sv) { ctx.fillStyle = "#1E9E4F"; ctx.fillText("▲" + sv, cx + rad * 0.72, cy - rad * 0.8); }
        if (wv) { ctx.fillStyle = "#D63A2A"; ctx.fillText("▼" + wv, cx + rad * 0.72, cy + rad * 0.85); }
      }
      if (mode === "declare") {
        ctx.lineWidth = 7; ctx.setLineDash([]);
        if (code === r.actualStrong) { ctx.strokeStyle = "#1E9E4F"; ctx.beginPath(); ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2); ctx.stroke(); }
        if (code === r.actualWeak) { ctx.strokeStyle = "#D63A2A"; ctx.beginPath(); ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        if (code === r.predStrong) { ctx.strokeStyle = "#1E9E4F"; ctx.beginPath(); ctx.arc(cx, cy, rad + 18, 0, Math.PI * 2); ctx.stroke(); }
        if (code === r.predWeak) { ctx.strokeStyle = "#D63A2A"; ctx.beginPath(); ctx.arc(cx, cy, rad + 18, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    });

    // 어느 신호의 지도인지 (저장 이미지에도 남도록 지도 안에 쓴다)
    if (mode !== "vote") {
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(0, cv.height - 36, cv.width, 36);
      ctx.fillStyle = "#102026"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(cfg.nets[mapNet] + (pts.length ? "" : " · 아직 측정값 없음"), 14, cv.height - 18);
      ctx.textBaseline = "middle";
    }
    // 노트북 핫스팟(AP)
    var ap = cfg.ap.pos;
    ctx.fillStyle = "#0B6F79"; ctx.beginPath(); ctx.arc(ap[0] * sc, ap[1] * sc, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.fillText("AP", ap[0] * sc, ap[1] * sc);

    // 탐정 폰: 찍은 자리에 도트, 색 = 와이파이 속도
    if ((mode === "measure" || mode === "declare") && st) {
      st.nodes.forEach(function (n) {
        if (!n.pos) return;
        var x = n.pos[0] * sc, y = n.pos[1] * sc, sp = S.speed(n.mbps, n.lost);
        ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fillStyle = sp.color; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = "#102026"; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#102026"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText(n.id + (n.mbps !== null && n.mbps !== undefined && !n.lost ? " " + Math.round(n.mbps) + "M" : ""), x, y + 33);
      });
      ctx.textBaseline = "middle";
    }
    // 구역에 놓인 측정 노드(폰은 위 도트로 표시)
    if (mode === "measure" && st) {
      var perZone = {};
      st.nodes.forEach(function (n) {
        if (!n.spot || !cfg.zones[n.spot] || n.pos) return;
        var i = perZone[n.spot] = (perZone[n.spot] || 0) + 1;
        var p = cfg.zones[n.spot].pos, ang = -Math.PI / 2 + (i - 1) * 0.9;
        var cx = p[0] * sc + Math.cos(ang) * (ZONE_R * sc + 14), cy = p[1] * sc + Math.sin(ang) * (ZONE_R * sc + 14);
        ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2);
        ctx.fillStyle = n.lost ? "#9AA5AB" : n.src === "phone" ? "#C98A00" : "#102026"; ctx.fill();
        ctx.lineWidth = n.id === selNode ? 5 : 2; ctx.strokeStyle = n.id === selNode ? "#C98A00" : "#FFFFFF"; ctx.stroke();
        ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center"; ctx.fillText(n.id, cx, cy + 1);
      });
    }
    return r;
  }

  function hitSpot(cv, e) {
    var rc = cv.getBoundingClientRect(), sc = cv.width / cfg.room.width_m;
    var px = (e.clientX - rc.left) / rc.width * cv.width, py = (e.clientY - rc.top) / rc.height * cv.height, hit = null;
    zoneCodes().forEach(function (code) {
      var p = cfg.zones[code].pos;
      if (Math.hypot(px - p[0] * sc, py - p[1] * sc) <= ZONE_R * sc + 20) hit = code;
    });
    return hit;
  }

  function phoneUrl() {
    var ip = cfg.ips.indexOf("192.168.137.1") >= 0 ? "192.168.137.1" : (cfg.ips[0] || "localhost");
    return "http://" + ip + ":" + cfg.http_port + "/p";
  }
  function drawQr(target, size) {
    if (!window.qrcode) return;
    var q = qrcode(0, "M"); q.addData(phoneUrl()); q.make();
    target.innerHTML = q.createSvgTag({ cellSize: Math.max(2, Math.floor(size / q.getModuleCount())), margin: 2, scalable: true });
  }

  // ---------- 단계별 화면 ----------
  function render() {
    if (!cfg) return;
    var k = stageKey();
    if (k === "wait") renderWait();
    else if (k === "ict") renderIct();
    else if (k === "vote") renderVote();
    else if (k === "measure") renderMeasure();
    else if (k === "reveal") renderReveal();
    else if (k === "declare") renderDeclare();
  }

  function nodeStatus(n) {
    if (n.age === null) return { cls: "off", text: "기다리는 중" };
    if (n.lost) return { cls: "stale", text: "끊김 " + Math.round(n.age) + "초" };
    return { cls: "ok", text: "연결됨" };
  }

  function renderWait() {
    if (!st) return;
    var box = $("waitNodes"); box.innerHTML = "";
    st.nodes.forEach(function (n) {
      var s = nodeStatus(n), c = el("div", "ncard " + s.cls);
      c.appendChild(el("div", "id", n.id));
      c.appendChild(el("div", "st", s.text));
      c.appendChild(el("div", "meta", (n.rssi !== null ? n.rssi + " dBm · " : "") + n.rate + "건/초" + (n.spot ? " · " + n.spot : "")));
      box.appendChild(c);
    });
    $("sessionLabel").textContent = st.session.label;
    $("sessionInfo").textContent = "측정 " + st.session.count + "건 · " + new Date(st.session.started * 1000).toLocaleTimeString("ko-KR") + " 시작";
  }

  function renderIct() {
    $("ictWord").hidden = ictStep > 0; $("timeline").hidden = ictStep === 0;
    document.querySelectorAll("#timeline li").forEach(function (li) { li.classList.toggle("shown", +li.dataset.step <= ictStep); });
  }

  function renderVote() {
    drawRoom($("voteCanvas"), "vote");
    $("voteQ").textContent = voteKind === "strong" ? "신호가 가장 강한 곳은?" : "신호가 가장 약한 곳은?";
    var t = $("tally"); t.innerHTML = "";
    var v = st ? st.votes[voteKind] : {};
    zoneCodes().forEach(function (k) {
      var row = el("div", "trow"); row.appendChild(el("b", "", k));
      row.appendChild(el("span", "", zoneName(k)));
      row.appendChild(el("span", "n", v[k] || 0));
      var minus = el("button", "", "−"); minus.setAttribute("aria-label", k + " 한 표 빼기"); minus.dataset.key = k;
      row.appendChild(minus); t.appendChild(row);
    });
  }

  function renderMeasure() {
    drawRoom($("measureCanvas"), "measure");
    if (!st) return;
    var box = $("measureNodes"); box.innerHTML = "";
    st.nodes.forEach(function (n) {
      if (n.age === null && !n.spot) return;
      var lv = S.level(n.rssi, n.lost), b = el("button", "nitem" + (n.id === selNode ? " sel" : "")); b.dataset.id = n.id;
      b.appendChild(el("span", "id", n.id));
      var mid = el("span"); var bars = el("div", "nbars", S.barsText(lv.bars)); bars.style.color = lv.color;
      mid.appendChild(bars);
      var sub = n.src === "phone" ? "폰 · " + lv.word + (n.mbps !== null && n.mbps !== undefined ? " · " + n.mbps + " Mbps" : "") + (n.rtt ? " · " + n.rtt + "ms" : "")
                                  : lv.word + (n.rssi !== null && !n.lost ? " · " + n.rssi + " dBm" : "") + (n.lib !== null && n.lib !== undefined ? " · 도서관 " + n.lib : "");
      mid.appendChild(el("div", "sub", sub));
      b.appendChild(mid); b.appendChild(el("span", "spot", n.spot ? zoneName(n.spot) : "구역 없음"));
      box.appendChild(b);
    });
    if (!box.children.length) box.appendChild(el("p", "muted", "아직 들어온 노드가 없습니다."));
  }

  function renderReveal() {
    if (!st) return;
    var alive = st.nodes.filter(function (n) { return n.age !== null; });
    if (!revealNode && alive.length) revealNode = alive[0].id;
    var chips = $("revealChips"); chips.innerHTML = "";
    alive.forEach(function (n) {
      var b = el("button", n.id === revealNode ? "on" : "", n.id); b.dataset.id = n.id;
      chips.appendChild(b);
    });
    var n = st.nodes.filter(function (x) { return x.id === revealNode; })[0];
    var val = n ? n.rssi3 : null, lv = n ? S.level(val, n.lost) : S.LOST;
    [].forEach.call($("bars").children, function (bar, i) { bar.style.background = i < lv.bars ? lv.color : ""; });
    $("meter").classList.toggle("lost", lv === S.LOST);
    $("word").textContent = n ? lv.word : "노드를 켜 주세요";
    $("word").style.color = lv === S.LOST ? "" : lv.color;
    $("dbm").textContent = n && !n.lost && val !== null ? val + " dBm" + (n.src === "phone" ? " (폰 막대 기준)" : "") : "";
    $("after").textContent = n ? (n.lost ? "끊김" : S.barsText(lv.bars) + " " + val) : "-";
    $("before").textContent = frozen ? S.barsText(S.level(frozen).bars) + " " + frozen : "-";
  }

  function renderDeclare() {
    var r = drawRoom($("declareCanvas"), "declare");
    $("declareTitle").textContent = cfg.title;
    $("declareDate").textContent = cfg.event + " · " + cfg.date;
    $("siteUrl").textContent = cfg.site_url;
    var box = $("result"); box.innerHTML = "";
    function card(label, pred, actual) {
      var c = el("div", "rcard" + (pred && pred === actual ? " hit" : ""));
      c.appendChild(el("span", "", label));
      c.appendChild(el("b", "", "실제 " + (actual ? zoneName(actual) : "측정값 부족")));
      c.appendChild(el("div", "muted small", "예측 " + (pred ? zoneName(pred) : "없음") + (pred && pred === actual ? " · 예측 적중" : "")));
      box.appendChild(c);
    }
    card("신호가 가장 강한 곳 (초록 굵은 테두리)", r.predStrong, r.actualStrong);
    card("신호가 가장 약한 곳 (빨강 굵은 테두리)", r.predWeak, r.actualWeak);
    // 세 가지 신호 비교: 구역 사이 차이가 클수록 자리마다 다르다
    var t = $("cmp"); t.innerHTML = "<tr><th>신호</th><th>가장 강한 곳</th><th>가장 약한 곳</th><th>차이(dB)</th></tr>";
    Object.keys(cfg.nets).forEach(function (net) {
      var v = zoneValues(net), ks = Object.keys(v), tr = el("tr", net === mapNet ? "on" : "");
      tr.appendChild(el("td", "", cfg.nets[net]));
      if (!ks.length) { var td = el("td", "muted", "측정 없음"); td.colSpan = 3; tr.appendChild(td); t.appendChild(tr); return; }
      var hi = argmax(v, 1), lo = argmax(v, -1);
      tr.appendChild(el("td", "", zoneName(hi))); tr.appendChild(el("td", "", zoneName(lo)));
      tr.appendChild(el("td", "n", (v[hi] - v[lo]) + " dB"));
      t.appendChild(tr);
      if (net === "cell" && st && st.cell_gen) {  // 휴대폰 데이터를 통신 세대별로 나눠 보기
        Object.keys(st.cell_gen).sort().forEach(function (g) {
          var gv = {}; Object.keys(st.cell_gen[g]).forEach(function (z) { gv[z] = st.cell_gen[g][z].rssi; });
          var h2 = argmax(gv, 1), l2 = argmax(gv, -1), r2 = el("tr");
          r2.appendChild(el("td", "", "  └ " + g));
          r2.appendChild(el("td", "", zoneName(h2))); r2.appendChild(el("td", "", zoneName(l2)));
          r2.appendChild(el("td", "n", (gv[h2] - gv[l2]) + " dB"));
          t.appendChild(r2);
        });
      }
    });
  }

  // ---------- 이벤트 ----------
  function bind() {
    $("btnRehearsal").addEventListener("click", function () { api("/api/session/new", { label: "리허설" }).then(poll); });
    $("btnLive").addEventListener("click", function () {
      api("/api/session/new", { label: "본강연" }).then(function () { poll(); go(1); });
    });

    var play = WTPlayground.mount($("playCanvas"), { readout: $("playReadout") });
    document.querySelectorAll("#playTools .tool").forEach(function (b) {
      b.addEventListener("click", function () {
        play.setMode(b.dataset.m);
        document.querySelectorAll("#playTools .tool").forEach(function (o) { o.classList.toggle("on", o === b); });
      });
    });
    $("playPreset").addEventListener("click", play.preset);
    $("playClear").addEventListener("click", play.clear);

    document.querySelectorAll(".netseg").forEach(function (seg) {
      Object.keys(cfg.nets).forEach(function (net) {
        var b = el("button", net === mapNet ? "on" : "", cfg.nets[net].replace(/\(.*\)/, ""));
        b.dataset.net = net; b.addEventListener("click", function () { setNet(net); });
        seg.appendChild(b);
      });
    });
    document.querySelectorAll("#voteSeg button").forEach(function (b) {
      b.addEventListener("click", function () {
        voteKind = b.dataset.kind;
        document.querySelectorAll("#voteSeg button").forEach(function (o) { o.classList.toggle("on", o === b); });
        renderVote();
      });
    });
    $("voteCanvas").addEventListener("click", function (e) {
      var k = hitSpot($("voteCanvas"), e);
      if (k) api("/api/votes", { kind: voteKind, key: k, delta: 1 }).then(poll);
    });

    $("measureCanvas").addEventListener("click", function (e) {
      var code = hitSpot($("measureCanvas"), e);
      if (!code || !st) return;
      if (!selNode) {
        var here = st.nodes.filter(function (n) { return n.spot === code; })[0];
        if (here) { selNode = here.id; render(); }
        return;
      }
      var cur = st.nodes.filter(function (n) { return n.id === selNode; })[0];
      var spot = cur && cur.spot === code ? null : code;  // 같은 자리를 다시 누르면 빼기
      api("/api/place", { node: selNode, spot: spot }).then(function () { selNode = null; poll(); });
    });

    // 1초마다 다시 그리는 목록은 누르는 순간(pointerdown)에 처리해 클릭이 사라지지 않게 한다
    function onPress(id, fn) {
      $(id).addEventListener("pointerdown", function (e) {
        var b = e.target.closest("button"); if (b && $(id).contains(b)) { e.preventDefault(); fn(b); }
      });
    }
    onPress("tally", function (b) { api("/api/votes", { kind: voteKind, key: b.dataset.key, delta: -1 }).then(poll); });
    onPress("measureNodes", function (b) { selNode = selNode === b.dataset.id ? null : b.dataset.id; render(); });
    onPress("revealChips", function (b) { revealNode = b.dataset.id; frozen = null; render(); });

    $("btnFreeze").addEventListener("click", function () {
      var n = st && st.nodes.filter(function (x) { return x.id === revealNode; })[0];
      if (n && !n.lost) { frozen = n.rssi3; renderReveal(); }
    });

    $("btnEnd").addEventListener("click", function () {
      var src = $("declareCanvas"), out = document.createElement("canvas");
      out.width = 1920; out.height = 1080;
      var c = out.getContext("2d");
      c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, 1920, 1080);
      c.fillStyle = "#0B6F79"; c.font = "bold 36px sans-serif"; c.fillText(cfg.event + " · " + cfg.date, 90, 150);
      c.fillStyle = "#102026"; c.font = "900 88px sans-serif"; c.fillText(cfg.title, 90, 260);
      c.font = "32px sans-serif"; c.fillStyle = "#3E545C";
      c.fillText("와이파이 탐정단이 함께 측정했습니다", 90, 330);
      c.fillText("진한 원은 측정값, 옅은 색은 측정값으로 추정한 영역", 90, 380);
      S.LEVELS.forEach(function (lv, i) {
        c.fillStyle = lv.color; c.fillRect(90, 440 + i * 56, 40, 40);
        c.fillStyle = "#102026"; c.font = "30px sans-serif"; c.fillText(lv.word, 150, 470 + i * 56);
      });
      c.fillStyle = "#3E545C"; c.font = "28px sans-serif"; c.fillText(cfg.speaker + " · " + cfg.dept, 90, 1000);
      var h = 1000, w = h * src.width / src.height;
      c.drawImage(src, 1920 - w - 60, 40, w, h);
      $("endMsg").textContent = "저장 중…";
      api("/api/end", { png: out.toDataURL("image/png") }).then(function (r) {
        $("endMsg").textContent = r.ok ? "저장됨: " + r.folder : "저장 실패: " + (r.error || "");
      }).catch(function () { $("endMsg").textContent = "저장 실패: 서버에 연결할 수 없습니다"; });
    });

    var legend = $("legend");
    legend.appendChild(el("b", "", "구역: 세기"));
    S.LEVELS.concat([S.LOST]).forEach(function (lv) {
      var s = el("span"); var i = el("i"); i.style.background = lv.color; s.appendChild(i); s.appendChild(document.createTextNode(lv.word)); legend.appendChild(s);
    });
    var legend2 = $("legend2");
    legend2.appendChild(el("b", "", "폰 도트: 속도"));
    S.SPEEDS.forEach(function (sp) {
      var s = el("span"); var i = el("i"); i.style.background = sp.color; i.style.borderRadius = "50%"; s.appendChild(i);
      s.appendChild(document.createTextNode(sp.word + (isFinite(sp.min) ? " " + sp.min + "M+" : ""))); legend2.appendChild(s);
    });
  }

  api("/api/config").then(function (c) {
    cfg = c;
    $("introEvent").textContent = c.event + " · " + c.date;
    $("speaker").textContent = c.speaker + " · " + c.dept;
    $("ipList").textContent = (c.ips.length ? c.ips.join(", ") : "확인 불가") + " · UDP " + c.udp_port;
    $("phoneUrl").textContent = phoneUrl(); $("phoneUrl2").textContent = phoneUrl();
    drawQr($("qrWait"), 220); drawQr($("qrMeasure"), 150);
    buildStages(); bind(); go(0); poll();
    setInterval(tickTimer, 500);
  }).catch(function () {
    document.body.innerHTML = "<p style='padding:40px;font-size:24px'>서버에 연결할 수 없습니다. PowerShell에서 run.ps1을 실행했는지 확인하세요.</p>";
  });
})();
