; Кастомный NSIS-скрипт для CodeViper installer
; electron-builder включает этот файл автоматически через "include" в package.json
; userData Electron = %APPDATA%\codeviper (имя пакета npm, lowercase)

!define CODEVIPER_USERDATA "$APPDATA\codeviper"
!define CODEVIPER_SOURCE "${CODEVIPER_USERDATA}\source"

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
  ${If} ${FileExists} "${CODEVIPER_SOURCE}\.git\HEAD"
    DetailPrint "Репозиторий уже существует — обновляем (git pull)..."
    nsExec::ExecToLog 'git -C "${CODEVIPER_SOURCE}" pull --ff-only'
    Pop $0
    ${If} $0 != 0
      DetailPrint "git pull завершился с ошибкой ($0) — продолжаем с текущей версией."
    ${EndIf}
  ${Else}
    DetailPrint "Клонируем репозиторий CodeViper — может занять несколько минут..."
    CreateDirectory "${CODEVIPER_USERDATA}"
    nsExec::ExecToLog 'git clone --depth 1 https://github.com/rkfsociety/CodeViper.git "${CODEVIPER_SOURCE}"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Не удалось клонировать репозиторий (код: $0).$\n$\nПроверьте интернет-соединение и повторите установку."
      Abort
    ${EndIf}
  ${EndIf}

  ; Ярлык на рабочем столе и в Start Menu — запускает установленный CodeViper.exe
  DetailPrint "Создаём ярлык на рабочем столе..."
  CreateShortcut "$DESKTOP\CodeViper.lnk" "$INSTDIR\CodeViper.exe" "" "$INSTDIR\CodeViper.exe" 0 SW_SHOWNORMAL "" "CodeViper — локальный AI-агент"

  ; Ярлык в Start Menu Programs
  DetailPrint "Создаём ярлык в меню Пуск..."
  CreateDirectory "$SMPROGRAMS\CodeViper"
  CreateShortcut "$SMPROGRAMS\CodeViper\CodeViper.lnk" "$INSTDIR\CodeViper.exe" "" "$INSTDIR\CodeViper.exe" 0 SW_SHOWNORMAL "" "CodeViper — локальный AI-агент"
  CreateShortcut "$SMPROGRAMS\CodeViper\Удалить.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0 SW_SHOWNORMAL

!macroend

; ─── Удаление ────────────────────────────────────────────────────────────────
!macro customUnInstall

  ; Удаляем ярлыки
  Delete "$DESKTOP\CodeViper.lnk"
  RMDir /r "$SMPROGRAMS\CodeViper"

  ; Предлагаем удалить исходный код (настройки и чаты в %APPDATA%\codeviper\ остаются)
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Удалить исходный код CodeViper из$\n  ${CODEVIPER_SOURCE} ?$\n$\nНастройки и история чатов будут сохранены." \
    IDNO done_uninstall
  RMDir /r "${CODEVIPER_SOURCE}"
  done_uninstall:

!macroend
