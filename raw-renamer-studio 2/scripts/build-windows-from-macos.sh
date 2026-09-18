#!/usr/bin/env bash
# ============================================================================
#  RAW Renamer Studio — Windows-версия С МАКА (кросс-компиляция)
#
#  Собирает NSIS-установщик .exe, не имея под рукой Windows:
#    - Rust/Tauri → кросс-компиляция через mingw-w64 (x86_64-pc-windows-gnu)
#    - NSIS-установщик → makensis из Homebrew
#    - Python sidecar → Windows-Python под Wine + PyInstaller
#
#  Запуск:
#      ./scripts/build-windows-from-macos.sh
#
#  Результат:
#      src-tauri/target/x86_64-pc-windows-gnu/release/RAW Renamer Studio.exe   (портативный)
#      src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/RAW Renamer Studio Setup 0.1.0.exe
#
#  Длительность: 20–45 мин (первый запуск: Rosetta, Wine, pip, cargo).
#
#  ЗАПАСНОЙ ПУТЬ (если Wine/PyInstaller не удался): соберите ТОЛЬКО
#  sidecar-бинарник на любой Windows-машине (3 команды, см. README), скопируйте
#  его в src-tauri/binaries/raw-renamer-sidecar-x86_64-pc-windows-gnu.exe и
#  повторите скрипт — Wine-шаги будут пропущены автоматически.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say()  { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

PY_WIN_VERSION="3.12.4"
PY_WIN_URL="https://www.python.org/ftp/python/${PY_WIN_VERSION}/python-${PY_WIN_VERSION}-amd64.exe"
WINPY='C:\Python312'
WINEPREFIX_DEFAULT="$HOME/.wine-rawrenamer"
SIDECAR_BIN=src-tauri/binaries/raw-renamer-sidecar-x86_64-pc-windows-gnu.exe

command -v brew >/dev/null 2>&1 || fail "Homebrew не найден: https://brew.sh"
command -v rustup >/dev/null 2>&1 || fail "Rust не найден: https://rustup.rs"
command -v node    >/dev/null 2>&1 || fail "node не найден: brew install node"
rustup target add x86_64-pc-windows-gnu

SKIP_WINE=0
if [[ -f "$SIDECAR_BIN" ]]; then
  SKIP_WINE=1
  echo "Обнаружен готовый sidecar.exe: $SIDECAR_BIN — Wine-шаги пропускаются."
else
  say "0/6 Apple Silicon: Rosetta 2 (нужен для x86-версии Wine)"
  if [[ "$(uname -m)" == "arm64" ]] && ! /usr/bin/pgrep -q oahd; then
    echo "Устанавливаю Rosetta 2 (может запросить пароль)…"
    sudo softwareupdate --install-rosetta --agree-to-license || true
  fi

  say "1/6 Homebrew: mingw-w64, nsis, wine"
  for p in mingw-w64 nsis; do
    brew list --quiet "$p" >/dev/null 2>&1 || brew install "$p"
  done
  if ! command -v wine >/dev/null 2>&1 && ! command -v wine-stable >/dev/null 2>&1; then
    brew install --cask wine-stable
  fi
  WINE_BIN="$(command -v wine || command -v wine-stable)"
  echo "mingw:  $(x86_64-w64-mingw32-gcc --version | head -1)"
  echo "nsis:   $(makensis -VERSION)"
  echo "wine:   $($WINE_BIN --version 2>/dev/null | head -1 || true)"

  say "2/6 Windows Python ${PY_WIN_VERSION} под Wine (изолированный префикс)"
  export WINEPREFIX="${WINEPREFIX:-$WINEPREFIX_DEFAULT}"
  export WINEARCH=win64
  export WINEDEBUG=-all
  mkdir -p "$WINEPREFIX"
  PY_INSTALLER="$ROOT/py-installer-win.exe"
  if [[ ! -f "$PY_INSTALLER" ]]; then
    echo "Скачиваю установщик Python (Windows amd64)…"
    curl -fL -o "$PY_INSTALLER" "$PY_WIN_URL"
  fi
  if ! "$WINE_BIN" cmd /c "if exist C:\\Python312\\python.exe echo YES" 2>/dev/null | grep -q YES; then
    echo "Инициализирую Wine (первый раз — пара минут)…"
    "$WINE_BIN" wineboot --init >/dev/null 2>&1 || true
    echo "Ставлю Windows Python в C:\\Python312…"
    "$WINE_BIN" "$PY_INSTALLER" /quiet InstallAllUsers=0 TargetDir="$WINPY"
    rm -f "$PY_INSTALLER"
  fi
  "$WINE_BIN" "${WINPY}\\python.exe" -V

  say "3/6 Sidecar под Windows: venv + PyInstaller"
  WINVENV="$ROOT/winvenv"
  if [[ ! -f "$WINVENV/Scripts/python.exe" ]]; then
    "$WINE_BIN" "${WINPY}\\python.exe" -m venv "$WINVENV"
  fi
  WINEPY="$WINVENV/Scripts/python.exe"
  "$WINE_BIN" "$WINEPY" -m pip install --quiet --upgrade pip
  "$WINE_BIN" "$WINEPY" -m pip install --quiet -r src-python/requirements.txt pyinstaller
  "$WINE_BIN" "$WINEPY" -m PyInstaller --clean --noconfirm \
      --distpath src-python/dist --workpath src-python/build-win \
      src-python/sidecar.spec
  [[ -f src-python/dist/raw-renamer-sidecar.exe ]] || \
    fail "sidecar.exe не собран (Wine/PyInstaller). См. 'ЗАПАСНОЙ ПУТЬ' в начале скрипта."
  echo "OK: src-python/dist/raw-renamer-sidecar.exe ($(du -h src-python/dist/raw-renamer-sidecar.exe | cut -f1))"
  mkdir -p src-tauri/binaries
  cp src-python/dist/raw-renamer-sidecar.exe "$SIDECAR_BIN"
fi

say "Бинарник в bundle (target-triple: x86_64-pc-windows-gnu)"
[[ -f "$SIDECAR_BIN" ]] || fail "$SIDECAR_BIN отсутствует"
echo "OK: $SIDECAR_BIN"

# Кросс-линковка для mingw (влияет только на цель windows-gnu, не на macOS)
mkdir -p src-tauri/.cargo
if ! grep -q "x86_64-pc-windows-gnu" src-tauri/.cargo/config.toml 2>/dev/null; then
  cat > src-tauri/.cargo/config.toml <<'EOF'
# Кросс-сборка Windows с macOS/Linux (влияет только на цель windows-gnu).
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
rustflags = ["-C", "target-feature=+crt-static"]
EOF
fi

say "npm + Tauri build (кросс: x86_64-pc-windows-gnu)"
npm install --no-audit --no-fund
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis

say "ГОТОВО"
REL=src-tauri/target/x86_64-pc-windows-gnu/release
echo "Установщик:   $REL/bundle/nsis/"
ls -lh "$REL"/bundle/nsis/*.exe 2>/dev/null || true
echo "Портативный:  $REL/RAW Renamer Studio.exe"
