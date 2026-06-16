// PINLO NICHE DETECTION — STRESS TEST HARNESS
// ---------------------------------------------------------------------------
// Runs the REAL resolution pipeline (NICHE_ALIASES -> fuzzyMatchNiche ->
// resolveToPillNiche) against 100 adversarial products + a resolution mini-suite.
//
// MODES:
//   - LIVE   : if ANTHROPIC_API_KEY is set (env or .dev.vars), it calls the real
//              classifier (model claude-haiku-4-5, max_tokens 80) using the LIVE
//              system prompt extracted from app/index.html, then resolves the
//              answer. This is true ground truth.
//   - SIM    : if no key, it uses the `raw` field on each product (the niche a
//              human auditor predicts the model returns under the current prompt)
//              and resolves that. Reliable for resolution/gap analysis, NOT for
//              brand recognition or nondeterministic flapping.
//
// Run (simulated):  node tools/niche-stress-test.mjs
// Run (live):        $env:ANTHROPIC_API_KEY="sk-ant-..."; node tools/niche-stress-test.mjs
//   - Override runs-per-product (default 3):  $env:RUNS="1"
//   - LIVE mode extracts the system prompt from app/index.html at runtime,
//     so the test always matches production. ~100*RUNS Haiku calls per run.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app', 'index.html');

// ── Ported production logic (kept verbatim; drift-checked below) ─────────────
const NICHE_PILL_LABELS = {'Automotive & Vehicles':'Automotive','Beauty & Skincare':'Beauty','Books & Education':'Books','Cleaning & Organization':'Cleaning','DIY & Crafts':'DIY','Fashion & Style':'Fashion','Fitness & Gym':'Fitness','Food & Recipes':'Food','Gaming':'Gaming','Hair Care':'Hair','Health & Wellness':'Health','Home Decor':'Home Decor','Hunting & Fishing':'Hunt & Fish','Jewelry & Accessories':'Jewelry','Kitchen & Cooking':'Kitchen','Music & Instruments':'Music','Outdoor & Garden':'Outdoor','Parenting & Family':'Parenting','Personal Finance':'Finance','Pets':'Pets','Photography':'Photography','Self Improvement':'Self Improvement','Spirituality & Crystals':'Spirituality','Sports & Recreation':'Sports','Stationery & Journaling':'Stationery','Supplements & Nutrition':'Supplements','Tech & Gadgets':'Tech','Travel':'Travel','Vintage & Thrift':'Vintage','Wedding & Events':'Wedding'};

const NICHE_ALIASES = {
  'automotive':'Automotive & Vehicles','vehicles':'Automotive & Vehicles','cars':'Automotive & Vehicles','car':'Automotive & Vehicles','car accessories':'Automotive & Vehicles','motorcycle':'Automotive & Vehicles','motorcycles':'Automotive & Vehicles','motorbike':'Automotive & Vehicles','auto':'Automotive & Vehicles',
  'cycling':'Sports & Recreation','bike':'Sports & Recreation','bicycle':'Sports & Recreation','camping':'Sports & Recreation','hiking':'Sports & Recreation','outdoor recreation':'Sports & Recreation','outdoor adventure':'Sports & Recreation','sports':'Sports & Recreation','recreation':'Sports & Recreation','equestrian':'Sports & Recreation','horse':'Sports & Recreation','horseback riding':'Sports & Recreation','horse riding':'Sports & Recreation','skateboarding':'Sports & Recreation','surfing':'Sports & Recreation','climbing':'Sports & Recreation',
  'hunting':'Hunting & Fishing','fishing':'Hunting & Fishing','angling':'Hunting & Fishing','archery':'Hunting & Fishing','tackle':'Hunting & Fishing',
  'tools':'DIY & Crafts','tool':'DIY & Crafts','power tools':'DIY & Crafts','hand tools':'DIY & Crafts','hardware':'DIY & Crafts','home improvement':'DIY & Crafts','woodworking':'DIY & Crafts',
  'optics':'Tech & Gadgets','telescope':'Tech & Gadgets','microscope':'Tech & Gadgets','binoculars':'Tech & Gadgets','rc':'Tech & Gadgets','remote control':'Tech & Gadgets','drones':'Tech & Gadgets',
  'outdoors':'Outdoor & Garden','gardening':'Outdoor & Garden','garden':'Outdoor & Garden',
  'music':'Music & Instruments','instruments':'Music & Instruments','musical instruments':'Music & Instruments','guitar':'Music & Instruments',
  'spirituality':'Spirituality & Crystals','crystals':'Spirituality & Crystals','astrology':'Spirituality & Crystals','tarot':'Spirituality & Crystals','metaphysical':'Spirituality & Crystals','manifestation':'Spirituality & Crystals',
  'cleaning':'Cleaning & Organization','organization':'Cleaning & Organization','organizing':'Cleaning & Organization','home organization':'Cleaning & Organization','decluttering':'Cleaning & Organization','storage':'Cleaning & Organization',
  'art':'DIY & Crafts','drawing':'DIY & Crafts','painting':'DIY & Crafts','art supplies':'DIY & Crafts','crafts':'DIY & Crafts',
  'mental health':'Self Improvement','baby':'Parenting & Family','nursery':'Parenting & Family','kids':'Parenting & Family','kids & baby':'Parenting & Family','baby & kids':'Parenting & Family'
};

