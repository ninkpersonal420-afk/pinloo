// PINLO PIN-GENERATION QUALITY HARNESS
// ---------------------------------------------------------------------------
// Runs realistic (product, niche, audience, pain point) cases through the REAL
// production prompt (buildSys/buildMsg extracted verbatim from app/index.html,
// so this can never drift), then grades every pin two ways:
//
//   1. DETERMINISTIC checks  — char limits, sentence count, hashtag count/format,
//      banned words, brand/product-name leakage, and (critically) verbatim
//      pain-point pasting + input-fidelity backstops.
//   2. LLM-AS-JUDGE          — a second model call rates each pin on whether it
//      uses the pain point naturally, reflects the audience, is grammatical,
//      sounds human, and stays on-topic. This catches the semantic failures
//      that deterministic checks can't see.
//
// Needs an API key (env ANTHROPIC_API_KEY or a .dev.vars file with
// ANTHROPIC_API_KEY=...). Writes tools/pin-quality-results.md.
//
// Run:        node tools/pin-quality-test.mjs
//   JUDGE_MODEL=claude-sonnet-4-6 node tools/pin-quality-test.mjs   (stronger judge)
//   ANGLES=1   -> also test 3 pin "angle" hook styles per case (3x calls)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app', 'index.html');
const GEN_MODEL = 'claude-haiku-4-5'; // must match callClaude in app/index.html
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-haiku-4-5';

// ── Extract production prompt builders verbatim (zero drift) ─────────────────
function extractProductionLogic(html) {
  const grab = (re, name) => { const m = html.match(re); if (!m) throw new Error('extract failed: ' + name); return m[1]; };
  const pinAngles = grab(/const PIN_ANGLES = (\[[\s\S]*?\]);/, 'PIN_ANGLES');
  const buildSys  = grab(/(function buildSys\(pinIndex\) \{[\s\S]*?\n\})/, 'buildSys');
  const buildMsg  = grab(/(function buildMsg\(product, niche, audience, benefit, extra\) \{[\s\S]*?\n\})/, 'buildMsg');
  const fixTitle  = grab(/(function fixTitlePunctuation\(title\) \{[\s\S]*?\n\})/, 'fixTitlePunctuation');
  const validate  = grab(/(function validatePin\(p\) \{[\s\S]*?\n\})/, 'validatePin');
  const src = `
    let inferredProductDesc = '';
    const PIN_ANGLES = ${pinAngles};
    ${buildSys}
    ${buildMsg}
    ${fixTitle}
    ${validate}
    return {
      buildSys, buildMsg, fixTitlePunctuation, validatePin,
      setDesc: d => { inferredProductDesc = d || ''; }
    };
  `;
  // eslint-disable-next-line no-new-func
  return new Function(src)();
}

// ── Banned words/phrases (kept in sync with buildSys) ───────────────────────
const BANNED = ['game-changer','unlock','elevate','transform','revolutionize','empower','discover','boost your','maximize','optimize your','achieve your goals','perfect for','lifestyle','journey','amazing','incredible','must-have','level up','next level','step up','unleash','supercharge','harness'];

