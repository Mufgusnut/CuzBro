import { PawPrint, Sparkles } from 'lucide-react';

const animals = [
  {
    name: 'Gus',
    role: 'Heavy Equipment Inspector',
    species: 'Great Dane',
    image: 'images/mission-support/gus.jpg',
    notes: 'Large-scale morale support, doorway supervision, and occasional telescope-area quality control.'
  },
  {
    name: 'Muffy',
    role: 'Senior Observatory Supervisor',
    species: 'Fluffy Grey Cat',
    image: 'images/mission-support/muffy.jpg',
    notes: 'Regal oversight, sunbeam monitoring, cozy operations, and treat-based mission review.'
  },
  {
    name: 'Hazelnut',
    role: 'Field Operations Specialist',
    species: 'Tuxedo Cat',
    image: 'images/mission-support/hazelnut.jpg',
    notes: 'Outdoor reconnaissance, rodent patrol, and high-curiosity equipment inspection.'
  },
  {
    name: 'Beau',
    role: 'High-Altitude Explorer',
    species: 'Tuxedo Cat',
    image: 'images/mission-support/beau.jpg',
    notes: 'Dapper daredevil, curious climber, and crew member who prefers the highest perch available — always reaching for the stars.'
  },
  {
    name: 'Echo',
    role: 'Morale Officer',
    species: 'Minature Poodle',
    image: 'images/mission-support/echo.jpg',
    notes: 'Vibe maintenance, enthusiasm checks, and emotional support for difficult missions.'
  }
];

function AnimalCard({ animal }) {
  return (
    <article className="supportAnimalCard">
      <div className="supportAnimalPhoto">
        <img
          src={import.meta.env.BASE_URL + animal.image}
          alt={`${animal.name} mission support portrait`}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            event.currentTarget.parentElement?.classList.add('missingPhoto');
          }}
        />
        <div className="supportAnimalPlaceholder">
          <PawPrint />
          <span>Add photo</span>
        </div>
      </div>

      <div className="supportAnimalInfo">
        <small>{animal.role}</small>
        <h2>{animal.name}</h2>
        <b>{animal.species}</b>
        <p>{animal.notes}</p>
      </div>
    </article>
  );
}

export default function MissionSupport() {
  return (
    <section className="missionSupportWrap">
      <a className="missionSupportBack" href="/#crew">← Back to Crew</a>

      <header className="missionSupportHero">
        <small><Sparkles size={16} /> CuzBro Mission Support</small>
        <h1>Morale crew. Equipment inspectors. Chaos consultants.</h1>
        <p>
          The observatory is powered by curiosity, questionable sleep schedules, and a support staff
          that takes supervision very seriously.
        </p>
      </header>

      <section className="supportAnimalGrid">
        {animals.map((animal) => (
          <AnimalCard key={animal.name} animal={animal} />
        ))}
      </section>
    </section>
  );
}
