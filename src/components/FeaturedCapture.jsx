function getCaptureImageUrl(image) {
  if (!image) {
    return '';
  }

  if (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  const cleanPath = image.replace(/^\/+/, '');

  return (
    import.meta.env.BASE_URL +
    cleanPath
  );
}

export default function FeaturedCapture({
  photo,
  setSelectedIndex
}) {
  if (!photo) {
    return null;
  }

  return (
    <section className="featuredCapture">
      <div>
        <small>Featured Capture</small>

        <h2>{photo.title}</h2>

        <p>{photo.subtitle}</p>

        <p>{photo.notes}</p>

        <button
          type="button"
          onClick={setSelectedIndex}
        >
          View Mission Report →
        </button>
      </div>

      <img
        src={getCaptureImageUrl(photo.image)}
        alt={photo.title}
      />
    </section>
  );
}