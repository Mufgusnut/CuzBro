import { Camera, Star } from 'lucide-react';

export default function Hero({ imageCount }) {
  return (
    <>
      <header className="nav">
        <img
          src={import.meta.env.BASE_URL + "assets/cuzbro-logo.png"}
          className="logo"
        />

        <nav>
          <a>Home</a>
          <a>Gallery</a>
          <a>Observatory</a>
          <a>Gear</a>
          <a>Crew</a>
          <a>About</a>
        </nav>
      </header>

      <section className="hero">
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

            <a href="#photos" className="secondary">
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
              <strong>3</strong>
              <span>Observatories</span>
            </div>

            <div>
              <strong>{imageCount}</strong>
              <span>Images</span>
            </div>

            <div>
              <strong>5</strong>
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