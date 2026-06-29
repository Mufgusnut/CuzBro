import { Moon, Star } from 'lucide-react';
import {
  Body,
  Observer,
  SearchRiseSet,
  Illumination
} from 'astronomy-engine';

function scoreWeather(w) {
  if (!w) {
    return {
      rating: 'Loading',
      badge: '--',
      stars: 0
    };
  }

  const clouds = w.cloud_cover ?? 0;
  const wind = w.wind_speed_10m ?? 0;
  const humidity = w.relative_humidity_2m ?? 0;

  if (clouds < 20 && wind < 12 && humidity < 85) {
    return { rating: 'Excellent', badge: 'Best tonight', stars: 5 };
  }

  if (clouds < 45 && wind < 16) {
    return { rating: 'Good', badge: 'Good', stars: 4 };
  }

  if (clouds < 70) {
    return { rating: 'Fair', badge: 'Fair', stars: 3 };
  }

  return { rating: 'Poor', badge: 'Cloudy', stars: 1 };
}

function formatTime(date) {
  if (!date) return '—';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getPlanetStatus(body, observer) {
  const now = new Date();

  // Find the next rise and next set, regardless of current visibility.
  const rise = SearchRiseSet(body, observer, +1, now, 2);
  const set = SearchRiseSet(body, observer, -1, now, 2);

  const riseText = rise?.date
    ? formatTime(rise.date)
    : "--";

  const setText = set?.date
    ? formatTime(set.date)
    : "--";

  return `↑ ${riseText}  ↓ ${setText}`;
}

function getSkyTargets(loc) {
  const observer = new Observer(loc.lat, loc.lon, 0);
  const moonIllumination = Illumination(Body.Moon, new Date());
  const moonPercent = Math.round(moonIllumination.phase_fraction * 100);

  return [
    {
      symbol: '☽',
      name: 'Moon',
      status: `${moonPercent}% lit`
    },
    {
      symbol: '♄',
      name: 'Saturn',
      status: getPlanetStatus(Body.Saturn, observer)
    },
    {
      symbol: '♃',
      name: 'Jupiter',
      status: getPlanetStatus(Body.Jupiter, observer)
    },
    {
      symbol: '♂',
      name: 'Mars',
      status: getPlanetStatus(Body.Mars, observer)
    },
    {
      symbol: '♀',
      name: 'Venus',
      status: getPlanetStatus(Body.Venus, observer)
    }
  ];
}

function StarRating({ count }) {
  return (
    <div className="skyStars">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={16}
          fill={star <= count ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

export default function Weather({ locations, weather }) {
  return (
    <>
      <section id="observatory" className="sectionHeader">
        <h2>☼ Observing Conditions</h2>
        <span>Live conditions and sky targets</span>
      </section>

      <div className="weatherGrid">
        {locations.map((loc) => {
          const w = weather[loc.name];
          const score = scoreWeather(w);
          const targets = getSkyTargets(loc);

          return (
            <article className="weather" key={loc.name}>
              <div className="weatherTop">
                <h3>{loc.name}</h3>
                <b>{score.badge}</b>
              </div>

              <div className="rating">
                <Moon size={48} />
                <div>
                  <strong>{score.rating}</strong>
                  <span>{w ? `${Math.round(w.temperature_2m)}°F` : 'Loading...'}</span>
                  <StarRating count={score.stars} />
                </div>
              </div>

              <p>Cloud Cover <em>{w ? Math.round(w.cloud_cover) : '--'}%</em></p>
              <p>Humidity <em>{w ? Math.round(w.relative_humidity_2m) : '--'}%</em></p>
              <p>Wind <em>{w ? Math.round(w.wind_speed_10m) : '--'} mph</em></p>

              <div className="skyTargets">
                <strong>Visible Tonight</strong>

                {targets.map((target) => (
                  <span key={target.name}>
                    <b>{target.symbol} {target.name}</b>
                    <em>{target.status}</em>
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}