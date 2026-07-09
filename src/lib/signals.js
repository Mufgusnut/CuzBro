import { supabase } from '../supabase.js';

export const SIGNAL_TOPICS = {
  mission_reports: 'Mission Reports',
  telescope_site: 'Telescope Site Changes',
  mission_captures: 'New Mission Captures',
  observatory_updates: 'Observatory Updates'
};

export async function invokeCuzBroSignals(body) {
  const invokeOptions = { body };

  if (body?.action === 'notify') {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session?.access_token) {
      throw new Error(
        'Crew authentication is required to send CuzBro Signals.'
      );
    }

    invokeOptions.headers = {
      Authorization: `Bearer ${session.access_token}`
    };
  }

  const { data, error } = await supabase.functions.invoke(
    'cuzbro-signals',
    invokeOptions
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