const NICHE_FALLBACKS = {
  'Mental Health':'Self Improvement','Baby & Nursery':'Mom & Baby','Cleaning & Organization':'Home & Organization','Jewelry & Accessories':'Fashion & Style','Automotive':'Automotive & Vehicles','Motorcycles':'Automotive & Vehicles','Vehicles':'Automotive & Vehicles','Cars & Vehicles':'Automotive & Vehicles','Cars':'Automotive & Vehicles'
};

function fuzzyMatchNiche(raw) {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().trim().replace(/[^a-z0-9& ]/g,'');
  const niches = Object.keys(NICHE_PILL_LABELS);
  if (NICHE_ALIASES[cleaned]) return NICHE_ALIASES[cleaned];
  for (const n of niches) { if (n.toLowerCase() === cleaned) return n; }
  for (const n of niches) {
    const nl = n.toLowerCase();
    if (cleaned.includes(nl) || nl.includes(cleaned)) return n;
  }
  const STOP = new Set(['and','the','for','with','your','set','kit','accessories','products','supplies','gear','stuff','ideas','essentials','items']);
  const words = cleaned.split(' ').filter(w=>w.length>2 && !STOP.has(w));
  let bestNiche=null, bestScore=0;
  for (const n of niches) {
    const nl = n.toLowerCase();
    let score = 0;
    for (const w of words) { if (nl.includes(w)) score++; }
    if (score>bestScore) { bestScore=score; bestNiche=n; }
  }
  return bestScore>0 ? bestNiche : null;
}

// Node port of resolveToPillNiche: every NICHE_PILL_LABELS key has a DOM pill in
// production, so "pill exists" == "key is in NICHE_PILL_LABELS".
function resolveToPillNiche(detected) {
  if (!detected) return null;
  if (NICHE_PILL_LABELS[detected]) return detected;
  const fb = NICHE_FALLBACKS[detected];
  if (fb && NICHE_PILL_LABELS[fb]) return fb;
  return null;
}

function pill(rawModelNiche) {
  return resolveToPillNiche(fuzzyMatchNiche(rawModelNiche));
}