// ── Test cases: real products across niches. Some intentionally omit audience
// and/or pain point to verify the "optional input" handling. ────────────────
const CASES = [
  { product:'Adidas gym duffel bag', niche:'Fitness & Gym', audience:'People commuting to early morning workouts', pain:'Gym bag always a disorganized mess' },
  { product:'non-slip yoga mat', niche:'Fitness & Gym', audience:'beginners starting yoga at home', pain:'Mat slides around on hard floors' },
  { product:'electrolyte powder packets', niche:'Supplements & Nutrition', audience:'runners training for a marathon', pain:'Cramping on long runs' },
  { product:'electric standing desk', niche:'Tech & Gadgets', audience:'people working from home all day', pain:'Back pain from sitting too long' },
  { product:'pre-seasoned cast iron skillet', niche:'Kitchen & Cooking', audience:'people learning to cook real meals', pain:'Food always sticks to the pan' },
  { product:'resistance bands set', niche:'Fitness & Gym', audience:'people with no room for a home gym', pain:'No space for bulky equipment' },
  { product:'vitamin C face serum', niche:'Beauty & Skincare', audience:'people with sensitive acne-prone skin', pain:'Breakouts that never fully clear' },
  { product:'no-pull dog harness', niche:'Pets', audience:'owners of large strong dogs', pain:'Dog pulls hard on every walk' },
  { product:'beginner tarot deck', niche:'Spirituality & Crystals', audience:'people new to tarot', pain:'Hard to know where to start' },
  { product:'pop-up camping tent', niche:'Sports & Recreation', audience:'weekend campers', pain:'Tents take forever to set up' },
  { product:'large diaper bag backpack', niche:'Parenting & Family', audience:'new parents of a newborn', pain:'Diaper bag is always a chaotic mess' },
  { product:'waterproof car seat cover', niche:'Automotive & Vehicles', audience:'people who drive with their dog', pain:'Muddy paws ruin the seats' },
  { product:'daily undated planner', niche:'Stationery & Journaling', audience:'people who keep abandoning planners', pain:'Can never stick to a planner' },
  { product:'whey protein powder', niche:'Supplements & Nutrition', audience:'people lifting weights 4 days a week', pain:'Slow recovery between workouts' },
  { product:'robot vacuum cleaner', niche:'Tech & Gadgets', audience:'busy people who hate cleaning', pain:'No time to vacuum every day' },
  { product:'insulated water bottle', niche:'Fitness & Gym', audience:'people who hike on weekends', pain:'Water goes warm halfway through' },
  { product:'ergonomic baby carrier', niche:'Parenting & Family', audience:'', pain:'Back and shoulder pain from carrying baby' },
  { product:'beginner knitting kit', niche:'DIY & Crafts', audience:'total beginners who want a first project', pain:'Patterns are confusing to follow' },
  { product:'cushioned running shoes', niche:'Sports & Recreation', audience:'people just starting to run', pain:'Feet and knees hurt after running' },
  { product:'healing crystal starter set', niche:'Spirituality & Crystals', audience:'', pain:'' },
  { product:'glass meal prep containers', niche:'Kitchen & Cooking', audience:'people meal prepping for the week', pain:'Leftovers get soggy and leak' },
  { product:'LED strip lights', niche:'Tech & Gadgets', audience:'gamers setting up a bedroom battlestation', pain:'Room feels boring and flat' },
  { product:'carry-on travel backpack', niche:'Travel', audience:'people who fly carry-on only', pain:'Always overpacking and paying bag fees' },
  { product:'scented soy candle', niche:'Home Decor', audience:'', pain:'' },
];

// ── Deterministic checks on one pin ─────────────────────────────────────────
const STOP = new Set(['the','a','an','and','or','for','with','your','you','of','to','in','on','that','this','always','never','my','it','is','are','be','i']);
const tokens = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length>2 && !STOP.has(w));

function sentenceCount(desc) {
  return (desc||'').split(/[.!?]+(?:\s|$)/).map(s=>s.trim()).filter(Boolean).length;
}
function firstSentence(desc) {
  const m = (desc||'').match(/^.*?[.!?](?:\s|$)/);
  return (m ? m[0] : (desc||'')).trim();
}

