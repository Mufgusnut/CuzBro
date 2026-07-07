import {
  ArrowLeft,
  Radio,
  Send,
  Terminal,
  Users
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  getCrewMember
} from '../lib/crew.js';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ROWS = 200;

function formatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString(
    'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function normalizeCrewName(value) {
  return String(value || 'UNKNOWN')
    .trim()
    .toUpperCase();
}

function makeLocalEvent(body) {
  return {
    id:
      `local-${Date.now()}-${Math.random()}`,
    crew_name: 'SYSTEM',
    body,
    created_at:
      new Date().toISOString(),
    local: true
  };
}

export default function CommsTerminal({
  session
}) {
  const crew =
    getCrewMember(
      session?.user?.email
    );

  const [messages, setMessages] =
    useState([]);

  const [localEvents, setLocalEvents] =
    useState([]);

  const [composer, setComposer] =
    useState('');

  const [status, setStatus] =
    useState('loading');

  const [linkStatus, setLinkStatus] =
    useState('connecting');

  const [error, setError] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [onlineCrew, setOnlineCrew] =
    useState([]);

  const feedRef = useRef(null);

  const visibleRows = useMemo(
    () =>
      [
        ...messages,
        ...localEvents
      ]
        .sort(
          (a, b) =>
            new Date(a.created_at) -
            new Date(b.created_at)
        ),
    [
      messages,
      localEvents
    ]
  );

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    feed.scrollTop =
      feed.scrollHeight;
  }, [visibleRows.length]);

  useEffect(() => {
    let active = true;
    let messageChannel = null;
    let presenceChannel = null;

    async function startComms() {
      setStatus('loading');
      setLinkStatus('connecting');
      setError('');

      const {
        data,
        error: loadError
      } = await supabase
        .from('crew_comms')
        .select(
          'id, user_id, crew_email, crew_name, body, created_at'
        )
        .order('created_at', {
          ascending: false
        })
        .limit(MAX_HISTORY_ROWS);

      if (loadError) {
        console.error(
          'Comms history load failed:',
          loadError
        );

        if (active) {
          setError(
            loadError.message ||
              'Secure comms history unavailable.'
          );
          setStatus('error');
          setLinkStatus('error');
        }

        return;
      }

      if (!active) {
        return;
      }

      setMessages(
        [...(data || [])].reverse()
      );

      setStatus('ready');

      messageChannel = supabase
        .channel('cuzbro-secure-comms-feed')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'crew_comms'
          },
          (payload) => {
            const incoming =
              payload.new;

            setMessages(
              (current) => [
                ...current.filter(
                  (message) =>
                    message.id !==
                    incoming.id
                ),
                incoming
              ].slice(
                -MAX_HISTORY_ROWS
              )
            );
          }
        )
        .subscribe((channelStatus) => {
          if (!active) {
            return;
          }

          if (
            channelStatus ===
            'SUBSCRIBED'
          ) {
            setLinkStatus('live');
            return;
          }

          if (
            channelStatus ===
              'CHANNEL_ERROR' ||
            channelStatus ===
              'TIMED_OUT'
          ) {
            setLinkStatus('error');
            return;
          }

          if (
            channelStatus === 'CLOSED'
          ) {
            setLinkStatus('offline');
            return;
          }

          setLinkStatus('connecting');
        });

      presenceChannel = supabase
        .channel(
          'cuzbro-secure-comms-presence',
          {
            config: {
              presence: {
                key:
                  session?.user?.id ||
                  crew.callSign
              }
            }
          }
        )
        .on(
          'presence',
          {
            event: 'sync'
          },
          () => {
            const state =
              presenceChannel
                .presenceState();

            const crewNames =
              Object.values(state)
                .flat()
                .map(
                  (presence) =>
                    normalizeCrewName(
                      presence.crewName
                    )
                )
                .filter(Boolean);

            setOnlineCrew(
              Array.from(
                new Set(crewNames)
              )
            );
          }
        )
        .on(
          'presence',
          {
            event: 'join'
          },
          ({ newPresences }) => {
            newPresences.forEach(
              (presence) => {
                const joinedCrew =
                  normalizeCrewName(
                    presence.crewName
                  );

                if (
                  joinedCrew &&
                  joinedCrew !==
                    crew.callSign
                ) {
                  setLocalEvents(
                    (current) => [
                      ...current,
                      makeLocalEvent(
                        `${joinedCrew} ENTERED COMMS`
                      )
                    ].slice(-30)
                  );
                }
              }
            );
          }
        )
        .subscribe(async (
          channelStatus
        ) => {
          if (
            channelStatus ===
            'SUBSCRIBED'
          ) {
            await presenceChannel.track({
              crewName:
                crew.callSign,
              role:
                crew.role,
              joinedAt:
                new Date().toISOString()
            });
          }
        });
    }

    startComms();

    return () => {
      active = false;

      if (messageChannel) {
        supabase.removeChannel(
          messageChannel
        );
      }

      if (presenceChannel) {
        supabase.removeChannel(
          presenceChannel
        );
      }
    };
  }, [
    session?.user?.id,
    crew.callSign,
    crew.role
  ]);

  function addLocalEvent(body) {
    setLocalEvents(
      (current) => [
        ...current,
        makeLocalEvent(body)
      ].slice(-30)
    );
  }

  async function sendMessage(
    rawMessage
  ) {
    const cleanMessage =
      String(rawMessage || '')
        .trim();

    if (!cleanMessage) {
      return;
    }

    if (
      cleanMessage.length >
      MAX_MESSAGE_LENGTH
    ) {
      setError(
        `Message exceeds the ${MAX_MESSAGE_LENGTH}-character comms limit.`
      );
      return;
    }

    const lowerCommand =
      cleanMessage.toLowerCase();

    if (
      lowerCommand === '/help'
    ) {
      addLocalEvent(
        'COMMANDS: /HELP · /CREW · /CLEAR · /PING [CREW]'
      );
      setComposer('');
      return;
    }

    if (
      lowerCommand === '/crew'
    ) {
      addLocalEvent(
        onlineCrew.length
          ? `ONLINE CREW: ${onlineCrew.join(
              ' · '
            )}`
          : 'NO OTHER CREW DETECTED IN COMMS'
      );
      setComposer('');
      return;
    }

    if (
      lowerCommand === '/clear'
    ) {
      setMessages([]);
      setLocalEvents([
        makeLocalEvent(
          'LOCAL TERMINAL BUFFER CLEARED · HISTORY REMAINS STORED'
        )
      ]);
      setComposer('');
      return;
    }

    let messageToSend =
      cleanMessage;

    if (
      lowerCommand.startsWith('/ping ')
    ) {
      const target =
        cleanMessage
          .slice(6)
          .trim()
          .toUpperCase();

      if (!target) {
        addLocalEvent(
          'PING REQUIRES A CREW NAME'
        );
        return;
      }

      messageToSend =
        `⚡ PING ${target}`;
    }

    setSending(true);
    setError('');

    const {
      error: insertError
    } = await supabase
      .from('crew_comms')
      .insert({
        user_id:
          session?.user?.id,
        crew_email:
          session?.user?.email,
        crew_name:
          crew.callSign,
        body:
          messageToSend
      });

    if (insertError) {
      console.error(
        'Comms send failed:',
        insertError
      );

      setError(
        insertError.message ||
          'Secure transmission failed.'
      );

      setSending(false);
      return;
    }

    setComposer('');
    setSending(false);
  }

  function handleSubmit(event) {
    event.preventDefault();

    sendMessage(composer);
  }

  return (
    <div className="admin-page comms-page">
      <header className="admin-header">
        <div className="admin-brand">
          <a
            href="/"
            aria-label="CuzBro homepage"
          >
            <img
              src={
                import.meta.env.BASE_URL +
                'assets/cuzbro-logo.png'
              }
              alt="CuzBro logo"
            />
          </a>

          <div>
            <span>
              SECURE CREW TERMINAL
            </span>

            <h1>Comms Terminal</h1>
          </div>
        </div>

        <button
          type="button"
          className="admin-logout"
          onClick={() => {
            window.location.href =
              '/admin';
          }}
        >
          <ArrowLeft size={17} />
          CONTROL CENTER
        </button>
      </header>

      <main className="admin-main">
        <section className="admin-log-heading comms-heading">
          <div>
            <span className="admin-eyebrow">
              ENCRYPTED CREW CHANNEL
            </span>

            <h2>
              CuzBro Secure Comms
            </h2>

            <p>
              Persistent private crew messages
              with live Supabase transmission
              and terminal presence.
            </p>
          </div>

          <div className="comms-link-cluster">
            <div
              className={`comms-link-status comms-link-status-${linkStatus}`}
            >
              <Radio size={15} />
              <i />

              {linkStatus === 'live'
                ? 'LIVE LINK'
                : linkStatus === 'error'
                  ? 'LINK ERROR'
                  : linkStatus === 'offline'
                    ? 'OFFLINE'
                    : 'CONNECTING'}
            </div>

            <div className="comms-online-count">
              <Users size={15} />
              {onlineCrew.length} ONLINE
            </div>
          </div>
        </section>

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        <section className="comms-terminal">
          <div className="comms-terminal-bar">
            <div>
              <Terminal size={17} />
              CUZBRO COMMS
            </div>

            <span>
              AUTHORIZED AS {crew.callSign}
            </span>
          </div>

          <div
            className="comms-feed"
            ref={feedRef}
          >
            <div className="comms-boot-sequence">
              <span>
                CUZBRO SECURE COMMS v1.0
              </span>

              <span>
                AUTHENTICATED CREW CHANNEL
              </span>

              <span>
                TYPE /HELP FOR COMMANDS
              </span>
            </div>

            {status === 'loading' && (
              <div className="comms-system-row">
                <span>
                  [SYSTEM]
                </span>

                ESTABLISHING SECURE DATA
                LINK...
              </div>
            )}

            {status === 'error' && (
              <div className="comms-system-row comms-system-row-error">
                <span>
                  [SYSTEM]
                </span>

                COMMS DATA LINK UNAVAILABLE
              </div>
            )}

            {status === 'ready' &&
              visibleRows.length === 0 && (
                <div className="comms-system-row">
                  <span>
                    [SYSTEM]
                  </span>

                  CHANNEL OPEN · NO
                  TRANSMISSIONS RECORDED
                </div>
              )}

            {visibleRows.map(
              (message) => {
                const sender =
                  normalizeCrewName(
                    message.crew_name
                  );

                return (
                  <article
                    className={`comms-message${
                      sender === 'SYSTEM'
                        ? ' comms-message-system'
                        : sender ===
                            crew.callSign
                          ? ' comms-message-self'
                          : ''
                    }`}
                    key={message.id}
                  >
                    <time>
                      [
                      {formatTimestamp(
                        message.created_at
                      )}
                      ]
                    </time>

                    <strong>
                      {sender}
                    </strong>

                    <p>
                      {message.body}
                    </p>
                  </article>
                );
              }
            )}
          </div>

          <form
            className="comms-composer"
            onSubmit={handleSubmit}
          >
            <span>&gt;</span>

            <input
              type="text"
              value={composer}
              onChange={(event) => {
                setComposer(
                  event.target.value
                );
              }}
              maxLength={
                MAX_MESSAGE_LENGTH
              }
              placeholder="ENTER TRANSMISSION..."
              autoComplete="off"
              disabled={sending}
              aria-label="Comms transmission"
            />

            <small>
              {composer.length}/
              {MAX_MESSAGE_LENGTH}
            </small>

            <button
              type="submit"
              disabled={
                sending ||
                !composer.trim()
              }
              aria-label="Send transmission"
            >
              <Send size={17} />

              {sending
                ? 'SENDING'
                : 'TRANSMIT'}
            </button>
          </form>
        </section>

        <section className="comms-crew-strip">
          {[
            'DAVE',
            'JUSTIN',
            'CHAPPY'
          ].map((crewName) => {
            const isOnline =
              onlineCrew.includes(
                crewName
              );

            return (
              <div
                key={crewName}
                className={
                  isOnline
                    ? 'comms-crew-online'
                    : ''
                }
              >
                <i />

                <span>{crewName}</span>

                <strong>
                  {isOnline
                    ? 'ONLINE'
                    : 'OFFLINE'}
                </strong>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
