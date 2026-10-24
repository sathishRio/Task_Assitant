import { useState } from 'react';
import { ArrowRight, Pencil, Plus, Tags } from 'lucide-react';
import { useStore } from '../store';
import { toneFor } from '../theme';
import { Badge, Button, Card, EmptyState, IconButton, PageHero, ProgressBar, cx } from '../ui';
import { CategoryForm } from '../forms';

export default function CategoriesView({ navigate }) {
  const { state } = useStore();
  const { categories, tasks } = state;
  const [editing, setEditing] = useState(null); // category | 'new' | null

  const uncategorized = tasks.filter((t) => !t.categoryId && t.status !== 'done').length;

  return (
    <>
      <PageHero
        icon={Tags}
        eyebrow="Domains"
        title="Categories"
        description="Group tasks by life domain. Click a category to view its tasks."
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>New Category</Button>}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        {categories.map((c) => {
          const tone = toneFor(c.color);
          const all = tasks.filter((t) => t.categoryId === c.id);
          const done = all.filter((t) => t.status === 'done').length;
          const pct = all.length ? Math.round((done / all.length) * 100) : 0;
          return (
            <Card key={c.id} className="group p-4 hover:shadow-sm hover:border-stone-300 transition">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => navigate('tasks', { categoryId: c.id })}
                  className={cx('w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center text-lg font-bold font-display', tone.badge)}
                  style={tone.style}
                  aria-label={`Show ${c.name} tasks`}
                >
                  {c.name.charAt(0).toUpperCase()}
                </button>
                <button type="button" onClick={() => navigate('tasks', { categoryId: c.id })} className="flex-1 text-left">
                  <Badge tone={tone}>{c.name}</Badge>
                  <div className="text-xs text-stone-500 mt-1.5">{all.length - done} open · {done} done</div>
                </button>
                <IconButton icon={Pencil} label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
              </div>
              <div className="flex items-center gap-3 mt-4">
                <ProgressBar percent={pct} color={tone.accent} thin />
                <span className="text-xs font-bold text-stone-700 w-9 text-right">{pct}%</span>
              </div>
            </Card>
          );
        })}
      </div>
      {categories.length === 0 && (
        <div className="mt-5">
          <EmptyState title="No categories yet" text="Click New Category to create one." />
        </div>
      )}
      {uncategorized > 0 && (
        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => navigate('tasks', { categoryId: 'none' })}>
            {uncategorized} open task{uncategorized > 1 ? 's' : ''} without a category <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      <CategoryForm open={!!editing} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </>
  );
}
