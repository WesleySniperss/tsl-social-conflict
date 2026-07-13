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
- `socialFencing` — { archetypeId, motivation, personality, psychotype, notes, triad:{power,attention,order 0–3}, points:{desire,fear,weakness,mask,line} }
- `bonds` — [{ id, targetActorId, type, attitude −3..+3, perceivedArchetypeId, profileKnown, notes }]
- `stringList` — [{ id, label, targetActorId }]
- `encounter` — { active, patience, maxPatience, resolve, maxResolve, round, outcome: null|"swayed"|"walked", leverage:{desire,fear,weakness → used?} }

### Social Fencing Design (the loop)
- **Guess → Test → Refine (deduction loop, v1.7)**: archetypes are NEVER revealed to players. A successful read (Cold Reading / Logic Exploit, or Read the Room 10+) → `SocialManeuverRoller.whisperTell` — one random tell/crave/dread whispered to the reader. The player writes their guess into their Bond ("Read as"); **all ✦/⚡/» marks and bar predictions follow the GUESS** (`assess`/`getRelation` take `archetypeOverride`; GM passes `undefined` = truth), while **rolls always use the truth**. Wrong guesses self-correct via evidence (surprise Advantage dice, unexpected Defiant bounces). Chat cards veil archetype-naming reasons and never bake in `archHtml` — even GM rolls stay riddle-safe. PCs pick NO archetype (selector is GM-only, "their defence (GM)"); players build only triad dots
- **Push-your-luck**: success −1 Resolve (−2 on vulnerability), failure −1 Patience, immunity → auto-fail + target **Defiant** (maneuver-immune 1h) + −1 Patience
- **9 archetypes × 12 maneuvers**: each archetype has ≥1 vulnerable and ≥1 immune maneuver; traps sit *inside* the same triad (e.g. Cold Shoulder wrecks the Martyr but bounces off the Caretaker) so knowing the triad isn't enough — you profile the person
- **Strings economy**: earned by reads and baits (Feigned Weakness / Sweeten the Deal grant 2), spent for +1 on TSL moves / +2 on maneuvers; also visible & editable in Chronicle bonds
- **Attitude**: the target's bond toward the roller shifts the DC (devoted +3 → DC −3)
- **`assess()` is the single source of truth** (`social-maneuvers.js`): archetype relation, status combos, DC breakdown, advantage/bonuses, consumed one-shots — used by BOTH the pre-roll Duel Panel and the actual roll, so the preview always matches the dice

### Settings
- `conflictMode` (world, default **both**) — `both` = TSL moves + Social Fencing; `tsl` = pure TSL (no maneuvers/tracks/statuses/Fencing tab, Kiss always on, playbook shown as participant subtitle); `fencing` = classic D&D only (no 2d6 moves)
- `enableKiss` (world, default **false**) — shows/hides the TSL "Finally Kiss" special move; ORed with `conflictMode === "tsl"`

### TSL Playbooks (tsl-playbooks.js)
- 9 playbooks (Beast, Chosen, Devoted, Infamous, Nature Witch, Scoundrel, Seeker, Spooky Witch, Trickster), adapted under the Powered by Lesbians license
- Each has 2 signature 2d6 moves that join the basic five in the conflict grid for the actor that has the playbook (flag `socialFencing.playbookId`, selected in Chronicle → Profile)
- Move effects share the fx schema handled generically in `ConflictStore.recordRoll`: `onStrong`/`onWeak: { strings, stringsOnYou, reveal, resolve }` — basic moves (read/speak/provoke) use the same fields

### Track defaults + auto-start (no ceremony)
- Resolve = 3 + WIS mod, Patience = 4 + CHA mod, clamped 3–8 (`suggestTracks`)
- **No "Start Encounter" step** — `SocialEncounterManager.ensureActive()` lazily starts tracks from these defaults on the FIRST maneuver against a target (called at the top of `applyOutcome`), unless a prior exchange already resolved. The GM only nudges/resets tracks in Chronicle→Fencing.
- **Fencing tab = a GM status board**: this actor's tracks (adjust/Reset only) + status toggles + a scene-wide "who has what" overview (`_buildStatusBoard` walks canvas tokens; portrait · name · status dots · R/P or outcome).
- Player ownership resolves via token fallback (`_participantActor`/`_ownsParticipant`) so unlinked-token participants can still act & target (fixes players unable to pick targets).
- Fallback per user: if auto-tracks still feel heavy, the pre-approved next step is to remove tracks entirely (statuses/Strings only). See memory `tracks-fallback`.
- Status/condition icons use core `icons/svg/*` (guaranteed in every install; black strokes — UI applies `filter: invert()` for the dark theme)

