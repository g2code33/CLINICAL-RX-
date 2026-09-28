/**
 * HEALTH API CLIENTS
 *
 * Thin wrappers around study health APIs. All calls are client-side.
 * CORS varies by API — where the browser blocks a direct call we surface a
 * clickable URL the student can open in a new tab.
 */

import type { HealthApiKey } from '../types';

type KeyLookup = () => Record<string, HealthApiKey>;

function cfg(getKeys: KeyLookup, id: string): HealthApiKey {
  return getKeys()[id] ?? { name: '', key: '', enabled: false };
}

function buildUrl(base: string, params: Record<string, string | number>) {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u;
}

/* ---- JSON fetch helper with friendly errors ---- */
async function fetchJson(url: URL, opts?: RequestInit): Promise<{ ok: true; data: any; url: string } | { ok: false; error: string; url?: string }> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts?.headers as any || {}) };
    const res = await fetch(url.toString(), { mode: 'cors', credentials: 'omit', ...(opts || {}), headers });
    if (res.status === 404) return { ok: false, error: 'No results found.', url: url.toString() };
    if (res.status === 429) return { ok: false, error: 'Rate limited — add an API key or wait a moment.', url: url.toString() };
    if (res.status === 401 || res.status === 403) return { ok: false, error: `Authentication failed (${res.status}). Check your API key.`, url: url.toString() };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, url: url.toString() };
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 2000) }; }
    return { ok: true, data, url: url.toString() };
  } catch (e: any) {
    return { ok: false, error: `Cannot call directly from the browser (${e?.message || 'CORS/network'}). Open the URL directly in a new tab.`, url: url.toString() };
  }
}

/* ===========================================================
   1. GOVERNMENT / OPEN DATA — openFDA, RxNav, DailyMed, PubMed
   =========================================================== */

