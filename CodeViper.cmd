@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  msg %username% "Node.js не найден. Установите с https://nodejs.org и перезапустите."
  exit /b 1
)

if not exist node_modules (
  echo [CodeViper] Первый запуск — npm install...
  call npm install
  if errorlevel 1 (
    msg %username% "npm install не удался. Откройте папку в терминале и проверьте ошибку."
    exit /b 1
  )
)

title CodeViper
echo [CodeViper] Запуск...
call npm run dev
if errorlevel 1 pause
