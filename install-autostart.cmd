@echo off
rem Включает автозапуск Kaspi SaaS при входе в Windows: кладёт ярлык start-all.cmd в папку «Автозагрузка».
rem Отключить: удалить ярлык «Kaspi SaaS» из shell:startup.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Kaspi SaaS.lnk'); $s.TargetPath='%~dp0start-all.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (
  echo Не получилось создать ярлык.
) else (
  echo Автозапуск включён: Kaspi SaaS будет запускаться при входе в Windows.
)
pause