/** openFDA — drug labels, adverse events, recalls. Optional api.data.gov key. */
export const openFda = {
  async searchLabels(query: string, getKeys: KeyLookup, limit = 3) {
    const c = cfg(getKeys, 'openfda');
    const url = buildUrl('https://api.fda.gov/drug/label.json', {
      search: `(openfda.brand_name:"${query}") OR (openfda.generic_name:"${query}")`,
      limit,
    });
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  async adverseEvents(drug: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'openfda');
    const url = buildUrl('https://api.fda.gov/drug/event.json', {
      search: `patient.drug.medicinalproduct:"${drug}"`,
      count: 'patient.reaction.reactionmeddrapt.exact',
      limit,
    });
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  async recalls(query: string, getKeys: KeyLookup, limit = 5) {
    const c = cfg(getKeys, 'openfda');
    const url = buildUrl('https://api.fda.gov/drug/enforcement.json', {
      search: `product_description:"${query}"`,
      limit,
    });
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  labelUrl(query: string) {
    return `https://api.fda.gov/drug/label.json?search=(openfda.brand_name:"${encodeURIComponent(query)}")+OR+(openfda.generic_name:"${encodeURIComponent(query)}")&limit=3`;
  },
  /** Pull the drug_interactions section for a drug by generic/brand name (used for RxNav replacement). */
  async drugInteractionsText(query: string, getKeys: KeyLookup) {
    const c = cfg(getKeys, 'openfda');
    const url = buildUrl('https://api.fda.gov/drug/label.json', {
      search: `(openfda.brand_name:"${query}") OR (openfda.generic_name:"${query}")`,
      limit: 1,
    });
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    const r = await fetchJson(url);
    if (!r.ok) return r;
    const rec = r.data?.results?.[0];
    const brand: string = rec?.openfda?.brand_name?.[0] || '';
    const generic: string = rec?.openfda?.generic_name?.[0] || '';
    const rxcui: string = rec?.openfda?.rxcui?.[0] || '';
    const interactionsText: string = rec?.drug_interactions?.[0] || '';
    return { ok: true as const, data: { brand, generic, rxcui, interactionsText, setid: rec?.set_id || '' }, url: url.toString() };
  },
};

/** RxNav (NLM) — interactions, RxNorm, spelling. No key required. */
export const rxNav = {
  async findRxCui(name: string) {
    // Approximate match (search=2 returns candidates).
    const url = buildUrl('https://rxnav.nlm.nih.gov/REST/rxcui.json', { name, search: 2 });
    return fetchJson(url);
  },
  async findRxCuiExact(name: string) {
    // Exact match only (no search=2).
    const url = buildUrl('https://rxnav.nlm.nih.gov/REST/rxcui.json', { name });
    return fetchJson(url);
  },
  async interactions(rxcuis: string[]) {
    // NLM DISCONTINUED this endpoint Jan 2024. Returns 404. Kept for reference; do not rely on it.
    if (rxcuis.length < 2) return { ok: false as const, error: 'Need at least 2 RxCUIs.' };
    const url = buildUrl('https://rxnav.nlm.nih.gov/REST/interaction/list.json', { rxcuis: rxcuis.join('+') });
    return fetchJson(url);
  },
  async interactionsPerDrug(rxcui: string) {
    // NLM DISCONTINUED Jan 2024. Kept for reference.
    const url = buildUrl('https://rxnav.nlm.nih.gov/REST/interaction/interaction.json', { rxcui });
    return fetchJson(url);
  },
  async spellingSuggestions(term: string) {
    return fetchJson(buildUrl('https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json', { name: term }));
  },
  async getDrugsByName(name: string) {
    return fetchJson(buildUrl('https://rxnav.nlm.nih.gov/REST/drugs.json', { name }));
  },
  /** RxNorm properties (name, tty, synonym) for an RxCUI */
  async getProperties(rxcui: string) {
    return fetchJson(buildUrl(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`, {}));
  },
  /** All related names for an ingredient (brand names, etc.) */
  async getRelated(rxcui: string, tty = 'IN+PIN+BN+SBD+BPCK+SCD+GPCK') {
    return fetchJson(buildUrl(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json`, { tty }));
  },
  /** RxClass — ATC / VA / MeSH / SNOMED / MED-RT (may_treat, CI_with etc.) for a drug */
  async rxClass(rxcui: string) {
    // Ask for several useful class types; defaults to all sources which can be noisy.
    return fetchJson(buildUrl('https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json', { rxcui }));
  },
  /** Spelling suggestions */
  interactionUrl(rxcuis: string[]) {
    return `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`;
  },
};

/** DailyMed (NLM) — official FDA Structured Product Labeling (SPL). Free, no key. */
export const dailyMed = {
  async search(query: string, limit = 5) {
    const url = buildUrl('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json', { drug_name: query, limit });
    return fetchJson(url);
  },
  async getSpl(setid: string) {
    return fetchJson(new URL(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(setid)}.json`));
  },
  splUrl(setid: string) {
    return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setid)}`;
  },
  searchUrl(query: string) {
    return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(query)}`;
  },
};

/** PubMed E-utilities (NCBI/NLM) — free biomedical literature search. Optional key for higher limits. */
export const pubmed = {
  async search(term: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'pubmed');
    const key = c.key?.trim();
    // Step 1: esearch for IDs
    const esearch = buildUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
      db: 'pubmed', term, retmax: limit, retmode: 'json',
    });
    if (key) esearch.searchParams.set('api_key', key);
    const s = await fetchJson(esearch);
    if (!s.ok) return s;
    const ids: string[] = s.data?.esearchresult?.idlist || [];
    if (!ids.length) return { ok: true as const, data: { result: [] }, url: esearch.toString() };
    // Step 2: esummary for titles/authors/date
    const esum = buildUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
      db: 'pubmed', id: ids.join(','), retmode: 'json',
    });
    if (key) esum.searchParams.set('api_key', key);
    const d = await fetchJson(esum);
    if (!d.ok) return d;
    const results = ids.map((id) => ({
      id,
      title: d.data?.result?.[id]?.title || '',
      pubdate: d.data?.result?.[id]?.pubdate || '',
      authors: (d.data?.result?.[id]?.authors || []).map((a: any) => a.name).slice(0, 3),
      source: d.data?.result?.[id]?.source || '',
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    }));
    return { ok: true as const, data: { results, count: s.data?.esearchresult?.count }, url: esum.toString() };
  },
  url(term: string) { return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`; },
};

/** UMLS (UTS) — terminology. Requires free UTS key. */
export const umls = {
  async searchConcept(term: string, sab: string, key: string, limit = 15) {
    if (!key?.trim()) return { ok: false as const, error: 'Add your UMLS UTS API key in Settings.' };
    try {
      const tgt = await getUmlsTgt(key);
      if (!tgt.ok) return tgt;
      const ticket = await getUmlsServiceTicket(tgt.tgt);
      const url = buildUrl('https://uts-ws.nlm.nih.gov/rest/search/current', { string: term, pageSize: limit, ticket });
      if (sab) url.searchParams.set('sabs', sab);
      return fetchJson(url);
    } catch (e: any) { return { ok: false as const, error: e?.message || 'UMLS request failed.' }; }
  },
};

async function getUmlsTgt(apiKey: string): Promise<{ ok: true; tgt: string } | { ok: false; error: string }> {
  const res = await fetch('https://utslogin.nlm.nih.gov/cas/v1/api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ apikey: apiKey }),
  });
  if (!res.ok) return { ok: false, error: `UMLS auth failed (${res.status}). Check your key.` };
  const text = await res.text();
  const m = /action="([^"]+)"/.exec(text) || /Location:\s*([^\s]+)/.exec(res.headers.get('location') || '');
  if (!m) return { ok: false, error: 'Could not obtain UMLS TGT.' };
  return { ok: true, tgt: m[1] };
}
async function getUmlsServiceTicket(tgtUrl: string): Promise<string> {
  const res = await fetch(tgtUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ service: 'http://umlsks.nlm.nih.gov' }),
  });
  return await res.text();
}

