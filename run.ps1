# 와이파이 탐정단 강연 앱 실행 (Windows PowerShell)
# 사용: 저장소 폴더에서  .\run.ps1          실제 노드로 강연
#                       .\run.ps1 -Virtual  가상 노드 3대를 함께 띄워 시험
#                       .\run.ps1 -Live     공개 사이트 실시간 지도에도 구역별 값을 올림 (노트북 인터넷 필요)
param([switch]$Virtual, [switch]$Live)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 이미 켜져 있으면(예약 작업이 먼저 켰거나 두 번 실행) 서버를 또 띄우지 않고 화면만 연다.
# Windows는 같은 포트에 서버 두 개가 붙을 수 있어서, 그러면 노드 값이 두 서버로 나뉜다.
# 포트 목록 대신 실제로 응답하는지 묻는다(강제 종료 직후에는 주인 없는 포트 기록이 잠시 남는다).
$running = $false
try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8600/api/ping" -TimeoutSec 3 | Out-Null; $running = $true } catch { }  # localhost는 IPv6를 먼저 기다려 느리다
if ($running) {
  Write-Host "강연 앱이 이미 켜져 있습니다. 화면만 엽니다." -ForegroundColor Green
  Write-Host "실시간 공개 지도가 꺼진 채 켜져 있다면, 그 창을 닫고 .\run.ps1 -Live 로 다시 켜세요."
  Start-Process "http://localhost:8600"
  exit 0
}

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) { Write-Host "Python이 없습니다. python.org에서 3.10 이상을 설치하세요." -ForegroundColor Red; exit 1 }

# 방화벽: UDP 8601 인바운드 허용 규칙이 없으면 안내 (추가는 관리자 권한 필요)
if (-not (Get-NetFirewallRule -DisplayName "WifiTamjung UDP 8601" -ErrorAction SilentlyContinue)) {
  Write-Host "방화벽 규칙이 없습니다. 관리자 PowerShell에서 한 번만 실행하세요:" -ForegroundColor Yellow
  Write-Host '  New-NetFirewallRule -DisplayName "WifiTamjung UDP 8601" -Direction Inbound -Protocol UDP -LocalPort 8601 -Action Allow'
}

if ($Virtual) { Start-Process $py.Source -ArgumentList "tools/virtual_node.py --foil N3" }
Start-Process "http://localhost:8600"
$serverArgs = @("app/server.py")
if ($Live) { $serverArgs += "--live" }
& $py.Source @serverArgs
