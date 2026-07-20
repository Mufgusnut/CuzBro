@echo off
setlocal
set "ADB=adb"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="ADB_PATH" set "ADB=%%B"
"%ADB%" exec-out screencap -p > asiair-screen.png
if errorlevel 1 (
  echo Failed to capture Android screen. Confirm adb devices shows one authorized device.
  pause
  exit /b 1
)
echo Saved asiair-screen.png in this folder.
echo Open it in Paint. Move the pointer over each ASIAIR button and note the X,Y position.
pause
