import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';

function getCaptureImageUrl(image) {
  if (!image) return '';

  if (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  return import.meta.env.BASE_URL + image.replace(/^\/+/, '');
}

function parseIntegrationSeconds(exposureText) {
  const value = String(exposureText || '').toLowerCase();
  const multiplied = value.match(/(\d{1,7})\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i);

  if (multiplied) {
    return Number(multiplied[1]) * Number(multiplied[2]);
  }

  const minutes = value.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);

  if (hours || minutes) {
    return (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0);
  }

  return 0;
}

function formatIntegration(seconds) {
  const total = Math.max(0, Math.round(seconds));

  if (!total) return 'NOT RECORDED';

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours) {
    return `${hours}H ${String(minutes).padStart(2, '0')}M`;
  }

  if (minutes) {
    return `${minutes}M ${String(secs).padStart(2, '0')}S`;
  }

  return `${secs} SEC`;
}

function normalizeDateValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function sortCapturesByDate(captures) {
  return [...captures].sort((a, b) => {
    const aDate = normalizeDateValue(a.captureDate) ?? -Infinity;
    const bDate = normalizeDateValue(b.captureDate) ?? -Infinity;

    if (aDate !== bDate) return aDate - bDate;

    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  });
}

function getMissionDate(entry) {
  return entry?.date || entry?.startedAt || entry?.created_at || '';
}

