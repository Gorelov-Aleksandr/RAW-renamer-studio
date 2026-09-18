# RAW Renamer Studio — Состояние проекта и контекст для продолжения

> **Зачем этот файл:** если диалог обрывается, передайте ЭТОТ файл в новый чат —
> в нём всё, что нужно, чтобы продолжить работу. Обновляется по мере продвижения.
> Единственный источник правды по СПЕЦИФИКАЦИИ — `docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md`
> (VER 3.0, 1549 строк). По процессу и статусу — этот файл.

**Дата последнего обновления: 2026-09-19 (МСК) — v3.4.1: Mac-сборка, восстановление репо, ЗАМ-001/002/004, см. CHANGELOG.md**

---

## 1. Что за проект и кто кто

- **Продукт:** премиальное десктопное приложение каталогизации и пакетного
  переименования RAW-снимков для предметных фотографов и операторов
  **Леман ПРО / Leroy Merlin** (студия пользователя).
- **Стек (жёстко по master §7):** Tauri v2 (Rust) · React 18 + TypeScript +
  Tailwind CSS · Python FastAPI Sidecar (в release — PyInstaller onefile).
- **Пользователь:** русскоязычный, работает на **macOS** (и хочет Windows-версию
  позже). Не требует Linux-версию (прямо отказался).

## 2. Инструкции пользователя (соблюдать всегда)

1. **Сначала полностью отладить MAC-версию** (собирается на маке пользователя),
   и только потом — Windows. «Чтобы если косяки будут, не пришлось переделывать
   обе версии».
2. Прототип (HTML) НЕ делается — сразу рабочая десктопная версия (прототип
   отклонён пользователем; папка `prototype/` удалена).
3. Не изобретать велосипед — работать строго по спецификации (master VER 3.0).
4. Общаться на русском.
5. Приложения/инструкции — в текстовых (.md) файлах (пользователь прикладывает
   только текст).

## 3. ТЕКУЩИЙ ЭТАП (читать в первую очередь при продолжении)

**Этап: v3.4.1 — Mac-сборка РАБОТАЕТ (на маке пользователя). Репозиторий восстановлен
и свёрнут в чистую историю (web-загрузка «Add files via upload» вычищена force-push'ом,
PR #1 на main). Следующие шаги: (1) пользователь пересобирает на маке (Rust-изменения
v3.4.1 не проверялись компиляцией в песочнице — там нет cargo) и смотрит DevTools-таймкоды
по остатку BUG-015; (2) ручной macOS-прогон (NSOpenPanel/меню/DnD/kill-on-exit/App Nap);
(3) слияние PR #1 на main по желанию пользователя.**

СДЕЛАНО v3.4.1: ЗАМ-001 (состояния starting/online/offline во всех индикаторах,
grace 10 с на heartbeat, dead/error → сразу offline, новый invoke sidecar_error
против гонки событий), ЗАМ-002 (dedup тостов 3 с), ЗАМ-004 (супервизор: ранний
выход без ретраев при отсутствии бинарника).

ХРОНИКА:
V3.4. **MAC-СБОРКА + ВОССТАНОВЛЕНИЕ РЕПО (2026-09-19) — СДЕЛАНО (см. CHANGELOG.md):**
   - Mac-сборка Tauri 2.11.5 проходит: E0599 (`use tauri::Emitter;`, dc9dd16),
     E0283 (`None::<&str>`, 74cafdf) + фиксы параллельной работы другого агента,
     извлечённые из web-загрузки и свёрнуты в коммит 5ee8de2:
     BUG-012 (find_release_binary принимает оба имени бинарника),
     BUG-015 (initSidecar: probe ДО listen, backoff-poll без дедлайна,
     heartbeat только после baseUrl), tauri.conf.json bundle=["app","dmg"]
     (убран nsis), src-python/raw-renamer-sidecar.spec, src-tauri/Cargo.lock.
   - Доделано по CHANGELOG: BUG-013 (_say() в server.py — BrokenPipe на выходе),
     BUG-011 (npm run build:sidecar + scripts/build-sidecar.sh; build-macos.sh
     вызывает его шагом 2; src-python/requirements.txt создан).
   - GitHub: пользователь загрузил проект через web-UI (лимиты 100 файлов/
     25 МБ, папка переименована в 'raw-renamer-studio', добавлены node_modules/
     dist/). Из 102 файлов потеряно только .gitignore (web-UI не грузит dotfiles).
     Ветку force-pushнули в чистое состояние: 45d332d → d348676 → 8d96c79 →
     dc9dd16 → 74cafdf → 5ee8de2 → (доделки v3.4). Папка в репо осталась
     'raw-renamer-studio 2' (имя не меняли, чтобы не ломать рабочие копии).
   - На маке пользователя бинарник sidecar ~69 МБ уже собран (PyInstaller);
     в Git он НЕ идёт (лимит 25 МБ) — собирается npm run build:sidecar.
   - PR #1 (arena → main) создан; слияние — за пользователем.
