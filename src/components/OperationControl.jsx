import {
  Activity,
  ArrowLeft,
  Clock3,
  Play,
  Radio,
  Square,
  Telescope,
  Users,
  ClipboardList
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  announceOperationChange,
  formatOperationElapsed,
  recordOperationEvent,
  useActiveOperation
} from '../lib/operations.js';
import {
  getAllCrewMembers,
  getCrewMember
} from '../lib/crew.js';
import {
  logCrewActivity
} from '../lib/audit.js';
import {
  formatIncidentCode
} from '../lib/incidents.js';

const ONLINE_WINDOW_MS = 45_000;

function isPresenceOnline(row) {
  const lastSeen =
    new Date(row?.last_seen_at).getTime();

  return (
    Number.isFinite(lastSeen) &&
    Date.now() - lastSeen <=
      ONLINE_WINDOW_MS
  );
}

function formatEventTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString(
    'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function formatStorageBytes(bytes) {
  const size = Number(bytes || 0);

  if (size >= 1024 ** 3) {
    return `${(
      size / 1024 ** 3
    ).toFixed(2)} GB`;
  }

  if (size >= 1024 ** 2) {
    return `${(
      size / 1024 ** 2
    ).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(
      size / 1024
    ).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function getOperationEventDescription(event) {
  const details =
    event.details &&
    typeof event.details === 'object'
      ? event.details
      : {};

  switch (event.event_type) {
    case 'OPERATION_STARTED':
      return 'Operation initiated';

    case 'OPERATION_ENDED':
      return 'Operation completed';

    case 'TRANSFER_UPLOAD':
      return `${event.resource_name || 'Crew Transfer'} · ${Number(
        details.fileCount || 0
      )} ${
        Number(details.fileCount || 0) === 1
          ? 'file'
          : 'files'
      } · ${formatStorageBytes(
        details.totalBytes || 0
      )}`;

    case 'CAPTURE_CREATED':
      return `Capture created · ${
        event.resource_name || 'Mission capture'
      }`;

    case 'TASK_CREATED':
      return `Task created · ${
        event.resource_name || 'Crew task'
      } · ${
        details.title || 'Follow-up task'
      }`;

    case 'INCIDENT_DECLARED':
      return `Incident declared · ${
        event.resource_name || 'Incident'
      } · ${
        details.title || 'Anomaly'
      }`;

    case 'INCIDENT_RESOLVED':
      return `Incident resolved · ${
        event.resource_name || 'Incident'
      } · ${
        details.duration || 'duration unavailable'
      }`;

    default:
      return (
        event.event_label ||
        event.event_type ||
        'Operation event'
      );
  }
}

export default function OperationControl({
  session
}) {
  const crew = getCrewMember(
    session?.user?.email
  );

  const {
    activeOperation,
    operationStatus,
    operationError
  } = useActiveOperation();

  const [form, setForm] = useState({
    designation: '',
    target: '',
    operationType: 'Astrophotography',
    objective: ''
  });

  const [events, setEvents] =
    useState([]);

  const [presenceRows, setPresenceRows] =
    useState([]);

  const [summary, setSummary] =
    useState({
      transmissions: 0,
      transfers: 0,
      filesTransferred: 0,
      bytesTransferred: 0,
      capturesCreated: 0,
      blackBoxEvents: 0,
      incidents: [],
      tasks: [],
      participants: []
    });

  const [
    completedDebrief,
    setCompletedDebrief
  ] = useState(null);

  const [now, setNow] =
    useState(Date.now());

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const elapsed = useMemo(
    () =>
      activeOperation
        ? formatOperationElapsed(
            activeOperation.started_at,
            activeOperation.ended_at,
            now
          )
        : '00:00:00',
    [
      activeOperation,
      now
    ]
  );

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
    if (!activeOperation?.id) {
      setEvents([]);
      setSummary({
        transmissions: 0,
        transfers: 0,
        filesTransferred: 0,
        bytesTransferred: 0,
        capturesCreated: 0,
        blackBoxEvents: 0,
        incidents: [],
        tasks: [],
        participants: []
      });

      return undefined;
    }

    let active = true;

    async function loadOperationData() {
      const startedAt =
        activeOperation.started_at;

      const endedAt =
        activeOperation.ended_at ||
        new Date().toISOString();

      const [
        eventResponse,
        presenceResponse,
        commsResponse,
        blackBoxResponse,
        incidentResponse,
        taskResponse
      ] = await Promise.all([
        supabase
          .from('crew_operation_events')
          .select('*')
          .eq(
            'operation_id',
            activeOperation.id
          )
          .order('created_at', {
            ascending: false
          }),

        supabase
          .from('crew_presence')
          .select(
            'user_id, crew_email, crew_name, page_name, custom_status, last_seen_at'
          )
          .order('crew_name', {
            ascending: true
          }),

        supabase
          .from('crew_comms')
          .select(
            'crew_email, crew_name, created_at'
          )
          .gte(
            'created_at',
            startedAt
          )
          .lte(
            'created_at',
            endedAt
          ),

        supabase
          .from('crew_activity')
          .select(
            'crew_email, crew_name, created_at'
          )
          .gte(
            'created_at',
            startedAt
          )
          .lte(
            'created_at',
            endedAt
          ),

        supabase
          .from('crew_incidents')
          .select(
            'id, incident_number, title, severity, status, declared_at, resolved_at'
          )
          .eq(
            'operation_id',
            activeOperation.id
          )
          .order('declared_at', {
            ascending: true
          }),

        supabase
          .from('crew_tasks')
          .select(
            'id, task_code, title, priority, status, assigned_name, created_at, completed_at'
          )
          .eq(
            'operation_id',
            activeOperation.id
          )
          .order('created_at', {
            ascending: true
          })
      ]);

      const loadError =
        eventResponse.error ||
        presenceResponse.error ||
        commsResponse.error ||
        blackBoxResponse.error ||
        incidentResponse.error ||
        taskResponse.error;

      if (loadError) {
        console.error(
          'Operation telemetry load failed:',
          loadError
        );

        if (active) {
          setError(
            loadError.message ||
              'Operation telemetry unavailable.'
          );
        }

        return;
      }

      if (!active) {
        return;
      }

      const operationEvents =
        eventResponse.data || [];

      const transferEvents =
        operationEvents.filter(
          (event) =>
            event.event_type ===
            'TRANSFER_UPLOAD'
        );

      const captureEvents =
        operationEvents.filter(
          (event) =>
            event.event_type ===
            'CAPTURE_CREATED'
        );

      const participantEmails =
        new Set();

      [
        ...operationEvents,
        ...(commsResponse.data || []),
        ...(blackBoxResponse.data || [])
      ].forEach((row) => {
        const email = String(
          row.crew_email || ''
        )
          .trim()
          .toLowerCase();

        if (email) {
          participantEmails.add(email);
        }
      });

      setEvents(operationEvents);
      setPresenceRows(
        presenceResponse.data || []
      );

      setSummary({
        transmissions:
          (commsResponse.data || []).length,

        transfers:
          transferEvents.length,

        filesTransferred:
          transferEvents.reduce(
            (total, event) =>
              total +
              Number(
                event.details?.fileCount || 0
              ),
            0
          ),

        bytesTransferred:
          transferEvents.reduce(
            (total, event) =>
              total +
              Number(
                event.details?.totalBytes || 0
              ),
            0
          ),

        capturesCreated:
          captureEvents.length,

        blackBoxEvents:
          (blackBoxResponse.data || [])
            .length,

        incidents:
          incidentResponse.data || [],

        tasks:
          taskResponse.data || [],

        participants:
          getAllCrewMembers()
            .filter((member) =>
              participantEmails.has(
                member.email.toLowerCase()
              )
            )
            .map(
              (member) => member.callSign
            )
      });
    }

    loadOperationData();

    const eventChannel = supabase
      .channel(
        `operation-command-events-${activeOperation.id}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'crew_operation_events',
          filter:
            `operation_id=eq.${activeOperation.id}`
        },
        loadOperationData
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_presence'
        },
        loadOperationData
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crew_comms'
        },
        loadOperationData
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_incidents'
        },
        loadOperationData
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_tasks',
          filter:
            `operation_id=eq.${activeOperation.id}`
        },
        loadOperationData
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(
        eventChannel
      );
    };
  }, [
    activeOperation?.id,
    activeOperation?.started_at,
    activeOperation?.ended_at
  ]);

  async function sendOperationComms(
    body,
    operation
  ) {
    const payload = {
      user_id: session.user.id,
      crew_email:
        session.user.email || '',
      crew_name: 'SYSTEM',
      sender_status: null,
      operation_id:
        operation?.id || null,
      operation_designation:
        operation?.designation || null,
      body
    };

    const {
      error: commsError
    } = await supabase
      .from('crew_comms')
      .insert(payload);

    if (commsError) {
      console.error(
        'Operation comms announcement failed:',
        commsError
      );
    }
  }

  async function beginOperation(event) {
    event.preventDefault();

    const designation =
      form.designation.trim();

    const target = form.target.trim();

    const operationType =
      form.operationType.trim();

    const objective =
      form.objective.trim();

    if (
      !designation ||
      !target ||
      !operationType ||
      !objective
    ) {
      setError(
        'Complete all operation fields.'
      );

      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    setCompletedDebrief(null);

    try {
      const payload = {
        designation,
        target,
        operation_type: operationType,
        objective,
        status: 'ACTIVE',
        initiated_by_user_id:
          session.user.id,
        initiated_by_email:
          session.user.email || '',
        initiated_by_name: crew.name
      };

      const {
        data: operation,
        error: createError
      } = await supabase
        .from('crew_operations')
        .insert(payload)
        .select('*')
        .single();

      if (createError) {
        throw createError;
      }

      await recordOperationEvent({
        operation,
        eventType:
          'OPERATION_STARTED',
        eventLabel:
          'OPERATION INITIATED',
        resourceType: 'operation',
        resourceId: operation.id,
        resourceName:
          operation.designation,
        details: {
          target: operation.target,
          operationType:
            operation.operation_type
        },
        session
      });

      await logCrewActivity({
        action: 'OPERATION_STARTED',
        category: 'OPERATION',
        resourceType: 'operation',
        resourceId: operation.id,
        resourceName:
          operation.designation,
        details: {
          target: operation.target,
          operationType:
            operation.operation_type,
          objective:
            operation.objective
        }
      });

      await sendOperationComms(
        `● OPERATION INITIATED · ${operation.designation.toUpperCase()} · ${crew.callSign}`,
        operation
      );

      setForm({
        designation: '',
        target: '',
        operationType:
          'Astrophotography',
        objective: ''
      });

      setMessage(
        `OPERATION ACTIVE · ${operation.designation.toUpperCase()}`
      );

      announceOperationChange();
    } catch (beginError) {
      console.error(
        'Operation initiation failed:',
        beginError
      );

      setError(
        beginError.message ||
          'Operation could not be initiated.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function endOperation() {
    if (!activeOperation?.id) {
      return;
    }

    const confirmed = window.confirm(
      `End ${activeOperation.designation}? Any CuzBro crew member may complete an active operation.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const endedAt =
        new Date().toISOString();

      const {
        data: completedOperation,
        error: updateError
      } = await supabase
        .from('crew_operations')
        .update({
          status: 'COMPLETE',
          ended_at: endedAt,
          ended_by_user_id:
            session.user.id,
          ended_by_email:
            session.user.email || '',
          ended_by_name: crew.name
        })
        .eq(
          'id',
          activeOperation.id
        )
        .eq('status', 'ACTIVE')
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      await recordOperationEvent({
        operation:
          completedOperation,
        eventType: 'OPERATION_ENDED',
        eventLabel:
          'OPERATION COMPLETE',
        resourceType: 'operation',
        resourceId:
          completedOperation.id,
        resourceName:
          completedOperation.designation,
        details: {
          duration:
            formatOperationElapsed(
              completedOperation.started_at,
              completedOperation.ended_at
            )
        },
        session
      });

      await logCrewActivity({
        action: 'OPERATION_ENDED',
        category: 'OPERATION',
        resourceType: 'operation',
        resourceId:
          completedOperation.id,
        resourceName:
          completedOperation.designation,
        details: {
          target:
            completedOperation.target,
          duration:
            formatOperationElapsed(
              completedOperation.started_at,
              completedOperation.ended_at
            )
        }
      });

      await sendOperationComms(
        `OPERATION COMPLETE · ${completedOperation.designation.toUpperCase()} · ${crew.callSign}`,
        completedOperation
      );

      setCompletedDebrief({
        operation: completedOperation,
        summary: {
          ...summary
        }
      });

      setMessage(
        `OPERATION COMPLETE · ${completedOperation.designation.toUpperCase()}`
      );

      announceOperationChange();
    } catch (endError) {
      console.error(
        'Operation completion failed:',
        endError
      );

      setError(
        endError.message ||
          'Operation could not be completed.'
      );
    } finally {
      setSaving(false);
    }
  }

  const presenceByEmail = new Map(
    presenceRows.map((row) => [
      String(row.crew_email || '')
        .toLowerCase(),
      row
    ])
  );

  return (
    <div className="admin-page operation-page">
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

            <h1>Operation Command</h1>
          </div>
        </div>

        <button
          type="button"
          className="admin-logout"
          onClick={() => {
            window.location.href =
              '/admin';
          }}
        >
          <ArrowLeft size={17} />
          CONTROL CENTER
        </button>
      </header>

      <main className="admin-main">
        <section className="admin-log-heading">
          <div>
            <span className="admin-eyebrow">
              SHARED CREW OPERATIONS
            </span>

            <h2>Operation Command</h2>

            <p>
              Initiate, monitor, and complete
              active CuzBro operations. Dave,
              Justin, and Chappy have equal
              operation authority.
            </p>
          </div>

          <div className="operation-equal-crew">
            <Users size={18} />
            EQUAL CREW AUTHORITY
          </div>
        </section>

        {message && (
          <div className="admin-success-message">
            {message}
          </div>
        )}

        {(error || operationError) && (
          <div className="admin-error-message">
            {error || operationError}
          </div>
        )}

        {operationStatus === 'loading' && (
          <section className="operation-standby-panel">
            ESTABLISHING OPERATION LINK...
          </section>
        )}

        {operationStatus === 'ready' &&
          !activeOperation && (
            <section className="operation-init-panel">
              <div className="operation-standby-copy">
                <span className="admin-card-eyebrow">
                  ACTIVE OPERATION
                </span>

                <h3>
                  Observatory Standing By
                </h3>

                <p>
                  No active operation is
                  currently registered.
                </p>
              </div>

              <form
                className="operation-init-form"
                onSubmit={beginOperation}
              >
                <label>
                  <span>
                    OPERATION DESIGNATION
                  </span>

                  <input
                    value={form.designation}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          designation:
                            event.target.value
                        })
                      )
                    }
                    placeholder="M51 Deep Capture"
                    disabled={saving}
                  />
                </label>

                <label>
                  <span>TARGET</span>

                  <input
                    value={form.target}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          target:
                            event.target.value
                        })
                      )
                    }
                    placeholder="Whirlpool Galaxy"
                    disabled={saving}
                  />
                </label>

                <label>
                  <span>OPERATION TYPE</span>

                  <input
                    value={form.operationType}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          operationType:
                            event.target.value
                        })
                      )
                    }
                    placeholder="Astrophotography"
                    disabled={saving}
                  />
                </label>

                <label className="operation-objective-field">
                  <span>OBJECTIVE</span>

                  <textarea
                    value={form.objective}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          objective:
                            event.target.value
                        })
                      )
                    }
                    placeholder="Capture three hours of calibrated light data"
                    disabled={saving}
                  />
                </label>

                <div className="operation-init-meta">
                  <span>
                    INITIATED BY
                  </span>

                  <strong>
                    {crew.callSign}
                  </strong>
                </div>

                <button
                  type="submit"
                  className="operation-start-button"
                  disabled={saving}
                >
                  <Play size={18} />

                  {saving
                    ? 'INITIATING'
                    : 'BEGIN OPERATION'}
                </button>
              </form>
            </section>
          )}

        {activeOperation && (
          <>
            <section className="operation-command-hero">
              <div className="operation-live-block">
                <span>
                  <i />
                  OPERATION ACTIVE
                </span>

                <h3>
                  {
                    activeOperation.designation
                  }
                </h3>

                <strong>
                  {
                    activeOperation.target
                  }
                </strong>

                <p>
                  {
                    activeOperation.objective
                  }
                </p>
              </div>

              <div className="operation-clock-block">
                <span>
                  <Clock3 size={18} />
                  MISSION CLOCK
                </span>

                <strong>T+ {elapsed}</strong>
              </div>

              <div className="operation-command-facts">
                <div>
                  <span>TYPE</span>
                  <strong>
                    {
                      activeOperation.operation_type
                    }
                  </strong>
                </div>

                <div>
                  <span>INITIATED BY</span>
                  <strong>
                    {
                      activeOperation.initiated_by_name
                    }
                  </strong>
                </div>

                <div>
                  <span>STATUS</span>
                  <strong>ACTIVE</strong>
                </div>
              </div>

              <button
                type="button"
                className="operation-end-button"
                onClick={endOperation}
                disabled={saving}
              >
                <Square size={17} />

                {saving
                  ? 'UPDATING'
                  : 'END OPERATION'}
              </button>
            </section>

            <section className="operation-telemetry-grid">
              <article>
                <Radio size={19} />
                <span>TRANSMISSIONS</span>
                <strong>
                  {summary.transmissions}
                </strong>
              </article>

              <article>
                <Activity size={19} />
                <span>TRANSFERS</span>
                <strong>
                  {summary.transfers}
                </strong>
              </article>

              <article>
                <Telescope size={19} />
                <span>CAPTURES CREATED</span>
                <strong>
                  {summary.capturesCreated}
                </strong>
              </article>

              <article>
                <Activity size={19} />
                <span>INCIDENTS</span>
                <strong>
                  {summary.incidents.length}
                </strong>
              </article>

              <article>
                <ClipboardList size={19} />
                <span>TASKS</span>
                <strong>
                  {summary.tasks.length}
                </strong>
              </article>

              <article>
                <Users size={19} />
                <span>CREW PARTICIPATION</span>
                <strong>
                  {summary.participants.length}
                  {' / '}
                  {getAllCrewMembers().length}
                </strong>
              </article>
            </section>

            <section className="operation-layout">
              <article className="operation-panel">
                <div className="operation-panel-heading">
                  <div>
                    <span className="admin-card-eyebrow">
                      CREW TELEMETRY
                    </span>

                    <h3>Operation Crew</h3>
                  </div>
                </div>

                <div className="operation-crew-list">
                  {getAllCrewMembers().map(
                    (member) => {
                      const row =
                        presenceByEmail.get(
                          member.email.toLowerCase()
                        );

                      const online =
                        isPresenceOnline(row);

                      return (
                        <div
                          key={member.email}
                          className={
                            online
                              ? 'operation-crew-row operation-crew-row-online'
                              : 'operation-crew-row'
                          }
                        >
                          <i />

                          <div>
                            <strong>
                              {
                                member.callSign
                              }
                            </strong>

                            <span>
                              {member.role}
                            </span>
                          </div>

                          <div>
                            <strong>
                              {online
                                ? row?.page_name ||
                                  'ADMIN'
                                : 'OFFLINE'}
                            </strong>

                            <span>
                              {online
                                ? row
                                    ?.custom_status ||
                                  'AVAILABLE'
                                : 'NO LINK'}
                            </span>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </article>

              <article className="operation-panel">
                <div className="operation-panel-heading">
                  <div>
                    <span className="admin-card-eyebrow">
                      OPERATION ACTIVITY
                    </span>

                    <h3>Live Timeline</h3>
                  </div>

                  <strong>
                    {events.length} EVENTS
                  </strong>
                </div>

                <div className="operation-event-list">
                  {events.length === 0 ? (
                    <p>
                      No operation events
                      recorded yet.
                    </p>
                  ) : (
                    events.map((event) => (
                      <div
                        key={event.id}
                        className="operation-event-row"
                      >
                        <time>
                          [
                          {formatEventTime(
                            event.created_at
                          )}
                          ]
                        </time>

                        <strong>
                          {String(
                            event.crew_name ||
                              'SYSTEM'
                          ).toUpperCase()}
                        </strong>

                        <span>
                          {
                            getOperationEventDescription(
                              event
                            )
                          }
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>

            <section className="operation-debrief-preview">
              <span className="admin-card-eyebrow">
                LIVE DEBRIEF TELEMETRY
              </span>

              <div>
                <p>
                  <span>FILES TRANSFERRED</span>
                  <strong>
                    {
                      summary.filesTransferred
                    }
                  </strong>
                </p>

                <p>
                  <span>DATA MOVED</span>
                  <strong>
                    {formatStorageBytes(
                      summary.bytesTransferred
                    )}
                  </strong>
                </p>

                <p>
                  <span>BLACK BOX EVENTS</span>
                  <strong>
                    {
                      summary.blackBoxEvents
                    }
                  </strong>
                </p>

                <p>
                  <span>PARTICIPATED</span>
                  <strong>
                    {summary.participants.length
                      ? summary.participants.join(
                          ' · '
                        )
                      : '—'}
                  </strong>
                </p>
              </div>
            </section>
          </>
        )}

        {!activeOperation &&
          completedDebrief && (
            <section className="operation-complete-debrief">
              <div className="operation-complete-heading">
                <span className="admin-card-eyebrow">
                  OPERATION COMPLETE
                </span>

                <h3>
                  {
                    completedDebrief.operation
                      .designation
                  }
                </h3>

                <p>
                  {
                    completedDebrief.operation
                      .target
                  }
                </p>
              </div>

              <div className="operation-complete-duration">
                <span>DURATION</span>

                <strong>
                  {formatOperationElapsed(
                    completedDebrief.operation
                      .started_at,
                    completedDebrief.operation
                      .ended_at
                  )}
                </strong>
              </div>

              <div className="operation-complete-grid">
                <p>
                  <span>INITIATED BY</span>
                  <strong>
                    {String(
                      completedDebrief.operation
                        .initiated_by_name ||
                        'CREW'
                    ).toUpperCase()}
                  </strong>
                </p>

                <p>
                  <span>ENDED BY</span>
                  <strong>
                    {String(
                      completedDebrief.operation
                        .ended_by_name ||
                        'CREW'
                    ).toUpperCase()}
                  </strong>
                </p>

                <p>
                  <span>TRANSMISSIONS</span>
                  <strong>
                    {
                      completedDebrief.summary
                        .transmissions
                    }
                  </strong>
                </p>

                <p>
                  <span>CREW TRANSFERS</span>
                  <strong>
                    {
                      completedDebrief.summary
                        .transfers
                    }
                  </strong>
                </p>

                <p>
                  <span>FILES TRANSFERRED</span>
                  <strong>
                    {
                      completedDebrief.summary
                        .filesTransferred
                    }
                  </strong>
                </p>

                <p>
                  <span>DATA MOVED</span>
                  <strong>
                    {formatStorageBytes(
                      completedDebrief.summary
                        .bytesTransferred
                    )}
                  </strong>
                </p>

                <p>
                  <span>CAPTURES CREATED</span>
                  <strong>
                    {
                      completedDebrief.summary
                        .capturesCreated
                    }
                  </strong>
                </p>

                <p>
                  <span>INCIDENTS</span>
                  <strong>
                    {completedDebrief.summary
                      .incidents.length
                      ? completedDebrief.summary
                          .incidents.map(
                            (incident) =>
                              `${formatIncidentCode(
                                incident
                              )} · ${incident.status}`
                          )
                          .join(' · ')
                      : 'NONE'}
                  </strong>
                </p>

                <p>
                  <span>TASKS</span>
                  <strong>
                    {completedDebrief.summary
                      .tasks.length
                      ? `${completedDebrief.summary.tasks.length} CREATED · ${completedDebrief.summary.tasks.filter(
                          (task) =>
                            task.status === 'COMPLETE'
                        ).length} COMPLETE · ${completedDebrief.summary.tasks.filter(
                          (task) =>
                            task.status !== 'COMPLETE'
                        ).length} OPEN`
                      : 'NONE'}
                  </strong>
                </p>

                <p>
                  <span>OPEN FOLLOW-UP</span>
                  <strong>
                    {completedDebrief.summary
                      .tasks.filter(
                        (task) =>
                          task.status !== 'COMPLETE'
                      ).length
                      ? completedDebrief.summary.tasks
                          .filter(
                            (task) =>
                              task.status !== 'COMPLETE'
                          )
                          .map(
                            (task) =>
                              `${task.task_code} · ${task.title} · ${String(
                                task.assigned_name || 'UNASSIGNED'
                              ).toUpperCase()}`
                          )
                          .join(' · ')
                      : 'NONE'}
                  </strong>
                </p>

                <p>
                  <span>CREW PARTICIPATION</span>
                  <strong>
                    {completedDebrief.summary
                      .participants.length
                      ? completedDebrief.summary
                          .participants.join(' · ')
                      : '—'}
                  </strong>
                </p>
              </div>

              <small>
                OPERATION ARCHIVED IN CREW OPERATIONS · BLACK BOX EVENT RECORDED
              </small>
            </section>
          )}
      </main>
    </div>
  );
}
