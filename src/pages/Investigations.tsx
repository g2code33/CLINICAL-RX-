import { EntityManager } from '../components/EntityManager';
import { Pill } from '../components/ui';
import { newInvestigation } from '../services/defaults';
import { loadSampleData } from '../services/demo';
import { useData } from '../stores/data';

export function Investigations() {
  const setStatus = useData((s) => s.setStatus);
  return (
    <EntityManager
      emptyActions={
        <button className="btn-primary" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>🧪 Load sample data</button>
      }
      module="investigation"
      explainKind="investigation"
      title="Investigations / Labs"
      subtitle="Document tests, why they're requested, results and interpretation."
      icon="🧪"
      emptyText="No investigations recorded yet"
      emptyHint="Capture labs and investigations with Quick Add or + Add Investigations."
      factory={() => newInvestigation()}
      searchKeys={['name', 'interpretation']}
      fields={[
        { key: 'name', label: 'Test', type: 'text', placeholder: 'e.g. FBC' },
        { key: 'whyRequested', label: 'Why requested', type: 'textarea' },
        { key: 'result', label: 'Result', type: 'text' },
        { key: 'referenceRange', label: 'Normal / reference range', type: 'text' },
        { key: 'interpretation', label: 'Interpretation', type: 'textarea' },
        { key: 'clinicalSignificance', label: 'Clinical significance', type: 'textarea' },
        { key: 'linkedConditions', label: 'Linked conditions', type: 'tags' },
        { key: 'encounters', label: 'Times encountered', type: 'number' },
      ]}
      renderCard={(i) => (
        <div>
          <div className="mb-1 flex items-start justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{i.name || 'Unnamed'}</h3>
            <Pill color="brand">×{i.encounters}</Pill>
          </div>
          <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{i.interpretation || i.whyRequested || 'No notes yet.'}</p>
        </div>
      )}
    />
  );
}
