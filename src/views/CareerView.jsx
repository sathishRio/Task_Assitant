import { useState } from 'react';
import {
  Award, Bot, Briefcase, ChevronRight, Cloud, Code, Flag, Lightbulb, ListPlus, Network, Pencil, Plus, Target, Trash,
} from 'lucide-react';
import { overallProgress, phaseProgress, useStore } from '../store';
import { CERT_STATUSES, TONES, phaseTone } from '../theme';
import { formatDate } from '../dates';
import {
  Badge, Button, Card, Checkbox, EmptyState, IconButton, MetricCard, MicroHeading, PageHero, ProgressBar, SectionTitle, cx,
} from '../ui';
import { CertificationForm, PhaseForm, ProfileForm, TaskForm } from '../forms';
import PhaseModal from './PhaseModal';

const PHASE_ICONS = [Lightbulb, Cloud, Code, Network, Bot, Briefcase];
const phaseIcon = (phase) => PHASE_ICONS[phase.order - 1] || Flag;

export default function CareerView() {
  const { state, actions } = useStore();
  const { profile, phases, certifications, tasks, categories } = state;
  const [openPhaseId, setOpenPhaseId] = useState(null);
  const [newPhase, setNewPhase] = useState(false);
  const [editingCert, setEditingCert] = useState(null); // cert | 'new' | null
  const [editingProfile, setEditingProfile] = useState(false);
  const [newTask, setNewTask] = useState(null); // { phaseId, topicId? } | null

  const overall = overallProgress(phases, tasks);
  const passed = certifications.filter((c) => c.status === 'passed').length;
  const certStatus = (key) => CERT_STATUSES.find((c) => c.key === key) || CERT_STATUSES[0];
  const cycleCert = (cert) => {
    const i = CERT_STATUSES.findIndex((c) => c.key === cert.status);
    actions.updateCertification(cert.id, { status: CERT_STATUSES[(i + 1) % CERT_STATUSES.length].key });
  };

  const subtitle = [profile?.currentRole && `From ${profile.currentRole}`, profile?.experience, profile?.location].filter(Boolean).join(' · ');
  const salaries = [
    ['Now', profile?.currentSalary],
    ['Next (1–2 yrs)', profile?.shortTermTarget],
    ['Then (3–5 yrs)', profile?.mediumTermTarget],
  ].filter(([, v]) => v);

  return (
    <>
      <PageHero
        icon={Target}
        eyebrow="Career Goal"
        title={profile?.goal || 'Set your career goal'}
        description={subtitle}
        actions={<Button variant="soft" icon={Pencil} onClick={() => setEditingProfile(true)}>Edit profile</Button>}
      >
        <div className="flex items-center justify-between mt-5 mb-2 text-xs font-semibold text-stone-700">
          <span>Overall roadmap progress</span>
          <span className="text-base font-extrabold font-display text-emerald-700">{overall}%</span>
        </div>
        <ProgressBar percent={overall} gradient />
        {salaries.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            {salaries.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
          </div>
        )}
        {profile?.principle && <p className="text-sm italic text-stone-500 mt-4">“{profile.principle}”</p>}
      </PageHero>

      <SectionTitle
        icon={Flag}
        subtitle="Click a topic to mark it mastered"
        action={<Button variant="soft" icon={Plus} onClick={() => setNewPhase(true)}>Add phase</Button>}
      >
        Roadmap
      </SectionTitle>
      {phases.length === 0 && <EmptyState text="No phases yet." />}
      <div className="space-y-5">
        {phases.map((p) => {
          const tone = phaseTone(p);
          const Icon = phaseIcon(p);
          const pr = phaseProgress(p, tasks);
          return (
            <Card key={p.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenPhaseId(p.id)}
                className="w-full flex items-start gap-4 p-5 border-b border-stone-100 text-left hover:bg-stone-50/60 transition"
              >
                <span className={cx('w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center', tone.badge)} style={tone.style}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <Badge tone={tone}>Phase {p.order}{p.months ? ` • ${p.months}` : ''}</Badge>
                  <span className="block text-lg font-bold font-display text-stone-900 mt-1.5">{p.title}</span>
                  <span className="block text-xs text-stone-500 mt-0.5">
                    {pr.percent}% complete · {pr.linkedCount} linked task{pr.linkedCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-lg font-extrabold font-display text-stone-900">
                    {p.topics.filter((t) => t.done).length} / {p.topics.length}
                  </span>
                  <span className="block text-[11px] font-semibold text-stone-400">Topics Learned</span>
                </span>
              </button>

              <div className="p-5">
                {p.topics.length > 0 && (
                  <>
                    <MicroHeading hint="Click to mark mastered">What to learn:</MicroHeading>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {p.topics.map((topic) => (
                        <div
                          key={topic.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => actions.updateTopic(p.id, topic.id, { done: !topic.done })}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), actions.updateTopic(p.id, topic.id, { done: !topic.done }))}
                          className={cx(
                            'group flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition',
                            topic.done ? 'bg-emerald-50 border-emerald-200' : 'border-stone-100 hover:border-stone-200 hover:bg-stone-50',
                          )}
                        >
                          <Checkbox round checked={topic.done} label={topic.title} onChange={() => actions.updateTopic(p.id, topic.id, { done: !topic.done })} />
                          <span className={cx('flex-1 text-sm font-medium', topic.done ? 'text-emerald-800' : 'text-stone-800')}>{topic.title}</span>
                          <span className="flex sm:opacity-0 sm:group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                            <IconButton icon={ListPlus} label="Add task for this topic" onClick={() => setNewTask({ phaseId: p.id, topicId: topic.id })} />
                            <IconButton
                              icon={Trash}
                              label="Delete topic"
                              className="hover:text-rose-600 hover:bg-rose-50"
                              onClick={() => window.confirm(`Delete topic "${topic.title}"?`) && actions.deleteTopic(p.id, topic.id)}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {p.deliverable && (
                  <div className={cx('mt-4 p-4 rounded-2xl border', tone.panel)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={cx('text-[11px] font-bold uppercase tracking-wider', tone.text)}>Key Deliverable / Outcome</span>
                      <button type="button" onClick={() => actions.updatePhase(p.id, { deliverableDone: !p.deliverableDone })}>
                        {p.deliverableDone ? (
                          <Badge pill tone={TONES.emerald}>✓ Achieved</Badge>
                        ) : (
                          <Badge pill tone={{ badge: 'bg-white text-stone-700 border-stone-200 hover:border-stone-300' }}>Portfolio Milestone</Badge>
                        )}
                      </button>
                    </div>
                    <div className="text-base font-bold font-display text-stone-900 mt-2">{p.deliverable}</div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                      <button
                        type="button"
                        onClick={() => setNewTask({ phaseId: p.id })}
                        className={cx('inline-flex items-center gap-1.5 text-sm font-bold hover:underline', tone.text)}
                      >
                        <Plus className="w-4 h-4" /> Add Deliverable Task
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenPhaseId(p.id)}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-stone-500 hover:text-stone-900"
                      >
                        Track Goal <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-8 items-start">
        {/* Certifications */}
        <Card className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <Award className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-stone-900">Recommended Certifications Roadmap</h2>
              <p className="text-xs text-stone-500 mt-0.5">Click a status to move it forward; click a row to edit.</p>
            </div>
            <Badge pill tone={TONES.emerald}>{passed} / {certifications.length} Completed</Badge>
          </div>
          <div className="space-y-2">
            {certifications.map((c) => {
              const st = certStatus(c.status);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingCert(c)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingCert(c)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-stone-200 hover:bg-stone-50 cursor-pointer transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md border border-stone-200 text-sm font-bold text-stone-900">{c.code}</span>
                      <span className="text-[10px] font-bold text-stone-400 tracking-wide">{c.optional ? 'OPTIONAL' : 'CORE'}</span>
                    </div>
                    {c.name && <div className="text-sm text-stone-700 mt-1.5 truncate">{c.name}</div>}
                    {c.targetDate && c.status !== 'passed' && <div className="text-[11px] text-stone-500 mt-0.5">Target: {formatDate(c.targetDate)}</div>}
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); cycleCert(c); }} title="Move to next status">
                    <Badge pill tone={st.tone}>{st.label}</Badge>
                  </button>
                </div>
              );
            })}
            {certifications.length === 0 && <p className="text-xs text-stone-500">No certifications yet.</p>}
          </div>
          <Button variant="soft" icon={Plus} className="mt-4" onClick={() => setEditingCert('new')}>Add certification</Button>
        </Card>

        {/* Target roles & focus areas */}
        <Card className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <Briefcase className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Target Roles</h2>
              <p className="text-xs text-stone-500 mt-0.5">High-impact roles you are positioning for.</p>
            </div>
          </div>
          <div className="space-y-2">
            {(profile?.targetRoles || []).map((r, i) => (
              <div key={r} className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-stone-50 border border-stone-100">
                <span className="text-sm font-semibold text-stone-800">{r}</span>
                <Badge tone={TONES.teal}>#{i + 1}</Badge>
              </div>
            ))}
            {!profile?.targetRoles?.length && <p className="text-xs text-stone-500">Add target roles with Edit profile.</p>}
          </div>
          {!!profile?.skillPriorities?.length && (
            <div className="mt-5 pt-5 border-t border-stone-200">
              <MicroHeading>High-value focus areas:</MicroHeading>
              <div className="flex flex-wrap gap-2">
                {profile.skillPriorities.map((skill) => (
                  <span key={skill} className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {openPhaseId && <PhaseModal phaseId={openPhaseId} onClose={() => setOpenPhaseId(null)} />}
      <PhaseForm open={newPhase} phase={null} onClose={() => setNewPhase(false)} />
      <CertificationForm open={!!editingCert} cert={editingCert === 'new' ? null : editingCert} onClose={() => setEditingCert(null)} />
      <ProfileForm open={editingProfile} onClose={() => setEditingProfile(false)} />
      <TaskForm
        open={!!newTask}
        task={null}
        defaults={{ ...newTask, categoryId: categories.find((c) => c.name === 'Career')?.id || null }}
        onClose={() => setNewTask(null)}
      />
    </>
  );
}
