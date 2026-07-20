CUZBRO ASIAIR ANDROID CONTROL
==============================

This is experimental UI automation. The website queues a command in Supabase.
The local bridge receives it and uses Android Debug Bridge (ADB) to tap the
ASIAIR Android app. Autorun uses the plan already configured in the app.

1. Install Android platform-tools and place adb.exe somewhere stable, such as:
   C:\platform-tools\adb.exe

2. Run the ASIAIR app on one of these:
   - a dedicated Android tablet/phone connected by USB with USB debugging, or
   - an Android emulator with the ASIAIR app installed.

3. Run test-android-connection.bat. It must show exactly one device as "device".
   If it says unauthorized, approve the debugging prompt on Android.

4. Copy .env.example to .env and restore your real Supabase and ASIAIR folder
   values. Never commit .env to GitHub.

5. Confirm the package name:
   adb shell pm list packages | findstr /i "asiair zwo"
   Put the returned package in ASIAIR_ANDROID_PACKAGE.

6. Open the ASIAIR app and leave it on its normal camera screen. Run
   capture-android-screen.bat. Open asiair-screen.png in Paint and record the
   pixel coordinates of:
   - Preview mode/tab
   - Preview shutter/capture button
   - Autorun mode/tab
   - Autorun Start button
   - Stop button shown while an exposure or Autorun is active

7. Enter those values in .env as X,Y pairs. Example only:
   ASIAIR_TAP_PREVIEW_TAB=180,930
   ASIAIR_TAP_PREVIEW_CAPTURE=960,930

8. In Supabase SQL Editor, run supabase-asiair-status.sql again. It creates the
   asiair_commands queue and its authenticated-user policies.

9. Restart start-asiair-bridge.bat. Startup must say:
   Android capture control: ENABLED

Important:
- Keep the emulator/device unlocked, awake, and at a fixed resolution.
- Disable auto-rotate.
- Do not move or resize the emulator window after calibration.
- The bridge wakes Android and launches the ASIAIR package before tapping.
- A changed ASIAIR layout can require recalibration.
