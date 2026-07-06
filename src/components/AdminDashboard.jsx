import { useEffect, useState } from 'react';
import {
  BookOpen,
  Camera,
  Clock3,
  LogOut,
  Settings,
  Star,
  Telescope
} from 'lucide-react';
import { supabase } from '../supabase.js';

const initialDashboardData = {
  captures: [],
  missions: [],
  equipment: []
};

function formatMissionDate(dateString) {
  if (!dateString) {
    return 'Unknown date';
  }

  const date = new Date(
    `${dateString}T12:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }
  );
}

export default function AdminDashboard({
  session,
  onLogout
}) {
  const email =
    session?.user?.email || 'Unknown Crew';

  const [dashboardData, setDashboardData] =
    useState(initialDashboardData);

  const [dashboardStatus, setDashboardStatus] =
    useState('loading');

  const [dashboardError, setDashboardError] =
    useState('');

  useEffect(() => {
    async function loadDashboardData() {
      setDashboardStatus('loading');
      setDashboardError('');

      const [
        galleryResponse,
        missionsResponse,
        equipmentResponse
      ] = await Promise.all([
        supabase
          .from('gallery')
          .select(
            'id, title, subtitle, capture_date, is_featured, sort_order, created_at'
          )
          .order('sort_order', {
            ascending: true
          }),

        supabase
          .from('captains_log')
          .select(
            'id, mission, date, location, targets, created_at'
          )
          .order('date', {
            ascending: false
          }),

        supabase
          .from('equipment')
          .select(
            'id, name, category, status, created_at'
          )
          .order('sort_order', {
            ascending: true
          })
      ]);

      const loadError =
        galleryResponse.error ||
        missionsResponse.error ||
        equipmentResponse.error;

      if (loadError) {
        console.error(
          'Admin dashboard load failed:',
          loadError
        );

        setDashboardError(
          loadError.message ||
            'Dashboard data could not be loaded.'
        );

        setDashboardStatus('error');

        return;
      }

      setDashboardData({
        captures:
          galleryResponse.data || [],
        missions:
          missionsResponse.data || [],
        equipment:
          equipmentResponse.data || []
      });

      setDashboardStatus('ready');
    }

    loadDashboardData();
  }, []);

  const {
    captures,
    missions,
    equipment
  } = dashboardData;

  const featuredCapture =
    captures.find(
      (capture) => capture.is_featured
    ) || captures[0];

  const newestCapture =
    [...captures].sort((a, b) => {
      const aDate = new Date(
        a.created_at || 0
      ).getTime();

      const bDate = new Date(
        b.created_at || 0
      ).getTime();

      return bDate - aDate;
    })[0];

  const latestMission =
    missions[0] || null;

  const activeEquipmentCount =
    equipment.filter(
      (item) =>
        String(item.status || '')
          .trim()
          .toLowerCase() === 'active'
    ).length;

  const equipmentCategoryCount =
    new Set(
      equipment
        .map((item) => item.category)
        .filter(Boolean)
    ).size;

  const adminSections = [
    {
      id: 'gallery',
      icon: Camera,
      eyebrow: 'MISSION ARCHIVE',
      title: 'Capture Control',
      description:
        'Upload new astrophotography captures and manage the public mission archive.',
      action: 'MANAGE CAPTURES',
      stats: [
        {
          label: 'CAPTURES',
          value: captures.length
        },
        {
          label: 'FEATURED',
          value:
            featuredCapture?.title ||
            'None'
        }
      ]
    },
    {
      id: 'captains-log',
      icon: BookOpen,
      eyebrow: "CAPTAIN'S LOG",
      title: 'Mission Reports',
      description:
        'Create and manage observing reports, mission notes, and field updates.',
      action: 'MANAGE LOGS',
      stats: [
        {
          label: 'MISSIONS',
          value: missions.length
        },
        {
          label: 'LATEST',
          value:
            latestMission?.id ||
            'None'
        }
      ]
    },
    {
      id: 'equipment',
      icon: Telescope,
      eyebrow: 'EQUIPMENT LOCKER',
      title: 'Gear Inventory',
      description:
        'Add equipment and maintain the public CuzBro gear inventory.',
      action: 'MANAGE GEAR',
      stats: [
        {
          label: 'GEAR',
          value: equipment.length
        },
        {
          label: 'ACTIVE',
          value: activeEquipmentCount
        }
      ]
    }
  ];

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <img
            src={
              import.meta.env.BASE_URL +
              'assets/cuzbro-logo.png'
            }
            alt="CuzBro logo"
          />

          <div>
            <span>
              SECURE CREW TERMINAL
            </span>

            <h1>Admin Control</h1>
          </div>
        </div>

        <div className="admin-user-controls">
          <div className="admin-user">
            <span>
              CREW AUTHENTICATED
            </span>

            <strong>{email}</strong>
          </div>

          <button
            type="button"
            className="admin-logout"
            onClick={onLogout}
          >
            <LogOut size={17} />
            LOG OUT
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-command-header">
          <div>
            <span className="admin-eyebrow">
              MISSION COMMAND
            </span>

            <h2>
              Observatory
              <br />
              Control Center
            </h2>

            <p>
              Authorized crew access for
              managing CuzBro mission data and
              observatory content.
            </p>
          </div>

          <div className="admin-status-card">
            <div className="admin-status-icon">
              <Settings size={23} />
            </div>

            <div>
              <span>SYSTEM STATUS</span>

              <strong>
                {dashboardStatus === 'loading'
                  ? 'SYNCING'
                  : dashboardStatus === 'error'
                    ? 'DATA ALERT'
                    : 'ADMIN ONLINE'}
              </strong>
            </div>

            <i />
          </div>
        </section>

        {dashboardError && (
          <div className="admin-error-message">
            {dashboardError}
          </div>
        )}

        <section className="admin-grid">
          {adminSections.map((section) => {
            const Icon = section.icon;

            return (
              <article
                className="admin-control-card"
                key={section.id}
              >
                <div className="admin-control-icon">
                  <Icon size={27} />
                </div>

                <span className="admin-card-eyebrow">
                  {section.eyebrow}
                </span>

                <h3>{section.title}</h3>

                <p>{section.description}</p>

                <div className="admin-dashboard-card-stats">
                  {section.stats.map((stat) => (
                    <div key={stat.label}>
                      <span>
                        {stat.label}
                      </span>

                      <strong>
                        {dashboardStatus ===
                        'loading'
                          ? '—'
                          : stat.value}
                      </strong>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.location.href =
                      `/admin/${section.id}`;
                  }}
                >
                  {section.action}
                  <span>→</span>
                </button>
              </article>
            );
          })}
        </section>

        <section className="admin-activity-panel">
          <div className="admin-activity-heading">
            <div>
              <span className="admin-eyebrow">
                LIVE OBSERVATORY DATA
              </span>

              <h2>
                Recent Observatory Activity
              </h2>
            </div>

            <div className="admin-activity-live">
              <i />

              SUPABASE LIVE
            </div>
          </div>

          <div className="admin-activity-grid">
            <article className="admin-activity-card">
              <div className="admin-activity-icon">
                <Star
                  size={21}
                  fill="currentColor"
                />
              </div>

              <span>
                CURRENT FEATURE
              </span>

              <h3>
                {dashboardStatus === 'loading'
                  ? 'Loading...'
                  : featuredCapture?.title ||
                    'No Featured Capture'}
              </h3>

              <p>
                {featuredCapture?.subtitle ||
                  'Select a featured capture in Capture Control.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/admin/gallery';
                }}
              >
                CAPTURE CONTROL →
              </button>
            </article>

            <article className="admin-activity-card">
              <div className="admin-activity-icon">
                <BookOpen size={21} />
              </div>

              <span>LATEST MISSION</span>

              <h3>
                {dashboardStatus === 'loading'
                  ? 'Loading...'
                  : latestMission?.id ||
                    'No Missions'}
              </h3>

              <p>
                {latestMission
                  ? `${latestMission.mission} · ${formatMissionDate(
                      latestMission.date
                    )}`
                  : 'No Captain’s Log reports have been recorded.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/admin/captains-log';
                }}
              >
                MISSION REPORTS →
              </button>
            </article>

            <article className="admin-activity-card">
              <div className="admin-activity-icon">
                <Camera size={21} />
              </div>

              <span>NEWEST ARCHIVE ENTRY</span>

              <h3>
                {dashboardStatus === 'loading'
                  ? 'Loading...'
                  : newestCapture?.title ||
                    'No Captures'}
              </h3>

              <p>
                {newestCapture
                  ? `${newestCapture.capture_date || 'Capture date not listed'} · ${captures.length} total archived`
                  : 'No Mission Archive captures have been uploaded.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    '/admin/gallery';
                }}
              >
                VIEW ARCHIVE →
              </button>
            </article>
          </div>
        </section>

        <section className="admin-system-summary">
          <div>
            <Clock3 size={19} />

            <span>MISSION DATABASE</span>

            <strong>
              {missions.length} REPORTS
            </strong>
          </div>

          <div>
            <Camera size={19} />

            <span>IMAGE ARCHIVE</span>

            <strong>
              {captures.length} CAPTURES
            </strong>
          </div>

          <div>
            <Telescope size={19} />

            <span>EQUIPMENT CATEGORIES</span>

            <strong>
              {equipmentCategoryCount} CATEGORIES
            </strong>
          </div>
        </section>

        <button
          type="button"
          className="admin-open-site"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          OPEN PUBLIC OBSERVATORY
          <span>↗</span>
        </button>
      </main>
    </div>
  );
}