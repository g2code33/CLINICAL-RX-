/**
 * 🩺 HEALTH API CLIENTS
 *
 * Thin wrappers around the four study health APIs. All calls are client-side
 * GETs with the user's stored key (if configured). CORS varies by API — where
 * the browser blocks a direct call we surface a clickable URL the student can
 * open in a new tab (the data is public, no auth is baked in server-side).
 */

import type { HealthApiKey } from '../types';

type KeyLookup = () => Record<string, HealthApiKey>;

function cfg(getKeys: KeyLookup, id: string): HealthApiKey {
  return getKeys()[id] ?? { name: '', key: '', enabled: false };
}

function withKey(url: URL, paramName: string | null, key: string): URL {
  if (paramName && key) url.searchParams.set(paramName, key);
  return url;
}

/** openFDA — drug labels, adverse events, recalls. Key optional (api_key via api.data.gov). */
export const openFda = {
  async searchLabels(query: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'openfda');
    const url = new URL('https://api.fda.gov/drug/label.json');
    url.searchParams.set('search', `(openfda.brand_name:"${query}") OR (openfda.generic_name:"${query}")`);
    url.searchParams.set('limit', String(limit));
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  async adverseEvents(drug: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'openfda');
    const url = new URL('https://api.fda.gov/drug/event.json');
    url.searchParams.set('search', `patient.drug.medicinalproduct:"${drug}"`);
    url.searchParams.set('count', 'patient.reaction.reactionmeddrapt.exact');
    url.searchParams.set('limit', String(limit));
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  async recalls(query: string, getKeys: KeyLookup, limit = 10) {
    const c = cfg(getKeys, 'openfda');
    const url = new URL('https://api.fda.gov/drug/enforcement.json');
    url.searchParams.set('search', `product_description:"${query}"`);
    url.searchParams.set('limit', String(limit));
    if (c.key?.trim()) url.searchParams.set('api_key', c.key.trim());
    return fetchJson(url);
  },
  labelUrl(query: string) {
    return `https://api.fda.gov/drug/label.json?search=(openfda.brand_name:"${encodeURIComponent(query)}")+OR+(openfda.generic_name:"${encodeURIComponent(query)}")&limit=3`;
  },
};

/** RxNav (NLM) — interactions, RxNorm lookup, approximate match. No key required. */
export const rxNav = {
  async findRxCui(name: string) {
    const url = new URL('https://rxnav.nlm.nih.gov/REST/rxcui.json');
    url.searchParams.set('name', name);
    url.searchParams.set('search', '2'); // approximate
    return fetchJson(url);
  },
  async interactions(rxcuis: string[]) {
    if (!rxcuis.length) return { ok: false, error: 'Enter at least one drug.' };
    const url = new URL('https://rxnav.nlm.nih.gov/REST/interaction/list.json');
    url.searchParams.set('rxcuis', rxcuis.join('+'));
    return fetchJson(url);
  },
  async spellingSuggestions(term: string) {
    const url = new URL('https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json');
    url.searchParams.set('name', term);
    return fetchJson(url);
  },
  async getDrugsByName(name: string) {
    // Returns a list of RxNorm drugs matching a name
    const url = new URL('https://rxnav.nlm.nih.gov/REST/drugs.json');
    url.searchParams.set('name', name);
    return fetchJson(url);
  },
  interactionUrl(rxcuis: string[]) {
    return `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`;
  },
};

/** UMLS (UTS) — terminology search. Requires a UTS API key. */
export const umls = {
  async searchConcept(term: string, sab: string, key: string, limit = 10) {
    if (!key?.trim()) return { ok: false as const, error: 'Add your UMLS UTS API key in Settings → Health APIs first.' };
    // Step 1: get a ticket-granting ticket (TGT), then a service ticket.
    try {
      const tgt = await getUmlsTgt(key);
      if (!tgt.ok) return tgt;
      const ticket = await getUmlsServiceTicket(tgt.tgt);
      const url = new URL('https://uts-ws.nlm.nih.gov/rest/search/current');
      url.searchParams.set('string', term);
      if (sab) url.searchParams.set('sabs', sab);
      url.searchParams.set('ticket', ticket);
      url.searchParams.set('pageSize', String(limit));
      return fetchJson(url);
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'UMLS request failed.' };
    }
  },
};

async function getUmlsTgt(apiKey: string): Promise<{ ok: true; tgt: string } | { ok: false; error: string }> {
  const res = await fetch('https://utslogin.nlm.nih.gov/cas/v1/api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ apikey: apiKey }),
  });
  if (!res.ok) return { ok: false, error: `UMLS auth failed (${res.status}). Check your key.` };
  const text = await res.text();
  // TGT is in the Location header OR in the response body action URL.
  const m = /action="([^"]+)"/.exec(text) || /Location:\s*([^\s]+)/.exec(res.headers.get('location') || '');
  if (!m) return { ok: false, error: 'Could not obtain UMLS ticket.' };
  return { ok: true, tgt: m[1] };
}

async function getUmlsServiceTicket(tgtUrl: string): Promise<string> {
  const res = await fetch(tgtUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ service: 'http://umlsks.nlm.nih.gov' }),
  });
  return await res.text();
}

/**
 * RxList / WebMD — no stable public JSON API, but we can deep-link directly to
 * the search results / drug monograph page so the student lands on the
 * consumer-friendly information in one click.
 */
export const webmd = {
  drugSearchUrl(name: string) {
    return `https://www.rxlist.com/search/rxl/${encodeURIComponent(name)}`;
  },
  conditionSearchUrl(term: string) {
    return `https://www.webmd.com/search/search_results/default.aspx?query=${encodeURIComponent(term)}&source=wbmd`;
  },
  interactionsCheckUrl(drugs: string[]) {
    // RxList drug interaction checker takes a comma list
    return `https://www.rxlist.com/drug-interaction-checker.htm?drug_list=${encodeURIComponent(drugs.join(','))}`;
  },
};

/* ---- small JSON fetch helper with friendly errors ---- */
async function fetchJson(url: URL): Promise<{ ok: true; data: any; url: string } | { ok: false; error: string; url?: string }> {
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (res.status === 404) return { ok: false, error: 'No results found.', url: url.toString() };
    if (res.status === 429) return { ok: false, error: 'Rate limited — add an API key (where applicable) or wait a moment.', url: url.toString() };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, url: url.toString() };
    const data = await res.json();
    return { ok: true, data, url: url.toString() };
  } catch (e: any) {
    // CORS or network error: surface the URL so the student can open directly.
    return { ok: false, error: `Can't call directly from the browser (${e?.message || 'CORS/network'}). Open the URL in a new tab: ${url.toString()}`, url: url.toString() };
  }
}
