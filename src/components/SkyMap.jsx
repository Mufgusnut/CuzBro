import { Crosshair } from 'lucide-react';
import { useState } from 'react';

const constellationPaths = {
  Hercules: '34,26 42,34 50,28 55,38 48,48 38,44 42,34',
  Cygnus: '63,18 63,28 63,40 56,28 70,28',
  Lyra: '52,20 56,25 61,22 59,29 53,30 52,20',
  Vulpecula: '61,39 68,43 75,47',
  Sagittarius: '70,66 78,72 86,70 82,80 72,78 78,72',
  Lunar: '18,56 22,62 27,67'
};

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

  const openMission = (photo) => {
    const realIndex = gallery.findIndex((p) => p.title === photo.title);
    setSelectedIndex(realIndex);
  };

  const activatePhoto = (photo) => {
    const index = mapped.findIndex((p) => p.title === photo.title);
    setActiveIndex(index);
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

        <div className="atlasMap">
          <div className="atlasStars"></div>
          <div className="atlasMilkyWay"></div>

          <svg
            className="constellationLines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {Object.entries(constellationPaths).map(([name, points]) => (
              <polyline
                key={name}
                points={points}
                className={name === activeConstellation ? 'active' : ''}
              />
            ))}
          </svg>

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
    Hercules: { left: '39%', top: '24%' },
    Cygnus: { left: '66%', top: '17%' },
    Lyra: { left: '53%', top: '16%' },
    Vulpecula: { left: '73%', top: '39%' },
    Sagittarius: { left: '80%', top: '63%' },
    Lunar: { left: '20%', top: '52%' }
  };

  return positions[name] || { left: '50%', top: '50%' };
}