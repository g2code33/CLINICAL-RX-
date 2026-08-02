import { EntityManager } from '../components/EntityManager';
import { Pill } from '../components/ui';
import { newDisease } from '../services/defaults';
import { loadSampleData } from '../services/demo';
import { useData } from '../stores/data';

const REVISION_OPTIONS = ['Etiology', 'Pathogenesis', 'Clinical manifestations', 'Diagnosis', 'Treatment', 'Patient counselling'];

export function Diseases() {
  const setStatus = useData((s) => s.setStatus);
  return (
    <EntityManager
      emptyActions={
        <button className="btn-primary" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>🧪 Load sample data</button>
      }
      module="disease"
      explainKind="disease"
      title="Diseases / Conditions"
      subtitle="Apply WHO → WHAT → WHERE → WHY → HOW → DT to each condition."
      icon="🦠"
      emptyText="No conditions recorded yet"
      emptyHint="Capture diseases you encounter using Quick Add or + Add Diseases."
      factory={() => newDisease()}
      searchKeys={['name', 'what']}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Hypertension' },
        { key: 'who', label: 'WHO — Who is affected?', type: 'text' },
        { key: 'what', label: 'WHAT — Clinical picture?', type: 'textarea' },
        { key: 'where', label: 'WHERE — Organ/system?', type: 'text' },
        { key: 'why', label: 'WHY — Pathophysiology?', type: 'textarea' },
        { key: 'how', label: 'HOW — How does it develop?', type: 'textarea' },
        { key: 'dt', label: 'DT — Diagnostic tests', type: 'textarea' },
        { key: 'symptoms', label: 'Symptoms / signs', type: 'tags' },
        { key: 'medicines', label: 'Linked medicines', type: 'tags' },
        { key: 'clinicalReasoning', label: 'Clinical reasoning', type: 'textarea' },
        { key: 'encounters', label: 'Times encountered', type: 'number' },
        { key: 'revision', label: 'Revision coverage', type: 'checkboxes', options: REVISION_OPTIONS },
      ]}
      renderCard={(d) => (
        <div>
          <div className="mb-1 flex items-start justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{d.name || 'Unnamed'}</h3>
            <Pill color="brand">×{d.encounters}</Pill>
          </div>
          <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{d.what || 'No clinical notes yet.'}</p>
          {d.medicines?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {d.medicines.slice(0, 4).map((m: string) => <span key={m} className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] dark:bg-sky-900">{m}</span>)}
            </div>
          )}
        </div>
      )}
    />
  );
}
