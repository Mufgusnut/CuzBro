import {
  RadioTower,
  UserRound
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  getAllCrewMembers
} from '../lib/crew.js';

const ONLINE_WINDOW_MS = 45_000;

function getElapsedLabel(dateValue, now) {
  if (!dateValue) {
    return 'NO SIGNAL RECEIVED';
  }

  const timestamp =
    new Date(dateValue).getTime();

  if (Number.isNaN(timestamp)) {
    return 'SIGNAL TIME UNKNOWN';
  }

  const elapsedSeconds =
    Math.max(
      0,
      Math.floor(
        (now - timestamp) / 1000
      )
    );

  if (elapsedSeconds < 5) {
    return 'LAST SIGNAL JUST NOW';
  }

  if (elapsedSeconds < 60) {
    return `LAST SIGNAL ${elapsedSeconds} SEC AGO`;
  }

  const elapsedMinutes =
    Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `LAST SIGNAL ${elapsedMinutes} MIN AGO`;
  }

  const elapsedHours =
    Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `LAST SIGNAL ${elapsedHours} HR AGO`;
  }

  const elapsedDays =
    Math.floor(elapsedHours / 24);

  return `LAST SIGNAL ${elapsedDays} DAY${
    elapsedDays === 1 ? '' : 'S'
  } AGO`;
}

export default function CrewPresencePanel({
  session
}) {
  const [presenceRows, setPresenceRows] =
    useState([]);

  const [status, setStatus] =
    useState('loading');

  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    const timerId =
      window.setInterval(() => {
        setNow(Date.now());
      }, 10_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let channel = null;

    async function startCrewLink() {
      const accessToken =
        session?.access_token;

      const supabaseUrl =
        import.meta.env.VITE_SUPABASE_URL;

      const supabasePublishableKey =
        import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY;

      if (
        !accessToken ||
        !supabaseUrl ||
        !supabasePublishableKey
      ) {
        setStatus('error');

        console.error(
          '[CREW LINK] Dashboard configuration unavailable.'
        );

        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/crew_presence?select=*&order=crew_name.asc`,
          {
            headers: {
              apikey:
                supabasePublishableKey,

              Authorization:
                `Bearer ${accessToken}`
            }
          }
        );

        const responseText =
          await response.text();

        let responseBody = [];

        if (responseText) {
          try {
            responseBody =
              JSON.parse(responseText);
          } catch {
            responseBody = [];
          }
        }

        if (!response.ok) {
          throw new Error(
            responseBody?.message ||
              `Crew Link request failed with status ${response.status}.`
          );
        }

        if (active) {
          setPresenceRows(
            Array.isArray(responseBody)
              ? responseBody
              : []
          );

          setStatus('ready');
        }

        await supabase.realtime.setAuth(
          accessToken
        );

        if (!active) {
          return;
        }

        channel = supabase
          .channel(
            'cuzbro-crew-presence-dashboard'
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'crew_presence'
            },
            (payload) => {
              const row =
                payload.new &&
                Object.keys(payload.new).length
                  ? payload.new
                  : payload.old;

              if (!row?.user_id) {
                return;
              }

              setPresenceRows(
                (currentRows) => {
                  if (
                    payload.eventType ===
                    'DELETE'
                  ) {
                    return currentRows.filter(
                      (currentRow) =>
                        currentRow.user_id !==
                        row.user_id
                    );
                  }

                  return [
                    ...currentRows.filter(
                      (currentRow) =>
                        currentRow.user_id !==
                        row.user_id
                    ),
                    row
                  ];
                }
              );

              setNow(Date.now());
            }
          )
          .subscribe(
            (realtimeStatus, error) => {
              console.log(
                '[CREW LINK] Realtime status:',
                realtimeStatus
              );

              if (error) {
                console.error(
                  '[CREW LINK] Realtime error:',
                  error
                );
              }
            }
          );
      } catch (error) {
        console.error(
          '[CREW LINK] Dashboard load failed:',
          error
        );

        if (active) {
          setStatus('error');
        }
      }
    }

    startCrewLink();

    return () => {
      active = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [session?.access_token]);

  const crewCards =
    useMemo(() => {
      const rowsByEmail =
        new Map(
          presenceRows.map((row) => [
            String(
              row.crew_email || ''
            )
              .trim()
              .toLowerCase(),
            row
          ])
        );

      return getAllCrewMembers().map(
        (crew) => {
          const row =
            rowsByEmail.get(
              crew.email.toLowerCase()
            ) || null;

          const lastSeenTime =
            row?.last_seen_at
              ? new Date(
                  row.last_seen_at
                ).getTime()
              : 0;

          const online =
            Boolean(lastSeenTime) &&
            now - lastSeenTime <=
              ONLINE_WINDOW_MS;

          return {
            ...crew,
            row,
            online,
            lastSeenLabel:
              getElapsedLabel(
                row?.last_seen_at,
                now
              )
          };
        }
      );
    }, [presenceRows, now]);

  const onlineCount =
    crewCards.filter(
      (crew) => crew.online
    ).length;

  return (
    <section className="admin-crew-link-panel">
      <div className="admin-crew-link-heading">
        <div>
          <span className="admin-eyebrow">
            SECURE CREW TELEMETRY
          </span>

          <h2>Crew Link</h2>
        </div>

        <div className="admin-crew-link-summary">
          <RadioTower size={15} />
          <i />

          {status === 'loading'
            ? 'ACQUIRING SIGNAL'
            : status === 'error'
              ? 'LINK ERROR'
              : `${onlineCount} CREW ONLINE`}
        </div>
      </div>

      <div className="admin-crew-link-grid">
        {crewCards.map((crew) => (
          <article
            className={`admin-crew-link-card ${
              crew.online
                ? 'admin-crew-link-card-online'
                : ''
            }`}
            key={crew.email}
          >
            <div className="admin-crew-link-card-header">
              <div className="admin-crew-link-identity">
                <div className="admin-crew-link-avatar">
                  <UserRound size={20} />
                </div>

                <div>
                  <strong>
                    {crew.callSign}
                  </strong>

                  <span>
                    {crew.role}
                  </span>
                </div>
              </div>

              <i className="admin-crew-link-signal" />
            </div>

            <div className="admin-crew-link-status">
              <span>
                {crew.online
                  ? 'CURRENT STATION'
                  : 'CREW STATUS'}
              </span>

              <strong>
                {crew.online
                  ? crew.row?.page_name ||
                    'ADMIN CONTROL'
                  : 'OFFLINE'}
              </strong>
            </div>

            <div className="admin-crew-link-last-seen">
              {crew.lastSeenLabel}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}