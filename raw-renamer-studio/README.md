# RAW Renamer Studio

Премиальное десктопное приложение каталогизации и пакетного переименования RAW-снимков
для предметных фотографов и операторов **Леман ПРО / Leroy Merlin**.

**Стек (master §7):** Tauri v2 (Rust) · React 18 + TypeScript + Tailwind CSS ·
Python FastAPI Sidecar (PyInstaller-бинарник).

Единый источник правды: [`docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md`](docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md) (VER. 3.0).

---

## Структура проекта (master §12)

```
raw-renamer-studio/
├── src/                      ← React + TS + Tailwind
│   ├── components/           ← Toolbar, VirtualGrid, ProductCard, RightPanel,
│   │                           StatusBar, RenameModal, BarcodeModal, ZayavkaModal,
│   │                           Lightbox, Toasts, Sidebar
│   ├── store/useSession.ts   ← Zustand: сессия, фильтры, план, тосты, heartbeat
│   ├── lib/sidecar.ts        ← JSON-RPC клиент + /preview URL + heartbeat 3 c
│   ├── lib/cx.ts, types.ts
│   ├── App.tsx, main.tsx, index.css
├── src-python/               ← Python FastAPI Sidecar
│   ├── server.py             ← /rpc (JSON-RPC 2.0), /preview/{hash}, /upload,
│   │                           SIDECAR_READY, watchdog 8 c
│   ├── raw_engine.py         ← встроенный JPEG из CR2/CR3/ARW/NEF (без демозаиска)
│   ├── scanner.py            ← 2-этапный ШК: OpenCV → ZXing-cpp → (PyZBar)
│   ├── excel_worker.py       ← openpyxl: читаем A/D, пишем L(12)/M(13),
│   │                           защита от блокировки Excel, атомарный save
│   ├── pim_builder.py        ← PIM CSV (UTF-16 LE BOM, tab) → заявка .xlsx/.csv
│   ├── renamer.py            ← двухфазный rename (.tmp_rename) + Undo-журнал
│   ├── lookup.py             ← каскад: Заявка → SQLite → APIM v3
│   ├── session.py            ← скан папки, группировка, план именования
│   └── requirements.txt
├── src-tauri/                ← Tauri v2 (Rust)
│   ├── Cargo.toml, tauri.conf.json, build.rs
│   └── src/ (main.rs, lib.rs, sidecar.rs — spawn + SIDECAR_READY)
├── tools/                    ← logcat.py (декодер логов), make_test_batch.py
│                                 (генератор тестовой партии — только для pytest)
├── .sidecar/port             ← динамический порт sidecar (dev-прокси)
├── .data/                    ← журнал .lm_rename_journal.json, SQLite-кэш
├── sidecar-proxy.ts, vite.config.ts, tailwind.config.ts
└── package.json
```

## Быстрый старт

### 1) Режим «в браузере» (dev-превью, без Tauri)

```bash
npm install
pip install -r src-python/requirements.txt

# терминал 1 — Python sidecar (динамический порт, протокол SIDECAR_READY):
python3 src-python/server.py --port 0 --port-file .sidecar/port \
  --data-dir .data --watchdog 0

# терминал 2 — фронтенд (Vite проксирует /rpc и /preview на порт из .sidecar/port):
npm run dev                                # http://localhost:5173
```

Откройте http://localhost:5173 → «Открыть папку…» — выберите папку с
RAW-файлами съёмки (партия откроется, демо-режима нет).

### 2) Десктоп-режим разработки (Tauri dev)

```bash
# Python-зависимости нужны system-wide (Rust запускает sidecar из исходников):
pip install -r src-python/requirements.txt

npm run tauri dev
```

Rust сам поднимет sidecar (`python3 src-python/server.py`, порт → событие
`sidecar://ready` → React), папки выбираются нативным диалогом.
Если Python живёт в venv — укажите его: `RAWRENAMER_PYTHON=/path/to/venv/bin/python npm run tauri dev`
(Windows: `$env:RAWRENAMER_PYTHON=".\.build-venv\Scripts\python.exe"`).

