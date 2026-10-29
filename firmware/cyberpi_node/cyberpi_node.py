# 와이파이 탐정단 측정 노드 (사이버파이 CyberPi, mBlock 5 업로드 모드용)
#
# 역할: 강연자 노트북의 모바일 핫스팟에 접속해, 그 핫스팟의 신호세기(RSSI)를 1초마다
#       UDP 8601로 보낸다. 서버 주소는 핫스팟 게이트웨이(노트북)로 자동 설정된다.
#       서버는 app/server.py, 한 줄 JSON {"node_id","zone","rssi"} (응답 "ok").
#       LIBRARY_SSID를 적으면 5초마다 주변을 스캔해 도서관 와이파이 세기를 lib_rssi로 함께 보낸다
#       (접속하지 않으므로 암호·로그인이 필요 없다).
#
# 화면: 노드 번호, 구역, 세기(dBm)와 막대, 전송 횟수. LED는 세기에 따라 초록·노랑·빨강.
# 호일로 감싸면 전송이 끊기고, 서버 화면에는 3초 뒤 "신호 끊김"으로 뜬다.
#
# 조작:
#   A 버튼: 이전 구역   B 버튼: 다음 구역   (강단 → 왼쪽 벽 → 가운데 → 오른쪽 벽 → 비상구 쪽)
#   조이스틱 클릭: 전송 잠시 멈춤 / 다시 시작 (자리를 옮기는 동안)
#   강연 앱에서 노드 위치를 지정하면 그 값이 우선이고, 없으면 기기에서 고른 구역이 쓰인다.
#
# 업로드: 이 파일은 틀이다. 저장소 밖의 hotspot.txt로 make_nodes.py를 돌리면
#         기기별(05~08) 완성본이 노드코드/ 폴더에 생긴다. 그 파일을 mBlock 5 → 사이버파이 연결 →
#         업로드 모드 → Python 편집기에 붙여 넣고 업로드한다. 핫스팟 이름·암호는 저장소에 올리지 않는다.
#
# 검증된 API(사이버파이 MicroPython 44.01.008, 2026-08 실습실·KIPEE 노드): network.WLAN 접속·scan(),
#   socket UDP 전송·응답 수신, cyberpi.console.println/clear, cyberpi.controller.is_press("a"/"b"/"middle").
#   wlan.status("rssi")는 기기에 따라 없을 수 있어 실패하면 스캔으로 대신한다.

HOTSPOT_SSID = "@@SSID@@"       # make_nodes.py가 채움
HOTSPOT_PASS = "@@PASS@@"       # make_nodes.py가 채움
NODE_ID = "@@NODE@@"            # 본체 스티커 번호와 같게 (05, 06, 07, 08)
LIBRARY_SSID = ""               # 도서관 와이파이 이름. 비우면 스캔하지 않음
START_ZONE = "ST"               # 켜자마자 이 구역
PERIOD = 1.0                    # 전송 주기(초)
SCAN_EVERY = 5.0                # 도서관 와이파이 스캔 주기(초)
UDP_PORT = 8601

import time
import network
import socket
import cyberpi

ZONES = ["ST", "LW", "CT", "RW", "EX"]
ZONE_NAME = {"ST": "강단", "LW": "왼쪽 벽", "CT": "가운데", "RW": "오른쪽 벽", "EX": "비상구 쪽"}
BARS_DBM = [-90, -80, -70, -60, -50]   # 서버 config.json phone_bars_dbm과 같은 눈금

wlan = None
server_ip = None
sent_ok = 0
last_err = ""
lib_rssi = None
lib_at = 0
use_status = True


def led(color):
    rgb = {"green": (0, 80, 0), "yellow": (120, 90, 0), "red": (120, 0, 0),
           "blue": (0, 0, 120), "off": (0, 0, 0)}[color]
    try:
        cyberpi.led.on(rgb[0], rgb[1], rgb[2])
    except Exception:
        pass


def connect_wifi():
    """핫스팟에 붙고 게이트웨이(노트북)를 서버 주소로 잡는다. 성공하면 True."""
    global wlan, server_ip
    if wlan is None:
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
    if not wlan.isconnected():
        led("blue")
        cyberpi.console.clear()
        cyberpi.console.println("노드 " + NODE_ID)
        cyberpi.console.println("핫스팟 접속중")
        cyberpi.console.println(HOTSPOT_SSID)
        try:
            wlan.connect(HOTSPOT_SSID, HOTSPOT_PASS)
        except Exception:
            pass
        for _ in range(20):
            if wlan.isconnected():
                break
            time.sleep(1)
    if not wlan.isconnected():
        cyberpi.console.println("접속 실패, 재시도")
        led("red")
        return False
    cfg = wlan.ifconfig()
    server_ip = cfg[2]
    cyberpi.console.println("IP " + cfg[0])
    cyberpi.console.println("서버 " + server_ip)
    return True