// ── Drift guard: ported list must match the live pill list in app/index.html ──
function driftCheck() {
  const html = fs.readFileSync(APP, 'utf8');
  const pillCount = (html.match(/pickNiche\(this,/g) || []).length;
  const ported = Object.keys(NICHE_PILL_LABELS).length;
  const missing = Object.keys(NICHE_PILL_LABELS).filter(k => !html.includes(`pickNiche(this,'${k}')`));
  return { pillCount, ported, missing };
}

// ── Products (cat, product, raw=simulated model niche, expected, accept[], brand, note) ──
// expected === 'NO_HOME' marks a genuine gap (no good niche exists).
// accept[] lists additional pills that are defensible for ambiguous products.
const P = [
  // 1) BRAND-ONLY (18)
  ['brand','Stanley','Kitchen & Cooking','Kitchen & Cooking',['Sports & Recreation','Outdoor & Garden'],true,'cup vs tools brand'],
  ['brand','Yeti','Sports & Recreation','Sports & Recreation',['Kitchen & Cooking','Outdoor & Garden'],true,'coolers/drinkware'],
  ['brand','Hoka','Sports & Recreation','Sports & Recreation',['Fitness & Gym','Fashion & Style'],true,'running shoes'],
  ['brand','Owala','Kitchen & Cooking','Kitchen & Cooking',['Fitness & Gym','Sports & Recreation'],true,'water bottle'],
  ['brand','Theragun','Health & Wellness','Health & Wellness',['Fitness & Gym'],true,'percussive massager'],
  ['brand','Brumate','Kitchen & Cooking','Kitchen & Cooking',['Travel'],true,'obscure drinkware brand'],
  ['brand','Olaplex','Hair Care','Hair Care',[],true,'hair bond treatment'],
  ['brand','Lululemon','Fitness & Gym','Fitness & Gym',['Fashion & Style','Sports & Recreation'],true,'activewear'],
  ['brand','Jackery','Tech & Gadgets','Tech & Gadgets',['Sports & Recreation'],true,'portable power station'],
  ['brand','Carhartt','Fashion & Style','Fashion & Style',[],true,'workwear'],
  ['brand','Hydro Flask','Kitchen & Cooking','Kitchen & Cooking',['Sports & Recreation','Fitness & Gym'],true,'water bottle'],
  ['brand','Roku','Tech & Gadgets','Tech & Gadgets',[],true,'streaming device'],
  ['brand','Anker','Tech & Gadgets','Tech & Gadgets',[],true,'chargers/power banks'],
  ['brand','Le Creuset','Kitchen & Cooking','Kitchen & Cooking',[],true,'enameled cookware'],
  ['brand','Diptyque','Home Decor','Home Decor',['Beauty & Skincare'],true,'luxury candles/perfume'],
  ['brand','Funko','Gaming','NO_HOME',['Gaming','Vintage & Thrift'],true,'collectible figures'],
  ['brand','Peloton','Fitness & Gym','Fitness & Gym',[],true,'exercise bike'],
  ['brand','Birkenstock','Fashion & Style','Fashion & Style',[],true,'sandals'],

  // 2) ABBREVIATION / JARGON (14)
  ['jargon','EDC knife','DIY & Crafts','DIY & Crafts',['Hunting & Fishing','Tech & Gadgets'],false,'EDC/utility tool → DIY (tools)'],
  ['jargon','AIO cooler','Tech & Gadgets','Tech & Gadgets',['Gaming'],false,'liquid CPU cooler'],
  ['jargon','DAC amp','Tech & Gadgets','Tech & Gadgets',['Music & Instruments'],false,'audiophile headphone amp'],
  ['jargon','FPV goggles','Tech & Gadgets','Tech & Gadgets',['Photography'],false,'drone goggles'],
  ['jargon','pour-over kit','Kitchen & Cooking','Kitchen & Cooking',[],false,'coffee'],
  ['jargon','GPU','Tech & Gadgets','Tech & Gadgets',['Gaming'],false,'graphics card'],
  ['jargon','EDC flashlight','DIY & Crafts','DIY & Crafts',['Tech & Gadgets','Hunting & Fishing'],false,'utility tool → DIY'],
  ['jargon','mechanical keyboard','Tech & Gadgets','Tech & Gadgets',['Gaming'],false,''],
  ['jargon','CGM','Health & Wellness','Health & Wellness',['Supplements & Nutrition'],true,'continuous glucose monitor (acronym risk)'],
  ['jargon','NAS','Tech & Gadgets','Tech & Gadgets',[],true,'network attached storage (acronym risk)'],
  ['jargon','e-bike','Sports & Recreation','Sports & Recreation',['Automotive & Vehicles'],false,'motorized-bicycle gray zone'],
  ['jargon','mirrorless camera','Photography','Photography',[],false,''],
  ['jargon','weighted vest','Fitness & Gym','Fitness & Gym',['Sports & Recreation'],false,''],
  ['jargon','dab rig','Home Decor','NO_HOME',[],false,'cannabis concentrate pipe (content-sensitive)'],

  // 3) TYPOS (8)
  ['typo','motercycle helmet','Automotive & Vehicles','Automotive & Vehicles',[],false,''],
  ['typo','skincair serum','Beauty & Skincare','Beauty & Skincare',[],false,''],
  ['typo','embroydery floss','DIY & Crafts','DIY & Crafts',[],false,''],
  ['typo','dumbell','Fitness & Gym','Fitness & Gym',[],false,''],
  ['typo','tellescope','Tech & Gadgets','Tech & Gadgets',['Photography'],false,'astronomy/optics → Tech'],
  ['typo','acrlyic paint','DIY & Crafts','DIY & Crafts',[],false,'art folded into DIY'],
  ['typo','fountian pen','Stationery & Journaling','Stationery & Journaling',[],false,''],
  ['typo','hikng boots','Sports & Recreation','Sports & Recreation',['Outdoor & Garden'],false,''],

  // 4) BOUNDARY STRADDLERS (22)
  ['boundary','yoga mat','Fitness & Gym','Fitness & Gym',['Sports & Recreation','Health & Wellness'],false,''],
  ['boundary','essential oil','Health & Wellness','Health & Wellness',['Beauty & Skincare','Spirituality & Crystals'],false,''],
  ['boundary','saddle pad','Sports & Recreation','Sports & Recreation',[],false,'EQUESTRIAN (fixed via scope rule)'],
  ['boundary','phone tripod','Photography','Photography',['Tech & Gadgets'],false,''],
  ['boundary','kettlebell','Fitness & Gym','Fitness & Gym',['Sports & Recreation'],false,''],
  ['boundary','label maker','Cleaning & Organization','Cleaning & Organization',['Stationery & Journaling','Tech & Gadgets'],false,''],
  ['boundary','protein bar','Supplements & Nutrition','Supplements & Nutrition',['Food & Recipes','Fitness & Gym'],false,''],
  ['boundary','dog backpack','Pets','Pets',['Travel','Sports & Recreation'],false,''],
  ['boundary','resistance bands','Fitness & Gym','Fitness & Gym',['Sports & Recreation'],false,''],
  ['boundary','diffuser','Health & Wellness','Health & Wellness',['Hair Care','Home Decor'],false,'bare word: aroma vs hair diffuser'],
  ['boundary','running shoes','Sports & Recreation','Sports & Recreation',['Fitness & Gym','Fashion & Style'],false,''],
  ['boundary','jump rope','Fitness & Gym','Fitness & Gym',['Sports & Recreation'],false,''],
  ['boundary','cast iron skillet','Kitchen & Cooking','Kitchen & Cooking',[],false,''],
  ['boundary','standing desk','Tech & Gadgets','Tech & Gadgets',['Home Decor'],false,'office/WFH'],
  ['boundary','baby carrier','Parenting & Family','Parenting & Family',['Travel'],false,''],
  ['boundary','travel pillow','Travel','Travel',['Health & Wellness'],false,''],
  ['boundary','compression socks','Health & Wellness','Health & Wellness',['Fitness & Gym','Travel'],false,''],
  ['boundary','foam roller','Fitness & Gym','Fitness & Gym',['Health & Wellness'],false,''],
  ['boundary','wax melts','Home Decor','Home Decor',['Cleaning & Organization'],false,''],
  ['boundary','reusable straws','Kitchen & Cooking','Kitchen & Cooking',['Cleaning & Organization'],false,''],
  ['boundary','blue light glasses','Health & Wellness','Health & Wellness',['Tech & Gadgets'],false,''],
  ['boundary','massage gun','Health & Wellness','Health & Wellness',['Fitness & Gym'],false,''],

  // 5) GAP PROBES (20)
  ['gap','torque wrench','Automotive & Vehicles','Automotive & Vehicles',['DIY & Crafts'],false,'vehicle tool → Automotive (scope)'],
  ['gap','drill press','DIY & Crafts','DIY & Crafts',['Tech & Gadgets'],false,'tool → DIY (scope)'],
  ['gap','microscope','Tech & Gadgets','Tech & Gadgets',['Photography','Books & Education'],false,'optics → Tech (scope)'],
  ['gap','telescope','Tech & Gadgets','Tech & Gadgets',['Photography'],false,'optics → Tech (scope)'],
  ['gap','model train set','Gaming','NO_HOME',['Gaming','Vintage & Thrift'],false,'scale models'],
  ['gap','RC car','Tech & Gadgets','Tech & Gadgets',['Gaming','Automotive & Vehicles'],false,'RC → Tech (scope)'],
  ['gap','desk organizer','Cleaning & Organization','Cleaning & Organization',['Stationery & Journaling'],false,'office'],
  ['gap','stapler','Stationery & Journaling','NO_HOME',['Stationery & Journaling','Cleaning & Organization'],false,'office supplies gap'],
  ['gap','balloon arch kit','Wedding & Events','Wedding & Events',['Parenting & Family'],false,'party'],
  ['gap','advent calendar','Home Decor','NO_HOME',['Home Decor','Parenting & Family'],false,'seasonal gap'],
  ['gap','rosary beads','Spirituality & Crystals','NO_HOME',['Spirituality & Crystals','Jewelry & Accessories'],false,'religious (Spirituality is new-age)'],
  ['gap','menorah','Home Decor','NO_HOME',['Home Decor','Spirituality & Crystals'],false,'religious gap'],
  ['gap','gun holster','Hunting & Fishing','NO_HOME',['Hunting & Fishing'],false,'firearms-adjacent (sensitive)'],
  ['gap','ammo box','Hunting & Fishing','NO_HOME',['Hunting & Fishing'],false,'firearms-adjacent (sensitive)'],
  ['gap','car wax','Automotive & Vehicles','Automotive & Vehicles',[],false,'auto detailing'],
  ['gap','clay bar kit','Automotive & Vehicles','Automotive & Vehicles',[],true,'auto detailing (jargon)'],
  ['gap','horse halter','Sports & Recreation','Sports & Recreation',['Pets'],false,'EQUESTRIAN → Sports (scope)'],
  ['gap','riding crop','Sports & Recreation','Sports & Recreation',['Sports & Recreation'],false,'equestrian'],
  ['gap','cordless drill','DIY & Crafts','DIY & Crafts',[],false,'tool → DIY (scope)'],
  ['gap','stud finder','DIY & Crafts','DIY & Crafts',['Tech & Gadgets'],false,'tool → DIY (scope)'],

  // 6) BARE HOMONYMS (8)
  ['homonym','saddle','Automotive & Vehicles','NO_HOME',['Automotive & Vehicles','Sports & Recreation'],false,'bike/horse/motorcycle'],
  ['homonym','board','Sports & Recreation','NO_HOME',['Sports & Recreation','Kitchen & Cooking'],false,'surf/skate/cutting/circuit'],
  ['homonym','press','Kitchen & Cooking','NO_HOME',['Kitchen & Cooking','Fitness & Gym'],false,'french/bench/printing'],
  ['homonym','mat','Fitness & Gym','NO_HOME',['Fitness & Gym','Home Decor'],false,'yoga/door'],
  ['homonym','kit','','NO_HOME',[],false,'totally vague'],
  ['homonym','set','','NO_HOME',[],false,'totally vague'],
  ['homonym','mouse','Tech & Gadgets','NO_HOME',['Tech & Gadgets','Pets'],false,'computer/animal'],
  ['homonym','block','Fitness & Gym','NO_HOME',['Fitness & Gym','Kitchen & Cooking'],false,'yoga/knife/building'],

  // 7) OBSCURE-BUT-REAL (10)
  ['obscure','beard oil','Beauty & Skincare','Beauty & Skincare',['Hair Care'],false,'mens grooming'],
  ['obscure','cuticle oil','Beauty & Skincare','Beauty & Skincare',[],false,'nail care'],
  ['obscure','lock picking set','DIY & Crafts','DIY & Crafts',[],false,'tool/hobby → DIY (scope)'],
  ['obscure','bird feeder','Outdoor & Garden','Outdoor & Garden',['Pets'],false,'backyard birding'],
  ['obscure','beekeeping suit','Outdoor & Garden','Outdoor & Garden',['Pets'],false,''],
  ['obscure','resin molds','DIY & Crafts','DIY & Crafts',[],false,''],
  ['obscure','enamel pins','Jewelry & Accessories','Jewelry & Accessories',['Fashion & Style','DIY & Crafts'],false,''],
  ['obscure','sourdough starter','Food & Recipes','Food & Recipes',['Kitchen & Cooking'],false,''],
  ['obscure','cold plunge tub','Health & Wellness','Health & Wellness',['Fitness & Gym'],false,''],
  ['obscure','grow light','Outdoor & Garden','Outdoor & Garden',['Tech & Gadgets'],false,'indoor plants'],
];

// ── EXPLORE set: unscored. Classified live, reported with the model's `what`
// so a human can eyeball whether niche + description make sense. Heavy on
// random real brands (the hard part) across every category. ────────────────
const EXPLORE = [
  // random brands — drinkware / kitchen
  'Cirkul','Stojo','Caraway','Our Place','HexClad','Vitamix','Nespresso','Chemex','Ninja Creami','Lodge','Zwilling','Takeya','Simple Modern','RTIC','Carote','Always Pan',
  // random brands — apparel / shoes / outdoor
  'Crocs','Patagonia','Fjallraven','Osprey','Allbirds','Vuori','Gymshark','Alo Yoga','On Cloud','Vessi','Bombas','Darn Tough','Smartwool','Arcteryx','Columbia','Merrell',
  // random brands — beauty / hair / grooming
  'CeraVe','The Ordinary','Drunk Elephant','Rare Beauty','Charlotte Tilbury','Dr Squatch','Manscaped','Native deodorant','Dyson Airwrap','Revlon One Step','Mielle','Olaplex No 7',
  // random brands — tech / home
  'Dyson V15','Roomba','Shark robot vacuum','Bissell','Levoit air purifier','Govee lights','Philips Hue','Ring doorbell','Eufy','DJI Mini','GoPro','Insta360','Kindle Paperwhite','Remarkable 2','Rocketbook',
  // random brands — fitness / health / supplements
  'Fitbit','Oura ring','Whoop','Hyperice','Liquid IV','Liquid Death','AG1','Ritual vitamins','Seed probiotic','Gymshark leggings','Bala bangles','Hydro Jug',
  // random brands — sleep / wellness
  'Casper mattress','Purple pillow','Brooklinen sheets','Bearaby','Hatch alarm','Loop earplugs',
  // random brands — outdoors / grill / pets
  'Solo Stove','Traeger','Blackstone griddle','Nalgene','Garmin watch','Litter Robot','Fi collar',
  // products — sports & rec
  'kayak paddle','pickleball paddle set','cornhole boards','ski goggles','snowboard bindings','wetsuit','climbing harness','trekking poles','camping hammock','headlamp','disc golf set','roller skates','jiu jitsu gi','boxing hand wraps',
  // products — hunting & fishing
  'fly fishing reel','duck call','deer feeder','recurve bow','tackle bag','fish stringer','bowfishing reel',
  // products — music
  'midi keyboard','synthesizer','harmonica','violin rosin','drum throne','guitar capo','metronome','studio monitors','vinyl record','turntable',
  // products — hobby / games (gap probes)
  'gundam model kit','jigsaw puzzle','chess set','poker chip set','dnd miniatures','tarot deck','oracle cards','singing bowl','palo santo','crystal grid',
  // products — stationery / art
  'bullet journal','washi tape','fountain pen ink','calligraphy nib','gouache paint set','pottery wheel','knitting needles','crochet hook kit','macrame cord','candle making kit','soap mold',
  // products — auto detailing / vehicle
  'OBD2 scanner','tire inflator','jump starter','car seat gap filler','steering wheel cover','ceramic coating kit','microfiber towels','motorcycle gloves','bike chain lube','bike phone mount','balance bike',
  // products — pets
  'cat water fountain','automatic dog feeder','reptile heat lamp','aquarium heater','dog DNA test','slow feeder bowl','bird cage','hamster wheel',
  // products — baby / parenting
  'bottle warmer','pacifier clip','teething toy','stroller fan','nursing cover','potty training seat','diaper caddy','baby sound machine',
  // products — finance / office / cleaning
  'cash envelope wallet','budget binder','savings challenge book','desk cable organizer','under desk treadmill','steam mop','grout cleaner brush','shoe storage cabinet',
  // products — food / kitchen oddballs
  'matcha whisk','cocktail shaker','sourdough banneton','bread lame','meat thermometer','spice drawer organizer','electric milk frother','cold brew maker',
  // genuinely weird / ambiguous
  'lefty scissors','left handed mug','horse fly mask','chicken coop','snail bait','beard straightener','sauna blanket','red light therapy mask','posture corrector','grip strengthener','finger skateboard','sand free beach mat'
];

// ── Resolution mini-suite: feed raw strings straight into the resolver ───────
const MINI = ['Car accessories','Phone accessories','Sports & Fitness','Health & Beauty','','Outdoors','Kids & Baby','Vehicles!!!','Automotive','Tools','Horseback riding'];

function verdict(row, finalPill) {
  const [cat, product, raw, expected, accept, brand] = row;
  if (expected === 'NO_HOME') return 'NO_HOME';
  if (finalPill === expected) return 'OK';
  if (accept && accept.includes(finalPill)) return 'AMBIGUOUS';
  return 'WRONG';
}

function runSim() {
  const drift = driftCheck();
  const lines = [];
  lines.push('# Pinlo niche stress-test results');
  lines.push('');
  lines.push(`Mode: **${process.env.ANTHROPIC_API_KEY ? 'LIVE (real API)' : 'SIMULATED (no API key — `raw` field used)'}**`);
  lines.push(`Drift check: ported ${drift.ported} niches, ${drift.pillCount} pills in app/index.html, missing pills: ${drift.missing.length ? drift.missing.join(', ') : 'none'}`);
  lines.push('');
  lines.push('| # | cat | product | model→ | final pill | expected | verdict | note |');
  lines.push('|--|--|--|--|--|--|--|--|');

  const tally = {};
  P.forEach((row, i) => {
    const [cat, product, raw, expected, accept, brand, note] = row;
    const finalPill = pill(raw) || '(none)';
    const v = verdict(row, finalPill);
    tally[v] = (tally[v] || 0) + 1;
    if (brand) tally.BRAND_RISK = (tally.BRAND_RISK || 0) + 1;
    lines.push(`| ${i+1} | ${cat} | ${product} | ${raw||'(blank)'} | ${finalPill} | ${expected} | ${v}${brand?' +BRAND':''} | ${note} |`);
  });

  lines.push('');
  lines.push('## Tally');
  Object.entries(tally).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => lines.push(`- ${k}: ${v}`));

  lines.push('');
  lines.push('## Resolution mini-suite (raw string → final pill)');
  lines.push('| raw | final pill |');
  lines.push('|--|--|');
  MINI.forEach(m => lines.push(`| ${JSON.stringify(m)} | ${pill(m) || '(none)'} |`));

  const out = lines.join('\n');
  fs.writeFileSync(path.join(__dirname, 'niche-stress-results.md'), out + '\n');
  console.log(out);
}

