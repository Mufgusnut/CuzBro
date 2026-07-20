import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Compass,
  Cpu,
  Crosshair,
  DatabaseZap,
  Droplets,
  Gauge,
  Focus,
  PauseCircle,
  Radio,
  RefreshCw,
  Sparkles,
  PlayCircle,
  Radar,
  Settings2,
  SquareTerminal,
  Thermometer,
  TimerReset,
  Wifi,
  WifiOff,
  Maximize2,
  Minimize2,
  Sun,
  Wind,
  X
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

const CPWI_SLEW_TARGETS = [
  { id: 'm13', name: 'M13 // Hercules Cluster', ra: 16.6949, dec: 36.4602 },
  { id: 'm27', name: 'M27 // Dumbbell Nebula', ra: 19.9934, dec: 22.7210 },
  { id: 'm57', name: 'M57 // Ring Nebula', ra: 18.8931, dec: 33.0292 },
  { id: 'm31', name: 'M31 // Andromeda Galaxy', ra: 0.7123, dec: 41.2692 },
  { id: 'm42', name: 'M42 // Orion Nebula', ra: 5.5881, dec: -5.3911 },
  { id: 'm51', name: 'M51 // Whirlpool Galaxy', ra: 13.4979, dec: 47.1952 },
  { id: 'm8', name: 'M8 // Lagoon Nebula', ra: 18.0615, dec: -24.3867 },
  { id: 'ngc6543', name: "NGC 6543 // Cat's Eye Nebula", ra: 17.9759, dec: 66.6332 },
  { id: 'albireo', name: 'Albireo // Beta Cygni', ra: 19.5120, dec: 27.9597 },
  { id: 'manual', name: 'MANUAL COORDINATES', ra: null, dec: null }
];

const STORAGE_PREFIX = 'cuzbro-mission-console-v1';

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

function bridgeNumber(value, digits = 1, suffix = '') {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function celsiusToFahrenheit(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null;
  return (Number(value) * 9 / 5) + 32;
}

function celsiusDeltaToFahrenheit(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null;
  return Number(value) * 9 / 5;
}

function formatEta(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '—';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total < 60) return `${total} SEC`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.ceil((total % 3600) / 60);
  return hours ? `${hours} HR ${minutes} MIN` : `${minutes} MIN`;
}

