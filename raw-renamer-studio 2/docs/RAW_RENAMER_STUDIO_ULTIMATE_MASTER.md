# RAW RENAMER STUDIO — ЕДИНЫЙ МАСТЕР-ФАЙЛ ПРОЕКТА (VER. 3.0)
> **ДАТА СИНХРОНИЗАЦИИ:** 2026-09-17  
> **НАЗНАЧЕНИЕ:** Исчерпывающий мастер-документ для старта и ведения разработки в новом чате с ИИ-агентом. Содержит 100% бизнес-логики, архитектуры, протоколов, дизайна, точных номеров столбцов Excel (.xlsx), готовый HTML-прототип и пошаговые промпты для немедленного начала кодинга.

---

## 1. СТАРТОВЫЙ ПРОМПТ ДЛЯ ИИ-АГЕНТА (СКОПИРУЙ В НОВЫЙ ЧАТ)

```markdown
Привет! Ты — Senior Fullstack & Desktop Архитектор. Мы разрабатываем «RAW Renamer Studio» — премиальное десктопное приложение для фотостудии Лемана ПРО / Leroy Merlin (Tauri + React/TS/Tailwind + Python FastAPI Sidecar).

Я прикрепляю единый мастер-файл проекта (RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md). В нём зафиксированы все архитектурные решения, точные столбцы Excel .xlsx, протокол взаимодействия, UI-токены и полный код интерактивного прототипа.

Твоя задача:
1. Восстанови структуру проекта и сохрани прототип в `prototype/index.html` (раздел 15).
2. Разверни Python Sidecar ядро по контракту (раздел 8):
   - Fast embedded RAW preview parser (CR2/CR3/ARW/NEF);
   - Генератор заявки из PIM CSV в рабочий .xlsx (раздел 5);
   - Двухэтапный сканер штрихкодов (OpenCV + ZXing-cpp/PyZBar);
   - Безопасный ренеймер с обратной записью в колонки L (12) и M (13) файла .xlsx + Undo-журнал.
3. Следуй дорожной карте из раздела 14. Не изобретай велосипед — работай строго по спецификации.

Подтверди готовность и начни с Шага 1 Дорожной карты!
```

---

## 2. СУТЬ И ЦЕЛЬ ПРОДУКТА
**RAW Renamer Studio** — инструмент студийной каталогизации, подготовки заявок и пакетного переименования RAW-снимков для предметных фотографов и операторов Лемана ПРО.

### Решаемые проблемы:
1. Замена медленного устаревшего скрипта `app_v9.pyc` (Windows-only, конвертировал RAW в PNG на диск, падал при отсутствии ШК на первом кадре).
2. Автоматизация составления заявок: ручной перенос из выгрузки PIM заменен на генератор за 1 клик.
3. Визуальный контроль: фотограф видит превью кадров, упорядочивает их перетаскиванием (Drag & Drop), видит статус каждого товара.
4. Автоматическое заполнение отчета съёмки в файле `.xlsx` (колонки отснятых ракурсов).
5. Мгновенный 1-Click Undo при ошибках.

---

## 3. ТОЧНЫЙ СТАНДАРТ ЗАЯВКИ EXCEL (.XLSX) И СТОЛБЦЫ

По реальному файлу заявки студии зафиксирован точный колоночный маппинг.  
**ВНИМАНИЕ:** В Excel нумерация столбцов начинается с 1 (1-based), буквы — от A до U.

| Буква Excel | № (1-based) | Индекс (0-based) | Название колонки | Роль в приложении |
|---|---|---|---|---|
| **A** | **1** | 0 | **Код LM** | **Артикул товара** (чтение для ренейминга, запись при генерации заявки) |
| **B** | 2 | 1 | Отдел | Номер отдела (например, `3`) |
| **C** | 3 | 2 | Товар | Название товара (из выгрузки PIM) |
| **D** | **4** | 3 | **GTIN** | **Штрихкод EAN-13** (чтение для сопоставления) |
| **E** | 5 | 4 | Дата съемки | Дата съемки (ДД.ММ.ГГГГ) |
| **F** | 6 | 5 | Дата AVS | Дата проверки (служебная) |
| **G** | 7 | 6 | Гамма | Гамма (`А`, `Ас` и т.д.) |
| **H** | 8 | 7 | Модель ADEO | Код модели поставщика (например, `200304`) |
| **I** | 9 | 8 | Ссылка на фотобук | Гайд по ракурсам |
| **J** | 10 | 9 | Постащик | Поставщик (`?` по умолчанию) |
| **K** | 11 | 10 | Организация | По умолчанию `photo production` |
| **L** | **12** | 11 | **Итого ракурсов** | **ЗАПИСЬ СКРИПТОМ:** число чистовых ракурсов (БЕЗ учета фото ШК `_y`) |
| **M** | **13** | 12 | **Ракурс_25** | **ЗАПИСЬ СКРИПТОМ:** `1` если есть фото этикетки со штрихкодом (`_y`), `0` если фото ШК нет |
| **N** | 14 | 13 | Комментарий LM | Заметки студии |
| **O** | 15 | 14 | Менеджер | Ответственный менеджер |
| **P** | 16 | 15 | Фотограф | Имя фотографа (например, `Кирилл`, сохраняется в настройках) |
| **Q-U**| 17-21 | 16-20 | Ассистент, Гладильщик... | Служебные студийные поля |

### Правило записи результатов в `.xlsx`:
- После переименования скрипт открывает файл `.xlsx` через библиотеку `openpyxl`.
- Для каждого обработанного артикула находит строку по Коду LM (колонка A):
  - В ячейку **L{row}** (колонка 12) записывает целое число чистовых ракурсов.
  - В ячейку **M{row}** (колонка 13) записывает `1` (если был кадр `_y`) или `0`.
- Если артикул был найден только через внешний API (отсутствовал в заявке): скрипт добавляет новую строку в конец листа с заполнением колонок A, C, D, K, L, M, P и подсвечивает строку в UI.
- **Защита от блокировки Windows Excel:** перед записью проверяется флаг эксклюзивного доступа. Если файл открыт в Microsoft Excel — выводится предупреждение: *«Закройте файл в Excel и нажмите 'Повторить'»*.

---

## 4. СТАНДАРТ ИМЕНОВАНИЯ И СУФФИКСОВ (УТВЕРЖДЁН)
Для найденного артикула (например, `89458028`):
1. **Кадр этикетки со штрихкодом:** `<артикул>_y.<ext>` (например, `89458028_y.CR2`).
2. **Главный ракурс (обложка карточки товара):** `<артикул>.<ext>` (**СТРОГО БЕЗ СУФФИКСА**, например, `89458028.CR2`).
3. **Последующие ракурсы:** `<артикул>_01.<ext>`, `<артикул>_02.<ext>`, `<артикул>_03.<ext>`...
4. **Специальные суффиксы медиабука (по выбору оператора):** `_com` (комплект), `_pack` (упаковка), `_ins` (инструкция), `_tag` (этикетка).
5. **Кастомные пропуски:** оператор может кликнуть на номер суффикса и вписать любое число (например, сразу поставить `_06`).

---

## 5. МОДУЛЬ «ГЕНЕРАТОР ЗАЯВКИ ИЗ PIM» (ZAYAVKA BUILDER)
- **Входной файл:** «сырая» выгрузка PIM `export_*.csv` (кодировка **UTF-16 LE с BOM**, разделитель табуляция `\t`).
- **Автодетект полей экспорта:**
  - `Id` → Код LM (колонка A)
  - `Название` → Товар (колонка C)
  - `Отдел` → Отдел (колонка B)
  - `Штрих-код` → GTIN (колонка D)
  - `Модель` → Модель ADEO (колонка H)
  - `Гамма` → Гамма (колонка G)
- **Автоподстановка студийных констант:** Организация = `photo production`, Фотограф = из профиля настроек, Поставщик = `?`, Ссылка на фотобук = `https://fotobook-lemanapro.ru/`.
- **Выходной файл:** готовая заявка в формате `.xlsx` (или `.csv` UTF-8 с `;`), готовая для съемки.

---

## 6. ДВА РЕЖИМА ПЕРЕИМЕНОВАНИЯ

### РЕЖИМ 1: «Распознавание с фото» (CV Scanner)
- Камера снимает кадры с оригинальными именами (`_M2A0881.CR2` и т.д.).
- Первый кадр товара — снимок этикетки со штрихкодом.
- Сканер находит и распознает ШК. Все последующие кадры до следующего кадра со штрихкодом привязываются к этому товару.
- Если на первом кадре ШК не найден — карточка помечается статусом «Требует внимания» (желтый бейдж) для ручного ввода или объединения.
- Поддержка маркеров камеры: `*M2A0885*4600000000001.CR2` принудительно задает ШК без запуска CV-сканера.

### РЕЖИМ 2: «По именам файлов» (Scanned at Capture)
- Штрихкод сканировался ручным сканером во время съёмки прямо в имя файла (например, `4650101098770.CR2`, `4650101098770_01.CR2`).
- Штрихкод извлекается регулярным выражением.
- Если в серии есть файл с маркером `_y`, он назначается кадром этикетки. Если нет — товар состоит только из чистовых ракурсов.

---

## 7. ФИНАЛЬНЫЙ ТЕХНОЛОГИЧЕСКИЙ СТЕК

- **Оболочка десктопа:** **Tauri v2 (Rust)** — легковесный бандл, минимальное потребление RAM, компиляция под macOS (Apple Silicon + Intel) и Windows 10/11.
- **Фронтенд:** **React 18 + TypeScript + Tailwind CSS** + `@tanstack/react-virtual` (виртуализация 2000+ карточек) + `dnd-kit` (drag & drop ракурсов) + `lucide-react`.
- **Бэкенд-ядро (Python Sidecar):** **FastAPI** (loopback HTTP `127.0.0.1:<port>`), собирается в автономный бинарник через PyInstaller:
  - **Embedded RAW Preview Engine:** мгновенное извлечение вшитых JPEG из контейнеров `.CR2`, `.CR3`, `.ARW`, `.NEF` за **3–8 мс** без полного демозаика;
  - **Barcode Engine:** двухэтапное распознавание OpenCV BarcodeDetector + fallback на ZXing-cpp / PyZBar;
  - **Excel Engine:** `openpyxl` (чтение колонок A и D, запись колонок L и M);
  - **API Engine:** `httpx` (клиент к APIM v3 Лемана ПРО с ретраями);
  - **Cache & History:** `sqlite3` (`barcodes_cache.sqlite`) + журнал `.lm_rename_journal.json` для 1-Click Undo.

---

## 8. ПРОТОКОЛ SIDECAR (JSON-RPC + HTTP PREVIEWS)

### 8.1. Защита от зомби-процессов и динамический порт
- Python-сервер стартует на случайном свободном порту (`--port=0`).
- Первая строка stdout от Python: `{"event": "SIDECAR_READY", "port": 49215, "pid": 18492}`.
- Фронтенд пингует `system.heartbeat` каждые 3 секунды. При отсутствии пинга более 8 секунд Python завершает работу `sys.exit(0)`.

### 8.2. Потоковая отдача превью: `GET /preview/{file_hash}?size=320`
- Быстро извлекает вшитый JPEG из RAW и отдает с заголовком `Content-Type: image/jpeg` и кэшированием в GPU.

### 8.3. Ключевые методы JSON-RPC (`POST /rpc`):
1. `session.scan_folder`: сканирование RAW папки, парсинг ШК, авто-группировка.
2. `lookup.find_sku`: каскадный поиск ШК (Заявка → SQLite кэш → APIM v3).
3. `zayavka.generate`: конвертация PIM CSV в рабочий файл заявки `.xlsx`.
4. `renamer.execute`: безопасное переименование RAW (двухфазное с защитой от коллизий) + запись колонок 12 (L) и 13 (M) в `.xlsx`.
5. `renamer.undo`: откат имён файлов по журналу `.lm_rename_journal.json`.

---

## 9. API ЛЕМАНА ПРО (ДЛЯ FALLBACK ПОИСКА)

- **Основной эндпоинт (APIM v3):**
  - Preprod: `https://preprod-api.apim.lmru.tech/offers/v3/search?showFacets=false&showProducts=true`
  - Prod: `https://api.apim.lmru.tech/offers/v3/search?showFacets=false&showProducts=true`
  - Preprod Header: `key: kHtQ58dTHxi9LAarU7zQrD0nu6n0mamar`
  - Preprod customerId: `60071799` (настраиваемый параметр)
  - Метод: POST
  - Тело:
