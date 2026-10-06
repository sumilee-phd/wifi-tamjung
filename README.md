# 와이파이 탐정단

도서관의 숨은 전파를 찾아라! 10월의 하늘 2026 재능기부 과학강연 「와이파이 탐정단」의 강연 앱, 공개 사이트, 측정 노드 코드를 담는 저장소입니다.

- 강연: 2026-10-31(토) 15:00~15:50, 경기 김포시양곡도서관. 대구 안심도서관(14:00) → 김포시양곡도서관(10-03) → 김포시양곡도서관(10-06)으로 변경
- 공개 사이트: https://wifi-tamjung.vercel.app
- 지난 강연: 2025 「소리의 과학」 https://oct-sky2025.vercel.app

## 무엇을 만드나

| 구성 | 설명 |
|---|---|
| 강연 앱 | 강연자 노트북의 핫스팟에 붙은 측정 노드가 보낸 와이파이 신호세기로 강연장 전파지도를 실시간으로 그립니다. 인터넷 없이 동작합니다 |
| 공개 사이트 | 강연 소개, 전파 놀이터, 우리 집 와이파이 명당 찾기, 완성된 도서관 전파지도 |
| 측정 노드 | ESP32 DevKit. 1초마다 신호세기를 UDP로 보냅니다 |

자세한 요구사항은 [docs/PRD.md](docs/PRD.md), 다른 컴퓨터에서 이어서 작업할 때는 [docs/HANDOFF.md](docs/HANDOFF.md), 강연 슬라이드 원고는 [docs/SLIDES.md](docs/SLIDES.md).

## 만든 사람

이수미 · ICT폴리텍대학 정보통신학과

## 실행

강연용 Windows 노트북(Python 3.10 이상, 추가 설치 없음):

```powershell
.\run.ps1            # 실제 노드·폰으로 강연
.\run.ps1 -Virtual   # 가상 노드로 시험
```

macOS·Linux 개발용: `./run.sh --virtual`

- 발표 화면: http://localhost:8600 (숫자 키 0~7로 단계 이동, 좌우 화살표·리모컨으로 다음, F 전체 화면)
- 탐정 폰: 핫스팟 접속 후 대기 화면의 QR (`/p`)
- 측정 노드 펌웨어: `firmware/wifi_tamjung_node/` (secrets.example.h를 secrets.h로 복사해 핫스팟 이름·암호 입력)

## 공개 사이트 (wifi-tamjung.vercel.app)

`site/`가 원본이고, 배포 때 `shared/`(전파 놀이터·신호 규칙)를 함께 복사합니다(`vercel.json`).
Vercel에서 이 저장소를 가져오면(Import) 설정 없이 그대로 배포됩니다. 프로젝트 이름은 `wifi-tamjung`.
