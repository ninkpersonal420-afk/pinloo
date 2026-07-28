// PINLO PIN-GENERATION QUALITY HARNESS — "perfect sweep" edition
// ---------------------------------------------------------------------------
// Runs realistic (product, niche, audience, pain point) cases through the REAL
// production prompt (buildSys/buildMsg/PIN_ANGLES/validatePin are extracted
// verbatim from app/index.html at runtime, so this can never drift), then
// grades every pin three ways:
//
//   HARD checks (objective, must be zero):
//     char limits, exactly-2-sentences, 12-hashtag count + format, banned
//     words, brand/product-name leak, verbatim pain-point paste, title format
//     (no hyphen/colon, question-mark rule).
//   JUDGE (a STRONGER model grades semantics):
//     pain point used + phrased naturally, audience reflected, grammatical,
//     human voice, title is a real hook + on-product, sentence 2 delivers a
//     solution, hashtags relevant & well-mixed, overall on-topic.
//   HEURISTIC (low-confidence backstops): token-overlap fidelity hints.
//
// Reliability: every case is generated RUNS times (default 2) so intermittent
// failures surface. A representative subset is also run across ALL 10 pin
// angles to test hook-style robustness + title distinctness.
//
// Needs ANTHROPIC_API_KEY (env or .dev.vars). Writes tools/pin-quality-results.md
// Run:   node tools/pin-quality-test.mjs
//        RUNS=3 JUDGE_MODEL=claude-sonnet-4-6 node tools/pin-quality-test.mjs
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app', 'index.html');
const GEN_MODEL = process.env.GEN_MODEL || 'claude-haiku-4-5';  // production uses haiku; override to A/B
let   JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-sonnet-4-6'; // stronger judge by default
const RUNS = parseInt(process.env.RUNS || '2', 10);

// ── Extract production prompt builders verbatim (zero drift) ─────────────────
function extractProductionLogic(html) {
  const grab = (re, name) => { const m = html.match(re); if (!m) throw new Error('extract failed: ' + name); return m[1]; };
  const pinAngles = grab(/const PIN_ANGLES = (\[[\s\S]*?\]);/, 'PIN_ANGLES');
  const buildSys  = grab(/(function buildSys\(pinIndex\) \{[\s\S]*?\n\})/, 'buildSys');
  const buildMsg  = grab(/(function buildMsg\(product, niche, audience, benefit, extra\) \{[\s\S]*?\n\})/, 'buildMsg');
  const fixTitle  = grab(/(function fixTitlePunctuation\(title\) \{[\s\S]*?\n\})/, 'fixTitlePunctuation');
  const validate  = grab(/(function validatePin\(p\) \{[\s\S]*?\n\})/, 'validatePin');
  const normTags  = grab(/(function normalizeHashtags\(tags\) \{[\s\S]*?\n\})/, 'normalizeHashtags');
  // eslint-disable-next-line no-new-func
  const api = new Function(`
    let inferredProductDesc = '';
    const PIN_ANGLES = ${pinAngles};
    ${buildSys}${buildMsg}${fixTitle}${validate}${normTags}
    return { buildSys, buildMsg, fixTitlePunctuation, validatePin, normalizeHashtags, angleCount: PIN_ANGLES.length,
             setDesc: d => { inferredProductDesc = d || ''; } };
  `)();
  return api;
}

const BANNED = ['game-changer','unlock','elevate','transform','revolutionize','empower','discover','boost your','maximize','optimize your','achieve your goals','perfect for','lifestyle','journey','amazing','incredible','must-have','level up','next level','step up','unleash','supercharge'];

