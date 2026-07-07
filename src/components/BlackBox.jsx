import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  Filter,
  Radio,
  Search,
  UserRound
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';

const CREW_FILTERS = [
  'ALL',
  'DAVE',
  'JUSTIN',
  'CHAPPY'
];

const CATEGORY_FILTERS = [
  'ALL',
  'TRANSFER',
  'SYSTEM',
  'CAPTURE',
  'MISSION',
  'OPERATION',
  'INCIDENT',
  'TASK',
  'GEAR'
];

function formatEventTime(dateValue) {
  if (!dateValue) {
    return '--:--:--';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '--:--:--';
  }

  return date.toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function formatEventDate(dateValue) {
  if (!dateValue) {
    return 'UNKNOWN DATE';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'UNKNOWN DATE';
  }

  return date.toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }
  );
}

function formatElapsed(dateValue, now) {
  if (!dateValue) {
    return 'NO EVENTS';
  }

  const timestamp =
    new Date(dateValue).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return 'UNKNOWN';
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (now - timestamp) / 1000
      )
    );

  if (seconds < 5) {
    return 'JUST NOW';
  }

  if (seconds < 60) {
    return `${seconds} SEC AGO`;
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} MIN AGO`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} HR AGO`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} DAY${
    days === 1 ? '' : 'S'
  } AGO`;
}

function getActionLabel(action) {
  return String(
    action || 'SYSTEM_EVENT'
  ).replaceAll('_', ' ');
}

function formatStorageBytes(bytes) {
  const size =
    Number(bytes || 0);

  if (size >= 1024 ** 3) {
    return `${(
      size / 1024 ** 3
    ).toFixed(2)} GB`;
  }

  if (size >= 1024 ** 2) {
    return `${(
      size / 1024 ** 2
    ).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(
      size / 1024
    ).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function getEventDescription(event) {
  const name =
    event.resource_name ||
    event.resource_type ||
    'CuzBro system';

  const details =
    event.details &&
    typeof event.details === 'object'
      ? event.details
      : {};

  switch (event.action) {
    case 'TRANSFER_UPLOAD':
      return `${name} · ${Number(
        details.fileCount || 0
      )} ${
        Number(
          details.fileCount || 0
        ) === 1
          ? 'file'
          : 'files'
      }`;

    case 'TRANSFER_DOWNLOAD':
      return `${
        details.transferName ||
        'Crew Transfer'
      } · downloaded ${name}`;

    case 'TRANSFER_FILE_DELETE':
      return `${
        details.transferName ||
        'Crew Transfer'
      } · deleted ${name}`;

    case 'TRANSFER_DELETE':
      return `${name} · ${Number(
        details.fileCount || 0
      )} ${
        Number(
          details.fileCount || 0
        ) === 1
          ? 'file removed'
          : 'files removed'
      }`;

    case 'SYSTEM_CHECK':
      return `${name} · ${Number(
        details.operationalCount || 0
      )} / ${Number(
        details.totalServices || 0
      )} services operational · ${Number(
        details.durationMs || 0
      )} ms`;

    case 'STORAGE_INVENTORY_CHECK':
      return `${name} · ${Number(
        details.objectCount || 0
      )} objects · ${formatStorageBytes(
        details.totalBytes
      )}`;

    case 'OPERATION_STARTED':
      return `${name} · operation initiated · ${String(
        details.target || 'target not specified'
      )}`;

    case 'OPERATION_ENDED':
      return `${name} · operation complete · ${String(
        details.duration || 'duration unavailable'
      )}`;

    case 'INCIDENT_DECLARED':
      return `${name} · ${String(
        details.title || 'Incident'
      )} · ${String(
        details.severity || 'UNKNOWN'
      )} · ${String(
        details.affectedSystem || 'SYSTEM'
      )}`;

    case 'INCIDENT_UPDATE':
      return `${name} · ${String(
        details.updateType || 'UPDATE'
      )} · ${String(
        details.body || 'Incident update logged'
      )}`;

    case 'INCIDENT_RESOLVED':
      return `${name} · ${String(
        details.title || 'Incident'
      )} · ${String(
        details.duration || 'duration unavailable'
      )} · ${String(
        details.rootCause || 'root cause recorded'
      )}`;

    case 'INCIDENT_CONTEXT_JOINED':
      return `${name} · incident comms context joined`;

    case 'INCIDENT_CONTEXT_LEFT':
      return `${name} · incident comms context left`;

    case 'TASK_CREATED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · ${String(
        details.priority || 'NORMAL'
      )} · ${String(
        details.assignedTo || 'UNASSIGNED'
      )}`;

    case 'TASK_ASSIGNED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · assigned ${String(
        details.assignedTo || 'UNASSIGNED'
      )}`;

    case 'TASK_STARTED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · in progress`;

    case 'TASK_BLOCKED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · blocked`;

    case 'TASK_COMPLETED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · complete`;

    case 'TASK_REOPENED':
      return `${name} · ${String(
        details.title || 'Crew task'
      )} · reopened`;

    default:
      return name;
  }
}

