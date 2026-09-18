# RAW Renamer Studio — AI Agent Master
# Compact spec for AI agents. Each section = one subsystem.

## META
Product: Desktop RAW photo renamer for Leroy Merlin studio photographers
Stack: Tauri v2 + React 18 + TS + Tailwind 3 + Python FastAPI sidecar
User: Russian-speaking, macOS primary (сборка на маке пользователя), Windows later
Version: 0.1.0 (v3.5)
ВАЖНО (v3.5): ДЕМО НЕТ. Ни демо-режима, ни демо-данных, ни автооткрытия —
продукт используется как полноценный инструмент. Тестовые данные генерируются
on-the-fly в tmp (tools/make_test_batch.py), в репо не лежат.

## ARCHITECTURE
Tauri (src-tauri/src/sidecar.rs) поднимает Python sidecar и держит супервизор:
  * release — бинарник PyInstaller one-file из externalBin
    (src-tauri/binaries/raw-renamer-sidecar-<triple>, НЕ в git — лимит GitHub 25 МБ);
  * dev — python3 src-python/server.py (env RAWRENAMER_PYTHON);
  * stdout-поток парсит SIDECAR_READY / SIDECAR_BOOT → события во фронтенд;
  * авто-рестарт ≤3 (сброс после 5 мин стабильности), kill-on-exit (D1, зомби не
    остаётся), ранний выход без ретраев если бинарника нет (ЗАМ-004);
  * invoke: sidecar_url, sidecar_status, sidecar_error (опрос последней ошибки —
    гонка «событие улетело до подписки»).
Frontend ↔ sidecar:
  * release: прямой http://127.0.0.1:<port>; initSidecar — probe ДО listen
    (BUG-015), backoff-poll 250мс→3с, heartbeat 3с только после URL,
    grace 10с после URL/READY (не «вздрагивает» offline на холодном старте);
  * dev (браузер): относительные /rpc /preview /upload → Vite-прокси
    (sidecar-proxy.ts, порт из .sidecar/port, читаем на каждый запрос);
  * JSON-RPC 2.0 POST /rpc; Preview GET /preview/{hash}?size=N;
    Upload POST /upload multipart (file[, dir]);
  * Python watchdog: 8с без heartbeat → exit(0) (супервизор перезапустит).
Состояния движка в UI (ЗАМ-001): starting («Запуск движка…», 3–10 с — норма,
нейтральный вид) → online («онлайн») → offline («движок не отвечает»).
Прогресс запуска (v3.5): sidecar печатает SIDECAR_BOOT {stage: imports|listen},
Rust шлёт sidecar://progress (0=запущен, 1=импорты, 2=слушает, 3=READY) →
в шапке спиннер + 4-сегментный прогресс.
Persist: data_dir/settings.json (APIM env/enabled/customerId) +
last_session.json (папка+заявка, восстанавливаются после рестарта).
macOS data_dir: ~/Library/Application Support/RAW Renamer Studio.
Логирование: JSONL sidecar (rrslog.py, ротация gzip 5МБ×3) + FE logger.ts
(батчи POST /log, корреляция X-RRS-Session) + CLI-декодер tools/logcat.py.
Тосты: dedup — одинаковый (kind+title+sub) не чаще раза в 3 с (ЗАМ-002).

