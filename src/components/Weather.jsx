import { Moon } from 'lucide-react';

function scoreWeather(w) {
  if (!w) return ['Loading', '--'];

  const clouds = w.cloud_cover ?? 0;
  const wind = w.wind_speed_10m ?? 0;

  if (clouds < 20 && wind < 12) return ['Excellent', 'Best tonight'];
  if (clouds < 45) return ['Good', 'Good'];
  if (clouds < 70) return ['Fair', 'Fair'];

  return ['Poor', 'Cloudy'];
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
          const [rating, badge] = scoreWeather(w);

          return (
            <article className="weather" key={loc.name}>
              <div className="weatherTop">
                <h3>{loc.name}</h3>
                <b>{badge}</b>
              </div>

              <div className="rating">
                <Moon size={48} />
                <div>
                  <strong>{rating}</strong>
                  <span>{w ? `${Math.round(w.temperature_2m)}°F` : 'Loading...'}</span>
                </div>
              </div>

              <p>Cloud Cover <em>{w ? Math.round(w.cloud_cover) : '--'}%</em></p>
              <p>Humidity <em>{w ? Math.round(w.relative_humidity_2m) : '--'}%</em></p>
              <p>Wind <em>{w ? Math.round(w.wind_speed_10m) : '--'} mph</em></p>

              <div className="chips">
                <span>Deep Sky</span>
                <span>Moon</span>
                <span>Planets</span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}