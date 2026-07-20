CUZBRO DIRECT ASIAIR CONTROL

This build controls the ASIAIR directly over TCP port 4700. Android/ADB is no
longer required for the supported controls.

SUPPORTED
- Preview and Autorun page selection
- Start/stop exposure
- Gain
- Exposure duration
- Autorun light-frame count, duration, gain, and target/group name
- Plate solve
- Existing event monitor on ports 4400/4700
- Existing SMB/FITS preview feed

INSTALL
1. Keep your existing .env. Do not replace it with a downloaded secret file.
2. Add:
   ASIAIR_DIRECT_CONTROL_ENABLED=1
   ASIAIR_DIRECT_CONTROL_PORT=4700
   ASIAIR_ANDROID_CONTROL_ENABLED=0
3. Keep ASIAIR_HOST set to the ASIAIR IP, currently 10.0.0.113.
4. Run supabase-asiair-status.sql once in the Supabase SQL editor. This expands
   the allowed command actions.
5. Replace the website src folder with the supplied src folder.
6. Restart the bridge.

EXPECTED STARTUP
Direct ASIAIR control: ENABLED
Direct command target: 10.0.0.113:4700
Android fallback control: DISABLED

NOT YET DECODED
- Changing the ASIAIR continuous-preview preference
- Video, Focus, and Live mode controls
- Image transfer directly from ports 4800/4801

SECURITY
Do not expose ASIAIR ports to the public internet. Website commands continue to
flow through Supabase and the local bridge.
