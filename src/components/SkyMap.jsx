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
const DEFAULT_ZOOM = 0.68;

const STAR_CATALOG = [
  // North / orientation
  { name: 'Polaris', ra: 2.5303, dec: 89.2641, mag: 2.0 },

  // Big Dipper / Ursa Major
  { name: 'Dubhe', ra: 11.0621, dec: 61.7510, mag: 1.8 },
  { name: 'Merak', ra: 11.0307, dec: 56.3824, mag: 2.4 },
  { name: 'Phecda', ra: 11.8972, dec: 53.6948, mag: 2.4 },
  { name: 'Megrez', ra: 12.2571, dec: 57.0326, mag: 3.3 },
  { name: 'Alioth', ra: 12.9004, dec: 55.9598, mag: 1.8 },
  { name: 'Mizar', ra: 13.3987, dec: 54.9254, mag: 2.2 },
  { name: 'Alkaid', ra: 13.7923, dec: 49.3133, mag: 1.9 },

  // Cassiopeia
  { name: 'Caph', ra: 0.1529, dec: 59.1498, mag: 2.3 },
  { name: 'Schedar', ra: 0.6751, dec: 56.5373, mag: 2.2 },
  { name: 'Gamma Cas', ra: 0.9451, dec: 60.7167, mag: 2.2 },
  { name: 'Ruchbah', ra: 1.4303, dec: 60.2353, mag: 2.7 },
  { name: 'Segin', ra: 2.2939, dec: 63.6701, mag: 3.4 },

  // Summer Triangle
  { name: 'Vega', ra: 18.6156, dec: 38.7837, mag: 0.0 },
  { name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.3 },
  { name: 'Altair', ra: 19.8464, dec: 8.8683, mag: 0.8 },

  // Lyra
  { name: 'Zeta Lyr', ra: 18.7462, dec: 37.6051, mag: 4.3 },
  { name: 'Delta2 Lyr', ra: 18.9080, dec: 36.8986, mag: 4.3 },
  { name: 'Sheliak', ra: 18.8347, dec: 33.3627, mag: 3.5 },
  { name: 'Sulafat', ra: 18.9824, dec: 32.6896, mag: 3.3 },

  // Cygnus
  { name: 'Sadr', ra: 20.3705, dec: 40.2567, mag: 2.2 },
  { name: 'Gienah', ra: 20.7702, dec: 33.9703, mag: 2.5 },
  { name: 'Delta Cyg', ra: 19.7496, dec: 45.1308, mag: 2.9 },
  { name: 'Albireo', ra: 19.5126, dec: 27.9597, mag: 3.1 },

  // Hercules
  { name: 'Eta Her', ra: 16.7149, dec: 38.9223, mag: 3.5 },
  { name: 'Zeta Her', ra: 16.6881, dec: 31.6032, mag: 2.8 },
  { name: 'Epsilon Her', ra: 17.0048, dec: 30.9263, mag: 3.9 },
  { name: 'Pi Her', ra: 17.2505, dec: 36.8092, mag: 3.1 },
  { name: 'Kornephoros', ra: 16.5037, dec: 21.4896, mag: 2.8 },
  { name: 'Rasalgethi', ra: 17.2441, dec: 14.3903, mag: 3.1 },

  // Vulpecula / nearby
  { name: 'Anser', ra: 19.4784, dec: 24.6649, mag: 4.4 },

  // Sagittarius
  { name: 'Nunki', ra: 18.9211, dec: -26.2967, mag: 2.0 },
  { name: 'Kaus Australis', ra: 18.4029, dec: -34.3846, mag: 1.8 },
  { name: 'Ascella', ra: 19.0435, dec: -29.8801, mag: 2.6 },
  { name: 'Kaus Media', ra: 18.3499, dec: -29.8281, mag: 2.7 },
  { name: 'Kaus Borealis', ra: 18.4662, dec: -25.4217, mag: 2.8 }
];

