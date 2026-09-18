# RAW Renamer Studio

Десктопное приложение для каталогизации и пакетного переименования RAW-снимков предметных фотографов Леман ПРО.

## Быстрый старт

```bash
# Установка зависимостей
npm install
pip install -r src-python/requirements.txt

# Запуск в dev-режиме (два терминала)
# Терминал 1: Python sidecar
python3 src-python/server.py --port 0 --port-file .sidecar/port --data-dir .data --watchdog 0

# Терминал 2: Frontend
npm run dev
```

## Сборка

```bash
# macOS
bash scripts/build-macos.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

## Документация

- `docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md` — полная спецификация проекта
- `AI_MASTER.md` — компактный мастер-файл для ИИ-агентов