function bridgeBoolean(value) {
  if (value === true) return 'ON';
  if (value === false) return 'OFF';
  return '—';
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
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported] = useState(() => 'wakeLock' in navigator);
  const [localSystems, setLocalSystems] = useState(null);
  const [localSystemsStatus, setLocalSystemsStatus] = useState('connecting');
  const [localSystemsError, setLocalSystemsError] = useState('');
  const [localSystemsUpdatedAt, setLocalSystemsUpdatedAt] = useState(null);
  const [cpwiControlBusy, setCpwiControlBusy] = useState('');
  const [cpwiControlError, setCpwiControlError] = useState('');
  const [cpwiMountTab, setCpwiMountTab] = useState('status');
  const [focuserRecord, setFocuserRecord] = useState(null);
  const [focuserStatus, setFocuserStatus] = useState('connecting');
  const [focuserError, setFocuserError] = useState('');
  const [focuserControlBusy, setFocuserControlBusy] = useState('');
  const [focuserControlError, setFocuserControlError] = useState('');
  const [focuserControlMessage, setFocuserControlMessage] = useState('');
  const [focuserStepSize, setFocuserStepSize] = useState(100);
  const [focuserTargetPosition, setFocuserTargetPosition] = useState('');
  const [selectedSlewTarget, setSelectedSlewTarget] = useState('m13');
  const [manualSlewRa, setManualSlewRa] = useState('');
  const [manualSlewDec, setManualSlewDec] = useState('');
  const [slewClearanceConfirmed, setSlewClearanceConfirmed] = useState(false);
  const [nudgeRate, setNudgeRate] = useState('fine');
  const [nudgeDurationMs, setNudgeDurationMs] = useState(350);
  const [hbg3Record, setHbg3Record] = useState(null);
  const [hbg3Error, setHbg3Error] = useState('');
  const [asiairRecord, setAsiairRecord] = useState(null);
  const [asiairError, setAsiairError] = useState('');
  const [asiairControlBusy, setAsiairControlBusy] = useState('');
  const [asiairControlError, setAsiairControlError] = useState('');
  const [asiairControlMessage, setAsiairControlMessage] = useState('');
  const [asiairGainInput, setAsiairGainInput] = useState('120');
  const [dewControlMode, setDewControlMode] = useState('auto');
  const [dewAggression, setDewAggression] = useState(5);
  const [dewManualOutput, setDewManualOutput] = useState(35);
  const [dewControlBusy, setDewControlBusy] = useState('');
  const [dewControlError, setDewControlError] = useState('');
  const [dewControlMessage, setDewControlMessage] = useState('');
  const [dewControlDirty, setDewControlDirty] = useState(false);
  const [dewAppliedTarget, setDewAppliedTarget] = useState(null);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiRecommendationBusy, setAiRecommendationBusy] = useState(false);
  const [aiRecommendationError, setAiRecommendationError] = useState('');
  const [aiRecommendationUpdatedAt, setAiRecommendationUpdatedAt] = useState(null);
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
    const media = window.matchMedia?.('(display-mode: standalone)');
    const syncDisplayMode = () => setIsStandaloneMode(Boolean(media?.matches || window.navigator.standalone === true));
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));

    syncDisplayMode();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('fullscreenchange', handleFullscreen);
    media?.addEventListener?.('change', syncDisplayMode);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      media?.removeEventListener?.('change', syncDisplayMode);
    };
  }, []);

  useEffect(() => {
    if (!wakeLockSupported) return undefined;

    let lock = null;
    let cancelled = false;

    async function requestWakeLock() {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        setWakeLockActive(true);
        lock.addEventListener('release', () => setWakeLockActive(false), { once: true });
      } catch (wakeError) {
        console.debug('Screen wake lock unavailable:', wakeError);
        setWakeLockActive(false);
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !lock) requestWakeLock();
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (lock) lock.release().catch(() => {});
    };
  }, [wakeLockSupported]);

  useEffect(() => {
    const fullscreenLike = isFullscreen || isStandaloneMode;

    document.documentElement.classList.toggle('missionConsoleFullscreenMode', fullscreenLike);
    document.body.classList.toggle('missionConsoleFullscreenMode', fullscreenLike);

    return () => {
      document.documentElement.classList.remove('missionConsoleFullscreenMode');
      document.body.classList.remove('missionConsoleFullscreenMode');
    };
  }, [isFullscreen, isStandaloneMode]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (fullscreenError) {
      setError('Fullscreen mode was blocked by this browser. Use Add to Home Screen for the cleanest tablet view.');
    }
  }

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

    async function pollAsiairTelemetry() {
      const { data, error: queryError } = await supabase
        .from('asiair_status')
        .select('station,updated_at,online,payload,last_error')
        .eq('station', 'eliot')
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setAsiairError(queryError.message || 'ASIAIR telemetry unavailable.');
        return;
      }

      setAsiairRecord(data || null);
      setAsiairError(data?.last_error || '');
    }

    pollAsiairTelemetry();
    const interval = window.setInterval(pollAsiairTelemetry, 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function runAsiairControl(action, argumentsPayload = {}) {
    setAsiairControlBusy(action);
    setAsiairControlError('');
    setAsiairControlMessage('');

    const labels = {
      capture: 'CAPTURE',
      capture_preview: 'PREVIEW CAPTURE',
      start_autorun: 'AUTORUN START',
      stop_capture: 'CAPTURE STOP',
      set_mode: `MODE ${String(argumentsPayload.mode || '').toUpperCase()}`,
      set_gain: `GAIN ${argumentsPayload.gain ?? ''}`,
      set_exposure: `EXPOSURE ${argumentsPayload.seconds ?? ''} SEC`,
      configure_autorun: 'AUTORUN CONFIGURE',
      plate_solve: 'PLATE SOLVE',
      toggle_continuous_preview: 'CONTINUOUS PREVIEW'
    };

    try {
      const { data, error: insertError } = await supabase
        .from('asiair_commands')
        .insert({
          station: 'eliot',
          action,
          arguments: argumentsPayload,
          requested_by: session?.user?.id || null
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      setAsiairControlMessage(`QUEUED // ${labels[action] || action.toUpperCase()}`);
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        const { data: command, error: commandError } = await supabase
          .from('asiair_commands')
          .select('status,error,result')
          .eq('id', data.id)
          .single();
        if (commandError) throw commandError;
        if (command.status === 'running') {
          setAsiairControlMessage(`EXECUTING // ${labels[action] || action.toUpperCase()}`);
        }
        if (command.status === 'completed') {
          setAsiairControlMessage(command.result?.message || `${labels[action] || action.toUpperCase()} COMPLETE`);
          return true;
        }
        if (command.status === 'failed') throw new Error(command.error || 'ASIAIR direct command failed.');
      }
      throw new Error('ASIAIR command timed out waiting for the direct bridge.');
    } catch (controlError) {
      setAsiairControlError(controlError?.message || 'Unable to control the ASIAIR directly.');
      return false;
    } finally {
      setAsiairControlBusy('');
    }
  }

  async function runDewControl({ mode = dewControlMode, aggression = dewAggression, manualPwm = dewManualOutput } = {}) {
    setDewControlBusy('apply');
    setDewControlError('');
    setDewControlMessage('');

    const normalizedMode = mode === 'manual' ? 'manual' : 'auto';
    const normalizedAggression = normalizedMode === 'auto'
      ? Math.max(1, Math.min(10, Math.round(Number(aggression) || 5)))
      : 0;
    const normalizedManualPwm = normalizedMode === 'manual'
      ? Math.max(0, Math.min(100, Math.round(Number(manualPwm) || 0)))
      : 0;

    try {
      const { data: queuedCommand, error: insertError } = await supabase
        .from('hbg3_dew_commands')
        .insert({
          station: 'eliot',
          action: 'set_channel',
          arguments: {
            channel: 0,
            mode: normalizedMode,
            aggression: normalizedAggression,
            manualPwm: normalizedManualPwm
          },
          requested_by: session?.user?.id || null
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      setDewControlMode(normalizedMode);
      setDewAggression(normalizedAggression || dewAggression);
      setDewManualOutput(normalizedManualPwm);
      setDewControlDirty(false);
      setDewAppliedTarget(null);
      setDewControlMessage(
        normalizedMode === 'auto'
          ? `QUEUED // AUTOMATIC AGGRESSION ${normalizedAggression}/10`
          : `QUEUED // MANUAL OUTPUT ${normalizedManualPwm}%`
      );

      let completedCommand = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const { data: commandStatus, error: statusError } = await supabase
          .from('hbg3_dew_commands')
          .select('completed_at,success,result,error')
          .eq('id', queuedCommand.id)
          .maybeSingle();
        if (statusError) throw statusError;
        if (!commandStatus?.completed_at) {
          if (attempt >= 1) setDewControlMessage('APPLYING // HBG3 COMMAND IN PROGRESS');
          continue;
        }
        completedCommand = commandStatus;
        break;
      }

      if (!completedCommand) throw new Error('Dew command timed out waiting for the observatory bridge.');
      if (!completedCommand.success) throw new Error(completedCommand.error || 'HBG3 rejected the dew command.');

      setDewAppliedTarget({
        mode: normalizedMode,
        aggression: normalizedAggression,
        manualPwm: normalizedManualPwm
      });
      setDewControlMessage('APPLIED // WAITING FOR LIVE TELEMETRY');
    } catch (commandError) {
      setDewControlError(commandError?.message || 'Unable to queue HBG3 dew command.');
    } finally {
      setDewControlBusy('');
    }
  }

  async function shutDownDewHeater() {
    setDewControlMode('manual');
    setDewManualOutput(0);
    setDewControlDirty(true);
    await runDewControl({ mode: 'manual', aggression: 0, manualPwm: 0 });
  }

  useEffect(() => {
    let active = true;

    async function pollCpwiTelemetry() {
      const { data, error: queryError } = await supabase
        .from('cpwi_status')
        .select('*')
        .eq('station', 'eliot')
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setLocalSystemsStatus('offline');
        setLocalSystemsError(queryError.message || 'CPWI telemetry unavailable.');
        return;
      }

      const ageMs = data?.updated_at ? Date.now() - new Date(data.updated_at).getTime() : Infinity;
      setLocalSystems(data?.payload || null);
      setLocalSystemsUpdatedAt(data?.updated_at ? new Date(data.updated_at) : null);
      setLocalSystemsStatus(data?.online && ageMs <= 15000 ? 'online' : data ? 'stale' : 'offline');
      setLocalSystemsError(data?.last_error || '');
    }

    pollCpwiTelemetry();
    const interval = window.setInterval(pollCpwiTelemetry, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let active = true;

    async function pollFocuserTelemetry() {
      const { data, error: queryError } = await supabase
        .from('focuser_status')
        .select('*')
        .eq('station', 'eliot')
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setFocuserStatus('offline');
        setFocuserError(queryError.message || 'Focuser telemetry unavailable.');
        return;
      }

      const ageMs = data?.updated_at ? Date.now() - new Date(data.updated_at).getTime() : Infinity;
      setFocuserRecord(data || null);
      setFocuserStatus(data?.online && ageMs <= 15000 ? 'online' : data ? 'stale' : 'offline');
      setFocuserError(data?.last_error || '');
      if (data?.payload?.position !== null && data?.payload?.position !== undefined) {
        setFocuserTargetPosition((current) => current === '' ? String(data.payload.position) : current);
      }
    }

    pollFocuserTelemetry();
    const interval = window.setInterval(pollFocuserTelemetry, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function runFocuserControl(action, argumentsPayload = null) {
    setFocuserControlBusy(action);
    setFocuserControlError('');
    setFocuserControlMessage('');

    try {
      const { data, error: insertError } = await supabase
        .from('focuser_commands')
        .insert({ station: 'eliot', action, arguments: argumentsPayload, requested_by: session?.user?.id || null })
        .select('id')
        .single();
      if (insertError) throw insertError;

      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const { data: command, error: commandError } = await supabase
          .from('focuser_commands')
          .select('status,error,result')
          .eq('id', data.id)
          .single();
        if (commandError) throw commandError;
        if (command.status === 'completed') {
          setFocuserControlMessage(command.result?.message || 'FOCUSER COMMAND COMPLETE');
          return true;
        }
        if (command.status === 'failed') throw new Error(command.error || 'Focuser command failed.');
      }
      throw new Error('Focuser command timed out waiting for the observatory bridge.');
    } catch (controlError) {
      setFocuserControlError(controlError.message || 'Focuser command failed.');
      return false;
    } finally {
      setFocuserControlBusy('');
    }
  }

  async function moveFocuserRelative(direction) {
    const payload = focuserRecord?.payload || {};
    if (focuserStatus !== 'online' || !payload.connected) {
      setFocuserControlError('Connect the Celestron focuser before moving it.');
      return;
    }
    const signedSteps = Math.max(1, Math.round(Number(focuserStepSize) || 1)) * (direction === 'in' ? -1 : 1);
    await runFocuserControl('moveRelative', { steps: signedSteps });
  }

  async function moveFocuserAbsolute() {
    const payload = focuserRecord?.payload || {};
    const position = Math.round(Number(focuserTargetPosition));
    const maxStep = Number(payload.maxStep);
    if (!Number.isFinite(position)) {
      setFocuserControlError('Enter a valid absolute focuser position.');
      return;
    }
    if (Number.isFinite(maxStep) && (position < 0 || position > maxStep)) {
      setFocuserControlError(`Position must be between 0 and ${maxStep}.`);
      return;
    }
    await runFocuserControl('moveAbsolute', { position });
  }

  async function runCpwiControl(action, argumentsPayload = null) {
    setCpwiControlBusy(action);
    setCpwiControlError('');
    try {
      const { data, error: insertError } = await supabase
        .from('cpwi_commands')
.insert({ station: 'eliot', action, arguments: argumentsPayload, requested_by: session?.user?.id || null })
        .select('id')
        .single();
      if (insertError) throw insertError;

      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const { data: command, error: commandError } = await supabase
          .from('cpwi_commands')
          .select('status,error,result')
          .eq('id', data.id)
          .single();
        if (commandError) throw commandError;
        if (command.status === 'completed') return true;
        if (command.status === 'failed') throw new Error(command.error || 'CPWI command failed.');
      }
      throw new Error('CPWI command timed out waiting for the observatory bridge.');
    } catch (controlError) {
      setCpwiControlError(controlError.message || 'CPWI command failed.');
      return false;
    } finally {
      setCpwiControlBusy('');
    }
  }


  async function nudgeMount(direction) {
    setCpwiControlError('');
    if (!localSystems?.cpwi?.connected) {
      setCpwiControlError('Connect CPWI before using manual slew controls.');
      return;
    }
    if (localSystems?.cpwi?.parked) {
      setCpwiControlError('Unpark the telescope before using manual slew controls.');
      return;
    }
    await runCpwiControl('pulseSlew', {
      direction,
      rate: nudgeRate,
      durationMs: Number(nudgeDurationMs),
      coordinateFrame: 'altAz',
      purpose: 'live-centering'
    });
  }

  useEffect(() => {
    const handleSlewKeyboard = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if (isTyping || event.repeat) return;

      const directions = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east' };
      if (directions[event.key]) {
        event.preventDefault();
        nudgeMount(directions[event.key]);
      } else if (event.code === 'Space') {
        event.preventDefault();
        runCpwiControl('abortSlew');
      }
    };

    window.addEventListener('keydown', handleSlewKeyboard);
    return () => window.removeEventListener('keydown', handleSlewKeyboard);
  }, [localSystems?.cpwi?.connected, localSystems?.cpwi?.parked, nudgeRate, nudgeDurationMs, session?.user?.id]);

  const nudgeControls = (location) => {
    const mountDisabled = Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || localSystems?.cpwi?.parked;
    const pulseChoices = [100, 200, 350, 500, 1000, 2000];

    return (
      <div className={`missionConsoleNudgeConsole missionConsoleNudgeConsole-${location}`}>
        <div className="missionConsoleNudgeHeader">
          <div>
            <small>MANUAL SLEW CONTROLS</small>
            <strong>LCARS NAVIGATION ARRAY</strong>
          </div>
          <span className={localSystems?.cpwi?.connected ? 'is-online' : 'is-offline'}>
            {localSystems?.cpwi?.connected ? 'MOUNT ONLINE' : 'MOUNT OFFLINE'}
          </span>
        </div>

        <div className="missionConsoleNudgeBody">
          <div className="missionConsoleSlewRatePanel">
            <span>SLEW RATE</span>
            <div className="missionConsoleNudgeChoices">
              {[['fine', '1×'], ['center', '3×'], ['fast', '9×']].map(([rate, multiplier]) => (
                <button key={rate} type="button" className={nudgeRate === rate ? 'is-active' : ''} onClick={() => setNudgeRate(rate)}>
                  <b>{rate.toUpperCase()}</b><em>{multiplier}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="missionConsoleSlewRing" aria-label="Telescope directional slew controls">
            <div className="missionConsoleSlewTicks" aria-hidden="true" />
            <button type="button" className="missionConsoleSlewWedge missionConsoleSlewNorth" aria-label="Slew telescope north" disabled={mountDisabled} onClick={() => nudgeMount('north')}>
              <ArrowUp size={24} /><span>N</span>
            </button>
            <button type="button" className="missionConsoleSlewWedge missionConsoleSlewWest" aria-label="Slew telescope west" disabled={mountDisabled} onClick={() => nudgeMount('west')}>
              <ArrowLeft size={24} /><span>W</span>
            </button>
            <button type="button" className="missionConsoleSlewWedge missionConsoleSlewEast" aria-label="Slew telescope east" disabled={mountDisabled} onClick={() => nudgeMount('east')}>
              <span>E</span><ArrowRight size={24} />
            </button>
            <button type="button" className="missionConsoleSlewWedge missionConsoleSlewSouth" aria-label="Slew telescope south" disabled={mountDisabled} onClick={() => nudgeMount('south')}>
              <span>S</span><ArrowDown size={24} />
            </button>
            <button type="button" className="missionConsoleSlewStop" disabled={!localSystems?.cpwi?.connected} onClick={() => runCpwiControl('abortSlew')}>
              <strong>STOP</strong><span>■</span>
            </button>
          </div>

          <div className="missionConsolePulsePanel">
            <span>PULSE DURATION</span>
            <div className="missionConsolePulseChoices">
              {pulseChoices.map((duration) => (
                <button key={duration} type="button" className={Number(nudgeDurationMs) === duration ? 'is-active' : ''} onClick={() => setNudgeDurationMs(duration)}>
                  {(duration / 1000).toFixed(duration < 1000 ? 1 : 1)}s
                </button>
              ))}
            </div>
            <button type="button" className="missionConsoleNudgeAbort" disabled={!localSystems?.cpwi?.connected} onClick={() => runCpwiControl('abortSlew')}>
              ABORT MOTION <small>IMMEDIATE STOP</small>
            </button>
          </div>

          <div className="missionConsoleMountMiniInfo">
            <span>MOUNT INFO</span>
            <div><small>RA</small><strong>{bridgeNumber(localSystems?.cpwi?.rightAscensionHours, 4, 'h')}</strong></div>
            <div><small>DEC</small><strong>{bridgeNumber(localSystems?.cpwi?.declinationDegrees, 3, '°')}</strong></div>
            <div><small>AZIMUTH</small><strong>{bridgeNumber(localSystems?.cpwi?.azimuthDegrees, 1, '°')}</strong></div>
            <div><small>ALTITUDE</small><strong>{bridgeNumber(localSystems?.cpwi?.altitudeDegrees, 1, '°')}</strong></div>
            <div><small>TRACKING</small><strong className={localSystems?.cpwi?.tracking ? 'is-good' : ''}>{bridgeBoolean(localSystems?.cpwi?.tracking)}</strong></div>
          </div>
        </div>

        <div className="missionConsoleNudgeFooter">
          TAP A DIRECTION TO NUDGE <i>•</i> ARROW KEYS TO SLEW <i>•</i> SPACEBAR TO STOP
        </div>
      </div>
    );
  };

  const selectedSlewRecord = CPWI_SLEW_TARGETS.find((target) => target.id === selectedSlewTarget) || CPWI_SLEW_TARGETS[0];
  const selectedSlewRaHours = selectedSlewTarget === 'manual' ? Number(manualSlewRa) : selectedSlewRecord.ra;
  const selectedSlewDecDegrees = selectedSlewTarget === 'manual' ? Number(manualSlewDec) : selectedSlewRecord.dec;
  const selectedSlewAltitude = Number.isFinite(selectedSlewRaHours) && Number.isFinite(selectedSlewDecDegrees)
    ? altitudeForCoords(selectedSlewRaHours, selectedSlewDecDegrees, new Date(now), DEFAULT_SITE)
    : null;

  async function slewToSelectedTarget() {
    setCpwiControlError('');
    if (!localSystems?.cpwi?.connected) {
      setCpwiControlError('Connect CPWI before issuing a slew command.');
      return;
    }
    if (!Number.isFinite(selectedSlewRaHours) || selectedSlewRaHours < 0 || selectedSlewRaHours >= 24) {
      setCpwiControlError('Right ascension must be a decimal-hour value from 0 up to, but not including, 24.');
      return;
    }
    if (!Number.isFinite(selectedSlewDecDegrees) || selectedSlewDecDegrees < -90 || selectedSlewDecDegrees > 90) {
      setCpwiControlError('Declination must be between -90 and +90 degrees.');
      return;
    }
    if (!slewClearanceConfirmed) {
      setCpwiControlError('Confirm telescope and cable clearance before slewing.');
      return;
    }
    const ok = await runCpwiControl('slewRaDec', {
      rightAscensionHours: selectedSlewRaHours,
      declinationDegrees: selectedSlewDecDegrees,
      targetName: selectedSlewRecord.name
    });
    if (ok) setSlewClearanceConfirmed(false);
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

  useEffect(() => {
    if (!hbg3Channel1 || dewControlDirty) return;
    const reportedAggression = Math.max(0, Math.min(10, Number(hbg3Channel1.aggression || 0)));
    const reportedManual = Math.max(0, Math.min(100, Number(hbg3Channel1.manualPwm || 0)));
    setDewControlMode(reportedAggression > 0 ? 'auto' : 'manual');
    setDewAggression(reportedAggression > 0 ? reportedAggression : 5);
    setDewManualOutput(reportedManual);
  }, [hbg3Channel1, dewControlDirty]);

  useEffect(() => {
    if (!dewAppliedTarget || !hbg3Channel1) return;
    const reportedAggression = Math.round(Number(hbg3Channel1.aggression || 0));
    const reportedManual = Math.round(Number(hbg3Channel1.manualPwm || 0));
    const targetMatched = dewAppliedTarget.mode === 'auto'
      ? reportedAggression === dewAppliedTarget.aggression
      : reportedAggression === 0 && reportedManual === dewAppliedTarget.manualPwm;
    if (!targetMatched) return;

    const current = Number(hbg3Channel1.amps);
    const currentLabel = Number.isFinite(current) ? ` // ${current.toFixed(2)} A` : '';
    setDewControlMessage(
      dewAppliedTarget.mode === 'auto'
        ? `ACTIVE // AUTOMATIC A${dewAppliedTarget.aggression}${currentLabel}`
        : dewAppliedTarget.manualPwm === 0
          ? `ACTIVE // HEATER OFF${currentLabel}`
          : `ACTIVE // MANUAL ${dewAppliedTarget.manualPwm}%${currentLabel}`
    );
  }, [dewAppliedTarget, hbg3Channel1]);
  const systemsLinkTone = localSystemsStatus === 'online' || hbg3Online
    ? 'good'
    : localSystemsStatus === 'connecting' || localSystemsStatus === 'stale'
      ? 'warn'
      : 'alert';
  const systemsLinkLabel = localSystemsStatus === 'online' && hbg3Online
    ? 'ONLINE'
    : localSystemsStatus === 'online' || hbg3Online
      ? 'PARTIAL'
      : localSystemsStatus === 'stale' ? 'STALE' : localSystemsStatus.toUpperCase();
  const isOperationLive = activeOperation?.status === 'ACTIVE';
  const missionElapsed = formatOperationElapsed(
    activeOperation?.started_at || missionPlan?.started_at,
    activeOperation?.status === 'COMPLETE' ? activeOperation?.ended_at : null,
    now
  );
  const progressTarget = Number(asiairRecord?.payload?.sequence?.total_frames || 0) || frameTarget;
  const progressFrames = Number(asiairRecord?.payload?.sequence?.total_frames || 0)
    ? Number(asiairRecord?.payload?.sequence?.completed_frames || 0)
    : Number(consoleState.completedFrames || 0);
  const progressPercent = progressTarget ? Math.min(100, Math.round((progressFrames / progressTarget) * 100)) : 0;
  const asiairAgeMs = asiairRecord?.updated_at
    ? now - new Date(asiairRecord.updated_at).getTime()
    : Infinity;
  const asiairOnline = Boolean(asiairRecord?.online) && asiairAgeMs <= 20000 && !asiairError;
  const asiairPayload = asiairRecord?.payload || {};
  const asiairSequence = asiairPayload.sequence || {};
  const sequenceTotal = Number(asiairSequence.total_frames || 0);
  const sequenceCompleted = Number(asiairSequence.completed_frames || 0);
  const asiairFrames = sequenceTotal > 0 ? sequenceCompleted : Number(asiairPayload.frames_captured || 0);
  const effectiveFrameTarget = sequenceTotal > 0 ? sequenceTotal : frameTarget;
  const asiairRemaining = sequenceTotal > 0
    ? Math.max(0, Number(asiairSequence.remaining_frames ?? sequenceTotal - sequenceCompleted))
    : frameTarget ? Math.max(0, frameTarget - asiairFrames) : null;
  const asiairCadenceSeconds = Number(asiairPayload.average_cadence_seconds || asiairSequence.exposure_seconds || asiairPayload.exposure_seconds || 0);
  const asiairEtaSeconds = asiairRemaining !== null && asiairCadenceSeconds > 0
    ? asiairRemaining * asiairCadenceSeconds
    : null;
  const asiairLastFrameAge = asiairPayload.last_frame_at
    ? Math.max(0, (now - new Date(asiairPayload.last_frame_at).getTime()) / 1000)
    : null;
  const asiairState = asiairOnline ? String(asiairPayload.state || 'waiting').toUpperCase() : 'OFFLINE';
  const asiairStalled = asiairOnline && asiairPayload.state === 'capturing' && asiairLastFrameAge !== null && asiairLastFrameAge > Math.max(60, asiairCadenceSeconds * 3);
  const asiairPreviewUrl = typeof asiairPayload.preview_url === 'string' ? asiairPayload.preview_url : '';
  const asiairProtocol = asiairPayload.protocol || {};
  const asiairProtocolPorts = Array.isArray(asiairProtocol.connected_ports) ? asiairProtocol.connected_ports : [];
  const asiairProtocolEvents = Array.isArray(asiairProtocol.recent_events) ? asiairProtocol.recent_events : [];
  const asiairLatestProtocolEvent = asiairProtocolEvents.length ? asiairProtocolEvents[asiairProtocolEvents.length - 1] : null;
  const asiairLatestProtocolName = asiairLatestProtocolEvent?.Event || asiairLatestProtocolEvent?.event || 'WAITING';

  useEffect(() => {
    if (!asiairOnline || asiairFrames < 0) return;
    setConsoleState((current) => {
      if (Number(current.completedFrames || 0) === asiairFrames) return current;
      return { ...current, completedFrames: asiairFrames };
    });
  }, [asiairOnline, asiairFrames]);

  const captureHistorySummary = useMemo(() => summarizeCaptureHistory(captureHistory), [captureHistory]);
  const baselineRecommendation = useMemo(() => getMissionRecommendation({ missionPlan, targetReference, weather, lastCapture }), [missionPlan, targetReference, weather, lastCapture]);
  const missionRecommendation = aiRecommendation || baselineRecommendation;

  useEffect(() => {
    setAiRecommendation(null);
    setAiRecommendationError('');
    setAiRecommendationUpdatedAt(null);
  }, [missionPlan?.id]);

  async function refreshAiRecommendation() {
    if (!missionPlan && !targetReference) {
      setAiRecommendationError('Accept or activate a mission before requesting a recommendation.');
      return;
    }

    setAiRecommendationBusy(true);
    setAiRecommendationError('');

    try {
      const requestContext = {
        requestedAt: new Date().toISOString(),
        site: activeSite || DEFAULT_SITE,
        target: {
          title: missionPlan?.target_title || targetReference?.title || 'Unknown target',
          type: missionPlan?.target_type || targetReference?.objectType || 'Unknown',
          rightAscensionHours: targetReference?.ra ?? missionPlan?.ra ?? null,
          declinationDegrees: targetReference?.dec ?? missionPlan?.dec ?? null,
          altitudeDegrees: telemetry?.altitude ?? null,
          azimuthDegrees: telemetry?.azimuth ?? null,
          capturePlan: missionPlan?.capture_plan || targetReference?.capturePlan || null,
          objective: missionPlan?.primary_objective || targetReference?.objective || null
        },
        equipment: {
          telescope: 'Celestron CPC 800, 8-inch SCT',
          mount: 'Alt-az fork mount, no wedge',
          camera: 'ZWO ASI294MC one-shot color',
          reducerAvailable: true,
          reducer: 'f/6.3 reducer',
          filters: ['Celestron UHC/LPR', 'variable polarizing'],
          currentPlanEquipment: missionPlan?.equipment || targetReference?.equipment || null
        },
        weather: weather || null,
        hbg3: {
          online: hbg3Online,
          ambientC: hbg3Environment?.ambientC ?? null,
          humidityPercent: hbg3Environment?.humidityPercent ?? null,
          dewPointC: hbg3Environment?.dewPointC ?? null,
          dewMarginC: hbg3Environment?.dewMarginC ?? null,
          supplyVolts: hbg3Environment?.supplyVolts ?? null,
          heaterTemperatureC: hbg3Channel1?.temperatureC ?? null,
          heaterOutputPercent: hbg3Channel1?.pwmPercent ?? null
        },
        mount: localSystems?.cpwi || null,
        lastCapture: lastCapture || null,
        captureHistorySummary,
        deterministicBaseline: baselineRecommendation
      };

      const { data, error: invokeError } = await supabase.functions.invoke('mission-recommendation', {
        body: requestContext
      });

      if (invokeError) throw invokeError;
      if (!data?.recommendation) throw new Error(data?.error || 'The recommendation service returned no recommendation.');

      setAiRecommendation({
        ...baselineRecommendation,
        ...data.recommendation,
        adjustments: Array.isArray(data.recommendation.adjustments) ? data.recommendation.adjustments : [],
        totalIntegrationSeconds: Number(data.recommendation.totalIntegrationSeconds) ||
          Number(data.recommendation.exposureSeconds || 0) * Number(data.recommendation.frameCount || 0),
        differsFromLast: Boolean(lastCapture) && (
          Number(lastCapture.exposure_seconds) !== Number(data.recommendation.exposureSeconds) ||
          Number(lastCapture.frame_count) !== Number(data.recommendation.frameCount) ||
          Number(lastCapture.gain) !== Number(data.recommendation.gain)
        )
      });
      setAiRecommendationUpdatedAt(data.generatedAt || new Date().toISOString());
    } catch (refreshError) {
      console.error('[MISSION RECOMMENDATION] Refresh failed:', refreshError);
      setAiRecommendationError(refreshError.message || 'ChatGPT recommendation refresh failed.');
    } finally {
      setAiRecommendationBusy(false);
    }
  }

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
      setMessage(`SESSION ACTIVE // ${designation.toUpperCase()}`);
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
        eventLabel: 'COMPLETE SESSION',
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
      setMessage(`COMPLETE SESSION // ${completedOperation.designation.toUpperCase()}`);
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

  const navigateToPanel = (panelName) => {
    setOpenPanels((current) => ({ ...current, [panelName]: true }));

    window.requestAnimationFrame(() => {
      document
        .getElementById(`mission-console-${panelName}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  const readinessTarget = String(missionPlan?.target_title || targetReference?.shortTitle || targetReference?.title || 'NO TARGET')
    .split('//')[0]
    .trim();
  const readinessItems = [
    {
      key: 'cpwi',
      label: 'CPWI',
      value: localSystems?.cpwi?.connected ? 'CONNECTED' : 'OFFLINE',
      icon: Cpu,
      tone: localSystems?.cpwi?.connected ? 'orange good' : 'orange alert'
    },
    {
      key: 'live-viewscreen',
      label: 'LIVE VIEWSCREEN',
      value: asiairOnline ? 'ONLINE' : 'OFFLINE',
      icon: Radio,
      tone: asiairOnline ? 'lavender good' : 'lavender alert'
    },
    {
      key: 'dew-bridge',
      label: 'DEW BRIDGE',
      value: hbg3Online ? 'ONLINE' : 'OFFLINE',
      icon: Droplets,
      tone: hbg3Online ? 'blue good' : 'blue alert'
    },
    {
      key: 'tracking',
      label: 'TRACKING',
      value: localSystems?.cpwi?.tracking === true ? 'ON' : localSystems?.cpwi?.tracking === false ? 'OFF' : 'UNKNOWN',
      icon: Crosshair,
      tone: localSystems?.cpwi?.tracking === true ? 'pink good' : 'pink alert'
    },
    {
      key: 'target',
      label: 'TARGET',
      value: readinessTarget,
      icon: Sparkles,
      tone: 'peach'
    },
  ];

  return (
    <section className="missionConsoleWrap">
      <div className="missionConsoleFrame">
        <div className="missionConsoleLeftRail" aria-hidden="true">
          <span className="missionConsoleRailLarge" />
          <span className="missionConsoleRailAccent" />
          <span className="missionConsoleRailMini" />
        </div>

        <div className="missionConsoleMain">
          <div className="missionConsoleStandaloneTopbar">
            <a href="/admin" className="missionConsoleReturnAdmin">
              <ArrowLeft size={18} />
              <span>RETURN TO ADMIN</span>
            </a>

            <div className="missionConsoleDeviceControls" aria-label="Tablet display controls">
              <span className={`missionConsoleDeviceStatus missionConsoleDeviceStatusLcars ${isOnline ? 'is-online' : 'is-offline'}`}>
                <span className="missionConsoleDeviceStatusCap" aria-hidden="true" />
                <span className="missionConsoleDeviceStatusContent">
                  <span className="missionConsoleDeviceStatusIcon">{isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
                  <span className="missionConsoleDeviceStatusLabel">{isOnline ? 'NETWORK ONLINE' : 'NETWORK OFFLINE'}</span>
                </span>
              </span>
              {!isStandaloneMode ? (
                <button type="button" className="missionConsoleFullscreenButton missionConsoleFullscreenButtonLcars" onClick={toggleFullscreen}>
                  <span className="missionConsoleFullscreenButtonCap" aria-hidden="true" />
                  <span className="missionConsoleFullscreenButtonContent">
                    <span className="missionConsoleFullscreenButtonIcon">{isFullscreen ? <X size={17} /> : <Maximize2 size={17} />}</span>
                    <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'}</span>
                  </span>
                </button>
              ) : (
                <span className="missionConsoleDeviceStatus missionConsoleDeviceStatusLcars is-online">
                  <span className="missionConsoleDeviceStatusCap" aria-hidden="true" />
                  <span className="missionConsoleDeviceStatusContent">
                    <span className="missionConsoleDeviceStatusIcon"><Maximize2 size={16} /></span>
                    <span className="missionConsoleDeviceStatusLabel">APP MODE ACTIVE</span>
                  </span>
                </span>
              )}
            </div>
          </div>

          {!isOnline ? (
            <div className="missionConsoleConnectivityBanner" role="alert">
              <WifiOff size={19} />
              <div><strong>NETWORK CONNECTION LOST</strong><span>Controls may not reach the observatory. Existing console data remains visible until the link returns.</span></div>
            </div>
          ) : null}

          <header className="missionConsoleHeader missionConsoleHeaderCompact">
            <div className="missionConsoleAccessHeader">
              <div className="missionConsoleAccessCode">
                <span>LCARS 40274</span>
                <strong>CZB-01</strong>
              </div>

              <div className="missionConsoleAccessTitle">
                <small>CUZBRO OBSERVATORY</small>
                <strong>LCARS ACCESS 44</strong>
              </div>
            </div>

            <div className="missionConsoleHeaderBlock missionConsoleHeaderBlockPrimary">
              <span className="missionConsoleEyebrow">LCARS // CZB-01 // OBSERVATORY CONSOLE</span>
              <h1>Observatory Console</h1>
              <p>
                Target, conditions, observatory systems, and imaging telemetry in one place.
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

          <section className="missionConsoleReadiness" aria-label="System readiness">
            <div className="missionConsoleReadinessHeading">
              <span>SYSTEM READINESS</span>
              <i aria-hidden="true" />
            </div>
            <div className="missionConsoleReadinessGrid">
              {readinessItems.map(({ key, label, value, icon: Icon, tone }) => (
                <div key={key} className={`missionConsoleReadinessTile ${tone.split(' ').map((part) => `is-${part}`).join(' ')}`}>
                  <Icon size={22} strokeWidth={2.3} />
                  <div>
                    <span>{label}</span>
                    <strong title={String(value)}>{value}</strong>
                  </div>
                  <b className="missionConsoleReadinessLamp" aria-hidden="true" />
                </div>
              ))}
            </div>
          </section>

          <nav className="missionConsoleLcarsStrip" aria-label="Mission console section controls">
            <button type="button" className="missionConsoleLcarsMaster missionConsoleLcarsExpand" onClick={() => setAllPanels(true)}>EXPAND ALL</button>
            <button type="button" className="missionConsoleLcarsMaster missionConsoleLcarsCompact" onClick={() => setAllPanels(false)}>COMPACT MODE</button>
            {[
              ['target', 'TARGET', 'missionConsoleLcarsTarget'],
              ['conditions', 'CONDITIONS', 'missionConsoleLcarsConditions'],
              ['operations', 'LIVE IMAGING', 'missionConsoleLcarsOperations'],
              ['systems', 'OBSERVATORY CONTROL SYSTEMS', 'missionConsoleLcarsSystems']
            ].map(([panelName, label, colorClass]) => (
              <button
                type="button"
                key={panelName}
                className={`missionConsoleLcarsTab ${colorClass} ${openPanels[panelName] ? 'is-active' : ''}`}
                onClick={() => navigateToPanel(panelName)}
                aria-pressed={openPanels[panelName]}
              >
                <span>{label}</span>
                <ChevronDown size={16} />
              </button>
            ))}
          </nav>

          <div className="missionConsoleGrid">
            <section id="mission-console-target" className={`missionConsolePanel missionConsolePanelTarget ${openPanels.target ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('target')} aria-expanded={openPanels.target}>
                <span>TARGET</span>
                <div className="missionConsolePanelBadge">OBJECTIVE</div><ChevronDown className="missionConsolePanelChevron" size={18} />
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

            <section id="mission-console-conditions" className={`missionConsolePanel missionConsolePanelTelemetry ${openPanels.conditions ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('conditions')} aria-expanded={openPanels.conditions}>
                <span>CONDITIONS</span>
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

            <section id="mission-console-operations" className={`missionConsolePanel missionConsolePanelOperations ${openPanels.operations ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('operations')} aria-expanded={openPanels.operations}>
                <span>LIVE IMAGING</span>
                <div className="missionConsolePanelBadge">VIEWSCREEN</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className={`missionConsoleAsiairPanel ${asiairStalled ? 'is-stalled' : ''}`}>
                <div className="missionConsoleAsiairPreview">
                  <div className="missionConsoleAsiairPreviewHeader">
                    <span>VIEWSCREEN</span>
                    <strong>{asiairPayload.latest_file || 'WAITING FOR FRAME'}</strong>
                  </div>
                  {nudgeControls('imaging')}
                  {asiairPreviewUrl ? (
                    <a href={asiairPreviewUrl} target="_blank" rel="noreferrer" title="Open the latest FITS preview at full size">
                      <img src={asiairPreviewUrl} alt={`Latest imaging FITS preview${asiairPayload.latest_file ? `: ${asiairPayload.latest_file}` : ''}`} />
                      <span className="missionConsoleAsiairPreviewOpen">OPEN PREVIEW</span>
                    </a>
                  ) : (
                    <div className="missionConsoleAsiairPreviewEmpty">
                      <span>NO PREVIEW AVAILABLE</span>
                      <small>The next completed FITS frame from the ASIAIR will appear here automatically.</small>
                    </div>
                  )}
                  {asiairPayload.preview_error ? <p className="missionConsoleAsiairPreviewError">Preview generator: {asiairPayload.preview_error}</p> : null}
                </div>

                <div className="missionConsoleOpsTop">
                  <div className="missionConsoleTimerBlock">
                    <small>SESSION ELAPSED</small>
                    <strong>{activeOperation?.started_at || missionPlan?.started_at ? missionElapsed : '00:00:00'}</strong>
                  </div>
                  <div className="missionConsoleTimerBlock missionConsoleTimerBlockSecondary">
                    <small>CAPTURE ELAPSED</small>
                    <strong>{consoleState.captureStartedAt ? captureElapsed : '00:00:00'}</strong>
                  </div>
                  <div className="missionConsoleTimerBlock missionConsoleTimerBlockStatus">
                    <small>CAPTURE STATE</small>
                    <strong>{asiairOnline ? (asiairStalled ? 'STALLED' : asiairState) : String(consoleState.captureStatus || 'idle').toUpperCase()}</strong>
                  </div>
                </div>

                <div className="missionConsoleAsiairHeader">
                  <div>
                    <small>ASIAIR LINK</small>
                    <strong>{asiairOnline ? 'ONLINE' : 'OFFLINE'}</strong>
                  </div>
                  <div className={`missionConsoleAsiairState ${asiairStalled ? 'is-alert' : ''}`}>
                    {asiairStalled ? 'CAPTURE STALLED' : asiairState}
                  </div>
                </div>
                <div className="missionConsoleAsiairGrid">
                  <div><span>FRAMES COMPLETE</span><strong>{asiairFrames}</strong></div>
                  <div><span>FRAMES REMAINING</span><strong>{asiairRemaining ?? '—'}</strong></div>
                  <div><span>EXPOSURE</span><strong>{bridgeNumber(asiairPayload.exposure_seconds, 2, ' SEC')}</strong></div>
                  <div><span>EST. FINISH</span><strong>{formatEta(asiairEtaSeconds)}</strong></div>
                  <div><span>CAMERA TEMP</span><strong>{bridgeNumber(celsiusToFahrenheit(asiairPayload.camera_temperature_c), 1, '°F')}</strong></div>
                  <div><span>GAIN</span><strong>{asiairPayload.gain ?? '—'}</strong></div>
                  <div><span>LAST FRAME</span><strong>{asiairPayload.last_frame_at ? formatClock(asiairPayload.last_frame_at) : '—'}</strong></div>
                  <div><span>LATEST FILE</span><strong title={asiairPayload.latest_file || ''}>{asiairPayload.latest_file || 'WAITING FOR FRAME'}</strong></div>
                </div>
                <div className="missionConsoleAsiairGrid missionConsoleAsiairProtocolGrid">
                  <div><span>PROTOCOL MONITOR</span><strong>{asiairProtocol.enabled ? (asiairProtocol.connected ? 'LINKED' : 'PARTIAL') : 'DISABLED'}</strong></div>
                  <div><span>EVENT PORTS</span><strong>{asiairProtocolPorts.length ? asiairProtocolPorts.join(' / ') : '—'}</strong></div>
                  <div><span>LATEST EVENT</span><strong title={String(asiairLatestProtocolName)}>{String(asiairLatestProtocolName).toUpperCase()}</strong></div>
                  <div><span>EVENT RECEIVED</span><strong>{asiairProtocol.last_event_at ? formatClock(asiairProtocol.last_event_at) : '—'}</strong></div>
                </div>
                {asiairProtocol.last_error ? <p className="missionConsoleAsiairError">Protocol monitor: {asiairProtocol.last_error}</p> : null}
                {asiairError ? <p className="missionConsoleAsiairError">{asiairError}</p> : null}
                {!asiairOnline ? <p className="missionConsoleAsiairHint">Start the ASIAIR feed bridge before beginning a capture. New ASIAIR FITS frames will appear here automatically.</p> : null}
                <div className="missionConsoleAsiairControls">
                  <div className="missionConsoleAsiairControlsHeader">
                    <div>
                      <small>DIRECT ASIAIR CONTROL</small>
                      <strong>ASIAIR REMOTE CAPTURE</strong>
                    </div>
                    <span>{asiairControlBusy ? 'COMMAND ACTIVE' : 'READY'}</span>
                  </div>

                  <div className="missionConsoleAsiairModeSection">
                    <small>CAPTURE MODE</small>
                    <div className="missionConsoleAsiairModeButtons">
                      {['preview', 'autorun'].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => runAsiairControl('set_mode', { mode })}
                          disabled={Boolean(asiairControlBusy)}
                        >
                          {asiairControlBusy === 'set_mode' ? 'WAIT…' : mode.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="missionConsoleAsiairQuickGrid missionConsoleAsiairCaptureGrid">
                    <button
                      type="button"
                      className="is-capture"
                      onClick={() => runAsiairControl('capture')}
                      disabled={Boolean(asiairControlBusy)}
                    >
                      <PlayCircle size={18} />
                      {asiairControlBusy === 'capture' ? 'STARTING…' : 'START EXPOSURE'}
                    </button>
                    <button
                      type="button"
                      className="is-stop"
                      onClick={() => runAsiairControl('stop_capture')}
                      disabled={Boolean(asiairControlBusy)}
                    >
                      <PauseCircle size={18} />
                      {asiairControlBusy === 'stop_capture' ? 'STOPPING…' : 'STOP CAPTURE'}
                    </button>
                  </div>

                  <div className="missionConsoleAsiairSettingsGrid">
                    <label className="missionConsoleAsiairGainControl">
                      <span>GAIN</span>
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="9999"
                          step="1"
                          value={asiairGainInput}
                          onChange={(event) => setAsiairGainInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                        <button
                          type="button"
                          onClick={() => runAsiairControl('set_gain', { gain: Number(asiairGainInput || 0) })}
                          disabled={Boolean(asiairControlBusy) || asiairGainInput === ''}
                        >
                          {asiairControlBusy === 'set_gain' ? 'SETTING…' : 'SET GAIN'}
                        </button>
                      </div>
                    </label>
                    <label className="missionConsoleAsiairGainControl">
                      <span>EXPOSURE (SEC)</span>
                      <div>
                        <input id="asiairExposureSeconds" type="number" min="0.001" step="0.001" defaultValue="1" />
                        <button type="button" onClick={() => runAsiairControl('set_exposure', { seconds: Number(document.getElementById('asiairExposureSeconds')?.value || 1) })} disabled={Boolean(asiairControlBusy)}>
                          {asiairControlBusy === 'set_exposure' ? 'SETTING…' : 'SET EXPOSURE'}
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="missionConsoleAsiairQuickGrid missionConsoleAsiairCaptureGrid">
                    <button type="button" onClick={() => runAsiairControl('configure_autorun', {
                      seconds: Number(document.getElementById('asiairExposureSeconds')?.value || 1),
                      count: Number(window.prompt('Autorun frame count', '10') || 10),
                      gain: Number(asiairGainInput || 0),
                      target: window.prompt('Target / group name', 'CuzBro') || 'CuzBro'
                    })} disabled={Boolean(asiairControlBusy)}>CONFIGURE AUTORUN</button>
                    <button type="button" onClick={() => runAsiairControl('plate_solve')} disabled={Boolean(asiairControlBusy)}>
                      {asiairControlBusy === 'plate_solve' ? 'SOLVING…' : 'PLATE SOLVE'}
                    </button>
                  </div>
                  <p className="missionConsoleAsiairControlNote">Direct TCP control is active. Select Preview or Autorun, configure settings, then start or stop the exposure.</p>
                  {asiairControlMessage ? <p className="missionConsoleAsiairControlMessage">{asiairControlMessage}</p> : null}
                  {asiairControlError ? <p className="missionConsoleAsiairError">{asiairControlError}</p> : null}
                </div>
              </div>

              <div className="missionConsoleFramesSection">
                {!asiairOnline ? (
                  <label className="missionConsoleFramesInput">
                    <span>COMPLETED FRAMES</span>
                    <input
                      type="number"
                      min="0"
                      value={Number(consoleState.completedFrames || 0)}
                      title="Enter the completed frame count manually when no imaging bridge is online."
                      onChange={(event) => setConsoleState((current) => ({ ...current, completedFrames: Number(event.target.value || 0) }))}
                    />
                  </label>
                ) : null}

                <div className="missionConsoleProgressBlock">
                  <div className="missionConsoleProgressHeader">
                    <span>CAPTURE PROGRESS</span>
                    <strong>{progressTarget ? `${progressFrames}/${progressTarget}` : `${progressFrames} FRAMES`}</strong>
                  </div>
                  <div className="missionConsoleProgressBar" role="progressbar" aria-valuemin={0} aria-valuemax={progressTarget || 100} aria-valuenow={progressTarget ? progressFrames : progressPercent}>
                    <div style={{ width: `${progressTarget ? progressPercent : Math.min(100, progressFrames)}%` }} />
                  </div>
                </div>
              </div>

              <label className="missionConsoleNotesField">
                <span>SESSION NOTES</span>
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
                  <span>{busyAction === 'initiate' ? 'INITIATING…' : isOperationLive ? 'SESSION ACTIVE' : 'START SESSION'}</span>
                </button>





                <button
                  type="button"
                  className="missionConsoleAction missionConsoleActionComplete"
                  onClick={handleMissionComplete}
                  disabled={!isOperationLive || busyAction === 'complete'}
                >
                  <CheckCircle2 size={20} />
                  <span>{busyAction === 'complete' ? 'COMPLETING…' : 'COMPLETE SESSION'}</span>
                </button>
              </div>
            </section>

            <section className={`missionConsolePanel missionConsolePanelEquipment missionConsolePanelDrawer missionConsolePanelSubcategory ${openPanels.recommendation ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('recommendation')} aria-expanded={openPanels.recommendation}>
                <span>CONFIGURATION</span>
                <div className="missionConsolePanelBadge">AI INPUT</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleSettingsSource missionConsoleRecommendationHeader">
                <div>
                  <span>CHATGPT CAPTURE PLAN</span>
                  <strong>{aiRecommendation ? 'LIVE AI PROFILE GENERATED FROM CURRENT CONSOLE TELEMETRY' : 'LOCAL BASELINE READY // REFRESH FOR A LIVE CHATGPT PROFILE'}</strong>
                  {aiRecommendationUpdatedAt ? <small>UPDATED {formatClock(aiRecommendationUpdatedAt)}</small> : null}
                </div>
                <button
                  type="button"
                  className="missionConsoleAiRefreshButton"
                  onClick={refreshAiRecommendation}
                  disabled={aiRecommendationBusy || (!missionPlan && !targetReference)}
                >
                  {aiRecommendationBusy ? <RefreshCw size={17} className="is-spinning" /> : <Sparkles size={17} />}
                  {aiRecommendationBusy ? 'BUILDING CAPTURE PLAN' : aiRecommendation ? 'REFRESH CAPTURE PLAN' : 'GENERATE CAPTURE PLAN'}
                </button>
              </div>

              {aiRecommendationError ? (
                <div className="missionConsoleAiRecommendationError">
                  <AlertTriangle size={17} />
                  <span>{aiRecommendationError}</span>
                </div>
              ) : null}

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
                {missionRecommendation.targetAssessment ? (
                  <div className="missionConsoleStackItem">
                    <small>TARGET ASSESSMENT</small>
                    <strong>{missionRecommendation.targetAssessment}</strong>
                  </div>
                ) : null}
                {missionRecommendation.dewAdvisory ? (
                  <div className="missionConsoleStackItem">
                    <small>DEW / CONDITIONS ADVISORY</small>
                    <strong>{missionRecommendation.dewAdvisory}</strong>
                  </div>
                ) : null}
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

            <section className={`missionConsolePanel missionConsolePanelHistory missionConsolePanelDrawer missionConsolePanelSubcategory ${openPanels.history ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('history')} aria-expanded={openPanels.history}>
                <span>CAPTURE HISTORY</span>
                <div className="missionConsolePanelBadge">IMAGING REFERENCE</div><ChevronDown className="missionConsolePanelChevron" size={18} />
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

            <section id="mission-console-systems" className={`missionConsolePanel missionConsolePanelSystems ${openPanels.systems ? 'is-open' : 'is-collapsed'}`}>
              <button type="button" className="missionConsolePanelTop" onClick={() => togglePanel('systems')} aria-expanded={openPanels.systems}>
                <span>OBSERVATORY CONTROL SYSTEMS</span>
                <div className={`missionConsolePanelBadge missionConsolePanelBadge-${systemsLinkTone}`}>{systemsLinkLabel}</div><ChevronDown className="missionConsolePanelChevron" size={18} />
              </button>

              <div className="missionConsoleLocalLinkHeader">
                <div>
                  <small>OBSERVATORY TELEMETRY RELAY</small>
                  <strong>{localSystemsStatus === 'online' ? 'CPWI BRIDGE CONNECTED' : hbg3Online ? 'HBG3 BRIDGE CONNECTED' : 'OBSERVATORY DATA LINK NOT ESTABLISHED'}</strong>
                  <span>{localSystemsStatus === 'online'
                    ? `Mount updated ${localSystemsUpdatedAt?.toLocaleTimeString() || 'now'}`
                    : localSystemsStatus === 'stale'
                      ? 'CPWI bridge telemetry is stale. Restart the bridge on the observatory PC.'
                      : hbg3Online
                        ? `Dew telemetry updated ${new Date(hbg3Record.captured_at).toLocaleTimeString()}`
                        : localSystemsError || hbg3Error || 'Start the CPWI and HBG3 bridges on the observatory computer.'}</span>
                </div>
              </div>

              <div className="missionConsoleSystemsGrid">
                <article className="missionConsoleSystemNode">
                  <div className="missionConsoleSystemNodeTitle"><Cpu size={18} /><span>CPWI / ASCOM MOUNT</span></div>
                  <div className="missionConsoleMountTabs" role="tablist" aria-label="CPWI mount views">
                    <button type="button" role="tab" aria-selected={cpwiMountTab === 'status'} className={cpwiMountTab === 'status' ? 'is-active' : ''} onClick={() => setCpwiMountTab('status')}>STATUS / CONTROL</button>
                    <button type="button" role="tab" aria-selected={cpwiMountTab === 'slew'} className={cpwiMountTab === 'slew' ? 'is-active' : ''} onClick={() => setCpwiMountTab('slew')}><Crosshair size={16} /> SLEW / TARGET</button>
                  </div>

                  {cpwiMountTab === 'status' ? <>
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
                  </> : <div className="missionConsoleSlewPanel">
                    <div className="missionConsoleSlewDivider"><span>OBJECT TARGETING</span></div>

                    <label className="missionConsoleSlewField">
                      <span>TARGET DATABASE</span>
                      <select value={selectedSlewTarget} onChange={(event) => { setSelectedSlewTarget(event.target.value); setSlewClearanceConfirmed(false); }}>
                        {CPWI_SLEW_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                    </label>

                    {selectedSlewTarget === 'manual' ? <div className="missionConsoleSlewCoordinateInputs">
                      <label className="missionConsoleSlewField"><span>RA // DECIMAL HOURS</span><input type="number" min="0" max="23.999999" step="0.0001" value={manualSlewRa} onChange={(event) => setManualSlewRa(event.target.value)} placeholder="16.6949" /></label>
                      <label className="missionConsoleSlewField"><span>DEC // DEGREES</span><input type="number" min="-90" max="90" step="0.0001" value={manualSlewDec} onChange={(event) => setManualSlewDec(event.target.value)} placeholder="36.4602" /></label>
                    </div> : null}

                    <div className="missionConsoleSlewReadout">
                      <div><span>SELECTED TARGET</span><strong>{selectedSlewRecord.name}</strong></div>
                      <div><span>RIGHT ASCENSION</span><strong>{Number.isFinite(selectedSlewRaHours) ? `${selectedSlewRaHours.toFixed(4)}h` : '—'}</strong></div>
                      <div><span>DECLINATION</span><strong>{Number.isFinite(selectedSlewDecDegrees) ? `${selectedSlewDecDegrees.toFixed(4)}°` : '—'}</strong></div>
                      <div><span>EST. ALTITUDE NOW</span><strong className={selectedSlewAltitude !== null && selectedSlewAltitude < 10 ? 'is-danger' : ''}>{selectedSlewAltitude === null ? '—' : `${selectedSlewAltitude.toFixed(1)}°`}</strong></div>
                    </div>

                    <label className="missionConsoleSlewClearance">
                      <input type="checkbox" checked={slewClearanceConfirmed} onChange={(event) => setSlewClearanceConfirmed(event.target.checked)} />
                      <span>I VERIFIED TUBE, CAMERA, DEW, POWER, AND FORK CLEARANCE</span>
                    </label>

                    <div className="missionConsoleSlewActions">
                      <button type="button" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected || localSystems?.cpwi?.slewing || localSystems?.cpwi?.parked || !slewClearanceConfirmed} onClick={slewToSelectedTarget}><Crosshair size={18} /> SLEW TO TARGET</button>
                      <button type="button" className="is-emergency" disabled={Boolean(cpwiControlBusy) || !localSystems?.cpwi?.connected} onClick={() => runCpwiControl('abortSlew')}>ABORT SLEW</button>
                    </div>
                    <p className="missionConsoleSlewNotice">Catalog coordinates are fixed equatorial coordinates. Verify the selected target is above local obstructions before commanding the mount.</p>
                  </div>}

                  {cpwiControlBusy ? <div className="missionConsoleMountControlMessage">COMMAND IN PROGRESS // {cpwiControlBusy.toUpperCase()}</div> : null}
                  {cpwiControlError ? <div className="missionConsoleMountControlMessage is-error">{cpwiControlError}</div> : null}
                </article>

                <article className="missionConsoleSystemNode missionConsoleFocuserNode">
                  <div className="missionConsoleSystemNodeTitle"><Focus size={18} /><span>CELESTRON FOCUS CONTROL</span></div>
                  <div className="missionConsoleSystemMetrics">
                    <div><span>LINK</span><strong>{focuserStatus === 'online' ? 'ONLINE' : focuserStatus === 'stale' ? 'STALE' : 'OFFLINE'}</strong></div>
                    <div><span>CONNECTION</span><strong>{focuserRecord?.payload?.connected ? 'CONNECTED' : 'DISCONNECTED'}</strong></div>
                    <div><span>POSITION</span><strong>{focuserRecord?.payload?.position ?? '—'}</strong></div>
                    <div><span>MOTION</span><strong>{focuserRecord?.payload?.isMoving ? 'MOVING' : focuserRecord?.payload?.connected ? 'IDLE' : '—'}</strong></div>
                    <div><span>MAX TRAVEL</span><strong>{focuserRecord?.payload?.maxStep ?? '—'}</strong></div>
                    <div><span>MAX INCREMENT</span><strong>{focuserRecord?.payload?.maxIncrement ?? '—'}</strong></div>
                    <div><span>TEMPERATURE</span><strong>{bridgeNumber(celsiusToFahrenheit(focuserRecord?.payload?.temperatureC), 1, '°F')}</strong></div>
                    <div><span>LAST UPDATE</span><strong>{focuserRecord?.updated_at ? new Date(focuserRecord.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}</strong></div>
                  </div>

                  <div className="missionConsoleFocuserControls">
                    <div className="missionConsoleFocuserConnection">
                      <button type="button" disabled={Boolean(focuserControlBusy) || focuserRecord?.payload?.connected} onClick={() => runFocuserControl('connect')}>CONNECT FOCUSER</button>
                      <button type="button" disabled={Boolean(focuserControlBusy) || !focuserRecord?.payload?.connected} onClick={() => runFocuserControl('disconnect')}>DISCONNECT</button>
                    </div>

                    <div className="missionConsoleFocuserStepPanel">
                      <span>MOVE INCREMENTS</span>
                      <div className="missionConsoleFocuserStepChoices">
                        {[1, 10, 50, 100, 500, 1000].map((steps) => (
                          <button key={steps} type="button" className={Number(focuserStepSize) === steps ? 'is-active' : ''} onClick={() => setFocuserStepSize(steps)}>{steps}</button>
                        ))}
                      </div>
                    </div>

                    <div className="missionConsoleFocuserMoveRow">
                      <button type="button" disabled={Boolean(focuserControlBusy) || !focuserRecord?.payload?.connected || focuserRecord?.payload?.isMoving} onClick={() => moveFocuserRelative('in')}><ArrowLeft size={20} /> IN</button>
                      <div><small>CURRENT POSITION</small><strong>{focuserRecord?.payload?.position ?? '—'}</strong><span>± {focuserStepSize} STEPS</span></div>
                      <button type="button" disabled={Boolean(focuserControlBusy) || !focuserRecord?.payload?.connected || focuserRecord?.payload?.isMoving} onClick={() => moveFocuserRelative('out')}>OUT <ArrowRight size={20} /></button>
                    </div>

                    <div className="missionConsoleFocuserAbsolute">
                      <label><span>ABSOLUTE POSITION</span><input type="number" min="0" max={focuserRecord?.payload?.maxStep || undefined} step="1" value={focuserTargetPosition} onChange={(event) => setFocuserTargetPosition(event.target.value)} /></label>
                      <button type="button" disabled={Boolean(focuserControlBusy) || !focuserRecord?.payload?.connected || focuserRecord?.payload?.isMoving} onClick={moveFocuserAbsolute}>GO TO POSITION</button>
                    </div>

                    <button type="button" className="missionConsoleFocuserHalt" disabled={!focuserRecord?.payload?.connected} onClick={() => runFocuserControl('halt')}>HALT FOCUSER MOTION</button>
                    {focuserControlBusy ? <div className="missionConsoleMountControlMessage">COMMAND IN PROGRESS // {focuserControlBusy.toUpperCase()}</div> : null}
                    {focuserControlMessage ? <div className="missionConsoleMountControlMessage">{focuserControlMessage}</div> : null}
                    {focuserControlError || focuserError ? <div className="missionConsoleMountControlMessage is-error">{focuserControlError || focuserError}</div> : null}
                  </div>
                </article>

                <article className="missionConsoleSystemNode missionConsoleDewNode">
                  <div className="missionConsoleSystemNodeTitle"><Thermometer size={18} /><span>DEW CONTROL</span></div>
                  <div className="missionConsoleSystemMetrics">
                    <div><span>HBG3 LINK</span><strong>{hbg3Online ? 'ONLINE' : hbg3Record ? 'STALE' : 'OFFLINE'}</strong></div>
                    <div><span>AMBIENT</span><strong>{bridgeNumber(celsiusToFahrenheit(hbg3Environment?.ambientC), 1, '°F')}</strong></div>
                    <div><span>HUMIDITY</span><strong>{bridgeNumber(hbg3Environment?.humidityPercent, 0, '%')}</strong></div>
                    <div><span>DEW POINT</span><strong>{bridgeNumber(celsiusToFahrenheit(hbg3Environment?.dewPointC), 1, '°F')}</strong></div>
                    <div><span>DEW MARGIN</span><strong>{bridgeNumber(celsiusDeltaToFahrenheit(hbg3Environment?.dewMarginC), 1, '°F')}</strong></div>
                    <div><span>HEATER OUTPUT</span><strong>{bridgeNumber(hbg3Channel1?.pwmPercent, 0, '%')}</strong></div>
                    <div><span>CONTROL MODE</span><strong>{hbg3Channel1 ? hbg3ControlMode : '—'}</strong></div>
                    <div><span>RISK STATE</span><strong>{hbg3RiskState}</strong></div>
                    <div><span>RING TEMP</span><strong>{hbg3Sensor1 ? bridgeNumber(celsiusToFahrenheit(hbg3Channel1?.temperatureC), 1, '°F') : '—'}</strong></div>
                    <div><span>CURRENT DRAW</span><strong>{bridgeNumber(hbg3Channel1?.amps, 2, ' A')}</strong></div>
                    <div><span>SUPPLY</span><strong>{bridgeNumber(hbg3Environment?.supplyVolts, 2, ' V')}</strong></div>
                    <div><span>LAST UPDATE</span><strong>{hbg3Record?.captured_at ? new Date(hbg3Record.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}</strong></div>
                  </div>

                  <div className="missionConsoleDewControls">
                    <div className="missionConsoleDewMode" role="group" aria-label="Dew heater mode">
                      <button type="button" className={dewControlMode === 'auto' ? 'is-active' : ''} onClick={() => { setDewControlMode('auto'); setDewControlDirty(true); setDewControlMessage(''); setDewControlError(''); }}>AUTOMATIC</button>
                      <button type="button" className={dewControlMode === 'manual' ? 'is-active' : ''} onClick={() => { setDewControlMode('manual'); setDewControlDirty(true); setDewControlMessage(''); setDewControlError(''); }}>MANUAL</button>
                    </div>

                    {dewControlMode === 'auto' ? (
                      <label className="missionConsoleDewSlider">
                        <span><b>AUTO AGGRESSION</b><strong>{dewAggression} / 10</strong></span>
                        <input type="range" min="1" max="10" step="1" value={dewAggression} onChange={(event) => { setDewAggression(Number(event.target.value)); setDewControlDirty(true); }} />
                        <small>Higher settings maintain a larger temperature margin above the dew point.</small>
                      </label>
                    ) : (
                      <label className="missionConsoleDewSlider">
                        <span><b>MANUAL HEATER OUTPUT</b><strong>{dewManualOutput}%</strong></span>
                        <input type="range" min="0" max="100" step="5" value={dewManualOutput} onChange={(event) => { setDewManualOutput(Number(event.target.value)); setDewControlDirty(true); }} />
                        <small>Direct PWM output. Use only enough heat to keep the corrector clear.</small>
                      </label>
                    )}

                    <div className="missionConsoleDewActions">
                      <button type="button" disabled={!hbg3Online || Boolean(dewControlBusy)} onClick={() => runDewControl()}>{dewControlBusy ? 'TRANSMITTING…' : 'APPLY DEW SETTINGS'}</button>
                      <button type="button" className="is-off" disabled={!hbg3Online || Boolean(dewControlBusy)} onClick={shutDownDewHeater}>HEATER OFF</button>
                    </div>
                    {!hbg3Online ? <div className="missionConsoleMountControlMessage is-error">HBG3 LINK REQUIRED FOR REMOTE CONTROL</div> : null}
                    {dewControlMessage ? <div className="missionConsoleMountControlMessage">{dewControlMessage}</div> : null}
                    {dewControlError ? <div className="missionConsoleMountControlMessage is-error">{dewControlError}</div> : null}
                  </div>
                </article>

                <article className="missionConsoleSystemNode missionConsoleSystemNodeWide">
                  <div className="missionConsoleSystemNodeTitle"><Radio size={18} /><span>BRIDGE DIAGNOSTICS</span></div>
                  <div className="missionConsoleSystemDiagnostics">
                    <span><Wifi size={15} /> {localSystems?.bridge?.host || 'OBSERVATORY PC'} // {localSystems?.bridge?.version || 'CPWI RELAY NOT DETECTED'}</span>
                    <span>CPWI: {localSystemsStatus === 'online' ? 'SUPABASE RELAY ONLINE' : localSystemsStatus.toUpperCase()} // {localSystems?.cpwi?.driver || 'NOT REPORTED'}</span>
                    <span>HBG3: {hbg3Online ? 'SUPABASE RELAY ONLINE' : hbg3Error ? `ERROR // ${hbg3Error}` : hbg3Record ? 'TELEMETRY STALE' : 'NOT REPORTED'}</span>
                    <span>FOCUSER: {focuserStatus === 'online' ? 'SUPABASE RELAY ONLINE' : focuserStatus === 'stale' ? 'TELEMETRY STALE' : focuserError ? `ERROR // ${focuserError}` : 'NOT REPORTED'}</span>
                    {localSystems?.warnings?.length ? <span className="missionConsoleSystemWarning">{localSystems.warnings.join(' // ')}</span> : null}
                  </div>
                </article>
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