def ssid_of(ap):
    return ap[0].decode() if isinstance(ap[0], bytes) else str(ap[0])


def rssi_once():
    """접속 중인 핫스팟의 세기(dBm). status('rssi')가 없으면 스캔에서 같은 이름을 고른다."""
    global use_status
    if use_status:
        try:
            v = wlan.status("rssi")
            if isinstance(v, int) and -100 < v < 0:
                return v
        except Exception:
            pass
        use_status = False
    best = None
    try:
        for ap in wlan.scan():
            if ssid_of(ap) == HOTSPOT_SSID and (best is None or ap[3] > best):
                best = ap[3]
    except Exception:
        pass
    return best


def scan_library():
    """도서관 와이파이 중 가장 센 값을 lib_rssi에 둔다(접속하지 않음)."""
    global lib_rssi, lib_at
    if not LIBRARY_SSID:
        return
    best = None
    try:
        for ap in wlan.scan():
            if ssid_of(ap) == LIBRARY_SSID and (best is None or ap[3] > best):
                best = ap[3]
    except Exception:
        return
    if best is not None:
        lib_rssi = best
        lib_at = time.time()


def send(zone, rssi):
    global last_err
    body = '{"node_id":"%s","zone":"%s","rssi":%d' % (NODE_ID, zone, rssi)
    if lib_rssi is not None and time.time() - lib_at < 12:
        body += ',"lib_rssi":%d' % lib_rssi
    body += "}"
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(1)
    try:
        s.sendto(body.encode(), (server_ip, UDP_PORT))
        try:
            resp, _ = s.recvfrom(64)
        except AttributeError:
            resp = s.recv(64)
        ok = (b"ok" in resp) or (b"200" in resp)
        last_err = "" if ok else "응답 이상"
        return ok
    except Exception as e:
        last_err = type(e).__name__
        return False
    finally:
        s.close()


def bars(rssi):
    n = 0
    for th in BARS_DBM:
        if rssi >= th:
            n += 1
    return min(n, 4)


def show(zone, rssi, paused):
    cyberpi.console.clear()
    cyberpi.console.println("노드 %s  %s" % (NODE_ID, ZONE_NAME[zone]))
    if paused:
        cyberpi.console.println("전송 멈춤 (클릭=재개)")
    elif rssi is None:
        cyberpi.console.println("세기 읽기 실패")
    else:
        b = bars(rssi)
        cyberpi.console.println("%d dBm  %s%s" % (rssi, "#" * b, "." * (4 - b)))
    if lib_rssi is not None and LIBRARY_SSID:
        cyberpi.console.println("도서관 %d dBm" % lib_rssi)
    cyberpi.console.println("전송 %d회%s" % (sent_ok, ("  " + last_err) if last_err else ""))
    cyberpi.console.println("A/B 구역  클릭 멈춤")


def main():
    global sent_ok
    cyberpi.console.clear()
    while not connect_wifi():
        time.sleep(2)
    zone_idx = ZONES.index(START_ZONE)
    paused = False
    last_send = 0
    last_scan = 0
    show(ZONES[zone_idx], None, paused)
    while True:
        if cyberpi.controller.is_press("a"):
            zone_idx = (zone_idx - 1) % len(ZONES)
            show(ZONES[zone_idx], None, paused)
            time.sleep(0.3)
        if cyberpi.controller.is_press("b"):
            zone_idx = (zone_idx + 1) % len(ZONES)
            show(ZONES[zone_idx], None, paused)
            time.sleep(0.3)
        if cyberpi.controller.is_press("middle"):
            paused = not paused
            led("off" if paused else "blue")
            show(ZONES[zone_idx], None, paused)
            time.sleep(0.4)
        now = time.time()
        if not paused and now - last_send >= PERIOD:
            last_send = now
            if not wlan.isconnected():
                led("red")
                connect_wifi()
                continue
            v = rssi_once()
            if v is None:
                led("red")
            else:
                if send(ZONES[zone_idx], v):
                    sent_ok += 1
                    led("green" if bars(v) >= 3 else ("yellow" if bars(v) >= 2 else "red"))
                else:
                    led("red")
            show(ZONES[zone_idx], v, paused)
            if LIBRARY_SSID and now - last_scan >= SCAN_EVERY:
                last_scan = now
                scan_library()
        time.sleep(0.05)


main()