## FILE TREE (raw-renamer-studio/ — вложен в корень репо, ~75 файлов)
```
raw-renamer-studio/
├── package.json (scripts: dev, build, tauri, build:sidecar, sidecar)
├── vite.config.ts + sidecar-proxy.ts (dev-прокси /rpc /preview /upload)
├── tailwind.config.ts (colors: base, panel, surface, accent, warm, ok, warn, danger)
├── src/
│   ├── App.tsx (Header + спиннер запуска + Sidebar + Toolbar + VirtualGrid +
│   │            RightPanel + StatusBar + модальные окна + хоткеи ⌘Z/⌘K/⌘O/F)
│   ├── index.css (Tailwind + scrollbar + .mono-tag + .spinner)
│   ├── lib/ (cx.ts, sidecar.ts — клиент движка, logger.ts, ops.ts, pickFolder.ts)
│   ├── store/useSession.ts (Zustand: всё состояние, engineState, bootStage)
│   ├── types.ts (Frame, Item, SessionData, PlanRow, SystemInfo — БЕЗ demo)
│   └── components/ (17: Sidebar (collapse → рельс+кнопка разворота), Toolbar,
│                     StatusBar, VirtualGrid, ProductCard, RightPanel,
│                     SettingsModal, ZayavkaModal, RenameModal, BarcodeModal,
│                     Lightbox, Toasts, AppMenu, CommandPalette, AboutModal,
│                     HelpModal, Logo)
├── src-tauri/
│   ├── Cargo.toml, build.rs, tauri.conf.json (bundle: app, dmg — БЕЗ nsis)
│   ├── capabilities/default.json (NSOpenPanel и пр.)
│   └── src/ (main.rs, lib.rs, sidecar.rs — panic-free supervisor)
├── src-python/
│   ├── server.py (FastAPI: /rpc, /preview, /upload, /log; SIDECAR_BOOT маркеры)
│   ├── scanner.py (OpenCV → ZXing → PyZBar, все движки опциональны)
│   ├── session.py, renamer.py (2-фазное переименование + undo-журнал ≤100)
│   ├── excel_worker.py (read A/D, write L/M, атомарный save)
│   ├── pim_builder.py (CSV→xlsx, автодетект кодировки)
│   ├── lookup.py (заявка → SQLite-кэш → APIM v3)
│   ├── raw_engine.py (mmap RAW, встроенный JPEG, file_hash)
│   ├── rrslog.py (JSONL + ротация), session.py, excel_worker.py
│   ├── requirements.txt
│   └── raw-renamer-sidecar.spec (PyInstaller one-file)
├── scripts/ (build-macos.sh, build-sidecar.sh, build-windows*.ps1)
├── tools/ (logcat.py — декодер логов, make_test_batch.py — генератор тестовой
│           партии в tmp: 6 товаров, 22 «RAW», PIM-CSV, заявка xlsx)
├── tests/ (conftest: sidecar-фикстура + batch-фикстура; test_pim_parser 24,
│           test_server 52, test_perf 4 = 80 passed)
└── docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md (полная спецификация VER 3.0)
```

## PIM CSV (real user data)
UTF-16 LE BOM, tab-separated, values quoted with "
Cols: "Id"(code), "Название"(empty), "Штрих-код"(GTIN), "Модель", "Отдел", "Гамма"
23 cols, ~30 rows per export
IMPORTANT: barcode col = "Штрих-код" (with hyphen), values quoted

## XLSX ZAYAVKA (21 columns A-U)
A=Код LM, B=Отдел, C=Товар, D=GTIN, E=Дата съемки(empty), F=Дата AVS,
G=Гамма, H=Модель ADEO, I=Ссылка на фотобук, J=Поставщик,
K=Организация("photo production"), L=Итого ракурсов(APP FILLS), M=Ракурс_25(APP FILLS),
N=Комментарий LM, O=Менеджер, P=Фотограф(empty), Q-U=staff

## NAMING
Label: <code>_y.CR2 | Main: <code>.CR2 (no suffix!) | Angles: <code>_01.CR2, _02.CR2
Custom: _com, _pack, _ins, _tag | Duplicate labels: _y2, _y3

## RPC METHODS
system.heartbeat, system.info (version, port, data_dir, cache_count, engines,
  apim — поля 'demo' НЕТ с v3.5), system.set_apim
session.open_folder, session.get, session.set_zayavka, session.move_frame,
  session.set_frame_suffix, session.apply_barcode, session.refresh_angles
renamer.plan, renamer.execute, renamer.undo, renamer.retry_xlsx, renamer.journal, renamer.journal_clear
lookup.find_sku
zayavka.generate
file.download

