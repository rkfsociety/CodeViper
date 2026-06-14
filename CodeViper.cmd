@echo off
setlocal
set "APP=%~dp0app"

if /i "%~1"=="console" goto console

rem Скрытый запуск без mshta/wscript (на части систем они блокируются)
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APP%\scripts\start-dev.ps1"
exit /b 0

:console
cd /d "%APP%"
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
  msg %username% "Node.js не найден. Установите с https://nodejs.org"
  exit /b 1
)
if not exist node_modules (
  echo [CodeViper] npm install...
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run dev
if errorlevel 1 pause
exit /b %ERRORLEVEL%