/* ===========================================================
   2. COMMERCIAL / PATIENT DATA — DrugBank, GoodRx, Infermedica, FDB
   =========================================================== */

/** DrugBank — commercial gold-standard. Requires API key (drug info, targets, pathways). */
export const drugBank = {
  async search(query: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'drugbank');
    if (!c.key?.trim()) return { ok: false as const, error: 'Add your DrugBank API key in Settings.' };
    const base = c.baseUrl?.trim() || 'https://api.drugbank.com/v1';
    const url = buildUrl(`${base.replace(/\/$/, '')}/drugs`, { q: query, limit });
    return fetchJson(url, { headers: { Authorization: `Bearer ${c.key.trim()}`, Accept: 'application/json' } });
  },
  infoUrl: 'https://www.drugbank.com/',
};

/** GoodRx — prescription pricing / coupons; API key required (partner program). */
export const goodrx = {
  async prices(drug: string, getKeys: KeyLookup, zip?: string) {
    const c = cfg(getKeys, 'goodrx');
    if (!c.key?.trim()) return { ok: false as const, error: 'GoodRx requires a partner API key. Add it in Settings.' };
    const base = c.baseUrl?.trim() || 'https://api.goodrx.com/v1';
    const url = buildUrl(`${base.replace(/\/$/, '')}/prices`, { drug, zip: zip || '' });
    return fetchJson(url, { headers: { Authorization: `Bearer ${c.key.trim()}`, Accept: 'application/json' } });
  },
  couponUrl(drug: string) { return `https://www.goodrx.com/${encodeURIComponent(drug.replace(/\s+/g, '-').toLowerCase())}`; },
  infoUrl: 'https://www.goodrx.com/healthcare-professionals/api',
};

