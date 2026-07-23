# TSL: Social Conflict

Foundry VTT module — social conflict minigame inspired by **Thirsty Sword Lesbians** mechanics (Feelings Moves, Conditions, emotional tracks).

## License
- TSL open license: **Powered by Lesbians** (poweredbylesbians.com)
- Code: **CC BY-SA 4.0**
- Must include TSL attribution in README and module description
- Thirsty Sword Lesbians™ is a trademark of April Kit Walsh, published by Evil Hat Productions

## Target Platform
- **Foundry VTT v13** (minimum), future v14 support
- Primary systems: `dnd5e` (classic 5e), `dnd5e` v4+ (2024 / 5.5e), `a5e-for-dnd5e` (Level Up: Advanced 5th Edition)
- System-agnostic fallback for PbtA and any other system
- No React — vanilla JS + Foundry API only

## Architecture

### File Structure
```
tsl-social-conflict/
├── module.json              ← manifest, requires vtools
├── CLAUDE.md                ← this file
├── README.md
├── scripts/
│   ├── main.js              ← entry point, hooks
│   ├── socket.js            ← sync GM ↔ players + TSLGMActions relay (player actions run on GM client)
│   ├── stat-resolver.js     ← auto-detect stats from actor.system
│   ├── condition-effects.js ← TSL conditions as Active Effects, rest/spell clearing
│   ├── string-store.js      ← Strings (emotional leverage) on actor flags
│   ├── bond-store.js        ← Chronicle bonds (relationships) on actor flags
│   ├── social-archetypes.js ← SOCIAL_TRIADS, 9 archetypes, PROFILE_POINTS, BOND_TYPES, fencing conditions
│   ├── tsl-playbooks.js     ← 9 TSL playbooks (classes) + their signature 2d6 moves
│   ├── social-encounter.js  ← Patience & Resolve tracks + swayed/walked outcomes
│   ├── social-maneuvers.js  ← 12 maneuvers, roller (no side effects) + applyOutcome (GM only)
│   ├── social-notes-app.js  ← Chronicle app: Profile / Bonds / Fencing tabs, canvas token picking
│   ├── social-hud.js        ← Token HUD button + actor context menu → Chronicle
│   ├── conflict-store.js    ← central conflict state, CONDITIONS, MOVES
│   ├── conflict-app.js      ← conflict UI (Application V1, raw HTML)
│   └── hud-button.js        ← VTools toolbar integration
├── styles/
│   └── conflict.css         ← all styling, CSS variables
└── lang/
    └── en.json              ← i18n strings (UI is currently hardcoded English)
```

### How It Works
1. **Chronicle** (any time): right-click token → HUD address-book button → `SocialFencingApp`
   - Profile tab: archetype, Extended Triad leanings (0–3 ×3), profiling points — all with `data-tooltip` hints
   - Bonds tab: relationship entries; add via candidate select or canvas pick mode (click a visible, non-hidden token; Esc cancels)
   - Fencing tab (GM only): start encounter → Patience & Resolve tracks, social conditions
   - Access: GM everything; players only actors they own
2. **Conflict**: GM clicks "Social Conflict" in VTools toolbar → token selection → `ConflictStore.init()` → `CONFLICT_OPEN` broadcast → `TSLConflictApp` opens for everyone
3. **No built-in turn order** — the GM runs turns on Foundry's own initiative. The window is a live board: each user acts from their own copy whenever they like. The action's SOURCE is `_actingIndex()` — for a player, the participant they own; for the GM, a header "Acting as" selector (`_gmActingIdx`). One single target per action (never self). Picking a TSL move (2d6 + stat) or a maneuver (d20 + skill vs social DC ± attitude/Rattled)
4. Maneuver/roll consequences apply **only on the GM client** (`SocialManeuverRoller.applyOutcome`, `ConflictStore.recordRoll`) — players reach them via the `GM_ACTION` socket relay
5. Conflict ends via **Finally Kiss**, **Yield**, or a fencing outcome (Resolve 0 = swayed, Patience 0 = walks away)

### State Flow
- **GM owns all shared state** — conflict state in `ConflictStore`, persistent data on actor flags
- Player actions → `TSLGMActions.request(action, args)` → direct call for GM, `GM_ACTION` socket message for players; GM executes and broadcasts
- `ConflictStore._broadcast()` → emits `CONFLICT_UPDATE` + notifies local listeners
- Chronicle/encounter data syncs natively via actor flags (`updateActor` hooks re-render open apps)

### Data on Actor Flags (scope `tsl-social-conflict`)
- `socialFencing` — { archetypeId, motivation, personality, psychotype, intent (GM agenda), notes, triad:{power,attention,order 0–3}, points:{desire,fear,weakness,mask,line} }
- `bonds` — [{ id, targetActorId, type, attitude (= STRENGTH 0..3 since v1.18; legacy ±3 read as abs), perceivedArchetypeId, profileKnown, notes }]
- `stringList` — [{ id, label, targetActorId }]
- `encounter` — { active, patience, maxPatience, resolve, maxResolve, round, outcome: null|"swayed"|"walked", leverage:{desire,fear,weakness → used?} }

### Social Fencing Design (the loop)
- **Guess → Test → Refine (deduction loop, v1.7)**: archetypes are NEVER revealed to players. A successful read (Cold Reading / Logic Exploit, or Read the Room 10+) → `SocialManeuverRoller.whisperTell` — one random tell/crave/dread whispered to the reader. The player writes their guess into their Bond ("Read as"); **all ✦/⚡/» marks and bar predictions follow the GUESS** (`assess`/`getRelation` take `archetypeOverride`; GM passes `undefined` = truth), while **rolls always use the truth**. Wrong guesses self-correct via evidence (surprise Advantage dice, unexpected Defiant bounces). Chat cards veil archetype-naming reasons and never bake in `archHtml` — even GM rolls stay riddle-safe. PCs pick NO archetype (selector is GM-only, "their defence (GM)"); players build only triad dots
- **Push-your-luck**: success −1 Resolve (−2 on vulnerability), failure −1 Patience, immunity → auto-fail + target **Defiant** (maneuver-immune 1h) + −1 Patience
- **9 archetypes × 12 maneuvers**: each archetype has ≥1 vulnerable and ≥1 immune maneuver; traps sit *inside* the same triad (e.g. Stir Jealousy wrecks the Martyr but bounces off the Caretaker) so knowing the triad isn't enough — you profile the person
- **Strings economy (v1.31: spend-only)**: `STRING_SPEND_BONUS = 5` — burning a String on a MISSED maneuver (the post-roll gamble) is +5 and almost always turns a near miss; the anytime 🎭+5 spends it on ANY roll against that person (even an attack); TSL 2d6 moves still spend for +1. **NO passive grip** — a String gives no bonus while held, it is only ever spent (removed in v1.31). **Two earns:** (1) roleplay — a player opens up in character → GM awards a String on the person they opened up to (💖 button on the conflict card, `_awardStringDialog`, or the Bonds +); (2) conquest — a successful maneuver that deals Resolve damage hands the ATTACKER a String on the target (`applyOutcome`, "🧵 Through their guard" card), UNLESS the maneuver already grants one by design (Play Weak/Charm/reads/cashed combos keep their own grant — no double-dip via `earnedByDesign`).
- **Bonds = TYPE + STRENGTH, ONE shared relationship (v1.32)**: a bond has a type and a strength 0–3● (stored in the old `attitude` field — legacy ±3 saves read as absolute value via `TSLBondStore.getStrength`). Since v1.32 it is **mirrored onto both actors** (same strength, counterpart type) so there is a single relationship, not two independent directional ones; personal fields (read/notes) stay per-side. Effects scale with strength: **your bond toward them is your weapon** — its `school` gets +● on maneuvers vs them (ally/indebted/creditor→Reason, heart types→Emotion, rival/enemy→Power); **their bond toward you is their guard** — `guardDc` −1 types open (friend/family/crush/lover/mentor/protégé/indebted: DC −their ●), enemy is wary (+●), ally/rival/creditor/stranger neutral; **`guilt` types** (friend/family/lover/protégé): landing a POWER-school maneuver on them gives the ATTACKER the Guilty TSL Condition (public card; feeds the circulation). Swayed deepens the loser's bond +1●, walked cools it −1● (`shiftAttitude` clamps 0..3 now).
- **`assess()` is the single source of truth** (`social-maneuvers.js`): archetype relation, status combos, DC breakdown, advantage/bonuses, consumed one-shots — used by BOTH the pre-roll Duel Panel and the actual roll, so the preview always matches the dice

### Settings
- `conflictMode` (world, default **fencing** since v1.42 — this is a D&D-run module) — `fencing` = classic D&D only (d20 maneuvers/tracks/statuses/wounds, NO 2d6 moves); `both` = also adds the TSL 2d6 moves; `tsl` = pure TSL (no maneuvers/tracks/statuses/Fencing tab, Kiss always on, playbook shown as participant subtitle). NOTE: the default only applies to worlds that never explicitly set it — an existing world keeps its stored value, so flip it in Settings.
- `enableKiss` (world, default **false**) — shows/hides the TSL "Finally Kiss" special move; ORed with `conflictMode === "tsl"`
- `enableHoldLine` (world, default **true**) — the GM dialog offering to refuse a landed status by taking a TSL Condition
- `useSystemRollDialog` (world, default **true**) — maneuvers roll through the SYSTEM's skill-check dialog (A5E: advantage, expertise dice, situational mods) instead of the module's slim prompt; the module's fencing extras ride along as a pre-filled situational modifier; outcome vs hidden DC, cards and consequences stay module-side (`usesSystemDialog`, system path in `rollManeuver`; dialog cancel → null payload, nothing spent). Falls back to `promptRollMods` on systems without `rollSkillCheck`
- `gmDecidesOutcome` (world, default **true**) — after each non-walled maneuver the GM confirms the grade vs the hidden DC (crit/success/failure/botch, dice verdict pre-selected); `promptOutcome` on the GM client, card posted post-adjudication in `applyOutcome`

### TSL Playbooks (tsl-playbooks.js)
- 9 playbooks (Beast, Chosen, Devoted, Infamous, Nature Witch, Scoundrel, Seeker, Spooky Witch, Trickster), adapted under the Powered by Lesbians license
- Each has 2 signature 2d6 moves that join the basic five in the conflict grid for the actor that has the playbook (flag `socialFencing.playbookId`, selected in Chronicle → Profile)
- Move effects share the fx schema handled generically in `ConflictStore.recordRoll`: `onStrong`/`onWeak: { strings, stringsOnYou, reveal, resolve }` — basic moves (read/speak/provoke) use the same fields