const CONSTELLATION_SEGMENTS = [
  // Big Dipper
  { group: 'Ursa Major', stars: ['Dubhe', 'Merak'] },
  { group: 'Ursa Major', stars: ['Merak', 'Phecda'] },
  { group: 'Ursa Major', stars: ['Phecda', 'Megrez'] },
  { group: 'Ursa Major', stars: ['Megrez', 'Dubhe'] },
  { group: 'Ursa Major', stars: ['Megrez', 'Alioth'] },
  { group: 'Ursa Major', stars: ['Alioth', 'Mizar'] },
  { group: 'Ursa Major', stars: ['Mizar', 'Alkaid'] },

  // Cassiopeia
  { group: 'Cassiopeia', stars: ['Caph', 'Schedar'] },
  { group: 'Cassiopeia', stars: ['Schedar', 'Gamma Cas'] },
  { group: 'Cassiopeia', stars: ['Gamma Cas', 'Ruchbah'] },
  { group: 'Cassiopeia', stars: ['Ruchbah', 'Segin'] },

  // Hercules
  { group: 'Hercules', stars: ['Eta Her', 'Zeta Her'] },
  { group: 'Hercules', stars: ['Zeta Her', 'Epsilon Her'] },
  { group: 'Hercules', stars: ['Epsilon Her', 'Pi Her'] },
  { group: 'Hercules', stars: ['Pi Her', 'Eta Her'] },
  { group: 'Hercules', stars: ['Zeta Her', 'Kornephoros'] },
  { group: 'Hercules', stars: ['Epsilon Her', 'Rasalgethi'] },

  // Lyra
  { group: 'Lyra', stars: ['Vega', 'Zeta Lyr'] },
  { group: 'Lyra', stars: ['Zeta Lyr', 'Delta2 Lyr'] },
  { group: 'Lyra', stars: ['Delta2 Lyr', 'Sheliak'] },
  { group: 'Lyra', stars: ['Sheliak', 'Sulafat'] },
  { group: 'Lyra', stars: ['Sulafat', 'Zeta Lyr'] },

  // Cygnus
  { group: 'Cygnus', stars: ['Deneb', 'Sadr'] },
  { group: 'Cygnus', stars: ['Sadr', 'Albireo'] },
  { group: 'Cygnus', stars: ['Sadr', 'Gienah'] },
  { group: 'Cygnus', stars: ['Sadr', 'Delta Cyg'] },

  // Vulpecula
  { group: 'Vulpecula', stars: ['Albireo', 'Anser'] },

  // Sagittarius
  { group: 'Sagittarius', stars: ['Kaus Australis', 'Kaus Media'] },
  { group: 'Sagittarius', stars: ['Kaus Media', 'Kaus Borealis'] },
  { group: 'Sagittarius', stars: ['Kaus Borealis', 'Nunki'] },
  { group: 'Sagittarius', stars: ['Nunki', 'Ascella'] },
  { group: 'Sagittarius', stars: ['Ascella', 'Kaus Australis'] }
];

const CONSTELLATION_LABELS = [
  { name: 'Ursa Major', ra: 12.35, dec: 57.4 },
  { name: 'Cassiopeia', ra: 1.05, dec: 59.8 },
  { name: 'Hercules', ra: 16.95, dec: 34.5 },
  { name: 'Lyra', ra: 18.82, dec: 37.5 },
  { name: 'Cygnus', ra: 20.15, dec: 39.5 },
  { name: 'Vulpecula', ra: 19.75, dec: 23.5 },
  { name: 'Sagittarius', ra: 18.72, dec: -28.5 }
];

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

