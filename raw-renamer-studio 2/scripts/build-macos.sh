#!/usr/bin/env bash
# ============================================================================
#  RAW Renamer Studio — сборка десктоп-версии под macOS (.app + .dmg)
#
#  Запуск (из любой директории):
#      ./scripts/build-macos.sh
#
#  Результат:
#      src-tauri/target/release/bundle/macos/RAW Renamer Studio.app
#      src-tauri/target/release/bundle/dmg/RAW Renamer Studio_0.1.0_aarch64.dmg
#
#  Требуется (проверяется в шаге 1):
#      Xcode Command Line Tools (xcode-select --install)
#      Node.js 20+          → brew install node
#      Python 3.11+         → brew install python
#      Rust (rustup)        → https://rustup.rs
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say()  { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

say "1/4 Предусловия"
command -v node    >/dev/null 2>&1 || fail "node не найден. Установите: brew install node"
command -v python3 >/dev/null 2>&1 || fail "python3 не найден. Установите: brew install python"
command -v cargo   >/dev/null 2>&1 || fail "Rust не найден. Установите: https://rustup.rs"
xcode-select -p    >/dev/null 2>&1 || fail "Нет Xcode CLT. Выполните: xcode-select --install"
echo "node    $(node -v)"
echo "python3 $(python3 -V 2>&1)"
echo "cargo   $(cargo --version)"

say "2/4 Python sidecar → PyInstaller (onefile)"
python3 -m venv .build-venv
./.build-venv/bin/pip install --quiet --upgrade pip
./.build-venv/bin/pip install --quiet -r src-python/requirements.txt pyinstaller
./.build-venv/bin/pyinstaller --clean --noconfirm \
    --distpath src-python/dist --workpath src-python/build \
    src-python/sidecar.spec
[ -f src-python/dist/raw-renamer-sidecar ] || fail "sidecar не собран: src-python/dist/raw-renamer-sidecar"
echo "OK: src-python/dist/raw-renamer-sidecar ($(du -h src-python/dist/raw-renamer-sidecar | cut -f1))"

say "3/4 Бинарник в bundle под target-triple"
TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
case "$TRIPLE" in
  aarch64-apple-darwin) DST=raw-renamer-sidecar-aarch64-apple-darwin ;;
  x86_64-apple-darwin)  DST=raw-renamer-sidecar-x86_64-apple-darwin ;;
  *) fail "неожиданный host: $TRIPLE (поддерживаются x86_64/aarch64-apple-darwin)" ;;
esac
mkdir -p src-tauri/binaries
cp src-python/dist/raw-renamer-sidecar "src-tauri/binaries/$DST"
echo "OK: src-tauri/binaries/$DST"

say "4/4 Tauri build (Rust + веб-фронтенд + .dmg)"
npm install --no-audit --no-fund
npm run tauri build

say "ГОТОВО"
echo "Приложение:  src-tauri/target/release/bundle/macos/RAW Renamer Studio.app"
echo "Установщик:  src-tauri/target/release/bundle/dmg/"
ls -lh src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
echo
echo "Установка: откройте .dmg и перетащите приложение в /Applications."
