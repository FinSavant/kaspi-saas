@echo off
rem SANQ deploy: runs deploy-sanq.ps1, log in deploy-sanq.log
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-sanq.ps1"
echo.
pause
