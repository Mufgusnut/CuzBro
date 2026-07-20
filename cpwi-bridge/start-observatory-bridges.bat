@echo off

echo Connecting to ASIAIR image share...

net use Z: /delete /y >nul 2>&1
net use Z: "\\10.0.0.113\EMMC Images" "" /user:Guest /persistent:no

if errorlevel 1 (
    echo WARNING: Could not connect to ASIAIR image share.
) else (
    echo ASIAIR image share connected as Z:
)

rem Existing Python launch command goes below this line
rem Start integrated HBG3 telemetry and dew controls
start "CuzBro HBG3 Telemetry and Dew Control" /min cmd /c ^
"C:\CuzBro\hbg3-bridge\start-hbg3-bridge.bat"

timeout /t 2 /nobreak >nul

rem Start ASIAIR live image-feed monitor (writes to asiair_status)
start "CuzBro ASIAIR Live Feed" /min cmd /c ^
"C:\CuzBro\asiair-bridge\start-asiair-bridge.bat"

timeout /t 2 /nobreak >nul

rem Start CPWI / ASCOM bridge
start "CuzBro CPWI ASCOM Bridge" /min cmd /c ^
"C:\CuzBro\cpwi-bridge\start-cpwi-bridge.bat"

exit