V3.4.1. **ЗАМ-001/002/004 + остаток BUG-015 (2026-09-19) — СДЕЛАНО:**
   - Корень «запаздывает ~30 с»: с t=0 UI показывал красное «движок не отвечает»
     даже во время НОРМАЛЬНОГО холодного старта (3–10 с PyInstaller). Теперь
     состояния: «запуск… (3–10 с — это нормально)» → «онлайн» → «движок не
     отвечает». Точки-индикаторы и Настройки/Справка — синхронизированы.
   - Grace-период 10 с после URL/READY: heartbeat не «вздрагивает» offline
     на холодном старте; dead/error-события → offline сразу (без ожидания
     двух провалов heartbeat).
   - Гонка sidecar://error до подписки вебвью: новый Rust-команды
     sidecar_error (опрос в probe()), console-таймкоды [sidecar] +N.Ns
     для диагностики в DevTools.
   - ЗАМ-002: dedup тостов (kind+title+sub, 3 с).
   - ЗАМ-004: супервизор — при ошибке build_command (нет бинарника) выходит
     сразу, без 3 ретраев по 1.5 с.
   - Проверено: tsc 0, vite build OK. Rust НЕ компилировался в песочнице
     (нет cargo) — проверить сборкой на маке.
0a. **ГЛУБОКИЙ АУДИТ + V3.3 (2026-09-18) — СДЕЛАНО (см. AUDIT.md):**
   - Найдено/исправлено 22 бага: 3 HIGH рантайм (G1 DnD-кадров `idx`/`to_idx`,
     G2 гонка старта READY-до-accept, B2 произвольное чтение file.download),
     T3 нет capability (NSOpenPanel блокировался), D1 зомби-sidecar (kill-on-exit),
     D2 ложная смерть (watchdog 30с + сброс рестартов), B1 APIM последовательно
     (параллельно 6 + circuit breaker).
   - UX/архитектура: жаргон убран («движок не отвечает», «сервер Леруа Мерлен»),
     Настройки Базовые/Про, ErrorBoundary, ⌘O, DnD папки на окно, нативное меню
     macOS, CSP, user-select на данных, битые превью onError.
   - Логирование (L1): JSONL sidecar (rrslog.py, ротация gzip 5МБ×3) + FE (logger.ts,
     POST /log, correlation X-RRS-Session) + CLI-декодер tools/logcat.py.
   - Persist (L2/L6): settings.json + last_session.json в data_dir (переживают рестарт).
   - Память/скорость: mmap RAW (B13), per-frame ext + коллизия LM 4090 (B5),
     /upload 400МБ поток (B3), /preview 404 на битом JPEG (B4), .tmp_rename очистка (B6),
     undo missing-отчёт + журнал ≤100 (B7), OpenCV plausibility (B11).
   - Тесты: tests/{test_pim_parser 24, test_server 52, test_perf 4} = 80 passed.
   - Осталось (на macOS): cargo tauri build + ручной прогон NSOpenPanel/меню/DnD/
     kill-on-exit/App Nap; прогресс скана больших партий; a11y-проход.
