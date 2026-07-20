CUZBRO EXPERIMENTAL ASIAIR PROTOCOL MONITOR
============================================

WHAT THIS BUILD DOES
--------------------
It opens read-only TCP connections to the ASIAIR event services:

  4400  Guiding and telescope events
  4700  Imaging, plate solve, camera, temperature, and Pi status events

The ASIAIR sends newline-delimited JSON events. The bridge records the latest
messages, prints them in the bridge window, and publishes a compact event feed
inside asiair_status.payload.protocol in Supabase.

This build does NOT transmit protocol commands yet. Android/ADB controls are
left intact so you can generate actions while the monitor records the ASIAIR's
responses. That capture gives us the event names and payload shapes needed for
the next phase.

SETUP
-----
1. Put the ASIAIR in Station Mode and make sure the observatory PC can ping it.
2. In .env set:

   ASIAIR_PROTOCOL_MONITOR_ENABLED=1
   ASIAIR_HOST=<the ASIAIR LAN IP>
   ASIAIR_PROTOCOL_PORTS=4400,4700

3. Start start-asiair-bridge.bat.
4. Look for both lines:

   ASIAIR EVENT 4400 | ...
   ASIAIR EVENT 4700 | ...

5. In the ASIAIR app perform one action at a time, waiting several seconds:

   - connect equipment
   - switch to Preview
   - take one preview exposure
   - start Autorun
   - stop Autorun
   - run a plate solve
   - start and stop guiding

6. Copy the bridge console output or the new ASIAIR_4400/4700 event data and
   send it back for command mapping.

WINDOWS CONNECTIVITY TEST
-------------------------
Run these in PowerShell:

  Test-NetConnection <ASIAIR-IP> -Port 4400
  Test-NetConnection <ASIAIR-IP> -Port 4700

TcpTestSucceeded should be True for each port.

SAFETY
------
The protocol listener is read-only. Do not expose ASIAIR ports directly to the
public internet. Keep access limited to your LAN/VPN.
