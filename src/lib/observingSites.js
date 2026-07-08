import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';

export const OBSERVING_SITES = [
  {
    key: 'ELIOT',
    name: 'Eliot, ME',
    fullName: 'Eliot, Maine',
    shortName: 'Eliot',
    crew: 'Dave',
    lat: 43.1531,
    lon: -70.7828
  },
  {
    key: 'CONGERS',
    name: 'Congers, NY',
    fullName: 'Congers, New York',
    shortName: 'Congers',
    crew: 'Chappy',
    lat: 41.1507,
    lon: -73.9454
  },
  {
    key: 'NEW_YORK_CITY',
    name: 'New York City, NY',
    fullName: 'New York City, New York',
    shortName: 'New York City',
    crew: 'Justin',
    lat: 40.7128,
    lon: -74.006
  }
];

export const DEFAULT_OBSERVING_SITE = OBSERVING_SITES[0];

export function getObservingSite(siteKey) {
  return (
    OBSERVING_SITES.find(
      (site) => site.key === siteKey
    ) || DEFAULT_OBSERVING_SITE
  );
}

export function useObservingSite(session = null) {
  const [siteKey, setSiteKey] = useState(
    DEFAULT_OBSERVING_SITE.key
  );
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const currentSite = useMemo(
    () => getObservingSite(siteKey),
    [siteKey]
  );

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError('');

    const { data, error: loadError } = await supabase
      .from('observatory_state')
      .select('site_key')
      .eq('id', 'current')
      .maybeSingle();

    if (loadError) {
      console.error(
        'Observing site state could not be loaded:',
        loadError
      );
      setStatus('error');
      setError(
        loadError.message ||
          'Current observing site could not be loaded.'
      );
      return;
    }

    setSiteKey(
      getObservingSite(data?.site_key).key
    );
    setStatus('ready');
  }, []);

  useEffect(() => {
    let active = true;

    refresh();

    const channel = supabase
      .channel('cuzbro-observatory-state')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'observatory_state',
          filter: 'id=eq.current'
        },
        (payload) => {
          if (!active) return;

          const nextSiteKey =
            payload.new?.site_key ||
            payload.old?.site_key;

          setSiteKey(
            getObservingSite(nextSiteKey).key
          );
          setStatus('ready');
          setError('');
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const updateObservingSite = useCallback(
    async (nextSiteKey) => {
      const nextSite = getObservingSite(nextSiteKey);

      if (!session?.user?.id) {
        return {
          ok: false,
          error: 'Crew authentication is required.'
        };
      }

      setSaving(true);
      setError('');

      const { error: updateError } = await supabase
        .from('observatory_state')
        .upsert(
          {
            id: 'current',
            site_key: nextSite.key,
            updated_by_user_id: session.user.id,
            updated_by_email: session.user.email || '',
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'id'
          }
        );

      setSaving(false);

      if (updateError) {
        console.error(
          'Observing site update failed:',
          updateError
        );
        setError(
          updateError.message ||
            'Observing site could not be updated.'
        );

        return {
          ok: false,
          error:
            updateError.message ||
            'Observing site could not be updated.'
        };
      }

      setSiteKey(nextSite.key);
      setStatus('ready');

      return {
        ok: true,
        site: nextSite
      };
    },
    [session?.user?.email, session?.user?.id]
  );

  return {
    currentSite,
    siteKey,
    status,
    error,
    saving,
    refresh,
    updateObservingSite
  };
}
