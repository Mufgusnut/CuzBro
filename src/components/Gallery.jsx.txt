import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Gallery({ gallery, scroller, scroll, setSelectedIndex }) {
  return (
    <>
      <section id="gallery" className="sectionHeader">
        <h2>✣ Featured Gallery</h2>
        <a>View all galleries →</a>
      </section>

      <div className="carouselWrap">
        <button onClick={() => scroll(-1)}>
          <ChevronLeft />
        </button>

        <div className="carousel" ref={scroller}>
          {gallery.map((g, i) => (
            <article
              className="photoCard"
              key={g.title}
              onClick={() => setSelectedIndex(i)}
            >
              <img src={import.meta.env.BASE_URL + g.image} />
              <div>
                <h3>{g.title}</h3>
                <p>{g.subtitle}</p>
                <small>{g.equipment}</small>
              </div>
            </article>
          ))}
        </div>

        <button onClick={() => scroll(1)}>
          <ChevronRight />
        </button>
      </div>
    </>
  );
}