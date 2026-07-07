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
  findCrewMember,
  getAllCrewMembers,
  getCrewMember
} from '../lib/crew.js';
import {
  getLocalCrewStatus,
  setLocalCrewStatus
} from '../lib/presence.js';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ROWS = 200;
const ONLINE_WINDOW_MS = 45_000;
const NAVIGATION_COMMANDS = {
  '/captures': '/admin/gallery',
  '/transfer': '/admin/transfers',
  '/storage': '/admin/storage',
  '/blackbox': '/admin/black-box',
  '/system': '/admin/system',
  '/deploy': '/admin/deployments'
};

function getSoundPreferenceKey(userId) {
  return `cuzbro-comms-sound-${userId || 'crew'}`;
}

function isCommsSoundEnabled(userId) {
  return localStorage.getItem(
    getSoundPreferenceKey(userId)
  ) !== 'off';
}

function setCommsSoundEnabled(userId, enabled) {
  localStorage.setItem(
    getSoundPreferenceKey(userId),
    enabled ? 'on' : 'off'
  );
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizeCrewName(value) {
  return String(value || 'UNKNOWN')
    .trim()
    .toUpperCase();
}

function makeLocalEvent(body, eventType = 'SYSTEM') {
  return {
    id: `local-${Date.now()}-${Math.random()}`,
    crew_name: 'SYSTEM',
    body,
    eventType,
    created_at: new Date().toISOString(),
    local: true
  };
}

function parseDiceNotation(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{0,2})d(\d{1,4})([+-]\d{1,4})?$/i);

  if (!match) {
    return null;
  }

  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const modifier = Number(match[3] || 0);

  if (
    count < 1 ||
    count > 20 ||
    sides < 2 ||
    sides > 1000 ||
    Math.abs(modifier) > 10000
  ) {
    return null;
  }

  return { count, sides, modifier };
}

function isPresenceOnline(row) {
  const lastSeen = new Date(row?.last_seen_at).getTime();
  return Number.isFinite(lastSeen) &&
    Date.now() - lastSeen <= ONLINE_WINDOW_MS;
}