function getMissionSummary(entry, targetTitle) {
  const normalizedTarget = String(targetTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const targetNotes = entry?.targetNotes || {};
  const key = Object.keys(targetNotes).find(
    (candidate) => String(candidate).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalizedTarget
  );
  const note = key ? targetNotes[key] : null;

  return note?.result || note?.notes || entry?.summary || entry?.notes || 'Mission logged.';
}

function getStatusLabel(captures) {
  return captures.length ? 'ACQUIRED' : 'UNCAPTURED';
}

function getTargetPlanSlug(value) {
  return String(value || 'target')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'target';
}

export default function TargetDossier({
  target,
  captures = [],
  missionHistory = [],
  onClose,
  onAcquire,
  onOpenMission,
  onReplayMission,
  onCopyLink,
  onPlanMission
}) {
  const [copied, setCopied] = useState(false);
  const [missionPlan, setMissionPlan] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadMissionPlan() {
      const { data, error } = await supabase
        .from('mission_plans')
        .select('id, status, primary_objective, observing_window, operation_id, updated_at')
        .eq('target_slug', getTargetPlanSlug(target?.title))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error('[TARGET DOSSIER] Mission plan lookup failed:', error);
        return;
      }

      setMissionPlan(data || null);
    }

    loadMissionPlan();

    return () => {
      active = false;
    };
  }, [target?.title]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.body.classList.add('targetDossierOpen');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('targetDossierOpen');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const orderedCaptures = useMemo(
    () => sortCapturesByDate(captures),
    [captures]
  );

  const firstCapture = orderedCaptures[0] || null;
  const latestCapture = orderedCaptures[orderedCaptures.length - 1] || null;
  const bestCapture = orderedCaptures.find((capture) => capture.isFeatured) || latestCapture;
  const replayCapture = [...orderedCaptures]
    .reverse()
    .find((capture) => capture.rawImage && capture.stackedImage) || null;
  const totalIntegrationSeconds = orderedCaptures.reduce(
    (sum, capture) => sum + parseIntegrationSeconds(capture.exposure),
    0
  );
  const nextObjective =
    latestCapture?.nextGoal ||
    target?.nextGoal ||
    target?.notes ||
    'FIRST LIGHT';
  const status = getStatusLabel(orderedCaptures);
  const heroImage = getCaptureImageUrl(bestCapture?.image);

  const handleCopy = async () => {
    await onCopyLink?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="targetDossier" role="dialog" aria-modal="true" aria-label={`${target.title} target dossier`}>
      <div className="targetDossierBackdrop" aria-hidden="true" />

      <header className="targetDossierTopbar">
        <div>
          <span className="targetDossierGlyph">◎</span>
          <strong>CUZBRO // TARGET DOSSIER</strong>
          <small>{status === 'ACQUIRED' ? 'SENSOR RECORD ACTIVE' : 'SENSOR RECORD PENDING'}</small>
        </div>

        <div className="targetDossierTopActions">
          <button type="button" onClick={handleCopy}>
            {copied ? 'LINK COPIED' : 'COPY DOSSIER LINK'}
          </button>
          <button type="button" onClick={onClose}>CLOSE DOSSIER ×</button>
        </div>
      </header>

      <main className="targetDossierMain">
        <section className={`targetDossierHero ${heroImage ? 'has-image' : 'unresolved'}`}>
          {heroImage ? (
            <img src={heroImage} alt={`${target.title} best archived capture`} />
          ) : (
            <div className="targetDossierUnknown" aria-hidden="true">??</div>
          )}

          <div className="targetDossierHeroShade" aria-hidden="true" />

          <div className="targetDossierIdentity">
            <small>TARGET DOSSIER</small>
            <h1>{target.title}</h1>
            <h2>{target.subtitle || `${target.constellation || 'Unknown constellation'} · ${target.objectType || 'Celestial target'}`}</h2>

            <div className={`targetDossierStatus ${status.toLowerCase()}`}>
              <span />
              {status}
            </div>
          </div>
        </section>

        <section className="targetDossierStats" aria-label="Target dossier statistics">
          <div>
            <small>FIRST ACQUIRED</small>
            <strong>{firstCapture?.captureDate || 'NOT YET'}</strong>
          </div>
          <div>
            <small>LAST CAPTURE</small>
            <strong>{latestCapture?.captureDate || 'NO SENSOR RECORD'}</strong>
          </div>
          <div>
            <small>ARCHIVED CAPTURES</small>
            <strong>{orderedCaptures.length}</strong>
          </div>
          <div>
            <small>LOGGED MISSIONS</small>
            <strong>{missionHistory.length}</strong>
          </div>
          <div>
            <small>TOTAL INTEGRATION</small>
            <strong>{formatIntegration(totalIntegrationSeconds)}</strong>
          </div>
          <div>
            <small>BEST CAPTURE</small>
            <strong>{bestCapture ? bestCapture.captureDate || bestCapture.title : 'PENDING'}</strong>
          </div>
        </section>

        {missionPlan && (
          <section className={`targetDossierMissionPlanStatus ${missionPlan.status === 'ACTIVE' ? 'active' : 'planned'}`}>
            <div>
              <small>{missionPlan.status === 'ACTIVE' ? 'ACTIVE MISSION PLANNED' : 'MISSION PLAN SAVED'}</small>
              <strong>{missionPlan.primary_objective || 'TARGET PURSUIT PLAN'}</strong>
              <span>{missionPlan.observing_window || 'Planner dependent'}</span>
            </div>
            <button type="button" onClick={onPlanMission}>
              {missionPlan.status === 'ACTIVE' ? 'VIEW ACTIVE PLAN →' : 'OPEN MISSION PLAN →'}
            </button>
          </section>
        )}

        <section className="targetDossierGrid">
          <article className="targetDossierCard targetDossierHistory">
            <div className="targetDossierCardHeader">
              <small>MISSION HISTORY</small>
              <strong>{missionHistory.length ? `${missionHistory.length} LOGGED` : 'NO MISSIONS LOGGED'}</strong>
            </div>

            <div className="targetDossierTimeline">
              {missionHistory.length ? missionHistory.map((entry, index) => (
                <div className="targetDossierTimelineEntry" key={entry.id || `${getMissionDate(entry)}-${index}`}>
                  <span className="targetDossierTimelineNode" aria-hidden="true" />
                  <div>
                    <small>{getMissionDate(entry) || 'DATE UNKNOWN'}</small>
                    <strong>{entry.mission || entry.title || entry.summary || `MISSION ${missionHistory.length - index}`}</strong>
                    <p>{getMissionSummary(entry, target.title)}</p>
                  </div>
                </div>
              )) : (
                <div className="targetDossierEmptyState">
                  <span>○</span>
                  <strong>NO FIELD MISSIONS LINKED</strong>
                  <p>The dossier is ready. Mission history will populate when this target appears in the Captain&apos;s Log.</p>
                </div>
              )}
            </div>
          </article>

          <div className="targetDossierSideStack">
            <article className="targetDossierCard">
              <div className="targetDossierCardHeader">
                <small>TARGET PROFILE</small>
                <strong>{target.objectType || 'CELESTIAL OBJECT'}</strong>
              </div>
              <dl className="targetDossierProfile">
                <div><dt>Constellation</dt><dd>{target.constellation || 'Unknown'}</dd></div>
                <div><dt>Distance</dt><dd>{bestCapture?.distance || target.distance || 'Not recorded'}</dd></div>
                <div><dt>RA</dt><dd>{target.ra != null ? Number(target.ra).toFixed(4) : 'Ephemeris'}</dd></div>
                <div><dt>DEC</dt><dd>{target.dec != null ? Number(target.dec).toFixed(4) : 'Ephemeris'}</dd></div>
                <div><dt>Best Window</dt><dd>{target.tonightPlan?.bestWindow || target.bestSeason || 'Planner dependent'}</dd></div>
              </dl>
            </article>

            <article className="targetDossierCard targetDossierObjective">
              <div className="targetDossierCardHeader">
                <small>NEXT OBJECTIVE</small>
                <strong>{status === 'ACQUIRED' ? 'CONTINUE PURSUIT' : 'FIRST LIGHT'}</strong>
              </div>
              <p>{nextObjective}</p>
            </article>

            {bestCapture && (
              <article className="targetDossierCard">
                <div className="targetDossierCardHeader">
                  <small>BEST SENSOR RECORD</small>
                  <strong>{bestCapture.title}</strong>
                </div>
                <dl className="targetDossierProfile">
                  <div><dt>Exposure</dt><dd>{bestCapture.exposure || 'Not recorded'}</dd></div>
                  <div><dt>Equipment</dt><dd>{bestCapture.equipment || 'Not recorded'}</dd></div>
                  <div><dt>Processing</dt><dd>{bestCapture.processing || 'Not recorded'}</dd></div>
                </dl>
              </article>
            )}
          </div>
        </section>
      </main>

      <footer className="targetDossierFooter">
        <button type="button" className="targetDossierPrimary" onClick={onAcquire}>
          <span>⊕</span>
          ACQUIRE TARGET
        </button>

        <button type="button" onClick={onPlanMission}>
          ◫ PLAN MISSION
        </button>

        {replayCapture ? (
          <button type="button" onClick={() => onReplayMission?.(replayCapture)}>
            ▶ REPLAY LATEST MISSION
          </button>
        ) : (
          <button type="button" disabled className="targetDossierDisabled">
            REPLAY UNAVAILABLE
          </button>
        )}

        {bestCapture ? (
          <button type="button" onClick={() => onOpenMission?.(bestCapture)}>
            VIEW BEST CAPTURE →
          </button>
        ) : (
          <button type="button" disabled className="targetDossierDisabled targetDossierStruck">
            SENSOR RECORD UNAVAILABLE
          </button>
        )}
      </footer>
    </div>
  );
}
