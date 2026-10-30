@echo off
rem SANQ price reader: restarts itself if it stops, output goes to price-reader.log
chcp 65001 >nul
title SANQ price reader
cd /d "%~dp0"
echo Price reader is running. Log: price-reader.log. Do not close this window.
:loop
call npm run price-reader >> price-reader.log 2>&1
echo Stopped, restarting in 30 seconds...
timeout /t 30 /nobreak >nul
goto loop
