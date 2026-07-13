# HBG3 Dew Telemetry Installation

## 1. Create the Supabase table

Open Supabase > SQL Editor and run:

`hbg3-bridge/supabase-setup.sql`

## 2. Configure the observatory bridge

In `hbg3-bridge`:

1. Copy `.env.example` to `.env`.
2. Fill in `SUPABASE_URL`.
3. Fill in `SUPABASE_SERVICE_ROLE_KEY` from Supabase > Project Settings > API.
4. Leave `HBG3_HOST=10.0.0.57` unless the HBG3 address changes.

The service-role key stays only in this local folder. Do not commit `.env` to GitHub and do not put it in the website's Vite environment variables.

## 3. Test the bridge

Double-click `hbg3-bridge/start-hbg3-bridge.bat`.

A successful line looks like:

`HBG3 ONLINE | CH1 18.02C 0% | CH2 0.00C 0%`

## 4. Put the updated website source in the repository

The React System Status page now includes `Hbg3DewPanel.jsx`. Deploy the website normally after replacing the `src` folder.

## 5. Start automatically with Windows

Right-click PowerShell and run:

`powershell -ExecutionPolicy Bypass -File .\hbg3-bridge\install-startup.ps1`

The bridge will launch when this Windows user signs in.
