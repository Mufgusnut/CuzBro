import {
  useEffect,
  useRef,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  getCrewMember
} from './crew.js';

export const ACTIVE_TASK_EVENT =
  'cuzbro-crew-tasks-changed';

const ACTIVE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED'
];

export function formatTaskCode(task) {
  return String(
    task?.task_code || 'CB-???'
  ).toUpperCase();
}

export function formatTaskStatus(status) {
  return String(status || 'OPEN')
    .replaceAll('_', ' ')
    .toUpperCase();
}

export function isTaskActive(task) {
  return ACTIVE_STATUSES.includes(
    String(task?.status || '').toUpperCase()
  );
}

export function announceTaskChange(task = null) {
  window.dispatchEvent(
    new CustomEvent(ACTIVE_TASK_EVENT, {
      detail: {
        task,
        timestamp: new Date().toISOString()
      }
    })
  );
}

export async function getCrewTasks({
  activeOnly = false,
  assignedEmail = null,
  limit = 200
} = {}) {
  let query = supabase
    .from('crew_tasks')
    .select('*')
    .order('created_at', {
      ascending: false
    })
    .limit(limit);

  if (activeOnly) {
    query = query.in('status', ACTIVE_STATUSES);
  }

  if (assignedEmail) {
    query = query.eq(
      'assigned_email',
      String(assignedEmail).toLowerCase()
    );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function recordTaskEvent({
  task,
  eventType,
  eventLabel,
  details = {},
  session = null
}) {
  if (!task?.id) {
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
        'Task event requires an authenticated crew session.'
      )
    };
  }

  const crew = getCrewMember(
    activeSession.user.email
  );

  const {
    data,
    error
  } = await supabase
    .from('crew_task_events')
    .insert({
      task_id: task.id,
      user_id: activeSession.user.id,
      crew_email:
        activeSession.user.email || null,
      crew_name: crew.name,
      event_type: String(
        eventType || 'TASK_EVENT'
      ),
      event_label: String(
        eventLabel || eventType || 'TASK EVENT'
      ),
      details:
        details &&
        typeof details === 'object' &&
        !Array.isArray(details)
          ? details
          : {}
    })
    .select('*')
    .single();

  if (error) {
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

export function useCrewTasks(
  enabled = true
) {
  const [tasks, setTasks] = useState([]);
  const [taskStatus, setTaskStatus] =
    useState(enabled ? 'loading' : 'idle');
  const [taskError, setTaskError] =
    useState('');
  const instanceIdRef = useRef(
    Math.random().toString(36).slice(2, 9)
  );

  useEffect(() => {
    if (!enabled) {
      setTasks([]);
      setTaskStatus('idle');
      setTaskError('');
      return undefined;
    }

    let active = true;
    let channel = null;

    async function loadTasks() {
      try {
        setTaskStatus('loading');
        setTaskError('');

        const rows = await getCrewTasks();

        if (!active) {
          return;
        }

        setTasks(rows);
        setTaskStatus('ready');
      } catch (error) {
        console.error(
          'Crew Tasking load failed:',
          error
        );

        if (active) {
          setTaskError(
            error.message ||
              'Crew Tasking is unavailable.'
          );
          setTaskStatus('error');
        }
      }
    }

    loadTasks();

    const channelName =
      `cuzbro-crew-tasks-${instanceIdRef.current}`;

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_tasks'
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    function handleLocalTaskChange() {
      loadTasks();
    }

    window.addEventListener(
      ACTIVE_TASK_EVENT,
      handleLocalTaskChange
    );

    return () => {
      active = false;

      window.removeEventListener(
        ACTIVE_TASK_EVENT,
        handleLocalTaskChange
      );

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [enabled]);

  return {
    tasks,
    activeTasks: tasks.filter(isTaskActive),
    taskStatus,
    taskError
  };
}