function deterministicChecks(c, pin) {
  const issues = [];
  const title = pin.title || '';
  const desc = pin.description || '';
  const tags = pin.hashtags || [];
  const t = title.toLowerCase(), d = desc.toLowerCase();

  // Title
  if (title.length > 100) issues.push(`title ${title.length} chars (>100 Pinterest limit)`);
  if (title.length < 15) issues.push(`title too short (${title.length})`);
  if (title.includes('-')) issues.push('title has a hyphen (banned)');
  if (title.includes(':')) issues.push('title has a colon (banned)');
  if (/[.,!;]$/.test(title.trim())) issues.push('title has trailing punctuation');
  const isQ = /^(who|what|when|where|why|can|could|should|would|are|is|do|does|did)\b/i.test(title) || /^how\b(?!\s+(to|i|we|you)\b)/i.test(title);
  if (isQ && !title.trim().endsWith('?')) issues.push('question title missing ?');
  if (!isQ && title.trim().endsWith('?')) issues.push('non-question title ends with ?');

  // Description
  const sc = sentenceCount(desc);
  if (sc !== 2) issues.push(`description has ${sc} sentences (want exactly 2)`);
  if (desc.length > 500) issues.push(`description ${desc.length} chars (>500)`);
  if (desc.length < 50) issues.push(`description too short (${desc.length})`);

  // Hashtags
  if (tags.length !== 12) issues.push(`${tags.length} hashtags (want 12)`);
  tags.forEach(tag => {
    const v = String(tag);
    if (/\s/.test(v.replace(/^#/, ''))) issues.push(`hashtag has space: "${v}"`);
    if (v.replace(/^#/, '') !== v.replace(/^#/, '').toLowerCase()) issues.push(`hashtag not lowercase: "${v}"`);
  });

  // Banned words
  const hit = BANNED.filter(b => t.includes(b) || d.includes(b));
  if (hit.length) issues.push(`banned word(s): ${hit.join(', ')}`);

  // Brand/product-name leak: flag capitalized brand-like tokens from the product
  // (skip the generic nouns that legitimately appear, e.g. "bag", "mat").
  const brandTokens = (c.product.match(/\b[A-Z][a-zA-Z]+\b/g) || []);
  const leaked = brandTokens.filter(bt => t.includes(bt.toLowerCase()) || d.includes(bt.toLowerCase()));
  if (leaked.length) issues.push(`possible brand/product-name leak: ${leaked.join(', ')}`);

  // Verbatim pain-point paste (the grammar-break bug)
  if (c.pain && d.includes(c.pain.toLowerCase())) issues.push(`pain point pasted VERBATIM: "${c.pain}"`);

  // Input-fidelity backstops (heuristic; LLM judge is authoritative)
  if (c.pain) {
    const pt = tokens(c.pain), s1 = new Set(tokens(firstSentence(desc)));
    if (pt.length && !pt.some(w => s1.has(w))) issues.push('sentence 1 may not reflect the pain point (no token overlap)');
  }
  if (c.audience) {
    const at = tokens(c.audience), body = new Set([...tokens(title), ...tokens(desc)]);
    if (at.length && !at.some(w => body.has(w))) issues.push('audience may be ignored (no token overlap in title/desc)');
  }
  return issues;
}

// ── API plumbing ────────────────────────────────────────────────────────────
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    const dv = fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8');
    const m = dv.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callApi(key, model, system, userContent, maxTokens) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userContent }] })
    });
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 5) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 160));
    const data = await res.json();
    return (data.content || []).map(c => c.text || '').join('').trim();
  }
}
function parseJson(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; }
}

const JUDGE_SYS = `You are a strict QA reviewer for Pinterest affiliate pin copy. You are given the INPUTS a user selected and the GENERATED pin. Judge ONLY against the inputs. Return ONLY JSON:
{"usesPainPoint":true/false,"painPointNatural":true/false,"reflectsAudience":true/false,"grammatical":true/false,"soundsHuman":true/false,"onTopicForProduct":true/false,"issues":["short specific problems, [] if none"]}
- usesPainPoint: does sentence 1 of the description express the SAME frustration as the given pain point (not a different one)? If no pain point was given, return true.
- painPointNatural: is it phrased as natural grammar, NOT a pasted sentence-fragment? If no pain point, true.
- reflectsAudience: does the title OR description reflect the given audience's specific situation? If no audience given, true.
- grammatical: is every sentence grammatically complete and correct?
- soundsHuman: would a real person write this, free of marketing-bot filler?
- onTopicForProduct: is the copy specifically about THIS product (not generic niche copy)?`;