---

## Десктоп-установщики: macOS и Windows (ОДНА команда)

Финальная программа не зависит ни от браузера, ни от Python, установленного
у пользователя: Rust-бинарник Tauri + автономный sidecar (PyInstaller onefile).

### macOS → `.app` + `.dmg`

Одноразовые предпосылки:

| Что | Установка |
|---|---|
| Xcode Command Line Tools | `xcode-select --install` |
| Node.js 20+ | `brew install node` |
| Python 3.11+ | `brew install python` |
| Rust | <https://rustup.rs> |

Сборка:

```bash
./scripts/build-macos.sh
```

> **permission denied?** Распаковка архива через Finder сбрасывает права
> исполнения. Лечится: `chmod +x scripts/*.sh` — либо запуск через
> `bash scripts/build-macos.sh` (без chmod).

Результат:
- `src-tauri/target/release/bundle/macos/RAW Renamer Studio.app`
- `src-tauri/target/release/bundle/dmg/RAW Renamer Studio_0.1.0_<arch>.dmg`

Установка: открыть `.dmg`, перетащить в `/Applications`.
(Script сам соберёт sidecar в `.build-venv`, положит бинарник под нужный
target-triple — Apple Silicon / Intel — и вызовет `tauri build`.)

### Windows → NSIS-установщик `.exe`

Одноразовые предпосылки:

1. **Visual Studio Build Tools 2022** — workload «Desktop development with C++»
   (включая Windows 11 SDK): <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. `winget install OpenJS.NodeJS.LTS`
3. `winget install Python.Python.3.12`
4. `winget install Rustlang.Rustup` (MSVC по умолчанию — как надо)
5. `winget install NSIS.NSIS`

После установки — **открыть новый терминал** и:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Результат:
- `src-tauri\target\release\bundle\nsis\RAW Renamer Studio Setup 0.1.0.exe` (установщик)
- `src-tauri\target\release\RAW Renamer Studio.exe` (портативный запуск без установки)

### Windows-версия с macOS (кросс-компиляция, без Windows-машинки)

Если под рукой только Mac — Windows-установщик тоже собирается с мака:

```bash
./scripts/build-windows-from-macos.sh
```

Скрипт сам поставит через Homebrew `mingw-w64` + `nsis` + `wine`, поднимет
Windows Python 3.12 в изолированном Wine-префиксе, соберёт sidecar через
PyInstaller и кросскомпилирует Tauri под `x86_64-pc-windows-gnu`.
Первый запуск — 20–45 минут.

**Запасной путь** (если Wine/PyInstaller упрётся в ошибку): соберите только
sidecar-бинарник на любой Windows-машине/ВМ:

```powershell
python -m venv .build-venv
.\.build-venv\Scripts\pip install -r src-python\requirements.txt pyinstaller
.\.build-venv\Scripts\pyinstaller --clean --noconfirm src-python\sidecar.spec
Copy-Item src-python\dist\raw-renamer-sidecar.exe src-tauri\binaries\raw-renamer-sidecar-x86_64-pc-windows-gnu.exe
```

потом повторите `./scripts/build-windows-from-macos.sh` — он найдёт готовый
бинарник и пропустит Wine-шаги.

### Что делает скрипт (пошагово)

1. Проверяет toolchain (node / python / cargo / xcode-CLT или NSIS).
2. Создает `.build-venv`, ставит `requirements.txt` + `pyinstaller`,
   собирает `src-python/sidecar.spec` → `raw-renamer-sidecar[.exe]`.
3. Копирует бинарник в `src-tauri/binaries/raw-renamer-sidecar-<target-triple>
   [.exe]` (имя, которое Tauri ищет по `externalBin`).
