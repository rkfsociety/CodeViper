$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $env:LOCALAPPDATA 'CodeViper'
$logFile = Join-Path $logDir 'launch.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Show-Error([string]$Message) {
  "[$((Get-Date).ToString('s'))] ERROR: $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($Message, 'CodeViper', 'OK', 'Error') | Out-Null
}

function Invoke-Npm([string[]]$Args) {
  $proc = Start-Process -FilePath 'npm.cmd' -ArgumentList $Args -WorkingDirectory $root -Wait -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $logFile -RedirectStandardError $logFile
  return $proc.ExitCode
}

"[$((Get-Date).ToString('s'))] Launch from $root" | Out-File -FilePath $logFile -Append -Encoding utf8

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js не найден.`nУстановите с https://nodejs.org и перезапустите."
  exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  "[$((Get-Date).ToString('s'))] npm install..." | Out-File -FilePath $logFile -Append -Encoding utf8
  if ((Invoke-Npm @('install')) -ne 0) {
    Show-Error "npm install не удался.`nЛог: $logFile"
    exit 1
  }
}

"[$((Get-Date).ToString('s'))] npm run dev..." | Out-File -FilePath $logFile -Append -Encoding utf8
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput $logFile -RedirectStandardError $logFile | Out-Null
exit 0
