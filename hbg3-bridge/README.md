# CuzBro HBG3 dew command bridge

This is a drop-in companion for the existing observatory bridge. It consumes the
`hbg3_dew_commands` queue created by the Mission Console and does not alter the
working CPWI bridge.

## Install

1. Run `supabase/hbg3_dew_commands.sql` once in the Supabase SQL Editor. The
   updated file includes the atomic `claim_hbg3_dew_command()` function.
2. Copy this `hbg3-bridge` folder to `C:\CuzBro\hbg3-bridge`.
3. Copy `.env.example` to `.env` and insert the Supabase URL and **service-role**
   key. Never commit `.env` to GitHub.
4. Edit `set-hbg3-dew.ps1`. Replace the final `throw` with the command currently
   used by your local dew-control script.
5. For a safe first test, set `DEW_DRY_RUN=true`, start `start-dew-bridge.cmd`,
   and submit a command from the console. The queue row should complete without
   changing heater output.
6. Set `DEW_DRY_RUN=false` and test **HEATER OFF** before testing non-zero output.

## Command mapping

The wrapper receives:

- `Channel`: 0 or 1
- `Mode`: `auto` or `manual`
- `Aggression`: 0–10
- `ManualPwm`: 0–100

The console currently operates channel 0. The bridge validates every value before
calling hardware.

## Running alongside the existing bridge

Run this process separately at first. After it is proven, its `main()` loop can
be imported into the existing bridge or both scripts can be launched by the same
Windows startup task.

## CuzBro combined startup

`start-hbg3-bridge.bat` now launches both required processes:

1. HBG3 telemetry (`server.mjs`)
2. Dew command queue consumer (`dew_command_bridge.py`)

The included `.env` contains aliases for both programs and uses HBG3 at `10.0.0.57:3000`.

Important: `set-hbg3-dew.ps1` is still a safety placeholder. Telemetry can work, but a queued heater command will intentionally fail until the verified HBG3 hardware-control command is added.
