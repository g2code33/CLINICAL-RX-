/**
 * CLINICAL Rx — PHASE 12 feature tests.
 *
 *   1  Admin section is reachable again (route, nav, Settings)
 *   2  Admin can replace any app emoji/icon with another emoji or an image
 *   3  Brand appears once in the header; drawer text does not resize
 *   4  Academic levels are fully managed from Settings
 *
 * Runs fully offline.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
const nodeCrypto = await import('node:crypto');
Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto, configurable: true, writable: true });
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`);
  }
};

let networkCalls = [];
globalThis.fetch = async (url) => {
  networkCalls.push(String(url));
  throw new Error('NETWORK BLOCKED IN TEST: ' + url);
};

const read = (p) => readFileSync(p, 'utf8');
const layout = read('src/components/Layout.tsx');
const settings = read('src/pages/Settings.tsx');
const admin = read('src/pages/Admin.tsx');
const css = read('src/index.css');

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const icons = await server.ssrLoadModule('/src/services/iconRegistry.ts');

  // =====================================================================
  console.log('\n1 — ADMIN SECTION IS BACK');

  const app = read('src/App.tsx');
  check('the /admin route exists', app.includes('path="/admin"'));
  check('admin is in the clinical sidebar', layout.includes("{ to: '/admin'"));
  check('admin is in the PharmD sidebar too', layout.split("{ to: '/admin'").length - 1 >= 2);
  check('admin is a top-level Settings destination', settings.includes("navigate('/admin')") && settings.includes('Admin Panel →'));
  check('admin is NOT buried inside the About tab', !/section === 'about'[\s\S]{0,600}Admin Panel/.test(settings));
  check('admin has section tabs', admin.includes('role="tablist"') && admin.includes('Admin sections'));
  check('a signed-out admin sees a sign-in prompt, not a dead end', admin.includes("tab === 'users' && !token"));

  // =====================================================================
  console.log('\n2 — ICON / EMOJI MANAGER');

  check('an icon catalog exists', Array.isArray(icons.ICON_CATALOG) && icons.ICON_CATALOG.length > 30, `${icons.ICON_CATALOG?.length}`);
  check('every entry has key, fallback, label and group', icons.ICON_CATALOG.every((i) => i.key && i.fallback && i.label && i.group));
  const keys = icons.ICON_CATALOG.map((i) => i.key);
  check('icon keys are unique', new Set(keys).size === keys.length);

  // Defaults resolve before any override.
  check('a known icon resolves to its default', icons.appIcon('nav.home') === '🏠', icons.appIcon('nav.home'));
  check('no overrides exist initially', icons.overrideCount() === 0);

  // ---- emoji override ----
  const emojiRes = icons.setEmojiIcon('nav.home', '🏡');
  check('an emoji override can be set', emojiRes.ok, emojiRes.error);
  check('the override is returned by appIcon', icons.appIcon('nav.home') === '🏡', icons.appIcon('nav.home'));
  check('hasOverride reports true', icons.hasOverride('nav.home'));
  check('other icons are unaffected', icons.appIcon('nav.medicines') === '💊');

  const tooLong = icons.setEmojiIcon('nav.home', 'Home Page Icon');
  check('a whole word is rejected (would break layout)', !tooLong.ok, tooLong.error);
  const unknown = icons.setEmojiIcon('nav.doesNotExist', '🙂');
  check('an unknown icon key is rejected', !unknown.ok, unknown.error);
  const empty = icons.setEmojiIcon('nav.home', '   ');
  check('an empty value is rejected', !empty.ok, empty.error);

  // ---- image override ----
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imgRes = icons.setImageIcon('nav.medicines', png);
  check('a PNG image override can be set', imgRes.ok, imgRes.error);
  check('the image is returned as a data URL', icons.appIcon('nav.medicines').startsWith('data:image/png'));
  check('isImageIcon distinguishes images from emoji', icons.isImageIcon(icons.appIcon('nav.medicines')) && !icons.isImageIcon(icons.appIcon('nav.home')));

  const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(64);
  check('JPEG is accepted', icons.setImageIcon('nav.quiz', jpeg).ok);
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  check('SVG is accepted', icons.setImageIcon('nav.ai', svg).ok);

  const remote = icons.setImageIcon('nav.home', 'https://example.com/icon.png');
  check('a REMOTE url is rejected (would break offline-first)', !remote.ok, remote.error);
  const notImage = icons.setImageIcon('nav.home', 'data:text/html;base64,PHNjcmlwdD4=');
  check('a non-image data URL is rejected', !notImage.ok, notImage.error);
  const huge = 'data:image/png;base64,' + 'A'.repeat(icons.MAX_ICON_BYTES * 2);
  const hugeRes = icons.setImageIcon('nav.home', huge);
  check('an oversized image is rejected', !hugeRes.ok, hugeRes.error);

  // ---- reset ----
  icons.resetIcon('nav.home');
  check('resetting one icon restores its default', icons.appIcon('nav.home') === '🏠');
  check('resetting one icon leaves others customised', icons.appIcon('nav.medicines').startsWith('data:'));

  // ---- export / import round trip ----
  const exported = icons.exportIcons();
  check('the icon set exports as JSON', exported.includes('icon-overrides'));
  icons.resetAllIcons();
  check('resetAll clears every override', icons.overrideCount() === 0);
  const imported = icons.importIcons(exported);
  check('a previously exported set imports', imported.ok, imported.error);
  check('imported overrides are applied', icons.appIcon('nav.medicines').startsWith('data:'));

  const badImport = icons.importIcons('{"kind":"something-else"}');
  check('a foreign file is rejected on import', !badImport.ok, badImport.error);
  const brokenImport = icons.importIcons('not json');
  check('a corrupt file is rejected on import', !brokenImport.ok, brokenImport.error);

  // Unknown keys in an imported file must not be trusted blindly.
  const spoof = icons.importIcons(JSON.stringify({ app: 'clinical-rx', kind: 'icon-overrides', icons: { 'evil.key': 'X' } }));
  check('unknown keys are ignored on import', spoof.ok && !icons.allOverrides()['evil.key']);

  icons.resetAllIcons();

  // ---- wiring ----
  check('navigation uses registry keys, not hardcoded emoji', layout.includes("iconKey: 'nav.home'") && !layout.includes("{ to: '/', icon: '🏠'"));
  check('navigation renders through <AppIcon>', layout.includes('<AppIcon name={n.iconKey}'));
  const appIconSrc = read('src/components/AppIcon.tsx');
  check('AppIcon renders images as <img>', appIconSrc.includes('<img'));
  check('AppIcon subscribes so changes apply live', appIconSrc.includes('useSyncExternalStore'));
  check('icons are decorative for screen readers', appIconSrc.includes('aria-hidden="true"') && appIconSrc.includes('alt=""'));
  const manager = read('src/components/admin/IconManager.tsx');
  check('the manager accepts image uploads', manager.includes('image/png') && manager.includes('readAsDataURL'));
  check('the manager offers reset to default', manager.includes('resetIcon') && manager.includes('resetAllIcons'));

  // =====================================================================
  console.log('\n3 — HEADER BRAND + DRAWER TRANSITION');

  check('the top-bar brand hides when the sidebar shows it', layout.includes("sidebarOpen ? 'flex min-w-0 items-center gap-2 sm:gap-3 lg:hidden'"));
  const brandBlocks = (layout.match(/CLINICAL Rx\s*\n\s*<\/span>|>\s*CLINICAL Rx\s*</g) || []).length;
  check('brand markup still exists for the collapsed/mobile case', brandBlocks >= 1, `${brandBlocks}`);

  check('text auto-inflation is disabled', css.includes('text-size-adjust: 100%'));
  check('the webkit prefix is present (needed by mobile Safari/Chrome)', css.includes('-webkit-text-size-adjust: 100%'));
  check('drawer items no longer animate every property', !layout.includes('transition-all duration-150 active:scale-[0.98]'));
  check('drawer items animate colour only', layout.includes('transition-colors duration-150'));

  // =====================================================================
  console.log('\n4 — LEVELS ARE SET IN SETTINGS');

  check('Settings can add a level', settings.includes('academicAddStage'));
  check('Settings can set the current level', settings.includes('academicSetCurrentStage'));
  check('Settings can remove a level', settings.includes('academicDeleteStage'));
  check('Settings can edit the academic year', settings.includes('academicSaveStage'));
  check('Settings lists every level', settings.includes('academicAllStages'));
  check('the section is titled for levels', settings.includes('Academic levels'));
  check('removing a level warns that records are kept', /records stamped with this level are NOT deleted/i.test(settings));
  check('changing level warns that history is not rewritten', /keep the level they were made in|nothing is rewritten/i.test(settings));
  check('semester selection is still available', settings.includes('academicSetCurrentPeriod'));
  check('it no longer just redirects to the Journey page', !settings.includes('Set up my journey →'));

  // Behavioural: the service calls Settings uses really do the job.
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const st = () => useData.getState();
  await st().init();
  if (!st().settings) await st().saveSettings(defaults.newSettings());
  if (!st().profile) await st().saveProfile(defaults.newProfile('Ama'));

  const added = await academic.addStage({ level: '200', academicYear: '2023/2024', status: 'current' });
  check('a level added from Settings appears in the journey', academic.allStages().some((s) => s.id === added.id));
  check('semesters are created automatically', academic.periodsFor(added.id).length >= 2);

  const second = await academic.addStage({ level: '300', academicYear: '2024/2025', status: 'upcoming' });
  await st().save('lesson', { id: 'p12-note', title: 'Level 200 work', content: 'x', createdAt: Date.now(), updatedAt: Date.now() });
  const stampedYear = st().lessons.find((l) => l.id === 'p12-note')?.academic?.academicYear;

  await academic.setCurrentStage(second.id);
  check('setting the current level works', academic.currentStage()?.level === '300', academic.currentStage()?.level);
  check('the previous level is archived, not deleted', academic.allStages().some((s) => s.id === added.id));
  check('an existing record keeps its original year', st().lessons.find((l) => l.id === 'p12-note')?.academic?.academicYear === stampedYear);

  const lessonsBefore = st().lessons.length;
  await academic.deleteStage(second.id);
  check('a level can be removed', !academic.allStages().some((s) => s.id === second.id));
  check('removing a level deletes NO records', st().lessons.length === lessonsBefore, `${lessonsBefore} -> ${st().lessons.length}`);

  // =====================================================================
  console.log('\nOFFLINE GUARANTEE');
  check('everything above ran with zero network calls', networkCalls.length === 0, networkCalls.join(','));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 12 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 12 TESTS PASSED ✔');
