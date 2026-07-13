CUZBRO ASIIMG CAPTURE MONITOR

1. Copy this folder to C:\CuzBro\asiimg-bridge
2. Copy .env.example to .env
3. Put your existing Supabase URL and service-role key into .env
4. Set ASIIMG_OUTPUT_DIR to the exact folder ASIImg uses for saved light frames
5. Run supabase-asiimg-status.sql once in the Supabase SQL Editor
6. Start start-asiimg-bridge.bat before beginning a capture

The monitor is read-only. It does not click or control ASIImg. It counts new FITS
files, reads common FITS header values, detects stalls, and publishes live status.
Only frames created after the monitor starts are counted.
