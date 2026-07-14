import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

const CONSOLE_PATH = '/admin/console';
const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isConsolePath = normalizedPath === CONSOLE_PATH;
const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

function upsertMeta(name, content) {
  let element = document.head.querySelector(`meta[name="${name}"]`);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function configureConsoleHomeScreenInstall() {
  if (isConsolePath) {
    /*
     * Remember the intended launch page. This also provides an iOS fallback:
     * if an older cached Home Screen entry opens the domain root, the app can
     * immediately restore the Mission Console route while running standalone.
     */
    localStorage.setItem('cuzbro-home-screen-target', CONSOLE_PATH);

    let manifestLink = document.head.querySelector('link[rel="manifest"]');

    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.setAttribute('rel', 'manifest');
      document.head.appendChild(manifestLink);
    }

    manifestLink.setAttribute('href', '/console.webmanifest?v=2');

    upsertMeta('apple-mobile-web-app-capable', 'yes');
    upsertMeta('mobile-web-app-capable', 'yes');
    upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    upsertMeta('apple-mobile-web-app-title', 'CuzBro Console');
    upsertMeta('theme-color', '#000000');

    document.title = 'CuzBro Mission Console';
    return;
  }

  const savedTarget = localStorage.getItem('cuzbro-home-screen-target');

  if (isStandalone && normalizedPath === '/' && savedTarget === CONSOLE_PATH) {
    window.location.replace(CONSOLE_PATH);
  }
}

configureConsoleHomeScreenInstall();

const redirect = sessionStorage.redirect;

if (redirect) {
  delete sessionStorage.redirect;
  window.history.replaceState(null, '', redirect);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
