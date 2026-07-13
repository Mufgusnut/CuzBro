import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Compass,
  Cpu,
  DatabaseZap,
  Droplets,
  Gauge,
  PauseCircle,
  Radio,
  PlayCircle,
  Radar,
  Settings2,
  SquareTerminal,
  Thermometer,
  TimerReset,
  Wifi,
  Wind
} from 'lucide-react';
import { supabase } from '../supabase.js';
import { getCrewMember } from '../lib/crew.js';
import { logCrewActivity } from '../lib/audit.js';
import {
  announceOperationChange,
  formatOperationElapsed,
  getActiveOperation,
  recordOperationEvent
} from '../lib/operations.js';
import {
  missionSlug,
  OPEN_MISSION_TARGETS,
  rankOpenMissions
} from '../lib/openMissions.js';

const DEFAULT_SITE = {
  key: 'eliot-me',
  name: 'Eliot, ME',
  lat: 43.1531,
  lon: -70.7828
};

const STORAGE_PREFIX = 'cuzbro-mission-console-v1';
const DEFAULT_LOCAL_BRIDGE_URL = 'http://127.0.0.1:4788';

const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (radiansValue) => radiansValue * 180 / Math.PI;
const normalize = (value, modulus) => ((value % modulus) + modulus) % modulus;

function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function localSiderealHours(date, longitude) {
  const jd = julianDate(date);
  const d = jd - 2451545.0;
  const gmst = 18.697374558 + 24.06570982441908 * d;
  return normalize(gmst + longitude / 15, 24);
}

function altitudeForCoords(ra, dec, date, site) {
  const hourAngle = radians((localSiderealHours(date, site.lon) - ra) * 15);
  const latitude = radians(site.lat);
  const declination = radians(dec);
  return degrees(Math.asin(
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  ));
}

function azimuthForCoords(ra, dec, date, site) {
  const hourAngle = radians((localSiderealHours(date, site.lon) - ra) * 15);
  const latitude = radians(site.lat);
  const declination = radians(dec);
  const altitude = radians(altitudeForCoords(ra, dec, date, site));

  const cosAz = (Math.sin(declination) - Math.sin(altitude) * Math.sin(latitude)) /
    (Math.cos(altitude) * Math.cos(latitude));
  const clampedCosAz = Math.min(1, Math.max(-1, cosAz));
  let azimuth = degrees(Math.acos(clampedCosAz));

  if (Math.sin(hourAngle) > 0) {
    azimuth = 360 - azimuth;
  }

  return azimuth;
}

function formatClock(dateLike) {
  if (!dateLike) return '—';
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}


function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [String(hours).padStart(2, '0'), String(minutes).padStart(2, '0'), String(seconds).padStart(2, '0')].join(':');
}