// ── Cases: every one of the 32 niches + edge cases. brand[] = tokens that must
// NOT appear in copy. firstAudience = the one the model should write to. ─────
const CASES = [
  { product:'leather car seat covers', niche:'Automotive & Vehicles', audience:'people who drive with kids and pets', pain:'Seats get dirty and worn fast' },
  { product:'filtered high-pressure shower head', niche:'Bath & Shower', audience:'renters with weak water pressure and hard water', pain:'Weak water pressure in the shower' },
  { product:'vitamin C face serum', niche:'Beauty & Skincare', audience:'people with dull tired-looking skin', pain:'Skin looks dull and uneven' },
  { product:'clip-on book reading light', niche:'Books & Education', audience:'people who read in bed beside a partner', pain:'Reading in bed keeps your partner awake' },
  { product:'under-sink storage organizer', niche:'Cleaning & Organization', audience:'people with cluttered bathroom cabinets', pain:'Nowhere to store cleaning supplies' },
  { product:'resin art starter kit', niche:'DIY & Crafts', audience:'beginners wanting a first craft project', pain:'Craft projects turn out messy' },
  { product:'high-waisted seamless shapewear', niche:'Fashion & Style', audience:'people dressing for a special event', pain:'Bulges show through fitted dresses' },
  { product:'Adidas gym duffel bag', niche:'Fitness & Gym', audience:'people commuting to early morning workouts', pain:'Gym bag always a disorganized mess', brand:['adidas'] },
  { product:'weekly meal planning recipe binder', niche:'Food & Recipes', audience:'people who never know what to cook', pain:'Run out of dinner ideas every week' },
  { product:'XL RGB gaming mouse pad', niche:'Gaming', audience:'people building a desk battlestation', pain:'Mouse runs out of pad space mid-game' },
  { product:'silk hair bonnet', niche:'Hair Care', audience:'people with curly hair', pain:'Curls get frizzy and flat overnight' },
  { product:'weighted sleep mask', niche:'Health & Wellness', audience:'people who struggle to fall asleep', pain:"Can't shut your mind off at night" },
  { product:'textured ceramic vase set', niche:'Home Decor', audience:'people restyling a living room', pain:'Shelves look bare and unstyled' },
  { product:'spinning fishing reel combo', niche:'Hunting & Fishing', audience:'beginners getting into fishing', pain:'Cheap reels tangle and seize up' },
  { product:'hypoallergenic gold hoop earrings', niche:'Jewelry & Accessories', audience:'people whose ears react to cheap metal', pain:'Earrings turn ears red and itchy' },
  { product:'pre-seasoned cast iron skillet', niche:'Kitchen & Cooking', audience:'people learning to cook real meals', pain:'Food always sticks to the pan' },
  { product:'acoustic guitar capo', niche:'Music & Instruments', audience:'beginner guitarists', pain:'Barre chords are too hard to play' },
  { product:'raised garden bed kit', niche:'Outdoor & Garden', audience:'people with a small backyard', pain:'Soil is too poor to grow anything' },
  { product:'large diaper bag backpack', niche:'Parenting & Family', audience:'new parents of a newborn', pain:'Diaper bag is always a chaotic mess' },
  { product:'cash envelope budgeting wallet', niche:'Personal Finance', audience:'people who overspend every month', pain:'Money disappears before payday' },
  { product:'no-pull dog harness', niche:'Pets', audience:'owners of large strong dogs', pain:'Dog pulls hard on every walk' },
  { product:'phone camera lens kit', niche:'Photography', audience:'people who shoot only on their phone', pain:'Phone photos look flat and amateur' },
  { product:'daily habit tracker journal', niche:'Self Improvement', audience:'people who keep breaking their habits', pain:'New habits never stick past a week' },
  { product:'healing crystal starter set', niche:'Spirituality & Crystals', audience:'', pain:'' },
  { product:'pop-up beach sun shelter', niche:'Sports & Recreation', audience:'families spending the day at the beach', pain:'No shade at the beach' },
  { product:'fountain pen starter set', niche:'Stationery & Journaling', audience:'people who love handwriting', pain:'Cheap pens skip and smudge' },
  { product:'electrolyte powder packets', niche:'Supplements & Nutrition', audience:'runners training for a marathon', pain:'Cramping on long runs' },
  { product:'electric standing desk', niche:'Furniture & Office', audience:'people working from home all day', pain:'Back pain from sitting too long' },
  { product:'wireless charging stand', niche:'Tech & Gadgets', audience:'people with a cluttered nightstand', pain:'Cables tangled all over the desk' },
  { product:'carry-on travel backpack', niche:'Travel', audience:'people who fly carry-on only', pain:'Always overpacking and paying bag fees' },
  { product:'vinyl record cleaning kit', niche:'Vintage & Thrift', audience:'people collecting vinyl records', pain:'Old records crackle and skip' },
  { product:'eucalyptus table garland', niche:'Wedding & Events', audience:'people planning a wedding on a budget', pain:'Venue decor is way over budget' },
  // ── edge cases ──
  { product:'Stanley tumbler', niche:'Kitchen & Cooking', audience:'people who want a drink cold all day', pain:'Drinks go warm within an hour', brand:['stanley'] },
  { product:'insulated water bottle', niche:'Fitness & Gym', audience:'people who hike on weekends, office workers, students, new moms', firstAudience:'people who hike on weekends', pain:'Water goes warm halfway through' },
  { product:'scented soy candle', niche:'Home Decor', audience:'', pain:'' },
  { product:'glass meal prep containers', niche:'Kitchen & Cooking', audience:'people meal prepping for the week', pain:'Leftovers get soggy and leak everywhere' },
  { product:'wireles earbuds for runnning', niche:'Tech & Gadgets', audience:'people who run with music', pain:'Earbuds fall out mid-run' },
  { product:'anxiety relief weighted blanket', niche:'Health & Wellness', audience:'people who feel anxious at night', pain:'Racing thoughts keep you awake' },
];

