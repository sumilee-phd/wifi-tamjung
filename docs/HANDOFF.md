# 인계 문서

다른 컴퓨터에서 이 저장소를 받아 이어서 작업할 때 먼저 읽는다. 2026-09-27 기준.

## 한 줄 요약

10월 31일 안심도서관 강연 「와이파이 탐정단」용 강연 앱(노트북 핫스팟 + 탐정 폰 + ESP32로 시청각실 전파지도를 실시간으로 그림)과 공개 사이트(https://wifi-tamjung.vercel.app, 배포 완료)를 만들었다. 요구사항 전체는 [PRD.md](PRD.md), 슬라이드 원고는 [SLIDES.md](SLIDES.md).

## 받기와 실행

```powershell
git clone https://github.com/sumilee-phd/wifi-tamjung.git
cd wifi-tamjung
.\run.ps1 -Virtual        # 가상 노드·가상 폰으로 시험 (Python 3.10 이상만 있으면 됨)
```

- 스크립트 실행이 막히면: `powershell -ExecutionPolicy Bypass -File .\run.ps1 -Virtual`
- 발표 화면 http://localhost:8600 · 숫자 키 0~7 단계 이동 · 좌우 화살표·리모컨 다음 · N 신호 전환 · F 전체 화면
- 탐정 폰 페이지는 `/p` (발표 화면 QR)
- 방화벽(관리자 PowerShell에서 한 번): `New-NetFirewallRule -DisplayName "WifiTamjung UDP 8601" -Direction Inbound -Protocol UDP -LocalPort 8601 -Action Allow`
- macOS·Linux: `./run.sh --virtual`

## 파일 지도

| 경로 | 내용 |
|---|---|
| `app/server.py` | 수신 서버. 표준 라이브러리만. UDP 8601(ESP32), HTTP 8600(발표 화면, 폰 페이지, API) |
| `app/config.json` | 구역 5곳 좌표(강단·왼쪽 벽·가운데·오른쪽 벽·비상구 쪽), AP 위치, 단계별 시간, 사이트 주소 |
| `app/static/` | 발표 화면(`index.html`, `app.js`, `app.css`), 탐정 폰 페이지(`phone.html`), 오프라인 QR 라이브러리 |
| `shared/` | 전파 놀이터, 신호·속도 표시 규칙. 강연 앱과 공개 사이트가 함께 씀 |
| `site/` | 공개 사이트. 배포 때 `shared/`가 함께 복사됨(`vercel.json`) |
| `firmware/wifi_tamjung_node/` | ESP32 노드. `secrets.example.h`를 `secrets.h`로 복사해 핫스팟 이름·암호, 도서관 와이파이 이름 입력 |
| `tools/virtual_node.py` | 가상 ESP32·가상 폰 (`--phones N`, `--foil N2`) |
| `app/sessions/` | 강연 데이터 저장 폴더(저장소에 올라가지 않음) |

## 결정된 것

- 측정 대상 AP = 강연용 Windows 노트북의 모바일 핫스팟(2.4GHz, 연단 고정). 상위 연결은 휴대폰 USB 테더링.
- 참가자(탐정 대표) 폰이 주 노드. 핫스팟 동시 접속 최대 8대. ESP32는 보조와 호일 실험용.
- 구역 5곳. 활동은 시청각실 안 가벼운 자리 이동만.
- 세 가지 신호 비교: 우리 공유기 / 도서관 와이파이(ESP32가 접속 없이 스캔) / 휴대폰 데이터(폰 막대, 5G·LTE는 아이가 고름).
- 폰 페이지는 통신 세기·속도·방 안에 선택한 위치만 보낸다. 이름·GPS·통신사·IP 없음.
- 아이들 문구는 "숙제" 대신 "탐정 미션".
- 문구는 교수가 쓰는 용어로: 측정하다, 신호 세기, 강하다·약하다, 추정, 위치 선택, 전송. "재다·세다·짐작·콕 찍기·보냈어요" 같은 표현은 쓰지 않는다. 존댓말(해요체)은 유지.
- 강연에 학과 소개, ICT의 뜻, 전파 역사 네 장면, 진로 한 줄을 넣는다. 대구 이야기는 참고 메모로만.

## 남은 일

1. 강연용 노트북에서 핫스팟 시험: 와이파이 끈 상태 + USB 테더링으로 2.4GHz 핫스팟, 안드로이드·아이폰 QR 접속
2. 도서관 문의: 시청각실 사용 시각, 연령·정원, 콘센트·HDMI, 비상구 위치, 도서관 와이파이 이름
3. ESP32 펌웨어 업로드와 실습실 검증(10/17), 도서관 와이파이 스캔 확인
4. 강연 슬라이드 제작([SLIDES.md](SLIDES.md) 기준)
5. 운영 가이드 영상 7챕터 1차 녹화(10/17), 수정본(10/24)
6. 리허설 10/24, 동결 10/28

## 커밋 기록 (2026-09-27)

- `8a1681f` PRD 초안과 저장소 뼈대
- `a765e2f` PRD 0.2: ICT와 전파 역사, 진로 소개
- `667c073` 강연 앱 MVP: 수신 서버, 5구역 지도, 탐정 폰 페이지, 가상 노드, ESP32 펌웨어
- `2cc8049` 세 가지 신호 비교, 접속자 도트, 폰 자리 찍기와 속도 측정, 통신 세대 선택
- `5b66b40` 공개 사이트
- `d33569d` 공개 사이트 배포 주소 반영
- `a3b49ba` 숙제 대신 탐정 미션