// ── LIVE mode ────────────────────────────────────────────────────────────────
// API key: env var first, then a .dev.vars file (KEY=VALUE lines).
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    const dv = fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8');
    const m = dv.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return null;
}

// Extract the LIVE niche-detect system prompt straight from app/index.html so
// the test can never drift from production.
function extractSystemPrompt(html) {
  const m = html.match(/max_tokens:80,system:'([\s\S]*?)',messages:/);
  if (!m) throw new Error('Could not extract niche-detect system prompt from app/index.html');
  return m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

const NICHE_LIST_STR = Object.keys(NICHE_PILL_LABELS).join(', ');
const RUNS = parseInt(process.env.RUNS || '3', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function classifyOnce(product, systemPrompt, key) {
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 80, system: systemPrompt,
        messages: [{ role: 'user', content: 'Product: "' + product + '"\n\nNiches:\n' + NICHE_LIST_STR + '\n\nReturn JSON: {"niche":"...","what":"..."}' }]
      })
    });
    // Back off and retry on rate-limit / overloaded / transient server errors
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 5) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const data = await res.json();
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  let niche = text, what = '';
  try { const p = JSON.parse(text.replace(/```json|```/g, '').trim()); niche = p.niche || text; what = p.what || ''; } catch {}
  return { niche, what };
}

