import packageInfo from '../../package.json';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  ArrowLeft,
  GitBranch,
  Clock3,
  GitCommitHorizontal,
  Globe2,
  RefreshCw,
  Rocket,
  ShieldCheck
} from 'lucide-react';
import {
  getCrewMember
} from '../lib/crew.js';

const GITHUB_OWNER =
  import.meta.env.VITE_GITHUB_OWNER ||
  'mufgusnut';

const GITHUB_REPO =
  import.meta.env.VITE_GITHUB_REPO ||
  'CuzBro';

const DEPLOYED_SHA =
  import.meta.env.VITE_DEPLOY_SHA || '';

const DEPLOY_BRANCH =
  import.meta.env.VITE_DEPLOY_BRANCH ||
  'main';

const BUILD_TIME =
  import.meta.env.VITE_BUILD_TIME || '';

const APP_VERSION =
  import.meta.env.VITE_APP_VERSION ||
  packageInfo.version ||
  '0.0.0';

const DEPLOY_ENVIRONMENT =
  import.meta.env.VITE_DEPLOY_ENVIRONMENT ||
  (import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT');

function shortSha(value) {
  return value
    ? value.slice(0, 7)
    : 'UNKNOWN';
}

function formatDate(value) {
  if (!value) {
    return 'UNKNOWN';
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return 'UNKNOWN';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short'
    }
  ).format(date);
}

function formatAge(value) {
  if (!value) {
    return 'UNKNOWN';
  }

  const timestamp =
    new Date(value).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return 'UNKNOWN';
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (Date.now() - timestamp) /
          1000
      )
    );

  if (seconds < 60) {
    return 'JUST NOW';
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} MIN AGO`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} HR${
      hours === 1 ? '' : 'S'
    } AGO`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} DAY${
    days === 1 ? '' : 'S'
  } AGO`;
}

async function githubRequest(path) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`,
    {
      headers: {
        Accept:
          'application/vnd.github+json',
        'X-GitHub-Api-Version':
          '2022-11-28'
      }
    }
  );

  const body =
    await response.json();

  if (!response.ok) {
    throw new Error(
      body?.message ||
        `GitHub request failed with status ${response.status}.`
    );
  }

  return body;
}

