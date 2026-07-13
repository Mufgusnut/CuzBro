@echo off

rem Start HBG3 dew bridge
start "CuzBro HBG3 Dew Bridge" /min cmd /c ^
"C:\CuzBro\hbg3-bridge\start-hbg3-bridge.bat"

timeout /t 3 /nobreak >nul

rem Start CPWI / ASCOM bridge
start "CuzBro CPWI ASCOM Bridge" /min cmd /c ^
"C:\CuzBro\cpwi-bridge\start-cpwi-bridge.bat"

exit