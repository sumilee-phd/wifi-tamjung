# 와이파이 탐정단 강연 앱 실행 (Windows PowerShell)
# 사용: 저장소 폴더에서  .\run.ps1          실제 노드로 강연
#                       .\run.ps1 -Virtual  가상 노드 3대를 함께 띄워 시험
param([switch]$Virtual)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

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
& $py.Source app/server.py
