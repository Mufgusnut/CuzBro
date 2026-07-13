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
  station: process.env.HBG3_STATION || process.env.STATION || 'eliot',
  pollMs: Math.max(3000, Number(process.env.POLL_SECONDS || 5) * 1000)
};

if (!config.supabaseUrl || !config.serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in hbg3-bridge/.env');
  process.exit(1);
}

const headers = {
  apikey: config.serviceRoleKey,
  Authorization: `Bearer ${config.serviceRoleKey}`,
  'Content-Type': 'application/json'
};

async function claimNextCommand() {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/claim_hbg3_dew_command`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ p_station: config.station })
  });
  if (!response.ok) throw new Error(`Claim command HTTP ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function completeCommand(id, success, result = null, error = null) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/hbg3_dew_commands?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ completed_at: new Date().toISOString(), success, result, error })
  });
  if (!response.ok) throw new Error(`Complete command HTTP ${response.status}: ${await response.text()}`);
}

function normalizeCommand(command) {
  if (!command) return null;
  if (command.action !== 'set_channel') throw new Error(`Unsupported dew action: ${command.action}`);
  const args = command.arguments || {};
  const channel = Number(args.channel ?? 0);
  const mode = String(args.mode || 'manual').toLowerCase();
  const aggression = Number(args.aggression ?? 5);
  const manualPwm = Number(args.manualPwm ?? 0);
  if (![0, 1].includes(channel)) throw new Error('channel must be 0 or 1');
  if (!['auto', 'manual'].includes(mode)) throw new Error('mode must be auto or manual');
  if (!Number.isInteger(aggression) || aggression < 0 || aggression > 10) throw new Error('aggression must be 0-10');
  if (!Number.isInteger(manualPwm) || manualPwm < 0 || manualPwm > 100) throw new Error('manualPwm must be 0-100');
  return { id: command.id, channel, mode, aggression, manualPwm };
}

function commandLineFor(values) {
  if (!values) return null;
  if (values.mode === 'manual') {
    const raw = Math.round(values.manualPwm * 255 / 100);
    return { line: `send DEW 0x17 0x${values.channel.toString(16).padStart(2, '0')} 0x${raw.toString(16).padStart(2, '0')}`, raw };
  }
  return { line: `send DEW 0x16 0x${values.channel.toString(16).padStart(2, '0')} 0x${values.aggression.toString(16).padStart(2, '0')}`, raw: null };
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
  if (!channels.length) throw new Error(`No DEW channel data found in HBG3 response: ${text.trim() || '(empty response)'}`);
  return channels;
}

function parseOledOutput(text) {
  const dewLine = text.match(/(?:DewPt|Dewpoint):\s*([\d.-]+)C(?:\s+([\d.-]+)V)?/i);
  const airLine = text.match(/(?:Air|Ambient):\s*([\d.-]+)C\s+RH:\s*([\d.-]+)%/i);
  const voltageMatch = text.match(/(?:^|\s)(\d{1,2}\.\d{1,2})V(?:\s|$)/m);
  if (!dewLine || !airLine) throw new Error(`No ambient/dew-point data found in OLED response: ${text.trim() || '(empty response)'}`);
  const dewPointC = Number(dewLine[1]);
  const supplyVolts = Number(dewLine[2] || voltageMatch?.[1] || 0);
  const ambientC = Number(airLine[1]);
  const humidityPercent = Number(airLine[2]);
  return { ambientC, humidityPercent, dewPointC, dewMarginC: Number((ambientC - dewPointC).toFixed(2)), supplyVolts };
}

function verifyCommand(values, channels) {
  if (!values) return null;
  const channel = channels.find((item) => item.index === values.channel);
  if (!channel) throw new Error(`No telemetry for dew channel ${values.channel}`);
  if (values.mode === 'manual') {
    if (channel.aggression !== 0 || Math.abs(channel.manualPwm - values.manualPwm) > 1) {
      throw new Error(`Manual command not applied: requested ${values.manualPwm}%, got aggression=${channel.aggression}, manual=${channel.manualPwm}%`);
    }
  } else if (channel.aggression !== values.aggression) {
    throw new Error(`Automatic command not applied: requested aggression ${values.aggression}, got ${channel.aggression}`);
  }
  return { mode: values.mode, channel: values.channel, aggression: channel.aggression, manualPwm: channel.manualPwm, pwmPercent: channel.pwmPercent };
}

