"""와이파이 탐정단 강연 앱 서버.

표준 라이브러리만 쓴다(설치할 패키지 없음). 한 프로세스가 두 가지를 맡는다.
- UDP 8601: 측정 노드가 보내는 {"node_id","zone","rssi"} 한 줄 JSON 수신 (KIPEE 전파지도와 같은 형식)
- HTTP 8600: 강연 앱 화면과 JSON API, 참가자 폰 페이지(/p)

노드는 두 종류다.
- 측정 노드(ESP32, N1~): 연결된 AP의 RSSI(dBm)를 UDP로 보낸다.
- 폰 노드(P1~): 핫스팟에 접속한 참가자 폰이 /p 페이지에서 구역, 와이파이 막대 수, 휴대폰 데이터(LTE·5G) 막대 수(0~4)를
  보내고, 노트북까지의 응답 시간(RTT)을 자동으로 잰다. 웹은 dBm을 읽을 수 없어 막대 수를 대표 dBm으로 바꿔 지도에 쓴다.
  통신 세기 외의 정보(이름, 위치, 기기 정보, IP)는 받거나 저장하지 않는다.

측정망(net)은 셋이다: ap 우리 공유기(노트북 핫스팟), lib 도서관 와이파이(ESP32 스캔), cell 휴대폰 데이터(폰 막대).

실행: python app/server.py
"""
import base64
import csv
import json
import os
import socket
import statistics
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

APP = Path(__file__).resolve().parent
ROOT = APP.parent
CONFIG = json.loads((APP / "config.json").read_text(encoding="utf-8"))
HTTP_PORT = int(os.environ.get("WT_HTTP_PORT", CONFIG["http_port"]))
UDP_PORT = int(os.environ.get("WT_UDP_PORT", CONFIG["udp_port"]))
LOST_SEC = float(CONFIG["lost_sec"])
WINDOW = int(CONFIG["window"])
RSSI_MIN, RSSI_MAX = -100, -20
SESSIONS = APP / "sessions"
SESSIONS.mkdir(exist_ok=True)
STATIC_DIRS = {"/static/": APP / "static", "/shared/": ROOT / "shared"}


SPOTS = {code: tuple(z["pos"]) for code, z in CONFIG["zones"].items()}  # 구역 코드 → 위치(m)
BARS_DBM = CONFIG["phone_bars_dbm"]
lock = threading.Lock()


def new_session(label):
    return {"id": time.strftime("%Y%m%d_%H%M%S"), "label": label, "started": time.time(),
            "samples": [], "placement": {}, "votes": {"strong": {}, "weak": {}}, "games": []}


state = {"session": new_session("리허설"), "live": {}, "src": {}, "phones": 0, "lib": {}, "pos": {}, "mbps": {},
         "race": None}  # 명당 찾기 대결: {"start", "end", "best": {폰: 최고 Mbps}}  # live: node -> [(t, rssi), ...]
NETS = list(CONFIG["nets"].keys())
GENS = ("5G", "LTE", "3G")  # 아이가 폰 상단 표시를 보고 고른 통신 세대 (웹은 직접 알 수 없음)  # ap 우리 공유기, lib 도서관 와이파이, cell 휴대폰 데이터
RUN_ID = time.strftime("%H%M%S")  # 서버를 켤 때마다 바뀜. 폰은 이 값이 바뀌면 번호를 새로 받는다
BLOB = os.urandom(256 * 1024)  # 폰 와이파이 속도(Mbps) 측정용 내려받기 파일


def median_last(values):
    vals = values[-WINDOW:]
    return round(statistics.median(vals)) if vals else None


def ingest(msg, addr=None, src="node", extra=None):
    """노드 한 건을 받는다. rssi는 노트북 핫스팟(ap) 세기, lib_rssi가 있으면 도서관 와이파이 세기도 함께 쌓는다."""
    node = str(msg.get("node_id", "")).strip()[:16]
    rssi = int(msg["rssi"])
    if not node or not (RSSI_MIN <= rssi <= RSSI_MAX):
        raise ValueError("bad node_id or rssi")
    now = time.time()
    with lock:
        s = state["session"]
        spot = s["placement"].get(node)
        zone = str(msg.get("zone", "")).upper()
        if spot is None and zone in SPOTS:
            spot = zone  # 노드가 구역을 직접 보낸 경우
        live = state["live"].setdefault(node, [])
        live.append((now, rssi))
        del live[:-50]
        state["src"][node] = src
        smp = {"t": now, "node": node, "spot": spot, "rssi": rssi, "src": src, "net": "ap"}
        smp.update(extra or {})
        s["samples"].append(smp)
        lib = msg.get("lib_rssi")
        if lib is not None and RSSI_MIN <= int(lib) <= RSSI_MAX:
            state["lib"][node] = int(lib)
            s["samples"].append({"t": now, "node": node, "spot": spot, "rssi": int(lib), "src": src, "net": "lib"})


