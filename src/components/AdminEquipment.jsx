import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  History,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Telescope,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import { supabase } from '../supabase.js';
import { sendCuzBroSignal } from '../lib/signals.js';

const HISTORY_EVENT_TYPES = [
  'ACQUIRED',
  'UPGRADE',
  'SERVICE',
  'MAINTENANCE',
  'INCIDENT',
  'REPAIR',
  'NOTE'
];

const emptyHistoryEvent = {
  occurredOn: '',
  eventType: 'MAINTENANCE',
  title: '',
  description: ''
};

function formatHistoryDate(value) {
  if (!value) return 'DATE NOT RECORDED';

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date).toUpperCase();
}

const emptyEquipment = {
  id: '',
  name: '',
  category: '',
  type: '',
  role: '',
  status: 'Active',
  icon: 'telescope',
  summary: '',
  facts: [
    {
      label: '',
      value: ''
    }
  ],
  bestFor: '',
  fieldNote: '',
  sortOrder: ''
};

function databaseRowToForm(item) {
  return {
    id: item.id || '',
    name: item.name || '',
    category: item.category || '',
    type: item.type || '',
    role: item.role || '',
    status: item.status || 'Active',
    icon: item.icon || 'telescope',
    summary: item.summary || '',
    facts:
      Array.isArray(item.facts) && item.facts.length > 0
        ? item.facts.map((fact) => ({
            label: fact.label || '',
            value: fact.value || ''
          }))
        : [
            {
              label: '',
              value: ''
            }
          ],
    bestFor: Array.isArray(item.best_for)
      ? item.best_for.join('\n')
      : '',
    fieldNote: item.field_note || '',
    sortOrder:
      item.sort_order === null ||
      item.sort_order === undefined
        ? ''
        : String(item.sort_order)
  };
}