// products run across ALL angles to test hook-style robustness + distinctness
const ANGLE_PRODUCTS = [
  { product:'Adidas gym duffel bag', niche:'Fitness & Gym', audience:'people commuting to early morning workouts', pain:'Gym bag always a disorganized mess', brand:['adidas'] },
  { product:'vitamin C face serum', niche:'Beauty & Skincare', audience:'people with dull tired-looking skin', pain:'Skin looks dull and uneven' },
  { product:'electric standing desk', niche:'Furniture & Office', audience:'people working from home all day', pain:'Back pain from sitting too long' },
];

// ── Deterministic checks → [{sev, cat, msg}] ────────────────────────────────
const STOP = new Set(['the','a','an','and','or','for','with','your','you','of','to','in','on','that','this','always','never','my','it','is','are','be','i','they','them','who','get','gets']);
const tok = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length>2 && !STOP.has(w));
const firstSentence = d => { const m=(d||'').match(/^.*?[.!?](?:\s|$)/); return (m?m[0]:(d||'')).trim(); };
const sentenceCount = d => (d||'').split(/[.!?]+(?:\s|$)/).map(s=>s.trim()).filter(Boolean).length;

function hardChecks(c, pin) {
  const out = [];
  const add = (cat, msg, sev='HARD') => out.push({ sev, cat, msg });
  const title = pin.title || '', desc = pin.description || '', tags = pin.hashtags || [];
  const t = title.toLowerCase(), d = desc.toLowerCase();

  if (title.length > 100) add('TITLE_LENGTH', `title ${title.length} chars (>100)`);
  if (title.length < 15) add('TITLE_LENGTH', `title too short (${title.length})`);
  if (title.includes(':')) add('TITLE_FORMAT', 'title has colon');
  if (/[.,!;]$/.test(title.trim())) add('TITLE_FORMAT', 'title has trailing punctuation');
  const isQ = /^(who|what|when|where|why|can|could|should|would|are|is|do|does|did)\b/i.test(title) || /^how\b(?!\s+(to|i|we|you)\b)/i.test(title);
  if (isQ && !title.trim().endsWith('?')) add('TITLE_QUESTION', 'question title missing ?');
  if (!isQ && title.trim().endsWith('?')) add('TITLE_QUESTION', 'non-question title ends with ?');

  const sc = sentenceCount(desc);
  if (sc !== 2) add('DESC_SENTENCES', `${sc} sentences (want 2)`);
  if (desc.length > 500) add('DESC_LENGTH', `description ${desc.length} chars (>500)`);
  if (desc.length < 50) add('DESC_LENGTH', `description too short (${desc.length})`);

  if (tags.length !== 12) add('HASHTAG_COUNT', `${tags.length} hashtags (want 12)`);
  tags.forEach(tag => {
    const v = String(tag).replace(/^#/, '');
    if (/\s/.test(v)) add('HASHTAG_FORMAT', `hashtag has space: "${tag}"`);
    if (v !== v.toLowerCase()) add('HASHTAG_FORMAT', `hashtag not lowercase: "${tag}"`);
  });

  const hit = BANNED.filter(b => t.includes(b) || d.includes(b));
  if (hit.length) add('BANNED_WORD', `banned: ${hit.join(', ')}`);

  const brands = (c.brand || []).filter(b => t.includes(b) || d.includes(b));
  if (brands.length) add('BRAND_LEAK', `brand name in copy: ${brands.join(', ')}`);

  if (c.pain && d.includes(c.pain.toLowerCase())) add('VERBATIM_PASTE', `pain reused verbatim: "${c.pain}"`, 'HEURISTIC');

  // heuristic backstops (low confidence — judge is authoritative)
  if (c.pain) {
    const pt = tok(c.pain), s1 = new Set(tok(firstSentence(desc)));
    if (pt.length && !pt.some(w => s1.has(w))) add('PAINPOINT_FIDELITY', 'sentence 1 may not reflect pain (no token overlap)', 'HEURISTIC');
  }
  const aud = c.firstAudience || c.audience;
  if (aud) {
    const at = tok(aud), body = new Set([...tok(title), ...tok(desc)]);
    if (at.length && !at.some(w => body.has(w))) add('AUDIENCE_FIDELITY', 'audience may be ignored (no token overlap)', 'HEURISTIC');
  }
  return out;
}

// ── API plumbing ────────────────────────────────────────────────────────────
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { const m = fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); } catch {}
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function callApi(key, model, system, content, maxTokens) {
  for (let a = 0; ; a++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
    });
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && a < 5) { await sleep(1500 * (a + 1)); continue; }
    if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 140));
    const data = await res.json();
    return (data.content || []).map(x => x.text || '').join('').trim();
  }
}
const parseJson = raw => { try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch {} return null; } };

