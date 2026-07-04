import { ChevronLeft, ChevronRight } from 'lucide-react';

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
      <section id="gallery" className="sectionHeader">
        <h2>✣ Mission Archive</h2>
      </section>

      <div className="galleryFilters">
        {filters.map((filter) => (
          <button
            key={filter}
            className={activeFilter === filter ? 'active' : ''}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="carouselWrap">
        <button type="button" onClick={() => scroll(-1)} aria-label="Previous missions">
          <ChevronLeft />
        </button>

        <div className="carousel" ref={scroller}>
          {gallery.map((g, i) => (
            <article
              className="photoCard"
              key={g.title}
              onClick={() => setSelectedIndex(i)}
            >
              <img
                src={import.meta.env.BASE_URL + g.image}
                alt={g.title}
              />
              <div>
                <h3>{g.title}</h3>
                <p>{g.subtitle}</p>
                <small>{g.equipment}</small>
              </div>
            </article>
          ))}
        </div>

        <button type="button" onClick={() => scroll(1)} aria-label="Next missions">
          <ChevronRight />
        </button>
      </div>
    </>
  );
}
