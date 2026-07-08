import { Clock3, Moon, Sparkles, Star, Telescope } from 'lucide-react';

function getCaptureImageUrl(image) {
  if (!image) {
    return '';
  }

  if (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  return (
    import.meta.env.BASE_URL +
    image.replace(/^\/+/, '')
  );
}

function normalizeMissionTargetName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TARGET_ALIASES = {
  'dumbbell nebula': ['m27'],
  'ring nebula': ['m57'],
  'lagoon nebula': ['m8'],
  'whirlpool galaxy': ['m51'],
  'm51 whirlpool galaxy': ['m51', 'whirlpool galaxy'],
  'fireworks galaxy': ['ngc 6946'],
  'great hercules cluster': ['m13'],
  m13: ['great hercules cluster'],
  albireo: ['beta cygni']
};

const TIMELINE_MILESTONES = [
  {
    id: 'cpc-800-acquired',
    date: '2026-06-13',
    title: 'CPC 800 Acquired',
    eyebrow: 'Observatory Milestone',
    description:
      'The telescope system that started the current CuzBro observing era.'
  }
];



function getMissionType(photo) {
  const typeText = normalizeMissionTargetName(
    [photo?.category, photo?.objectType, photo?.subtitle, photo?.title]
      .filter(Boolean)
      .join(' ')
  );

  if (typeText.includes('moon') || typeText.includes('lunar')) {
    return 'lunar';
  }

  if (typeText.includes('galaxy')) {
    return 'galaxy';
  }

  if (
    typeText.includes('nebula') ||
    typeText.includes('planetary') ||
    typeText.includes('emission')
  ) {
    return 'nebula';
  }

  if (
    typeText.includes('cluster') ||
    typeText.includes('double star') ||
    typeText.includes('star') ||
    typeText.includes('albireo')
  ) {
    return 'stellar';
  }

  return 'other';
}

function MissionTypeIcon({ type }) {
  if (type === 'lunar') {
    return <Moon size={11} strokeWidth={2.2} aria-hidden="true" />;
  }

  if (type === 'galaxy') {
    return <Sparkles size={11} strokeWidth={2.2} aria-hidden="true" />;
  }

  if (type === 'stellar') {
    return <Star size={11} strokeWidth={2.2} aria-hidden="true" />;
  }

  return <Telescope size={11} strokeWidth={2.2} aria-hidden="true" />;
}

function getCatalogIdentifiers(value) {
  const normalized = normalizeMissionTargetName(value);
  const identifiers = normalized.match(/\b(?:m|ngc|ic)\s*\d+\b/g) || [];

  return identifiers.map((identifier) =>
    identifier.replace(/\s+/g, '')
  );
}

function getTargetCandidates(photo) {
  const values = [photo?.title, photo?.subtitle]
    .map(normalizeMissionTargetName)
    .filter(Boolean);

  const candidates = new Set(values);

  values.forEach((value) => {
    (TARGET_ALIASES[value] || []).forEach((alias) => {
      candidates.add(normalizeMissionTargetName(alias));
    });
  });

  [photo?.title, photo?.subtitle].forEach((value) => {
    getCatalogIdentifiers(value).forEach((identifier) => {
      candidates.add(identifier);
      candidates.add(identifier.replace(/^(m|ngc|ic)(\d+)$/, '$1 $2'));
    });
  });

  return [...candidates].filter(Boolean);
}

function targetMatchesPhoto(target, photo) {
  const normalizedTarget = normalizeMissionTargetName(target);

  if (!normalizedTarget) {
    return false;
  }

  const compactTarget = normalizedTarget.replace(/\s+/g, '');

  return getTargetCandidates(photo).some((candidate) => {
    const compactCandidate = candidate.replace(/\s+/g, '');

    return (
      normalizedTarget === candidate ||
      compactTarget === compactCandidate
    );
  });
}

function getMatchingCaptainLogDate(photo, captainsLog) {
  const matchingEntry = [...(captainsLog || [])]
    .filter((entry) =>
      (entry.targets || []).some((target) =>
        targetMatchesPhoto(target, photo)
      )
    )
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

  return matchingEntry?.date || '';
}

function hasExactDay(value) {
  if (!value) {
    return false;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(text)) {
    return true;
  }

  return /\b\d{1,2}\b/.test(text) && /\b\d{4}\b/.test(text);
}

function getMissionDate(photo, captainsLog) {
  const captureDate = photo?.captureDate || '';
  const captainLogDate = getMatchingCaptainLogDate(photo, captainsLog);

  if (hasExactDay(captureDate)) {
    return captureDate;
  }

  return captainLogDate || captureDate || '';
}

function parseMissionDate(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = new Date(isoDateOnly ? `${text}T12:00:00` : text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getMissionTime(photo, captainsLog) {
  const date = parseMissionDate(getMissionDate(photo, captainsLog));
  return date ? date.getTime() : 0;
}

function getDateKey(value) {
  const date = parseMissionDate(value);

  if (!date) {
    return value ? `undated-${String(value)}` : 'undated';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function getTimelineDateParts(value) {
  const date = parseMissionDate(value);

  if (!date) {
    return {
      isoDate: '',
      monthDay: value ? String(value) : 'Undated',
      year: ''
    };
  }

  return {
    isoDate: getDateKey(value),
    monthDay: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric'
    }).format(date),
    year: String(date.getFullYear())
  };
}

function formatTimelineDate(value) {
  const parts = getTimelineDateParts(value);

  return parts.year
    ? `${parts.monthDay}, ${parts.year}`
    : parts.monthDay;
}

function groupMissionsByDate(missions, captainsLog) {
  const groups = [];
  const byDate = new Map();

  missions.forEach((photo) => {
    const missionDate = getMissionDate(photo, captainsLog);
    const key = getDateKey(missionDate);

    if (!byDate.has(key)) {
      const group = {
        key,
        missionDate,
        missions: []
      };

      byDate.set(key, group);
      groups.push(group);
    }

    byDate.get(key).missions.push(photo);
  });

  return groups;
}

function addMilestonesToDateGroups(dateGroups) {
  const groups = dateGroups.map((group) => ({
    ...group,
    milestones: []
  }));
  const byDate = new Map(groups.map((group) => [group.key, group]));

  TIMELINE_MILESTONES.forEach((milestone) => {
    const key = getDateKey(milestone.date);

    if (!byDate.has(key)) {
      const group = {
        key,
        missionDate: milestone.date,
        missions: [],
        milestones: []
      };

      byDate.set(key, group);
      groups.push(group);
    }

    byDate.get(key).milestones.push(milestone);
  });

  return groups.sort(
    (a, b) =>
      (parseMissionDate(a.missionDate)?.getTime() || 0) -
      (parseMissionDate(b.missionDate)?.getTime() || 0)
  );
}


export default function MissionTimeline({
  gallery,
  captainsLog = [],
  onOpenMission
}) {
  const sortedMissions = [...(gallery || [])].sort((a, b) => {
    const dateDifference =
      getMissionTime(b, captainsLog) -
      getMissionTime(a, captainsLog);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return (b.sortOrder || 0) - (a.sortOrder || 0);
  });

  const latestMissionId = sortedMissions[0]?.id;
  const recentMissions = sortedMissions.slice(0, 8).reverse();

  const observingDateGroups = groupMissionsByDate(
    recentMissions,
    captainsLog
  );
  const dateGroups = addMilestonesToDateGroups(observingDateGroups);
  const milestoneCount = TIMELINE_MILESTONES.length;

  if (recentMissions.length < 2) {
    return null;
  }

  return (
    <section
      className="missionTimeline"
      aria-labelledby="mission-timeline-title"
    >
      <div className="missionTimelineHeading">
        <div>
          <small>Recent Mission History</small>
          <h2 id="mission-timeline-title">
            Along the observing timeline
          </h2>
        </div>

        <div className="missionTimelineMeta">
          <span>
            {recentMissions.length} captures · {observingDateGroups.length} observing {observingDateGroups.length === 1 ? 'date' : 'dates'} · {milestoneCount} {milestoneCount === 1 ? 'milestone' : 'milestones'}
          </span>
          <span className="missionTimelineInspectHint">
            <Clock3 size={14} />
            Hover to inspect
          </span>
        </div>
      </div>

      <div
        className="missionTimelineTrack"
        role="list"
        style={{
          '--mission-date-count': Math.max(dateGroups.length, 1)
        }}
      >
        {dateGroups.map((group, groupIndex) => {
          const dateParts = getTimelineDateParts(group.missionDate);

          return (
            <div
              className={`missionTimelineDateGroup ${
                group.missions.length + (group.milestones?.length || 0) > 1
                  ? 'missionTimelineDateGroupStacked'
                  : ''
              }`}
              role="listitem"
              key={group.key}
            >
              <time
                className="missionTimelineDate"
                dateTime={dateParts.isoDate || undefined}
                aria-label={formatTimelineDate(group.missionDate)}
              >
                <strong>{dateParts.monthDay}</strong>
                {dateParts.year ? <span>{dateParts.year}</span> : null}
              </time>

              <div className="missionTimelineMissionStack">
                {(group.milestones || []).map((milestone) => (
                  <div
                    className="missionTimelineStop missionTimelineMilestone"
                    key={milestone.id}
                  >
                    <div
                      className="missionTimelineNode missionTimelineMilestoneNode"
                      role="img"
                      aria-label={`${milestone.title}, milestone from ${formatTimelineDate(milestone.date)}`}
                    >
                      <i aria-hidden="true">
                        <Telescope size={11} strokeWidth={2.2} />
                      </i>
                      <strong>{milestone.title}</strong>
                      <em>Milestone</em>
                    </div>

                    <div
                      className="missionTimelinePreview missionTimelineMilestonePreview"
                      aria-hidden="true"
                    >
                      <div className="missionTimelineMilestonePreviewIcon">
                        <Telescope size={28} strokeWidth={1.8} />
                      </div>

                      <div>
                        <small>{milestone.eyebrow}</small>
                        <strong>{milestone.title}</strong>
                        <span>{milestone.description}</span>
                        <time dateTime={getDateKey(milestone.date)}>
                          {formatTimelineDate(milestone.date)}
                        </time>
                      </div>
                    </div>
                  </div>
                ))}

                {group.missions.map((photo, missionIndex) => {
                  const missionType = getMissionType(photo);
                  const isLatest = photo.id === latestMissionId;

                  return (
                    <div
                      className={`missionTimelineStop missionTimelineType-${missionType} ${
                        isLatest ? 'missionTimelineStopLatest' : ''
                      }`}
                      key={photo.id}
                    >
                      <button
                        type="button"
                        className="missionTimelineNode"
                        onClick={() => onOpenMission(photo.id)}
                        aria-label={`Open mission report for ${photo.title} from ${formatTimelineDate(group.missionDate)}`}
                      >
                        <i aria-hidden="true">
                          <MissionTypeIcon type={missionType} />
                        </i>
                        <strong>{photo.title}</strong>
                        {isLatest ? <em>Latest</em> : null}
                      </button>

                      <div
                        className={`missionTimelinePreview ${
                          groupIndex >= dateGroups.length - 2
                            ? 'missionTimelinePreviewLeft'
                            : ''
                        } ${
                          missionIndex > 0
                            ? 'missionTimelinePreviewStacked'
                            : ''
                        }`}
                        aria-hidden="true"
                      >
                        <img
                          src={getCaptureImageUrl(photo.image)}
                          alt=""
                        />

                        <div>
                          <small>
                            {photo.category ||
                              photo.objectType ||
                              'Mission Capture'}
                          </small>
                          <strong>{photo.title}</strong>
                          <span>{photo.subtitle}</span>
                          <time dateTime={getDateKey(group.missionDate)}>
                            {formatTimelineDate(group.missionDate)}
                          </time>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
