import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

const CONSOLE_PATH = '/admin/console';
const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

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
