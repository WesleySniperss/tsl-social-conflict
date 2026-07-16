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
- **Strings economy**: earned by reads and baits (Feigned Weakness / Sweeten the Deal grant 2), spent for +1 on TSL moves / +2 on maneuvers; also visible & editable in Chronicle bonds. **Grip passive (v1.9.5)**: HOLDING ≥1 String on someone gives +1 on maneuvers against them; Strings THEY hold on you add +1 to their DC when you try to sway them (flat, not per-String — no farm stacking). Spend burns AFTER the roll so the grip preview matches the dice and an error can't eat a String.
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
| Rattled | DC to sway them −5; **combat:** dis on WIS saves (midi flag on dnd5e) | Undermine | scene (1h) |
| Smitten | charmer's Persuasion maneuvers get Advantage; the smitten one CANNOT maneuver against the charmer (hard block in assess); **combat:** dis on attacks vs charmer | Flatter, Charm | scene (1h) |
| Provoked | next maneuver vs them +2; **combat:** must attack the provoker, dis vs others | Taunt | one-shot |
| Guilted | guilter's next maneuver gets Advantage; **combat:** dis on attacks vs the guilter | Guilt Trip | one-shot |
| Desperate | next Flatter/Charm gets Advantage; **combat:** dis on Insight checks (midi flag) | Ignore Them | one-shot |
| Defiant | immune to maneuvers; **Read Them slips through** (`worksThroughDefiant`) and a SUCCESSFUL read breaks the wall; **combat:** adv on WIS saves | hitting an immunity | 10 min or until read |

**Combat riders** live in each condition's `combat` field → appended to the AE description (`buildConditionEffect`), plus per-system changes: `dnd5eChanges`+`midiChanges` on dnd5e, `a5eChanges` on standalone a5e.

### Maneuver redesign (v1.8) — school identities
- **General** (safe basics, no vuln/imm): Read Them (scout: tell+String, 0 dmg, through Defiant) · Mock (the jab: 1 dmg flat) · Taunt (setup: Provoked, 0 dmg)
- **Power** (domination — hits harder, risks harder): Flatter (Smitten + 1 dmg) · Play Weak (deep bait: 3 Strings, 0 dmg) · Humiliate (2 dmg, but `failPatience: 2`)
- **Emotion** (hearts → combos): Charm (Smitten + 1 String, 0 dmg) · Ignore Them (Desperate + 1 dmg) · Guilt Trip (Guilted + 1 dmg)
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

One-shot economy: a one-shot is consumed ONLY if it is the thing granting the advantage — free sources (vulnerability, Smitten) are used first, so resources are never wasted. Provoked (+2 flat) always applies and always burns. Combos create the fencing feel: Cold Shoulder → Desperate → Love Bombing with Advantage → Smitten → Persuasion chain.

**Attacker-side triad leanings:** the attacker's Extended Triad dots ARE their attack style — +1 per dot on that triad's maneuvers, −1 on a triad with 0 dots while others have some ("foreign ground"); General tactics always neutral. Shown as ★ +N / ▼ −1 badges on maneuver group labels and as signed chips in the Duel Panel. Picking an archetype auto-fills its triad to 2● (QoL in the Chronicle archetype handler). PCs set this in their own Chronicle → Profile.

**Triad counter cycle (`TRIAD_COUNTERS`):** Power breaks Emotion → Emotion cracks Reason → Reason binds Power. A maneuver whose school counters the DEFENDER's ruling triad gets +2 (reason kind:"counter"). Pre-read the Duel Panel veils it as "Something in them yields to this school…" (+2 ?) so the bonus applies without leaking the triad; the » badge on chips appears only after a read.

**Social DC (`getSocialDC`):** max(passive Insight, 10 + WIS mod + proficiency) — proficiency from `attributes.prof`, falling back to level/CR math. Scales defense with level so high-tier attack stacking doesn't trivialize targets.

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

### v1.9.7 — console alignment pass
- **Target header is a card**: portrait (triad-colored ring) · name+archetype · tracks · status tags in one bordered block with a soft triad-tinted gradient — same silhouette as conflict participant cards (`.tsl-fc-head` rebuilt, `.tsl-fc-portrait`, `.tsl-fc-head-main/-row`).
- **Even maneuver rail**: fixed 64px label column, labels vertically centered, each school band gets a soft triad tint + right-rounded corners (`.tsl-fc .tsl-chip-group` overrides).
- **Aligned GM tracks**: fixed 64px label column so Resolve/Patience pips start at the same x; counts right-aligned. Target row controls share one 30px height.

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
