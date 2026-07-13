CUZBRO CPWI / ASCOM SUPABASE BRIDGE 2.0

1. In Supabase SQL Editor, run supabase-setup.sql once.
2. Copy .env.example to .env.
3. Put your Project URL and service_role/secret key in .env. Do not use the anon key.
4. Start CPWI and connect it to the CPC 800 through HBG3.
5. Double-click start-cpwi-bridge.bat and leave the window open.
6. The Mission Console reads cpwi_status and writes cpwi_commands through Supabase.

The .env file stays only on the observatory PC and must not be committed to GitHub.
