import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import { getCrewMember } from '../lib/crew.js';
import {
  announceOperationChange,
  getActiveOperation,
  recordOperationEvent
} from '../lib/operations.js';
import { logCrewActivity } from '../lib/audit.js';

const DEFAULT_CHECKLIST = [
  ['powerStable', 'POWER STABLE'],
  ['dewControl', 'DEW CONTROL ACTIVE'],
  ['alignment', 'ALIGNMENT COMPLETE'],
  ['focus', 'FOCUS VERIFIED'],
  ['targetCentered', 'TARGET CENTERED'],
  ['testFrame', 'TEST FRAME REVIEWED']
];

function slugifyTarget(value) {
  return String(value || 'target')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'target';
}

function buildDefaults(target, captures) {
  const latestCapture = [...(captures || [])]
    .sort((a, b) => {
      const aTime = Date.parse(a?.captureDate || '') || 0;
      const bTime = Date.parse(b?.captureDate || '') || 0;
      return bTime - aTime;
    })[0] || null;

  const objective =
    latestCapture?.nextGoal ||
    target?.nextGoal ||
    (latestCapture ? 'IMPROVE THE EXISTING SENSOR RECORD' : 'FIRST LIGHT');

  const targetType = String(target?.objectType || '').toLowerCase();
  const suggestedCapture = targetType.includes('cluster')
    ? '300 × 5 SEC'
    : targetType.includes('planet') || targetType.includes('lunar')
      ? 'HIGH-FRAME-RATE VIDEO // SHORT EXPOSURE'
      : targetType.includes('nebula')
        ? '600 × 10 SEC'
        : '600 × 5 SEC';

  const capturePlan =
    latestCapture?.exposure ||
    target?.recommendedCapture ||
    suggestedCapture;

  const equipment =
    latestCapture?.equipment ||
    'ASI294MC // CPC 800 // F/6.3';

  return {
    observingWindow: target?.tonightPlan?.bestWindow || target?.bestWindow || 'PLANNER DEPENDENT',
    primaryObjective: String(objective).toUpperCase(),
    capturePlan,
    gain: '120',
    equipment,
    notes: '',
    checklist: Object.fromEntries(DEFAULT_CHECKLIST.map(([key]) => [key, false]))
  };
}

function normalizePlanRow(row, fallback) {
  if (!row) return fallback;

  return {
    observingWindow: row.observing_window || fallback.observingWindow,
    primaryObjective: row.primary_objective || fallback.primaryObjective,
    capturePlan: row.capture_plan || fallback.capturePlan,
    gain: row.gain_setting || fallback.gain,
    equipment: row.equipment || fallback.equipment,
    notes: row.crew_notes || '',
    checklist: {
      ...fallback.checklist,
      ...(row.checklist && typeof row.checklist === 'object' ? row.checklist : {})
    }
  };
}

