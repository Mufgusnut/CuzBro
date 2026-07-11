import {
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function getFocusCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 0.5;
}

function FocusedCoverImage({ photo }) {
  const viewportRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const focusX = getFocusCoordinate(photo.replayFinalFocusX);
  const focusY = getFocusCoordinate(photo.replayFinalFocusY);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      setViewport({
        width: element.clientWidth,
        height: element.clientHeight
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const imageStyle = useMemo(() => {
    if (!viewport.width || !viewport.height || !imageSize.width || !imageSize.height) {
      return {
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        objectFit: 'cover'
      };
    }

    // Start with normal cover scaling, then zoom farther when necessary so
    // the selected target can sit at the exact card center without exposing
    // empty space at any image edge. This matters when the selected object is
    // close to the top, bottom, left, or right side of the source image.
    const safeFocusX = clamp(focusX, 0.0001, 0.9999);
    const safeFocusY = clamp(focusY, 0.0001, 0.9999);

    const scale = Math.max(
      viewport.width / imageSize.width,
      viewport.height / imageSize.height,
      viewport.width / (2 * safeFocusX * imageSize.width),
      viewport.width / (2 * (1 - safeFocusX) * imageSize.width),
      viewport.height / (2 * safeFocusY * imageSize.height),
      viewport.height / (2 * (1 - safeFocusY) * imageSize.height)
    );

    const renderedWidth = imageSize.width * scale;
    const renderedHeight = imageSize.height * scale;

    // No clamping is needed: the scale calculation above guarantees that
    // every edge still covers the card when the chosen point is centered.
    const left = viewport.width / 2 - safeFocusX * renderedWidth;
    const top = viewport.height / 2 - safeFocusY * renderedHeight;

    return {
      width: `${renderedWidth}px`,
      height: `${renderedHeight}px`,
      left: `${left}px`,
      top: `${top}px`
    };
  }, [viewport, imageSize, focusX, focusY]);

  return (
    <div ref={viewportRef} className="photoCardImageViewport" aria-hidden="true">
      <div className="photoCardImageZoom">
        <img
          src={getCaptureImageUrl(photo.image)}
          alt=""
          style={imageStyle}
          onLoad={(event) => {
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
            });
          }}
        />
      </div>
    </div>
  );
}

export default function Gallery({
  gallery,
  scroller,
  scroll,
  setSelectedIndex,
  activeFilter,
  setActiveFilter
}) {
  const filters = [
    'All',
    'Galaxy',
    'Planetary Nebula',
    'Emission Nebula',
    'Globular Cluster',
    'Double Star',
    'Lunar'
  ];

  return (
    <>
      <section
        id="gallery"
        className="sectionHeader"
      >
        <h2>✣ Mission Archive</h2>
      </section>

      <div className="galleryFilters">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={
              activeFilter === filter
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveFilter(filter)
            }
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="carouselWrap">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Previous missions"
        >
          <ChevronLeft />
        </button>

        <div
          className="carousel"
          ref={scroller}
        >
          {gallery.map((g, i) => (
            <article
              className="photoCard"
              key={g.id || g.title}
              onClick={() =>
                setSelectedIndex(i)
              }
            >
              <FocusedCoverImage photo={g} />

              <div className="photoCardContent">
                <h3>{g.title}</h3>

                <p>{g.subtitle}</p>

                <small>
                  {g.equipment}
                </small>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Next missions"
        >
          <ChevronRight />
        </button>
      </div>
    </>
  );
}
