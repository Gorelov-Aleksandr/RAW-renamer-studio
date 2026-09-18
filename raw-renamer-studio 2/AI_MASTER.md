# RAW Renamer Studio — AI Agent Master
# Compact spec for AI agents. Each section = one subsystem.

## META
Product: Desktop RAW photo renamer for Leroy Merlin studio photographers
Stack: Tauri v2 + React 18 + TS + Tailwind 3 + Python FastAPI sidecar
User: Russian-speaking, macOS primary, Windows later
Version: 0.1.0

## ARCHITECTURE
Tauri spawns Python sidecar → writes port to .sidecar/port
Frontend (Vite/Tauri webview) proxies /rpc /preview /upload to sidecar
Communication: JSON-RPC 2.0 POST /rpc
Preview: GET /preview/{file_hash}?size=320 → JPEG
Upload: POST /upload multipart "file"
Watchdog: heartbeat every 3s, exit after 8s without ping

## FILE TREE (82 files, ~10,500 LOC)
```
raw-renamer-studio/
├── package.json
├── vite.config.ts + sidecar-proxy.ts
├── tailwind.config.ts (colors: base, panel, surface, accent, warm, ok, warn, danger)
├── src/
│   ├── App.tsx (Header + Sidebar + Toolbar + VirtualGrid + RightPanel + StatusBar + Modals)
│   ├── index.css (Tailwind + custom scrollbar + .mono-tag)
│   ├── lib/ (cx.ts, sidecar.ts)
│   ├── store/useSession.ts (Zustand: all state + actions)
│   ├── types.ts (Frame, Item, SessionData, PlanRow, SystemInfo)
│   └── components/ (12 files: Sidebar, Toolbar, StatusBar, VirtualGrid, ProductCard,
│                     RightPanel, SettingsModal, ZayavkaModal, RenameModal,
│                     BarcodeModal, Lightbox, Toasts)
├── src-tauri/
│   ├── Cargo.toml, build.rs, tauri.conf.json
│   └── src/ (main.rs, lib.rs, sidecar.rs — panic-free supervisor with auto-restart)
├── src-python/
│   ├── server.py (FastAPI: /rpc, /preview, /upload, /health)
│   ├── scanner.py (OpenCV → ZXing → PyZBar cascade)
│   ├── session.py (scan_folder, plan_item, CV/names modes)
│   ├── renamer.py (2-phase rename + undo journal)
│   ├── excel_worker.py (read A/D, write L/M, atomic save)
│   ├── pim_builder.py (CSV→xlsx, auto-detect encoding)
│   ├── lookup.py (zayavka → SQLite cache → APIM v3)
│   ├── raw_engine.py (embedded JPEG extraction, file_hash)
│   └── requirements.txt, sidecar.spec
├── scripts/ (build-macos.sh, build-windows.ps1, build-windows-from-macos.sh)
├── tools/make_demo_batch.py
├── demo_batch/ (CR2 files, PIM CSV, zayavka xlsx)
└── docs/RAW_RENAMER_STUDIO_ULTIMATE_MASTER.md (1677 lines full spec)
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
system.heartbeat, system.info, system.set_apim
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

## BUILD
npm install → npm run build → npx tauri build
Sidecar: python3 src-python/server.py --port 0 --port-file .sidecar/port
PyInstaller: pyinstaller src-python/sidecar.spec → binaries/raw-renamer-sidecar-{triple}

## CHANGES LOG
v3.2.1 (2026-09-18):
- CSV loading: auto-detect encoding (UTF-16 LE/BE BOM, UTF-8 BOM, UTF-16 LE no BOM)
- New RPC: session.refresh_angles — update zayavka angle counts from actual files
- Field map: added 'штрих - код' (with spaces) variant
- ZayavkaModal: added "Обновить ракурсы" button