function formatDecimal(value, digits = 1, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function getWeatherRating(weather) {
  if (!weather) {
    return {
      label: 'Link Pending',
      detail: 'Weather telemetry still syncing.',
      tone: 'standby'
    };
  }

  const clouds = Number(weather.cloud_cover ?? 0);
  const wind = Number(weather.wind_speed_10m ?? 0);
  const humidity = Number(weather.relative_humidity_2m ?? 0);

  if (clouds < 20 && wind < 12 && humidity < 85) {
    return {
      label: 'Excellent',
      detail: 'High-confidence observing window.',
      tone: 'good'
    };
  }

  if (clouds < 45 && wind < 16) {
    return {
      label: 'Good',
      detail: 'Usable conditions with light caution.',
      tone: 'good'
    };
  }

  if (clouds < 70) {
    return {
      label: 'Fair',
      detail: 'Conditions are mixed and may drift.',
      tone: 'warn'
    };
  }

  return {
    label: 'Poor',
    detail: 'Cloud cover likely to limit capture quality.',
    tone: 'alert'
  };
}

function getDewRisk(weather) {
  if (!weather) return 'Unknown';
  const humidity = Number(weather.relative_humidity_2m ?? 0);
  const temperature = Number(weather.temperature_2m ?? 0);

  if (humidity >= 92 || (humidity >= 85 && temperature <= 60)) return 'High';
  if (humidity >= 75) return 'Moderate';
  return 'Low';
}

function parseFrameTarget(capturePlan) {
  const match = String(capturePlan || '').match(/(\d[\d,]*)\s*[×x]/);
  if (!match) return null;
  const parsed = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateLabel(value) {
  if (!value) return 'DATE UNKNOWN';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).toUpperCase();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function averageNumber(values) {
  const numeric = values.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function buildTargetAliases(plan, targetReference) {
  const raw = [
    plan?.target_title,
    plan?.target_slug,
    plan?.target,
    targetReference?.title,
    targetReference?.shortTitle
  ].filter(Boolean);

  return Array.from(new Set(raw.map((value) => String(value).trim()).filter(Boolean)));
}

function captureMatchesTarget(capture, aliases) {
  const title = String(capture?.title || '').toLowerCase();
  const slug = missionSlug(title);
  return aliases.some((alias) => {
    const aliasText = String(alias || '').toLowerCase();
    const aliasSlug = missionSlug(aliasText);
    if (!aliasSlug) return false;
    if (slug === aliasSlug || slug.includes(aliasSlug) || aliasSlug.includes(slug)) return true;
    if (title.includes(aliasText)) return true;
    const aliasTokens = aliasText.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
    const matches = aliasTokens.filter((token) => title.includes(token));
    return aliasTokens.length >= 2 ? matches.length >= 2 : matches.length >= 1;
  });
}

function getMissionRecommendation({ missionPlan, targetReference, weather, lastCapture }) {
  const type = String(missionPlan?.target_type || targetReference?.objectType || '').toLowerCase();
  const title = String(missionPlan?.target_title || targetReference?.title || '').toLowerCase();

  let exposureSeconds = 5;
  let frameCount = 600;
  let gain = 120;
  let equipment = targetReference?.equipment || missionPlan?.equipment || 'ASI294MC // CPC 800 // F/6.3';
  let rationale = 'Short sub-exposures are favored to reduce field-rotation losses on the alt-az CPC mount while building integration through frame count.';

  if (type.includes('double star') || title.includes('albireo')) {
    exposureSeconds = 0.25;
    frameCount = 500;
    gain = 80;
    equipment = 'ASI294MC // CPC 800 // NATIVE F/10';
    rationale = 'Very short exposures preserve star color and prevent the bright components from saturating.';
  } else if (type.includes('globular') || type.includes('open cluster')) {
    exposureSeconds = 3;
    frameCount = 500;
    gain = 100;
    rationale = 'Short exposures protect the bright stellar core while enough frames improve faint outer-star definition.';
  } else if (type.includes('planetary nebula')) {
    exposureSeconds = title.includes('cat') ? 1 : 5;
    frameCount = title.includes('cat') ? 1500 : 700;
    gain = title.includes('cat') ? 180 : 120;
    equipment = title.includes('cat')
      ? 'ASI294MC // CPC 800 // NATIVE F/10'
      : 'ASI294MC // CPC 800 // F/6.3';
    rationale = title.includes('cat')
      ? 'The small bright core benefits from lucky-imaging style short exposures and higher frame count at native focal length.'
      : 'Moderate short exposures preserve the nebular core while accumulating enough signal for the outer structure.';
  } else if (type.includes('emission nebula') || type.includes('supernova')) {
    exposureSeconds = 10;
    frameCount = 900;
    gain = 120;
    equipment = 'ASI294MC // CPC 800 // F/6.3 // UHC OPTIONAL';
    rationale = 'A long total integration is more valuable than longer individual subs on the alt-az mount; the reducer and optional UHC improve signal collection.';
  } else if (type.includes('galaxy')) {
    exposureSeconds = 5;
    frameCount = 900;
    gain = 120;
    rationale = 'Five-second subs limit rotation and tracking loss while a large stack builds faint dust-lane and arm detail.';
  } else if (type.includes('planet') || type.includes('lunar')) {
    exposureSeconds = 0.01;
    frameCount = 5000;
    gain = 180;
    equipment = 'ASI294MC // CPC 800 // NATIVE F/10 // VIDEO/ROI';
    rationale = 'High-frame-rate lucky imaging is preferred; use ROI and tune exposure to keep the histogram below clipping.';
  }

  const clouds = Number(weather?.cloud_cover ?? 0);
  const humidity = Number(weather?.relative_humidity_2m ?? 0);
  const wind = Number(weather?.wind_speed_10m ?? 0);
  const adjustments = [];

  if (clouds >= 45) {
    frameCount = Math.round(frameCount * 1.25);
    adjustments.push('Extra frames added for intermittent cloud loss.');
  }

  if (wind >= 14) {
    exposureSeconds = Math.min(exposureSeconds, 3);
    adjustments.push('Exposure shortened for wind and vibration risk.');
  }

  if (humidity >= 85) {
    adjustments.push('Run dew control before focusing and throughout capture.');
  }

  const totalIntegrationSeconds = exposureSeconds * frameCount;

  return {
    exposureSeconds,
    frameCount,
    gain,
    totalIntegrationSeconds,
    equipment,
    rationale,
    adjustments,
    differsFromLast: Boolean(lastCapture) && (
      Number(lastCapture.exposure_seconds) !== Number(exposureSeconds) ||
      Number(lastCapture.frame_count) !== Number(frameCount) ||
      Number(lastCapture.gain) !== Number(gain)
    )
  };
}

function summarizeCaptureHistory(captures) {
  if (!captures?.length) {
    return {
      count: 0,
      structuredCount: 0,
      averageExposure: null,
      averageFrames: null,
      averageGain: null,
      averageIntegration: null
    };
  }

  const structured = captures.filter((capture) =>
    capture?.exposure_seconds !== null || capture?.frame_count !== null || capture?.gain !== null
  );

  return {
    count: captures.length,
    structuredCount: structured.length,
    averageExposure: averageNumber(captures.map((capture) => capture?.exposure_seconds)),
    averageFrames: averageNumber(captures.map((capture) => capture?.frame_count)),
    averageGain: averageNumber(captures.map((capture) => capture?.gain)),
    averageIntegration: averageNumber(captures.map((capture) => capture?.total_integration_seconds))
  };
}

function getMissionTargetReference(plan, activeSite) {
  if (!plan) return null;

  const slug = missionSlug(plan.target_title || plan.target_slug || plan.target || '');
  const directMatch = OPEN_MISSION_TARGETS.find((target) => missionSlug(target.title) === slug);
  if (directMatch) return directMatch;

  const ranked = rankOpenMissions(activeSite || DEFAULT_SITE);
  const rankedMatch = ranked.find((target) => missionSlug(target.title) === slug);
  if (rankedMatch) return rankedMatch;

  return null;
}

function computeTargetTelemetry(target, activeSite, now) {
  if (target?.ra === undefined || target?.ra === null || target?.dec === undefined || target?.dec === null) {
    return null;
  }

  const site = activeSite || DEFAULT_SITE;
  const altitude = altitudeForCoords(target.ra, target.dec, now, site);
  const azimuth = azimuthForCoords(target.ra, target.dec, now, site);

  const samples = [];
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  for (let step = 0; step <= 288; step += 1) {
    const time = new Date(start.getTime() + step * 5 * 60 * 1000);
    samples.push({
      time,
      altitude: altitudeForCoords(target.ra, target.dec, time, site)
    });
  }

  let transit = samples[0];
  samples.forEach((sample) => {
    if (sample.altitude > transit.altitude) transit = sample;
  });

  let rise = null;
  let set = null;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (!rise && previous.altitude < 0 && current.altitude >= 0) {
      rise = current.time;
    }

    if (!set && previous.altitude >= 0 && current.altitude < 0) {
      set = current.time;
    }
  }

  const tonightStart = new Date(now);
  tonightStart.setHours(19, 0, 0, 0);
  if (now.getHours() < 12) tonightStart.setDate(tonightStart.getDate() - 1);
  const nightSamples = [];
  for (let step = 0; step <= 60; step += 1) {
    const time = new Date(tonightStart.getTime() + step * 10 * 60 * 1000);
    nightSamples.push({
      time,
      altitude: altitudeForCoords(target.ra, target.dec, time, site)
    });
  }

  const visibleWindow = nightSamples.filter((sample) => sample.altitude >= 30);
  const visibilityStart = visibleWindow[0]?.time || null;
  const visibilityEnd = visibleWindow[visibleWindow.length - 1]?.time || null;

  return {
    altitude,
    azimuth,
    transit: transit.time,
    rise,
    set,
    visibilityStart,
    visibilityEnd,
    maxAltitude: transit.altitude
  };
}

function consoleStorageKey(planId) {
  return `${STORAGE_PREFIX}:${planId || 'none'}`;
}

function readStoredConsoleState(planId) {
  try {
    const raw = localStorage.getItem(consoleStorageKey(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function mergeConsoleState(base, stored) {
  return {
    captureStatus: stored?.captureStatus || base.captureStatus,
    captureStartedAt: stored?.captureStartedAt || base.captureStartedAt,
    captureResumeAt: stored?.captureResumeAt || base.captureResumeAt,
    captureAccumulatedMs: Number(stored?.captureAccumulatedMs || 0),
    completedFrames: Number(stored?.completedFrames || base.completedFrames || 0),
    notes: stored?.notes || base.notes || ''
  };
}

function getLocalBridgeUrl() {
  try {
    return localStorage.getItem('cuzbro-local-bridge-url') ||
      import.meta.env.VITE_LOCAL_BRIDGE_URL ||
      DEFAULT_LOCAL_BRIDGE_URL;
  } catch {
    return import.meta.env.VITE_LOCAL_BRIDGE_URL || DEFAULT_LOCAL_BRIDGE_URL;
  }
}

function bridgeNumber(value, digits = 1, suffix = '') {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function bridgeBoolean(value) {
  if (value === true) return 'ON';
  if (value === false) return 'OFF';
  return '—';
}

async function fetchLocalBridgeStatus(url, signal) {
  const response = await fetch(`${String(url).replace(/\/$/, '')}/status`, {
    method: 'GET',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Local bridge returned ${response.status}`);
  return response.json();
}

async function sendLocalBridgeControl(url, action) {
  const response = await fetch(`${String(url).replace(/\/$/, '')}/control`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Local bridge returned ${response.status}`);
  }
  return payload;
}

function QuickLink({ href, label }) {
  return (
    <a className="missionConsoleQuickLink" href={href}>
      {label}
    </a>
  );
}

export default function MissionConsole({ session, activeSite = DEFAULT_SITE, weather = null }) {
  const [activeOperation, setActiveOperation] = useState(null);
  const [missionPlan, setMissionPlan] = useState(null);
  const [lastCapture, setLastCapture] = useState(null);
  const [captureHistory, setCaptureHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [now, setNow] = useState(Date.now());
  const [bridgeMenuOpen, setBridgeMenuOpen] = useState(false);
  const [localBridgeUrl, setLocalBridgeUrl] = useState(getLocalBridgeUrl);
  const [localSystems, setLocalSystems] = useState(null);
  const [localSystemsStatus, setLocalSystemsStatus] = useState('connecting');
  const [localSystemsError, setLocalSystemsError] = useState('');
  const [localSystemsUpdatedAt, setLocalSystemsUpdatedAt] = useState(null);
  const [cpwiControlBusy, setCpwiControlBusy] = useState('');
  const [cpwiControlError, setCpwiControlError] = useState('');
  const [hbg3Record, setHbg3Record] = useState(null);
  const [hbg3Error, setHbg3Error] = useState('');
  const [openPanels, setOpenPanels] = useState({
    target: false,
    conditions: false,
    systems: false,
    recommendation: false,
    history: false,
    operations: false
  });
  const [consoleState, setConsoleState] = useState({
    captureStatus: 'idle',
    captureStartedAt: null,
    captureResumeAt: null,
    captureAccumulatedMs: 0,
    completedFrames: 0,
    notes: ''
  });

  const crew = session?.user?.email ? getCrewMember(session.user.email) : null;

  const targetReference = useMemo(
    () => getMissionTargetReference(missionPlan, activeSite || DEFAULT_SITE),
    [missionPlan, activeSite]
  );

  const telemetry = useMemo(
    () => computeTargetTelemetry(targetReference, activeSite || DEFAULT_SITE, new Date(now)),
    [targetReference, activeSite, now]
  );

  const frameTarget = useMemo(
    () => parseFrameTarget(missionPlan?.capture_plan || targetReference?.capturePlan || ''),
    [missionPlan, targetReference]
  );

  const captureElapsedMs = useMemo(() => {
    const base = Number(consoleState.captureAccumulatedMs || 0);
    if (consoleState.captureStatus !== 'running' || !consoleState.captureResumeAt) {
      return base;
    }
    const currentRun = Date.now() - new Date(consoleState.captureResumeAt).getTime();
    return base + Math.max(0, currentRun);
  }, [consoleState, now]);

  const captureElapsed = formatDurationMs(captureElapsedMs);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function pollHbg3Telemetry() {
      const { data, error: queryError } = await supabase
        .from('hbg3_dew_status')
        .select('station,captured_at,connected,raw_data')
        .eq('station', 'eliot')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setHbg3Error(queryError.message || 'HBG3 telemetry unavailable.');
        return;
      }

      setHbg3Record(data || null);
      setHbg3Error('');
    }

    pollHbg3Telemetry();
    const interval = window.setInterval(pollHbg3Telemetry, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let currentController = null;

    async function pollLocalSystems() {
      currentController?.abort();
      currentController = new AbortController();
      const timeout = window.setTimeout(() => currentController.abort(), 1800);

      try {
        const payload = await fetchLocalBridgeStatus(localBridgeUrl, currentController.signal);
        if (!active) return;
        setLocalSystems(payload);
        setLocalSystemsStatus('online');
        setLocalSystemsError('');
        setLocalSystemsUpdatedAt(new Date());
      } catch (bridgeError) {
        if (!active) return;
        setLocalSystemsStatus('offline');
        setLocalSystemsError(bridgeError?.name === 'AbortError' ? 'Local bridge did not respond.' : bridgeError.message || 'Local bridge unavailable.');
      } finally {
        window.clearTimeout(timeout);
      }
    }

    setLocalSystemsStatus('connecting');
    pollLocalSystems();
    const interval = window.setInterval(pollLocalSystems, 2000);

    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(interval);
    };
  }, [localBridgeUrl]);

  async function runCpwiControl(action) {
    setCpwiControlBusy(action);
    setCpwiControlError('');
    try {
      const payload = await sendLocalBridgeControl(localBridgeUrl, action);
      setLocalSystems(payload);
      setLocalSystemsStatus('online');
      setLocalSystemsUpdatedAt(new Date());
    } catch (controlError) {
      setCpwiControlError(controlError.message || 'CPWI command failed.');
    } finally {
      setCpwiControlBusy('');
    }
  }

  useEffect(() => {
    let active = true;

    async function loadMissionContext() {
      setLoading(true);
      setError('');

      try {
        const operation = await getActiveOperation().catch(() => null);

        const { data: planRows, error: planError } = await supabase
          .from('mission_plans')
          .select('*')
          .in('status', ['ACTIVE', 'PLANNED'])
          .order('updated_at', { ascending: false });

        if (planError) throw planError;
        if (!active) return;

        let selectedPlan = null;

        if (operation?.id) {
          selectedPlan = (planRows || []).find((plan) => plan.operation_id === operation.id) ||
            (planRows || []).find((plan) => String(plan.target_title || '').toLowerCase() === String(operation.target || '').toLowerCase()) ||
            null;
        }

        if (!selectedPlan) {
          selectedPlan = (planRows || []).find((plan) => plan.status === 'ACTIVE') || (planRows || [])[0] || null;
        }

        let history = [];
        let previousCapture = null;
        const targetReferenceForPlan = getMissionTargetReference(selectedPlan, activeSite || DEFAULT_SITE);

        if (selectedPlan?.target_title || targetReferenceForPlan?.title) {
          const aliases = buildTargetAliases(selectedPlan, targetReferenceForPlan);
          const { data: captureRows, error: captureError } = await supabase
            .from('gallery')
            .select('id, title, capture_date, exposure, exposure_seconds, frame_count, gain, total_integration_seconds, equipment, notes, processing, location, object_type')
            .order('capture_date', { ascending: false, nullsFirst: false });

          if (!captureError) {
            history = (captureRows || []).filter((capture) => captureMatchesTarget(capture, aliases));
            previousCapture = history[0] || null;
          }
        }

        setCaptureHistory(history);
        setLastCapture(previousCapture);
        setActiveOperation(operation || null);
        setMissionPlan(selectedPlan || null);

        if (!selectedPlan && !operation) {
          setMessage('No accepted or active mission plan found. Accept one in Open Missions to arm the console.');
        }
      } catch (loadError) {
        console.error('[MISSION CONSOLE] Load failed:', loadError);
        if (!active) return;
        setError(loadError.message || 'Mission console data unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMissionContext();

    const operationChannel = supabase
      .channel(`mission-console-ops-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_operations' }, () => {
        loadMissionContext();
      })
      .subscribe();

    const missionChannel = supabase
      .channel(`mission-console-missions-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_plans' }, () => {
        loadMissionContext();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(operationChannel);
      supabase.removeChannel(missionChannel);
    };
  }, [activeSite]);

  useEffect(() => {
    const stored = readStoredConsoleState(missionPlan?.id);
    const suggestedFrames = consoleState.completedFrames || 0;
    setConsoleState((current) => mergeConsoleState({
      ...current,
      completedFrames: current.completedFrames || suggestedFrames || 0
    }, stored));
  }, [missionPlan?.id]);

  useEffect(() => {
    if (!missionPlan?.id) return;
    try {
      localStorage.setItem(consoleStorageKey(missionPlan.id), JSON.stringify(consoleState));
    } catch {
      // Ignore local storage write errors.
    }
  }, [missionPlan?.id, consoleState]);

  useEffect(() => {
    if (!lastCapture?.frame_count) return;
    setConsoleState((current) => {
      if (Number(current.completedFrames || 0) > 0) return current;
      return { ...current, completedFrames: Number(lastCapture.frame_count) || 0 };
    });
  }, [lastCapture?.id, lastCapture?.frame_count]);

  const weatherRating = getWeatherRating(weather);
  const dewRisk = getDewRisk(weather);
  const hbg3AgeMs = hbg3Record?.captured_at
    ? now - new Date(hbg3Record.captured_at).getTime()
    : Infinity;
  const hbg3Online = Boolean(hbg3Record?.connected) && hbg3AgeMs <= 30000 && !hbg3Error;
  const hbg3Channels = Array.isArray(hbg3Record?.raw_data?.channels)
    ? hbg3Record.raw_data.channels
    : [];
  const hbg3Channel1 = hbg3Channels.find((channel) => Number(channel?.index) === 0) || hbg3Channels[0] || null;
  const hbg3Channel2 = hbg3Channels.find((channel) => Number(channel?.index) === 1) || hbg3Channels[1] || null;
  const hbg3Sensor1 = Boolean(hbg3Channel1?.sensorDetected ?? Number(hbg3Channel1?.temperatureC || 0) !== 0);
  const hbg3Sensor2 = Boolean(hbg3Channel2?.sensorDetected ?? Number(hbg3Channel2?.temperatureC || 0) !== 0);
  const hbg3Environment = hbg3Record?.raw_data?.environment || {};
  const hbg3DewMargin = Number(hbg3Environment?.dewMarginC);
  const hbg3RiskState = !hbg3Online || !Number.isFinite(hbg3DewMargin)
    ? 'UNKNOWN'
    : hbg3DewMargin <= 0
      ? 'DEW LIKELY'
      : hbg3DewMargin < 2
        ? 'HIGH'
        : hbg3DewMargin < 5
          ? 'WATCH'
          : 'SAFE';
  const hbg3ControlMode = Number(hbg3Channel1?.aggression || 0) > 0
    ? `AUTO A${Number(hbg3Channel1.aggression).toFixed(0)}`
    : `MANUAL ${Number(hbg3Channel1?.manualPwm || 0).toFixed(0)}%`;
  const systemsLinkTone = localSystemsStatus === 'online' || hbg3Online
    ? 'good'
    : localSystemsStatus === 'connecting'
      ? 'warn'
      : 'alert';
  const systemsLinkLabel = localSystemsStatus === 'online' && hbg3Online
    ? 'ONLINE'
    : localSystemsStatus === 'online' || hbg3Online
      ? 'PARTIAL'
      : localSystemsStatus.toUpperCase();
  const isOperationLive = activeOperation?.status === 'ACTIVE';
  const missionElapsed = formatOperationElapsed(
    activeOperation?.started_at || missionPlan?.started_at,
    activeOperation?.status === 'COMPLETE' ? activeOperation?.ended_at : null,
    now
  );
  const progressPercent = frameTarget ? Math.min(100, Math.round((Number(consoleState.completedFrames || 0) / frameTarget) * 100)) : 0;
  const captureHistorySummary = useMemo(() => summarizeCaptureHistory(captureHistory), [captureHistory]);
  const missionRecommendation = useMemo(() => getMissionRecommendation({ missionPlan, targetReference, weather, lastCapture }), [missionPlan, targetReference, weather, lastCapture]);

  async function handleInitiateMission() {
    if (!session?.user?.id || !missionPlan?.id) return;
    setBusyAction('initiate');
    setError('');
    setMessage('');

    try {
      const currentActiveOperation = await getActiveOperation();
      if (currentActiveOperation) {
        throw new Error(`${currentActiveOperation.designation} is already active.`);
      }

      const designation = `${missionPlan.target_title || targetReference?.title || 'Mission'} // ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`;

      const { data: operation, error: operationError } = await supabase
        .from('crew_operations')
        .insert({
          designation,
          target: missionPlan.target_title || targetReference?.title || 'Target pending',
          operation_type: 'Astrophotography',
          objective: missionPlan.primary_objective || targetReference?.objective || 'CAPTURE IN PROGRESS',
          status: 'ACTIVE',
          initiated_by_user_id: session.user.id,
          initiated_by_email: session.user.email || '',
          initiated_by_name: crew?.name || session.user.email || 'CuzBro Crew'
        })
        .select('*')
        .single();

      if (operationError) throw operationError;

      const { error: planError } = await supabase
        .from('mission_plans')
        .update({
          status: 'ACTIVE',
          operation_id: operation.id,
          started_at: new Date().toISOString()
        })
        .eq('id', missionPlan.id);

      if (planError) throw planError;

      await recordOperationEvent({
        operation,
        eventType: 'MISSION_CONSOLE_INITIATED',
        eventLabel: 'MISSION CONSOLE INITIATED',
        resourceType: 'mission_plan',
        resourceId: missionPlan.id,
        resourceName: missionPlan.target_title || targetReference?.title || 'Mission Plan',
        details: {
          capturePlan: missionPlan.capture_plan,
          equipment: missionPlan.equipment,
          site: activeSite?.name || DEFAULT_SITE.name
        },
        session
      });

      await logCrewActivity({
        action: 'MISSION_CONSOLE_INITIATED',
        category: 'OPERATION',
        resourceType: 'mission_plan',
        resourceId: missionPlan.id,
        resourceName: missionPlan.target_title || targetReference?.title || 'Mission Plan',
        details: {
          designation,
          site: activeSite?.name || DEFAULT_SITE.name
        }
      });

      announceOperationChange();
      setActiveOperation(operation);
      setMissionPlan((current) => current ? { ...current, status: 'ACTIVE', operation_id: operation.id, started_at: new Date().toISOString() } : current);
      setMessage(`MISSION ACTIVE // ${designation.toUpperCase()}`);
    } catch (actionError) {
      console.error('[MISSION CONSOLE] Initiate failed:', actionError);
      setError(actionError.message || 'Mission could not be initiated.');
    } finally {
      setBusyAction('');
    }
  }

  async function recordCaptureEvent(eventType, eventLabel, details = {}) {
    if (!activeOperation?.id) return;
    await recordOperationEvent({
      operation: activeOperation,
      eventType,
      eventLabel,
      resourceType: 'mission_console',
      resourceId: missionPlan?.id || activeOperation.id,
      resourceName: missionPlan?.target_title || activeOperation.target || 'Mission Console',
      details,
      session
    });
  }

  async function handleBeginOrResumeCapture() {
    if (!isOperationLive || !activeOperation?.id) {
      setError('Initiate the mission first so the console can attach capture events to an active operation.');
      return;
    }

    const nowIso = new Date().toISOString();
    const wasPaused = consoleState.captureStatus === 'paused';

    setConsoleState((current) => ({
      ...current,
      captureStatus: 'running',
      captureStartedAt: current.captureStartedAt || nowIso,
      captureResumeAt: nowIso
    }));

    setMessage(wasPaused ? 'CAPTURE RESUMED' : 'CAPTURE STARTED');
    setError('');

    await recordCaptureEvent(
      wasPaused ? 'CAPTURE_RESUMED' : 'CAPTURE_STARTED',
      wasPaused ? 'CAPTURE RESUMED' : 'CAPTURE STARTED',
      {
        completedFrames: Number(consoleState.completedFrames || 0),
        capturePlan: missionPlan?.capture_plan || targetReference?.capturePlan || ''
      }
    );
  }

  async function handlePauseCapture() {
    if (consoleState.captureStatus !== 'running') return;
    const elapsed = captureElapsedMs;
    setConsoleState((current) => ({
      ...current,
      captureStatus: 'paused',
      captureAccumulatedMs: elapsed,
      captureResumeAt: null,
      captureStartedAt: current.captureStartedAt || new Date().toISOString()
    }));

    setMessage('CAPTURE PAUSED');
    setError('');

    await recordCaptureEvent('CAPTURE_PAUSED', 'CAPTURE PAUSED', {
      completedFrames: Number(consoleState.completedFrames || 0),
      elapsed: captureElapsed
    });
  }

  async function handleMissionComplete() {
    if (!isOperationLive || !activeOperation?.id) {
      setError('No active mission is currently armed in the console.');
      return;
    }

    setBusyAction('complete');
    setError('');
    setMessage('');

    try {
      const endedAt = new Date().toISOString();
      const { data: completedOperation, error: operationError } = await supabase
        .from('crew_operations')
        .update({
          status: 'COMPLETE',
          ended_at: endedAt,
          ended_by_user_id: session.user.id,
          ended_by_email: session.user.email || '',
          ended_by_name: crew?.name || session.user.email || 'CuzBro Crew'
        })
        .eq('id', activeOperation.id)
        .eq('status', 'ACTIVE')
        .select('*')
        .single();

      if (operationError) throw operationError;

      if (missionPlan?.id) {
        await supabase
          .from('mission_plans')
          .update({ status: 'COMPLETE' })
          .eq('id', missionPlan.id);
      }

      const finalCaptureElapsed = captureElapsedMs;
      const totalFrames = Number(consoleState.completedFrames || 0);

      await recordOperationEvent({
        operation: completedOperation,
        eventType: 'MISSION_CONSOLE_COMPLETE',
        eventLabel: 'MISSION COMPLETE',
        resourceType: 'mission_console',
        resourceId: missionPlan?.id || completedOperation.id,
        resourceName: missionPlan?.target_title || completedOperation.target || 'Mission Console',
        details: {
          completedFrames: totalFrames,
          captureDurationSeconds: Math.round(finalCaptureElapsed / 1000),
          capturePlan: missionPlan?.capture_plan || targetReference?.capturePlan || '',
          notes: consoleState.notes || ''
        },
        session
      });

      await logCrewActivity({
        action: 'MISSION_CONSOLE_COMPLETED',
        category: 'OPERATION',
        resourceType: 'operation',
        resourceId: completedOperation.id,
        resourceName: completedOperation.designation,
        details: {
          completedFrames: totalFrames,
          captureDurationSeconds: Math.round(finalCaptureElapsed / 1000)
        }
      });

      setConsoleState((current) => ({
        ...current,
        captureStatus: 'complete',
        captureAccumulatedMs: finalCaptureElapsed,
        captureResumeAt: null
      }));
      announceOperationChange();
      setActiveOperation(completedOperation);
      setMissionPlan((current) => current ? { ...current, status: 'COMPLETE' } : current);
      setMessage(`MISSION COMPLETE // ${completedOperation.designation.toUpperCase()}`);
    } catch (actionError) {
      console.error('[MISSION CONSOLE] Complete failed:', actionError);
      setError(actionError.message || 'Mission could not be completed.');
    } finally {
      setBusyAction('');
    }
  }

  const togglePanel = (panelName) => {
    setOpenPanels((current) => ({ ...current, [panelName]: !current[panelName] }));
  };

  const setAllPanels = (isOpen) => {
    setOpenPanels({
      target: isOpen,
      conditions: isOpen,
      systems: isOpen,
      recommendation: isOpen,
      history: isOpen,
      operations: isOpen
    });
  };

  const statusToneClass = {
    ACTIVE: 'active',
    PLANNED: 'standby',
    COMPLETE: 'complete'
  }[missionPlan?.status] || 'standby';

  return (
    <section className="missionConsoleWrap">
      <div className="missionConsoleFrame">
        <div className="missionConsoleLeftRail" aria-hidden="true">
          <span className="missionConsoleRailLarge" />
          <span className="missionConsoleRailAccent" />
          <span className="missionConsoleRailMini" />
        </div>

        <div className="missionConsoleMain">
          <header className="missionConsoleHeader">
            <div className="missionConsoleAccessHeader">
              <div className="missionConsoleAccessCode">
                <span>LCARS 40274</span>
                <strong>CZB-01</strong>
              </div>
              <div className="missionConsoleAccessMatrix" aria-hidden="true">
                <span>2385 8578232 5789 3882 5893 9885 3489 3465</span>
                <span>2064 2064962 7976 626 1276 7812 126 97</span>
                <span>4768 8967248 79798 8969 476 9047 8476</span>
              </div>
              <div className="missionConsoleAccessTitle">
                <small>CUZBRO OBSERVATORY</small>
                <strong>LCARS ACCESS 44</strong>
              </div>
            </div>

            <div className="missionConsoleHeaderBlock missionConsoleHeaderBlockPrimary">
              <span className="missionConsoleEyebrow">LCARS // CZB-01 // MISSION CONSOLE</span>
              <h1>Mission Console</h1>
              <p>
                Select a subsystem below. All data nodes initialize in compact mode.
              </p>
            </div>

            <div className="missionConsoleHeaderBlock missionConsoleHeaderBlockMeta">
              <div className="missionConsoleMetaPill">
                <strong>{activeSite?.name || DEFAULT_SITE.name}</strong>
                <span>OBSERVING SITE</span>
              </div>
              <div className="missionConsoleMetaPill">
                <strong>{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</strong>
                <span>LOCAL TIME</span>
              </div>
              <div className={`missionConsoleMetaPill missionConsoleStatusPill missionConsoleStatusPill-${statusToneClass}`}>
                <strong>{missionPlan?.status || 'STANDBY'}</strong>
                <span>MISSION STATUS</span>
              </div>
            </div>
          </header>

          {message ? <div className="missionConsoleNotice missionConsoleNoticeSuccess">{message}</div> : null}
          {error ? <div className="missionConsoleNotice missionConsoleNoticeError">{error}</div> : null}

          <section className={`missionConsoleBridgeMenu ${bridgeMenuOpen ? 'is-open' : 'is-collapsed'}`}>
            <button type="button" className="missionConsoleBridgeIntro" onClick={() => setBridgeMenuOpen((current) => !current)} aria-expanded={bridgeMenuOpen}>
              <span>OPS MENU //</span>
              <strong>{missionPlan?.target_title || targetReference?.title || 'NO TARGET LOCK'}</strong>
              <em>{captureHistorySummary.count ? `${captureHistorySummary.count} HISTORICAL CAPTURES AVAILABLE` : 'NO MISSION HISTORY ON FILE'}</em>
              <ChevronDown className="missionConsoleCollapseChevron" size={20} />
            </button>

            <div className="missionConsoleBridgeLinks">
              <a href="/admin/missions" className="missionConsoleBridgeLink missionConsoleBridgeLinkPrimary"><Radar size={16} /><span>OPEN MISSIONS</span><ChevronRight size={16} /></a>
              <a href="/admin/operation" className="missionConsoleBridgeLink missionConsoleBridgeLinkSecondary"><Activity size={16} /><span>OPERATION CONTROL</span><ChevronRight size={16} /></a>
              <a href="/admin/gallery" className="missionConsoleBridgeLink missionConsoleBridgeLinkTertiary"><Archive size={16} /><span>CAPTURE RECORDS</span><ChevronRight size={16} /></a>
              <a href="/admin/comms" className="missionConsoleBridgeLink missionConsoleBridgeLinkQuaternary"><SquareTerminal size={16} /><span>CREW COMMS</span><ChevronRight size={16} /></a>
            </div>

            <div className="missionConsoleBridgeReadouts">
              <div className="missionConsoleBridgeReadout"><span>CREW AUTH</span><strong>{crew?.callSign || 'CREW READY'}</strong></div>
              <div className="missionConsoleBridgeReadout"><span>MISSION MEMORY</span><strong>{captureHistorySummary.structuredCount} STRUCTURED LOGS</strong></div>
              <div className="missionConsoleBridgeReadout"><span>BASELINE SOURCE</span><strong>{lastCapture ? 'FIELD HISTORY' : 'RECOMMENDED PROFILE'}</strong></div>
              <div className={`missionConsoleBridgeReadout missionConsoleBridgeReadout-${localSystemsStatus}`}><span>LOCAL LINK</span><strong>{localSystemsStatus.toUpperCase()}</strong></div>
            </div>
          </section>

          <nav className="missionConsoleLcarsStrip" aria-label="Mission console section controls">
            <button type="button" className="missionConsoleLcarsMaster missionConsoleLcarsExpand" onClick={() => setAllPanels(true)}>EXPAND ALL</button>
            <button type="button" className="missionConsoleLcarsMaster missionConsoleLcarsCompact" onClick={() => setAllPanels(false)}>COMPACT MODE</button>
            {[
              ['target', 'TARGET', 'missionConsoleLcarsTarget'],
              ['conditions', 'CONDITIONS', 'missionConsoleLcarsConditions'],
              ['systems', 'LOCAL SYSTEMS', 'missionConsoleLcarsSystems'],
              ['recommendation', 'RECOMMENDATION', 'missionConsoleLcarsRecommendation'],
              ['history', 'HISTORY', 'missionConsoleLcarsHistory'],
              ['operations', 'OPERATIONS', 'missionConsoleLcarsOperations']
            ].map(([panelName, label, colorClass]) => (
              <button
                type="button"
                key={panelName}
                className={`missionConsoleLcarsTab ${colorClass} ${openPanels[panelName] ? 'is-active' : ''}`}
                onClick={() => togglePanel(panelName)}
                aria-pressed={openPanels[panelName]}
              >
                <span>{label}</span>
                <ChevronDown size={16} />
              </button>
            ))}
          </nav>

          <div className="missionConsoleGrid">
            <section className={`missionConsolePanel missionConsolePanelTarget ${openPanels.target ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('target')} aria-expanded={openPanels.target}>
                <span>TARGET PROFILE</span>
                <div className="missionConsolePanelBadge">PRIMARY OBJECTIVE</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleTargetHeading">
                <div>
                  <small>{missionPlan?.target_type || targetReference?.objectType || 'UNASSIGNED TARGET'}</small>
                  <h2>{missionPlan?.target_title || targetReference?.title || 'Awaiting Mission Assignment'}</h2>
                </div>
                <div className="missionConsoleDesignationBox">
                  <span>DESIGNATION</span>
                  <strong>{activeOperation?.designation || 'READY ROOM'}</strong>
                </div>
              </div>

              <div className="missionConsoleObjectiveBox">
                <strong>{missionPlan?.primary_objective || targetReference?.objective || 'Accept a mission in Open Missions to populate this console.'}</strong>
                <span>{missionPlan?.observing_window || (telemetry?.visibilityStart ? `VISIBLE ${formatClock(telemetry.visibilityStart)} - ${formatClock(telemetry.visibilityEnd)}` : 'Visibility telemetry standing by.')}</span>
              </div>

              <div className="missionConsoleMetricGrid">
                <div className="missionConsoleMetricCard">
                  <span>ALTITUDE</span>
                  <strong>{formatDecimal(telemetry?.altitude, 1, '°')}</strong>
                </div>
                <div className="missionConsoleMetricCard">
                  <span>AZIMUTH</span>
                  <strong>{formatDecimal(telemetry?.azimuth, 1, '°')}</strong>
                </div>
                <div className="missionConsoleMetricCard">
                  <span>TRANSIT</span>
                  <strong>{formatClock(telemetry?.transit)}</strong>
                </div>
                <div className="missionConsoleMetricCard">
                  <span>MAX ALT</span>
                  <strong>{formatDecimal(telemetry?.maxAltitude, 0, '°')}</strong>
                </div>
                <div className="missionConsoleMetricCard">
                  <span>RISE</span>
                  <strong>{formatClock(telemetry?.rise)}</strong>
                </div>
                <div className="missionConsoleMetricCard">
                  <span>SET</span>
                  <strong>{formatClock(telemetry?.set)}</strong>
                </div>
              </div>
            </section>

            <section className={`missionConsolePanel missionConsolePanelTelemetry ${openPanels.conditions ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('conditions')} aria-expanded={openPanels.conditions}>
                <span>SITE CONDITIONS</span>
                <div className={`missionConsolePanelBadge missionConsolePanelBadge-${weatherRating.tone}`}>{weatherRating.label}</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleStatusLine">
                <div className="missionConsoleStatusCopy">
                  <strong>{weatherRating.label}</strong>
                  <p>{weatherRating.detail}</p>
                </div>
                <div className={`missionConsoleDewRisk missionConsoleDewRisk-${String(dewRisk).toLowerCase()}`}>
                  <span>DEW RISK</span>
                  <strong>{dewRisk}</strong>
                </div>
              </div>

              <div className="missionConsoleMetricGrid missionConsoleMetricGridCompact">
                <div className="missionConsoleMetricCard missionConsoleMetricCardIcon"><Cloud size={18} /><span>CLOUDS</span><strong>{weather ? `${Math.round(weather.cloud_cover ?? 0)}%` : '—'}</strong></div>
                <div className="missionConsoleMetricCard missionConsoleMetricCardIcon"><Wind size={18} /><span>WIND</span><strong>{weather ? `${Math.round(weather.wind_speed_10m ?? 0)} mph` : '—'}</strong></div>
                <div className="missionConsoleMetricCard missionConsoleMetricCardIcon"><Droplets size={18} /><span>HUMIDITY</span><strong>{weather ? `${Math.round(weather.relative_humidity_2m ?? 0)}%` : '—'}</strong></div>
                <div className="missionConsoleMetricCard missionConsoleMetricCardIcon"><Gauge size={18} /><span>TEMP</span><strong>{weather ? `${Math.round(weather.temperature_2m ?? 0)}°F` : '—'}</strong></div>
              </div>
            </section>

            <section className={`missionConsolePanel missionConsolePanelSystems ${openPanels.systems ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('systems')} aria-expanded={openPanels.systems}>
                <span>LOCAL SYSTEMS LINK</span>
                <div className={`missionConsolePanelBadge missionConsolePanelBadge-${systemsLinkTone}`}>{systemsLinkLabel}</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleLocalLinkHeader">
                <div>
                  <small>OBSERVATORY TELEMETRY LINKS</small>
                  <strong>{localSystemsStatus === 'online' ? 'LOCAL MOUNT LINK ESTABLISHED' : hbg3Online ? 'HBG3 CLOUD LINK ESTABLISHED' : 'LOCAL DATA LINK NOT ESTABLISHED'}</strong>
                  <span>{localSystemsStatus === 'online'
                    ? `Mount updated ${localSystemsUpdatedAt?.toLocaleTimeString() || 'now'}`
                    : hbg3Online
                      ? `Dew telemetry updated ${new Date(hbg3Record.captured_at).toLocaleTimeString()}`
                      : localSystemsError || hbg3Error || 'Start the CuzBro Local Bridge on the CPWI computer.'}</span>
                </div>
                <label>
                  <span>BRIDGE URL</span>
                  <input value={localBridgeUrl} onChange={(event) => { const value = event.target.value; setLocalBridgeUrl(value); try { localStorage.setItem('cuzbro-local-bridge-url', value); } catch {} }} />
                </label>
              </div>

              <div className="missionConsoleSystemsGrid">
                <article className="missionConsoleSystemNode">
                  <div className="missionConsoleSystemNodeTitle"><Cpu size={18} /><span>CPWI / ASCOM MOUNT</span></div>
                  <div className="missionConsoleSystemMetrics">
                    <div><span>CONNECTION</span><strong>{localSystems?.cpwi?.connected ? 'ONLINE' : 'OFFLINE'}</strong></div>
                    <div><span>TRACKING</span><strong>{bridgeBoolean(localSystems?.cpwi?.tracking)}</strong></div>
                    <div><span>SLEWING</span><strong>{bridgeBoolean(localSystems?.cpwi?.slewing)}</strong></div>
                    <div><span>PARKED</span><strong>{bridgeBoolean(localSystems?.cpwi?.parked)}</strong></div>
                    <div><span>RA</span><strong>{bridgeNumber(localSystems?.cpwi?.rightAscensionHours, 4, 'h')}</strong></div>
                    <div><span>DEC</span><strong>{bridgeNumber(localSystems?.cpwi?.declinationDegrees, 3, '°')}</strong></div>
                    <div><span>ALTITUDE</span><strong>{bridgeNumber(localSystems?.cpwi?.altitudeDegrees, 2, '°')}</strong></div>
                    <div><span>AZIMUTH</span><strong>{bridgeNumber(localSystems?.cpwi?.azimuthDegrees, 2, '°')}</strong></div>
                  </div>

                  <div className="missionConsoleMountControls" aria-label="CPWI mount controls">
                    <button type="button" disabled={Boolean(cpwiControlBusy) || localSystems?.cpwi?.connected} onClick={() => runCpwiControl('connect')}>CONNECT</button>
                    <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected} onClick={() => runCpwiControl('disconnect')}>DISCONNECT</button>
                    <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || localSystems?.cpwi?.tracking === true} onClick={() => runCpwiControl('trackingOn')}>TRACKING ON</button>
                    <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || localSystems?.cpwi?.tracking === false} onClick={() => runCpwiControl('trackingOff')}>TRACKING OFF</button>
                    <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || localSystems?.cpwi?.slewing} onClick={() => runCpwiControl('park')}>PARK</button>
                    <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || !localSystems?.cpwi?.parked} onClick={() => runCpwiControl('unpark')}>UNPARK</button>
                    <button type="button" className="is-emergency" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected} onClick={() => runCpwiControl('abortSlew')}>ABORT SLEW</button>
                  </div>
                  {cpwiControlBusy ? <div className="missionConsoleMountControlMessage">COMMAND IN PROGRESS // {cpwiControlBusy.toUpperCase()}</div> : null}
                  {cpwiControlError ? <div className="missionConsoleMountControlMessage is-error">{cpwiControlError}</div> : null}
                </article>

                <article className="missionConsoleSystemNode">
                  <div className="missionConsoleSystemNodeTitle"><Thermometer size={18} /><span>DEW CONTROL</span></div>
                  <div className="missionConsoleSystemMetrics">
                    <div><span>HBG3 LINK</span><strong>{hbg3Online ? 'ONLINE' : hbg3Record ? 'STALE' : 'OFFLINE'}</strong></div>
                    <div><span>AMBIENT</span><strong>{bridgeNumber(hbg3Environment?.ambientC, 1, '°C')}</strong></div>
                    <div><span>HUMIDITY</span><strong>{bridgeNumber(hbg3Environment?.humidityPercent, 0, '%')}</strong></div>
                    <div><span>DEW POINT</span><strong>{bridgeNumber(hbg3Environment?.dewPointC, 1, '°C')}</strong></div>
                    <div><span>DEW MARGIN</span><strong>{bridgeNumber(hbg3Environment?.dewMarginC, 1, '°C')}</strong></div>
                    <div><span>HEATER OUTPUT</span><strong>{bridgeNumber(hbg3Channel1?.pwmPercent, 0, '%')}</strong></div>
                    <div><span>CONTROL MODE</span><strong>{hbg3Channel1 ? hbg3ControlMode : '—'}</strong></div>
                    <div><span>RISK STATE</span><strong>{hbg3RiskState}</strong></div>
                    <div><span>RING TEMP</span><strong>{hbg3Sensor1 ? bridgeNumber(hbg3Channel1?.temperatureC, 1, '°C') : '—'}</strong></div>
                    <div><span>CURRENT DRAW</span><strong>{bridgeNumber(hbg3Channel1?.amps, 2, ' A')}</strong></div>
                    <div><span>SUPPLY</span><strong>{bridgeNumber(hbg3Environment?.supplyVolts, 2, ' V')}</strong></div>
                    <div><span>LAST UPDATE</span><strong>{hbg3Record?.captured_at ? new Date(hbg3Record.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}</strong></div>
                  </div>
                </article>

                <article className="missionConsoleSystemNode missionConsoleSystemNodeWide">
                  <div className="missionConsoleSystemNodeTitle"><Radio size={18} /><span>BRIDGE DIAGNOSTICS</span></div>
                  <div className="missionConsoleSystemDiagnostics">
                    <span><Wifi size={15} /> {localSystems?.bridge?.host || 'LOCALHOST'} // {localSystems?.bridge?.version || 'BRIDGE NOT DETECTED'}</span>
                    <span>ASCOM: {localSystems?.cpwi?.driver || 'NOT REPORTED'}</span>
                    <span>HBG3: {hbg3Online ? 'SUPABASE RELAY ONLINE' : hbg3Error ? `ERROR // ${hbg3Error}` : hbg3Record ? 'TELEMETRY STALE' : 'NOT REPORTED'}</span>
                    {localSystems?.warnings?.length ? <span className="missionConsoleSystemWarning">{localSystems.warnings.join(' // ')}</span> : null}
                  </div>
                </article>
              </div>
            </section>

            <section className={`missionConsolePanel missionConsolePanelEquipment ${openPanels.recommendation ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('recommendation')} aria-expanded={openPanels.recommendation}>
                <span>CONFIGURATION</span>
                <div className="missionConsolePanelBadge">SYSTEM PROFILE</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleSettingsSource missionConsoleRecommendationHeader">
                <span>CHATGPT MISSION RECOMMENDATION</span>
                <strong>RECOMMENDED BASELINE FOR THIS TARGET, EQUIPMENT, MOUNT, AND CURRENT CONDITIONS</strong>
              </div>

              <div className="missionConsoleRecommendationGrid">
                <div><span>EXPOSURE / FRAME</span><strong>{missionRecommendation.exposureSeconds} SEC</strong></div>
                <div><span>FRAMES TO CAPTURE</span><strong>{missionRecommendation.frameCount}</strong></div>
                <div><span>CAMERA GAIN</span><strong>{missionRecommendation.gain}</strong></div>
                <div><span>TOTAL INTEGRATION</span><strong>{Math.round(missionRecommendation.totalIntegrationSeconds / 60)} MIN</strong></div>
              </div>

              <div className="missionConsoleRecommendationReasoning">
                <Settings2 size={18} />
                <div>
                  <span>WHY THESE SETTINGS</span>
                  <strong>{missionRecommendation.rationale}</strong>
                  {missionRecommendation.adjustments.length ? (
                    <ul>
                      {missionRecommendation.adjustments.map((adjustment) => <li key={adjustment}>{adjustment}</li>)}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="missionConsoleStacks">
                <div className="missionConsoleStackItem">
                  <small>RECOMMENDED EQUIPMENT CONFIGURATION</small>
                  <strong>{missionRecommendation.equipment}</strong>
                </div>
              </div>

              {lastCapture ? (
                <div className="missionConsoleLastCaptureCompare">
                  <div className="missionConsoleLastCaptureCompareHeader">
                    <div>
                      <span>LAST FIELD SETTINGS</span>
                      <strong>{lastCapture.title} // {formatDateLabel(lastCapture.capture_date)}</strong>
                    </div>
                    <em>{missionRecommendation.differsFromLast ? 'RECOMMENDATION ADJUSTED' : 'MATCHES RECOMMENDATION'}</em>
                  </div>

                  <div className="missionConsoleHistoryGrid">
                    <div><span>EXPOSURE / FRAME</span><strong>{lastCapture.exposure_seconds != null ? `${lastCapture.exposure_seconds} SEC` : lastCapture.exposure || 'TBD'}</strong></div>
                    <div><span>FRAMES</span><strong>{lastCapture.frame_count ?? 'TBD'}</strong></div>
                    <div><span>GAIN</span><strong>{lastCapture.gain ?? 'TBD'}</strong></div>
                    <div><span>TOTAL INTEGRATION</span><strong>{lastCapture.total_integration_seconds ? `${Math.round(lastCapture.total_integration_seconds / 60)} MIN` : 'TBD'}</strong></div>
                  </div>

                  <div className="missionConsoleStackItem">
                    <small>LAST-CAPTURE NOTES</small>
                    <strong>{lastCapture.notes || lastCapture.processing || 'No notes were recorded for the previous capture.'}</strong>
                  </div>
                </div>
              ) : (
                <div className="missionConsoleRecommendationNoHistory">
                  <DatabaseZap size={18} />
                  <span>No prior capture exists for this target. This recommendation is the starting baseline and should be adjusted after the first test frame.</span>
                </div>
              )}

              <div className="missionConsoleQuickLinksRow">
                <QuickLink href="/admin/missions" label="OPEN MISSIONS" />
                <QuickLink href="/admin/operation" label="OPERATION CONTROL" />
                <QuickLink href="/admin/gallery" label="CAPTURE CONTROL" />
              </div>
            </section>

            <section className={`missionConsolePanel missionConsolePanelHistory ${openPanels.history ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('history')} aria-expanded={openPanels.history}>
                <span>HISTORICAL CAPTURE BANK</span>
                <div className="missionConsolePanelBadge">MISSION MEMORY</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleHistorySummary">
                <div className="missionConsoleHistorySummaryCard"><span>CAPTURES LOGGED</span><strong>{captureHistorySummary.count || 0}</strong></div>
                <div className="missionConsoleHistorySummaryCard"><span>AVG EXPOSURE</span><strong>{captureHistorySummary.averageExposure != null ? `${captureHistorySummary.averageExposure.toFixed(1)} SEC` : '—'}</strong></div>
                <div className="missionConsoleHistorySummaryCard"><span>AVG FRAMES</span><strong>{captureHistorySummary.averageFrames != null ? `${Math.round(captureHistorySummary.averageFrames)}` : '—'}</strong></div>
                <div className="missionConsoleHistorySummaryCard"><span>AVG GAIN</span><strong>{captureHistorySummary.averageGain != null ? `${Math.round(captureHistorySummary.averageGain)}` : '—'}</strong></div>
                <div className="missionConsoleHistorySummaryCard"><span>AVG TOTAL INT</span><strong>{captureHistorySummary.averageIntegration != null ? `${Math.round(captureHistorySummary.averageIntegration / 60)} MIN` : '—'}</strong></div>
              </div>

              {captureHistory.length ? (
                <div className="missionConsoleHistoryList">
                  {captureHistory.slice(0, 6).map((capture, index) => (
                    <article className={`missionConsoleHistoryRow ${index === 0 ? 'missionConsoleHistoryRowCurrent' : ''}`} key={capture.id || `${capture.title}-${capture.capture_date}-${index}`}>
                      <div className="missionConsoleHistoryRowHeading">
                        <strong>{capture.title}</strong>
                        <span>{formatDateLabel(capture.capture_date)}</span>
                      </div>
                      <div className="missionConsoleHistoryRowMetrics">
                        <span>{capture.exposure_seconds != null ? `${capture.exposure_seconds} SEC` : capture.exposure || 'EXP TBD'}</span>
                        <span>{capture.frame_count != null ? `${capture.frame_count} FRAMES` : 'FRAMES TBD'}</span>
                        <span>{capture.gain != null ? `GAIN ${capture.gain}` : 'GAIN TBD'}</span>
                        <span>{capture.total_integration_seconds ? `${Math.round(capture.total_integration_seconds / 60)} MIN TOTAL` : 'TOTAL TBD'}</span>
                      </div>
                      <p>{capture.notes || capture.processing || 'No additional crew notes logged for this capture.'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="missionConsoleHistoryEmpty">
                  <DatabaseZap size={18} />
                  <span>No historical captures matched this target yet. Once captures are logged with structured settings, they will appear here automatically.</span>
                </div>
              )}
            </section>

            <section className={`missionConsolePanel missionConsolePanelOperations ${openPanels.operations ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('operations')} aria-expanded={openPanels.operations}>
                <span>MISSION OPERATIONS</span>
                <div className="missionConsolePanelBadge">LIVE CONTROL</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleOpsTop">
                <div className="missionConsoleTimerBlock">
                  <small>MISSION ELAPSED</small>
                  <strong>{activeOperation?.started_at || missionPlan?.started_at ? missionElapsed : '00:00:00'}</strong>
                </div>
                <div className="missionConsoleTimerBlock missionConsoleTimerBlockSecondary">
                  <small>CAPTURE ELAPSED</small>
                  <strong>{consoleState.captureStartedAt ? captureElapsed : '00:00:00'}</strong>
                </div>
                <div className="missionConsoleTimerBlock missionConsoleTimerBlockStatus">
                  <small>CAPTURE STATE</small>
                  <strong>{String(consoleState.captureStatus || 'idle').toUpperCase()}</strong>
                </div>
              </div>

              <div className="missionConsoleFramesSection">
                <label className="missionConsoleFramesInput">
                  <span>COMPLETED FRAMES</span>
                  <input
                    type="number"
                    min="0"
                    value={Number(consoleState.completedFrames || 0)}
                    onChange={(event) => setConsoleState((current) => ({ ...current, completedFrames: Number(event.target.value || 0) }))}
                  />
                </label>

                <div className="missionConsoleProgressBlock">
                  <div className="missionConsoleProgressHeader">
                    <span>PLAN PROGRESS</span>
                    <strong>{frameTarget ? `${consoleState.completedFrames}/${frameTarget}` : `${consoleState.completedFrames} FRAMES`}</strong>
                  </div>
                  <div className="missionConsoleProgressBar" role="progressbar" aria-valuemin={0} aria-valuemax={frameTarget || 100} aria-valuenow={frameTarget ? consoleState.completedFrames : progressPercent}>
                    <div style={{ width: `${frameTarget ? progressPercent : Math.min(100, Number(consoleState.completedFrames || 0))}%` }} />
                  </div>
                </div>
              </div>

              <label className="missionConsoleNotesField">
                <span>CREW NOTES</span>
                <textarea
                  value={consoleState.notes}
                  onChange={(event) => setConsoleState((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Seeing, focus, clouds, guiding, target notes, or weird telescope behavior..."
                />
              </label>

              <div className="missionConsoleActionGrid">
                <button
                  type="button"
                  className="missionConsoleAction missionConsoleActionInitiate"
                  onClick={handleInitiateMission}
                  disabled={loading || busyAction === 'initiate' || !missionPlan?.id || isOperationLive}
                >
                  <Radar size={20} />
                  <span>{busyAction === 'initiate' ? 'INITIATING…' : isOperationLive ? 'MISSION ACTIVE' : 'INITIATE MISSION'}</span>
                </button>

                <button
                  type="button"
                  className="missionConsoleAction missionConsoleActionStart"
                  onClick={handleBeginOrResumeCapture}
                  disabled={!isOperationLive || consoleState.captureStatus === 'running' || busyAction === 'complete'}
                >
                  <PlayCircle size={20} />
                  <span>{consoleState.captureStatus === 'paused' ? 'RESUME CAPTURE' : 'BEGIN CAPTURE'}</span>
                </button>

                <button
                  type="button"
                  className="missionConsoleAction missionConsoleActionPause"
                  onClick={handlePauseCapture}
                  disabled={consoleState.captureStatus !== 'running' || busyAction === 'complete' || !isOperationLive}
                >
                  <PauseCircle size={20} />
                  <span>PAUSE CAPTURE</span>
                </button>

                <button
                  type="button"
                  className="missionConsoleAction missionConsoleActionComplete"
                  onClick={handleMissionComplete}
                  disabled={!isOperationLive || busyAction === 'complete'}
                >
                  <CheckCircle2 size={20} />
                  <span>{busyAction === 'complete' ? 'COMPLETING…' : 'MISSION COMPLETE'}</span>
                </button>
              </div>
            </section>
          </div>

          <footer className="missionConsoleFooterBar">
            <div className="missionConsoleFooterSegment"><Compass size={16} /><span>{activeSite?.name || DEFAULT_SITE.name}</span></div>
            <div className="missionConsoleFooterSegment"><Activity size={16} /><span>{crew?.callSign || 'CREW READY'}{crew?.role ? ` // ${crew.role}` : ''}</span></div>
            <div className="missionConsoleFooterSegment"><SquareTerminal size={16} /><span>{missionPlan?.status || 'STANDBY'} // {activeOperation?.target || missionPlan?.target_title || 'NO TARGET LOCK'}</span></div>
            <div className="missionConsoleFooterSegment"><TimerReset size={16} /><span>{loading ? 'SYNCING CONSOLE' : 'CONSOLE ONLINE'}</span></div>
            {error ? <div className="missionConsoleFooterSegment missionConsoleFooterSegmentAlert"><AlertTriangle size={16} /><span>ATTENTION REQUIRED</span></div> : null}
          </footer>
        </div>
      </div>
    </section>
  );
}
