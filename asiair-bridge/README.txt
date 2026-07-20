CUZBRO ASIAIR FEED BRIDGE

WHAT IT DOES
- Watches the ASIAIR image-storage folder from the observatory Windows PC.
- Detects completed FITS frames without controlling the ASIAIR.
- Reads exposure, gain, camera temperature, object name and timestamps.
- Creates a stretched JPEG Viewscreen preview.
- Publishes live status to the Supabase asiair_status table.
- Leaves the existing CPWI slew controls in the website unchanged.

INSTALL
1. Copy this folder to C:\CuzBro\asiair-bridge.
2. Copy .env.example to .env.
3. Add the existing Supabase URL and service-role key to .env.
4. In Windows Explorer, open the ASIAIR network share and locate its image folder.
5. Map that folder to a drive letter (recommended), then set ASIAIR_OUTPUT_DIR,
   for example Z:\Images. A working UNC path such as \\ASIAIR\Images is also valid.
6. Run supabase-asiair-status.sql once in the Supabase SQL Editor.
7. Run install-preview-deps.bat once.
8. Start start-asiair-bridge.bat before imaging.

NOTES
- The bridge is read-only. Capture setup/start/stop remains in the ASIAIR app.
- Files already present when the bridge starts are ignored for session counting.
- The bridge recursively watches subfolders, so ASIAIR Autorun/Plan folders work.
- The website polls Supabase every three seconds and updates after each completed frame.
- The old asiimg_status table and old ASIImg bridge are no longer used.