0b. **БАГФИКС QA (2026-09-18) — СДЕЛАНО (v3.2.2, см. BUGS_FIXED.md):**
   - BUG-004: переписан детект кодировки CSV (UTF-16 LE/BE ±BOM, UTF-8 ±BOM,
     cp1251) — корень «The string did not match the expected pattern»;
     информативные ошибки парсинга (кодировка/разделитель/столбцы).
   - BUG-001/005: «+»/«Открыть папку…» в браузере — выбор папки
     (showDirectoryPicker / webkitdirectory) + загрузка RAW в sidecar
     (`POST /upload` новое поле `dir`) → открытие сессии; Tauri — нативный диалог.
   - BUG-006: при SIDECAR OFFLINE все RPC-кнопки блокируются (tooltip)
     вместо тостов «Sidecar недоступен»; ⌘Z в офлайне — info, не error.
   - BUG-007: меню ⋮ — выпадающее (Справка/Настройки/О приложении, 2 новых окна).
   - BUG-008: ⌘K — командная палитра (поиск, 10 действий, ↑↓/Enter/Esc).
   - BUG-002/003: file-picker заявки с fallback-инпутом; DnD CSV с dropEffect.
   - Проверено E2E: upload+open_folder (22 файла→6 товаров, CV 6/6),
     zayavka.generate (7 кодировок/разделителей), rename+undo, tsc+vite build.
   - Файлы: BUGS_FIXED.md (отчёт), src/lib/pickFolder.ts, src/lib/ops.ts,
     components/{AppMenu,CommandPalette,HelpModal,AboutModal,Logo}.tsx (новые).
1. Пользователь поставил Rust 1.98.1 (Apple Silicon), собрал проект.
1. Пользователь поставил Rust 1.98.1 (Apple Silicon), собрал проект.
2. SIGABRT в did_finish_launching → переписан `sidecar.rs` (panic-free
   супервизор + auto-restart + события + poll sidecar_url). **Сборка прошла.**
3. Ошибка E0308: в Rust 1.98 `Child::id()` → `u32` (не Option) → поправлено.
4. **НОВАЯ ЗАДАЧА (2026-09-18): «наполнить полноценно, а не как демо»** —
   СДЕЛАНО (v3.1, патч-архив `patch-full-2026-09-18.zip`):
   - заявка: сценарий «открыть .xlsx» (нативный диалог) + авто-подключение
     сгенерированной заявки к сессии (fix «не загрузить таблицу»);
   - генератор: УБРАНЫ поля фотограф/организация/дата (org='photo production'
     фикс., дата в имени файла zayavka_ДД.ММ.ГГГГ.xlsx);
   - «Настройки»: настоящее модалочное окно (Sidecar/APIM/Журнал/Хоткеи);
     новые RPC: system.set_apim, renamer.journal_clear;
   - «+» в Сессиях → нативный выбор папки.
   - Всё проверено в песочнице: RPC-тесты (6/6 ok, generator: org/пустые
     поля/имя с датой; set_apim; journal_clear; enrich) + tsc+vite без ошибок.
   - Мастер-файл: раздел 16 (аддендум v3.1: инциденты/решения/изменения).
5. ЧТО ДЕЛАЕТ ПОЛЬЗОВАТЕЛЬ: применить патч (PATCH_README.md в архиве) →
   `bash scripts/build-macos.sh` → тест: Заявка (открыть/сгенерировать),
   Настройки, и — самое главное — **ПЕРЕИМЕНОВАТЬ ВСЁ + UNDO**
   (пользователь ещё не тестировал сам процесс переименовки).
6. ДАЛЬШЕ (после проверки на маке): Windows-версия
   (`scripts/build-windows-from-macos.sh`).

ВНИМАНИЕ: пользователь просил патч ОТДЕЛЬНЫМ архивом с инструкцией —
`patch-full-2026-09-18.zip` (PATCH_README.md + только изменённые файлы).
Полный проект с патчем: `raw-renamer-studio.zip` (тоже пересобран).

## 4. Что делать ПОСЛЕ мак-версии (не начинать раньше!)

