import { useEffect, useMemo, useRef, useState } from 'react';
import { Body, Observer, Equator, Illumination } from 'astronomy-engine';

const SITE = {
  name: 'Eliot, ME',
  lat: 43.1531,
  lon: -70.7828
};

const MAP_SIZE = 1000;
const CENTER = MAP_SIZE / 2;
const RADIUS = 430;

const DESKTOP_DEFAULT_ZOOM = 0.68;
const MOBILE_DEFAULT_ZOOM = 1.0;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 700;
}

function getDefaultZoom() {
  return isMobileViewport() ? MOBILE_DEFAULT_ZOOM : DESKTOP_DEFAULT_ZOOM;
}

function getMinZoom() {
  return isMobileViewport() ? 0.75 : 0.55;
}

function getMaxZoom() {
  return isMobileViewport() ? 2.5 : 1.25;
}

function getDefaultPan() {
  return { x: 0, y: 0 };
}

function getMaxPanForZoom(zoom) {
  const defaultZoom = getDefaultZoom();

  if (zoom <= defaultZoom + 0.02) {
    return { x: 0, y: 0 };
  }

  const isMobile = isMobileViewport();
  const extraZoom = zoom - defaultZoom;

  // Pan is measured in screen pixels because translate happens after scale.
  // This gives mobile enough travel at 200%+ without letting the chart drift away entirely.
  const x = clamp(extraZoom * (isMobile ? 310 : 360), 0, isMobile ? 520 : 620);
  const y = clamp(extraZoom * (isMobile ? 360 : 400), 0, isMobile ? 600 : 700);

  return { x, y };
}

function clampPanForZoom(pan, zoom) {
  const maxPan = getMaxPanForZoom(zoom);

  return {
    x: clamp(pan.x, -maxPan.x, maxPan.x),
    y: clamp(pan.y, -maxPan.y, maxPan.y)
  };
}

function createBackgroundStars(count = 360) {
  let seed = 314159;

  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  return Array.from({ length: count }).map((_, index) => {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (RADIUS - 10);

    return {
      id: index,
      x: CENTER + Math.cos(angle) * radius,
      y: CENTER + Math.sin(angle) * radius,
      r: 0.55 + random() * 1.25,
      opacity: 0.16 + random() * 0.44
    };
  });
}

const BACKGROUND_STARS = createBackgroundStars();

const FUTURE_TARGETS = [
  {
    title: 'Fireworks Galaxy',
    shortTitle: 'NGC 6946',
    constellation: 'Cepheus',
    objectType: 'Galaxy',
    ra: 20.581,
    dec: 60.154,
    priority: 'High',
    bestSeason: 'Late summer / fall',
    gear: 'Camera preferred; dark, moonless sky helps a lot',
    notes: 'Beautiful face-on galaxy near Cepheus/Cygnus. A challenging but worthwhile future target once tracking and camera workflow are dialed in.'
  },
  {
    title: 'M51 Whirlpool Galaxy',
    shortTitle: 'M51',
    constellation: 'Canes Venatici',
    objectType: 'Galaxy',
    ra: 13.498,
    dec: 47.195,
    priority: 'High',
    bestSeason: 'Spring / early summer',
    gear: 'Camera preferred; best on darker, moonless nights',
    notes: 'Beautiful galaxy pair, but it needs dark sky and careful tracking. Better when high in the west/northwest.'
  },
  {
    title: 'Cat’s Eye Nebula',
    shortTitle: 'NGC 6543',
    constellation: 'Draco',
    objectType: 'Planetary Nebula',
    ra: 17.972,
    dec: 66.633,
    priority: 'Medium',
    bestSeason: 'Summer',
    gear: 'High power; small bright target',
    notes: 'Tiny but bright planetary nebula. A good challenge target for the CPC 800.'
  },
  {
    title: 'North America Nebula',
    shortTitle: 'NGC 7000',
    constellation: 'Cygnus',
    objectType: 'Emission Nebula',
    ra: 20.973,
    dec: 44.317,
    priority: 'Medium',
    bestSeason: 'Summer / fall',
    gear: 'Wide field camera and UHC/filter help a lot',
    notes: 'Very large nebula near Deneb. Better for camera/wide field than high magnification visual work.'
  },
  {
    title: 'Veil Nebula',
    shortTitle: 'Veil',
    constellation: 'Cygnus',
    objectType: 'Supernova Remnant',
    ra: 20.755,
    dec: 30.75,
    priority: 'Medium',
    bestSeason: 'Summer / fall',
    gear: 'UHC/OIII-style filter strongly recommended',
    notes: 'Huge, delicate supernova remnant. Excellent future project with the right filter and dark sky.'
  },
  {
    title: 'M31 Andromeda Galaxy',
    shortTitle: 'M31',
    constellation: 'Andromeda',
    objectType: 'Galaxy',
    ra: 0.712,
    dec: 41.269,
    priority: 'High',
    bestSeason: 'Fall',
    gear: 'Wide field camera; reducer helps',
    notes: 'Huge target. Gorgeous, but too large for tight SCT framing without a reducer or mosaic.'
  },
  {
    title: 'Double Cluster',
    shortTitle: 'Double Cluster',
    constellation: 'Perseus',
    objectType: 'Open Cluster',
    ra: 2.333,
    dec: 57.133,
    priority: 'High',
    bestSeason: 'Fall / winter',
    gear: 'Low power eyepiece or camera',
    notes: 'Bright, easy, beautiful pair of clusters. Great visual target and a good future photo subject.'
  },
  {
    title: 'Saturn',
    shortTitle: 'Saturn',
    constellation: 'Solar System',
    objectType: 'Planet',
    ra: null,
    dec: null,
    body: Body.Saturn,
    priority: 'High',
    bestSeason: 'When high after midnight',
    gear: 'High power eyepiece, video capture, lucky imaging',
    notes: 'Excellent planetary target when it climbs high enough. Seeing matters more than darkness.'
  },
  {
    title: 'Jupiter',
    shortTitle: 'Jupiter',
    constellation: 'Solar System',
    objectType: 'Planet',
    ra: null,
    dec: null,
    body: Body.Jupiter,
    priority: 'High',
    bestSeason: 'When high late night / morning',
    gear: 'High power eyepiece, video capture, lucky imaging',
    notes: 'Great for cloud bands and moons. Best when it is high above the horizon.'
  }
];

const FUTURE_TARGET_GUIDES = {
  'Fireworks Galaxy': {
    guideConstellation: 'Cepheus',
    anchorStars: ['Alderamin', 'Delta Cep', 'Zeta Cep'],
    finderNote: 'Use Cepheus as the finder frame. Fireworks Galaxy sits near the Cepheus/Cygnus border, so Deneb and the Cepheus house are useful anchors.'
  },
  'M51 Whirlpool Galaxy': {
    guideConstellation: 'Canes Venatici',
    anchorStars: ['Cor Caroli', 'Chara'],
    finderNote: 'Start with Cor Caroli in Canes Venatici. M51 is north of the Big Dipper handle region and benefits from dark sky.'
  },
  'Cat’s Eye Nebula': {
    guideConstellation: 'Draco',
    anchorStars: ['Eltanin', 'Rastaban', 'Kuma'],
    finderNote: 'Use the Draco head stars Eltanin and Rastaban as the main finder region. The target is small, bright, and rewards higher power.'
  },
  'North America Nebula': {
    guideConstellation: 'Cygnus',
    anchorStars: ['Deneb', 'Sadr'],
    finderNote: 'Use Deneb as the anchor. This is a wide, diffuse nebula; a camera and filter will help far more than magnification.'
  },
  'Veil Nebula': {
    guideConstellation: 'Cygnus',
    anchorStars: ['Deneb', 'Gienah', 'Sadr'],
    finderNote: 'Use the eastern wing of Cygnus as the guide. This is huge and faint, so an OIII/UHC-style filter is the secret weapon.'
  },
  'M31 Andromeda Galaxy': {
    guideConstellation: 'Andromeda',
    anchorStars: ['Alpheratz', 'Mirach', 'Mu And', 'Nu And'],
    finderNote: 'Trace from Alpheratz to Mirach, then hop through Mu/Nu Andromedae. M31 is huge, so wide-field framing is best.'
  },
  'Double Cluster': {
    guideConstellation: 'Perseus',
    anchorStars: ['Mirfak', 'Eta Per', 'Delta Per'],
    finderNote: 'Look between Perseus and Cassiopeia. This is one of the friendliest visual targets and looks great at low power.'
  },
  Saturn: {
    guideConstellation: 'Solar System',
    anchorStars: [],
    finderNote: 'Planetary target. Wait until it is high above the horizon and use steady seeing, high power, and video capture.'
  },
  Jupiter: {
    guideConstellation: 'Solar System',
    anchorStars: [],
    finderNote: 'Planetary target. Best when high in steady air; video capture and lucky imaging help reveal bands and moons.'
  }
};

const STAR_CATALOG = [
  { name: 'Polaris', ra: 2.5303, dec: 89.2641, mag: 2.0 },
  { name: 'Dubhe', ra: 11.0621, dec: 61.7510, mag: 1.8 },
  { name: 'Merak', ra: 11.0307, dec: 56.3824, mag: 2.4 },
  { name: 'Phecda', ra: 11.8972, dec: 53.6948, mag: 2.4 },
  { name: 'Megrez', ra: 12.2571, dec: 57.0326, mag: 3.3 },
  { name: 'Alioth', ra: 12.9004, dec: 55.9598, mag: 1.8 },
  { name: 'Mizar', ra: 13.3987, dec: 54.9254, mag: 2.2 },
  { name: 'Alkaid', ra: 13.7923, dec: 49.3133, mag: 1.9 },
  { name: 'Caph', ra: 0.1529, dec: 59.1498, mag: 2.3 },
  { name: 'Schedar', ra: 0.6751, dec: 56.5373, mag: 2.2 },
  { name: 'Gamma Cas', ra: 0.9451, dec: 60.7167, mag: 2.2 },
  { name: 'Ruchbah', ra: 1.4303, dec: 60.2353, mag: 2.7 },
  { name: 'Segin', ra: 2.2939, dec: 63.6701, mag: 3.4 },
  { name: 'Vega', ra: 18.6156, dec: 38.7837, mag: 0.0 },
  { name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.3 },
  { name: 'Altair', ra: 19.8464, dec: 8.8683, mag: 0.8 },
  { name: 'Zeta Lyr', ra: 18.7462, dec: 37.6051, mag: 4.3 },
  { name: 'Delta2 Lyr', ra: 18.9080, dec: 36.8986, mag: 4.3 },
  { name: 'Sheliak', ra: 18.8347, dec: 33.3627, mag: 3.5 },
  { name: 'Sulafat', ra: 18.9824, dec: 32.6896, mag: 3.3 },
  { name: 'Sadr', ra: 20.3705, dec: 40.2567, mag: 2.2 },
  { name: 'Gienah', ra: 20.7702, dec: 33.9703, mag: 2.5 },
  { name: 'Delta Cyg', ra: 19.7496, dec: 45.1308, mag: 2.9 },
  { name: 'Albireo', ra: 19.5126, dec: 27.9597, mag: 3.1 },
  { name: 'Eta Her', ra: 16.7149, dec: 38.9223, mag: 3.5 },
  { name: 'Zeta Her', ra: 16.6881, dec: 31.6032, mag: 2.8 },
  { name: 'Epsilon Her', ra: 17.0048, dec: 30.9263, mag: 3.9 },
  { name: 'Pi Her', ra: 17.2505, dec: 36.8092, mag: 3.1 },
  { name: 'Kornephoros', ra: 16.5037, dec: 21.4896, mag: 2.8 },
  { name: 'Rasalgethi', ra: 17.2441, dec: 14.3903, mag: 3.1 },
  { name: 'Anser', ra: 19.4784, dec: 24.6649, mag: 4.4 },
  { name: 'Nunki', ra: 18.9211, dec: -26.2967, mag: 2.0 },
  { name: 'Kaus Australis', ra: 18.4029, dec: -34.3846, mag: 1.8 },
  { name: 'Ascella', ra: 19.0435, dec: -29.8801, mag: 2.6 },
  { name: 'Kaus Media', ra: 18.3499, dec: -29.8281, mag: 2.7 },
  { name: 'Kaus Borealis', ra: 18.4662, dec: -25.4217, mag: 2.8 },

  // Future target finder constellations
  { name: 'Alderamin', ra: 21.3096, dec: 62.5856, mag: 2.5 },
  { name: 'Alfirk', ra: 21.4777, dec: 70.5607, mag: 3.2 },
  { name: 'Errai', ra: 23.6558, dec: 77.6323, mag: 3.2 },
  { name: 'Zeta Cep', ra: 22.1809, dec: 58.2012, mag: 3.4 },
  { name: 'Delta Cep', ra: 22.4862, dec: 58.4152, mag: 3.7 },

  { name: 'Cor Caroli', ra: 12.9338, dec: 38.3184, mag: 2.9 },
  { name: 'Chara', ra: 12.5624, dec: 41.3575, mag: 4.2 },
  { name: 'La Superba', ra: 12.7606, dec: 45.4403, mag: 5.0 },

  { name: 'Eltanin', ra: 17.9434, dec: 51.4889, mag: 2.2 },
  { name: 'Rastaban', ra: 17.5072, dec: 52.3014, mag: 2.8 },
  { name: 'Kuma', ra: 17.5369, dec: 55.1841, mag: 4.9 },
  { name: 'Thuban', ra: 14.0732, dec: 64.3758, mag: 3.7 },
  { name: 'Edasich', ra: 15.4155, dec: 58.9661, mag: 3.3 },
  { name: 'Giausar', ra: 17.1464, dec: 65.7147, mag: 4.6 },

  { name: 'Alpheratz', ra: 0.1398, dec: 29.0904, mag: 2.1 },
  { name: 'Mirach', ra: 1.1622, dec: 35.6206, mag: 2.1 },
  { name: 'Almach', ra: 2.0650, dec: 42.3297, mag: 2.1 },
  { name: 'Mu And', ra: 0.9451, dec: 38.4993, mag: 3.9 },
  { name: 'Nu And', ra: 0.8302, dec: 41.0793, mag: 4.5 },

  { name: 'Mirfak', ra: 3.4054, dec: 49.8612, mag: 1.8 },
  { name: 'Algol', ra: 3.1361, dec: 40.9556, mag: 2.1 },
  { name: 'Atik', ra: 3.9022, dec: 31.8836, mag: 3.8 },
  { name: 'Delta Per', ra: 3.7154, dec: 47.7876, mag: 3.0 },
  { name: 'Eta Per', ra: 2.8449, dec: 55.8955, mag: 3.8 }
];

