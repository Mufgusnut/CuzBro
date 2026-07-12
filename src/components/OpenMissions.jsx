import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import { getCrewMember } from '../lib/crew.js';
import { announceOperationChange, getActiveOperation, recordOperationEvent } from '../lib/operations.js';
import { logCrewActivity } from '../lib/audit.js';
import { missionSlug, rankOpenMissions } from '../lib/openMissions.js';

export default function OpenMissions({ activeSite, session = null, adminMode = false }) {
  const [plans, setPlans] = useState([]);
  const [busyTarget, setBusyTarget] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const missions = useMemo(() => rankOpenMissions(activeSite || { lat: 43.1531, lon: -70.7828 }), [activeSite]);

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      const { data, error: loadError } = await supabase.from('mission_plans').select('*').in('status', ['PLANNED', 'ACTIVE']).order('updated_at', { ascending: false });
      if (!active) return;
      if (!loadError) setPlans(data || []);
    }
    loadPlans();
    return () => { active = false; };
  }, []);

  const planFor = (target) => plans.find((plan) => plan.target_slug === missionSlug(target.title));

  async function acceptMission(target) {
    if (!session?.user?.id) return;
    setBusyTarget(target.title); setMessage(''); setError('');
    try {
      const crew = getCrewMember(session.user.email);
      const payload = {
        target_slug: missionSlug(target.title), target_title: target.title, target_type: target.objectType,
        constellation: target.constellation, observing_window: `BEST NEAR ${target.bestTime} // MAX ALT ${target.bestAltitude}°`,
        primary_objective: target.objective, capture_plan: target.capturePlan, gain_setting: '120', equipment: target.equipment,
        checklist: {}, crew_notes: `Accepted from Open Missions. Tonight rating: ${target.rating}.`, status: 'PLANNED',
        updated_by_user_id: session.user.id, updated_by_email: session.user.email || null, updated_by_name: crew?.name || session.user.email
      };
      const existing = planFor(target);
      const query = existing?.id
        ? supabase.from('mission_plans').update(payload).eq('id', existing.id)
        : supabase.from('mission_plans').insert({ ...payload, created_by_user_id: session.user.id, created_by_email: session.user.email || null, created_by_name: crew?.name || session.user.email });
      const { data, error: saveError } = await query.select('*').single();
      if (saveError) throw saveError;
      setPlans((current) => [data, ...current.filter((plan) => plan.id !== data.id)]);
      await logCrewActivity({ action: 'OPEN_MISSION_ACCEPTED', category: 'MISSION', resourceType: 'mission_plan', resourceId: data.id, resourceName: target.title, details: { rating: target.rating, bestTime: target.bestTime, bestAltitude: target.bestAltitude } });
      setMessage(`${target.title.toUpperCase()} ACCEPTED // READY TO START`);
    } catch (acceptError) { setError(acceptError.message || 'Mission could not be accepted.'); }
    finally { setBusyTarget(''); }
  }

  async function startMission(target) {
    const plan = planFor(target);
    if (!plan || !session?.user?.id) return;
    setBusyTarget(target.title); setMessage(''); setError('');
    try {
      const activeOperation = await getActiveOperation();
      if (activeOperation) throw new Error(`${activeOperation.designation} is already active.`);
      const crew = getCrewMember(session.user.email);
      const designation = `${target.shortTitle || target.title} // ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`;
      const { data: operation, error: operationError } = await supabase.from('crew_operations').insert({ designation, target: target.title, operation_type: 'Astrophotography', objective: plan.primary_objective, status: 'ACTIVE', initiated_by_user_id: session.user.id, initiated_by_email: session.user.email || '', initiated_by_name: crew?.name || session.user.email }).select('*').single();
      if (operationError) throw operationError;
      const { error: linkError } = await supabase.from('mission_plans').update({ status: 'ACTIVE', operation_id: operation.id, started_at: new Date().toISOString() }).eq('id', plan.id);
      if (linkError) throw linkError;
      await recordOperationEvent({ operation, eventType: 'OPEN_MISSION_STARTED', eventLabel: 'OPEN MISSION STARTED', resourceType: 'mission_plan', resourceId: plan.id, resourceName: target.title, details: { capturePlan: plan.capture_plan, observingWindow: plan.observing_window }, session });
      announceOperationChange();
      window.location.href = '/admin/operation';
    } catch (startError) { setError(startError.message || 'Mission could not be started.'); setBusyTarget(''); }
  }

  return (
    <section className={`openMissions ${adminMode ? 'openMissionsAdmin' : ''}`} id="open-missions">
      <div className="openMissionsHeader">
        <div><span>TONIGHT’S TARGET QUEUE</span><h2>Open Missions</h2><p>Ranked for visibility from {activeSite?.name || 'Eliot, ME'}, with easier high-altitude targets prioritized.</p></div>
        <a href={adminMode ? '/skymap' : '/skymap'}>OPEN SKY MAP →</a>
      </div>
      {message && <p className="openMissionsNotice success">{message}</p>}
      {error && <p className="openMissionsNotice error">{error}</p>}
      <div className="openMissionsGrid">
        {missions.slice(0, adminMode ? 10 : 6).map((target, index) => {
          const plan = planFor(target);
          const accepted = Boolean(plan);
          return <article className={`openMissionCard ${index === 0 ? 'priority' : ''}`} key={target.title}>
            <div className="openMissionRank"><strong>#{index + 1}</strong><span>{target.rating}</span></div>
            <small>{target.objectType} · {target.constellation}</small>
            <h3>{target.title}</h3>
            <div className="openMissionMetrics"><span><b>{target.bestAltitude}°</b> MAX ALT</span><span><b>{target.bestTime}</b> BEST TIME</span><span><b>{target.hoursAbove30.toFixed(1)}H</b> ABOVE 30°</span></div>
            <p>{target.objective}</p>
            <div className="openMissionFooter">
              <span>{target.capturePlan}</span>
              {adminMode ? (
                accepted ? <button type="button" onClick={() => startMission(target)} disabled={busyTarget === target.title || plan.status === 'ACTIVE'}>{plan.status === 'ACTIVE' ? 'MISSION ACTIVE' : busyTarget === target.title ? 'STARTING…' : 'START MISSION'}</button>
                : <button type="button" onClick={() => acceptMission(target)} disabled={busyTarget === target.title}>{busyTarget === target.title ? 'ACCEPTING…' : 'ACCEPT MISSION'}</button>
              ) : <span className={accepted ? 'accepted' : ''}>{accepted ? 'MISSION ACCEPTED' : 'OPEN'}</span>}
            </div>
          </article>;
        })}
      </div>
      {!adminMode && <div className="openMissionsPublicFooter"><a href="/admin/missions">CREW: REVIEW & ACCEPT MISSIONS →</a></div>}
    </section>
  );
}
