import { Eye, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export default function SiteVisitCounter() {
  const [count, setCount] = useState(null);
  const [status, setStatus] = useState('loading');

  const loadCount = useCallback(async () => {
    setStatus('loading');

    const { data, error } = await supabase
      .from('site_visit_counter')
      .select('total_visits')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('Visit counter load failed:', error);
      setStatus('error');
      return;
    }

    setCount(Number(data?.total_visits || 0));
    setStatus('ready');
  }, []);

  useEffect(() => {
    loadCount();

    const channel = supabase
      .channel('site-visit-counter-admin')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_visit_counter',
          filter: 'id=eq.1'
        },
        (payload) => {
          setCount(Number(payload.new?.total_visits || 0));
          setStatus('ready');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCount]);

  return (
    <div className="admin-visit-card">
      <div className="admin-status-icon">
        <Eye size={23} />
      </div>

      <div className="admin-visit-copy">
        <span>PUBLIC SITE VISITS</span>
        <strong>
          {status === 'loading'
            ? 'SYNCING'
            : status === 'error'
              ? 'COUNTER OFFLINE'
              : formatCount(count)}
        </strong>
      </div>

      <button
        type="button"
        className="admin-visit-refresh"
        onClick={loadCount}
        aria-label="Refresh visit counter"
        title="Refresh visit counter"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}
