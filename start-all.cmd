@echo off
rem Запуск всего Kaspi SaaS: база и Redis в Docker, API, веб-кабинет и воркер.
rem Каждый сервис открывается в своём свёрнутом окне; закрыли окно — сервис остановился.
chcp 65001 >nul
title Kaspi SaaS: запуск
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Запускаю Docker Desktop...
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)
echo Жду Docker...
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
  timeout /t 5 /nobreak >nul
  goto wait_docker
)

docker compose up -d
timeout /t 5 /nobreak >nul

start "Kaspi SaaS: API" /min cmd /c "chcp 65001 >nul & npm run dev:api"
start "Kaspi SaaS: Веб-кабинет" /min cmd /c "chcp 65001 >nul & npm run dev:web"
start "Kaspi SaaS: Воркер" /min cmd /c "chcp 65001 >nul & npm run dev:worker"

echo Готово. Кабинет: http://localhost:3000
timeout /t 5 >nul
