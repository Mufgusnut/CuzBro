export const OPERATION_REPORT_HANDOFF_KEY =
  'cuzbro-operation-report-handoff';

export function saveOperationReportHandoff(payload) {
  sessionStorage.setItem(
    OPERATION_REPORT_HANDOFF_KEY,
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      ...payload
    })
  );
}

export function readOperationReportHandoff() {
  const raw = sessionStorage.getItem(
    OPERATION_REPORT_HANDOFF_KEY
  );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(
      'Operation report handoff could not be parsed:',
      error
    );

    sessionStorage.removeItem(
      OPERATION_REPORT_HANDOFF_KEY
    );

    return null;
  }
}

export function clearOperationReportHandoff() {
  sessionStorage.removeItem(
    OPERATION_REPORT_HANDOFF_KEY
  );
}

export function formatOperationReportDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function joinUnique(values) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )].join(' · ');
}

export function buildOperationReportNotes(handoff) {
  const operation = handoff?.operation || {};
  const summary = handoff?.summary || {};
  const lines = [];

  if (operation.objective) {
    lines.push(operation.objective);
  }

  const participants = joinUnique(
    summary.participants || []
  );

  if (participants) {
    lines.push(`Crew participation: ${participants}.`);
  }

  const captureNames = joinUnique(
    (summary.captures || []).map(
      (capture) => capture.title
    )
  );

  if (captureNames) {
    lines.push(`Captures recorded: ${captureNames}.`);
  }

  const incidents = (summary.incidents || [])
    .map((incident) => {
      const code = incident.incident_number
        ? `CB-INC-${String(incident.incident_number).padStart(3, '0')}`
        : 'Incident';

      return `${code} — ${incident.title} (${incident.status})`;
    });

  if (incidents.length) {
    lines.push(`Operation incidents: ${incidents.join('; ')}.`);
  }

  if (handoff?.site?.fullName) {
    lines.push(`Observing site: ${handoff.site.fullName}.`);
  }

  return lines.join('\n\n');
}

export function buildOperationReportNextGoal(handoff) {
  const openTasks = (handoff?.summary?.tasks || [])
    .filter((task) => task.status !== 'COMPLETE')
    .map((task) =>
      `${task.task_code || 'TASK'} — ${task.title}`
    );

  return openTasks.join('; ');
}
