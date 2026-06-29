import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

export default function Lightbox({
  selectedPhoto,
  gallery,
  selectedIndex,
  setSelectedIndex,
  viewerMode,
  setViewerMode,
  closeLightbox,
  showPreviousPhoto,
  showNextPhoto
}) {
  if (!selectedPhoto) return null;

  const isCinema = viewerMode === "cinema" || viewerMode === "inspect";
  const isInspect = viewerMode === "inspect";

  const handleImageClick = () => {
    if (viewerMode === "report") {
      setViewerMode("cinema");
    } else if (viewerMode === "cinema") {
      setViewerMode("inspect");
    } else {
      setViewerMode("cinema");
    }
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="missionViewer">
        <div className="missionTopbar">
          <div className="missionBrand">
            <span className="crosshair">⊕</span>
            <strong>MISSION REPORT</strong>
            <span>
              {String(selectedIndex + 1).padStart(2, '0')} / {String(gallery.length).padStart(2, '0')}
            </span>
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
          <section className={isCinema ? "missionImagePanel cinemaMode" : "missionImagePanel"}>
            <button className="zoomHint" onClick={handleImageClick}>
              <Search size={16} />
              {viewerMode === "report" && "Enter Cinema Mode"}
              {viewerMode === "cinema" && "Zoom In"}
              {viewerMode === "inspect" && "Return to Cinema View"}
            </button>

            {viewerMode !== "report" && (
              <button
                className="mobileZoomExit"
                onClick={() => setViewerMode("report")}
              >
                Exit Zoom
              </button>
            )}

            <div className={isInspect ? "inspectScroller" : "imageFrame"}>
              <img
                className={isInspect ? "inspectZoom" : ""}
                src={import.meta.env.BASE_URL + selectedPhoto.image}
                alt={selectedPhoto.title}
                onClick={handleImageClick}
              />
            </div>

            <p className="imageCaption">
              {selectedPhoto.title} — {selectedPhoto.subtitle}
            </p>
          </section>

          <aside className={isCinema ? "missionPanel hiddenPanel" : "missionPanel"}>
            <small>MISSION REPORT</small>
            <h2>{selectedPhoto.title}</h2>
            <h3>{selectedPhoto.subtitle}</h3>

            <div className="missionFacts">
              <div><b>Object Type</b><span>{selectedPhoto.objectType || selectedPhoto.category || 'Astrophotography'}</span></div>
              <div><b>Captured</b><span>{selectedPhoto.captureDate || selectedPhoto.date || 'Unknown'}</span></div>
              <div><b>Constellation</b><span>{selectedPhoto.constellation || 'Unknown'}</span></div>
              <div><b>Exposure</b><span>{selectedPhoto.exposure || 'Not listed'}</span></div>
              <div><b>Distance</b><span>{selectedPhoto.distance || 'Unknown'}</span></div>
              <div><b>Processing</b><span>{selectedPhoto.processing || 'Not listed'}</span></div>
            </div>

            <h4>Equipment</h4>
            <p>{selectedPhoto.equipment}</p>

            <h4>Observing Notes</h4>
            <p>{selectedPhoto.notes}</p>

            <h4>Next Goal</h4>
            <p>{selectedPhoto.nextGoal || 'Capture again with improved settings.'}</p>
          </aside>
        </div>

        <div className={isCinema ? "missionFilmstrip hiddenFilmstrip" : "missionFilmstrip"}>
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
                  setViewerMode("report");
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

        <div className={isCinema ? "missionFooter hiddenFilmstrip" : "missionFooter"}>
          <span>Click image for cinema view</span>
          <span>Click again to inspect</span>
          <span>ESC to close</span>
          <span>← → to navigate</span>
        </div>
      </div>
    </div>
  );
}