def add_cell(node, zone, cell_bars, gen):
    """폰이 보고한 휴대폰 데이터(LTE/5G) 안테나 막대 수를 쌓는다."""
    now = time.time()
    with lock:
        s = state["session"]
        s["samples"].append({"t": now, "node": node, "spot": zone, "rssi": BARS_DBM[cell_bars], "src": "phone",
                             "net": "cell", "bars": cell_bars, "gen": gen})


def udp_loop():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", UDP_PORT))
    print(f"UDP {UDP_PORT} 수신 대기")
    while True:
        data, addr = sock.recvfrom(512)
        try:
            ingest(json.loads(data.decode("utf-8")), addr)
            sock.sendto(b"ok", addr)
        except Exception as e:  # 잘못된 패킷은 버리고 계속
            print("UDP 거부:", addr[0], e)


def snapshot():
    now = time.time()
    with lock:
        s = state["session"]
        nodes = []
        names = list(dict.fromkeys(CONFIG["nodes"] + list(state["live"].keys())))
        for n in names:
            live = state["live"].get(n, [])
            last = live[-1][0] if live else None
            age = None if last is None else round(now - last, 1)
            recent = [v for t, v in live if now - t <= 10]
            last3 = [v for _, v in live[-3:]]
            nodes.append({
                "id": n,
                "src": state["src"].get(n, "node"),
                "rssi3": round(statistics.median(last3)) if last3 else None,
                "spot": s["placement"].get(n),
                "rssi": median_last(recent),
                "last": live[-1][1] if live else None,
                "age": age,
                "lost": age is None or age > LOST_SEC,
                "rate": round(sum(1 for t, _ in live if now - t <= 5) / 5, 1),
                "rtt": state.get("rtt", {}).get(n),
                "lib": state["lib"].get(n),
                "pos": state["pos"].get(n),
                "mbps": state["mbps"].get(n),
            })
        by = {net: {} for net in NETS}
        for smp in s["samples"]:
            if smp["spot"]:
                by.setdefault(smp.get("net", "ap"), {}).setdefault(smp["spot"], []).append(smp["rssi"])
        cells = {net: {k: {"rssi": median_last(v), "n": len(v)} for k, v in zs.items()} for net, zs in by.items()}
        by_gen = {}
        for smp in s["samples"]:
            if smp.get("net") == "cell" and smp.get("gen") and smp["spot"]:
                by_gen.setdefault(smp["gen"], {}).setdefault(smp["spot"], []).append(smp["rssi"])
        cell_gen = {g: {k: {"rssi": median_last(v), "n": len(v)} for k, v in zs.items()} for g, zs in by_gen.items()}
        race = None
        if state["race"]:
            r = state["race"]
            ranking = sorted(({"id": k, "best": v, "cur": state["mbps"].get(k), "zone": s["placement"].get(k)}
                              for k, v in r["best"].items()), key=lambda x: -x["best"])
            race = {"active": now < r["end"], "remaining": max(0, round(r["end"] - now)),
                    "duration": round(r["end"] - r["start"]), "ranking": ranking}
        return {"session": {"id": s["id"], "label": s["label"], "started": s["started"],
                            "count": len(s["samples"])}, "race": race,
                "nodes": nodes, "cells": cells, "cell_gen": cell_gen, "votes": s["votes"], "server_time": now}


def save_session(s, png_bytes=None):
    folder = SESSIONS / f"{s['id']}_{s['label']}"
    folder.mkdir(exist_ok=True)
    with open(folder / "samples.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["time", "node", "src", "net", "gen", "zone", "rssi", "bars", "rtt_ms", "mbps", "x_m", "y_m"])
        for smp in s["samples"]:
            w.writerow([time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(smp["t"])),
                        smp["node"], smp.get("src", ""), smp.get("net", "ap"), smp.get("gen", ""), smp["spot"] or "", smp["rssi"],
                        smp.get("bars", ""), smp.get("rtt", ""), smp.get("mbps", ""),
                        *(smp.get("pos") or ["", ""])])
    (folder / "session.json").write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
    if png_bytes:
        (folder / "map.png").write_bytes(png_bytes)
    return folder


