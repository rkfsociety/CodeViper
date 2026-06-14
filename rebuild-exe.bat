@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  msg %username% "Node.js не найден. Установите с https://nodejs.org"
  exit /b 1
)

if not exist node_modules (
  echo npm install...
  call npm install
  if errorlevel 1 exit /b 1
)

echo Сборка CodeViper.exe (portable)...
call npm run app:exe
if errorlevel 1 (
  echo Ошибка сборки.
  pause
  exit /b 1
)

echo.
echo Готово. Запускай CodeViper.exe двойным кликом.
pause