const JUDGE_SYS = `You are a ruthless QA reviewer for Pinterest affiliate pin copy. You receive the INPUTS the user chose and the GENERATED pin. Grade ONLY against those inputs and Pinterest best practice. Return ONLY JSON:
{"painPointUsed":bool,"painPointNatural":bool,"audienceReflected":bool,"titleHooks":bool,"titleOnProduct":bool,"grammatical":bool,"humanVoice":bool,"descSolution":bool,"hashtagsRelevant":bool,"onTopic":bool,"verdict":"pass|weak|fail","issues":["short specific problems"]}
Definitions (if an input was not given, that field is automatically true):
- painPointUsed: sentence 1 expresses the SAME frustration as the given pain point, not a different one.
- painPointNatural: that frustration reads as a natural, grammatically complete sentence — NOT a pasted fragment (e.g. "Your gym bag always a disorganized mess" is a FAIL).
- audienceReflected: the title OR description concretely reflects the FIRST given audience's situation (routine/moment/setting), not generic everyone-copy.
- titleHooks: the title is a genuine scroll-stopping Pinterest hook, not flat or generic.
- titleOnProduct: the title clearly concerns THIS product, not just the pain in the abstract.
- grammatical: every sentence is complete and correct.
- humanVoice: sounds like a real person; no marketing-bot filler or clichés.
- descSolution: sentence 2 delivers a concrete solution/outcome tied to the product.
- hashtagsRelevant: the 12 tags are real, relevant, and well-mixed (not repetitive or generic filler).
- onTopic: overall copy is specifically about THIS product.
verdict: "fail" if any core field is false or copy is unusable; "weak" if technically ok but bland/loose; "pass" if genuinely good.`;

async function judge(key, c, pin) {
  const content = `INPUTS
Product: ${c.product}
Niche: ${c.niche}
Audience (write for the first): ${c.audience || '(none)'}
Pain point: ${c.pain || '(none)'}

GENERATED PIN
Title: ${pin.title}
Description: ${pin.description}
Hashtags: ${(pin.hashtags || []).join(' ')}`;
  return parseJson(await callApi(key, JUDGE_MODEL, JUDGE_SYS, content, 400)) || { verdict: 'fail', issues: ['judge parse failed'] };
}
function judgeFindings(j) {
  const f = [];
  const M = { painPointUsed:['PAINPOINT_FIDELITY','ignores/changes the pain point'], painPointNatural:['PAINPOINT_NATURAL','pain point unnatural or a pasted fragment'], audienceReflected:['AUDIENCE_FIDELITY','ignores the audience'], titleHooks:['TITLE_HOOK','title is flat/generic, not a hook'], titleOnProduct:['OFFTOPIC','title not clearly about this product'], grammatical:['GRAMMAR','grammar error'], humanVoice:['ROBOTIC','robotic/marketing-bot voice'], descSolution:['DESC_SOLUTION','sentence 2 lacks a concrete solution'], hashtagsRelevant:['HASHTAG_RELEVANCE','hashtags weak/irrelevant/repetitive'], onTopic:['OFFTOPIC','copy generic, not about this product'] };
  for (const k in M) if (j[k] === false) f.push({ sev: 'JUDGE', cat: M[k][0], msg: M[k][1] });
  (j.issues || []).forEach(i => i && f.push({ sev: 'JUDGE', cat: 'JUDGE_NOTE', msg: i }));
  return f;
}

