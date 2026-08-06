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
// Skip it in Electron (file:// origin + stale-shell bug) and in Capacitor
// mobile apps (cache-first SW would serve stale assets after app updates).
const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !(window as any).clinicalRx?.isElectron && !isCapacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* SW optional — ignore failures */
    });
  });
}