```json
{
  "FamilyForSRP": "",
  "GTIN": "<штрихкод>",
  "familyIds": [],
  "searchMethod": "keyPhrase",
  "keyPhrase": "<штрихкод>",
  "limit": 30,
  "offset": 0,
  "customerId": "60071799"
}
```
  - Артикул в ответе: `products[0]["_products"][0]`.

---

## 10. ДИЗАЙН-ТОКЕНЫ И UI/UX ПРАВИЛА

- **Палитра:**
  - Base: `#0D0E12` (фон окна)
  - Panel: `#14151A` (сайдбар, тулбар)
  - Surface: `#1A1C23` (карточки товаров, плотный фон без лишнего blur)
  - Surface Hover: `#20222B`
  - Accent Display: `#7C6CF0` (фиолетовый акцент)
  - Accent Text: `#8D7EF5`
  - Accent Fill: `#6E5CE7`
  - Success / Ready: `#3FBE84` (зеленый)
  - Attention / Warn: `#E8A23C` (янтарный)
  - Danger: `#E5484D`
- **Типографика:** `Inter` (интерфейс) + `JetBrains Mono` (артикулы, ШК, имена файлов, табличные цифры `tabular-nums`).
- **Оптимизация GPU:** `backdrop-filter: blur()` разрешен ТОЛЬКО для плавающих модалок и шапки. Внутри карточек товаров blur ЗАПРЕЩЕН во избежание лагов скролла.

---

## 11. ПРОМПТЫ ДЛЯ СТУДИЙНЫХ ДЕМО-ФОТОГРАФИЙ (ПАПКА `prototype/img/`)
1. `chair.jpg` — "Professional studio product photograph of a modern ergonomic office chair with gray fabric seat and black metal frame, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, square composition"
2. `lamp.jpg` — "Professional studio product photograph of a minimalist LED desk lamp, black metal arm, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, square composition"
3. `handle.jpg` — "Professional studio product photograph of a brushed stainless steel door lever handle, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, square composition"
4. `drill.jpg` — "Professional studio product photograph of a cordless drill driver power tool, black and dark green body, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, no logos, square composition"
5. `paint.jpg` — "Professional studio product photograph of a white paint bucket with a paint roller resting on it, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, square composition"
6. `faucet.jpg` — "Professional studio product photograph of a modern chrome kitchen faucet mixer tap, centered, plain light neutral gray seamless background, soft even e-commerce lighting, no text, no watermark, square composition"

---

## 12. СТРУКТУРА ПАПОК ПРОЕКТА
```
raw-renamer-studio/
├── prototype/                 ← Интерактивный HTML-прототип
│   ├── index.html
│   └── img/                   ← 6 демо-картинок (chair, lamp, handle, drill, paint, faucet)
├── src-tauri/                 ← Rust / Tauri v2
│   ├── Cargo.toml
│   └── tauri.conf.json        ← Настройка externalBin для Python sidecar
├── src/                       ← React + TS + Tailwind
│   ├── components/
│   │   ├── ProductCard.tsx    ← Карточка товара с D&D ракурсов
│   │   ├── ZayavkaModal.tsx   ← Генератор заявок из PIM
│   │   ├── VirtualGrid.tsx    ← Виртуализированная сетка товаров
│   │   └── Toolbar.tsx
│   ├── store/useSession.ts    ← Zustand стейт-менеджер
│   └── App.tsx
└── src-python/                ← Python FastAPI Sidecar
    ├── server.py              ← FastAPI /preview и /rpc
    ├── raw_engine.py          ← Быстрый Embedded JPEG парсер
    ├── scanner.py             ← Двухэтапный сканер ШК
    ├── excel_worker.py        ← openpyxl (чтение A/D, запись L/M)
    ├── pim_builder.py         ← Генератор заявки из PIM CSV в .xlsx
    ├── renamer.py             ← Safe Two-Phase Rename + Undo Journal
    └── requirements.txt
```

---

## 13. ИНЖЕНЕРНЫЕ ТРЕБОВАНИЯ И БЕЗОПАСНОСТЬ (ДОСЛОВНО ДЛЯ ИИ)
1. **Никогда не делать полный демозаик RAW для превью!** Только чтение встроенного JPEG (через Exif/TIFF заголовок).
2. **Все пути файлов оборачивать в `pathlib.Path`** для одинаковой работы на macOS и Windows.
3. **Запись в `.xlsx`:** использовать `openpyxl`. Всегда проверять доступ на запись перед стартом. При ошибке `PermissionError` выдавать диалог с предложением закрыть файл в Excel.
4. **Сортировка кадров по натуральным числам:** сортировать `_M2A0881.CR2`, `_M2A0882.CR2` через regex `\d+`, а не лексикографически.
5. **Безопасное переименование:** сначала проверять коллизии. При циклических переименованиях (1→2, 2→1) использовать промежуточный суффикс `.tmp_rename`.

---

## 14. ПОШАГОВАЯ ДОРОЖНАЯ КАРТА РАЗРАБОТКИ
- **ЭТАП 1:** Восстановление прототипа в `prototype/index.html` и генерация демо-фото в `prototype/img/`.
- **ЭТАП 2:** Разработка Python-модулей ядра:
  - `pim_builder.py`: парсинг экспорта PIM и создание эталонного `.xlsx`;
  - `excel_worker.py`: чтение столбцов A и D, запись столбцов L (12) и M (13);
  - `raw_engine.py`: мгновенный экстрактор превью;
  - `scanner.py`: распознавание ШК;
  - `renamer.py`: транзакционный безопасный ренейм и откат Undo.
- **ЭТАП 3:** FastAPI сервер `server.py` с реализацией контракта `SIDECAR_PROTOCOL_SPEC`.
- **ЭТАП 4:** Инициализация проекта Tauri + React, сборка фронтенда на основе компонентов прототипа.
- **ЭТАП 5:** Связка Tauri с Python sidecar, тестирование на реальных RAW-файлах и сборка кроссплатформенных установщиков (.dmg / .exe).

---

## 15. ПОЛНЫЙ КОД ИНТЕРАКТИВНОГО ПРОТОТИПА
> Содержимое между маркерами `<<<START_PROTOTYPE_HTML>>>` и `<<<END_PROTOTYPE_HTML>>>` необходимо сохранить как `prototype/index.html` в кодировке UTF-8.

<<<START_PROTOTYPE_HTML>>>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAW Renamer Studio — прототип</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" media="print">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"></noscript>
<style>
:root{
  --bg-base:#0D0E12;
  --bg-panel:#14151A;
  --bg-surface:#1A1C23;
  --bg-surface-hover:#20222B;
  --bg-elevated:#262933;
  --bg-input:#14151A;
  --bd-subtle:rgba(255,255,255,.055);
  --bd-default:rgba(255,255,255,.09);
  --bd-strong:#2A2D38;
  --tx-primary:#F4F5F8;
  --tx-secondary:#A7ACBC;
  --tx-tertiary:#82899D;
  --accent:#7C6CF0;
  --accent-text:#8D7EF5;
  --accent-fill:#6E5CE7;
  --accent-fill-hover:#6A57E2;
  --accent-hover:#8D7EF5;
  --accent-tint:rgba(124,108,240,.16);
  --warm:#F0A24E;
  --success:#3FBE84;
  --success-tint:rgba(63,190,132,.14);
  --warning:#E8A23C;
  --warning-tint:rgba(232,162,60,.15);
  --danger:#E5484D;
  --danger-tint:rgba(229,72,77,.15);
  --info:#5FA8F5;
  --info-tint:rgba(95,168,245,.13);
  --radius-btn:6px;
  --radius-card:8px;
  --radius-pop:12px;
  --shadow-md:0 4px 12px rgba(0,0,0,.45);
  --shadow-lg:0 12px 32px rgba(0,0,0,.55);
  --shadow-lift:0 16px 40px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.5);
  /* стекло (material) */
  --glass-tint:rgba(26,28,35,.62);
  --glass-tint-strong:rgba(19,20,26,.78);
  --glass-edge:inset 0 1px 0 rgba(255,255,255,.07);
  --glass-blur:16px;
  --mono-tabular: var(--mono);
  --font:'Inter',-apple-system,'SF Pro Text','Segoe UI',system-ui,sans-serif;
  --mono:'JetBrains Mono','SF Mono','Cascadia Code','Menlo',monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{
  font-family:var(--font);color:var(--tx-primary);background:var(--bg-base);
  font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;overflow:hidden;
  user-select:none;
}
button{font-family:inherit;color:inherit;background:none;border:none;cursor:pointer}
input{font-family:inherit}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.09);border-radius:8px;border:3px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16);background-clip:content-box}
::-webkit-scrollbar-track{background:transparent}
@media (prefers-reduced-motion: reduce){
  *{transition:none !important; animation:none !important}
}

/* ================= APP SHELL ================= */
.app{display:flex;flex-direction:column;height:100vh}
.titlebar{
  height:44px;flex:0 0 44px;display:flex;align-items:center;gap:14px;
  background:var(--bg-panel);border-bottom:1px solid var(--bd-subtle);
  padding:0 10px 0 14px;
}
.titlebar .drag-region{display:flex;align-items:center;gap:10px;flex:0 0 auto}
.logo{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;flex:0 0 auto}
.logo svg{display:block}
.app-name{font-weight:600;font-size:13.5px;letter-spacing:.01em}
.tb-divider{width:1px;height:20px;background:var(--bd-default)}
.session{
  font-size:12px;color:var(--tx-secondary);background:var(--bg-surface);
  border:1px solid var(--bd-subtle);border-radius:6px;padding:4px 11px;
  display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;
}
.session b{color:var(--tx-primary);font-weight:600;font-family:var(--mono);font-size:11.5px}
.dot-live{width:6px;height:6px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success);flex:0 0 auto}
.mode-badge{
  font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--accent-text);background:var(--accent-tint);border:1px solid rgba(141,126,245,.26);
  padding:2px 7px;border-radius:999px;flex:0 0 auto;
}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.chip-kbd{
  display:inline-flex;align-items:center;gap:5px;height:27px;padding:0 10px;border-radius:8px;
  font-family:var(--mono);font-size:11px;color:var(--tx-tertiary);
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
}
.chip-kbd kbd{font-family:var(--mono);font-size:10.5px;color:var(--tx-secondary);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-bottom-width:2px;border-radius:4px;padding:0 5px}
.ibtn{
  width:30px;height:30px;border-radius:7px;display:grid;place-items:center;
  color:var(--tx-secondary);transition:background .12s,color .12s;
}
.ibtn:hover{background:var(--bg-elevated);color:var(--tx-primary)}

