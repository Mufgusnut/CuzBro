import {
  useEffect,
  useRef,
  useState
} from 'react';
import { supabase } from '../supabase.js';

export const ACTIVE_INCIDENT_EVENT =
  'cuzbro-active-incident-changed';

export function formatIncidentCode(incident) {
  const number = Number(
    incident?.incident_number || 0
  );

  if (!number) {
    return 'CB-INC-???';
  }

  return `CB-INC-${String(number).padStart(3, '0')}`;
}

export function formatIncidentElapsed(
  startedAt,
  resolvedAt = null,
  now = Date.now()
) {
  if (!startedAt) {
    return '00:00:00';
  }

  const start =
    new Date(startedAt).getTime();

  const end = resolvedAt
    ? new Date(resolvedAt).getTime()
    : now;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return '--:--:--';
  }

  const totalSeconds = Math.max(
    0,
    Math.floor((end - start) / 1000)
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
}

export async function getActiveIncidents() {
  const {
    data,
    error
  } = await supabase
    .from('crew_incidents')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('declared_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}

export function announceIncidentChange() {
  window.dispatchEvent(
    new CustomEvent(
      ACTIVE_INCIDENT_EVENT
    )
  );
}

export function getIncidentContextKey(
  userId
) {
  return `cuzbro-incident-context-${userId || 'crew'}`;
}

export function setIncidentContext(
  userId,
  incidentId
) {
  const key =
    getIncidentContextKey(userId);

  if (incidentId) {
    localStorage.setItem(
      key,
      String(incidentId)
    );
  } else {
    localStorage.removeItem(key);
  }

  window.dispatchEvent(
    new CustomEvent(
      ACTIVE_INCIDENT_EVENT
    )
  );
}

export function getIncidentContext(
  userId
) {
  return localStorage.getItem(
    getIncidentContextKey(userId)
  );
}

export function useActiveIncidents(enabled = true) {
  const channelNameRef = useRef(
    `cuzbro-active-incidents-${Math.random()
      .toString(36)
      .slice(2)}`
  );

  const [
    activeIncidents,
    setActiveIncidents
  ] = useState([]);

  const [
    incidentStatus,
    setIncidentStatus
  ] = useState('loading');

  const [
    incidentError,
    setIncidentError
  ] = useState('');

  useEffect(() => {
    if (!enabled) {
      setActiveIncidents([]);
      setIncidentStatus('ready');
      setIncidentError('');
      return undefined;
    }

    let active = true;

    async function load() {
      try {
        const incidents =
          await getActiveIncidents();

        if (!active) {
          return;
        }

        setActiveIncidents(incidents);
        setIncidentStatus('ready');
        setIncidentError('');
      } catch (error) {
        console.error(
          'Active incident load failed:',
          error
        );

        if (!active) {
          return;
        }

        setIncidentStatus('error');
        setIncidentError(
          error.message ||
            'Incident state unavailable.'
        );
      }
    }

    load();

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_incidents'
        },
        load
      )
      .subscribe();

    const handleLocalChange = () => {
      load();
    };

    window.addEventListener(
      ACTIVE_INCIDENT_EVENT,
      handleLocalChange
    );

    return () => {
      active = false;

      supabase.removeChannel(channel);

      window.removeEventListener(
        ACTIVE_INCIDENT_EVENT,
        handleLocalChange
      );
    };
  }, [enabled]);

  return {
    activeIncidents,
    primaryIncident:
      activeIncidents[0] || null,
    incidentStatus,
    incidentError
  };
}