export default function DeploymentControl({
  session
}) {
  const crew =
    getCrewMember(
      session?.user?.email
    );

  const [status, setStatus] =
    useState('loading');

  const [error, setError] =
    useState('');

  const [commits, setCommits] =
    useState([]);

  const [
    deployedCommit,
    setDeployedCommit
  ] = useState(null);

  const [
    compareData,
    setCompareData
  ] = useState(null);

  const [
    refreshedAt,
    setRefreshedAt
  ] = useState(null);

  async function loadDeploymentData() {
    setStatus('loading');
    setError('');

    try {
      const recentCommits =
        await githubRequest(
          `/commits?sha=${encodeURIComponent(
            DEPLOY_BRANCH
          )}&per_page=10`
        );

      let currentDeployment = null;
      let comparison = null;

      if (DEPLOYED_SHA) {
        [
          currentDeployment,
          comparison
        ] = await Promise.all([
          githubRequest(
            `/commits/${encodeURIComponent(
              DEPLOYED_SHA
            )}`
          ),

          githubRequest(
            `/compare/${encodeURIComponent(
              DEPLOYED_SHA
            )}...${encodeURIComponent(
              DEPLOY_BRANCH
            )}`
          )
        ]);
      }

      setCommits(
        Array.isArray(recentCommits)
          ? recentCommits
          : []
      );

      setDeployedCommit(
        currentDeployment
      );

      setCompareData(comparison);
      setRefreshedAt(new Date());
      setStatus('ready');
    } catch (loadError) {
      console.error(
        'Deployment console load failed:',
        loadError
      );

      setError(
        loadError.message ||
          'Deployment data could not be loaded.'
      );

      setStatus('error');
    }
  }

  useEffect(() => {
    loadDeploymentData();
  }, []);

  const latestCommit =
    commits[0] || null;

  const deploymentState =
    useMemo(() => {
      if (status === 'error') {
        return {
          tone: 'different',
          eyebrow: 'SYSTEM STATUS',
          label: 'DEGRADED',
          detail:
            'The site is online, but repository telemetry could not be verified.'
        };
      }

      if (!DEPLOYED_SHA) {
        return {
          tone: 'unknown',
          eyebrow: 'SYSTEM STATUS',
          label: 'ONLINE',
          detail:
            'The live site is operational. Build identity is unavailable until deployment metadata is stamped into the Vite build.'
        };
      }

      if (!latestCommit) {
        return {
          tone: 'unknown',
          eyebrow: 'SYSTEM STATUS',
          label: 'ONLINE',
          detail:
            'The live site is operational. Repository HEAD is temporarily unavailable.'
        };
      }

      if (latestCommit.sha === DEPLOYED_SHA) {
        return {
          tone: 'current',
          eyebrow: 'SYSTEM STATUS',
          label: 'ONLINE',
          detail:
            'Production is healthy and the live build matches repository HEAD.'
        };
      }

      const aheadBy = Number(compareData?.ahead_by || 0);

      if (aheadBy > 0) {
        return {
          tone: 'behind',
          eyebrow: 'SYSTEM STATUS',
          label: 'UPDATE AVAILABLE',
          detail: `Production is healthy. Repository HEAD is ${aheadBy} ${
            aheadBy === 1 ? 'commit' : 'commits'
          } ahead of the live deployment.`
        };
      }

      return {
        tone: 'different',
        eyebrow: 'SYSTEM STATUS',
        label: 'VERIFY BUILD',
        detail:
          'The live deployment is operational, but its Git history differs from repository HEAD.'
      };
    }, [compareData, latestCommit, status]);

  const deploymentHost =
    typeof window !== 'undefined'
      ? window.location.host
      : 'cuzbro.net';

  return (
    <div className="admin-page deployment-page">
      <header className="admin-header">
        <div className="admin-brand">
          <a
            href="/"
            aria-label="CuzBro homepage"
          >
            <img
              src={
                import.meta.env
                  .BASE_URL +
                'assets/cuzbro-logo.png'
              }
              alt="CuzBro logo"
            />
          </a>

          <div>
            <span>
              SECURE CREW TERMINAL
            </span>

            <h1>
              Deployment Control
            </h1>
          </div>
        </div>

        <div className="admin-user">
          <span>
            CREW AUTHENTICATED
          </span>

          <strong>
            {crew.callSign}
          </strong>

          <small>
            {crew.role}
          </small>
        </div>
      </header>

      <main className="admin-main deployment-main">
        <section className="deployment-command">
          <div>
            <span className="admin-eyebrow">
              RELEASE CONTROL
            </span>

            <h2>
              Deployment
              <br />
              Console
            </h2>

            <p>
              Live build identity,
              repository state, and
              recent CuzBro commits.
            </p>
          </div>

          <div className="deployment-command-actions">
            <button
              type="button"
              onClick={loadDeploymentData}
              disabled={
                status === 'loading'
              }
            >
              <RefreshCw
                size={17}
                className={
                  status === 'loading'
                    ? 'deployment-spin'
                    : ''
                }
              />

              REFRESH
            </button>

            <a href="/admin">
              <ArrowLeft size={17} />

              ADMIN CONTROL
            </a>
          </div>
        </section>

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        <section className="deployment-overview">
          <article className="deployment-primary-card">
            <div className="deployment-card-heading">
              <div className="deployment-card-icon">
                <Rocket size={25} />
              </div>

              <div>
                <span>
                  CURRENT DEPLOYMENT
                </span>

                <h3>
                  v{APP_VERSION}
                </h3>
              </div>
            </div>

            <div className="deployment-sha-block">
              <span>
                DEPLOYED GIT SHA
              </span>

              <strong>
                {DEPLOYED_SHA ||
                  'NOT STAMPED'}
              </strong>

              <small>
                {shortSha(
                  DEPLOYED_SHA
                )}
              </small>
            </div>

            <div className="deployment-facts">
              <div>
                <span>BRANCH</span>

                <strong>
                  <GitBranch size={15} />

                  {DEPLOY_BRANCH}
                </strong>
              </div>

              <div>
                <span>BUILT</span>

                <strong>
                  {formatDate(
                    BUILD_TIME
                  )}
                </strong>
              </div>

              <div>
                <span>
                  DEPLOYED COMMIT
                </span>

                <strong>
                  {deployedCommit
                    ?.commit?.message
                    ?.split('\n')[0] ||
                    'UNKNOWN'}
                </strong>
              </div>
            </div>
          </article>

          <article
            className={`deployment-state-card deployment-state-${deploymentState.tone}`}
          >
            <div className="deployment-state-topline">
              <div className="deployment-state-icon">
                <ShieldCheck size={28} />
              </div>

              <span className={`deployment-health-dot deployment-health-${deploymentState.tone}`} />
            </div>

            <span>
              {deploymentState.eyebrow}
            </span>

            <strong>
              {status === 'loading'
                ? 'CHECKING'
                : deploymentState.label}
            </strong>

            <p>
              {status === 'loading'
                ? 'Comparing the live build with repository HEAD.'
                : deploymentState.detail}
            </p>

            <div className="deployment-status-grid">
              <div>
                <span>BUILD</span>
                <strong>{DEPLOYED_SHA ? shortSha(DEPLOYED_SHA) : 'UNSTAMPED'}</strong>
              </div>

              <div>
                <span>BRANCH</span>
                <strong>{DEPLOY_BRANCH}</strong>
              </div>

              <div>
                <span>ENVIRONMENT</span>
                <strong>{DEPLOY_ENVIRONMENT}</strong>
              </div>

              <div>
                <span>AGE</span>
                <strong>{BUILD_TIME ? formatAge(BUILD_TIME) : 'UNKNOWN'}</strong>
              </div>

              <div>
                <span>HOST</span>
                <strong><Globe2 size={14} />{deploymentHost}</strong>
              </div>

              <div>
                <span>REPOSITORY HEAD</span>
                <strong>{shortSha(latestCommit?.sha)}</strong>
              </div>
            </div>

            <small>
              <Clock3 size={13} />
              LAST CHECK{' '}
              {refreshedAt
                ? formatAge(refreshedAt)
                : 'PENDING'}
            </small>
          </article>
        </section>

        <section className="deployment-commits-panel">
          <div className="deployment-section-heading">
            <div>
              <span className="admin-card-eyebrow">
                REPOSITORY TELEMETRY
              </span>

              <h3>
                Recent Commits
              </h3>
            </div>

            <div className="deployment-repo-label">
              {GITHUB_OWNER}/
              {GITHUB_REPO}
            </div>
          </div>

          {status === 'loading' &&
          commits.length === 0 ? (
            <div className="deployment-empty">
              LOADING COMMIT HISTORY...
            </div>
          ) : (
            <div className="deployment-commit-list">
              {commits.map(
                (commit, index) => {
                  const isDeployed =
                    Boolean(
                      DEPLOYED_SHA &&
                      commit.sha ===
                        DEPLOYED_SHA
                    );

                  return (
                    <article
                      className={`deployment-commit-row${
                        isDeployed
                          ? ' deployment-commit-row-live'
                          : ''
                      }`}
                      key={commit.sha}
                    >
                      <div className="deployment-commit-index">
                        <GitCommitHorizontal
                          size={18}
                        />
                      </div>

                      <div className="deployment-commit-copy">
                        <strong>
                          {commit.commit
                            ?.message
                            ?.split('\n')[0] ||
                            'Untitled commit'}
                        </strong>

                        <span>
                          {commit.commit
                            ?.author?.name ||
                            commit.author
                              ?.login ||
                            'Unknown author'}
                          {' · '}
                          {formatAge(
                            commit.commit
                              ?.author?.date
                          )}
                        </span>
                      </div>

                      <code>
                        {shortSha(
                          commit.sha
                        )}
                      </code>

                      <div className="deployment-commit-state">
                        {isDeployed ? (
                          <span>
                            LIVE
                          </span>
                        ) : index === 0 ? (
                          <strong>
                            HEAD
                          </strong>
                        ) : null}
                      </div>
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
