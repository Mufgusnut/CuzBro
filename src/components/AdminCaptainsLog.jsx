import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Pencil,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { supabase } from '../supabase.js';
import { sendCuzBroSignal } from '../lib/signals.js';

const emptyMission = {
  id: '',
  date: '',
  mission: '',
  location: 'Eliot, Maine',
  targets: '',
  equipment: '',
  moon: 'Not recorded',
  seeing: 'Not recorded',
  transparency: 'Not recorded',
  summary: '',
  notes: '',
  worked: '',
  improve: '',
  nextMission: '',
  targetNotes: {}
};

function arrayToText(items) {
  if (!Array.isArray(items)) {
    return '';
  }

  return items.join('\n');
}

function textToArray(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTargetNotes(targets, existingTargetNotes = {}) {
  return targets.reduce((notes, target) => {
    notes[target] = {
      result: existingTargetNotes[target]?.result || '',
      notes: existingTargetNotes[target]?.notes || '',
      lesson: existingTargetNotes[target]?.lesson || ''
    };

    return notes;
  }, {});
}

function databaseRowToForm(row) {
  return {
    id: row.id || '',
    date: row.date || '',
    mission: row.mission || '',
    location: row.location || '',
    targets: arrayToText(row.targets),
    equipment: arrayToText(row.equipment),
    moon: row.conditions?.moon || 'Not recorded',
    seeing: row.conditions?.seeing || 'Not recorded',
    transparency:
      row.conditions?.transparency || 'Not recorded',
    summary: row.summary || '',
    notes: row.notes || '',
    worked: arrayToText(row.worked),
    improve: arrayToText(row.improve),
    nextMission: row.next_mission || '',
    targetNotes: row.target_notes || {}
  };
}

export default function AdminCaptainsLog() {
  const [missions, setMissions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [editingMission, setEditingMission] =
    useState(null);
  const [form, setForm] = useState(emptyMission);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const formTargets = useMemo(
    () => textToArray(form.targets),
    [form.targets]
  );

  async function loadMissions() {
    setStatus('loading');
    setError('');

    const { data, error: loadError } = await supabase
      .from('captains_log')
      .select('*')
      .order('date', { ascending: false });

    if (loadError) {
      console.error(loadError);
      setError(loadError.message);
      setStatus('error');
      return;
    }

    setMissions(data || []);
    setStatus('ready');
  }

  useEffect(() => {
    loadMissions();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateTargets(value) {
    const targets = textToArray(value);

    setForm((current) => ({
      ...current,
      targets: value,
      targetNotes: normalizeTargetNotes(
        targets,
        current.targetNotes
      )
    }));
  }

  function updateTargetNote(target, field, value) {
    setForm((current) => ({
      ...current,
      targetNotes: {
        ...current.targetNotes,
        [target]: {
          result:
            current.targetNotes[target]?.result || '',
          notes:
            current.targetNotes[target]?.notes || '',
          lesson:
            current.targetNotes[target]?.lesson || '',
          [field]: value
        }
      }
    }));
  }

  function startNewMission() {
    setEditingMission('new');
    setForm({
      ...emptyMission,
      targetNotes: {}
    });
    setMessage('');
    setError('');
  }

  function startEditingMission(mission) {
    setEditingMission(mission.id);
    setForm(databaseRowToForm(mission));
    setMessage('');
    setError('');
  }

  function closeEditor() {
    setEditingMission(null);
    setForm({
      ...emptyMission,
      targetNotes: {}
    });
    setMessage('');
    setError('');
  }

  async function handleSave(event) {
    event.preventDefault();

    setSaving(true);
    setMessage('');
    setError('');

    const targets = textToArray(form.targets);

    const missionRow = {
      id: form.id.trim(),
      date: form.date,
      mission: form.mission.trim(),
      location: form.location.trim(),
      targets,
      equipment: textToArray(form.equipment),
      conditions: {
        moon: form.moon.trim(),
        seeing: form.seeing.trim(),
        transparency: form.transparency.trim()
      },
      summary: form.summary.trim(),
      notes: form.notes.trim(),
      worked: textToArray(form.worked),
      improve: textToArray(form.improve),
      next_mission: form.nextMission.trim(),
      target_notes: normalizeTargetNotes(
        targets,
        form.targetNotes
      ),
      updated_at: new Date().toISOString()
    };

    let saveError;

    if (editingMission === 'new') {
      const { error: insertError } = await supabase
        .from('captains_log')
        .insert(missionRow);

      saveError = insertError;
    } else {
      const { error: updateError } = await supabase
        .from('captains_log')
        .update(missionRow)
        .eq('id', editingMission);

      saveError = updateError;
    }

    if (saveError) {
      console.error(saveError);
      setError(saveError.message);
      setSaving(false);
      return;
    }

    const wasNewMission = editingMission === 'new';
    const signalAction = wasNewMission ? 'NEW' : 'UPDATED';

    const signalResult = await sendCuzBroSignal({
      topic: 'mission_reports',
      eventKey: `mission-report:${signalAction.toLowerCase()}:${missionRow.id}:${missionRow.updated_at}`,
      subject: wasNewMission
        ? `New CuzBro Mission Report · ${missionRow.id}`
        : `CuzBro Mission Report Updated · ${missionRow.id}`,
      headline: missionRow.mission || missionRow.id,
      summary: wasNewMission
        ? missionRow.summary ||
          'A new CuzBro mission report has been published.'
        : missionRow.summary ||
          'A CuzBro mission report has been revised with new mission information.',
      detailLines: [
        `Status: ${signalAction === 'NEW' ? 'NEW MISSION REPORT' : 'MISSION REPORT UPDATED'}`,
        missionRow.location
          ? `Location: ${missionRow.location}`
          : '',
        targets.length
          ? `Targets: ${targets.join(', ')}`
          : '',
        missionRow.date
          ? `Mission date: ${missionRow.date}`
          : ''
      ].filter(Boolean),
      ctaLabel: 'VIEW MISSION REPORTS',
      ctaUrl: 'https://cuzbro.net/captains-log'
    });

    if (!signalResult.ok) {
      setError(
        `${wasNewMission ? 'Mission Report created' : 'Mission Report updated'}, but subscriber notification failed: ${signalResult.error}`
      );
      setMessage(
        wasNewMission
          ? 'MISSION REPORT CREATED · SIGNAL FAILED'
          : 'MISSION REPORT UPDATED · SIGNAL FAILED'
      );
    } else {
      const delivered = Number(signalResult.delivered || 0);
      const failed = Number(signalResult.failed || 0);
      const eligible = Number(signalResult.eligibleSubscribers || 0);

      setMessage(
        `${wasNewMission ? 'MISSION REPORT CREATED' : 'MISSION REPORT UPDATED'} · SIGNALS ${delivered}/${eligible} DELIVERED${failed ? ` · ${failed} FAILED` : ''}`
      );
    }

    await loadMissions();

    setSaving(false);
    setEditingMission(null);
    setForm({
      ...emptyMission,
      targetNotes: {}
    });
  }

  async function handleDelete(mission) {
    const confirmed = window.confirm(
      `Delete ${mission.id} — ${mission.mission}?`
    );

    if (!confirmed) {
      return;
    }

    setError('');
    setMessage('');

    const { error: deleteError } = await supabase
      .from('captains_log')
      .delete()
      .eq('id', mission.id);

    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
      return;
    }

    setMessage(`${mission.id} DELETED`);
    await loadMissions();
  }

  return (
    <div className="admin-page admin-log-page">
      <header className="admin-header">
        <div className="admin-brand">
          <img
            src={
              import.meta.env.BASE_URL +
              'assets/cuzbro-logo.png'
            }
            alt="CuzBro logo"
          />

          <div>
            <span>SECURE CREW TERMINAL</span>
            <h1>Mission Reports</h1>
          </div>
        </div>

        <button
          type="button"
          className="admin-logout"
          onClick={() => {
            window.location.href = '/admin';
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
              CAPTAIN&apos;S LOG
            </span>

            <h2>Mission Reports</h2>

            <p>
              Create and maintain the official CuzBro
              Observatory mission record.
            </p>
          </div>

          <button
            type="button"
            className="admin-new-mission"
            onClick={startNewMission}
          >
            <Plus size={18} />
            NEW MISSION REPORT
          </button>
        </section>

        {message && (
          <div className="admin-success-message">
            {message}
          </div>
        )}

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        {editingMission !== null && (
          <section className="admin-mission-editor">
            <div className="admin-editor-header">
              <div>
                <span className="admin-card-eyebrow">
                  MISSION EDITOR
                </span>

                <h3>
                  {editingMission === 'new'
                    ? 'New Mission Report'
                    : `Edit ${form.id}`}
                </h3>
              </div>

              <button
                type="button"
                className="admin-editor-close"
                onClick={closeEditor}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="admin-form-grid">
                <label>
                  <span>MISSION ID</span>

                  <input
                    type="text"
                    placeholder="MISSION 009"
                    value={form.id}
                    onChange={(event) =>
                      updateForm(
                        'id',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>DATE</span>

                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      updateForm(
                        'date',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>MISSION NAME</span>

                  <input
                    type="text"
                    value={form.mission}
                    onChange={(event) =>
                      updateForm(
                        'mission',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>LOCATION</span>

                  <input
                    type="text"
                    value={form.location}
                    onChange={(event) =>
                      updateForm(
                        'location',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>TARGETS — ONE PER LINE</span>

                  <textarea
                    value={form.targets}
                    onChange={(event) =>
                      updateTargets(event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  <span>
                    EQUIPMENT — ONE PER LINE
                  </span>

                  <textarea
                    value={form.equipment}
                    onChange={(event) =>
                      updateForm(
                        'equipment',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>MOON</span>

                  <input
                    type="text"
                    value={form.moon}
                    onChange={(event) =>
                      updateForm(
                        'moon',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>SEEING</span>

                  <input
                    type="text"
                    value={form.seeing}
                    onChange={(event) =>
                      updateForm(
                        'seeing',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>TRANSPARENCY</span>

                  <input
                    type="text"
                    value={form.transparency}
                    onChange={(event) =>
                      updateForm(
                        'transparency',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="admin-form-wide">
                  <span>SUMMARY</span>

                  <textarea
                    value={form.summary}
                    onChange={(event) =>
                      updateForm(
                        'summary',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>MISSION NOTES</span>

                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      updateForm(
                        'notes',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>
                    WHAT WORKED — ONE PER LINE
                  </span>

                  <textarea
                    value={form.worked}
                    onChange={(event) =>
                      updateForm(
                        'worked',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>
                    IMPROVE — ONE PER LINE
                  </span>

                  <textarea
                    value={form.improve}
                    onChange={(event) =>
                      updateForm(
                        'improve',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="admin-form-wide">
                  <span>NEXT MISSION</span>

                  <textarea
                    value={form.nextMission}
                    onChange={(event) =>
                      updateForm(
                        'nextMission',
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              {formTargets.length > 0 && (
                <section className="admin-target-reports">
                  <div className="admin-target-reports-heading">
                    <span className="admin-card-eyebrow">
                      TARGET REPORTS
                    </span>

                    <h3>
                      Per-Target Mission Analysis
                    </h3>

                    <p>
                      Each target listed above gets its
                      own result, field notes, and lesson.
                    </p>
                  </div>

                  <div className="admin-target-report-list">
                    {formTargets.map((target) => (
                      <article
                        className="admin-target-report"
                        key={target}
                      >
                        <div className="admin-target-report-title">
                          <span>TARGET</span>
                          <h4>{target}</h4>
                        </div>

                        <label>
                          <span>RESULT</span>

                          <textarea
                            value={
                              form.targetNotes[target]
                                ?.result || ''
                            }
                            onChange={(event) =>
                              updateTargetNote(
                                target,
                                'result',
                                event.target.value
                              )
                            }
                            placeholder={`What was the result for ${target}?`}
                          />
                        </label>

                        <label>
                          <span>FIELD NOTES</span>

                          <textarea
                            value={
                              form.targetNotes[target]
                                ?.notes || ''
                            }
                            onChange={(event) =>
                              updateTargetNote(
                                target,
                                'notes',
                                event.target.value
                              )
                            }
                            placeholder={`What did the crew observe or capture with ${target}?`}
                          />
                        </label>

                        <label>
                          <span>LESSON</span>

                          <textarea
                            value={
                              form.targetNotes[target]
                                ?.lesson || ''
                            }
                            onChange={(event) =>
                              updateTargetNote(
                                target,
                                'lesson',
                                event.target.value
                              )
                            }
                            placeholder={`What should CuzBro do differently next time?`}
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <div className="admin-editor-actions">
                <button
                  type="button"
                  className="admin-editor-cancel"
                  onClick={closeEditor}
                >
                  CANCEL
                </button>

                <button
                  type="submit"
                  className="admin-editor-save"
                  disabled={saving}
                >
                  <Save size={17} />

                  {saving
                    ? 'SAVING...'
                    : 'SAVE MISSION REPORT'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="admin-mission-list">
          <div className="admin-list-title">
            <BookOpen size={20} />

            <span>
              {missions.length} MISSION REPORTS
            </span>
          </div>

          {status === 'loading' && (
            <p className="admin-list-status">
              ACCESSING MISSION ARCHIVE...
            </p>
          )}

          {status === 'ready' &&
            missions.map((mission) => (
              <article
                className="admin-mission-row"
                key={mission.id}
              >
                <div className="admin-mission-id">
                  <span>{mission.id}</span>

                  <strong>{mission.date}</strong>
                </div>

                <div className="admin-mission-summary">
                  <h3>{mission.mission}</h3>

                  <p>
                    {mission.location}
                    {' · '}
                    {(mission.targets || []).join(', ')}
                  </p>
                </div>

                <div className="admin-mission-actions">
                  <button
                    type="button"
                    onClick={() =>
                      startEditingMission(mission)
                    }
                  >
                    <Pencil size={16} />
                    EDIT
                  </button>

                  <button
                    type="button"
                    className="admin-delete-button"
                    onClick={() =>
                      handleDelete(mission)
                    }
                  >
                    <Trash2 size={16} />
                    DELETE
                  </button>
                </div>
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}