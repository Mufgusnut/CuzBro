import {
  Check,
  MapPin,
  RadioTower
} from 'lucide-react';
import {
  OBSERVING_SITES
} from '../lib/observingSites.js';

export default function ObservingSiteControl({
  currentSite,
  status,
  error,
  saving,
  onSelect
}) {
  return (
    <section className="admin-observing-site-control">
      <div className="admin-observing-site-heading">
        <div className="admin-observing-site-icon">
          <RadioTower size={22} />
        </div>

        <div>
          <span className="admin-card-eyebrow">
            GLOBAL OBSERVATORY STATE
          </span>
          <h3>Current Observing Site</h3>
          <p>
            Weather, homepage telemetry, and the Celestial Atlas use this site.
          </p>
        </div>
      </div>

      <div
        className="admin-observing-site-options"
        role="group"
        aria-label="Current observing site"
      >
        {OBSERVING_SITES.map((site) => {
          const isActive =
            currentSite?.key === site.key;

          return (
            <button
              key={site.key}
              type="button"
              className={
                isActive
                  ? 'admin-observing-site-option active'
                  : 'admin-observing-site-option'
              }
              onClick={() => onSelect(site.key)}
              disabled={saving || status === 'loading'}
              aria-pressed={isActive}
            >
              <MapPin size={18} />

              <span>
                <strong>{site.shortName}</strong>
                <small>{site.crew} site</small>
              </span>

              {isActive ? (
                <Check size={17} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="admin-observing-site-current">
        <span>
          {status === 'loading'
            ? 'Synchronizing current site…'
            : saving
              ? 'Updating observatory site…'
              : `CURRENT SITE · ${currentSite.fullName.toUpperCase()}`}
        </span>

        {error ? <em>{error}</em> : null}
      </div>
    </section>
  );
}
