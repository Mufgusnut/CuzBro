import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  Globe2,
  HardDrive,
  KeyRound,
  Radio,
  RefreshCw,
  Server
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  logCrewActivity
} from '../lib/audit.js';
import {
  getCrewMember
} from '../lib/crew.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

const CHECK_DEFINITIONS = [
  {
    id: 'public-site',
    name: 'PUBLIC OBSERVATORY',
    description: 'CuzBro web application response',
    icon: Globe2
  },
  {
    id: 'database',
    name: 'SUPABASE DATABASE',
    description: 'Mission database query',
    icon: Database
  },
  {
    id: 'authentication',
    name: 'AUTHENTICATION',
    description: 'Authenticated crew identity',
    icon: KeyRound
  },
  {
    id: 'r2',
    name: 'CLOUDFLARE R2',
    description: 'Private transfer inventory structure',
    icon: HardDrive
  },
  {
    id: 'transfer-api',
    name: 'CREW TRANSFER API',
    description: 'Authenticated Worker response',
    icon: Server
  },
  {
    id: 'black-box',
    name: 'BLACK BOX',
    description: 'Flight recorder read access',
    icon: Radio
  }
];

function formatCheckTime(dateValue) {
  if (!dateValue) {
    return 'NOT CHECKED';
  }

  return new Date(dateValue).toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

function getStatusLabel(status) {
  if (status === 'operational') {
    return 'OPERATIONAL';
  }

  if (status === 'degraded') {
    return 'DEGRADED';
  }

  return 'OFFLINE';
}

async function measuredCheck(checkFunction) {
  const startedAt = performance.now();

  try {
    const detail =
      await checkFunction();

    return {
      status: 'operational',
      detail,
      latency: Math.round(
        performance.now() -
          startedAt
      )
    };
  } catch (error) {
    return {
      status: 'offline',
      detail:
        error?.message ||
        'Health check failed.',
      latency: Math.round(
        performance.now() -
          startedAt
      )
    };
  }
}

export default function SystemStatus({
  session
}) {
  const [checks, setChecks] =
    useState([]);

  const [status, setStatus] =
    useState('idle');

  const [lastCheckedAt, setLastCheckedAt] =
    useState(null);

  const [totalDuration, setTotalDuration] =
    useState(null);

  const [chappyMode, setChappyMode] =
    useState(false);

  async function runSystemCheck() {
    if (
      !session?.access_token ||
      !session?.user?.id
    ) {
      setStatus('error');

      return;
    }

    setStatus('checking');

    const systemStartedAt =
      performance.now();

    const accessToken =
      session.access_token;

    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL;

    const supabasePublishableKey =
      import.meta.env
        .VITE_SUPABASE_PUBLISHABLE_KEY;

    const authHeaders = {
      apikey:
        supabasePublishableKey,

      Authorization:
        `Bearer ${accessToken}`
    };

    const resultEntries =
      await Promise.all([
        measuredCheck(async () => {
          const response = await fetch(
            '/',
            {
              method: 'GET',
              cache: 'no-store'
            }
          );

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}`
            );
          }

          return `HTTP ${response.status} · web application responding`;
        }),

        measuredCheck(async () => {
          const {
            count,
            error
          } = await supabase
            .from('gallery')
            .select('id', {
              count: 'exact',
              head: true
            });

          if (error) {
            throw error;
          }

          return `${Number(
            count || 0
          )} capture records reachable`;
        }),

        measuredCheck(async () => {
          const {
            data,
            error
          } =
            await supabase.auth.getUser();

          if (error) {
            throw error;
          }

          if (!data?.user?.id) {
            throw new Error(
              'No authenticated crew identity.'
            );
          }

          const crew =
            getCrewMember(
              data.user.email
            );

          return `${crew.callSign} · ${crew.role.toUpperCase()} VERIFIED`;
        }),

        measuredCheck(async () => {
          const response = await fetch(
            `${GALLERY_API}/transfer/list`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              }
            }
          );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                `HTTP ${response.status}`
            );
          }

          if (
            !Array.isArray(result.files)
          ) {
            throw new Error(
              'Transfer inventory did not return an R2 file array.'
            );
          }

          return `${result.files.length} private objects indexed`;
        }),

        measuredCheck(async () => {
          const response = await fetch(
            `${GALLERY_API}/transfer/list`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              }
            }
          );

          let result = {};

          try {
            result =
              await response.json();
          } catch {
            throw new Error(
              'Worker returned invalid JSON.'
            );
          }

          if (!response.ok) {
            throw new Error(
              result.error ||
                `HTTP ${response.status}`
            );
          }

          return `HTTP ${response.status} · authenticated Worker response`;
        }),

        measuredCheck(async () => {
          if (
            !supabaseUrl ||
            !supabasePublishableKey
          ) {
            throw new Error(
              'Supabase environment configuration unavailable.'
            );
          }

          const response = await fetch(
            `${supabaseUrl}/rest/v1/crew_activity?select=id&limit=1`,
            {
              headers: authHeaders
            }
          );

          if (!response.ok) {
            const responseText =
              await response.text();

            throw new Error(
              responseText ||
                `HTTP ${response.status}`
            );
          }

          return 'Flight recorder read access verified';
        })
      ]);

    const completedChecks =
      CHECK_DEFINITIONS.map(
        (definition, index) => ({
          ...definition,
          ...resultEntries[index]
        })
      );

    const duration = Math.round(
      performance.now() -
        systemStartedAt
    );

    const checkedAt =
      new Date().toISOString();

    setChecks(completedChecks);
    setTotalDuration(duration);
    setLastCheckedAt(checkedAt);
    setStatus('ready');

    const operationalCount =
      completedChecks.filter(
        (check) =>
          check.status ===
          'operational'
      ).length;

    const failedChecks =
      completedChecks
        .filter(
          (check) =>
            check.status !==
            'operational'
        )
        .map((check) => ({
          service: check.name,
          status: check.status,
          detail: check.detail
        }));

    const auditResult =
      await logCrewActivity({
        action: 'SYSTEM_CHECK',
        category: 'SYSTEM',
        resourceType: 'system_status',

        resourceName:
          operationalCount ===
          completedChecks.length
            ? 'ALL SYSTEMS NOMINAL'
            : 'SYSTEM CHECK ALERT',

        details: {
          operationalCount,

          totalServices:
            completedChecks.length,

          durationMs: duration,

          failedChecks
        }
      });

    if (!auditResult.success) {
      console.error(
        'System check completed, but Black Box logging failed:',
        auditResult.error
      );
    }
  }

  useEffect(() => {
    runSystemCheck();
  }, [
    session?.access_token
  ]);

  useEffect(() => {
    function handleChappyMode(event) {
      setChappyMode(
        Boolean(event?.detail?.active)
      );
    }

    window.addEventListener(
      'cuzbro:chappy-mode',
      handleChappyMode
    );

    return () => {
      window.removeEventListener(
        'cuzbro:chappy-mode',
        handleChappyMode
      );
    };
  }, []);


  const operationalCount =
    checks.filter(
      (check) =>
        check.status ===
        'operational'
    ).length;

  const overallStatus =
    checks.length === 0
      ? 'checking'
      : operationalCount ===
          checks.length
        ? 'operational'
        : operationalCount === 0
          ? 'offline'
          : 'degraded';

  const overallLabel =
    overallStatus === 'operational'
      ? 'ALL SYSTEMS NOMINAL'
      : overallStatus === 'degraded'
        ? 'SYSTEMS DEGRADED'
        : overallStatus === 'offline'
          ? 'SYSTEMS OFFLINE'
          : 'RUNNING DIAGNOSTICS';

  const failedCount =
    checks.length -
    operationalCount;

  const summaryText =
    checks.length === 0
      ? 'INITIALIZING SERVICE CHECKS'
      : `${operationalCount} / ${checks.length} SERVICES OPERATIONAL`;

  const sortedChecks =
    useMemo(
      () => checks,
      [checks]
    );

  return (
    <div className="admin-page system-status-page">
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

            <h1>System Status</h1>
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
        <section className="system-status-command">
          <div>
            <span className="admin-eyebrow">
              CUZBRO SYSTEM COMMAND
            </span>

            <h2>
              Infrastructure
              <br />
              Health Console
            </h2>

            <p>
              Live authenticated diagnostics for
              CuzBro observatory infrastructure
              and internal services.
            </p>
          </div>

          <button
            type="button"
            className="system-status-run"
            onClick={runSystemCheck}
            disabled={
              status === 'checking'
            }
          >
            <RefreshCw
              size={18}
              className={
                status === 'checking'
                  ? 'system-status-spin'
                  : ''
              }
            />

            {status === 'checking'
              ? 'RUNNING DIAGNOSTICS'
              : 'RUN SYSTEM CHECK'}
          </button>
        </section>

        <section
          className={`system-status-overview system-status-overview-${overallStatus}`}
        >
          <div className="system-status-overview-main">
            <div className="system-status-overview-icon">
              {overallStatus ===
              'operational' ? (
                <CheckCircle2 size={34} />
              ) : (
                <Activity size={34} />
              )}
            </div>

            <div>
              <span>
                OVERALL STATUS
              </span>

              <h3>
                {chappyMode
                  ? 'CHAPPY MODE DETECTED'
                  : overallLabel}
              </h3>

              <p>
                {chappyMode
                  ? 'ALL SERVICES ARE RUNNING LATE'
                  : summaryText}
              </p>
            </div>
          </div>

          <div className="system-status-overview-stats">
            <div>
              <Clock3 size={18} />

              <span>
                LAST CHECK
              </span>

              <strong>
                {formatCheckTime(
                  lastCheckedAt
                )}
              </strong>
            </div>

            <div>
              <Activity size={18} />

              <span>
                CHECK DURATION
              </span>

              <strong>
                {totalDuration === null
                  ? '—'
                  : `${totalDuration} MS`}
              </strong>
            </div>

            <div>
              <Server size={18} />

              <span>
                ALERTS
              </span>

              <strong>
                {checks.length
                  ? failedCount
                  : '—'}
              </strong>
            </div>
          </div>
        </section>

        <section className="system-status-grid">
          {status === 'checking' &&
            checks.length === 0 &&
            CHECK_DEFINITIONS.map(
              (check) => {
                const Icon =
                  check.icon;

                return (
                  <article
                    className="system-status-service system-status-service-checking"
                    key={check.id}
                  >
                    <div className="system-status-service-head">
                      <div className="system-status-service-icon">
                        <Icon size={22} />
                      </div>

                      <i />
                    </div>

                    <span>
                      {check.description}
                    </span>

                    <h3>
                      {check.name}
                    </h3>

                    <strong>
                      {chappyMode
                        ? 'RUNNING LATE'
                        : 'CHECKING'}
                    </strong>

                    <p>
                      Establishing service
                      link...
                    </p>

                    <small>
                      — MS
                    </small>
                  </article>
                );
              }
            )}

          {sortedChecks.map(
            (check) => {
              const Icon =
                check.icon;

              return (
                <article
                  className={`system-status-service system-status-service-${check.status}`}
                  key={check.id}
                >
                  <div className="system-status-service-head">
                    <div className="system-status-service-icon">
                      <Icon size={22} />
                    </div>

                    <i />
                  </div>

                  <span>
                    {check.description}
                  </span>

                  <h3>
                    {check.name}
                  </h3>

                  <strong>
                    {chappyMode
                      ? 'RUNNING LATE'
                      : getStatusLabel(
                          check.status
                        )}
                  </strong>

                  <p>
                    {check.detail}
                  </p>

                  <small>
                    {check.latency} MS
                  </small>
                </article>
              );
            }
          )}
        </section>

        <section className="system-status-footer">
          <div>
            <Radio size={18} />

            <span>
              AUTHENTICATED SYSTEM CHECK
            </span>
          </div>

          <p>
            Every completed diagnostic is written
            to the CuzBro Black Box flight data
            recorder.
          </p>
        </section>
      </main>
    </div>
  );
}