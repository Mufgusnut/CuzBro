import { Moon, Sun, Telescope } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cuzbro-theme';
const THEMES = ['light', 'dark', 'observation'];

function getSavedTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(savedTheme) ? savedTheme : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);

    const event = new CustomEvent('cuzbro-theme-change', {
      detail: { theme }
    });

    window.dispatchEvent(event);
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = (event) => {
      const nextTheme = event.detail?.theme;

      if (THEMES.includes(nextTheme)) {
        setTheme(nextTheme);
      }
    };

    window.addEventListener('cuzbro-theme-change', handleThemeChange);

    return () => {
      window.removeEventListener('cuzbro-theme-change', handleThemeChange);
    };
  }, []);

  const chooseTheme = (nextTheme) => {
    if (nextTheme !== theme) {
      setTheme(nextTheme);
    }
  };

  return (
    <div className="theme-toggle" aria-label="Display theme">
      <button
        type="button"
        className={theme === 'light' ? 'active' : ''}
        onClick={() => chooseTheme('light')}
        aria-label="Use light mode"
        aria-pressed={theme === 'light'}
        title="Light mode"
      >
        <Sun size={15} />
        <span>Light</span>
      </button>

      <button
        type="button"
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => chooseTheme('dark')}
        aria-label="Use dark mode"
        aria-pressed={theme === 'dark'}
        title="Dark mode"
      >
        <Moon size={15} />
        <span>Dark</span>
      </button>

      <button
        type="button"
        className={theme === 'observation' ? 'active' : ''}
        onClick={() => chooseTheme('observation')}
        aria-label="Use observation mode"
        aria-pressed={theme === 'observation'}
        title="Observation mode"
      >
        <Telescope size={15} />
        <span>Obs</span>
      </button>
    </div>
  );
}