1. Windows-версия — **с того же мака** через кросс-компиляцию:
   `./scripts/build-windows-from-macos.sh`
   (mingw-w64 + nsis + wine; Windows Python 3.12 под Wine; PyInstaller;
   `tauri build --target x86_64-pc-windows-gnu --bundles nsis`).
   Запасной путь: sidecar.exe собрать на любой Windows-машине (3 команды в README)
   → скрипт пропустит Wine-шаги (ищет `src-tauri/binaries/raw-renamer-sidecar-x86_64-pc-windows-gnu.exe`).
   Или нативная сборка на Windows: `scripts/build-windows.ps1`.
2. После отладки обеих — финальная полировка (если захотим).

## 5. Что УЖЕ СДЕЛАНО и ПРОВЕРЕНО (не повторять)

### 5.1 Python sidecar (`src-python/`, 9 модулей) — РАБОТАЕТ

Проверено 16/16 функциональных RPC-тестов (реальные запросы, не заглушки):

- `system.heartbeat` / `system.info` (версия, порт, движки, demo, кэш)
- `session.open_folder` mode=cv: **6/6 этикеток распознаны** (этикетки в демо —
  НАСТОЯЩИЕ нарисованные EAN-13), 22 кадра, все товары `status=ok`, lookup по
  заявке (ШК→Код LM, название, строка Excel), source=`cv:zxing`
- `session.apply_barcode` (сирота → ручной ШК → lm=89458028, строка 2)
- `renamer.plan`: 22 строки; кресло → `89458028.CR2, _01, _02, _y` (главный
  СТРОГО без суффикса); дрель → `_01.._03 + _y`; кастомный суффикс `_com`
  заменяет номер позиции
- `renamer.execute`: 22 файла переименованы, Excel L(12)/M(13) записаны
  (кресло L=3 M=1 — L считает ракурсы БЕЗ `_y`), журнал создан
- `renamer.undo`: имена и L/M (0/0) полностью восстановлены
- `renamer.retry_xlsx`: written=6 (сценарий «Повторить» при блокировке Excel)
- `renamer.journal`, `session.get`, `session.set_zayavka`
- names-mode: имена `_M2A…` без ШК → 22 отдельных «сиротливых» товара (status=err);
  имена по ШК (`4650101098817_y.CR2`, `…_01.CR2`) → 1 товар, план корректен
- `zayavka.generate`: PIM CSV (UTF-16 LE BOM, tab) → xlsx 21 колонка;
  `file.download` (b64, валидный xlsx); `/upload` (field `file`); `/preview` (JPEG)

### 5.2 Фронтенд (`src/`) — СКОМПИЛИРОВАН

`npm run build` (tsc --noEmit + vite build) — без ошибок. Bundle ~277KB JS.
- Виртуализированная сетка (@tanstack/react-virtual), DnD ракурсов (dnd-kit)
  с правкой суффиксов, модалки (план, ручной ШК с live-lookup, PIM-заявка),
  лайтбокс, тосты (кнопки «Повторить»/«Отменить ⌘Z»), sidebar, toolbar, statusbar
- Горячие клавиши: ⌘Z undo, ⌘K — командная палитра (v3.2.2), Space lightbox, R — ручной ШК
- Дизайн-токены master §10; blur только в модалках/тостах
- `lib/sidecar.ts`: JSON-RPC клиент, heartbeat 3 с, Tauri `sidecar://ready`

### 5.3 Tauri v2 (`src-tauri/`) — написание завершено, НЕ КОМПИЛИРОВАЛСЯ (нет cargo в песочнице)

- `src/sidecar.rs`: spawn sidecar (dev: python из исходников; release: бинарник
  externalBin), парсинг SIDECAR_READY, событие `sidecar://ready`,
  `CREATE_NO_WINDOW` на Windows, поиск бинарника по всем раскладкам Tauri
  (Contents/MacOS/binaries, resources\binaries, рядом с exe)
- `tauri.conf.json` (v2): devUrl localhost:5173, frontendDist ../dist,
  externalBin `binaries/raw-renamer-sidecar`, bundle: app/dmg/nsis
- Скрипты: `scripts/build-macos.sh` (нативный), `scripts/build-windows.ps1`
  (нативный Windows), `scripts/build-windows-from-macos.sh` (кросс с Wine)
