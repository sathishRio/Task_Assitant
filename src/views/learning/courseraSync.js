// The Coursera sync bookmarklet. `courseraSync` runs on coursera.org (never in this app): it reads
// the learner's courses with their own Coursera session and posts them to POST /api/learning/sync.
// It must stay self-contained, because its source text is what goes into the bookmark.
//
// Coursera has no public API for personal accounts; these are the JSON endpoints its own pages use,
// so they can change. If posting is blocked (Coursera's security policy, or the local API asleep),
// the bookmarklet shows the JSON instead, to paste into the Learning tab's "Import".

export function courseraSync(cfg) {
  const API = 'https://www.coursera.org/api/';
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;width:380px;max-width:calc(100vw - 32px);padding:16px;' +
    'background:#fff;color:#111;border:2px solid #111;border-radius:14px;box-shadow:0 6px 0 #111;font:14px/1.45 system-ui,sans-serif';
  const show = (html) => {
    box.innerHTML = `<b>Task Assistant · Coursera sync</b><div style="margin-top:8px">${html}</div>` +
      '<button style="margin-top:12px;padding:6px 12px;border:1.5px solid #111;border-radius:8px;background:#fff;cursor:pointer">Close</button>';
    box.querySelector('button:last-child').onclick = () => box.remove();
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  if (!/(^|\.)coursera\.org$/.test(location.hostname)) {
    alert('Open coursera.org (signed in), then click this bookmark again.');
    return;
  }
  document.body.appendChild(box);
  show('Reading your courses…');

  // Every call is logged, so a failed sync can show exactly which endpoint answered what.
  const log = [];
  const get = async (path) => {
    const name = path.split('?')[0];
    const r = await fetch(API + path, { credentials: 'include', headers: { accept: 'application/json' } });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      log.push(`${name} → ${r.status} not JSON: ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      throw new Error(`${name} returned a web page, not data`);
    }
    log.push(`${name} → ${r.status}${r.ok ? '' : ` ${text.slice(0, 120)}`}`);
    if (!r.ok) throw new Error(`${name} returned ${r.status}`);
    return data;
  };
  // First endpoint variant that answers with data.
  const first = async (paths) => {
    let err;
    for (const p of paths) {
      try {
        return await get(p);
      } catch (e) {
        err = e;
      }
    }
    throw err;
  };
  const linked = (res, key) => Object.fromEntries(((res.linked || {})[key] || []).map((x) => [x.id, x]));

  // Progress lives in different shapes across Coursera's endpoints: any object keyed by an item id
  // whose value says "Completed" counts. Returns null when no endpoint answered (progress unknown).
  const readProgress = async (userId, courseId, itemIds) => {
    const paths = [
      `onDemandCourseProgress.v1/${userId}~${courseId}`,
      `onDemandLearnerMaterials.v1/?q=learner&learnerId=${userId}&courseId=${courseId}&includes=gradePolicyProgress`,
    ];
    for (const p of paths) {
      let res;
      try {
        res = await get(p);
      } catch {
        continue;
      }
      const done = new Set();
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        for (const [k, v] of Object.entries(node)) {
          if (itemIds.has(k) && /complet/i.test(JSON.stringify(v).slice(0, 400))) done.add(k);
          walk(v);
        }
      };
      walk(res);
      return done;
    }
    return null;
  };

  (async () => {
    const memberships = await first([
      'memberships.v1?q=me&showHidden=true&filter=current,preEnrolled&includes=courseId,courses.v1(partnerIds)' +
        '&fields=courseId,role,lastAccessedTimestamp,courses.v1(name,slug,photoUrl,partnerIds),partners.v1(name)',
      'memberships.v1?q=me&includes=courseId&fields=courseId,role,courses.v1(name,slug,photoUrl,partnerIds)',
      'memberships.v1?q=me',
    ]);
    const elements = (memberships.elements || []).filter((m) => m.role !== 'NOT_ENROLLED' && m.courseId);
    // Membership ids are "<userId>~<courseId>".
    const userId = String(elements[0]?.userId ?? String(elements[0]?.id || '').split('~')[0]);
    if (!elements.length) throw new Error('No enrolled courses found. Are you signed in to Coursera?');

    let courseById = linked(memberships, 'courses.v1');
    let partnerById = linked(memberships, 'partners.v1');
    const missing = elements.map((m) => m.courseId).filter((id) => !courseById[id]);
    if (missing.length) {
      const res = await get(
        `courses.v1?ids=${missing.join(',')}&fields=name,slug,photoUrl,partnerIds,partners.v1(name)&includes=partnerIds`
      ).catch(() => ({}));
      courseById = { ...courseById, ...Object.fromEntries((res.elements || []).map((c) => [c.id, c])) };
      partnerById = { ...partnerById, ...linked(res, 'partners.v1') };
    }
    const enrolled = elements.filter((m) => courseById[m.courseId]?.slug);

    const courses = [];
    for (const [n, m] of enrolled.entries()) {
      const c = courseById[m.courseId];
      show(`Reading course ${n + 1} of ${enrolled.length}:<br><i>${esc(c.name)}</i>`);
      const slug = encodeURIComponent(c.slug);
      const mat = await first([
        `onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules,lessons,items` +
          '&fields=moduleIds,onDemandCourseMaterialModules.v1(name,lessonIds,optional),' +
          'onDemandCourseMaterialLessons.v1(name,itemIds,elementIds,optional),' +
          'onDemandCourseMaterialItems.v2(name,timeCommitment,contentSummary,optional)',
        `onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules,lessons,items`,
      ]).catch(() => null);
      const modulesById = mat ? linked(mat, 'onDemandCourseMaterialModules.v1') : {};
      const lessonsById = mat ? linked(mat, 'onDemandCourseMaterialLessons.v1') : {};
      const itemsById = mat ? linked(mat, 'onDemandCourseMaterialItems.v2') : {};
      const moduleIds = mat?.elements?.[0]?.moduleIds || Object.keys(modulesById);

      const modules = moduleIds.map((id) => modulesById[id]).filter(Boolean).map((mod) => ({
        key: mod.id,
        name: mod.name,
        items: (mod.lessonIds || []).flatMap((lid) => {
          const lesson = lessonsById[lid] || {};
          return (lesson.itemIds || lesson.elementIds || []).map((iid) => itemsById[iid]).filter(Boolean).map((it) => ({
            key: it.id,
            name: it.name,
            type: it.contentSummary?.typeName || '',
            minutes: Math.round((it.timeCommitment || 0) / 60000),
            optional: !!(it.optional || lesson.optional || mod.optional),
          }));
        }),
      }));

      const itemIds = new Set(modules.flatMap((mod) => mod.items.map((it) => it.key)));
      const done = await readProgress(userId, m.courseId, itemIds);
      for (const mod of modules) for (const it of mod.items) it.done = done ? done.has(it.key) : null;

      courses.push({
        courseraId: m.courseId,
        slug: c.slug,
        name: c.name,
        partner: (c.partnerIds || []).map((p) => partnerById[p]?.name).filter(Boolean).join(', '),
        url: `https://www.coursera.org/learn/${c.slug}`,
        photoUrl: c.photoUrl || '',
        modules,
      });
    }

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const payload = { today, courses };
    try {
      const r = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || `status ${r.status}`);
      show(`Synced <b>${courses.length}</b> course${courses.length === 1 ? '' : 's'} ` +
        `(${out.created} new, ${out.newlyDone} item${out.newlyDone === 1 ? '' : 's'} newly done).` +
        `<br><a href="${esc(cfg.appUrl)}" target="_blank" rel="noopener" style="color:#4c76ff;font-weight:600">Open my learning plan →</a>`);
    } catch (e) {
      show(`Read ${courses.length} course${courses.length === 1 ? '' : 's'}, but could not reach the app (${esc(e.message)}).` +
        '<br>Copy this and paste it in <b>Learning → Sync → Import</b>:' +
        '<textarea readonly style="width:100%;height:110px;margin-top:8px;font:11px monospace"></textarea>');
      const ta = box.querySelector('textarea');
      ta.value = JSON.stringify(payload);
      ta.select();
    }
  })().catch((e) => {
    show(`Sync failed: ${esc(e.message)}.<br>Make sure you are signed in to Coursera. If it keeps failing, copy this log for support:` +
      '<textarea readonly style="width:100%;height:110px;margin-top:8px;font:11px monospace"></textarea>');
    const ta = box.querySelector('textarea');
    ta.value = log.join('\n');
    ta.select();
  });
}

// The bookmark's URL: the function's source, called with this account's endpoint and sync token.
export const bookmarkletUrl = (cfg) => `javascript:${encodeURIComponent(`(${courseraSync.toString()})(${JSON.stringify(cfg)})`)}`;
