import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const config = {
  host: process.env.HBG3_HOST || '10.0.0.57',
  port: Number(process.env.HBG3_PORT || 3000),
  supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  station: process.env.STATION || 'eliot',
  pollMs: Math.max(3000, Number(process.env.POLL_SECONDS || 5) * 1000)
};

if (!config.supabaseUrl || !config.serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in hbg3-bridge/.env');
  process.exit(1);
}

function parseDewOutput(text) {
  const channels = [];
  const pattern = /DEW\((\d+)\):\s+dew_pwm_percent=([\d.-]+)\s+dew_aggression=([\d.-]+)\s+dew_manual_pwm=([\d.-]+)\s+dew_temperature=([\d.-]+)\s+dew_amps=([\d.-]+)\s+dew_max_amps=([\d.-]+)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const temperatureC = Number(match[5]);
    channels.push({
      index: Number(match[1]),
      pwmPercent: Number(match[2]),
      aggression: Number(match[3]),
      manualPwm: Number(match[4]),
      temperatureC,
      amps: Number(match[6]),
      maxAmps: Number(match[7]),
      sensorDetected: temperatureC !== 0
    });
  }

  if (!channels.length) {
    throw new Error(`No DEW channel data found in HBG3 response: ${text.trim() || '(empty response)'}`);
  }

  return channels;
}

function parseOledOutput(text) {
  const dewLine = text.match(/DewPt:\s*([\d.-]+)C\s+([\d.-]+)V/i);
  const airLine = text.match(/Air:\s*([\d.-]+)C\s+RH:\s*([\d.-]+)%/i);

  if (!dewLine || !airLine) {
    throw new Error(`No ambient/dew-point data found in OLED response: ${text.trim() || '(empty response)'}`);
  }

  const dewPointC = Number(dewLine[1]);
  const supplyVolts = Number(dewLine[2]);
  const ambientC = Number(airLine[1]);
  const humidityPercent = Number(airLine[2]);
  const dewMarginC = Number((ambientC - dewPointC).toFixed(2));

  return {
    ambientC,
    humidityPercent,
    dewPointC,
    dewMarginC,
    supplyVolts
  };
}

function requestTelemetryData() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let response = '';
    let finished = false;
    let dewSent = false;
    let oledSent = false;
    let settleTimer;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(settleTimer);
      socket.destroy();

      if (error) {
        reject(error);
        return;
      }

      try {
        resolve({
          channels: parseDewOutput(response),
          environment: parseOledOutput(response)
        });
      } catch (parseError) {
        reject(parseError);
      }
    };

    socket.setTimeout(8000, () => finish(new Error('HBG3 connection timed out')));
    socket.on('error', finish);
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');

      if (!dewSent && response.includes('p3000_debug:')) {
        dewSent = true;
        socket.write('dew\r\n');
      }

      if (dewSent && !oledSent && response.includes('DEW(1):')) {
        oledSent = true;
        socket.write('oled\r\n');
      }

      if (oledSent && response.includes('HBG3 by Mark Lord')) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(), 250);
      }
    });

    socket.on('connect', () => {
      socket.write('debug\r\n');
      setTimeout(() => {
        if (!dewSent && !finished) {
          dewSent = true;
          socket.write('dew\r\n');
        }
      }, 700);
      setTimeout(() => {
        if (!oledSent && !finished) {
          oledSent = true;
          socket.write('oled\r\n');
        }
      }, 2200);
    });
  });
}

async function publish(record) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/hbg3_dew_status`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status}: ${await response.text()}`);
  }
}

async function poll() {
  const capturedAt = new Date().toISOString();

  try {
    const { channels, environment } = await requestTelemetryData();
    await publish({
      station: config.station,
      captured_at: capturedAt,
      connected: true,
      raw_data: { host: config.host, channels, environment }
    });

    const summary = channels
      .map((channel) => `CH${channel.index + 1} ${channel.temperatureC.toFixed(2)}C ${channel.pwmPercent}%`)
      .join(' | ');
    console.log(`${capturedAt} HBG3 ONLINE | ${summary} | AIR ${environment.ambientC.toFixed(1)}C RH ${environment.humidityPercent.toFixed(0)}% DEWPT ${environment.dewPointC.toFixed(1)}C MARGIN ${environment.dewMarginC.toFixed(1)}C`);
  } catch (error) {
    console.error(`${capturedAt} HBG3 ERROR | ${error.message}`);

    try {
      await publish({
        station: config.station,
        captured_at: capturedAt,
        connected: false,
        raw_data: { host: config.host, channels: [], error: error.message }
      });
    } catch (publishError) {
      console.error(`${capturedAt} SUPABASE ERROR | ${publishError.message}`);
    }
  }
}

console.log(`CuzBro HBG3 bridge polling ${config.host}:${config.port} every ${config.pollMs / 1000}s`);
await poll();
setInterval(poll, config.pollMs);
