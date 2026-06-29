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
  <h2>✦ Crew Dossiers</h2>
  <span>The CuzBro mission team</span>
</section>

<section className="crewGrid">
  <article className="crewCard">
    <small>OBSERVATORY DIRECTOR</small>
    <h3>Dave</h3>
    <p>Founder, telescope operator, photographer, and deep-sky hunter.</p>
    <ul>
      <li><b>Base</b><span>Eliot, Maine</span></li>
      <li><b>Primary Gear</b><span>CPC 800</span></li>
      <li><b>Current Mission</b><span>Better deep-sky captures</span></li>
    </ul>
  </article>

  <article className="crewCard">
    <small>TECHNOLOGY LEAD</small>
    <h3>Justin</h3>
    <p>Software brain, website collaborator, and systems support.</p>
    <ul>
      <li><b>Specialty</b><span>Technology</span></li>
      <li><b>Primary Role</b><span>Site upgrades</span></li>
      <li><b>Current Mission</b><span>Make CuzBro smarter</span></li>
    </ul>
  </article>

  <article className="crewCard">
    <small>CREATIVE CONSULTANT</small>
    <h3>Chappy</h3>
    <p>AV wizard, movie expert, idea generator, and morale officer.</p>
    <ul>
      <li><b>Specialty</b><span>Audio / video</span></li>
      <li><b>Primary Role</b><span>Creative direction</span></li>
      <li><b>Current Mission</b><span>Keep the vibe strong</span></li>
    </ul>
  </article>
</section>

<section className="crewSupport">
  <small>MISSION SUPPORT</small>
  <p>Gus, Muffy, Hazelnut, Beau, and Echo provide morale, supervision, equipment inspection, and occasional mission interference.</p>
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