/* ================= LEFT SIDEBAR ================= */
.main{flex:1;display:flex;min-height:0}
.sidebar{
  width:248px;flex:0 0 248px;background:var(--bg-panel);
  border-right:1px solid var(--bd-subtle);display:flex;flex-direction:column;min-height:0;
  transition:margin .2s ease;
}
.sidebar.closed{margin-left:-248px}
.sb-scroll{flex:1;overflow-y:auto;padding:12px 10px}
.sb-label{
  font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--tx-tertiary);padding:12px 8px 6px;display:flex;justify-content:space-between;align-items:center;
}
.sb-item{
  display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border-radius:7px;
  font-size:13px;color:var(--tx-secondary);margin-bottom:1px;transition:background .12s,color .12s;text-align:left;
}
.sb-item:hover{background:var(--bg-surface-hover);color:var(--tx-primary)}
.sb-item.active{background:var(--accent-tint);color:var(--accent-text);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);border:1px solid rgba(141,126,245,.22)}
.sb-item .ic{width:16px;height:16px;flex:0 0 auto;opacity:.85}
.sb-item .n{margin-left:auto;font-size:10.5px;font-weight:600;font-family:var(--mono);color:var(--tx-tertiary);background:rgba(255,255,255,.05);padding:1px 6px;border-radius:10px}
.sb-item.active .n{background:var(--accent);color:var(--bg-base)}
.sb-quick{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--bd-subtle);flex:0 0 auto}
.sb-quick button{
  flex:1;height:32px;display:flex;align-items:center;justify-content:center;gap:6px;
  font-size:12px;font-weight:600;border-radius:7px;color:var(--tx-secondary);transition:all .12s;
}
.sb-quick .lb{background:var(--bg-elevated);color:var(--tx-primary)}
.sb-quick .lb:hover{background:#2F333F}

/* ================= CONTENT ================= */
.content{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.toolbar{
  padding:14px 16px 10px;display:flex;align-items:center;gap:12px;flex:0 0 auto;flex-wrap:wrap;
}
/* фильтры-чипы (стекло) */
.filters{display:flex;gap:6px;flex-wrap:wrap}
.fchip{
  display:inline-flex;align-items:center;gap:6px;height:29px;padding:0 11px;border-radius:999px;
  font-size:12px;font-weight:600;color:var(--tx-secondary);
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:all .12s;
}
.fchip:hover{color:var(--tx-primary);background:rgba(255,255,255,.08)}
.fchip.active{color:var(--tx-primary);background:var(--bg-elevated);border-color:rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 1px 4px rgba(0,0,0,.35)}
.fchip .fcnt{font-family:var(--mono);font-size:10.5px;font-weight:600;color:var(--tx-tertiary);background:rgba(255,255,255,.05);padding:0 6px;border-radius:999px}
.fchip .fcnt.ok{color:var(--success)} .fchip .fcnt.warn{color:var(--warning)} .fchip .fcnt.info{color:var(--info)}
.search{
  position:relative;display:flex;align-items:center;
}
.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--tx-tertiary)}
.search input{
  width:250px;height:36px;background:var(--bg-input);border:1px solid var(--bd-default);
  border-radius:8px;padding:0 12px 0 34px;font-size:13px;color:var(--tx-primary);
  font-family:var(--mono);outline:none;transition:border .15s,box-shadow .15s;
}
.search input::placeholder{color:var(--tx-tertiary);font-family:var(--mono);font-size:12px}
.search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.zoom-ctl{display:flex;align-items:center;gap:2px;background:var(--bg-input);border:1px solid var(--bd-default);border-radius:8px;padding:2px}
.zoom-ctl button{width:27px;height:27px;border-radius:6px;display:grid;place-items:center;color:var(--tx-secondary)}
.zoom-ctl button:hover{background:var(--bg-elevated);color:var(--tx-primary)}
.zoom-ctl .z{font-size:11px;font-family:var(--mono);color:var(--tx-tertiary);width:30px;text-align:center}
.spacer{flex:1}
.tb-btn{
  height:32px;display:flex;align-items:center;gap:7px;padding:0 12px;border-radius:8px;
  background:var(--bg-input);border:1px solid var(--bd-default);font-size:12.5px;font-weight:600;color:var(--tx-secondary);transition:all .12s;
}
.tb-btn:hover{background:var(--bg-elevated);color:var(--tx-primary)}
.tb-btn .ic{width:14px;height:14px}
.kbd-mini{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--tx-tertiary);white-space:nowrap}
.kbd-mini b{font-family:var(--mono);font-weight:600;color:var(--tx-secondary);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:10.5px}
.dev-note{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tx-tertiary);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:1px 5px;border-radius:4px;opacity:.85}
.sb-cta{height:34px}
.tb-cta{
  height:36px;display:flex;align-items:center;gap:8px;padding:0 16px;border-radius:8px;
  background:var(--accent-fill);font-size:12.5px;font-weight:700;color:#fff;
  box-shadow:0 2px 10px rgba(110,92,231,.35);transition:background .15s,transform .05s;
}
.tb-cta:hover{background:var(--accent-fill-hover)}
.tb-cta:active{transform:translateY(1px)}

/* ================= GRID ================= */
.grid-wrap{flex:1;overflow-y:auto;padding:6px 16px 16px;min-height:0}
.grid{
  display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));
  align-items:start;
}
.card{
  background:var(--bg-surface);border:1px solid var(--bd-subtle);border-radius:var(--radius-card);
  overflow:hidden;transition:background .15s, transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s;position:relative;
}
.card:hover{background:var(--bg-surface-hover)}
.card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* выбранная карточка не обводится рамкой — ПОДНИМАЕТСЯ */
.card.selected{
  transform:translateY(-2px) scale(1.015);
  box-shadow:var(--shadow-lift), inset 0 0 0 1px rgba(141,126,245,.38);
  border-color:rgba(141,126,245,.28);
  z-index:2;
}
.ph{position:relative;aspect-ratio:4/3;background:#0F1015;border-bottom:1px solid var(--bd-subtle)}
.ph .phbg{position:absolute;inset:0;background-size:cover;background-position:center;filter:saturate(.8) contrast(1.02)}
.ph .fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,14,18,0) 52%,rgba(13,14,18,.55) 100%)}
.frame-no{
  position:absolute;bottom:7px;right:7px;font-family:var(--mono);font-size:9.5px;color:rgba(255,255,255,.9);
  background:rgba(11,12,16,.5);backdrop-filter:blur(6px);padding:2px 7px;border-radius:6px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
}
.card.err{border-color:var(--danger)}
.card.err .err-ring{position:absolute;inset:0;border:2px solid var(--danger);border-radius:7px;pointer-events:none;box-shadow:0 0 14px rgba(229,72,77,.18)}
.chip{
  position:absolute;top:8px;left:8px;display:inline-flex;align-items:center;gap:5px;
  font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  letter-spacing:.01em;box-shadow:var(--glass-edge), 0 1px 3px rgba(0,0,0,.3);
  border:1px solid transparent;
}
.chip .ci{width:11px;height:11px}
.chip.right{left:auto;right:8px}
.chip.ok{background:rgba(32,54,44,.6);color:var(--success);border-color:rgba(63,190,132,.3)}
.chip.warn{background:rgba(58,44,20,.62);color:var(--warning);border-color:rgba(232,162,60,.32)}
.chip.err{background:rgba(66,26,32,.66);color:#F17177;border-color:rgba(229,72,77,.4)}
.chip.newc{background:rgba(26,40,60,.62);color:var(--info);border-color:rgba(95,168,245,.3)}
.chip.prim{background:rgba(28,26,44,.66);color:var(--accent-text);border-color:rgba(141,126,245,.32)}
.card-body{padding:10px 12px 11px}
.card-art{font-family:var(--mono);font-weight:600;font-size:13.5px;color:var(--tx-primary);letter-spacing:.01em;font-variant-numeric:tabular-nums}
.card-gtin{font-family:var(--mono);font-size:11px;color:var(--tx-tertiary);margin-top:2px;font-variant-numeric:tabular-nums}
.card-meta{display:flex;align-items:center;gap:6px;margin-top:9px;flex-wrap:wrap}
.tag{
  font-family:var(--mono);font-size:10.5px;font-weight:600;color:var(--tx-secondary);
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);padding:2px 7px;border-radius:5px;
}
.tag.y{color:var(--warm);border-color:rgba(240,162,78,.3);background:rgba(240,162,78,.08)}
.tag.prim{color:var(--accent-text);border-color:rgba(141,126,245,.32);background:rgba(124,108,240,.1)}
.tag.miss{color:var(--tx-tertiary)}
/* парящая стеклянная полоса действий (glass-md): видна в полсилы, проявляется на ховер */
.card-act{
  position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:5px;padding:4px;
  background:rgba(19,20,26,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-radius:9px;box-shadow:var(--glass-edge), 0 6px 18px rgba(0,0,0,.5);
  opacity:0;transform:translateY(4px);transition:opacity .14s ease, transform .14s ease;
  pointer-events:none;
}
.card:hover .card-act, .card:focus-within .card-act{opacity:1;transform:none;pointer-events:auto}
@media (hover:hover){ .card-act{display:flex} }
@media (hover:none){ .card-act{display:none} }
.mini{
  flex:1;height:28px;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:6px;
  font-size:11.5px;font-weight:600;color:var(--tx-secondary);background:rgba(255,255,255,.05);transition:all .12s;
}
.mini:hover{color:var(--tx-primary);background:rgba(255,255,255,.1)}
.mini.prime{background:var(--accent-fill);color:#fff}
.mini.prime:hover{background:var(--accent-fill-hover)}

/* ================= STATUS BAR ================= */
.statusbar{
  height:40px;flex:0 0 40px;display:flex;align-items:center;gap:14px;padding:0 14px;
  background:var(--bg-panel);border-top:1px solid var(--bd-subtle);font-size:12px;color:var(--tx-secondary);
}
.sb-stat{display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:7px}
.sb-stat[data-sc]{cursor:pointer;transition:background .12s}
.sb-stat[data-sc]:hover{background:rgba(255,255,255,.05)}
.sb-stat .cnt{font-family:var(--mono);font-weight:700;color:var(--tx-primary);font-size:12px}
.sb-stat .cnt.ok{color:var(--success)}.sb-stat .cnt.warn{color:var(--warning)}.sb-stat .cnt.info{color:var(--info)}
.sb-l{font-size:11.5px;color:var(--tx-tertiary)}
.api{display:flex;align-items:center;gap:6px;margin-left:auto}
#sbZoom{color:var(--tx-tertiary);margin-right:4px}
.api .dot{width:7px;height:7px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success)}
.api .dot-hint{color:var(--tx-tertiary)}
.fresh{width:6px;height:6px;border-radius:50%;background:var(--warm);box-shadow:0 0 6px var(--warm);display:none}
.fresh.on{display:inline-block;animation:pulse 2.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.btn-ghost{
  height:28px;display:flex;align-items:center;gap:7px;padding:0 11px;border-radius:7px;
  font-size:12px;font-weight:600;color:var(--tx-secondary);background:var(--bg-surface);border:1px solid var(--bd-subtle);transition:all .12s;
}
.btn-ghost:hover{background:var(--bg-elevated);color:var(--tx-primary)}
.btn-ghost .ic{width:14px;height:14px}
.btn-ghost.acc{color:var(--accent-text);border-color:rgba(124,108,240,.35);background:var(--accent-tint)}
.btn-ghost.acc:hover{background:rgba(124,108,240,.2)}

/* ================= DETAIL PANEL ================= */
.right-panel{
  width:320px;flex:0 0 320px;
  background:rgba(20,21,26,.66);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-left:1px solid rgba(255,255,255,.06);box-shadow:inset 1px 0 0 rgba(255,255,255,.03);
  display:flex;flex-direction:column;min-height:0;transition:margin .2s ease;
}
.right-panel.closed{margin-right:-320px}
.rp-head{
  display:flex;align-items:center;gap:8px;padding:14px 14px 8px;
}
.rp-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-tertiary)}
.rp-head .spacer{flex:1}
.rp-scroll{flex:1;overflow-y:auto;padding:0 14px 14px}
.rp-img{position:relative;aspect-ratio:4/3;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.07);margin-bottom:12px;background:#0F1015;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.rp-img .phbg{position:absolute;inset:0;background-size:cover;background-position:center}
.rp-num{position:absolute;bottom:7px;right:7px;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.85);background:rgba(11,12,16,.55);padding:2px 6px;border-radius:5px}
.rp-zimg{position:absolute;top:7px;right:7px;width:26px;height:26px;border-radius:7px;background:rgba(11,12,16,.5);backdrop-filter:blur(4px);display:grid;place-items:center;color:#fff}
.rp-name{font-family:var(--mono);font-weight:600;font-size:14px;font-variant-numeric:tabular-nums}
.rp-sub{font-size:12px;color:var(--tx-tertiary);font-family:var(--mono);margin-top:2px;font-variant-numeric:tabular-nums}
.rp-row{display:flex;justify-content:space-between;align-items:center;padding:8px 4px;font-size:12.5px}
.rp-row + .rp-row{border-top:1px solid rgba(255,255,255,.05)}
.rp-row .k{color:var(--tx-tertiary)}
.rp-row .v{font-family:var(--mono);font-weight:600;color:var(--tx-primary);display:flex;align-items:center;gap:6px}
.rp-row .v .badge{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px}
.badge.good{background:var(--success-tint);color:var(--success)}
.badge.warnb{background:var(--warning-tint);color:var(--warning)}
.badge.newb{background:var(--info-tint);color:var(--info)}
.conf{font-size:11.5px;font-family:var(--mono);color:var(--tx-secondary);background:var(--bg-surface);border:1px solid var(--bd-subtle);border-radius:6px;padding:5px 9px}
.rp-actions{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.rp-btn{
  height:34px;display:flex;align-items:center;justify-content:center;gap:7px;border-radius:8px;
  font-size:12.5px;font-weight:600;transition:all .12s;
}
.rp-btn.primary{background:var(--accent-fill);color:#fff;box-shadow:0 2px 10px rgba(110,92,231,.3)}
.rp-btn.primary:hover{background:var(--accent-fill-hover)}
.rp-btn.secondary{background:var(--bg-surface);border:1px solid var(--bd-default);color:var(--tx-primary)}
.rp-btn.secondary:hover{background:var(--bg-elevated)}
.rp-btn.danger{background:var(--danger-tint);color:#F17177}
.rp-btn.danger:hover{background:rgba(229,72,77,.22)}

/* ================= MODALS ================= */
.modal-overlay{
  position:fixed;inset:0;background:rgba(6,7,10,.72);backdrop-filter:blur(4px);
  display:flex;align-items:center;justify-content:center;z-index:60;opacity:0;pointer-events:none;transition:opacity .18s;
}
.modal-overlay.open{opacity:1;pointer-events:auto}
.modal{
  width:520px;max-width:calc(100vw - 40px);max-height:calc(100vh - 60px);overflow:hidden;
  background:#1C1E26;border:1px solid var(--bd-strong);border-radius:var(--radius-pop);
  box-shadow:var(--shadow-lg);display:flex;flex-direction:column;transform:scale(.98);transition:transform .18s;
}
.modal-overlay.open .modal{transform:scale(1)}
.m-head{padding:18px 20px 12px;flex:0 0 auto}
.m-title{font-size:16px;font-weight:700}
.m-sub{font-size:12.5px;color:var(--tx-tertiary);margin-top:4px}
.m-body{padding:4px 20px 8px;overflow-y:auto}
.m-foot{padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--bd-subtle)}
.m-close{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--tx-tertiary)}
.m-close:hover{background:var(--bg-elevated);color:var(--tx-primary)}
.finput label{display:block;font-size:12px;font-weight:600;color:var(--tx-secondary);margin:10px 0 6px}
.finput .big-mono{
  width:100%;height:46px;background:var(--bg-input);border:1.5px solid var(--bd-default);border-radius:9px;
  font-family:var(--mono);font-size:20px;letter-spacing:.18em;color:var(--tx-primary);text-align:center;outline:none;
}
.finput .big-mono:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.hint{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--tx-tertiary);margin-top:8px}
.hint .ic{width:13px;height:13px;flex:0 0 auto}
.diff{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px;margin-top:6px}
.diff th{
  text-align:left;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--tx-tertiary);
  font-weight:600;padding:6px 8px;border-bottom:1px solid var(--bd-default);font-family:var(--font);
}
.diff td{padding:7px 8px;border-bottom:1px solid var(--bd-subtle)}
.diff td.old{color:var(--tx-tertiary);text-decoration:line-through;text-decoration-color:rgba(229,72,77,.6)}
.diff td.new{color:var(--success);font-weight:600}
.diff td.act{color:var(--tx-secondary)}
.diff tr:hover td{background:var(--bg-surface)}
.m-note{background:var(--accent-tint);border:1px solid rgba(124,108,240,.25);border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--tx-secondary);margin-top:10px;display:flex;gap:9px}
.m-note .ic{width:15px;height:15px;color:var(--accent);flex:0 0 auto;margin-top:1px}
.toast{
  position:fixed;top:54px;right:16px;z-index:80;max-width:360px;
  background:rgba(28,29,38,.78);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));
  border:1px solid rgba(255,255,255,.09);border-radius:12px;
  box-shadow:var(--glass-edge), var(--shadow-lg);
  padding:12px 14px;display:flex;gap:10px;align-items:flex-start;
  transform:translateY(-8px);opacity:0;pointer-events:none;transition:all .22s;
}
.toast.show{transform:none;opacity:1;pointer-events:auto}
.toast .ic{width:16px;height:16px;flex:0 0 auto;margin-top:1px}
.toast .t{font-size:12.5px;color:var(--tx-primary);font-weight:600}
.toast .s{font-size:11.5px;color:var(--tx-tertiary);margin-top:3px;line-height:1.4}
.toast .tc{cursor:pointer;flex:0 0 auto;margin-left:10px;font-size:11.5px;font-weight:700;color:var(--accent-text);padding:2px 0}
.toast .tx{margin-left:auto;color:var(--tx-tertiary);cursor:pointer}

