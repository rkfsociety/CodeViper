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
  # Синхронизация с GitHub при запуске: версия на GitHub имеет приоритет.
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

    # Сохраняем локальные правки в stash (на случай восстановления), затем приоритет GitHub.
    $dirty = (git status --porcelain 2>$null)
    if ($dirty) {
      git stash push -u -m "codeviper-autostash $(Get-Date -Format s)" 2>$null | Out-Null
      Write-Log 'локальные изменения сохранены в git stash (приоритет у GitHub)'
    }

    git reset --hard "origin/$branch" 2>$null | Out-Null
    Write-Log "синхронизировано с GitHub: $branch -> $remote"
  } catch {
    Write-Log "синхронизация пропущена: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
}

Write-Log "Launch from $root"
Sync-FromGitHub

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js не найден.`nУстановите с https://nodejs.org и перезапустите."
  exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Log 'npm install...'
  if ((Invoke-Npm @('install')) -ne 0) {
    Show-Error "npm install не удался.`nЛог: $devLogFile"
    exit 1
  }
}

Write-Log 'npm run dev...'
$devProc = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', "npm run dev >> `"$devLogFile`" 2>&1") `
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
    Show-Error "npm run dev завершился с кодом $($devProc.ExitCode).`nЛог: $devLogFile`nПопробуйте: CodeViper.cmd console"
    exit 1
  }
}

Show-Error "Окно CodeViper не появилось за 60 с.`nЛог: $devLogFile`nПопробуйте: CodeViper.cmd console"
exit 1
