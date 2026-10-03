@echo off
rem Включает автозапуск чтения цен конкурентов при входе в Windows:
rem кладёт ярлык start-price-reader.cmd (свёрнутое окно) в папку «Автозагрузка».
rem Всё остальное (сайт, бот, заказы) работает на сервере и автозапуска на компьютере не требует.
rem Отключить: удалить ярлык «Kaspi SaaS - price reader» из shell:startup.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "$dir=[Environment]::GetFolderPath('Startup'); Remove-Item -LiteralPath (Join-Path $dir 'Kaspi SaaS.lnk') -ErrorAction SilentlyContinue; $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'Kaspi SaaS - price reader.lnk')); $s.TargetPath='%~dp0start-price-reader.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (
  echo Не получилось создать ярлык.
) else (
  echo Готово: чтение цен будет запускаться само при входе в Windows, в свёрнутом окне.
)
pause