4. `npm install && npm run tauri build`.

### Примечания

- Первый запуск приложения после установки чуть длиннее обычного — onefile
  sidecar распаковывает сам себя (~2–4 с); Rust ждёт `SIDECAR_READY`,
  интерфейс покажет «SIDECAR OFFLINE», пока sidecar не выйдет на связь,
  и переключится в рабочее состояние автоматически.
- Данные (журнал Undo, SQLite-кэш, загрузки) живут в домашней директории:
  Windows — `%LOCALAPPDATA%\RAW-Renamer-Studio`, macOS —
  `~/Library/Application Support/RAW Renamer Studio`.
- Иконки: `npm run tauri icon src-tauri/icons/icon.png` (базовая иконка уже
  в репозитории: `src-tauri/icons/`).
- Для разработки без сборки: `npm run tauri dev` (раздел выше).

## Протокол Sidecar (master §8)

| Метод | Назначение |
|---|---|
| `system.heartbeat` | ping каждые 3 c; >8 c молчания → sidecar `exit(0)` |
| `system.info` | версия, порт, движки ШК, размер кэша, APIM |
| `session.open_folder` | скан RAW, CV/NAMES, группировка, lookup |
| `session.get` / `session.set_zayavka` | состояние сессии, подмена заявки |
| `session.move_frame` | DnD-порядок ракурсов (определяет _01, _02…) |
| `session.set_frame_suffix` | кастомные суффиксы `_06`, `_com`, `_pack`, `_ins`, `_tag` |
| `session.apply_barcode` | ручной EAN-13 (проверка контрольной цифры) |
| `lookup.find_sku` | каскад: Заявка (A/D) → SQLite → APIM v3 |
| `zayavka.generate` | PIM CSV → заявка .xlsx (21 кол. A..U) |
| `renamer.plan` | план: `_y`, главный без суффикса, `_01..NN` |
| `renamer.execute` | двухфазный rename + запись L(12)/M(13) + журнал |
| `renamer.undo` | 1-Click Undo: имена + ячейки L/M |
| `renamer.retry_xlsx` | «Повторить» после снятия блокировки Excel |
| `renamer.journal` | содержимое `.lm_rename_journal.json` |
| `file.download` | b64-скачивание сгенерированного файла |

HTTP: `GET /preview/{file_hash}?size=` (встроенный JPEG), `POST /upload`.

## Ключевые правила (master)

- **Превью:** только встроенный JPEG (FFD8…FFD9) из контейнера — НИКАКОГО демозаиска.
- **Excel:** колонки A(1)=Код LM, D(4)=GTIN; запись L(12)=Итого ракурсов (без `_y`),
  M(13)=1/0 флаг `_y`. Блокировка Excel → «Закройте файл в Excel и нажмите «Повторить»».
- **Именование:** `<арт>_y` (этикетка) · `<арт>` (главный, СТРОГО без суффикса) ·
  `<арт>_01…` · спец. `_com/_pack/_ins/_tag`.
- **Сортировка кадров:** по натуральным числам (regex `\d+`), не лексикографически.
- **Коллизии:** проверка до rename; циклы 1→2/2→1 → двухфазно через `.tmp_rename`.
- **GPU:** `backdrop-filter: blur()` только в модалках/плавающих тостах; внутри карточек — запрещён.

## Тесты

`python3 -m pytest tests/` — 80 тестов (парсер PIM 24, RPC-контракт sidecar 52,
производительность 4). Тестовая партия (6 товаров, 22 «RAW» `.CR2` со встроенным
JPEG, PIM-CSV, заявка xlsx) генерируется `tools/make_test_batch.py` в tmp-каталог
на каждом запуске pytest — в репозитории демо-данных нет. Первый кадр каждого
товара — этикетка с **настоящим** EAN-13 (распознаётся OpenCV/ZXing), заявка
собрана через тот же `pim_builder`, что использует продакшен.
