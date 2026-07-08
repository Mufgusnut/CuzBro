import AdminDashboard from './components/AdminDashboard.jsx';
import AdminCaptainsLog from './components/AdminCaptainsLog.jsx';
import AdminGallery from './components/AdminGallery.jsx';
import AdminEquipment from './components/AdminEquipment.jsx';
import CrewTransfer from './components/CrewTransfer.jsx';
import CommsTerminal from './components/CommsTerminal.jsx';
import OperationControl from './components/OperationControl.jsx';
import IncidentCommand from './components/IncidentCommand.jsx';
import CrewTasking from './components/CrewTasking.jsx';
import WatchFloor from './components/WatchFloor.jsx';
import SystemStatus from './components/SystemStatus.jsx';
import StorageControl from './components/StorageControl.jsx';
import BlackBox from './components/BlackBox.jsx';
import DeploymentControl from './components/DeploymentControl.jsx';
import AdminCommandPalette from './components/AdminCommandPalette.jsx';
import EasterEggs from './components/EasterEggs.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import Login from './components/Login.jsx';
import { supabase } from './supabase.js';
import { LogOut } from 'lucide-react';
import { getCrewMember } from './lib/crew.js';
import {
  useCrewPresence
} from './lib/presence.js';
import {
  formatIncidentCode,
  useActiveIncidents
} from './lib/incidents.js';
import SkyMap from './components/SkyMap.jsx';
import SpaceBackground from './components/SpaceBackground.jsx';
import InfoSections from './components/InfoSections.jsx';
import MissionSupport from './components/MissionSupport.jsx';
import CaptainsLog from './components/CaptainsLog.jsx';
import EquipmentLocker from './components/EquipmentLocker.jsx';
import FeaturedCapture from './components/FeaturedCapture.jsx';
import MissionTimeline from './components/MissionTimeline.jsx';
import React, {
  useEffect,
  useRef,
  useState
} from 'react';
import Hero from './components/Hero.jsx';
import QuickLinks from './components/QuickLinks.jsx';
import Gallery from './components/Gallery.jsx';
import Weather from './components/Weather.jsx';
import Lightbox from './components/Lightbox.jsx';

const locations = [
  {
    name: 'Eliot, ME',
    lat: 43.1531,
    lon: -70.7828
  },
  {
    name: 'Congers, NY',
    lat: 41.1507,
    lon: -73.9454
  },
  {
    name: 'New York City, NY',
    lat: 40.7128,
    lon: -74.0060
  }
];

function isPrioritySoundEnabled(userId) {
  return localStorage.getItem(
    `cuzbro-comms-sound-${userId || 'crew'}`
  ) !== 'off';
}

function playPrioritySignal(kind = 'PING', userId) {
  if (!isPrioritySoundEnabled(userId)) {
    return;
  }

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const frequencies =
      kind === 'RED_ALERT'
        ? [520, 360, 520]
        : [740, 1040];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.16;
      const end = start + 0.11;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
    });

    window.setTimeout(() => {
      context.close().catch(() => {});
    }, 1200);
  } catch (audioError) {
    console.debug('Priority signal audio unavailable:', audioError);
  }
}

function PageNav({ scrolled }) {
  return (
    <header
      className={
        scrolled
          ? 'nav navSmall'
          : 'nav'
      }
    >
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
        <a href="/#home">
          Home
        </a>

        <a href="/#observatory">
          Observatory
        </a>

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
            window.location.pathname ===
            '/equipment'
              ? 'active'
              : ''
          }
        >
          Gear
        </a>

        <a href="/#about">
          About
        </a>
      </nav>

      <ThemeToggle />
    </header>
  );
}

