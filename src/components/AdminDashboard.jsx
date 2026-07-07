import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Camera,
  Clock3,
  FolderUp,
  LogOut,
  Radio,
  Settings,
  Telescope
} from 'lucide-react';
import { supabase } from '../supabase.js';

const initialDashboardData = {
  captures: [],
  missions: [],
  equipment: []
};

const MAX_ACTIVITY_ROWS = 8;

function formatEventTime(dateValue) {
  if (!dateValue) {
    return '--:--:--';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function formatEventDate(dateValue) {
  if (!dateValue) {
    return 'UNKNOWN DATE';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'UNKNOWN DATE';
  }

  return date
    .toLocaleDateString(
      'en-US',
      {
        month: 'short',
        day: 'numeric'
      }
    )
    .toUpperCase();
}

function getActionLabel(action) {
  return String(action || 'SYSTEM_EVENT')
    .replaceAll('_', ' ');
}

function getEventDescription(event) {
  const name =
    event.resource_name ||
    event.resource_type ||
    'CuzBro system';

  const details =
    event.details &&
    typeof event.details === 'object'
      ? event.details
      : {};

  switch (event.action) {
    case 'TRANSFER_UPLOAD':
      return `${name} · ${Number(
        details.fileCount || 0
      )} ${
        Number(details.fileCount || 0) === 1
          ? 'file'
          : 'files'
      }`;

    case 'TRANSFER_DOWNLOAD':
      return `${
        details.transferName ||
        'Crew Transfer'
      } · downloaded ${name}`;

    case 'TRANSFER_FILE_DELETE':
      return `${
        details.transferName ||
        'Crew Transfer'
      } · deleted ${name}`;

    case 'TRANSFER_DELETE':
      return `${name} · ${Number(
        details.fileCount || 0
      )} ${
        Number(details.fileCount || 0) === 1
          ? 'file removed'
          : 'files removed'
      }`;

    default:
      return name;
  }
}

export default function AdminDashboard({
  session,
  onLogout
}) {
  const email =
    session?.user?.email || 'Unknown Crew';

  const [dashboardData, setDashboardData] =
    useState(initialDashboardData);

  const [dashboardStatus, setDashboardStatus] =
    useState('loading');

  const [dashboardError, setDashboardError] =
    useState('');

  const [activity, setActivity] =
    useState([]);

  const [activityStatus, setActivityStatus] =
    useState('loading');

  const [
    realtimeStatus,
    setRealtimeStatus
  ] = useState('connecting');

  useEffect(() => {
    async function loadDashboardData() {
      setDashboardStatus('loading');
      setDashboardError('');

      const [
        galleryResponse,
        missionsResponse,
        equipmentResponse
      ] = await Promise.all([
        supabase
          .from('gallery')
          .select(
            'id, title, subtitle, capture_date, is_featured, sort_order, created_at'
          )
          .order('sort_order', {
            ascending: true
          }),

        supabase
          .from('captains_log')
          .select(
            'id, mission, date, location, targets, created_at'
          )
          .order('date', {
            ascending: false
          }),

        supabase
          .from('equipment')
          .select(
            'id, name, category, status, created_at'
          )
          .order('sort_order', {
            ascending: true
          })
      ]);

      const loadError =
        galleryResponse.error ||
        missionsResponse.error ||
        equipmentResponse.error;

      if (loadError) {
        console.error(
          'Admin dashboard load failed:',
          loadError
        );

        setDashboardError(
          loadError.message ||
            'Dashboard data could not be loaded.'
        );

        setDashboardStatus('error');

        return;
      }

      setDashboardData({
        captures:
          galleryResponse.data || [],
        missions:
          missionsResponse.data || [],
        equipment:
          equipmentResponse.data || []
      });

      setDashboardStatus('ready');
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    let active = true;
    let channel = null;

    async function startBlackBoxFeed() {
      setActivityStatus('loading');
      setRealtimeStatus('connecting');

      const accessToken =
        session?.access_token;

      const supabaseUrl =
        import.meta.env.VITE_SUPABASE_URL;

      const supabasePublishableKey =
        import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY;

      if (
        !accessToken ||
        !supabaseUrl ||
        !supabasePublishableKey
      ) {
        if (active) {
          setActivityStatus('error');
          setRealtimeStatus('error');
        }

        console.error(
          'Black Box feed could not start: authenticated Supabase configuration is unavailable.'
        );

        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/crew_activity?select=*&order=created_at.desc&limit=${MAX_ACTIVITY_ROWS}`,
          {
            headers: {
              apikey:
                supabasePublishableKey,

              Authorization:
                `Bearer ${accessToken}`
            }
          }
        );

        const responseText =
          await response.text();

        let responseBody = [];

        if (responseText) {
          try {
            responseBody =
              JSON.parse(responseText);
          } catch {
            responseBody = [];
          }
        }

        if (!response.ok) {
          throw new Error(
            responseBody?.message ||
              `Black Box request failed with status ${response.status}.`
          );
        }

        if (active) {
          setActivity(
            Array.isArray(responseBody)
              ? responseBody
              : []
          );

          setActivityStatus('ready');
        }

        await supabase.realtime.setAuth(
          accessToken
        );

        if (!active) {
          return;
        }

        channel = supabase
          .channel('cuzbro-black-box-dashboard')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'crew_activity'
            },
            (payload) => {
              const newEvent = payload.new;

              setActivity(
                (currentActivity) => [
                  newEvent,
                  ...currentActivity.filter(
                    (event) =>
                      event.id !== newEvent.id
                  )
                ].slice(
                  0,
                  MAX_ACTIVITY_ROWS
                )
              );
            }
          )
          .subscribe((status, error) => {
            console.log(
              '[BLACK BOX] Realtime status:',
              status
            );

            if (error) {
              console.error(
                '[BLACK BOX] Realtime error:',
                error
              );
            }

            if (!active) {
              return;
            }

            if (status === 'SUBSCRIBED') {
              setRealtimeStatus('live');
              return;
            }

            if (
              status === 'CHANNEL_ERROR' ||
              status === 'TIMED_OUT'
            ) {
              setRealtimeStatus('error');
              return;
            }

            if (status === 'CLOSED') {
              setRealtimeStatus('offline');
              return;
            }

            setRealtimeStatus('connecting');
          });
      } catch (error) {
        console.error(
          'Black Box feed failed:',
          error
        );

        if (active) {
          setActivityStatus('error');
          setRealtimeStatus('error');
        }
      }
    }

    startBlackBoxFeed();

    return () => {
      active = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    session?.access_token
  ]);

  const {
    captures,
    missions,
    equipment
  } = dashboardData;

  const featuredCapture =
    captures.find(
      (capture) => capture.is_featured
    ) || captures[0];

  const latestMission =
    missions[0] || null;

  const activeEquipmentCount =
    equipment.filter(
      (item) =>
        String(item.status || '')
          .trim()
          .toLowerCase() === 'active'
    ).length;

  const equipmentCategoryCount =
    new Set(
      equipment
        .map((item) => item.category)
        .filter(Boolean)
    ).size;

  const adminSections = [
    {
      id: 'gallery',
      icon: Camera,
      eyebrow: 'MISSION ARCHIVE',
      title: 'Capture Control',
      description:
        'Upload new astrophotography captures and manage the public mission archive.',
      action: 'MANAGE CAPTURES',
      stats: [
        {
          label: 'CAPTURES',
          value: captures.length
        },
        {
          label: 'FEATURED',
          value:
            featuredCapture?.title ||
            'None'
        }
      ]
    },
    {
      id: 'captains-log',
      icon: BookOpen,
      eyebrow: "CAPTAIN'S LOG",
      title: 'Mission Reports',
      description:
        'Create and manage observing reports, mission notes, and field updates.',
      action: 'MANAGE LOGS',
      stats: [
        {
          label: 'MISSIONS',
          value: missions.length
        },
        {
          label: 'LATEST',
          value:
            latestMission?.id ||
            'None'
        }
      ]
    },
    {
      id: 'equipment',
      icon: Telescope,
      eyebrow: 'EQUIPMENT LOCKER',
      title: 'Gear Inventory',
      description:
        'Add equipment and maintain the public CuzBro gear inventory.',
      action: 'MANAGE GEAR',
      stats: [
        {
          label: 'GEAR',
          value: equipment.length
        },
        {
          label: 'ACTIVE',
          value: activeEquipmentCount
        }
      ]
    },
    {
      id: 'transfers',
      icon: FolderUp,
      eyebrow: 'PRIVATE CREW EXCHANGE',
      title: 'Crew Transfer',
      description:
        'Securely exchange raw captures, processing files, and mission data with the CuzBro crew.',
      action: 'OPEN TRANSFER BAY',
      stats: [
        {
          label: 'ACCESS',
          value: 'CREW ONLY'
        },
        {
          label: 'STORAGE',
          value: 'R2'
        }
      ]
    }
  ];

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
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

          <div>
            <span>
              SECURE CREW TERMINAL
            </span>

            <h1>Admin Control</h1>
          </div>
        </div>

        <div className="admin-user-controls">
          <div className="admin-user">
            <span>
              CREW AUTHENTICATED
            </span>

            <strong>{email}</strong>
          </div>

          <button
            type="button"
            className="admin-logout"
            onClick={onLogout}
          >
            <LogOut size={17} />
            LOG OUT
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-command-header">
          <div>
            <span className="admin-eyebrow">
              MISSION COMMAND
            </span>

            <h2>
              Observatory
              <br />
              Control Center
            </h2>

            <p>
              Authorized crew access for
              managing CuzBro mission data and
              observatory content.
            </p>
          </div>

          <div className="admin-status-card">
            <div className="admin-status-icon">
              <Settings size={23} />
            </div>

            <div>
              <span>SYSTEM STATUS</span>

              <strong>
                {dashboardStatus === 'loading'
                  ? 'SYNCING'
                  : dashboardStatus === 'error'
                    ? 'DATA ALERT'
                    : realtimeStatus === 'error'
                      ? 'BLACK BOX ALERT'
                      : 'ADMIN ONLINE'}
              </strong>
            </div>

            <i />
          </div>
        </section>

        {dashboardError && (
          <div className="admin-error-message">
            {dashboardError}
          </div>
        )}

        <section className="admin-grid">
          {adminSections.map((section) => {
            const Icon = section.icon;

            return (
              <article
                className="admin-control-card"
                key={section.id}
              >
                <div className="admin-control-icon">
                  <Icon size={27} />
                </div>

                <span className="admin-card-eyebrow">
                  {section.eyebrow}
                </span>

                <h3>{section.title}</h3>

                <p>{section.description}</p>

                <div className="admin-dashboard-card-stats">
                  {section.stats.map((stat) => (
                    <div key={stat.label}>
                      <span>
                        {stat.label}
                      </span>

                      <strong>
                        {dashboardStatus ===
                        'loading'
                          ? '—'
                          : stat.value}
                      </strong>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.location.href =
                      `/admin/${section.id}`;
                  }}
                >
                  {section.action}
                  <span>→</span>
                </button>
              </article>
            );
          })}
        </section>

        <section className="admin-black-box-panel">
          <div className="admin-black-box-heading">
            <div>
              <span className="admin-eyebrow">
                CUZBRO FLIGHT DATA RECORDER
              </span>

              <h2>Live Crew Operations</h2>

              <p>
                Authenticated administrative
                events recorded by Black Box.
              </p>
            </div>

            <div
              className={`admin-black-box-live admin-black-box-live-${realtimeStatus}`}
            >
              <Radio size={15} />

              <i />

              {realtimeStatus === 'live'
                ? 'LIVE LINK'
                : realtimeStatus === 'error'
                  ? 'LINK ERROR'
                  : realtimeStatus === 'offline'
                    ? 'LINK CLOSED'
                    : 'CONNECTING'}
            </div>
          </div>

          <div className="admin-black-box-terminal">
            <div className="admin-black-box-terminal-bar">
              <div>
                <Activity size={17} />
                BLACK BOX
              </div>

              <span>
                {activity.length} EVENT
                {activity.length === 1
                  ? ''
                  : 'S'}{' '}
                BUFFERED
              </span>
            </div>

            {activityStatus === 'loading' && (
              <div className="admin-black-box-state">
                ESTABLISHING SECURE DATA LINK...
              </div>
            )}

            {activityStatus === 'error' && (
              <div className="admin-black-box-state admin-black-box-state-error">
                BLACK BOX DATA LINK UNAVAILABLE
              </div>
            )}

            {activityStatus === 'ready' &&
              activity.length === 0 && (
                <div className="admin-black-box-state">
                  NO FLIGHT RECORDER EVENTS
                </div>
              )}

            {activityStatus === 'ready' &&
              activity.length > 0 && (
                <div className="admin-black-box-feed">
                  {activity.map((event) => (
                    <article
                      className="admin-black-box-event"
                      key={event.id}
                    >
                      <div className="admin-black-box-time">
                        <strong>
                          {formatEventTime(
                            event.created_at
                          )}
                        </strong>

                        <span>
                          {formatEventDate(
                            event.created_at
                          )}
                        </span>
                      </div>

                      <div className="admin-black-box-pulse">
                        <i />
                      </div>

                      <div className="admin-black-box-event-copy">
                        <div className="admin-black-box-event-meta">
                          <strong>
                            {String(
                              event.crew_name ||
                                'UNKNOWN'
                            ).toUpperCase()}
                          </strong>

                          <span>
                            {String(
                              event.category ||
                                'SYSTEM'
                            ).toUpperCase()}
                          </span>
                        </div>

                        <h3>
                          {getActionLabel(
                            event.action
                          )}
                        </h3>

                        <p>
                          {getEventDescription(
                            event
                          )}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
          </div>
        </section>

        <section className="admin-system-summary">
          <div>
            <Clock3 size={19} />

            <span>MISSION DATABASE</span>

            <strong>
              {missions.length} REPORTS
            </strong>
          </div>

          <div>
            <Camera size={19} />

            <span>IMAGE ARCHIVE</span>

            <strong>
              {captures.length} CAPTURES
            </strong>
          </div>

          <div>
            <Telescope size={19} />

            <span>EQUIPMENT CATEGORIES</span>

            <strong>
              {equipmentCategoryCount} CATEGORIES
            </strong>
          </div>
        </section>

        <button
          type="button"
          className="admin-open-site"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          OPEN PUBLIC OBSERVATORY
          <span>↗</span>
        </button>
      </main>
    </div>
  );
}