const CONSTELLATION_SEGMENTS = [
  { group: 'Ursa Major', stars: ['Dubhe', 'Merak'] },
  { group: 'Ursa Major', stars: ['Merak', 'Phecda'] },
  { group: 'Ursa Major', stars: ['Phecda', 'Megrez'] },
  { group: 'Ursa Major', stars: ['Megrez', 'Dubhe'] },
  { group: 'Ursa Major', stars: ['Megrez', 'Alioth'] },
  { group: 'Ursa Major', stars: ['Alioth', 'Mizar'] },
  { group: 'Ursa Major', stars: ['Mizar', 'Alkaid'] },
  { group: 'Cassiopeia', stars: ['Caph', 'Schedar'] },
  { group: 'Cassiopeia', stars: ['Schedar', 'Gamma Cas'] },
  { group: 'Cassiopeia', stars: ['Gamma Cas', 'Ruchbah'] },
  { group: 'Cassiopeia', stars: ['Ruchbah', 'Segin'] },
  { group: 'Hercules', stars: ['Eta Her', 'Zeta Her'] },
  { group: 'Hercules', stars: ['Zeta Her', 'Epsilon Her'] },
  { group: 'Hercules', stars: ['Epsilon Her', 'Pi Her'] },
  { group: 'Hercules', stars: ['Pi Her', 'Eta Her'] },
  { group: 'Hercules', stars: ['Zeta Her', 'Kornephoros'] },
  { group: 'Hercules', stars: ['Epsilon Her', 'Rasalgethi'] },
  { group: 'Lyra', stars: ['Vega', 'Zeta Lyr'] },
  { group: 'Lyra', stars: ['Zeta Lyr', 'Delta2 Lyr'] },
  { group: 'Lyra', stars: ['Delta2 Lyr', 'Sheliak'] },
  { group: 'Lyra', stars: ['Sheliak', 'Sulafat'] },
  { group: 'Lyra', stars: ['Sulafat', 'Zeta Lyr'] },
  { group: 'Cygnus', stars: ['Deneb', 'Sadr'] },
  { group: 'Cygnus', stars: ['Sadr', 'Albireo'] },
  { group: 'Cygnus', stars: ['Sadr', 'Gienah'] },
  { group: 'Cygnus', stars: ['Sadr', 'Delta Cyg'] },
  { group: 'Vulpecula', stars: ['Albireo', 'Anser'] },
  { group: 'Sagittarius', stars: ['Kaus Australis', 'Kaus Media'] },
  { group: 'Sagittarius', stars: ['Kaus Media', 'Kaus Borealis'] },
  { group: 'Sagittarius', stars: ['Kaus Borealis', 'Nunki'] },
  { group: 'Sagittarius', stars: ['Nunki', 'Ascella'] },
  { group: 'Sagittarius', stars: ['Ascella', 'Kaus Australis'] },

  { group: 'Cepheus', stars: ['Alderamin', 'Zeta Cep'] },
  { group: 'Cepheus', stars: ['Zeta Cep', 'Delta Cep'] },
  { group: 'Cepheus', stars: ['Delta Cep', 'Alfirk'] },
  { group: 'Cepheus', stars: ['Alfirk', 'Errai'] },
  { group: 'Cepheus', stars: ['Errai', 'Alderamin'] },
  { group: 'Cepheus', stars: ['Alderamin', 'Delta Cep'] },

  { group: 'Canes Venatici', stars: ['Cor Caroli', 'Chara'] },
  { group: 'Canes Venatici', stars: ['Cor Caroli', 'La Superba'] },

  { group: 'Draco', stars: ['Eltanin', 'Rastaban'] },
  { group: 'Draco', stars: ['Rastaban', 'Kuma'] },
  { group: 'Draco', stars: ['Kuma', 'Giausar'] },
  { group: 'Draco', stars: ['Giausar', 'Thuban'] },
  { group: 'Draco', stars: ['Thuban', 'Edasich'] },
  { group: 'Draco', stars: ['Edasich', 'Rastaban'] },

  { group: 'Andromeda', stars: ['Alpheratz', 'Mirach'] },
  { group: 'Andromeda', stars: ['Mirach', 'Almach'] },
  { group: 'Andromeda', stars: ['Mirach', 'Mu And'] },
  { group: 'Andromeda', stars: ['Mu And', 'Nu And'] },

  { group: 'Perseus', stars: ['Mirfak', 'Delta Per'] },
  { group: 'Perseus', stars: ['Delta Per', 'Algol'] },
  { group: 'Perseus', stars: ['Algol', 'Atik'] },
  { group: 'Perseus', stars: ['Mirfak', 'Eta Per'] }
];

const CONSTELLATION_LABEL_GROUPS = {
  Hercules: ['Eta Her', 'Zeta Her', 'Epsilon Her', 'Pi Her'],
  Lyra: ['Vega', 'Zeta Lyr', 'Sheliak', 'Sulafat'],
  Cygnus: ['Deneb', 'Sadr', 'Albireo', 'Gienah'],
  Vulpecula: ['Albireo', 'Anser'],
  'Ursa Major': ['Dubhe', 'Merak', 'Alioth', 'Mizar'],
  Cassiopeia: ['Caph', 'Schedar', 'Gamma Cas', 'Ruchbah'],
  Sagittarius: ['Nunki', 'Kaus Borealis', 'Kaus Australis', 'Ascella'],
  Cepheus: ['Alderamin', 'Alfirk', 'Errai', 'Delta Cep'],
  'Canes Venatici': ['Cor Caroli', 'Chara', 'La Superba'],
  Draco: ['Eltanin', 'Rastaban', 'Kuma', 'Thuban', 'Edasich'],
  Andromeda: ['Alpheratz', 'Mirach', 'Almach', 'Mu And'],
  Perseus: ['Mirfak', 'Algol', 'Delta Per', 'Eta Per']
};

