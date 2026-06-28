import { useEffect, useState } from 'react';
import { Camera, Star } from 'lucide-react';

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

export default function Hero({ imageCount, scrolled }) {
  return (
    <>
      <header className={scrolled ? "nav navSmall" : "nav"}>
        <img
          src={import.meta.env.BASE_URL + "assets/cuzbro-logo.png"}
          className="logo"
        />

        <nav>
          <a href="#home">Home</a>
          <a href="#gallery">Gallery</a>
          <a href="#observatory">Observatory</a>
          <a href="#gear">Gear</a>
          <a href="#crew">Crew</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <section id="home" className="hero">
        <div className="stars"></div>

        <div className="heroText">
          <p className="eyebrow">WELCOME TO</p>

          <h1>
            CuzBro
            <br />
            <span>Observatory</span>
          </h1>

          <p className="tagline">
            Fueled by curiosity, questionable sleep schedules, and stubborn optimism.
          </p>

          <div className="buttons">
            <a href="#gallery" className="primary">
              <Star size={18} />
              Explore the Sky
            </a>

            <a href="#gallery" className="secondary">
              <Camera size={18} />
              Photography
            </a>
          </div>
        </div>

        <div className="heroCard">
          <small className="missionLabel">MISSION CONTROL</small>

          <h2>Current Mission</h2>

          <div className="missionStatus">
            <span className="online"></span>
            Crew Online
          </div>

          <div className="missionStats">
            <div>
              <strong><CountUp end={3} /></strong>
              <span>Observatories</span>
            </div>

            <div>
              <strong><CountUp end={imageCount} /></strong>
              <span>Images</span>
            </div>

            <div>
              <strong><CountUp end={5} /></strong>
              <span>Crew Pets</span>
            </div>
          </div>

          <div className="missionTarget">
            <small>Current Target</small>

            <h3>Explore the Cosmos</h3>

            <p>
              Building a shared observatory for photography,
              astronomy, technology, and curiosity.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}