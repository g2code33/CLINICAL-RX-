import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { useData } from '../../stores/data';
import {
  CP_ACTION_TYPES,
  CP_ENCOUNTER_TYPES,
  CP_FOLLOWUPS,
  cpDrugCardPrompt,
  cpEncounterPrompt,
  cpScenarioPrompt,
  CONFIDENCE_LABEL,
  deleteCareerRecord,
  newCPDrugCard,
  newCPEncounter,
  newCPScenario,
  saveCareerRecord,
} from '../../services/career';
import type {
  CPActionType,
  CPDrugCard,
  CPEncounter,
  CPEncounterType,
  CPFollowUp,
  CPScenario,
} from '../../types';
import { todayIso } from '../../services/defaults';
import {
  collectCPBundleContext,
  cpBundleStats,
  CPStudyItem,
  defaultStarters,
  formatCPBundleContext,
  generateStartersPrompt,
  loadStarters,
  loadStudyList,
  parseStartersFromAi,
  resetStarters,
  saveStarters,
  saveStudyList,
} from '../../services/cpLibrary';
import { aiReady, getEffectiveAiConfig, visionReady } from '../../services/aiTools';
import { aiChat } from '../../services/ai';

/**
 * 💊 COMMUNITY PHARMACY WORKSTATION
 *
 * A smart counter simulator + study tool. Log real (or simulated) patient
 * encounters, build a personal OTC/community drug library, practice
 * scenarios, and have an AI preceptor discuss every entry.
 */

type Tab = 'encounters' | 'drugs' | 'scenarios' | 'study' | 'bundler' | 'ai';

export default function CommunityPharmacyPage() {
  const navigate = useNavigate();
  const encounters = useData((s) => s.cpEncounters);
  const drugCards = useData((s) => s.cpDrugCards);
  const scenarios = useData((s) => s.cpScenarios);

  const [tab, setTab] = useState<Tab>('encounters');
  const [openEnc, setOpenEnc] = useState<string | null>(null);
  const [openDrug, setOpenDrug] = useState<string | null>(null);
  const [openScen, setOpenScen] = useState<string | null>(null);
  const [quickQuery, setQuickQuery] = useState('');
  const [starters, setStarters] = useState<string[]>(() => loadStarters());
  const [studyItems, setStudyItems] = useState<CPStudyItem[]>(() => loadStudyList());
  const [showStartersMgr, setShowStartersMgr] = useState(false);

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: 'encounters', label: 'Encounters', icon: '🩺', count: encounters.length },
    { key: 'drugs', label: 'Drug Library', icon: '💊', count: drugCards.length },
    { key: 'scenarios', label: 'Practice', icon: '🎯', count: scenarios.length },
    { key: 'study', label: 'Study', icon: '📘', count: studyItems.filter((i) => !i.mastered).length },
    { key: 'bundler', label: 'Bundler', icon: '📦' },
    { key: 'ai', label: 'Ask Preceptor', icon: '🤖' },
  ];

  const stats = useMemo(() => {
    const referrals = encounters.filter((e) =>
      ['refer-to-doctor', 'refer-emergency', 'contact-prescriber'].includes(e.actionTaken)
    ).length;
    const otcRecs = encounters.filter((e) => e.actionTaken === 'recommend-otc').length;
    const lowConf = encounters.filter((e) => (e.confidence ?? 3) <= 2).length;
    return { total: encounters.length, referrals, otcRecs, lowConf, drugCount: drugCards.length, scenCount: scenarios.length };
  }, [encounters, drugCards, scenarios]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="💊 Community Pharmacy"
        subtitle="Counter practice, OTC consults, dispensing, counselling — with an AI preceptor on every patient."
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="community-pharmacy"
              prompt="You are my community pharmacy preceptor. I'm on my Community Pharmacy workstation — a place where I log patient encounters, build a drug library, and practice scenarios. Ask me what kind of patient just walked in, then role-play the encounter with me step by step: ask WWHAM/ASMETHOD-style questions, probe for red flags, and Socratically guide me to the right recommendation, counselling and referral decision. Be warm, practical and grounded in real community-pharmacy practice in Ghana/West Africa."
            />
            <button className="btn-secondary" onClick={() => navigate('/journey')}>
              ← Journey
            </button>
          </div>
        }
      />

      {/* STATS STRIP */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Encounters" value={stats.total} tone="brand" />
        <Stat label="OTC recs" value={stats.otcRecs} tone="teal" />
        <Stat label="Referrals" value={stats.referrals} tone="amber" />
        <Stat label="Low conf." value={stats.lowConf} tone="red" />
        <Stat label="Drugs studied" value={stats.drugCount} tone="indigo" />
        <Stat label="Scenarios" value={stats.scenCount} tone="violet" />
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              tab === t.key ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-slate-700/60'
            }`}
          >
            {t.icon} {t.label}
            {typeof t.count === 'number' && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ======================= ENCOUNTERS ======================= */}
      {tab === 'encounters' && (
        <EncountersTab
          encounters={encounters}
          drugCards={drugCards}
          openId={openEnc}
          setOpenId={setOpenEnc}
        />
      )}

      {/* ======================= DRUG LIBRARY ======================= */}
      {tab === 'drugs' && (
        <DrugsTab drugCards={drugCards} encounters={encounters} openId={openDrug} setOpenId={setOpenDrug} />
      )}

      {/* ======================= SCENARIOS ======================= */}
      {tab === 'scenarios' && (
        <ScenariosTab
          scenarios={scenarios}
          starters={starters}
          openId={openScen}
          setOpenId={setOpenScen}
          onManageStarters={() => setShowStartersMgr(true)}
        />
      )}

      {/* ======================= STUDY ======================= */}
      {tab === 'study' && <StudyTab studyItems={studyItems} setStudyItems={(l) => { setStudyItems(l); saveStudyList(l); }} />}

      {/* ======================= BUNDLER ======================= */}
      {tab === 'bundler' && <CPBundlerTab />}

      {/* ======================= QUICK AI ======================= */}
      {tab === 'ai' && (
        <QuickAiTab
          quickQuery={quickQuery}
          setQuickQuery={setQuickQuery}
          encounters={encounters}
          drugCards={drugCards}
          studyItems={studyItems}
        />
      )}

      {/* ======================= STARTERS MANAGER MODAL ======================= */}
      {showStartersMgr && (
        <StartersManager
          starters={starters}
          onClose={() => setShowStartersMgr(false)}
          onSave={(list) => { setStarters(list); saveStarters(list); }}
          onReset={() => { const d = defaultStarters(); setStarters(d); saveStarters(d); }}
        />
      )}
    </div>
  );
}

// =========================================================================
// STAT
// =========================================================================
function Stat({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'teal' | 'amber' | 'red' | 'indigo' | 'violet' }) {
  const tones: Record<string, string> = {
    brand: 'from-brand-500 to-emerald-500',
    teal: 'from-teal-500 to-cyan-500',
    amber: 'from-amber-500 to-orange-500',
    red: 'from-rose-500 to-red-500',
    indigo: 'from-indigo-500 to-violet-500',
    violet: 'from-violet-500 to-fuchsia-500',
  };
  return (
    <div className="card flex items-center gap-3 p-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${tones[tone]} text-lg font-bold text-white`}>
        {value}
      </div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

