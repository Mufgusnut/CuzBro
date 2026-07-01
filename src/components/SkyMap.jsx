import { Crosshair } from 'lucide-react';
import { useState } from 'react';

export default function SkyMap({ gallery, setSelectedIndex }) {
  const mapped = gallery.filter(
    (photo) => photo.mapX !== undefined && photo.mapY !== undefined
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = mapped[activeIndex];

  const openMission = () => {
    const realIndex = gallery.findIndex((p) => p.title === activePhoto.title);
    setSelectedIndex(realIndex);
  };

  return (
    <div className="atlasPage">
      <section className="atlasHero">
        <p className="eyebrow">MISSION CONTROL</p>
        <h1>Celestial Atlas</h1>
        <p className="tagline">
          An interactive atlas of every celestial object photographed by CuzBro Observatory.
          Select a numbered marker to identify the mission.
        </p>
      </section>

      <section className="atlasLayout">
        <div className="atlasMap">
          <div className="atlasStars"></div>
          <div className="atlasMilkyWay"></div>

          <svg className="constellationLines" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points="50,25 56,28 63,28 68,43" />
            <polyline points="42,34 47,30 51,36 45,42 42,34" />
            <polyline points="72,62 78,72 83,82" />
            <polyline points="18,56 22,62 28,66" />
          </svg>

          <span className="constellationLabel" style={{ left: '39%', top: '29%' }}>Hercules</span>
          <span className="constellationLabel" style={{ left: '60%', top: '22%' }}>Cygnus</span>
          <span className="constellationLabel" style={{ left: '53%', top: '18%' }}>Lyra</span>
          <span className="constellationLabel" style={{ left: '70%', top: '39%' }}>Vulpecula</span>
          <span className="constellationLabel" style={{ left: '76%', top: '78%' }}>Sagittarius</span>

          {mapped.map((photo, index) => (
            <button
              key={photo.title}
              className={index === activeIndex ? 'atlasMarker active' : 'atlasMarker'}
              style={{
                left: `${photo.mapX}%`,
                top: `${photo.mapY}%`
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => {
                setActiveIndex(index);
                const realIndex = gallery.findIndex((p) => p.title === photo.title);
                setSelectedIndex(realIndex);
              }}
              type="button"
              aria-label={`Open ${photo.title} mission report`}
            >
              {index + 1}
            </button>
          ))}

          <div className="atlasLegend">
            <span><i className="legendOrange"></i> Nebula / Cluster</span>
            <span><i className="legendBlue"></i> Star / Lunar</span>
          </div>
        </div>

        <aside className="atlasCatalog">
          <small>Object Catalog</small>

          {mapped.map((photo, index) => (
            <button
              key={photo.title}
              className={index === activeIndex ? 'catalogItem active' : 'catalogItem'}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => {
                setActiveIndex(index);
                const realIndex = gallery.findIndex((p) => p.title === photo.title);
                setSelectedIndex(realIndex);
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

            <button type="button" onClick={openMission}>
              Open Mission Report →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}