import { Crosshair } from 'lucide-react';

export default function SkyMap({ gallery, setSelectedIndex }) {
  const mapped = gallery.filter(
    (photo) => photo.mapX !== undefined && photo.mapY !== undefined
  );

  return (
    <div className="skyMapContainer">

      <section className="skyMapHero">
        <p className="eyebrow">MISSION CONTROL</p>

        <h1>Celestial Atlas</h1>

        <p className="tagline">
          An interactive atlas of every celestial object photographed by CuzBro Observatory.
  Click any mission marker to open its Mission Report.
        </p>
      </section>

      <section className="skyMap">

        <div className="skyMapGrid"></div>

        {mapped.map((photo, index) => (
          <button
            key={photo.title}
            className={`skyPoint skyPoint-${photo.objectType
              ?.replaceAll(' ', '-')
              .toLowerCase()}`}
            style={{
              left: `${photo.mapX}%`,
              top: `${photo.mapY}%`
            }}
            onClick={() => setSelectedIndex(index)}
            type="button"
          >
            <Crosshair size={18} />
            <span>{photo.title}</span>
          </button>
        ))}

      </section>

    </div>
  );
}