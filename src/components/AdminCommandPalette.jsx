import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Activity,
  BookOpen,
  Camera,
  ClipboardList,
  Command,
  FolderUp,
  Globe2,
  LogOut,
  Radio,
  Rocket,
  Search,
  Telescope,
  X,
  ShieldAlert
} from 'lucide-react';

const COMMANDS = [
  {
    id: 'admin',
    group: 'COMMAND',
    title: 'Admin Control',
    subtitle: 'Return to mission command',
    keywords:
      'admin dashboard home control command',
    icon: Command,
    href: '/admin'
  },
  {
    id: 'incidents',
    group: 'COMMAND',
    title: 'Incident Command',
    subtitle: 'Declare and resolve crew anomalies',
    keywords:
      'incident anomaly response telescope power fault issue troubleshooting',
    icon: ShieldAlert,
    href: '/admin/incidents'
  },
  {
    id: 'tasks',
    group: 'COMMAND',
    title: 'Crew Tasking',
    subtitle: 'Open the shared crew action queue',
    keywords:
      'tasks tasking action queue assignments follow up todo work crew',
    icon: ClipboardList,
    href: '/admin/tasks'
  },
  {
    id: 'system',
    group: 'COMMAND',
    title: 'System Status',
    subtitle: 'Open infrastructure diagnostics',
    keywords:
      'system health status diagnostics infrastructure',
    icon: Activity,
    href: '/admin/system'
  },
  {
    id: 'storage',
    group: 'COMMAND',
    title: 'Storage Control',
    subtitle: 'Inspect R2 storage usage',
    keywords:
      'storage r2 files objects usage cloudflare',
    icon: FolderUp,
    href: '/admin/storage'
  },
  {
    id: 'black-box',
    group: 'COMMAND',
    title: 'Black Box',
    subtitle: 'Open the crew event archive',
    keywords:
      'black box events activity audit archive recorder',
    icon: Radio,
    href: '/admin/black-box'
  },
  {
    id: 'deployments',
    group: 'COMMAND',
    title: 'Deployments',
    subtitle: 'Inspect build and Git state',
    keywords:
      'deploy deployment git github sha commits version build',
    icon: Rocket,
    href: '/admin/deployments'
  },
  {
    id: 'gallery',
    group: 'MISSION DATA',
    title: 'Capture Control',
    subtitle: 'Manage astrophotography captures',
    keywords:
      'capture gallery images photos mission archive upload',
    icon: Camera,
    href: '/admin/gallery'
  },
  {
    id: 'captains-log',
    group: 'MISSION DATA',
    title: 'Mission Reports',
    subtitle: 'Manage Captain’s Log entries',
    keywords:
      'mission reports captains log observing notes entries',
    icon: BookOpen,
    href: '/admin/captains-log'
  },
  {
    id: 'equipment',
    group: 'MISSION DATA',
    title: 'Gear Inventory',
    subtitle: 'Manage observatory equipment',
    keywords:
      'gear equipment telescope inventory locker',
    icon: Telescope,
    href: '/admin/equipment'
  },
  {
    id: 'transfers',
    group: 'MISSION DATA',
    title: 'Crew Transfer',
    subtitle: 'Open the private file exchange',
    keywords:
      'crew transfer files upload download exchange r2',
    icon: FolderUp,
    href: '/admin/transfers'
  },
  {
    id: 'public-site',
    group: 'SESSION',
    title: 'Open Public Observatory',
    subtitle: 'Leave admin and view the public site',
    keywords:
      'public website observatory home open site',
    icon: Globe2,
    href: '/'
  },
  {
    id: 'logout',
    group: 'SESSION',
    title: 'Log Out',
    subtitle: 'End the authenticated crew session',
    keywords:
      'logout log out sign out session exit',
    icon: LogOut,
    action: 'logout',
    danger: true
  }
];

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export default function AdminCommandPalette({
  onLogout
}) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [query, setQuery] =
    useState('');

  const [
    selectedIndex,
    setSelectedIndex
  ] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filteredCommands =
    useMemo(() => {
      const search =
        normalize(query);

      if (!search) {
        return COMMANDS;
      }

      return COMMANDS.filter(
        (command) => {
          const haystack =
            normalize(
              [
                command.title,
                command.subtitle,
                command.group,
                command.keywords
              ].join(' ')
            );

          return search
            .split(/\s+/)
            .every(
              (term) =>
                haystack.includes(term)
            );
        }
      );
    }, [query]);

  function closePalette() {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }

  async function runCommand(command) {
    if (!command) {
      return;
    }

    closePalette();

    if (
      command.action === 'logout'
    ) {
      await onLogout();

      window.location.href =
        '/admin';

      return;
    }

    if (command.href) {
      window.location.href =
        command.href;
    }
  }

  useEffect(() => {
    function handleGlobalKeyDown(
      event
    ) {
      const commandKey =
        event.ctrlKey ||
        event.metaKey;

      if (
        commandKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();

        setIsOpen(
          (current) => !current
        );

        return;
      }

      if (
        event.key === 'Escape' &&
        isOpen
      ) {
        event.preventDefault();
        closePalette();
      }
    }

    window.addEventListener(
      'keydown',
      handleGlobalKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleGlobalKeyDown
      );
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(
      () => {
        inputRef.current?.focus();
      }
    );
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (
      selectedIndex >=
      filteredCommands.length
    ) {
      setSelectedIndex(
        Math.max(
          0,
          filteredCommands.length - 1
        )
      );
    }
  }, [
    filteredCommands.length,
    selectedIndex
  ]);

  useEffect(() => {
    const activeElement =
      listRef.current?.querySelector(
        '[data-command-active="true"]'
      );

    activeElement?.scrollIntoView({
      block: 'nearest'
    });
  }, [selectedIndex]);

  function handleInputKeyDown(event) {
    if (
      event.key === 'ArrowDown'
    ) {
      event.preventDefault();

      setSelectedIndex(
        (current) =>
          filteredCommands.length
            ? (
                current + 1
              ) %
              filteredCommands.length
            : 0
      );

      return;
    }

    if (
      event.key === 'ArrowUp'
    ) {
      event.preventDefault();

      setSelectedIndex(
        (current) =>
          filteredCommands.length
            ? (
                current -
                1 +
                filteredCommands.length
              ) %
              filteredCommands.length
            : 0
      );

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      runCommand(
        filteredCommands[
          selectedIndex
        ]
      );
    }
  }

  if (!isOpen) {
    return null;
  }

  let visibleGroup = null;

  return (
    <div
      className="admin-command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closePalette();
        }
      }}
    >
      <section
        className="admin-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Admin command palette"
      >
        <div className="admin-command-palette-search">
          <Search size={21} />

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(
                event.target.value
              );
            }}
            onKeyDown={
              handleInputKeyDown
            }
            placeholder="Type a command or search..."
            aria-label="Search admin commands"
          />

          <kbd>
            ESC
          </kbd>

          <button
            type="button"
            onClick={closePalette}
            aria-label="Close command palette"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="admin-command-palette-list"
          ref={listRef}
        >
          {filteredCommands.length ===
          0 ? (
            <div className="admin-command-palette-empty">
              <Command size={23} />

              <strong>
                NO COMMAND FOUND
              </strong>

              <span>
                Try another search.
              </span>
            </div>
          ) : (
            filteredCommands.map(
              (command, index) => {
                const Icon =
                  command.icon;

                const showGroup =
                  command.group !==
                  visibleGroup;

                visibleGroup =
                  command.group;

                return (
                  <div
                    key={command.id}
                  >
                    {showGroup && (
                      <div className="admin-command-palette-group">
                        {command.group}
                      </div>
                    )}

                    <button
                      type="button"
                      className={`admin-command-palette-item${
                        index ===
                        selectedIndex
                          ? ' admin-command-palette-item-active'
                          : ''
                      }${
                        command.danger
                          ? ' admin-command-palette-item-danger'
                          : ''
                      }`}
                      data-command-active={
                        index ===
                        selectedIndex
                          ? 'true'
                          : 'false'
                      }
                      onMouseEnter={() => {
                        setSelectedIndex(
                          index
                        );
                      }}
                      onClick={() => {
                        runCommand(
                          command
                        );
                      }}
                    >
                      <span className="admin-command-palette-icon">
                        <Icon size={20} />
                      </span>

                      <span className="admin-command-palette-copy">
                        <strong>
                          {command.title}
                        </strong>

                        <small>
                          {command.subtitle}
                        </small>
                      </span>

                      <span className="admin-command-palette-enter">
                        {index ===
                        selectedIndex
                          ? '↵'
                          : ''}
                      </span>
                    </button>
                  </div>
                );
              }
            )
          )}
        </div>

        <footer className="admin-command-palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            NAVIGATE
          </span>

          <span>
            <kbd>↵</kbd>
            OPEN
          </span>

          <span>
            <kbd>ESC</kbd>
            CLOSE
          </span>

          <strong>
            CTRL K
          </strong>
        </footer>
      </section>
    </div>
  );
}