export default function CommsTerminal({ session }) {
  const crew = getCrewMember(session?.user?.email);
  const [messages, setMessages] = useState([]);
  const [localEvents, setLocalEvents] = useState([]);
  const [composer, setComposer] = useState('');
  const [status, setStatus] = useState('loading');
  const [linkStatus, setLinkStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineCrew, setOnlineCrew] = useState([]);
  const [redAlert, setRedAlert] = useState(false);
  const feedRef = useRef(null);
  const composerRef = useRef(null);
  const redAlertTimerRef = useRef(null);

  const visibleRows = useMemo(
    () => [...messages, ...localEvents].sort(
      (a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
    ),
    [messages, localEvents]
  );

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [visibleRows.length]);


  useEffect(() => {
    if (sending || status !== 'ready') {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => {
      composerRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [sending, status, visibleRows.length]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    localStorage.setItem(
      `cuzbro-comms-last-seen-${session.user.id}`,
      new Date().toISOString()
    );
  }, [session?.user?.id, messages.length]);

  useEffect(() => {
    let active = true;
    let messageChannel = null;
    let presenceChannel = null;
    let pingChannel = null;

    async function acknowledgePendingSignals() {
      const email = String(session?.user?.email || '')
        .trim()
        .toLowerCase();

      if (!email) {
        return;
      }

      const { data, error: loadPingError } = await supabase
        .from('crew_pings')
        .select(
          'id, sender_name, recipient_email, kind, created_at, acknowledged_at'
        )
        .eq('recipient_email', email)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: true });

      if (loadPingError) {
        console.error('Pending ping load failed:', loadPingError);
        return;
      }

      if (!active || !(data || []).length) {
        return;
      }

      (data || []).forEach((signal) => {
        if (signal.kind === 'RED_ALERT') {
          triggerRedAlert(
            `⚠ MISSED RED ALERT · DECLARED BY ${normalizeCrewName(signal.sender_name)}`
          );
        } else {
          addLocalEvent(
            `⚡ MISSED PRIORITY PING · ${normalizeCrewName(signal.sender_name)} · ${formatTimestamp(signal.created_at)}`,
            'PING'
          );
        }
      });

      await supabase
        .from('crew_pings')
        .update({ acknowledged_at: new Date().toISOString() })
        .in('id', data.map((signal) => signal.id));
    }

    async function startComms() {
      setStatus('loading');
      setLinkStatus('connecting');
      setError('');

      const { data, error: loadError } = await supabase
        .from('crew_comms')
        .select(
          'id, user_id, crew_email, crew_name, body, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY_ROWS);

      if (loadError) {
        console.error('Comms history load failed:', loadError);
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

      setMessages([...(data || [])].reverse());
      setStatus('ready');
      await acknowledgePendingSignals();

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
            const incoming = payload.new;
            setMessages((current) => [
              ...current.filter(
                (message) => message.id !== incoming.id
              ),
              incoming
            ].slice(-MAX_HISTORY_ROWS));

            if (
              incoming?.user_id !== session?.user?.id
            ) {
              window.dispatchEvent(
                new CustomEvent('cuzbro:incoming-comms', {
                  detail: {
                    senderName: normalizeCrewName(
                      incoming?.crew_name
                    )
                  }
                })
              );
            }
          }
        )
        .subscribe((channelStatus) => {
          if (!active) {
            return;
          }
          if (channelStatus === 'SUBSCRIBED') {
            setLinkStatus('live');
          } else if (
            channelStatus === 'CHANNEL_ERROR' ||
            channelStatus === 'TIMED_OUT'
          ) {
            setLinkStatus('error');
          } else if (channelStatus === 'CLOSED') {
            setLinkStatus('offline');
          } else {
            setLinkStatus('connecting');
          }
        });

      presenceChannel = supabase
        .channel('cuzbro-secure-comms-presence', {
          config: {
            presence: {
              key: session?.user?.id || crew.callSign
            }
          }
        })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const crewNames = Object.values(state)
            .flat()
            .map((presence) =>
              normalizeCrewName(presence.crewName)
            )
            .filter(Boolean);

          setOnlineCrew(Array.from(new Set(crewNames)));
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          newPresences.forEach((presence) => {
            const joinedCrew = normalizeCrewName(
              presence.crewName
            );

            if (
              joinedCrew &&
              joinedCrew !== crew.callSign
            ) {
              addLocalEvent(`${joinedCrew} ENTERED COMMS`);
            }
          });
        })
        .subscribe(async (channelStatus) => {
          if (channelStatus === 'SUBSCRIBED') {
            await presenceChannel.track({
              crewName: crew.callSign,
              role: crew.role,
              joinedAt: new Date().toISOString()
            });
          }
        });

      const ownEmail = String(session?.user?.email || '')
        .trim()
        .toLowerCase();

      pingChannel = supabase
        .channel(`cuzbro-comms-pings-${session?.user?.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'crew_pings'
          },
          async (payload) => {
            const signal = payload.new;
            if (
              String(signal.recipient_email || '').toLowerCase() !== ownEmail
            ) {
              return;
            }

            if (signal.kind === 'RED_ALERT') {
              triggerRedAlert(
                `⚠ RED ALERT · DECLARED BY ${normalizeCrewName(signal.sender_name)}`
              );
            } else {
              addLocalEvent(
                `⚡ PRIORITY PING RECEIVED FROM ${normalizeCrewName(signal.sender_name)}`,
                'PING'
              );
            }

            await supabase
              .from('crew_pings')
              .update({ acknowledged_at: new Date().toISOString() })
              .eq('id', signal.id);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'crew_pings'
          },
          (payload) => {
            const signal = payload.new;

            if (
              signal.sender_id !== session?.user?.id ||
              !signal.acknowledged_at
            ) {
              return;
            }

            addLocalEvent(
              `${signal.kind === 'RED_ALERT' ? 'RED ALERT' : 'PING'} ACKNOWLEDGED BY ${normalizeCrewName(signal.recipient_name)}`,
              signal.kind
            );
          }
        )
        .subscribe();
    }

    startComms();

    return () => {
      active = false;
      if (redAlertTimerRef.current) {
        window.clearTimeout(redAlertTimerRef.current);
      }
      [messageChannel, presenceChannel, pingChannel]
        .filter(Boolean)
        .forEach((channel) => supabase.removeChannel(channel));
    };
  }, [
    session?.user?.id,
    session?.user?.email,
    crew.callSign,
    crew.role
  ]);

  function addLocalEvent(body, eventType = 'SYSTEM') {
    setLocalEvents((current) => [
      ...current,
      makeLocalEvent(body, eventType)
    ].slice(-40));
  }

  function triggerRedAlert(body) {
    setRedAlert(true);
    addLocalEvent(body, 'RED_ALERT');

    if (redAlertTimerRef.current) {
      window.clearTimeout(redAlertTimerRef.current);
    }

    redAlertTimerRef.current = window.setTimeout(() => {
      setRedAlert(false);
      addLocalEvent('RED ALERT CONDITION ENDED');
    }, 5000);
  }

  async function insertCommsMessage(body) {
    const { error: insertError } = await supabase
      .from('crew_comms')
      .insert({
        user_id: session?.user?.id,
        crew_email: session?.user?.email,
        crew_name: crew.callSign,
        body
      });

    if (insertError) {
      throw insertError;
    }
  }

  async function getPresenceRows() {
    const { data, error: presenceError } = await supabase
      .from('crew_presence')
      .select(
        'user_id, crew_email, crew_name, page_name, status, custom_status, last_seen_at'
      )
      .order('crew_name', { ascending: true });

    if (presenceError) {
      throw presenceError;
    }

    return data || [];
  }

  async function sendPrioritySignal(targetValue, kind = 'PING') {
    const allCrew = getAllCrewMembers();
    const target = String(targetValue || '')
      .trim()
      .toLowerCase();

    let recipients = [];

    if (target === 'all') {
      recipients = allCrew.filter(
        (member) =>
          member.email.toLowerCase() !==
          String(session?.user?.email || '').toLowerCase()
      );
    } else {
      const matchedCrew = findCrewMember(target);
      if (!matchedCrew) {
        addLocalEvent(
          `UNKNOWN CREW TARGET: ${targetValue || 'NONE'}`
        );
        return;
      }
      recipients = [matchedCrew];
    }

    if (!recipients.length) {
      addLocalEvent('NO VALID PING RECIPIENTS');
      return;
    }

    const rows = recipients.map((recipient) => ({
      sender_id: session?.user?.id,
      sender_email: session?.user?.email,
      sender_name: crew.callSign,
      recipient_email: recipient.email,
      recipient_name: recipient.callSign,
      kind
    }));

    const { data: createdSignals, error: pingError } = await supabase
      .from('crew_pings')
      .insert(rows)
      .select('id, recipient_email, recipient_name');

    if (pingError) {
      throw pingError;
    }

    const presenceRows = await getPresenceRows();
    const onlineEmails = new Set(
      presenceRows
        .filter(isPresenceOnline)
        .map((row) => String(row.crew_email || '').toLowerCase())
    );

    recipients.forEach((recipient) => {
      const online = onlineEmails.has(recipient.email.toLowerCase());
      addLocalEvent(
        kind === 'RED_ALERT'
          ? `RED ALERT TRANSMITTED TO ${recipient.callSign} · ${online ? 'ONLINE' : 'OFFLINE / QUEUED'}`
          : `PING TRANSMITTED TO ${recipient.callSign} · ${online ? 'ONLINE' : 'OFFLINE / QUEUED'}`,
        kind
      );
    });

    return createdSignals || [];
  }

  async function handleWhoCommand() {
    const rows = await getPresenceRows();
    const rowByEmail = new Map(
      rows.map((row) => [
        String(row.crew_email || '').toLowerCase(),
        row
      ])
    );

    const lines = ['CREW TELEMETRY'];

    getAllCrewMembers().forEach((member) => {
      const row = rowByEmail.get(member.email.toLowerCase());
      const online = isPresenceOnline(row);
      lines.push('');
      lines.push(member.callSign);
      lines.push(`STATUS      ${online ? 'ONLINE' : 'OFFLINE'}`);
      lines.push(`LOCATION    ${online ? row?.page_name || 'ADMIN' : '—'}`);
      lines.push(
        `CREW STATUS ${online ? row?.custom_status || 'AVAILABLE' : '—'}`
      );
    });

    addLocalEvent(lines.join('\n'), 'TELEMETRY');
  }

  async function sendMessage(rawMessage) {
    const cleanMessage = String(rawMessage || '').trim();

    if (!cleanMessage) {
      return;
    }

    if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
      setError(
        `Message exceeds the ${MAX_MESSAGE_LENGTH}-character comms limit.`
      );
      return;
    }

    const lowerCommand = cleanMessage.toLowerCase();
    setError('');
    setSending(true);

    try {
      if (lowerCommand === '/help') {
        addLocalEvent(
          [
            'CUZBRO COMMAND INDEX',
            '',
            'CREW',
            '  /ping [crew|all]     Priority crew alert',
            '  /me [action]         Transmit crew action',
            '  /status [text]       Set crew status',
            '  /status clear        Clear crew status',
            '  /sound on            Enable priority audio',
            '  /sound off           Disable priority audio',
            '  /who                 Crew telemetry',
            '',
            'COMMAND',
            '  /captures            Capture Control',
            '  /transfer            Crew Transfer',
            '  /storage             Storage Control',
            '  /blackbox            Black Box',
            '  /system              System Status',
            '  /deploy              Deployment Control',
            '',
            'UTILITY',
            '  /roll [dice]         Dice protocol',
            '  /coin                Entropy request',
            '  /shrug               Critical shrug',
            '  /redalert            Declare red alert',
            '  /crew                Crew in this terminal',
            '  /clear               Clear local terminal'
          ].join('\n'),
          'HELP'
        );
      } else if (lowerCommand === '/crew') {
        addLocalEvent(
          onlineCrew.length
            ? `ONLINE IN COMMS: ${onlineCrew.join(' · ')}`
            : 'NO CREW DETECTED IN COMMS'
        );
      } else if (lowerCommand === '/clear') {
        setMessages([]);
        setLocalEvents([
          makeLocalEvent(
            'LOCAL TERMINAL BUFFER CLEARED · HISTORY REMAINS STORED'
          )
        ]);
      } else if (lowerCommand === '/sound on') {
        setCommsSoundEnabled(session?.user?.id, true);
        addLocalEvent('PRIORITY AUDIO ENABLED · PING AND RED ALERT TONES ACTIVE');
      } else if (lowerCommand === '/sound off') {
        setCommsSoundEnabled(session?.user?.id, false);
        addLocalEvent('PRIORITY AUDIO MUTED · VISUAL ALERTS REMAIN ACTIVE');
      } else if (lowerCommand === '/sound') {
        addLocalEvent(
          `PRIORITY AUDIO · ${
            isCommsSoundEnabled(session?.user?.id)
              ? 'ENABLED'
              : 'MUTED'
          }`
        );
      } else if (lowerCommand === '/who') {
        await handleWhoCommand();
      } else if (lowerCommand.startsWith('/ping')) {
        const target = cleanMessage.slice(5).trim();
        if (!target) {
          addLocalEvent('USAGE: /PING [DAVE|JUSTIN|CHAPPY|ALL]');
        } else {
          await sendPrioritySignal(target, 'PING');
        }
      } else if (lowerCommand.startsWith('/me ')) {
        const action = cleanMessage.slice(4).trim();
        if (!action) {
          addLocalEvent('USAGE: /ME [ACTION]');
        } else {
          await insertCommsMessage(
            `* ${crew.callSign} ${action}`
          );
        }
      } else if (lowerCommand.startsWith('/status')) {
        const newStatus = cleanMessage.slice(7).trim();
        if (!newStatus) {
          const currentStatus = getLocalCrewStatus(
            session?.user?.id
          );
          addLocalEvent(
            `CREW STATUS: ${currentStatus || 'AVAILABLE'}`
          );
        } else if (newStatus.toLowerCase() === 'clear') {
          setLocalCrewStatus(session?.user?.id, '');
          addLocalEvent('CREW STATUS CLEARED · AVAILABLE');
        } else {
          const savedStatus = setLocalCrewStatus(
            session?.user?.id,
            newStatus
          );
          addLocalEvent(`CREW STATUS SET · ${savedStatus.toUpperCase()}`);
        }
      } else if (NAVIGATION_COMMANDS[lowerCommand]) {
        addLocalEvent(
          `ROUTING TO ${lowerCommand.slice(1).toUpperCase()}...`
        );
        window.setTimeout(() => {
          window.location.href = NAVIGATION_COMMANDS[lowerCommand];
        }, 350);
      } else if (lowerCommand.startsWith('/roll')) {
        const notation = cleanMessage.slice(5).trim();
        const dice = parseDiceNotation(notation);

        if (!dice) {
          addLocalEvent(
            'INVALID DICE PROTOCOL · EXAMPLES: /ROLL D20 · /ROLL 2D6 · /ROLL 4D8+3'
          );
        } else {
          const rolls = Array.from(
            { length: dice.count },
            () => Math.floor(Math.random() * dice.sides) + 1
          );
          const total = rolls.reduce((sum, roll) => sum + roll, 0) + dice.modifier;
          const modifierText = dice.modifier
            ? `\nMODIFIER  ${dice.modifier > 0 ? '+' : ''}${dice.modifier}`
            : '';

          await insertCommsMessage(
            `🎲 ${crew.callSign} ROLLED ${dice.count === 1 ? '' : dice.count}D${dice.sides}${dice.modifier ? `${dice.modifier > 0 ? '+' : ''}${dice.modifier}` : ''}\nROLLS     ${rolls.join(' · ')}${modifierText}\nRESULT    ${total}`
          );
        }
      } else if (lowerCommand === '/coin') {
        const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
        await insertCommsMessage(
          `🪙 RANDOM ENTROPY REQUEST · ${crew.callSign}\nRESULT    ${result}`
        );
      } else if (lowerCommand === '/shrug') {
        await insertCommsMessage('¯\\_(ツ)_/¯');
      } else if (lowerCommand === '/redalert') {
        triggerRedAlert(`⚠ RED ALERT · DECLARED BY ${crew.callSign}`);
        await insertCommsMessage(
          `⚠ RED ALERT · DECLARED BY ${crew.callSign}`
        );
        await sendPrioritySignal('all', 'RED_ALERT');
      } else if (cleanMessage.startsWith('/')) {
        addLocalEvent(
          `UNKNOWN COMMAND: ${cleanMessage.split(/\s+/)[0].toUpperCase()} · TYPE /HELP`
        );
      } else {
        await insertCommsMessage(cleanMessage);
      }

      setComposer('');
    } catch (commandError) {
      console.error('Comms command failed:', commandError);
      setError(
        commandError.message ||
          'Secure command execution failed.'
      );
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(composer);
  }

  return (
    <div
      className={`admin-page comms-page${
        redAlert ? ' comms-page-red-alert' : ''
      }`}
    >
      {redAlert && (
        <div className="comms-red-alert-banner">
          ⚠ RED ALERT
        </div>
      )}

      <header className="admin-header">
        <div className="admin-brand">
          <a href="/" aria-label="CuzBro homepage">
            <img
              src={
                import.meta.env.BASE_URL +
                'assets/cuzbro-logo.png'
              }
              alt="CuzBro logo"
            />
          </a>

          <div>
            <span>SECURE CREW TERMINAL</span>
            <h1>Comms Terminal</h1>
          </div>
        </div>

        <button
          type="button"
          className="admin-logout"
          onClick={() => {
            window.location.href = '/admin';
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
            <h2>CuzBro Secure Comms</h2>
            <p>
              Persistent private crew messages with live
              priority signaling and command execution.
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
          <div className="admin-error-message">{error}</div>
        )}

        <section className="comms-terminal">
          <div className="comms-terminal-bar">
            <div>
              <Terminal size={17} />
              CUZBRO COMMS
            </div>
            <span>AUTHORIZED AS {crew.callSign}</span>
          </div>

          <div className="comms-feed" ref={feedRef}>
            <div className="comms-boot-sequence">
              <span>CUZBRO SECURE COMMS v2.0</span>
              <span>AUTHENTICATED CREW CHANNEL</span>
              <span>TYPE /HELP FOR COMMANDS</span>
            </div>

            {status === 'loading' && (
              <div className="comms-system-row">
                <span>[SYSTEM]</span>
                ESTABLISHING SECURE DATA LINK...
              </div>
            )}

            {status === 'error' && (
              <div className="comms-system-row comms-system-row-error">
                <span>[SYSTEM]</span>
                COMMS DATA LINK UNAVAILABLE
              </div>
            )}

            {status === 'ready' && visibleRows.length === 0 && (
              <div className="comms-system-row">
                <span>[SYSTEM]</span>
                CHANNEL OPEN · NO TRANSMISSIONS RECORDED
              </div>
            )}

            {visibleRows.map((message) => {
              const sender = normalizeCrewName(message.crew_name);
              const eventClass = message.eventType
                ? ` comms-message-${String(message.eventType).toLowerCase().replace(/_/g, '-')}`
                : '';

              return (
                <article
                  className={`comms-message${
                    sender === 'SYSTEM'
                      ? ' comms-message-system'
                      : sender === crew.callSign
                        ? ' comms-message-self'
                        : ''
                  }${eventClass}`}
                  key={message.id}
                >
                  <time>[{formatTimestamp(message.created_at)}]</time>
                  <strong>{sender}</strong>
                  <p>{message.body}</p>
                </article>
              );
            })}
          </div>

          <form className="comms-composer" onSubmit={handleSubmit}>
            <span>&gt;</span>
            <input
              ref={composerRef}
              type="text"
              value={composer}
              onChange={(event) => {
                setComposer(event.target.value);
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="ENTER TRANSMISSION..."
              autoComplete="off"
              autoFocus
              disabled={sending}
              aria-label="Comms transmission"
            />
            <small>
              {composer.length}/{MAX_MESSAGE_LENGTH}
            </small>
            <button
              type="submit"
              disabled={sending || !composer.trim()}
            >
              <Send size={15} />
              {sending ? 'SENDING' : 'SEND'}
            </button>
          </form>
        </section>

        <section className="comms-crew-strip">
          {getAllCrewMembers().map((member) => {
            const isOnline = onlineCrew.includes(member.callSign);
            return (
              <div
                className={isOnline ? 'comms-crew-online' : ''}
                key={member.email}
              >
                <i />
                <span>{member.callSign}</span>
                <strong>{isOnline ? 'ONLINE' : 'OFFLINE'}</strong>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