## TWO MODES
CV Scanner: barcode from embedded JPEG preview (OpenCV→ZXing→PyZBar). Default OFF, manual toggle.
Names Mode: barcode from filename (4650101098770.CR2, _01.CR2, _y.CR2)

## APIM (Leroy Merlin catalog)
preprod: https://preprod-api.apim.lmru.tech/offers/v3/search
prod: https://api.apim.lmru.tech/offers/v3/search
Header: key (preprod API key), customerId (default 60071799)

## BUILD (macOS)
```
npm install
npm run build:sidecar        # PyInstaller → src-tauri/binaries/raw-renamer-sidecar-<triple>
                             # (бинарник ~69 МБ, НЕ коммитится — .gitignore)
npm run tauri build          # → target/release/bundle/{macos/*.app, dmg/*.dmg}
# или весь конвейер: ./scripts/build-macos.sh
```
Зависимости sidecar: src-python/requirements.txt.
Холодный старт one-file бинарника 3–10 с (UI честно показывает «Запуск движка…»).

## TESTS
```
python3 -m pytest tests/    # 80 passed (≈35 с)
```
Тестовая партия генерируется conftest в tmp через tools/make_test_batch.py
(реальных фото не нужно — синтетические плейсхолдеры, ШК — настоящие EAN-13).

## UI NOTES (v3.5)
- Левая панель: «Свернуть» → узкий рельс (34px) с кнопкой разворота (PanelLeftOpen).
- Поиск (⌘F): код LM, ШК или название среди ВСЕХ артикулов; при пустом результате
  — «Ничего не найдено по запросу…» + «Сбросить поиск».
- Шапка при старте: спиннер (кольцо) + «Запуск движка…» + 4 сегмента прогресса
  (реальные стадии Python: запущен/импорты/слушает/READY).
- Настройки: «Базовые» / «Для профессионалов»; ошибки — человеческим языком.

## CHANGES LOG
v3.5 (2026-09-19) — «полный инструмент», поиск, UX-индикаторы:
- РЕПО: папка переименована `raw-renamer-studio 2` → `raw-renamer-studio`
  (без «двойки» — нет конфликтов при клонировании/архиве); main = актуальная
  ветка (PR слит), arena — рабочая ветка сессии
- УБРАНО ВСЁ ДЕМО: демо-кнопки (Sidebar, VirtualGrid, ZayavkaModal, ⌘K-палитра),
  openDemo и демо-автооткрытие при старте, поле 'demo' из system.info,
  --demo-folder из server.py, demo_batch/ и make_demo_batch.py из репо.
  Тесты зелёные: batch-фикстура генерирует партию в tmp
  (tools/make_test_batch.py, параметризован; export_pim_demo.csv → export_pim.csv)
- ПРОГРЕСС ЗАПУСКА: SIDECAR_BOOT маркеры (imports/listen) → sidecar://progress →
  в шапке спиннер «Запуск движка…» + 4-сегментный бар (реальный прогресс
  Python-фазы; распаковка PyInstaller — до первых маркеров, честно не показана)
- ПОИСК (⌘F): код LM / ШК / название среди всех артикулов (поля ищутся
  независимо), подсказка и «Сбросить поиск» при пустом результате;
  ⌘F — фокус поля, Справка обновлена
- САЙДБАР: после сворачивания остался рельс 34px с кнопкой разворота
  (раньше панель исчезала безвозвратно)
- Проверено: tsc 0, vite build OK, pytest 80/80, boot-маркеры в логе,
  system.info без 'demo', dev-прокси OK
v3.4.1 (2026-09-19) — ЗАМ-001/002/004 + остаток BUG-015:
- Корень «онлайн запаздывает ~30 с»: с t=0 UI показывал красное «движок не
  отвечает» даже при нормальном старте. Состояния starting/online/offline во
  всех индикаторах (шапка, статус-бар, Настройки); grace 10с на heartbeat;
  dead/error → offline сразу; invoke sidecar_error против гонки событий;
  console-таймкоды [sidecar] +N.Ns для DevTools
