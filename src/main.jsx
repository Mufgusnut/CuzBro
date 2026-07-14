import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

const CONSOLE_PATH = '/admin/console';
const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;


if (normalizedPath === CONSOLE_PATH) {
  let manifest = document.querySelector('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement('link');
    manifest.rel = 'manifest';
    document.head.appendChild(manifest);
  }
  manifest.href = '/console.webmanifest';

  const viewport = document.querySelector('meta[name="viewport"]') || document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no';
  if (!viewport.parentNode) document.head.appendChild(viewport);

  const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
  theme.name = 'theme-color';
  theme.content = '#000000';
  if (!theme.parentNode) document.head.appendChild(theme);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.debug('Service worker registration unavailable:', error);
    });
  });
}

/*
 * Visiting the console records the desired Home Screen launch destination.
 * This fallback catches an older/cached iPhone installation that launches at
 * the site root and immediately sends it to the Mission Console.
 */
if (normalizedPath === CONSOLE_PATH) {
  localStorage.setItem('cuzbro-home-screen-target', CONSOLE_PATH);
  document.title = 'CuzBro Mission Console';
} else if (
  isStandalone &&
  normalizedPath === '/' &&
  localStorage.getItem('cuzbro-home-screen-target') === CONSOLE_PATH
) {
  window.location.replace(CONSOLE_PATH);
}

/* Restore React Router deep links after GitHub Pages serves public/404.html. */
const redirect = sessionStorage.redirect;

if (redirect) {
  delete sessionStorage.redirect;
  window.history.replaceState(null, '', redirect);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
