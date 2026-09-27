// 공개 사이트: 전파 놀이터 연결, 우리 집 와이파이 명당 찾기(기록은 이 기기 localStorage에만).
(function () {
  "use strict";
  var S = window.WTSignal;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  // ---------- 전파 놀이터 ----------
  var play = WTPlayground.mount($("playCanvas"), { readout: $("playReadout") });
  document.querySelectorAll("#playTools .tool").forEach(function (b) {
    b.addEventListener("click", function () {
      play.setMode(b.dataset.m);
      document.querySelectorAll("#playTools .tool").forEach(function (o) { o.classList.toggle("on", o === b); });
    });
  });
  $("playPreset").addEventListener("click", play.preset);
  $("playClear").addEventListener("click", play.clear);

  // ---------- 우리 집 명당 찾기 ----------
  var KEY = "wt-home-v1";
  var DEFAULT = ["거실", "내 방", "안방", "부엌", "화장실", "현관"];
  var BAR_COLOR = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  var BAR_WORD = ["거의 없어요", "약해요", "보통", "세요", "아주 세요"];
  var home;
  try { home = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { home = null; }
  if (!home || !Array.isArray(home.rooms)) home = { rooms: DEFAULT.map(function (n) { return { name: n, bars: null, ap: false }; }) };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(home)); } catch (e) {} }

  function icon(n) {
    var s = el("span", "ic");
    for (var i = 1; i <= 4; i++) s.appendChild(el("i", i <= n ? "f" : ""));
    return s;
  }

  function renderRooms() {
    var box = $("rooms"); box.innerHTML = "";
    home.rooms.forEach(function (r, idx) {
      var card = el("div", "room");
      var name = el("div", "name"); name.appendChild(document.createTextNode(r.name));
      var ap = el("button", "ap" + (r.ap ? " on" : ""), r.ap ? "공유기 있음" : "공유기?");
      ap.type = "button"; ap.setAttribute("aria-pressed", r.ap ? "true" : "false");
      ap.addEventListener("click", function () { home.rooms.forEach(function (o, k) { o.ap = k === idx ? !o.ap : false; }); save(); render(); });
      name.appendChild(ap);
      card.appendChild(name);
      var del = el("button", "del", "×"); del.type = "button"; del.setAttribute("aria-label", r.name + " 지우기");
      del.addEventListener("click", function () { home.rooms.splice(idx, 1); save(); render(); });
      card.appendChild(del);
      var pick = el("div", "pick");
      for (var n = 0; n <= 4; n++) (function (n) {
        var b = el("button", r.bars === n ? "on" : ""); b.type = "button";
        b.setAttribute("aria-label", r.name + " 막대 " + n + "칸");
        b.appendChild(icon(n)); b.appendChild(document.createTextNode(n + "칸"));
        b.addEventListener("click", function () { r.bars = n; save(); render(); });
        pick.appendChild(b);
      })(n);
      card.appendChild(pick);
      box.appendChild(card);
    });
  }

  function renderResult() {
    var box = $("homeResult"); box.innerHTML = "";
    var done = home.rooms.filter(function (r) { return r.bars !== null; });
    if (done.length < 2) {
      if (done.length === 1) box.appendChild(el("p", "", "방을 하나 더 조사하면 명당을 밝혀낼 수 있어요."));
      return;
    }
    var max = Math.max.apply(null, done.map(function (r) { return r.bars; }));
    var min = Math.min.apply(null, done.map(function (r) { return r.bars; }));
    var best = done.filter(function (r) { return r.bars === max; }).map(function (r) { return r.name; });
    var worst = done.filter(function (r) { return r.bars === min; }).map(function (r) { return r.name; });
    box.appendChild(el("p", "eyebrow", "미션 완료! 우리 집 명당은"));
    box.appendChild(el("p", "best", best.join(", ")));
    if (max !== min) box.appendChild(el("p", "", "가장 약한 곳은 " + worst.join(", ") + "이에요."));
    else box.appendChild(el("p", "", "모든 방이 같아요. 와이파이가 고르게 퍼진 집이에요."));
    var apRoom = home.rooms.filter(function (r) { return r.ap; })[0];
    if (apRoom && best.indexOf(apRoom.name) >= 0) box.appendChild(el("p", "fine", "공유기와 가까울수록 세다는 걸 확인했어요."));
    else if (apRoom && apRoom.bars !== null) box.appendChild(el("p", "fine", "공유기가 있는 방보다 센 곳이 있다면 전파가 지나가는 길을 살펴보세요."));
    var chart = el("div", "chart");
    done.slice().sort(function (a, b) { return b.bars - a.bars; }).forEach(function (r) {
      var row = el("div");
      row.appendChild(el("span", "", r.name));
      var t = el("span", "track"), f = el("span", "fill");
      f.style.width = (r.bars / 4 * 100) + "%"; f.style.background = BAR_COLOR[r.bars]; f.style.display = "block";
      t.appendChild(f); row.appendChild(t);
      row.appendChild(el("span", "v", r.bars + "칸"));
      row.title = BAR_WORD[r.bars];
      chart.appendChild(row);
    });
    box.appendChild(chart);
  }

  function render() { renderRooms(); renderResult(); }

  $("addRoom").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("roomName").value.trim();
    if (!name) return;
    home.rooms.push({ name: name.slice(0, 12), bars: null, ap: false });
    $("roomName").value = ""; save(); render();
  });
  var confirmReset = false;
  $("homeReset").addEventListener("click", function () {
    if (!confirmReset) { confirmReset = true; this.textContent = "한 번 더 누르면 모두 지워져요"; return; }
    home = { rooms: DEFAULT.map(function (n) { return { name: n, bars: null, ap: false }; }) };
    save(); render(); confirmReset = false; this.textContent = "기록 모두 지우기";
  });

  render();
})();