### Track defaults + auto-start (no ceremony)
- Resolve = 3 + WIS mod, Patience = 4 + CHA mod — **floor 3, NO upper cap** (v1.44; the v1.43 3–6 cap was removed at the user's request). An average target (low WIS) still folds in ~2 cashed damage-combos (Taunt→Humiliate = 3 each), but an iron-willed NPC scales up and is meant to be harder (`suggestTracks`)
- **No "Start Encounter" step** — `SocialEncounterManager.ensureActive()` lazily starts tracks from these defaults on the FIRST maneuver against a target (called at the top of `applyOutcome`), unless a prior exchange already resolved. The GM only nudges/resets tracks in Chronicle→Fencing.
- **Fencing tab = a GM status board**: this actor's tracks (adjust/Reset only) + status toggles + a scene-wide "who has what" overview (`_buildStatusBoard` walks canvas tokens; portrait · name · status dots · R/P or outcome).
- Player ownership resolves via token fallback (`_participantActor`/`_ownsParticipant`) so unlinked-token participants can still act & target (fixes players unable to pick targets).
- Fallback per user: if auto-tracks still feel heavy, the pre-approved next step is to remove tracks entirely (statuses/Strings only). See memory `tracks-fallback`.
- Status/condition icons use core `icons/svg/*` (guaranteed in every install; black strokes — UI applies `filter: invert()` for the dark theme)

### Fencing Statuses (SOCIAL_CONDITIONS, all mechanical)
| Status | Effect | From | Lifetime |
|--------|--------|------|----------|
| Rattled | DC to sway them −5; **combat:** −2 saves (dnd5e flat) / dis saves (a5e), no expertise dice/reactions (A5E Rattled) | Undermine | scene (1h) |
| **Enthralled** (fencing status; id stays `smitten`, label renamed v1.40 to de-collide with the TSL **Smitten** wound) | charmer's Persuasion maneuvers get Advantage; the enthralled one CANNOT maneuver against the charmer (hard block in assess); **combat:** can't attack the charmer (native Charmed); ONE plausible command (WIS save or comply); harmed by charmer's side → breaks into Provoked vs charmer | Flatter, Charm | scene (1h) / 1 round |
| Provoked | next maneuver vs them +2; **combat:** links native **A5E Fixated** (tunnel-vision on the provoker); −2 AC (auto); GM: adv/+2 attacking the provoker, dis/−2 at anyone else (conditional → text) | Taunt | one-shot |
| Guilted | guilter's next maneuver gets Advantage; **combat:** −2 their weapon attacks (dis a5e); GM: no reactions vs the one they owe; if that one draws blood → Guilted becomes Rattled | Guilt Trip | one-shot |
| Desperate | next Flatter/Charm gets Advantage, Bargain cashes it (+1 String); **combat:** all-in — +2 their weapon attacks (adv a5e), **crit on 19–20** (dnd5e `weaponCriticalThreshold` mode 6=DOWNGRADE; a5e = text), −2 AC (the "attacks against them have advantage" a5e `grants` rider was REMOVED in v1.39) | Stir Jealousy | one-shot |
| Defiant | immune to maneuvers; **Read Them slips through** (`worksThroughDefiant`) and a SUCCESSFUL read breaks the wall; **combat:** +2 saves (adv a5e), cannot willingly retreat/disengage | hitting an immunity | 10 min or until read |

Combat riders are now REAL modifiers that hit weapon attacks and saves OUTSIDE the module, per system: **dnd5e** = flat numeric AE changes with no midi needed (`system.bonuses.mwak.attack`/`rwak.attack`, `system.bonuses.abilities.save`, `system.attributes.ac.bonus`); **a5e** = the system's own roll-mode flags (`flags.a5e.effects.rollMode.attack.all`/`savingThrow.all` adv/dis, `grants.rollMode.attack.all`, `expertiseDice`, `system.attributes.ac.changes.bonuses.value`). Behavioral parts + transitions (Smitten→Provoked, Guilted→Rattled) stay bold rules text the GM applies. Guilted's "vs the one they owe" is generalized to a flat −2/dis on ALL their attacks (target-conditional can't be a flat flag).

**Combat riders** live in each condition's `combat` field → appended to the AE description (`buildConditionEffect`), plus per-system changes: `dnd5eChanges`+`midiChanges` on dnd5e, `a5eChanges` on standalone a5e. Codex status rows now render an "In combat:" line.

### Maneuver redesign (v1.8) — school identities
- **General** (safe basics, no vuln/imm): Read Them (scout: tell+String, 0 dmg, through Defiant) · Mock (the jab: 1 dmg flat) · Taunt (setup: Provoked, 0 dmg)
- **Power** (domination — hits harder, risks harder): Flatter (Smitten + 1 dmg) · Play Weak (deep bait: 3 Strings, 0 dmg) · Humiliate (2 dmg, but `failPatience: 2`)
- **Emotion** (hearts → combos): Charm (Smitten + 1 String, 0 dmg) · Stir Jealousy (Desperate + 1 dmg; warmth aimed past them — praise a rival and they chase your attention; the slot went Ignore Them → Turn to Leave → Turn Cold → Stir Jealousy in v1.12.1: every WITHDRAWAL framing contradicted an active pursuit, jealousy is the ACTIVE way to starve someone) · Guilt Trip (Guilted + 1 dmg)
- **Order** (ledgers: economy/info/control): Undermine (Rattled, 0 dmg) · Cross-Examine (tell + String + 1 dmg) · Bargain (2 Strings + 1 dmg)
- Damage rule: **vulnerability adds +1 to the maneuver's own `resolveDamage`** (not a flat 2); failure burns `failPatience ?? 1` Patience (+1 more on a failed Fear leverage). Ids are unchanged — only names/effects.

### v1.9 — clarity & integration pass
- **Functional maneuver names** (ids unchanged): Read Them, Mock, Taunt / Flatter, Play Weak, Humiliate / Charm, Ignore Them, Guilt Trip / Undermine, Cross-Examine, Bargain. The "Order" triad DISPLAYS as **"Triad of Reason"** (id stays `order`); school group labels carry identity tooltips (SOCIAL_TRIADS hint).
- **Proficiency fix:** `getSkillMod` trusts `.total` (dnd5e) but on systems without it (a5e) folds proficiency in itself via `entry.proficient × getProfBonus()` — trained characters finally roll better.
- **Pick collision fixed:** the Fencing "Map" button shares `.tsl-chr-pick-btn` with the Bonds picker; the bonds listener grabbed it by class and instantly cancelled the pick the fence handler had just started. Listeners are now scoped by `data-bond-pick` / `data-fence-pick`.
- **Statuses in the main token list:** all six register into `CONFIG.statusEffects` as `tsl-<id>` (name "<Label> (Social)"); `getActiveCondition` matches flag OR statuses set, so HUD-toggled = module-applied. Effects also carry `links` (system status ids: rattled→A5E Rattled, smitten→charmed) and numeric dnd5e changes: Provoked −2 AC, Guilted −2 attacks (mwak/rwak), Desperate −2 initiative; Rattled/Desperate midi-qol dis flags.
- **Bond passives (`BOND_TYPES[*].school`):** your bond's type gives +1 to that school's maneuvers vs that person — lover/crush/friend/family/mentor/protégé → Emotion, rival/enemy → Power, ally/creditor/indebted → Reason. Surfaced in assess as "Bond: X — this approach runs deep between you". Combat bond passives (e.g. +AC near an ally) are deliberately NOT automated (needs target-conditional automation / midi); revisit if asked.

### Attacker style: PCs dots, NPCs archetype
- Extended Triad dots are **PC-only** (UI gated by `hasPlayerOwner`). An NPC with **no dots** but an archetype attacks from its archetype's school: implicit +2 on that school, no foreign-ground malus, veiled label "In their element".
- Dots also sharpen STANDARD checks via a module-managed AE (`syncTriadBonusEffect`, rebuilt on every pip click): Power → Intimidation, Emotion → Insight, Order → Deception, +1/dot (`system.skills.*.bonuses.check`). Aligned school+skill double-count is intentional ("signature move").
- Psychotype field removed from the Profile UI (data field remains on flags).
- Canvas pick uses `#board` (PIXI 8 removed `canvas.app.view`); player target lists filter `hidden` AND `!visible` tokens.

One-shot economy: a one-shot is consumed ONLY if it is the thing granting the advantage — free sources (vulnerability, Smitten) are used first, so resources are never wasted. Provoked (+2 flat) always applies and always burns. Combos create the fencing feel: Turn to Leave → Desperate → Charm with Advantage → Smitten → Persuasion chain.

### v1.9.9 — the chess layer: named combos & ripostes
- **Named combos (`maneuver.combos: { statusId: { label, resolveDamage?, strings? } }`)**: a finisher CASHES IN a set-up status for an extra payout on success; the status is added to `consumes` and burns. Detected in `assess` (returns `combo`), paid out in `applyOutcome`, shown as ◆ chip mark (armed NOW), tooltip line, bar hint "◆ Combo armed", and a card line.
- **Riposte (don't get caught)**: on a FAILED maneuver whose school is countered by the defender's triad (`TRIAD_COUNTERS[arch.triad] === maneuver.group` — Reason punishes Power plays, Power punishes Emotion, Emotion punishes Reason), the defender gains a String on the attacker + a public veiled card (deduction evidence!). `assess` returns `riposteRisk` from the DISPLAY arch (player's guess), so the warning hint only appears once you have a read.

### v1.10.0 — fiction-first rebuild: states as the board
Design rules learned the hard way: (1) every maneuver must be REPEATABLE in live conversation and its effect must be guessable from the fiction alone; (2) combos must read like life, not a lookup table; (3) the wager must be visible before the roll.
- **Turn Cold** replaces Turn to Leave (id `cold_shoulder` unchanged): Deception, `fa-snowflake` — mid-sentence the warmth drains away; push-pull. Still applies Desperate + 1 dmg. ("Leaving" was a once-per-scene fiction sold as a repeatable button — that's what felt wrong.)
- **Mock kicks while down** (`kickWhileDown: true`): +1 dmg vs a target with ANY fencing status, nothing consumed (`assess.kick`, `wasOffBalance` computed in applyOutcome BEFORE the consume loop). General school now has a reactive pressure tool.
- **Bargain cashes Desperate** (+1 String, "a desperate soul signs anything") — Desperate now has two consumers (Charm's adv+dmg vs Bargain's String): a real choice.
- **Immunity punish by triad (`TRIAD_PUNISH`)**: hitting an immunity now costs the ATTACKER in the defender's language — Power: attacker Rattled · Emotion: attacker Guilted · Reason: String on attacker — plus the usual Defiant wall and a public veiled card. Knowing the archetype = knowing exactly what you risk.
- **Stakes line (`previewOutcomes`)**: both bars show "✓ hit: −N Resolve · they're X · +N Strings" / "✗ miss: −N their Patience · riposte" under the breakdown — built from the same assessment as the dice (guess-based for players). `.tsl-bar-stakes` CSS.
- Codex rewritten around three life-readable lines: heat them → strike the temper · push-pull the heart · corner the mind → they sign. Combo chains: Taunt→Humiliate · Stir Jealousy→Charm/Bargain · Charm→Guilt Trip→Cross-Examine.

**Attacker-side triad leanings:** the attacker's Extended Triad dots ARE their attack style — +1 per dot on that triad's maneuvers, −1 on a triad with 0 dots while others have some ("foreign ground"); General tactics always neutral. Shown as ★ +N / ▼ −1 badges on maneuver group labels and as signed chips in the Duel Panel. Picking an archetype auto-fills its triad to 2● (QoL in the Chronicle archetype handler). PCs set this in their own Chronicle → Profile.

**Triad counter cycle (`TRIAD_COUNTERS`) — full RPS since v1.32:** Power breaks Emotion → Emotion cracks Reason → Reason binds Power. Against the DEFENDER's ruling triad: the school that counters it gets **+2** (kind:"counter"), the school it counters takes **−2** (kind:"countered"), the **same school is 0** (even), General is always neutral. Both are GM-only in surfaces (▲/▽) and veiled in the chat card, so the modifier applies without leaking the triad.

**Social DC (`getSocialDC`, v1.24):** max(passive Insight, 10 + WIS mod + **INT mod** + proficiency) — the target defends with TWO mental stats, mirroring the attacker's two skills (primary + support): WIS is read/willpower, INT is refusal to be fooled. This self-balances the two-skill inflation — a clever target resists on both fronts, a dim one folds. Proficiency from `attributes.prof`, falling back to level/CR math.

**Hidden DC (v1.9.1):** players never see the number — difficulty is earned knowledge. GM-gated in all four surfaces: conflict duel bar & Chronicle fence bar show `vs ?` (tooltip explains) for players, DC-mod breakdown chips are GM-only, the d20 overlays gate on `game.user.isGM`, and the SHARED chat card always bakes `vs DC ?` (even a GM roll must not leak the number to everyone reading chat). Rolls still use the real DC.

### UI Structure Notes (minimalist redesign)
- **One focus at a time.** Center = unified `.tsl-actions` (a single `.tsl-chip` grid: Feelings·2d6 group + triad maneuver groups, thin colored left-border per group) → `centerBottom()` action **bar**. No two stacked labeled sections, no always-open duel panel.
- **The action bar** (`.tsl-bar`) replaces the old ~10-line duel panel with **3 tight lines max**: (1) matchup — portrait · move · `Skill ±N` `+extra`(tooltip breakdown) `ADV`(tooltip reasons) · `vs DC X`(tooltip base+mods) · Roll; (2) toggles — String spend + leverage chips (`_stringToggle` / `_leverageToggles`); (3) ONE priority-picked hint sentence. Everything else lives in tooltips.
- **Chips** are uniform: icon + ellipsis name + optional corner mark (✦ vuln / ⚡ imm / » counter, only when the target's profile is read). All situational math (leaning ±, counter, DC mods) surfaces in the bar after you pick, NOT as badges cluttering the grid.
- **Cards** are slim: portrait + name(+Turn/Target inline badge) + archetype line (tooltip = full dossier) + tracks (RES/PAT) + status dots (icon only) + one footer row (condition pips + string counter). Overwhelmed = red inset ring, not a text row.
- **Overflow discipline:** every text flex child has `min-width:0` + ellipsis; chip grids use `minmax(0,1fr)`. Nothing wraps or spills.
- Roll feedback: `_pendingRoll.kind === "maneuver"` renders a d20 overlay (total vs DC, outcome); 2d6 moves keep the dice-breakdown overlay; CSS animations in the "JUICE" section (active portrait scale+pulse, overlay pop, log fade)
- **Chronicle Bonds are collapsible**: one-line head (portrait, name, type tag, read-as icon, attitude badge, strings, chevron) → click unfolds editors; `this._expandedBonds` Set, new bonds auto-expand
- **Canvas pick uses a DOM capture listener** on `canvas.app.view` (NOT `canvas.stage.on` — unreliable in v13) + `canvas.canvasCoordinatesFromClient` with manual worldTransform fallback

`reveals` maneuvers whisper a tell each success and grant their Strings each time (the old profileKnown anti-farm is gone — repeats cost turns/Patience risk and tells repeat). Blocked rolls (Defiant wall / Smitten attacker) are prevented in the UI before a String can be spent. Leverage gating no longer needs a "verified read" — a filled dossier point + active tracks is enough.

**Roll-mods dialog:** every maneuver roll opens `SocialManeuverRoller.promptRollMods` (situational modifier + Advantage/Disadvantage, 5e cancel rules) — the module's analogue of the system's roll-config window; cancel aborts before Strings/leverage are spent.

### VTM-inspired Layer (leverage, escalation, exits)
- **Dossier leverage** (Social Maneuvering "doors"-style, once per encounter each, requires active encounter + read profile + a filled profiling point on the target):
  - **Desire** — soft leverage: Advantage; on success +1 extra Resolve damage
  - **Fear** — hard leverage: +3 to the roll; on a FAILURE the target loses 1 extra Patience (threats cut both ways)
  - **Weakness** — a neutral maneuver counts as a vulnerability strike (does NOT beat archetype immunity)
  - UI: leverage row in the Duel Panel (`.tsl-lev-btn`); used state lives on `encounter.leverage`; consumed by `applyOutcome` whatever the outcome
- **Bond escalation** (blood-bond style, permanent chronicle writes): swayed → target's attitude toward winner +1; walked → −1; Finally Kiss → +1 mutual (`TSLBondStore.shiftAttitude`, clamped −3..+3)
- **Track-zero consequences** (`SocialEncounterManager._resolveConsequences`, GM side, one place): `adjustResolve/adjustPatience` now take a `sourceId`; when a track empties they fire once — swayed → attitude +1 AND the winner gains a **String** (the concession is a hold) AND the loser's fencing statuses clear; walked → attitude −1 AND statuses clear AND a triad-flavored exit. A bulleted resolution card (`.tsl-mv-consequences`) spells out exactly what happened; the GM frames the actual concession fiction.
- **Triad-flavored exits** (frenzy-style): the "walks away" chat card varies by ruling triad — Power answers with force, Emotion spreads their version loudly, Order closes the ledger permanently
- Deferred candidates: Willpower-style String reroll after a failed roll (needs post-roll chat UI), Boons as formal currency (creditor/indebted bond types already cover it narratively)

### UI Structure Notes
- **Conflict center**: Emotional Moves (2d6 grid) → Maneuvers (2-col chips, triad-colored groups; tooltip lists which archetypes each cuts/bounces off) → **Duel Panel** (portraits, skill+bonus chips vs DC+mods chips, relation/combo lines, success/fail preview, roll button)
- **Chronicle tabs**: Profile (archetype card: essence/hint/tells/craves/dreads + maneuver matrix chips) / Bonds / Fencing (GM: tracks + 6 status toggles) / Codex (rules reference: how-it-works, all triads & archetypes, statuses)
- Participant cards show: known archetype (or "Nature unread"), encounter tracks, active status chips, TSL conditions, strings

### Stat Resolution (stat-resolver.js)
**2d6 normalization (dnd5e/a5e):** skill totals (+0..+11, d20 curve) are halved and clamped to −1..+4 before feeding the 2d6 TSL moves — raw totals made Strong Hits automatic (+8 → 97%) and killed the Weak Hit economy. +11 master → +4 (~72% strong hit), +4 dabbler → +2. Maneuvers (d20 vs passive Insight) still use FULL skill totals — that's native d20 math.

**TSL ↔ Fencing bridge (recordRoll, GM side):** Read the Room 10+ → String + profile reveal (sincere recon); Speak from the Heart / Provoke 10+ vs a target with active tracks → −1 Resolve (sincerity route to victory alongside manipulation).

TSL stats mapped to D&D abilities:
| TSL Stat | dnd5e / a5e         | PbtA                    |
|----------|---------------------|-------------------------|
| Passion  | CHA modifier        | hot/passion/heart/charm |
| Grace    | DEX modifier        | cool/grace/style        |
| Wit      | INT modifier        | sharp/wit/clever        |
| Nerve    | WIS modifier        | hard/nerve/daring/bold  |
| Spirit   | CON modifier        | weird/spirit/strange    |

- dnd5e v4+ (2024): prefers `abilities.cha.check.mod` over `abilities.cha.mod`
- a5e: uses `abilities.cha.mod` (same path, separate handler for future-proofing)
- Generic fallback: walks `actor.system` 2 levels deep, collects modifier-like numbers (abs ≤ 10)

### Maneuver console in the Chronicle (self-serve fencing)
- The Chronicle **Fencing tab is now everyone's action menu** (owner OR GM, gated by `conflictMode !== "tsl"`): `_buildManeuverConsole` lets THIS actor pick a scene-token target, see the target's Resolve/Patience + known archetype, pick a maneuver, and roll with a dice overlay (`_buildFenceOverlay`, `_doFenceRoll`) — no GM-launched conflict window needed. Outcome applies via the same `TSLGMActions.request("maneuverOutcome")` relay; tracks auto-start.
- Console state: `_fenceTargetId / _fenceManeuverId / _fenceLeverage / _fenceStringSpend / _fenceRoll`. GM additionally gets `_buildGMFencing` (track nudge/reset + status toggles + `_buildStatusBoard`).
- `.tsl-fencing` root now also defines the base `--tsl-*` vars so shared `.tsl-chip`/`.tsl-bar` components render correctly inside the Chronicle.

### Extended Triad = a 4-point pool (`TRIAD_POINT_POOL`)
- The attacker distributes **4 points total** across the three triads (was 0–3 each, up to 9). The pip handler blocks only INCREASES past the pool (so an over-budget character from before the cap can still reduce); the Profile shows "N / 4 left" or "N over — lower a triad". No auto-fill from the archetype.

### Canvas target picking + bond profiling (v1.5)
- The maneuver console's target row has a **Map** button → `_startPick(onPick, "target")`; `_startPick` is now generalized to take an `onPick(actor)` callback (default adds a Bond via `_defaultBondPick`).
- Each expanded Bond has a **Their dossier** subsection (`_buildBondDossier`) editing the TARGET actor's profiling points (Desire/Fear/Weakness/Mask/Line) with the PROFILE_POINTS hints — writes to the target's flags, gated by GM/owner. Hidden in `conflictMode === "tsl"`.
- The console bar shows a **visible bonus breakdown** (`.tsl-fc-breakdown`): base skill, String, each bonusReason, ADV reasons, DC mods — plain language, not just tooltips.
- Track tooltips state the scaling: Resolve = 3 + WIS, Patience = 4 + CHA (3–8).

### Statuses render as named colored tags
- `SOCIAL_CONDITIONS[*].color`; conflict cards and the scene board show `.tsl-status-tag`/`.tsl-board-tag` (name + color) instead of icon-only dots (the old `icons/svg` dots read as blank squares).

### v1.9.2 — unblock the wall, native A5E status automation
- **Taunt rolls Performance** (was Intimidation) — a jeer played for the room, not a threat; Humiliate keeps Intimidation. Ids unchanged (`instigate`, skillKeys dnd5e:`prf`).
- **Defiant is breakable**: a successful Read Them REMOVES Defiant (`worksThroughDefiant` + wall-break block in `applyOutcome`, public "🧱 wall cracks" card); duration 3600→600 s. Root cause of "can't roll maneuvers, only Strings pop out": one triggered immunity made the target Defiant, which blocked every maneuver *forever* (world time doesn't tick on its own) — only Read Them kept working and granting Strings.
- **a5e combat riders** (`a5eChanges`, applied when `game.system.id === "a5e"`, same `flags.a5e.effects.*` OVERRIDE encoding as a5e's built-in conditions; 1=adv, −1=dis): Rattled dis WIS saves; Provoked grants attackers advantage; Guilted dis attacks; Desperate dis Insight + −2 initiative; Defiant adv WIS saves (midi advantage flag added on dnd5e too). Smitten stays a native `charmed` link (A5E charmed already blocks attacking the charmer).
- **Smoke-test harness** (Developer Notes): stub Foundry globals, concatenate manifest scripts into ONE `new Function` scope (classic script tags share the global lexical env; node eval does not), drive assess → rollManeuver → applyOutcome for all 12 maneuvers, then the Defiant wall-break. It found the wall bug that static reading missed.

### v1.9.3 — HUD statuses carry their teeth; console Roll unmissable
- **Root cause of "statuses still have no combat effects": statuses toggled from the TOKEN HUD were bare** — `CONFIG.statusEffects` entries had only id/name/img, so Foundry created effects with no changes. Registration now bakes the FULL effect data (per-system `changes`, combat `description`, `duration`, native-condition `statuses` links, module `flags`) via `buildConditionEffect` at ready. `removeCondition` also matches the `tsl-<id>` statuses set (HUD-applied one-shots are consumable).
- **Chronicle fence bar**: the Roll button is a full-width row at the bottom (`.tsl-bar--fence .tsl-fc-roll`), labeled "Roll <maneuver>"; a Defiant target shows an explicit `.tsl-fc-walled` notice instead of a silent gap; `.tsl-bar-line` wraps. If UI looks half-broken after an update mid-session, it's the stale-client trap — F5 reloads the new scripts.
- Hidden DC applies to players only — the GM always sees the number by design.

### v1.9.4 — statuses actually bite on a5e; retroactive refresh
- **Rattled = the standard A5E Rattled exactly**: same change the system's own condition carries (`flags.a5e.effects.expertiseDice` OVERRIDE 0) + native `rattled` link; no extra module riders on a5e (dnd5e keeps the midi WIS-save dis).
- **Provoked on a5e is now numeric AND granted**: −2 AC via `system.attributes.ac.changes.bonuses.value` (visible on the sheet) + attackers gain advantage (`grants.rollMode.attack.all`).
- **`syncExistingConditionEffects` (main.js)**: on ready (world actors) and canvasReady (scene token actors, incl. unlinked), the GM client refreshes every applied tsl-status whose `changes`/`description` differ from the current build. THIS was "статуси все ще не показують бої": effects applied by older versions stayed bare forever — new automation never lands retroactively without a sweep.
- Where riders are visible on a5e: AC/initiative — numbers on the sheet; roll modes (dis attacks, adv saves, dis Insight) — preselected in the system's roll dialog; expertise dice — stripped in dialogs. Smitten stays narrative (native Charmed).

### v1.9.5 — String grip passives; one chronicle per character
- **String grip**: holding ≥1 String on the target → +1 bonusReason on maneuvers vs them; the target holding Strings on the roller → +1 dcMod. Both flat +1 regardless of count. String SPEND is reserved before the roll but removed after it (both `_doFenceRoll` and `_doManeuverRoll`) — the in-roll assess still sees the held String, so the grip in the preview matches the dice.
- **Unlinked-token chronicle split fixed**: `SocialFencingDialog.open` normalizes to the WORLD actor (`game.actors.get(actor.id) ?? actor`) — a token HUD on an unlinked token hands over the synthetic actor (same id, token-local flags); writing there gave every token a private chronicle. All profile/bonds/strings/encounter data now lands on the base actor and syncs across every token of that character. (Store APIs were already id-based via `game.actors.get` — the app instance was the only leak.)

### v1.9.6 — token-delta rescue; statuses in the console; no double Rattled
- **`migrateTokenChronicles` (main.js, GM, ready)**: pre-1.9.5 chronicle data written to UNLINKED TOKEN DELTAS (each token had a private copy — the visible "bonds don't sync" symptom even after the open() fix) is merged UP into the world actor (union: bonds by targetActorId, strings by id; profile/encounter only if the world actor has none) and the delta flag is wiped so nothing shadows the shared chronicle. Idempotent, sweeps all scenes.
- **Statuses visible in the maneuver console**: the Chronicle Fencing tab shows the target's active status tags under the tracks; ALL status tooltips (conflict cards, console, GM toggles) now include the `Combat:` rider line.
- **No duplicate Rattled in the token HUD**: registration skips `tsl-<id>` when a `links` target with the SAME localized label already exists in `CONFIG.statusEffects` (A5E's own Rattled) and stores `meta.nativeAlias` instead; `getActiveCondition`/`removeCondition` also match the alias — toggling the system's native Rattled counts as the social one (DC −5) and is removable/consumable by the module.

### v1.9.8 — ambient button-width immunity
- **Root cause of the ballooning Map button / crushed target select** (and the earlier stretched String pill): Foundry v13 / system skins give `<button>` a stretchy base (full width, flex). Fix: `.tsl-fc-target-row` is a GRID (`auto minmax(0,1fr) auto` — label · select · button), and every content-sized button in our windows gets explicit `width: auto` (pick/string/adjust/remove/lev/target/dice-close), with deliberate full-width ones (`.tsl-fc-roll`, `.tsl-notes-enc-btn`) re-asserted after the sweep. When adding new buttons, ALWAYS set an explicit width strategy.

### v1.9.7 — console alignment pass
- **Target header is a card**: portrait (triad-colored ring) · name+archetype · tracks · status tags in one bordered block with a soft triad-tinted gradient — same silhouette as conflict participant cards (`.tsl-fc-head` rebuilt, `.tsl-fc-portrait`, `.tsl-fc-head-main/-row`).
- **Even maneuver rail**: fixed 64px label column, labels vertically centered, each school band gets a soft triad tint + right-rounded corners (`.tsl-fc .tsl-chip-group` overrides).
- **Aligned GM tracks**: fixed 64px label column so Resolve/Patience pips start at the same x; counts right-aligned. Target row controls share one 30px height.

### v1.11.0 — the living opponent: grades, the Answer, the gamble, Hold the Line
- **Graded outcomes** (`rollManeuver`): beat DC by 5+ = `crit` (+1 damage, "Clean hit"); miss by 5+ = `botch` → **the Answer**. Outcome names never carry numbers, so chat can't leak the DC — but outcomes ARE how players learn to sense it.
- **The Answer (`TRIAD_ANSWER`)** replaces riposte + immunity punish with ONE rule: on a botch OR an immunity hit, the archetype answers in its triad's language and the debuff lands on the ATTACKER — Power: you're Rattled · Emotion: you're Guilted · Reason: String on you. `assess().answerRisk` words the warning from the DISPLAY arch (player's guess).
- **The gamble**: pre-roll String toggle REMOVED from maneuvers; on a MISS `rollManeuver` (with `offerString: true`) offers to burn a String for +2 — decided AFTER the die, against a hidden DC (`promptStringBurn`; payload `spentStringPostRoll`, caller removes the entry). Grip passive unchanged.
- **Hold the Line** (world setting `enableHoldLine`, default on): when a maneuver would land a STATUS, the GM dialog (`promptHoldLine`) asks the table — accept, or refuse the status + Resolve hit by taking a TSL Condition fitting the school (`HOLD_LINE_CONDITIONS`: power→angry/scared, attention→smitten/guilty, order→scared/hopeless). Applied via `TSLConditionEffects.applyOne` (actor-level AE, cleared on short rest); 4+ Conditions = Overwhelmed (card warns). Attacker's Strings/tells still land — words are never erased, only their power refused.
- **The patience clock**: past half Patience the DC quietly rises +1 ("their patience wears thin" dcMod) with a ⏳ hint; at 1 the bar warns "last exchange".
- **NPC Agenda (`socialFencing.intent`, GM-only Profile field)**: what THEY want from the conversation. `walked` now BITES: the walker gains a String on the attacker and the resolution card notes their agenda advances — losing an exchange costs the players something.
- **Codex "Running it (GM)"**: when to draw blades (unwilling + real stakes only), both sides play (answer every maneuver), crowd hardens (+1 DC per extra voice), size the ask (Resolve 3/5–6/8 + leverage for the impossible), patience as the scene clock. Player list adds: grades/Answer, the gamble, Hold the Line, tempo (one exchange, one blade each).

### v1.12.0 — the PC's defensive nature: dots cut both ways
- **`getDefensiveProfile(actor)`** (social-archetypes.js): { dots, total, ruling } — `ruling` = the unique maximum of 2+ dots, else null. NPCs defend with archetypes; a PC (no archetype) defends with the triad THEY built.
- In `assess`, when the target has NO archetype: **blind side** — a 0-dot school (while invested elsewhere) gives the attacker +1 ("an unguarded approach"); the **RPS cycle** keys off `defTriad = arch?.triad ?? defProfile.ruling`, so a PC's ruling triad grants the same +2/−2/0 as an archetype's. (**Home ground** — the old DC +2 for attacking a PC on their own ruling school — was REMOVED in v1.32: same school is now even.)
- **The PC's Answer**: `_applyAnswer` and `answerRisk` fall back to the ruling triad — an NPC that botches against a power-ruled PC walks away Rattled, etc.
- **Split builds (e.g. 2/2/0) have no ruling nature**: no Answer and no RPS at all against them (neither the +2 nor the −2) — but blind 0-dot schools stay open. A real build choice: sharp identity vs unreadability.
- Surfaced in the Profile triad tooltip ("Extended Triad · your nature") and the Codex "Lean into your nature — it cuts both ways" bullet.

### v1.13.0 — Strings as trump cards, earned with the heart
- **+5 gamble** (`STRING_SPEND_BONUS` 2→5): a String is now a trump card, not small change — burning one after a miss nearly always turns a close exchange. 2d6 TSL spend stays +1 (different dice math).
- **Opened-heart award**: GM 💖 button on every conflict participant card → dialog "to whom?" → String + public "opens their heart" card + log. Codex (player + GM lists) teaches that vulnerability roleplay is the PRIMARY String source — TSL's soul: the thread is made by baring your heart.
- Balance note: with +5 value, String-granting maneuvers (Play Weak 3, Bargain 2) are rich — if farming appears in play, trim their grants first.

### v1.14.0 — feelings are lived out, not slept off; fumbles feed the story
- **Dramatic clears (`CONDITION_META[*].clears`)**: every TSL Condition names the ACTION that lifts it (Smitten — confess or heartbreak · Angry — vent it · Scared — flee to safety or face it with an ally · Guilty — confess/amends · Hopeless — someone must rekindle you). Baked into the actor effect description and the conflict pips tooltip. **Short rests no longer clear Conditions** — only the dramatic action or a LONG rest (`registerRestHooks` gates on longRest). Conditions become personal story hooks, TSL-style.
- **Pips ↔ actor effects are ONE truth**: `ConflictStore.toggleCondition` now applies/removes the actor-level TSL Condition AE alongside the participant pip — a dramatic clear is one GM click, and Hold the Line wounds show on the pips.
- **Inspiration on botch** (TSL's "mark XP on a miss"): a player character whose maneuver botches gains Inspiration (`system.attributes.inspiration`, dnd5e & a5e, only if not already inspired) with a "a fumble this good feeds the story" card — losing spectacularly is now WORTH something.

### v1.15.0 — the circulation: wounds open doors
- **`CONDITION_OPENINGS` (social-maneuvers.js)**: a TSL Condition on the TARGET is a standing +2 for matching maneuvers, NEVER consumed (wounds close only through drama or long rest): angry → Taunt/Humiliate · smitten → Flatter/Charm · guilty → Guilt Trip/Cross-Examine · scared → Undermine/Mock · hopeless → Bargain/Charm. `findOpening(target, maneuver)` helper; `assess()` returns `opening`; `TSLConditionEffects.hasCondition`.
- This closes the TSL-style loop across ALL layers: **Speak from the Heart (2d6) / Hold the Line inflict Conditions → Conditions open fencing doors (+2) → landed maneuvers force new Hold-the-Line choices → new wounds, new doors** — and the wound you CHOOSE when holding the line decides which door opens on you (chess in the defense).
- Surfaced: ◆ chip mark counts openings, ❤ tooltip lines per maneuver, bar hint "❤ Open wound — …", bonus breakdown entry; Codex bullet "Wounds open doors" with the choose-your-wound warning. (Note: openings sit in the bonus section, so they don't apply through blocked/immune walls.)

### v1.16.0 — the system's own dice; Strings bite in combat
- **`useSystemRollDialog`**: maneuver rolls go through `actor.rollSkillCheck(key, { situationalMods, rollMode })` — the A5E dialog with advantage/expertise dice. The module passes its assess extras (grip/combo/wound/dots…) as a pre-filled situational mod, reads `msg.rolls[0].total` back, and resolves outcome/gamble/cards itself. Our card shows `[dice] — system check` and attaches no roll (no double dice animation). Maneuver skills: Insight, Deception, Performance, Intimidation, Persuasion + Investigation (Cross-Examine) — a5e uses the same 3-letter keys as dnd5e.
- **Pull the String (universal +5)**: a String is +5 to ANY roll against that person — even an attack. The 🎭+5 button in the Bonds row burns one and posts a public card ("+5 to this roll against them"); the table applies it to the roll just made. Codex gamble bullet teaches the universal rule.

### v1.19.0 — the GM has the final word; the system dialog is the default
- **`useSystemRollDialog` default flipped to `true`**: on A5E, maneuver rolls now open the SYSTEM's own skill-check dialog (advantage, expertise dice, situational mods) out of the box — the module's slim `promptRollMods` no longer appears there (it stays only as the fallback for systems without `rollSkillCheck`). Our fencing bonuses ride in pre-filled as the situational mod. The user's redundant-window complaint: resolved.
- **`gmDecidesOutcome` (world, default `true`) + `promptOutcome`**: after every non-walled maneuver roll the GM confirms the grade (crit / success / failure / botch) against the hidden DC, with the dice's verdict pre-selected as the default button (one keypress). The GM's ruling — not the raw d20 vs DC — decides consequences. Walled (immune/blocked) outcomes stay deterministic (no prompt).
- **Card posting moved to the GM client**: `rollManeuver` no longer posts the chat card; it returns a `card:{}` payload (rawDice, systemRoll, adv/dis, `rollData: roll.toJSON()`). `applyOutcome` (always GM) re-assesses on the truth side, posts the card AFTER adjudication (rebuilding the Roll via `Roll.fromData` for non-system rolls), so the shared card can never show a result the GM then overrode. The acting client still gets its instant dice overlay from the payload.
- Skills audit (answer to "do all rolls use the five social skills?"): 11/12 do — Insight, Deception (Mock/Play Weak/Undermine), Performance (Taunt/Charm/Stir Jealousy), Intimidation (Humiliate), Persuasion (Flatter/Guilt Trip/Bargain); the lone exception is **Cross-Examine → Investigation**.

### v1.20.0 — archetypes react in their own voice
- **`ARCHETYPE_REACTIONS` (social-archetypes.js)**: 20 VEILED reaction lines per archetype (9×20=180) — how that nature visibly cracks when a maneuver lands. Appended to the outcome card on success/crit (`SocialArchetypeManager.pickReaction`, rendered as `.tsl-mv-tell`), EXCEPT for `reveals` maneuvers (Read Them keeps its private whisper). Never names the archetype — reads as deduction evidence, a richer tell stream than reads alone.
- **`ARCHETYPE_TELLS` (social-archetypes.js)**: **40** whispered Read Them clues per archetype (9×40=360 as of v1.20.1) — the deepest pool, since Read Them is cast most. `whisperTell` now draws from `pickTell` (falls back to the old tells/craves/dreads for custom archetypes with no pool).
- Both pools are strictly veiled (a harness test asserts no line contains an archetype label) and support the hidden-archetype deduction loop: you learn WHO someone is by how they break under pressure, refreshed every roll so it never goes stale.

### v1.21.0 — every maneuver rolls two skills (primary + support)
- **Each maneuver now has `skill2`/`skillKeys2`**: the PRIMARY skill rolls the d20; the SECONDARY skill's modifier rides on top as a flat bonus (`getSkillMod2` → a `bonusReason` in assess, added only when non-zero). `getSkillMod` refactored to share `_modForKeys(actor, keys)`. The support bonus flows through BOTH roll paths: module d20 (`mod = skillMod + bonus + …`) and the system dialog (folded into `situationalMods` via `a.bonus`, since the system already rolls the primary).
- **The 12 pairings** (primary + support): Read Them Insight+Investigation · Mock Deception+Performance · Taunt Performance+Intimidation · Flatter Persuasion+Deception · Play Weak Deception+Performance · Humiliate Intimidation+Performance · Charm Performance+Persuasion · Stir Jealousy Performance+Deception · Guilt Trip Persuasion+Insight · Undermine Deception+Insight · Cross-Examine Investigation+Insight · Bargain Persuasion+Insight. Every support skill is distinct from its primary (harness-asserted).
- Surfaced in the chip tooltips ("Insight + Investigation (support)") and the bonus breakdown ("+N Investigation (support skill)") — it's the actor's own skill, shown plainly, never veiled.

### v1.22.0 — maneuver chips explain themselves against the chosen target
- **`SocialManeuverRoller.describeVsTarget(src, tgt, maneuver, dispArch, isGM)`**: runs `assess` and returns plain-language, VEILED lines of what the maneuver does against THIS target right now — relation (✦ cuts deep / ⚡ bounces off, read-gated), ◆ combo armed (which status it cashes + payout), ❤ open wound (+2), ◆ kick, every flat bonus (support skill, bond ●, grip, leaning, blind side), ADV sources, and — GM only — the DC mods. Follows the viewer's read (truth for GM, guess for player); never leaks the archetype name or the DC (harness-asserted).
- Wired into BOTH chip tooltips: once a target is picked, the conflict window's maneuver chips show a `Vs <name>:` block (falling back to the generic archetype matrix with no target); the Chronicle console always has a target so it always shows it. Answers "what combos with what and what gives which bonus" at a glance across all 12 chips, no clicking required.

### v1.23.0 — archetype weak/strong analysis is GM-only
- Reversal of the guess-based marks: a PLAYER's pre-roll surfaces now carry NO archetype analysis. Both bars and `describeVsTarget` assess players with `archetypeOverride: null` (not their guess), so the relation (✦ vulnerable / ⚡ immune), the counter (»), the blind-side, and any archetype-derived advantage simply don't appear for players. The chip-face ✦/⚡/» marks gate on `isGM`/`ctx.isGM`. The GM still sees everything on the truth side (DC, relation, counter).
- What PLAYERS still see (all deduction-safe): their own bonuses (support skill, bond ●, string grip, triad leaning), armed combos ◆ and open wounds ❤ (read off VISIBLE statuses), a live Defiant wall ⚡ (a visible status). Nature is learned from OUTCOMES (surprise Advantage dice, unexpected bounces, whispered tells), never off a pre-roll readout. The dice always follow the truth regardless.
- Rationale: the user judged that even guess-relative weak/strong hints risked players reverse-engineering the archetype via the Codex matrix. GM-only closes it entirely.

### v1.25.0 — Codex rebuilt for clarity; better fit
- **Codex restructured** (`_buildCodexTab`): opens with a 5-step **"Your turn, step by step"** quick-start (pick who → pick maneuver → roll → GM calls it → see what it did), then tight titled sub-blocks (`tsl-codex-sub` + `-sub-title`, a `sub(title, items[])` helper) instead of a 13-bullet wall. Adds the two previously-missing facts every player needs: the GM confirms the outcome (final word), and the A5E system roll dialog is what opens. GM section regrouped into Setting the scene / Playing the opponent / Rewarding play. Archetypes get a "nine natures" intro; statuses render as a responsive 2-col grid.
- Chronicle window width 460→500 for breathing room; `.tsl-codex-quick` numbered-accent styling, `.tsl-codex-statuses` grid.

### v1.26.0 — intuitive chip-mark glyphs; "open wound" spelled out
- **Corner-mark glyphs reassigned** (older notes above still say ✦/⚡/◆/»; the LIVE glyphs are now): **◎** green = weak spot (was ✦) · **✕** red = walled/immune (was ⚡) · **⊕** orange = a +2 opening, combo OR open wound (was ◆/❤) · **▲** gold = triad counter (was »). CSS classes (`--vuln/--imm/--combo/--counter`) and colors unchanged — only the glyph characters swapped (byte-level perl replace across conflict-app/social-maneuvers/social-notes). Crit result label uses **★** (not a chip glyph). Close/remove buttons keep their own ✕.
- **"Open wound" explained everywhere it appears** (legend, Codex "Reading the chip corners"): a raw emotional TSL Condition on the target (Angry/Smitten/Guilty/Scared/Hopeless) that certain maneuvers press for +2, unconsumed until drama resolves it — folded under the same ⊕ opening mark as combos.
- Stale player-facing prose ("the marks follow your guess") corrected to reflect v1.23: marks are GM-only; players deduce weak spots from OUTCOMES.

### v1.27.0 — Codex combo cheat-sheet (data-generated)
- **New Codex section "Combos & interactions — the cheat sheet"** (`_buildCodexTab`), built FROM the data so it can't drift: (1) **Set-ups** — each fencing status ← the maneuvers that apply it (from `applyOnSuccess`); (2) **Chains** — each combo finisher and its payout (from `maneuver.combos` + `kickWhileDown`); (3) **Wounds** — each emotional TSL Condition → the maneuvers that press it for +2 (from `CONDITION_OPENINGS`, inverted). Replaces the old prose "Statuses & combos" bullets. `.tsl-codex-combo` rows with dashed separators.
- Clarifies the two sources of a ⊕ opening: cash a set-up (a status you applied this exchange) vs press a wound (a lasting Condition they carry), with a one-line note on where wounds come from (Hold the Line / Feelings moves / a bad fumble).

### v1.29.0 — Provoked→Fixated, Desperate crit-19, Codex glossary tooltips
- **Provoked** links native **A5E Fixated** (`links: ["fixated"]`) — the closest native match for red-mist tunnel-vision. The conditional "advantage attacking the provoker / disadvantage vs others" can't be a flat AE flag (target-conditional), so it stays GM rules text; only the −2 AC is automated. (a5e has NO native "goaded/taunted"; `fixated` = dis perceive-others + movement-toward, changes `[]`.)
- **Desperate** now lowers the crit threshold: dnd5e `flags.dnd5e.weaponCriticalThreshold` mode 6 (DOWNGRADE) value "19" → their weapon attacks crit on 19–20 automatically. a5e has NO actor-level crit-threshold AE key (`critThreshold` lives per-action under `system.actions.*.rolls.*`), so on a5e it's rules text.
- **Codex glossary** (`_buildCodexTab`): a `term(name)` helper wraps key concepts (Resolve, Patience, social DC, support skill, combo, open wound, String, the Answer, Hold the Line, Overwhelmed, swayed, walk away, leverage, bond) in `.tsl-term` spans (dotted underline, accent, `data-tooltip` definition from a `GLOSSARY` map). Hover any term for its definition. Statuses render an "In combat:" line.

### v1.30.0 — one word for combos ("opening"); people-pickers are battlemap-only
- **Terminology unified to "opening" (⊕)**: the two overlapping ideas — a "combo" you set up (Provoked/Desperate cashed by a finisher) and an "open wound" they carry (Angry/Smitten… pressed for +2) — are now ONE player-facing concept: *a condition on your target makes a matching maneuver stronger.* Renamed everywhere it's read (chip tooltips, bar hints "⊕ Opening — …", chip legend, chat-card reason line, the `assess` bonus label `opening — they're X`, GLOSSARY merges `combo`+`open wound` → single `opening` entry). Engine unchanged (consumed set-up vs unconsumed wound still differ under the hood) — only the words the player sees.
- **Codex cheat-sheet rebuilt as two steps, data-generated** (`comboReference`): "Openings (⊕) — the cheat sheet" → **Step 1 · Put a condition on them** (maneuver → status it applies) and **Step 2 · Press it — when they're X, these gain ⊕** (ONE merged table keyed by condition, built from `maneuver.combos` + `kickWhileDown` + `CONDITION_OPENINGS`, so a status and a wound of the same name collapse into one row). Replaces the old three tables (Set-ups / Chains / Wounds) with their three different verbs. Payouts shown in `.tsl-codex-gain`.
- **`_buildCandidates` (Bonds "Add a bond") is battlemap-only now**: dropped the `game.actors.contents` directory scan — the dropdown lists only tokens on the current scene (GM sees hidden ones, players see visible). Matches the maneuver-console target list (already `canvas.tokens.placeables`), so ALL people-picking is "who's on the map." Off-scene relations: drop a token or use the canvas Pick button.

### v1.31.0 — Strings are spend-only; earned by baring your heart or breaking through
- **Grip passive REMOVED**: holding a String no longer gives +1 on maneuvers, and Strings held on you no longer add +1 to your DC. Both the `bonusReasons` "String grip" entry and the `dcMods` "they hold N Strings on you" entry are gone from `assess`. A String now does exactly ONE thing: it is SPENT for +5 on any roll against that person (the post-miss gamble or the anytime 🎭+5). Rationale: the user's model — a String is a resource you burn, not a standing buff.
- **New "conquest" earn**: a successful maneuver that deals Resolve damage (`damage > 0` in `applyOutcome`) grants the ATTACKER 1 String on the target ("🧵 Through their guard" card) — breaking through someone's social health wins you a thread. Guarded against double-dipping: skipped when `earnedByDesign = (maneuver.grantStrings ?? 0) + (combo?.strings ?? 0) > 0`, so Play Weak (3), Charm (1), reads and cashed combos keep their designed grant instead of also getting the conquest String. Alongside the roleplay/💖 award (baring your heart), these are the two earns.
- Balance watch: per-hit conquest Strings + the swayed-resolution String can stack on the final Resolve-break (climax), and a full sway banks ~one String per damaging exchange. Since Strings are now spend-only (no passive), abundance is less swingy than before, but if it farms in play the pre-approved knobs are: cap to once per exchange, or grant only on the Resolve→0 break.

### v1.32.0 — one shared bond; schools are true rock-paper-scissors
- **A bond is ONE relationship, mirrored on both actors** (`TSLBondStore._mirror`): recording/editing a bond writes the counterpart onto the other actor — same STRENGTH, the mirrored TYPE via `BOND_TYPES[*].mirror` (mentor↔protege, indebted↔creditor; every other type is symmetric and mirrors to itself). `add`/`update`/`remove` take a `_mirrored` guard flag to stop recursion; `update` only mirrors when `type` or `attitude` is in the patch, so **personal fields never sync** (`perceivedArchetypeId`, `profileKnown`, `notes` stay private to each side). `remove` ends the relationship on both sides. `_canWrite` gates the mirror on write access (GM always; owners of the other actor), and `TSLBondStore.reconcileAll()` (GM, on ready, called from main.js) fills in any MISSING counterpart — non-destructive, never overwrites an existing differing bond, so it can't start an edit war with legacy asymmetric data. Rationale: the user found two independent directional bonds too complex ("зроби єдину систему яка синхронізується").
- **Full RPS on the triad cycle** (`assess`): the maneuver's school vs the defender's ruling triad is now symmetric — school that COUNTERS their nature = **+2** (`kind: "counter"`), their nature COUNTERS your school = **−2** (`kind: "countered"`, NEW), **same school = 0** (even ground), General always neutral. Both kinds are GM-only in `describeVsTarget` (▲ / ▽) and veiled in the chat card ("a hidden yielding" / "a hidden resistance"); players feel them only through outcomes.
### v1.41.0 — Wounds push back (VtM-inspired: compulsion, Willpower tax, frenzy)
- The user judged the emotional Wounds "too simple — nothing in roleplay." Redesigned each of the 5 (`CONDITION_META` in condition-effects.js) around three Vampire-the-Masquerade ideas, replacing the old flat `hint` ("disadvantage on X"):
  - **`urge`** — the Compulsion: what the Wound drives the carrier to do (the roleplay prompt).
  - **`resist`** — the Willpower tax: acting AGAINST the urge is at **disadvantage unless you spend a String** to steel yourself (GM-adjudicated, like Provoked's conditional; the String IS the Willpower analogue).
  - **`leanIn`** — the refuel: give in to the urge at real cost → **gain a String** on the person it ties you to (Hopeless → Inspiration, since despair is diffuse). Playing your nature pays, exactly as acting on Convictions restores Willpower in VtM.
  - **`frenzy`** — the breaking point: carry it and get pushed again (or hit Overwhelmed) → you lose the leash for one beat (Angry lashes out · Scared flees · Smitten obeys · Guilty confesses · Hopeless gives up); GM plays it.
- `_buildEffect` now renders the full dossier (Urge / Fight it / Give in / Breaking point / Clears), with `{source}` filled to the wound's cause. `TSLConditionEffects.getMeta(id)` exposes it; the conflict card's Wound-pip tooltip and a data-generated Codex "Wounds — they push you" block both read from it.
- These are GM-adjudicated rules text (no fragile automation) with ONE concrete mechanical hook — the String economy: Wounds now BANK Strings when you play them and SPEND Strings when you fight them, a self-fuelling loop that ties the emotional layer into the module's existing resource. Balance watch: leaning into wounds is another String faucet; if it farms, gate lean-in to once per scene per wound.

### v1.40.0 — the two condition layers stop blurring: States vs Wounds
- **The confusion the user kept hitting was two layers doing similar things under overlapping names.** Resolved without cutting either (they genuinely complement — see below), by making them visibly, verbally distinct.
- **Smitten name collision de-collided:** the FENCING status (from Flatter/Charm; id stays `smitten`) is now labeled **Enthralled**; the canonical TSL **Smitten** is kept for the emotional Wound (TSL's 5 Conditions are sacred). All fencing-context "Smitten" display strings (status label, combat text, Flatter/Charm successText, the "you are … with them" attacker block, the advantage reason) → "Enthralled"; every emotional-context "Smitten" (CONDITION_META, conflict-store CONDITIONS, the Hold-the-Line/opening condLabel maps, playbook move, Codex wound lists) stays. The two stores were always separate (`SocialArchetypeManager` conditions vs `TSLConditionEffects`), only the label clashed.
- **Card shows two SEPARATE, labeled rows:** fleeting fencing states get a **States** row label (`.tsl-row-label--state`); lasting emotional wounds get a **❤ Wounds** row (`.tsl-row-label--wound`). Active wounds now render as NAMED chips (not anonymous dots) so they read at a glance; the GM still sees all five as toggles, a player sees only the wounds actually carried. `renderFooter` rebuilt around `woundsRow` + `.tsl-footer-meta`.
- **Codex Statuses page opens by naming the split:** "two kinds of condition, and the card keeps them apart" — States (fleeting, spent by a finisher) vs Wounds (❤, lasting, from Hold the Line or betrayal, heal through story). Player reassured they never have to tell them apart mid-roll (both show ⊕).
- The complement they DO form (kept, now legible): a maneuver sets up a fleeting **State** → the target may **Hold the Line**, refusing the state+Resolve hit to instead carry a lasting **Wound** → that Wound opens a +2 door (`CONDITION_OPENINGS`) until the story heals it; and a Power play on a loved one hands the ATTACKER a Guilty Wound. Fast tactical layer vs slow emotional layer, same ⊕ payoff.

### v1.39.0 — combat durations in rounds; GM can open a nature to the table
- **Social statuses now expire by ROUND in combat** (`SOCIAL_CONDITIONS[*].rounds`, folded into `duration` in `buildConditionEffect` alongside the `seconds` scene fallback): Rattled / Smitten / Provoked = **1 round**, Guilted / Desperate / Defiant = **3 rounds**. Out of combat the seconds still hold them for the scene; in a combat encounter rounds bind first.
- **Desperate no longer grants advantage on attacks made AGAINST them** — the a5e `flags.a5e.effects.grants.rollMode.attack.all` change and the "attacks against them have advantage" combat text are gone. It keeps +attack, crit 19–20, −2 AC.
- **Fixated**: unchanged — Provoked already links native **A5E Fixated** (`links: ["fixated"]`); it is the right native anchor (red-mist tunnel vision) and nothing else maps to it. With the new 1-round duration the fixation now lasts one combat round.
- **GM can OPEN an archetype to players** (`SocialArchetypeManager.isRevealed` / `setRevealed`, flag `socialFencing.revealed`): a checkbox under the GM-only archetype selector in Chronicle → Profile. When open, players assess that target on the TRUTH side — the participant card shows the real nature, chip marks (◎/✕/▲) appear, and `describeVsTarget` gives the analysis — **but the DC number stays GM-only**. `seeArch = isGM || isRevealed(target)` in conflict-app (bar override, chip marks) and `describeVsTarget`. Changing the archetype retracts the reveal (`revealed: false`).
- **Open design question left OPEN (not merged):** emotional wounds (TSL Conditions) vs fencing statuses. The user finds the two confusing. Current stance argued in chat: keep them as two LAYERS (tactical exchange states that come and go, vs the 5 canonical TSL Conditions that persist and clear through story), because merging loses TSL fidelity and the Overwhelmed/dramatic-clear economy — but the Smitten name appears in both and should eventually be de-collided. No code change yet; await the user's call.

### v1.38.0 — user-tuned bond effects; spell/maneuver DC aura levers
- **The user hand-tuned every bond's combat aura and skill edges** (see `BOND_TYPES`). New per-type auras: ally +attack · friend +save · family +attack +save · crush +init (skills +Persuasion +Performance) · lover +init +2 AC · mentor +2 spell DC +2 maneuver DC · protégé +2 checks · rival +init +attack (skill −Persuasion) · enemy +2 init +2 attack −save (skills −Persuasion −Insight) · indebted +AC (skill +Deception) · creditor +attack +2 spell DC (skill +Persuasion). No type uses the `damage` lever any more (engine still supports it).
- **Two new aura levers: `spellDC` and `maneuverDC`.** Verified numeric on a5e (`system.attributes.spellDC` / `system.attributes.maneuverDC`, registered `[0, DEFAULT_MODES]`). dnd5e has no reliable flat spell-DC key and no maneuver-DC concept, so there both are skipped in `changes` and appear as rules text in the effect description only. `_changes`/`_describe` and the Codex label map gained both; the tally seeds them.
- **Skill term now clamped ±3** in `assess` (was uncapped `value × ●`): a −2 skill at ●●● would otherwise hit −6. The school-weapon (+●) is unchanged.
- **Two real veil leaks fixed** in the Martyr pools — "martyred sigh" and "martyrdom" both echoed the archetype name. The harness veil test now scans EVERY reaction/tell line (was a single random pick, which let these hide behind RNG for many versions).
- Harness rewired for the new spec: exercises each lever via a representative type (lover AC+init, ally attack, enemy attack/save/init, protégé checks, mentor spell/maneuver DC), the ±3 skill cap, and asserts dnd5e skips the DC levers while keeping the aura+description. Harness lesson: pick a maneuver NEUTRAL to the test archetype — Taunt is immune to Tyrant, so its assess short-circuits and carries no skill bonus (used Charm instead).

### v1.37.1 — the Codex describes THIS world, not the feature list
- **`_buildCodexTab` had zero `conflictMode` awareness** — it documented every layer regardless of what the world actually runs. In a **Social Fencing only** world it still promised "the 2d6 Feelings moves (Speak from the Heart, Read the Room) chip Resolve", a layer that does not exist there; the user spotted it immediately and read it as text left over from another system. Fixed: `tslOn = mode !== "fencing"`, `fencingOn = mode !== "tsl"`.
- Gated accordingly: the 2d6 bullet appears only when the TSL layer is on; the **Openings**, **Statuses** and **Natures** category buttons and the maneuver walkthrough disappear entirely in a pure-TSL world (`needs: "fencing"` on the category, filtered alongside `gmOnly`).
- **Leverage was NOT stale** — verified live end to end (`assess` desire/fear/weakness at social-maneuvers.js ~579-607, damage/patience application, `markLeverageUsed`, `.tsl-lev-btn` + `_pendingLeverage` in the conflict window, `_fenceLeverage` in the Chronicle console). Its Codex line was merely vague about where to find it, so it now says the buttons sit under the roll bar and that a dossier point must be filled first.
- Harness renders the Codex under all three `conflictMode` values and asserts that switched-off layers are absent — the general lesson being that any Codex claim must be checked against the mode, not just against the engine.

### v1.37.0 — Codex is paged; a worked example for statuses & openings
- **Category buttons** (`.tsl-codex-nav` / `.tsl-codex-cat`, state `this._codexCat`, listener on `[data-codex-cat]`): the Codex renders ONE page at a time instead of one endless scroll — **Start · Openings · Statuses · Details · Natures · GM**. The GM page is filtered out entirely for players (`gmOnly`), and an unknown/hidden `_codexCat` falls back to the first available page, so a player can never land on a blank tab.
- **"One exchange, step by step"** (Start page): a concrete walkthrough — Lyra reads the captain (tell + guess in the Bond), Taunts him (**set-up**, 0 damage), sees the ⊕ appear on Humiliate, cashes it (extra damage, the status is **spent**), then fumbles later and eats the Answer. This is the answer to "I still don't understand combos": the rules were abstract, so now one example names each part as it happens.
- **The two ⊕ kinds are stated in one line** at the end of the example: a *status you applied* is spent when cashed (one shot); a *lasting wound* they carry is never spent (+2 until the story heals it) — and the player never has to tell them apart, because both render the same ⊕.
- The **Statuses** page gained an intro explaining what a status IS (a set-up that arms an opening, not a payoff on its own) and flags **Defiant** as the odd one — a wall, not an opening, broken only by a successful Read Them.
- Harness now renders **every** category and asserts each page's content, so a broken section can't hide behind whichever category happens to be default; it also checks the GM page is absent for players.

### v1.36.2 — a5e saves/checks were written to a path that does not exist
- **`system.bonuses.abilities` in a5e is a `RecordField`, not a number.** `{ key: "system.bonuses.abilities.save", mode: ADD }` therefore did **nothing** on a5e — the save and check auras were silently inert. The earlier "verified numeric on BOTH systems" claim was wrong: grepping found the string `bonuses.abilities.save`, but that is the **`context.types` option inside a bonus record** (`getAbilitiesBonusContext` → `types: ["check","save"]`), not a data path.
- Fixed the same way as attacks: on a5e, saves and checks now go through **`flags.a5e.effects.bonuses.abilities`** (CUSTOM, mode 0) with the record as JSON — `{ label, formula, default, img, context: { types: ["save"] | ["check"], abilities: [str…cha], requiresProficiency: false } }`. dnd5e keeps its real formula fields (`system.bonuses.abilities.save`/`.check`).
- **AC was fine** and is now positively verified, not assumed: a5e registers `system.attributes.ac.changes.bonuses.value` as `[0, MODES.DEFAULT_MODES]` — a genuine number field that accepts ADD.
- **Lesson for any future a5e integration:** under `system.bonuses.*`, only `abilities`/`attacks`/`damage`/`healing`/`hitPoint`/`initiative`/`movement`/`senses` etc. are RecordFields — a flat AE can never fill them; use the matching `flags.a5e.effects.bonuses.<kind>` CUSTOM key. Audited the six SOCIAL_CONDITIONS: their `a5eChanges` only touch `rollMode.*` flags and the numeric AC key, so they were never affected.
- **Why nothing appeared at all, though:** Foundry reads `module.json` when the **server** starts. Adding a NEW script file to the `scripts` array is not picked up by a browser reload — hence `TSLBondAuras is not defined` in the console. Every earlier change in this project edited files already in the manifest, so F5 was enough; this feature added a file and needed a Foundry restart / Return to Setup.

### v1.36.0 — the aura shows on the token, but can't be toggled by hand
- The aura effect now carries **`statuses: ["tsl-bond-aura"]`** (+ `img: icons/svg/aura.svg`, a real core icon a5e itself uses). A status id makes an ActiveEffect count as **temporary**, which is what makes Foundry paint its icon on the token — a plain no-duration effect shows nothing.
- **`tsl-bond-aura` is deliberately NOT registered in `CONFIG.statusEffects`**, unlike the six SOCIAL_CONDITIONS. That is the whole trick: the HUD's status palette is built from `CONFIG.statusEffects`, so an unregistered id renders on the token yet never appears as a togglable option. Per the user: it is a state the world puts you in, not a switch anyone flips.
- The update path patches `statuses`/`img` onto auras created by earlier versions, so existing ones gain the icon on the next refresh instead of staying invisible.
- Harness note: `ActiveEffect#statuses` is a **Set** in Foundry, but the stub stores whatever `update()` is handed — assertions accept Set or Array so this doesn't read as a false failure.

### v1.35.1 — the auras never appeared (two silent killers)
- **`canvasReady` fires BEFORE `ready`.** `TSLBondAuras.register()` runs in the `ready` hook and only *subscribed* to `canvasReady`, so on world load that hook never fired again and **no aura was ever computed** until someone happened to drag a token. `register()` now does a first pass itself (`go()` at the end).
- **`_distance` returned `Infinity` on any API surprise**, silently disabling the whole feature forever (a `measurePath` that throws, or returns a shape without `.distance`). It now validates the result and falls through to pixel math, returning `Infinity` only for a genuinely unusable canvas. Harness covers: measurePath throwing, returning `undefined`, and working normally.
- `updateActor` hook broadened from `chg.flags[scope].bonds` to any change under our flag scope.
- **`TSLBondAuras.explain(token?)`** — console diagnostic for "why is there no aura": prints reach, and per bond the type (flagging Stranger = no aura), the strength (flagging 0●), and the nearest token's distance with IN REACH / out of reach.
- Reminder that bit here: a freshly added bond defaults to **type Stranger**, which by design has NO aura, no school and no skill effects.

### v1.35.0 — every bond fights differently; a5e attack bonuses solved
- **SOLVED: numeric attack/damage/initiative bonuses on a5e.** `system.bonuses.attacks` is a `RecordField`, so it can't take a flat AE — but a5e registers **`flags.a5e.effects.bonuses.<attacks|damage|initiative|abilities|skills>`** as CUSTOM-mode (`mode: 0`) effect keys and rewrites them into `system.bonuses.<kind>.<randomID>` itself (a5e.js ~line 30078). The value is the bonus record **as a JSON string**. Verified against a5e's own content (`packs/classFeatures`, "Inspiring Charge"): `{"label":…,"formula":"1d4","context":{"attackTypes":["meleeWeaponAttack","rangedWeaponAttack","meleeSpellAttack","rangedSpellAttack"],"spellLevels":[],"requiresProficiency":false},"default":true,"img":…}`. Note `attackTypes: []` does NOT mean "all" — list all four. `TSLBondAuras._a5eBonus(kind,label,n)` builds these; damage adds `damageType`+`damageTypes`/`isCritBonus` context, initiative drops attackTypes. The bonus lands in a5e's real formulas and shows in its roll dialog. **This same trick is available for any future numeric a5e bonus** — it supersedes the older "a5e has no numeric attack key, use rules text" workaround.
- **Every bond type now has its OWN combat aura** (`combatAura: { label, <lever>: ±1 }`), replacing the two monotonous guard/press buckets: ally "Shoulder to shoulder" +attack · friend "They have your back" +save · family "Blood shields blood" +AC · crush "Showing off" +init/−AC · lover "Something to lose" +AC/−attack · mentor "The old lessons" +check · protégé "Someone is watching" +damage · rival "Blood up" +attack/−AC · enemy "Tunnel vision" +damage/−save · indebted "Under their eye" +save/−attack · creditor "The ledger is yours" +init · stranger none. Six levers (attack/damage/save/check/ac/init); all combinations are unique.
- Auras from several bonds in reach **sum**, then each lever is **clamped to ±2** so a crowd of friends can't stack into absurdity. `_changes(tally,label)` maps the tally to per-system keys; `_describe(tally)` writes the plain-language effect description (per-bond lines + an "In total" line).
- **Default reach 30 → 15 ft** (`bondAuraRange`), per the user: intimate range, not a battlefield-wide buff.
- Codex "Bonds reach into a real fight" is now **generated from `BOND_TYPES`**, so the table can't drift from the data.

### v1.34.0 — bonds reach into a real fight (proximity auras)
- **`scripts/bond-auras.js` (`TSLBondAuras`)**: the long-deferred "combat bond passives". Foundry AEs are flat/global with no native "while within X ft of Y" key, so proximity is resolved in module code: the GM client recomputes on `canvasReady`/`createToken`/`deleteToken`/`updateToken` (x/y only, debounced 200 ms) and on a bonds-flag `updateActor`, then rebuilds ONE module-managed effect per actor (flag `tsl-social-conflict.bondAura`, name "Bonds in reach (Social)"). Writes only when `changes`/`description` actually differ, so token drags don't storm the DB. **No ActiveAuras/midi dependency** — the user has ActiveAuras installed but the module stays self-contained, consistent with the statuses.
- **`BOND_TYPES[*].combatAura`**: `guard` (ally/friend/family/crush/lover/mentor/protege/indebted/creditor) → **+1 saving throws, +2 at ●●●**; `press` (rival/enemy) → **−1 AC and +1 weapon attacks, +2 at ●●●**; stranger `null`. Magnitude is `strength >= 3 ? 2 : 1` (deliberately NOT full ●, so a 3● bond can't hand out +3 AC-equivalents).
- **Verified system paths** (checked against the installed a5e/dnd5e builds, not assumed): saves use `system.bonuses.abilities.save` — **numeric on BOTH** systems; AC uses `system.attributes.ac.bonus` (dnd5e) / `system.attributes.ac.changes.bonuses.value` (a5e); weapon attacks use `system.bonuses.mwak.attack`+`rwak.attack` on dnd5e only — **a5e's `system.bonuses.attacks` is a collection of formula objects, not a number**, so on a5e the attack line is rules text in the effect description (same compromise as Desperate's crit range).
- **World setting `bondAuraRange`** (default 30, `0` = feature off). Distance is grid-aware via `canvas.grid.measurePath` with a pixel/`canvas.dimensions` fallback.
- Emergent and intended: because bonds are mirrored (v1.32), standing next to your lover gives the aura to **both** of you.
- Incidental finding while verifying keys: a5e exposes BOTH `flags.a5e.effects.rollMode.savingThrow.*` and `...abilitySave.*`; the module's existing `savingThrow` usage is present in the system, so the statuses were left as-is.

### v1.33.0 — the bond TYPE bends skills (an edge and a cost)
- **`BOND_TYPES[*].skills`**: a map of `{ <maneuver.skill display name>: ±1 }` applied in `assess` as `value × strength` against the maneuver's PRIMARY skill. This is what makes the type mechanically distinct from its school — otherwise the named relationships were decorative on top of the triad dots (the user's objection). Every type carries an edge AND a cost: ally +Persuasion/−Deception · friend +Persuasion/−Intimidation · family +Insight/−Deception · crush +Performance/−Deception · lover +Insight/−Intimidation · mentor +Insight/−Deception · protégé +Persuasion/−Intimidation · rival +Performance/−Deception · enemy +Intimidation/−Persuasion · indebted +Persuasion/−Intimidation · creditor +Intimidation/−Deception · stranger none.
- Design check it enables: an **Enemy ●●** gives Humiliate +2 school AND +2 Intimidation (a real spike), while Flatter's +2 school is **exactly cancelled** by −2 Persuasion — "you can't charm hatred" is now literally true in the math, not just flavour text.
- Balance knob if bonds get too swingy (bond can now reach +●school ±●skill = up to ±6 at 3●): cap the skill term at ±2, or halve it.

### v1.32.0 (cont.)
- **"Home ground" REMOVED**: the old `dcMods` +2 for attacking a dots-built defender on their OWN ruling school is gone — pressing a school against the same school is now explicitly **even (0)**, per the user's model. A defender's nature no longer walls its own school; it defends through the RPS cycle instead (strong against the school it beats, weak to the school that beats it). Blind side (+1 on a 0-dot school) and "in their element" (NPC attacker) are untouched — different axes.

### VTools Integration (hud-button.js)
```js
Hooks.once("vtools.ready", () => {
  VTools.register({
    name:    "tsl-social-conflict",
    title:   "Social Conflict",
    icon:    "fas fa-heart-crack",
    onClick: () => { /* GM check + 2-token check + start */ }
  });
});
```
`vtools` is listed as a required dependency in `module.json`.

## UI / Styling Conventions
- **CSS variables** prefixed `--tsl-` (e.g. `--tsl-bg`, `--tsl-p0`, `--tsl-p1`)
- **Fonts**: Cinzel (titles, labels), EB Garamond (body, descriptions)
- **Colors**: dark theme (#0e0a08 base), participant 0 = #e8557a (pink), participant 1 = #9b6ee8 (purple)
- **No emojis in UI** except specific moves (💋 Finally Kiss, 🏳 Yield)
- **Foundry native styling** preferred — match Foundry's own look where possible
- **Compact controls**, icon-only where appropriate
- ApplicationV2 class, no Handlebars templates — raw HTML string from `_renderHTML()`

## Game Mechanics (from TSL)
- **5 Conditions**: Smitten, Angry, Scared, Guilty, Hopeless
- **Overwhelmed** at 4+ active Conditions → must yield or flee
- **5 Moves** (each tied to a stat): Speak from the Heart, Emotional Support, Read the Room, Provoke, Inspire
- **1 Special Move**: Finally Kiss (no roll, both agree, +1 ongoing, ends conflict)
- **Roll**: 2d6 + stat modifier → Strong Hit (10+), Weak Hit (7-9), Miss (6-)
- No module turn tracker — turn order is the GM's job via Foundry initiative; anyone acts from their own menu anytime, one target at a time

## Extended Triad & Archetypes (Social Fencing layer)
| Triad | Archetypes | Levers that work | What bounces |
|-------|-----------|------------------|--------------|
| Power (Влада) | Tyrant, Machiavellian, Duelist | flattery, bait, open challenge | raw threats, guilt |
| Emotion (Емоції) | Martyr, Exalted, Caretaker | attention: feed it or starve it | cold logic |
| Order (Порядок) | Dogmatic, Hermit, Broker | contradictions, information, deals | naked emotion |

Fencing statuses: see the SOCIAL_CONDITIONS table below — six statuses, all with real mechanical effects and combo chains.

## Known Issues / TODO
- [ ] Test socket sync with multiple players (GM_ACTION relay is new)
- [ ] Migrate Application V1 → ApplicationV2 before Foundry v14
- [ ] Manual stat override UI (when auto-detect fails)
- [ ] Animated transitions between states
- [ ] Sound effects on rolls and resolution
- [ ] Foundry settings for customising Conditions, Moves, archetypes
- [ ] i18n: move hardcoded UI strings into lang/en.json + add uk.json
- [ ] Packaging for itch.io / Foundry Hub

## Developer Notes
- Author uses Foundry v13, develops in Ukrainian locale
- Other modules by same author: `a5e-mancer`, `enhancedcombathud-a5e`, `epic-rolls-ua`, `lockpick-minigame`, `vtools`
- A5E-specific data structures: activation types nested in actions, movement as objects, specific roll method names
- UI pattern: icon-only header buttons inserted before `.window-controls`, colors via CSS variables
