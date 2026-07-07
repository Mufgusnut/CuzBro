import {
  useEffect,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import { getCrewMember } from './crew.js';

export const ACTIVE_OPERATION_EVENT =
  'cuzbro-active-operation-changed';

export function formatOperationElapsed(
  startedAt,
  endedAt = null,
  now = Date.now()
) {
  if (!startedAt) {
    return '00:00:00';
  }

  const started =
    new Date(startedAt).getTime();

  const ended = endedAt
    ? new Date(endedAt).getTime()
    : now;

  if (
    !Number.isFinite(started) ||
    !Number.isFinite(ended)
  ) {
    return '--:--:--';
  }

  const totalSeconds = Math.max(
    0,
    Math.floor((ended - started) / 1000)
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
}

export async function getActiveOperation() {
  const {
    data,
    error
  } = await supabase
    .from('crew_operations')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('started_at', {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function recordOperationEvent({
  operation,
  eventType,
  eventLabel,
  resourceType = null,
  resourceId = null,
  resourceName = null,
  details = {},
  session = null
}) {
  if (!operation?.id) {
    return {
      success: false,
      skipped: true
    };
  }

  let activeSession = session;

  if (!activeSession) {
    const {
      data: { session: currentSession },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      return {
        success: false,
        error: sessionError
      };
    }

    activeSession = currentSession;
  }

  if (!activeSession?.user?.id) {
    return {
      success: false,
      error: new Error(
        'Operation event requires an authenticated crew session.'
      )
    };
  }

  const crew = getCrewMember(
    activeSession.user.email
  );

  const payload = {
    operation_id: operation.id,
    user_id: activeSession.user.id,
    crew_email:
      activeSession.user.email || null,
    crew_name: crew.name,
    event_type: String(
      eventType || 'OPERATION_EVENT'
    ),
    event_label: String(
      eventLabel || eventType || 'OPERATION EVENT'
    ),
    resource_type:
      resourceType === null ||
      resourceType === undefined
        ? null
        : String(resourceType),
    resource_id:
      resourceId === null ||
      resourceId === undefined
        ? null
        : String(resourceId),
    resource_name:
      resourceName === null ||
      resourceName === undefined
        ? null
        : String(resourceName),
    details:
      details &&
      typeof details === 'object' &&
      !Array.isArray(details)
        ? details
        : {}
  };

  const {
    data,
    error
  } = await supabase
    .from('crew_operation_events')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error(
      '[ACTIVE OPERATION] Event insert failed:',
      error
    );

    return {
      success: false,
      error
    };
  }

  return {
    success: true,
    data
  };
}

export function useActiveOperation({
  enabled = true
} = {}) {
  const [activeOperation, setActiveOperation] =
    useState(null);

  const [operationStatus, setOperationStatus] =
    useState(
      enabled ? 'loading' : 'idle'
    );

  const [operationError, setOperationError] =
    useState('');

  useEffect(() => {
    if (!enabled) {
      setActiveOperation(null);
      setOperationStatus('idle');
      setOperationError('');
      return undefined;
    }

    let active = true;

    async function loadOperation() {
      try {
        const operation =
          await getActiveOperation();

        if (!active) {
          return;
        }

        setActiveOperation(operation);
        setOperationStatus('ready');
        setOperationError('');
      } catch (error) {
        console.error(
          '[ACTIVE OPERATION] Load failed:',
          error
        );

        if (!active) {
          return;
        }

        setOperationError(
          error.message ||
            'Active operation unavailable.'
        );

        setOperationStatus('error');
      }
    }

    loadOperation();

    const channel = supabase
      .channel(
        `cuzbro-active-operation-${Math.random()}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_operations'
        },
        () => {
          loadOperation();
        }
      )
      .subscribe();

    const handleLocalChange = () => {
      loadOperation();
    };

    window.addEventListener(
      ACTIVE_OPERATION_EVENT,
      handleLocalChange
    );

    return () => {
      active = false;

      window.removeEventListener(
        ACTIVE_OPERATION_EVENT,
        handleLocalChange
      );

      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return {
    activeOperation,
    operationStatus,
    operationError
  };
}

export function announceOperationChange() {
  window.dispatchEvent(
    new CustomEvent(
      ACTIVE_OPERATION_EVENT
    )
  );
}
