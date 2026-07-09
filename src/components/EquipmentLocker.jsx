import {
  Aperture,
  CalendarClock,
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
  ThermometerSun,
  Wrench
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';

const CATEGORY_ORDER = [
  'Telescope Systems',
  'Imaging',
  'Optics',
  'Filters',
  'Control & Tracking',
  'Field Support'
];


const HISTORY_TYPE_LABELS = {
  ACQUIRED: 'Acquired',
  UPGRADE: 'System Upgrade',
  SERVICE: 'Service',
  MAINTENANCE: 'Maintenance',
  INCIDENT: 'Incident',
  REPAIR: 'Repair',
  NOTE: 'Equipment Note'
};

function formatHistoryDate(value) {
  if (!value) return 'Date not recorded';

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function EquipmentHistory({ events = [] }) {
  if (!events.length) return null;

  return (
    <section className="equipmentHistory">
      <div className="equipmentHistoryHeading">
        <span><CalendarClock size={16} /></span>
        <div>
          <small>Service &amp; System History</small>
          <strong>{events.length} {events.length === 1 ? 'recorded event' : 'recorded events'}</strong>
        </div>
      </div>

      <div className="equipmentHistoryTimeline">
        {events.map((event) => (
          <article className={`equipmentHistoryEvent ${String(event.event_type || 'NOTE').toLowerCase()}`} key={event.id}>
            <span className="equipmentHistoryNode"><Wrench size={14} /></span>
            <div>
              <small>{HISTORY_TYPE_LABELS[event.event_type] || event.event_type || 'Equipment Note'}</small>
              <strong>{event.title}</strong>
              <time dateTime={event.occurred_on || undefined}>{formatHistoryDate(event.occurred_on)}</time>
              {event.description && <p>{event.description}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
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

function EquipmentCard({ item, history = [] }) {
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

          <EquipmentHistory events={history} />
        </div>
      )}
    </article>
  );
}

export default function EquipmentLocker({ equipment = [], status = 'ready' }) {
  const [historyEvents, setHistoryEvents] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      const { data, error } = await supabase
        .from('equipment_events')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Equipment history could not be loaded:', error);
        return;
      }

      if (active) {
        setHistoryEvents(data || []);
      }
    }

    loadHistory();

    const channel = supabase
      .channel('cuzbro-public-equipment-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'equipment_events'
        },
        loadHistory
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const historyByEquipment = useMemo(() => {
    return historyEvents.reduce((groups, event) => {
      const key = String(event.equipment_id || '');
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
      return groups;
    }, {});
  }, [historyEvents]);
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
                <EquipmentCard
                  key={item.id}
                  item={item}
                  history={historyByEquipment[String(item.id)] || []}
                />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
