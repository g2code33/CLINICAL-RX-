import { useData } from '../stores/data';
import type { ClinicalDay, Disease, Medicine, Investigation, Question, Lesson } from '../types';
import { uid } from '../stores/data';
import { confirmAction } from '../components/ui/globalConfirm';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadSampleData() {
  const s = useData.getState();
  if (s.diseases.length || s.medicines.length) {
    if (!(await confirmAction({
      title: 'Load sample data?',
      message: 'Sample records will be added alongside your current records so you can explore the app.',
      note: 'They are clearly marked and can be removed again at any time.',
      confirmLabel: 'Load sample data',
    }))) return false;
  }

  const now = Date.now();
  const mk = <T extends { id: string; createdAt: number; updatedAt: number }>(o: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T =>
    ({ ...o, id: uid(), createdAt: now, updatedAt: now } as T);

  // Diseases
  const diseases: Disease[] = [
    mk({ name: 'Hypertension', who: 'Adults, increasingly common in older age', what: 'Persistently elevated blood pressure ≥140/90 mmHg, often asymptomatic (silent killer).', where: 'Cardiovascular system — arterial vasculature', why: 'Increased systemic vascular resistance and/or cardiac output', how: 'Chronic remodelling of arteries, RAAS overactivity, Na+ retention', dt: 'BP measurement, FBC, renal function, urinalysis, ECG', symptoms: ['Headache', 'Dizziness', 'Often none'], medicines: ['Amlodipine', 'Losartan', 'Hydrochlorothiazide'], clinicalReasoning: 'First-line CCB or ARB; monitor BP response', encounters: 5, lastSeen: daysAgo(0), revision: { etiology: true, pathogenesis: true, clinical: true, diagnosis: true, treatment: true, counselling: true } }),
    mk({ name: 'Malaria', who: 'All ages in endemic areas', what: 'Fever, chills, sweating, malaise; may progress to severe disease', where: 'Blood — Plasmodium parasites (RBCs)', why: 'Plasmodium (falciparum, vivax) replication in erythrocytes', how: 'Mosquito (Anopheles) bite → hepatic → erythrocytic cycle', dt: 'Malaria RDT, Blood film (thick/thin), FBC', symptoms: ['Fever', 'Chills', 'Headache', 'Myalgia'], medicines: ['Artemether/Lumefantrine', 'Paracetamol'], clinicalReasoning: 'Prompt ACT within 24h of fever', encounters: 4, lastSeen: daysAgo(1), revision: { etiology: true, pathogenesis: true, clinical: true, diagnosis: true, treatment: true, counselling: false } }),
    mk({ name: 'URTI', who: 'Very common, all ages', what: 'Runny nose, sore throat, cough, mild fever', where: 'Upper respiratory tract', why: 'Viral infection (rhinovirus, coronavirus)', how: 'Droplet transmission → mucosal infection', dt: 'Mostly clinical; throat swab if suspected bacterial', symptoms: ['Rhinorrhoea', 'Sore throat', 'Cough'], medicines: ['Paracetamol', 'Ibuprofen'], clinicalReasoning: 'Supportive care; antibiotics rarely indicated', encounters: 3, lastSeen: daysAgo(2), revision: { etiology: true, pathogenesis: true, clinical: true, diagnosis: false, treatment: true, counselling: true } }),
    mk({ name: 'Type 2 Diabetes', who: 'Adults, associated with obesity', what: 'Hyperglycaemia, polyuria, polydipsia, fatigue', where: 'Metabolic — pancreatic β-cells & insulin targets', why: 'Insulin resistance + relative insulin deficiency', how: 'Progressive β-cell dysfunction', dt: 'Fasting glucose, HbA1c, OGTT', symptoms: ['Polyuria', 'Polydipsia', 'Fatigue'], medicines: ['Metformin'], clinicalReasoning: 'First-line metformin + lifestyle', encounters: 2, lastSeen: daysAgo(3), revision: { etiology: true, pathogenesis: true, clinical: true, diagnosis: false, treatment: false, counselling: true } }),
  ];
  const medicines: Medicine[] = [
    mk({ name: 'Amlodipine', className: 'Calcium channel blocker (dihydropyridine)', mechanism: 'Blocks L-type Ca2+ channels in vascular smooth muscle → vasodilation', indications: ['Hypertension', 'Angina'], dosage: '5–10 mg once daily', routes: ['Oral'], contraindications: ['Severe hypotension', 'Cardiogenic shock'], adverseEffects: ['Ankle edema', 'Flushing', 'Headache'], interactions: ['Strong CYP3A4 inhibitors'], counselling: 'Report ankle swelling; take same time daily', encounters: 5, lastSeen: daysAgo(0) }),
    mk({ name: 'Losartan', className: 'Angiotensin II receptor blocker (ARB)', mechanism: 'Blocks AT1 receptors → vasodilation, ↓ aldosterone', indications: ['Hypertension', 'Diabetic nephropathy'], dosage: '50 mg once daily', routes: ['Oral'], contraindications: ['Pregnancy', 'Bilateral renal artery stenosis'], adverseEffects: ['Hyperkalaemia', 'Dizziness'], interactions: ['K+ supplements', 'NSAIDs'], counselling: 'Avoid in pregnancy', encounters: 4, lastSeen: daysAgo(0) }),
    mk({ name: 'Artemether/Lumefantrine', className: 'Antimalarial (artemisinin combination)', mechanism: 'Artemether → reactive oxygen; lumefantrine inhibits heme detoxification', indications: ['Uncomplicated P. falciparum malaria'], dosage: 'Per weight, 6-dose course over 3 days', routes: ['Oral'], contraindications: ['Severe malaria (IV needed)'], adverseEffects: ['Nausea', 'Headache', 'QT prolongation'], interactions: ['QT-prolonging drugs'], counselling: 'Complete all doses even if fever resolves', encounters: 4, lastSeen: daysAgo(1) }),
    mk({ name: 'Metformin', className: 'Biguanide', mechanism: '↓ hepatic gluconeogenesis, ↑ insulin sensitivity', indications: ['Type 2 diabetes'], dosage: '500 mg–2 g daily in divided doses', routes: ['Oral'], contraindications: ['eGFR <30', 'Metabolic acidosis'], adverseEffects: ['GI upset', 'B12 deficiency'], interactions: ['Iodinated contrast'], counselling: 'Take with meals; watch for lactic acidosis', encounters: 2, lastSeen: daysAgo(3) }),
    mk({ name: 'Paracetamol', className: 'Analgesic / antipyretic', mechanism: 'Central COX inhibition (weak anti-inflammatory)', indications: ['Pain', 'Fever'], dosage: '500 mg–1 g every 4–6h (max 4g/day)', routes: ['Oral'], contraindications: ['Severe hepatic impairment'], adverseEffects: ['Hepatotoxicity (overdose)'], interactions: ['Alcohol'], counselling: 'Do not exceed daily maximum', encounters: 5, lastSeen: daysAgo(0) }),
  ];
  const investigations: Investigation[] = [
    mk({ name: 'FBC', whyRequested: 'Screen for anaemia, infection, malaria', result: 'Hb 12.5 g/dL, WBC 6.2, Platelets 210', referenceRange: 'Hb 12–16 g/dL', interpretation: 'Normal — no anaemia or leukocytosis', clinicalSignificance: 'Ruled out significant haematologic abnormality', linkedConditions: ['Malaria'], encounters: 3, lastSeen: daysAgo(1) }),
    mk({ name: 'Malaria RDT', whyRequested: 'Confirm malaria diagnosis rapidly', result: 'Positive (P.falciparum)', referenceRange: 'Negative', interpretation: 'Malaria confirmed', clinicalSignificance: 'Prompt ACT initiation', linkedConditions: ['Malaria'], encounters: 2, lastSeen: daysAgo(1) }),
    mk({ name: 'Blood pressure measurement', whyRequested: 'Diagnose/monitor hypertension', result: '158/96 mmHg', referenceRange: '<140/90', interpretation: 'Stage 2 hypertension', clinicalSignificance: 'Need antihypertensive therapy', linkedConditions: ['Hypertension'], encounters: 4, lastSeen: daysAgo(0) }),
    mk({ name: 'Fasting glucose', whyRequested: 'Screen for diabetes', result: '6.8 mmol/L', referenceRange: '<6.1', interpretation: 'Impaired fasting glucose / diabetic range', clinicalSignificance: 'Further testing (HbA1c) indicated', linkedConditions: ['Type 2 Diabetes'], encounters: 1, lastSeen: daysAgo(3) }),
  ];
  const questions: Question[] = [
    mk({ text: 'Why was amlodipine chosen over an ACE inhibitor here?', category: 'therapeutics', priority: 'high', status: 'open' }),
    mk({ text: 'What explains ankle edema with amlodipine?', category: 'pharmacology', priority: 'medium', status: 'open' }),
    mk({ text: 'When is IV artesunate indicated over oral ACT?', category: 'therapeutics', priority: 'high', status: 'open' }),
    mk({ text: 'How does RAAS blockade reduce cardiovascular mortality?', category: 'pathology', priority: 'medium', status: 'open' }),
  ];
  const lessons: Lesson[] = [
    mk({ title: 'Silent hypertension', content: 'Most hypertensives are asymptomatic — screening BP is essential.', date: daysAgo(0), important: true }),
    mk({ title: 'Complete malaria ACT course', content: 'Patients must finish all 6 doses even if fever resolves early.', date: daysAgo(1), important: true }),
  ];

  // 4 clinical days over the last week
  const dayTemplates: Array<{ date: string; dayNumber: number; conditions: string[]; medicines: string[]; investigations: string[]; lessons: string[] }> = [
    { date: daysAgo(0), dayNumber: 1, conditions: ['Hypertension', 'URTI'], medicines: ['Amlodipine', 'Losartan', 'Paracetamol'], investigations: ['Blood pressure measurement'], lessons: ['Silent hypertension'] },
    { date: daysAgo(1), dayNumber: 2, conditions: ['Malaria'], medicines: ['Artemether/Lumefantrine', 'Paracetamol'], investigations: ['Malaria RDT', 'FBC'], lessons: ['Complete malaria ACT course'] },
    { date: daysAgo(2), dayNumber: 3, conditions: ['URTI'], medicines: ['Paracetamol', 'Ibuprofen'], investigations: [], lessons: [] },
    { date: daysAgo(3), dayNumber: 4, conditions: ['Type 2 Diabetes', 'Hypertension'], medicines: ['Metformin', 'Amlodipine'], investigations: ['Fasting glucose'], lessons: [] },
  ];
  const days: ClinicalDay[] = dayTemplates.map((t) =>
    mk({ ...t, site: 'Afrancho Polyclinic', observations: [], uncertainties: [], topicsToResearch: [] })
  );

  type Tagged = { module: 'day' | 'disease' | 'medicine' | 'investigation' | 'question' | 'lesson'; rec: unknown };
  const all: Tagged[] = [
    ...days.map((rec) => ({ module: 'day' as const, rec })),
    ...diseases.map((rec) => ({ module: 'disease' as const, rec })),
    ...medicines.map((rec) => ({ module: 'medicine' as const, rec })),
    ...investigations.map((rec) => ({ module: 'investigation' as const, rec })),
    ...questions.map((rec) => ({ module: 'question' as const, rec })),
    ...lessons.map((rec) => ({ module: 'lesson' as const, rec })),
  ];

  const save = useData.getState().save;
  for (const { module, rec } of all) {
    await save(module, { ...(rec as any), sample: true } as any);
  }

  const profile = useData.getState().profile;
  if (profile) {
    await useData.getState().saveProfile({ ...profile, clinicalDay: 4 });
  }
  return true;
}

/** Remove all records that came from sample data (tagged sample:true, or the
 *  known sample names as a fallback for records loaded before tagging). */
export async function removeSampleData() {
  const s = useData.getState();
  if (!s.diseases.length && !s.medicines.length && !s.days.length) return 0;
  if (!(await confirmAction({
    title: 'Remove sample data?',
    message: 'Every record marked as sample data will be deleted.',
    note: 'Your own records are kept — only sample records are removed.',
    confirmLabel: 'Remove sample data',
    destructive: true,
  }))) return 0;

  const SAMPLE_DISEASES = ['Hypertension', 'Malaria', 'URTI', 'Type 2 Diabetes'];
  const SAMPLE_MEDICINES = ['Amlodipine', 'Losartan', 'Artemether/Lumefantrine', 'Metformin', 'Paracetamol'];
  const SAMPLE_INVESTIGATIONS = ['FBC', 'Malaria RDT', 'Blood pressure measurement', 'Fasting glucose'];
  const SAMPLE_QUESTIONS = [
    'Why was amlodipine chosen over an ACE inhibitor here?',
    'What explains ankle edema with amlodipine?',
    'When is IV artesunate indicated over oral ACT?',
    'How does RAAS blockade reduce cardiovascular mortality?',
  ];
  const SAMPLE_LESSONS = ['Silent hypertension', 'Complete malaria ACT course'];

  const isSample = (r: any, names: string[]) => (r?.sample === true) || names.includes(r?.name || r?.title || r?.text || '');

  let removed = 0;
  const remove = s.remove;
  for (const d of s.diseases) if (isSample(d, SAMPLE_DISEASES)) { await remove('disease', d.id); removed++; }
  for (const m of s.medicines) if (isSample(m, SAMPLE_MEDICINES)) { await remove('medicine', m.id); removed++; }
  for (const i of s.investigations) if (isSample(i, SAMPLE_INVESTIGATIONS)) { await remove('investigation', i.id); removed++; }
  for (const q of s.questions) if (isSample(q, SAMPLE_QUESTIONS)) { await remove('question', q.id); removed++; }
  for (const l of s.lessons) if (isSample(l, SAMPLE_LESSONS)) { await remove('lesson', l.id); removed++; }
  // Sample days: any day whose date is one of the last 4 and whose conditions
  // are all sample conditions.
  const sampleDayNames = new Set([...SAMPLE_DISEASES, ...SAMPLE_MEDICINES]);
  for (const d of s.days) {
    if (d.sample === true || (d.conditions.length && d.conditions.every((c) => sampleDayNames.has(c)))) {
      await remove('day', d.id);
      removed++;
    }
  }

  s.setStatus(`✓ Removed ${removed} sample record(s)`);
  return removed;
}
