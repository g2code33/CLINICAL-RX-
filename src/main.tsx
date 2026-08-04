import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// PWA: register the service worker for offline support — WEB build only.
// In Electron the renderer loads from file://, where a service worker can
// serve a stale shell and cause the "blank window until forced reload" bug.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !(window as any).clinicalRx?.isElectron) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* SW optional — ignore failures */
    });
  });
}
