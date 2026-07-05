import { Cpu, PawPrint, Telescope, Users } from 'lucide-react';

export default function InfoSections() {
  return (
    <>
      <section id="gear" className="sectionHeader">
        <h2>⚙ Gear & Setup</h2>
        <a href="/equipment">Open Equipment Locker →</a>
      </section>

      <section className="equipmentTeaser">
        <div>
          <small>MISSION HARDWARE</small>
          <h3>Equipment Locker</h3>
          <p>
            Browse the active telescope system, imaging hardware, eyepieces,
            filters, controllers, finders, and dew-control gear behind CuzBro missions.
          </p>

          <div className="equipmentTeaserChips">
            <span>CPC 800</span>
            <span>ASI294MC</span>
            <span>iPhone 16 Pro</span>
            <span>Optics</span>
            <span>Filters</span>
            <span>Control</span>
          </div>

          <a href="/equipment">Enter Equipment Locker →</a>
        </div>

        <div className="equipmentTeaserSystems" aria-label="Featured observatory systems">
          <article>
            <Telescope />
            <span>
              <small>PRIMARY PLATFORM</small>
              <strong>Celestron CPC 800</strong>
            </span>
          </article>

          <article>
            <Cpu />
            <span>
              <small>DEEP-SKY CAMERA</small>
              <strong>ASI294MC</strong>
            </span>
          </article>

          <article>
            <Telescope />
            <span>
              <small>FIELD TOOLKIT</small>
              <strong>Filters · Finders · Dew Control</strong>
            </span>
          </article>
        </div>
      </section>

      <section id="crew" className="sectionHeader">
  <h2>✦ Crew Dossiers</h2>
  <span>The CuzBro mission team</span>
</section>

<section className="crewGrid">
  <article className="crewCard">
    <small>OBSERVATORY DIRECTOR</small>
    <h3>Dave</h3>
    <p>Telescope operator and deep-sky hunter.</p>
    <ul>
      <li><b>Base</b><span>Eliot, Maine</span></li>
      <li><b>Primary Gear</b><span>CPC 800</span></li>
      <li><b>Current Mission</b><span>Better deep-sky captures</span></li>
    </ul>
  </article>

  <article className="crewCard">
    <small>TECHNOLOGY LEAD</small>
    <h3>Justin</h3>
    <p>Software brain, website collaborator, telescope collimator, and systems support.</p>
    <ul>
      <li><b>Base</b><span>New York, New York</span></li>
      <li><b>Specialty</b><span>Technology</span></li>
      <li><b>Primary Role</b><span>Site upgrades</span></li>
      <li><b>Current Mission</b><span>Make CuzBro smarter</span></li>
    </ul>
  </article>

  <article className="crewCard">
    <small>CREATIVE CONSULTANT</small>
    <h3>Chappy</h3>
    <p>AV wizard, photography guru, idea generator, and morale officer.</p>
    <ul>
      <li><b>Base</b><span>Congers, New York</span></li>
      <li><b>Specialty</b><span>Audio / video</span></li>
      <li><b>Primary Role</b><span>Creative direction</span></li>
      <li><b>Current Mission</b><span>Keep the vibe strong</span></li>
    </ul>
  </article>
</section>

<section className="crewSupport">
  <a className="crewSupportLink" href="/mission-support">MISSION SUPPORT</a>
  <p>Gus, Muffy, Hazelnut, Beau, and Echo provide morale, supervision, equipment inspection, and occasional mission interference.</p>
</section>

      <section id="about" className="sectionHeader">
        <h2>☄ About CuzBro</h2>
        <span>Why this exists</span>
      </section>

      <section className="aboutPanel">
        <h3>Built for looking up.</h3>
        <p>
          CuzBro is a shared astronomy, photography, and technology project made possible by the crew.
        </p>
        <p>
          It started as a place to collect telescope photos and quickly turned into a small mission-control
          dashboard for observing conditions, sky targets, gear, crew updates, and future experiments.
        </p>
      </section>
    </>
  );
}