import { Telescope, Camera, Rocket, PawPrint } from 'lucide-react';

export default function QuickLinks() {
  return (
    <section className="quick">
      <div>
        <Telescope />
        Deep Sky
        <span>Explore the cosmos</span>
      </div>

      <div>
        <Camera />
        Gear & Setup
        <span>Tools of the trade</span>
      </div>

      <div>
        <Rocket />
        Observing Logs
        <span>Notes & sessions</span>
      </div>

      <div>
        <PawPrint />
        The Crew
        <span>Meet the team</span>
      </div>
    </section>
  );
}