- `src-python/sidecar.spec` — PyInstaller onefile, console=True, hiddenimports

### 5.4 Демо-данные (`demo_batch/`) — сгенерированы

`tools/make_demo_batch.py`: 22 «RAW» (`.CR2` = JPEG-контейнер, 6 товаров),
первый кадр каждого товара — этикетка с валидным EAN-13 (рисованная,
декодируется реальными движками); `export_pim_demo.csv` (UTF-16 LE BOM, tab);
`zayavka_17.09.2026.xlsx` (собирается через тот же pim_builder — догфудинг).
Фото товаров сгенерированы ИИ в `demo_batch/source/*.jpg` (chair/lamp/handle/
drill/paint/faucet).

**Демо-товары (LM / GTIN / фото / кадры):**
89458028 / 4650101098817 / chair / [y, '', _01, _02]
89458031 / 4650101098831 / lamp / [y, '', _01]
89458102 / 4650101098909 / handle / [y, '', _01]
89458044 / 4650101098855 / drill / [y, '', _01, _02, _03]
89458047 / 4650101098862 / paint / [y, '', _01]
89458053 / 4650101098879 / faucet / [y, '', _01, _02]
(камера: `_M2A0801.CR2`… последовательно; GTIN = префикс 12 + контрольная)

## 6. Что ЧИНили по ходу (чтобы не наступать снова)

1. **zxing-cpp 3.x API**: новые версии дали `read_barcodes` (старые —
   `decode`/`decode_multi`). `scanner.py` поддерживает оба.
2. **OpenCV 5.0**: `barcode_BarcodeDetector.detectAndDecode` в 5.x находит
   область, но не декодирует (слабый декодер) → сканер честно падает на ZXing
   (контур 2). Поддержаны сигнатуры 4.x и 5.x.
3. **4 GTIN из демо-данных имели неверные контрольные цифры** (унаследованы из
   прототипа) — ZXing их честно отклонял. GTIN теперь вычисляются из 12-значных
   префиксов в `make_demo_batch.py` (LM-коды не тронуты).
4. `/upload`: сервер ждал поле `f`, фронт шлёт `file` — унифицировано на `file`.
5. names-mode: все неопознанные файлы сливались в 1 товар → теперь каждый =
   отдельный «сиротливый» товар.
6. **Release-режим**: data-dir по платформам (Win: `%LOCALAPPDATA%\RAW-Renamer-Studio`,
   macOS: `~/Library/Application Support/RAW Renamer Studio`, Linux: `~/.cache/raw-renamer`).
7. Windows: `CREATE_NO_WINDOW` при spawn sidecar (иначе чёрное консольное окно).
8. Cargo.toml: убран `strip = true` (падает на Windows без утилиты strip).
9. Vite: `allowedHosts: true` (иначе preview-хост хостинга 403).
10. Опечатка `tauriii::AppHandle` в sidecar.rs — исправлено.
11. **SIGABRT при старте release на macOS (did_finish_launching)**: старые
    `spawn().expect()`, `panic!` в release-поиске бинарника, гонка
    `sidecar://ready` (событие раньше подписки) → переписан `sidecar.rs`
    (супервизор без паник + auto-restart + события dead/error + `sidecar_url`
    query-фолбэк во фронтенде).
12. **Rust 1.98: `Child::id()` теперь возвращает `u32`** (не `Option<u32>` —
    вариант убран из std). Код под это поправлен (2026-09-17 16:10).
    Требование: rustup stable 1.9x; на старых тулчейнах `rustup update` нужен.

## 7. Ключевые файлы (навигация)

