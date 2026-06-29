import { Cpu, PawPrint, Telescope, Users } from 'lucide-react';

export default function InfoSections() {
  return (
    <>
      <section id="gear" className="sectionHeader">
        <h2>⚙ Gear & Setup</h2>
        <span>The tools behind the images</span>
      </section>

      <section className="infoGrid">
        <article className="infoCard">
          <Telescope />
          <h3>Celestron CPC 800</h3>
          <p>8-inch Schmidt-Cassegrain telescope used for lunar, planetary, double star, and deep-sky captures.</p>
        </article>

        <article className="infoCard">
          <Cpu />
          <h3>iPhone 16 Pro + AstroShader</h3>
          <p>Smartphone imaging workflow for live captures, quick processing, and experimental astrophotography.</p>
        </article>

        <article className="infoCard">
          <Telescope />
          <h3>Filters & Accessories</h3>
          <p>UHC/LPR filter, variable polarizer, dew control, HBG3 controller, and a growing observatory toolkit.</p>
        </article>
      </section>

      <section id="crew" className="sectionHeader">
        <h2>✦ The Crew</h2>
        <span>Curiosity, chaos, and loyal assistants</span>
      </section>

      <section className="infoGrid">
        <article className="infoCard">
          <Users />
          <h3>Dave</h3>
          <p>Telescope operator, image chaser, late-night sky optimist, and builder of CuzBro Observatory.</p>
        </article>

        <article className="infoCard">
          <Cpu />
          <h3>Justin</h3>
          <p>Technology brain, site collaborator, and official CuzBro systems support.</p>
        </article>

        <article className="infoCard">
          <PawPrint />
          <h3>The Pets</h3>
          <p>Gus, Muffy, Hazelnut, Beau, and Echo provide morale, supervision, and occasional mission interference.</p>
        </article>
      </section>

      <section id="about" className="sectionHeader">
        <h2>☄ About CuzBro</h2>
        <span>Why this exists</span>
      </section>

      <section className="aboutPanel">
        <h3>Built for looking up.</h3>
        <p>
          CuzBro is a shared astronomy, photography, and technology project built around curiosity,
          questionable sleep schedules, and stubborn optimism.
        </p>
        <p>
          It started as a place to collect telescope photos and quickly turned into a small mission-control
          dashboard for observing conditions, sky targets, gear, crew updates, and future experiments.
        </p>
      </section>
    </>
  );
}