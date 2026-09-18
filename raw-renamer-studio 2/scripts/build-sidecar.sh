#!/usr/bin/env bash
# ============================================================================
#  RAW Renamer Studio — сборка Python-sidecar (macOS, PyInstaller one-file)
#
#  Запуск:
#      npm run build:sidecar        (или ./scripts/build-sidecar.sh)
#
#  Результат:
#      src-tauri/binaries/raw-renamer-sidecar-<target-triple>   (~69 МБ)
#      → этот файл НЕ коммитится (в .gitignore), Tauri сам подхватит его
#        при `tauri build` (externalBin: binaries/raw-renamer-sidecar).
#
#  Скрипт также вызывается шагом 2 из scripts/build-macos.sh.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .build-venv
./.build-venv/bin/pip install --quiet --upgrade pip
./.build-venv/bin/pip install --quiet -r src-python/requirements.txt pyinstaller

# Spec ссылается на 'server.py' относительным путём → запускаемся из src-python/
(cd src-python && ../.build-venv/bin/pyinstaller --clean --noconfirm \
    --distpath dist --workpath build raw-renamer-sidecar.spec)
[ -f src-python/dist/raw-renamer-sidecar ] || {
    echo "ОШИБКА: sidecar не собран (нет src-python/dist/raw-renamer-sidecar)" >&2
    exit 1
}

# Target-triple: спрашиваем у rustc (он же собирает Tauri), фолбэк — uname
TRIPLE="$(rustc -vV 2>/dev/null | sed -n 's/^host: //p' || true)"
if [ -z "$TRIPLE" ]; then
  case "$(uname -sm)" in
    "Darwin arm64")  TRIPLE=aarch64-apple-darwin ;;
    "Darwin x86_64") TRIPLE=x86_64-apple-darwin ;;
    *) echo "ОШИБКА: не удалось определить target-triple: $(uname -sm)" >&2; exit 1 ;;
  esac
fi
case "$TRIPLE" in
  aarch64-apple-darwin|x86_64-apple-darwin) ;;
  *) echo "ОШИБКА: неподдерживаемый host: $TRIPLE (нужен macOS x86_64/arm64)" >&2; exit 1 ;;
esac

mkdir -p src-tauri/binaries
cp src-python/dist/raw-renamer-sidecar "src-tauri/binaries/raw-renamer-sidecar-${TRIPLE}"
echo "OK: src-tauri/binaries/raw-renamer-sidecar-${TRIPLE} ($(du -h "src-tauri/binaries/raw-renamer-sidecar-${TRIPLE}" | cut -f1))"
echo "Напоминание: бинарник не коммитится (src-tauri/binaries/ в .gitignore)."
