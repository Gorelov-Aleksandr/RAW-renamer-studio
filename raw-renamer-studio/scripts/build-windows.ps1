# ============================================================================
#  RAW Renamer Studio — сборка десктоп-версии под Windows (.exe установщик)
#
#  Запуск (PowerShell, из любой директории):
#      powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#
#  Результат:
#      src-tauri\target\release\RAW Renamer Studio.exe        (портативный)
#      src-tauri\target\release\bundle\nsis\RAW Renamer Studio Setup 0.1.0.exe
#
#  Требуется (проверяется в шаге 1):
#      1. Visual Studio Build Tools 2022 — workload «Desktop development
#         with C++» (включая Windows 11 SDK):
#         https://visualstudio.microsoft.com/visual-cpp-build-tools/
#      2. Node.js 20+            → winget install OpenJS.NodeJS.LTS
#      3. Python 3.11+           → winget install Python.Python.3.12
#      4. Rust (rustup, MSVC)    → winget install Rustlang.Rustup
#      5. NSIS                   → winget install NSIS.NSIS
# ============================================================================
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Say($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Magenta }
function Fail($m) { Write-Host ""; Write-Host "ОШИБКА: $m" -ForegroundColor Red; exit 1 }

Say "1/4 Предусловия"
foreach ($c in @('node','python','cargo','nsis')) {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) {
        $hint = switch ($c) {
            'node'   { 'winget install OpenJS.NodeJS.LTS' }
            'python' { 'winget install Python.Python.3.12' }
            'cargo'  { 'winget install Rustlang.Rustup' }
            'nsis'   { 'winget install NSIS.NSIS' }
        }
        Fail "не найдено: $c → установите ($hint), затем ОТКРОЙТЕ НОВЫЙ терминал"
    }
    Write-Host ("{0,-8} {1}" -f $c, ((Get-Command $c).Source))
}
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "Примечание: cl.exe не в PATH — это нормально, если вы запускаете скрипт из обычного PowerShell (Rust сам найдёт MSVC через vcvars)." -ForegroundColor Yellow
}

Say "2/4 Python sidecar → PyInstaller (onefile)"
python -m venv .build-venv
& .\.build-venv\Scripts\python.exe -m pip install --quiet --upgrade pip
& .\.build-venv\Scripts\python.exe -m pip install --quiet -r src-python\requirements.txt pyinstaller
& .\.build-venv\Scripts\pyinstaller.exe --clean --noconfirm `
    --distpath src-python\dist --workpath src-python\build `
    src-python\raw-renamer-sidecar.spec
if (-not (Test-Path src-python\dist\raw-renamer-sidecar.exe)) {
    Fail "sidecar не собран: src-python\dist\raw-renamer-sidecar.exe"
}
Write-Host "OK: src-python\dist\raw-renamer-sidecar.exe"

Say "3/4 Бинарник в bundle под target-triple"
$tripleLine = (rustc -vV | Select-String -Pattern '^host:').Matches[0].Value
$triple = $tripleLine.Split(' ')[1]
if ($triple -ne 'x86_64-pc-windows-msvc') {
    Fail "неожиданный host: $triple (нужен x86_64-pc-windows-msvc — установите rustup в обычном порядке)"
}
New-Item -ItemType Directory -Force src-tauri\binaries | Out-Null
Copy-Item src-python\dist\raw-renamer-sidecar.exe "src-tauri\binaries\raw-renamer-sidecar-$triple.exe" -Force
Write-Host "OK: src-tauri\binaries\raw-renamer-sidecar-$triple.exe"

Say "4/4 Tauri build (Rust + веб-фронтенд + NSIS)"
npm install --no-audit --no-fund
npm run tauri build

Say "ГОТОВО"
Write-Host "Установщик: src-tauri\target\release\bundle\nsis\" -ForegroundColor Green
Get-ChildItem src-tauri\target\release\bundle\nsis\*.exe -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host ("  " + $_.Name + "  (" + [math]::Round($_.Length/1MB,1) + " MB)") }
Write-Host ""
Write-Host "Запуск без установки: src-tauri\target\release\RAW Renamer Studio.exe"
