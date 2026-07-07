import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Database,
  HardDrive,
  Radio,
  Monitor,
  Users
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { supabase } from '../supabase.js';
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
  isTaskActive,
  useCrewTasks
} from '../lib/tasks.js';
import {
  getAllCrewMembers,
  getCrewMember
} from '../lib/crew.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';
const ONLINE_WINDOW_MS = 45_000;
const MAX_COMMS_ROWS = 5;

function formatBytes(bytes) {
  const size = Number(bytes || 0);

  if (size >= 1024 ** 3) {
    return `${(size / 1024 ** 3).toFixed(2)} GB`;
  }

  if (size >= 1024 ** 2) {
    return `${(size / 1024 ** 2).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString(
    'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function formatEventElapsed(value, now) {
  if (!value) {
    return 'NO EVENTS';
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 'UNKNOWN';
  }

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000)
  );

  if (seconds < 5) {
    return 'JUST NOW';
  }

  if (seconds < 60) {
    return `${seconds} SEC AGO`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} MIN AGO`;
  }

  const hours = Math.floor(minutes / 60);

  return `${hours} HR AGO`;
}

function isPresenceOnline(row) {
  const lastSeen = new Date(
    row?.last_seen_at
  ).getTime();

  return (
    Number.isFinite(lastSeen) &&
    Date.now() - lastSeen <= ONLINE_WINDOW_MS
  );
}

function buildPresenceRows(rows) {
  const rowMap = new Map(
    (rows || []).map((row) => [
      String(row.crew_email || '')
        .trim()
        .toLowerCase(),
      row
    ])
  );

  return getAllCrewMembers().map(
    (member) => {
      const row = rowMap.get(
        member.email.toLowerCase()
      );

      return {
        ...member,
        row,
        online: isPresenceOnline(row)
      };
    }
  );
}

