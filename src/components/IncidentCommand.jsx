import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  History,
  Radio,
  ShieldAlert,
  Wrench
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  announceIncidentChange,
  formatIncidentCode,
  formatIncidentElapsed,
  useActiveIncidents
} from '../lib/incidents.js';
import {
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
  announceTaskChange,
  formatTaskCode,
  recordTaskEvent
} from '../lib/tasks.js';

const UPDATE_TYPES = [
  'OBSERVATION',
  'MITIGATION',
  'TEST',
  'RESOLUTION NOTE'
];

const SEVERITIES = [
  'LOW',
  'ELEVATED',
  'CRITICAL'
];

function formatDateTime(value) {
  if (!value) {
    return 'UNKNOWN';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'UNKNOWN';
  }

  return date.toLocaleString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }
  );
}

function formatUpdateTime(value) {
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

export default function IncidentCommand({
  session
}) {
  const crew = getCrewMember(
    session?.user?.email
  );

  const {
    activeIncidents,
    primaryIncident,
    incidentStatus,
    incidentError
  } = useActiveIncidents();

  const {
    activeOperation
  } = useActiveOperation();

  const [incidents, setIncidents] =
    useState([]);

  const [selectedId, setSelectedId] =
    useState(null);

  const [updates, setUpdates] =
    useState([]);

  const [form, setForm] = useState({
    title: '',
    severity: 'ELEVATED',
    affectedSystem: 'TELESCOPE',
    description: ''
  });

  const [updateType, setUpdateType] =
    useState('OBSERVATION');

  const [updateBody, setUpdateBody] =
    useState('');

  const [resolution, setResolution] =
    useState({
      rootCause: '',
      resolution: '',
      followUpRequired: true,
      followUp: '',
      createFollowUpTask: true,
      followUpAssignee:
        session?.user?.email || ''
    });

  const [showDeclare, setShowDeclare] =
    useState(() => {
      const params = new URLSearchParams(
        window.location.search
      );

      return params.get('declare') === 'true';
    });

  const [showResolve, setShowResolve] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [now, setNow] =
    useState(Date.now());

  const selectedIncident = useMemo(
    () =>
      incidents.find(
        (incident) =>
          incident.id === selectedId
      ) ||
      primaryIncident ||
      incidents[0] ||
      null,
    [
      incidents,
      selectedId,
      primaryIncident
    ]
  );

  useEffect(() => {
    const timerId = window.setInterval(
      () => {
        setNow(Date.now());
      },
      1000
    );

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadIncidents() {
      const {
        data,
        error: loadError
      } = await supabase
        .from('crew_incidents')
        .select('*')
        .order('incident_number', {
          ascending: false
        });

      if (loadError) {
        console.error(
          'Incident archive load failed:',
          loadError
        );

        if (active) {
          setError(
            loadError.message ||
              'Incident archive unavailable.'
          );
        }

        return;
      }

      if (!active) {
        return;
      }

      setIncidents(data || []);

      setSelectedId(
        (current) =>
          current ||
          primaryIncident?.id ||
          data?.[0]?.id ||
          null
      );
    }

    loadIncidents();

    const channel = supabase
      .channel('incident-command-incidents')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_incidents'
        },
        loadIncidents
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [primaryIncident?.id]);

  useEffect(() => {
    if (!selectedIncident?.id) {
      setUpdates([]);
      return undefined;
    }

    let active = true;

    async function loadUpdates() {
      const {
        data,
        error: loadError
      } = await supabase
        .from('crew_incident_updates')
        .select('*')
        .eq(
          'incident_id',
          selectedIncident.id
        )
        .order('created_at', {
          ascending: true
        });

      if (loadError) {
        console.error(
          'Incident updates load failed:',
          loadError
        );

        return;
      }

      if (active) {
        setUpdates(data || []);
      }
    }

    loadUpdates();

    const channel = supabase
      .channel(
        `incident-updates-${selectedIncident.id}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_incident_updates',
          filter:
            `incident_id=eq.${selectedIncident.id}`
        },
        loadUpdates
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [selectedIncident?.id]);

  async function sendIncidentComms(
    body,
    incident
  ) {
    const {
      error: commsError
    } = await supabase
      .from('crew_comms')
      .insert({
        user_id: session.user.id,
        crew_email:
          session.user.email || '',
        crew_name: 'SYSTEM',
        sender_status: null,
        operation_id:
          incident?.operation_id || null,
        operation_designation:
          incident?.operation_designation ||
          null,
        incident_id:
          incident?.id || null,
        incident_code:
          incident
            ? formatIncidentCode(incident)
            : null,
        incident_title:
          incident?.title || null,
        body
      });

    if (commsError) {
      console.error(
        'Incident comms announcement failed:',
        commsError
      );
    }
  }

  async function declareIncident(event) {
    event.preventDefault();

    const title = form.title.trim();
    const affectedSystem =
      form.affectedSystem.trim();
    const description =
      form.description.trim();

    if (
      !title ||
      !affectedSystem ||
      !description
    ) {
      setError(
        'Complete all incident fields.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        title,
        severity: form.severity,
        affected_system: affectedSystem,
        initial_report: description,
        status: 'ACTIVE',
        historical: false,
        declared_by_user_id:
          session.user.id,
        declared_by_email:
          session.user.email || '',
        declared_by_name: crew.name,
        operation_id:
          activeOperation?.id || null,
        operation_designation:
          activeOperation?.designation ||
          null
      };

      const {
        data: incident,
        error: createError
      } = await supabase
        .from('crew_incidents')
        .insert(payload)
        .select('*')
        .single();

      if (createError) {
        throw createError;
      }

      await supabase
        .from('crew_incident_updates')
        .insert({
          incident_id: incident.id,
          user_id: session.user.id,
          crew_email:
            session.user.email || '',
          crew_name: crew.name,
          update_type: 'OBSERVATION',
          body: description
        });

      if (activeOperation?.id) {
        await recordOperationEvent({
          operation: activeOperation,
          eventType: 'INCIDENT_DECLARED',
          eventLabel: 'INCIDENT DECLARED',
          resourceType: 'incident',
          resourceId: incident.id,
          resourceName:
            formatIncidentCode(incident),
          details: {
            title: incident.title,
            severity: incident.severity,
            affectedSystem:
              incident.affected_system
          },
          session
        });
      }

      await logCrewActivity({
        action: 'INCIDENT_DECLARED',
        category: 'INCIDENT',
        resourceType: 'incident',
        resourceId: incident.id,
        resourceName:
          formatIncidentCode(incident),
        details: {
          title: incident.title,
          severity: incident.severity,
          affectedSystem:
            incident.affected_system,
          operationId:
            incident.operation_id
        }
      });

      await sendIncidentComms(
        `⚠ INCIDENT DECLARED · ${formatIncidentCode(
          incident
        )} · ${incident.title.toUpperCase()} · ${incident.severity} · ${crew.callSign}`,
        incident
      );

      setForm({
        title: '',
        severity: 'ELEVATED',
        affectedSystem: 'TELESCOPE',
        description: ''
      });

      setShowDeclare(false);
      setSelectedId(incident.id);
      setMessage(
        `INCIDENT ACTIVE · ${formatIncidentCode(
          incident
        )}`
      );

      announceIncidentChange();
    } catch (declareError) {
      console.error(
        'Incident declaration failed:',
        declareError
      );

      setError(
        declareError.message ||
          'Incident could not be declared.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function addUpdate(event) {
    event.preventDefault();

    if (
      !selectedIncident?.id ||
      selectedIncident.status !== 'ACTIVE'
    ) {
      return;
    }

    const body = updateBody.trim();

    if (!body) {
      setError(
        'Enter an incident update.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const {
        error: insertError
      } = await supabase
        .from('crew_incident_updates')
        .insert({
          incident_id:
            selectedIncident.id,
          user_id: session.user.id,
          crew_email:
            session.user.email || '',
          crew_name: crew.name,
          update_type: updateType,
          body
        });

      if (insertError) {
        throw insertError;
      }

      await logCrewActivity({
        action: 'INCIDENT_UPDATE',
        category: 'INCIDENT',
        resourceType: 'incident',
        resourceId:
          selectedIncident.id,
        resourceName:
          formatIncidentCode(
            selectedIncident
          ),
        details: {
          updateType,
          body
        }
      });

      setUpdateBody('');
      setMessage(
        `${updateType} LOGGED · ${formatIncidentCode(
          selectedIncident
        )}`
      );
    } catch (updateError) {
      setError(
        updateError.message ||
          'Incident update could not be logged.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function resolveIncident(event) {
    event.preventDefault();

    if (
      !selectedIncident?.id ||
      selectedIncident.status !== 'ACTIVE'
    ) {
      return;
    }

    const rootCause =
      resolution.rootCause.trim();

    const resolutionText =
      resolution.resolution.trim();

    const followUp =
      resolution.followUp.trim();

    if (
      !rootCause ||
      !resolutionText ||
      (
        resolution.followUpRequired &&
        !followUp
      )
    ) {
      setError(
        'Complete the resolution fields.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const resolvedAt =
        new Date().toISOString();

      const {
        data: resolvedIncident,
        error: updateError
      } = await supabase
        .from('crew_incidents')
        .update({
          status: 'RESOLVED',
          root_cause: rootCause,
          resolution: resolutionText,
          follow_up_required:
            resolution.followUpRequired,
          follow_up:
            resolution.followUpRequired
              ? followUp
              : null,
          resolved_at: resolvedAt,
          resolved_by_user_id:
            session.user.id,
          resolved_by_email:
            session.user.email || '',
          resolved_by_name: crew.name
        })
        .eq('id', selectedIncident.id)
        .eq('status', 'ACTIVE')
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      await supabase
        .from('crew_incident_updates')
        .insert({
          incident_id:
            resolvedIncident.id,
          user_id: session.user.id,
          crew_email:
            session.user.email || '',
          crew_name: crew.name,
          update_type:
            'RESOLUTION NOTE',
          body: resolutionText
        });

      let followUpTask = null;

      if (
        resolution.followUpRequired &&
        resolution.createFollowUpTask
      ) {
        const assignee =
          getAllCrewMembers().find(
            (member) =>
              member.email ===
              resolution.followUpAssignee
          );

        const {
          data: createdTask,
          error: taskError
        } = await supabase
          .from('crew_tasks')
          .insert({
            title: `Follow up: ${resolvedIncident.title}`,
            description: followUp,
            priority:
              resolvedIncident.severity === 'CRITICAL'
                ? 'HIGH'
                : 'NORMAL',
            status: 'OPEN',
            assigned_email:
              assignee?.email || null,
            assigned_name:
              assignee?.name || null,
            source_type: 'INCIDENT',
            source_id: resolvedIncident.id,
            source_code:
              formatIncidentCode(
                resolvedIncident
              ),
            source_name:
              resolvedIncident.title,
            operation_id:
              resolvedIncident.operation_id || null,
            operation_designation:
              resolvedIncident.operation_designation || null,
            created_by_user_id:
              session.user.id,
            created_by_email:
              session.user.email || '',
            created_by_name: crew.name
          })
          .select('*')
          .single();

        if (taskError) {
          throw taskError;
        }

        followUpTask = createdTask;

        await recordTaskEvent({
          task: createdTask,
          eventType: 'TASK_CREATED',
          eventLabel:
            'Incident follow-up task created',
          details: {
            sourceCode:
              formatIncidentCode(
                resolvedIncident
              ),
            sourceName:
              resolvedIncident.title,
            assignedTo:
              createdTask.assigned_name
          },
          session
        });

        await logCrewActivity({
          action: 'TASK_CREATED',
          category: 'TASK',
          resourceType: 'crew_task',
          resourceId: createdTask.id,
          resourceName:
            formatTaskCode(createdTask),
          details: {
            title: createdTask.title,
            priority: createdTask.priority,
            assignedTo:
              createdTask.assigned_name,
            sourceType: 'INCIDENT',
            sourceCode:
              formatIncidentCode(
                resolvedIncident
              ),
            sourceName:
              resolvedIncident.title
          }
        });

        if (
          resolvedIncident.operation_id &&
          activeOperation?.id ===
            resolvedIncident.operation_id
        ) {
          await recordOperationEvent({
            operation: activeOperation,
            eventType: 'TASK_CREATED',
            eventLabel: 'TASK CREATED',
            resourceType: 'crew_task',
            resourceId: createdTask.id,
            resourceName:
              formatTaskCode(createdTask),
            details: {
              title: createdTask.title,
              priority: createdTask.priority,
              assignedTo:
                createdTask.assigned_name,
              sourceCode:
                formatIncidentCode(
                  resolvedIncident
                )
            },
            session
          });
        }

        announceTaskChange(createdTask);
      }

      if (
        resolvedIncident.operation_id &&
        activeOperation?.id ===
          resolvedIncident.operation_id
      ) {
        await recordOperationEvent({
          operation: activeOperation,
          eventType: 'INCIDENT_RESOLVED',
          eventLabel: 'INCIDENT RESOLVED',
          resourceType: 'incident',
          resourceId:
            resolvedIncident.id,
          resourceName:
            formatIncidentCode(
              resolvedIncident
            ),
          details: {
            title:
              resolvedIncident.title,
            severity:
              resolvedIncident.severity,
            duration:
              formatIncidentElapsed(
                resolvedIncident.declared_at,
                resolvedIncident.resolved_at
              )
          },
          session
        });
      }

      await logCrewActivity({
        action: 'INCIDENT_RESOLVED',
        category: 'INCIDENT',
        resourceType: 'incident',
        resourceId:
          resolvedIncident.id,
        resourceName:
          formatIncidentCode(
            resolvedIncident
          ),
        details: {
          title: resolvedIncident.title,
          severity:
            resolvedIncident.severity,
          rootCause,
          resolution: resolutionText,
          followUpRequired:
            resolution.followUpRequired,
          followUp:
            resolution.followUpRequired
              ? followUp
              : null,
          duration:
            formatIncidentElapsed(
              resolvedIncident.declared_at,
              resolvedIncident.resolved_at
            )
        }
      });

      await sendIncidentComms(
        `✓ INCIDENT RESOLVED · ${formatIncidentCode(
          resolvedIncident
        )} · ${resolvedIncident.title.toUpperCase()} · ${crew.callSign}`,
        resolvedIncident
      );

      setResolution({
        rootCause: '',
        resolution: '',
        followUpRequired: true,
        followUp: '',
        createFollowUpTask: true,
        followUpAssignee:
          session?.user?.email || ''
      });

      setShowResolve(false);
      setMessage(
        `INCIDENT RESOLVED · ${formatIncidentCode(
          resolvedIncident
        )}${
          followUpTask
            ? ` · ${formatTaskCode(
                followUpTask
              )} CREATED`
            : ''
        }`
      );

      announceIncidentChange();
    } catch (resolveError) {
      setError(
        resolveError.message ||
          'Incident could not be resolved.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page incident-page">
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
            <span>SECURE CREW TERMINAL</span>
            <h1>Incident Command</h1>
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
              ANOMALY RESPONSE
            </span>

            <h2>Incident Command</h2>

            <p>
              Declare, investigate, document,
              and resolve CuzBro hardware and
              software anomalies. All three crew
              members have equal incident authority.
            </p>
          </div>

          <button
            type="button"
            className="incident-declare-button"
            onClick={() => {
              setShowDeclare(
                (current) => !current
              );
            }}
          >
            <ShieldAlert size={18} />
            DECLARE INCIDENT
          </button>
        </section>

        {incidentError && (
          <div className="admin-error-message">
            {incidentError}
          </div>
        )}

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        {message && (
          <div className="admin-success-message">
            {message}
          </div>
        )}

        <section
          className={`incident-state-banner${
            activeIncidents.length
              ? ' incident-state-banner-active'
              : ''
          }`}
        >
          <div>
            {activeIncidents.length ? (
              <>
                <span>
                  <AlertTriangle size={17} />
                  ACTIVE INCIDENTS
                </span>

                <strong>
                  {activeIncidents.length}
                </strong>

                <p>
                  {
                    primaryIncident?.title
                  }
                </p>
              </>
            ) : (
              <>
                <span>
                  <CheckCircle2 size={17} />
                  INCIDENT STATUS
                </span>

                <strong>
                  ALL SYSTEMS NOMINAL
                </strong>

                <p>
                  No active incidents.
                </p>
              </>
            )}
          </div>

          <small>
            {incidentStatus === 'loading'
              ? 'SYNCING INCIDENT LINK'
              : activeOperation
                ? `ACTIVE OPERATION · ${activeOperation.designation}`
                : 'NO ACTIVE OPERATION'}
          </small>
        </section>

        {showDeclare && (
          <form
            className="incident-form"
            onSubmit={declareIncident}
          >
            <div className="incident-form-heading">
              <span className="admin-card-eyebrow">
                DECLARE INCIDENT
              </span>

              <h3>Initial Incident Report</h3>

              <p>
                Declared by{' '}
                <strong>
                  {crew.callSign}
                </strong>
                {activeOperation
                  ? ` · linked to ${activeOperation.designation}`
                  : ''}
              </p>
            </div>

            <label>
              INCIDENT TITLE
              <input
                value={form.title}
                maxLength={160}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    title:
                      event.target.value
                  }));
                }}
                placeholder="CPC 800 power interruption"
              />
            </label>

            <div className="incident-form-grid">
              <label>
                SEVERITY
                <select
                  value={form.severity}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      severity:
                        event.target.value
                    }));
                  }}
                >
                  {SEVERITIES.map(
                    (severity) => (
                      <option
                        key={severity}
                        value={severity}
                      >
                        {severity}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                AFFECTED SYSTEM
                <input
                  value={
                    form.affectedSystem
                  }
                  maxLength={120}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      affectedSystem:
                        event.target.value
                    }));
                  }}
                />
              </label>
            </div>

            <label>
              INITIAL REPORT
              <textarea
                value={form.description}
                maxLength={1500}
                rows={5}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    description:
                      event.target.value
                  }));
                }}
                placeholder="Describe the anomaly and immediate conditions."
              />
            </label>

            <button
              type="submit"
              className="incident-primary-button"
              disabled={saving}
            >
              <AlertTriangle size={17} />
              {saving
                ? 'DECLARING'
                : 'DECLARE INCIDENT'}
            </button>
          </form>
        )}

        <section className="incident-layout">
          <aside className="incident-archive">
            <div className="incident-panel-heading">
              <div>
                <span className="admin-card-eyebrow">
                  INCIDENT ARCHIVE
                </span>

                <h3>Recorded Incidents</h3>
              </div>

              <History size={20} />
            </div>

            <div className="incident-archive-list">
              {incidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  className={`incident-archive-item${
                    selectedIncident?.id ===
                    incident.id
                      ? ' incident-archive-item-active'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedId(incident.id);
                    setShowResolve(false);
                  }}
                >
                  <span>
                    {formatIncidentCode(
                      incident
                    )}
                  </span>

                  <strong>
                    {incident.title}
                  </strong>

                  <small>
                    {incident.severity} ·{' '}
                    {incident.status}
                    {incident.historical
                      ? ' · HISTORICAL'
                      : ''}
                  </small>
                </button>
              ))}

              {!incidents.length && (
                <p className="incident-empty">
                  NO INCIDENTS RECORDED
                </p>
              )}
            </div>
          </aside>

          <div className="incident-command-column">
            {selectedIncident ? (
              <>
                <section
                  className={`incident-detail incident-severity-${selectedIncident.severity.toLowerCase()}`}
                >
                  <div className="incident-detail-top">
                    <div>
                      <span>
                        {formatIncidentCode(
                          selectedIncident
                        )}
                      </span>

                      <h3>
                        {selectedIncident.title}
                      </h3>

                      <p>
                        {selectedIncident.affected_system}
                      </p>
                    </div>

                    <div className="incident-detail-state">
                      <strong>
                        {selectedIncident.severity}
                      </strong>

                      <span>
                        {selectedIncident.status}
                      </span>
                    </div>
                  </div>

                  <div className="incident-facts">
                    <p>
                      <span>DECLARED BY</span>
                      <strong>
                        {String(
                          selectedIncident.declared_by_name ||
                            'CREW'
                        ).toUpperCase()}
                      </strong>
                    </p>

                    <p>
                      <span>DECLARED</span>
                      <strong>
                        {selectedIncident.historical
                          ? 'RETROSPECTIVE ENTRY'
                          : formatDateTime(
                              selectedIncident.declared_at
                            )}
                      </strong>
                    </p>

                    <p>
                      <span>DURATION</span>
                      <strong>
                        {selectedIncident.historical
                          ? 'NOT RECORDED'
                          : formatIncidentElapsed(
                              selectedIncident.declared_at,
                              selectedIncident.resolved_at,
                              now
                            )}
                      </strong>
                    </p>

                    <p>
                      <span>RELATED OPERATION</span>
                      <strong>
                        {selectedIncident.operation_designation ||
                          '—'}
                      </strong>
                    </p>
                  </div>

                  <div className="incident-report-block">
                    <span>INITIAL REPORT</span>
                    <p>
                      {
                        selectedIncident.initial_report
                      }
                    </p>
                  </div>

                  {selectedIncident.status ===
                    'RESOLVED' && (
                    <div className="incident-resolution-grid">
                      <div>
                        <span>ROOT CAUSE</span>
                        <p>
                          {selectedIncident.root_cause ||
                            '—'}
                        </p>
                      </div>

                      <div>
                        <span>RESOLUTION</span>
                        <p>
                          {selectedIncident.resolution ||
                            '—'}
                        </p>
                      </div>

                      <div>
                        <span>FOLLOW-UP</span>
                        <p>
                          {selectedIncident.follow_up_required
                            ? selectedIncident.follow_up ||
                              'REQUIRED'
                            : 'NONE REQUIRED'}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedIncident.status ===
                    'ACTIVE' && (
                    <button
                      type="button"
                      className="incident-resolve-button"
                      onClick={() => {
                        setShowResolve(
                          (current) => !current
                        );
                      }}
                    >
                      <CheckCircle2 size={17} />
                      RESOLVE INCIDENT
                    </button>
                  )}
                </section>

                {showResolve &&
                  selectedIncident.status ===
                    'ACTIVE' && (
                  <form
                    className="incident-form incident-resolution-form"
                    onSubmit={resolveIncident}
                  >
                    <span className="admin-card-eyebrow">
                      RESOLVE INCIDENT
                    </span>

                    <h3>
                      Resolution Record
                    </h3>

                    <label>
                      ROOT CAUSE
                      <textarea
                        rows={3}
                        value={
                          resolution.rootCause
                        }
                        onChange={(event) => {
                          setResolution(
                            (current) => ({
                              ...current,
                              rootCause:
                                event.target.value
                            })
                          );
                        }}
                      />
                    </label>

                    <label>
                      RESOLUTION
                      <textarea
                        rows={3}
                        value={
                          resolution.resolution
                        }
                        onChange={(event) => {
                          setResolution(
                            (current) => ({
                              ...current,
                              resolution:
                                event.target.value
                            })
                          );
                        }}
                      />
                    </label>

                    <label className="incident-checkbox">
                      <input
                        type="checkbox"
                        checked={
                          resolution.followUpRequired
                        }
                        onChange={(event) => {
                          setResolution(
                            (current) => ({
                              ...current,
                              followUpRequired:
                                event.target.checked
                            })
                          );
                        }}
                      />

                      FOLLOW-UP REQUIRED
                    </label>

                    {resolution.followUpRequired && (
                      <>
                        <label>
                          FOLLOW-UP
                          <textarea
                            rows={3}
                            value={
                              resolution.followUp
                            }
                            onChange={(event) => {
                              setResolution(
                                (current) => ({
                                  ...current,
                                  followUp:
                                    event.target.value
                                })
                              );
                            }}
                          />
                        </label>

                        <label className="incident-checkbox">
                          <input
                            type="checkbox"
                            checked={
                              resolution.createFollowUpTask
                            }
                            onChange={(event) => {
                              setResolution(
                                (current) => ({
                                  ...current,
                                  createFollowUpTask:
                                    event.target.checked
                                })
                              );
                            }}
                          />

                          CREATE FOLLOW-UP TASK
                        </label>

                        {resolution.createFollowUpTask && (
                          <label>
                            ASSIGN FOLLOW-UP TASK
                            <select
                              value={
                                resolution.followUpAssignee
                              }
                              onChange={(event) => {
                                setResolution(
                                  (current) => ({
                                    ...current,
                                    followUpAssignee:
                                      event.target.value
                                  })
                                );
                              }}
                            >
                              <option value="">
                                UNASSIGNED
                              </option>

                              {getAllCrewMembers().map(
                                (member) => (
                                  <option
                                    key={member.email}
                                    value={member.email}
                                  >
                                    {member.callSign} · {member.role}
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                        )}
                      </>
                    )}

                    <button
                      type="submit"
                      className="incident-primary-button"
                      disabled={saving}
                    >
                      <CheckCircle2 size={17} />
                      {saving
                        ? 'RESOLVING'
                        : 'CONFIRM RESOLUTION'}
                    </button>
                  </form>
                )}

                <section className="incident-timeline">
                  <div className="incident-panel-heading">
                    <div>
                      <span className="admin-card-eyebrow">
                        INCIDENT TIMELINE
                      </span>

                      <h3>Response Log</h3>
                    </div>

                    <Clock3 size={20} />
                  </div>

                  {selectedIncident.status ===
                    'ACTIVE' && (
                    <form
                      className="incident-update-form"
                      onSubmit={addUpdate}
                    >
                      <select
                        value={updateType}
                        onChange={(event) => {
                          setUpdateType(
                            event.target.value
                          );
                        }}
                      >
                        {UPDATE_TYPES.map(
                          (type) => (
                            <option
                              key={type}
                              value={type}
                            >
                              {type}
                            </option>
                          )
                        )}
                      </select>

                      <textarea
                        rows={3}
                        value={updateBody}
                        onChange={(event) => {
                          setUpdateBody(
                            event.target.value
                          );
                        }}
                        placeholder="Log observation, mitigation, test, or resolution note..."
                      />

                      <button
                        type="submit"
                        disabled={saving}
                      >
                        <Radio size={16} />
                        LOG UPDATE
                      </button>
                    </form>
                  )}

                  <div className="incident-timeline-list">
                    {updates.map((update) => (
                      <article
                        key={update.id}
                        className="incident-update-row"
                      >
                        <div>
                          <span>
                            [
                            {formatUpdateTime(
                              update.created_at
                            )}
                            ]
                          </span>

                          <strong>
                            {String(
                              update.crew_name ||
                                'CREW'
                            ).toUpperCase()}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {update.update_type}
                          </span>

                          <p>{update.body}</p>
                        </div>
                      </article>
                    ))}

                    {!updates.length && (
                      <p className="incident-empty">
                        NO INCIDENT UPDATES RECORDED
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <section className="incident-detail">
                <Activity size={28} />
                <h3>No Incident Selected</h3>
                <p>
                  Declare an incident or select
                  an archived record.
                </p>
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
