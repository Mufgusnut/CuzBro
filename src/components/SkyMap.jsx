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

const VISITOR_TARGETS = [
  {
    title: '10P/Tempel 2',
    shortTitle: 'Tempel 2',
    constellation: 'Moving Target',
    objectType: 'Comet',
    ra: null,
    dec: null,
    priority: 'Visitor',
    closestApproach: 'Update with current ephemeris',
    bestSeason: 'When current ephemeris places it high enough',
    magnitude: 'Varies nightly',
    gear: 'Camera preferred; dark sky and stacking help a lot',
    notes: 'Periodic comet visitor. Add this week\'s RA/Dec from SkySafari, Stellarium, or another ephemeris source to activate live map position, Moon scoring, tree scoring, and session-plan ranking.',
    ephemerisNote: 'RA/Dec not loaded yet — this card is ready for manual ephemeris updates.'
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

function buildSmoothPathFromSegment(segment) {
  if (!segment.length) return '';
  if (segment.length === 1) {
    return `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`;
  }
  if (segment.length === 2) {
    return `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)} L ${segment[1].x.toFixed(1)} ${segment[1].y.toFixed(1)}`;
  }

  let path = `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`;

  for (let i = 1; i < segment.length - 1; i += 1) {
    const current = segment[i];
    const next = segment[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }

  const last = segment[segment.length - 1];
  path += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  return path;
}

function buildSmoothVisiblePathNearestPoint(points, anchorPoint, buffer = 18) {
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

  if (!segments.length) return '';

  if (!anchorPoint || !isInsideSky(anchorPoint, buffer)) {
    return buildSmoothPathFromSegment(segments.sort((a, b) => b.length - a.length)[0] || []);
  }

  const closestSegment = segments
    .map((segment) => {
      const closestDistance = segment.reduce((best, point) => {
        const distance = pointDistance(point, anchorPoint);
        return Math.min(best, distance);
      }, Number.POSITIVE_INFINITY);

      return { segment, closestDistance };
    })
    .sort((a, b) => a.closestDistance - b.closestDistance)[0]?.segment || [];

  return buildSmoothPathFromSegment(closestSegment);
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
    case 'Comet':
      return 'var(--orange)';
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


function angularSeparationDegrees(raHoursA, decDegreesA, raHoursB, decDegreesB) {
  const raA = toRadians(raHoursA * 15);
  const decA = toRadians(decDegreesA);
  const raB = toRadians(raHoursB * 15);
  const decB = toRadians(decDegreesB);

  const cosSeparation =
    Math.sin(decA) * Math.sin(decB) +
    Math.cos(decA) * Math.cos(decB) * Math.cos(raA - raB);

  return toDegrees(Math.acos(clamp(cosSeparation, -1, 1)));
}

function getMoonSensitivity(objectType) {
  switch (objectType) {
    case 'Galaxy':
    case 'Emission Nebula':
    case 'Supernova Remnant':
    case 'Comet':
      return 1;
    case 'Planetary Nebula':
      return 0.72;
    case 'Open Cluster':
    case 'Globular Cluster':
      return 0.38;
    case 'Double Star':
      return 0.18;
    case 'Planet':
    case 'Lunar':
      return 0;
    default:
      return 0.55;
  }
}

function getMoonImpact(target, moonInfo) {
  if (!target || !moonInfo || target.ra === null || target.dec === null) {
    return {
      label: 'Moon OK',
      detail: 'Moon impact is minimal for this target.',
      className: 'ok',
      score: 0,
      rankPenalty: 0,
      separationDegrees: null
    };
  }

  const sensitivity = getMoonSensitivity(target.objectType);
  const separationDegrees = angularSeparationDegrees(target.ra, target.dec, moonInfo.ra, moonInfo.dec);
  const moonAboveFactor = moonInfo.alt > 0 ? 1 : moonInfo.alt > -8 ? 0.35 : 0.12;
  const brightnessFactor = clamp(moonInfo.phasePercent / 100, 0, 1);

  let separationFactor = 0.15;
  if (separationDegrees < 18) separationFactor = 1;
  else if (separationDegrees < 35) separationFactor = 0.86;
  else if (separationDegrees < 55) separationFactor = 0.68;
  else if (separationDegrees < 80) separationFactor = 0.46;
  else if (separationDegrees < 115) separationFactor = 0.25;

  const score = Math.round(100 * sensitivity * brightnessFactor * moonAboveFactor * separationFactor);

  if (sensitivity === 0) {
    return {
      label: 'Moon irrelevant',
      detail: 'The Moon does not meaningfully hurt planetary targets.',
      className: 'ok',
      score: 0,
      rankPenalty: 0,
      separationDegrees
    };
  }

  if (moonInfo.alt < -8 || moonInfo.phasePercent < 25 || score < 12) {
    return {
      label: 'Dark-sky friendly',
      detail: 'Moon impact should be low for this target.',
      className: 'ok',
      score,
      rankPenalty: 0,
      separationDegrees
    };
  }

  if (score >= 62) {
    return {
      label: 'Moon hurts',
      detail: 'Bright moonlight is a major problem for this target tonight.',
      className: 'bad',
      score,
      rankPenalty: Math.round(score * 1.25),
      separationDegrees
    };
  }

  if (score >= 34) {
    return {
      label: 'Moon caution',
      detail: 'The Moon may wash out contrast, especially for faint structure.',
      className: 'caution',
      score,
      rankPenalty: Math.round(score * 0.9),
      separationDegrees
    };
  }

  return {
    label: 'Moon OK',
    detail: 'The Moon is present, but this target is not badly affected.',
    className: 'ok',
    score,
    rankPenalty: Math.round(score * 0.35),
    separationDegrees
  };
}


function angularDistanceClockwise(startDegrees, endDegrees) {
  return normalizeDegrees(endDegrees - startDegrees);
}

function azimuthInClockwiseArc(azDegrees, startDegrees, endDegrees) {
  return angularDistanceClockwise(startDegrees, azDegrees) <= angularDistanceClockwise(startDegrees, endDegrees);
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function getBackyardTreeAltitude(azDegrees) {
  const az = normalizeDegrees(azDegrees);

  // Backyard obstruction model:
  // - Tall trees from S → E
  // - Short trees from E → NE
  // - Clear from NE → W
  // - Short trees from W → S
  // Azimuth convention: N=0, E=90, S=180, W=270.
  if (azimuthInClockwiseArc(90, az, 180)) {
    const t = angularDistanceClockwise(90, az) / angularDistanceClockwise(90, 180);
    return 30 + smoothstep01(t) * 12; // 30° near E, ~42° near S.
  }

  if (azimuthInClockwiseArc(45, az, 90)) {
    const t = angularDistanceClockwise(45, az) / angularDistanceClockwise(45, 90);
    return 10 + smoothstep01(t) * 10; // 10° near NE, ~20° near E.
  }

  if (azimuthInClockwiseArc(180, az, 270)) {
    const t = angularDistanceClockwise(180, az) / angularDistanceClockwise(180, 270);
    return 24 - smoothstep01(t) * 8; // 24° near S, ~16° near W.
  }

  return 0; // Clear from NE → W through N/NW.
}

function getTreeObstruction(target, tonightPlan) {
  if (!target) {
    return {
      label: 'Clear view',
      detail: 'No local tree obstruction check is needed.',
      className: 'ok',
      rankPenalty: 0,
      horizonAltitude: 0,
      clearanceDegrees: null,
      clearWindow: 'N/A'
    };
  }

  const horizonAltitude = getBackyardTreeAltitude(target.az);
  const clearanceDegrees = target.alt - horizonAltitude;
  const usefulClearSamples = (tonightPlan?.samples || [])
    .map((sample) => {
      const sampleHorizon = getBackyardTreeAltitude(sample.az);
      return {
        ...sample,
        treeHorizonAltitude: sampleHorizon,
        treeClearance: sample.alt - sampleHorizon
      };
    })
    .filter((sample) => sample.alt >= 0 && sample.status.score >= 2 && sample.treeClearance >= 6);

  const clearWindow = usefulClearSamples.length
    ? usefulClearSamples.map((sample) => sample.label).join(' / ')
    : 'No clear window';

  if (horizonAltitude <= 1) {
    return {
      label: 'Clear view',
      detail: 'This direction is in your clearer NE-to-W sky, so local trees should not be a major issue.',
      className: 'ok',
      rankPenalty: 0,
      horizonAltitude,
      clearanceDegrees,
      clearWindow
    };
  }

  if (target.alt < 0) {
    return {
      label: 'Below horizon',
      detail: 'This target is below the astronomical horizon at the selected map time.',
      className: 'bad',
      rankPenalty: 80,
      horizonAltitude,
      clearanceDegrees,
      clearWindow
    };
  }

  if (clearanceDegrees < -3) {
    const clearsLater = usefulClearSamples.some((sample) => sample.date > new Date());

    return {
      label: clearsLater ? 'Trees now' : 'Tree blocked',
      detail: clearsLater
        ? `It is likely behind your local tree line right now, but it may clear later around ${clearWindow}.`
        : 'It is likely too low behind your local tree line during the useful part of tonight.',
      className: clearsLater ? 'caution' : 'bad',
      rankPenalty: clearsLater ? 48 : 95,
      horizonAltitude,
      clearanceDegrees,
      clearWindow
    };
  }

  if (clearanceDegrees < 7) {
    return {
      label: 'Tree risk',
      detail: 'This target is close to your local tree line. It may be visible, but branches or the roofline could interfere.',
      className: 'caution',
      rankPenalty: 32,
      horizonAltitude,
      clearanceDegrees,
      clearWindow
    };
  }

  return {
    label: 'Above trees',
    detail: 'This target is comfortably above your estimated backyard tree line at the selected map time.',
    className: 'ok',
    rankPenalty: 0,
    horizonAltitude,
    clearanceDegrees,
    clearWindow
  };
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

function getFuturePlannerStatus(currentStatus, tonightPlan, target, referenceDate = new Date(), moonImpact = null, treeObstruction = null) {
  const peakAlt = tonightPlan?.peak?.alt ?? -90;
  const hasBestLater = tonightPlan?.bestSamples?.some((sample) => sample.date > referenceDate && sample.status.score >= 3);
  const hasGoodLater = tonightPlan?.goodSamples?.some((sample) => sample.date > referenceDate && sample.status.score >= 2);
  const priorityWeight = getPriorityWeight(target.priority);
  const moonPenalty = moonImpact?.rankPenalty ?? 0;
  const treePenalty = treeObstruction?.rankPenalty ?? 0;
  const plannerPenalty = moonPenalty + treePenalty;

  if (currentStatus.score >= 3) {
    return {
      label: 'Best Now',
      className: 'best',
      rankScore: 500 + currentStatus.score * 20 + peakAlt + priorityWeight * 10 - plannerPenalty
    };
  }

  if (hasBestLater || tonightPlan?.bestSamples?.length) {
    return {
      label: 'Best Later',
      className: 'best',
      rankScore: 420 + peakAlt + priorityWeight * 10 - plannerPenalty
    };
  }

  if (currentStatus.score >= 2) {
    return {
      label: 'Good Now',
      className: 'good',
      rankScore: 360 + peakAlt + priorityWeight * 10 - plannerPenalty
    };
  }

  if (hasGoodLater || tonightPlan?.goodSamples?.length) {
    return {
      label: 'Good Later',
      className: 'good',
      rankScore: 300 + peakAlt + priorityWeight * 10 - plannerPenalty
    };
  }

  if (peakAlt >= 20) {
    return {
      label: 'Low Tonight',
      className: 'low',
      rankScore: 170 + peakAlt + priorityWeight * 8 - plannerPenalty
    };
  }

  if (peakAlt >= 0) {
    return {
      label: 'Barely Up',
      className: 'low',
      rankScore: 100 + peakAlt + priorityWeight * 6 - plannerPenalty
    };
  }

  return {
    label: 'Not Tonight',
    className: 'below',
    rankScore: priorityWeight * 5 - plannerPenalty
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

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angle = (angleDeg - 90) * (Math.PI / 180);

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildForestSection({
  cx,
  cy,
  radius,
  startDeg,
  endDeg,
  treeCount,
  minHeight,
  maxHeight,
  phase = 0
}) {
  const trees = [];
  const angleStep = (endDeg - startDeg) / Math.max(1, treeCount - 1);

  for (let i = 0; i < treeCount; i += 1) {
    const t = treeCount <= 1 ? 0 : i / (treeCount - 1);
    const angle = startDeg + angleStep * i;
    const base = polarToCartesian(cx, cy, radius, angle);

    // Gentle deterministic variation keeps the line organic without turning
    // it into a saw blade / row of teeth.
    const ripple = Math.sin(i * 1.73 + phase) * 0.12 + Math.sin(i * 0.57 + phase * 2.1) * 0.08;
    const height = lerp(minHeight, maxHeight, t) * (1 + ripple);
    const width = clamp(height * 0.28, 7, 18);

    trees.push({
      id: `${startDeg}-${endDeg}-${i}`,
      angle,
      x: base.x,
      y: base.y,
      height: clamp(height, 10, 82),
      width,
      opacity: 0.78 + Math.sin(i * 0.91 + phase) * 0.08
    });
  }

  return trees;
}

function buildConnectedForestTrees() {
  const radius = RADIUS - 8;

  return [
    // W → S: short trees, gradually taller as the view approaches the south.
    ...buildForestSection({
      cx: CENTER,
      cy: CENTER,
      radius,
      startDeg: 270,
      endDeg: 180,
      treeCount: 34,
      minHeight: 18,
      maxHeight: 34,
      phase: 0.4
    }),

    // S → E: main obstruction zone, tallest and densest.
    ...buildForestSection({
      cx: CENTER,
      cy: CENTER,
      radius,
      startDeg: 180,
      endDeg: 90,
      treeCount: 52,
      minHeight: 48,
      maxHeight: 72,
      phase: 1.7
    }),

    // E → NE: short trees tapering down toward clear sky.
    ...buildForestSection({
      cx: CENTER,
      cy: CENTER,
      radius,
      startDeg: 90,
      endDeg: 45,
      treeCount: 24,
      minHeight: 28,
      maxHeight: 14,
      phase: 2.8
    })

    // NE → W is intentionally clear.
  ];
}

function buildForestBasePath(trees) {
  if (!trees.length) return '';

  return trees
    .map((tree, index) => `${index === 0 ? 'M' : 'L'} ${tree.x.toFixed(1)} ${tree.y.toFixed(1)}`)
    .join(' ');
}

function buildConiferPath(tree) {
  const h = tree.height;
  const w = tree.width;

  // Local coordinate system: base at (0, 0), treetop points upward.
  // The rendered group rotates this inward toward the map center.
  return [
    `M 0 ${(-h).toFixed(1)}`,
    `C ${(-w * 0.18).toFixed(1)} ${(-h * 0.86).toFixed(1)} ${(-w * 0.34).toFixed(1)} ${(-h * 0.78).toFixed(1)} ${(-w * 0.22).toFixed(1)} ${(-h * 0.70).toFixed(1)}`,
    `L ${(-w * 0.50).toFixed(1)} ${(-h * 0.64).toFixed(1)}`,
    `L ${(-w * 0.20).toFixed(1)} ${(-h * 0.57).toFixed(1)}`,
    `L ${(-w * 0.62).toFixed(1)} ${(-h * 0.48).toFixed(1)}`,
    `L ${(-w * 0.24).toFixed(1)} ${(-h * 0.41).toFixed(1)}`,
    `L ${(-w * 0.70).toFixed(1)} ${(-h * 0.30).toFixed(1)}`,
    `L ${(-w * 0.28).toFixed(1)} ${(-h * 0.23).toFixed(1)}`,
    `L ${(-w * 0.50).toFixed(1)} ${(-h * 0.10).toFixed(1)}`,
    `L 0 0`,
    `L ${(w * 0.50).toFixed(1)} ${(-h * 0.10).toFixed(1)}`,
    `L ${(w * 0.28).toFixed(1)} ${(-h * 0.23).toFixed(1)}`,
    `L ${(w * 0.70).toFixed(1)} ${(-h * 0.30).toFixed(1)}`,
    `L ${(w * 0.24).toFixed(1)} ${(-h * 0.41).toFixed(1)}`,
    `L ${(w * 0.62).toFixed(1)} ${(-h * 0.48).toFixed(1)}`,
    `L ${(w * 0.20).toFixed(1)} ${(-h * 0.57).toFixed(1)}`,
    `L ${(w * 0.50).toFixed(1)} ${(-h * 0.64).toFixed(1)}`,
    `C ${(w * 0.34).toFixed(1)} ${(-h * 0.78).toFixed(1)} ${(w * 0.18).toFixed(1)} ${(-h * 0.86).toFixed(1)} 0 ${(-h).toFixed(1)}`,
    'Z'
  ].join(' ');
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

function targetHasBadMoon(target) {
  return target?.moonImpact?.className === 'bad';
}

function targetHasTreeProblem(target) {
  return target?.treeObstruction?.className === 'bad';
}

function targetHasCaution(target) {
  return target?.moonImpact?.className === 'caution' || target?.treeObstruction?.className === 'caution';
}

function isPlanetTarget(target) {
  return target?.objectType === 'Planet';
}

function isTargetUsableTonight(target) {
  if (!target) return false;
  if (target.plannerStatus?.className === 'below') return false;
  if (targetHasBadMoon(target) || targetHasTreeProblem(target)) return false;
  return (target.tonightPlan?.peak?.alt ?? -90) >= 15;
}

function buildPlanReason(target) {
  if (!target) return '';

  const reasons = [];

  if (target.tonightPlan?.bestWindow) {
    reasons.push(`best window: ${target.tonightPlan.bestWindow}`);
  }

  if (target.treeObstruction?.className === 'ok') {
    reasons.push(target.treeObstruction.label.toLowerCase());
  } else if (target.treeObstruction) {
    reasons.push(target.treeObstruction.label.toLowerCase());
  }

  if (target.moonImpact?.className === 'ok') {
    reasons.push(target.moonImpact.label.toLowerCase());
  } else if (target.moonImpact) {
    reasons.push(target.moonImpact.label.toLowerCase());
  }

  return reasons.join(' · ');
}

function buildTonightSessionPlan(targets) {
  const ranked = [...(targets || [])];
  const usable = ranked.filter(isTargetUsableTonight);
  const nonPlanetUsable = usable.filter((target) => !isPlanetTarget(target));
  const planetTargets = ranked.filter(isPlanetTarget);

  const startTarget =
    nonPlanetUsable.find((target) => target.plannerStatus?.label?.includes('Now') && !targetHasCaution(target)) ||
    nonPlanetUsable.find((target) => target.plannerStatus?.label?.includes('Now')) ||
    nonPlanetUsable[0] ||
    usable[0] ||
    ranked[0] ||
    null;

  const laterTarget =
    nonPlanetUsable.find((target) => target.title !== startTarget?.title && target.plannerStatus?.label?.includes('Later')) ||
    nonPlanetUsable.find((target) => target.title !== startTarget?.title) ||
    usable.find((target) => target.title !== startTarget?.title) ||
    null;

  const planetBackup =
    planetTargets.find((target) => target.plannerStatus?.className !== 'below' && !targetHasTreeProblem(target)) ||
    planetTargets[0] ||
    null;

  const avoidTargets = ranked
    .filter((target) => {
      if (!target) return false;
      if (target.title === startTarget?.title || target.title === laterTarget?.title || target.title === planetBackup?.title) return false;
      return targetHasBadMoon(target) || targetHasTreeProblem(target) || target.plannerStatus?.className === 'below';
    })
    .slice(0, 3);

  const steps = [];

  if (startTarget) {
    steps.push({
      key: 'start',
      label: 'Start here',
      target: startTarget,
      note: `Best first pick. ${buildPlanReason(startTarget)}.`,
      className: targetHasCaution(startTarget) ? 'caution' : 'ok'
    });
  }

  if (laterTarget) {
    steps.push({
      key: 'later',
      label: 'Then try',
      target: laterTarget,
      note: `Good follow-up. ${buildPlanReason(laterTarget)}.`,
      className: targetHasCaution(laterTarget) ? 'caution' : 'ok'
    });
  }

  if (planetBackup) {
    steps.push({
      key: 'backup',
      label: 'Backup target',
      target: planetBackup,
      note: `Use this if seeing is steady or deep-sky contrast is poor. ${buildPlanReason(planetBackup)}.`,
      className: targetHasTreeProblem(planetBackup) ? 'caution' : 'ok'
    });
  }

  if (avoidTargets.length) {
    steps.push({
      key: 'avoid',
      label: 'Skip for now',
      target: avoidTargets[0],
      extraTargets: avoidTargets.slice(1),
      note: `Lower priority tonight because of ${[
        avoidTargets[0].moonImpact?.className === 'bad' ? 'moonlight' : null,
        avoidTargets[0].treeObstruction?.className === 'bad' ? 'trees' : null,
        avoidTargets[0].plannerStatus?.className === 'below' ? 'low altitude' : null
      ].filter(Boolean).join(' / ') || 'conditions'}.`,
      className: 'bad'
    });
  }

  return {
    startTarget,
    laterTarget,
    planetBackup,
    avoidTargets,
    steps
  };
}



function visitorHasEphemeris(visitor) {
  return Number.isFinite(visitor?.ra) && Number.isFinite(visitor?.dec);
}

function getVisitorEphemerisStatus(visitor) {
  if (visitorHasEphemeris(visitor)) return null;

  return {
    label: 'Ephemeris needed',
    className: 'low',
    rankScore: -500,
    detail: visitor?.ephemerisNote || 'Add current RA/Dec to activate live scoring.'
  };
}

function buildVisitorUnavailablePlan(visitor) {
  return {
    samples: [],
    visibleSamples: [],
    peak: { alt: -90, label: 'N/A', date: new Date() },
    bestSamples: [],
    goodSamples: [],
    bestWindow: 'Add RA/Dec'
  };
}

function getVisitorActionNote(visitor) {
  if (visitorHasEphemeris(visitor)) return 'Live scoring active from the loaded RA/Dec.';
  return 'Add the current RA/Dec at the top of SkyMap.jsx to make this visitor appear on the map.';
}


function getTargetFramingPreview(target) {
  const type = target?.objectType || 'Target';
  const title = target?.title || '';
  const shortTitle = target?.shortTitle || title || 'Target';

  const base = {
    headline: 'Framing preview',
    fit: 'Moderate fit',
    className: 'moderate',
    native: 'CPC 800 native: workable, but framing depends on target size.',
    reducer: 'Reducer: helpful for easier framing and brighter images when you add one.',
    eyepiece32: '32mm eyepiece: best starting view and finder eyepiece.',
    eyepiece10: '10mm eyepiece: use only after centering and only if the target benefits from scale.',
    iphone: 'iPhone: take a short test capture first, then adjust exposure/focus.',
    note: 'Start wide, center carefully, then decide whether more scale or wider field is the right move.',
    chips: ['CPC 800', '32mm finder', 'test frame']
  };

  if (type === 'Comet') {
    return {
      headline: 'Moving target framing',
      fit: visitorHasEphemeris(target) ? 'Field check needed' : 'Needs RA/Dec',
      className: visitorHasEphemeris(target) ? 'moderate' : 'caution',
      native: 'CPC 800 native: possible, but the comet may be faint and field verification matters.',
      reducer: 'Reducer: useful for a wider field and easier star-field matching.',
      eyepiece32: '32mm eyepiece: best way to confirm the predicted field visually.',
      eyepiece10: '10mm eyepiece: usually too tight unless the comet is bright and condensed.',
      iphone: 'iPhone: stack many short exposures; compare frames for motion against background stars.',
      note: visitorHasEphemeris(target)
        ? 'Use the loaded ephemeris as the starting point, then verify the surrounding star pattern.'
        : 'Add current RA/Dec first so the map can place the visitor and estimate the field.',
      chips: ['Update ephemeris', 'wide first', 'stack short frames']
    };
  }

  if (type === 'Planet') {
    return {
      headline: 'Planet framing preview',
      fit: 'Tiny but bright',
      className: 'good',
      native: 'CPC 800 native: good planetary scale, especially with careful focus.',
      reducer: 'Reducer: not recommended for planets; you want image scale, not a wider field.',
      eyepiece32: '32mm eyepiece: useful for initial alignment/locating, but too low-power for detail.',
      eyepiece10: '10mm eyepiece: good starting high-power view; add Barlow only if seeing is steady.',
      iphone: 'iPhone: video capture is the right move. Stack the sharpest frames for detail.',
      note: 'Planet framing is easy; the real challenge is steady seeing and sharp focus.',
      chips: ['video', '10mm', 'seeing-limited']
    };
  }

  if (type === 'Open Cluster') {
    const isDoubleCluster = title.includes('Double Cluster');
    return {
      headline: 'Cluster framing preview',
      fit: isDoubleCluster ? 'Wide visual target' : 'Good fit',
      className: isDoubleCluster ? 'moderate' : 'good',
      native: isDoubleCluster
        ? 'CPC 800 native: beautiful, but tight; you may frame one cluster at a time or the central region.'
        : 'CPC 800 native: generally good for many clusters.',
      reducer: 'Reducer: helpful for a more relaxed, wider cluster composition.',
      eyepiece32: '32mm eyepiece: preferred. Keep the view wide and bright.',
      eyepiece10: '10mm eyepiece: usually too zoomed for wide clusters, but useful for inspecting dense regions.',
      iphone: 'iPhone: short exposures work well; avoid blowing out the brightest stars.',
      note: 'Clusters usually reward wider framing more than magnification.',
      chips: ['32mm best', 'wide view', 'short exposures']
    };
  }

  if (type === 'Planetary Nebula') {
    return {
      headline: 'Tiny target framing preview',
      fit: 'Small but suitable',
      className: 'good',
      native: 'CPC 800 native: good match. The target is tiny, so the SCT scale helps.',
      reducer: 'Reducer: not necessary unless you want easier finding or a wider star field.',
      eyepiece32: '32mm eyepiece: use first to locate the field.',
      eyepiece10: '10mm eyepiece: useful once centered; the object can take more magnification than big nebulae.',
      iphone: 'iPhone: use short video or many short exposures; crop/stack for scale.',
      note: 'The challenge is finding and focusing, not fitting it in the field.',
      chips: ['small target', '10mm useful', 'focus critical']
    };
  }

  if (type === 'Galaxy') {
    const isM31 = title.includes('Andromeda') || title.includes('M31');
    if (isM31) {
      return {
        headline: 'Huge galaxy framing preview',
        fit: 'Too large native',
        className: 'caution',
        native: 'CPC 800 native: far too tight for the full galaxy; expect the bright core and nearby dust/glow only.',
        reducer: 'Reducer: strongly recommended, though M31 is still a wide-field/mosaic target.',
        eyepiece32: '32mm eyepiece: best visual option, but still only a portion of the full object.',
        eyepiece10: '10mm eyepiece: too zoomed for M31 except for inspecting the core.',
        iphone: 'iPhone: can capture the core; a wide-field camera/lens is better for the whole galaxy.',
        note: 'Treat this as an M31 core/detail target with the CPC 800, not a full-galaxy framing target.',
        chips: ['huge target', 'reducer helps', 'core/detail']
      };
    }

    return {
      headline: 'Galaxy framing preview',
      fit: 'Small and faint',
      className: 'moderate',
      native: 'CPC 800 native: good scale for many galaxies, but tracking/focus must be solid.',
      reducer: 'Reducer: helpful because it brightens the field and makes tracking more forgiving.',
      eyepiece32: '32mm eyepiece: use to find and center; visual detail may be very subtle.',
      eyepiece10: '10mm eyepiece: usually not helpful; galaxies need brightness and contrast more than magnification.',
      iphone: 'iPhone: camera/stacking preferred. Use many short exposures and avoid bright Moon nights.',
      note: 'The size is workable; the hard part is faint surface brightness.',
      chips: ['faint', 'stacking', 'dark sky']
    };
  }

  if (type === 'Emission Nebula' || type === 'Supernova Remnant') {
    const isHuge = title.includes('North America') || title.includes('Veil');
    return {
      headline: isHuge ? 'Huge nebula framing preview' : 'Nebula framing preview',
      fit: isHuge ? 'Too large native' : 'Wide field preferred',
      className: isHuge ? 'caution' : 'moderate',
      native: isHuge
        ? 'CPC 800 native: much too tight for the full object; you will see/capture only a small section.'
        : 'CPC 800 native: workable for smaller nebula detail, but still benefits from wider field.',
      reducer: 'Reducer: strongly recommended for nebulae when you add one; wider and brighter is better.',
      eyepiece32: '32mm eyepiece: use the widest field available. Do not chase magnification.',
      eyepiece10: '10mm eyepiece: too zoomed for this kind of target.',
      iphone: 'iPhone: possible as a project, but stacking/stretching and dark sky matter a lot.',
      note: 'For diffuse nebulae, field width and contrast beat magnification every time.',
      chips: ['UHC helpful', 'wide field', 'not 10mm']
    };
  }

  if (type === 'Globular Cluster') {
    return {
      headline: 'Globular framing preview',
      fit: 'Good fit',
      className: 'good',
      native: 'CPC 800 native: strong match. Globulars benefit from SCT aperture and scale.',
      reducer: 'Reducer: optional; native scale is usually fine for a globular cluster.',
      eyepiece32: '32mm eyepiece: use to locate and center the cluster.',
      eyepiece10: '10mm eyepiece: useful when seeing is steady to resolve outer stars.',
      iphone: 'iPhone: short captures can work well; protect the core from overexposure.',
      note: 'This is one of the better target types for the CPC 800 visually and photographically.',
      chips: ['native good', '10mm useful', 'core exposure']
    };
  }

  return base;
}

function getTargetActionPlan(target) {
  const type = target?.objectType || 'Target';
  const title = target?.title || '';
  const isMoonSensitive = target?.moonImpact?.className === 'bad' || target?.moonImpact?.className === 'caution';
  const isTreeSensitive = target?.treeObstruction?.className === 'bad' || target?.treeObstruction?.className === 'caution';

  const common = {
    headline: 'Use this setup',
    difficulty: 'Medium',
    eyepiece: '32mm to locate, then adjust power once centered',
    filter: 'None required',
    capture: 'iPhone 16 Pro: short test frames, then stack the best results',
    approach: 'Start wide, center carefully, then refine focus and exposure.',
    why: 'Balanced setup for the CPC 800 and phone capture.',
    checklist: [
      'Center a bright nearby star first',
      'Confirm focus before switching targets',
      'Take a short test exposure before committing'
    ]
  };


  if (type === 'Comet') {
    return {
      headline: 'Comet visitor setup',
      difficulty: 'Variable',
      eyepiece: '32mm to locate the field; avoid high power unless it is bright and condensed',
      filter: 'Usually no UHC. Dark sky beats filters for most comets.',
      capture: 'Camera preferred. Take many short exposures and stack; watch for motion against the stars.',
      approach: 'Use the current ephemeris, hop to the predicted field, then compare the fuzzy object against nearby stars over time.',
      why: 'Comets move and change brightness, so fresh RA/Dec and repeated short captures matter more than a permanent catalog position.',
      checklist: [
        'Update RA/Dec from SkySafari/Stellarium before observing',
        'Use low power first and confirm the star field',
        'Shoot multiple short frames so motion does not smear the comet'
      ]
    };
  }

  if (type === 'Planet') {
    return {
      headline: 'Planet setup',
      difficulty: 'Seeing dependent',
      eyepiece: '10mm first; add Barlow only if the image stays steady',
      filter: 'No deep-sky filter. Variable polarizer only if glare is uncomfortable.',
      capture: 'iPhone video / lucky imaging. Record video, then stack the sharpest frames.',
      approach: 'Wait for moments of steady air. Keep the planet centered and use short video clips.',
      why: 'Planets are bright, so sharpness and seeing matter more than long exposure or dark sky.',
      checklist: [
        'Use high power only if the planet is not boiling',
        'Capture video instead of single stills',
        'Refocus after changing eyepieces or adding a Barlow'
      ]
    };
  }

  if (type === 'Open Cluster') {
    return {
      headline: 'Cluster setup',
      difficulty: 'Easy',
      eyepiece: title.includes('Double Cluster') ? '32mm preferred; keep it low power and wide' : '32mm to locate, 25mm if you want a tighter view',
      filter: 'None. Skip UHC for open clusters.',
      capture: 'iPhone photo or short exposure stack. Keep stars from overexposing.',
      approach: 'Use low power, frame the whole cluster, then take several short captures.',
      why: 'Open clusters are bright and forgiving, so wide framing usually looks better than high magnification.',
      checklist: [
        'Use the 32mm eyepiece first',
        'Avoid overexposing the brightest stars',
        'Try a few framing positions before recording'
      ]
    };
  }

  if (type === 'Planetary Nebula') {
    return {
      headline: 'Small bright nebula setup',
      difficulty: 'Medium-hard',
      eyepiece: '25mm to locate, then 10mm or 25mm + Barlow if seeing allows',
      filter: 'UHC can help contrast; compare with and without it.',
      capture: 'Short video or many short exposures. Treat it more like a tiny bright target than a wide nebula.',
      approach: 'Use finder stars to land on the field, center the tiny disk, then increase power carefully.',
      why: 'Planetary nebulae are compact and fairly bright, so magnification helps once you are centered.',
      checklist: [
        'Locate at lower power first',
        'Use the UHC filter as a contrast test',
        'Do not chase high power if stars get mushy'
      ]
    };
  }

  if (type === 'Galaxy') {
    const isM31 = title.includes('Andromeda') || title.includes('M31');
    return {
      headline: isM31 ? 'Wide galaxy setup' : 'Galaxy setup',
      difficulty: isM31 ? 'Medium' : 'Hard',
      eyepiece: isM31 ? '32mm only; this target is huge' : '32mm to locate; avoid too much magnification',
      filter: 'No UHC. Galaxies need dark, transparent sky more than filters.',
      capture: isM31 ? 'Wide-field camera/reducer preferred. iPhone can capture the core, but not the whole galaxy.' : 'Camera preferred. Use many short exposures and stack; avoid bright Moon nights.',
      approach: isM31 ? 'Frame wide and expose for the core first, then try longer/lighter stretches.' : 'Wait until it is clear of trees and as high as possible. Take lots of short subs.',
      why: isMoonSensitive ? 'Galaxy contrast is easily washed out by moonlight, so dark-sky timing matters a lot.' : 'Galaxies are faint, so altitude, tracking, and dark sky matter more than magnification.',
      checklist: [
        isMoonSensitive ? 'Consider skipping until the Moon is dimmer or farther away' : 'Prefer the darkest part of the night',
        isTreeSensitive ? 'Wait for the clear window above the tree line' : 'Shoot when it is highest',
        'Use a bright star nearby to nail focus'
      ]
    };
  }

  if (type === 'Emission Nebula' || type === 'Supernova Remnant') {
    const isHuge = title.includes('North America') || title.includes('Veil');
    return {
      headline: isHuge ? 'Huge faint nebula setup' : 'Nebula setup',
      difficulty: isHuge ? 'Hard' : 'Medium-hard',
      eyepiece: '32mm / widest field available. Do not use high power.',
      filter: 'UHC strongly recommended; OIII-style would be ideal for Veil if you add one later.',
      capture: 'Camera preferred. iPhone may need stacking and careful stretching; visual can be very subtle.',
      approach: 'Use Deneb/Cygnus finder stars, keep the field wide, and compare filtered vs unfiltered views.',
      why: isMoonSensitive ? 'Diffuse nebula contrast drops fast under moonlight, even when the target is technically high enough.' : 'These targets are large and faint, so filter + dark sky beats magnification.',
      checklist: [
        'Use the UHC filter',
        isMoonSensitive ? 'Avoid bright Moon windows' : 'Pick the darkest/clearest window',
        isTreeSensitive ? 'Wait until it clears the local tree line' : 'Keep the field as wide as possible'
      ]
    };
  }

  if (type === 'Globular Cluster') {
    return {
      headline: 'Globular cluster setup',
      difficulty: 'Easy-medium',
      eyepiece: '32mm to locate, then 10mm if seeing is steady',
      filter: 'None. Filters usually do not help globular clusters.',
      capture: 'Short exposures or video. Avoid blowing out the core.',
      approach: 'Center at low power, focus sharply, then increase power to resolve edge stars.',
      why: 'Globulars reward sharp focus and moderate power, but they are forgiving compared with galaxies.',
      checklist: [
        'Start with 32mm',
        'Try 10mm only after centering',
        'Protect the core from overexposure'
      ]
    };
  }

  return common;
}


function getTargetDifficultyScore(target) {
  if (!target) {
    return {
      label: 'Medium',
      className: 'medium',
      score: 3,
      summary: 'A balanced target with moderate setup demands.',
      factors: ['check altitude', 'start wide']
    };
  }

  const type = target.objectType || 'Target';
  const title = target.title || '';
  const factors = [];
  let score = 2.5;

  switch (type) {
    case 'Planet':
      score = 1.4;
      factors.push('bright target', 'seeing matters');
      break;
    case 'Open Cluster':
      score = 1.2;
      factors.push('bright stars', 'forgiving target');
      break;
    case 'Globular Cluster':
      score = 2.0;
      factors.push('good CPC 800 match', 'focus matters');
      break;
    case 'Planetary Nebula':
      score = 3.0;
      factors.push('tiny target', 'accurate centering');
      break;
    case 'Galaxy':
      score = title.includes('Andromeda') || title.includes('M31') ? 3.0 : 4.2;
      factors.push('faint contrast', 'dark sky helps');
      break;
    case 'Emission Nebula':
    case 'Supernova Remnant':
      score = 4.7;
      factors.push('very faint', 'filter/dark sky');
      break;
    case 'Comet':
      score = visitorHasEphemeris(target) ? 4.4 : 5.5;
      factors.push(visitorHasEphemeris(target) ? 'moving target' : 'needs RA/Dec');
      break;
    default:
      score = 2.6;
      factors.push('moderate setup');
  }

  if (target.plannerStatus?.className === 'below') {
    score += 1.1;
    factors.push('low/not up');
  } else if (target.observingStatus?.className === 'low' || target.plannerStatus?.className === 'low') {
    score += 0.6;
    factors.push('low altitude');
  }

  if (target.moonImpact?.className === 'bad') {
    score += 1.0;
    factors.push('Moon hurts');
  } else if (target.moonImpact?.className === 'caution') {
    score += 0.45;
    factors.push('Moon caution');
  }

  if (target.treeObstruction?.className === 'bad') {
    score += 1.0;
    factors.push('tree blocked');
  } else if (target.treeObstruction?.className === 'caution') {
    score += 0.45;
    factors.push('tree risk');
  }

  const framingPreview = getTargetFramingPreview(target);
  if (framingPreview?.className === 'caution') {
    score += 0.55;
    factors.push('framing challenge');
  } else if (framingPreview?.className === 'good') {
    score -= 0.25;
  }

  const normalizedScore = clamp(score, 1, 6);
  let label = 'Easy';
  let className = 'easy';

  if (normalizedScore >= 4.75) {
    label = 'Expert';
    className = 'expert';
  } else if (normalizedScore >= 3.45) {
    label = 'Hard';
    className = 'hard';
  } else if (normalizedScore >= 2.1) {
    label = 'Medium';
    className = 'medium';
  }

  const uniqueFactors = [...new Set(factors)].slice(0, 4);

  const summaries = {
    Easy: 'Good confidence target. It should be forgiving if the sky cooperates.',
    Medium: 'Worth trying, but it needs a little care with centering, focus, or timing.',
    Hard: 'A real project target. Conditions, tracking, and patience matter.',
    Expert: 'Challenge target. Best saved for strong conditions or a dedicated attempt.'
  };

  if (type === 'Comet' && !visitorHasEphemeris(target)) {
    return {
      label: 'Expert',
      className: 'expert',
      score: normalizedScore,
      summary: 'Challenge target until current RA/Dec is loaded; then the planner can score it properly.',
      factors: uniqueFactors
    };
  }

  return {
    label,
    className,
    score: normalizedScore,
    summary: summaries[label],
    factors: uniqueFactors
  };
}



const SESSION_MODES = [
  { key: 'balanced', label: 'Best Overall' },
  { key: 'visual', label: 'Easy Visual' },
  { key: 'iphone', label: 'iPhone Friendly' },
  { key: 'camera', label: 'Deep Sky Photo' },
  { key: 'planetary', label: 'Planetary' },
  { key: 'visitors', label: 'Visitors' }
];

const PLANNER_DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'why', label: 'Why Tonight' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'setup', label: 'Setup' },
  { key: 'framing', label: 'Framing' },
  { key: 'info', label: 'General Info' }
];

function getSessionModeBonus(target, sessionMode = 'balanced') {
  const type = target?.objectType || '';
  const title = target?.title || '';
  const difficulty = getTargetDifficultyScore(target);
  const moonBad = target?.moonImpact?.className === 'bad';
  const treeBad = target?.treeObstruction?.className === 'bad';
  const noEphemeris = type === 'Comet' && !visitorHasEphemeris(target);

  if (sessionMode === 'balanced') return 0;

  if (sessionMode === 'visual') {
    if (['Open Cluster', 'Globular Cluster', 'Double Star', 'Planet', 'Planetary Nebula'].includes(type)) return 70;
    if (type === 'Galaxy' && (title.includes('Andromeda') || title.includes('M31'))) return 10;
    if (type === 'Galaxy' || type === 'Emission Nebula' || type === 'Supernova Remnant' || type === 'Comet') return -70;
  }

  if (sessionMode === 'iphone') {
    if (type === 'Planet') return 95;
    if (['Open Cluster', 'Planetary Nebula', 'Globular Cluster'].includes(type)) return 45;
    if (type === 'Galaxy' && (title.includes('Andromeda') || title.includes('M31'))) return 10;
    if (type === 'Galaxy' || type === 'Emission Nebula' || type === 'Supernova Remnant') return -45;
    if (type === 'Comet') return noEphemeris ? -90 : -20;
  }

  if (sessionMode === 'camera') {
    if (['Galaxy', 'Emission Nebula', 'Supernova Remnant', 'Comet'].includes(type)) return noEphemeris ? -90 : 75;
    if (['Open Cluster', 'Planetary Nebula', 'Globular Cluster'].includes(type)) return 30;
    if (type === 'Planet') return -30;
  }

  if (sessionMode === 'planetary') {
    if (type === 'Planet') return 140;
    if (type === 'Planetary Nebula') return 10;
    return -90;
  }

  if (sessionMode === 'visitors') {
    if (type === 'Comet') return noEphemeris ? 30 : 160;
    if (target?.isVisitorTarget) return 140;
    return -60;
  }

  let conditionPenalty = 0;
  if (moonBad) conditionPenalty -= 30;
  if (treeBad) conditionPenalty -= 35;
  if (difficulty.className === 'expert') conditionPenalty -= 20;

  return conditionPenalty;
}

function getModeAdjustedRankScore(target, sessionMode = 'balanced') {
  const base = target?.plannerStatus?.rankScore ?? -999;
  const modeBonus = getSessionModeBonus(target, sessionMode);
  const difficulty = getTargetDifficultyScore(target);
  const difficultyPenalty = difficulty.score * 4;

  return base + modeBonus - difficultyPenalty;
}

function targetMatchesTonightMode(target, sessionMode = 'balanced') {
  if (!target || sessionMode === 'balanced') return true;

  const type = target.objectType || '';
  const title = target.title || '';
  const difficulty = getTargetDifficultyScore(target);
  const hasEphemeris = type !== 'Comet' || visitorHasEphemeris(target);

  if (sessionMode === 'visual') {
    return ['Open Cluster', 'Globular Cluster', 'Double Star', 'Planet', 'Planetary Nebula'].includes(type) && difficulty.className !== 'expert';
  }

  if (sessionMode === 'iphone') {
    return (
      type === 'Planet' ||
      type === 'Open Cluster' ||
      type === 'Planetary Nebula' ||
      type === 'Globular Cluster' ||
      (type === 'Galaxy' && (title.includes('Andromeda') || title.includes('M31')))
    );
  }

  if (sessionMode === 'camera') {
    return ['Galaxy', 'Emission Nebula', 'Supernova Remnant', 'Comet', 'Open Cluster', 'Planetary Nebula'].includes(type) && hasEphemeris;
  }

  if (sessionMode === 'planetary') {
    return type === 'Planet';
  }

  if (sessionMode === 'visitors') {
    return target.isVisitorTarget || type === 'Comet';
  }

  return true;
}

function getTargetWhyExplanation(target, sessionMode = 'balanced') {
  if (!target) {
    return {
      headline: 'Why this target?',
      summary: 'Pick a target to see why the planner ranked it.',
      good: [],
      watch: ['No target selected yet.']
    };
  }

  const type = target.objectType || 'target';
  const good = [];
  const watch = [];

  if (target.plannerStatus?.label) {
    if (target.plannerStatus.className === 'best' || target.plannerStatus.className === 'good') {
      good.push(`${target.plannerStatus.label}: ${target.tonightPlan?.bestWindow || 'use the best visible window'}.`);
    } else {
      watch.push(`${target.plannerStatus.label}: timing is not ideal tonight.`);
    }
  }

  const peakAlt = target.tonightPlan?.peak?.alt;
  if (typeof peakAlt === 'number') {
    if (peakAlt >= 45) good.push(`Peaks high at about ${peakAlt.toFixed(0)}°, which helps clarity and tracking.`);
    else if (peakAlt >= 20) good.push(`Gets usable at about ${peakAlt.toFixed(0)}° altitude.`);
    else watch.push(`Only peaks around ${peakAlt.toFixed(0)}°, so atmosphere and trees may hurt it.`);
  }

  if (target.moonImpact) {
    if (target.moonImpact.className === 'ok') good.push(target.moonImpact.label === 'Moon irrelevant' ? 'Moonlight does not matter much for this target.' : 'Moon impact looks manageable.');
    if (target.moonImpact.className === 'caution') watch.push('Moonlight may reduce contrast.');
    if (target.moonImpact.className === 'bad') watch.push('Bright Moon is a major reason to lower priority.');
  }

  if (target.treeObstruction) {
    if (target.treeObstruction.className === 'ok') good.push(target.treeObstruction.label === 'Clear view' ? 'Direction is in your clearer sky.' : 'It should clear your estimated tree line.');
    if (target.treeObstruction.className === 'caution') watch.push('It is close to your tree line, so timing matters.');
    if (target.treeObstruction.className === 'bad') watch.push('Local trees are likely the main blocker.');
  }

  const framing = getTargetFramingPreview(target);
  if (framing.className === 'good') good.push(`Framing: ${framing.fit}.`);
  else if (framing.className === 'caution') watch.push(`Framing challenge: ${framing.fit}.`);
  else good.push(`Framing is workable: ${framing.fit}.`);

  const difficulty = getTargetDifficultyScore(target);
  if (difficulty.className === 'easy') good.push('Difficulty is easy for your current setup.');
  if (difficulty.className === 'medium') good.push('Difficulty is reasonable if you take your time.');
  if (difficulty.className === 'hard') watch.push('This is a hard target; tracking, focus, and patience matter.');
  if (difficulty.className === 'expert') watch.push('This is an expert-level attempt tonight.');

  if (type === 'Comet' && !visitorHasEphemeris(target)) {
    watch.unshift('Add current RA/Dec before using this visitor in the live planner.');
  }

  if (sessionMode === 'visual' && ['Open Cluster', 'Globular Cluster', 'Double Star', 'Planet', 'Planetary Nebula'].includes(type)) {
    good.unshift('Visual mode favors this kind of target.');
  }

  if (sessionMode === 'camera' && ['Galaxy', 'Emission Nebula', 'Supernova Remnant', 'Comet'].includes(type)) {
    good.unshift('Camera mode favors this kind of target.');
  }

  if (sessionMode === 'planetary' && type === 'Planet') {
    good.unshift('Planetary mode puts this target near the top.');
  }

  if (sessionMode === 'visitors' && type === 'Comet') {
    good.unshift('Visitors mode highlights current or upcoming moving targets.');
  }

  if (!good.length) good.push('It remains on the list because it is a useful future target.');
  if (!watch.length) watch.push('No major planner warnings right now.');

  return {
    headline: type === 'Comet' ? 'Why this visitor?' : 'Why this target?',
    summary: `${target.title} is filtered and ranked using altitude, Moon impact, local trees, framing, difficulty, and the selected Tonight Mode.`,
    good: good.slice(0, 5),
    watch: watch.slice(0, 5)
  };
}

function buildShareTonightCard(sessionPlan, rankedTargets, rankedVisitors, sessionMode) {
  const visitor = rankedVisitors?.[0] || null;
  const preferredStart = sessionMode === 'visitors' && visitorHasEphemeris(visitor) ? visitor : null;
  const start = preferredStart || sessionPlan?.startTarget || rankedTargets?.[0] || null;
  const backup = sessionPlan?.backupTarget || rankedTargets?.find((target) => target.title !== start?.title) || null;
  const skipStep = sessionPlan?.steps?.find((step) => step.key === 'skip') || null;
  const modeLabel = SESSION_MODES.find((mode) => mode.key === sessionMode)?.label || 'Best Overall';

  return {
    start,
    backup,
    visitor,
    skipTargets: skipStep?.extraTargets?.length ? [skipStep.target, ...skipStep.extraTargets].filter(Boolean) : skipStep?.target ? [skipStep.target] : [],
    modeLabel
  };
}

export default function SkyMap({ gallery, setSelectedIndex }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeFutureIndex, setActiveFutureIndex] = useState(0);
  const [activeVisitorIndex, setActiveVisitorIndex] = useState(0);
  const [catalogView, setCatalogView] = useState('future');
  const [selectedPanel, setSelectedPanel] = useState('future');
  const [zoom, setZoom] = useState(() => getDefaultZoom());
  const [pan, setPan] = useState(() => getDefaultPan());
  const [rotation, setRotation] = useState(0);
  const [date, setDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('clean');
  const [showHorizon, setShowHorizon] = useState(true);
  const [activePreset, setActivePreset] = useState('now');
  const [sessionMode, setSessionMode] = useState('balanced');
  const [activePlannerTab, setActivePlannerTab] = useState('overview');

  const dragRef = useRef(null);
  const panFrameRef = useRef(null);
  const pendingPanRef = useRef(null);
  const touchDragRef = useRef(null);
  const mapSectionRef = useRef(null);
  const mapRef = useRef(null);
  const plannerDetailRef = useRef(null);
  const observer = useMemo(() => new Observer(SITE.lat, SITE.lon, 0), []);
  const isDetailMode = viewMode === 'detail';
  const mobileLayout = isMobileViewport();
  const canPanMap = zoom > getDefaultZoom() + 0.02;
  const forestTrees = useMemo(() => buildConnectedForestTrees(), []);
  const forestBasePath = useMemo(() => buildForestBasePath(forestTrees), [forestTrees]);

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
    const moonEq = getPlanetRaDec(Body.Moon, date, observer);
    const moonAltAz = raDecToAltAz(moonEq.ra, moonEq.dec, date, SITE.lat, SITE.lon);
    const moonIllumination = Illumination(Body.Moon, date);
    const moonInfo = {
      ra: moonEq.ra,
      dec: moonEq.dec,
      alt: moonAltAz.alt,
      az: moonAltAz.az,
      phasePercent: Math.round((moonIllumination.phase_fraction ?? 0) * 100)
    };

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
      const moonImpact = getMoonImpact({ ...target, ra, dec }, moonInfo);
      const tonightPlan = buildTonightPlan({ ...target, ra, dec }, date, observer);
      const treeObstruction = getTreeObstruction({ ...target, ra, dec, alt: altAz.alt, az: altAz.az }, tonightPlan);
      const plannerStatus = getFuturePlannerStatus(status, tonightPlan, target, date, moonImpact, treeObstruction);

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
        moonImpact,
        treeObstruction,
        tonightPlan,
        plannerStatus,
        isFutureTarget: true
      };
    }).filter(Boolean);
  }, [date, observer]);



  const mappedVisitorTargets = useMemo(() => {
    const moonEq = getPlanetRaDec(Body.Moon, date, observer);
    const moonAltAz = raDecToAltAz(moonEq.ra, moonEq.dec, date, SITE.lat, SITE.lon);
    const moonIllumination = Illumination(Body.Moon, date);
    const moonInfo = {
      ra: moonEq.ra,
      dec: moonEq.dec,
      alt: moonAltAz.alt,
      az: moonAltAz.az,
      phasePercent: Math.round((moonIllumination.phase_fraction ?? 0) * 100)
    };

    return VISITOR_TARGETS.map((visitor, actualIndex) => {
      if (!visitorHasEphemeris(visitor)) {
        const plannerStatus = getVisitorEphemerisStatus(visitor);
        const tonightPlan = buildVisitorUnavailablePlan(visitor);

        return {
          ...visitor,
          actualIndex,
          ephemerisNeeded: true,
          alt: -90,
          az: 0,
          x: CENTER,
          y: CENTER,
          visible: false,
          observingStatus: { label: 'Needs RA/Dec', className: 'low', score: 0 },
          moonImpact: null,
          treeObstruction: null,
          tonightPlan,
          plannerStatus,
          isVisitorTarget: true
        };
      }

      const altAz = raDecToAltAz(visitor.ra, visitor.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);
      const status = getObservingStatus({ alt: altAz.alt });
      const moonImpact = getMoonImpact(visitor, moonInfo);
      const tonightPlan = buildTonightPlan(visitor, date, observer);
      const treeObstruction = getTreeObstruction({ ...visitor, alt: altAz.alt, az: altAz.az }, tonightPlan);
      const plannerStatus = getFuturePlannerStatus(status, tonightPlan, visitor, date, moonImpact, treeObstruction);

      return {
        ...visitor,
        actualIndex,
        alt: altAz.alt,
        az: altAz.az,
        x: point.x,
        y: point.y,
        visible: point.visible,
        observingStatus: status,
        moonImpact,
        treeObstruction,
        tonightPlan,
        plannerStatus,
        isVisitorTarget: true
      };
    });
  }, [date, observer]);

  const rankedFutureTargets = useMemo(() => {
    return [...mappedFutureTargets]
      .filter((target) => targetMatchesTonightMode(target, sessionMode))
      .sort((a, b) => {
        const bScore = getModeAdjustedRankScore(b, sessionMode);
        const aScore = getModeAdjustedRankScore(a, sessionMode);

        if (bScore !== aScore) {
          return bScore - aScore;
        }

        if ((b.tonightPlan?.peak?.alt ?? -90) !== (a.tonightPlan?.peak?.alt ?? -90)) {
          return (b.tonightPlan?.peak?.alt ?? -90) - (a.tonightPlan?.peak?.alt ?? -90);
        }

        return a.title.localeCompare(b.title);
      })
      .map((target, rankIndex) => ({
        ...target,
        rankNumber: rankIndex + 1,
        modeAdjustedRankScore: getModeAdjustedRankScore(target, sessionMode)
      }));
  }, [mappedFutureTargets, sessionMode]);



  const rankedVisitorTargets = useMemo(() => {
    return [...mappedVisitorTargets]
      .filter((target) => targetMatchesTonightMode(target, sessionMode))
      .sort((a, b) => {
        const bScore = getModeAdjustedRankScore(b, sessionMode);
        const aScore = getModeAdjustedRankScore(a, sessionMode);

        if (bScore !== aScore) {
          return bScore - aScore;
        }

        return a.title.localeCompare(b.title);
      })
      .map((target, rankIndex) => ({
        ...target,
        rankNumber: rankIndex + 1,
        modeAdjustedRankScore: getModeAdjustedRankScore(target, sessionMode)
      }));
  }, [mappedVisitorTargets, sessionMode]);

  const activeObject = mappedObjects[activeIndex] || mappedObjects[0];
  const activeFutureTarget = rankedFutureTargets.find((target) => target.actualIndex === activeFutureIndex) || rankedFutureTargets[0] || mappedFutureTargets[0];
  const activeVisitorTarget = rankedVisitorTargets.find((target) => target.actualIndex === activeVisitorIndex) || rankedVisitorTargets[0] || mappedVisitorTargets[0];
  const selectedTarget = selectedPanel === 'future' ? activeFutureTarget : selectedPanel === 'visitor' ? activeVisitorTarget : activeObject;
  const activeConstellation = getMissionConstellation(selectedTarget) || selectedTarget?.constellation;

  const visibleObjects = useMemo(() => mappedObjects.filter((photo) => isInsideSky(photo, 12)), [mappedObjects]);
  const visibleFutureTargets = useMemo(() => rankedFutureTargets.filter((target) => isInsideSky(target, 14)), [rankedFutureTargets]);
  const visibleVisitorTargets = useMemo(() => rankedVisitorTargets.filter((target) => visitorHasEphemeris(target) && isInsideSky(target, 14)), [rankedVisitorTargets]);
  const bestObjectCount = useMemo(() => mappedObjects.filter((photo) => photo.observingStatus.score >= 3).length, [mappedObjects]);
  const goodObjectCount = useMemo(() => mappedObjects.filter((photo) => photo.observingStatus.score >= 2).length, [mappedObjects]);
  const futureBestCount = useMemo(() => rankedFutureTargets.filter((target) => target.plannerStatus.label === 'Best Now').length, [rankedFutureTargets]);
  const futureGoodCount = useMemo(() => rankedFutureTargets.filter((target) => target.plannerStatus.className === 'good' || target.plannerStatus.className === 'best').length, [rankedFutureTargets]);
  const missionCallouts = useMemo(() => buildMissionCallouts(visibleObjects, zoom), [visibleObjects, zoom]);
  const futureCallouts = useMemo(() => buildMissionCallouts(visibleFutureTargets, zoom), [visibleFutureTargets, zoom]);
  const visitorCallouts = useMemo(() => buildMissionCallouts(visibleVisitorTargets, zoom), [visibleVisitorTargets, zoom]);

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
    const trackTarget = selectedPanel === 'visitor' ? activeVisitorTarget : activeFutureTarget;
    if (!['future', 'visitor'].includes(selectedPanel) || !trackTarget || trackTarget.ephemerisNeeded) return null;
    return buildTargetTrack(trackTarget, date, observer);
  }, [activeFutureTarget, activeVisitorTarget, date, observer, selectedPanel]);

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
  const lunarPath = useMemo(() => {
    const moonEq = getPlanetRaDec(Body.Moon, date, observer);
    const altAz = raDecToAltAz(moonEq.ra, moonEq.dec, date, SITE.lat, SITE.lon);
    const currentMoonPoint = projectAltAz(altAz.alt, altAz.az);

    // The Moon can rise/set within the 48-hour sampled path. Choosing the
    // longest visible segment can accidentally draw tomorrow's lunar track
    // instead of the segment containing the current Moon. Anchor the path to
    // the Moon's current position so the marker sits on its own lunar path.
    return buildSmoothVisiblePathNearestPoint(lunarPoints, currentMoonPoint, 18);
  }, [lunarPoints, date, observer]);
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


    if (catalogView === 'visitors') {
      visitorCallouts.forEach((target) => {
        const actualIndex = mappedVisitorTargets.findIndex((item) => item.title === target.title);
        const isActive = selectedPanel === 'visitor' && activeVisitorIndex === actualIndex;

        if (mobileLayout && !isActive && !isDetailMode) return;
        if (!mobileLayout && !isActive && !isDetailMode) return;

        const outwardDirection = target.markerX > CENTER ? 1 : -1;

        labelItems.push({
          id: `visitorCallout:${target.title}`,
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
    activeVisitorIndex,
    catalogView,
    constellationLabels,
    eclipticLabel,
    futureCallouts,
    isDetailMode,
    lunarLabel,
    mappedFutureTargets,
    mappedObjects,
    mappedVisitorTargets,
    missionCallouts,
    mobileLayout,
    moonData,
    selectedPanel,
    summerTriangleLabel,
    visibleFutureTargets,
    visiblePlanets,
    visitorCallouts,
    visibleStars
  ]);

  const getMapLabel = (id) => mapLabelPlacements[id];

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((item) => item.title === photo.title);
    if (realIndex !== -1) setSelectedIndex(realIndex);
  };

  const scrollToElement = (targetRef, fallbackRef = null) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = targetRef.current || fallbackRef?.current;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const pageY = window.scrollY || window.pageYOffset || 0;
        const desiredTop = rect.top + pageY - 18;

        window.scrollTo({
          top: Math.max(0, desiredTop),
          behavior: 'smooth'
        });
      });
    });
  };

  const scrollToMap = () => {
    scrollToElement(mapRef, mapSectionRef);
  };

  const scrollToPlannerDetail = () => {
    scrollToElement(plannerDetailRef, mapSectionRef);
  };

  const selectFutureTarget = (index, shouldScroll = false) => {
    setActiveFutureIndex(index);
    setSelectedPanel('future');
    setCatalogView('future');
    if (shouldScroll) scrollToPlannerDetail();
  };



  const selectVisitorTarget = (index, shouldScroll = false) => {
    setActiveVisitorIndex(index);
    setSelectedPanel('visitor');
    setCatalogView('visitors');
    if (shouldScroll) scrollToPlannerDetail();
  };

  const selectCapturedTarget = (index, shouldScroll = false) => {
    setActiveIndex(index);
    setSelectedPanel('captured');
    setCatalogView('captured');
    if (shouldScroll) scrollToPlannerDetail();
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

              {showHorizon && forestTrees.length > 0 && (
                <g className="treeHorizon" pointerEvents="none">
                  {forestBasePath && (
                    <path
                      d={forestBasePath}
                      className="treeHorizonBaseGlow"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {forestTrees.map((tree) => (
                    <g
                      key={tree.id}
                      className="treeHorizonTreeGroup"
                      transform={`translate(${tree.x.toFixed(1)} ${tree.y.toFixed(1)}) rotate(${(tree.angle + 180).toFixed(1)})`}
                      style={{ opacity: tree.opacity }}
                    >
                      <path
                        d={buildConiferPath(tree)}
                        className="treeHorizonTreeGlow"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={buildConiferPath(tree)}
                        className="treeHorizonTree"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1="0"
                        y1={(-tree.height * 0.54).toFixed(1)}
                        x2="0"
                        y2="0"
                        className="treeHorizonTrunk"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                </g>
              )}

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


              {catalogView === 'visitors' && visitorCallouts.map((target) => {
                const index = mappedVisitorTargets.findIndex((item) => item.title === target.title);
                const markerColor = getObjectColor(target.objectType);
                const isActive = selectedPanel === 'visitor' && activeVisitorIndex === index;
                const label = getMapLabel(`visitorCallout:${target.title}`);

                return (
                  <g
                    key={`${target.title}-visitor-callout`}
                    className={isActive ? 'missionSvgCallout futureSvgCallout visitorSvgCallout active' : 'missionSvgCallout futureSvgCallout visitorSvgCallout'}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => selectVisitorTarget(index)}
                    onFocus={() => selectVisitorTarget(index)}
                    onClick={() => selectVisitorTarget(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectVisitorTarget(index);
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

                    <circle
                      cx={target.x}
                      cy={target.y}
                      r={6}
                      className="visitorTargetDot"
                      style={{ stroke: markerColor }}
                    />

                    {isActive && (
                      <circle
                        cx={target.x}
                        cy={target.y}
                        r={16}
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
                        V{target.rankNumber || index + 1}
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
            <span><i className="legendOrange"></i> Comet / Visitor</span>
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
            <button
              type="button"
              className={catalogView === 'visitors' ? 'active' : ''}
              onClick={() => { setCatalogView('visitors'); setSelectedPanel('visitor'); }}
            >
              Visitors
            </button>
          </div>

          <small>{catalogView === 'future' ? 'Target Planner List' : catalogView === 'visitors' ? 'Closest Visitors List' : 'Mission Archive'}</small>

          {(catalogView === 'future' || catalogView === 'visitors') && (
            <div className="plannerControlsPanel tonightModePanel">
              <div>
                <small>Tonight Mode</small>
                <p>Choose the kind of observing session you want. The planner will show and rank the targets that fit that goal.</p>
                <div className="plannerControlChips">
                  {SESSION_MODES.map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      className={sessionMode === mode.key ? 'active' : ''}
                      onClick={() => setSessionMode(mode.key)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {catalogView === 'future' && rankedFutureTargets.length === 0 && (
            <p className="catalogEmptyState">No future targets match this mode in this tab. Try Best Overall or switch tabs.</p>
          )}

          {catalogView === 'visitors' && rankedVisitorTargets.length === 0 && (
            <p className="catalogEmptyState">No visitors match this mode yet. Add RA/Dec to a visitor when you have it, or switch back to Best Overall.</p>
          )}

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
                {target.moonImpact && (
                  <i className={`targetStatusBadge moonImpactBadge ${target.moonImpact.className}`}>
                    {target.moonImpact.label}
                  </i>
                )}
                {target.treeObstruction && (
                  <i className={`targetStatusBadge treeObstructionBadge ${target.treeObstruction.className}`}>
                    {target.treeObstruction.label}
                  </i>
                )}
                {(() => {
                  const difficultyScore = getTargetDifficultyScore(target);
                  return (
                    <i className={`targetStatusBadge targetDifficultyBadge ${difficultyScore.className}`}>
                      {difficultyScore.label}
                    </i>
                  );
                })()}
              </span>
            </button>
          ))}


          {catalogView === 'visitors' && rankedVisitorTargets.map((target) => (
            <button
              key={target.title}
              className={target.actualIndex === activeVisitorIndex && selectedPanel === 'visitor' ? 'catalogItem visitorItem active' : 'catalogItem visitorItem'}
              onMouseEnter={() => selectVisitorTarget(target.actualIndex)}
              onFocus={() => selectVisitorTarget(target.actualIndex)}
              onClick={() => selectVisitorTarget(target.actualIndex, true)}
              type="button"
            >
              <b>{target.rankNumber}</b>
              <span>
                <strong>{target.title}</strong>
                <em>{target.constellation}</em>
                <small>{target.objectType} · {target.ephemerisNeeded ? 'add RA/Dec to activate' : `best: ${target.tonightPlan.bestWindow}`}</small>
                <i className={`targetStatusBadge ${target.plannerStatus.className}`}>{target.plannerStatus.label}</i>
                {target.moonImpact && (
                  <i className={`targetStatusBadge moonImpactBadge ${target.moonImpact.className}`}>
                    {target.moonImpact.label}
                  </i>
                )}
                {target.treeObstruction && (
                  <i className={`targetStatusBadge treeObstructionBadge ${target.treeObstruction.className}`}>
                    {target.treeObstruction.label}
                  </i>
                )}
                {(() => {
                  const difficultyScore = getTargetDifficultyScore(target);
                  return (
                    <i className={`targetStatusBadge targetDifficultyBadge ${difficultyScore.className}`}>
                      {difficultyScore.label}
                    </i>
                  );
                })()}
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

      {selectedPanel === 'visitor' && activeVisitorTarget && (
        <section ref={plannerDetailRef} className="atlasDetail plannerDetail plannerDetailNoBadge plannerTabbedDetail visitorDetail">
          <div>
            <small>Closest Visitor</small>
            <div className="plannerDetailTabs" role="tablist" aria-label="Visitor detail tabs">
              {PLANNER_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activePlannerTab === tab.key}
                  className={activePlannerTab === tab.key ? 'active' : ''}
                  onClick={() => setActivePlannerTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const actionPlan = getTargetActionPlan(activeVisitorTarget);
              const framingPreview = getTargetFramingPreview(activeVisitorTarget);
              const difficultyScore = getTargetDifficultyScore(activeVisitorTarget);
              const whyExplanation = getTargetWhyExplanation(activeVisitorTarget, sessionMode);

              return (
                <div className="plannerTabPanel">
                  {activePlannerTab === 'overview' && (
                    <>
                      <h2><span>☄</span>{activeVisitorTarget.title}</h2>
                      <h3>{activeVisitorTarget.objectType} · {activeVisitorTarget.constellation}</h3>
                      <p>{activeVisitorTarget.notes}</p>
                      <p className={`futureFinderNote visitorNote ${activeVisitorTarget.ephemerisNeeded ? 'caution' : 'ok'}`}>
                        <b>Visitor status:</b> {getVisitorActionNote(activeVisitorTarget)}
                      </p>
                      {activeVisitorTarget.moonImpact && (
                        <p className={`futureFinderNote moonImpactNote ${activeVisitorTarget.moonImpact.className}`}>
                          <b>Moon check:</b> {activeVisitorTarget.moonImpact.detail}
                        </p>
                      )}
                      {activeVisitorTarget.treeObstruction && (
                        <p className={`futureFinderNote treeObstructionNote ${activeVisitorTarget.treeObstruction.className}`}>
                          <b>Tree line:</b> {activeVisitorTarget.treeObstruction.detail}
                        </p>
                      )}
                    </>
                  )}

                  {activePlannerTab === 'why' && (
                    <>
                      <div className="targetWhyCard">
                        <div className="targetWhyHeader">
                          <small>{whyExplanation.headline}</small>
                          <h3>Why it is ranked here</h3>
                        </div>
                        <p>{whyExplanation.summary}</p>
                        <div className="targetWhyColumns">
                          <div>
                            <b>Good tonight</b>
                            <ul>
                              {whyExplanation.good.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                          <div>
                            <b>Watch out</b>
                            <ul>
                              {whyExplanation.watch.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {activePlannerTab === 'difficulty' && (
                    <div className={`targetDifficultyCard ${difficultyScore.className}`}>
                      <div className="targetDifficultyHeader">
                        <small>Target Difficulty</small>
                        <h3>{difficultyScore.label}</h3>
                        <i>{difficultyScore.score.toFixed(1)} / 6</i>
                      </div>
                      <p>{difficultyScore.summary}</p>
                      <div className="targetDifficultyFactors">
                        {difficultyScore.factors.map((factor) => (
                          <em key={factor}>{factor}</em>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlannerTab === 'setup' && (
                    <div className={`targetActionCard ${actionPlan.difficulty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                      <div className="targetActionHeader">
                        <small>Recommended Setup</small>
                        <h3>{actionPlan.headline}</h3>
                        <i>{actionPlan.difficulty}</i>
                      </div>
                      <div className="targetActionGrid">
                        <span><b>Eyepiece</b>{actionPlan.eyepiece}</span>
                        <span><b>Filter</b>{actionPlan.filter}</span>
                        <span><b>Capture</b>{actionPlan.capture}</span>
                        <span><b>Approach</b>{actionPlan.approach}</span>
                      </div>
                      <p><b>Why:</b> {actionPlan.why}</p>
                      <ul>
                        {actionPlan.checklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activePlannerTab === 'framing' && (
                    <div className={`targetFramingCard ${framingPreview.className}`}>
                      <div className="targetFramingHeader">
                        <small>Framing Preview</small>
                        <h3>{framingPreview.headline}</h3>
                        <i>{framingPreview.fit}</i>
                      </div>
                      <div className="targetFramingGrid">
                        <span><b>Native CPC 800</b>{framingPreview.native}</span>
                        <span><b>Reducer</b>{framingPreview.reducer}</span>
                        <span><b>32mm Eyepiece</b>{framingPreview.eyepiece32}</span>
                        <span><b>10mm / High Power</b>{framingPreview.eyepiece10}</span>
                        <span><b>iPhone Capture</b>{framingPreview.iphone}</span>
                        <span><b>Bottom Line</b>{framingPreview.note}</span>
                      </div>
                      <div className="targetFramingChips">
                        {framingPreview.chips.map((chip) => (
                          <em key={chip}>{chip}</em>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlannerTab === 'info' && (
                    <div className="atlasFacts plannerGeneralInfoFacts">
                      <span><b>Status</b>{activeVisitorTarget.plannerStatus.label}</span>
                      <span><b>Difficulty</b>{difficultyScore.label}</span>
                      <span><b>Closest Approach</b>{activeVisitorTarget.closestApproach}</span>
                      <span><b>Estimated Brightness</b>{activeVisitorTarget.magnitude}</span>
                      <span><b>Best Window</b>{activeVisitorTarget.tonightPlan.bestWindow}</span>
                      <span><b>Gear</b>{activeVisitorTarget.gear}</span>
                      <span><b>RA</b>{visitorHasEphemeris(activeVisitorTarget) ? formatRa(activeVisitorTarget.ra) : 'Add ephemeris'}</span>
                      <span><b>Dec</b>{visitorHasEphemeris(activeVisitorTarget) ? formatDec(activeVisitorTarget.dec) : 'Add ephemeris'}</span>
                      <span><b>Altitude</b>{visitorHasEphemeris(activeVisitorTarget) ? `${activeVisitorTarget.alt.toFixed(1)}°` : 'N/A'}</span>
                      <span><b>Azimuth</b>{visitorHasEphemeris(activeVisitorTarget) ? `${activeVisitorTarget.az.toFixed(1)}°` : 'N/A'}</span>
                      <span><b>Moon Impact</b>{activeVisitorTarget.moonImpact?.label || 'Needs RA/Dec'}</span>
                      <span><b>Tree Line</b>{activeVisitorTarget.treeObstruction?.label || 'Needs RA/Dec'}</span>
                      <span><b>Map Time</b>{formatCompactTime(date)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {selectedPanel === 'captured' && activeObject && (
        <section ref={plannerDetailRef} className="atlasDetail">
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
        <section ref={plannerDetailRef} className="atlasDetail plannerDetail plannerDetailNoBadge plannerTabbedDetail">
          <div>
            <small>Target Planner</small>
            <div className="plannerDetailTabs" role="tablist" aria-label="Target planner detail tabs">
              {PLANNER_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activePlannerTab === tab.key}
                  className={activePlannerTab === tab.key ? 'active' : ''}
                  onClick={() => setActivePlannerTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const actionPlan = getTargetActionPlan(activeFutureTarget);
              const framingPreview = getTargetFramingPreview(activeFutureTarget);
              const difficultyScore = getTargetDifficultyScore(activeFutureTarget);
              const whyExplanation = getTargetWhyExplanation(activeFutureTarget, sessionMode);

              return (
                <div className="plannerTabPanel">
                  {activePlannerTab === 'overview' && (
                    <>
                      <h2><span>＋</span>{activeFutureTarget.title}</h2>
                      <h3>{activeFutureTarget.constellation} · {activeFutureTarget.objectType}</h3>
                      <p>{activeFutureTarget.notes}</p>
                      {activeFutureGuide?.finderNote && (
                        <p className="futureFinderNote">
                          <b>Finder guide:</b> {activeFutureGuide.finderNote}
                        </p>
                      )}
                      {activeFutureTarget.moonImpact && (
                        <p className={`futureFinderNote moonImpactNote ${activeFutureTarget.moonImpact.className}`}>
                          <b>Moon check:</b> {activeFutureTarget.moonImpact.detail}
                        </p>
                      )}
                      {activeFutureTarget.treeObstruction && (
                        <p className={`futureFinderNote treeObstructionNote ${activeFutureTarget.treeObstruction.className}`}>
                          <b>Tree line:</b> {activeFutureTarget.treeObstruction.detail}
                        </p>
                      )}
                    </>
                  )}

                  {activePlannerTab === 'why' && (
                    <>
                      <div className="targetWhyCard">
                        <div className="targetWhyHeader">
                          <small>{whyExplanation.headline}</small>
                          <h3>Why it is ranked here</h3>
                        </div>
                        <p>{whyExplanation.summary}</p>
                        <div className="targetWhyColumns">
                          <div>
                            <b>Good tonight</b>
                            <ul>
                              {whyExplanation.good.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                          <div>
                            <b>Watch out</b>
                            <ul>
                              {whyExplanation.watch.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {activePlannerTab === 'difficulty' && (
                    <div className={`targetDifficultyCard ${difficultyScore.className}`}>
                      <div className="targetDifficultyHeader">
                        <small>Target Difficulty</small>
                        <h3>{difficultyScore.label}</h3>
                        <i>{difficultyScore.score.toFixed(1)} / 6</i>
                      </div>
                      <p>{difficultyScore.summary}</p>
                      <div className="targetDifficultyFactors">
                        {difficultyScore.factors.map((factor) => (
                          <em key={factor}>{factor}</em>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlannerTab === 'setup' && (
                    <div className={`targetActionCard ${actionPlan.difficulty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                      <div className="targetActionHeader">
                        <small>Recommended Setup</small>
                        <h3>{actionPlan.headline}</h3>
                        <i>{actionPlan.difficulty}</i>
                      </div>
                      <div className="targetActionGrid">
                        <span><b>Eyepiece</b>{actionPlan.eyepiece}</span>
                        <span><b>Filter</b>{actionPlan.filter}</span>
                        <span><b>Capture</b>{actionPlan.capture}</span>
                        <span><b>Approach</b>{actionPlan.approach}</span>
                      </div>
                      <p><b>Why:</b> {actionPlan.why}</p>
                      <ul>
                        {actionPlan.checklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activePlannerTab === 'framing' && (
                    <div className={`targetFramingCard ${framingPreview.className}`}>
                      <div className="targetFramingHeader">
                        <small>Framing Preview</small>
                        <h3>{framingPreview.headline}</h3>
                        <i>{framingPreview.fit}</i>
                      </div>
                      <div className="targetFramingGrid">
                        <span><b>Native CPC 800</b>{framingPreview.native}</span>
                        <span><b>Reducer</b>{framingPreview.reducer}</span>
                        <span><b>32mm Eyepiece</b>{framingPreview.eyepiece32}</span>
                        <span><b>10mm / High Power</b>{framingPreview.eyepiece10}</span>
                        <span><b>iPhone Capture</b>{framingPreview.iphone}</span>
                        <span><b>Bottom Line</b>{framingPreview.note}</span>
                      </div>
                      <div className="targetFramingChips">
                        {framingPreview.chips.map((chip) => (
                          <em key={chip}>{chip}</em>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlannerTab === 'info' && (
                    <div className="atlasFacts plannerGeneralInfoFacts">
                      <span><b>Planner Status</b>{activeFutureTarget.plannerStatus.label}</span>
                      <span><b>Difficulty</b>{difficultyScore.label}</span>
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
                      <span><b>Moon Impact</b>{activeFutureTarget.moonImpact.label}</span>
                      <span><b>Moon Separation</b>{activeFutureTarget.moonImpact.separationDegrees === null ? 'N/A' : `${activeFutureTarget.moonImpact.separationDegrees.toFixed(0)}°`}</span>
                      <span><b>Tree Line</b>{activeFutureTarget.treeObstruction.label}</span>
                      <span><b>Tree Clearance</b>{activeFutureTarget.treeObstruction.clearanceDegrees === null ? 'N/A' : `${activeFutureTarget.treeObstruction.clearanceDegrees.toFixed(0)}°`}</span>
                      <span><b>Tree Horizon</b>{`${activeFutureTarget.treeObstruction.horizonAltitude.toFixed(0)}° at az ${activeFutureTarget.az.toFixed(0)}°`}</span>
                      <span><b>Clear Window</b>{activeFutureTarget.treeObstruction.clearWindow}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </section>
      )}
    </div>
  );
}
