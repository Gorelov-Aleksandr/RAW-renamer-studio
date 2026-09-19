#!/usr/bin/env python3
"""
generate-icons.py: нарезка мастер-изображения логотипа для всех платформ
(macOS .icns, Windows .ico, Tauri PNGs, Web favicon/logo).

Поддерживает работу:
- на macOS через встроенную sips + iconutil (без сторонних зависимостей)
- через ImageMagick (convert)
- через Python PIL / Pillow
"""

import os
import sys
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


def log(msg: str):
    print(f"[*] {msg}")


def die(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.exit(1)


def find_tool():
    """Определяет доступный инструмент для ресайза."""
    if shutil.which("sips") is not None:
        return "sips"
    if shutil.which("convert") is not None:
        return "convert"
    try:
        from PIL import Image  # noqa: F401
        return "pil"
    except ImportError:
        pass
    return None


def resize_image(tool: str, src: Path, dst: Path, w: int, h: int):
    """Ресайзит изображение в заданный размер."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if tool == "sips":
        # sips: -z <height> <width>
        subprocess.run(
            ["sips", "-z", str(h), str(w), str(src), "--out", str(dst)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    elif tool == "convert":
        subprocess.run(
            ["convert", str(src), "-resize", f"{w}x{h}!", str(dst)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    elif tool == "pil":
        from PIL import Image
        with Image.open(src) as im:
            im_resized = im.resize((w, h), Image.Resampling.LANCZOS)
            im_resized.save(dst, format="PNG")
    else:
        die("Нет доступного инструмента для масштабирования (sips, convert или PIL)")


def build_ico_file(png_files: list[tuple[int, int, Path]], out_ico: Path):
    """Собирает многослойный .ico файл со встроенными PNG."""
    # Заголовок ICO: 0 (reserved 2B), 1 (type 2B = ICO), count (2B)
    header = struct.pack("<HHH", 0, 1, len(png_files))
    entries = []
    data_blobs = []
    offset = 6 + len(png_files) * 16

    for w, h, path in png_files:
        with open(path, "rb") as f:
            png_bytes = f.read()
        w_byte = 0 if w >= 256 else w
        h_byte = 0 if h >= 256 else h
        # ICONDIRENTRY: width (1B), height (1B), colors (1B), reserved (1B), planes (2B), bpp (2B), size (4B), offset (4B)
        entry = struct.pack("<BBBBHHII", w_byte, h_byte, 0, 0, 1, 32, len(png_bytes), offset)
        entries.append(entry)
        data_blobs.append(png_bytes)
        offset += len(png_bytes)

    with open(out_ico, "wb") as f:
        f.write(header)
        for e in entries:
            f.write(e)
        for b in data_blobs:
            f.write(b)


def build_icns_file(tool: str, iconset_dir: Path, out_icns: Path):
    """Собирает Apple .icns файл."""
    # Если на macOS есть iconutil, используем официальную утилиту Apple
    if shutil.which("iconutil") is not None:
        res = subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(out_icns)], capture_output=True)
        if res.returncode == 0:
            return

    # Fallback: чистый парсер ICNS чанков (Apple PNG ICNS container)
    icns_map = [
        ("icon_16x16.png", b"icp4"),
        ("icon_32x32.png", b"icp5"),
        ("icon_32x32@2x.png", b"icp6"),
        ("icon_128x128.png", b"ic07"),
        ("icon_256x256.png", b"ic08"),
        ("icon_512x512.png", b"ic09"),
        ("icon_512x512@2x.png", b"ic10"),
    ]
    chunks = []
    for filename, tag in icns_map:
        fpath = iconset_dir / filename
        if fpath.exists():
            with open(fpath, "rb") as f:
                data = f.read()
            chunk_len = len(data) + 8
            chunks.append(tag + struct.pack(">I", chunk_len) + data)

    body = b"".join(chunks)
    total_len = len(body) + 8
    with open(out_icns, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total_len) + body)


def main():
    if len(sys.argv) < 2:
        print("Использование: python3 generate-icons.py <путь-к-исходному-логотипу.png>")
        print("Пример: python3 generate-icons.py ~/Downloads/Без\\ имени-3.png")
        sys.exit(1)

    src_path = Path(sys.argv[1]).expanduser().resolve()
    if not src_path.exists():
        die(f"Файл не найден: {src_path}")

    repo_root = Path(__file__).resolve().parent.parent
    tauri_icons = repo_root / "src-tauri" / "icons"
    public_dir = repo_root / "public"
    assets_dir = repo_root / "src" / "assets"

    tauri_icons.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    tool = find_tool()
    if not tool:
        die("Не найден инструмент обработки изображений (нужен sips, imagemagick или Pillow)")

    log(f"Исходный файл: {src_path}")
    log(f"Используемый инструмент: {tool}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        iconset = tmp / "icon.iconset"
        iconset.mkdir()

        # 1. Генерация набора для iconset (macOS)
        mac_sizes = [
            ("icon_16x16.png", 16, 16),
            ("icon_16x16@2x.png", 32, 32),
            ("icon_32x32.png", 32, 32),
            ("icon_32x32@2x.png", 64, 64),
            ("icon_128x128.png", 128, 128),
            ("icon_128x128@2x.png", 256, 256),
            ("icon_256x256.png", 256, 256),
            ("icon_256x256@2x.png", 512, 512),
            ("icon_512x512.png", 512, 512),
            ("icon_512x512@2x.png", 1024, 1024),
        ]
        for name, w, h in mac_sizes:
            resize_image(tool, src_path, iconset / name, w, h)

        # Сборка icon.icns
        icns_out = tauri_icons / "icon.icns"
        build_icns_file(tool, iconset, icns_out)
        log(f"Создан: {icns_out.relative_to(repo_root)} ({icns_out.stat().st_size} байт)")

        # 2. Генерация стандартных PNG для Tauri
        tauri_pngs = [
            ("32x32.png", 32, 32),
            ("128x128.png", 128, 128),
            ("128x128@2x.png", 256, 256),
            ("icon.png", 512, 512),
            ("Square30x30Logo.png", 30, 30),
            ("Square44x44Logo.png", 44, 44),
            ("Square71x71Logo.png", 71, 71),
            ("Square89x89Logo.png", 89, 89),
            ("Square107x107Logo.png", 107, 107),
            ("Square142x142Logo.png", 142, 142),
            ("Square150x150Logo.png", 150, 150),
            ("Square284x284Logo.png", 284, 284),
            ("Square310x310Logo.png", 310, 310),
            ("StoreLogo.png", 50, 50),
        ]
        for name, w, h in tauri_pngs:
            dst = tauri_icons / name
            resize_image(tool, src_path, dst, w, h)
            log(f"Создан: {dst.relative_to(repo_root)} ({w}x{h})")

        # 3. Генерация Windows .ico
        ico_sizes = [
            (16, 16, iconset / "icon_16x16.png"),
            (32, 32, iconset / "icon_32x32.png"),
            (48, 48, tmp / "icon_48.png"),
            (64, 64, iconset / "icon_32x32@2x.png"),
            (128, 128, iconset / "icon_128x128.png"),
            (256, 256, iconset / "icon_256x256.png"),
        ]
        resize_image(tool, src_path, tmp / "icon_48.png", 48, 48)

        ico_out = tauri_icons / "icon.ico"
        build_ico_file(ico_sizes, ico_out)
        log(f"Создан: {ico_out.relative_to(repo_root)} ({ico_out.stat().st_size} байт)")

        # 4. Веб / фронтенд ассеты
        web_assets = [
            (public_dir / "favicon.png", 32, 32),
            (public_dir / "apple-touch-icon.png", 180, 180),
            (public_dir / "logo.png", 512, 512),
            (public_dir / "logo-1024.png", 1024, 1024),
            (assets_dir / "logo.png", 512, 512),
        ]
        for dst, w, h in web_assets:
            resize_image(tool, src_path, dst, w, h)
            log(f"Создан: {dst.relative_to(repo_root)} ({w}x{h})")

        # Копируем favicon.ico в public
        shutil.copy2(ico_out, public_dir / "favicon.ico")
        log(f"Создан: {(public_dir / 'favicon.ico').relative_to(repo_root)}")

    log("Все иконки успешно сформированы!")


if __name__ == "__main__":
    main()
