import { Moon, Star } from 'lucide-react';

function scoreWeather(w) {
  if (!w) {
    return {
      rating: 'Loading',
      badge: '--',
      stars: 0,
      deepSky: 'Checking',
      moon: 'Checking',
      planets: 'Checking'
    };
  }

  const clouds = w.cloud_cover ?? 0;
  const wind = w.wind_speed_10m ?? 0;
  const humidity = w.relative_humidity_2m ?? 0;

  let stars = 1;
  let rating = 'Poor';
  let badge = 'Cloudy';

  if (clouds < 20 && wind < 12 && humidity < 85) {
    stars = 5;
    rating = 'Excellent';
    badge = 'Best tonight';
  } else if (clouds < 45 && wind < 16) {
    stars = 4;
    rating = 'Good';
    badge = 'Good';
  } else if (clouds < 70) {
    stars = 3;
    rating = 'Fair';
    badge = 'Fair';
  }

  return {
    rating,
    badge,
    stars,
    deepSky: clouds < 35 ? 'Good' : 'Limited',
    moon: clouds < 60 ? 'Good' : 'Poor',
    planets: wind < 16 ? 'Good' : 'Shaky'
  };
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
        <span>Live conditions for key CuzBro locations</span>
      </section>

      <div className="weatherGrid">
        {locations.map((loc) => {
          const w = weather[loc.name];
          const score = scoreWeather(w);

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

              <div className="chips">
                <span>Deep Sky: {score.deepSky}</span>
                <span>Moon: {score.moon}</span>
                <span>Planets: {score.planets}</span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}