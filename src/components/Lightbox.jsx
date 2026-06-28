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

      <div className="lightboxContent">
        <img
          className={isZoomed ? "zoomed" : ""}
          src={import.meta.env.BASE_URL + selectedPhoto.image}
          alt={selectedPhoto.title}
          onClick={() => setIsZoomed(!isZoomed)}
        />

        <aside className="lightboxInfo">
          <small className="missionLabel">MISSION REPORT</small>
          <h2>{selectedPhoto.title}</h2>
          <h3>{selectedPhoto.subtitle}</h3>

          <div className="infoGrid">
            <div><strong>Object</strong><span>{selectedPhoto.objectType || selectedPhoto.category}</span></div>
            <div><strong>Constellation</strong><span>{selectedPhoto.constellation || 'Unknown'}</span></div>
            <div><strong>Distance</strong><span>{selectedPhoto.distance || 'Unknown'}</span></div>
            <div><strong>Captured</strong><span>{selectedPhoto.captureDate || selectedPhoto.date}</span></div>
            <div><strong>Exposure</strong><span>{selectedPhoto.exposure || 'Not listed'}</span></div>
            <div><strong>Processing</strong><span>{selectedPhoto.processing || 'Not listed'}</span></div>
          </div>

          <h4>Equipment</h4>
          <p>{selectedPhoto.equipment}</p>

          <h4>Observing Notes</h4>
          <p>{selectedPhoto.notes}</p>

          <h4>Next Goal</h4>
          <p>{selectedPhoto.nextGoal || 'Capture again with improved settings.'}</p>
        </aside>
      </div>
      <div className="filmstrip">
  {gallery.map((photo, index) => (
    <button
      key={photo.title}
      className={index === selectedIndex ? "active" : ""}
      onClick={() => {
        setIsZoomed(false);
        setSelectedIndex(index);
      }}
    >
      <img
        src={import.meta.env.BASE_URL + photo.image}
        alt={photo.title}
      />
      <span>{photo.title}</span>
    </button>
  ))}
</div>
      <button className="lightboxArrow right" onClick={showNextPhoto}>
        <ChevronRight />
      </button>
    </div>
  );
}