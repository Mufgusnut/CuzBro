import { supabase } from '../supabase.js';

export const SIGNAL_TOPICS = {
  mission_reports: 'New Mission Reports',
  telescope_site: 'Telescope Site Changes',
  mission_captures: 'New Mission Captures',
  observatory_updates: 'Observatory Updates'
};

export async function invokeCuzBroSignals(body) {
  const { data, error } = await supabase.functions.invoke(
    'cuzbro-signals',
    { body }
  );

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data || {};
}

export async function sendCuzBroSignal({
  topic,
  eventKey,
  subject,
  headline,
  summary,
  detailLines = [],
  ctaLabel = '',
  ctaUrl = ''
}) {
  try {
    return await invokeCuzBroSignals({
      action: 'notify',
      topic,
      eventKey,
      subject,
      headline,
      summary,
      detailLines,
      ctaLabel,
      ctaUrl
    });
  } catch (error) {
    console.error('CuzBro signal notification failed:', error);

    return {
      ok: false,
      error:
        error?.message ||
        'CuzBro signal notification failed.'
    };
  }
}
