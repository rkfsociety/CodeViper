$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $env:LOCALAPPDATA 'CodeViper'
$logFile = Join-Path $logDir 'launch.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$Message) {
  "[$((Get-Date).ToString('s'))] $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Show-Error([string]$Message) {
  Write-Log "ERROR: $Message"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($Message, 'CodeViper', 'OK', 'Error') | Out-Null
}

function Invoke-Npm([string[]]$NpmArgs) {
  $argLine = ($NpmArgs -join ' ')
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "npm $argLine >> `"$logFile`" 2>&1") `
    -WorkingDirectory $root `
    -Wait `
    -PassThru `
    -WindowStyle Hidden
  return $proc.ExitCode
}

Write-Log "Launch from $root"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js не найден.`nУстановите с https://nodejs.org и перезапустите."
  exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Log 'npm install...'
  if ((Invoke-Npm @('install')) -ne 0) {
    Show-Error "npm install не удался.`nЛог: $logFile"
    exit 1
  }
}

Write-Log 'npm run dev...'
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', "npm run dev >> `"$logFile`" 2>&1") `
  -WorkingDirectory $root `
  -WindowStyle Hidden | Out-Null
exit 0