function textToArray(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminEquipment() {
  const [equipment, setEquipment] = useState([]);
  const [status, setStatus] = useState('loading');
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyEquipment, setHistoryEquipment] = useState(null);
  const [editingHistoryEventId, setEditingHistoryEventId] = useState(null);
  const [historyForm, setHistoryForm] = useState(emptyHistoryEvent);
  const [historySaving, setHistorySaving] = useState(false);

  const [editingEquipmentId, setEditingEquipmentId] =
    useState(null);

  const [form, setForm] = useState(emptyEquipment);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadEquipment() {
    setStatus('loading');
    setError('');

    const { data, error: loadError } = await supabase
      .from('equipment')
      .select('*')
      .order('sort_order', {
        ascending: true
      });

    if (loadError) {
      console.error(loadError);
      setError(loadError.message);
      setStatus('error');
      return;
    }

    setEquipment(data || []);
    setStatus('ready');
  }

  async function loadHistoryEvents() {
    const { data, error: historyError } = await supabase
      .from('equipment_events')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    if (historyError) {
      console.error(historyError);
      setError(historyError.message);
      return;
    }

    setHistoryEvents(data || []);
  }

  useEffect(() => {
    loadEquipment();
    loadHistoryEvents();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateFact(index, field, value) {
    setForm((current) => ({
      ...current,
      facts: current.facts.map((fact, factIndex) =>
        factIndex === index
          ? {
              ...fact,
              [field]: value
            }
          : fact
      )
    }));
  }

  function addFact() {
    setForm((current) => ({
      ...current,
      facts: [
        ...current.facts,
        {
          label: '',
          value: ''
        }
      ]
    }));
  }

  function removeFact(index) {
    setForm((current) => ({
      ...current,
      facts:
        current.facts.length === 1
          ? [
              {
                label: '',
                value: ''
              }
            ]
          : current.facts.filter(
              (_fact, factIndex) =>
                factIndex !== index
            )
    }));
  }

  function openHistory(item) {
    setHistoryEquipment(item);
    setEditingHistoryEventId(null);
    setHistoryForm(emptyHistoryEvent);
    setMessage('');
    setError('');
  }

  function closeHistory() {
    setHistoryEquipment(null);
    setEditingHistoryEventId(null);
    setHistoryForm(emptyHistoryEvent);
  }

  function startNewHistoryEvent() {
    setEditingHistoryEventId('new');
    setHistoryForm({
      ...emptyHistoryEvent,
      occurredOn: new Date().toISOString().slice(0, 10)
    });
    setMessage('');
    setError('');
  }

  function startEditingHistoryEvent(event) {
    setEditingHistoryEventId(event.id);
    setHistoryForm({
      occurredOn: event.occurred_on || '',
      eventType: event.event_type || 'MAINTENANCE',
      title: event.title || '',
      description: event.description || ''
    });
    setMessage('');
    setError('');
  }

  function updateHistoryForm(field, value) {
    setHistoryForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveHistoryEvent(event) {
    event.preventDefault();

    if (!historyEquipment?.id) return;

    setHistorySaving(true);
    setMessage('');
    setError('');

    const { data: { session } } = await supabase.auth.getSession();

    const row = {
      equipment_id: historyEquipment.id,
      occurred_on: historyForm.occurredOn,
      event_type: historyForm.eventType,
      title: historyForm.title.trim(),
      description: historyForm.description.trim() || null,
      created_by_email: session?.user?.email || null,
      updated_at: new Date().toISOString()
    };

    let saveError;

    if (editingHistoryEventId === 'new') {
      const { error: insertError } = await supabase
        .from('equipment_events')
        .insert(row);
      saveError = insertError;
    } else {
      const { error: updateError } = await supabase
        .from('equipment_events')
        .update(row)
        .eq('id', editingHistoryEventId);
      saveError = updateError;
    }

    if (saveError) {
      console.error(saveError);
      setError(saveError.message);
      setHistorySaving(false);
      return;
    }

    const wasNewHistoryEvent =
      editingHistoryEventId === 'new';
    const shouldNotifyObservatoryUpdate =
      wasNewHistoryEvent &&
      ['ACQUIRED', 'UPGRADE'].includes(
        historyForm.eventType
      );

    if (shouldNotifyObservatoryUpdate) {
      const signalResult = await sendCuzBroSignal({
        topic: 'observatory_updates',
        eventKey: `equipment-event:${historyEquipment.id}:${historyForm.occurredOn}:${historyForm.eventType}:${historyForm.title.trim()}`,
        subject: `CuzBro Observatory Update · ${historyForm.title.trim()}`,
        headline: historyForm.title.trim(),
        summary:
          historyForm.description.trim() ||
          `${historyEquipment.name} has a new ${historyForm.eventType.toLowerCase()} milestone.`,
        detailLines: [
          `Equipment: ${historyEquipment.name}`,
          `Event: ${historyForm.eventType}`,
          historyForm.occurredOn
            ? `Date: ${historyForm.occurredOn}`
            : ''
        ].filter(Boolean),
        ctaLabel: 'VIEW GEAR INVENTORY',
        ctaUrl: 'https://cuzbro.net/equipment'
      });

      if (!signalResult.ok) {
        setError(
          `Equipment history saved, but subscriber notification failed: ${signalResult.error}`
        );
      }
    }

    await loadHistoryEvents();
    setEditingHistoryEventId(null);
    setHistoryForm(emptyHistoryEvent);
    setHistorySaving(false);
    setMessage('EQUIPMENT HISTORY UPDATED');
  }

  async function deleteHistoryEvent(event) {
    const confirmed = window.confirm(`Delete history event "${event.title}"?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from('equipment_events')
      .delete()
      .eq('id', event.id);

    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
      return;
    }

    await loadHistoryEvents();
    setMessage('EQUIPMENT HISTORY EVENT DELETED');
  }

  function startNewEquipment() {
    const nextSortOrder =
      equipment.reduce(
        (highest, item) =>
          Math.max(
            highest,
            item.sort_order || 0
          ),
        0
      ) + 1;

    setEditingEquipmentId('new');

    setForm({
      ...emptyEquipment,
      facts: [
        {
          label: '',
          value: ''
        }
      ],
      sortOrder: String(nextSortOrder)
    });

    setMessage('');
    setError('');
  }

  function startEditingEquipment(item) {
    setEditingEquipmentId(item.id);
    setForm(databaseRowToForm(item));
    setMessage('');
    setError('');
  }

  function closeEditor() {
    setEditingEquipmentId(null);

    setForm({
      ...emptyEquipment,
      facts: [
        {
          label: '',
          value: ''
        }
      ]
    });

    setMessage('');
    setError('');
  }

  async function handleSave(event) {
    event.preventDefault();

    setSaving(true);
    setMessage('');
    setError('');

    const facts = form.facts
      .map((fact) => ({
        label: fact.label.trim(),
        value: fact.value.trim()
      }))
      .filter(
        (fact) =>
          fact.label !== '' ||
          fact.value !== ''
      );

    const equipmentRow = {
      id: form.id.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      type: form.type.trim(),
      role: form.role.trim(),
      status: form.status.trim() || 'Active',
      icon: form.icon.trim() || 'telescope',
      summary: form.summary.trim(),
      facts,
      best_for: textToArray(form.bestFor),
      field_note: form.fieldNote.trim(),
      sort_order:
        form.sortOrder.trim() === ''
          ? 0
          : Number(form.sortOrder),
      updated_at: new Date().toISOString()
    };

    if (
      Number.isNaN(equipmentRow.sort_order)
    ) {
      setError('Sort order must be a number.');
      setSaving(false);
      return;
    }

    let saveError;

    if (editingEquipmentId === 'new') {
      const { error: insertError } = await supabase
        .from('equipment')
        .insert(equipmentRow);

      saveError = insertError;
    } else {
      const { error: updateError } = await supabase
        .from('equipment')
        .update(equipmentRow)
        .eq('id', editingEquipmentId);

      saveError = updateError;
    }

    if (saveError) {
      console.error(saveError);
      setError(saveError.message);
      setSaving(false);
      return;
    }

    const wasNew =
      editingEquipmentId === 'new';

    await loadEquipment();

    setEditingEquipmentId(null);

    setForm({
      ...emptyEquipment,
      facts: [
        {
          label: '',
          value: ''
        }
      ]
    });

    setSaving(false);

    setMessage(
      wasNew
        ? 'EQUIPMENT ADDED TO LOCKER'
        : 'EQUIPMENT RECORD UPDATED'
    );
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      `Delete ${item.name} from the Equipment Locker?`
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setError('');

    const { error: deleteError } = await supabase
      .from('equipment')
      .delete()
      .eq('id', item.id);

    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
      return;
    }

    setMessage(`${item.name} DELETED`);

    await loadEquipment();
  }

  const selectedHistoryEvents = historyEquipment
    ? historyEvents.filter((event) => event.equipment_id === historyEquipment.id)
    : [];

  return (
    <div className="admin-page admin-equipment-page">
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
            <h1>Gear Inventory</h1>
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
              EQUIPMENT LOCKER
            </span>

            <h2>Gear Inventory</h2>

            <p>
              Add and maintain the equipment used by
              CuzBro Observatory.
            </p>
          </div>

          <button
            type="button"
            className="admin-new-mission"
            onClick={startNewEquipment}
          >
            <PackagePlus size={18} />
            ADD GEAR
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

        {historyEquipment && (
          <section className="admin-equipment-history-panel">
            <div className="admin-editor-header">
              <div>
                <span className="admin-card-eyebrow">EQUIPMENT HISTORY</span>
                <h3>{historyEquipment.name}</h3>
                <p>Record acquisitions, upgrades, maintenance, repairs, and service events without changing the public gear specifications.</p>
              </div>
              <button type="button" className="admin-editor-close" onClick={closeHistory}>
                <X size={20} />
              </button>
            </div>

            <div className="admin-equipment-history-toolbar">
              <span>
                <History size={18} />
                {selectedHistoryEvents.length} {selectedHistoryEvents.length === 1 ? 'HISTORY EVENT' : 'HISTORY EVENTS'}
              </span>
              <button type="button" className="admin-add-fact" onClick={startNewHistoryEvent}>
                <Plus size={17} /> ADD HISTORY EVENT
              </button>
            </div>

            {editingHistoryEventId !== null && (
              <form className="admin-equipment-history-form" onSubmit={saveHistoryEvent}>
                <div className="admin-form-grid">
                  <label>
                    <span>EVENT DATE</span>
                    <input type="date" value={historyForm.occurredOn} onChange={(event) => updateHistoryForm('occurredOn', event.target.value)} required />
                  </label>
                  <label>
                    <span>EVENT TYPE</span>
                    <select value={historyForm.eventType} onChange={(event) => updateHistoryForm('eventType', event.target.value)} required>
                      {HISTORY_EVENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="admin-form-wide">
                    <span>TITLE</span>
                    <input type="text" value={historyForm.title} onChange={(event) => updateHistoryForm('title', event.target.value)} placeholder="HBG3 controller installed" required />
                  </label>
                  <label className="admin-form-wide">
                    <span>DETAILS</span>
                    <textarea value={historyForm.description} onChange={(event) => updateHistoryForm('description', event.target.value)} placeholder="What changed, why it mattered, or what was serviced." />
                  </label>
                </div>
                <div className="admin-editor-actions">
                  <button type="button" className="admin-editor-cancel" onClick={() => { setEditingHistoryEventId(null); setHistoryForm(emptyHistoryEvent); }}>
                    <X size={17} /> CANCEL
                  </button>
                  <button type="submit" className="admin-editor-save" disabled={historySaving}>
                    <Save size={17} /> {historySaving ? 'SAVING...' : editingHistoryEventId === 'new' ? 'ADD HISTORY EVENT' : 'SAVE HISTORY EVENT'}
                  </button>
                </div>
              </form>
            )}

            <div className="admin-equipment-history-list">
              {selectedHistoryEvents.length === 0 ? (
                <p className="admin-list-status">NO HISTORY EVENTS RECORDED</p>
              ) : selectedHistoryEvents.map((event) => (
                <article className="admin-equipment-history-row" key={event.id}>
                  <span className="admin-equipment-history-icon"><Wrench size={18} /></span>
                  <div>
                    <small>{event.event_type}</small>
                    <strong>{event.title}</strong>
                    <time>{formatHistoryDate(event.occurred_on)}</time>
                    {event.description && <p>{event.description}</p>}
                  </div>
                  <div className="admin-mission-actions">
                    <button type="button" onClick={() => startEditingHistoryEvent(event)}>
                      <Pencil size={16} /> EDIT
                    </button>
                    <button type="button" className="admin-delete-button" onClick={() => deleteHistoryEvent(event)}>
                      <Trash2 size={16} /> DELETE
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {editingEquipmentId !== null && (
          <section className="admin-mission-editor">
            <div className="admin-editor-header">
              <div>
                <span className="admin-card-eyebrow">
                  EQUIPMENT EDITOR
                </span>

                <h3>
                  {editingEquipmentId === 'new'
                    ? 'New Equipment Record'
                    : `Edit ${form.name}`}
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
                  <span>EQUIPMENT ID</span>

                  <input
                    type="text"
                    value={form.id}
                    onChange={(event) =>
                      updateForm(
                        'id',
                        event.target.value
                      )
                    }
                    placeholder="celestronFocuser"
                    required
                  />
                </label>

                <label>
                  <span>SORT ORDER</span>

                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) =>
                      updateForm(
                        'sortOrder',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>NAME</span>

                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      updateForm(
                        'name',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>CATEGORY</span>

                  <input
                    type="text"
                    value={form.category}
                    onChange={(event) =>
                      updateForm(
                        'category',
                        event.target.value
                      )
                    }
                    placeholder="Optics"
                    required
                  />
                </label>

                <label>
                  <span>TYPE</span>

                  <input
                    type="text"
                    value={form.type}
                    onChange={(event) =>
                      updateForm(
                        'type',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>ROLE</span>

                  <input
                    type="text"
                    value={form.role}
                    onChange={(event) =>
                      updateForm(
                        'role',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>STATUS</span>

                  <input
                    type="text"
                    value={form.status}
                    onChange={(event) =>
                      updateForm(
                        'status',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>ICON NAME</span>

                  <input
                    type="text"
                    value={form.icon}
                    onChange={(event) =>
                      updateForm(
                        'icon',
                        event.target.value
                      )
                    }
                    placeholder="telescope"
                    required
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
              </div>

              <section className="admin-equipment-facts">
                <div className="admin-equipment-section-heading">
                  <div>
                    <span className="admin-card-eyebrow">
                      EQUIPMENT FACTS
                    </span>

                    <h3>Technical Details</h3>

                    <p>
                      Add the label-and-value facts shown
                      on the public Equipment Locker.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="admin-add-fact"
                    onClick={addFact}
                  >
                    <Plus size={17} />
                    ADD FACT
                  </button>
                </div>

                <div className="admin-facts-list">
                  {form.facts.map((fact, index) => (
                    <div
                      className="admin-fact-row"
                      key={index}
                    >
                      <label>
                        <span>LABEL</span>

                        <input
                          type="text"
                          value={fact.label}
                          onChange={(event) =>
                            updateFact(
                              index,
                              'label',
                              event.target.value
                            )
                          }
                          placeholder="Aperture"
                        />
                      </label>

                      <label>
                        <span>VALUE</span>

                        <input
                          type="text"
                          value={fact.value}
                          onChange={(event) =>
                            updateFact(
                              index,
                              'value',
                              event.target.value
                            )
                          }
                          placeholder="203 mm / 8 in"
                        />
                      </label>

                      <button
                        type="button"
                        className="admin-remove-fact"
                        onClick={() =>
                          removeFact(index)
                        }
                        aria-label="Remove equipment fact"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="admin-form-grid admin-equipment-bottom-fields">
                <label className="admin-form-wide">
                  <span>BEST FOR — ONE PER LINE</span>

                  <textarea
                    value={form.bestFor}
                    onChange={(event) =>
                      updateForm(
                        'bestFor',
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="admin-form-wide">
                  <span>FIELD NOTE</span>

                  <textarea
                    value={form.fieldNote}
                    onChange={(event) =>
                      updateForm(
                        'fieldNote',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              </div>

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
                    : editingEquipmentId === 'new'
                      ? 'ADD TO EQUIPMENT LOCKER'
                      : 'SAVE EQUIPMENT'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="admin-mission-list">
          <div className="admin-list-title">
            <Telescope size={20} />

            <span>
              {equipment.length} EQUIPMENT RECORDS
            </span>
          </div>

          {status === 'loading' && (
            <p className="admin-list-status">
              ACCESSING EQUIPMENT LOCKER...
            </p>
          )}

          {status === 'ready' &&
            equipment.map((item) => (
              <article
                className="admin-equipment-row"
                key={item.id}
              >
                <div className="admin-equipment-record-icon">
                  <Telescope size={23} />
                </div>

                <div className="admin-mission-summary">
                  <span className="admin-card-eyebrow">
                    {item.category}
                  </span>

                  <h3>{item.name}</h3>

                  <p>
                    {item.role}
                    {' · '}
                    {item.status}
                  </p>
                </div>

                <div className="admin-mission-actions">
                  <button
                    type="button"
                    onClick={() =>
                      startEditingEquipment(item)
                    }
                  >
                    <Pencil size={16} />
                    EDIT
                  </button>

                  <button
                    type="button"
                    onClick={() => openHistory(item)}
                  >
                    <CalendarClock size={16} />
                    HISTORY
                  </button>

                  <button
                    type="button"
                    className="admin-delete-button"
                    onClick={() =>
                      handleDelete(item)
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