export default function WatchFloor({ session }) {
  const crew = getCrewMember(
    session?.user?.email
  );
  const {
    activeOperation,
    operationStatus
  } = useActiveOperation();
  const {
    activeIncidents,
    incidentStatus
  } = useActiveIncidents(Boolean(session));
  const {
    tasks,
    taskStatus
  } = useCrewTasks(Boolean(session));

  const [now, setNow] = useState(Date.now());
  const [presenceRows, setPresenceRows] =
    useState([]);
  const [commsRows, setCommsRows] =
    useState([]);
  const [latestActivity, setLatestActivity] =
    useState(null);
  const [storageSummary, setStorageSummary] =
    useState(null);
  const [serviceState, setServiceState] =
    useState({
      supabase: 'connecting',
      realtime: 'connecting',
      galleryApi: 'connecting',
      r2: 'connecting'
    });
  const [lastSyncAt, setLastSyncAt] =
    useState(null);
  const realtimeChannelRef = useRef(null);
  const instanceIdRef = useRef(
    Math.random().toString(36).slice(2, 9)
  );

  const activeTasks = useMemo(
    () => tasks.filter(isTaskActive),
    [tasks]
  );

  const taskCounts = useMemo(
    () => ({
      open: tasks.filter(
        (task) => task.status === 'OPEN'
      ).length,
      progress: tasks.filter(
        (task) => task.status === 'IN_PROGRESS'
      ).length,
      blocked: tasks.filter(
        (task) => task.status === 'BLOCKED'
      ).length
    }),
    [tasks]
  );

  const operationElapsed = activeOperation
    ? formatOperationElapsed(
        activeOperation.started_at,
        activeOperation.ended_at,
        now
      )
    : '00:00:00';

  async function loadWatchFloorData() {
    if (!session?.access_token) {
      return;
    }

    const results = await Promise.allSettled([
      supabase
        .from('crew_presence')
        .select(
          'crew_email, crew_name, page_name, status, custom_status, last_seen_at'
        ),
      supabase
        .from('crew_comms')
        .select(
          'id, user_id, crew_name, sender_status, body, operation_designation, incident_code, created_at'
        )
        .order('created_at', {
          ascending: false
        })
        .limit(MAX_COMMS_ROWS),
      supabase
        .from('crew_activity')
        .select(
          'id, crew_name, action, category, resource_name, created_at'
        )
        .order('created_at', {
          ascending: false
        })
        .limit(1)
        .maybeSingle(),
      fetch(`${GALLERY_API}/health`),
      fetch(`${GALLERY_API}/storage/summary`, {
        headers: {
          Authorization:
            `Bearer ${session.access_token}`
        }
      })
    ]);

    const [
      presenceResult,
      commsResult,
      activityResult,
      healthResult,
      storageResult
    ] = results;

    if (
      presenceResult.status === 'fulfilled' &&
      !presenceResult.value.error
    ) {
      setPresenceRows(
        buildPresenceRows(
          presenceResult.value.data || []
        )
      );
      setServiceState((current) => ({
        ...current,
        supabase: 'online'
      }));
    } else {
      setServiceState((current) => ({
        ...current,
        supabase: 'error'
      }));
    }

    if (
      commsResult.status === 'fulfilled' &&
      !commsResult.value.error
    ) {
      setCommsRows(
        [...(commsResult.value.data || [])]
          .reverse()
      );
    }

    if (
      activityResult.status === 'fulfilled' &&
      !activityResult.value.error
    ) {
      setLatestActivity(
        activityResult.value.data || null
      );
    }

    if (healthResult.status === 'fulfilled') {
      setServiceState((current) => ({
        ...current,
        galleryApi:
          healthResult.value.ok
            ? 'online'
            : 'error'
      }));
    } else {
      setServiceState((current) => ({
        ...current,
        galleryApi: 'error'
      }));
    }

    if (
      storageResult.status === 'fulfilled' &&
      storageResult.value.ok
    ) {
      try {
        const storage =
          await storageResult.value.json();

        setStorageSummary(storage);
        setServiceState((current) => ({
          ...current,
          r2: 'online'
        }));
      } catch {
        setServiceState((current) => ({
          ...current,
          r2: 'error'
        }));
      }
    } else {
      setServiceState((current) => ({
        ...current,
        r2: 'error'
      }));
    }

    setLastSyncAt(new Date().toISOString());
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      return undefined;
    }

    let refreshTimer = null;

    loadWatchFloorData();

    refreshTimer = window.setInterval(
      loadWatchFloorData,
      15_000
    );

    const channel = supabase
      .channel(
        `cuzbro-watch-floor-${instanceIdRef.current}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_presence'
        },
        loadWatchFloorData
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crew_comms'
        },
        loadWatchFloorData
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crew_activity'
        },
        loadWatchFloorData
      )
      .subscribe((status) => {
        setServiceState((current) => ({
          ...current,
          realtime:
            status === 'SUBSCRIBED'
              ? 'online'
              : status === 'CHANNEL_ERROR' ||
                  status === 'TIMED_OUT'
                ? 'error'
                : 'connecting'
        }));
      });

    realtimeChannelRef.current = channel;

    return () => {
      window.clearInterval(refreshTimer);

      if (realtimeChannelRef.current) {
        supabase.removeChannel(
          realtimeChannelRef.current
        );
      }
    };
  }, [session?.access_token]);

  function renderServiceState(label, state, Icon) {
    return (
      <div
        className={`watch-service watch-service-${state}`}
      >
        <Icon size={20} />
        <span>{label}</span>
        <strong>
          {state === 'online'
            ? 'ONLINE'
            : state === 'error'
              ? 'ALERT'
              : 'LINKING'}
        </strong>
        <i />
      </div>
    );
  }

  return (
    <div className="watch-floor-page">
      <header className="watch-floor-header">
        <div>
          <span>CUZBRO SECURE OPERATIONS</span>
          <h1>WATCH FLOOR</h1>
        </div>

        <div className="watch-floor-clock">
          <small>
            {crew.callSign} · {crew.role}
          </small>
          <strong>{formatClock(now)}</strong>
          <span>
            LIVE TELEMETRY ·{' '}
            {lastSyncAt
              ? `SYNC ${formatClock(lastSyncAt)}`
              : 'SYNCING'}
          </span>
        </div>
      </header>

      <main className="watch-floor-grid">
        <section className="watch-panel watch-operation-panel">
          <div className="watch-panel-title">
            <Monitor size={22} />
            <span>ACTIVE OPERATION</span>
            <strong>
              {operationStatus === 'loading'
                ? 'SYNCING'
                : activeOperation
                  ? 'ACTIVE'
                  : 'STANDBY'}
            </strong>
          </div>

          {activeOperation ? (
            <div className="watch-operation-active">
              <span className="watch-live-line">
                <i /> OPERATION ACTIVE
              </span>
              <h2>{activeOperation.designation}</h2>
              <p>
                {activeOperation.target} ·{' '}
                {activeOperation.operation_type}
              </p>
              <div className="watch-operation-clock">
                <small>MISSION CLOCK</small>
                <strong>T+ {operationElapsed}</strong>
              </div>
              <div className="watch-operation-meta">
                <span>
                  INITIATED BY
                  <b>{activeOperation.initiated_by_name}</b>
                </span>
                <span>
                  OBJECTIVE
                  <b>{activeOperation.objective}</b>
                </span>
              </div>
            </div>
          ) : (
            <div className="watch-empty-state">
              <strong>OBSERVATORY STANDING BY</strong>
              <span>NO ACTIVE OPERATION REGISTERED</span>
            </div>
          )}
        </section>

        <section className="watch-panel watch-incidents-panel">
          <div className="watch-panel-title">
            <AlertTriangle size={22} />
            <span>INCIDENTS</span>
            <strong>
              {incidentStatus === 'loading'
                ? 'SYNCING'
                : activeIncidents.length}
            </strong>
          </div>

          {activeIncidents.length ? (
            <div className="watch-incident-list">
              {activeIncidents.slice(0, 3).map(
                (incident) => (
                  <article
                    key={incident.id}
                    className={`watch-incident watch-incident-${String(
                      incident.severity || 'elevated'
                    ).toLowerCase()}`}
                  >
                    <span>
                      {formatIncidentCode(incident)} ·{' '}
                      {incident.severity}
                    </span>
                    <strong>{incident.title}</strong>
                    <small>
                      {incident.affected_system}
                    </small>
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="watch-empty-state watch-nominal-state">
              <strong>ALL SYSTEMS NOMINAL</strong>
              <span>NO ACTIVE INCIDENTS</span>
            </div>
          )}
        </section>

        <section className="watch-panel watch-crew-panel">
          <div className="watch-panel-title">
            <Users size={22} />
            <span>CREW TELEMETRY</span>
            <strong>
              {presenceRows.filter(
                (member) => member.online
              ).length} / 3 ONLINE
            </strong>
          </div>

          <div className="watch-crew-list">
            {presenceRows.map((member) => (
              <article
                key={member.email}
                className={
                  member.online
                    ? 'watch-crew-member watch-crew-member-online'
                    : 'watch-crew-member'
                }
              >
                <i />
                <div>
                  <strong>{member.callSign}</strong>
                  <small>{member.role}</small>
                </div>
                <span>
                  {member.online
                    ? member.row?.page_name || 'ADMIN CONTROL'
                    : 'OFFLINE'}
                </span>
                <em>
                  {member.online
                    ? member.row?.custom_status || 'AVAILABLE'
                    : 'NO LINK'}
                </em>
              </article>
            ))}
          </div>
        </section>

        <section className="watch-panel watch-task-panel">
          <div className="watch-panel-title">
            <ClipboardList size={22} />
            <span>CREW TASKING</span>
            <strong>
              {taskStatus === 'loading'
                ? 'SYNCING'
                : `${activeTasks.length} ACTIVE`}
            </strong>
          </div>

          <div className="watch-task-metrics">
            <span>
              <b>{taskCounts.open}</b>
              OPEN
            </span>
            <span>
              <b>{taskCounts.progress}</b>
              IN PROGRESS
            </span>
            <span>
              <b>{taskCounts.blocked}</b>
              BLOCKED
            </span>
          </div>

          <div className="watch-task-list">
            {activeTasks.slice(0, 4).map((task) => (
              <article key={task.id}>
                <span>
                  {formatTaskCode(task)} · {task.priority}
                </span>
                <strong>{task.title}</strong>
                <small>
                  {formatTaskStatus(task.status)} ·{' '}
                  {task.assigned_name || 'UNASSIGNED'}
                </small>
              </article>
            ))}

            {!activeTasks.length && (
              <div className="watch-empty-state">
                <strong>ACTION QUEUE CLEAR</strong>
                <span>NO ACTIVE CREW TASKS</span>
              </div>
            )}
          </div>
        </section>

        <section className="watch-panel watch-comms-panel">
          <div className="watch-panel-title">
            <Radio size={22} />
            <span>LATEST COMMS</span>
            <strong>LIVE FEED</strong>
          </div>

          <div className="watch-comms-feed">
            {commsRows.map((message) => (
              <article key={message.id}>
                <time>{formatClock(message.created_at)}</time>
                <div>
                  <strong>
                    {String(message.crew_name || 'UNKNOWN').toUpperCase()}
                    {message.sender_status
                      ? ` ${String(message.sender_status).toUpperCase()}`
                      : ''}
                  </strong>
                  <p>{message.body}</p>
                  {(message.operation_designation ||
                    message.incident_code) && (
                    <small>
                      {[
                        message.operation_designation,
                        message.incident_code
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  )}
                </div>
              </article>
            ))}

            {!commsRows.length && (
              <div className="watch-empty-state">
                <strong>COMMS QUIET</strong>
                <span>NO TRANSMISSIONS RECEIVED</span>
              </div>
            )}
          </div>
        </section>

        <section className="watch-panel watch-systems-panel">
          <div className="watch-panel-title">
            <Activity size={22} />
            <span>SYSTEM STATE</span>
            <strong>LIVE</strong>
          </div>

          <div className="watch-service-grid">
            {renderServiceState(
              'SUPABASE DATA',
              serviceState.supabase,
              Database
            )}
            {renderServiceState(
              'REALTIME LINK',
              serviceState.realtime,
              Monitor
            )}
            {renderServiceState(
              'GALLERY API',
              serviceState.galleryApi,
              Activity
            )}
            {renderServiceState(
              'R2 STORAGE',
              serviceState.r2,
              HardDrive
            )}
          </div>

          <div className="watch-storage-summary">
            <span>
              <small>R2 STORAGE</small>
              <strong>
                {storageSummary
                  ? formatBytes(
                      storageSummary.totalBytes
                    )
                  : '--'}
              </strong>
            </span>
            <span>
              <small>OBJECTS</small>
              <strong>
                {storageSummary?.objectCount ?? '--'}
              </strong>
            </span>
          </div>

          <div className="watch-black-box-latest">
            <Radio size={18} />
            <div>
              <small>LATEST BLACK BOX EVENT</small>
              <strong>
                {latestActivity
                  ? `${String(
                      latestActivity.crew_name || 'SYSTEM'
                    ).toUpperCase()} · ${String(
                      latestActivity.action || 'SYSTEM_EVENT'
                    ).replaceAll('_', ' ')}`
                  : 'NO EVENT DATA'}
              </strong>
              <span>
                {latestActivity
                  ? `${formatEventElapsed(
                      latestActivity.created_at,
                      now
                    )}${
                      latestActivity.resource_name
                        ? ` · ${latestActivity.resource_name}`
                        : ''
                    }`
                  : 'BLACK BOX STANDING BY'}
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="watch-floor-footer">
        <span>CUZBRO WATCH FLOOR · PASSIVE MONITORING DISPLAY</span>
        <span>CTRL + K · COMMAND PALETTE</span>
      </footer>
    </div>
  );
}
