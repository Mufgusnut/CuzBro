import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL =
  Deno.env.get('CUZBRO_FROM_EMAIL') ||
  'CuzBro Signals <signals@cuzbro.net>';
const SITE_URL =
  (Deno.env.get('CUZBRO_SITE_URL') || 'https://cuzbro.net')
    .replace(/\/+$/, '');

const CREW_EMAILS = new Set([
  'dve.hffman@gmail.com',
  'jhoff33@gmail.com',
  'gregg@computerav.com'
]);

const TOPICS = new Set([
  'mission_reports',
  'telescope_site',
  'mission_captures',
  'observatory_updates'
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanPreferences(value: unknown) {
  const preferences =
    value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {};

  return {
    mission_reports:
      preferences.mission_reports !== false,
    telescope_site:
      preferences.telescope_site !== false,
    mission_captures:
      preferences.mission_captures === true,
    observatory_updates:
      preferences.observatory_updates === true
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function preferenceSummary(
  preferences: Record<string, boolean>
) {
  const labels: Record<string, string> = {
    mission_reports: 'Mission Reports',
    telescope_site: 'Telescope Site Changes',
    mission_captures: 'New Mission Captures',
    observatory_updates: 'Observatory Updates'
  };

  return Object.entries(preferences)
    .filter(([, enabled]) => enabled)
    .map(([key]) => labels[key])
    .join(' · ');
}

async function sendEmail({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html
      })
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Resend returned ${response.status}.`
    );
  }

  return payload;
}

function emailShell(content: string) {
  return `
    <div style="margin:0;background:#07111f;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#e9f4ff;">
      <div style="max-width:620px;margin:0 auto;border:1px solid #23435e;border-radius:18px;overflow:hidden;background:#0b1828;">
        <div style="padding:22px 28px;border-bottom:1px solid #23435e;background:#0d2033;">
          <div style="font-size:12px;letter-spacing:2px;color:#ff9a4c;font-weight:700;">CUZBRO SIGNALS</div>
          <div style="margin-top:6px;font-size:24px;font-weight:800;color:#ffffff;">Observatory Transmission</div>
        </div>
        <div style="padding:28px;">
          ${content}
        </div>
      </div>
    </div>
  `;
}

async function requireCrew(request: Request) {
  const authorization =
    request.headers.get('Authorization') || '';
  const token = authorization.replace(
    /^Bearer\s+/i,
    ''
  );

  if (!token) {
    throw new Error('Crew authentication required.');
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (
    error ||
    !user?.email ||
    !CREW_EMAILS.has(user.email.toLowerCase())
  ) {
    throw new Error('Authorized CuzBro crew access required.');
  }

  return user;
}

async function handleSubscribe(body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);

  if (!isValidEmail(email)) {
    return json(
      { error: 'Enter a valid email address.' },
      400
    );
  }

  const preferences = cleanPreferences(
    body.preferences
  );

  if (!Object.values(preferences).some(Boolean)) {
    return json(
      { error: 'Select at least one CuzBro signal.' },
      400
    );
  }

  const confirmationToken = crypto.randomUUID();

  const {
    data: existing,
    error: existingError
  } = await supabase
    .from('cuzbro_subscribers')
    .select('id, unsubscribe_token')
    .eq('email', email)
    .maybeSingle();

  if (existingError) throw existingError;

  const row = {
    email,
    ...preferences,
    confirmation_token: confirmationToken,
    confirmed_at: null,
    updated_at: new Date().toISOString()
  };

  let saveError;

  if (existing?.id) {
    const { error } = await supabase
      .from('cuzbro_subscribers')
      .update(row)
      .eq('id', existing.id);
    saveError = error;
  } else {
    const { error } = await supabase
      .from('cuzbro_subscribers')
      .insert(row);
    saveError = error;
  }

  if (saveError) throw saveError;

  const confirmUrl =
    `${SITE_URL}/?signal=confirm&token=${encodeURIComponent(
      confirmationToken
    )}`;

  await sendEmail({
    to: email,
    subject: 'Confirm your CuzBro Signals subscription',
    html: emailShell(`
      <div style="font-size:12px;letter-spacing:1.6px;color:#7fd7ff;font-weight:700;">CONFIRMATION REQUIRED</div>
      <h1 style="margin:10px 0 14px;font-size:28px;color:#ffffff;">Connect to CuzBro Signals</h1>
      <p style="font-size:16px;line-height:1.6;color:#bdd0df;">Someone requested CuzBro observatory notifications for this email address. Confirm below to activate them.</p>
      <div style="margin:20px 0;padding:14px 16px;border:1px solid #274a65;border-radius:12px;color:#d9e8f2;">${escapeHtml(
        preferenceSummary(preferences)
      )}</div>
      <a href="${confirmUrl}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:#ff873d;color:#08111d;text-decoration:none;font-weight:800;letter-spacing:.6px;">CONFIRM CUZBRO SIGNALS</a>
      <p style="margin-top:24px;font-size:13px;line-height:1.5;color:#8097aa;">If you did not request this, ignore this email. Nothing will be activated.</p>
    `)
  });

  return json({
    ok: true,
    message: 'Confirmation email sent.'
  });
}

async function handleConfirm(body: Record<string, unknown>) {
  const token = String(body.token || '').trim();

  if (!token) {
    return json({ error: 'Confirmation token missing.' }, 400);
  }

  const {
    data: subscriber,
    error: loadError
  } = await supabase
    .from('cuzbro_subscribers')
    .select('*')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (loadError) throw loadError;

  if (!subscriber) {
    return json(
      { error: 'This confirmation link is invalid or has already been used.' },
      404
    );
  }

  const { error: updateError } = await supabase
    .from('cuzbro_subscribers')
    .update({
      confirmed_at: new Date().toISOString(),
      confirmation_token: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', subscriber.id);

  if (updateError) throw updateError;

  return json({
    ok: true,
    email: subscriber.email,
    unsubscribeToken: subscriber.unsubscribe_token,
    preferences: {
      mission_reports: subscriber.mission_reports,
      telescope_site: subscriber.telescope_site,
      mission_captures: subscriber.mission_captures,
      observatory_updates: subscriber.observatory_updates
    }
  });
}

async function loadManagedSubscriber(token: string) {
  const {
    data,
    error
  } = await supabase
    .from('cuzbro_subscribers')
    .select('*')
    .eq('unsubscribe_token', token)
    .not('confirmed_at', 'is', null)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function handleManage(body: Record<string, unknown>) {
  const token = String(body.token || '').trim();
  const subscriber = await loadManagedSubscriber(token);

  if (!subscriber) {
    return json(
      { error: 'Signal management link is invalid.' },
      404
    );
  }

  return json({
    ok: true,
    email: subscriber.email,
    preferences: {
      mission_reports: subscriber.mission_reports,
      telescope_site: subscriber.telescope_site,
      mission_captures: subscriber.mission_captures,
      observatory_updates: subscriber.observatory_updates
    }
  });
}

async function handlePreferences(body: Record<string, unknown>) {
  const token = String(body.token || '').trim();
  const subscriber = await loadManagedSubscriber(token);

  if (!subscriber) {
    return json(
      { error: 'Signal management link is invalid.' },
      404
    );
  }

  const preferences = cleanPreferences(body.preferences);

  if (!Object.values(preferences).some(Boolean)) {
    return json(
      { error: 'Select at least one signal or unsubscribe.' },
      400
    );
  }

  const { error } = await supabase
    .from('cuzbro_subscribers')
    .update({
      ...preferences,
      updated_at: new Date().toISOString()
    })
    .eq('id', subscriber.id);

  if (error) throw error;

  return json({ ok: true });
}

async function handleUnsubscribe(body: Record<string, unknown>) {
  const token = String(body.token || '').trim();

  if (!token) {
    return json({ error: 'Unsubscribe token missing.' }, 400);
  }

  const { error } = await supabase
    .from('cuzbro_subscribers')
    .delete()
    .eq('unsubscribe_token', token);

  if (error) throw error;

  return json({ ok: true });
}

async function handleNotify(
  request: Request,
  body: Record<string, unknown>
) {
  await requireCrew(request);

  const topic = String(body.topic || '').trim();
  const eventKey = String(body.eventKey || '').trim();
  const subject = String(body.subject || '').trim();
  const headline = String(body.headline || '').trim();
  const summary = String(body.summary || '').trim();
  const detailLines = Array.isArray(body.detailLines)
    ? body.detailLines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const ctaLabel = String(body.ctaLabel || '').trim();
  const ctaUrl = String(body.ctaUrl || '').trim();

  if (!TOPICS.has(topic)) {
    return json({ error: 'Unknown signal topic.' }, 400);
  }

  if (!eventKey || !subject || !headline) {
    return json(
      { error: 'Signal event is missing required fields.' },
      400
    );
  }

  const payload = {
    headline,
    summary,
    detailLines,
    ctaLabel,
    ctaUrl
  };

  const {
    data: existingEvent,
    error: existingEventError
  } = await supabase
    .from('cuzbro_notification_events')
    .select('id')
    .eq('event_key', eventKey)
    .maybeSingle();

  if (existingEventError) throw existingEventError;

  let eventId = existingEvent?.id;

  if (!eventId) {
    const {
      data: createdEvent,
      error: createEventError
    } = await supabase
      .from('cuzbro_notification_events')
      .insert({
        topic,
        event_key: eventKey,
        subject,
        payload
      })
      .select('id')
      .single();

    if (createEventError) {
      const { data: racedEvent } = await supabase
        .from('cuzbro_notification_events')
        .select('id')
        .eq('event_key', eventKey)
        .maybeSingle();

      if (!racedEvent?.id) throw createEventError;
      eventId = racedEvent.id;
    } else {
      eventId = createdEvent.id;
    }
  }

  const {
    data: subscribers,
    error: subscriberError
  } = await supabase
    .from('cuzbro_subscribers')
    .select(
      'id, email, unsubscribe_token, mission_reports, telescope_site, mission_captures, observatory_updates'
    )
    .not('confirmed_at', 'is', null)
    .eq(topic, true);

  if (subscriberError) throw subscriberError;

  const eligibleSubscribers = (subscribers || []).length;
  let delivered = 0;
  let failed = 0;
  let skippedAlreadyDelivered = 0;

  for (const subscriber of subscribers || []) {
    const {
      data: existingDelivery,
      error: deliveryLoadError
    } = await supabase
      .from('cuzbro_notification_deliveries')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('subscriber_id', subscriber.id)
      .maybeSingle();

    if (deliveryLoadError) {
      console.error(deliveryLoadError);
      failed += 1;
      continue;
    }

    if (existingDelivery) {
      skippedAlreadyDelivered += 1;
      continue;
    }

    const manageUrl =
      `${SITE_URL}/?signal=manage&token=${encodeURIComponent(
        subscriber.unsubscribe_token
      )}`;
    const unsubscribeUrl =
      `${SITE_URL}/?signal=unsubscribe&token=${encodeURIComponent(
        subscriber.unsubscribe_token
      )}`;

    const details = detailLines.length
      ? `
        <div style="margin:20px 0;padding:15px 17px;border-left:3px solid #ff873d;background:#0e2235;border-radius:8px;">
          ${detailLines
            .map(
              (line) =>
                `<div style="margin:5px 0;color:#dce9f2;font-size:15px;">${escapeHtml(line)}</div>`
            )
            .join('')}
        </div>
      `
      : '';

    const cta =
      ctaLabel && /^https:\/\//i.test(ctaUrl)
        ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;margin-top:8px;padding:13px 18px;border-radius:999px;background:#ff873d;color:#08111d;text-decoration:none;font-weight:800;letter-spacing:.6px;">${escapeHtml(ctaLabel)}</a>`
        : '';

    try {
      const resendResult = await sendEmail({
        to: subscriber.email,
        subject,
        html: emailShell(`
          <div style="font-size:12px;letter-spacing:1.6px;color:#7fd7ff;font-weight:700;">NEW CUZBRO SIGNAL</div>
          <h1 style="margin:10px 0 14px;font-size:28px;color:#ffffff;">${escapeHtml(headline)}</h1>
          <p style="font-size:16px;line-height:1.6;color:#bdd0df;">${escapeHtml(summary)}</p>
          ${details}
          ${cta}
          <div style="margin-top:30px;padding-top:18px;border-top:1px solid #23435e;font-size:12px;line-height:1.7;color:#8097aa;">
            <a href="${manageUrl}" style="color:#8edfff;">Manage signals</a>
            &nbsp;·&nbsp;
            <a href="${unsubscribeUrl}" style="color:#8edfff;">Unsubscribe</a>
          </div>
        `)
      });

      const { error: deliveryError } = await supabase
        .from('cuzbro_notification_deliveries')
        .insert({
          event_id: eventId,
          subscriber_id: subscriber.id,
          resend_email_id: resendResult?.id || null
        });

      if (deliveryError) throw deliveryError;
      delivered += 1;
    } catch (deliveryError) {
      console.error(
        `Signal delivery failed for subscriber ${subscriber.id}:`,
        deliveryError
      );
      failed += 1;
    }
  }

  if (
    eligibleSubscribers > 0 &&
    delivered === 0 &&
    failed > 0 &&
    skippedAlreadyDelivered === 0
  ) {
    return json({
      error: 'Signal delivery failed for every eligible subscriber.',
      eventId,
      eligibleSubscribers,
      delivered,
      failed,
      skippedAlreadyDelivered
    }, 502);
  }

  return json({
    ok: true,
    eventId,
    eligibleSubscribers,
    delivered,
    failed,
    skippedAlreadyDelivered
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return json(
      { error: 'Method not allowed.' },
      405
    );
  }

  try {
    const body =
      await request.json() as Record<string, unknown>;
    const action = String(body.action || '').trim();

    switch (action) {
      case 'subscribe':
        return await handleSubscribe(body);
      case 'confirm':
        return await handleConfirm(body);
      case 'manage':
        return await handleManage(body);
      case 'preferences':
        return await handlePreferences(body);
      case 'unsubscribe':
        return await handleUnsubscribe(body);
      case 'notify':
        return await handleNotify(request, body);
      default:
        return json(
          { error: 'Unknown CuzBro Signals action.' },
          400
        );
    }
  } catch (error) {
    console.error('CuzBro Signals error:', error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'CuzBro Signals request failed.'
      },
      500
    );
  }
});
