@echo off
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%app"
cd /d "%APP%"

if /i "%~1"=="console" goto console
if /i "%~1"=="run" goto run

rem Скрытый запуск (без окна консоли)
mshta "javascript:var s=new ActiveXObject('WScript.Shell'); s.Run('cmd /c \"\"\"%~f0\"\"\" run', 0, false); close()"
exit /b

:run
powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%APP%\scripts\start-dev.ps1"
exit /b %ERRORLEVEL%

:console
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
