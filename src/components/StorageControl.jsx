import {
  ArrowLeft,
  Database,
  FileArchive,
  FileImage,
  Files,
  HardDrive,
  RefreshCw,
  Trophy,
  UserRound
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  getCrewName
} from '../lib/crew.js';
import {
  logCrewActivity
} from '../lib/audit.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

function formatBytes(bytes) {
  const size =
    Number(bytes || 0);

  if (size >= 1024 ** 4) {
    return `${(
      size / 1024 ** 4
    ).toFixed(2)} TB`;
  }

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

function formatDate(dateValue) {
  if (!dateValue) {
    return 'UNKNOWN';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'UNKNOWN';
  }

  return date.toLocaleString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }
  );
}

function getCategoryIcon(category) {
  if (category === 'CAPTURES') {
    return FileImage;
  }

  if (category === 'MASTERS') {
    return FileArchive;
  }

  if (
    category === 'CREW TRANSFER'
  ) {
    return Files;
  }

  return Database;
}

export default function StorageControl({
  session
}) {
  const [summary, setSummary] =
    useState(null);

  const [status, setStatus] =
    useState('loading');

  const [error, setError] =
    useState('');

  const [lastDuration, setLastDuration] =
    useState(null);

  async function loadStorageSummary({
    logRefresh = false
  } = {}) {
    const accessToken =
      session?.access_token;

    if (!accessToken) {
      setStatus('error');

      setError(
        'Authenticated crew session unavailable.'
      );

      return;
    }

    setStatus('loading');
    setError('');

    const startedAt =
      performance.now();

    try {
      const response = await fetch(
        `${GALLERY_API}/storage/summary`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

      const responseText =
        await response.text();

      let result = {};

      if (responseText) {
        try {
          result =
            JSON.parse(responseText);
        } catch {
          throw new Error(
            'Storage API returned invalid JSON.'
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Storage API returned HTTP ${response.status}.`
        );
      }

      const duration =
        Math.round(
          performance.now() -
            startedAt
        );

      setSummary(result);
      setLastDuration(duration);
      setStatus('ready');

      if (logRefresh) {
        const auditResult =
          await logCrewActivity({
            action:
              'STORAGE_INVENTORY_CHECK',

            category: 'SYSTEM',

            resourceType:
              'r2_storage',

            resourceName:
              'R2 STORAGE INVENTORY',

            details: {
              totalBytes:
                Number(
                  result.totalBytes || 0
                ),

              objectCount:
                Number(
                  result.objectCount || 0
                ),

              durationMs:
                duration
            }
          });

        if (!auditResult.success) {
          console.error(
            'Storage inventory loaded, but Black Box logging failed:',
            auditResult.error
          );
        }
      }
    } catch (loadError) {
      console.error(
        'Storage Control failed:',
        loadError
      );

      setError(
        loadError.message ||
          'Storage inventory could not be loaded.'
      );

      setStatus('error');
    }
  }

  useEffect(() => {
    loadStorageSummary();
  }, [
    session?.access_token
  ]);

  const largestObject =
    summary?.largestObjects?.[0] ||
    null;

  const transferBytes =
    useMemo(() => {
      const category =
        summary?.categories?.find(
          (item) =>
            item.name ===
            'CREW TRANSFER'
        );

      return Number(
        category?.totalBytes || 0
      );
    }, [summary]);

  return (
    <div className="admin-page storage-control-page">
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

            <h1>Storage Control</h1>
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
        <section className="storage-control-command">
          <div>
            <span className="admin-eyebrow">
              R2 STORAGE COMMAND
            </span>

            <h2>
              Object Storage
              <br />
              Command Center
            </h2>

            <p>
              Authenticated inventory and capacity
              analysis for the CuzBro R2 bucket.
            </p>
          </div>

          <button
            type="button"
            className="storage-control-refresh"
            onClick={() => {
              loadStorageSummary({
                logRefresh: true
              });
            }}
            disabled={
              status === 'loading'
            }
          >
            <RefreshCw
              size={18}
              className={
                status === 'loading'
                  ? 'storage-control-spin'
                  : ''
              }
            />

            {status === 'loading'
              ? 'SCANNING BUCKET'
              : 'REFRESH INVENTORY'}
          </button>
        </section>

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        <section className="storage-control-overview">
          <div className="storage-control-total">
            <div className="storage-control-total-icon">
              <HardDrive size={34} />
            </div>

            <div>
              <span>
                TOTAL R2 STORAGE
              </span>

              <h3>
                {summary
                  ? formatBytes(
                      summary.totalBytes
                    )
                  : '—'}
              </h3>

              <p>
                {summary
                  ? `${summary.objectCount} OBJECTS INDEXED`
                  : 'SCANNING STORAGE INVENTORY'}
              </p>
            </div>
          </div>

          <div className="storage-control-overview-stats">
            <div>
              <Files size={18} />

              <span>
                CREW TRANSFER
              </span>

              <strong>
                {summary
                  ? formatBytes(
                      transferBytes
                    )
                  : '—'}
              </strong>
            </div>

            <div>
              <Trophy size={18} />

              <span>
                LARGEST OBJECT
              </span>

              <strong>
                {largestObject
                  ? formatBytes(
                      largestObject.size
                    )
                  : '—'}
              </strong>
            </div>

            <div>
              <RefreshCw size={18} />

              <span>
                SCAN DURATION
              </span>

              <strong>
                {lastDuration === null
                  ? '—'
                  : `${lastDuration} MS`}
              </strong>
            </div>
          </div>
        </section>

        <section className="storage-control-section">
          <div className="storage-control-section-heading">
            <div>
              <span className="admin-card-eyebrow">
                STORAGE ALLOCATION
              </span>

              <h2>
                Storage by Mission System
              </h2>
            </div>
          </div>

          <div className="storage-control-category-grid">
            {(summary?.categories || []).map(
              (category) => {
                const Icon =
                  getCategoryIcon(
                    category.name
                  );

                const percentage =
                  summary.totalBytes > 0
                    ? (
                        category.totalBytes /
                        summary.totalBytes
                      ) * 100
                    : 0;

                return (
                  <article
                    className="storage-control-category"
                    key={category.name}
                  >
                    <div className="storage-control-category-icon">
                      <Icon size={22} />
                    </div>

                    <span>
                      {category.name}
                    </span>

                    <strong>
                      {formatBytes(
                        category.totalBytes
                      )}
                    </strong>

                    <p>
                      {category.objectCount}{' '}
                      {category.objectCount === 1
                        ? 'OBJECT'
                        : 'OBJECTS'}
                    </p>

                    <div className="storage-control-meter">
                      <i
                        style={{
                          width:
                            `${Math.max(
                              percentage,
                              percentage > 0
                                ? 1
                                : 0
                            )}%`
                        }}
                      />
                    </div>

                    <small>
                      {percentage.toFixed(1)}%
                      OF BUCKET
                    </small>
                  </article>
                );
              }
            )}
          </div>
        </section>

        <section className="storage-control-columns">
          <div className="storage-control-section storage-control-table-panel">
            <div className="storage-control-section-heading">
              <div>
                <span className="admin-card-eyebrow">
                  OBJECT ANALYSIS
                </span>

                <h2>Largest Objects</h2>
              </div>
            </div>

            <div className="storage-control-object-list">
              {(summary?.largestObjects || []).map(
                (object, index) => (
                  <article
                    className="storage-control-object"
                    key={object.key}
                  >
                    <span className="storage-control-object-rank">
                      {String(
                        index + 1
                      ).padStart(2, '0')}
                    </span>

                    <div className="storage-control-object-copy">
                      <strong>
                        {object.fileName}
                      </strong>

                      <span>
                        {object.category}
                        {' · '}
                        {getCrewName(
                          object.uploadedBy
                        )}
                        {' · '}
                        {formatDate(
                          object.uploaded
                        )}
                      </span>
                    </div>

                    <strong className="storage-control-object-size">
                      {formatBytes(
                        object.size
                      )}
                    </strong>
                  </article>
                )
              )}
            </div>
          </div>

          <div className="storage-control-stack">
            <section className="storage-control-section storage-control-mini-panel">
              <div className="storage-control-section-heading">
                <div>
                  <span className="admin-card-eyebrow">
                    FILE TYPES
                  </span>

                  <h2>
                    Storage by Extension
                  </h2>
                </div>
              </div>

              <div className="storage-control-breakdown-list">
                {(summary?.extensions || []).map(
                  (item) => (
                    <div
                      key={
                        item.extension
                      }
                    >
                      <span>
                        .{item.extension}
                      </span>

                      <strong>
                        {formatBytes(
                          item.totalBytes
                        )}
                      </strong>

                      <small>
                        {item.objectCount}
                      </small>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="storage-control-section storage-control-mini-panel">
              <div className="storage-control-section-heading">
                <div>
                  <span className="admin-card-eyebrow">
                    CREW STORAGE
                  </span>

                  <h2>
                    Objects by Uploader
                  </h2>
                </div>
              </div>

              <div className="storage-control-breakdown-list">
                {(summary?.uploaders || []).map(
                  (item) => (
                    <div
                      key={
                        item.uploadedBy
                      }
                    >
                      <span>
                        <UserRound size={14} />

                        {getCrewName(
                          item.uploadedBy
                        )}
                      </span>

                      <strong>
                        {formatBytes(
                          item.totalBytes
                        )}
                      </strong>

                      <small>
                        {item.objectCount}
                      </small>
                    </div>
                  )
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="storage-control-footer">
          <HardDrive size={18} />

          <div>
            <strong>
              PRIVATE R2 INVENTORY
            </strong>

            <span>
              Generated{' '}
              {formatDate(
                summary?.generatedAt
              )}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}