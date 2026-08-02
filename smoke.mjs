// Headless smoke test: load the built web bundle inside jsdom and ensure the
// app boots without throwing. Not part of the shipped app — dev-only helper.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const g = globalThis;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
try { Object.defineProperty(g, 'localStorage', { value: dom.window.localStorage, configurable: true }); } catch (e) {}
try { Object.defineProperty(g, 'crypto', { value: dom.window.crypto, configurable: true }); } catch (e) {}
Object.defineProperty(g, 'HTMLElement', { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(g, 'MutationObserver', { value: dom.window.MutationObserver, configurable: true });
Object.defineProperty(g, 'getComputedStyle', { value: dom.window.getComputedStyle.bind(dom.window), configurable: true });
Object.defineProperty(g, 'requestAnimationFrame', { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true });
Object.defineProperty(g, 'cancelAnimationFrame', { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true });
for (const k of ['Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'NodeList', 'HTMLDivElement', 'HTMLElement', 'CustomEvent', 'EventTarget', 'DocumentFragment']) {
  try { Object.defineProperty(g, k, { value: dom.window[k], configurable: true }); } catch (e) {}
}
g.history = dom.window.history;
g.location = dom.window.location;

// jsdom lacks matchMedia
dom.window.matchMedia = dom.window.matchMedia || function () {
  return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
};
g.matchMedia = dom.window.matchMedia;

// fetch not needed at boot; stub to avoid issues
g.fetch = async () => { throw new Error('network disabled in smoke test'); };

const fs = await import('node:fs');
// Pick the entry bundle referenced by index.html (not a lazy chunk like jspdf/html2canvas).
const html = fs.readFileSync('./dist/index.html', 'utf-8');
const m = html.match(/<script[^>]*src="\.\/assets\/([^"]+\.js)"/);
const jsFile = m ? m[1] : fs.readdirSync('./dist/assets').find((f) => f.endsWith('.js'));

try {
  // Execute the bundled ESM app inside the jsdom environment.
  const mod = await import('./dist/assets/' + jsFile);
  // Allow effects/promises to flush
  await new Promise((r) => setTimeout(r, 1500));

  const rootHTML = dom.window.document.getElementById('root')?.innerHTML || '';
  if (rootHTML.includes('CLINICAL Rx') || rootHTML.length > 0) {
    console.log('SMOKE OK — app rendered. Root length:', rootHTML.length);
    process.exit(0);
  } else {
    console.log('SMOKE WARN — root empty:', JSON.stringify(rootHTML));
    process.exit(2);
  }
} catch (e) {
  console.error('SMOKE FAIL:', e);
  process.exit(1);
}
