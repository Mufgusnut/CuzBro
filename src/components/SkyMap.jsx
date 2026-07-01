import { useState } from 'react';

const constellationPaths = {
  Hercules: '30,18 35,28 42,34 50,28 57,38 48,48 38,44 42,34',
  Cygnus: '63,12 63,28 63,44 55,28 72,28',
  Lyra: '52,15 56,22 61,20 59,29 53,30 52,15',
  Vulpecula: '60,39 68,43 76,46',
  Sagittarius: '64,66 72,78 82,80 88,70 78,72 70,66 64,66',
  Aquila: '48,45 53,52 58,47 53,60 49,55',
  Scorpius: '68,78 74,82 80,86 86,82',
  Lunar: '12,47 22,50 34,54 48,58'
};

const planetPath = '70,10 74,22 78,34 82,48 86,62';
const eclipticPath = '16,67 35,64 55,60 75,55 96,48';
const moonPath = '8,46 20,49 34,53 49,57';

function getConstellationKey(photo) {
  if (photo.objectType === 'Lunar') return 'Lunar';
  return photo.constellation;
}

function getTypeClass(objectType) {
  return `type-${objectType?.replaceAll(' ', '-').toLowerCase()}`;
}

export default function SkyMap({ gallery, setSelectedIndex }) {
  const mapped = gallery.filter(
    (photo) => photo.mapX !== undefined && photo.mapY !== undefined
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [atlasFilter, setAtlasFilter] = useState('All');

  const atlasTypes = ['All', ...new Set(mapped.map((photo) => photo.objectType))];

  const visibleMapped =
    atlasFilter === 'All'
      ? mapped
      : mapped.filter((photo) => photo.objectType === atlasFilter);

  const activePhoto = mapped[activeIndex] || mapped[0];
  const activeConstellation = activePhoto ? getConstellationKey(activePhoto) : null;

  const activatePhoto = (photo) => {
    const index = mapped.findIndex((p) => p.title === photo.title);
    setActiveIndex(index);
  };

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((p) => p.title === photo.title);
    setSelectedIndex(realIndex);
  };

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>
        <h1>Celestial Atlas</h1>

        <p className="tagline">
          An interactive atlas of every celestial object photographed by CuzBro
          Observatory. Select a numbered marker to identify the mission.
        </p>

        <a className="atlasBackButton" href="/#observatory">
          ← Back to Observatory
        </a>
      </section>

      <section className="atlasLayout">
        <div className="atlasFilters">
          {atlasTypes.map((type) => (
            <button
              key={type}
              className={atlasFilter === type ? 'active' : ''}
              onClick={() => {
                setAtlasFilter(type);
                const firstVisible =
                  type === 'All'
                    ? mapped[0]
                    : mapped.find((photo) => photo.objectType === type);

                if (firstVisible) activatePhoto(firstVisible);
              }}
              type="button"
            >
              <span>{type}</span>
              <b>
                {type === 'All'
                  ? mapped.length
                  : mapped.filter((photo) => photo.objectType === type).length}
              </b>
            </button>
          ))}
        </div>

        <div className="atlasMap realSkyMap">
          <div className="atlasStars"></div>
          <div className="atlasMilkyWay"></div>

          <svg className="skyCoordinateGrid" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M10 15 C30 25, 70 25, 90 15" />
            <path d="M8 35 C30 43, 70 43, 92 35" />
            <path d="M6 55 C30 63, 70 63, 94 55" />
            <path d="M8 75 C30 83, 70 83, 92 75" />

            <path d="M18 5 C12 30, 12 70, 18 95" />
            <path d="M36 2 C32 30, 32 70, 36 98" />
            <path d="M54 2 C52 30, 52 70, 54 98" />
            <path d="M72 2 C75 30, 75 70, 72 98" />
            <path d="M90 5 C96 30, 96 70, 90 95" />
          </svg>

          <svg className="constellationLines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {Object.entries(constellationPaths).map(([name, points]) => (
              <polyline
                key={name}
                points={points}
                className={name === activeConstellation ? 'active' : ''}
              />
            ))}
          </svg>

          <svg className="skyPaths" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline className="eclipticPath" points={eclipticPath} />
            <polyline className="planetPath" points={planetPath} />
            <polyline className="moonPath" points={moonPath} />
          </svg>

          <span className="skyPathLabel eclipticLabel">ECLIPTIC</span>
          <span className="skyPathLabel planetLabel">PLANETARY PATH</span>
          <span className="skyPathLabel moonLabel">MOON PATH</span>

          <div className="compassRose">
            <span>N</span>
            <span>E</span>
            <span>S</span>
            <span>W</span>
            <i></i>
          </div>

          {Object.keys(constellationPaths).map((name) => (
            <span
              key={name}
              className={
                name === activeConstellation
                  ? 'constellationLabel active'
                  : 'constellationLabel'
              }
              style={labelPosition(name)}
            >
              {name}
            </span>
          ))}

          <span className="starLabel" style={{ left: '63%', top: '25%' }}>Vega</span>
          <span className="starLabel" style={{ left: '63%', top: '11%' }}>Deneb</span>
          <span className="starLabel" style={{ left: '54%', top: '50%' }}>Altair</span>
          <span className="starLabel" style={{ left: '83%', top: '82%' }}>Antares</span>

          <span className="planetDot jupiter" style={{ left: '73%', top: '21%' }}>Jupiter</span>
          <span className="planetDot saturn" style={{ left: '84%', top: '49%' }}>Saturn</span>
          <span className="planetDot neptune" style={{ left: '80%', top: '36%' }}>Neptune</span>

          {visibleMapped.map((photo) => {
            const index = mapped.findIndex((p) => p.title === photo.title);

            return (
              <button
                key={photo.title}
                className={[
                  'atlasMarker',
                  getTypeClass(photo.objectType),
                  index === activeIndex ? 'active' : ''
                ].join(' ')}
                style={{
                  left: `${photo.mapX}%`,
                  top: `${photo.mapY}%`
                }}
                onMouseEnter={() => activatePhoto(photo)}
                onFocus={() => activatePhoto(photo)}
                onClick={() => openMission(photo)}
                type="button"
                aria-label={`Open ${photo.title} mission report`}
              >
                {index + 1}
              </button>
            );
          })}

          <div className="atlasLegend">
            <span><i className="legendCyan"></i> Planetary Nebula</span>
            <span><i className="legendPurple"></i> Emission Nebula</span>
            <span><i className="legendOrange"></i> Globular Cluster</span>
            <span><i className="legendGold"></i> Double Star</span>
            <span><i className="legendSilver"></i> Lunar</span>
          </div>
        </div>

        <aside className="atlasCatalog">
          <small>Object Catalog</small>

          {visibleMapped.map((photo) => {
            const index = mapped.findIndex((p) => p.title === photo.title);

            return (
              <button
                key={photo.title}
                className={index === activeIndex ? 'catalogItem active' : 'catalogItem'}
                onMouseEnter={() => activatePhoto(photo)}
                onFocus={() => activatePhoto(photo)}
                onClick={() => openMission(photo)}
                type="button"
              >
                <b>{index + 1}</b>
                <span>
                  <strong>{photo.title}</strong>
                  <em>{photo.constellation}</em>
                  <small>{photo.objectType}</small>
                </span>
              </button>
            );
          })}
        </aside>
      </section>

      {activePhoto && (
        <section className="atlasDetail">
          <img
            src={import.meta.env.BASE_URL + activePhoto.image}
            alt={activePhoto.title}
          />

          <div>
            <small>Selected Mission</small>

            <h2>
              <span>{activeIndex + 1}</span>
              {activePhoto.title}
            </h2>

            <h3>{activePhoto.subtitle}</h3>

            <p>{activePhoto.notes}</p>

            <div className="atlasFacts">
              <span><b>Constellation</b>{activePhoto.constellation}</span>
              <span><b>Type</b>{activePhoto.objectType}</span>
              <span><b>Distance</b>{activePhoto.distance}</span>
              <span><b>Captured</b>{activePhoto.captureDate}</span>
            </div>

            <button type="button" onClick={() => openMission(activePhoto)}>
              Open Mission Report →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function labelPosition(name) {
  const positions = {
    Hercules: { left: '35%', top: '20%' },
    Cygnus: { left: '63%', top: '16%' },
    Lyra: { left: '56%', top: '13%' },
    Vulpecula: { left: '70%', top: '38%' },
    Sagittarius: { left: '76%', top: '70%' },
    Aquila: { left: '54%', top: '55%' },
    Scorpius: { left: '80%', top: '78%' },
    Lunar: { left: '18%', top: '43%' }
  };

  return positions[name] || { left: '50%', top: '50%' };
}