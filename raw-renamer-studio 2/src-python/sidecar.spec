# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller-спецификация sidecar'а RAW Renamer Studio (onefile).

Сборка (из корня проекта, в ОС-венве):
    pyinstaller --clean --noconfirm src-python/sidecar.spec --distpath src-python/dist --workpath src-python/build

Результат:
    macOS:   src-python/dist/raw-renamer-sidecar
    Windows: src-python/dist/raw-renamer-sidecar.exe

ВАЖНО: console=True — SIDECAR_READY печатается в stdout, его перехватывает
Rust (Tauri spawn-ит с CREATE_NO_WINDOW, окно не появляется).
"""

import sys

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # uvicorn (импорты по имени в рантайме)
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # multipart-загрузка (/upload)
        'multipart',
        # Excel
        'openpyxl',
        'openpyxl.cell._writer',
        'openpyxl.worksheet._writer',
        # Изображения / ШК
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'cv2',
        'zxingcpp',
        # Сеть
        'httpx',
        'httpcore',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'pytest', 'torch'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='raw-renamer-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