function AdminTopNav({
  scrolled,
  session,
  onLogout
}) {
  const crew = getCrewMember(
    session?.user?.email
  );

  const pathname =
    window.location.pathname;

  const isActive = (paths) =>
    paths.some(
      (path) =>
        pathname === path ||
        pathname === `${path}/`
    );

  return (
    <header
      className={
        scrolled
          ? 'admin-top-nav admin-top-nav-small'
          : 'admin-top-nav'
      }
    >
      <a
        href="/admin"
        className="admin-top-brand"
        aria-label="CuzBro admin home"
      >
        <img
          src={
            import.meta.env.BASE_URL +
            'assets/cuzbro-logo.png'
          }
          alt="CuzBro logo"
        />

        <span>
          <strong>Admin</strong>
          <em>Mission Control</em>
        </span>
      </a>

      <nav className="admin-top-menu">
        <a
          href="/admin"
          className={
            isActive(['/admin'])
              ? 'active'
              : ''
          }
        >
          Admin Home
        </a>

        <a
          href="/admin#live-systems"
          className={
            isActive([
              '/admin/system',
              '/admin/comms',
              '/admin/watch',
              '/admin/black-box',
              '/admin/deployments'
            ])
              ? 'active'
              : ''
          }
        >
          Live Systems
        </a>

        <a
          href="/admin#observatory-tools"
          className={
            isActive([
              '/admin/gallery',
              '/admin/captains-log',
              '/admin/equipment',
              '/admin/storage',
              '/admin/transfers',
              '/admin/operation',
              '/admin/incidents',
              '/admin/tasks'
            ])
              ? 'active'
              : ''
          }
        >
          Observatory Tools
        </a>

        <div className="admin-top-dropdown">
          <button type="button">
            Admin Links <span>⌄</span>
          </button>

          <div className="admin-top-dropdown-menu">
            <a
              href="https://dns.cuzbro.net"
              target="_blank"
              rel="noopener noreferrer"
            >
              DNS Portal
            </a>
          </div>
        </div>
      </nav>

      <div className="admin-top-controls">
        <ThemeToggle />

        <div className="admin-top-user">
        <div className="admin-top-auth">
          <span>CREW AUTHENTICATED</span>
          <strong>{crew.callSign}</strong>
          <em>{crew.role}</em>
        </div>

        <button
          type="button"
          onClick={onLogout}
        >
          <LogOut size={16} />
          Log Out
        </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [gallery, setGallery] =
    useState([]);

  const [
    activeFilter,
    setActiveFilter
  ] = useState('All');

  const [weather, setWeather] =
    useState({});

  const [
    captainsLog,
    setCaptainsLog
  ] = useState([]);

  const [
    captainsLogStatus,
    setCaptainsLogStatus
  ] = useState('loading');

  const [equipment, setEquipment] =
    useState([]);

  const [
    equipmentStatus,
    setEquipmentStatus
  ] = useState('loading');

  const [
    selectedIndex,
    setSelectedIndex
  ] = useState(null);

  const [
    viewerMode,
    setViewerMode
  ] = useState('report');

  const [scrolled, setScrolled] =
    useState(false);

  const [session, setSession] =
    useState(null);

  const [hasUnreadComms, setHasUnreadComms] =
    useState(false);

  const [prioritySignal, setPrioritySignal] =
    useState(null);


  const [
    authLoading,
    setAuthLoading
  ] = useState(true);

  const [
    isPasswordRecovery,
    setIsPasswordRecovery
  ] = useState(false);

  const scroller = useRef(null);

  const pathname =
    window.location.pathname;

  const searchParams =
    new URLSearchParams(
      window.location.search
    );

  const isPasswordResetPage =
    searchParams.get(
      'reset-password'
    ) === 'true';

  const isAdminCaptainsLogPage =
    pathname ===
      '/admin/captains-log' ||
    pathname ===
      '/admin/captains-log/';

  const isAdminGalleryPage =
    pathname === '/admin/gallery' ||
    pathname === '/admin/gallery/';

  const isAdminEquipmentPage =
    pathname ===
      '/admin/equipment' ||
    pathname ===
      '/admin/equipment/';

  const isAdminTransfersPage =
    pathname ===
      '/admin/transfers' ||
    pathname ===
      '/admin/transfers/';

  const isAdminCommsPage =
    pathname === '/admin/comms' ||
    pathname === '/admin/comms/';

  const isAdminOperationPage =
    pathname === '/admin/operation' ||
    pathname === '/admin/operation/';

  const isAdminIncidentsPage =
    pathname === '/admin/incidents' ||
    pathname === '/admin/incidents/';

  const isAdminTasksPage =
    pathname === '/admin/tasks' ||
    pathname === '/admin/tasks/';

  const isAdminWatchPage =
    pathname === '/admin/watch' ||
    pathname === '/admin/watch/';

  const isAdminSystemPage =
    pathname === '/admin/system' ||
    pathname === '/admin/system/';

  const isAdminStoragePage =
    pathname === '/admin/storage' ||
    pathname === '/admin/storage/';

  const isAdminBlackBoxPage =
    pathname === '/admin/black-box' ||
    pathname === '/admin/black-box/';

  const isAdminDeploymentsPage =
    pathname === '/admin/deployments' ||
    pathname === '/admin/deployments/';

  const isAdminPage =
    pathname === '/admin' ||
    pathname === '/admin/' ||
    isAdminCaptainsLogPage ||
    isAdminGalleryPage ||
    isAdminEquipmentPage ||
    isAdminTransfersPage ||
    isAdminCommsPage ||
    isAdminOperationPage ||
    isAdminIncidentsPage ||
    isAdminTasksPage ||
    isAdminWatchPage ||
    isAdminSystemPage ||
    isAdminStoragePage ||
    isAdminBlackBoxPage ||
    isAdminDeploymentsPage;

  useCrewPresence({
    session,

    enabled:
      isAdminPage &&
      Boolean(session),

    pathname
  });

  const {
    activeIncidents
  } = useActiveIncidents(
    Boolean(session) && isAdminPage
  );

  useEffect(() => {
    if (
      !isAdminPage ||
      !session?.user?.id
    ) {
      setHasUnreadComms(false);
      return undefined;
    }

    let active = true;
    let latestIncomingAt = null;
    let readChannel = null;
    let unreadChannel = null;

    async function loadLatestIncomingComm() {
      const {
        data,
        error: unreadError
      } = await supabase
        .from('crew_comms')
        .select('id, user_id, created_at')
        .neq('user_id', session.user.id)
        .order('created_at', {
          ascending: false
        })
        .limit(1)
        .maybeSingle();

      if (unreadError) {
        console.error(
          'Comms unread check failed:',
          unreadError
        );
        return null;
      }

      latestIncomingAt = data?.created_at || null;
      return data;
    }

    async function loadReadReceipt() {
      const {
        data,
        error: receiptError
      } = await supabase
        .from('crew_comms_reads')
        .select('last_seen_at')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (receiptError) {
        console.error(
          'Comms read receipt check failed:',
          receiptError
        );
        return null;
      }

      return data;
    }

    async function refreshUnreadState() {
      const [latestIncoming, receipt] =
        await Promise.all([
          loadLatestIncomingComm(),
          loadReadReceipt()
        ]);

      if (!active) {
        return;
      }

      if (!latestIncoming) {
        setHasUnreadComms(false);
        return;
      }

      const lastSeenAt = receipt?.last_seen_at;

      setHasUnreadComms(
        !lastSeenAt ||
        new Date(latestIncoming.created_at) >
          new Date(lastSeenAt)
      );
    }

    async function markCommsSeen() {
      if (
        !isAdminCommsPage ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      const latestIncoming =
        await loadLatestIncomingComm();

      if (!active) {
        return;
      }

      const seenAt =
        latestIncoming?.created_at ||
        new Date().toISOString();

      const {
        error: receiptError
      } = await supabase
        .from('crew_comms_reads')
        .upsert(
          {
            user_id: session.user.id,
            crew_email:
              session.user.email || '',
            last_seen_at: seenAt,
            updated_at:
              new Date().toISOString()
          },
          {
            onConflict: 'user_id'
          }
        );

      if (receiptError) {
        console.error(
          'Comms read receipt update failed:',
          receiptError
        );
        return;
      }

      setHasUnreadComms(false);
    }

    refreshUnreadState().then(() => {
      markCommsSeen();
    });

    function handleVisibilityChange() {
      if (
        document.visibilityState === 'visible'
      ) {
        markCommsSeen();
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    unreadChannel = supabase
      .channel(
        `cuzbro-comms-unread-${session.user.id}`
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crew_comms'
        },
        (payload) => {
          if (
            payload.new?.user_id ===
            session.user.id
          ) {
            return;
          }

          latestIncomingAt =
            payload.new?.created_at || null;

          if (
            isAdminCommsPage &&
            document.visibilityState === 'visible'
          ) {
            markCommsSeen();
            return;
          }

          setHasUnreadComms(true);
        }
      )
      .subscribe();

    readChannel = supabase
      .channel(
        `cuzbro-comms-reads-${session.user.id}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_comms_reads',
          filter:
            `user_id=eq.${session.user.id}`
        },
        (payload) => {
          const receipt =
            payload.new || payload.old;

          if (!latestIncomingAt) {
            setHasUnreadComms(false);
            return;
          }

          const lastSeenAt =
            receipt?.last_seen_at;

          setHasUnreadComms(
            !lastSeenAt ||
            new Date(latestIncomingAt) >
              new Date(lastSeenAt)
          );
        }
      )
      .subscribe();

    return () => {
      active = false;

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );

      if (unreadChannel) {
        supabase.removeChannel(
          unreadChannel
        );
      }

      if (readChannel) {
        supabase.removeChannel(
          readChannel
        );
      }
    };
  }, [
    isAdminPage,
    isAdminCommsPage,
    session?.user?.id,
    session?.user?.email
  ]);

  useEffect(() => {
    if (
      !isAdminPage ||
      !session?.user?.email
    ) {
      setPrioritySignal(null);
      return undefined;
    }

    const ownEmail = String(session.user.email)
      .trim()
      .toLowerCase();

    let active = true;

    async function loadPendingSignals() {
      const { data, error: signalError } = await supabase
        .from('crew_pings')
        .select(
          'id, sender_name, recipient_email, kind, created_at, acknowledged_at'
        )
        .eq('recipient_email', ownEmail)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (signalError) {
        console.error('Priority signal check failed:', signalError);
        return;
      }

      if (active && data) {
        setPrioritySignal(data);
      }
    }

    loadPendingSignals();

    const signalChannel = supabase
      .channel(`cuzbro-priority-signals-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crew_pings'
        },
        (payload) => {
          const signal = payload.new;

          if (
            String(signal.recipient_email || '').toLowerCase() !== ownEmail
          ) {
            return;
          }

          setPrioritySignal(signal);
          setHasUnreadComms(true);
          playPrioritySignal(
            signal.kind,
            session.user.id
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crew_pings'
        },
        (payload) => {
          const signal = payload.new;

          if (
            String(signal.recipient_email || '').toLowerCase() !== ownEmail ||
            !signal.acknowledged_at
          ) {
            return;
          }

          setPrioritySignal((current) => {
            if (current?.id !== signal.id) {
              return current;
            }

            return null;
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(signalChannel);
    };
  }, [
    isAdminPage,
    session?.user?.id,
    session?.user?.email
  ]);


  useEffect(() => {
    if (!isAdminPage) {
      return undefined;
    }

    const normalTitle = 'CuzBro';
    if (!prioritySignal && !hasUnreadComms) {
      document.title = normalTitle;
      return undefined;
    }

    const alertTitle = prioritySignal
      ? prioritySignal.kind === 'RED_ALERT'
        ? '⚠ RED ALERT · CUZBRO'
        : `⚡ PING FROM ${prioritySignal.sender_name} · CUZBRO`
      : '● NEW COMMS · CUZBRO';

    let showAlert = true;
    document.title = alertTitle;

    const intervalId = window.setInterval(
      () => {
        showAlert = !showAlert;
        document.title = showAlert
          ? alertTitle
          : normalTitle;
      },
      prioritySignal ? 350 : 650
    );

    return () => {
      window.clearInterval(intervalId);
      document.title = normalTitle;
    };
  }, [
    hasUnreadComms,
    isAdminPage,
    prioritySignal,
  ]);

  async function acknowledgePrioritySignals() {
    const ownEmail = String(session?.user?.email || '')
      .trim()
      .toLowerCase();

    if (!ownEmail) {
      return;
    }

    const { error: acknowledgeError } = await supabase
      .from('crew_pings')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('recipient_email', ownEmail)
      .is('acknowledged_at', null);

    if (acknowledgeError) {
      console.error(
        'Priority signal acknowledgement failed:',
        acknowledgeError
      );
    }

    setPrioritySignal(null);
  }

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
            photo.id ===
            featuredPhoto.id
        )
      : -1;

  const openTimelineMission = (photoId) => {
    const missionIndex = gallery.findIndex(
      (photo) => photo.id === photoId
    );

    if (missionIndex < 0) {
      return;
    }

    setActiveFilter('All');
    setViewerMode('report');
    setSelectedIndex(missionIndex);
  };

  const openFeaturedPhoto = () => {
    if (featuredPhotoIndex < 0) {
      return;
    }

    setViewerMode('report');

    setSelectedIndex(
      featuredPhotoIndex
    );
  };

  const filteredGallery =
    activeFilter === 'All'
      ? gallery
      : gallery.filter(
          (photo) =>
            photo.objectType ===
            activeFilter
        );

  const lightboxGallery =
    isSkyMapPage
      ? gallery
      : filteredGallery;

  const selectedPhoto =
    selectedIndex !== null
      ? lightboxGallery[
          selectedIndex
        ]
      : null;

  const closeLightbox = () => {
    setViewerMode('report');
    setSelectedIndex(null);
  };

  const showNextPhoto = () => {
    if (
      lightboxGallery.length === 0
    ) {
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
    if (
      lightboxGallery.length === 0
    ) {
      return;
    }

    setViewerMode('report');

    setSelectedIndex(
      (current) =>
        (
          current -
          1 +
          lightboxGallery.length
        ) %
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
        if (
          event ===
          'PASSWORD_RECOVERY'
        ) {
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

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!recoveryDetected) {
          setSession(data.session);
          setAuthLoading(false);
        }
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadGallery() {
      const {
        data,
        error
      } = await supabase
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

      const captures =
        (data || []).map(
          (capture) => ({
            id: capture.id,

            title:
              capture.title,

            subtitle:
              capture.subtitle,

            category:
              capture.category,

            objectType:
              capture.object_type,

            constellation:
              capture.constellation,

            distance:
              capture.distance,

            captureDate:
              capture.capture_date,

            exposure:
              capture.exposure,

            processing:
              capture.processing,

            equipment:
              capture.equipment,

            notes:
              capture.notes,

            nextGoal:
              capture.next_goal,

            image:
              capture.image,

            storagePath:
              capture.storage_path,

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

            sortOrder:
              capture.sort_order,

            isFeatured:
              capture.is_featured
          })
        );

      setGallery(captures);
    }

    loadGallery();
  }, []);

  useEffect(() => {
    async function loadEquipment() {
      setEquipmentStatus('loading');

      const {
        data,
        error
      } = await supabase
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

      const items =
        (data || []).map(
          (item) => ({
            id: item.id,

            name: item.name,

            category:
              item.category,

            type: item.type,

            role: item.role,

            status: item.status,

            icon: item.icon,

            summary:
              item.summary,

            facts:
              item.facts || [],

            bestFor:
              item.best_for || [],

            fieldNote:
              item.field_note || '',

            sortOrder:
              item.sort_order
          })
        );

      setEquipment(items);
      setEquipmentStatus('ready');
    }

    loadEquipment();
  }, []);

  useEffect(() => {
    async function loadCaptainsLog() {
      setCaptainsLogStatus(
        'loading'
      );

      const {
        data,
        error
      } = await supabase
        .from('captains_log')
        .select('*')
        .order('date', {
          ascending: false
        });

      if (error) {
        console.error(error);

        setCaptainsLog([]);

        setCaptainsLogStatus(
          'error'
        );

        return;
      }

      const entries =
        (data || []).map(
          (entry) => ({
            id: entry.id,

            date: entry.date,

            mission:
              entry.mission,

            location:
              entry.location,

            targets:
              entry.targets || [],

            equipment:
              entry.equipment || [],

            conditions:
              entry.conditions || {},

            summary:
              entry.summary || '',

            notes:
              entry.notes || '',

            worked:
              entry.worked || [],

            improve:
              entry.improve || [],

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

        const data =
          await fetch(url).then(
            (response) =>
              response.json()
          );

        setWeather(
          (previousWeather) => ({
            ...previousWeather,

            [loc.name]:
              data.current
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
      setScrolled(
        window.scrollY > 80
      );
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

      if (
        event.key === 'ArrowRight'
      ) {
        showNextPhoto();
      }

      if (
        event.key === 'ArrowLeft'
      ) {
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

  if (
    isPasswordRecovery ||
    isPasswordResetPage
  ) {
    return (
      <Login forcePasswordReset />
    );
  }

  if (isAdminPage) {
    if (authLoading) {
      return null;
    }

    if (!session) {
      return <Login />;
    }

    let adminContent = null;

    if (
      isAdminCaptainsLogPage
    ) {
      adminContent = (
        <AdminCaptainsLog />
      );
    } else if (
      isAdminGalleryPage
    ) {
      adminContent = (
        <AdminGallery />
      );
    } else if (
      isAdminEquipmentPage
    ) {
      adminContent = (
        <AdminEquipment />
      );
    } else if (
      isAdminTransfersPage
    ) {
      adminContent = (
        <CrewTransfer />
      );
    } else if (
      isAdminCommsPage
    ) {
      adminContent = (
        <CommsTerminal
          session={session}
        />
      );
    } else if (
      isAdminOperationPage
    ) {
      adminContent = (
        <OperationControl
          session={session}
        />
      );
    } else if (
      isAdminIncidentsPage
    ) {
      adminContent = (
        <IncidentCommand
          session={session}
        />
      );
    } else if (
      isAdminTasksPage
    ) {
      adminContent = (
        <CrewTasking
          session={session}
        />
      );
    } else if (
      isAdminWatchPage
    ) {
      adminContent = (
        <WatchFloor
          session={session}
        />
      );
    } else if (
      isAdminSystemPage
    ) {
      adminContent = (
        <SystemStatus
          session={session}
        />
      );
    } else if (
      isAdminStoragePage
    ) {
      adminContent = (
        <StorageControl
          session={session}
        />
      );
    } else if (
      isAdminBlackBoxPage
    ) {
      adminContent = (
        <BlackBox
          session={session}
        />
      );
    } else if (
      isAdminDeploymentsPage
    ) {
      adminContent = (
        <DeploymentControl
          session={session}
        />
      );
    } else {
      adminContent = (
        <AdminDashboard
          session={session}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <>
        <EasterEggs />

        <AdminTopNav
          scrolled={scrolled}
          session={session}
          onLogout={handleLogout}
        />

        <div className="admin-shell">
          {adminContent}
        </div>

        {!isAdminIncidentsPage &&
          !isAdminWatchPage &&
          activeIncidents.length > 0 && (
          <a
            className={`admin-incident-global-banner admin-incident-global-banner-${String(
              activeIncidents[0].severity ||
                'elevated'
            ).toLowerCase()}`}
            href="/admin/incidents"
          >
            <strong>
              ⚠ ACTIVE INCIDENT
            </strong>

            <span>
              {formatIncidentCode(
                activeIncidents[0]
              )} ·{' '}
              {activeIncidents[0].title}
            </span>

            <small>
              {activeIncidents[0].severity} ·
              OPEN INCIDENT COMMAND →
            </small>
          </a>
        )}

        {!isAdminCommsPage && prioritySignal && (
          <a
            className={`admin-priority-toast${
              prioritySignal.kind === 'RED_ALERT'
                ? ' admin-priority-toast-red-alert'
                : ''
            }`}
            href="/admin/comms"

          >
            <strong>
              {prioritySignal.kind === 'RED_ALERT'
                ? '⚠ RED ALERT'
                : '⚡ INCOMING CREW PING'}
            </strong>

            <span>
              {prioritySignal.kind === 'RED_ALERT'
                ? `DECLARED BY ${prioritySignal.sender_name}`
                : `${prioritySignal.sender_name} IS REQUESTING YOUR ATTENTION`}
            </span>

            <small>OPEN COMMS →</small>
          </a>
        )}

        {!isAdminCommsPage &&
          !isAdminWatchPage && (
          <a
            className={`admin-comms-global-launch${
              hasUnreadComms
                ? ' admin-comms-global-launch-unread'
                : ''
            }${
              prioritySignal
                ? prioritySignal.kind === 'RED_ALERT'
                  ? ' admin-comms-global-launch-red-alert'
                  : ' admin-comms-global-launch-priority'
                : ''
            }`}
            href="/admin/comms"
            aria-label={
              hasUnreadComms
                ? 'Open CuzBro Comms Terminal — unread communication'
                : 'Open CuzBro Comms Terminal'
            }

          >
            <span>●</span>
            COMMS
          </a>
        )}

        <AdminCommandPalette
          onLogout={handleLogout}
        />
      </>
    );
  }

  return (
    <>
      <EasterEggs />

      <SpaceBackground />

      {isSkyMapPage ||
      isMissionSupportPage ||
      isCaptainsLogPage ||
      isEquipmentPage ? (
        <PageNav
          scrolled={scrolled}
        />
      ) : (
        <Hero
          imageCount={gallery.length}
          scrolled={scrolled}
          featuredPhoto={
            featuredPhoto
          }
          setSelectedIndex={
            openFeaturedPhoto
          }
          weather={
            weather['Eliot, ME']
          }
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
            captainsLog={
              captainsLog
            }
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
            status={
              captainsLogStatus
            }
          />
        ) : isEquipmentPage ? (
          <EquipmentLocker
            equipment={equipment}
            status={
              equipmentStatus
            }
          />
        ) : (
          <>
            <QuickLinks />

            <MissionTimeline
              gallery={gallery}
              captainsLog={captainsLog}
              onOpenMission={
                openTimelineMission
              }
            />

            <Weather
              locations={locations}
              weather={weather}
            />

            <Gallery
              gallery={
                filteredGallery
              }
              activeFilter={
                activeFilter
              }
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
        setSelectedIndex={
          setSelectedIndex
        }
        viewerMode={viewerMode}
        setViewerMode={
          setViewerMode
        }
        closeLightbox={
          closeLightbox
        }
        showPreviousPhoto={
          showPreviousPhoto
        }
        showNextPhoto={
          showNextPhoto
        }
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

        <p>
          Look up. Stay curious.
        </p>
      </footer>
    </>
  );
}