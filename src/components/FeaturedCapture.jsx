export default function FeaturedCapture({ photo, setSelectedIndex }) {
  if (!photo) return null;

  return (
    <section className="featuredCapture">
      <div>
        <small>Featured Capture</small>
        <h2>{photo.title}</h2>
        <p>{photo.subtitle}</p>
        <p>{photo.notes}</p>

        <button onClick={() => setSelectedIndex(0)}>
          View Mission Report →
        </button>
      </div>

      <img
        src={import.meta.env.BASE_URL + photo.image}
        alt={photo.title}
      />
    </section>
  );
}