import { Telescope, Camera, Rocket, PawPrint } from 'lucide-react';

export default function QuickLinks() {
  return (
    <section className="quick">
  <a href="#gallery">
    <Telescope />
    Deep Sky
    <span>Gallery and mission reports</span>
  </a>

  <a href="#gear">
    <Camera />
    Gear & Setup
    <span>Tools of the trade</span>
  </a>

  <a href="#observatory">
    <Rocket />
    Observing Conditions
    <span>Weather and sky targets</span>
  </a>

  <a href="#crew">
    <PawPrint />
    The Crew
    <span>Meet the team</span>
  </a>
</section>
  );
}