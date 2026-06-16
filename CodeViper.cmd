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
rem Установка зависимостей, если их нет или package-lock.json изменился
set "STAMP=node_modules\.codeviper-deps-hash"
set "NEEDINSTALL="
if not exist node_modules set "NEEDINSTALL=1"
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "$f=if(Test-Path 'package-lock.json'){'package-lock.json'}else{'package.json'}; if(Test-Path $f){(Get-FileHash $f -Algorithm SHA256).Hash}"`) do set "CURHASH=%%H"
set "OLDHASH="
if exist "%STAMP%" set /p OLDHASH=<"%STAMP%"
if not "%CURHASH%"=="%OLDHASH%" set "NEEDINSTALL=1"
if defined NEEDINSTALL (
  echo [CodeViper] npm install...
  call npm install
  if errorlevel 1 exit /b 1
  if defined CURHASH >"%STAMP%" echo %CURHASH%
)
call npm run dev
if errorlevel 1 pause
exit /b %ERRORLEVEL%