const jaccard = (a, b) => { const A = new Set(tok(a)), B = new Set(tok(b)); if (!A.size || !B.size) return 0; let i = 0; A.forEach(x => B.has(x) && i++); return i / (A.size + B.size - i); };

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const key = loadKey();
  if (!key) { console.error('No API key.'); process.exit(2); }
  const P = extractProductionLogic(fs.readFileSync(APP, 'utf8'));

  // probe judge model; fall back to haiku if unavailable
  try { await callApi(key, JUDGE_MODEL, 'Reply OK.', 'ping', 8); }
  catch (e) { console.error(`judge model ${JUDGE_MODEL} unavailable (${e.message.slice(0,40)}); falling back to ${GEN_MODEL}`); JUDGE_MODEL = GEN_MODEL; }

  const rows = [];   // { c, run, angle, pin, findings[] }
  const genOne = async (c, angle) => {
    P.setDesc('');
    const raw = await callApi(key, GEN_MODEL, P.buildSys(angle), P.buildMsg(c.product, c.niche, c.audience, c.pain, ''), 900);
    const pin = parseJson(raw);
    if (pin && pin.title) pin.title = P.fixTitlePunctuation(pin.title);
    if (pin && pin.hashtags) pin.hashtags = P.normalizeHashtags(pin.hashtags); // mirror production render path
    return pin;
  };

  const CASE_LIMIT = parseInt(process.env.CASE_LIMIT || '0', 10);
  const useCases = CASE_LIMIT ? CASES.slice(0, CASE_LIMIT) : CASES;
  const skipAngles = !!process.env.NO_ANGLES;
  let n = 0, total = useCases.length * RUNS + (skipAngles ? 0 : ANGLE_PRODUCTS.length * P.angleCount);
  // core sweep: every case, RUNS times, angle 0
  for (const c of useCases) {
    for (let run = 0; run < RUNS; run++) {
      n++; process.stderr.write(`\r[${n}/${total}] core: ${c.product} (run ${run + 1})            `);
      let pin = null, findings = [];
      try { pin = await genOne(c, 0); } catch (e) { findings.push({ sev: 'HARD', cat: 'GEN_FAIL', msg: 'gen error: ' + e.message }); }
      if (!pin) { if (!findings.length) findings.push({ sev: 'HARD', cat: 'GEN_FAIL', msg: 'unparseable JSON' }); rows.push({ c, run, angle: 0, pin, findings }); continue; }
      findings = hardChecks(c, pin);
      try { findings = findings.concat(judgeFindings(await judge(key, c, pin))); } catch (e) { findings.push({ sev: 'JUDGE', cat: 'JUDGE_NOTE', msg: 'judge error: ' + e.message }); }
      rows.push({ c, run, angle: 0, pin, findings });
    }
  }
  // angle robustness: subset across all angles
  const angleRows = [];
  for (const c of (skipAngles ? [] : ANGLE_PRODUCTS)) {
    const titles = [];
    for (let ang = 0; ang < P.angleCount; ang++) {
      n++; process.stderr.write(`\r[${n}/${total}] angle: ${c.product} (angle ${ang})            `);
      let pin = null, findings = [];
      try { pin = await genOne(c, ang); } catch (e) { findings.push({ sev: 'HARD', cat: 'GEN_FAIL', msg: 'gen error: ' + e.message }); }
      if (pin) { findings = hardChecks(c, pin); try { findings = findings.concat(judgeFindings(await judge(key, c, pin))); } catch {} titles.push(pin.title || ''); }
      angleRows.push({ c, angle: ang, pin, findings });
    }
    // distinctness across this product's angle titles
    for (let i = 0; i < titles.length; i++) for (let j = i + 1; j < titles.length; j++)
      if (jaccard(titles[i], titles[j]) > 0.6) angleRows.push({ c, angle: -1, pin: null, findings: [{ sev: 'JUDGE', cat: 'DISTINCTNESS', msg: `angles ${i} & ${j} near-duplicate titles` }] });
  }
  process.stderr.write('\n');

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const all = [...rows, ...angleRows];
  const catTally = {}, sevTally = {};
  all.forEach(r => r.findings.forEach(f => { catTally[f.cat] = (catTally[f.cat] || 0) + 1; sevTally[f.sev] = (sevTally[f.sev] || 0) + 1; }));

  // per-case consistency (core sweep)
  const byCase = new Map();
  rows.forEach(r => { const k = r.c.product; if (!byCase.has(k)) byCase.set(k, []); byCase.get(k).push(r); });
  let cleanCases = 0, flakyCases = 0, brokenCases = 0;
  const caseSummary = [];
  for (const [prod, rs] of byCase) {
    const runsClean = rs.filter(r => r.pin && !r.findings.some(f => f.sev !== 'HEURISTIC')).length;
    const status = runsClean === rs.length ? 'clean' : runsClean === 0 ? 'broken' : 'flaky';
    if (status === 'clean') cleanCases++; else if (status === 'broken') brokenCases++; else flakyCases++;
    caseSummary.push({ prod, niche: rs[0].c.niche, runsClean, total: rs.length, status, rs });
  }

  const L = [];
  L.push('# Pinlo pin-generation quality sweep');
  L.push('');
  L.push(`Gen: ${GEN_MODEL} · Judge: ${JUDGE_MODEL} · ${CASES.length} cases × ${RUNS} runs + ${ANGLE_PRODUCTS.length}×${P.angleCount} angle pins = ${all.length} graded pins`);
  L.push('');
  L.push(`**Cases: ${cleanCases} clean · ${flakyCases} flaky (fail some runs) · ${brokenCases} broken (fail all runs)**`);
  L.push(`Findings by severity: ${Object.entries(sevTally).map(([k,v])=>`${k} ${v}`).join(' · ') || 'none'}`);
  L.push('');
  L.push('## Root-cause tally (issues by category, all pins)');
  Object.entries(catTally).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => L.push(`- ${k}: ${v}`));
  if (!Object.keys(catTally).length) L.push('- none 🎉');

  L.push('');
  L.push('## Cases that are flaky or broken');
  caseSummary.filter(c => c.status !== 'clean').sort((a,b)=>a.runsClean-b.runsClean).forEach(c => {
    L.push('');
    L.push(`### ${c.status.toUpperCase()} — ${c.prod} (${c.niche}) — ${c.runsClean}/${c.total} runs clean`);
    c.rs.forEach((r, i) => {
      if (!r.pin) { L.push(`- run ${i+1}: 💥 ${r.findings.map(f=>f.msg).join('; ')}`); return; }
      const probs = r.findings.filter(f => f.sev !== 'HEURISTIC');
      L.push(`- run ${i+1}: ${probs.length ? '⚠️' : '✅'} title: ${r.pin.title}`);
      if (probs.length) { L.push(`    desc: ${r.pin.description}`); probs.forEach(f => L.push(`    ❗ [${f.sev}/${f.cat}] ${f.msg}`)); }
    });
  });

  L.push('');
  L.push('## Angle-robustness findings');
  const angleProb = angleRows.filter(r => r.findings.some(f => f.sev !== 'HEURISTIC'));
  if (!angleProb.length) L.push('- all angles clean across all subset products 🎉');
  angleProb.forEach(r => {
    L.push(`- ${r.c.product} angle ${r.angle}: ${r.pin ? r.pin.title : '(distinctness)'}`);
    r.findings.filter(f => f.sev !== 'HEURISTIC').forEach(f => L.push(`    ❗ [${f.sev}/${f.cat}] ${f.msg}`));
  });

  L.push('');
  L.push('## Clean cases (spot-check sample)');
  caseSummary.filter(c => c.status === 'clean').forEach(c => {
    const r = c.rs.find(x => x.pin);
    L.push(`- **${c.prod}** — ${r.pin.title}`);
  });

  const out = L.join('\n');
  fs.writeFileSync(path.join(__dirname, 'pin-quality-results.md'), out + '\n');
  console.log(out.split('\n').slice(0, 60).join('\n'));
  console.log(`\n...full report: tools/pin-quality-results.md`);
}
main().catch(e => { console.error('\nRun failed:', e.message); process.exit(1); });
