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

const STAR_CATALOG = [
  { name: 'Polaris', ra: 2.5303, dec: 89.2641, mag: 2.0 },
  { name: 'Vega', ra: 18.6156, dec: 38.7837, mag: 0.0 },
  { name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.3 },
  { name: 'Albireo', ra: 19.5126, dec: 27.9597, mag: 3.1 },
  { name: 'Sheliak', ra: 18.8347, dec: 33.3627, mag: 3.5 },
  { name: 'Sulafat', ra: 18.9824, dec: 32.6896, mag: 3.3 },
  { name: 'Delta2 Lyr', ra: 18.9080, dec: 36.8986, mag: 4.3 },
  { name: 'Zeta Lyr', ra: 18.7462, dec: 37.6051, mag: 4.3 },
  { name: 'Kornephoros', ra: 16.5037, dec: 21.4896, mag: 2.8 },
  { name: 'Zeta Her', ra: 16.6881, dec: 31.6032, mag: 2.8 },
  { name: 'Eta Her', ra: 16.7149, dec: 38.9223, mag: 3.5 },
  { name: 'Pi Her', ra: 17.2505, dec: 36.8092, mag: 3.1 },
  { name: 'Rasalgethi', ra: 17.2441, dec: 14.3903, mag: 3.1 },
  { name: 'Nunki', ra: 18.9211, dec: -26.2967, mag: 2.0 },
  { name: 'Kaus Australis', ra: 18.4029, dec: -34.3846, mag: 1.8 },
  { name: 'Ascella', ra: 19.0435, dec: -29.8801, mag: 2.6 },
  { name: 'Kaus Media', ra: 18.3499, dec: -29.8281, mag: 2.7 },
  { name: 'Anser', ra: 19.4784, dec: 24.6649, mag: 4.4 }
];

const CONSTELLATION_SEGMENTS = [
  ['Kornephoros', 'Zeta Her'],
  ['Zeta Her', 'Eta Her'],
  ['Eta Her', 'Pi Her'],
  ['Pi Her', 'Rasalgethi'],
  ['Kornephoros', 'Rasalgethi'],

  ['Vega', 'Zeta Lyr'],
  ['Zeta Lyr', 'Delta2 Lyr'],
  ['Delta2 Lyr', 'Sheliak'],
  ['Sheliak', 'Sulafat'],
  ['Sulafat', 'Vega'],

  ['Deneb', 'Albireo'],

  ['Anser', 'Albireo'],

  ['Kaus Australis', 'Kaus Media'],
  ['Kaus Media', 'Ascella'],
  ['Ascella', 'Nunki']
];

const CONSTELLATION_LABELS = [
  { name: 'Hercules', ra: 16.8, dec: 28.5 },
  { name: 'Lyra', ra: 18.8, dec: 39.2 },
  { name: 'Cygnus', ra: 20.2, dec: 38.0 },
  { name: 'Vulpecula', ra: 20.0, dec: 24.5 },
  { name: 'Sagittarius', ra: 18.7, dec: -28.5 }
];

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function normalizeHours(hours) {
  return ((hours % 24) + 24) % 24;
}

function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function localSiderealTime(date, lonDeg) {
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525.0;

  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;

  gmst = normalizeDegrees(gmst);
  const lstDeg = normalizeDegrees(gmst + lonDeg);

  return lstDeg / 15;
}

function raDecToAltAz(raHours, decDeg, date, latDeg, lonDeg) {
  const lstHours = localSiderealTime(date, lonDeg);
  let haHours = lstHours - raHours;

  if (haHours > 12) haHours -= 24;
  if (haHours < -12) haHours += 24;

  const haRad = toRadians(haHours * 15);
  const decRad = toRadians(decDeg);
  const latRad = toRadians(latDeg);

  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);

  const altRad = Math.asin(sinAlt);
  const altDeg = toDegrees(altRad);

  const cosAz =
    (Math.sin(decRad) - Math.sin(altRad) * Math.sin(latRad)) /
    (Math.cos(altRad) * Math.cos(latRad));

  let azRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  let azDeg = toDegrees(azRad);

  if (Math.sin(haRad) > 0) {
    azDeg = 360 - azDeg;
  }

  return { alt: altDeg, az: azDeg };
}

function projectAltAz(altDeg, azDeg) {
  const r = ((90 - altDeg) / 90) * RADIUS;
  const azRad = toRadians(azDeg);

  const x = CENTER + r * Math.sin(azRad);
  const y = CENTER - r * Math.cos(azRad);

  return { x, y };
}

