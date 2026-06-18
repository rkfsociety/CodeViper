<#
.SYNOPSIS
  Настраивает branch protection для ветки master через GitHub CLI (gh api).

.DESCRIPTION
  Включает для защищаемой ветки:
   - обязательный статус-чек CI (job "build" из .github/workflows/ci.yml);
   - обязательный Pull Request с ручным approve (>= N одобрений);
   - запрет прямого push (изменения только через PR);
   - запрет force-push и удаления ветки.

  Требуется установленный и авторизованный GitHub CLI (gh auth login)
  с правами администратора репозитория.

.PARAMETER Repo
  Репозиторий в формате owner/name. По умолчанию определяется автоматически
  через `gh repo view`.

.PARAMETER Branch
  Защищаемая ветка. По умолчанию master.

.PARAMETER Context
  Имя обязательного статус-чека (job в CI). По умолчанию build.

.PARAMETER Approvals
  Минимальное число одобрений PR. По умолчанию 1.

.PARAMETER EnforceAdmins
  Если указан — правила применяются и к администраторам (владелец тоже обязан
  идти через PR). По умолчанию ВЫКЛ, чтобы автоматизация владельца
  (autoPushSelfEdits → прямой push в master) продолжала работать.

.EXAMPLE
  ./docs/setup-branch-protection.ps1
  ./docs/setup-branch-protection.ps1 -Branch master -Approvals 1
  ./docs/setup-branch-protection.ps1 -EnforceAdmins
#>
param(
  [string]$Repo = '',
  [string]$Branch = 'master',
  [string]$Context = 'build',
  [int]$Approvals = 1,
  [switch]$EnforceAdmins
)

$ErrorActionPreference = 'Stop'

# 1. Проверяем наличие gh
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error 'GitHub CLI (gh) не установлен. Установите с https://cli.github.com и выполните: gh auth login'
  exit 1
}

# 2. Проверяем авторизацию
gh auth status 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error 'gh не авторизован. Выполните: gh auth login'
  exit 1
}

# 3. Определяем репозиторий, если не задан
if (-not $Repo) {
  $Repo = (gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)
  if (-not $Repo) {
    Write-Error 'Не удалось определить репозиторий. Укажите параметр -Repo owner/name.'
    exit 1
  }
}

Write-Host "Настройка branch protection: $Repo @ $Branch" -ForegroundColor Cyan
Write-Host "  обязательный чек CI : $Context"
Write-Host "  одобрений PR        : $Approvals"
Write-Host "  enforce_admins      : $($EnforceAdmins.IsPresent)"

# 4. Формируем тело запроса
$payload = @{
  required_status_checks        = @{
    strict   = $true
    contexts = @($Context)
  }
  enforce_admins                = [bool]$EnforceAdmins
  required_pull_request_reviews = @{
    required_approving_review_count = $Approvals
    dismiss_stale_reviews           = $true
  }
  restrictions                  = $null
  required_linear_history       = $false
  allow_force_pushes            = $false
  allow_deletions               = $false
}

$json = $payload | ConvertTo-Json -Depth 6

# 5. Применяем через gh api (PUT)
$json | gh api `
  --method PUT `
  "repos/$Repo/branches/$Branch/protection" `
  --input -

if ($LASTEXITCODE -ne 0) {
  Write-Error 'Не удалось применить branch protection. Нужны права администратора репозитория.'
  exit 1
}

Write-Host 'Branch protection включён.' -ForegroundColor Green
Write-Host 'Проверить: gh api repos/' -NoNewline; Write-Host "$Repo/branches/$Branch/protection"