export default function BlackBox({
  session
}) {
  const [events, setEvents] =
    useState([]);

  const [status, setStatus] =
    useState('loading');

  const [error, setError] =
    useState('');

  const [crewFilter, setCrewFilter] =
    useState('ALL');

  const [
    categoryFilter,
    setCategoryFilter
  ] = useState('ALL');

  const [searchQuery, setSearchQuery] =
    useState('');

  const [
    expandedEventId,
    setExpandedEventId
  ] = useState(null);

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

    async function startBlackBox() {
      setStatus('loading');
      setError('');

      const accessToken =
        session?.access_token;

      const supabaseUrl =
        import.meta.env
          .VITE_SUPABASE_URL;

      const supabasePublishableKey =
        import.meta.env
          .VITE_SUPABASE_PUBLISHABLE_KEY;

      if (
        !accessToken ||
        !supabaseUrl ||
        !supabasePublishableKey
      ) {
        setStatus('error');

        setError(
          'Authenticated Black Box configuration unavailable.'
        );

        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/crew_activity?select=*&order=created_at.desc`,
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
              `Black Box request failed with status ${response.status}.`
          );
        }

        if (active) {
          setEvents(
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
            'cuzbro-black-box-full'
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'crew_activity'
            },
            (payload) => {
              const newEvent =
                payload.new;

              setEvents(
                (currentEvents) => [
                  newEvent,

                  ...currentEvents.filter(
                    (event) =>
                      event.id !==
                      newEvent.id
                  )
                ]
              );

              setNow(Date.now());
            }
          )
          .subscribe(
            (realtimeStatus, realtimeError) => {
              console.log(
                '[BLACK BOX FULL] Realtime status:',
                realtimeStatus
              );

              if (realtimeError) {
                console.error(
                  '[BLACK BOX FULL] Realtime error:',
                  realtimeError
                );
              }
            }
          );
      } catch (loadError) {
        console.error(
          'Full Black Box load failed:',
          loadError
        );

        if (active) {
          setStatus('error');

          setError(
            loadError.message ||
              'Black Box could not be loaded.'
          );
        }
      }
    }

    startBlackBox();

    return () => {
      active = false;

      if (channel) {
        supabase.removeChannel(
          channel
        );
      }
    };
  }, [
    session?.access_token
  ]);

  const filteredEvents =
    useMemo(() => {
      const normalizedSearch =
        searchQuery
          .trim()
          .toLowerCase();

      return events.filter(
        (event) => {
          const crewMatches =
            crewFilter === 'ALL' ||
            String(
              event.crew_name || ''
            ).toUpperCase() ===
              crewFilter;

          const categoryMatches =
            categoryFilter === 'ALL' ||
            String(
              event.category || ''
            ).toUpperCase() ===
              categoryFilter;

          const searchMatches =
            !normalizedSearch ||
            [
              event.crew_name,
              event.crew_email,
              event.action,
              event.category,
              event.resource_type,
              event.resource_id,
              event.resource_name,
              JSON.stringify(
                event.details || {}
              )
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(
                normalizedSearch
              );

          return (
            crewMatches &&
            categoryMatches &&
            searchMatches
          );
        }
      );
    }, [
      events,
      crewFilter,
      categoryFilter,
      searchQuery
    ]);

  const crewActorCount =
    new Set(
      events
        .map(
          (event) =>
            event.crew_name
        )
        .filter(Boolean)
    ).size;

  const systemEventCount =
    events.filter(
      (event) =>
        String(
          event.category || ''
        ).toUpperCase() ===
        'SYSTEM'
    ).length;

  const latestEvent =
    events[0] || null;

  return (
    <div className="admin-page black-box-page">
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

            <h1>Black Box</h1>
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
        <section className="black-box-command">
          <div>
            <span className="admin-eyebrow">
              CUZBRO FLIGHT DATA RECORDER
            </span>

            <h2>
              Administrative
              <br />
              Event Archive
            </h2>

            <p>
              Authenticated crew operations,
              infrastructure checks, and system
              events recorded by Black Box.
            </p>
          </div>

          <div className="black-box-live-badge">
            <Radio size={16} />

            <i />

            LIVE RECORDER
          </div>
        </section>

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        <section className="black-box-overview">
          <div>
            <Activity size={19} />

            <span>
              EVENTS RECORDED
            </span>

            <strong>
              {status === 'loading'
                ? '—'
                : events.length}
            </strong>
          </div>

          <div>
            <UserRound size={19} />

            <span>
              CREW ACTORS
            </span>

            <strong>
              {status === 'loading'
                ? '—'
                : crewActorCount}
            </strong>
          </div>

          <div>
            <Filter size={19} />

            <span>
              SYSTEM EVENTS
            </span>

            <strong>
              {status === 'loading'
                ? '—'
                : systemEventCount}
            </strong>
          </div>

          <div>
            <Clock3 size={19} />

            <span>
              LAST EVENT
            </span>

            <strong>
              {status === 'loading'
                ? '—'
                : formatElapsed(
                    latestEvent
                      ?.created_at,
                    now
                  )}
            </strong>
          </div>
        </section>

        <section className="black-box-filter-panel">
          <div className="black-box-search">
            <Search size={18} />

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(
                  event.target.value
                );
              }}
              placeholder="Search action, resource, crew, or event data..."
            />
          </div>

          <div className="black-box-filter-group">
            <span>CREW</span>

            <div>
              {CREW_FILTERS.map(
                (filter) => (
                  <button
                    type="button"
                    className={
                      crewFilter ===
                      filter
                        ? 'black-box-filter-active'
                        : ''
                    }
                    onClick={() => {
                      setCrewFilter(
                        filter
                      );
                    }}
                    key={filter}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="black-box-filter-group">
            <span>CATEGORY</span>

            <div>
              {CATEGORY_FILTERS.map(
                (filter) => (
                  <button
                    type="button"
                    className={
                      categoryFilter ===
                      filter
                        ? 'black-box-filter-active'
                        : ''
                    }
                    onClick={() => {
                      setCategoryFilter(
                        filter
                      );
                    }}
                    key={filter}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        <section className="black-box-archive">
          <div className="black-box-archive-heading">
            <div>
              <span className="admin-card-eyebrow">
                EVENT ARCHIVE
              </span>

              <h2>
                Flight Recorder Events
              </h2>
            </div>

            <strong>
              {filteredEvents.length}
              {' '}
              {filteredEvents.length === 1
                ? 'EVENT'
                : 'EVENTS'}
            </strong>
          </div>

          {status === 'loading' && (
            <div className="black-box-empty">
              ESTABLISHING SECURE DATA LINK...
            </div>
          )}

          {status === 'ready' &&
            filteredEvents.length === 0 && (
              <div className="black-box-empty">
                NO EVENTS MATCH CURRENT FILTERS
              </div>
            )}

          {status === 'ready' &&
            filteredEvents.length > 0 && (
              <div className="black-box-event-list">
                {filteredEvents.map(
                  (event) => {
                    const expanded =
                      expandedEventId ===
                      event.id;

                    return (
                      <article
                        className={`black-box-record ${
                          expanded
                            ? 'black-box-record-expanded'
                            : ''
                        }`}
                        key={event.id}
                      >
                        <button
                          type="button"
                          className="black-box-record-main"
                          onClick={() => {
                            setExpandedEventId(
                              expanded
                                ? null
                                : event.id
                            );
                          }}
                        >
                          <div className="black-box-record-time">
                            <strong>
                              {formatEventTime(
                                event.created_at
                              )}
                            </strong>

                            <span>
                              {formatEventDate(
                                event.created_at
                              )}
                            </span>
                          </div>

                          <div className="black-box-record-signal">
                            <i />
                          </div>

                          <div className="black-box-record-copy">
                            <div className="black-box-record-meta">
                              <strong>
                                {String(
                                  event.crew_name ||
                                    'UNKNOWN'
                                ).toUpperCase()}
                              </strong>

                              <span>
                                {String(
                                  event.category ||
                                    'SYSTEM'
                                ).toUpperCase()}
                              </span>
                            </div>

                            <h3>
                              {getActionLabel(
                                event.action
                              )}
                            </h3>

                            <p>
                              {getEventDescription(
                                event
                              )}
                            </p>
                          </div>

                          <div className="black-box-record-toggle">
                            {expanded ? (
                              <ChevronUp
                                size={19}
                              />
                            ) : (
                              <ChevronDown
                                size={19}
                              />
                            )}
                          </div>
                        </button>

                        {expanded && (
                          <div className="black-box-record-details">
                            <div className="black-box-detail-grid">
                              <div>
                                <span>
                                  EVENT ID
                                </span>

                                <strong>
                                  {event.id}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  USER ID
                                </span>

                                <strong>
                                  {event.user_id ||
                                    'N/A'}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  RESOURCE TYPE
                                </span>

                                <strong>
                                  {event.resource_type ||
                                    'N/A'}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  RESOURCE ID
                                </span>

                                <strong>
                                  {event.resource_id ||
                                    'N/A'}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  CREW EMAIL
                                </span>

                                <strong>
                                  {event.crew_email ||
                                    'N/A'}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  RECORDED AT
                                </span>

                                <strong>
                                  {event.created_at ||
                                    'N/A'}
                                </strong>
                              </div>
                            </div>

                            <div className="black-box-json-panel">
                              <div className="black-box-json-heading">
                                RAW EVENT DATA
                              </div>

                              <pre>
                                {JSON.stringify(
                                  event.details || {},
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            )}
        </section>
      </main>
    </div>
  );
}