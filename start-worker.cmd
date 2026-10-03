@echo off
rem Запуск воркера Kaspi SaaS (демпинг-бот, синхронизация товаров, склейка накладных).
rem Окно должно оставаться открытым: закрыли окно — воркер остановился.
chcp 65001 >nul
title Kaspi SaaS: Воркер
cd /d "%~dp0"
npm run dev:worker
pause
