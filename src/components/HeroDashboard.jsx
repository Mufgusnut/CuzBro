import { Camera, Telescope, Star } from "lucide-react";

function scoreWeather(weather) {
  if (!weather) {
    return {
      rating: "Loading...",
      stars: 0,
      clouds: "--",
      wind: "--"
    };
  }

  const clouds = Math.round(weather.cloud_cover ?? 0);
  const wind = Math.round(weather.wind_speed_10m ?? 0);
  const humidity = Math.round(weather.relative_humidity_2m ?? 0);

  let stars = 1;
  let rating = "Poor";

  if (clouds < 20 && wind < 12 && humidity < 85) {
    stars = 5;
    rating = "Excellent";
  } else if (clouds < 45 && wind < 16) {
    stars = 4;
    rating = "Good";
  } else if (clouds < 70) {
    stars = 3;
    rating = "Fair";
  }

  return {
    rating,
    stars,
    clouds,
    wind
  };
}

export default function HeroDashboard({
  featuredPhoto,
  setSelectedIndex,
  weather
}) {
  const score = scoreWeather(weather);

  return (
    <div className="heroDashboard">

      {/* Observatory Card */}
      <a
        href="#observatory"
        className={`heroDashCard condition-${score.rating.toLowerCase()}`}
      >
        <Telescope size={26} />

        <small>OBSERVATORY</small>

        <h3>{score.rating}</h3>

        <div className="heroStars">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={16}
              fill={i < score.stars ? "currentColor" : "none"}
            />
          ))}
        </div>

        <p>
          ☁ {score.clouds}% Clouds
          <br />
          🌬 {score.wind} mph Wind
        </p>

        <div className="heroLocation">
          <small>CURRENT SITE</small>
          <strong>📍 Eliot, ME</strong>
        </div>
      </a>

      {/* Featured Mission Card */}
      <button
        className="heroDashCard"
        onClick={() => setSelectedIndex(0)}
        type="button"
      >
        <Camera size={26} />

        <small>LATEST MISSION</small>

        <h3>{featuredPhoto?.title}</h3>

        <p>{featuredPhoto?.subtitle}</p>

        <span>Open Mission Report →</span>
      </button>

    </div>
  );
}