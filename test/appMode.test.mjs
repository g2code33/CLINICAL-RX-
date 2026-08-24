/**
 * Workspace mode switch — one header button flips the ENTIRE shell between
 * the Clinical companion and the PharmD Journey, and back.
 *
 * Drives the real built bundle in jsdom: clicks the button, asserts the nav
 * set swaps, the button relabels, the route follows and the choice persists.
 *
 * Usage: npm run build:web && node test/appMode.test.mjs
 */
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
const _now=Date.now();
const rec=(m,id,d)=>({id,module:m,data:JSON.stringify(d),createdAt:_now,updatedAt:_now});
dom.window.localStorage.setItem('clinical-rx:v1', JSON.stringify([
  rec('profile','p1',{id:'p1',createdAt:_now,updatedAt:_now,username:'Ama',programme:'Pharmacy',level:'200',site:'KATH',institution:'KNUST',academicYear:'2026/2027',clinicalDay:3,currentStageId:'s2',currentPeriodId:'pd1'}),
  rec('academicStage','s1',{id:'s1',createdAt:_now,updatedAt:_now,name:'Level 100',level:'100',academicYear:'2025/2026',status:'completed',order:100,completedAt:_now}),
  rec('academicStage','s2',{id:'s2',createdAt:_now,updatedAt:_now,name:'Level 200',level:'200',academicYear:'2026/2027',status:'current',order:200}),
  rec('academicPeriod','pd1',{id:'pd1',createdAt:_now,updatedAt:_now,stageId:'s2',name:'Semester 1',index:1}),
  rec('course','c1',{id:'c1',createdAt:_now,updatedAt:_now,stageId:'s2',periodId:'pd1',title:'Pharmacology'}),
]));
dom.window.localStorage.setItem('clinical-rx:app-mode','clinical');
dom.window.history.replaceState({}, '', '/#/');
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
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf-8');
const m = html.match(/<script[^>]*src="\.\/assets\/([^"]+\.js)"/);
const jsFile = m ? m[1] : fs.readdirSync(path.join(ROOT,'dist/assets')).find(f=>f.endsWith('.js'));
let fail=0; const chk=(n,c)=>{console.log(`  ${c?'\u2713':'\u2717'} ${n}`); if(!c)fail++;};
const doc = dom.window.document;
const txt = () => doc.getElementById('root')?.textContent||'';
// Nav-only text. The page BODY may legitimately mention a section name (the
// PharmD Journey snapshot shows an "Investigations" count), so workspace-nav
// assertions must look at the navigation chrome, not the whole page.
const navTxt = () => Array.from(doc.querySelectorAll('nav')).map((n) => n.textContent || '').join(' ');
const findBtn = (label) => [...doc.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').includes(label));
try{
  await import(new URL('file://'+path.join(ROOT,'dist/assets',jsFile)).href);
  await new Promise(r=>setTimeout(r,2200));

  console.log('CLINICAL mode (default):');
  chk('clinical nav present', txt().includes('Clinical Days') && txt().includes('Ward Rounds'));
  chk('switch button offers PharmD', txt().includes('PharmD Journey'));
  chk('PharmD-only nav hidden', !txt().includes('Academic Archive'));
  const toPharmd = findBtn('Switch to PharmD Journey');
  chk('switch button exists', !!toPharmd);

  toPharmd.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  // Splash should appear immediately on switch, then clear itself.
  await new Promise(r=>setTimeout(r,150));
  const splash = doc.querySelector('[role="status"]');
  chk('splash shown during switch', !!splash && (splash.textContent||'').includes('CLINICAL Rx'));
  chk('splash names the target workspace', !!splash && (splash.textContent||'').includes('PharmD Journey'));
  await new Promise(r=>setTimeout(r,1400));
  chk('splash cleared after switch', !doc.querySelector('[role="status"]'));

  console.log('PHARMD mode (after one click):');
  chk('navigated to journey', dom.window.location.hash.includes('/journey'));
  chk('PharmD nav shown', navTxt().includes('Academic Archive') && navTxt().includes('Courses'));
  chk('clinical nav hidden', !navTxt().includes('Clinical Days') && !navTxt().includes('Investigations'));
  chk('button now offers Clinical', txt().includes('Clinical Journey'));
  chk('journey content rendered', txt().includes('Level 200'));
  chk('mode persisted', dom.window.localStorage.getItem('clinical-rx:app-mode')==='pharmd');

  const back = findBtn('Switch to Clinical Journey');
  chk('reverse button exists', !!back);
  back.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  await new Promise(r=>setTimeout(r,1200));

  console.log('BACK to clinical (second click):');
  chk('clinical nav restored', txt().includes('Clinical Days'));
  chk('PharmD nav gone', !txt().includes('Academic Archive'));
  chk('mode persisted back', dom.window.localStorage.getItem('clinical-rx:app-mode')==='clinical');
  if(fail) console.log('SNIPPET:', txt().slice(0,500));
  console.log(fail ? `\nAPP MODE TESTS FAILED — ${fail} check(s)` : '\nALL APP MODE TESTS PASSED \u2714');
  process.exit(fail?1:0);
}catch(e){console.error('FAIL:',e);process.exit(1);}