/** Infermedica — symptom checker / triage (medical-AI reasoning). Requires app_id + app_key. */
export const infermedica = {
  async parse(text: string, getKeys: KeyLookup) {
    const c = cfg(getKeys, 'infermedica');
    if (!c.key?.trim()) return { ok: false as const, error: 'Infermedica requires App-Id and App-Key (paste "app-id:app-key" in the key field).' };
    const [appId, appKey] = c.key.split(':').map((s) => s.trim());
    if (!appId || !appKey) return { ok: false as const, error: 'Infermedica key format is "app-id:app-key".' };
    const base = c.baseUrl?.trim() || 'https://api.infermedica.com/v3';
    return fetchJson(buildUrl(`${base.replace(/\/$/, '')}/parse`, { text }), {
      method: 'POST', headers: { 'App-Id': appId, 'App-Key': appKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text }),
    });
  },
  async symptoms(getKeys: KeyLookup) {
    const c = cfg(getKeys, 'infermedica');
    if (!c.key?.trim()) return { ok: false as const, error: 'Add Infermedica credentials in Settings.' };
    const [appId, appKey] = c.key.split(':').map((s) => s.trim());
    const base = c.baseUrl?.trim() || 'https://api.infermedica.com/v3';
    return fetchJson(new URL(`${base.replace(/\/$/, '')}/symptoms`), { headers: { 'App-Id': appId, 'App-Key': appKey, Accept: 'application/json' } });
  },
  infoUrl: 'https://developer.infermedica.com/',
};

/** FDB / Wolters Kluwer — premium clinical decision support. Enterprise only. */
export const fdb = { infoUrl: 'https://www.fdbhealth.com/' };

/** EvidenceMD — medical reasoning AI with PubMed citations. Key required. */
export const evidenceMd = {
  async ask(query: string, getKeys: KeyLookup) {
    const c = cfg(getKeys, 'evidencemd');
    if (!c.key?.trim()) return { ok: false as const, error: 'Add your EvidenceMD API key in Settings.' };
    const base = c.baseUrl?.trim() || 'https://api.evidencemd.ai/v1';
    return fetchJson(buildUrl(`${base.replace(/\/$/, '')}/query`, { q: query }), {
      headers: { Authorization: `Bearer ${c.key.trim()}`, Accept: 'application/json' },
    });
  },
  infoUrl: 'https://evidencemd.ai/',
};

/* ===========================================================
   3. EHR INTEROPERABILITY — Redox, Particle/Metriport, Google Healthcare
   These mostly require agreements; provide key entry + link-out helpers.
   =========================================================== */

export const redox = { infoUrl: 'https://www.redoxengine.com/' };
export const particle = { infoUrl: 'https://www.particlehealth.com/' };
export const metriport = { infoUrl: 'https://www.metriport.com/' };
export const googleHealthcare = { infoUrl: 'https://cloud.google.com/healthcare-api' };

/* ===========================================================
   4. WEARABLES — Terra / SpikeAPI. Key required.
   =========================================================== */

export const terra = { infoUrl: 'https://tryterra.co/' };
export const spikeApi = { infoUrl: 'https://spikeapi.com/' };

/* ===========================================================
   Link-outs for RxList/WebMD (no JSON API, just deep links)
   =========================================================== */

export const webmd = {
  drugSearchUrl(name: string) { return `https://www.rxlist.com/search/rxl/${encodeURIComponent(name)}`; },
  conditionSearchUrl(term: string) { return `https://www.webmd.com/search/search_results/default.aspx?query=${encodeURIComponent(term)}&source=wbmd`; },
  interactionsCheckUrl(drugs: string[]) { return `https://www.rxlist.com/drug-interaction-checker.htm?drug_list=${encodeURIComponent(drugs.join(','))}`; },
};

/** Public drug-interaction link-outs (free, no key, no API — open in a new tab). */
export const interactionCheckers = {
  rxlist(drugs: string[]) { return `https://www.rxlist.com/drug-interaction-checker.htm?drug_list=${encodeURIComponent(drugs.join(','))}`; },
  drugscom(drugs: string[]) {
    // drugs.com uses drug_list in form: name1-name2-name3 joined by hyphen within drug, %0A between drugs
    return `https://www.drugs.com/drug_interactions.php?drug_list=${encodeURIComponent(drugs.map(d => d.trim().toLowerCase().replace(/\s+/g, '-')).join(','))}`;
  },
  webmd(drugs: string[]) { return `https://www.webmd.com/interaction-checker/default.htm?drug_list=${encodeURIComponent(drugs.join(','))}`; },
};