```
raw-renamer-studio/
├── docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md   ← СПЕЦИФИКАЦИЯ (источник правды)
├── PROJECT_STATUS.md                            ← ЭТОТ файл (статус/продолжение)
├── README.md                                    ← старт, протокол, сборка
├── PROJECT_STATUS.md обновлять при каждом значимом шаге!
├── src-python/          server.py (FastAPI, RPC, /preview, /upload, watchdog)
│                        scanner.py (OpenCV→ZXing→PyZBar), session.py (скан/план),
│                        renamer.py (2-fase rename + undo-журнал), excel_worker.py
│                        (A/D чтение, L/M запись, lock), lookup.py (заявка→sqlite→APIM),
│                        pim_builder.py (PIM→xlsx 21 кол.), raw_engine.py (JPEG из RAW),
│                        requirements.txt, sidecar.spec (PyInstaller)
├── src/               React: App.tsx, store/useSession.ts (Zustand),
│                        lib/sidecar.ts (JSON-RPC+heartbeat), components/* (11 шт.)
├── src-tauri/         Cargo.toml, tauri.conf.json, src/{main,lib,sidecar}.rs,
│                        icons/icon.png, .cargo/config.toml (кросс линкер,
│                        создаётся скриптом кросс-сборки)
├── scripts/           build-macos.sh, build-windows.ps1,
│                        build-windows-from-macos.sh
├── tools/make_demo_batch.py
├── demo_batch/        shoot_2026-09-16/ (22 .CR2), zayavka_17.09.2026.xlsx,
│                        export_pim_demo.csv, source/*.jpg
├── sidecar-proxy.ts, vite.config.ts, tailwind.config.ts, tsconfig.json,
│   package.json, index.html
└── .sidecar/port      динамический порт sidecar (dev-прокси vite)
```

## 8. Как запустить в песочнице/бrowsере (если нужен превью)

```bash
cd /home/user/raw-renamer-studio
pip install -r src-python/requirements.txt
python3 tools/make_demo_batch.py
# sidecar (фоновым процессом; watchdog 0 — чтобы пережил закрытие превью):
python3 src-python/server.py --port 0 --port-file .sidecar/port --data-dir .data \
  --zayavka demo_batch/zayavka_17.09.2026.xlsx --demo-folder demo_batch --watchdog 0
# фронтенд (фоновым):
npm install && npm run dev          # 0.0.0.0:5173, прокси /rpc и /preview
```
Проверка: `curl -X POST http://localhost:5173/rpc -d '{"jsonrpc":"2.0","id":1,"method":"system.heartbeat","params":{}}'`.
В новом чате процессы из этой сессии, скорее всего, мертвы — перезапустить по схеме выше.

## 9. Протокол и правила (коротко; полностью — в master)

- Sidecar: порт 0 (случайный), ПЕРВАЯ строка stdout:
  `{"event": "SIDECAR_READY", "port": N, "pid": M}`; heartbeat 3 с;
  >8 с без heartbeat → exit(0).
- Превью: ТОЛЬКО встроенный JPEG (FFD8…FFD9), без демозаиска.
- Excel: A(1)=Код LM, D(4)=GTIN; запись L(12)=ракурсы без `_y`, M(13)=1/0;
  блокировка Excel → «Закройте файл в Excel и нажмите «Повторить»».
- Именование: `<арт>_y` · `<арт>` (главный, без суффикса) · `_01…` ·
  кастом `_06/_com/_pack/_ins/_tag`.
- Сортировка кадров: натуральные числа (regex `\d+`).
- Коллизии: проверка до rename; циклы через `.tmp_rename`; undo-журнал
  `.lm_rename_journal.json` (откат и имён, и L/M).
- Lookup: Заявка (A/D) → SQLite (barcodes_cache) → APIM v3 (preprod,
  customerId 60071799; недоступность API — не ошибка).
- Дизайн-токены: bg #0D0E12 / panel #14151A / surface #1A1C23 / accent #7C6CF0 /
  ok #3FBE84 / warn #E8A23C / danger #E5484D; Inter + JetBrains Mono.

## 10. Чек-лист для нового чата (с чего начать)

1. Прочитать этот файл + `docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md`.
2. Спросить пользователя: **какой лог сборки мак-версии?** (или что случилось).
3. Чинить по логу (Rust → `src-tauri/`, PyInstaller → `sidecar.spec`,
   sidecar → `src-python/`, UI → `src/`).
4. После успешной мак-сборки — переходить к Windows (§4).
5. Обновлять этот файл после каждого значимого шага (§3 — текущий этап!).
