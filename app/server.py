"""와이파이 탐정단 강연 앱 서버.

표준 라이브러리만 쓴다(설치할 패키지 없음). 한 프로세스가 두 가지를 맡는다.
- UDP 8601: 측정 노드가 보내는 {"node_id","zone","rssi"} 한 줄 JSON 수신 (KIPEE 전파지도와 같은 형식)
- HTTP 8600: 강연 앱 화면과 JSON API, 참가자 폰 페이지(/p)

노드는 두 종류다.
- 측정 노드(ESP32, N1~): 연결된 AP의 RSSI(dBm)를 UDP로 보낸다.
- 폰 노드(P1~): 핫스팟에 접속한 참가자 폰이 /p 페이지에서 자기 구역과 와이파이 막대 수(0~4)를 보내고,
  노트북까지의 응답 시간(RTT)을 자동으로 잰다. 웹은 dBm을 읽을 수 없어 막대 수를 대표 dBm으로 바꿔 지도에 쓴다.

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
            "samples": [], "placement": {}, "votes": {"strong": {}, "weak": {}}}


state = {"session": new_session("리허설"), "live": {}, "src": {}, "phones": 0}  # live: node -> [(t, rssi), ...]
BLOB = os.urandom(64 * 1024)  # 폰 응답 속도 측정용


def median_last(values):
    vals = values[-WINDOW:]
    return round(statistics.median(vals)) if vals else None


def ingest(msg, addr=None, src="node", extra=None):
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
        smp = {"t": now, "node": node, "spot": spot, "rssi": rssi, "src": src}
        smp.update(extra or {})
        s["samples"].append(smp)


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
            })
        by_spot = {}
        for smp in s["samples"]:
            if smp["spot"]:
                by_spot.setdefault(smp["spot"], []).append(smp["rssi"])
        cells = {k: {"rssi": median_last(v), "n": len(v)} for k, v in by_spot.items()}
        return {"session": {"id": s["id"], "label": s["label"], "started": s["started"],
                            "count": len(s["samples"])},
                "nodes": nodes, "cells": cells, "votes": s["votes"], "server_time": now}


def save_session(s, png_bytes=None):
    folder = SESSIONS / f"{s['id']}_{s['label']}"
    folder.mkdir(exist_ok=True)
    with open(folder / "samples.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["time", "node", "src", "zone", "rssi", "bars", "rtt_ms"])
        for smp in s["samples"]:
            w.writerow([time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(smp["t"])),
                        smp["node"], smp.get("src", ""), smp["spot"] or "", smp["rssi"],
                        smp.get("bars", ""), smp.get("rtt", "")])
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
            return self.send_json({**CONFIG, "spots": SPOTS, "ips": local_ips(), "udp_port": UDP_PORT})
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
                bars = body.get("bars")
                if bars is None:
                    return self.send_json({"ok": True})
                bars = max(0, min(4, int(bars)))
        if path == "/api/phone":
            ingest({"node_id": node, "zone": zone or "", "rssi": BARS_DBM[bars]}, src="phone",
                   extra={"bars": bars, "rtt": state.get("rtt", {}).get(node)})
            return self.send_json({"ok": True})
        with lock:
            s = state["session"]
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
