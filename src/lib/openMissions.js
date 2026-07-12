export const OPEN_MISSION_TARGETS = [
  { title: 'M27 Dumbbell Nebula', shortTitle: 'M27', constellation: 'Vulpecula', objectType: 'Planetary Nebula', ra: 19.993, dec: 22.721, difficulty: 2, capturePlan: '500 × 10 SEC', equipment: 'ASI294MC // CPC 800 // F/6.3', objective: 'CAPTURE A CLEAN, DEEP COLOR RECORD OF THE DUMBBELL NEBULA' },
  { title: 'M57 Ring Nebula', shortTitle: 'M57', constellation: 'Lyra', objectType: 'Planetary Nebula', ra: 18.894, dec: 33.029, difficulty: 2, capturePlan: '600 × 5 SEC', equipment: 'ASI294MC // CPC 800 // NATIVE OR F/6.3', objective: 'RESOLVE THE RING STRUCTURE AND CENTRAL FIELD STARS' },
  { title: 'M13 Hercules Cluster', shortTitle: 'M13', constellation: 'Hercules', objectType: 'Globular Cluster', ra: 16.695, dec: 36.461, difficulty: 1, capturePlan: '300 × 5 SEC', equipment: 'ASI294MC // CPC 800 // F/6.3', objective: 'RESOLVE THE CLUSTER CORE WITHOUT BLOWING OUT THE BRIGHTEST STARS' },
  { title: 'Albireo', shortTitle: 'β Cygni', constellation: 'Cygnus', objectType: 'Double Star', ra: 19.512, dec: 27.96, difficulty: 1, capturePlan: 'SHORT EXPOSURES // COLOR-PRIORITY STACK', equipment: 'ASI294MC // CPC 800 // NATIVE', objective: 'CAPTURE THE BLUE AND GOLD COLOR CONTRAST' },
  { title: 'Cat’s Eye Nebula', shortTitle: 'NGC 6543', constellation: 'Draco', objectType: 'Planetary Nebula', ra: 17.972, dec: 66.633, difficulty: 3, capturePlan: 'HIGH GAIN // SHORT EXPOSURES // LUCKY STACK', equipment: 'ASI294MC // CPC 800 // NATIVE', objective: 'RESOLVE THE SMALL BRIGHT CORE WITH MAXIMUM DETAIL' },
  { title: 'Pillars of Creation', shortTitle: 'M16 Eagle Nebula', constellation: 'Serpens', objectType: 'Emission Nebula', ra: 18.313, dec: -13.781, difficulty: 4, capturePlan: '900 × 10 SEC', equipment: 'ASI294MC // CPC 800 // F/6.3', objective: 'CAPTURE THE CENTRAL EAGLE NEBULA REGION NEAR CULMINATION' },
  { title: 'North America Nebula', shortTitle: 'NGC 7000', constellation: 'Cygnus', objectType: 'Emission Nebula', ra: 20.973, dec: 44.317, difficulty: 4, capturePlan: 'WIDE-FIELD MOSAIC OR REDUCED-FIELD STACK', equipment: 'ASI294MC // F/6.3 // UHC OPTIONAL', objective: 'CAPTURE A RECOGNIZABLE HIGH-CONTRAST SECTION OF THE NEBULA' },
  { title: 'Veil Nebula', shortTitle: 'NGC 6960/6992', constellation: 'Cygnus', objectType: 'Supernova Remnant', ra: 20.755, dec: 30.75, difficulty: 4, capturePlan: '900 × 10 SEC // FILTER RECOMMENDED', equipment: 'ASI294MC // F/6.3 // UHC', objective: 'ISOLATE A BRIGHT FILAMENT OF THE VEIL COMPLEX' },
  { title: 'M31 Andromeda Galaxy', shortTitle: 'M31', constellation: 'Andromeda', objectType: 'Galaxy', ra: 0.712, dec: 41.269, difficulty: 3, capturePlan: '600 × 10 SEC // CORE-SAFE EXPOSURE', equipment: 'ASI294MC // CPC 800 // F/6.3', objective: 'CAPTURE THE CORE AND INNER DUST-LANE REGION' },
  { title: 'Double Cluster', shortTitle: 'NGC 869/884', constellation: 'Perseus', objectType: 'Open Cluster', ra: 2.333, dec: 57.133, difficulty: 1, capturePlan: '300 × 5 SEC', equipment: 'ASI294MC // CPC 800 // F/6.3', objective: 'FRAME BOTH CLUSTERS WITH NATURAL STAR COLOR' }
];

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

export function altitudeForTarget(target, date, site) {
  const hourAngle = radians((localSiderealHours(date, site.lon) - target.ra) * 15);
  const latitude = radians(site.lat);
  const declination = radians(target.dec);
  return degrees(Math.asin(
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  ));
}

function localNightSamples(now) {
  const start = new Date(now);
  start.setHours(19, 0, 0, 0);
  if (now.getHours() >= 5 && now.getHours() < 19) {
    // Tonight begins at 7 PM today.
  } else if (now.getHours() < 5) {
    start.setDate(start.getDate() - 1);
  }
  return Array.from({ length: 19 }, (_, index) => new Date(start.getTime() + index * 30 * 60000));
}

export function rankOpenMissions(site, now = new Date()) {
  const samples = localNightSamples(now);
  return OPEN_MISSION_TARGETS.map((target) => {
    const altitudes = samples.map((date) => ({ date, altitude: altitudeForTarget(target, date, site) }));
    const best = altitudes.reduce((winner, sample) => sample.altitude > winner.altitude ? sample : winner, altitudes[0]);
    const nowAltitude = altitudeForTarget(target, now, site);
    const duration = altitudes.filter((sample) => sample.altitude >= 30).length * 0.5;
    const score = Math.round(best.altitude * 1.25 + Math.min(duration, 6) * 5 - target.difficulty * 8 + (nowAltitude >= 25 ? 8 : 0));
    const rating = best.altitude >= 55 && target.difficulty <= 2 ? 'PRIME TARGET' : best.altitude >= 40 ? 'GOOD OPPORTUNITY' : best.altitude >= 25 ? 'CHALLENGING' : 'LOW PRIORITY';
    return {
      ...target,
      bestAltitude: Math.round(best.altitude),
      currentAltitude: Math.round(nowAltitude),
      bestTime: best.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      hoursAbove30: duration,
      score,
      rating,
      visibleTonight: best.altitude >= 20
    };
  }).filter((target) => target.visibleTonight).sort((a, b) => b.score - a.score);
}

export function missionSlug(value) {
  return String(value || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'target';
}
