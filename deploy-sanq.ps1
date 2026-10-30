# Выкладка SANQ на сервер: копия базы, новый код, настройки, перезапуск сервисов.
# Запускается из deploy-sanq.cmd; весь вывод пишется в deploy-sanq.log рядом со скриптом.
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'deploy-sanq.log'
Start-Transcript -Path $log -Force | Out-Null

$key = Join-Path $env:USERPROFILE '.ssh\kaspi_vps'
$hostName = 'root@89.126.194.84'
$archive = Join-Path (Split-Path $PSScriptRoot -Parent) 'sanq-deploy.tgz'
$backup = '/opt/backups/kaspi-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.dump'
$compose = 'docker compose --env-file .env.server -f deploy/server/docker-compose.yml'

function Step([string]$title, [string[]]$command) {
  Write-Host "=== $title ===" -ForegroundColor Cyan
  & $command[0] $command[1..($command.Length - 1)]
  if ($LASTEXITCODE -ne 0) { throw "Шаг «$title» завершился с кодом $LASTEXITCODE" }
}

try {
  if (-not (Test-Path $key)) { throw "Нет SSH-ключа $key" }
  if (-not (Test-Path $archive)) { throw "Нет архива $archive — попросите Claude собрать его заново" }

  Step '1/4 Копия базы на сервере (/opt/backups)' @('ssh', '-i', $key, '-o', 'BatchMode=yes', $hostName,
    "mkdir -p /opt/backups && cd /opt/kaspi-saas && $compose exec -T postgres pg_dump -U kaspi -Fc kaspi > $backup && ls -la $backup")

  Step '2/4 Загрузка кода' @('scp', '-i', $key, '-o', 'BatchMode=yes', $archive, "${hostName}:/tmp/sanq-deploy.tgz")

  Step '3/4 Распаковка и настройки SANQ' @('ssh', '-i', $key, '-o', 'BatchMode=yes', $hostName,
    "cd /opt/kaspi-saas && tar -xzf /tmp/sanq-deploy.tgz && (grep -q '^SANQ_WHATSAPP=' .env.server || echo 'SANQ_WHATSAPP=77064040416' >> .env.server) && sed -i '/^SANQ_ADMIN_EMAIL=/d' .env.server && sed -i '/^COOKIE_SECURE=/d' .env.server && echo ok")

  Step '4/4 Обновление базы и перезапуск (несколько минут)' @('ssh', '-i', $key, '-o', 'BatchMode=yes', $hostName,
    'cd /opt/kaspi-saas && bash deploy/server/up.sh')

  Write-Host ''
  Write-Host 'ГОТОВО. Напишите Claude «выложил».' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "ОШИБКА: $_" -ForegroundColor Red
  Write-Host "Напишите Claude — он прочитает deploy-sanq.log. Копия базы (если шаг 1 прошёл): $backup"
} finally {
  Stop-Transcript | Out-Null
}
