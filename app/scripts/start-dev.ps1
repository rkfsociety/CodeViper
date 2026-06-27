$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $env:LOCALAPPDATA 'CodeViper'
$logFile = Join-Path $logDir 'launch.log'
$devLogFile = Join-Path $logDir 'dev.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$Message) {
  try {
    "[$((Get-Date).ToString('s'))] $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
  } catch {
    # launch.log может быть занят — не прерываем запуск
  }
}

function Show-Error([string]$Message) {
  Write-Log "ERROR: $Message"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($Message, 'CodeViper', 'OK', 'Error') | Out-Null
}

# Диалог Да/Нет; возвращает $true если пользователь выбрал «Да».
function Confirm-Action([string]$Message) {
  Add-Type -AssemblyName System.Windows.Forms
  $result = [System.Windows.Forms.MessageBox]::Show(
    $Message, 'CodeViper', 'YesNo', 'Warning')
  return ($result -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Invoke-Npm([string[]]$NpmArgs) {
  $argLine = ($NpmArgs -join ' ')
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "npm $argLine >> `"$devLogFile`" 2>&1") `
    -WorkingDirectory $root `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
  return $proc.ExitCode
}

function Test-ElectronWindow {
  Get-Process electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'CodeViper' }
}

function Sync-FromGitHub {
  # Синхронизация с GitHub при запуске. Стратегия и вкл/выкл — из config.json,
  # который дублируется приложением при сохранении настроек.
  $strategy = 'stash'
  $configPath = Join-Path $env:LOCALAPPDATA 'CodeViper\config.json'
  if (Test-Path $configPath) {
    try {
      $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
      if ($config.gitSyncOnStartup -eq $false) {
        Write-Log 'git-синхронизация отключена в настройках'
        return
      }
      if ($config.gitSyncStrategy) { $strategy = [string]$config.gitSyncStrategy }
    } catch {
      Write-Log "не удалось прочитать config.json: $($_.Exception.Message)"
    }
  }
  Write-Log "стратегия git-sync: $strategy"

  $repo = Split-Path $root -Parent
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Log 'git не найден — синхронизация пропущена'
    return
  }
  if (-not (Test-Path (Join-Path $repo '.git'))) {
    Write-Log 'не git-репозиторий — синхронизация пропущена'
    return
  }

  Push-Location $repo
  try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if (-not $branch -or $branch -eq 'HEAD') {
      Write-Log 'не удалось определить ветку — синхронизация пропущена'
      return
    }

    git fetch origin $branch --quiet 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'git fetch не удался (нет сети?) — запуск на локальной версии'
      return
    }

    $local = (git rev-parse HEAD 2>$null)
    $remote = (git rev-parse "origin/$branch" 2>$null)
    if (-not $remote) {
      Write-Log "нет origin/$branch — синхронизация пропущена"
      return
    }

    if ($local -eq $remote) {
      Write-Log 'уже синхронизировано с GitHub'
      return
    }

    # Предупреждение при незакоммиченных изменениях: даём пользователю отменить
    # синхронизацию и запуститься на локальной версии.
    $dirty = (git status --porcelain 2>$null)
    if ($dirty) {
      $count = ($dirty -split "`n" | Where-Object { $_.Trim() }).Count
      $msg = "Обнаружены незакоммиченные изменения ($count файл(ов)).`n`n" +
        "Стратегия синхронизации: $strategy.`n" +
        "Синхронизация с GitHub может затронуть эти изменения.`n`n" +
        "Продолжить синхронизацию?`n(Нет — запустить на локальной версии без синхронизации)"
      if (-not (Confirm-Action $msg)) {
        Write-Log 'синхронизация отменена пользователем (есть незакоммиченные изменения)'
        return
      }
    }

    switch ($strategy) {
      'ff-only' {
        # Только fast-forward: если ветки разошлись — обновление не происходит,
        # локальная версия и правки сохраняются.
        git merge --ff-only "origin/$branch" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Write-Log "fast-forward до origin/$branch выполнен"
        } else {
          Write-Log 'fast-forward невозможен (расхождение веток) — оставлена локальная версия'
        }
      }
      'rebase' {
        # Переносим локальные коммиты поверх версии GitHub. Грязное дерево прячем в stash.
        $stashed = $false
        if ($dirty) {
          git stash push -u -m "codeviper-autostash $(Get-Date -Format s)" 2>$null | Out-Null
          $stashed = $true
          Write-Log 'локальные изменения сохранены в git stash перед rebase'
        }
        git rebase "origin/$branch" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Write-Log "rebase поверх origin/$branch выполнен"
          if ($stashed) {
            git stash pop 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) {
              Write-Log 'конфликт при git stash pop — изменения остались в stash'
            }
          }
        } else {
          git rebase --abort 2>$null | Out-Null
          Write-Log 'rebase не удался (конфликты) — откат, оставлена локальная версия'
          if ($stashed) { git stash pop 2>$null | Out-Null }
        }
      }
      default {
        # stash + reset --hard: приоритет у GitHub, локальные правки — в stash.
        if ($dirty) {
          git stash push -u -m "codeviper-autostash $(Get-Date -Format s)" 2>$null | Out-Null
          Write-Log 'локальные изменения сохранены в git stash (приоритет у GitHub)'
        }
        git reset --hard "origin/$branch" 2>$null | Out-Null
        Write-Log "синхронизировано с GitHub (reset --hard): $branch -> $remote"
      }
    }
  } catch {
    Write-Log "синхронизация пропущена: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
}

