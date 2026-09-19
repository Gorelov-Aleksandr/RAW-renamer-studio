#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/generate-icons.py"

if [ $# -lt 1 ]; then
    echo "Использование: ./scripts/generate-icons.sh <путь-к-файлу-логотипа.png>"
    echo "Пример: ./scripts/generate-icons.sh ~/Downloads/Без\\ имени-3.png"
    exit 1
fi

python3 "${PYTHON_SCRIPT}" "$@"
