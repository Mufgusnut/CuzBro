import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

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
      <div className="missionViewer">

        <div className="missionTopbar">
          <div className="missionBrand">
            <span className="crosshair">⊕</span>
            <strong>MISSION REPORT</strong>
            <span>{String(selectedIndex + 1).padStart(2, '0')} / {String(gallery.length).padStart(2, '0')}</span>
          </div>

          <button className="lightboxClose" onClick={closeLightbox}>
            <X />
          </button>
        </div>

        <button className="lightboxArrow left" onClick={showPreviousPhoto}>
          <ChevronLeft />
        </button>

        <button className="lightboxArrow right" onClick={showNextPhoto}>
          <ChevronRight />
        </button>

        <div className="missionGrid">
          <section className="missionImagePanel">
            <button
              className="zoomHint"
              onClick={() => setIsZoomed(!isZoomed)}
            >
              <Search size={16} />
              Click image to zoom
            </button>

            <img
              className={isZoomed ? 'zoomed' : ''}
              src={import.meta.env.BASE_URL + selectedPhoto.image}
              alt={selectedPhoto.title}
              onClick={() => setIsZoomed(!isZoomed)}
            />

            <p className="imageCaption">{selectedPhoto.title} — {selectedPhoto.subtitle}</p>
          </section>

          <aside className="missionPanel">
            <small>MISSION REPORT</small>
            <h2>{selectedPhoto.title}</h2>
            <h3>{selectedPhoto.subtitle}</h3>

            <div className="missionFacts">
              <div>
                <b>Object Type</b>
                <span>{selectedPhoto.objectType || selectedPhoto.category || 'Astrophotography'}</span>
              </div>

              <div>
                <b>Captured</b>
                <span>{selectedPhoto.captureDate || selectedPhoto.date || 'Unknown'}</span>
              </div>

              <div>
                <b>Constellation</b>
                <span>{selectedPhoto.constellation || 'Unknown'}</span>
              </div>

              <div>
                <b>Exposure</b>
                <span>{selectedPhoto.exposure || 'Not listed'}</span>
              </div>

              <div>
                <b>Distance</b>
                <span>{selectedPhoto.distance || 'Unknown'}</span>
              </div>

              <div>
                <b>Processing</b>
                <span>{selectedPhoto.processing || 'Not listed'}</span>
              </div>
            </div>

            <h4>Equipment</h4>
            <p>{selectedPhoto.equipment}</p>

            <h4>Observing Notes</h4>
            <p>{selectedPhoto.notes}</p>

            <h4>Next Goal</h4>
            <p>{selectedPhoto.nextGoal || 'Capture again with improved settings.'}</p>
          </aside>
        </div>

        <div className="missionFilmstrip">
          <button className="filmNav" onClick={showPreviousPhoto}>
            <ChevronLeft />
          </button>

          <div className="filmItems">
            {gallery.map((photo, index) => (
              <button
                type="button"
                key={photo.title}
                className={index === selectedIndex ? 'filmCard active' : 'filmCard'}
                onClick={() => {
                  setIsZoomed(false);
                  setSelectedIndex(index);
                }}
              >
                <img src={import.meta.env.BASE_URL + photo.image} alt={photo.title} />
                <strong>{photo.title}</strong>
                <span>{photo.subtitle}</span>
              </button>
            ))}
          </div>

          <button className="filmNav" onClick={showNextPhoto}>
            <ChevronRight />
          </button>
        </div>

        <div className="missionFooter">
          <span>Click image to zoom</span>
          <span>ESC to close</span>
          <span>← → to navigate</span>
          <span>Captured from Eliot, ME</span>
        </div>
      </div>
    </div>
  );
}