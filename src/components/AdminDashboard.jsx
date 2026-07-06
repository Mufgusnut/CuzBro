import {
  BookOpen,
  Camera,
  LogOut,
  Settings,
  Telescope
} from 'lucide-react';

export default function AdminDashboard({
  session,
  onLogout
}) {
  const email = session?.user?.email || 'Unknown Crew';

  const adminSections = [
    {
      id: 'gallery',
      icon: Camera,
      eyebrow: 'MISSION ARCHIVE',
      title: 'Capture Control',
      description:
        'Upload new astrophotography captures and manage the public mission archive.',
      action: 'MANAGE CAPTURES'
    },
    {
      id: 'captains-log',
      icon: BookOpen,
      eyebrow: "CAPTAIN'S LOG",
      title: 'Mission Reports',
      description:
        'Create and manage observing reports, mission notes, and field updates.',
      action: 'MANAGE LOGS'
    },
    {
      id: 'equipment',
      icon: Telescope,
      eyebrow: 'EQUIPMENT LOCKER',
      title: 'Gear Inventory',
      description:
        'Add equipment and maintain the public CuzBro gear inventory.',
      action: 'MANAGE GEAR'
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
            <span>SECURE CREW TERMINAL</span>
            <h1>Admin Control</h1>
          </div>
        </div>

        <div className="admin-user-controls">
          <div className="admin-user">
            <span>CREW AUTHENTICATED</span>
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
              Authorized crew access for managing
              CuzBro mission data and observatory
              content.
            </p>
          </div>

          <div className="admin-status-card">
            <div className="admin-status-icon">
              <Settings size={23} />
            </div>

            <div>
              <span>SYSTEM STATUS</span>
              <strong>ADMIN ONLINE</strong>
            </div>

            <i />
          </div>
        </section>

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