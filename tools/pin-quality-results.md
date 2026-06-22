# Pinlo pin-generation quality sweep

Gen: claude-sonnet-4-6 · Judge: claude-sonnet-4-6 · 36 cases × 1 runs + 3×10 angle pins = 12 graded pins

**Cases: 3 clean · 0 flaky (fail some runs) · 9 broken (fail all runs)**
Findings by severity: JUDGE 34 · HEURISTIC 5 · HARD 1

## Root-cause tally (issues by category, all pins)
- JUDGE_NOTE: 24
- TITLE_HOOK: 8
- PAINPOINT_FIDELITY: 3
- AUDIENCE_FIDELITY: 2
- ROBOTIC: 2
- GEN_FAIL: 1

## Cases that are flaky or broken

### BROKEN — leather car seat covers (Automotive & Vehicles) — 0/1 runs clean
- run 1: ⚠️ title: Why do leather car seat covers hold up so well against kids and pets?
    desc: Between juice spills, muddy paws, and crumbs ground into every seam, your car seats take a beating that adds up fast. Leather car seat covers sit directly over your existing upholstery and wipe completely clean, keeping the fabric underneath protected from stains, scratches, and everyday wear.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title is a question format that reads more like a FAQ header than a scroll-stopping Pinterest hook — it lacks urgency, curiosity, or emotional pull to compel a save or click.
    ❗ [JUDGE/JUDGE_NOTE] #carorganization is off-topic and not relevant to seat covers or the audience's pain point.

### BROKEN — clip-on book reading light (Books & Education) — 0/1 runs clean
- run 1: ⚠️ title: Why does a clip-on book reading light let you read in bed without waking anyone?
    desc: Your partner has work in the morning and every time you flip on the lamp to read, you both lose sleep over it. A clip-on book reading light attaches directly to your book and casts a small focused beam just on the page, so the rest of the room stays dark and your partner sleeps right through it.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title is phrased as a clunky rhetorical question ('Why does...') that reads like a search query fragment, not a scroll-stopping hook — reframe as a bold statement or sharp curiosity gap (e.g. 'Read All Night Without Waking Your Partner — This Clip-On Light Changes Everything')
    ❗ [JUDGE/JUDGE_NOTE] The 'Why does' construction is grammatically odd for a hook; it implies the reader already knows the answer, killing curiosity rather than creating it
    ❗ [JUDGE/JUDGE_NOTE] Title is functional but flat — it restates the product name rather than leading with a compelling benefit or tension that earns the click

### BROKEN — under-sink storage organizer (Cleaning & Organization) — 0/1 runs clean
- run 1: ⚠️ title: Why does an under-sink organizer finally give your cleaning supplies a real home?
    desc: Every bottle, sponge, and spray just piles up under the sink because there is never a logical place to put any of it. An under-sink storage organizer uses tiered shelves and pull-out bins to turn that chaotic cabinet space into clearly sorted zones so you can grab what you need without digging.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title is phrased as a rhetorical question that reads like a search query or FAQ header, not a scroll-stopping hook — it lacks urgency, intrigue, or emotional pull
    ❗ [JUDGE/JUDGE_NOTE] Title structure 'Why does X finally give Y...' is grammatically awkward and passive; a stronger hook would lead with the transformation or the problem
    ❗ [JUDGE/JUDGE_NOTE] No concrete specificity in the title to differentiate this from any generic storage post — no number, no vivid word, no tension

### BROKEN — resin art starter kit (DIY & Crafts) — 0/1 runs clean
- run 1: ⚠️ title: Why does a resin art starter kit actually keep your first project from turning into a mess?
    desc: When you try a new craft without the right tools and materials measured out, everything ends up sticky, uneven, and ruined before it even cures. A resin art starter kit gives you pre-portioned resin, molds, mixing sticks, and gloves so your first pour comes out clean and solid without the guesswork.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/ROBOTIC] robotic/marketing-bot voice
    ❗ [JUDGE/JUDGE_NOTE] Title is phrased as a clunky rhetorical question ('Why does...actually keep...') that reads more like a Google search query than a scroll-stopping Pinterest hook; a punchy statement or challenge-style hook would perform better
    ❗ [JUDGE/JUDGE_NOTE] Phrase 'sticky, uneven, and ruined before it even cures' is good but 'everything ends up...ruined before it even cures' slightly strains natural speech — 'ruined' and 'before it cures' create a mild logical tension since curing is what determines success
    ❗ [JUDGE/JUDGE_NOTE] 'humanVoice' borderline: 'without the guesswork' is a tired marketing closer that undercuts the otherwise grounded copy; the title's stilted question structure also feels constructed rather than conversational

