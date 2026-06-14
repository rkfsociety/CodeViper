@echo off
rem Скрытый запуск без консоли. Для отладки: CodeViper.cmd console
if /i "%~1"=="console" (
  cd /d "%~dp0"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
  exit /b %ERRORLEVEL%
)

wscript.exe //nologo "%~dp0CodeViper.launch.vbs"