Write-Log "Launch from $root"

# Запоминаем коммит ДО синхронизации, чтобы понять — изменился ли код
$repo = Split-Path $root -Parent
$commitBefore = try { (git -C $repo rev-parse HEAD 2>$null) } catch { $null }

Sync-FromGitHub

$commitAfter = try { (git -C $repo rev-parse HEAD 2>$null) } catch { $null }
$codeChanged = ($commitBefore -ne $commitAfter) -and ($null -ne $commitAfter)

# Применяем отложенные правки агента (записаны в предыдущей сессии через stageSelfEditsForRestart)
$pendingMarker = Join-Path $root '.pending-restart'
$pendingApplied = $false
if (Test-Path $pendingMarker) {
  $label = (Get-Content $pendingMarker -Raw -ErrorAction SilentlyContinue).Trim()
  Write-Log "найден маркер отложенных правок: $label"
  $apply = Confirm-Action "Агент подготовил правки исходников:`n`n$label`n`nПрименить при запуске?"
  if ($apply) {
    git -C $repo stash pop 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Log "правки агента применены из git stash"
      $pendingApplied = $true
    } else {
      Write-Log "git stash pop не удался (конфликт?) — правки не применены"
      Show-Error "Не удалось применить правки агента (конфликт при git stash pop).`nВыполни вручную: git stash pop"
    }
  } else {
    git -C $repo stash drop stash@{0} 2>$null | Out-Null
    Write-Log "правки агента отклонены пользователем — stash удалён"
  }
  Remove-Item $pendingMarker -Force -ErrorAction SilentlyContinue
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js не найден.`nУстановите с https://nodejs.org и перезапустите."
  exit 1
}

function Get-DepsHash {
  $lock = Join-Path $root 'package-lock.json'
  if (-not (Test-Path $lock)) { $lock = Join-Path $root 'package.json' }
  if (-not (Test-Path $lock)) { return $null }
  return (Get-FileHash -Path $lock -Algorithm SHA256).Hash
}

# out/ не в git — пересобираем, если исходники electron/ или shared/ новее собранного main.
function Test-StaleBuild {
  $outMain = Join-Path $root 'out\main\index.js'
  if (-not (Test-Path $outMain)) { return $true }
  $outTime = (Get-Item $outMain).LastWriteTimeUtc
  foreach ($dir in @('electron', 'shared', 'src')) {
    $srcDir = Join-Path $root $dir
    if (-not (Test-Path $srcDir)) { continue }
    $newer = Get-ChildItem -Path $srcDir -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -gt $outTime } |
      Select-Object -First 1
    if ($newer) { return $true }
  }
  return $false
}

# Устанавливаем зависимости, если node_modules нет ИЛИ package-lock.json изменился.
$stampFile = Join-Path $root 'node_modules\.codeviper-deps-hash'
$currentHash = Get-DepsHash
$installedHash = if (Test-Path $stampFile) { (Get-Content $stampFile -Raw).Trim() } else { $null }
$needInstall = (-not (Test-Path (Join-Path $root 'node_modules'))) -or ($currentHash -ne $installedHash)

if ($needInstall) {
  Write-Log 'npm install... (зависимости отсутствуют или изменились)'
  if ((Invoke-Npm @('install')) -ne 0) {
    Show-Error "npm install не удался.`nЛог: $devLogFile"
    exit 1
  }
  if ($currentHash) {
    try { $currentHash | Out-File -FilePath $stampFile -Encoding ascii -NoNewline } catch {}
  }
}

# Пересобираем, если код обновился из GitHub, out/ отсутствует, устарел или зависимости переустановились
$outDir = Join-Path $root 'out'
$staleBuild = Test-StaleBuild
$needBuild = $codeChanged -or (-not (Test-Path $outDir)) -or $staleBuild -or $pendingApplied -or $needInstall

if ($needBuild) {
  $buildReason = if ($staleBuild) { 'исходники новее out/' } else { 'код обновился с GitHub или out/ отсутствует' }
  Write-Log "npm run build... ($buildReason)"
  if ((Invoke-Npm @('run', 'build')) -ne 0) {
    Show-Error "npm run build не удался.`nЛог: $devLogFile`nПопробуйте: CodeViper.cmd console"
    exit 1
  }
  Write-Log 'build успешен'
}

Write-Log 'npm run start...'
$devProc = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', "npm run start >> `"$devLogFile`" 2>&1") `
  -WorkingDirectory $root `
  -PassThru `
  -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if (Test-ElectronWindow) {
    Write-Log 'Electron started OK'
    exit 0
  }
  if ($devProc.HasExited -and $devProc.ExitCode -ne 0) {
    Show-Error "npm run start завершился с кодом $($devProc.ExitCode).`nЛог: $devLogFile`nПопробуйте: CodeViper.cmd console"
    exit 1
  }
}

Show-Error "Окно CodeViper не появилось за 60 с.`nЛог: $devLogFile`nПопробуйте: CodeViper.cmd console"
exit 1