function requestTelemetryData(commandValues) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let response = '';
    let finished = false;
    let commandSent = false;
    let dewSent = false;
    let oledSent = false;
    let settleTimer;
    const command = commandLineFor(commandValues);

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(settleTimer);
      socket.destroy();
      if (error) return reject(error);
      try {
        const channels = parseDewOutput(response);
        const environment = parseOledOutput(response);
        const commandResult = verifyCommand(commandValues, channels);
        resolve({ channels, environment, commandResult, rawCommand: command });
      } catch (parseError) {
        reject(parseError);
      }
    };

    const sendCommand = () => {
      if (commandSent || !command || finished) return;
      commandSent = true;
      socket.write(`${command.line}\r\n`);
      setTimeout(() => {
        if (!dewSent && !finished) {
          dewSent = true;
          socket.write('dew\r\n');
        }
      }, 500);
    };

    socket.setTimeout(10000, () => finish(new Error('HBG3 connection timed out')));
    socket.on('error', finish);
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (command && !commandSent && response.includes('p3000_debug:')) sendCommand();
      if (!command && !dewSent && response.includes('p3000_debug:')) {
        dewSent = true;
        socket.write('dew\r\n');
      }
      if (dewSent && !oledSent && response.includes('DEW(1):')) {
        oledSent = true;
        socket.write('oled\r\n');
      }
      if (oledSent && (response.includes('HBG3 by Mark Lord') || /Dew(?:Pt|point):/i.test(response))) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(), 350);
      }
    });

    socket.on('connect', () => {
      socket.write('debug\r\n');
      setTimeout(() => {
        if (command && !commandSent && !finished) sendCommand();
        else if (!command && !dewSent && !finished) {
          dewSent = true;
          socket.write('dew\r\n');
        }
      }, 800);
      setTimeout(() => {
        if (!oledSent && !finished) {
          oledSent = true;
          socket.write('oled\r\n');
        }
      }, 3000);
    });
  });
}

async function publish(record) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/hbg3_dew_status`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(record)
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${await response.text()}`);
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  const capturedAt = new Date().toISOString();
  let claimed = null;
  let values = null;
  try {
    claimed = await claimNextCommand();
    values = normalizeCommand(claimed);
    if (claimed) console.log(`${capturedAt} CLAIMED DEW COMMAND ${claimed.id}`);
    const { channels, environment, commandResult, rawCommand } = await requestTelemetryData(values);
    if (claimed) {
      await completeCommand(claimed.id, true, { adapter: 'integrated-port3000', command: rawCommand?.line, ...commandResult });
      console.log(`${capturedAt} COMPLETED DEW COMMAND ${claimed.id} | ${rawCommand?.line}`);
    }
    await publish({ station: config.station, captured_at: capturedAt, connected: true, raw_data: { host: config.host, channels, environment } });
    const summary = channels.map((channel) => `CH${channel.index + 1} ${channel.temperatureC.toFixed(2)}C ${channel.pwmPercent}%`).join(' | ');
    console.log(`${capturedAt} HBG3 ONLINE | ${summary} | AIR ${environment.ambientC.toFixed(1)}C RH ${environment.humidityPercent.toFixed(0)}% DEWPT ${environment.dewPointC.toFixed(1)}C`);
  } catch (error) {
    console.error(`${capturedAt} HBG3 ERROR | ${error.message}`);
    if (claimed) {
      try { await completeCommand(claimed.id, false, null, `${error.name}: ${error.message}`); }
      catch (completeError) { console.error(`${capturedAt} COMMAND STATUS ERROR | ${completeError.message}`); }
    }
    try {
      await publish({ station: config.station, captured_at: capturedAt, connected: false, raw_data: { host: config.host, channels: [], error: error.message } });
    } catch (publishError) {
      console.error(`${capturedAt} SUPABASE ERROR | ${publishError.message}`);
    }
  } finally {
    polling = false;
  }
}

console.log(`CuzBro HBG3 integrated telemetry + dew control on ${config.host}:${config.port} every ${config.pollMs / 1000}s`);
console.log('IMPORTANT: Do not run start-dew-bridge.cmd with this version.');
await poll();
setInterval(poll, config.pollMs);