// =========================================================================
// ENCOUNTERS TAB
// =========================================================================
function EncountersTab({
  encounters,
  drugCards,
  openId,
  setOpenId,
}: {
  encounters: CPEncounter[];
  drugCards: CPDrugCard[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<CPEncounterType | 'all'>('all');

  const filtered = encounters.filter((e) => {
    if (typeFilter !== 'all' && e.encounterType !== typeFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.patientPresentation.toLowerCase().includes(q) ||
      (e.recommendedProduct || '').toLowerCase().includes(q) ||
      (e.symptoms || []).some((s) => s.toLowerCase().includes(q))
    );
  });

  async function addEncounter() {
    const enc = newCPEncounter('New patient encounter');
    await saveCareerRecord('cpEncounter', enc);
    setOpenId(enc.id);
  }

  return (
    <div className="space-y-3">
      {/* Add bar */}
      <div className="card flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={addEncounter}>
          + New patient encounter
        </button>
        <input
          className="input flex-1 min-w-[180px]"
          placeholder="Search encounters (symptom, drug, complaint)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CPEncounterType | 'all')}>
          <option value="all">All types</option>
          {CP_ENCOUNTER_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        <div className="text-xs opacity-70">
          Tip: Tap <strong>🤖 Discuss with AI</strong> on any encounter — your preceptor will ask probing questions and teach.
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="card text-center text-sm opacity-70">
          No encounters yet. Tap <strong>+ New patient encounter</strong> to log your first patient — real or simulated.
        </div>
      )}

      {filtered.map((e) =>
        openId === e.id ? (
          <EncounterEditor key={e.id} encounter={e} drugCards={drugCards} onClose={() => setOpenId(null)} />
        ) : (
          <EncounterCard key={e.id} encounter={e} onOpen={() => setOpenId(e.id)} />
        )
      )}
    </div>
  );
}

function EncounterCard({ encounter, onOpen }: { encounter: CPEncounter; onOpen: () => void }) {
  const typeInfo = CP_ENCOUNTER_TYPES.find((t) => t.key === encounter.encounterType);
  const actionInfo = CP_ACTION_TYPES.find((a) => a.key === encounter.actionTaken);
  const redFlagCount = (encounter.redFlags || []).length;

  const toneClass: Record<string, string> = {
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  };

  return (
    <button onClick={onOpen} className="card w-full text-left transition hover:border-brand-400">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg">{typeInfo?.icon}</span>
            <span className="font-semibold">{encounter.title}</span>
            {redFlagCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/50 dark:text-red-200">
                🚨 {redFlagCount} red flag{redFlagCount > 1 ? 's' : ''}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[actionInfo?.tone || 'brand']}`}>
              {actionInfo?.label}
            </span>
          </div>
          <div className="mt-1 line-clamp-2 text-sm opacity-80">{encounter.patientPresentation || '(no patient story yet — tap to fill in)'}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] opacity-70">
            <span>{typeInfo?.label}</span>
            <span>· {encounter.date}</span>
            {encounter.recommendedProduct && <>· <span>💊 {encounter.recommendedProduct}</span></>}
            {encounter.confidence && <>· <span>Conf {encounter.confidence}/5</span></>}
          </div>
        </div>
        <span className="text-sm opacity-50">→</span>
      </div>
    </button>
  );
}

function EncounterEditor({ encounter, drugCards, onClose }: { encounter: CPEncounter; drugCards: CPDrugCard[]; onClose: () => void }) {
  const [e, setE] = useState<CPEncounter>({ ...encounter });
  const [symptomInput, setSymptomInput] = useState('');
  const [comorbInput, setComorbInput] = useState('');
  const [medInput, setMedInput] = useState('');
  const [allergyInput, setAllergyInput] = useState('');
  const [counselInput, setCounselInput] = useState('');
  const [warnInput, setWarnInput] = useState('');
  const [redFlagInput, setRedFlagInput] = useState('');
  const [gapInput, setGapInput] = useState('');

  function patch(p: Partial<CPEncounter>) {
    setE((prev) => ({ ...prev, ...p }));
  }

  function patchCtx(p: Partial<CPEncounter['patientContext']>) {
    setE((prev) => ({ ...prev, patientContext: { ...prev.patientContext, ...p } }));
  }

  async function save() {
    await saveCareerRecord('cpEncounter', { ...e, updatedAt: Date.now() });
  }

  async function saveAndClose() {
    await save();
    onClose();
  }

  async function del() {
    if (!confirm('Delete this encounter?')) return;
    await deleteCareerRecord('cpEncounter', e.id);
    onClose();
  }

  function push(list: keyof CPEncounter, input: string, setInput: (v: string) => void) {
    const v = input.trim();
    if (!v) return;
    const arr = (e[list] as string[] | undefined) || [];
    if (arr.includes(v)) {
      setInput('');
      return;
    }
    patch({ [list]: [...arr, v] } as any);
    setInput('');
  }

  function remove(list: keyof CPEncounter, val: string) {
    const arr = (e[list] as string[] | undefined) || [];
    patch({ [list]: arr.filter((x) => x !== val) } as any);
  }

  const presetRedFlags = [
    'Chest pain / tightness',
    'Difficulty breathing',
    'Slurred speech / facial droop / weakness',
    'Blood in stool / urine / vomit',
    'Black tarry stools',
    'Severe headache / worst ever',
    'High fever in child',
    'Persistent vomiting',
    'Signs of meningitis (stiff neck, photophobia)',
    'Jaundice',
    'Suicidal thoughts',
    'Weight loss + night sweats',
    'Possible pregnancy + abdominal pain',
    'Children under 2 years',
    'Elderly with new confusion',
    'Symptoms lasting > 7-14 days',
  ];

  const aiPrompt = cpEncounterPrompt(e);

  return (
    <div className="card space-y-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input
            className="input text-lg font-semibold"
            value={e.title}
            onChange={(ev) => patch({ title: ev.target.value })}
            placeholder="e.g. 28F headache asking for Paracetamol"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <JourneyAiButton section={`cp-encounter-${e.id}`} prompt={aiPrompt} />
          <button className="btn-secondary" onClick={del} title="Delete">
            🗑
          </button>
          <button className="btn-primary" onClick={saveAndClose}>
            Done
          </button>
        </div>
      </div>

      {/* TOP META */}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={e.encounterType} onChange={(ev) => patch({ encounterType: ev.target.value as CPEncounterType })}>
            {CP_ENCOUNTER_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input className="input" type="date" value={e.date} onChange={(ev) => patch({ date: ev.target.value })} />
        </label>
        <label className="block">
          <span className="label">Confidence (1-5)</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={5}
              value={e.confidence ?? 3}
              onChange={(ev) => patch({ confidence: Number(ev.target.value) as 1 | 2 | 3 | 4 | 5 })}
              className="flex-1"
            />
            <span className="w-24 text-sm font-semibold">{CONFIDENCE_LABEL[e.confidence ?? 3]}</span>
          </div>
        </label>
      </div>

      {/* PATIENT PRESENTATION (verbatim) */}
      <label className="block">
        <span className="label">What the patient actually said (verbatim)</span>
        <textarea
          className="input h-24"
          value={e.patientPresentation}
          onChange={(ev) => patch({ patientPresentation: ev.target.value })}
          placeholder={'e.g. "Auntie Mercy give me something for this headache, it started 2 days ago, I\'m also feeling cold…"\n\nWrite exactly what they said — this is what your AI preceptor will use to teach you.'}
        />
      </label>

      {/* PATIENT CONTEXT */}
      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-sm font-semibold">Patient context (WWHAM / ASMETHOD)</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">Age group</span>
            <select
              className="input"
              value={e.patientContext.ageGroup ?? ''}
              onChange={(ev) => patchCtx({ ageGroup: (ev.target.value || undefined) as any })}
            >
              <option value="">—</option>
              <option value="infant">Infant (0-1)</option>
              <option value="child">Child (2-11)</option>
              <option value="adolescent">Adolescent (12-17)</option>
              <option value="adult">Adult (18-64)</option>
              <option value="elderly">Elderly (65+)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={!!e.patientContext.pregnantOrBreastfeeding}
              onChange={(ev) => patchCtx({ pregnantOrBreastfeeding: ev.target.checked })}
            />
            <span className="text-sm">Pregnant / breastfeeding</span>
          </label>
        </div>

        <ChipInput label="Comorbidities (asthma, hypertension, diabetes, ulcer…)" value={comorbInput} setValue={setComorbInput}
          chips={e.patientContext.comorbidities || []} onAdd={() => {
            const v = comorbInput.trim(); if (!v) return;
            patchCtx({ comorbidities: [...(e.patientContext.comorbidities || []), v] }); setComorbInput('');
          }} onRemove={(c) => patchCtx({ comorbidities: (e.patientContext.comorbidities || []).filter((x) => x !== c) })} />
        <ChipInput label="Current meds (include OTC/herbals)" value={medInput} setValue={setMedInput}
          chips={e.patientContext.currentMeds || []} onAdd={() => {
            const v = medInput.trim(); if (!v) return;
            patchCtx({ currentMeds: [...(e.patientContext.currentMeds || []), v] }); setMedInput('');
          }} onRemove={(c) => patchCtx({ currentMeds: (e.patientContext.currentMeds || []).filter((x) => x !== c) })} />
        <ChipInput label="Allergies" value={allergyInput} setValue={setAllergyInput}
          chips={e.patientContext.allergies || []} onAdd={() => {
            const v = allergyInput.trim(); if (!v) return;
            patchCtx({ allergies: [...(e.patientContext.allergies || []), v] }); setAllergyInput('');
          }} onRemove={(c) => patchCtx({ allergies: (e.patientContext.allergies || []).filter((x) => x !== c) })} />
        <label className="mt-2 block">
          <span className="label">Other notes</span>
          <input className="input" value={e.patientContext.otherNotes || ''}
            onChange={(ev) => patchCtx({ otherNotes: ev.target.value })}
            placeholder="e.g. 'drives a tro-tro', 'first time buying', 'has NHIS'" />
        </label>
      </fieldset>

      {/* SYMPTOMS */}
      <ChipInput
        label="Symptoms presented"
        value={symptomInput}
        setValue={setSymptomInput}
        chips={e.symptoms || []}
        onAdd={() => push('symptoms' as any, symptomInput, setSymptomInput)}
        onRemove={(s) => remove('symptoms' as any, s)}
        placeholder="e.g. frontal headache, fever, runny nose"
      />

      <label className="block">
        <span className="label">Duration / severity</span>
        <input className="input" value={e.duration || ''} onChange={(ev) => patch({ duration: ev.target.value })}
          placeholder="e.g. 2 days, sharp, 7/10, worse at night" />
      </label>

      {/* RED FLAGS */}
      <div>
        <div className="label">🚨 Red flags (must refer if any present)</div>
        <div className="mb-2 flex flex-wrap gap-1">
          {presetRedFlags.map((rf) => {
            const present = (e.redFlags || []).includes(rf);
            return (
              <button
                key={rf}
                type="button"
                onClick={() => {
                  if (present) remove('redFlags' as any, rf);
                  else patch({ redFlags: [...(e.redFlags || []), rf] });
                }}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  present
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50'
                }`}
              >
                {present ? '✓ ' : '+ '}
                {rf}
              </button>
            );
          })}
        </div>
        <ChipInput label="Other red flags" value={redFlagInput} setValue={setRedFlagInput}
          chips={(e.redFlags || []).filter((r) => !presetRedFlags.includes(r))}
          onAdd={() => push('redFlags' as any, redFlagInput, setRedFlagInput)}
          onRemove={(s) => remove('redFlags' as any, s)} />
      </div>

      {/* ACTION */}
      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <div className="mb-2 text-sm font-semibold">Action taken</div>
        <div className="mb-3 flex flex-wrap gap-1">
          {CP_ACTION_TYPES.map((a) => (
            <button key={a.key} type="button"
              onClick={() => patch({ actionTaken: a.key as CPActionType })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                e.actionTaken === a.key ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Product recommended / dispensed</span>
            <input className="input" value={e.recommendedProduct || ''}
              onChange={(ev) => patch({ recommendedProduct: ev.target.value })}
              placeholder="e.g. Paracetamol 500mg tabs, ORS sachets" />
          </label>
          <label className="block">
            <span className="label">Dose / directions given</span>
            <input className="input" value={e.dosageGiven || ''}
              onChange={(ev) => patch({ dosageGiven: ev.target.value })}
              placeholder="e.g. 2 tabs TDS x 3/7, after food" />
          </label>
        </div>

        <ChipInput label="Counselling I gave" value={counselInput} setValue={setCounselInput}
          chips={e.counsellingProvided || []}
          onAdd={() => push('counsellingProvided' as any, counselInput, setCounselInput)}
          onRemove={(s) => remove('counsellingProvided' as any, s)}
          placeholder="Take with food, avoid alcohol, complete the course…" />
        <ChipInput label="Warnings I gave" value={warnInput} setValue={setWarnInput}
          chips={e.warningsGiven || []}
          onAdd={() => push('warningsGiven' as any, warnInput, setWarnInput)}
          onRemove={(s) => remove('warningsGiven' as any, s)}
          placeholder="May cause drowsiness, don't drive…" />

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Follow-up</span>
            <select className="input" value={e.followUp ?? 'none'}
              onChange={(ev) => patch({ followUp: ev.target.value as CPFollowUp })}>
              {CP_FOLLOWUPS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="label">Referral reason (if any)</span>
            <input className="input" value={e.referralReason || ''}
              onChange={(ev) => patch({ referralReason: ev.target.value })}
              placeholder="e.g. suspected peptic ulcer, refer to clinic" />
          </label>
        </div>
      </div>

      {/* REFLECTION + GAPS */}
      <label className="block">
        <span className="label">Reflection (what you found hard, what you'd do differently)</span>
        <textarea className="input h-20" value={e.reflection || ''}
          onChange={(ev) => patch({ reflection: ev.target.value })}
          placeholder="e.g. I almost missed that she was on warfaril — I should always ask about blood thinners first." />
      </label>

      <ChipInput label="Knowledge gaps to study" value={gapInput} setValue={setGapInput}
        chips={e.knowledgeGaps || []}
        onAdd={() => push('knowledgeGaps' as any, gapInput, setGapInput)}
        onRemove={(s) => remove('knowledgeGaps' as any, s)}
        placeholder="e.g. dose of ibuprofen in children, when to refer headache" />

      {/* Linked drug cards */}
      {drugCards.length > 0 && (
        <div>
          <div className="label">Linked drug cards</div>
          <div className="flex flex-wrap gap-1">
            {drugCards.map((d) => {
              const on = (e.drugCardIds || []).includes(d.id);
              return (
                <button key={d.id} type="button"
                  onClick={() => {
                    const ids = new Set(e.drugCardIds || []);
                    if (on) ids.delete(d.id); else ids.add(d.id);
                    patch({ drugCardIds: [...ids] });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    on ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                  }`}>
                  {on ? '✓ ' : ''}
                  {d.genericName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <button className="btn-secondary" onClick={del}>🗑 Delete</button>
        <button className="btn-primary" onClick={saveAndClose}>Save & close</button>
      </div>
    </div>
  );
}

// =========================================================================
// DRUGS TAB
// =========================================================================
function DrugsTab({
  drugCards,
  encounters,
  openId,
  setOpenId,
}: {
  drugCards: CPDrugCard[];
  encounters: CPEncounter[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const [name, setName] = useState('');

  async function add() {
    const n = name.trim() || 'New drug';
    const d = newCPDrugCard(n);
    await saveCareerRecord('cpDrugCard', d);
    setOpenId(d.id);
    setName('');
  }

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-2">
        <input className="input flex-1 min-w-[200px]" placeholder="Add a drug to your library (e.g. Metformin)…"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn-primary" onClick={add}>+ Add drug card</button>
        <div className="w-full text-xs opacity-70">
          Build your own personal community-pharmacy drug deck — the AI will quiz and teach you on each one.
        </div>
      </div>

      {drugCards.length === 0 && (
        <div className="card text-center text-sm opacity-70">
          No drug cards yet. Start with the top OTC movers in your community: paracetamol, ibuprofen, ART, metformin, amoxicillin, ORS, etc.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {drugCards.map((d) =>
          openId === d.id ? (
            <DrugEditor key={d.id} card={d} onClose={() => setOpenId(null)} />
          ) : (
            <DrugCard key={d.id} card={d} encounters={encounters} onOpen={() => setOpenId(d.id)} />
          )
        )}
      </div>
    </div>
  );
}

function DrugCard({ card, encounters, onOpen }: { card: CPDrugCard; encounters: CPEncounter[]; onOpen: () => void }) {
  const usedIn = encounters.filter((e) => (e.drugCardIds || []).includes(card.id)).length;
  return (
    <button onClick={onOpen} className="card h-full w-full text-left transition hover:border-brand-400">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold">💊 {card.genericName}</div>
          <div className="text-[11px] opacity-70">
            {card.schedule || '—'} · {card.drugClass || 'no class yet'} · used in {usedIn} encounter{usedIn === 1 ? '' : 's'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(card.indicationsCommunity || []).slice(0, 3).map((i) => (
              <span key={i} className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{i}</span>
            ))}
          </div>
          <div className="mt-1 text-[11px]">Confidence: <strong>{card.confidence}/5</strong></div>
        </div>
        <span className="text-sm opacity-50">→</span>
      </div>
    </button>
  );
}

function DrugEditor({ card, onClose }: { card: CPDrugCard; onClose: () => void }) {
  const [d, setD] = useState<CPDrugCard>({ ...card });
  const [brand, setBrand] = useState('');
  const [ind, setInd] = useState('');
  const [ci, setCi] = useState('');
  const [cau, setCau] = useState('');
  const [se, setSe] = useState('');
  const [intx, setIntx] = useState('');
  const [counsel, setCounsel] = useState('');
  const [ref, setRef] = useState('');
  const [conf, setConf] = useState('');

  function patch(p: Partial<CPDrugCard>) {
    setD((prev) => ({ ...prev, ...p }));
  }

  function pushList<K extends keyof CPDrugCard>(key: K, v: string, setInput: (s: string) => void) {
    const val = v.trim();
    if (!val) return;
    const arr = (d[key] as string[] | undefined) || [];
    if (arr.includes(val)) { setInput(''); return; }
    patch({ [key]: [...arr, val] } as any);
    setInput('');
  }

  function removeList(key: keyof CPDrugCard, val: string) {
    const arr = (d[key] as string[] | undefined) || [];
    patch({ [key]: arr.filter((x) => x !== val) } as any);
  }

  async function save() {
    await saveCareerRecord('cpDrugCard', { ...d, updatedAt: Date.now() });
  }
  async function saveAndClose() { await save(); onClose(); }
  async function del() {
    if (!confirm('Delete this drug card?')) return;
    await deleteCareerRecord('cpDrugCard', d.id);
    onClose();
  }

  return (
    <div className="card col-span-full space-y-3 lg:col-span-2 xl:col-span-1">
      <div className="flex items-start justify-between gap-2">
        <input className="input flex-1 text-lg font-semibold" value={d.genericName}
          onChange={(e) => patch({ genericName: e.target.value, title: e.target.value })} />
        <JourneyAiButton section={`cp-drug-${d.id}`} prompt={cpDrugCardPrompt(d)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="label">Drug class</span>
          <input className="input" value={d.drugClass || ''} onChange={(e) => patch({ drugClass: e.target.value })} placeholder="e.g. NSAID" />
        </label>
        <label className="block">
          <span className="label">Schedule</span>
          <select className="input" value={d.schedule || 'P'} onChange={(e) => patch({ schedule: e.target.value as any })}>
            <option value="GSL">GSL (general sale)</option>
            <option value="P">P (pharmacy)</option>
            <option value="POM">POM (prescription only)</option>
            <option value="CD">CD (controlled)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Confidence (1-5)</span>
          <input type="range" min={1} max={5} value={d.confidence ?? 2}
            onChange={(e) => patch({ confidence: Number(e.target.value) as any })} className="w-full" />
        </label>
      </div>

      <ChipInput label="Brand names (local)" value={brand} setValue={setBrand}
        chips={d.brandNames || []} onAdd={() => pushList('brandNames', brand, setBrand)} onRemove={(c) => removeList('brandNames', c)} />
      <ChipInput label="Common community indications" value={ind} setValue={setInd}
        chips={d.indicationsCommunity || []} onAdd={() => pushList('indicationsCommunity', ind, setInd)} onRemove={(c) => removeList('indicationsCommunity', c)} />
      <ChipInput label="Contraindications (absolute)" value={ci} setValue={setCi}
        chips={d.contraindications || []} onAdd={() => pushList('contraindications', ci, setCi)} onRemove={(c) => removeList('contraindications', c)} />
      <ChipInput label="Cautions / special populations" value={cau} setValue={setCau}
        chips={d.cautions || []} onAdd={() => pushList('cautions', cau, setCau)} onRemove={(c) => removeList('cautions', c)} />
      <ChipInput label="Common side effects (warn about)" value={se} setValue={setSe}
        chips={d.commonSideEffects || []} onAdd={() => pushList('commonSideEffects', se, setSe)} onRemove={(c) => removeList('commonSideEffects', c)} />
      <ChipInput label="Interactions you MUST catch" value={intx} setValue={setIntx}
        chips={d.interactionsToFlag || []} onAdd={() => pushList('interactionsToFlag', intx, setIntx)} onRemove={(c) => removeList('interactionsToFlag', c)} />
      <ChipInput label="Counselling points (what you'd actually say)" value={counsel} setValue={setCounsel}
        chips={d.counsellingPoints || []} onAdd={() => pushList('counsellingPoints', counsel, setCounsel)} onRemove={(c) => removeList('counsellingPoints', c)} />
      <ChipInput label="Red flags → refer" value={ref} setValue={setRef}
        chips={d.redFlagsRefer || []} onAdd={() => pushList('redFlagsRefer', ref, setRef)} onRemove={(c) => removeList('redFlagsRefer', c)} />
      <ChipInput label="Easily confused with" value={conf} setValue={setConf}
        chips={d.easilyConfusedWith || []} onAdd={() => pushList('easilyConfusedWith', conf, setConf)} onRemove={(c) => removeList('easilyConfusedWith', c)} />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label">Adult dose</span>
          <input className="input" value={d.doseAdult || ''} onChange={(e) => patch({ doseAdult: e.target.value })} placeholder="e.g. 500mg-1g QDS PO max 4g/day" />
        </label>
        <label className="block">
          <span className="label">Paediatric dose</span>
          <input className="input" value={d.doseChild || ''} onChange={(e) => patch({ doseChild: e.target.value })} placeholder="e.g. 10-15mg/kg/dose QDS" />
        </label>
      </div>

      <label className="block">
        <span className="label">Mnemonic / memory hook</span>
        <input className="input" value={d.mnemonic || ''} onChange={(e) => patch({ mnemonic: e.target.value })} />
      </label>

      <div className="flex justify-between gap-2">
        <button className="btn-secondary" onClick={del}>🗑 Delete</button>
        <button className="btn-primary" onClick={saveAndClose}>Save & close</button>
      </div>
    </div>
  );
}

// =========================================================================
// SCENARIOS TAB
// =========================================================================
function ScenariosTab({
  scenarios,
  starters,
  openId,
  setOpenId,
  onManageStarters,
}: {
  scenarios: CPScenario[];
  starters: string[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onManageStarters: () => void;
}) {
  const [text, setText] = useState('');

  async function add(custom?: string) {
    const sc = newCPScenario(custom || text || 'New scenario');
    await saveCareerRecord('cpScenario', sc);
    setOpenId(sc.id);
    setText('');
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[240px]"
            placeholder="Describe a patient scenario…"
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn-primary" onClick={() => add()}>+ New scenario</button>
          <button className="btn-secondary" onClick={onManageStarters} title="Edit starters (JSON or AI-generate more)">⚙️ Manage starters</button>
        </div>
        <div className="text-xs opacity-70">Pick a starter to practise ({starters.length} available), or write your own:</div>
        <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
          {starters.slice(0, 30).map((s, i) => (
            <button key={i} onClick={() => add(s)}
              className="rounded-full bg-slate-100 px-2 py-1 text-[11px] hover:bg-brand-100 dark:bg-slate-800 dark:hover:bg-brand-900/40">
              {s.slice(0, 80)}{s.length > 80 ? '…' : ''}
            </button>
          ))}
          {starters.length > 30 && (
            <button className="text-[11px] opacity-60 underline" onClick={onManageStarters}>… +{starters.length - 30} more</button>
          )}
        </div>
      </div>

      {scenarios.length === 0 && (
        <div className="card text-center text-sm opacity-70">
          No scenarios yet. Try a starter — the AI will play the patient and give you feedback.
        </div>
      )}

      {scenarios.map((s) => openId === s.id ? <ScenarioEditor key={s.id} scen={s} onClose={() => setOpenId(null)} />
        : <ScenarioCard key={s.id} scen={s} onOpen={() => setOpenId(s.id)} />)}
    </div>
  );
}

function ScenarioCard({ scen, onOpen }: { scen: CPScenario; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card w-full text-left transition hover:border-brand-400">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-semibold">🎯 {scen.title}{scen.completed ? ' ✓' : ''}</div>
          <div className="mt-1 line-clamp-2 text-sm opacity-80">{scen.scenario}</div>
          <div className="mt-1 text-[11px] opacity-70">
            Difficulty: {scen.difficulty} · Red flags: {(scen.redFlags || []).length}
          </div>
        </div>
        <span className="text-sm opacity-50">→</span>
      </div>
    </button>
  );
}

function ScenarioEditor({ scen, onClose }: { scen: CPScenario; onClose: () => void }) {
  const [s, setS] = useState<CPScenario>({ ...scen });
  const [rf, setRf] = useState('');
  const [ok, setOk] = useState('');
  const [bad, setBad] = useState('');
  const [tag, setTag] = useState('');

  function patch(p: Partial<CPScenario>) { setS((prev) => ({ ...prev, ...p })); }
  function push(key: 'redFlags' | 'appropriateActions' | 'inappropriateActions' | 'tags', v: string, setInput: (x: string) => void) {
    const val = v.trim(); if (!val) return;
    const arr = (s[key] || []); if (arr.includes(val)) { setInput(''); return; }
    patch({ [key]: [...arr, val] } as any); setInput('');
  }
  function remove(key: 'redFlags' | 'appropriateActions' | 'inappropriateActions' | 'tags', v: string) {
    patch({ [key]: (s[key] || []).filter((x) => x !== v) } as any);
  }

  async function save() { await saveCareerRecord('cpScenario', { ...s, updatedAt: Date.now() }); }
  async function saveClose() { await save(); onClose(); }
  async function del() {
    if (!confirm('Delete this scenario?')) return;
    await deleteCareerRecord('cpScenario', s.id); onClose();
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <input className="input flex-1 text-lg font-semibold" value={s.title}
          onChange={(e) => patch({ title: e.target.value })} />
        <JourneyAiButton section={`cp-scen-${s.id}`} prompt={cpScenarioPrompt(s, true)} />
      </div>

      <label className="block">
        <span className="label">Scenario</span>
        <textarea className="input h-24" value={s.scenario} onChange={(e) => patch({ scenario: e.target.value })} />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label">Difficulty</span>
          <select className="input" value={s.difficulty || 'beginner'} onChange={(e) => patch({ difficulty: e.target.value as any })}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1">
          <input type="checkbox" checked={!!s.completed} onChange={(e) => patch({ completed: e.target.checked })} />
          <span className="text-sm">I've worked this scenario</span>
        </label>
      </div>

      <ChipInput label="🚨 Red flags in this case" value={rf} setValue={setRf} chips={s.redFlags || []}
        onAdd={() => push('redFlags', rf, setRf)} onRemove={(x) => remove('redFlags', x)} />
      <ChipInput label="✓ Appropriate pharmacist actions" value={ok} setValue={setOk} chips={s.appropriateActions || []}
        onAdd={() => push('appropriateActions', ok, setOk)} onRemove={(x) => remove('appropriateActions', x)} />
      <ChipInput label="✗ Inappropriate / dangerous actions" value={bad} setValue={setBad} chips={s.inappropriateActions || []}
        onAdd={() => push('inappropriateActions', bad, setBad)} onRemove={(x) => remove('inappropriateActions', x)} />
      <ChipInput label="Tags" value={tag} setValue={setTag} chips={s.tags || []}
        onAdd={() => push('tags', tag, setTag)} onRemove={(x) => remove('tags', x)} />

      <label className="block">
        <span className="label">Ideal approach / model answer (write after working it, or let AI fill in)</span>
        <textarea className="input h-24" value={s.idealApproach || ''}
          onChange={(e) => patch({ idealApproach: e.target.value })} />
      </label>

      <label className="block">
        <span className="label">My answer / notes</span>
        <textarea className="input h-24" value={s.studentAnswer || ''}
          onChange={(e) => patch({ studentAnswer: e.target.value })}
          placeholder="What would you ask? What would you recommend? What would you say to the patient?" />
      </label>

      <div className="flex justify-between gap-2">
        <button className="btn-secondary" onClick={del}>🗑 Delete</button>
        <button className="btn-primary" onClick={saveClose}>Save & close</button>
      </div>
    </div>
  );
}

// =========================================================================
// QUICK AI TAB
// =========================================================================
function QuickAiTab({
  quickQuery,
  setQuickQuery,
  encounters,
  drugCards,
  studyItems,
}: {
  quickQuery: string;
  setQuickQuery: (s: string) => void;
  encounters: CPEncounter[];
  drugCards: CPDrugCard[];
  studyItems: CPStudyItem[];
}) {
  const navigate = useNavigate();

  const starters = [
    'Role-play: a 30F walks in asking for something for "toilet infection" — interview me step by step using WWHAM',
    'Give me a 10-minute daily community pharmacy study plan covering my study list, top OTC drugs and weak areas',
    'A patient on metformin + glibenclamide asks for cough syrup. What must I check? Walk me through it.',
    'List 15 red flags in headache that mean refer immediately; teach me how to ask about each one.',
    'Compare paracetamol vs ibuprofen for community pharmacy — when each is first-line, key CIs, counselling.',
    'Teach me WWHAM + ASMETHOD + ENCORE questioning frameworks like I\'m a first-year, with a worked example.',
    'Quiz me on one item from my study list (Socratic, one question at a time, give feedback after each answer).',
    'From my recent encounters, what is the one mistake I keep making — show me the evidence.',
  ];

  const recentEnc = encounters.slice(0, 3);
  const recentDrugs = drugCards.slice(0, 5);

  function go(query: string) {
    const highPriority = studyItems.filter((i) => !i.mastered && i.priority === 1).slice(0, 20).map((i) => i.topic).join('; ');
    const studyPrefix = highPriority
      ? `My current high-priority study topics (reference these when relevant): ${highPriority}\n\n`
      : '';
    const params = new URLSearchParams();
    params.set('section', 'community-pharmacy');
    params.set('m', 'career');
    params.set('q', studyPrefix + query);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="font-semibold">🤖 Ask your community pharmacy preceptor</h3>
        <p className="text-sm opacity-70">Ask anything — the AI knows your logged encounters and drug library.</p>
        <textarea
          className="input mt-2 h-24"
          placeholder="e.g. A father just came in asking for something for his 6-year-old with diarrhoea — walk me through it."
          value={quickQuery}
          onChange={(e) => setQuickQuery(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" disabled={!quickQuery.trim()} onClick={() => go(quickQuery)}>
            🤖 Discuss with AI
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold">Starter questions</h3>
        <div className="mt-2 space-y-1">
          {starters.map((s) => (
            <button key={s} onClick={() => go(s)}
              className="block w-full rounded-lg border border-slate-200 p-2 text-left text-sm transition hover:border-brand-400 dark:border-slate-700">
              {s}
            </button>
          ))}
        </div>
      </div>

      {recentEnc.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold">Re-discuss recent encounters</h3>
          <div className="mt-2 space-y-1">
            {recentEnc.map((e) => (
              <button key={e.id} onClick={() => go(cpEncounterPrompt(e))}
                className="block w-full rounded-lg border border-slate-200 p-2 text-left text-sm transition hover:border-brand-400 dark:border-slate-700">
                🩺 {e.title} <span className="opacity-50">({e.date})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {recentDrugs.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold">Study a drug with AI</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {recentDrugs.map((d) => (
              <button key={d.id} onClick={() => go(cpDrugCardPrompt(d))}
                className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                💊 {d.genericName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// SHARED CHIP INPUT
// =========================================================================
function ChipInput({
  label, value, setValue, chips, onAdd, onRemove, placeholder,
}: {
  label: string;
  value: string;
  setValue: (s: string) => void;
  chips: string[];
  onAdd: () => void;
  onRemove: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-2">
      <div className="label">{label}</div>
      <div className="flex gap-1">
        <input className="input flex-1" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder={placeholder || 'Type and press Enter'} />
        <button type="button" className="btn-secondary" onClick={onAdd}>Add</button>
      </div>
      {chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
              {c}
              <button type="button" onClick={() => onRemove(c)} className="opacity-50 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// STUDY TAB — curated list of drug classes / conditions / counselling skills
// to master. Tied into the AI preceptor for quizzing + teaching.
// =========================================================================
const STUDY_KINDS: { key: CPStudyItem['kind']; label: string; icon: string }[] = [
  { key: 'framework', label: 'Frameworks', icon: '🧭' },
  { key: 'drug-class', label: 'Drug classes', icon: '💊' },
  { key: 'drug', label: 'Drugs', icon: '⚗️' },
  { key: 'condition', label: 'Conditions', icon: '🩺' },
  { key: 'symptom', label: 'Symptoms / red flags', icon: '🚨' },
  { key: 'counselling', label: 'Counselling skills', icon: '💬' },
  { key: 'other', label: 'Other', icon: '📌' },
];

function StudyTab({
  studyItems,
  setStudyItems,
}: {
  studyItems: CPStudyItem[];
  setStudyItems: (l: CPStudyItem[]) => void;
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'all' | CPStudyItem['kind']>('all');
  const [newTopic, setNewTopic] = useState('');
  const [newKind, setNewKind] = useState<CPStudyItem['kind']>('drug-class');
  const [newPrio, setNewPrio] = useState<1 | 2 | 3>(2);

  function add() {
    const topic = newTopic.trim();
    if (!topic) return;
    const now = Date.now();
    const item: CPStudyItem = {
      id: 'cp-study-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      kind: newKind, topic, priority: newPrio,
      createdAt: now, updatedAt: now,
    };
    setStudyItems([item, ...studyItems]);
    setNewTopic('');
  }

  function update(id: string, patch: Partial<CPStudyItem>) {
    setStudyItems(studyItems.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)));
  }

  function remove(id: string) {
    setStudyItems(studyItems.filter((i) => i.id !== id));
  }

  const grouped = useMemo(() => {
    const filtered = kind === 'all' ? studyItems : studyItems.filter((i) => i.kind === kind);
    const groups = new Map<string, CPStudyItem[]>();
    for (const it of filtered) {
      const key = it.mastered ? 'mastered' : `p${it.priority}`;
      const list = groups.get(key) ?? [];
      list.push(it);
      groups.set(key, list);
    }
    return groups;
  }, [studyItems, kind]);

  function discuss(item: CPStudyItem) {
    const params = new URLSearchParams();
    params.set('section', 'community-pharmacy');
    params.set('m', 'career');
    params.set('q',
`Teach me this community-pharmacy topic deeply: "${item.topic}" (${item.kind}, priority ${item.priority}).

Give me:
1. A 2-minute "counter-side" summary I can use tomorrow
2. Drug/condition mechanism in plain language
3. Common student mistakes / pitfalls
4. The exact 30-second counselling script
5. Red flags → when I MUST refer
6. 3 Socratic questions to quiz me next
${item.notes ? `My note: ${item.notes}` : ''}`);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }

  function quizMe() {
    const active = studyItems.filter((i) => !i.mastered);
    if (!active.length) return;
    const pool = active.map((i) => `- [${i.kind}] ${i.topic}`).join('\n');
    const params = new URLSearchParams();
    params.set('section', 'community-pharmacy');
    params.set('m', 'career');
    params.set('q',
`Quiz me Socratically on my community-pharmacy study list. Ask ONE question at a time, starting with a high-priority topic. After each answer give frank feedback (what I got right, what I missed, corrections), wait for my reply, then ask the next. Mix drug-class, condition, red-flag and counselling questions. Study list:\n${pool}`);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }

  function generatePlan() {
    const high = studyItems.filter((i) => i.priority === 1 && !i.mastered).map((i) => i.topic);
    const med = studyItems.filter((i) => i.priority === 2 && !i.mastered).map((i) => i.topic);
    const params = new URLSearchParams();
    params.set('section', 'community-pharmacy');
    params.set('m', 'career');
    params.set('q',
`Build me a realistic 14-day community-pharmacy study plan (20-30 min/day) based on my list. Each day: a drug class or condition to study, one red flag to memorise, one counselling skill to practise on a real or simulated patient, and one 1-minute MCQ at the end of the day's entry. Space items using spaced-repetition (prioritise high-priority first, recycle every 3-5 days).

High-priority (do first): ${high.join('; ') || '—'}
Medium: ${med.join('; ') || '—'}`);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">📘 Mastery list</h3>
            <p className="text-xs opacity-70">Every drug class, condition, symptom and counselling skill you want to know cold. Tap 🤖 next to any item for deep teaching; tap the big Quiz button for active recall.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={generatePlan}>🗓 Build 14-day plan</button>
            <button className="btn-primary" onClick={quizMe}>🎯 Quiz me on my list</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[200px]" placeholder="Add a topic (e.g. 'SSRIs — serotonin syndrome in community')"
            value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as CPStudyItem['kind'])}>
            {STUDY_KINDS.map((k) => (<option key={k.key} value={k.key}>{k.icon} {k.label}</option>))}
          </select>
          <select className="input" value={newPrio} onChange={(e) => setNewPrio(Number(e.target.value) as 1 | 2 | 3)}>
            <option value={1}>High priority</option>
            <option value={2}>Medium</option>
            <option value={3}>Someday</option>
          </select>
          <button className="btn-primary" onClick={add}>+ Add</button>
        </div>

        <div className="flex flex-wrap gap-1 pt-1">
          <button onClick={() => setKind('all')}
            className={`rounded-full px-2 py-0.5 text-xs ${kind === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
            All ({studyItems.length})
          </button>
          {STUDY_KINDS.map((k) => {
            const count = studyItems.filter((i) => i.kind === k.key && !i.mastered).length;
            if (!count && kind !== k.key) return null;
            return (
              <button key={k.key} onClick={() => setKind(k.key)}
                className={`rounded-full px-2 py-0.5 text-xs ${kind === k.key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {k.icon} {k.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {(['p1', 'p2', 'p3', 'mastered'] as const).map((g) => {
        const list = grouped.get(g) || [];
        if (!list.length) return null;
        const header = { p1: '🔴 High priority — master now', p2: '🟡 Medium', p3: '🟢 Someday', mastered: '✅ Mastered' }[g];
        return (
          <div key={g} className="card space-y-1">
            <h4 className="text-sm font-semibold">{header} ({list.length})</h4>
            {list.map((it) => {
              const kIcon = STUDY_KINDS.find((k) => k.key === it.kind)?.icon || '📌';
              return (
                <div key={it.id}
                  className={`flex flex-wrap items-start gap-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-700 ${it.mastered ? 'opacity-60' : ''}`}>
                  <span>{kIcon}</span>
                  <div className="flex-1 min-w-[180px]">
                    <div className={it.mastered ? 'line-through' : ''}>{it.topic}</div>
                    {it.notes && <div className="text-xs opacity-70">{it.notes}</div>}
                  </div>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => discuss(it)} title="Discuss/teach with AI">🤖 Teach</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => update(it.id, { mastered: !it.mastered })}>
                    {it.mastered ? '↩ Unmaster' : '✓ Mastered'}
                  </button>
                  <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => remove(it.id)}>×</button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// =========================================================================
// CP BUNDLER — summarise a week/month of encounters/drugs/scenarios.
// =========================================================================
function CPBundlerTab() {
  const navigate = useNavigate();
  const today = todayIso();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>('');
  const [err, setErr] = useState<string>('');

  function preset(days: number) {
    setEnd(today);
    setStart(new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
  }

  async function run() {
    setErr(''); setResult('');
    if (!aiReady('career')) {
      setErr('No AI key available — add one in Settings → AI (one enabled key powers every section).');
      return;
    }
    setRunning(true);
    const ctx = collectCPBundleContext(start, end);
    const stats = cpBundleStats(ctx);
    const statsLine = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(' · ');
    const body = formatCPBundleContext(ctx);
    const system = [
      'You are the Community Pharmacy Bundler AI — a reflective preceptor summarising a period of counter practice.',
      'Structure your response as:',
      '## 📋 SUMMARY · 3-5 sentences of what happened this period',
      '## 🧠 KEY LEARNING THEMES · patterns across encounters (drug classes, conditions, recurring counselling points)',
      '## 🚨 RED FLAGS MISSED / NEAR-MISSES · anything I almost missed or should have escalated',
      '## ⚠️ KNOWLEDGE GAPS · prioritised list of things I need to study, linked to specific encounters',
      '## 📚 RECOMMENDED STUDY · 5-10 concrete items (drug classes, conditions, frameworks) to add to my study list',
      '## 🌟 WHAT I DID WELL · be specific',
      '## 🎯 NEXT 7 DAYS · concrete plan (1 counter challenge per shift, 1 drug class to master, 1 scenario to practise)',
      'Ground every statement in the logged encounters / drug cards / scenarios provided. Do not invent encounters.',
    ].join('\n');
    const prompt = `Stats: ${statsLine}\n\n${body}\n\nProduce the bundle now.`;
    try {
      const cfg = getEffectiveAiConfig('career');
      const res = await aiChat(cfg!, system, prompt, { timeoutMs: 180000 });
      if (res.ok) setResult(res.text);
      else setErr(res.error || 'Something went wrong.');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong.');
    } finally {
      setRunning(false);
    }
  }

  function openInAi() {
    if (!result) return;
    const params = new URLSearchParams();
    params.set('section', 'community-pharmacy');
    params.set('m', 'career');
    params.set('q', `Here is my Community Pharmacy bundle for ${start} → ${end}:\n\n${result}\n\nNow let's discuss: what is the single most important thing I should drill tomorrow? Ask me a Socratic question about it.`);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }

  const ctx = collectCPBundleContext(start, end);
  const stats = cpBundleStats(ctx);

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="font-semibold">📦 Community Pharmacy Bundler</h3>
        <p className="text-xs opacity-70">Summarise a period of counter practice — recurring themes, knowledge gaps, red flags I might have missed, and a concrete study plan. Works just like the Clinical Bundler, but for community pharmacy encounters, drug cards, and scenarios.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm">
            From <input type="date" className="input !py-1" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-sm">
            To <input type="date" className="input !py-1" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button className="btn-ghost text-xs" onClick={() => preset(7)}>Last 7 days</button>
          <button className="btn-ghost text-xs" onClick={() => preset(14)}>2 weeks</button>
          <button className="btn-ghost text-xs" onClick={() => preset(30)}>30 days</button>
          <button className="btn-primary ml-auto" disabled={running} onClick={run}>
            {running ? 'Running…' : '📦 Bundle this period'}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="rounded border border-slate-200 p-2 text-center text-xs dark:border-slate-700">
              <div className="text-base font-semibold">{v}</div>
              <div className="opacity-70">{k}</div>
            </div>
          ))}
        </div>
      </div>

      {err && <div className="card text-sm text-red-600 dark:text-red-400">⚠️ {err}</div>}
      {result && (
        <div className="card space-y-2">
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={openInAi}>🤖 Discuss bundle with AI</button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{result}</div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// STARTERS MANAGER — JSON editor + AI generator
// =========================================================================
function StartersManager({
  starters,
  onClose,
  onSave,
  onReset,
}: {
  starters: string[];
  onClose: () => void;
  onSave: (list: string[]) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(starters.join('\n'));
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [err, setErr] = useState('');

  const currentList = useMemo(() =>
    text.split('\n').map((s) => s.trim()).filter((s) => s.startsWith('-') || /^\d+[\.\)]/.test(s) ? true : s.length > 0)
      .map((s) => s.replace(/^[-*•]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean),
    [text]);

  function parse() {
    onSave(currentList);
    onClose();
  }

  async function generate() {
    setErr('');
    if (!aiReady('career')) {
      setErr('No AI key available — add one in Settings → AI first.');
      return;
    }
    setGenerating(true);
    try {
      const cfg = getEffectiveAiConfig('career');
      const res = await aiChat(cfg!,
        'You generate realistic community-pharmacy counter scenarios for a pharmacy student. Return ONLY a numbered list, no other commentary.',
        generateStartersPrompt(currentList, genCount),
        { temperature: 0.9, timeoutMs: 180000 });
      if (res.ok) {
        const newOnes = parseStartersFromAi(res.text).filter((s) => !currentList.includes(s));
        setText([...currentList, ...newOnes].join('\n'));
      } else {
        setErr(res.error || 'Generation failed.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="card w-full max-w-3xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">⚙️ Manage starter scenarios</h3>
            <p className="text-xs opacity-70">One scenario per line (plain text or JSON array). The AI can also generate more for you.</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>×</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2 dark:border-slate-700">
          <span className="text-sm">Generate</span>
          <input type="number" min={3} max={40} value={genCount}
            onChange={(e) => setGenCount(Math.max(3, Math.min(40, Number(e.target.value) || 10)))}
            className="input !w-20 !py-1" />
          <span className="text-sm">more with AI</span>
          <button className="btn-primary" disabled={generating} onClick={generate}>
            {generating ? 'Generating…' : '🤖 Generate'}
          </button>
          <button className="btn-secondary ml-auto" onClick={onReset}>Reset to defaults</button>
        </div>
        {err && <div className="text-sm text-red-600 dark:text-red-400">⚠️ {err}</div>}

        <textarea
          className="input h-80 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'One scenario per line, e.g.:\nA 40F asks for something for burns from cooking oil…'}
        />
        <div className="text-xs opacity-70">
          {currentList.length} scenarios parsed. Tip: you can paste a JSON array (["…", "…"]) too — bullets and numbering are cleaned up on save.
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={parse}>Save {currentList.length} starters</button>
        </div>
      </div>
    </div>
  );
}