/* ================= LIGHTBOX ================= */
.lightbox{
  position:fixed;inset:0;background:rgba(6,7,10,.9);backdrop-filter:blur(5px);z-index:70;
  display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .15s;
}
.lightbox.open{opacity:1;pointer-events:auto}
.lb-img{max-width:78%;max-height:78%;border-radius:12px;border:1px solid var(--bd-strong);box-shadow:var(--shadow-lg);background:#0F1015}
.lb-cap{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:12px;color:var(--tx-secondary);background:rgba(15,16,21,.7);backdrop-filter:blur(4px);padding:5px 12px;border-radius:8px}
.lb-x{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,.06);display:grid;place-items:center;color:#fff}
.lb-x:hover{background:rgba(255,255,255,.14)}

@media (max-width:1180px){ .right-panel{width:280px;flex-basis:280px} }
</style>
</head>
<body>
<div class="app">

  <!-- ============ TITLEBAR ============ -->
  <header class="titlebar">
    <div class="drag-region">
      <div class="logo">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="lg" x1="2" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#8D7EF5"/><stop offset="1" stop-color="#F0A24E"/></linearGradient></defs>
          <rect x="2" y="2" width="18" height="18" rx="5.5" fill="url(#lg)"/>
          <path d="M7.2 15V7h2.1l3.9 5.2V7h2V15h-2.1L9.2 9.8V15H7.2z" fill="#0D0E12"/>
        </svg>
      </div>
      <div class="app-name">RAW Renamer Studio</div>
    </div>
    <div class="tb-divider"></div>
    <div class="session"><span class="dot-live"></span><span>Партия <b>shoot_2026-09-16</b></span><span class="mode-badge" id="modeBadge" title="Режим партии">CV-сканер</span></div>
    <div class="tb-right">
      <span class="chip-kbd" title="Быстрые команды"><kbd>⌘</kbd>K</span>
      <button class="ibtn" id="menuBtn" title="Меню — справка и настройки"><svg class="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>
    </div>
  </header>

  <div class="main">
    <!-- ============ LEFT SIDEBAR ============ -->
    <aside class="sidebar" id="sidebar">
      <div class="sb-scroll">
        <div class="sb-label">Сессии <button class="ibtn" style="width:20px;height:20px" title="Новая партия (демо)"><svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button></div>
        <button class="sb-item active"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>shoot_2026-09-16<span class="n" id="sessionCount">26</span></button>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>shoot_2026-09-15<span class="n">41</span></button>
        <div class="sb-label">Подготовка</div>
        <button class="sb-item" id="openZayavkaBtn" style="color:var(--accent-text)"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>Генератор заявки<span class="n" style="background:var(--accent-tint);color:var(--accent-text)">PIM</span></button>
        <div class="sb-label">Журнал</div>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>Операции<span class="n">184</span></button>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Журнал Excel</button>
        <div class="sb-label">Служебное</div>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Кэш ШК → Артикул</button>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Откат (Undo)</button>
        <button class="sb-item"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Настройки</button>
      </div>
      <div class="sb-quick">
        <button class="lb" id="toggleSidebar" title="Свернуть панель">Свернуть</button>
      </div>
    </aside>

    <!-- ============ CONTENT ============ -->
    <main class="content">
      <div class="toolbar">
        <div class="toolbar-row" style="display:flex;align-items:center;gap:12px;width:100%">
          <div class="filters" id="filters">
            <button class="fchip active" data-f="all">Все <span class="fcnt" id="fcAll">18</span></button>
            <button class="fchip" data-f="ok">Готово <span class="fcnt ok" id="fcOk">0</span></button>
            <button class="fchip" data-f="err">Требуют внимания <span class="fcnt warn" id="fcErr">0</span></button>
            <button class="fchip" data-f="new">Новые <span class="fcnt info" id="fcNew">0</span></button>
          </div>
          <div class="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>
            <input id="searchInput" placeholder="ШК или артикул…" spellcheck="false">
          </div>
        </div>
        <div class="spacer"></div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="kbd-mini">Быстрый просмотр <b>Space</b></span>
          <button class="tb-btn" id="undoBtn" title="Отмена последней операции (⌘Z)">
            <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>Отменить
          </button>
          <div class="zoom-ctl">
            <button id="zoomOut" title="Мельче (−)">−</button>
            <span class="z" id="zoomVal">100%</span>
            <button id="zoomIn" title="Крупнее (+)">+</button>
          </div>
        </div>
      </div>

      <div class="grid-wrap" id="gridWrap">
        <div class="grid" id="grid"></div>
      </div>
    </main>

    <!-- ============ RIGHT PANEL ============ -->
    <aside class="right-panel" id="rightPanel">
      <div class="rp-head">
        <span class="rp-title">Товар</span>
        <div class="spacer"></div>
        <button class="ibtn" id="closePanel" title="Закрыть панель"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="rp-scroll" id="rpScroll"></div>
    </aside>
  </div>

  <!-- ============ STATUS BAR ============ -->
  <footer class="statusbar">
    <span class="sb-stat" data-sc="ok" title="Показать только готовые"><span class="cnt ok" id="stReady">0</span><span class="sb-l">готово</span></span>
    <span class="sb-stat" data-sc="err" title="Показать требующие внимания"><span class="cnt warn" id="stErr">0</span><span class="sb-l">требуют внимания</span></span>
    <span class="sb-stat" data-sc="new" title="Показать новые"><span class="cnt info" id="stNew">0</span><span class="sb-l">новых</span></span>
    <span class="sb-stat"><span class="cnt" id="stFrames">0</span><span class="sb-l">кадров</span></span>
    <span class="sb-l" id="sbZoom">сетка · 100%</span>
    <span class="api"><span class="dot"></span>APIM v3<span class="dot-hint" title="Служба работает">· prod</span><span class="dev-note">эмуляция</span></span>
    <button class="tb-btn" id="syncBtn" style="gap:6px"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><polyline points="21 3 21 9 15 9"/></svg>Excel<span class="fresh" id="excelFresh"></span></button>
    <button class="tb-cta sb-cta" id="renameBtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Переименовать всё</button>
  </footer>
</div>

<!-- ============ MODALS ============ -->
<div class="modal-overlay" id="barcodeModal">
  <div class="modal">
    <div class="m-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="m-title">Ввести штрихкод вручную</div><div class="m-sub" id="bcSub">Кадр без распознанного ШК · Товар №3</div></div>
      <button class="m-close" data-close><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="m-body">
      <div class="finput">
        <label>Штрихкод (EAN-13)</label>
        <input class="big-mono" id="bcInput" maxlength="13" placeholder="4650101098817" value="4650101098817">
      </div>
      <div id="bcLive"></div>
      <div class="hint"><svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>Контрольная цифра верна · EAN-13</div>
    </div>
    <div class="m-foot">
      <button class="rp-btn secondary" style="width:auto;padding:0 16px" data-close>Отмена</button>
      <button class="rp-btn primary" style="width:auto;padding:0 20px" id="bcApply">Найти в API и применить</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="renameModal">
  <div class="modal" style="width:640px">
    <div class="m-head" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="m-title">Именование кадров</div><div class="m-sub" id="renameSub"></div></div>
      <button class="m-close" data-close><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="m-body">
      <table class="diff">
        <thead><tr><th>Было</th><th>Станет</th><th style="width:110px">Действие</th></tr></thead>
        <tbody id="diffBody"></tbody>
      </table>
      <div class="m-note"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>После именования в Excel-отчёт запишутся ракурсы (колонка 11) и флаг этикетки (колонка 12). Отмена — одной кнопкой ⌘Z.</span></div>
    </div>
    <div class="m-foot">
      <button class="rp-btn secondary" style="width:auto;padding:0 16px" data-close>Назад</button>
      <button class="rp-btn primary" style="width:auto;padding:0 20px" id="renameApply">Переименовать 26 файлов</button>
    </div>
  </div>
</div>

<div class="lightbox" id="lightbox">
  <div class="lb-img" id="lbImg"></div>
  <div class="lb-cap" id="lbCap"></div>
  <button class="lb-x" id="lbClose"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
</div>

<div class="toast" id="toast">
  <svg class="ic" id="toastIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></svg>
  <div>
    <div class="t" id="toastTitle"></div>
    <div class="s" id="toastSub"></div>
  </div>
  <button class="tc" id="toastAct" style="display:none"></button>
  <span class="tx" id="toastX">✕</span>
</div>


<!-- ============ ZAYAVKA BUILDER MODAL ============ -->
<div class="modal-overlay" id="zayavkaModal">
  <div class="modal" style="width:840px;max-width:92vw;max-height:88vh;display:flex;flex-direction:column">
    <div class="m-head" style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px;border-bottom:1px solid var(--bd-default)">
      <div>
        <div class="m-title" style="font-size:16px;display:flex;align-items:center;gap:8px">
          <svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
          Генератор заявки на съёмку из PIM
        </div>
        <div class="m-sub" style="margin-top:2px;font-size:12px;color:var(--tx-secondary)">Импорт сырой выгрузки PIM (export_*.csv) → автозаполнение полей → эталонная заявка (ДД.ММ.ГГГГ.csv)</div>
      </div>
      <button class="m-close" id="closeZayavkaModal"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    
    <div class="m-body" style="padding:18px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:16px">
      <!-- DROP ZONE -->
      <div id="zDropZone" style="border:2px dashed var(--bd-strong);border-radius:8px;padding:22px;text-align:center;background:var(--bg-panel);cursor:pointer;transition:border-color .2s">
        <input type="file" id="zFileInput" accept=".csv,.tsv,.txt" style="display:none">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style="font-size:13px;font-weight:600;color:var(--tx-primary)">Перетащите сюда файл export_*.csv или кликните для выбора</div>
          <div style="font-size:11.5px;color:var(--tx-tertiary)">Поддерживается кодировка UTF-16 (PIM) и UTF-8, разделители Tab и Точка с запятой</div>
          <button class="rp-btn secondary" style="width:auto;margin-top:4px;padding:4px 14px;font-size:12px" id="zSampleBtn">Загрузить демо-выгрузку PIM (30 товаров)</button>
        </div>
      </div>

      <!-- PARAMS -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;background:var(--bg-panel);padding:12px 14px;border-radius:6px;border:1px solid var(--bd-subtle)">
        <div class="finput" style="margin:0">
          <label style="font-size:11px">Фотограф</label>
          <input id="zPhotographer" value="Кирилл" style="height:30px;font-size:12px">
        </div>
        <div class="finput" style="margin:0">
          <label style="font-size:11px">Организация</label>
          <input id="zOrg" value="photo production" style="height:30px;font-size:12px">
        </div>
        <div class="finput" style="margin:0">
          <label style="font-size:11px">Дата съёмки</label>
          <input id="zDate" value="17.09.2026" style="height:30px;font-size:12px">
        </div>
      </div>

      <!-- PREVIEW TABLE -->
      <div id="zTableWrap" style="display:none;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;font-weight:600;color:var(--tx-primary)">Распознано товаров: <span id="zItemCount" style="color:var(--accent-text);font-family:'JetBrains Mono'">0</span></div>
          <div style="font-size:11px;color:var(--tx-tertiary)">Колонки 11 (ракурсы) и 12 (ШК) готовы для скрипта ренейминга</div>
        </div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid var(--bd-default);border-radius:6px;background:var(--bg-surface)">
          <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:left" id="zPreviewTable">
            <thead>
              <tr style="background:var(--bg-panel);color:var(--tx-secondary);border-bottom:1px solid var(--bd-default);position:sticky;top:0">
                <th style="padding:6px 10px;font-weight:600">Код LM</th>
                <th style="padding:6px 10px;font-weight:600">Отдел</th>
                <th style="padding:6px 10px;font-weight:600">Товар</th>
                <th style="padding:6px 10px;font-weight:600">GTIN</th>
                <th style="padding:6px 10px;font-weight:600">Модель ADEO</th>
              </tr>
            </thead>
            <tbody id="zTableBody" style="font-family:'JetBrains Mono',monospace">
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="m-foot" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid var(--bd-default)">
      <div style="font-size:11.5px;color:var(--tx-secondary)" id="zStatusMsg">Ожидание загрузки файла экспорта...</div>
      <div style="display:flex;gap:8px">
        <button class="rp-btn secondary" style="width:auto;padding:0 14px" id="zCancelBtn">Отмена</button>
        <button class="rp-btn primary" style="width:auto;padding:0 18px;display:none" id="zExportBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать заявку (.csv)
        </button>
      </div>
    </div>
  </div>
</div>

<script>
/* ==================== ДАННЫЕ ПРОТОТИПА (демо-набор) ==================== */
const IMG = {
  chair:'img/chair.jpg', lamp:'img/lamp.jpg', handle:'img/handle.jpg',
  drill:'img/drill.jpg', paint:'img/paint.jpg', faucet:'img/faucet.jpg'
};
/* Товары: id, артикул, шк, фото, кадры (суффиксы), статус, новый */
const dc=(s,h,color)=>({suffix:s,photo:h,color:color});
const P=()=>({type:'placeholder'});
function makeProducts(){
  return [
    {id:1, art:'89458028', gtin:'4650101098817', frames:[dc('главный',IMG.chair,null),dc('_01',IMG.chair,'warm'),dc('_02',IMG.chair,'violet')], status:'ok', isNew:false},
    {id:2, art:'89458031', gtin:'4650101098831', frames:[dc('главный',IMG.lamp,null)], status:'ok', isNew:false},
    {id:3, art:'—', gtin:'—', frames:[P()], status:'err', isNew:false},
    {id:4, art:'89458102', gtin:'4650101098902', frames:[dc('главный',IMG.handle,null),dc('_01',IMG.handle,'warm')], status:'ok', isNew:false},
    {id:5, art:'89458044', gtin:'4650101098844', frames:[dc('главный',IMG.drill,null),dc('_y',IMG.drill,null),dc('_01',IMG.drill,'warm'),dc('_02',IMG.drill,'violet'),dc('_03',IMG.drill,'cyan')], status:'ok', isNew:false},
    {id:6, art:'89458047', gtin:'4650101098847', frames:[dc('главный',IMG.paint,null),dc('_01',IMG.paint,'warm'),dc('_02',IMG.paint,'violet')], status:'warn', isNew:false},
    {id:7, art:'89458053', gtin:'4650101098853', frames:[dc('главный',IMG.faucet,null),dc('_01',IMG.faucet,'warm')], status:'ok', isNew:true},
    {id:8, art:'89458059', gtin:'4650101098859', frames:[dc('главный',IMG.lamp,null),dc('_y',IMG.lamp,null),dc('_01',IMG.lamp,'warm')], status:'ok', isNew:false},
    {id:9, art:'89458061', gtin:'4650101098861', frames:[dc('главный',IMG.chair,null),dc('_01',IMG.chair,'warm'),dc('_02',IMG.chair,'violet')], status:'ok', isNew:false},
    {id:10, art:'89458064', gtin:'4650101098864', frames:[dc('главный',IMG.drill,null),dc('_y',IMG.drill,null),dc('_01',IMG.drill,'warm'),dc('_02',IMG.drill,'violet'),dc('_03',IMG.drill,'cyan')], status:'ok', isNew:false},
    {id:11, art:'89458067', gtin:'4650101098867', frames:[dc('главный',IMG.lamp,null),dc('_01',IMG.lamp,'warm')], status:'ok', isNew:false},
    {id:12, art:'89458072', gtin:'4650101098872', frames:[dc('главный',IMG.paint,null),dc('_01',IMG.paint,'warm'),dc('_02',IMG.paint,'violet'),dc('_03',IMG.paint,'cyan')], status:'warn', isNew:false},
    {id:13, art:'89458075', gtin:'4650101098875', frames:[dc('главный',IMG.faucet,null),dc('_01',IMG.faucet,'warm'),dc('_02',IMG.faucet,'violet')], status:'ok', isNew:true},
    {id:14, art:'89458078', gtin:'4650101098878', frames:[dc('главный',IMG.handle,null),dc('_01',IMG.handle,'warm')], status:'ok', isNew:false},
    {id:15, art:'89458081', gtin:'4650101098881', frames:[dc('главный',IMG.lamp,null),dc('_y',IMG.lamp,null),dc('_01',IMG.lamp,'warm'),dc('_02',IMG.lamp,'violet')], status:'ok', isNew:false},
    {id:16, art:'89458083', gtin:'4650101098883', frames:[dc('главный',IMG.drill,null)], status:'ok', isNew:false},
    {id:17, art:'89458085', gtin:'4650101098885', frames:[dc('главный',IMG.paint,null),dc('_01',IMG.paint,'warm')], status:'warn', isNew:false},
    {id:18, art:'89458088', gtin:'4650101098888', frames:[dc('главный',IMG.faucet,null),dc('_y',IMG.faucet,null),dc('_01',IMG.faucet,'warm'),dc('_02',IMG.faucet,'violet'),dc('_03',IMG.faucet,'cyan')], status:'ok', isNew:false}
  ];
}
let products = makeProducts();
let selectedId = null;
let zoom = 100;

/* ==================== ХЕЛПЕРЫ ==================== */
const $=s=>document.querySelector(s);
const grid=$('#grid'), rp=$('#rpScroll'), gridWrap=$('#gridWrap');
const el=(tag,cls,html)=>{const e=document.createElement(tag); if(cls)e.className=cls; if(html!==undefined)e.innerHTML=html; return e;};
const iconsvg=(d,sz=14)=>`<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I_OK=iconsvg('<polyline points="20 6 9 17 4 12"/>');
const I_WARN=iconsvg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
const I_ERR=iconsvg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>');
const I_NEW=iconsvg('<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>');
const I_EDIT=iconsvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
const I_SPLIT=iconsvg('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3.5 3v18" stroke-width="3"/>');
const I_MERGE=iconsvg('<path d="M21 8l-6 4v-3H9a4 4 0 0 0 0 8h6v-3l6 4V8z" stroke-width="0" fill="currentColor"/>');
const I_ARROW=iconsvg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',13);
const PINK='#E8A0EC', CYAN='#7FD1E8', VIOLETC='#B7A4FF', WARM='#F0A24E';

const imgUrl=p=> (p||IMG.chair);
const photoEl=(p, cls)=>{const d=el('div',cls); d.style.backgroundImage=`url('${imgUrl(p)}')`; return d;};

function statusChip(p){
  if(p.status==='ok') return `<span class="chip ok"><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Готово</span>`;
  if(p.status==='err') return `<span class="chip err"><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>ШК не распознан</span>`;
  return `<span class="chip warn"><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Без этикетки</span>`;
}
function newChip(){return `<span class="chip newc">${I_NEW.replace('width="14"','width="11"').replace('height="14"','height="11"')}&nbsp;Новый</span>`;}

function renderCard(p){
  const c=el('div','card'+(p.status==='err'?' err':'')+(p.id===selectedId?' selected':''));
  c.tabIndex=0; c.dataset.id=p.id;
  const ph=el('div','ph');
  const bgPhoto=p.frames[0]&&p.frames[0].photo;
  if(p.status==='err'){ ph.style.background='linear-gradient(160deg,#1A1517,#16121A)'; ph.innerHTML=`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8A6E72" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/><line x1="9" y1="9" x2="9" y2="9.01"/></svg></div>`; }
  else{ ph.appendChild(photoEl(bgPhoto,'phbg')); ph.appendChild(el('div','fade')); }
  ph.appendChild(el('div','frame-no',(p.frames[0]&&p.frames[0].type==='placeholder')?'нет кадра':`${p.frames.length} кадр.`));
  if(p.status==='err') ph.appendChild(el('div','err-ring'));
  ph.innerHTML += statusChip(p) + (p.isNew?newChip():'');
  /* главный ракурс — привязка к линии «Главное» */
  const hero=p.frames.find(f=>f.suffix==='главный');
  if(hero) ph.innerHTML += `<span class="chip prim right" style="font-weight:500">Главный</span>`;
  c.appendChild(ph);
  const b=el('div','card-body');
  b.innerHTML=`<div class="card-art">${p.id===3?'нет артикула':p.art}</div><div class="card-gtin">${p.id===3?'ШК не распознан · ввод: R':p.gtin}</div><div class="card-meta" id="meta${p.id}"></div>`;
  c.appendChild(b);
  const act=el('div','card-act');
  const y=!!p.frames.find(f=>f.suffix==='_y'||f.suffix==='_tag');
  const nClean=p.frames.filter(f=>f.type!=='placeholder' && !(f.suffix==='_y'||f.suffix==='_tag')).length;
  const meta=b.querySelector('#meta'+p.id);
  if(p.status!=='err'){
    meta.innerHTML=y?`<span class="tag y">_y</span>`:``;
    if(nClean) meta.innerHTML+=`<span class="tag">${nClean} ракурс.</span>`;
  } else {
    meta.innerHTML=`<span class="tag miss">ввод ШК</span>`;
  }
  act.innerHTML=`
    <button class="mini prime" data-act="open">Открыть</button>
    <button class="mini" data-act="split" title="Разделить товар">${I_SPLIT.replace('width="14"','width="12"').replace('height="14"','height="12"')}</button>
    <button class="mini" data-act="merge" title="Объединить">${I_MERGE.replace('width="14"','width="12"').replace('height="14"','height="12"')}</button>`;
  c.appendChild(act);
  return c;
}

