@echo off
setlocal
set "ADB=adb"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="ADB_PATH" set "ADB=%%B"
"%ADB%" devices
"%ADB%" shell wm size
"%ADB%" shell pm list packages | findstr /i "asiair zwo"
pause
