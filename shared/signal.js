// 신호세기 표시 규칙 (PRD 6.1). 강연 앱과 공개 사이트가 함께 쓴다.
(function (root) {
  var LEVELS = [
    { min: -55, bars: 4, color: "#1E9E4F", word: "매우 강함" },
    { min: -65, bars: 3, color: "#7DBB2E", word: "강함" },
    { min: -75, bars: 2, color: "#EDB920", word: "보통" },
    { min: -85, bars: 1, color: "#EE7A22", word: "약함" },
    { min: -Infinity, bars: 0, color: "#D63A2A", word: "매우 약함" }
  ];
  var LOST = { bars: -1, color: "#9AA5AB", word: "신호 끊김" };

  function level(rssi, lost) {
    if (lost || rssi === null || rssi === undefined) return LOST;
    for (var i = 0; i < LEVELS.length; i++) if (rssi > LEVELS[i].min) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }

  function barsText(bars) {
    if (bars < 0) return "····";
    return "▮▮▮▮".slice(0, bars) + "▯▯▯▯".slice(0, 4 - bars);
  }

  // 와이파이 속도(Mbps) 표시. 노트북 핫스팟까지 실제로 내려받은 속도라 세기와 함께 떨어진다.
  var SPEEDS = [
    { min: 40, color: "#1E9E4F", word: "매우 빠름" },
    { min: 15, color: "#7DBB2E", word: "빠름" },
    { min: 5, color: "#EDB920", word: "보통" },
    { min: 1, color: "#EE7A22", word: "느림" },
    { min: -Infinity, color: "#D63A2A", word: "매우 느림" }
  ];
  function speed(mbps, lost) {
    if (lost || mbps === null || mbps === undefined) return { color: LOST.color, word: "측정 전" };
    for (var i = 0; i < SPEEDS.length; i++) if (mbps >= SPEEDS[i].min) return SPEEDS[i];
    return SPEEDS[SPEEDS.length - 1];
  }

  root.WTSignal = { LEVELS: LEVELS, LOST: LOST, SPEEDS: SPEEDS, level: level, barsText: barsText, speed: speed };
})(typeof window !== "undefined" ? window : this);
