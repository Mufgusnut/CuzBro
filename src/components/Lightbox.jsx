import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Lightbox({
  selectedPhoto,
  gallery,
  selectedIndex,
  setSelectedIndex,
  isZoomed,
  setIsZoomed,
  closeLightbox,
  showPreviousPhoto,
  showNextPhoto
}) {
  if (!selectedPhoto) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button className="lightboxClose" onClick={closeLightbox}>×</button>

      <button className="lightboxArrow left" onClick={showPreviousPhoto}>
        <ChevronLeft />
      </button>

      <div className="lightboxShell">
        <div className="lightboxMainImage">
          <img
            className={isZoomed ? 'zoomed' : ''}
            src={import.meta.env.BASE_URL + selectedPhoto.image}
            alt={selectedPhoto.title}
            onClick={() => setIsZoomed(!isZoomed)}
          />
        </div>

        <aside className="lightboxInfo">
          <small className="missionLabel">MISSION REPORT</small>
          <h2>{selectedPhoto.title}</h2>
          <h3>{selectedPhoto.subtitle}</h3>

          <div className="infoGrid">
            <div><strong>Object</strong><span>{selectedPhoto.objectType || selectedPhoto.category}</span></div>
            <div><strong>Constellation</strong><span>{selectedPhoto.constellation || 'Unknown'}</span></div>
            <div><strong>Distance</strong><span>{selectedPhoto.distance || 'Unknown'}</span></div>
            <div><strong>Captured</strong><span>{selectedPhoto.captureDate || selectedPhoto.date}</span></div>
          </div>

          <h4>Equipment</h4>
          <p>{selectedPhoto.equipment}</p>

          <h4>Observing Notes</h4>
          <p>{selectedPhoto.notes}</p>
        </aside>

        <div className="filmstrip">
          {gallery.map((photo, index) => (
            <button
              type="button"
              key={photo.title}
              className={index === selectedIndex ? 'filmstripItem active' : 'filmstripItem'}
              onClick={() => {
                setIsZoomed(false);
                setSelectedIndex(index);
              }}
            >
              <img
                src={import.meta.env.BASE_URL + photo.image}
                alt={photo.title}
              />
            </button>
          ))}
        </div>
      </div>

      <button className="lightboxArrow right" onClick={showNextPhoto}>
        <ChevronRight />
      </button>
    </div>
  );
}