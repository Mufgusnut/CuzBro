import { BookOpen, ChevronDown, ChevronUp, Orbit, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function getStardate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const year = date.getFullYear();
  const start = new Date(year, 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);

  return `${year}.${String(dayOfYear).padStart(3, '0')}`;
}

function getMissionAnchor(entry) {
  return String(entry?.id || entry?.mission || 'mission')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function LogList({ title, items, tone = 'good' }) {
  if (!items?.length) return null;

  return (
    <div className={`captainsLogList ${tone}`}>
      <b>{title}</b>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function LogEntry({ entry, defaultOpen = false, forcedOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const stardate = useMemo(() => getStardate(entry.date), [entry.date]);

  useEffect(() => {
    if (forcedOpen) {
      setOpen(true);
    }
  }, [forcedOpen]);

  return (
    <article
      id={getMissionAnchor(entry)}
      className={open ? 'captainsLogEntry open' : 'captainsLogEntry'}
    >
      <button
        type="button"
        className="captainsLogEntryHeader"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="captainsLogMissionBadge">
          <Orbit size={20} />
        </span>

        <span className="captainsLogEntryTitle">
          <small>Captain&apos;s Log · Stardate {stardate}</small>
          <strong>{entry.mission}</strong>
          <em>{entry.targets.join(' · ')}</em>
        </span>

        <span className="captainsLogEntryToggle">
          {open ? <ChevronUp /> : <ChevronDown />}
        </span>
      </button>

      {open && (
        <div className="captainsLogEntryBody">
          <div className="captainsLogMissionIntro">
            <div>
              <small>{entry.id}</small>
              <h2>{entry.mission}</h2>
              <p>{entry.summary}</p>
            </div>

            <div className="captainsLogStardate">
              <Star size={18} />
              <small>STARDATE</small>
              <strong>{stardate}</strong>
            </div>
          </div>

          <div className="captainsLogFacts">
            <span><b>Location</b>{entry.location}</span>
            <span><b>Targets</b>{entry.targets.join(', ')}</span>
            <span><b>Equipment</b>{entry.equipment.join(', ')}</span>
            <span><b>Moon</b>{entry.conditions?.moon || 'Not recorded'}</span>
            <span><b>Seeing</b>{entry.conditions?.seeing || 'Not recorded'}</span>
            <span><b>Transparency</b>{entry.conditions?.transparency || 'Not recorded'}</span>
          </div>

          {entry.notes && (
            <div className="captainsLogNarrative">
              <small>Mission Notes</small>
              <p>{entry.notes}</p>
            </div>
          )}

          <div className="captainsLogLessons">
            <LogList title="What Worked" items={entry.worked} tone="good" />
            <LogList title="Needs Improvement" items={entry.improve} tone="caution" />
          </div>

          {entry.nextMission && (
            <div className="captainsLogNextMission">
              <small>Next Mission</small>
              <p>{entry.nextMission}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function CaptainsLog({ entries = [], status = 'ready' }) {
  const [linkedMissionAnchor, setLinkedMissionAnchor] = useState(() =>
    window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : ''
  );

  useEffect(() => {
    const syncHash = () => {
      setLinkedMissionAnchor(
        window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : ''
      );
    };

    window.addEventListener('hashchange', syncHash);
    syncHash();

    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !linkedMissionAnchor) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(linkedMissionAnchor);
        if (!target) return;

        const nav = document.querySelector('.nav');
        const navHeight = nav?.getBoundingClientRect().height || 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY;

        window.scrollTo({
          top: Math.max(0, targetTop - navHeight - 18),
          behavior: 'smooth'
        });
      });
    });
  }, [entries, linkedMissionAnchor, status]);

  return (
    <section className="captainsLogWrap">
      <a className="captainsLogBack" href="/#observatory">← Back to Observatory</a>

      <header className="captainsLogHero">
        <small><BookOpen size={16} /> CuzBro Observatory Record</small>
        <h1>Captain&apos;s Log.</h1>
        <p>
          Field reports from the edge of the backyard. Successes, failures,
          questionable decisions, and lessons carried forward to the next mission.
        </p>
      </header>

      <div className="captainsLogStatusStrip">
        <span><b>{entries.length}</b> log {entries.length === 1 ? 'entry' : 'entries'}</span>
        <span><b>ELIOT</b> primary command</span>
        <span><b>2026</b> mission year</span>
      </div>

      <section className="captainsLogEntries" aria-label="Captain's Log entries">
        {status === 'loading' && (
          <div className="captainsLogMessage">Loading mission records…</div>
        )}

        {status === 'error' && (
          <div className="captainsLogMessage error">
            Captain&apos;s Log data could not be loaded.
          </div>
        )}

        {status === 'ready' && entries.length === 0 && (
          <div className="captainsLogMessage">
            No mission records logged yet.
          </div>
        )}

        {entries.map((entry) => {
          const missionAnchor = getMissionAnchor(entry);
          const isLinkedMission = linkedMissionAnchor === missionAnchor;

          return (
            <LogEntry
              key={entry.id}
              entry={entry}
              defaultOpen={isLinkedMission}
              forcedOpen={isLinkedMission}
            />
          );
        })}
      </section>
    </section>
  );
}
