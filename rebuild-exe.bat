@echo off
setlocal
cd /d "%~dp0"

echo.
echo [CodeViper] Пересборка exe...
echo.

call npm run dist:win
if errorlevel 1 (
  echo.
  echo [CodeViper] Ошибка сборки.
  exit /b 1
)

echo.
echo [CodeViper] Готово:
echo   - CodeViper.exe
echo   - CodeViper-Setup.exe
echo.

exit /b 0