- ЗАМ-002: dedup тостов (3 с); ЗАМ-004: супервизор без ретраев при отсутствии
  бинарника; браузерный режим — heartbeat работает с относительным URL
v3.4 (2026-09-19) — Mac-сборка + восстановление репо (см. CHANGELOG.md):
- BUG-009 (use tauri::Emitter, E0599), E0283 (None::<&str>), BUG-012
  (find_release_binary: оба имени бинарника), BUG-015 (initSidecar: probe ДО
  listen, backoff-poll), bundle [app,dmg] (без nsis), raw-renamer-sidecar.spec,
  Cargo.lock — всё из параллельной Mac-работы, извлечено из web-загрузки
- BUG-013: BrokenPipe на выходе (хелпер _say в server.py), BUG-011:
  npm run build:sidecar + scripts/build-sidecar.sh, src-python/requirements.txt
- GitHub: web-загрузка «Add files via upload» (10 коммитов, node_modules/dist)
  вычищена force-push'ом; из 102 файлов пропало только .gitignore (web-UI не
  грузит dotfiles) — восстановлено; PR #1 на main слит
v3.3 (2026-09-18) — глубокий аудит (QA+UX+архитектура), 22 бага (см. AUDIT.md):
- 3 HIGH рантайм (G1 DnD-кадров, G2 гонка READY-до-accept, B2 file.download),
  T3 capability NSOpenPanel, D1 kill-on-exit, D2 watchdog 30с + сброс ретраев,
  B1 APIM параллельно 6 + circuit breaker, mmap RAW (B13), .tmp_rename (B6),
  undo missing-отчёт (B7), CSP, ErrorBoundary, ⌘O, DnD папки, нативное меню macOS
- Логирование L1 (JSONL + logcat.py + корреляция), persist L2/L6 (settings.json +
  last_session.json), UX: «Базовые/Про» настройки, человеческие тексты,
  блокировки кнопок в офлайне
- Тесты: 80 passed (24+52+4), PERF: scan_300_cv ≈5с, scan_1000_cv ≈16с
v3.2.2 (2026-09-18) — багфикс BUG-001…BUG-008 (см. BUGS_FIXED.md):
- CSV: переписан детект кодировки (UTF-16 LE/BE ±BOM, UTF-8 ±BOM, cp1251) —
  фикс «The string did not match the expected pattern» (UTF-8 без BOM при
  чётной длине определялся как UTF-16 LE); информативные ошибки парсинга
  (кодировка/разделитель/столбцы)
- Браузер: выбор папки съёмки (showDirectoryPicker / webkitdirectory) +
  загрузка RAW в sidecar (POST /upload, новое поле `dir` = подпапка uploads)
  → «+»/«Открыть папку…» реально открывают партию (BUG-001/005)
- Офлайн-режим: при SIDECAR OFFLINE RPC-кнопки блокируются (tooltip) вместо
  тостов «Sidecar недоступен» (BUG-006); ⌘Z в офлайне — info, не error
- Меню ⋮ — выпадающее: Справка / Настройки / О приложении (BUG-007)
- ⌘K — командная палитра: поиск + 10 действий, ↑↓/Enter/Esc (BUG-008)
- Заявка: file-picker с fallback-инпутом, DnD с dropEffect, офлайн-баннер
  (BUG-002/003); окно Help/About/CommandPalette, Logo вынесен в компонент
v3.2.1 (2026-09-18):
- CSV loading: auto-detect encoding (UTF-16 LE/BE BOM, UTF-8 BOM, UTF-16 LE no BOM)
- New RPC: session.refresh_angles — update zayavka angle counts from actual files
- Field map: added 'штрих - код' (with spaces) variant
- ZayavkaModal: added "Обновить ракурсы" button
