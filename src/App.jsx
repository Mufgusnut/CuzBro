import AdminDashboard from './components/AdminDashboard.jsx';
import AdminCaptainsLog from './components/AdminCaptainsLog.jsx';
import AdminGallery from './components/AdminGallery.jsx';
import AdminEquipment from './components/AdminEquipment.jsx';
import CrewTransfer from './components/CrewTransfer.jsx';
import SystemStatus from './components/SystemStatus.jsx';
import Login from './components/Login.jsx';
import { supabase } from './supabase.js';
import {
  useCrewPresence
} from './lib/presence.js';
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
      <a
        href="/"
        aria-label="CuzBro homepage"
      >
        <img
          src={
            import.meta.env.BASE_URL +
            'assets/cuzbro-logo.png'
          }
          className="logo"
          alt="CuzBro logo"
        />
      </a>

      <nav className="mainNavMenu">
        <a href="/#home">Home</a>
        <a href="/#observatory">Observatory</a>

        <div className="navDropdown">
          <button
            type="button"
            className="navDropdownTrigger"
          >
            Missions <span>⌄</span>
          </button>

          <div className="navDropdownMenu">
            <a href="/#gallery">
              Mission Archive
            </a>

            <a
              href="/captains-log"
              className={
                window.location.pathname ===
                '/captains-log'
                  ? 'active'
                  : ''
              }
            >
              Captain&apos;s Log
            </a>

            <a
              href="/skymap"
              className={
                window.location.pathname ===
                '/skymap'
                  ? 'active'
                  : ''
              }
            >
              Sky Map
            </a>
          </div>
        </div>

        <div className="navDropdown">
          <button
            type="button"
            className="navDropdownTrigger"
          >
            Crew <span>⌄</span>
          </button>

          <div className="navDropdownMenu">
            <a href="/#crew">
              Crew Dossiers
            </a>

            <a
              href="/mission-support"
              className={
                window.location.pathname ===
                '/mission-support'
                  ? 'active'
                  : ''
              }
            >
              Mission Support
            </a>
          </div>
        </div>

        <a
          href="/equipment"
          className={
            window.location.pathname === '/equipment'
              ? 'active'
              : ''
          }
        >
          Gear
        </a>

        <a href="/#about">About</a>
      </nav>
    </header>
  );
}

