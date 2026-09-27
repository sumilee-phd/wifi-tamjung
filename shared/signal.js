// 신호세기 표시 규칙 (PRD 6.1). 강연 앱과 공개 사이트가 함께 쓴다.
(function (root) {
  var LEVELS = [
    { min: -55, bars: 4, color: "#1E9E4F", word: "아주 세다" },
    { min: -65, bars: 3, color: "#7DBB2E", word: "세다" },
    { min: -75, bars: 2, color: "#EDB920", word: "보통" },
    { min: -85, bars: 1, color: "#EE7A22", word: "약하다" },
    { min: -Infinity, bars: 0, color: "#D63A2A", word: "거의 없다" }
  ];
  var LOST = { bars: -1, color: "#9AA5AB", word: "신호 사라짐" };

  function level(rssi, lost) {
    if (lost || rssi === null || rssi === undefined) return LOST;
    for (var i = 0; i < LEVELS.length; i++) if (rssi > LEVELS[i].min) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }

  function barsText(bars) {
    if (bars < 0) return "····";
    return "▮▮▮▮".slice(0, bars) + "▯▯▯▯".slice(0, 4 - bars);
  }

  root.WTSignal = { LEVELS: LEVELS, LOST: LOST, level: level, barsText: barsText };
})(typeof window !== "undefined" ? window : this);