### BROKEN — high-waisted seamless shapewear (Fashion & Style) — 0/1 runs clean
- run 1: ⚠️ title: Why does high-waisted seamless shapewear fix the bumps under a fitted dress?
    desc: When you finally find the dress you want to wear to a special event, the last thing you need is lumps and lines ruining the silhouette under the fabric. High-waisted seamless shapewear smooths from the waist down with no visible edges, so your dress lays completely flat against your body all night.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title is framed as a why-does question, which reads more like a Google search query than a scroll-stopping Pinterest hook — it lacks urgency, aspiration, or emotional pull.
    ❗ [JUDGE/JUDGE_NOTE] The title structure buries the benefit; a hook like 'No More Bumps Under Your Dress — This Shapewear Changes Everything' would stop the scroll far more effectively.
    ❗ [JUDGE/JUDGE_NOTE] Title phrasing 'fix the bumps' is slightly casual/awkward alongside 'why does' — the two registers clash.

### BROKEN — weekly meal planning recipe binder (Food & Recipes) — 0/1 runs clean
- run 1: ⚠️ title: Why does a weekly meal planning recipe binder fix running out of dinner ideas?
    desc: By Wednesday you have already exhausted every dinner idea in your head and you are standing in the kitchen with absolutely nothing planned. A weekly meal planning recipe binder lets you slot seven nights of meals in advance so you walk into the week knowing exactly what you are cooking every single night.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title is a clunky rhetorical question that reads like a Google search query, not a scroll-stopping Pinterest hook — it states the answer in the question and kills any curiosity or tension.
    ❗ [JUDGE/JUDGE_NOTE] The question format ('Why does...fix...?') is grammatically awkward and unnatural as a Pinterest title; a declarative or imperative hook would be far stronger.
    ❗ [JUDGE/JUDGE_NOTE] Title buries the emotional payoff — a hook like 'Never Run Out of Dinner Ideas Again' or 'The Binder That Plans Your Whole Week For You' would stop the scroll more effectively.

### BROKEN — XL RGB gaming mouse pad (Gaming) — 0/1 runs clean
- run 1: ⚠️ title: Why does an XL RGB mouse pad fix running out of desk space mid-game?
    desc: You're in the middle of a match and your mouse hits the edge of the pad at the worst possible moment. An XL RGB gaming mouse pad covers nearly your entire desk so you never lose tracking space, and the LED lighting ties the whole battlestation setup together.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/JUDGE_NOTE] Title opens with a why-does question which is a weak Pinterest hook — question titles work best as 'Why Your Mouse Keeps Hitting the Edge (And the Fix Battlestation Builders Are Switching To)' style; this one reads more like a FAQ heading than a scroll-stopper
    ❗ [JUDGE/JUDGE_NOTE] Title conflates 'running out of desk space' with the actual pain point 'runs out of pad space mid-game' — subtle but the wording shift dilutes precision
    ❗ [JUDGE/JUDGE_NOTE] 'covers nearly your entire desk' undersells the product; 'nearly' introduces doubt where confidence would convert better

### BROKEN — silk hair bonnet (Hair Care) — 0/1 runs clean
- run 1: ⚠️ title: Why do curly hair bonnets made of silk actually keep your curls defined overnight?
    desc: You wake up after a full night of sleep and your curls have gone from defined and bouncy to a frizzy, flattened mess against the pillow. A silk hair bonnet creates a smooth, friction-free barrier around your curls while you sleep so they hold their shape and stay hydrated until morning.
    ❗ [JUDGE/TITLE_HOOK] title is flat/generic, not a hook
    ❗ [JUDGE/ROBOTIC] robotic/marketing-bot voice
    ❗ [JUDGE/JUDGE_NOTE] Title is phrased as a clunky rhetorical question with awkward word order ('bonnets made of silk actually keep') — reads like a draft, not a scroll-stopper
    ❗ [JUDGE/JUDGE_NOTE] Title buries the hook; a stronger Pinterest title would lead with the benefit or problem, not a question about mechanism
    ❗ [JUDGE/JUDGE_NOTE] Opening 'humanVoice' is undercut by the title's stilted phrasing — sounds like SEO copy, not a real curly-hair person talking
    ❗ [JUDGE/JUDGE_NOTE] 'smooth, friction-free barrier' in the description edges toward marketing-bot language; a real person would say something more concrete like 'stops your curls from rubbing against rough cotton'

### BROKEN — textured ceramic vase set (Home Decor) — 0/1 runs clean
- run 1: 💥 unparseable JSON

## Angle-robustness findings
- all angles clean across all subset products 🎉

## Clean cases (spot-check sample)
- **vitamin C face serum** — Why does a vitamin C serum make dull uneven skin look so much brighter?
- **Adidas gym duffel bag** — Why does this gym duffel bag keep everything sorted when you are rushing out at 5am?
- **weighted sleep mask** — Why does a weighted sleep mask actually quiet your brain at night?
