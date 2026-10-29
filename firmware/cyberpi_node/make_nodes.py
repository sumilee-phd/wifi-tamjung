# 사이버파이 노드 완성본 4개 생성 (저장소 밖에 쓴다)
# 실행: python make_nodes.py [hotspot.txt 경로] [출력 폴더]
#   기본 hotspot.txt: 저장소의 상위 폴더(C:/sumiWork/2026/1031_10월의하늘/hotspot.txt)
#   기본 출력 폴더:   같은 상위 폴더의 노드코드/
# hotspot.txt 형식(두 줄): SSID=이름 / PASS=암호. 선택: LIB=도서관 와이파이 이름
# 출력 파일은 핫스팟 암호를 담고 있으므로 저장소에 올리지 않는다.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CFG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PARENT, "hotspot.txt")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PARENT, "노드코드")
NODE_IDS = ["05", "06", "07", "08"]

if not os.path.exists(CFG):
    sys.exit("hotspot.txt 없음: " + CFG)
kv = {}
for line in open(CFG, encoding="utf-8"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        kv[k.strip().upper()] = v.strip()
ssid, pw, lib = kv.get("SSID", ""), kv.get("PASS", ""), kv.get("LIB", "")
if not ssid or len(pw) < 8:
    sys.exit("SSID 또는 PASS(8자 이상)가 비었습니다")
for ch in '"\\':
    if ch in ssid or ch in pw or ch in lib:
        sys.exit("이름·암호에 따옴표나 역슬래시는 쓸 수 없습니다")

tpl = open(os.path.join(HERE, "cyberpi_node.py"), encoding="utf-8").read()
os.makedirs(OUT, exist_ok=True)
for nid in NODE_IDS:
    s = tpl.replace("@@SSID@@", ssid).replace("@@PASS@@", pw).replace("@@NODE@@", nid)
    s = s.replace('LIBRARY_SSID = ""', 'LIBRARY_SSID = "%s"' % lib, 1)
    assert "@@" not in s
    path = os.path.join(OUT, "cyberpi_node_%s.py" % nid)
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("saved", path)
print("핫스팟:", ssid, "/ 도서관 와이파이:", lib or "(스캔 안 함)")
