import {
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  Activity,
  BookOpen,
  Camera,
  Clock3,
  FolderUp,
  Monitor,
  Radio,
  Rocket,
  Settings,
  Telescope,
  AlertTriangle,
  CheckCircle2,
  ClipboardList
} from 'lucide-react';
import { supabase } from '../supabase.js';
import CrewPresencePanel from './CrewPresencePanel.jsx';
import ObservingSiteControl from './ObservingSiteControl.jsx';
import {
  getCrewMember
} from '../lib/crew.js';
import {
  formatOperationElapsed,
  useActiveOperation
} from '../lib/operations.js';
import {
  formatIncidentCode,
  useActiveIncidents
} from '../lib/incidents.js';
import {
  formatTaskCode,
  formatTaskStatus,
  useCrewTasks
} from '../lib/tasks.js';

const initialDashboardData = {
  captures: [],
  missions: [],
  equipment: []
};

function formatElapsed(dateValue, now) {
  if (!dateValue) {
    return 'NO EVENTS';
  }

  const timestamp =
    new Date(dateValue).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return 'UNKNOWN';
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (now - timestamp) / 1000
      )
    );

  if (seconds < 5) {
    return 'JUST NOW';
  }

  if (seconds < 60) {
    return `${seconds} SEC AGO`;
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} MIN AGO`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} HR AGO`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} DAY${
    days === 1 ? '' : 'S'
  } AGO`;
}

function parseTotalCount(
  contentRange
) {
  if (!contentRange) {
    return 0;
  }

  const match =
    contentRange.match(
      /\/(\d+|\*)$/
    );

  if (
    !match ||
    match[1] === '*'
  ) {
    return 0;
  }

  return Number(
    match[1]
  );
}

export default function AdminDashboard({
  session,
  onLogout,
  currentSite,
  observingSiteStatus,
  observingSiteError,
  observingSiteSaving,
  onSelectObservingSite
}) {
  const crew =
    getCrewMember(
      session?.user?.email
    );

  const {
    activeOperation,
    operationStatus
  } = useActiveOperation();

  const {
    activeIncidents,
    primaryIncident,
    incidentStatus
  } = useActiveIncidents();

  const {
    tasks,
    activeTasks,
    taskStatus
  } = useCrewTasks();

  const ownActiveTasks = useMemo(
    () =>
      activeTasks
        .filter(
          (task) =>
            String(
              task.assigned_email || ''
            ).toLowerCase() ===
            String(
              session?.user?.email || ''
            ).toLowerCase()
        )
        .slice(0, 2),
    [
      activeTasks,
      session?.user?.email
    ]
  );

  const [
    dashboardData,
    setDashboardData
  ] = useState(
    initialDashboardData
  );

  const [
    dashboardStatus,
    setDashboardStatus
  ] = useState('loading');

  const [
    dashboardError,
    setDashboardError
  ] = useState('');

  const [
    blackBoxEventCount,
    setBlackBoxEventCount
  ] = useState(0);

  const [
    blackBoxLastEventAt,
    setBlackBoxLastEventAt
  ] = useState(null);

  const [
    blackBoxLinkStatus,
    setBlackBoxLinkStatus
  ] = useState('connecting');

  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    const timerId =
      window.setInterval(() => {
        setNow(Date.now());
      }, 1_000);

    return () => {
      window.clearInterval(
        timerId
      );
    };
  }, []);

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

        setDashboardStatus(
          'error'
        );

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

    async function startBlackBoxSummary() {
      setBlackBoxLinkStatus(
        'connecting'
      );

      const accessToken =
        session?.access_token;

      const supabaseUrl =
        import.meta.env
          .VITE_SUPABASE_URL;

      const supabasePublishableKey =
        import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY;

      if (
        !accessToken ||
        !supabaseUrl ||
        !supabasePublishableKey
      ) {
        if (active) {
          setBlackBoxLinkStatus(
            'error'
          );
        }

        console.error(
          'Black Box summary could not start: authenticated Supabase configuration is unavailable.'
        );

        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/crew_activity?select=id,created_at&order=created_at.desc&limit=1`,
          {
            headers: {
              apikey:
                supabasePublishableKey,

              Authorization:
                `Bearer ${accessToken}`,

              Prefer:
                'count=exact'
            }
          }
        );

        const responseText =
          await response.text();

        let responseBody = [];

        if (responseText) {
          try {
            responseBody =
              JSON.parse(
                responseText
              );
          } catch {
            responseBody = [];
          }
        }

        if (!response.ok) {
          throw new Error(
            responseBody?.message ||
              `Black Box summary failed with status ${response.status}.`
          );
        }

        const totalCount =
          parseTotalCount(
            response.headers.get(
              'Content-Range'
            )
          );

        const latestEvent =
          Array.isArray(
            responseBody
          )
            ? responseBody[0]
            : null;

        if (active) {
          setBlackBoxEventCount(
            totalCount
          );

          setBlackBoxLastEventAt(
            latestEvent?.created_at ||
              null
          );

          setBlackBoxLinkStatus(
            'connecting'
          );
        }

        await supabase.realtime.setAuth(
          accessToken
        );

        if (!active) {
          return;
        }

        channel = supabase
          .channel(
            'cuzbro-black-box-dashboard-summary'
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table:
                'crew_activity'
            },
            (payload) => {
              const newEvent =
                payload.new;

              setBlackBoxEventCount(
                (currentCount) =>
                  currentCount + 1
              );

              setBlackBoxLastEventAt(
                newEvent.created_at ||
                  new Date().toISOString()
              );

              setNow(
                Date.now()
              );
            }
          )
          .subscribe(
            (status, error) => {
              console.log(
                '[BLACK BOX SUMMARY] Realtime status:',
                status
              );

              if (error) {
                console.error(
                  '[BLACK BOX SUMMARY] Realtime error:',
                  error
                );
              }

              if (!active) {
                return;
              }

              if (
                status ===
                'SUBSCRIBED'
              ) {
                setBlackBoxLinkStatus(
                  'live'
                );

                return;
              }

              if (
                status ===
                  'CHANNEL_ERROR' ||
                status ===
                  'TIMED_OUT'
              ) {
                setBlackBoxLinkStatus(
                  'error'
                );

                return;
              }

              if (
                status === 'CLOSED'
              ) {
                setBlackBoxLinkStatus(
                  'offline'
                );

                return;
              }

              setBlackBoxLinkStatus(
                'connecting'
              );
            }
          );
      } catch (error) {
        console.error(
          'Black Box summary failed:',
          error
        );

        if (active) {
          setBlackBoxLinkStatus(
            'error'
          );
        }
      }
    }

    startBlackBoxSummary();

    return () => {
      active = false;

      if (channel) {
        supabase.removeChannel(
          channel
        );
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
      (capture) =>
        capture.is_featured
    ) || captures[0];

  const latestMission =
    missions[0] || null;

  const activeEquipmentCount =
    equipment.filter(
      (item) =>
        String(
          item.status || ''
        )
          .trim()
          .toLowerCase() ===
        'active'
    ).length;

  const equipmentCategoryCount =
    new Set(
      equipment
        .map(
          (item) =>
            item.category
        )
        .filter(Boolean)
    ).size;

  const adminSections = [
    {
      id: 'gallery',

      icon: Camera,

      eyebrow:
        'MISSION ARCHIVE',

      title:
        'Capture Control',

      description:
        'Upload new astrophotography captures and manage the public mission archive.',

      action:
        'MANAGE CAPTURES',

      stats: [
        {
          label: 'CAPTURES',

          value:
            captures.length
        },
        {
          label: 'FEATURED',

          value:
            featuredCapture
              ?.title ||
            'None'
        }
      ]
    },
    {
      id: 'captains-log',

      icon: BookOpen,

      eyebrow:
        "CAPTAIN'S LOG",

      title:
        'Mission Reports',

      description:
        'Create and manage observing reports, mission notes, and field updates.',

      action:
        'MANAGE LOGS',

      stats: [
        {
          label: 'MISSIONS',

          value:
            missions.length
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

      eyebrow:
        'EQUIPMENT LOCKER',

      title:
        'Gear Inventory',

      description:
        'Add equipment and maintain the public CuzBro gear inventory.',

      action:
        'MANAGE GEAR',

      stats: [
        {
          label: 'GEAR',

          value:
            equipment.length
        },
        {
          label: 'ACTIVE',

          value:
            activeEquipmentCount
        }
      ]
    },
    {
      id: 'transfers',

      icon: FolderUp,

      eyebrow:
        'PRIVATE CREW EXCHANGE',

      title:
        'Crew Transfer',

      description:
        'Securely exchange raw captures, processing files, and mission data with the CuzBro crew.',

      action:
        'OPEN TRANSFER BAY',

      stats: [
        {
          label: 'ACCESS',

          value:
            'CREW ONLY'
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
              Authorized crew access
              for managing CuzBro
              mission data and
              observatory content.
            </p>

            <div className="admin-command-palette-hint">
              Press <kbd>CTRL + K</kbd> for the
              Command Palette
            </div>
          </div>

          <div className="admin-status-card">
            <div className="admin-status-icon">
              <Settings size={23} />
            </div>

            <div>
              <span>
                SYSTEM STATUS
              </span>

              <strong>
                {dashboardStatus ===
                'loading'
                  ? 'SYNCING'
                  : dashboardStatus ===
                      'error'
                    ? 'DATA ALERT'
                    : blackBoxLinkStatus ===
                        'error'
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

        <CrewPresencePanel
          session={session}
        />

        <ObservingSiteControl
          currentSite={currentSite}
          status={observingSiteStatus}
          error={observingSiteError}
          saving={observingSiteSaving}
          onSelect={onSelectObservingSite}
        />

        <section className="admin-live-state-grid">
          <section
            className={`admin-active-operation${
            activeOperation
              ? ' admin-active-operation-live'
              : ''
          }`}
        >
          <div className="admin-active-operation-status">
            <span className="admin-card-eyebrow">
              ACTIVE OPERATION
            </span>

            {operationStatus === 'loading' ? (
              <>
                <h3>Synchronizing Operation Link</h3>
                <p>Checking shared crew operation state.</p>
              </>
            ) : activeOperation ? (
              <>
                <div className="admin-active-operation-live-label">
                  <i />
                  OPERATION ACTIVE
                </div>

                <h3>
                  {activeOperation.designation}
                </h3>

                <p>
                  {activeOperation.target} ·{' '}
                  {activeOperation.operation_type}
                </p>
              </>
            ) : (
              <>
                <h3>Observatory Standing By</h3>
                <p>
                  No active operation is currently registered.
                </p>
              </>
            )}
          </div>

          <div className="admin-active-operation-clock">
            <span>
              {activeOperation
                ? 'MISSION CLOCK'
                : 'OPERATION STATE'}
            </span>

            <strong>
              {activeOperation
                ? `T+ ${formatOperationElapsed(
                    activeOperation.started_at,
                    null,
                    now
                  )}`
                : 'STANDBY'}
            </strong>

            {activeOperation && (
              <small>
                INITIATED BY{' '}
                {String(
                  activeOperation.initiated_by_name ||
                    'CREW'
                ).toUpperCase()}
              </small>
            )}
          </div>

          <a
            className="admin-active-operation-action"
            href="/admin/operation"
          >
            <span>
              {activeOperation
                ? 'OPEN OPERATION COMMAND'
                : 'INITIATE OPERATION'}
            </span>

            <strong>→</strong>
          </a>
        </section>

        <a
          className={`admin-incident-status-strip${
            activeIncidents.length
              ? ' admin-incident-status-strip-active'
              : ''
          }`}
          href="/admin/incidents"
        >
          <div className="admin-incident-status-icon">
            {activeIncidents.length ? (
              <AlertTriangle size={22} />
            ) : (
              <CheckCircle2 size={22} />
            )}
          </div>

          <div className="admin-incident-status-copy">
            <span className="admin-card-eyebrow">
              INCIDENT STATUS
            </span>

            <strong>
              {incidentStatus === 'loading'
                ? 'Synchronizing Incident Link'
                : activeIncidents.length
                  ? `${activeIncidents.length} ACTIVE ${
                      activeIncidents.length === 1
                        ? 'INCIDENT'
                        : 'INCIDENTS'
                    }`
                  : 'All Systems Nominal'}
            </strong>

            <p>
              {primaryIncident
                ? `${formatIncidentCode(
                    primaryIncident
                  )} · ${primaryIncident.title} · ${primaryIncident.severity}`
                : 'No active incidents are currently registered.'}
            </p>
          </div>

          <div className="admin-incident-status-action">
            <span>
              {activeIncidents.length
                ? 'OPEN INCIDENT COMMAND'
                : 'VIEW INCIDENT ARCHIVE'}
            </span>

            <strong>→</strong>
          </div>
        </a>

        <a
          className="admin-tasking-status-strip"
          href="/admin/tasks"
        >
          <div className="admin-tasking-status-icon">
            <ClipboardList size={22} />
          </div>

          <div className="admin-tasking-status-copy">
            <span className="admin-card-eyebrow">
              CREW TASKING
            </span>

            <strong>
              {taskStatus === 'loading'
                ? 'Synchronizing Action Queue'
                : `${activeTasks.length} ACTIVE ${
                    activeTasks.length === 1
                      ? 'TASK'
                      : 'TASKS'
                  }`}
            </strong>

            {ownActiveTasks.length ? (
              <div className="admin-tasking-own-list">
                {ownActiveTasks.map((task) => (
                  <span key={task.id}>
                    <b>{formatTaskCode(task)}</b>
                    {task.title}
                    <small>
                      {task.priority} ·{' '}
                      {formatTaskStatus(task.status)}
                    </small>
                  </span>
                ))}
              </div>
            ) : (
              <p>
                {activeTasks.length
                  ? 'No active tasks are currently assigned to you.'
                  : 'Shared crew action queue is clear.'}
              </p>
            )}
          </div>

          <div className="admin-tasking-status-action">
            <span>OPEN CREW TASKING</span>
            <strong>→</strong>
          </div>
        </a>
        </section>

        <section id="live-systems" className="admin-dashboard-nav-section">
          <div className="admin-dashboard-section-heading">
            <span className="admin-card-eyebrow">
              COMMAND CONSOLES
            </span>

            <h3>
              Live Systems
            </h3>

            <p>
              Monitoring, diagnostics, storage,
              and event telemetry.
            </p>
          </div>

          <div className="admin-dashboard-console-grid">
            <a
              className="admin-dashboard-nav-card admin-dashboard-nav-card-watch"
              href="/admin/watch"
            >
              <div className="admin-dashboard-nav-icon">
                <Monitor size={22} />
              </div>

              <div className="admin-dashboard-nav-copy">
                <span>LIVE TELEMETRY WALL</span>
                <strong>Watch Floor</strong>
                <p>
                  Passive live operations display.
                </p>
              </div>

              <b>→</b>
            </a>

            <a
              className="admin-dashboard-nav-card"
              href="/admin/system"
            >
              <div className="admin-dashboard-nav-icon">
                <Activity size={22} />
              </div>

              <div className="admin-dashboard-nav-copy">
                <span>SYSTEM COMMAND</span>
                <strong>System Status</strong>
                <p>
                  Run live infrastructure diagnostics.
                </p>
              </div>

              <b>→</b>
            </a>

            <a
              className="admin-dashboard-nav-card"
              href="/admin/storage"
            >
              <div className="admin-dashboard-nav-icon">
                <FolderUp size={22} />
              </div>

              <div className="admin-dashboard-nav-copy">
                <span>STORAGE COMMAND</span>
                <strong>Storage Control</strong>
                <p>
                  Inspect R2 usage and crew storage.
                </p>
              </div>

              <b>→</b>
            </a>

            <a
              className="admin-dashboard-nav-card admin-dashboard-nav-card-blackbox"
              href="/admin/black-box"
            >
              <div className="admin-dashboard-nav-icon">
                <Radio size={22} />
              </div>

              <div className="admin-dashboard-nav-copy">
                <span>FLIGHT RECORDER</span>
                <strong>Black Box</strong>

                <div className="admin-dashboard-nav-telemetry">
                  <em
                    className={`admin-black-box-command-live admin-black-box-command-live-${blackBoxLinkStatus}`}
                  >
                    <i />

                    {blackBoxLinkStatus ===
                    'live'
                      ? 'LIVE'
                      : blackBoxLinkStatus ===
                          'error'
                        ? 'LINK ERROR'
                        : blackBoxLinkStatus ===
                            'offline'
                          ? 'OFFLINE'
                          : 'CONNECTING'}
                  </em>

                  <small>
                    {blackBoxEventCount} EVENTS · LAST{' '}
                    {formatElapsed(
                      blackBoxLastEventAt,
                      now
                    )}
                  </small>
                </div>
              </div>

              <b>→</b>
            </a>
          </div>

          <a
            className="admin-dashboard-deployment-row"
            href="/admin/deployments"
          >
            <div className="admin-dashboard-nav-icon">
              <Rocket size={22} />
            </div>

            <div className="admin-dashboard-nav-copy">
              <span>RELEASE CONTROL</span>
              <strong>Deployments</strong>
              <p>
                Live build, deployed Git SHA, branch,
                and recent commits.
              </p>
            </div>

            <div className="admin-dashboard-deployment-action">
              OPEN DEPLOYMENT CONSOLE
              <b>→</b>
            </div>
          </a>
        </section>

        <section id="observatory-tools" className="admin-dashboard-nav-section">
          <div className="admin-dashboard-section-heading">
            <span className="admin-card-eyebrow">
              MISSION DATA
            </span>

            <h3>
              Observatory Tools
            </h3>

            <p>
              Captures, reports, equipment,
              and private crew exchange.
            </p>
          </div>

          <div className="admin-dashboard-mission-grid">
            {adminSections.map(
              (section) => {
                const Icon =
                  section.icon;

                return (
                  <a
                    className="admin-dashboard-mission-card"
                    key={section.id}
                    href={`/admin/${section.id}`}
                  >
                    <div className="admin-dashboard-nav-icon">
                      <Icon size={23} />
                    </div>

                    <div className="admin-dashboard-nav-copy">
                      <span>
                        {section.eyebrow}
                      </span>

                      <strong>
                        {section.title}
                      </strong>

                      <p>
                        {section.description}
                      </p>

                      <div className="admin-dashboard-compact-stats">
                        {section.stats.map(
                          (stat) => (
                            <div
                              key={stat.label}
                            >
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
                          )
                        )}
                      </div>
                    </div>

                    <b>→</b>
                  </a>
                );
              }
            )}
          </div>
        </section>

        <section className="admin-system-summary">
          <div>
            <Clock3 size={19} />

            <span>
              MISSION DATABASE
            </span>

            <strong>
              {missions.length} REPORTS
            </strong>
          </div>

          <div>
            <Camera size={19} />

            <span>
              IMAGE ARCHIVE
            </span>

            <strong>
              {captures.length} CAPTURES
            </strong>
          </div>

          <div>
            <Telescope size={19} />

            <span>
              EQUIPMENT CATEGORIES
            </span>

            <strong>
              {equipmentCategoryCount}{' '}
              CATEGORIES
            </strong>
          </div>
        </section>

        <button
          type="button"
          className="admin-open-site"
          onClick={() => {
            window.location.href =
              '/';
          }}
        >
          OPEN PUBLIC OBSERVATORY

          <span>↗</span>
        </button>
      </main>
    </div>
  );
}
