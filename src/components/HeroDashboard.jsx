import { Camera, Telescope } from 'lucide-react';

export default function HeroDashboard({ featuredPhoto, setSelectedIndex }) {
  return (
    <div className="heroDashboard">
      <a href="#observatory" className="heroDashCard">
        <Telescope />
        <small>TONIGHT'S SKY</small>
        <h3>Check Conditions</h3>
        <p>Weather, moon phase, planets, and observing windows.</p>
        <span>View Observatory →</span>
      </a>

      <button
        className="heroDashCard"
        onClick={() => setSelectedIndex(0)}
        type="button"
      >
        <Camera />
        <small>FEATURED CAPTURE</small>
        <h3>{featuredPhoto?.title || 'Loading...'}</h3>
        <p>{featuredPhoto?.subtitle || 'Mission report loading.'}</p>
        <span>Open Mission Report →</span>
      </button>
    </div>
  );
}