async function judge(key, c, pin) {
  const userContent = `INPUTS\nProduct: ${c.product}\nNiche: ${c.niche}\nAudience: ${c.audience || '(none given)'}\nPain point: ${c.pain || '(none given)'}\n\nGENERATED PIN\nTitle: ${pin.title}\nDescription: ${pin.description}`;
  const raw = await callApi(key, JUDGE_MODEL, JUDGE_SYS, userContent, 300);
  return parseJson(raw) || { issues: ['judge parse failed'] };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const key = loadKey();
  if (!key) { console.error('No API key (env ANTHROPIC_API_KEY or .dev.vars). Cannot run quality sweep.'); process.exit(2); }
  const html = fs.readFileSync(APP, 'utf8');
  const P = extractProductionLogic(html);
  const useAngles = !!process.env.ANGLES;
  const angleIdxs = useAngles ? [0, 1, 2] : [0];

  const rows = [];
  let pinNum = 0;
  for (const c of CASES) {
    for (const ai of angleIdxs) {
      pinNum++;
      P.setDesc(''); // no inferred description in the harness; mirrors a fresh product
      const sys = P.buildSys(ai);
      const msg = P.buildMsg(c.product, c.niche, c.audience, c.pain, '');
      let pin = null, genErr = null;
      try {
        const raw = await callApi(key, GEN_MODEL, sys, msg, 900);
        pin = parseJson(raw);
        if (pin && pin.title) pin.title = P.fixTitlePunctuation(pin.title);
      } catch (e) { genErr = e.message; }
      process.stderr.write(`\r[${pinNum}] ${c.product} (angle ${ai})            `);

      if (!pin) { rows.push({ c, ai, pin: null, det: ['GENERATION FAILED: ' + (genErr || 'bad JSON')], j: null }); continue; }
      const det = deterministicChecks(c, pin);
      let j = null;
      try { j = await judge(key, c, pin); } catch (e) { j = { issues: ['judge error: ' + e.message] }; }
      rows.push({ c, ai, pin, det, j });
    }
  }
  process.stderr.write('\n');

  // ── Report ────────────────────────────────────────────────────────────────
  const judgeFlags = j => {
    if (!j) return [];
    const f = [];
    if (j.usesPainPoint === false) f.push('IGNORES pain point');
    if (j.painPointNatural === false) f.push('pain point unnatural/fragment');
    if (j.reflectsAudience === false) f.push('IGNORES audience');
    if (j.grammatical === false) f.push('grammar error');
    if (j.soundsHuman === false) f.push('robotic voice');
    if (j.onTopicForProduct === false) f.push('off-topic/generic');
    (j.issues || []).forEach(i => i && f.push(i));
    return f;
  };

  const L = [];
  L.push('# Pinlo pin-generation quality sweep');
  L.push('');
  L.push(`Gen model: ${GEN_MODEL} · Judge model: ${JUDGE_MODEL} · cases: ${CASES.length}${useAngles ? ' × 3 angles' : ''}`);
  L.push('');
  let clean = 0, flagged = 0, failed = 0;
  const detail = [];
  rows.forEach((r, i) => {
    const jf = judgeFlags(r.j);
    const all = [...r.det, ...jf];
    if (r.pin === null) failed++;
    else if (all.length === 0) clean++;
    else flagged++;
    const status = r.pin === null ? '💥 FAIL' : all.length === 0 ? '✅ clean' : '⚠️ ' + all.length;
    detail.push({ i, r, all, status });
  });
  L.push(`**${clean} clean · ${flagged} flagged · ${failed} generation-failed** out of ${rows.length} pins.`);
  L.push('');
  L.push('## Flagged & failed pins');
  detail.filter(x => x.r.pin === null || x.all.length).forEach(({ i, r, all, status }) => {
    L.push('');
    L.push(`### ${i + 1}. ${status} — ${r.c.product}`);
    L.push(`- niche: ${r.c.niche} · audience: ${r.c.audience || '(none)'} · pain: ${r.c.pain || '(none)'}`);
    if (r.pin) {
      L.push(`- title: ${r.pin.title}`);
      L.push(`- desc: ${r.pin.description}`);
    }
    all.forEach(x => L.push(`  - ❗ ${x}`));
  });
  L.push('');
  L.push('## All clean pins (for spot-checking)');
  detail.filter(x => x.r.pin && x.all.length === 0).forEach(({ i, r }) => {
    L.push(`- **${r.c.product}** — ${r.pin.title}`);
  });

  const out = L.join('\n');
  fs.writeFileSync(path.join(__dirname, 'pin-quality-results.md'), out + '\n');
  console.log(out);
}

main().catch(e => { console.error('\nRun failed:', e.message); process.exit(1); });