export default function App() {
  const [gallery, setGallery] = useState([]);

  const [activeFilter, setActiveFilter] =
    useState('All');

  const [weather, setWeather] = useState({});

  const [captainsLog, setCaptainsLog] =
    useState([]);

  const [
    captainsLogStatus,
    setCaptainsLogStatus
  ] = useState('loading');

  const [equipment, setEquipment] = useState([]);

  const [
    equipmentStatus,
    setEquipmentStatus
  ] = useState('loading');

  const [selectedIndex, setSelectedIndex] =
    useState(null);

  const [viewerMode, setViewerMode] =
    useState('report');

  const [scrolled, setScrolled] = useState(false);

  const [session, setSession] = useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [
    isPasswordRecovery,
    setIsPasswordRecovery
  ] = useState(false);

  const scroller = useRef(null);

  const pathname = window.location.pathname;

const searchParams = new URLSearchParams(
  window.location.search
);

const isPasswordResetPage =
  searchParams.get('reset-password') ===
  'true';

  const isAdminCaptainsLogPage =
    pathname === '/admin/captains-log' ||
    pathname === '/admin/captains-log/';

  const isAdminGalleryPage =
    pathname === '/admin/gallery' ||
    pathname === '/admin/gallery/';

  const isAdminEquipmentPage =
    pathname === '/admin/equipment' ||
    pathname === '/admin/equipment/';

  const isAdminTransfersPage =
    pathname === '/admin/transfers' ||
    pathname === '/admin/transfers/';

  const isAdminSystemPage =
    pathname === '/admin/system' ||
    pathname === '/admin/system/';

  const isAdminPage =
    pathname === '/admin' ||
    pathname === '/admin/' ||
    isAdminCaptainsLogPage ||
    isAdminGalleryPage ||
    isAdminEquipmentPage ||
    isAdminTransfersPage ||
    isAdminSystemPage;
useCrewPresence({
  session,
  enabled:
    isAdminPage &&
    Boolean(session),
  pathname
});
  const isSkyMapPage =
    pathname === '/skymap';

  const isMissionSupportPage =
    pathname === '/mission-support';

  const isCaptainsLogPage =
    pathname === '/captains-log';

  const isEquipmentPage =
    pathname === '/equipment';

  const featuredPhoto =
    gallery.find(
      (photo) => photo.isFeatured
    ) || gallery[0];

  const featuredPhotoIndex =
    featuredPhoto
      ? gallery.findIndex(
          (photo) =>
            photo.id === featuredPhoto.id
        )
      : -1;

  const openFeaturedPhoto = () => {
    if (featuredPhotoIndex < 0) {
      return;
    }

    setViewerMode('report');
    setSelectedIndex(featuredPhotoIndex);
  };

  const filteredGallery =
    activeFilter === 'All'
      ? gallery
      : gallery.filter(
          (photo) =>
            photo.objectType === activeFilter
        );

  const lightboxGallery = isSkyMapPage
    ? gallery
    : filteredGallery;

  const selectedPhoto =
    selectedIndex !== null
      ? lightboxGallery[selectedIndex]
      : null;

  const closeLightbox = () => {
    setViewerMode('report');
    setSelectedIndex(null);
  };

  const showNextPhoto = () => {
    if (lightboxGallery.length === 0) {
      return;
    }

    setViewerMode('report');

    setSelectedIndex(
      (current) =>
        (current + 1) %
        lightboxGallery.length
    );
  };

  const showPreviousPhoto = () => {
    if (lightboxGallery.length === 0) {
      return;
    }

    setViewerMode('report');

    setSelectedIndex(
      (current) =>
        (current -
          1 +
          lightboxGallery.length) %
        lightboxGallery.length
    );
  };

  const scroll = (dir) => {
    scroller.current?.scrollBy({
      left: dir * 360,
      behavior: 'smooth'
    });
  };

  async function handleLogout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        'Logout failed:',
        error
      );

      return;
    }

    setSession(null);
    setIsPasswordRecovery(false);
  }

  useEffect(() => {
    let recoveryDetected = false;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === 'PASSWORD_RECOVERY') {
          recoveryDetected = true;

          setIsPasswordRecovery(true);
          setSession(newSession);
          setAuthLoading(false);

          return;
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setIsPasswordRecovery(false);
          setAuthLoading(false);

          return;
        }

        if (!recoveryDetected) {
          setSession(newSession);
          setAuthLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(
      ({ data }) => {
        if (!recoveryDetected) {
          setSession(data.session);
          setAuthLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadGallery() {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('sort_order', {
          ascending: true
        });

      if (error) {
        console.error(
          'Gallery request failed:',
          error
        );

        setGallery([]);

        return;
      }

      const captures = (data || []).map(
        (capture) => ({
          id: capture.id,
          title: capture.title,
          subtitle: capture.subtitle,
          category: capture.category,
          objectType: capture.object_type,
          constellation: capture.constellation,
          distance: capture.distance,
          captureDate: capture.capture_date,
          exposure: capture.exposure,
          processing: capture.processing,
          equipment: capture.equipment,
          notes: capture.notes,
          nextGoal: capture.next_goal,
          image: capture.image,
storagePath: capture.storage_path,

masterFileUrl:
  capture.master_file_url,

masterStoragePath:
  capture.master_storage_path,

masterFileName:
  capture.master_file_name,

masterFileSize:
  capture.master_file_size,

ra: capture.ra,
dec: capture.dec,
sortOrder: capture.sort_order,
isFeatured: capture.is_featured
        })
      );

      setGallery(captures);
    }

    loadGallery();
  }, []);

  useEffect(() => {
    async function loadEquipment() {
      setEquipmentStatus('loading');

      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('sort_order', {
          ascending: true
        });

      if (error) {
        console.error(
          'Equipment request failed:',
          error
        );

        setEquipment([]);
        setEquipmentStatus('error');

        return;
      }

      const items = (data || []).map(
        (item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          type: item.type,
          role: item.role,
          status: item.status,
          icon: item.icon,
          summary: item.summary,
          facts: item.facts || [],
          bestFor: item.best_for || [],
          fieldNote: item.field_note || '',
          sortOrder: item.sort_order
        })
      );

      setEquipment(items);
      setEquipmentStatus('ready');
    }

    loadEquipment();
  }, []);

  useEffect(() => {
    async function loadCaptainsLog() {
      setCaptainsLogStatus('loading');

      const { data, error } = await supabase
        .from('captains_log')
        .select('*')
        .order('date', {
          ascending: false
        });

      if (error) {
        console.error(error);

        setCaptainsLog([]);
        setCaptainsLogStatus('error');

        return;
      }

      const entries = (data || []).map(
        (entry) => ({
          id: entry.id,
          date: entry.date,
          mission: entry.mission,
          location: entry.location,
          targets: entry.targets || [],
          equipment: entry.equipment || [],
          conditions: entry.conditions || {},
          summary: entry.summary || '',
          notes: entry.notes || '',
          worked: entry.worked || [],
          improve: entry.improve || [],
          nextMission:
            entry.next_mission || '',
          targetNotes:
            entry.target_notes || {}
        })
      );

      setCaptainsLog(entries);
      setCaptainsLogStatus('ready');
    }

    loadCaptainsLog();
  }, []);

  useEffect(() => {
    locations.forEach(async (loc) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${loc.lat}` +
          `&longitude=${loc.lon}` +
          `&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m` +
          `&temperature_unit=fahrenheit` +
          `&wind_speed_unit=mph` +
          `&timezone=auto`;

        const data = await fetch(url).then(
          (response) => response.json()
        );

        setWeather(
          (previousWeather) => ({
            ...previousWeather,
            [loc.name]: data.current
          })
        );
      } catch (error) {
        console.error(
          `Weather request failed for ${loc.name}:`,
          error
        );

        setWeather(
          (previousWeather) => ({
            ...previousWeather,
            [loc.name]: null
          })
        );
      }
    });
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };

    window.addEventListener(
      'scroll',
      onScroll
    );

    return () => {
      window.removeEventListener(
        'scroll',
        onScroll
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        selectedIndex === null ||
        lightboxGallery.length === 0
      ) {
        return;
      }

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

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    selectedIndex,
    lightboxGallery.length
  ]);

  /*
   * Password recovery takes priority.
   * Recovery links must be allowed to show the
   * password reset UI even outside /admin.
   */
  if (
  isPasswordRecovery ||
  isPasswordResetPage
) {
  return <Login forcePasswordReset />;
}

  /*
   * Only admin pages require authentication.
   */
  if (isAdminPage) {
    if (authLoading) {
      return null;
    }

    if (!session) {
      return <Login />;
    }

    if (isAdminCaptainsLogPage) {
      return <AdminCaptainsLog />;
    }

    if (isAdminGalleryPage) {
      return <AdminGallery />;
    }

    if (isAdminEquipmentPage) {
      return <AdminEquipment />;
    }

    if (isAdminTransfersPage) {
      return <CrewTransfer />;
    }

    if (isAdminSystemPage) {
      return (
        <SystemStatus
          session={session}
        />
      );
    }

    return (
      <AdminDashboard
        session={session}
        onLogout={handleLogout}
      />
    );
  }

  /*
   * Everything below this point is public.
   */
  return (
    <>
      <SpaceBackground />

      {isSkyMapPage ||
      isMissionSupportPage ||
      isCaptainsLogPage ||
      isEquipmentPage ? (
        <PageNav scrolled={scrolled} />
      ) : (
        <Hero
          imageCount={gallery.length}
          scrolled={scrolled}
          featuredPhoto={featuredPhoto}
          setSelectedIndex={openFeaturedPhoto}
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
            setSelectedIndex={
              setSelectedIndex
            }
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

            <Weather
              locations={locations}
              weather={weather}
            />

            <Gallery
              gallery={filteredGallery}
              activeFilter={activeFilter}
              setActiveFilter={
                setActiveFilter
              }
              scroller={scroller}
              scroll={scroll}
              setSelectedIndex={
                setSelectedIndex
              }
            />

            <InfoSections />

            <FeaturedCapture
              photo={featuredPhoto}
              setSelectedIndex={
                openFeaturedPhoto
              }
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
        <a
          href="/"
          aria-label="CuzBro homepage"
        >
          <img
            src={
              import.meta.env.BASE_URL +
              'assets/cuzbro-logo.png'
            }
            alt="CuzBro logo"
          />
        </a>

        <p>Look up. Stay curious.</p>
      </footer>
    </>
  );
}