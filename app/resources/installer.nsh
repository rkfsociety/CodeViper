; Кастомный NSIS-скрипт для CodeViper installer
; electron-builder включает этот файл автоматически через "include" в package.json

; ─── Установка ───────────────────────────────────────────────────────────────
!macro customInstall

  ; Проверяем наличие git
  DetailPrint "Проверяем наличие Git..."
  nsExec::ExecToStack 'git --version'
  Pop $0  ; код возврата
  Pop $1  ; вывод (не нужен)
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Git не найден в PATH.$\n$\nУстановите Git for Windows (https://git-scm.com) и повторите установку."
    Abort
  ${EndIf}

  ; Клонируем или обновляем репозиторий
  ${If} ${FileExists} "$APPDATA\CodeViper\source\.git\HEAD"
    DetailPrint "Репозиторий уже существует — обновляем (git pull)..."
    nsExec::ExecToLog 'git -C "$APPDATA\CodeViper\source" pull --ff-only'
    Pop $0
    ${If} $0 != 0
      DetailPrint "git pull завершился с ошибкой ($0) — продолжаем с текущей версией."
    ${EndIf}
  ${Else}
    DetailPrint "Клонируем репозиторий CodeViper — может занять несколько минут..."
    CreateDirectory "$APPDATA\CodeViper"
    nsExec::ExecToLog 'git clone --depth 1 https://github.com/rkfsociety/CodeViper.git "$APPDATA\CodeViper\source"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Не удалось клонировать репозиторий (код: $0).$\n$\nПроверьте интернет-соединение и повторите установку."
      Abort
    ${EndIf}
  ${EndIf}

  ; Ярлык на рабочем столе — запускает CodeViper.cmd через cmd.exe скрыто
  ; Кавычки: /c ""путь"" — cmd.exe снимает внешние кавычки, выполняет внутренние
  DetailPrint "Создаём ярлык на рабочем столе..."
  CreateShortcut "$DESKTOP\CodeViper.lnk" "$SYSDIR\cmd.exe" '/c $\"$\"$APPDATA\CodeViper\source\CodeViper.cmd$\"$\"' "$INSTDIR\CodeViper.exe" 0 SW_SHOWMINIMIZED "" "CodeViper — локальный AI-агент"

!macroend

; ─── Удаление ────────────────────────────────────────────────────────────────
!macro customUnInstall

  ; Удаляем ярлык
  Delete "$DESKTOP\CodeViper.lnk"

  ; Предлагаем удалить исходный код (настройки и чаты в %APPDATA%\CodeViper\ остаются)
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Удалить исходный код CodeViper из$\n  $APPDATA\CodeViper\source ?$\n$\nНастройки и история чатов будут сохранены." \
    IDNO done_uninstall
  RMDir /r "$APPDATA\CodeViper\source"
  done_uninstall:

!macroend
