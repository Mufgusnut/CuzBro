import SkyMap from './components/SkyMap.jsx';
import SpaceBackground from './components/SpaceBackground.jsx';
import InfoSections from './components/InfoSections.jsx';
import MissionSupport from './components/MissionSupport.jsx';
import CaptainsLog from './components/CaptainsLog.jsx';
import EquipmentLocker from './components/EquipmentLocker.jsx';
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

function PageNav({ scrolled }) {
  return (
    <header className={scrolled ? 'nav navSmall' : 'nav'}>
      <img
        src={import.meta.env.BASE_URL + 'assets/cuzbro-logo.png'}
        className="logo"
        alt="CuzBro logo"
      />

      <nav className="mainNavMenu">
        <a href="/#home">Home</a>
        <a href="/#observatory">Observatory</a>

        <div className="navDropdown">
          <button type="button" className="navDropdownTrigger">
            Missions <span>⌄</span>
          </button>
          <div className="navDropdownMenu">
            <a href="/#gallery">Mission Archive</a>
            <a href="/captains-log" className={window.location.pathname === '/captains-log' ? 'active' : ''}>Captain&apos;s Log</a>
            <a href="/skymap" className={window.location.pathname === '/skymap' ? 'active' : ''}>Sky Map</a>
          </div>
        </div>

        <div className="navDropdown">
          <button type="button" className="navDropdownTrigger">
            Crew <span>⌄</span>
          </button>
          <div className="navDropdownMenu">
            <a href="/#crew">Crew Dossiers</a>
            <a href="/mission-support" className={window.location.pathname === '/mission-support' ? 'active' : ''}>Mission Support</a>
          </div>
        </div>

        <a href="/equipment" className={window.location.pathname === '/equipment' ? 'active' : ''}>Gear</a>
        <a href="/#about">About</a>
      </nav>
    </header>
  );
}

export default function App() {
  const [gallery, setGallery] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [weather, setWeather] = useState({});
  const [captainsLog, setCaptainsLog] = useState([]);
  const [captainsLogStatus, setCaptainsLogStatus] = useState('loading');
  const [equipment, setEquipment] = useState([]);
  const [equipmentStatus, setEquipmentStatus] = useState('loading');
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [viewerMode, setViewerMode] = useState('report');
  const [scrolled, setScrolled] = useState(false);

  const scroller = useRef(null);
  const isSkyMapPage = window.location.pathname === '/skymap';
  const isMissionSupportPage = window.location.pathname === '/mission-support';
  const isCaptainsLogPage = window.location.pathname === '/captains-log';
  const isEquipmentPage = window.location.pathname === '/equipment';

  const filteredGallery =
    activeFilter === 'All'
      ? gallery
      : gallery.filter((photo) => photo.objectType === activeFilter);

  const lightboxGallery = isSkyMapPage ? gallery : filteredGallery;

  const selectedPhoto =
    selectedIndex !== null ? lightboxGallery[selectedIndex] : null;

  const closeLightbox = () => {
    setViewerMode('report');
    setSelectedIndex(null);
  };

  const showNextPhoto = () => {
    if (lightboxGallery.length === 0) return;
    setViewerMode('report');
    setSelectedIndex((current) => (current + 1) % lightboxGallery.length);
  };

  const showPreviousPhoto = () => {
    if (lightboxGallery.length === 0) return;
    setViewerMode('report');
    setSelectedIndex(
      (current) => (current - 1 + lightboxGallery.length) % lightboxGallery.length
    );
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
    fetch(import.meta.env.BASE_URL + 'data/equipment.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Equipment request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((items) => {
        setEquipment(items);
        setEquipmentStatus('ready');
      })
      .catch((error) => {
        console.error(error);
        setEquipment([]);
        setEquipmentStatus('error');
      });
  }, []);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/captains-log.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Captain's Log request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((entries) => {
        const sortedEntries = [...entries].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        setCaptainsLog(sortedEntries);
        setCaptainsLogStatus('ready');
      })
      .catch((error) => {
        console.error(error);
        setCaptainsLog([]);
        setCaptainsLogStatus('error');
      });
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

    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (selectedIndex === null || lightboxGallery.length === 0) return;

      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowRight') showNextPhoto();
      if (event.key === 'ArrowLeft') showPreviousPhoto();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, lightboxGallery.length]);

  return (
    <>
      <SpaceBackground />

      {isSkyMapPage || isMissionSupportPage || isCaptainsLogPage || isEquipmentPage ? (
        <PageNav scrolled={scrolled} />
      ) : (
        <Hero
          imageCount={gallery.length}
          scrolled={scrolled}
          featuredPhoto={gallery[0]}
          setSelectedIndex={setSelectedIndex}
          weather={weather['Eliot, ME']}
        />
      )}

      <main
        className={
          isSkyMapPage
            ? 'skyMapPage'
            : isMissionSupportPage
              ? 'missionSupportPage'
              : isCaptainsLogPage
                ? 'captainsLogPage'
                : isEquipmentPage
                  ? 'equipmentLockerPage'
                  : ''
        }
      >
        {isSkyMapPage ? (
          <SkyMap
            gallery={gallery}
            captainsLog={captainsLog}
            equipment={equipment}
            setSelectedIndex={setSelectedIndex}
          />
        ) : isMissionSupportPage ? (
          <MissionSupport />
        ) : isCaptainsLogPage ? (
          <CaptainsLog
            entries={captainsLog}
            status={captainsLogStatus}
          />
        ) : isEquipmentPage ? (
          <EquipmentLocker
            equipment={equipment}
            status={equipmentStatus}
          />
        ) : (
          <>
            <QuickLinks />

            <Weather locations={locations} weather={weather} />

            <Gallery
              gallery={filteredGallery}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              scroller={scroller}
              scroll={scroll}
              setSelectedIndex={setSelectedIndex}
            />

            <InfoSections />

            <FeaturedCapture
              photo={gallery[0]}
              setSelectedIndex={setSelectedIndex}
            />
          </>
        )}
      </main>

      <Lightbox
        selectedPhoto={selectedPhoto}
        gallery={lightboxGallery}
        captainsLog={captainsLog}
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