function renderGrid(){
  grid.innerHTML='';
  products.forEach(p=>grid.appendChild(renderCard(p)));
  updateStats();
}

/* панель товара */
function renderPanel(p){
  rp.innerHTML='';
  const bg=p.frames[0]&&p.frames[0].photo;
  const img=el('div','rp-img');
  if(p.status==='err'){ img.style.background='linear-gradient(160deg,#1A1517,#16121A)'; img.innerHTML=`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8A6E72;font-size:11px">нет превью — введите ШК</div>`; }
  else { img.appendChild(photoEl(bg,'phbg')); img.appendChild(el('div','rp-num',`1 / ${p.frames.length}`,));
    const zi=el('button','rp-zimg',iconsvg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.6" y2="16.6"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',13));
    zi.onclick=()=>openLightbox(bg, `${p.art} · главный кадр`);
    img.appendChild(zi);
  }
  rp.appendChild(img);
  const head=el('div');
  head.innerHTML=`<div class="rp-name">${p.id===3?'Товар №3 · не распознан':p.art}</div><div class="rp-sub">${p.id===3?'требуется ручной ввод':p.gtin+" · LM Code"}</div>`;
  rp.appendChild(head);
  const y=!!p.frames.find(f=>f.suffix==='_y'||f.suffix==='_tag');
  const clean=p.frames.filter(f=>f.type!=='placeholder' && !(f.suffix==='_y'||f.suffix==='_tag')).length;
  const rows=[
    ['Ракурсов', `${clean}`, null],
    ['Этикетка _y', y?'есть':'нет', y?'<span class="badge good">есть</span>':'<span class="badge warnb">нет</span>'],
    ['Excel', p.isNew?'дописать строку':`строка ${(p.id*3)%97+3}`, p.isNew?'<span class="badge newb">новый</span>':null],
    ['Источник', p.id===3?'—':'распознано с фото', null],
  ];
  rows.forEach(r=>{
    const row=el('div','rp-row');
    row.innerHTML=`<span class="k">${r[0]}</span><span class="v">${r[1]}${r[2]||''}</span>`;
    rp.appendChild(row);
  });
  const fr=el('div','rp-row');
  fr.innerHTML=`<span class="k">Кадры (суффикс)</span>`;
  rp.appendChild(fr);
  const chips=el('div',null); chips.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin:6px 0 4px';
  p.frames.forEach(f=>{
    const t=el('span','tag'); t.textContent=f.type==='placeholder'?'пусто':(f.suffix==='главный'?'—':f.suffix);
    if(f.suffix==='_y') t.className='tag y';
    chips.appendChild(t);
  });
  rp.appendChild(chips);
  rp.appendChild(el('div',null,'<div class="conf" style="margin-top:6px;font-size:10.5px;color:var(--tx-tertiary)">Уверенность ШК: 98% · привязка кадров: 1→5</div>'));

  const act=el('div','rp-actions');
  act.innerHTML=`<button class="rp-btn primary" data-act="open">${I_EDIT} Открыть ракурсы</button>`;
  if(p.status==='err') act.innerHTML+=`<button class="rp-btn secondary" data-act="barcode">Ввести штрихкод вручную…</button>`;
  else act.innerHTML+=`<button class="rp-btn secondary" data-act="renamesolo">Переименовать этот товар</button>`;
  act.innerHTML+=`<button class="rp-btn secondary" data-act="split">${I_SPLIT} Разделить товар</button>`;
  rp.appendChild(act);
}

function renderPanelIfSelected(){
  if(selectedId==null){ return; }
  const p=products.find(x=>x.id===selectedId); if(p) renderPanel(p);
}

function select(id){
  selectedId=id;
  document.querySelectorAll('.card.selected').forEach(c=>c.classList.remove('selected'));
  const c=grid.querySelector(`.card[data-id="${id}"]`); if(c)c.classList.add('selected');
  renderPanelIfSelected();
}

function updateStats(){
  let ok=0,err=0,nw=0,frames=0;
  products.forEach(p=>{if(p.status==='ok')ok++;else if(p.status==='err')err++;if(p.isNew)nw++;frames+=p.frames.filter(f=>f.type!=='placeholder').length;});
  const set=(id,v)=>{const eln=$(id); if(eln) eln.textContent=v;};
  set('#stReady',ok); set('#stErr',err); set('#stNew',nw); set('#stFrames',frames);
  set('#sessionCount',products.length);
  set('#fcAll',products.length); set('#fcOk',ok); set('#fcErr',err); set('#fcNew',nw);
}

/* ==================== ТОСТ ==================== */
let toastTimer;
function toast(title,sub,icon,actText,actFn){
  const t=$('#toast'); $('#toastTitle').textContent=title; $('#toastSub').textContent=sub;
  const ti=$('#toastIcon'); ti.style.color='var(--accent)';
  ti.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  if(icon==='ok'){ ti.innerHTML=I_OK; ti.style.color='var(--success)'; }
  if(icon==='undo'){ ti.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>'; ti.style.color='var(--warm)'; }
  if(icon==='err'){ ti.innerHTML=I_ERR; ti.style.color='var(--danger)'; }
  const ta=$('#toastAct');
  if(actText && actFn){ ta.textContent=actText; ta.style.display='inline'; ta.onclick=()=>{ t.classList.remove('show'); actFn(); }; }
  else { ta.style.display='none'; ta.onclick=null; }
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),4600);
}
$('#toastX').onclick=()=>{ $('#toast').classList.remove('show'); clearTimeout(toastTimer); };

