import { Crosshair } from 'lucide-react';

export default function SkyMap({ gallery, setSelectedIndex }) {
  const mapped = gallery.filter((photo) => photo.mapX && photo.mapY);

  return (
    <>
      <section className="sectionHeader">
        <h2>✦ Sky Map</h2>
        <span>Where the missions live</span>
      </section>

      <section className="skyMap">
        <div className="skyMapGrid"></div>

        {mapped.map((photo, index) => (
          <button
            key={photo.title}
            className={`skyPoint skyPoint-${photo.objectType?.replaceAll(' ', '-')}`}
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
    </>
  );
}