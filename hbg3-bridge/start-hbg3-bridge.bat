@echo off
cd /d "%~dp0"

title CuzBro HBG3 Telemetry and Dew Control

echo Starting integrated HBG3 telemetry and dew-control bridge...
echo.

node server.mjs

echo.
echo HBG3 bridge stopped.
pause