/* ==================== МОДАЛКИ ==================== */
function openModal(id){$(id).classList.add('open');}
function closeAllModals(){document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));}
document.querySelectorAll('.m-close,[data-close]').forEach(b=>b.onclick=closeAllModals);
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeAllModals();}));

/* штрихкод */
$('#bcInput').addEventListener('input',function(){
  this.value=this.value.replace(/\D/g,'').slice(0,13);
  const v=this.value;
  const box=$('#bcLive');
  if(v.length===13){
    const valid=checksum(v);
    const art=lookupArt(v);
    box.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-top:10px;background:var(--bg-surface);border:1px solid var(--bd-default);border-radius:8px;padding:9px 11px;font-size:12.5px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>
      <span style="color:var(--tx-secondary)">API найдено:</span>
      <span style="font-family:var(--mono);font-weight:700;color:var(--success)">${art.art}</span>
      <span style="color:var(--tx-tertiary);font-size:11px">LM Code · есть в Excel</span></div>`;
  } else if(v.length>0){
    box.innerHTML=`<div style="margin-top:10px;font-size:12px;color:var(--tx-tertiary)">введено ${v.length}/13 цифр</div>`;
  } else box.innerHTML='';
});
$('#bcApply').onclick=()=>{
  const v=$('#bcInput').value;
  if(!v||v.length!==13){toast('Проверьте штрихкод','Нужно 13 цифр (EAN-13)','err');return;}
  const a=lookupArt(v);
  const p=products.find(x=>x.id===3);
  if(p){ p.art=a.art; p.gtin=v; p.status='ok'; p.frames=[dc('главный',a.img,null),dc('_01',a.img,'warm')]; }
  /* связывание кнопок сайдбара (демо) */
const sbActions={
  'Журнал Excel':()=>toast('Журнал Excel','Сюда пишется обратная запись: колонки 11–12 после именования'),
  'Кэш ШК':()=>toast('Кэш ШК → Артикул','SQLite: 1 248 записей · путь: ~/.cache/rawrenamer'),
  'Откат (Undo)':()=>toast('Отменено: последняя операция','Имена файлов и Excel возвращены к прежнему состоянию','undo'),
  'Настройки':()=>toast('Настройки','Папки · Excel · API · вид · горячие клавиши'),
};
document.querySelectorAll('.sb-item').forEach(b=>{
  b.addEventListener('click',()=>{
    const t=(b.textContent||'').trim().split('\n')[0].trim();
    const key=Object.keys(sbActions).find(k=>t.startsWith(k));
    if(key) sbActions[key]();
  });
});
/* клавиатурная навигация по карточкам */
grid.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key)) return;
  const card=e.target.closest('.card'); if(!card) return;
  e.preventDefault();
  const cards=[...grid.querySelectorAll('.card')];
  const idx=cards.indexOf(card);
  if(e.key==='Enter'){ const p=products.find(x=>x.id===+card.dataset.id); if(p) openRakurs(p); return; }
  const col=Math.max(1,Math.floor((grid.clientWidth)/ (cards[0]?cards[0].offsetWidth+14:1)));
  let next=-1;
  if(e.key==='ArrowRight') next=idx+1;
  else if(e.key==='ArrowLeft') next=idx-1;
  else if(e.key==='ArrowDown') next=Math.min(idx+col,cards.length-1);
  else if(e.key==='ArrowUp') next=Math.max(idx-col,0);
  if(next>=0&&next<cards.length){ cards[next].focus(); select(+cards[next].dataset.id); }
});

rebuild(); select(3);
  closeAllModals();
  toast('Штрихкод применён','Товар №3 сопоставлен с артикулом '+a.art,'ok');
};

/* именование */
function openRename(){
  const p=products.find(x=>x.id===3);
  if(p&&(p.status==='err'||!p.gtin||p.gtin==='—')){
    select(3); openBarcode();
    toast('Сначала решите товар №3','Штрихкод не распознан — введите вручную','err');
    return;
  }
  renderDiff(); openModal('#renameModal');
}
$('#renameBtn').onclick=openRename;
function buildDiffRows(){
  const rows=[];
  products.forEach(p=>{
    if(p.status==='err'||!p.art||p.art==='—')return;
    const ext='.CR2';
    const y=p.frames.find(f=>f.suffix==='_y'||f.suffix==='_tag');
    if(y) rows.push({old:`${p.gtin}_y${ext}`,nw:`${p.art}_y${ext}`,act:'Этикетка'});
    const clean=p.frames.filter(f=>f.type!=='placeholder' && f.suffix!=='_y' && f.suffix!=='_tag');
    clean.forEach((f,idx)=>{
      let s=f.suffix==='главный' ? '' : f.suffix;
      if(s!=='' && !/^_\d+$/.test(s)) s='_'+String(idx).padStart(2,'0');
      const act = s==='' ? 'Главный' : ('Ракурс '+s);
      rows.push({old:`${p.gtin}${s}${ext}`,nw:`${p.art}${s}${ext}`,act});
    });
  });
  return rows;
}
function renderDiff(){
  const rows=buildDiffRows();
  $('#renameSub').textContent=`Партия shoot_2026-09-16 · ${rows.length} файлов · ${products.filter(p=>p.status!=='err'&&p.art&&p.art!=='—').length} товаров (1 пропущен с ошибкой)`;
  const tbody=$('#diffBody'); tbody.innerHTML='';
  rows.slice(0,16).forEach(r=>{
    const tr=el('tr');
    tr.innerHTML=`<td class="old">${r.old}</td><td class="new">${r.a}${r.act==='этикетка'?'_y':(r.act==='главный'?'':r.act)}${'.CR2'}</td><td class="act">${r.act}</td>`;
    tbody.appendChild(tr);
  });
  if(rows.length>16){const tr=el('tr');tr.innerHTML=`<td colspan="3" class="act">… и ещё ${rows.length-16} файлов</td>`;tbody.appendChild(tr);}
  $('#renameApply').textContent=`Переименовать ${rows.length} файлов`;
}
$('#renameApply').onclick=()=>{
  const n=buildDiffRows().length;
  closeAllModals();
  toast('Переименование выполнено',`${n} файлов переименованы · Excel-отчёт обновлён`, 'ok', 'Отменить ⌘Z', ()=>{ toast('Отменено','Имена файлов и Excel возвращены к прежнему состоянию','undo'); });
};

/* лайтбокс */
function openLightbox(src,cap){ $('#lbImg').style.backgroundImage=`url('${src}')`; $('#lbImg').style.backgroundSize='cover'; $('#lbImg').style.backgroundPosition='center'; $('#lbImg').style.width='min(78vw,1100px)'; $('#lbImg').style.height='min(78vh,780px)'; $('#lbCap').textContent=cap; $('#lightbox').classList.add('open'); }
/* Быстрый просмотр (Space) — полноэкранная лупа */
document.addEventListener('keydown',e=>{
  if(e.code==='Space' && !e.metaKey && !e.ctrlKey && !e.altKey){
    const tgt=document.activeElement;
    if(tgt && tgt.closest && tgt.closest('.card')){
      e.preventDefault();
      const p=products.find(x=>x.id===+tgt.closest('.card').dataset.id);
      if(p){ const hero=p.frames.find(f=>f.suffix==='главный')||p.frames[0];
        openLightbox(hero&&hero.photo?imgUrl(hero.photo):imgUrl(IMG.chair), `${p.art} · ${p.gtin} · быстрый просмотр`); }
    }
  }
});
$('#lbClose').onclick=()=>$('#lightbox').classList.remove('open');
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    $('#lightbox').classList.remove('open');
    closeAllModals();
    if(e.target) e.target.blur();
  }
});
/* мультивыделение: Shift/Ctrl/Cmd + клик (демо склейки) */
let multi=false;
document.addEventListener('keydown',e=>{ if(['Meta','Control','Shift'].includes(e.key)) multi=true; });
document.addEventListener('keyup',e=>{ if(['Meta','Control','Shift'].includes(e.key)) multi=false; });
window.addEventListener('blur',()=>{ multi=false; });
/* openAction */
function openRakurs(p){
  const hero=p.frames.find(f=>f.suffix==='главный')||p.frames[0];
  openLightbox(hero&&hero.photo?imgUrl(hero.photo):imgUrl(IMG.chair), `${p.art} · ${p.gtin}`);
  toast('Экран «Ракурсы»','В полной версии здесь 5 линий медиабуков и Drag & Drop ракурсов');
}
function openBarcode(){ openModal('#barcodeModal'); }
/* кастомные суффиксы в демо не редактируются */

/* ==================== ЧЦ ==================== */
function checksum(s){
  let sum=0;
  for(let i=0;i<12;i++){ const d=+s[i]; sum += d*(i%2===0?1:3); }
  return (10-(sum%10))%10 === +s[12];
}
function lookupArt(gtin){
  const by={ '4650101098817':{art:'89458028',img:IMG.chair}, '4650101098831':{art:'89458031',img:IMG.lamp},
   '4650101098902':{art:'89458102',img:IMG.handle}, '4650101098844':{art:'89458044',img:IMG.drill},
   '4650101098847':{art:'89458047',img:IMG.paint}, '4650101098853':{art:'89458053',img:IMG.faucet},
   '4650101098859':{art:'89458059',img:IMG.lamp} };
  const r=by[gtin];
  if(r) return r;
  // любой валидный EAN-13 → придумать артикул для демо
  let h=0; for(const c of gtin) h=(h*31+c.charCodeAt(0))>>>0;
  return {art:'89'+(h%100000).toString().padStart(6,'0'), img:IMG.paint};
}

/* ==================== СОБЫТИЯ СЕТКИ ==================== */
grid.addEventListener('click',e=>{
  const card=e.target.closest('.card'); if(!card)return;
  const id=+card.dataset.id; const p=products.find(x=>x.id===id);
  select(id);
  const btn=e.target.closest('[data-act]');
  if(btn){
    const act=btn.dataset.act;
    if(act==='open'){ openRakurs(p); }
    else if(act==='split'){ toast('Разделить товар','Инструмент активен: выберите кадры для новой группы'); }
    else if(act==='merge'){ toast('Объединить товары','Выберите второй товар для объединения'); }
  } else {
    if(p.status==='err'){ openBarcode(); }
  }
});
grid.addEventListener('dblclick',e=>{
  const card=e.target.closest('.card'); if(!card)return;
  const id=+card.dataset.id; const p=products.find(x=>x.id===id); if(!p)return;
  select(id); openRakurs(p);
});

rp.addEventListener('click',e=>{
  const btn=e.target.closest('[data-act]'); if(!btn)return;
  const p=products.find(x=>x.id===selectedId); if(!p)return;
  const act=btn.dataset.act;
  if(act==='open') openRakurs(p);
  else if(act==='barcode') openBarcode();
  else if(act==='renamesolo'){ toast('Переименован 1 товар','3 файла → 89458028*','ok'); }
  else if(act==='split') toast('Разделить товар','Выберите кадры для новой группы (демо)');
});
$('#closePanel').onclick=()=>{ $('#rightPanel').classList.add('closed'); };

/* ==================== TOPBAR / TOOLBAR ==================== */
$('#menuBtn').onclick=()=>toast('Меню','Справка · Настройки · Горячие клавиши · О приложении');
$('#modeBadge').onclick=()=>{
  mode = (mode==='cv') ? 'names' : 'cv';
  $('#modeBadge').textContent = (mode==='cv') ? 'CV-сканер' : 'По именам';
  toast('Режим партии', mode==='cv' ? 'ШК читается из embedded JPEG превью' : 'Имена файлов уже содержат ШК');
};
$('#toggleSidebar').onclick=()=>{ $('#sidebar').classList.toggle('closed'); };
$('#zoomIn').onclick=()=>zoomStep(1);
$('#zoomOut').onclick=()=>zoomStep(-1);
function zoomStep(d){
  zoom=Math.max(75,Math.min(150,zoom+d*10));
  const size=Math.max(150, Math.round(210*zoom/100));
  grid.style.gridTemplateColumns=`repeat(auto-fill,minmax(${size}px,1fr))`;
  $('#zoomVal').textContent=zoom+'%';
  const sbz=$('#sbZoom'); if(sbz) sbz.textContent=`сетка · ${zoom}%`;
}
/* поиск + фильтры работают вместе */
function applyFilters(){
  const q=($('#searchInput').value||'').trim().toLowerCase();
  document.querySelectorAll('.card').forEach(c=>{
    const p=products.find(x=>x.id===+c.dataset.id); if(!p) return;
    let show=true;
    if(q && !(p.art+p.gtin).toLowerCase().includes(q)) show=false;
    if(show && filter!=='all'){
      if(filter==='ok' && p.status!=='ok') show=false;
      if(filter==='err' && p.status!=='err') show=false;
      if(filter==='new' && !p.isNew) show=false;
    }
    c.style.display=show?'':'none';
  });
}
$('#searchInput').addEventListener('input',applyFilters);
document.querySelectorAll('#filters .fchip').forEach(b=>
  b.addEventListener('click',()=>{
    filter=b.dataset.f;
    document.querySelectorAll('#filters .fchip').forEach(x=>x.classList.toggle('active',x===b));
    applyFilters();
  })
);
document.querySelectorAll('.sb-stat[data-sc]').forEach(s=>
  s.addEventListener('click',()=>{
    const sc=s.dataset.sc;
    filter=(filter===sc)?'all':sc;
    document.querySelectorAll('#filters .fchip').forEach(x=>x.classList.toggle('active',x.dataset.f===filter));
    applyFilters();
  })
);
$('#syncBtn').onclick=()=>{
  toast('Excel-отчёт обновлён','Записано: колонка 11 (ракурсы), колонка 12 (флаг _y)','ok');
  const f=$('#excelFresh'); if(f){ f.classList.add('on'); setTimeout(()=>f.classList.remove('on'),8000); }
};
$('#undoBtn').onclick=()=>toast('Отменено: последняя операция','Имена файлов и Excel возвращены к прежнему состоянию','undo');
/* командные клавиши (macOS ⌘ / Windows Ctrl) */
document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey;
  if(mod && (e.key==='z'||e.key==='Z'||e.key==='я'||e.key==='Я')){
    e.preventDefault();
    toast('Отменено: последняя операция','Имена файлов и Excel возвращены к прежнему состоянию','undo');
  }
  if(mod && (e.key==='k'||e.key==='K'||e.key==='л'||e.key==='Л')){
    e.preventDefault();
    toast('Командная палитра','Поиск действий · в полной версии: ⌘K');
  }
});

/* ==================== ИНИЦИАЛИЗАЦИЯ ==================== */
let filter='all', mode='cv';
function rebuild(){ renderGrid(); renderPanelIfSelected(); }
renderGrid();
select(1);

// ============ ZAYAVKA BUILDER LOGIC ============
const zModal = document.getElementById('zayavkaModal');
const openZBtn = document.getElementById('openZayavkaBtn');
const closeZBtn = document.getElementById('closeZayavkaModal');
const zCancelBtn = document.getElementById('zCancelBtn');
const zDropZone = document.getElementById('zDropZone');
const zFileInput = document.getElementById('zFileInput');
const zSampleBtn = document.getElementById('zSampleBtn');
const zTableWrap = document.getElementById('zTableWrap');
const zTableBody = document.getElementById('zTableBody');
const zItemCount = document.getElementById('zItemCount');
const zExportBtn = document.getElementById('zExportBtn');
const zStatusMsg = document.getElementById('zStatusMsg');

let parsedZayavkaRows = [];

if (openZBtn) {
  openZBtn.addEventListener('click', () => { zModal.classList.add('open'); });
}
if (closeZBtn) closeZBtn.addEventListener('click', () => { zModal.classList.remove('open'); });
if (zCancelBtn) zCancelBtn.addEventListener('click', () => { zModal.classList.remove('open'); });

if (zDropZone) {
  zDropZone.addEventListener('click', (e) => {
    if (e.target !== zSampleBtn) zFileInput.click();
  });
  zDropZone.addEventListener('dragover', (e) => { e.preventDefault(); zDropZone.style.borderColor = 'var(--accent-text)'; });
  zDropZone.addEventListener('dragleave', () => { zDropZone.style.borderColor = 'var(--bd-strong)'; });
  zDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    zDropZone.style.borderColor = 'var(--bd-strong)';
    if (e.dataTransfer.files.length) handleZayavkaFile(e.dataTransfer.files[0]);
  });
}

if (zFileInput) {
  zFileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleZayavkaFile(e.target.files[0]);
  });
}

if (zSampleBtn) {
  zSampleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadDemoExport();
  });
}

function handleZayavkaFile(file) {
  zStatusMsg.textContent = 'Чтение ' + file.name + '...';
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
    let text = '';
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      const decoder = new TextDecoder('utf-16le');
      text = decoder.decode(buffer);
    } else {
      const decoder = new TextDecoder('utf-8');
      text = decoder.decode(buffer);
    }
    parseExportText(text, file.name);
  };
  reader.readAsArrayBuffer(file);
}

function loadDemoExport() {
  zStatusMsg.textContent = 'Загрузка демонстрационной выгрузки PIM (30 товаров)...';
  parseExportRows(generateDemoRows());
}

function generateDemoRows() {
  return [
    { lm: '82650335', otdel: '3', name: 'AtlasDesign Беж роз б/з дв 16А в сборе', gtin: '3606489583491', model: '200304', gamma: 'А' },
    { lm: '82650336', otdel: '3', name: 'AtlasDesign Беж роз с/з дв 16А в сборе', gtin: '3606489583514', model: '200304', gamma: 'А' },
    { lm: '82650401', otdel: '3', name: 'AtlasDesign Беж роз с/з с/ш 16А мех', gtin: '3606489583613', model: '200304', gamma: 'А' },
    { lm: '82650448', otdel: '3', name: 'AtlasDesign Беж Вывод кабеля мех', gtin: '3606489710675', model: '200304', gamma: 'А' },
    { lm: '82650451', otdel: '3', name: 'AtlasDesign Беж роз б/з 16А мех', gtin: '3606489583583', model: '200304', gamma: 'А' },
    { lm: '89456556', otdel: '3', name: 'Светящаяся электрическая фигура Фонарь Б', gtin: '4650101098817', model: '201375', gamma: 'Ас' },
    { lm: '89459190', otdel: '3', name: 'Рождественская деревня KREAFORTA Рождест', gtin: '4650101109056', model: '201375', gamma: 'Ас' },
    { lm: '89466107', otdel: '3', name: 'Декоративный фонарь Kreaforta Гном 22 см', gtin: '4650101098770', model: '201375', gamma: 'Ас' }
  ];
}

function parseExportText(text, filename) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return;
  const delim = lines[0].includes('\t') ? '\t' : ';';
  const header = lines[0].split(delim).map(c => c.replace(/^[\"\ufeff]+|[\"]+$/g, '').trim());
  
  const idIdx = header.findIndex(h => h.toLowerCase() === 'id' || h.toLowerCase().includes('код lm'));
  const gtinIdx = header.findIndex(h => h.toLowerCase().includes('штрих') || h.toLowerCase() === 'gtin');
  const nameIdx = header.findIndex(h => h.toLowerCase() === 'название' || h.toLowerCase() === 'товар');
  const otdelIdx = header.findIndex(h => h.toLowerCase() === 'отдел');
  const modelIdx = header.findIndex(h => h.toLowerCase() === 'модель');
  const gammaIdx = header.findIndex(h => h.toLowerCase() === 'гамма');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map(c => c.replace(/^[\"]+|[\"]+$/g, '').trim());
    const lm = idIdx >= 0 ? cols[idIdx] : cols[0];
    const gtin = gtinIdx >= 0 ? cols[gtinIdx] : cols[17] || '';
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[1] || '';
    const otdel = otdelIdx >= 0 ? cols[otdelIdx] : cols[2] || '';
    const model = modelIdx >= 0 ? cols[modelIdx] : cols[20] || '';
    const gamma = gammaIdx >= 0 ? cols[gammaIdx] : cols[10] || '';

    if (lm && lm.length >= 6) {
      rows.push({ lm, gtin, name, otdel, model, gamma });
    }
  }

  parseExportRows(rows);
  zStatusMsg.textContent = 'Успешно обработан ' + filename + ' (' + rows.length + ' товаров)';
}

function parseExportRows(rows) {
  parsedZayavkaRows = rows;
  zTableBody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--bd-subtle)';
    tr.innerHTML = '<td style="padding:6px 10px;color:var(--tx-primary);font-weight:600">' + r.lm + '</td>' +
      '<td style="padding:6px 10px;color:var(--tx-tertiary)">' + (r.otdel || '3') + '</td>' +
      '<td style="padding:6px 10px;color:var(--tx-secondary);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + (r.name || '') + '">' + (r.name || '<span style="color:var(--warning)">Без названия</span>') + '</td>' +
      '<td style="padding:6px 10px;color:var(--accent-text)">' + (r.gtin || '—') + '</td>' +
      '<td style="padding:6px 10px;color:var(--tx-tertiary)">' + (r.model || '—') + '</td>';
    zTableBody.appendChild(tr);
  });

  zItemCount.textContent = rows.length;
  zTableWrap.style.display = 'flex';
  zExportBtn.style.display = 'inline-flex';
  zStatusMsg.textContent = 'Готово к выгрузке эталонной заявки для съёмки (' + rows.length + ' артикулов)';
}

if (zExportBtn) {
  zExportBtn.addEventListener('click', () => {
    if (!parsedZayavkaRows.length) return;
    const photographer = document.getElementById('zPhotographer').value || 'Кирилл';
    const org = document.getElementById('zOrg').value || 'photo production';
    const dateVal = document.getElementById('zDate').value || '17.09.2026';

    const header = [
      'Код LM', 'Отдел', 'Товар', 'GTIN', 'Дата\nсъемки', 'Дата AVS', 'Гамма',
      'Модель ADEO', 'Ссылка на фотобук', 'Постащик', 'Организация', 'Итого ракурсов',
      'Ракурс_25', 'Комментарий LM', 'Менеджер', 'Фотограф', 'Ассистент', 'Гладильщик',
      'Часы работы Гладильщика', 'Сборщик', 'Часы работы Сборщика'
    ];

    const lines = [header.join(';')];
    parsedZayavkaRows.forEach(r => {
      const row = [
        r.lm,
        r.otdel || '3',
        '\"' + (r.name || '').replace(/\"/g, '""') + '\"',
        r.gtin || '',
        dateVal,
        '',
        r.gamma || 'А',
        r.model || '',
        'https://fotobook-lemanapro.ru/',
        '?',
        org,
        '0',
        '0',
        '',
        '',
        photographer,
        '', '', '', '', ''
      ];
      lines.push(row.join(';'));
    });

    const csvContent = '\ufeff' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateVal + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    zStatusMsg.textContent = 'Заявка ' + dateVal + '.csv сохранена! Теперь её можно загружать в сессию.';
    setTimeout(() => { zModal.classList.remove('open'); }, 1400);
  });
}

</script>
</body>
</html>

<<<END_PROTOTYPE_HTML>>>

---

## 16. АДДЕНДУМ v3.1 — ДЕСКТОПНЫЙ РЕЛИЗ: ИНЦИДЕНТЫ, ИСПРАВЛЕНИЯ, ИЗМЕНЕНИЯ (2026-09)

> Раздел ведётся как журнал: что сломалось при выводе в десктопную сборку,
> как диагностировано, как решено. Основной текст версий 1–15 не менялся.

### 16.1. Инциденты и корневые причины

**И-1. EXC_CRASH SIGABRT при старте release-сборки на macOS (did_finish_launching).**
- Причины (совокупно):
  1) `sidecar.rs` имел точки паники на критическом пути:
     `spawn().expect("не удалось запустить Python sidecar")`,
     `child.stdout.take().expect(...)`, `.lock().unwrap()` и `panic!` в
     release-поиске бинарника. Любая из них в `setup`/супервизоре = падение
     процесса до и после did_finish_launching;
  2) гонка событий: `sidecar://ready` мог улететь до подписки JS-кода
     (prod-фронт берёт `baseUrl` только из этого события) → вечный offline.
- Решение (v3.1, `src-tauri/src/sidecar.rs` полностью переписан):
  - ни одного `panic/expect/unwrap` на критическом пути; ошибки запуска →
    событие `sidecar://error` во фронтенд (тост с причиной);
  - `setup` разворачивает только фоновый поток-супервизор (GUI не блокируется
    инициализацией OpenCV/ZXing в Python);
  - чтение stdout — отдельный поток до EOF (pipe не переполняется);
  - reap через `try_wait` (500 мс); смерть sidecar → `sidecar://dead` +
    авто-перезапуск (≤3, задержка 1.5 с); «мягкое» зависание ловит
    Python-watchdog (8 с без heartbeat → exit(0));
  - поиск release-бинарника по всем раскладкам Tauri
    (`Contents/MacOS/binaries`, `resources/binaries`, рядом с exe) —
    возвращает `Option`, не паникует;
  - фронтенд: опрос `invoke('sidecar_url')` каждые 500 мс (до 20 с) как
    страховка от гонки + подписка на `sidecar://dead|error`.

**И-2. Ошибка компиляции под Rust 1.98: `Child::id()` возвращает `u32`,
а не `Option<u32>`** (сигнатура изменена в std; E0308).
- Решение: `let id = child.id();` без Option-паттерна. Требование: rustup
  stable 1.9x (`rustup update` при старом тулчейне).

**И-3. «Не получается загрузить таблицу для заявки».**
- Диагностика: генератор PIM создавал xlsx, но **не подключал** её к сессии
  (`session.set_zayavka` не вызывался), и не было сценария «открыть готовую
  заявку .xlsx» нативным диалогом..lookup продолжал работать без таблицы.
- Решение (v3.1, `ZayavkaModal` переписан):
  - сценарий A — «Открыть существующую заявку (.xlsx)»: нативный диалог
    Tauri (`@tauri-apps/plugin-dialog`, фильтр xlsx) → `session.set_zayavka`
    → `_enrich` (Код LM/название/строка подтягиваются ко всем товарам);
    в браузерном режиме — upload + то же;
  - сценарий B — генерация из PIM: после генерации заявка **автоматически
    подключается** к сессии; в Tauri перед генерацией спрашивается каталог
    сохранения (master §5);
  - в окне показан статус: «Подключена: zayavka_…xlsx» / «не подключена».

**И-4. Распаковка архива через Finder сбрасывает права исполнения**
(`permission denied: ./scripts/build-macos.sh`).
- Решение: запуск через `bash scripts/build-macos.sh` (примечание в README),
  `chmod +x scripts/*.sh` — альтернатива.

**И-5 (из предшествующей сессии, кратко):** zxing-cpp 3.x API
(`read_barcodes`, а не `decode`); OpenCV 5.0 — детектор находит область, но не
декодирует (сканер падает на ZXing как контур 2); 4 демо-GTIN имели неверные
контрольные цифры (GTIN теперь считаются из 12-значных префиксов); поле
`/upload` унифицировано на `file`; names-mode: каждый файл без ШК в имени —
отдельный «сиротливый» товар.

### 16.2. Изменения поведения (по требованию оператора, 2026-09-18)

1. **Генератор заявки** — УБРАНЫ поля «Фотограф», «Организация», «Дата съёмки»:
   - «Организация» (колонка D) — фиксированно `photo production`;
   - «Фотограф» (P) и «Дата съемки» (E) — оставлены ПУСТЫМИ (заполняются
     вручную в Excel; допустимы 2 фотографа при смежной съёмке);
   - дата отражается **в имени файла**: `zayavka_ДД.ММ.ГГГГ.xlsx`
     (сегодняшняя дата, формируется на стороне sidecar);
   - `zayavka.generate`: `out_path` может быть каталогом (без расширения) —
     имя формируется само; ответ включает `date`.
2. **Окно «Заявка»** — два сценария (A: открыть xlsx; B: генерация из PIM),
   авто-подключение к сессии, статус подключения в шапке окна.
3. **«Настройки»** — настоящее модальное окно (был только информационный тост):
   - Sidecar: статус/порт, версия, движки (OpenCV/ZXing/PyZBar), кэш,
     каталог данных, текущая заявка;
   - APIM v3: окружение (preprod/prod) и вкл/выкл — применяются на лету
     (новый RPC `system.set_apim`);
   - Журнал Undo: счётчик + «Очистить» (новый RPC `renamer.journal_clear`);
   - Горячие клавиши (справка).
4. **«Новая партия» (+ в Сессиях)** — нативный выбор папки (был тост-подсказка).
5. **Data-dir по платформам** (sidecar): Windows — `%LOCALAPPDATA%\RAW-Renamer-Studio`,
   macOS — `~/Library/Application Support/RAW Renamer Studio`,
   Linux — `~/.cache/raw-renamer`.

### 16.3. Новые/изменённые RPC (к §8)

| Метод | Статус | Примечание |
|---|---|---|
| `system.set_apim` | НОВЫЙ | `{env: preprod\|prod, enabled: bool}` → пересоздаёт Lookup (кэш сохраняется) |
| `renamer.journal_clear` | НОВЫЙ | очищает журнал Undo, `{cleared: n}` |
| `zayavka.generate` | ИЗМЕНЁН | без `photographer/org/date` в заполнении; `out_path` = каталог; ответ `+date` |
| `session.set_zayavka` | ПОДТВЕРЖДЁН | выполняет `_enrich` (подтягивает Код LM/название/строку) |
| `system.info` | ИЗМЕНЁН | `+apim: {env, enabled}` |

### 16.4. Платформенные конвенции (к §7/§13)

- Windows: sidecar spawn-ится с `CREATE_NO_WINDOW` (0x08000000) —
  GUI-приложение Tauri без консоли не должно поднимать консольное окно.
- externalBin раскладка: macOS `Contents/MacOS/binaries/`, Windows
  `resources/binaries/`, Linux `binaries/`; runtime-поиск по всем
  вариантам + рядом с exe.
- Cargo release-профиль: `strip` не используется (нет зависимости от
  утилиты на Windows).

### 16.5. Файлы, изменённые в v3.1

```
src-tauri/src/sidecar.rs          # полный rewrite: panic-free супервизор
src/lib/sidecar.ts                # isTauri(), события dead/error, poll sidecar_url
src/store/useSession.ts           # модалка settings, обработчик событий
src/components/ZayavkaModal.tsx   # rewrite: открыть xlsx / генерация / авто-подключение
src/components/SettingsModal.tsx  # НОВЫЙ: окно настроек
src/components/Sidebar.tsx        # Настройки → модалка; «+» → выбор папки
src/App.tsx                       # рендер SettingsModal
src/types.ts                      # SystemInfo.apim
src-python/server.py              # zayavka.generate v3.1, set_apim, journal_clear, info.apim
src-python/pim_builder.py         # DEFAULTS: фотограф/дата — пустые; org фикс.
src-python/renamer.py             # Journal.clear()
README.md                         # сборка (chmod/finder), кросс с мака, бэкап-файл
PROJECT_STATUS.md                 # статус/продолжение (новое)
scripts/*                         # build-macos.sh, build-windows.ps1,
                                  # build-windows-from-macos.sh
```
