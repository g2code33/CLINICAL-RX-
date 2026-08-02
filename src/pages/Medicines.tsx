import { EntityManager } from '../components/EntityManager';
import { Pill } from '../components/ui';
import { newMedicine } from '../services/defaults';
import { loadSampleData } from '../services/demo';
import { useData } from '../stores/data';

export function Medicines() {
  const setStatus = useData((s) => s.setStatus);
  return (
    <EntityManager
      emptyActions={
        <button className="btn-primary" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>🧪 Load sample data</button>
      }
      module="medicine"
      explainKind="medicine"
      title="Medicines"
      subtitle="Learn and document every drug you encounter."
      icon="💊"
      emptyText="No medicines recorded yet"
      emptyHint="Capture medicines with Quick Add or + Add Medicines."
      factory={() => newMedicine()}
      searchKeys={['name', 'className']}
      fields={[
        { key: 'name', label: 'Medicine', type: 'text', placeholder: 'e.g. Amlodipine' },
        { key: 'className', label: 'Class', type: 'text', placeholder: 'e.g. Calcium channel blocker' },
        { key: 'mechanism', label: 'Mechanism', type: 'textarea' },
        { key: 'indications', label: 'Indications', type: 'tags' },
        { key: 'dosage', label: 'Dosage', type: 'text' },
        { key: 'routes', label: 'Routes', type: 'tags', placeholder: 'e.g. Oral' },
        { key: 'contraindications', label: 'Contraindications', type: 'tags' },
        { key: 'adverseEffects', label: 'Adverse effects', type: 'tags', placeholder: 'e.g. Ankle edema' },
        { key: 'interactions', label: 'Interactions', type: 'tags' },
        { key: 'counselling', label: 'Counselling points', type: 'textarea' },
        { key: 'encounters', label: 'Times encountered', type: 'number' },
      ]}
      renderCard={(m) => (
        <div>
          <div className="mb-1 flex items-start justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{m.name || 'Unnamed'}</h3>
            <Pill color="brand">×{m.encounters}</Pill>
          </div>
          {m.className && <div className="text-xs font-medium text-brand-600 dark:text-brand-400">{m.className}</div>}
          <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{m.mechanism || 'No mechanism recorded yet.'}</p>
        </div>
      )}
    />
  );
}
