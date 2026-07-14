CELESTRON AUTO FOCUSER BRIDGE

1. Install Celestron Focus Motor software/driver and ASCOM Platform on the observatory PC.
2. Run setup-focuser-tables.sql once in the Supabase SQL editor.
3. In PowerShell, set machine-level environment variables (replace values):

   [Environment]::SetEnvironmentVariable('SUPABASE_URL','https://YOURPROJECT.supabase.co','Machine')
   [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY','YOUR_SERVICE_ROLE_KEY','Machine')
   [Environment]::SetEnvironmentVariable('FOCUSER_PROGID','ASCOM.Celestron.Focuser','Machine')
   [Environment]::SetEnvironmentVariable('FOCUSER_STATION','eliot','Machine')

4. Open a NEW elevated PowerShell window and test:

   powershell -ExecutionPolicy Bypass -File .\focuser-bridge.ps1

5. Open Observatory Control Systems in the console and press CONNECT FOCUSER.

If the script says the ProgID is not registered, use the ASCOM Profile Explorer or ASCOM Diagnostics to find the installed Celestron focuser ProgID, then change FOCUSER_PROGID.

SECURITY: Never put the service-role key in React/Vite files or commit it to GitHub. It belongs only on the observatory PC.
