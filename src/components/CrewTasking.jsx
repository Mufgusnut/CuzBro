import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Play,
  Plus,
  Square,
  UserRound
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  getAllCrewMembers,
  getCrewMember
} from '../lib/crew.js';
import {
  useActiveOperation
} from '../lib/operations.js';
import {
  formatIncidentCode,
  useActiveIncidents
} from '../lib/incidents.js';
import {
  announceTaskChange,
  formatTaskCode,
  formatTaskStatus,
  recordTaskEvent,
  useCrewTasks
} from '../lib/tasks.js';
import {
  logCrewActivity
} from '../lib/audit.js';

const TASK_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETE'
];

const PRIORITIES = [
  'LOW',
  'NORMAL',
  'HIGH'
];

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getTaskStatusIcon(status) {
  switch (status) {
    case 'IN_PROGRESS':
      return Play;
    case 'BLOCKED':
      return AlertTriangle;
    case 'COMPLETE':
      return CheckCircle2;
    default:
      return ClipboardList;
  }
}

export default function CrewTasking({
  session
}) {
  const crew = getCrewMember(
    session?.user?.email
  );

  const {
    activeOperation
  } = useActiveOperation();

  const {
    activeIncidents
  } = useActiveIncidents(true);

  const {
    tasks,
    taskStatus,
    taskError
  } = useCrewTasks(true);

  const [filter, setFilter] =
    useState('ALL');

  const [statusFilter, setStatusFilter] =
    useState('ACTIVE');

  const [showCreate, setShowCreate] =
    useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'NORMAL',
    assignedEmail: '',
    sourceType: 'GENERAL',
    sourceId: '',
    sourceCode: '',
    sourceName: ''
  });

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    if (params.get('create') === 'true') {
      setShowCreate(true);
    }
  }, []);

  const counts = useMemo(() => {
    return TASK_STATUSES.reduce(
      (result, status) => ({
        ...result,
        [status]: tasks.filter(
          (task) => task.status === status
        ).length
      }),
      {}
    );
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const ownEmail = String(
      session?.user?.email || ''
    ).toLowerCase();

    return tasks.filter((task) => {
      if (
        statusFilter === 'ACTIVE' &&
        task.status === 'COMPLETE'
      ) {
        return false;
      }

      if (
        statusFilter !== 'ACTIVE' &&
        statusFilter !== 'ALL' &&
        task.status !== statusFilter
      ) {
        return false;
      }

      if (filter === 'ALL') {
        return true;
      }

      if (filter === 'MINE') {
        return String(
          task.assigned_email || ''
        ).toLowerCase() === ownEmail;
      }

      if (filter === 'UNASSIGNED') {
        return !task.assigned_email;
      }

      return String(
        task.assigned_name || ''
      ).toUpperCase() === filter;
    });
  }, [
    tasks,
    filter,
    statusFilter,
    session?.user?.email
  ]);

  function resetForm() {
    setForm({
      title: '',
      description: '',
      priority: 'NORMAL',
      assignedEmail: '',
      sourceType: 'GENERAL',
      sourceId: '',
      sourceCode: '',
      sourceName: ''
    });
  }

  function applySource(
    sourceType,
    source = null
  ) {
    if (sourceType === 'OPERATION') {
      setForm((current) => ({
        ...current,
        sourceType,
        sourceId:
          activeOperation?.id || '',
        sourceCode: '',
        sourceName:
          activeOperation?.designation || ''
      }));
      return;
    }

    if (sourceType === 'INCIDENT') {
      const incident =
        source || activeIncidents[0];

      setForm((current) => ({
        ...current,
        sourceType,
        sourceId: incident?.id || '',
        sourceCode: incident
          ? formatIncidentCode(incident)
          : '',
        sourceName: incident?.title || ''
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      sourceType: 'GENERAL',
      sourceId: '',
      sourceCode: '',
      sourceName: ''
    }));
  }

  async function createTask(event) {
    event.preventDefault();

    const title = form.title.trim();
    const description =
      form.description.trim();

    if (!title) {
      setError('Enter a task title.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const assignee = getAllCrewMembers()
        .find(
          (member) =>
            member.email ===
            form.assignedEmail
        );

      const {
        data: task,
        error: insertError
      } = await supabase
        .from('crew_tasks')
        .insert({
          title,
          description:
            description || null,
          priority: form.priority,
          status: 'OPEN',
          assigned_email:
            assignee?.email || null,
          assigned_name:
            assignee?.name || null,
          source_type: form.sourceType,
          source_id:
            form.sourceId || null,
          source_code:
            form.sourceCode || null,
          source_name:
            form.sourceName || null,
          operation_id:
            form.sourceType === 'OPERATION'
              ? activeOperation?.id || null
              : form.sourceType === 'INCIDENT'
                ? activeIncidents.find(
                    (incident) =>
                      incident.id === form.sourceId
                  )?.operation_id || null
                : null,
          operation_designation:
            form.sourceType === 'OPERATION'
              ? activeOperation?.designation || null
              : form.sourceType === 'INCIDENT'
                ? activeIncidents.find(
                    (incident) =>
                      incident.id === form.sourceId
                  )?.operation_designation || null
                : null,
          created_by_user_id:
            session?.user?.id,
          created_by_email:
            session?.user?.email,
          created_by_name: crew.name
        })
        .select('*')
        .single();

      if (insertError) {
        throw insertError;
      }

      await recordTaskEvent({
        task,
        eventType: 'TASK_CREATED',
        eventLabel: 'Task created',
        details: {
          priority: task.priority,
          assignedTo:
            task.assigned_name,
          sourceType:
            task.source_type,
          sourceCode:
            task.source_code,
          sourceName:
            task.source_name
        },
        session
      });

      await logCrewActivity({
        action: 'TASK_CREATED',
        category: 'TASK',
        resourceType: 'crew_task',
        resourceId: task.id,
        resourceName:
          formatTaskCode(task),
        details: {
          title: task.title,
          priority: task.priority,
          assignedTo:
            task.assigned_name,
          sourceType:
            task.source_type,
          sourceCode:
            task.source_code,
          sourceName:
            task.source_name
        }
      });

      announceTaskChange(task);
      setMessage(
        `${formatTaskCode(task)} CREATED`
      );
      resetForm();
      setShowCreate(false);
    } catch (createError) {
      console.error(
        'Task creation failed:',
        createError
      );

      setError(
        createError.message ||
          'Crew task could not be created.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateTaskAssignment(
    task,
    assignedEmail
  ) {
    setMessage('');
    setError('');

    try {
      const assignee = getAllCrewMembers()
        .find(
          (member) =>
            member.email === assignedEmail
        );

      const {
        data: updatedTask,
        error: updateError
      } = await supabase
        .from('crew_tasks')
        .update({
          assigned_email:
            assignee?.email || null,
          assigned_name:
            assignee?.name || null,
          updated_at:
            new Date().toISOString()
        })
        .eq('id', task.id)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      await recordTaskEvent({
        task: updatedTask,
        eventType: 'TASK_ASSIGNED',
        eventLabel: 'Task assignment updated',
        details: {
          previousAssignee:
            task.assigned_name,
          assignedTo:
            updatedTask.assigned_name
        },
        session
      });

      await logCrewActivity({
        action: 'TASK_ASSIGNED',
        category: 'TASK',
        resourceType: 'crew_task',
        resourceId: updatedTask.id,
        resourceName:
          formatTaskCode(updatedTask),
        details: {
          title: updatedTask.title,
          previousAssignee:
            task.assigned_name,
          assignedTo:
            updatedTask.assigned_name
        }
      });

      announceTaskChange(updatedTask);
      setMessage(
        `${formatTaskCode(
          updatedTask
        )} ASSIGNED · ${String(
          updatedTask.assigned_name ||
            'UNASSIGNED'
        ).toUpperCase()}`
      );
    } catch (assignmentError) {
      console.error(
        'Task assignment update failed:',
        assignmentError
      );

      setError(
        assignmentError.message ||
          'Task assignment could not be updated.'
      );
    }
  }

  async function updateTaskStatus(
    task,
    nextStatus
  ) {
    setMessage('');
    setError('');

    try {
      const completing =
        nextStatus === 'COMPLETE';

      const {
        data: updatedTask,
        error: updateError
      } = await supabase
        .from('crew_tasks')
        .update({
          status: nextStatus,
          completed_at:
            completing
              ? new Date().toISOString()
              : null,
          completed_by_user_id:
            completing
              ? session?.user?.id
              : null,
          completed_by_email:
            completing
              ? session?.user?.email
              : null,
          completed_by_name:
            completing
              ? crew.name
              : null,
          updated_at:
            new Date().toISOString()
        })
        .eq('id', task.id)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      const actionMap = {
        OPEN: 'TASK_REOPENED',
        IN_PROGRESS: 'TASK_STARTED',
        BLOCKED: 'TASK_BLOCKED',
        COMPLETE: 'TASK_COMPLETED'
      };

      const action =
        actionMap[nextStatus] ||
        'TASK_UPDATED';

      await recordTaskEvent({
        task: updatedTask,
        eventType: action,
        eventLabel:
          `Task ${formatTaskStatus(
            nextStatus
          ).toLowerCase()}`,
        details: {
          previousStatus: task.status,
          status: nextStatus
        },
        session
      });

      await logCrewActivity({
        action,
        category: 'TASK',
        resourceType: 'crew_task',
        resourceId: updatedTask.id,
        resourceName:
          formatTaskCode(updatedTask),
        details: {
          title: updatedTask.title,
          previousStatus: task.status,
          status: nextStatus,
          assignedTo:
            updatedTask.assigned_name
        }
      });

      announceTaskChange(updatedTask);
      setMessage(
        `${formatTaskCode(
          updatedTask
        )} · ${formatTaskStatus(
          nextStatus
        )}`
      );
    } catch (updateError) {
      console.error(
        'Task status update failed:',
        updateError
      );

      setError(
        updateError.message ||
          'Task status could not be updated.'
      );
    }
  }

  return (
    <div className="admin-page tasking-page">
      <header className="admin-header">
        <div className="admin-brand">
          <a href="/" aria-label="CuzBro homepage">
            <img
              src={
                import.meta.env.BASE_URL +
                'assets/cuzbro-logo.png'
              }
              alt="CuzBro logo"
            />
          </a>

          <div>
            <span>CUZBRO CREW SYSTEMS</span>
            <h1>CREW TASKING</h1>
            <p>
              Shared action queue for Dave,
              Justin, and Chappy. Equal crew
              authority. No Jira bullshit.
            </p>
          </div>
        </div>

        <a
          className="admin-back-button"
          href="/admin"
        >
          <ArrowLeft size={18} />
          ADMIN CONTROL
        </a>
      </header>

      <main className="admin-main tasking-main">
        {(message || error || taskError) && (
          <div
            className={
              error || taskError
                ? 'admin-error-message'
                : 'admin-success-message'
            }
          >
            {error || taskError || message}
          </div>
        )}

        <section className="tasking-command-bar">
          <div>
            <span>SHARED ACTION QUEUE</span>
            <strong>
              {counts.OPEN || 0} OPEN ·{' '}
              {counts.IN_PROGRESS || 0} IN PROGRESS ·{' '}
              {counts.BLOCKED || 0} BLOCKED
            </strong>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
          >
            <Plus size={18} />
            CREATE TASK
          </button>
        </section>

        {showCreate && (
          <section className="tasking-create-panel">
            <div className="tasking-panel-heading">
              <div>
                <span>NEW CREW TASK</span>
                <h2>CREATE TASK</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
              >
                CANCEL
              </button>
            </div>

            <form
              className="tasking-create-form"
              onSubmit={createTask}
            >
              <label>
                <span>TASK TITLE</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      title: event.target.value
                    }));
                  }}
                  maxLength={160}
                  placeholder="Replace CPC power jack"
                />
              </label>

              <label className="tasking-description-field">
                <span>DETAILS</span>
                <textarea
                  value={form.description}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      description:
                        event.target.value
                    }));
                  }}
                  maxLength={1500}
                  rows={5}
                  placeholder="What needs to be done?"
                />
              </label>

              <label>
                <span>ASSIGNED</span>
                <select
                  value={form.assignedEmail}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      assignedEmail:
                        event.target.value
                    }));
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

              <label>
                <span>PRIORITY</span>
                <select
                  value={form.priority}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value
                    }));
                  }}
                >
                  {PRIORITIES.map((priority) => (
                    <option
                      key={priority}
                      value={priority}
                    >
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>SOURCE</span>
                <select
                  value={form.sourceType}
                  onChange={(event) => {
                    applySource(event.target.value);
                  }}
                >
                  <option value="GENERAL">
                    GENERAL TASK
                  </option>
                  <option
                    value="OPERATION"
                    disabled={!activeOperation}
                  >
                    ACTIVE OPERATION
                  </option>
                  <option
                    value="INCIDENT"
                    disabled={!activeIncidents.length}
                  >
                    ACTIVE INCIDENT
                  </option>
                </select>
              </label>

              {form.sourceType === 'INCIDENT' &&
                activeIncidents.length > 1 && (
                <label>
                  <span>INCIDENT</span>
                  <select
                    value={form.sourceId}
                    onChange={(event) => {
                      const incident =
                        activeIncidents.find(
                          (item) =>
                            item.id ===
                            event.target.value
                        );
                      applySource(
                        'INCIDENT',
                        incident
                      );
                    }}
                  >
                    {activeIncidents.map(
                      (incident) => (
                        <option
                          key={incident.id}
                          value={incident.id}
                        >
                          {formatIncidentCode(
                            incident
                          )} · {incident.title}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}

              <div className="tasking-create-meta">
                <span>CREATED BY</span>
                <strong>
                  {crew.callSign} · {crew.role}
                </strong>
              </div>

              <button
                className="tasking-create-submit"
                type="submit"
                disabled={saving}
              >
                <ClipboardList size={18} />
                {saving
                  ? 'CREATING TASK...'
                  : 'CREATE TASK'}
              </button>
            </form>
          </section>
        )}

        <section className="tasking-filter-panel">
          <div className="tasking-filter-row">
            {[
              'ALL',
              'MINE',
              'DAVE',
              'JUSTIN',
              'CHAPPY',
              'UNASSIGNED'
            ].map((value) => (
              <button
                type="button"
                key={value}
                className={
                  filter === value
                    ? 'active'
                    : ''
                }
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="tasking-filter-row">
            {[
              'ACTIVE',
              ...TASK_STATUSES,
              'ALL'
            ].map((value) => (
              <button
                type="button"
                key={value}
                className={
                  statusFilter === value
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setStatusFilter(value)
                }
              >
                {formatTaskStatus(value)}
              </button>
            ))}
          </div>
        </section>

        <section className="tasking-grid">
          {taskStatus === 'loading' && (
            <div className="tasking-empty-state">
              <Clock3 size={28} />
              LOADING CREW TASKING...
            </div>
          )}

          {taskStatus === 'ready' &&
            filteredTasks.length === 0 && (
            <div className="tasking-empty-state">
              <CheckCircle2 size={28} />
              NO TASKS MATCH THIS FILTER
            </div>
          )}

          {filteredTasks.map((task) => {
            const StatusIcon =
              getTaskStatusIcon(task.status);

            return (
              <article
                className={`tasking-card tasking-card-${String(
                  task.status
                ).toLowerCase().replaceAll('_', '-')}`}
                key={task.id}
              >
                <div className="tasking-card-topline">
                  <strong>
                    {formatTaskCode(task)}
                  </strong>
                  <span
                    className={`tasking-priority tasking-priority-${String(
                      task.priority
                    ).toLowerCase()}`}
                  >
                    {task.priority}
                  </span>
                </div>

                <h2>{task.title}</h2>

                <div className="tasking-status-line">
                  <StatusIcon size={17} />
                  {formatTaskStatus(task.status)}
                </div>

                {task.description && (
                  <p>{task.description}</p>
                )}

                <div className="tasking-facts">
                  <div>
                    <span>ASSIGNED</span>
                    <select
                      className="tasking-assignee-select"
                      value={
                        task.assigned_email || ''
                      }
                      onChange={(event) => {
                        updateTaskAssignment(
                          task,
                          event.target.value
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
                            {member.callSign}
                          </option>
                        )
                      )}
                    </select>
                    {task.assigned_email && (
                      <small>
                        {getCrewMember(
                          task.assigned_email
                        ).role}
                      </small>
                    )}
                  </div>

                  <div>
                    <span>SOURCE</span>
                    <strong>
                      {task.source_type === 'GENERAL'
                        ? 'GENERAL TASK'
                        : task.source_code ||
                          task.source_name ||
                          task.source_type}
                    </strong>
                    {task.source_code &&
                      task.source_name && (
                      <small>
                        {task.source_name}
                      </small>
                    )}
                  </div>
                </div>

                <div className="tasking-card-meta">
                  <span>
                    CREATED BY{' '}
                    {String(
                      task.created_by_name || 'CREW'
                    ).toUpperCase()}
                  </span>
                  <span>
                    {formatDateTime(task.created_at)}
                  </span>
                </div>

                <div className="tasking-actions">
                  {task.status !== 'OPEN' &&
                    task.status !== 'COMPLETE' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(
                          task,
                          'OPEN'
                        )
                      }
                    >
                      <ClipboardList size={15} />
                      OPEN
                    </button>
                  )}

                  {task.status !== 'IN_PROGRESS' &&
                    task.status !== 'COMPLETE' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(
                          task,
                          'IN_PROGRESS'
                        )
                      }
                    >
                      <Play size={15} />
                      START
                    </button>
                  )}

                  {task.status !== 'BLOCKED' &&
                    task.status !== 'COMPLETE' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(
                          task,
                          'BLOCKED'
                        )
                      }
                    >
                      <Square size={15} />
                      BLOCK
                    </button>
                  )}

                  {task.status !== 'COMPLETE' && (
                    <button
                      type="button"
                      className="tasking-complete-button"
                      onClick={() =>
                        updateTaskStatus(
                          task,
                          'COMPLETE'
                        )
                      }
                    >
                      <CheckCircle2 size={15} />
                      COMPLETE
                    </button>
                  )}

                  {task.status === 'COMPLETE' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(
                          task,
                          'OPEN'
                        )
                      }
                    >
                      <ClipboardList size={15} />
                      REOPEN
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="tasking-footer-note">
          <UserRound size={16} />
          Any crew member may create, assign, start,
          block, complete, or reopen a task.
        </footer>
      </main>
    </div>
  );
}