async function runLive(key) {
  const html = fs.readFileSync(APP, 'utf8');
  const systemPrompt = extractSystemPrompt(html);
  const drift = driftCheck();
  const lines = [];
  lines.push('# Pinlo niche stress-test results — LIVE (real API)');
  lines.push('');
  lines.push(`Model: claude-haiku-4-5 · runs/product: ${RUNS} · drift: ${drift.missing.length ? ('MISSING ' + drift.missing.join(',')) : 'clean (' + drift.ported + ' niches)'}`);
  lines.push('');
  lines.push('| # | cat | product | model→ (run1) | final pill | expected | verdict | what (run1) |');
  lines.push('|--|--|--|--|--|--|--|--|');
  const tally = {};
  for (let i = 0; i < P.length; i++) {
    const [cat, product, raw, expected, accept, brand, note] = P[i];
    const pills = [], niches = []; let what1 = '';
    for (let r = 0; r < RUNS; r++) {
      try {
        const { niche, what } = await classifyOnce(product, systemPrompt, key);
        if (r === 0) what1 = what;
        niches.push(niche); pills.push(pill(niche) || '(none)');
      } catch (e) { niches.push('ERR'); pills.push('ERR'); if (i === 0 && r === 0) throw e; }
    }
    const flapping = new Set(pills).size > 1;
    const finalPill = pills[0];
    let v = verdict(P[i], finalPill);
    if (flapping) v = 'FLAPPING';
    tally[v] = (tally[v] || 0) + 1;
    if (brand) tally.BRAND_RISK = (tally.BRAND_RISK || 0) + 1;
    lines.push(`| ${i + 1} | ${cat} | ${product} | ${niches[0]} | ${flapping ? pills.join(' / ') : finalPill} | ${expected} | ${v}${brand ? ' +BRAND' : ''} | ${(what1 || '').replace(/\|/g, '/')} |`);
    process.stderr.write(`\r[${i + 1}/${P.length}] ${product}                    `);
  }
  process.stderr.write('\n');
  lines.push('');
  lines.push('## Tally');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
  lines.push('');
  lines.push(`## EXPLORE (${EXPLORE.length} unscored — eyeball niche + what)`);
  lines.push('| # | product | model→ | final pill | what |');
  lines.push('|--|--|--|--|--|');
  for (let i = 0; i < EXPLORE.length; i++) {
    const product = EXPLORE[i];
    let niche = 'ERR', what = '';
    try { const r = await classifyOnce(product, systemPrompt, key); niche = r.niche; what = r.what; }
    catch (e) { niche = 'ERR'; what = e.message.slice(0, 40); }
    lines.push(`| ${i + 1} | ${product} | ${niche} | ${pill(niche) || '(none)'} | ${(what || '').replace(/\|/g, '/')} |`);
    process.stderr.write(`\r[explore ${i + 1}/${EXPLORE.length}] ${product}                    `);
  }
  process.stderr.write('\n');
  lines.push('');
  lines.push('## Resolution mini-suite (raw string → final pill)');
  lines.push('| raw | final pill |'); lines.push('|--|--|');
  MINI.forEach(m => lines.push(`| ${JSON.stringify(m)} | ${pill(m) || '(none)'} |`));
  const out = lines.join('\n');
  fs.writeFileSync(path.join(__dirname, 'niche-stress-results.md'), out + '\n');
  console.log(out);
}

const KEY = loadKey();
if (KEY) {
  runLive(KEY).catch(e => { console.error('\nLIVE run failed:', e.message); process.exit(1); });
} else {
  console.error('No API key (env ANTHROPIC_API_KEY or .dev.vars) — running SIMULATED mode.\n');
  runSim();
}