### Fencing Statuses (SOCIAL_CONDITIONS, all mechanical)
| Status | Effect | From | Lifetime |
|--------|--------|------|----------|
| Rattled | DC to sway them −5; **combat:** dis on WIS saves (midi flag on dnd5e) | Unweave the Creed | scene (1h) |
| Smitten | charmer's Persuasion maneuvers get Advantage; the smitten one CANNOT maneuver against the charmer (hard block in assess); **combat:** dis on attacks vs charmer | Gilded Mirror, Honeyed Siege | scene (1h) |
| Provoked | next maneuver vs them +2; **combat:** must attack the provoker, dis vs others | Prod the Beast | one-shot |
| Guilted | guilter's next maneuver gets Advantage; **combat:** dis on attacks vs the guilter | Debt of Tears | one-shot |
| Desperate | next Gilded Mirror/Honeyed Siege gets Advantage; **combat:** dis on Insight checks (midi flag) | Starve the Flame | one-shot |
| Defiant | immune to maneuvers; **Study the Mask slips through** (`worksThroughDefiant`); **combat:** adv on saves vs charm/fear | hitting an immunity | 1h |

**Combat riders** live in each condition's `combat` field → appended to the AE description (`buildConditionEffect`), plus `midiChanges` (midi-qol automation) applied only on dnd5e.

### Maneuver redesign (v1.8) — school identities
- **General** (safe basics, no vuln/imm): Study the Mask (scout: tell+String, 0 dmg, through Defiant) · Barbed Jest (the jab: 1 dmg flat) · Prod the Beast (setup: Provoked, 0 dmg)
- **Power** (domination — hits harder, risks harder): Gilded Mirror (Smitten + 1 dmg) · Bared Throat (deep bait: 3 Strings, 0 dmg) · Cast the Gauntlet (2 dmg, but `failPatience: 2`)
- **Emotion** (hearts → combos): Honeyed Siege (Smitten + 1 String, 0 dmg) · Starve the Flame (Desperate + 1 dmg) · Debt of Tears (Guilted + 1 dmg)
- **Order** (ledgers: economy/info/control): Unweave the Creed (Rattled, 0 dmg) · Crack the Cipher (tell + String + 1 dmg) · Golden Chains (2 Strings + 1 dmg)
- Damage rule: **vulnerability adds +1 to the maneuver's own `resolveDamage`** (not a flat 2); failure burns `failPatience ?? 1` Patience (+1 more on a failed Fear leverage). Ids are unchanged — only names/effects.

### Attacker style: PCs dots, NPCs archetype
- Extended Triad dots are **PC-only** (UI gated by `hasPlayerOwner`). An NPC with **no dots** but an archetype attacks from its archetype's school: implicit +2 on that school, no foreign-ground malus, veiled label "In their element".
- Dots also sharpen STANDARD checks via a module-managed AE (`syncTriadBonusEffect`, rebuilt on every pip click): Power → Intimidation, Emotion → Insight, Order → Deception, +1/dot (`system.skills.*.bonuses.check`). Aligned school+skill double-count is intentional ("signature move").
- Psychotype field removed from the Profile UI (data field remains on flags).
- Canvas pick uses `#board` (PIXI 8 removed `canvas.app.view`); player target lists filter `hidden` AND `!visible` tokens.

One-shot economy: a one-shot is consumed ONLY if it is the thing granting the advantage — free sources (vulnerability, Smitten) are used first, so resources are never wasted. Provoked (+2 flat) always applies and always burns. Combos create the fencing feel: Cold Shoulder → Desperate → Love Bombing with Advantage → Smitten → Persuasion chain.

**Attacker-side triad leanings:** the attacker's Extended Triad dots ARE their attack style — +1 per dot on that triad's maneuvers, −1 on a triad with 0 dots while others have some ("foreign ground"); General tactics always neutral. Shown as ★ +N / ▼ −1 badges on maneuver group labels and as signed chips in the Duel Panel. Picking an archetype auto-fills its triad to 2● (QoL in the Chronicle archetype handler). PCs set this in their own Chronicle → Profile.

**Triad counter cycle (`TRIAD_COUNTERS`):** Power breaks Emotion → Emotion cracks Order → Order binds Power. A maneuver whose school counters the DEFENDER's ruling triad gets +2 (reason kind:"counter"). Pre-read the Duel Panel veils it as "Something in them yields to this school…" (+2 ?) so the bonus applies without leaking the triad; the » badge on chips appears only after a read.

**Social DC (`getSocialDC`):** max(passive Insight, 10 + WIS mod + proficiency) — proficiency from `attributes.prof`, falling back to level/CR math. Scales defense with level so high-tier attack stacking doesn't trivialize targets.

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