const CONSTELLATION_LABEL_OFFSETS = {
  Hercules: { x: -10, y: -28 },
  Lyra: { x: -10, y: -18 },
  Cygnus: { x: 0, y: 28 },
  Vulpecula: { x: 10, y: -18 },
  'Ursa Major': { x: 40, y: 18 },
  Cassiopeia: { x: -10, y: -18 },
  Sagittarius: { x: 0, y: 24 },
  Cepheus: { x: 4, y: -18 },
  'Canes Venatici': { x: 0, y: -18 },
  Draco: { x: 0, y: -18 },
  Andromeda: { x: 12, y: -18 },
  Perseus: { x: 0, y: -18 }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeHours(hours) {
  return ((hours % 24) + 24) % 24;
}

function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function localSiderealTime(date, longitudeDegrees) {
  const jd = julianDate(date);
  const t = (jd - 2451545.0) / 36525.0;

  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;

  gmst = normalizeDegrees(gmst);

  return normalizeDegrees(gmst + longitudeDegrees) / 15;
}

function raDecToAltAz(raHours, decDegrees, date, latitudeDegrees, longitudeDegrees) {
  const lstHours = localSiderealTime(date, longitudeDegrees);
  let hourAngleHours = lstHours - raHours;

  if (hourAngleHours > 12) hourAngleHours -= 24;
  if (hourAngleHours < -12) hourAngleHours += 24;

  const hourAngleRadians = toRadians(hourAngleHours * 15);
  const decRadians = toRadians(decDegrees);
  const latRadians = toRadians(latitudeDegrees);

  const sinAlt =
    Math.sin(decRadians) * Math.sin(latRadians) +
    Math.cos(decRadians) * Math.cos(latRadians) * Math.cos(hourAngleRadians);

  const altRadians = Math.asin(sinAlt);
  const altDegrees = toDegrees(altRadians);

  const cosAz =
    (Math.sin(decRadians) - Math.sin(altRadians) * Math.sin(latRadians)) /
    (Math.cos(altRadians) * Math.cos(latRadians));

  let azDegrees = toDegrees(Math.acos(Math.max(-1, Math.min(1, cosAz))));

  if (Math.sin(hourAngleRadians) > 0) {
    azDegrees = 360 - azDegrees;
  }

  return { alt: altDegrees, az: azDegrees };
}

function projectAltAz(altDegrees, azDegrees) {
  const radius = ((90 - altDegrees) / 90) * RADIUS;
  const azRadians = toRadians(azDegrees);

  return {
    x: CENTER + radius * Math.sin(azRadians),
    y: CENTER - radius * Math.cos(azRadians),
    visible: altDegrees >= 0
  };
}

function isInsideSky(point, buffer = 8) {
  if (!point?.visible) return false;
  const dx = point.x - CENTER;
  const dy = point.y - CENTER;
  return Math.sqrt(dx * dx + dy * dy) <= RADIUS + buffer;
}

function buildVisiblePath(points) {
  let path = '';
  let drawing = false;

  points.forEach((point) => {
    if (!isInsideSky(point, 14)) {
      drawing = false;
      return;
    }

    path += `${drawing ? ' L' : ' M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    drawing = true;
  });

  return path.trim();
}

function buildSmoothVisiblePath(points, buffer = 18) {
  const segments = [];
  let currentSegment = [];

  points.forEach((point) => {
    if (!isInsideSky(point, buffer)) {
      if (currentSegment.length) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      return;
    }

    currentSegment.push(point);
  });

  if (currentSegment.length) {
    segments.push(currentSegment);
  }

  const longestSegment = segments.sort((a, b) => b.length - a.length)[0] || [];

  if (!longestSegment.length) return '';
  if (longestSegment.length === 1) {
    return `M ${longestSegment[0].x.toFixed(1)} ${longestSegment[0].y.toFixed(1)}`;
  }
  if (longestSegment.length === 2) {
    return `M ${longestSegment[0].x.toFixed(1)} ${longestSegment[0].y.toFixed(1)} L ${longestSegment[1].x.toFixed(1)} ${longestSegment[1].y.toFixed(1)}`;
  }

  let path = `M ${longestSegment[0].x.toFixed(1)} ${longestSegment[0].y.toFixed(1)}`;

  for (let i = 1; i < longestSegment.length - 1; i += 1) {
    const current = longestSegment[i];
    const next = longestSegment[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }

  const last = longestSegment[longestSegment.length - 1];
  path += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  return path;
}

function eclipticToRaDec(lambdaDegrees, betaDegrees = 0) {
  const obliquity = toRadians(23.439291);
  const lambda = toRadians(lambdaDegrees);
  const beta = toRadians(betaDegrees);

  const x = Math.cos(beta) * Math.cos(lambda);
  const y =
    Math.cos(beta) * Math.sin(lambda) * Math.cos(obliquity) -
    Math.sin(beta) * Math.sin(obliquity);
  const z =
    Math.cos(beta) * Math.sin(lambda) * Math.sin(obliquity) +
    Math.sin(beta) * Math.cos(obliquity);

  return {
    ra: normalizeHours(toDegrees(Math.atan2(y, x)) / 15),
    dec: toDegrees(Math.asin(z))
  };
}

function buildPath(points, closed = false) {
  const valid = points.filter(Boolean);
  if (!valid.length) return '';

  const path = valid
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  return closed ? `${path} Z` : path;
}

function avgPoint(points) {
  if (!points.length) return { x: CENTER, y: CENTER };
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function clampPoint(point, pad = 40) {
  return { x: clamp(point.x, pad, MAP_SIZE - pad), y: clamp(point.y, pad, MAP_SIZE - pad) };
}

function offsetPoint(point, offset = { x: 0, y: 0 }, pad = 40) {
  return clampPoint({ x: point.x + offset.x, y: point.y + offset.y }, pad);
}

function pickPathLabel(points, preferredFraction, offset = { x: 0, y: 0 }) {
  const visiblePoints = points.filter((point) => isInsideSky(point, 14));
  if (!visiblePoints.length) return { x: CENTER, y: CENTER };
  const index = Math.round((visiblePoints.length - 1) * preferredFraction);
  return offsetPoint(visiblePoints[clamp(index, 0, visiblePoints.length - 1)], offset, 70);
}

function getPlanetRaDec(body, date, observer) {
  const equator = Equator(body, date, observer, true, true);
  return { ra: equator.ra, dec: equator.dec };
}

function getObjectColor(objectType) {
  switch (objectType) {
    case 'Planetary Nebula':
      return 'var(--cyan)';
    case 'Emission Nebula':
      return '#a970ff';
    case 'Globular Cluster':
      return 'var(--orange)';
    case 'Double Star':
      return '#f6d36b';
    case 'Lunar':
      return '#d9e1ff';
    default:
      return '#ffffff';
  }
}

function getMissionConstellation(photo) {
  if (!photo || photo.objectType === 'Lunar') return null;
  return photo.constellation;
}

function formatRa(raHours) {
  return `${raHours.toFixed(3)}h`;
}

function formatDec(decDegrees) {
  return `${decDegrees.toFixed(2)}°`;
}

function getPointerAngle(event, element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
}

function formatMapTime(mapDate) {
  return mapDate.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatCompactTime(mapDate) {
  return mapDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getMoonPhaseInfo(date, phasePercent) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  let age = ((date.getTime() - knownNewMoon) / 86400000) % synodicMonth;

  if (age < 0) age += synodicMonth;

  const phaseIndex = Math.floor((age / synodicMonth) * 8 + 0.5) % 8;
  const phases = [
    { symbol: '🌑', name: 'New Moon' },
    { symbol: '🌒', name: 'Waxing Crescent' },
    { symbol: '🌓', name: 'First Quarter' },
    { symbol: '🌔', name: 'Waxing Gibbous' },
    { symbol: '🌕', name: 'Full Moon' },
    { symbol: '🌖', name: 'Waning Gibbous' },
    { symbol: '🌗', name: 'Last Quarter' },
    { symbol: '🌘', name: 'Waning Crescent' }
  ];

  return { ...phases[phaseIndex], age, phasePercent };
}

function getDayOfYear(date) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return Math.floor((current - start) / 86400000);
}

function getSunEventDate(baseDate, isSunrise) {
  const zenith = 90.833;
  const day = getDayOfYear(baseDate);
  const lngHour = SITE.lon / 15;
  const approximateTime = day + ((isSunrise ? 6 : 18) - lngHour) / 24;
  const meanAnomaly = 0.9856 * approximateTime - 3.289;

  let trueLongitude =
    meanAnomaly +
    1.916 * Math.sin(toRadians(meanAnomaly)) +
    0.020 * Math.sin(toRadians(2 * meanAnomaly)) +
    282.634;

  trueLongitude = normalizeDegrees(trueLongitude);

  let rightAscension = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(trueLongitude))));
  rightAscension = normalizeDegrees(rightAscension);

  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const raQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + longitudeQuadrant - raQuadrant) / 15;

  const sinDec = 0.39782 * Math.sin(toRadians(trueLongitude));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosHour =
    (Math.cos(toRadians(zenith)) - sinDec * Math.sin(toRadians(SITE.lat))) /
    (cosDec * Math.cos(toRadians(SITE.lat)));

  if (cosHour > 1 || cosHour < -1) return new Date(baseDate);

  let hourAngle = isSunrise ? 360 - toDegrees(Math.acos(cosHour)) : toDegrees(Math.acos(cosHour));
  hourAngle /= 15;

  const localMeanTime = hourAngle + rightAscension - 0.06571 * approximateTime - 6.622;
  const utcHours = normalizeHours(localMeanTime - lngHour);

  return new Date(Date.UTC(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    Math.floor(utcHours),
    Math.round((utcHours % 1) * 60),
    0,
    0
  ));
}

function getLocalDateAt(baseDate, hour, minute = 0, addDays = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + addDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function getPresetDate(preset, currentDate) {
  const now = new Date();
  if (preset === 'now') return now;
  if (preset === 'sunset') return getSunEventDate(currentDate, false);
  if (preset === '10pm') return getLocalDateAt(currentDate, 22, 0, 0);
  if (preset === 'midnight') return getLocalDateAt(currentDate, 0, 0, 1);

  if (preset === 'predawn') {
    const tomorrow = getLocalDateAt(currentDate, 0, 0, 1);
    const sunrise = getSunEventDate(tomorrow, true);
    return new Date(sunrise.getTime() - 90 * 60 * 1000);
  }

  return now;
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getObservingStatus(photo) {
  if (!photo || photo.alt < 0) return { label: 'Below Horizon', className: 'below', score: 0 };
  if (photo.alt < 20) return { label: 'Low', className: 'low', score: 1 };
  if (photo.alt < 45) return { label: 'Good', className: 'good', score: 2 };
  return { label: 'Best Now', className: 'best', score: 3 };
}



function getPriorityWeight(priority) {
  if (priority === 'High') return 3;
  if (priority === 'Medium') return 2;
  return 1;
}

function getTonightSampleDates(mapDate) {
  return [
    { key: 'sunset', label: 'Sunset', date: getPresetDate('sunset', mapDate) },
    { key: '10pm', label: '10 PM', date: getPresetDate('10pm', mapDate) },
    { key: 'midnight', label: 'Midnight', date: getPresetDate('midnight', mapDate) },
    { key: 'predawn', label: 'Pre-dawn', date: getPresetDate('predawn', mapDate) }
  ].sort((a, b) => a.date - b.date);
}

function getTargetRaDecAt(target, sampleDate, observer) {
  if (target.body) return getPlanetRaDec(target.body, sampleDate, observer);
  return { ra: target.ra, dec: target.dec };
}

function buildTonightPlan(target, mapDate, observer) {
  const samples = getTonightSampleDates(mapDate).map((sample) => {
    const eq = getTargetRaDecAt(target, sample.date, observer);
    const altAz = raDecToAltAz(eq.ra, eq.dec, sample.date, SITE.lat, SITE.lon);
    const status = getObservingStatus({ alt: altAz.alt });

    return {
      ...sample,
      ra: eq.ra,
      dec: eq.dec,
      alt: altAz.alt,
      az: altAz.az,
      status
    };
  });

  const visibleSamples = samples.filter((sample) => sample.alt >= 0);
  const peak = samples.reduce((best, sample) => (sample.alt > best.alt ? sample : best), samples[0]);
  const bestSamples = samples.filter((sample) => sample.status.score >= 3);
  const goodSamples = samples.filter((sample) => sample.status.score >= 2);

  const bestWindow = bestSamples.length
    ? bestSamples.map((sample) => sample.label).join(' / ')
    : goodSamples.length
      ? goodSamples.map((sample) => sample.label).join(' / ')
      : peak?.alt >= 0
        ? peak.label
        : 'Not tonight';

  return {
    samples,
    visibleSamples,
    peak,
    bestSamples,
    goodSamples,
    bestWindow
  };
}

function dateIsBetween(date, start, end) {
  return date >= start && date <= end;
}

function makeTrackPoint(target, sampleDate, observer) {
  const eq = getTargetRaDecAt(target, sampleDate, observer);
  const altAz = raDecToAltAz(eq.ra, eq.dec, sampleDate, SITE.lat, SITE.lon);
  const point = projectAltAz(altAz.alt, altAz.az);

  return {
    date: sampleDate,
    ra: eq.ra,
    dec: eq.dec,
    alt: altAz.alt,
    az: altAz.az,
    x: point.x,
    y: point.y,
    visible: point.visible
  };
}

function buildTargetTrack(target, mapDate, observer) {
  if (!target) return null;

  let start = getPresetDate('sunset', mapDate);
  let end = getPresetDate('predawn', mapDate);

  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const points = [];
  const stepMinutes = 20;

  for (let time = start.getTime(); time <= end.getTime(); time += stepMinutes * 60 * 1000) {
    points.push(makeTrackPoint(target, new Date(time), observer));
  }

  const path = buildSmoothVisiblePath(points, 20);
  const now = new Date();
  const markerDefs = [
    { key: 'sunset', label: 'Sunset', date: start },
    { key: 'now', label: 'Now', date: now },
    { key: '10pm', label: '10 PM', date: getPresetDate('10pm', mapDate) },
    { key: 'midnight', label: 'Midnight', date: getPresetDate('midnight', mapDate) },
    { key: '2am', label: '2 AM', date: getLocalDateAt(mapDate, 2, 0, 1) },
    { key: 'predawn', label: 'Pre-dawn', date: end }
  ];

  const markers = markerDefs
    .filter((sample) => dateIsBetween(sample.date, start, end))
    .map((sample) => ({ ...sample, ...makeTrackPoint(target, sample.date, observer) }))
    .filter((sample) => isInsideSky(sample, 18));

  const peakDate = target.tonightPlan?.peak?.date;
  const peak = peakDate ? makeTrackPoint(target, peakDate, observer) : null;
  const peakMarker = peak && isInsideSky(peak, 18)
    ? { ...peak, key: 'peak', label: `Peak ${target.tonightPlan.peak.label}` }
    : null;

  const visiblePoints = points.filter((point) => isInsideSky(point, 18));
  const firstVisible = visiblePoints[0] || null;
  const lastVisible = visiblePoints[visiblePoints.length - 1] || null;
  const isRising = firstVisible && lastVisible ? lastVisible.alt > firstVisible.alt : null;

  return {
    path,
    points,
    markers,
    peak: peakMarker,
    isRising,
    start,
    end
  };
}

function getFuturePlannerStatus(currentStatus, tonightPlan, target, referenceDate = new Date()) {
  const peakAlt = tonightPlan?.peak?.alt ?? -90;
  const hasBestLater = tonightPlan?.bestSamples?.some((sample) => sample.date > referenceDate && sample.status.score >= 3);
  const hasGoodLater = tonightPlan?.goodSamples?.some((sample) => sample.date > referenceDate && sample.status.score >= 2);
  const priorityWeight = getPriorityWeight(target.priority);

  if (currentStatus.score >= 3) {
    return {
      label: 'Best Now',
      className: 'best',
      rankScore: 500 + currentStatus.score * 20 + peakAlt + priorityWeight * 10
    };
  }

  if (hasBestLater || tonightPlan?.bestSamples?.length) {
    return {
      label: 'Best Later',
      className: 'best',
      rankScore: 420 + peakAlt + priorityWeight * 10
    };
  }

  if (currentStatus.score >= 2) {
    return {
      label: 'Good Now',
      className: 'good',
      rankScore: 360 + peakAlt + priorityWeight * 10
    };
  }

  if (hasGoodLater || tonightPlan?.goodSamples?.length) {
    return {
      label: 'Good Later',
      className: 'good',
      rankScore: 300 + peakAlt + priorityWeight * 10
    };
  }

  if (peakAlt >= 20) {
    return {
      label: 'Low Tonight',
      className: 'low',
      rankScore: 170 + peakAlt + priorityWeight * 8
    };
  }

  if (peakAlt >= 0) {
    return {
      label: 'Barely Up',
      className: 'low',
      rankScore: 100 + peakAlt + priorityWeight * 6
    };
  }

  return {
    label: 'Not Tonight',
    className: 'below',
    rankScore: priorityWeight * 5
  };
}

function getZoomSafeBounds(zoom, isMobile) {
  const safeInset = isMobile ? 74 : 92;
  const halfVisible = (CENTER - safeInset) / Math.max(zoom, getMinZoom());
  return { min: CENTER - halfVisible, max: CENTER + halfVisible };
}

function buildMissionCallouts(objects, zoom) {
  const placed = [];
  const isMobile = isMobileViewport();
  const defaultZoom = isMobile ? MOBILE_DEFAULT_ZOOM : DESKTOP_DEFAULT_ZOOM;
  const zoomPull = Math.max(0, zoom - defaultZoom);

  // Keep mobile callouts inside the chart and a clear distance away from
  // the real target X. This prevents the number badge from sitting directly
  // on top of the object or its constellation label at high zoom.
  const baseRadius = isMobile
    ? clamp(RADIUS - 78 - zoomPull * 90, RADIUS - 145, RADIUS - 68)
    : clamp(RADIUS + 72 - zoomPull * 160, RADIUS - 38, RADIUS + 72);

  const minTargetDistance = isMobile ? 84 : 76;
  const overlapDistance = isMobile ? 58 : 62;
  const shiftAmount = isMobile ? 30 : 28;
  const edgePadding = isMobile ? 132 : 64;
  const zoomBounds = getZoomSafeBounds(zoom, isMobile);

  const sorted = [...objects]
    .map((photo, index) => ({ ...photo, originalIndex: index }))
    .sort((a, b) => Math.atan2(a.y - CENTER, a.x - CENTER) - Math.atan2(b.y - CENTER, b.x - CENTER));

  const laidOut = sorted.map((photo) => {
    const angle = Math.atan2(photo.y - CENTER, photo.x - CENTER);
    const outwardX = Math.cos(angle);
    const outwardY = Math.sin(angle);
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const baseX = CENTER + outwardX * baseRadius;
    const baseY = CENTER + outwardY * baseRadius;

    const minX = Math.max(edgePadding, zoomBounds.min);
    const maxX = Math.min(MAP_SIZE - edgePadding, zoomBounds.max);
    const minY = Math.max(edgePadding, zoomBounds.min);
    const maxY = Math.min(MAP_SIZE - edgePadding, zoomBounds.max);

    const clampX = (value) => clamp(value, minX, maxX);
    const clampY = (value) => clamp(value, minY, maxY);

    const makeSafe = (point) => {
      let safe = { x: clampX(point.x), y: clampY(point.y) };
      const dx = safe.x - photo.x;
      const dy = safe.y - photo.y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));

      if (distance < minTargetDistance) {
        const pushX = dx / distance;
        const pushY = dy / distance;
        safe = {
          x: clampX(photo.x + pushX * minTargetDistance),
          y: clampY(photo.y + pushY * minTargetDistance)
        };
      }

      return safe;
    };

    let chosen = makeSafe({ x: baseX, y: baseY });
    let chosenScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < 36; i += 1) {
      const band = Math.ceil(i / 2);
      const direction = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const shift = band * shiftAmount * direction;
      const test = makeSafe({ x: baseX + tangentX * shift, y: baseY + tangentY * shift });
      const overlaps = placed.some((item) => pointDistance(item, test) < overlapDistance);
      const targetDistance = pointDistance(photo, test);
      const centerDistance = Math.abs(pointDistance({ x: CENTER, y: CENTER }, test) - baseRadius);
      const score = (overlaps ? 10000 : 0) + centerDistance + Math.abs(targetDistance - minTargetDistance) * 0.35;

      if (score < chosenScore) {
        chosen = test;
        chosenScore = score;
      }

      if (!overlaps && targetDistance >= minTargetDistance) {
        chosen = test;
        break;
      }
    }

    placed.push(chosen);

    return {
      ...photo,
      markerX: chosen.x,
      markerY: chosen.y,
      labelSide: chosen.x > CENTER ? 'left' : 'right'
    };
  });

  return laidOut.sort((a, b) => a.originalIndex - b.originalIndex);
}


function estimateTextBox(text, fontSize = 15) {
  const normalized = String(text || '').trim();
  return {
    width: Math.max(34, normalized.length * fontSize * 0.62),
    height: fontSize * 1.45
  };
}

function makeTextBox(x, y, text, options = {}) {
  const fontSize = options.fontSize || 15;
  const anchor = options.anchor || 'start';
  const padding = options.padding ?? 5;
  const size = estimateTextBox(text, fontSize);

  let left = x;

  if (anchor === 'middle') {
    left = x - size.width / 2;
  }

  if (anchor === 'end') {
    left = x - size.width;
  }

  return {
    left: left - padding,
    right: left + size.width + padding,
    top: y - size.height + padding * -0.2,
    bottom: y + padding,
    width: size.width + padding * 2,
    height: size.height + padding * 1.2
  };
}

function boxesOverlap(a, b, gap = 6) {
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  );
}

function boxIsInsideMap(box, margin = 16) {
  return (
    box.left >= margin &&
    box.right <= MAP_SIZE - margin &&
    box.top >= margin &&
    box.bottom <= MAP_SIZE - margin
  );
}

function defaultLabelCandidates(item) {
  const distance = item.distance || 24;

  return [
    { dx: distance, dy: -10, anchor: 'start' },
    { dx: distance, dy: 18, anchor: 'start' },
    { dx: -distance, dy: -10, anchor: 'end' },
    { dx: -distance, dy: 18, anchor: 'end' },
    { dx: 0, dy: -distance, anchor: 'middle' },
    { dx: 0, dy: distance + 10, anchor: 'middle' },
    { dx: distance * 1.7, dy: 0, anchor: 'start' },
    { dx: -distance * 1.7, dy: 0, anchor: 'end' }
  ];
}

function placeCollisionSafeLabels(items, fixedBoxes = []) {
  const placedBoxes = [...fixedBoxes];
  const placements = {};

  [...items]
    .filter((item) => item && item.id && item.text)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .forEach((item) => {
      const candidates = item.candidates || defaultLabelCandidates(item);
      let chosen = null;

      for (const candidate of candidates) {
        const x = clamp(item.anchorX + candidate.dx, 24, MAP_SIZE - 24);
        const y = clamp(item.anchorY + candidate.dy, 24, MAP_SIZE - 24);
        const anchor = candidate.anchor || 'start';
        const box = makeTextBox(x, y, item.text, {
          fontSize: item.fontSize || 15,
          anchor,
          padding: item.padding ?? 6
        });

        if (!boxIsInsideMap(box, item.margin ?? 18)) continue;
        if (placedBoxes.some((placed) => boxesOverlap(box, placed, item.gap ?? 8))) continue;

        chosen = {
          x,
          y,
          anchor,
          box
        };
        break;
      }

      if (chosen) {
        placements[item.id] = chosen;
        placedBoxes.push(chosen.box);
      }
    });

  return placements;
}

export default function SkyMap({ gallery, setSelectedIndex }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeFutureIndex, setActiveFutureIndex] = useState(0);
  const [catalogView, setCatalogView] = useState('future');
  const [selectedPanel, setSelectedPanel] = useState('future');
  const [zoom, setZoom] = useState(() => getDefaultZoom());
  const [pan, setPan] = useState(() => getDefaultPan());
  const [rotation, setRotation] = useState(0);
  const [date, setDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('clean');
  const [showHorizon, setShowHorizon] = useState(true);
  const [activePreset, setActivePreset] = useState('now');

  const dragRef = useRef(null);
  const panFrameRef = useRef(null);
  const pendingPanRef = useRef(null);
  const touchDragRef = useRef(null);
  const mapSectionRef = useRef(null);
  const mapRef = useRef(null);
  const observer = useMemo(() => new Observer(SITE.lat, SITE.lon, 0), []);
  const isDetailMode = viewMode === 'detail';
  const mobileLayout = isMobileViewport();
  const canPanMap = zoom > getDefaultZoom() + 0.02;

  useEffect(() => {
    return () => {
      if (panFrameRef.current) {
        cancelAnimationFrame(panFrameRef.current);
      }
    };
  }, []);

  const schedulePan = (nextPan) => {
    pendingPanRef.current = nextPan;

    if (panFrameRef.current) return;

    panFrameRef.current = requestAnimationFrame(() => {
      if (pendingPanRef.current) {
        setPan(pendingPanRef.current);
      }

      pendingPanRef.current = null;
      panFrameRef.current = null;
    });
  };

  const mappedObjects = useMemo(() => {
    return gallery
      .map((photo) => {
        let ra = photo.ra;
        let dec = photo.dec;

        if (photo.objectType === 'Lunar') {
          const moon = getPlanetRaDec(Body.Moon, date, observer);
          ra = moon.ra;
          dec = moon.dec;
        }

        if (ra === undefined || dec === undefined) return null;

        const altAz = raDecToAltAz(ra, dec, date, SITE.lat, SITE.lon);
        const point = projectAltAz(altAz.alt, altAz.az);
        const status = getObservingStatus({ alt: altAz.alt });

        return {
          ...photo,
          ra,
          dec,
          alt: altAz.alt,
          az: altAz.az,
          x: point.x,
          y: point.y,
          visible: point.visible,
          observingStatus: status
        };
      })
      .filter(Boolean);
  }, [gallery, date, observer]);

  const mappedFutureTargets = useMemo(() => {
    return FUTURE_TARGETS.map((target, actualIndex) => {
      let ra = target.ra;
      let dec = target.dec;

      if (target.body) {
        const eq = getPlanetRaDec(target.body, date, observer);
        ra = eq.ra;
        dec = eq.dec;
      }

      if (ra === undefined || dec === undefined || ra === null || dec === null) return null;

      const altAz = raDecToAltAz(ra, dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);
      const status = getObservingStatus({ alt: altAz.alt });
      const tonightPlan = buildTonightPlan({ ...target, ra, dec }, date, observer);
      const plannerStatus = getFuturePlannerStatus(status, tonightPlan, target, date);

      return {
        ...target,
        actualIndex,
        ra,
        dec,
        alt: altAz.alt,
        az: altAz.az,
        x: point.x,
        y: point.y,
        visible: point.visible,
        observingStatus: status,
        tonightPlan,
        plannerStatus,
        isFutureTarget: true
      };
    }).filter(Boolean);
  }, [date, observer]);

  const rankedFutureTargets = useMemo(() => {
    return [...mappedFutureTargets]
      .sort((a, b) => {
        if (b.plannerStatus.rankScore !== a.plannerStatus.rankScore) {
          return b.plannerStatus.rankScore - a.plannerStatus.rankScore;
        }

        if ((b.tonightPlan?.peak?.alt ?? -90) !== (a.tonightPlan?.peak?.alt ?? -90)) {
          return (b.tonightPlan?.peak?.alt ?? -90) - (a.tonightPlan?.peak?.alt ?? -90);
        }

        return a.title.localeCompare(b.title);
      })
      .map((target, rankIndex) => ({ ...target, rankNumber: rankIndex + 1 }));
  }, [mappedFutureTargets]);

  const activeObject = mappedObjects[activeIndex] || mappedObjects[0];
  const activeFutureTarget = rankedFutureTargets.find((target) => target.actualIndex === activeFutureIndex) || rankedFutureTargets[0] || mappedFutureTargets[0];
  const selectedTarget = selectedPanel === 'future' ? activeFutureTarget : activeObject;
  const activeConstellation = getMissionConstellation(selectedTarget) || selectedTarget?.constellation;

  const visibleObjects = useMemo(() => mappedObjects.filter((photo) => isInsideSky(photo, 12)), [mappedObjects]);
  const visibleFutureTargets = useMemo(() => rankedFutureTargets.filter((target) => isInsideSky(target, 14)), [rankedFutureTargets]);
  const bestObjectCount = useMemo(() => mappedObjects.filter((photo) => photo.observingStatus.score >= 3).length, [mappedObjects]);
  const goodObjectCount = useMemo(() => mappedObjects.filter((photo) => photo.observingStatus.score >= 2).length, [mappedObjects]);
  const futureBestCount = useMemo(() => rankedFutureTargets.filter((target) => target.plannerStatus.label === 'Best Now').length, [rankedFutureTargets]);
  const futureGoodCount = useMemo(() => rankedFutureTargets.filter((target) => target.plannerStatus.className === 'good' || target.plannerStatus.className === 'best').length, [rankedFutureTargets]);
  const missionCallouts = useMemo(() => buildMissionCallouts(visibleObjects, zoom), [visibleObjects, zoom]);
  const futureCallouts = useMemo(() => buildMissionCallouts(visibleFutureTargets, zoom), [visibleFutureTargets, zoom]);

  const starPoints = useMemo(() => {
    return STAR_CATALOG.map((star) => {
      const altAz = raDecToAltAz(star.ra, star.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);
      return { ...star, x: point.x, y: point.y, alt: altAz.alt, az: altAz.az, visible: point.visible };
    });
  }, [date]);

  const visibleStars = useMemo(() => starPoints.filter((star) => isInsideSky(star, 12)), [starPoints]);
  const starLookup = useMemo(() => Object.fromEntries(starPoints.map((star) => [star.name, star])), [starPoints]);

  const activeFutureGuide = useMemo(() => {
    if (selectedPanel !== 'future' || !activeFutureTarget) return null;
    return FUTURE_TARGET_GUIDES[activeFutureTarget.title] || null;
  }, [activeFutureTarget, selectedPanel]);

  const activeFutureGuideStars = useMemo(() => {
    if (!activeFutureGuide?.anchorStars?.length) return [];

    return activeFutureGuide.anchorStars
      .map((starName) => starLookup[starName])
      .filter((star) => star && isInsideSky(star, 24));
  }, [activeFutureGuide, starLookup]);

  const activeTargetTrack = useMemo(() => {
    if (selectedPanel !== 'future' || !activeFutureTarget) return null;
    return buildTargetTrack(activeFutureTarget, date, observer);
  }, [activeFutureTarget, date, observer, selectedPanel]);

  const constellationLines = useMemo(() => {
    return CONSTELLATION_SEGMENTS.map((segment) => {
      const [nameA, nameB] = segment.stars;
      const a = starLookup[nameA];
      const b = starLookup[nameB];
      if (!a || !b) return null;
      if (!isInsideSky(a, 10) || !isInsideSky(b, 10)) return null;
      return { group: segment.group, path: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}` };
    }).filter(Boolean);
  }, [starLookup]);

  const constellationLabels = useMemo(() => {
    return Object.entries(CONSTELLATION_LABEL_GROUPS)
      .map(([name, stars]) => {
        const points = stars.map((starName) => starLookup[starName]).filter((point) => point && isInsideSky(point, 20));
        if (points.length < 2) return null;
        const centerPoint = avgPoint(points);
        const offset = CONSTELLATION_LABEL_OFFSETS[name] || { x: 0, y: 0 };
        return { name, ...offsetPoint(centerPoint, offset, 80) };
      })
      .filter(Boolean);
  }, [starLookup]);

  const eclipticPoints = useMemo(() => {
    const points = [];
    for (let lambda = 0; lambda <= 360; lambda += 3) {
      const eq = eclipticToRaDec(lambda, 0);
      const altAz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      points.push(projectAltAz(altAz.alt, altAz.az));
    }
    return points;
  }, [date]);

  const lunarPoints = useMemo(() => {
    const points = [];

    // Use a wider time window and smaller steps so the Moon's track feels
    // smooth and complete from different times/angles, instead of appearing
    // as a short segmented line.
    for (let hour = -12; hour <= 36; hour += 0.5) {
      const sampleTime = new Date(date.getTime() + hour * 60 * 60 * 1000);
      const moon = getPlanetRaDec(Body.Moon, sampleTime, observer);
      const altAz = raDecToAltAz(moon.ra, moon.dec, sampleTime, SITE.lat, SITE.lon);
      points.push(projectAltAz(altAz.alt, altAz.az));
    }

    return points;
  }, [date, observer]);

  const eclipticPath = useMemo(() => buildVisiblePath(eclipticPoints), [eclipticPoints]);
  const lunarPath = useMemo(() => buildSmoothVisiblePath(lunarPoints, 18), [lunarPoints]);
  const eclipticLabel = useMemo(() => pickPathLabel(eclipticPoints, 0.72, { x: 24, y: -20 }), [eclipticPoints]);
  const lunarLabel = useMemo(() => pickPathLabel(lunarPoints, 0.18, { x: -12, y: -18 }), [lunarPoints]);

  const planets = useMemo(() => {
    const bodies = [
      { name: 'Mercury', body: Body.Mercury },
      { name: 'Venus', body: Body.Venus },
      { name: 'Mars', body: Body.Mars },
      { name: 'Jupiter', body: Body.Jupiter },
      { name: 'Saturn', body: Body.Saturn }
    ];

    return bodies.map((planet) => {
      const eq = getPlanetRaDec(planet.body, date, observer);
      const altAz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);
      return { ...planet, x: point.x, y: point.y, alt: altAz.alt, az: altAz.az, visible: point.visible };
    });
  }, [date, observer]);

  const visiblePlanets = useMemo(() => planets.filter((planet) => isInsideSky(planet, 12)), [planets]);

  const moonData = useMemo(() => {
    const moonEq = getPlanetRaDec(Body.Moon, date, observer);
    const altAz = raDecToAltAz(moonEq.ra, moonEq.dec, date, SITE.lat, SITE.lon);
    const point = projectAltAz(altAz.alt, altAz.az);
    const illum = Illumination(Body.Moon, date);
    const phasePercent = Math.round((illum.phase_fraction ?? 0) * 100);
    const phaseInfo = getMoonPhaseInfo(date, phasePercent);

    return {
      ra: moonEq.ra,
      dec: moonEq.dec,
      alt: altAz.alt,
      az: altAz.az,
      x: point.x,
      y: point.y,
      visible: point.visible,
      phasePercent,
      phaseSymbol: phaseInfo.symbol,
      phaseName: phaseInfo.name,
      phaseAge: phaseInfo.age
    };
  }, [date, observer]);

  const summerTrianglePoints = useMemo(() => [starLookup.Vega, starLookup.Deneb, starLookup.Altair].filter((point) => point && isInsideSky(point, 20)), [starLookup]);
  const summerTrianglePath = useMemo(() => (summerTrianglePoints.length < 3 ? '' : buildPath(summerTrianglePoints, true)), [summerTrianglePoints]);
  const summerTriangleLabel = useMemo(() => {
    if (summerTrianglePoints.length < 3) return null;
    return offsetPoint(avgPoint(summerTrianglePoints), { x: 58, y: -10 }, 80);
  }, [summerTrianglePoints]);

  const mapLabelPlacements = useMemo(() => {
    const fixedBoxes = [];
    const labelItems = [];

    const addFixedText = (x, y, text, options = {}) => {
      fixedBoxes.push(makeTextBox(x, y, text, options));
    };

    constellationLabels
      .filter((label) => isDetailMode || label.name === activeConstellation)
      .forEach((label) => {
        addFixedText(label.x, label.y, label.name, {
          fontSize: mobileLayout ? 12 : 15,
          anchor: 'middle',
          padding: 8
        });
      });

    visibleStars
      .filter((star) => (isDetailMode || star.name === 'Polaris') && ['Polaris', 'Vega', 'Deneb', 'Altair'].includes(star.name))
      .forEach((star) => {
        addFixedText(star.x + 10, star.y - 10, star.name, {
          fontSize: mobileLayout ? 10 : 12,
          anchor: 'start',
          padding: 5
        });
      });

    if (isDetailMode) {
      addFixedText(eclipticLabel.x, eclipticLabel.y, 'Ecliptic', {
        fontSize: mobileLayout ? 11 : 13,
        anchor: 'start',
        padding: 5
      });

      addFixedText(lunarLabel.x, lunarLabel.y, 'Lunar Path', {
        fontSize: mobileLayout ? 11 : 13,
        anchor: 'start',
        padding: 5
      });

      if (summerTriangleLabel) {
        addFixedText(summerTriangleLabel.x, summerTriangleLabel.y, 'Summer Triangle', {
          fontSize: mobileLayout ? 10 : 13,
          anchor: 'start',
          padding: 6
        });
      }
    }

    if (selectedPanel === 'future' && activeFutureGuideStars.length) {
      activeFutureGuideStars.forEach((star) => {
        labelItems.push({
          id: `finderStar:${star.name}`,
          text: star.name,
          anchorX: star.x,
          anchorY: star.y,
          fontSize: mobileLayout ? 10 : 12,
          priority: 118,
          distance: mobileLayout ? 16 : 20,
          padding: 5,
          candidates: [
            { dx: 16, dy: -9, anchor: 'start' },
            { dx: -16, dy: -9, anchor: 'end' },
            { dx: 16, dy: 16, anchor: 'start' },
            { dx: -16, dy: 16, anchor: 'end' },
            { dx: 0, dy: -22, anchor: 'middle' }
          ]
        });
      });
    }

    visiblePlanets.forEach((planet) => {
      labelItems.push({
        id: `planet:${planet.name}`,
        text: planet.name,
        anchorX: planet.x,
        anchorY: planet.y,
        fontSize: mobileLayout ? 10 : 12,
        priority: 90,
        distance: mobileLayout ? 14 : 17,
        candidates: [
          { dx: 14, dy: -8, anchor: 'start' },
          { dx: 14, dy: 15, anchor: 'start' },
          { dx: -14, dy: -8, anchor: 'end' },
          { dx: -14, dy: 15, anchor: 'end' },
          { dx: 0, dy: -18, anchor: 'middle' }
        ]
      });
    });

    if (isInsideSky(moonData, 14)) {
      labelItems.push({
        id: 'moon:main',
        text: `Moon ${moonData.phasePercent}%`,
        anchorX: moonData.x,
        anchorY: moonData.y,
        fontSize: mobileLayout ? 11 : 15,
        priority: 95,
        distance: mobileLayout ? 18 : 24,
        candidates: [
          { dx: 20, dy: -10, anchor: 'start' },
          { dx: 20, dy: 20, anchor: 'start' },
          { dx: -20, dy: -10, anchor: 'end' },
          { dx: -20, dy: 20, anchor: 'end' },
          { dx: 0, dy: -26, anchor: 'middle' }
        ]
      });
    }

    if (catalogView === 'future') {
      futureCallouts.forEach((target) => {
        const actualIndex = mappedFutureTargets.findIndex((item) => item.title === target.title);
        const isActive = selectedPanel === 'future' && activeFutureIndex === actualIndex;

        if (mobileLayout && !isActive && !isDetailMode) return;
        if (!mobileLayout && !isActive && !isDetailMode) return;

        const outwardDirection = target.markerX > CENTER ? 1 : -1;

        labelItems.push({
          id: `futureCallout:${target.title}`,
          text: target.shortTitle || target.title,
          anchorX: target.markerX,
          anchorY: target.markerY,
          fontSize: mobileLayout ? 13 : 17,
          priority: isActive ? 135 : 72,
          distance: mobileLayout ? 30 : 34,
          margin: 24,
          candidates: [
            { dx: outwardDirection * 30, dy: 6, anchor: outwardDirection > 0 ? 'start' : 'end' },
            { dx: -outwardDirection * 30, dy: 6, anchor: outwardDirection > 0 ? 'end' : 'start' },
            { dx: 0, dy: -32, anchor: 'middle' },
            { dx: 0, dy: 38, anchor: 'middle' },
            { dx: outwardDirection * 46, dy: -16, anchor: outwardDirection > 0 ? 'start' : 'end' },
            { dx: outwardDirection * 46, dy: 28, anchor: outwardDirection > 0 ? 'start' : 'end' }
          ]
        });
      });
    }

    if (catalogView === 'captured' && !mobileLayout) {
      missionCallouts.forEach((photo) => {
        const actualIndex = mappedObjects.findIndex((item) => item.title === photo.title);
        const isActive = selectedPanel === 'captured' && activeIndex === actualIndex;

        if (!isActive && !isDetailMode) return;

        const outwardDirection = photo.markerX > CENTER ? 1 : -1;

        labelItems.push({
          id: `mission:${photo.title}`,
          text: photo.title,
          anchorX: photo.markerX,
          anchorY: photo.markerY,
          fontSize: 17,
          priority: isActive ? 125 : 58,
          distance: 30,
          margin: 24,
          candidates: [
            { dx: outwardDirection * 28, dy: 6, anchor: outwardDirection > 0 ? 'start' : 'end' },
            { dx: -outwardDirection * 28, dy: 6, anchor: outwardDirection > 0 ? 'end' : 'start' },
            { dx: 0, dy: -30, anchor: 'middle' },
            { dx: 0, dy: 38, anchor: 'middle' },
            { dx: outwardDirection * 44, dy: -16, anchor: outwardDirection > 0 ? 'start' : 'end' },
            { dx: outwardDirection * 44, dy: 26, anchor: outwardDirection > 0 ? 'start' : 'end' }
          ]
        });
      });
    }

    return placeCollisionSafeLabels(labelItems, fixedBoxes);
  }, [
    activeConstellation,
    activeFutureGuideStars,
    activeFutureIndex,
    activeIndex,
    catalogView,
    constellationLabels,
    eclipticLabel,
    futureCallouts,
    isDetailMode,
    lunarLabel,
    mappedFutureTargets,
    mappedObjects,
    missionCallouts,
    mobileLayout,
    moonData,
    selectedPanel,
    summerTriangleLabel,
    visibleFutureTargets,
    visiblePlanets,
    visibleStars
  ]);

  const getMapLabel = (id) => mapLabelPlacements[id];

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((item) => item.title === photo.title);
    if (realIndex !== -1) setSelectedIndex(realIndex);
  };

  const scrollToMap = () => {
    window.requestAnimationFrame(() => {
      const target = mapRef.current || mapSectionRef.current;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const pageY = window.scrollY || window.pageYOffset || 0;
      const desiredTop = rect.top + pageY + rect.height / 2 - window.innerHeight / 2;

      window.scrollTo({
        top: Math.max(0, desiredTop),
        behavior: 'smooth'
      });
    });
  };

  const selectFutureTarget = (index, shouldScroll = false) => {
    setActiveFutureIndex(index);
    setSelectedPanel('future');
    setCatalogView('future');
    if (shouldScroll) scrollToMap();
  };

  const selectCapturedTarget = (index, shouldScroll = false) => {
    setActiveIndex(index);
    setSelectedPanel('captured');
    setCatalogView('captured');
    if (shouldScroll) scrollToMap();
  };

  const zoomIn = () => {
    setZoom((current) => {
      const next = Math.min(getMaxZoom(), Number((current + 0.1).toFixed(2)));
      setPan((currentPan) => clampPanForZoom(currentPan, next));
      return next;
    });
  };

  const zoomOut = () => {
    setZoom((current) => {
      const next = Math.max(getMinZoom(), Number((current - 0.1).toFixed(2)));
      setPan((currentPan) => clampPanForZoom(currentPan, next));
      return next;
    });
  };

  const rotateLeft = () => setRotation((current) => current - 15);
  const rotateRight = () => setRotation((current) => current + 15);
  const resetView = () => { setZoom(getDefaultZoom()); setPan(getDefaultPan()); setRotation(0); };

  const changeTime = (hours) => {
    setActivePreset('custom');
    setDate((currentDate) => new Date(currentDate.getTime() + hours * 60 * 60 * 1000));
  };

  const setPresetTime = (preset) => {
    setActivePreset(preset);
    setDate((currentDate) => getPresetDate(preset, currentDate));
  };

  const resetToNow = () => {
    setActivePreset('now');
    setDate(new Date());
  };

  const shouldIgnoreDrag = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest('.atlasZoomControls') ||
      target.closest('.atlasTimeControls') ||
      target.closest('.atlasLegend') ||
      target.closest('.missionSvgCallout') ||
      target.closest('.futureTargetMarker')
    );
  };

  const startPanDrag = ({ pointerId = null, clientX, clientY, event = null }) => {
    event?.preventDefault?.();

    dragRef.current = {
      mode: 'pan',
      pointerId,
      startX: clientX,
      startY: clientY,
      startPan: pan,
      moved: false
    };
  };

  const updatePanDrag = ({ pointerId = null, clientX, clientY, event = null }) => {
    if (!dragRef.current) return;
    if (dragRef.current.mode !== 'pan') return;
    if (dragRef.current.pointerId !== null && pointerId !== null && dragRef.current.pointerId !== pointerId) return;

    event?.preventDefault?.();

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }

    const nextPan = clampPanForZoom(
      {
        x: dragRef.current.startPan.x + dx,
        y: dragRef.current.startPan.y + dy
      },
      zoom
    );

    // Update immediately. The previous requestAnimationFrame throttle felt like
    // the gesture was being ignored on some mobile browsers.
    setPan(nextPan);
  };

  const endPanDrag = ({ pointerId = null, event = null } = {}) => {
    if (dragRef.current?.pointerId !== null && pointerId !== null && dragRef.current.pointerId !== pointerId) return;

    dragRef.current = null;
    touchDragRef.current = null;
    pendingPanRef.current = null;

    if (panFrameRef.current) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }

    event?.currentTarget?.releasePointerCapture?.(pointerId);
  };

  const handlePointerDown = (event) => {
    if (shouldIgnoreDrag(event.target)) return;

    if (canPanMap) {
      startPanDrag({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        event
      });

      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (event.pointerType === 'touch') return;

    const angle = getPointerAngle(event, event.currentTarget);
    dragRef.current = {
      mode: 'rotate',
      pointerId: event.pointerId,
      startAngle: angle,
      startRotation: rotation
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    if (dragRef.current.pointerId !== event.pointerId) return;

    if (dragRef.current.mode === 'pan') {
      updatePanDrag({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        event
      });
      return;
    }

    const angle = getPointerAngle(event, event.currentTarget);
    const delta = angle - dragRef.current.startAngle;
    setRotation(dragRef.current.startRotation + delta);
  };

  const handlePointerUp = (event) => {
    endPanDrag({ pointerId: event.pointerId, event });
  };

  const handleTouchStart = (event) => {
    if (!canPanMap) return;
    if (shouldIgnoreDrag(event.target)) return;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    touchDragRef.current = touch.identifier;

    startPanDrag({
      pointerId: null,
      clientX: touch.clientX,
      clientY: touch.clientY,
      event
    });
  };

  const handleTouchMove = (event) => {
    if (!canPanMap) return;
    if (!dragRef.current || dragRef.current.mode !== 'pan') return;

    const touch = Array.from(event.touches).find((item) => item.identifier === touchDragRef.current) || event.touches[0];
    if (!touch) return;

    updatePanDrag({
      pointerId: null,
      clientX: touch.clientX,
      clientY: touch.clientY,
      event
    });
  };

  const handleTouchEnd = (event) => {
    if (!dragRef.current || dragRef.current.mode !== 'pan') return;
    endPanDrag({ event });
  };

  const stopMapPointerEvents = (event) => event.stopPropagation();
  const keepUpright = (x, y) => `rotate(${-rotation} ${x} ${y})`;

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>
        <h1>Celestial Atlas</h1>
        <p className="tagline">
          Live sky planning from Eliot, Maine. Jump to sunset, 10 PM, midnight,
          or pre-dawn and see which CuzBro missions are best placed.
        </p>
        <a className="atlasBackButton" href="/#observatory">← Back to Observatory</a>
      </section>

      <section className="atlasLayout realAtlasLayout">
        <div className="atlasMapStack" ref={mapSectionRef}>
          <div
            className="atlasTimeControls tonightControls compactTonightControls"
            aria-label="Sky map time controls"
            onPointerDown={stopMapPointerEvents}
            onPointerMove={stopMapPointerEvents}
            onPointerUp={stopMapPointerEvents}
            onClick={stopMapPointerEvents}
          >
            <div className="tonightHeaderRow">
              <div>
                <strong>{formatMapTime(date)}</strong>
                <small>{futureBestCount} best now · {futureGoodCount} worth tracking</small>
              </div>

              <div className="inlineModeToggle" aria-label="Sky map display mode controls">
                <button type="button" className={viewMode === 'clean' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setViewMode('clean'); }}>Clean</button>
                <button type="button" className={viewMode === 'detail' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setViewMode('detail'); }}>Detail</button>
                <button
                  type="button"
                  className={showHorizon ? 'active horizonToggleButton' : 'horizonToggleButton'}
                  onClick={(event) => { event.stopPropagation(); setShowHorizon((current) => !current); }}
                  aria-pressed={showHorizon}
                >
                  Trees
                </button>
              </div>
            </div>

            <div className="timeNudgeRow">
              <button type="button" onClick={(event) => { event.stopPropagation(); changeTime(-1); }}>−1h</button>
              <button type="button" className={activePreset === 'now' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); resetToNow(); }}>Now</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); changeTime(1); }}>+1h</button>
            </div>

            <div className="tonightPresetRow compactPresetRow">
              <button type="button" className={activePreset === 'sunset' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('sunset'); }}>Sunset</button>
              <button type="button" className={activePreset === '10pm' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('10pm'); }}>10 PM</button>
              <button type="button" className={activePreset === 'midnight' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('midnight'); }}>Midnight</button>
              <button type="button" className={activePreset === 'predawn' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('predawn'); }}>Pre-dawn</button>
            </div>
          </div>


        <div
          ref={mapRef}
          className={[
            'atlasMap realSkyMap',
            isDetailMode ? 'detailMode' : 'cleanMode',
            canPanMap ? 'canPanMap' : ''
          ].join(' ')}
          style={{ touchAction: canPanMap ? 'none' : 'pan-y', WebkitUserSelect: 'none', userSelect: 'none' }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDownCapture={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div className="skyPanLayer" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${rotation}deg) scale(${zoom})`, transformOrigin: '50% 50%' }}>
            <svg className="skySvg" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} role="img" aria-label="Live sky map for Eliot, Maine">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} className="skyHorizonCircle" />

              {showHorizon && (
                <g className="horizonSilhouetteSvg" aria-hidden="true">
                  <defs>
                    <clipPath id="backyardTreeHorizonClipSvg">
                      <circle cx={CENTER} cy={CENTER} r={RADIUS} />
                    </clipPath>
                  </defs>

                  <g clipPath="url(#backyardTreeHorizonClipSvg)">
                    <path
                      className="treeShadow treeShadowNorth"
                      d="M488 88 L488 158 L508 146 L526 118 L544 144 L563 104 L582 138 L601 96 L620 142 L640 113 L660 151 L682 128 L704 166 L726 138 L748 174 L770 150 L792 184 L814 162 L838 190 L862 174 L862 88 Z"
                    />
                    <path
                      className="treeShadow treeShadowNorthEast"
                      d="M736 132 L754 190 L772 176 L790 132 L807 166 L826 118 L844 156 L864 106 L884 166 L903 138 L923 190 L943 158 L962 210 L982 184 L1000 206 L1000 132 Z"
                    />
                    <path
                      className="treeShadow treeShadowWest"
                      d="M70 930 L70 846 L88 834 L105 812 L122 832 L140 792 L158 822 L176 784 L195 828 L215 802 L235 850 L255 820 L276 870 L298 844 L320 890 L342 864 L364 904 L386 886 L410 918 L410 1000 L70 1000 Z"
                    />
                    <path
                      className="treeShadow treeShadowSouth"
                      d="M218 1000 L218 870 L236 858 L254 812 L273 854 L292 780 L312 842 L332 742 L353 834 L374 776 L396 862 L418 792 L440 884 L462 816 L484 864 L506 758 L528 850 L550 732 L572 872 L596 808 L620 892 L644 818 L668 866 L692 800 L716 888 L740 838 L764 906 L788 874 L812 920 L812 1000 Z"
                    />
                    <path
                      className="treeShadow treeShadowSouthEast"
                      d="M624 1000 L624 838 L642 826 L660 772 L678 820 L696 742 L716 808 L736 702 L756 802 L776 734 L796 840 L817 748 L838 866 L860 776 L882 850 L904 796 L926 888 L948 840 L970 906 L990 874 L1000 890 L1000 1000 Z"
                    />
                  </g>
                </g>
              )}

              {BACKGROUND_STARS.map((star) => (
                <circle
                  key={star.id}
                  cx={star.x}
                  cy={star.y}
                  r={star.r}
                  className="backgroundStar"
                  style={{ opacity: isDetailMode ? star.opacity : star.opacity * 0.55 }}
                />
              ))}

              <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.66} className="skyAltitudeRing" />
              {isDetailMode && <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.33} className="skyAltitudeRing detailOnly" />}
              <circle cx={CENTER} cy={CENTER} r={8} className="skyZenithDot" />

              <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS} className="skyAxis" />
              <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER} className="skyAxis" />

              <text x={CENTER} y={CENTER - RADIUS - 18} className="compassLabel" transform={keepUpright(CENTER, CENTER - RADIUS - 18)}>N</text>
              <text x={CENTER + RADIUS + 16} y={CENTER + 6} className="compassLabel" transform={keepUpright(CENTER + RADIUS + 16, CENTER + 6)}>E</text>
              <text x={CENTER} y={CENTER + RADIUS + 28} className="compassLabel" transform={keepUpright(CENTER, CENTER + RADIUS + 28)}>S</text>
              <text x={CENTER - RADIUS - 18} y={CENTER + 6} className="compassLabel" transform={keepUpright(CENTER - RADIUS - 18, CENTER + 6)}>W</text>

              {isDetailMode && <text x={CENTER + 14} y={CENTER - 12} className="zenithLabel" transform={keepUpright(CENTER + 14, CENTER - 12)}>Zenith</text>}

              {eclipticPath && <path d={eclipticPath} className="eclipticPath" />}
              {lunarPath && <path d={lunarPath} className="lunarPath" />}
              {isDetailMode && summerTrianglePath && <path d={summerTrianglePath} className="summerTriangleOutline" />}

              {constellationLines.map((segment, index) => (
                <path
                  key={index}
                  d={segment.path}
                  className={segment.group === activeConstellation ? 'constellationSegment active' : 'constellationSegment'}
                />
              ))}

              {selectedPanel === 'future' && activeFutureTarget && activeFutureGuideStars.length > 0 && isInsideSky(activeFutureTarget, 18) && (
                <g className="futureFinderGuide">
                  {activeFutureGuideStars.map((star) => (
                    <g key={`finder-${activeFutureTarget.title}-${star.name}`}>
                      <line
                        x1={star.x}
                        y1={star.y}
                        x2={activeFutureTarget.x}
                        y2={activeFutureTarget.y}
                        className="futureFinderLine"
                      />
                      <circle cx={star.x} cy={star.y} r={6} className="futureFinderStarHalo" />
                      <circle cx={star.x} cy={star.y} r={2.8} className="futureFinderStarDot" />
                    </g>
                  ))}
                </g>
              )}

              {selectedPanel === 'future' && activeTargetTrack?.path && (
                <g className="futureTargetTrack" pointerEvents="none">
                  <path d={activeTargetTrack.path} className="futureTargetTrackPath" />

                  {activeTargetTrack.markers.map((marker) => (
                    <g key={`track-${marker.key}`}>
                      <circle cx={marker.x} cy={marker.y} r={marker.key === 'now' ? 5.2 : 4.2} className={marker.key === 'now' ? 'futureTargetTrackDot now' : 'futureTargetTrackDot'} />
                      <text
                        x={marker.x + 10}
                        y={marker.y - 8}
                        className="futureTargetTrackLabel"
                        transform={keepUpright(marker.x + 10, marker.y - 8)}
                      >
                        {marker.label}
                      </text>
                    </g>
                  ))}

                  {activeTargetTrack.peak && (
                    <g>
                      <circle cx={activeTargetTrack.peak.x} cy={activeTargetTrack.peak.y} r={8.5} className="futureTargetTrackPeakHalo" />
                      <circle cx={activeTargetTrack.peak.x} cy={activeTargetTrack.peak.y} r={4.4} className="futureTargetTrackDot peak" />
                      <text
                        x={activeTargetTrack.peak.x + 12}
                        y={activeTargetTrack.peak.y + 18}
                        className="futureTargetTrackPeakLabel"
                        transform={keepUpright(activeTargetTrack.peak.x + 12, activeTargetTrack.peak.y + 18)}
                      >
                        Peaks {activeFutureTarget.tonightPlan.peak.label}
                      </text>
                    </g>
                  )}
                </g>
              )}

              {visibleStars.map((star) => (
                <g key={star.name}>
                  <circle cx={star.x} cy={star.y} r={Math.max(1.5, 5 - star.mag)} className={star.name === 'Polaris' ? 'skyStar polarisStar' : 'skyStar'} />
                  {(isDetailMode || star.name === 'Polaris') && ['Polaris', 'Vega', 'Deneb', 'Altair'].includes(star.name) && (
                    <text x={star.x + 10} y={star.y - 10} className="brightStarLabel" transform={keepUpright(star.x + 10, star.y - 10)}>{star.name}</text>
                  )}
                </g>
              ))}

              {selectedPanel === 'future' && activeFutureGuideStars.map((star) => {
                const label = getMapLabel(`finderStar:${star.name}`);
                if (!label) return null;

                return (
                  <text
                    key={`finder-label-${star.name}`}
                    x={label.x}
                    y={label.y}
                    className="futureFinderStarLabel"
                    textAnchor={label.anchor}
                    transform={keepUpright(label.x, label.y)}
                  >
                    {star.name}
                  </text>
                );
              })}

              {visiblePlanets.map((planet) => (
                <g key={planet.name}>
                  <circle cx={planet.x} cy={planet.y} r={5} className="planetMarker" />
                  {getMapLabel(`planet:${planet.name}`) && (
                    <text
                      x={getMapLabel(`planet:${planet.name}`).x}
                      y={getMapLabel(`planet:${planet.name}`).y}
                      className="planetLabel"
                      textAnchor={getMapLabel(`planet:${planet.name}`).anchor}
                      transform={keepUpright(getMapLabel(`planet:${planet.name}`).x, getMapLabel(`planet:${planet.name}`).y)}
                    >
                      {planet.name}
                    </text>
                  )}
                </g>
              ))}

              {isInsideSky(moonData, 14) && (
                <g>
                  <circle cx={moonData.x} cy={moonData.y} r={14} className="moonMarkerGlow" />
                  <text x={moonData.x} y={moonData.y + 6} className="moonPhaseIcon" textAnchor="middle" transform={keepUpright(moonData.x, moonData.y)}>{moonData.phaseSymbol}</text>
                  {getMapLabel('moon:main') && (
                    <>
                      <text
                        x={getMapLabel('moon:main').x}
                        y={getMapLabel('moon:main').y}
                        className="moonLabel"
                        textAnchor={getMapLabel('moon:main').anchor}
                        transform={keepUpright(getMapLabel('moon:main').x, getMapLabel('moon:main').y)}
                      >
                        Moon {moonData.phasePercent}%
                      </text>

                      {isDetailMode && (
                        <text
                          x={getMapLabel('moon:main').x}
                          y={getMapLabel('moon:main').y + 17}
                          className="moonPhaseLabel"
                          textAnchor={getMapLabel('moon:main').anchor}
                          transform={keepUpright(getMapLabel('moon:main').x, getMapLabel('moon:main').y + 17)}
                        >
                          {moonData.phaseName}
                        </text>
                      )}
                    </>
                  )}
                </g>
              )}


              {catalogView === 'captured' && isDetailMode && visibleFutureTargets.map((target) => {
                const actualIndex = mappedFutureTargets.findIndex((item) => item.title === target.title);
                const isActive = selectedPanel === 'future' && activeFutureIndex === actualIndex;
                const markerColor = getObjectColor(target.objectType);

                return (
                  <g
                    key={`future-${target.title}`}
                    className={isActive ? 'futureTargetMarker active' : 'futureTargetMarker'}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => selectFutureTarget(actualIndex)}
                    onFocus={() => selectFutureTarget(actualIndex)}
                    onClick={() => selectFutureTarget(actualIndex)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectFutureTarget(actualIndex);
                      }
                    }}
                  >
                    <circle
                      cx={target.x}
                      cy={target.y}
                      r={isActive ? 14 : 11}
                      className="futureTargetHalo"
                      style={{ stroke: markerColor }}
                    />
                    <line
                      x1={target.x - 7}
                      y1={target.y}
                      x2={target.x + 7}
                      y2={target.y}
                      className="futureTargetCross"
                      style={{ stroke: markerColor }}
                    />
                    <line
                      x1={target.x}
                      y1={target.y - 7}
                      x2={target.x}
                      y2={target.y + 7}
                      className="futureTargetCross"
                      style={{ stroke: markerColor }}
                    />
                    {getMapLabel(`future:${target.title}`) && (
                      <text
                        x={getMapLabel(`future:${target.title}`).x}
                        y={getMapLabel(`future:${target.title}`).y}
                        className="futureTargetLabel"
                        textAnchor={getMapLabel(`future:${target.title}`).anchor}
                        transform={keepUpright(getMapLabel(`future:${target.title}`).x, getMapLabel(`future:${target.title}`).y)}
                      >
                        {target.shortTitle || target.title}
                      </text>
                    )}
                  </g>
                );
              })}

              {catalogView === 'future' && futureCallouts.map((target) => {
                const index = mappedFutureTargets.findIndex((item) => item.title === target.title);
                const markerColor = getObjectColor(target.objectType);
                const isActive = selectedPanel === 'future' && activeFutureIndex === index;
                const label = getMapLabel(`futureCallout:${target.title}`);

                return (
                  <g
                    key={`${target.title}-future-callout`}
                    className={isActive ? 'missionSvgCallout futureSvgCallout active' : 'missionSvgCallout futureSvgCallout'}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => selectFutureTarget(index)}
                    onFocus={() => selectFutureTarget(index)}
                    onClick={() => selectFutureTarget(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectFutureTarget(index);
                      }
                    }}
                  >
                    <line
                      x1={target.x}
                      y1={target.y}
                      x2={target.markerX}
                      y2={target.markerY}
                      className={isActive ? 'missionGuideLine active' : 'missionGuideLine'}
                    />

                    <line
                      x1={target.x - 6}
                      y1={target.y}
                      x2={target.x + 6}
                      y2={target.y}
                      className="futureTargetCross"
                      style={{ stroke: markerColor }}
                    />
                    <line
                      x1={target.x}
                      y1={target.y - 6}
                      x2={target.x}
                      y2={target.y + 6}
                      className="futureTargetCross"
                      style={{ stroke: markerColor }}
                    />

                    {isActive && (
                      <circle
                        cx={target.x}
                        cy={target.y}
                        r={15}
                        className="missionAnchorGlow"
                        style={{ stroke: markerColor }}
                      />
                    )}

                    <g transform={keepUpright(target.markerX, target.markerY)}>
                      <circle
                        cx={target.markerX}
                        cy={target.markerY}
                        r={mobileLayout ? 17 : 19}
                        className={isActive ? 'missionSvgBadge active' : 'missionSvgBadge'}
                        style={{ stroke: markerColor }}
                      />

                      <text
                        x={target.markerX}
                        y={target.markerY + 6}
                        className="missionSvgBadgeText"
                        textAnchor="middle"
                      >
                        {target.rankNumber || index + 1}
                      </text>

                      {label && (
                        <text
                          x={label.x}
                          y={label.y}
                          className="missionSvgBadgeName futureCalloutName"
                          textAnchor={label.anchor}
                        >
                          {target.shortTitle || target.title}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}

              {catalogView === 'captured' && missionCallouts.map((photo) => {
                const index = mappedObjects.findIndex((item) => item.title === photo.title);
                const markerColor = getObjectColor(photo.objectType);
                const isActive = selectedPanel === 'captured' && activeIndex === index;
                const label = getMapLabel(`mission:${photo.title}`);

                return (
                  <g
                    key={`${photo.title}-callout`}
                    className={isActive ? 'missionSvgCallout active' : 'missionSvgCallout'}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => selectCapturedTarget(index)}
                    onFocus={() => selectCapturedTarget(index)}
                    onClick={() => selectCapturedTarget(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectCapturedTarget(index);
                      }
                    }}
                  >
                    <line
                      x1={photo.x}
                      y1={photo.y}
                      x2={photo.markerX}
                      y2={photo.markerY}
                      className={isActive ? 'missionGuideLine active' : 'missionGuideLine'}
                    />

                    <line
                      x1={photo.x - 5}
                      y1={photo.y - 5}
                      x2={photo.x + 5}
                      y2={photo.y + 5}
                      className="missionAnchorX"
                      style={{ stroke: markerColor }}
                    />
                    <line
                      x1={photo.x + 5}
                      y1={photo.y - 5}
                      x2={photo.x - 5}
                      y2={photo.y + 5}
                      className="missionAnchorX"
                      style={{ stroke: markerColor }}
                    />

                    {isActive && (
                      <circle
                        cx={photo.x}
                        cy={photo.y}
                        r={13}
                        className="missionAnchorGlow"
                        style={{ stroke: markerColor }}
                      />
                    )}

                    <g transform={keepUpright(photo.markerX, photo.markerY)}>
                      <circle
                        cx={photo.markerX}
                        cy={photo.markerY}
                        r={mobileLayout ? 17 : 19}
                        className={isActive ? 'missionSvgBadge active' : 'missionSvgBadge'}
                        style={{ stroke: markerColor }}
                      />

                      <text
                        x={photo.markerX}
                        y={photo.markerY + 6}
                        className="missionSvgBadgeText"
                        textAnchor="middle"
                      >
                        {index + 1}
                      </text>

                      {label && (
                        <text
                          x={label.x}
                          y={label.y}
                          className="missionSvgBadgeName"
                          textAnchor={label.anchor}
                        >
                          {photo.title}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}

              {constellationLabels
                .filter((label) => isDetailMode || label.name === activeConstellation)
                .map((label) => (
                  <text
                    key={label.name}
                    x={label.x}
                    y={label.y}
                    transform={keepUpright(label.x, label.y)}
                    className={label.name === activeConstellation ? 'constellationText active' : 'constellationText'}
                  >
                    {label.name}
                  </text>
                ))}

              {isDetailMode && summerTriangleLabel && <text x={summerTriangleLabel.x} y={summerTriangleLabel.y} className="guideLabel" transform={keepUpright(summerTriangleLabel.x, summerTriangleLabel.y)}>Summer Triangle</text>}

              {isDetailMode && (
                <>
                  <text x={eclipticLabel.x} y={eclipticLabel.y} className="pathLabel" transform={keepUpright(eclipticLabel.x, eclipticLabel.y)}>Ecliptic</text>
                  <text x={lunarLabel.x} y={lunarLabel.y} className="pathLabel" transform={keepUpright(lunarLabel.x, lunarLabel.y)}>Lunar Path</text>
                </>
              )}
            </svg>
          </div>




          <div className="atlasLegend enhancedLegend">
            <span><i className="legendCyan"></i> Planetary Nebula</span>
            <span><i className="legendPurple"></i> Emission Nebula</span>
            <span><i className="legendOrange"></i> Globular Cluster</span>
            <span><i className="legendGold"></i> Double Star</span>
            <span><i className="legendSilver"></i> Lunar</span>
          </div>

          <div
            className="atlasZoomControls"
            aria-label="Sky map zoom and rotation controls"
            onPointerDown={stopMapPointerEvents}
            onPointerMove={stopMapPointerEvents}
            onPointerUp={stopMapPointerEvents}
            onClick={stopMapPointerEvents}
          >
            <button type="button" onPointerDown={stopMapPointerEvents} onClick={(event) => { event.stopPropagation(); zoomIn(); }} aria-label="Zoom in">+</button>
            <button type="button" onPointerDown={stopMapPointerEvents} onClick={(event) => { event.stopPropagation(); zoomOut(); }} aria-label="Zoom out">−</button>
            <button type="button" onPointerDown={stopMapPointerEvents} onClick={(event) => { event.stopPropagation(); rotateLeft(); }} aria-label="Rotate sky map left">↺</button>
            <button type="button" onPointerDown={stopMapPointerEvents} onClick={(event) => { event.stopPropagation(); rotateRight(); }} aria-label="Rotate sky map right">↻</button>
            <button type="button" onPointerDown={stopMapPointerEvents} onClick={(event) => { event.stopPropagation(); resetView(); }} aria-label="Reset sky map view">Reset</button>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
        </div>

        <aside className="atlasCatalog plannerCatalog">
          <div className="catalogTabs" aria-label="Mission catalog tabs">
            <button
              type="button"
              className={catalogView === 'future' ? 'active' : ''}
              onClick={() => { setCatalogView('future'); setSelectedPanel('future'); }}
            >
              Future
            </button>
            <button
              type="button"
              className={catalogView === 'captured' ? 'active' : ''}
              onClick={() => { setCatalogView('captured'); setSelectedPanel('captured'); }}
            >
              Captured
            </button>
          </div>

          <small>{catalogView === 'future' ? 'Target Planner' : 'Mission Archive'}</small>

          {catalogView === 'future' && rankedFutureTargets.map((target) => (
            <button
              key={target.title}
              className={target.actualIndex === activeFutureIndex && selectedPanel === 'future' ? 'catalogItem futureItem active' : 'catalogItem futureItem'}
              onMouseEnter={() => selectFutureTarget(target.actualIndex)}
              onFocus={() => selectFutureTarget(target.actualIndex)}
              onClick={() => selectFutureTarget(target.actualIndex, true)}
              type="button"
            >
              <b>{target.rankNumber}</b>
              <span>
                <strong>{target.title}</strong>
                <em>{target.constellation}</em>
                <small>{target.objectType} · best: {target.tonightPlan.bestWindow}</small>
                <i className={`targetStatusBadge ${target.plannerStatus.className}`}>{target.plannerStatus.label}</i>
              </span>
            </button>
          ))}

          {catalogView === 'captured' && mappedObjects.map((photo, index) => (
            <button
              key={photo.title}
              className={index === activeIndex && selectedPanel === 'captured' ? 'catalogItem active' : 'catalogItem'}
              onMouseEnter={() => selectCapturedTarget(index)}
              onFocus={() => selectCapturedTarget(index)}
              onClick={() => selectCapturedTarget(index, true)}
              type="button"
            >
              <b>{index + 1}</b>
              <span>
                <strong>{photo.title}</strong>
                <em>{photo.constellation}</em>
                <small>{photo.objectType}</small>
                <i className={`targetStatusBadge ${photo.observingStatus.className}`}>{photo.observingStatus.label}</i>
              </span>
            </button>
          ))}
        </aside>
      </section>

      {selectedPanel === 'captured' && activeObject && (
        <section className="atlasDetail">
          <img src={import.meta.env.BASE_URL + activeObject.image} alt={activeObject.title} />
          <div>
            <small>Selected Mission</small>
            <h2><span>{activeIndex + 1}</span>{activeObject.title}</h2>
            <h3>{activeObject.subtitle}</h3>
            <p>{activeObject.notes}</p>
            <div className="atlasFacts">
              <span><b>Status</b>{activeObject.observingStatus.label}</span>
              <span><b>Constellation</b>{activeObject.constellation}</span>
              <span><b>Type</b>{activeObject.objectType}</span>
              <span><b>RA</b>{formatRa(activeObject.ra)}</span>
              <span><b>Dec</b>{formatDec(activeObject.dec)}</span>
              <span><b>Altitude</b>{activeObject.alt.toFixed(1)}°</span>
              <span><b>Azimuth</b>{activeObject.az.toFixed(1)}°</span>
              <span><b>Map Time</b>{formatCompactTime(date)}</span>
              <span><b>Moon Phase</b>{moonData.phaseSymbol} {moonData.phaseName} · {moonData.phasePercent}% lit</span>
            </div>
            <button type="button" onClick={() => openMission(activeObject)}>Open Mission Report →</button>
          </div>
        </section>
      )}

      {selectedPanel === 'future' && activeFutureTarget && (
        <section className="atlasDetail plannerDetail">
          <div className="futureDetailBadge">#{activeFutureTarget.rankNumber || activeFutureIndex + 1}<br />{activeFutureTarget.plannerStatus.label}</div>
          <div>
            <small>Target Planner</small>
            <h2><span>＋</span>{activeFutureTarget.title}</h2>
            <h3>{activeFutureTarget.constellation} · {activeFutureTarget.objectType}</h3>
            <p>{activeFutureTarget.notes}</p>
            {activeFutureGuide?.finderNote && (
              <p className="futureFinderNote">
                <b>Finder guide:</b> {activeFutureGuide.finderNote}
              </p>
            )}
            <div className="atlasFacts">
              <span><b>Planner Status</b>{activeFutureTarget.plannerStatus.label}</span>
              <span><b>Best Tonight</b>{activeFutureTarget.tonightPlan.bestWindow}</span>
              <span><b>Track</b>{activeTargetTrack?.isRising === null ? 'Visible path shown on map' : activeTargetTrack.isRising ? 'Generally rising tonight' : 'Generally setting tonight'}</span>
              <span><b>Peak Altitude</b>{activeFutureTarget.tonightPlan.peak.alt.toFixed(1)}° at {activeFutureTarget.tonightPlan.peak.label}</span>
              <span><b>Now</b>{activeFutureTarget.observingStatus.label}</span>
              <span><b>Priority</b>{activeFutureTarget.priority}</span>
              <span><b>Best Season</b>{activeFutureTarget.bestSeason}</span>
              <span><b>Finder Region</b>{activeFutureGuide?.guideConstellation || activeFutureTarget.constellation}</span>
              <span><b>Gear</b>{activeFutureTarget.gear}</span>
              <span><b>RA</b>{formatRa(activeFutureTarget.ra)}</span>
              <span><b>Dec</b>{formatDec(activeFutureTarget.dec)}</span>
              <span><b>Altitude</b>{activeFutureTarget.alt.toFixed(1)}°</span>
              <span><b>Azimuth</b>{activeFutureTarget.az.toFixed(1)}°</span>
              <span><b>Map Time</b>{formatCompactTime(date)}</span>
              <span><b>Moon Phase</b>{moonData.phaseSymbol} {moonData.phaseName} · {moonData.phasePercent}% lit</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
