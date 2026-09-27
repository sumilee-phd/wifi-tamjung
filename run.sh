#!/bin/sh
# 와이파이 탐정단 강연 앱 실행 (macOS·Linux 개발용). 사용: ./run.sh [--virtual]
cd "$(dirname "$0")"
if [ "$1" = "--virtual" ]; then python3 tools/virtual_node.py --foil N3 & fi
python3 app/server.py
