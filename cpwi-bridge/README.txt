CUZBRO CPWI / ASCOM BRIDGE

1. Install CPWI and ASCOM Platform.
2. Start CPWI and connect it to the CPC 800 through the HBG3.
3. Double-click start-cpwi-bridge.bat.
4. Test http://127.0.0.1:4788/status in Chrome.
5. Leave the bridge window open while using Mission Console.

Default ASCOM driver: ASCOM.CPWI.Telescope
If your installed ProgID differs, launch PowerShell with:
  powershell -ExecutionPolicy Bypass -File .\server.ps1 -DriverId "YOUR.DRIVER.ID"
