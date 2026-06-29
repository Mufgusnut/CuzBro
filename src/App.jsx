import SpaceBackground from './components/SpaceBackground.jsx';
import InfoSections from './components/InfoSections.jsx';
import FeaturedCapture from './components/FeaturedCapture.jsx';
import React, { useEffect, useRef, useState } from 'react';
import Hero from './components/Hero.jsx';
import QuickLinks from './components/QuickLinks.jsx';
import Gallery from './components/Gallery.jsx';
import Weather from './components/Weather.jsx';
import Lightbox from './components/Lightbox.jsx';

const locations = [
  { name: 'Eliot, ME', lat: 43.1531, lon: -70.7828 },
  { name: 'Congers, NY', lat: 41.1507, lon: -73.9454 },
  { name: 'New York City, NY', lat: 40.7128, lon: -74.0060 }
];

export default function App() {
  const [gallery, setGallery] = useState([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [weather, setWeather] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [viewerMode, setViewerMode] = useState("report");
  const [scrolled, setScrolled] = useState(false);

  const scroller = useRef(null);

  const filteredGallery =
    activeFilter === "All"
      ? gallery
      : gallery.filter((photo) => photo.objectType === activeFilter);

  const selectedPhoto =
    selectedIndex !== null ? filteredGallery[selectedIndex] : null;

  const closeLightbox = () => {
    setViewerMode("report");
    setSelectedIndex(null);
  };

  const showNextPhoto = () => {
    setViewerMode("report");
    setSelectedIndex((current) => (current + 1) % filteredGallery.length);
  };

  const showPreviousPhoto = () => {
    setViewerMode("report");
    setSelectedIndex((current) => (current - 1 + filteredGallery.length) % filteredGallery.length);
  };

  const scroll = (dir) => {
    scroller.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
  };

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/gallery.json')
      .then((r) => r.json())
      .then(setGallery);
  }, []);

  useEffect(() => {
    locations.forEach(async (loc) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
        const data = await fetch(url).then((r) => r.json());

        setWeather((prev) => ({
          ...prev,
          [loc.name]: data.current
        }));
      } catch (e) {
        setWeather((prev) => ({
          ...prev,
          [loc.name]: null
        }));
      }
    });
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };

    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (selectedIndex === null || filteredGallery.length === 0) return;

      if (event.key === 'Escape') {
        closeLightbox();
      }

      if (event.key === 'ArrowRight') {
        showNextPhoto();
      }

      if (event.key === 'ArrowLeft') {
        showPreviousPhoto();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex, filteredGallery.length]);

  return (
    <>
    <SpaceBackground />

    <Hero
      imageCount={gallery.length}
      scrolled={scrolled}
    />
      
      <main>
        <QuickLinks />

        <Gallery
          gallery={filteredGallery}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          scroller={scroller}
          scroll={scroll}
          setSelectedIndex={setSelectedIndex}
        />

        <Weather locations={locations} weather={weather} />
<InfoSections />
        <FeaturedCapture
          photo={gallery[0]}
          setSelectedIndex={setSelectedIndex}
        />
      </main>

      <Lightbox
        selectedPhoto={selectedPhoto}
        gallery={filteredGallery}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        viewerMode={viewerMode}
        setViewerMode={setViewerMode}
        closeLightbox={closeLightbox}
        showPreviousPhoto={showPreviousPhoto}
        showNextPhoto={showNextPhoto}
      />

      <footer>
        <img src={import.meta.env.BASE_URL + 'assets/cuzbro-logo.png'} />
        <p>Look up. Stay curious.</p>
      </footer>
    </>
  );
}