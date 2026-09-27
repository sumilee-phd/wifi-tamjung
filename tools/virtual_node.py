"""가상 측정 노드. 실제 ESP32 없이 강연 앱을 시험한다.

예)
  python tools/virtual_node.py                       # N1~N3, 1초마다 전송
  python tools/virtual_node.py --nodes N1 N2 --foil N2   # N2는 20초마다 8초씩 끊김(호일 실험)
  python tools/virtual_node.py --host 192.168.137.1
  python tools/virtual_node.py --nodes --phones 5         # 측정 노드 없이 가상 폰 5대(구역 자동 배정)

노드마다 기준값에서 천천히 움직이는 값에 잡음(±3dB)과 가끔 튀는 값(−20dB)을 섞어 보낸다.
"""
import argparse
import json
import random
import socket
import time
import urllib.request

ZONES = {"ST": 4, "LW": 3, "CT": 2, "RW": 2, "EX": 1}  # 가상 폰 구역별 대표 막대 수


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8601)
    p.add_argument("--nodes", nargs="*", default=["N1", "N2", "N3"])
    p.add_argument("--phones", type=int, default=0, help="가상 폰 대수 (HTTP /api/phone)")
    p.add_argument("--http", type=int, default=8600)
    p.add_argument("--interval", type=float, default=1.0)
    p.add_argument("--foil", nargs="*", default=[], help="주기적으로 끊기는 노드")
    a = p.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(0.3)
    base = {n: random.uniform(-72, -45) for n in a.nodes}
    t0 = time.time()
    url = f"http://{a.host}:{a.http}"

    def post(path, body):
        req = urllib.request.Request(url + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2) as r:
            return json.loads(r.read())

    phones = []
    for i in range(a.phones):
        pid = post("/api/phone/join", {})["id"]
        phones.append((pid, list(ZONES)[i % len(ZONES)]))
    if phones:
        print("가상 폰:", ", ".join(f"{p}({z})" for p, z in phones))
    print(f"{a.host}:{a.port} 로 {', '.join(a.nodes)} 전송 시작 (Ctrl+C로 종료)")
    while True:
        for n in a.nodes:
            if n in a.foil and (time.time() - t0) % 20 > 12:
                continue  # 호일에 싸여 전송 자체가 안 되는 구간
            base[n] = max(-85, min(-38, base[n] + random.uniform(-0.6, 0.6)))
            v = base[n] + random.uniform(-3, 3)
            if random.random() < 0.05:
                v -= 20
            msg = {"node_id": n, "zone": "--", "rssi": int(round(max(-100, v)))}
            sock.sendto(json.dumps(msg).encode(), (a.host, a.port))
            try:
                sock.recvfrom(16)
            except socket.timeout:
                print(f"{n}: 서버 응답 없음")
        for pid, z in phones:
            bars = max(0, min(4, ZONES[z] + random.choice([0, 0, 0, 1, -1])))
            try:
                post("/api/phone", {"id": pid, "zone": z, "bars": bars, "rtt": random.uniform(4, 40)})
            except OSError:
                print(f"{pid}: 서버 응답 없음")
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
