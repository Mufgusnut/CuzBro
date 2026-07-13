@echo off

rem Start integrated HBG3 telemetry and dew controls
start "CuzBro HBG3 Telemetry and Dew Control" /min cmd /c ^
"C:\CuzBro\hbg3-bridge\start-hbg3-bridge.bat"

timeout /t 2 /nobreak >nul

rem Start ASIImg capture-folder monitor
start "CuzBro ASIImg Capture Monitor" /min cmd /c ^
"C:\CuzBro\asiimg-bridge\start-asiimg-bridge.bat"

timeout /t 2 /nobreak >nul

rem Start CPWI / ASCOM bridge
start "CuzBro CPWI ASCOM Bridge" /min cmd /c ^
"C:\CuzBro\cpwi-bridge\start-cpwi-bridge.bat"

exit
