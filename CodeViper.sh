#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$SCRIPT_DIR/app"

# Проверка Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js не найден. Установите с https://nodejs.org"
  exit 1
fi

# Переход в папку app
cd "$APP"

# Определение файла хеша
STAMP="node_modules/.codeviper-deps-hash"

# Вычисление текущего хеша
if [ -f package-lock.json ]; then
  LOCK_FILE="package-lock.json"
else
  LOCK_FILE="package.json"
fi

if [ -f "$LOCK_FILE" ]; then
  if command -v sha256sum &> /dev/null; then
    CURHASH=$(sha256sum "$LOCK_FILE" | cut -d' ' -f1)
  elif command -v shasum &> /dev/null; then
    CURHASH=$(shasum -a 256 "$LOCK_FILE" | cut -d' ' -f1)
  else
    CURHASH=""
  fi
else
  CURHASH=""
fi

# Проверка наличия старого хеша
OLDHASH=""
if [ -f "$STAMP" ]; then
  OLDHASH=$(cat "$STAMP")
fi

# Установка зависимостей если изменились
NEEDINSTALL=0
if [ ! -d node_modules ]; then
  NEEDINSTALL=1
elif [ "$CURHASH" != "$OLDHASH" ] && [ -n "$CURHASH" ]; then
  NEEDINSTALL=1
fi

if [ $NEEDINSTALL -eq 1 ]; then
  echo "[CodeViper] npm install..."
  npm install
  if [ -n "$CURHASH" ]; then
    mkdir -p node_modules
    echo "$CURHASH" > "$STAMP"
  fi
fi

# Проверка наличия сборки
NEEDBUILD=0
if [ ! -f "out/main/index.js" ]; then
  NEEDBUILD=1
else
  OUT_MTIME=$(stat -f%m "out/main/index.js" 2>/dev/null || stat -c%Y "out/main/index.js" 2>/dev/null || echo 0)

  # Проверка папок electron и shared на изменения после out/main/index.js
  for dir in electron shared; do
    if [ -d "$dir" ]; then
      NEWER_FILE=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) -newer "out/main/index.js" 2>/dev/null | head -1)
      if [ -n "$NEWER_FILE" ]; then
        NEEDBUILD=1
        break
      fi
    fi
  done
fi

if [ $NEEDBUILD -eq 1 ]; then
  echo "[CodeViper] Сборка..."
  npm run build
fi

npm run start
