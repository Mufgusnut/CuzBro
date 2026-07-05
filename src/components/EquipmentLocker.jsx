import {
  Aperture,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Cpu,
  Focus,
  RadioTower,
  ScanSearch,
  Smartphone,
  Telescope,
  ThermometerSun
} from 'lucide-react';
import { useMemo, useState } from 'react';

const CATEGORY_ORDER = [
  'Telescope Systems',
  'Imaging',
  'Optics',
  'Filters',
  'Control & Tracking',
  'Field Support'
];

const CATEGORY_ICONS = {
  'Telescope Systems': Telescope,
  Imaging: Camera,
  Optics: Focus,
  Filters: CircleDot,
  'Control & Tracking': RadioTower,
  'Field Support': ThermometerSun
};

function GearIcon({ icon }) {
  const icons = {
    telescope: Telescope,
    camera: Camera,
    smartphone: Smartphone,
    eyepiece: Focus,
    filter: CircleDot,
    controller: Cpu,
    finder: ScanSearch,
    dew: ThermometerSun,
    aperture: Aperture
  };

  const Icon = icons[icon] || Telescope;
  return <Icon size={22} />;
}

function EquipmentCard({ item }) {
  const [open, setOpen] = useState(false);

  return (
    <article className={open ? 'equipmentCard open' : 'equipmentCard'}>
      <button
        type="button"
        className="equipmentCardHeader"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="equipmentCardIcon">
          <GearIcon icon={item.icon} />
        </span>

        <span className="equipmentCardTitle">
          <small>{item.role}</small>
          <strong>{item.name}</strong>
          <em>{item.type}</em>
        </span>

        <span className={`equipmentStatus ${item.status.toLowerCase()}`}>
          {item.status}
        </span>

        <span className="equipmentCardToggle">
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>

      {open && (
        <div className="equipmentCardBody">
          <p>{item.summary}</p>

          <div className="equipmentFacts">
            {(item.facts || []).map((fact) => (
              <span key={`${item.id}-${fact.label}`}>
                <b>{fact.label}</b>
                {fact.value}
              </span>
            ))}
          </div>

          {item.bestFor?.length > 0 && (
            <div className="equipmentBestFor">
              <small>Best For</small>
              <div>
                {item.bestFor.map((use) => (
                  <em key={use}>{use}</em>
                ))}
              </div>
            </div>
          )}

          {item.fieldNote && (
            <div className="equipmentFieldNote">
              <small>Field Note</small>
              <p>{item.fieldNote}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function EquipmentLocker({ equipment = [], status = 'ready' }) {
  const groupedEquipment = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: equipment.filter((item) => item.category === category)
    })).filter((group) => group.items.length > 0);
  }, [equipment]);

  const activeCount = equipment.filter((item) => item.status === 'Active').length;

  return (
    <section className="equipmentLockerWrap">
      <a className="equipmentLockerBack" href="/#gear">← Back to Gear & Setup</a>

      <header className="equipmentLockerHero">
        <small><Telescope size={17} /> CuzBro Observatory Systems</small>
        <h1>Equipment Locker.</h1>
        <p>
          Current observatory systems, imaging hardware, optics, filters,
          controllers, and field support gear used across CuzBro missions.
        </p>
      </header>

      <div className="equipmentLockerStatus">
        <span><b>{equipment.length}</b> systems logged</span>
        <span><b>{activeCount}</b> active</span>
        <span><b>CPC 800</b> primary platform</span>
      </div>

      {status === 'loading' && (
        <div className="equipmentLockerMessage">Loading observatory hardware…</div>
      )}

      {status === 'error' && (
        <div className="equipmentLockerMessage error">
          Equipment data could not be loaded.
        </div>
      )}

      {status === 'ready' && groupedEquipment.map(({ category, items }) => {
        const CategoryIcon = CATEGORY_ICONS[category] || Telescope;

        return (
          <section className="equipmentCategory" key={category}>
            <div className="equipmentCategoryHeader">
              <span><CategoryIcon size={20} /></span>
              <div>
                <small>Mission Hardware</small>
                <h2>{category}</h2>
              </div>
              <i>{items.length} {items.length === 1 ? 'item' : 'items'}</i>
            </div>

            <div className="equipmentGrid">
              {items.map((item) => (
                <EquipmentCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
