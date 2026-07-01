import { useMemo, useRef, useState } from 'react';
import { Body, Observer, Equator } from 'astronomy-engine';

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
  return isMobileViewport() ? 1.5 : 1.25;
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
  { name: 'Kaus Borealis', ra: 18.4662, dec: -25.4217, mag: 2.8 }
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
  { group: 'Sagittarius', stars: ['Ascella', 'Kaus Australis'] }
];

const CONSTELLATION_LABEL_GROUPS = {
  Hercules: ['Eta Her', 'Zeta Her', 'Epsilon Her', 'Pi Her'],
  Lyra: ['Vega', 'Zeta Lyr', 'Sheliak', 'Sulafat'],
  Cygnus: ['Deneb', 'Sadr', 'Albireo', 'Gienah'],
  Vulpecula: ['Albireo', 'Anser'],
  'Ursa Major': ['Dubhe', 'Merak', 'Alioth', 'Mizar'],
  Cassiopeia: ['Caph', 'Schedar', 'Gamma Cas', 'Ruchbah'],
  Sagittarius: ['Nunki', 'Kaus Borealis', 'Kaus Australis', 'Ascella']
};

const CONSTELLATION_LABEL_OFFSETS = {
  Hercules: { x: -10, y: -28 },
  Lyra: { x: -10, y: -18 },
  Cygnus: { x: 0, y: 28 },
  Vulpecula: { x: 10, y: -18 },
  'Ursa Major': { x: 40, y: 18 },
  Cassiopeia: { x: -10, y: -18 },
  Sagittarius: { x: 0, y: 24 }
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

  let azRadians = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  let azDegrees = toDegrees(azRadians);

  if (Math.sin(hourAngleRadians) > 0) {
    azDegrees = 360 - azDegrees;
  }

  return {
    alt: altDegrees,
    az: azDegrees
  };
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
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= RADIUS + buffer;
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

  const total = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

function clampPoint(point, pad = 40) {
  return {
    x: clamp(point.x, pad, MAP_SIZE - pad),
    y: clamp(point.y, pad, MAP_SIZE - pad)
  };
}

function offsetPoint(point, offset = { x: 0, y: 0 }, pad = 40) {
  return clampPoint(
    {
      x: point.x + offset.x,
      y: point.y + offset.y
    },
    pad
  );
}

function pickPathLabel(points, preferredFraction, offset = { x: 0, y: 0 }) {
  const visiblePoints = points.filter((point) => isInsideSky(point, 14));

  if (!visiblePoints.length) {
    return { x: CENTER, y: CENTER };
  }

  const index = Math.round((visiblePoints.length - 1) * preferredFraction);
  const point = visiblePoints[clamp(index, 0, visiblePoints.length - 1)];

  return offsetPoint(point, offset, 70);
}

function getPlanetRaDec(body, date, observer) {
  const equator = Equator(body, date, observer, true, true);

  return {
    ra: equator.ra,
    dec: equator.dec
  };
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

  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;

  return Math.atan2(dy, dx) * (180 / Math.PI);
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
  return mapDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
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

  let rightAscension = toDegrees(
    Math.atan(0.91764 * Math.tan(toRadians(trueLongitude)))
  );

  rightAscension = normalizeDegrees(rightAscension);

  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const raQuadrant = Math.floor(rightAscension / 90) * 90;

  rightAscension = (rightAscension + longitudeQuadrant - raQuadrant) / 15;

  const sinDec = 0.39782 * Math.sin(toRadians(trueLongitude));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosHour =
    (Math.cos(toRadians(zenith)) -
      sinDec * Math.sin(toRadians(SITE.lat))) /
    (cosDec * Math.cos(toRadians(SITE.lat)));

  if (cosHour > 1 || cosHour < -1) {
    return new Date(baseDate);
  }

  let hourAngle = isSunrise
    ? 360 - toDegrees(Math.acos(cosHour))
    : toDegrees(Math.acos(cosHour));

  hourAngle /= 15;

  const localMeanTime =
    hourAngle +
    rightAscension -
    0.06571 * approximateTime -
    6.622;

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
  if (!photo || photo.alt < 0) {
    return {
      label: 'Below Horizon',
      className: 'below',
      score: 0
    };
  }

  if (photo.alt < 20) {
    return {
      label: 'Low',
      className: 'low',
      score: 1
    };
  }

  if (photo.alt < 45) {
    return {
      label: 'Good',
      className: 'good',
      score: 2
    };
  }

  return {
    label: 'Best Now',
    className: 'best',
    score: 3
  };
}

function getZoomSafeBounds(zoom, isMobile) {
  const safeInset = isMobile ? 74 : 92;
  const halfVisible = (CENTER - safeInset) / Math.max(zoom, getMinZoom());

  return {
    min: CENTER - halfVisible,
    max: CENTER + halfVisible
  };
}

function buildMissionCallouts(objects, zoom) {
  const placed = [];

  const isMobile = isMobileViewport();
  const defaultZoom = isMobile ? MOBILE_DEFAULT_ZOOM : DESKTOP_DEFAULT_ZOOM;

  const zoomPull = Math.max(0, zoom - defaultZoom);
  const baseOffset = isMobile ? 26 : 72;
  const pullStrength = isMobile ? 140 : 160;

  const baseRadius = clamp(
    RADIUS + baseOffset - zoomPull * pullStrength,
    isMobile ? RADIUS - 58 : RADIUS - 38,
    RADIUS + baseOffset
  );

  const overlapDistance = isMobile ? 40 : 58;
  const shiftAmount = isMobile ? 18 : 26;
  const edgePadding = isMobile ? 34 : 54;
  const zoomBounds = getZoomSafeBounds(zoom, isMobile);

  const sorted = [...objects]
    .map((photo, index) => ({
      ...photo,
      originalIndex: index
    }))
    .sort((a, b) => {
      const aAngle = Math.atan2(a.y - CENTER, a.x - CENTER);
      const bAngle = Math.atan2(b.y - CENTER, b.x - CENTER);
      return aAngle - bAngle;
    });

  const laidOut = sorted.map((photo) => {
    const dx = photo.x - CENTER;
    const dy = photo.y - CENTER;
    const angle = Math.atan2(dy, dx);

    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);

    const baseX = CENTER + Math.cos(angle) * baseRadius;
    const baseY = CENTER + Math.sin(angle) * baseRadius;

    const clampX = (value) =>
      clamp(
        value,
        Math.max(edgePadding, zoomBounds.min),
        Math.min(MAP_SIZE - edgePadding, zoomBounds.max)
      );

    const clampY = (value) =>
      clamp(
        value,
        Math.max(edgePadding, zoomBounds.min),
        Math.min(MAP_SIZE - edgePadding, zoomBounds.max)
      );

    let chosen = {
      x: clampX(baseX),
      y: clampY(baseY)
    };

    for (let i = 0; i < 20; i += 1) {
      const band = Math.ceil(i / 2);
      const direction = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const shift = band * shiftAmount * direction;

      const test = {
        x: clampX(baseX + tangentX * shift),
        y: clampY(baseY + tangentY * shift)
      };

      const overlaps = placed.some((item) => pointDistance(item, test) < overlapDistance);

      if (!overlaps) {
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

export default function SkyMap({ gallery, setSelectedIndex }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(() => getDefaultZoom());
  const [rotation, setRotation] = useState(0);
  const [date, setDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('clean');
  const [activePreset, setActivePreset] = useState('now');

  const dragRef = useRef(null);
  const observer = useMemo(() => new Observer(SITE.lat, SITE.lon, 0), []);
  const isDetailMode = viewMode === 'detail';

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

  const activeObject = mappedObjects[activeIndex] || mappedObjects[0];
  const activeConstellation = getMissionConstellation(activeObject);

  const visibleObjects = useMemo(() => {
    return mappedObjects.filter((photo) => isInsideSky(photo, 12));
  }, [mappedObjects]);

  const bestObjectCount = useMemo(() => {
    return mappedObjects.filter((photo) => photo.observingStatus.score >= 3).length;
  }, [mappedObjects]);

  const goodObjectCount = useMemo(() => {
    return mappedObjects.filter((photo) => photo.observingStatus.score >= 2).length;
  }, [mappedObjects]);

  const missionCallouts = useMemo(() => {
    return buildMissionCallouts(visibleObjects, zoom);
  }, [visibleObjects, zoom]);

  const starPoints = useMemo(() => {
    return STAR_CATALOG.map((star) => {
      const altAz = raDecToAltAz(star.ra, star.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);

      return {
        ...star,
        x: point.x,
        y: point.y,
        alt: altAz.alt,
        az: altAz.az,
        visible: point.visible
      };
    });
  }, [date]);

  const visibleStars = useMemo(() => {
    return starPoints.filter((star) => isInsideSky(star, 12));
  }, [starPoints]);

  const starLookup = useMemo(() => {
    return Object.fromEntries(starPoints.map((star) => [star.name, star]));
  }, [starPoints]);

  const constellationLines = useMemo(() => {
    return CONSTELLATION_SEGMENTS.map((segment) => {
      const [nameA, nameB] = segment.stars;
      const a = starLookup[nameA];
      const b = starLookup[nameB];

      if (!a || !b) return null;
      if (!isInsideSky(a, 10) || !isInsideSky(b, 10)) return null;

      return {
        group: segment.group,
        path: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
      };
    }).filter(Boolean);
  }, [starLookup]);

  const constellationLabels = useMemo(() => {
    return Object.entries(CONSTELLATION_LABEL_GROUPS)
      .map(([name, stars]) => {
        const points = stars
          .map((starName) => starLookup[starName])
          .filter((point) => point && isInsideSky(point, 20));

        if (points.length < 2) return null;

        const centerPoint = avgPoint(points);
        const offset = CONSTELLATION_LABEL_OFFSETS[name] || { x: 0, y: 0 };

        return {
          name,
          ...offsetPoint(centerPoint, offset, 80)
        };
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

    for (let hour = 0; hour <= 24; hour += 2) {
      const future = new Date(date.getTime() + hour * 60 * 60 * 1000);
      const moon = getPlanetRaDec(Body.Moon, future, observer);
      const altAz = raDecToAltAz(moon.ra, moon.dec, future, SITE.lat, SITE.lon);
      points.push(projectAltAz(altAz.alt, altAz.az));
    }

    return points;
  }, [date, observer]);

  const eclipticPath = useMemo(() => buildVisiblePath(eclipticPoints), [eclipticPoints]);
  const lunarPath = useMemo(() => buildVisiblePath(lunarPoints), [lunarPoints]);

  const eclipticLabel = useMemo(() => {
    return pickPathLabel(eclipticPoints, 0.72, { x: 24, y: -20 });
  }, [eclipticPoints]);

  const lunarLabel = useMemo(() => {
    return pickPathLabel(lunarPoints, 0.18, { x: -12, y: -18 });
  }, [lunarPoints]);

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

      return {
        ...planet,
        x: point.x,
        y: point.y,
        alt: altAz.alt,
        az: altAz.az,
        visible: point.visible
      };
    });
  }, [date, observer]);

  const visiblePlanets = useMemo(() => {
    return planets.filter((planet) => isInsideSky(planet, 12));
  }, [planets]);

  const summerTrianglePoints = useMemo(() => {
    return [starLookup.Vega, starLookup.Deneb, starLookup.Altair]
      .filter((point) => point && isInsideSky(point, 20));
  }, [starLookup]);

  const summerTrianglePath = useMemo(() => {
    if (summerTrianglePoints.length < 3) return '';
    return buildPath(summerTrianglePoints, true);
  }, [summerTrianglePoints]);

  const summerTriangleLabel = useMemo(() => {
    if (summerTrianglePoints.length < 3) return null;

    const centerPoint = avgPoint(summerTrianglePoints);
    return offsetPoint(centerPoint, { x: 58, y: -10 }, 80);
  }, [summerTrianglePoints]);

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((item) => item.title === photo.title);

    if (realIndex !== -1) {
      setSelectedIndex(realIndex);
    }
  };

  const zoomIn = () => {
    setZoom((current) => Math.min(getMaxZoom(), Number((current + 0.08).toFixed(2))));
  };

  const zoomOut = () => {
    setZoom((current) => Math.max(getMinZoom(), Number((current - 0.08).toFixed(2))));
  };

  const rotateLeft = () => {
    setRotation((current) => current - 15);
  };

  const rotateRight = () => {
    setRotation((current) => current + 15);
  };

  const resetView = () => {
    setZoom(getDefaultZoom());
    setRotation(0);
  };

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
      target.closest('.atlasModeControls') ||
      target.closest('.missionMarkerWrap') ||
      target.closest('.atlasLegend')
    );
  };

  const handlePointerDown = (event) => {
    if (shouldIgnoreDrag(event.target)) return;

    if (event.pointerType === 'touch') return;

    const angle = getPointerAngle(event, event.currentTarget);

    dragRef.current = {
      startAngle: angle,
      startRotation: rotation
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;

    const angle = getPointerAngle(event, event.currentTarget);
    const delta = angle - dragRef.current.startAngle;

    setRotation(dragRef.current.startRotation + delta);
  };

  const handlePointerUp = (event) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const stopMapPointerEvents = (event) => {
    event.stopPropagation();
  };

  const keepUpright = (x, y) => {
    return `rotate(${-rotation} ${x} ${y})`;
  };

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>

        <h1>Celestial Atlas</h1>

        <p className="tagline">
          Live sky planning from Eliot, Maine. Jump to sunset, 10 PM, midnight,
          or pre-dawn and see which CuzBro missions are best placed.
        </p>

        <a className="atlasBackButton" href="/#observatory">
          ← Back to Observatory
        </a>
      </section>

      <section className="atlasLayout realAtlasLayout">
        <div
          className={isDetailMode ? 'atlasMap realSkyMap detailMode' : 'atlasMap realSkyMap cleanMode'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className="skyPanLayer"
            style={{
              transform: `rotate(${rotation}deg) scale(${zoom})`
            }}
          >
            <svg
              className="skySvg"
              viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
              role="img"
              aria-label="Live sky map for Eliot, Maine"
            >
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

              {isDetailMode && (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS * 0.33}
                  className="skyAltitudeRing detailOnly"
                />
              )}

              <circle cx={CENTER} cy={CENTER} r={8} className="skyZenithDot" />

              <line
                x1={CENTER}
                y1={CENTER - RADIUS}
                x2={CENTER}
                y2={CENTER + RADIUS}
                className="skyAxis"
              />
              <line
                x1={CENTER - RADIUS}
                y1={CENTER}
                x2={CENTER + RADIUS}
                y2={CENTER}
                className="skyAxis"
              />

              <text
                x={CENTER}
                y={CENTER - RADIUS - 18}
                className="compassLabel"
                transform={keepUpright(CENTER, CENTER - RADIUS - 18)}
              >
                N
              </text>

              <text
                x={CENTER + RADIUS + 16}
                y={CENTER + 6}
                className="compassLabel"
                transform={keepUpright(CENTER + RADIUS + 16, CENTER + 6)}
              >
                E
              </text>

              <text
                x={CENTER}
                y={CENTER + RADIUS + 28}
                className="compassLabel"
                transform={keepUpright(CENTER, CENTER + RADIUS + 28)}
              >
                S
              </text>

              <text
                x={CENTER - RADIUS - 18}
                y={CENTER + 6}
                className="compassLabel"
                transform={keepUpright(CENTER - RADIUS - 18, CENTER + 6)}
              >
                W
              </text>

              {isDetailMode && (
                <text
                  x={CENTER + 14}
                  y={CENTER - 12}
                  className="zenithLabel"
                  transform={keepUpright(CENTER + 14, CENTER - 12)}
                >
                  Zenith
                </text>
              )}

              {eclipticPath && <path d={eclipticPath} className="eclipticPath" />}
              {lunarPath && <path d={lunarPath} className="lunarPath" />}

              {isDetailMode && summerTrianglePath && (
                <path d={summerTrianglePath} className="summerTriangleOutline" />
              )}

              {constellationLines.map((segment, index) => (
                <path
                  key={index}
                  d={segment.path}
                  className={
                    segment.group === activeConstellation
                      ? 'constellationSegment active'
                      : 'constellationSegment'
                  }
                />
              ))}

              {visibleStars.map((star) => (
                <g key={star.name}>
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={Math.max(1.5, 5 - star.mag)}
                    className={star.name === 'Polaris' ? 'skyStar polarisStar' : 'skyStar'}
                  />

                  {(isDetailMode || star.name === 'Polaris') &&
                    ['Polaris', 'Vega', 'Deneb', 'Altair'].includes(star.name) && (
                      <text
                        x={star.x + 10}
                        y={star.y - 10}
                        className="brightStarLabel"
                        transform={keepUpright(star.x + 10, star.y - 10)}
                      >
                        {star.name}
                      </text>
                    )}
                </g>
              ))}

              {visiblePlanets.map((planet) => (
                <g key={planet.name}>
                  <circle cx={planet.x} cy={planet.y} r={5} className="planetMarker" />

                  <text
                    x={planet.x + 10}
                    y={planet.y - 8}
                    className="planetLabel"
                    transform={keepUpright(planet.x + 10, planet.y - 8)}
                  >
                    {planet.name}
                  </text>
                </g>
              ))}

              {missionCallouts.map((photo) => {
                const index = mappedObjects.findIndex((item) => item.title === photo.title);
                const markerColor = getObjectColor(photo.objectType);

                return (
                  <g key={`${photo.title}-callout`}>
                    <line
                      x1={photo.x}
                      y1={photo.y}
                      x2={photo.markerX}
                      y2={photo.markerY}
                      className="missionGuideLine"
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

                    {activeIndex === index && (
                      <circle
                        cx={photo.x}
                        cy={photo.y}
                        r={13}
                        className="missionAnchorGlow"
                        style={{ stroke: markerColor }}
                      />
                    )}
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
                    className={
                      label.name === activeConstellation
                        ? 'constellationText active'
                        : 'constellationText'
                    }
                  >
                    {label.name}
                  </text>
                ))}

              {isDetailMode && summerTriangleLabel && (
                <text
                  x={summerTriangleLabel.x}
                  y={summerTriangleLabel.y}
                  className="guideLabel"
                  transform={keepUpright(summerTriangleLabel.x, summerTriangleLabel.y)}
                >
                  Summer Triangle
                </text>
              )}

              {isDetailMode && (
                <>
                  <text
                    x={eclipticLabel.x}
                    y={eclipticLabel.y}
                    className="pathLabel"
                    transform={keepUpright(eclipticLabel.x, eclipticLabel.y)}
                  >
                    Ecliptic
                  </text>

                  <text
                    x={lunarLabel.x}
                    y={lunarLabel.y}
                    className="pathLabel"
                    transform={keepUpright(lunarLabel.x, lunarLabel.y)}
                  >
                    Lunar Path
                  </text>
                </>
              )}
            </svg>

            {missionCallouts.map((photo) => {
              const index = mappedObjects.findIndex((item) => item.title === photo.title);
              const markerColor = getObjectColor(photo.objectType);
              const isActive = activeIndex === index;

              return (
                <div
                  key={photo.title}
                  className={[
                    'missionMarkerWrap',
                    isActive ? 'active' : '',
                    `label-${photo.labelSide}`
                  ].join(' ')}
                  style={{
                    left: `${(photo.markerX / MAP_SIZE) * 100}%`,
                    top: `${(photo.markerY / MAP_SIZE) * 100}%`,
                    '--marker-color': markerColor,
                    '--atlas-rotation': `${rotation}deg`
                  }}
                  onPointerDown={stopMapPointerEvents}
                  onPointerMove={stopMapPointerEvents}
                  onPointerUp={stopMapPointerEvents}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                >
                  <button
                    type="button"
                    className={isActive ? 'svgMarker active' : 'svgMarker'}
                    onClick={() => {
                      setActiveIndex(index);
                      openMission(photo);
                    }}
                    aria-label={`Open ${photo.title} Mission Report`}
                  >
                    {index + 1}
                  </button>

                  <span className="missionMarkerName">{photo.title}</span>
                </div>
              );
            })}
          </div>

          <div
            className="atlasTimeControls tonightControls"
            aria-label="Sky map time controls"
            onPointerDown={stopMapPointerEvents}
            onPointerMove={stopMapPointerEvents}
            onPointerUp={stopMapPointerEvents}
            onClick={stopMapPointerEvents}
          >
            <strong>{formatMapTime(date)}</strong>

            <small>
              {goodObjectCount} good targets · {bestObjectCount} best now
            </small>

            <div className="timeNudgeRow">
              <button type="button" onClick={(event) => { event.stopPropagation(); changeTime(-1); }}>−1h</button>
              <button type="button" className={activePreset === 'now' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); resetToNow(); }}>Now</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); changeTime(1); }}>+1h</button>
            </div>

            <div className="tonightPresetRow">
              <button type="button" className={activePreset === 'sunset' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('sunset'); }}>
                Sunset
              </button>

              <button type="button" className={activePreset === '10pm' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('10pm'); }}>
                10 PM
              </button>

              <button type="button" className={activePreset === 'midnight' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('midnight'); }}>
                Midnight
              </button>

              <button type="button" className={activePreset === 'predawn' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setPresetTime('predawn'); }}>
                Pre-dawn
              </button>
            </div>
          </div>

          <div
            className="atlasModeControls"
            aria-label="Sky map display mode controls"
            onPointerDown={stopMapPointerEvents}
            onPointerMove={stopMapPointerEvents}
            onPointerUp={stopMapPointerEvents}
            onClick={stopMapPointerEvents}
          >
            <button type="button" className={viewMode === 'clean' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setViewMode('clean'); }}>
              Clean
            </button>

            <button type="button" className={viewMode === 'detail' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setViewMode('detail'); }}>
              Detail
            </button>
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

        <aside className="atlasCatalog">
          <small>Mission Catalog</small>

          {mappedObjects.map((photo, index) => (
            <button
              key={photo.title}
              className={index === activeIndex ? 'catalogItem active' : 'catalogItem'}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => {
                setActiveIndex(index);
                openMission(photo);
              }}
              type="button"
            >
              <b>{index + 1}</b>

              <span>
                <strong>{photo.title}</strong>
                <em>{photo.constellation}</em>
                <small>{photo.objectType}</small>

                <i className={`targetStatusBadge ${photo.observingStatus.className}`}>
                  {photo.observingStatus.label}
                </i>
              </span>
            </button>
          ))}
        </aside>
      </section>

      {activeObject && (
        <section className="atlasDetail">
          <img
            src={import.meta.env.BASE_URL + activeObject.image}
            alt={activeObject.title}
          />

          <div>
            <small>Selected Mission</small>

            <h2>
              <span>{activeIndex + 1}</span>
              {activeObject.title}
            </h2>

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
            </div>

            <button type="button" onClick={() => openMission(activeObject)}>
              Open Mission Report →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}