function buildPath(points) {
  const validPoints = points.filter(Boolean);

  if (!validPoints.length) return '';

  return validPoints
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(' ');
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
      return '#b184ff';
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

function markerOffset(index) {
  const offsets = [
    { x: 30, y: -22 },
    { x: -32, y: -22 },
    { x: 34, y: 24 },
    { x: -34, y: 24 },
    { x: 28, y: 0 },
    { x: -28, y: 0 }
  ];

  return offsets[index % offsets.length];
}

export default function SkyMap({ gallery, setSelectedIndex }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const dragRef = useRef(null);

  const date = useMemo(() => new Date(), []);
  const observer = useMemo(() => new Observer(SITE.lat, SITE.lon, 0), []);

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

        return {
          ...photo,
          ra,
          dec,
          alt: altAz.alt,
          az: altAz.az,
          x: point.x,
          y: point.y,
          visible: point.visible
        };
      })
      .filter(Boolean);
  }, [gallery, date, observer]);

  const activeObject = mappedObjects[activeIndex] || mappedObjects[0];
  const activeConstellation = getMissionConstellation(activeObject);

  const starPoints = useMemo(() => {
    return STAR_CATALOG.map((star) => {
      const altAz = raDecToAltAz(star.ra, star.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);

      return {
        ...star,
        alt: altAz.alt,
        az: altAz.az,
        x: point.x,
        y: point.y,
        visible: point.visible
      };
    });
  }, [date]);

  const starLookup = useMemo(() => {
    return Object.fromEntries(starPoints.map((star) => [star.name, star]));
  }, [starPoints]);

  const constellationLines = useMemo(() => {
    return CONSTELLATION_SEGMENTS.map((segment) => {
      const [first, second] = segment.stars;
      const starA = starLookup[first];
      const starB = starLookup[second];

      if (!starA || !starB) return null;

      return {
        group: segment.group,
        path: `M ${starA.x.toFixed(1)} ${starA.y.toFixed(1)} L ${starB.x.toFixed(1)} ${starB.y.toFixed(1)}`
      };
    }).filter(Boolean);
  }, [starLookup]);

  const constellationLabels = useMemo(() => {
    return CONSTELLATION_LABELS.map((label) => {
      const altAz = raDecToAltAz(label.ra, label.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);

      return {
        ...label,
        x: point.x,
        y: point.y
      };
    });
  }, [date]);

  const eclipticPath = useMemo(() => {
    const points = [];

    for (let lambda = 0; lambda <= 360; lambda += 3) {
      const eq = eclipticToRaDec(lambda, 0);
      const altAz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      points.push(projectAltAz(altAz.alt, altAz.az));
    }

    return buildPath(points);
  }, [date]);

  const lunarPath = useMemo(() => {
    const points = [];

    for (let hour = 0; hour <= 24; hour += 2) {
      const future = new Date(date.getTime() + hour * 60 * 60 * 1000);
      const moon = getPlanetRaDec(Body.Moon, future, observer);
      const altAz = raDecToAltAz(moon.ra, moon.dec, future, SITE.lat, SITE.lon);
      points.push(projectAltAz(altAz.alt, altAz.az));
    }

    return buildPath(points);
  }, [date, observer]);

  const planets = useMemo(() => {
    const bodies = [
      { name: 'Mercury', body: Body.Mercury },
      { name: 'Venus', body: Body.Venus },
      { name: 'Mars', body: Body.Mars },
      { name: 'Jupiter', body: Body.Jupiter },
      { name: 'Saturn', body: Body.Saturn }
    ];

    return bodies.map((item) => {
      const eq = getPlanetRaDec(item.body, date, observer);
      const altAz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(altAz.alt, altAz.az);

      return {
        ...item,
        alt: altAz.alt,
        az: altAz.az,
        x: point.x,
        y: point.y,
        visible: point.visible
      };
    });
  }, [date, observer]);

  const summerTriangle = useMemo(() => {
    const vega = starLookup.Vega;
    const deneb = starLookup.Deneb;
    const altair = starLookup.Altair;

    if (!vega || !deneb || !altair) return '';

    return `M ${vega.x.toFixed(1)} ${vega.y.toFixed(1)} L ${deneb.x.toFixed(1)} ${deneb.y.toFixed(1)} L ${altair.x.toFixed(1)} ${altair.y.toFixed(1)} Z`;
  }, [starLookup]);

  const bigDipperPointers = useMemo(() => {
    const merak = starLookup.Merak;
    const dubhe = starLookup.Dubhe;
    const polaris = starLookup.Polaris;

    if (!merak || !dubhe || !polaris) return [];

    return [
      `M ${merak.x.toFixed(1)} ${merak.y.toFixed(1)} L ${dubhe.x.toFixed(1)} ${dubhe.y.toFixed(1)}`,
      `M ${dubhe.x.toFixed(1)} ${dubhe.y.toFixed(1)} L ${polaris.x.toFixed(1)} ${polaris.y.toFixed(1)}`
    ];
  }, [starLookup]);

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((item) => item.title === photo.title);

    if (realIndex !== -1) {
      setSelectedIndex(realIndex);
    }
  };

  const zoomIn = () => {
    setZoom((currentZoom) =>
      Math.min(1.35, Number((currentZoom + 0.08).toFixed(2)))
    );
  };

  const zoomOut = () => {
    setZoom((currentZoom) =>
      Math.max(0.55, Number((currentZoom - 0.08).toFixed(2)))
    );
  };

  const resetView = () => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const shouldIgnoreDrag = (target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest('.atlasZoomControls') ||
      target.closest('.missionMarkerWrap') ||
      target.closest('.atlasLegend')
    );
  };

  const handlePointerDown = (event) => {
    if (shouldIgnoreDrag(event.target)) return;

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy
    });
  };

  const handlePointerUp = (event) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const stopMapPointerEvents = (event) => {
    event.stopPropagation();
  };

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>

        <h1>Celestial Atlas</h1>

        <p className="tagline">
          A live sky map for Eliot, Maine using real right ascension and
          declination. Mission targets, constellation guides, the ecliptic,
          lunar path, Polaris, and compass directions are plotted live.
        </p>

        <a className="atlasBackButton" href="/#observatory">
          ← Back to Observatory
        </a>
      </section>

      <section className="atlasLayout realAtlasLayout">
        <div
          className="atlasMap realSkyMap"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className="skyPanLayer"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
            <svg
              className="skySvg"
              viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
              role="img"
              aria-label="Live sky map for Eliot, Maine"
            >
              <circle cx={CENTER} cy={CENTER} r={RADIUS} className="skyHorizonCircle" />
              <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.66} className="skyAltitudeRing" />
              <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.33} className="skyAltitudeRing" />
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

              <text x={CENTER} y={CENTER - RADIUS - 20} className="compassLabel">N</text>
              <text x={CENTER + RADIUS + 18} y={CENTER + 6} className="compassLabel">E</text>
              <text x={CENTER} y={CENTER + RADIUS + 30} className="compassLabel">S</text>
              <text x={CENTER - RADIUS - 22} y={CENTER + 6} className="compassLabel">W</text>
              <text x={CENTER + 14} y={CENTER - 10} className="zenithLabel">Zenith</text>

              {eclipticPath && <path d={eclipticPath} className="eclipticPath" />}
              {lunarPath && <path d={lunarPath} className="lunarPath" />}
              {summerTriangle && <path d={summerTriangle} className="summerTriangle" />}

              {bigDipperPointers.map((pathData, index) => (
                <path key={index} d={pathData} className="dipperPointer" />
              ))}

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

              {constellationLabels.map((label) => (
                <text
                  key={label.name}
                  x={label.x}
                  y={label.y}
                  className={
                    label.name === activeConstellation
                      ? 'constellationText active'
                      : 'constellationText'
                  }
                >
                  {label.name}
                </text>
              ))}

              {starPoints.map((star) => (
                <g key={star.name}>
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={Math.max(1.4, 5 - star.mag)}
                    className={star.name === 'Polaris' ? 'skyStar polarisStar' : 'skyStar'}
                  />

                  {['Polaris', 'Vega', 'Deneb', 'Altair'].includes(star.name) && (
                    <text x={star.x + 10} y={star.y - 10} className="brightStarLabel">
                      {star.name}
                    </text>
                  )}
                </g>
              ))}

              {planets.map((planet) => (
                <g key={planet.name}>
                  <circle cx={planet.x} cy={planet.y} r={5} className="planetMarker" />

                  <text x={planet.x + 10} y={planet.y - 8} className="planetLabel">
                    {planet.name}
                  </text>
                </g>
              ))}

              {mappedObjects.map((photo, index) => {
                const offset = markerOffset(index);
                const markerX = photo.x + offset.x;
                const markerY = photo.y + offset.y;
                const markerColor = getObjectColor(photo.objectType);

                return (
                  <g key={`${photo.title}-leader`}>
                    <line
                      x1={photo.x}
                      y1={photo.y}
                      x2={markerX}
                      y2={markerY}
                      className="missionLeaderLine"
                    />

                    <circle
                      cx={photo.x}
                      cy={photo.y}
                      r={4}
                      className="missionAnchorDot"
                      style={{
                        fill: markerColor,
                        '--marker-color': markerColor
                      }}
                    />

                    {activeIndex === index && (
                      <circle
                        cx={photo.x}
                        cy={photo.y}
                        r={11}
                        className="missionAnchorGlow"
                        style={{ stroke: markerColor }}
                      />
                    )}
                  </g>
                );
              })}

              <text x={CENTER + 230} y={CENTER - 95} className="pathLabel">
                Ecliptic
              </text>

              <text x={CENTER - 215} y={CENTER + 175} className="pathLabel moonPathLabel">
                Lunar Path
              </text>
            </svg>

            {mappedObjects.map((photo, index) => {
              const offset = markerOffset(index);
              const markerColor = getObjectColor(photo.objectType);
              const isActive = activeIndex === index;

              return (
                <div
                  key={photo.title}
                  className={isActive ? 'missionMarkerWrap active' : 'missionMarkerWrap'}
                  style={{
                    left: `${((photo.x + offset.x) / MAP_SIZE) * 100}%`,
                    top: `${((photo.y + offset.y) / MAP_SIZE) * 100}%`,
                    '--marker-color': markerColor
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

                  <span className="missionMarkerName">
                    {photo.title}
                  </span>
                </div>
              );
            })}
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
            aria-label="Sky map zoom controls"
            onPointerDown={stopMapPointerEvents}
            onPointerMove={stopMapPointerEvents}
            onPointerUp={stopMapPointerEvents}
            onClick={stopMapPointerEvents}
          >
            <button
              type="button"
              onPointerDown={stopMapPointerEvents}
              onClick={(event) => {
                event.stopPropagation();
                zoomIn();
              }}
              aria-label="Zoom in"
            >
              +
            </button>

            <button
              type="button"
              onPointerDown={stopMapPointerEvents}
              onClick={(event) => {
                event.stopPropagation();
                zoomOut();
              }}
              aria-label="Zoom out"
            >
              −
            </button>

            <button
              type="button"
              onPointerDown={stopMapPointerEvents}
              onClick={(event) => {
                event.stopPropagation();
                resetView();
              }}
              aria-label="Reset sky map view"
            >
              Reset
            </button>

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
              <span><b>Constellation</b>{activeObject.constellation}</span>
              <span><b>Type</b>{activeObject.objectType}</span>
              <span><b>RA</b>{formatRa(activeObject.ra)}</span>
              <span><b>Dec</b>{formatDec(activeObject.dec)}</span>
              <span><b>Altitude</b>{activeObject.alt.toFixed(1)}°</span>
              <span><b>Azimuth</b>{activeObject.az.toFixed(1)}°</span>
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