export default function MissionPlanningBoard({
  target,
  captures = [],
  onClose,
  onOperationStarted
}) {
  const targetSlug = useMemo(() => slugifyTarget(target?.title), [target?.title]);
  const defaults = useMemo(() => buildDefaults(target, captures), [target, captures]);
  const [plan, setPlan] = useState(defaults);
  const [savedPlan, setSavedPlan] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setPlan(defaults);
  }, [defaults]);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus('loading');
      setError('');

      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      const { data, error: loadError } = await supabase
        .from('mission_plans')
        .select('*')
        .eq('target_slug', targetSlug)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;

      setSession(currentSession || null);

      if (loadError) {
        console.error('[MISSION PLAN] Load failed:', loadError);
        setError(loadError.message || 'Mission plan unavailable.');
        setStatus('error');
        return;
      }

      setSavedPlan(data || null);
      setPlan(normalizePlanRow(data, defaults));
      setStatus('ready');
    }

    load();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.body.classList.add('missionPlanningBoardOpen');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      document.body.classList.remove('missionPlanningBoardOpen');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [defaults, onClose, targetSlug]);

  const crew = session?.user?.email ? getCrewMember(session.user.email) : null;
  const canWrite = Boolean(session?.user?.id);
  const checkedCount = DEFAULT_CHECKLIST.filter(([key]) => plan.checklist?.[key]).length;

  const updateField = (field, value) => {
    setPlan((current) => ({ ...current, [field]: value }));
    setMessage('');
  };

  const toggleChecklist = (key) => {
    setPlan((current) => ({
      ...current,
      checklist: {
        ...current.checklist,
        [key]: !current.checklist?.[key]
      }
    }));
    setMessage('');
  };

  async function savePlan({ quiet = false } = {}) {
    if (!canWrite) {
      throw new Error('Authenticated CuzBro crew access required to save mission plans.');
    }

    const payload = {
      target_slug: targetSlug,
      target_title: target.title,
      target_type: target.objectType || null,
      constellation: target.constellation || null,
      observing_window: plan.observingWindow.trim(),
      primary_objective: plan.primaryObjective.trim(),
      capture_plan: plan.capturePlan.trim(),
      gain_setting: plan.gain.trim(),
      equipment: plan.equipment.trim(),
      checklist: plan.checklist,
      crew_notes: plan.notes.trim(),
      status: savedPlan?.status === 'ACTIVE' ? 'ACTIVE' : 'PLANNED',
      updated_by_user_id: session.user.id,
      updated_by_email: session.user.email || null,
      updated_by_name: crew?.name || session.user.email || 'CuzBro Crew'
    };

    let query;

    if (savedPlan?.id) {
      query = supabase
        .from('mission_plans')
        .update(payload)
        .eq('id', savedPlan.id);
    } else {
      query = supabase
        .from('mission_plans')
        .insert({
          ...payload,
          created_by_user_id: session.user.id,
          created_by_email: session.user.email || null,
          created_by_name: crew?.name || session.user.email || 'CuzBro Crew'
        });
    }

    const { data, error: saveError } = await query.select('*').single();

    if (saveError) throw saveError;

    setSavedPlan(data);

    await logCrewActivity({
      action: savedPlan?.id ? 'MISSION_PLAN_UPDATED' : 'MISSION_PLAN_CREATED',
      category: 'MISSION',
      resourceType: 'mission_plan',
      resourceId: data.id,
      resourceName: target.title,
      details: {
        target: target.title,
        objective: data.primary_objective,
        observingWindow: data.observing_window
      }
    });

    if (!quiet) setMessage('MISSION PLAN SAVED');
    return data;
  }

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await savePlan();
    } catch (saveError) {
      console.error('[MISSION PLAN] Save failed:', saveError);
      setError(saveError.message || 'Mission plan could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const beginOperation = async () => {
    if (!canWrite) {
      setError('Authenticated CuzBro crew access required to begin an operation.');
      return;
    }

    setStarting(true);
    setError('');
    setMessage('');

    try {
      const activeOperation = await getActiveOperation();
      if (activeOperation) {
        throw new Error(`Operation ${activeOperation.designation} is already active. Complete or disengage it before beginning another.`);
      }

      const currentPlan = await savePlan({ quiet: true });
      const designation = `${target.title} // ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`;

      const { data: operation, error: operationError } = await supabase
        .from('crew_operations')
        .insert({
          designation,
          target: target.title,
          operation_type: 'Astrophotography',
          objective: plan.primaryObjective.trim(),
          status: 'ACTIVE',
          initiated_by_user_id: session.user.id,
          initiated_by_email: session.user.email || '',
          initiated_by_name: crew?.name || session.user.email || 'CuzBro Crew'
        })
        .select('*')
        .single();

      if (operationError) throw operationError;

      const { error: linkError } = await supabase
        .from('mission_plans')
        .update({
          status: 'ACTIVE',
          operation_id: operation.id,
          started_at: new Date().toISOString()
        })
        .eq('id', currentPlan.id);

      if (linkError) throw linkError;

      await recordOperationEvent({
        operation,
        eventType: 'OPERATION_STARTED',
        eventLabel: 'OPERATION INITIATED',
        resourceType: 'operation',
        resourceId: operation.id,
        resourceName: operation.designation,
        details: {
          target: target.title,
          operationType: 'Astrophotography',
          objective: plan.primaryObjective.trim()
        },
        session
      });

      await recordOperationEvent({
        operation,
        eventType: 'MISSION_PLAN_ACTIVATED',
        eventLabel: 'MISSION PLAN ACTIVATED',
        resourceType: 'mission_plan',
        resourceId: currentPlan.id,
        resourceName: target.title,
        details: {
          target: target.title,
          objective: plan.primaryObjective.trim(),
          capturePlan: plan.capturePlan.trim(),
          observingWindow: plan.observingWindow.trim()
        },
        session
      });

      await logCrewActivity({
        action: 'MISSION_PLAN_OPERATION_STARTED',
        category: 'OPERATION',
        resourceType: 'mission_plan',
        resourceId: currentPlan.id,
        resourceName: target.title,
        details: {
          operationId: operation.id,
          designation: operation.designation,
          target: target.title
        }
      });

      announceOperationChange();
      setSavedPlan({ ...currentPlan, status: 'ACTIVE', operation_id: operation.id });
      setMessage(`OPERATION ACTIVE // ${designation.toUpperCase()}`);
      onOperationStarted?.(operation);
    } catch (startError) {
      console.error('[MISSION PLAN] Operation start failed:', startError);
      setError(startError.message || 'Operation could not be started.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="missionPlanningBoard" role="dialog" aria-modal="true" aria-label={`${target.title} mission planning board`}>
      <div className="missionPlanningBackdrop" aria-hidden="true" />

      <header className="missionPlanningTopbar">
        <div>
          <span>◫</span>
          <strong>CUZBRO // MISSION PLANNING BOARD</strong>
          <small>{savedPlan?.status === 'ACTIVE' ? 'OPERATION LINK ACTIVE' : savedPlan ? 'SAVED TARGET PLAN' : 'NEW TARGET PLAN'}</small>
        </div>
        <button type="button" onClick={onClose}>CLOSE BOARD ×</button>
      </header>

      <main className="missionPlanningMain">
        <section className="missionPlanningIdentity">
          <small>TARGET</small>
          <h1>{target.title}</h1>
          <p>{target.constellation || 'UNKNOWN CONSTELLATION'} · {target.objectType || 'CELESTIAL TARGET'}</p>
          <div className="missionPlanningWindow">
            <span>BEST OBSERVING WINDOW</span>
            <strong>{plan.observingWindow || 'PLANNER DEPENDENT'}</strong>
          </div>
        </section>

        <section className="missionPlanningGrid">
          <article className="missionPlanningCard missionPlanningObjectives">
            <div className="missionPlanningCardHeader">
              <small>MISSION PARAMETERS</small>
              <strong>PRIMARY PLAN</strong>
            </div>

            <label>
              <span>Observing Window</span>
              <input value={plan.observingWindow} onChange={(event) => updateField('observingWindow', event.target.value)} />
            </label>

            <label>
              <span>Primary Objective</span>
              <textarea rows="3" value={plan.primaryObjective} onChange={(event) => updateField('primaryObjective', event.target.value)} />
            </label>

            <div className="missionPlanningFieldPair">
              <label>
                <span>Capture Plan</span>
                <input value={plan.capturePlan} onChange={(event) => updateField('capturePlan', event.target.value)} />
              </label>
              <label>
                <span>Gain</span>
                <input value={plan.gain} onChange={(event) => updateField('gain', event.target.value)} />
              </label>
            </div>

            <label>
              <span>Equipment</span>
              <input value={plan.equipment} onChange={(event) => updateField('equipment', event.target.value)} />
            </label>
          </article>

          <article className="missionPlanningCard missionPlanningChecklist">
            <div className="missionPlanningCardHeader">
              <small>PRE-FLIGHT CHECKLIST</small>
              <strong>{checkedCount} / {DEFAULT_CHECKLIST.length} VERIFIED</strong>
            </div>

            <div className="missionPlanningChecklistRows">
              {DEFAULT_CHECKLIST.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={plan.checklist?.[key] ? 'checked' : ''}
                  onClick={() => toggleChecklist(key)}
                >
                  <span>{plan.checklist?.[key] ? '✓' : '□'}</span>
                  {label}
                </button>
              ))}
            </div>
          </article>

          <article className="missionPlanningCard missionPlanningNotes">
            <div className="missionPlanningCardHeader">
              <small>CREW NOTES</small>
              <strong>{crew ? `EDITING AS ${crew.name.toUpperCase()}` : 'READ / DRAFT MODE'}</strong>
            </div>
            <textarea
              rows="8"
              value={plan.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="Focus notes, weather concerns, framing decisions, crew handoff details..."
            />
          </article>
        </section>

        {status === 'loading' && <p className="missionPlanningMessage">LOADING TARGET PLAN…</p>}
        {message && <p className="missionPlanningMessage success">{message}</p>}
        {error && <p className="missionPlanningMessage error">{error}</p>}
        {!canWrite && status !== 'loading' && !error && (
          <p className="missionPlanningMessage">PUBLIC PLANNING VIEW // AUTHENTICATED CREW ACCESS REQUIRED TO SAVE OR BEGIN AN OPERATION</p>
        )}
      </main>

      <footer className="missionPlanningFooter">
        <button type="button" onClick={onClose}>RETURN TO SKY MAP</button>
        <button type="button" onClick={handleSave} disabled={!canWrite || saving || starting}>
          {saving ? 'SAVING…' : 'SAVE MISSION PLAN'}
        </button>
        <button type="button" className="missionPlanningPrimary" onClick={beginOperation} disabled={!canWrite || saving || starting || savedPlan?.status === 'ACTIVE'}>
          {savedPlan?.status === 'ACTIVE' ? 'OPERATION ACTIVE' : starting ? 'STARTING OPERATION…' : 'BEGIN OPERATION'}
        </button>
      </footer>
    </div>
  );
}
