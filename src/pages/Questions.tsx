import { EntityManager } from '../components/EntityManager';
import { Pill } from '../components/ui';
import { newQuestion } from '../services/defaults';

const CATEGORIES = ['pharmacology', 'pathology', 'microbiology', 'therapeutics', 'clinical-pharmacy', 'other'];
const PRIORITIES = ['high', 'medium', 'low'];

export function Questions() {
  return (
    <EntityManager
      module="question"
      title="Questions Vault"
      subtitle="Capture questions to research later."
      icon="❓"
      emptyText="No questions yet"
      emptyHint="Press + Quick Capture at the clinic and add a question in seconds."
      factory={() => newQuestion()}
      searchKeys={['text']}
      fields={[
        { key: 'text', label: 'Question', type: 'textarea' },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
        { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
        { key: 'status', label: 'Status', type: 'select', options: ['open', 'answered'] },
        { key: 'answer', label: 'Answer (once researched)', type: 'textarea' },
      ]}
      renderCard={(q) => (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Pill color={q.status === 'open' ? 'red' : 'green'}>{q.status === 'open' ? 'Open' : 'Answered'}</Pill>
            <Pill color={q.priority === 'high' ? 'red' : q.priority === 'medium' ? 'amber' : 'slate'}>{q.priority}</Pill>
            <Pill color="brand">{q.category}</Pill>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.text}</p>
          {q.answer && <p className="mt-2 line-clamp-3 rounded bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{q.answer}</p>}
        </div>
      )}
    />
  );
}
