import { useEffect } from 'react';
import { getCrewMember } from './crew.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const CREW_STATUS_EVENT = 'cuzbro-crew-status-changed';

function getAdminPageName(pathname) {
  const normalizedPath =
    String(pathname || '/admin')
      .replace(/\/+$/, '') || '/admin';

  switch (normalizedPath) {
    case '/admin/gallery':
      return 'CAPTURE CONTROL';
    case '/admin/captains-log':
      return 'MISSION REPORTS';
    case '/admin/equipment':
      return 'GEAR INVENTORY';
    case '/admin/transfers':
      return 'CREW TRANSFER';
    case '/admin/comms':
      return 'COMMS TERMINAL';
    case '/admin/operation':
      return 'OPERATION COMMAND';
    case '/admin/system':
      return 'SYSTEM STATUS';
    case '/admin/black-box':
      return 'BLACK BOX';
    case '/admin/storage':
      return 'STORAGE CONTROL';
    case '/admin/incidents':
      return 'INCIDENT COMMAND';
    case '/admin/tasks':
      return 'CREW TASKING';
    case '/admin/deployments':
      return 'DEPLOYMENTS';
    default:
      return 'ADMIN CONTROL';
  }
}

function getStatusStorageKey(userId) {
  return `cuzbro-crew-status-${userId}`;
}

export function setLocalCrewStatus(userId, value) {
  const cleanStatus = String(value || '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 80);

  const storageKey = getStatusStorageKey(userId);

  if (cleanStatus) {
    localStorage.setItem(storageKey, cleanStatus);
  } else {
    localStorage.removeItem(storageKey);
  }

  window.dispatchEvent(
    new CustomEvent(CREW_STATUS_EVENT, {
      detail: { userId, status: cleanStatus }
    })
  );

  return cleanStatus;
}

export function getLocalCrewStatus(userId) {
  return String(
    localStorage.getItem(getStatusStorageKey(userId)) || ''
  ).trim();
}

export function useCrewPresence({
  session,
  enabled,
  pathname
}) {
  useEffect(() => {
    if (
      !enabled ||
      !session?.access_token ||
      !session?.user?.id
    ) {
      return undefined;
    }

    let active = true;

    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL;

    const supabasePublishableKey =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      console.error(
        '[CREW LINK] Supabase configuration unavailable.'
      );
      return undefined;
    }

    const user = session.user;
    const crew = getCrewMember(user.email);

    async function sendHeartbeat() {
      if (!active) {
        return;
      }

      const now = new Date().toISOString();
      const customStatus = getLocalCrewStatus(user.id);

      const payload = {
        user_id: user.id,
        crew_email: user.email || '',
        crew_name: crew.name,
        page_path: pathname || '/admin',
        page_name: getAdminPageName(pathname),
        status: 'ONLINE',
        custom_status: customStatus || null,
        last_seen_at: now
      };

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/crew_presence?on_conflict=user_id`,
          {
            method: 'POST',
            headers: {
              apikey: supabasePublishableKey,
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          const responseText = await response.text();
          console.error('[CREW LINK] Heartbeat failed:', {
            status: response.status,
            body: responseText
          });
          return;
        }

        console.log(
          '[CREW LINK] Heartbeat:',
          payload.page_name,
          customStatus || 'AVAILABLE'
        );
      } catch (error) {
        console.error(
          '[CREW LINK] Unexpected heartbeat failure:',
          error
        );
      }
    }

    function handleStatusChanged(event) {
      if (event.detail?.userId === user.id) {
        sendHeartbeat();
      }
    }

    sendHeartbeat();

    const intervalId = window.setInterval(
      sendHeartbeat,
      HEARTBEAT_INTERVAL_MS
    );

    window.addEventListener(
      CREW_STATUS_EVENT,
      handleStatusChanged
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener(
        CREW_STATUS_EVENT,
        handleStatusChanged
      );
    };
  }, [
    enabled,
    pathname,
    session?.access_token,
    session?.user?.id,
    session?.user?.email
  ]);
}