def local_ips():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.137.255", 9))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def translate_path(self, path):
        path = urlparse(path).path
        for prefix, folder in STATIC_DIRS.items():
            if path.startswith(prefix):
                target = (folder / path[len(prefix):]).resolve()
                if folder.resolve() in target.parents or target == folder.resolve():
                    return str(target)
        return str(APP / "static" / "__missing__")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self.path = "/static/index.html"
            return super().do_GET()
        if path in ("/p", "/p/"):
            self.path = "/static/phone.html"
            return super().do_GET()
        if path == "/api/ping":
            return self.send_json({"t": time.time()})
        if path == "/api/blob":
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(BLOB)))
            self.end_headers()
            self.wfile.write(BLOB)
            return
        if path == "/api/state":
            return self.send_json(snapshot())
        if path == "/api/config":
            return self.send_json({**CONFIG, "spots": SPOTS, "ips": local_ips(), "udp_port": UDP_PORT, "run": RUN_ID})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json({"error": "JSON 형식이 아닙니다"}, 400)
        with lock:
            s = state["session"]
            if path == "/api/place":
                node, spot = body.get("node"), body.get("spot")
                if spot is not None and spot not in SPOTS:
                    return self.send_json({"error": f"없는 자리입니다: {spot}"}, 400)
                if spot is None:
                    s["placement"].pop(node, None)
                else:
                    s["placement"][node] = spot
                return self.send_json({"ok": True, "placement": s["placement"]})
            if path == "/api/phone/join":
                state["phones"] += 1
                return self.send_json({"id": f"P{state['phones']}"})
            if path == "/api/phone":
                node = str(body.get("id", ""))[:8]
                zone = body.get("zone")
                if not node.startswith("P"):
                    return self.send_json({"error": "폰 번호가 없습니다"}, 400)
                if zone is not None and zone not in SPOTS:
                    return self.send_json({"error": f"없는 구역입니다: {zone}"}, 400)
                if zone:
                    s["placement"][node] = zone
                if body.get("rtt") is not None:
                    state.setdefault("rtt", {})[node] = round(float(body["rtt"]))
                if body.get("mbps") is not None:
                    state["mbps"][node] = round(float(body["mbps"]), 1)
                    r = state["race"]
                    if r and r["start"] <= time.time() <= r["end"]:  # 대결 중이면 최고 속도 갱신
                        r["best"][node] = max(r["best"].get(node, 0), state["mbps"][node])
                pos = body.get("pos")
                if isinstance(pos, list) and len(pos) == 2:
                    x, y = float(pos[0]), float(pos[1])
                    if 0 <= x <= CONFIG["room"]["width_m"] and 0 <= y <= CONFIG["room"]["depth_m"]:
                        state["pos"][node] = [round(x, 2), round(y, 2)]
                bars, cell = body.get("bars"), body.get("cell_bars")
                gen = body.get("cell_gen") if body.get("cell_gen") in GENS else ""
                spot = s["placement"].get(node)
        if path == "/api/phone":
            if bars is not None:
                ingest({"node_id": node, "zone": zone or "", "rssi": BARS_DBM[max(0, min(4, int(bars)))]}, src="phone",
                       extra={"bars": int(bars), "rtt": state.get("rtt", {}).get(node),
                              "mbps": state["mbps"].get(node), "pos": state["pos"].get(node)})
            if cell is not None and spot:
                add_cell(node, spot, max(0, min(4, int(cell))), gen)
            return self.send_json({"ok": True})
        with lock:
            s = state["session"]
            if path == "/api/race":
                act = body.get("action")
                if act == "start":
                    sec = max(10, min(300, int(body.get("sec", 60))))
                    state["race"] = {"start": time.time(), "end": time.time() + sec, "best": {}}
                elif act == "clear":
                    state["race"] = None
                else:
                    return self.send_json({"error": "action은 start 또는 clear"}, 400)
                return self.send_json({"ok": True})
            if path == "/api/game":  # 대결 결과 기록 (세션 파일에 함께 저장)
                s["games"].append({"t": time.time(), **{k: body[k] for k in list(body)[:12]}})
                return self.send_json({"ok": True, "n": len(s["games"])})
            if path == "/api/votes":
                kind, key, delta = body.get("kind"), body.get("key"), int(body.get("delta", 0))
                if kind not in ("strong", "weak"):
                    return self.send_json({"error": "kind는 strong 또는 weak"}, 400)
                v = s["votes"][kind]
                v[key] = max(0, v.get(key, 0) + delta)
                return self.send_json({"ok": True, "votes": s["votes"]})
            if path == "/api/session/new":
                folder = save_session(s) if s["samples"] else None
                state["session"] = new_session(str(body.get("label", "세션"))[:20])
                state["live"].clear()
                state["rtt"] = {}
                state["lib"] = {}
                state["pos"] = {}
                state["mbps"] = {}
                state["race"] = None
                return self.send_json({"ok": True, "archived": str(folder) if folder else None})
            if path == "/api/end":
                png = None
                data_url = body.get("png", "")
                if data_url.startswith("data:image/png;base64,"):
                    png = base64.b64decode(data_url.split(",", 1)[1])
                folder = save_session(s, png)
                return self.send_json({"ok": True, "folder": str(folder)})
        return self.send_json({"error": "없는 주소입니다"}, 404)


def main():
    threading.Thread(target=udp_loop, daemon=True).start()
    httpd = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), Handler)
    print(f"강연 앱: http://localhost:{HTTP_PORT}")
    print("노드가 보낼 주소:", ", ".join(local_ips()) or "(확인 불가)", f"UDP {UDP_PORT}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
