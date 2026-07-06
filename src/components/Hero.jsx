import HeroDashboard from './HeroDashboard.jsx';
import { useEffect, useState } from 'react';

function CountUp({ end }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame;
    const duration = 900;
    const startTime = performance.now();

    const animate = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(Math.round(end * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [end]);

  return <>{value}</>;
}

export default function Hero({
  imageCount,
  scrolled,
  featuredPhoto,
  setSelectedIndex,
  weather
}) {
  return (
    <>
      <header className={scrolled ? 'nav navSmall' : 'nav'}>
        <a
  href="/"
  aria-label="CuzBro homepage"
>
  <img
    src={
      import.meta.env.BASE_URL +
      'assets/cuzbro-logo.png'
    }
    className="logo"
    alt="CuzBro logo"
  />
</a>

        <nav className="mainNavMenu">
          <a href="/#home" className="active">Home</a>
          <a href="/#observatory">Observatory</a>

          <div className="navDropdown">
            <button type="button" className="navDropdownTrigger">
              Missions <span>⌄</span>
            </button>
            <div className="navDropdownMenu">
              <a href="/#gallery">Mission Archive</a>
              <a href="/captains-log">Captain&apos;s Log</a>
              <a href="/skymap">Sky Map</a>
            </div>
          </div>

          <div className="navDropdown">
            <button type="button" className="navDropdownTrigger">
              Crew <span>⌄</span>
            </button>
            <div className="navDropdownMenu">
              <a href="/#crew">Crew Dossiers</a>
              <a href="/mission-support">Mission Support</a>
            </div>
          </div>

          <a href="/equipment">Gear</a>
          <a href="/#about">About</a>
        </nav>
      </header>

      <section id="home" className="hero">
        <div className="stars"></div>

        <div className="heroText">
          <p className="eyebrow">MISSION CONTROL</p>

          <h1>
            CUZBRO
            <br />
            <span>OBSERVATORY</span>
          </h1>

          <p className="tagline">
            Exploring the night sky through astrophotography, technology,
            and a relentless curiosity for what&apos;s waiting above us.
          </p>

          <HeroDashboard
            featuredPhoto={featuredPhoto}
            setSelectedIndex={setSelectedIndex}
            weather={weather}
          />
        </div>

        <div className="heroCard">
          <small className="missionLabel">CURRENT MISSION</small>

          <h2>Observatory Online</h2>

          <div className="missionStatus">
            <span className="online"></span>
            Crew Online
          </div>

          <div className="missionStats">
            <div>
              <strong>
                <CountUp end={imageCount} />
              </strong>
              <span>Mission Reports</span>
            </div>

            <div>
              <strong>
                <CountUp end={3} />
              </strong>
              <span>Observing Sites</span>
            </div>

            <div>
              <strong>2026</strong>
              <span>Mission Started</span>
            </div>
          </div>

          <div className="missionTarget">
            <small>Current Objective</small>

            <h3>Explore the Cosmos</h3>

            <p>
              Document the night sky through astrophotography, build better
              observing tools, and inspire curiosity one clear night at a time.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
