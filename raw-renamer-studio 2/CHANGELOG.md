# CHANGELOG — 0.1.0-macos-alpha

> Консолидированный отчёт по Mac-сборке (Tauri v2 + Python sidecar).
> Включает фиксы из параллельной работы над сборкой под macOS и доделки,
> внесённые в репозиторий 19.09.2026. Статусы: ✅ в репо / ⚠️ частично.

## Rust-компиляция (Tauri 2.11.5, macOS)

| # | Проблема | Фикс | Статус |
|---|----------|------|--------|
| BUG-009 | `E0599: no method named emit` — в Tauri 2 `emit` из трейта `Emitter`, не из `AppHandle` | `use tauri::Emitter;` в `src-tauri/src/lib.rs` | ✅ (коммит dc9dd16) |
| BUG-008* | `E0283`: ускоритель в `MenuItem::with_id(..., None)` — тип `None` не выводился | `None::<&str>` для пунктов About/Help | ✅ (коммит 74cafdf) |

## Sidecar в бандле (PyInstaller one-file)

| # | Проблема | Фикс | Статус |
|---|----------|------|--------|
| BUG-010 | Скомпилированный .app падает: sidecar не найден рядом с бинарником | PyInstaller `onefile` → `src-tauri/binaries/raw-renamer-sidecar-<triple>` (см. инструкции) | ✅ |
| BUG-012 | `find_release_binary` искал только `raw-renamer-sidecar-<triple>`, а Tauri кладёт в `Contents/MacOS/` имя без суффикса | Принимает оба имени: `s == "raw-renamer-sidecar" || s.starts_with("raw-renamer-sidecar-")` | ✅ |
| BUG-014 | После чистого клона `tauri build` не работал: не было бинарника sidecar | Скрипт `npm run build:sidecar` + шаг 2 в `scripts/build-macos.sh` | ✅ |
| BUG-011 | Нет npm-скрипта для пересборки sidecar отдельно от Rust | `"build:sidecar": "bash scripts/build-sidecar.sh"` (+ сам скрипт, `src-python/requirements.txt`, `raw-renamer-sidecar.spec`) | ✅ (добавлено 19.09.2026) |
| BUG-013 | `BrokenPipeError` при выходе: Rust закрывает stdout-pipe, фоновые потоки sidecar падали с traceback-ом | Хелпер `_say()` в `server.py`: все записи в stdout через `try/except (BrokenPipeError, OSError)` | ✅ (добавлено 19.09.2026) |

## Фронтенд-инициализация

| # | Проблема | Фикс | Статус |
|---|----------|------|--------|
| BUG-015 | «Движок не отвечает» при запуске: событие `sidecar://ready` улетало до подписки фронтенда + heartbeat дёргал offline до получения URL | `initSidecar`: (1) `probe()` = `invoke('sidecar_url')` ДО подписки на события; (2) poll с backoff 250 мс → 3 с, без 20-секундного дедлайна; (3) heartbeat только после `baseUrl` | ⚠️ онлайн-индикатор всё ещё запаздывает ~30 с (см. Known Issues) |

## Known Issues

1. **Онлайн-индикатор запаздывает ~30 с** (остаток BUG-015): sidecar отвечает, но статус в UI переключается поздно.
   Исследовать: время ответа `invoke('sidecar_url')` до поднятия uvicorn; перезапись статуса heartbeat'ом; консоль DevTools.
2. **Холодный старт 3–8 с** (one-file распаковывает ~69 МБ в tmp): не закрывать окно ~10 с после запуска;
   в логе должно быть: `[sidecar] запуск: …` → `pid=` → `READY: порт`.
3. **Бинарник sidecar (~69 МБ) не хранится в Git** (лимит GitHub — 25 МБ/файл):
   собирается локально через `npm run build:sidecar`; `src-tauri/binaries/` в `.gitignore`.
4. **`nsis` убран из bundle.targets** (macOS-only на этом этапе): `tauri.conf.json → ["app","dmg"]`.

## Инструкции по сборке (macOS)

```bash
# 0. Зависимости
brew install node python rust        # + Xcode CLT: xcode-select --install
cd raw-renamer-studio 2
npm install

# 1. Sidecar (один раз / при изменении src-python)
npm run build:sidecar                # → src-tauri/binaries/raw-renamer-sidecar-<triple>

# 2. Приложение
npm run tauri build
#    или весь конвейер: ./scripts/build-macos.sh

# Результат:
#   src-tauri/target/release/bundle/macos/RAW Renamer Studio.app
#   src-tauri/target/release/bundle/dmg/*.dmg
```

Проверка dev-режима (браузер + sidecar):

```bash
python3 src-python/server.py --port 0 --port-file .sidecar/port --data-dir .data
npm run dev
```