function eclipticToRaDec(lambdaDeg, betaDeg = 0) {
  const epsilon = toRadians(23.439291);
  const lambda = toRadians(lambdaDeg);
  const beta = toRadians(betaDeg);

  const x = Math.cos(beta) * Math.cos(lambda);
  const y =
    Math.cos(beta) * Math.sin(lambda) * Math.cos(epsilon) -
    Math.sin(beta) * Math.sin(epsilon);
  const z =
    Math.cos(beta) * Math.sin(lambda) * Math.sin(epsilon) +
    Math.sin(beta) * Math.cos(epsilon);

  const ra = normalizeHours(toDegrees(Math.atan2(y, x)) / 15);
  const dec = toDegrees(Math.asin(z));

  return { ra, dec };
}

function buildPathFromPoints(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return '';

  return valid
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

function getPlanetRaDec(body, date, observer) {
  const eq = Equator(body, date, observer, true, true);
  return { ra: eq.ra, dec: eq.dec };
}

function getObjectColor(type) {
  switch (type) {
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

export default function SkyMap({ gallery, setSelectedIndex }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const date = new Date();
  const observer = new Observer(SITE.lat, SITE.lon, 0);

  const mappedObjects = useMemo(() => {
    return gallery
      .map((photo) => {
        let ra = photo.ra;
        let dec = photo.dec;

        if (photo.objectType === 'Lunar') {
          const moonEq = getPlanetRaDec(Body.Moon, date, observer);
          ra = moonEq.ra;
          dec = moonEq.dec;
        }

        if (ra === undefined || dec === undefined) return null;

        const horiz = raDecToAltAz(ra, dec, date, SITE.lat, SITE.lon);
        const point = projectAltAz(horiz.alt, horiz.az);

        return {
          ...photo,
          ra,
          dec,
          alt: horiz.alt,
          az: horiz.az,
          x: point.x,
          y: point.y
        };
      })
      .filter(Boolean);
  }, [gallery]);

  const activeObject = mappedObjects[activeIndex] || mappedObjects[0];

  const catalogObjects = mappedObjects;

  const starPoints = useMemo(() => {
    return STAR_CATALOG.map((star) => {
      const horiz = raDecToAltAz(star.ra, star.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(horiz.alt, horiz.az);

      return {
        ...star,
        alt: horiz.alt,
        az: horiz.az,
        x: point.x,
        y: point.y
      };
    });
  }, []);

  const starLookup = Object.fromEntries(starPoints.map((star) => [star.name, star]));

  const constellationLines = CONSTELLATION_SEGMENTS.map(([a, b]) => {
    const starA = starLookup[a];
    const starB = starLookup[b];
    if (!starA || !starB) return null;

    return `M ${starA.x.toFixed(1)} ${starA.y.toFixed(1)} L ${starB.x.toFixed(1)} ${starB.y.toFixed(1)}`;
  }).filter(Boolean);

  const constellationLabels = CONSTELLATION_LABELS.map((label) => {
    const horiz = raDecToAltAz(label.ra, label.dec, date, SITE.lat, SITE.lon);
    const point = projectAltAz(horiz.alt, horiz.az);

    return {
      ...label,
      x: point.x,
      y: point.y
    };
  });

  const polaris = starLookup['Polaris'];

  const eclipticPath = useMemo(() => {
    const points = [];

    for (let lambda = 0; lambda <= 360; lambda += 3) {
      const eq = eclipticToRaDec(lambda, 0);
      const horiz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      points.push(projectAltAz(horiz.alt, horiz.az));
    }

    return buildPathFromPoints(points);
  }, []);

  const lunarPath = useMemo(() => {
    const points = [];

    for (let hour = 0; hour <= 24; hour += 2) {
      const future = new Date(date.getTime() + hour * 60 * 60 * 1000);
      const moonEq = getPlanetRaDec(Body.Moon, future, observer);
      const horiz = raDecToAltAz(moonEq.ra, moonEq.dec, future, SITE.lat, SITE.lon);
      points.push(projectAltAz(horiz.alt, horiz.az));
    }

    return buildPathFromPoints(points);
  }, []);

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
      const horiz = raDecToAltAz(eq.ra, eq.dec, date, SITE.lat, SITE.lon);
      const point = projectAltAz(horiz.alt, horiz.az);

      return {
        ...item,
        x: point.x,
        y: point.y
      };
    });
  }, []);

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((p) => p.title === photo.title);
    if (realIndex !== -1) {
      setSelectedIndex(realIndex);
    }
  };

  const handlePointerDown = (event) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y
    };
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

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>
        <h1>Celestial Atlas</h1>
        <p className="tagline">
          A live sky map for Eliot, Maine using real right ascension and declination.
          Mission targets, planetary path, lunar path, Polaris, and compass directions are all plotted live.
        </p>
        <a className="atlasBackButton" href="/">
          ← Back to Observatory
        </a>
      </section>

      <section className="atlasLayout realAtlasLayout">
        <div
          className="atlasMap realSkyMap"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className="skyPanLayer"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
          >
            <svg
              className="skySvg"
              viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
              aria-label="Real sky map"
            >
              <defs>
                <radialGradient id="skyGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(74,140,255,.08)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
              </defs>

              <circle cx={CENTER} cy={CENTER} r={RADIUS} className="skyHorizonCircle" />
              <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.66} className="skyAltitudeRing" />
              <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.33} className="skyAltitudeRing" />
              <circle cx={CENTER} cy={CENTER} r={8} className="skyZenithDot" />

              <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS} className="skyAxis" />
              <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER} className="skyAxis" />

              <text x={CENTER} y={CENTER - RADIUS - 20} className="compassLabel">N</text>
              <text x={CENTER + RADIUS + 18} y={CENTER + 6} className="compassLabel">E</text>
              <text x={CENTER} y={CENTER + RADIUS + 30} className="compassLabel">S</text>
              <text x={CENTER - RADIUS - 22} y={CENTER + 6} className="compassLabel">W</text>
              <text x={CENTER + 14} y={CENTER - 10} className="zenithLabel">Zenith</text>

              {eclipticPath && <path d={eclipticPath} className="eclipticPath" />}
              {lunarPath && <path d={lunarPath} className="lunarPath" />}

              {constellationLines.map((pathData, index) => (
                <path key={index} d={pathData} className="constellationSegment" />
              ))}

              {constellationLabels.map((label) => (
                <text
                  key={label.name}
                  x={label.x}
                  y={label.y}
                  className="constellationText"
                >
                  {label.name}
                </text>
              ))}

              {starPoints.map((star) => (
                <g key={star.name}>
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={Math.max(1.5, 4.8 - star.mag)}
                    className={star.name === 'Polaris' ? 'skyStar polarisStar' : 'skyStar'}
                  />
                  {star.name === 'Polaris' && (
                    <text x={star.x + 10} y={star.y - 10} className="polarisLabel">
                      Polaris
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

              {catalogObjects.map((photo, index) => (
                <g key={photo.title}>
                  <circle
                    cx={photo.x}
                    cy={photo.y}
                    r={activeIndex === index ? 26 : 18}
                    className="missionMarkerHalo"
                    style={{ color: getObjectColor(photo.objectType) }}
                  />
                  <button
                    type="button"
                    className={activeIndex === index ? 'svgMarker active' : 'svgMarker'}
                    style={{
                      left: `${photo.x}px`,
                      top: `${photo.y}px`,
                      '--marker-color': getObjectColor(photo.objectType)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => {
                      setActiveIndex(index);
                      openMission(photo);
                    }}
                    aria-label={`Open ${photo.title}`}
                  >
                    {index + 1}
                  </button>
                </g>
              ))}

              <text x={CENTER + 170} y={CENTER - 150} className="pathLabel">
                Planetary Path
              </text>
              <text x={CENTER - 220} y={CENTER + 170} className="pathLabel moonPathLabel">
                Lunar Path
              </text>
            </svg>
          </div>

          <div className="atlasLegend enhancedLegend">
            <span><i className="legendCyan"></i> Planetary Nebula</span>
            <span><i className="legendPurple"></i> Emission Nebula</span>
            <span><i className="legendOrange"></i> Globular Cluster</span>
            <span><i className="legendGold"></i> Double Star</span>
            <span><i className="legendSilver"></i> Lunar</span>
          </div>
        </div>

        <aside className="atlasCatalog">
          <small>Mission Catalog</small>

          {catalogObjects.map((photo, index) => (
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
              <span><b>RA</b>{activeObject.ra.toFixed(4)}h</span>
              <span><b>Dec</b>{activeObject.dec.toFixed(2)}°</span>
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