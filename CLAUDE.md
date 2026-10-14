# TSL: Social Conflict

Foundry VTT module — social conflict for D&D (dnd5e, a5e) inspired by **Thirsty Sword Lesbians**: you want something from an NPC who doesn't want to give it — say the line, pick one of **twelve techniques** (Pressure · Heart · Reason × Open · Ask · Read · Gambit), roll once; **openings** prepare a big ask, and the NPC's hidden **psychological nature** shapes every result: a key, a wall, a price, how they push back — and the **emotion** it leaves on whoever misses (five TSL emotions on everyone; a repeated one leaves a **scar**).

**v3 (3.0.0) is a rebuild.** The design and its measured numbers live in `docs/v3-design.md` (Ukrainian) — read it before changing rules. v1/v2 (Composure, 17 maneuvers, wounds/boons/scars, the conflict window, the TSL 2d6 mode) are in git history and the v2.0.0 release. The v3 draft "exchange" (Sway, an Agenda clock, rounds, the NPC's counter-roll, three states) was dropped before release for **the Ask** (the user, 2026-10-14: "якось щось не те" — it still had a duel's skeleton). The bare Ask then played "boring, shallow, too few techniques" (the user, same day), so **Techniques** went on top of it — the user's pick of three options: 12 techniques with distinct jobs, three openings (moods, not points), and a cost per approach. After a review the same day (the user: "а статуси, шрами, рани?"), **emotions & scars** (v3.1.0) closed two measured holes — free retries of Opens, and Pressure's "cost" that was a bonus — and brought back statuses/wounds/scars in TSL's lean form. Don't resurrect the exchange or v2 without a reason from play — and don't strip the techniques back to one roll.

## License
- TSL open license: **Powered by Lesbians** (poweredbylesbians.com); code and text **CC BY-SA 4.0**.
- Keep the TSL attribution in README and the module description. Thirsty Sword Lesbians™ is a trademark of April Kit Walsh, published by Evil Hat Productions.

## Target platform
- **Foundry VTT v13** minimum, **v14 verified** (ApplicationV1 / Dialog V1 are deprecated-but-functional there; removal ~v16).
- Systems: `dnd5e` and `a5e` (Level Up). Vanilla JS + the Foundry API, no frameworks, no Handlebars — windows build raw HTML strings.
- Requires the `vtools` module (toolbar button).

## Design pillars (judge every change against these)
1. **Understand the person.** Knowing an NPC beats charisma. (Measured: a +2 character who knows the key beats a +7 face pressing blind.)
2. **What you say matters.** The line comes first; the technique is what the line really is (the GM holds them to it).
3. **The only mystery is the person.** Numbers are open (the DC is visible); the nature is hidden — but readable.
4. **Everyone at the table can contribute.** One opens, another asks; a friend helps (+2); any skill that fits the words.
5. **Consequences outlive the scene.** Emotions last until acted out, scars for good; Strings and bonds carry into the campaign and into combat.
6. **The core fits on one screen.** Resist adding layers in response to "it feels thin" — first ask what decision the core loop is missing (that mistake built v2).

## Files
```
scripts/
  socket.js             TSLSocket (SOCIAL_PULSE, GM_ACTION relay) + TSLGMActions (player actions run on the GM)
  social-archetypes.js  APPROACHES (+ `cost`: what winning that way costs), SOCIAL_TRIADS, 9 SOCIAL_ARCHETYPES (key/wall/price/press/pressed), tells & reactions pools,
                        PROFILE_POINTS, BOND_TYPES, SocialArchetypeManager (flags, known facts, stance)
  string-store.js       TSLStringStore — Strings (cap 3), spend, Pull (real AE, ends itself) + its per-system changes
  bond-store.js         TSLBondStore — bonds mirrored on both actors, shift (warm | cool | sour | enemy)
  emotions.js           TSLEmotions — EMOTIONS (5, TSL) + SCARS (5) as ActiveEffects: of/has/add (repeat → scar)/clear, rollParts, hurt (String → emotion), HUD statuses
  talk.js               TSLTalk — TECHNIQUES (12), OPENINGS, ASK_SIZES; DCs, preview, roll (speaker), prompts (price, questions, String burn),
                        resolve (GM), openings & lies on the NPC, exposeLie, card, pulse
  social-notes-app.js   The Chronicle (Profile · Bonds · Talk · Codex); an NPC's own Talk tab = the GM's cheat sheet + "Ask them as" buttons (open a PC's Talk already facing the NPC: `open(pc, {tab, target})`)
  social-hud.js         Token HUD button + actor context menu → Chronicle
  scene-visualizer.js   The Social Scene (relationship map, openings, named natures, live pulses) — "scene" and "world" windows
  hud-button.js         VTools "Social" button → Scene
  main.js               settings, ready hook, migrations (token chronicles; v3 cleanup)
styles/tsl.css          all styling
docs/v3-design.md       the design (Ukrainian) — rules, decisions, measured balance
tools/harness.js        stubbed-Foundry tests (node tools/harness.js) — run after EVERY change
tools/preview.js        static renders + headless-Chrome screenshots of every surface
```

## How it works
- **Techniques** — no exchange object, no clocks, no turns. **There is no declared goal** (the user, 2026-10-13: "ціль в соціалці постійно міняється"). `TECHNIQUES`: each is an approach × a job (`techniqueFor(ap, job)`):
  - **open** (shake/flatter/tempt) — a hit adds that approach's OPENING;
  - **ask** (demand/appeal/bargain) — sized `ASK_SIZES` small −4 / costly 0 / against +4;
  - **read** (provoke/confide/study) — 1 question, 2 on strong;
  - **gambit** (blackmail/seduce/deceive) — any size, its own leverage, no price.
- **Openings** (`flags.openings {sceneId, list:[{type, byId}]}`, one per approach): each is −4 (`OPENING_BONUS`) on the next ask/gambit DC and counts as leverage for "against". An ask/gambit spends ALL of them (hit or miss); any other miss pops one. Another scene's read as none; the GM clears them (`clearOpenings`).
- **Costs by approach** (applied in resolve):
  - Pressure wins → no price, bond `shift sour` (none/stranger → Rival ●);
  - Heart wins → `shift warm` (none → Friend ●); Heart misses → a String on the speaker;
  - Reason → clean; Appeal/Bargain plain hits → the nature's `price` prompt (`hasPrice`).
- **Gambits:**
  - Blackmail needs known Fear (+2 lever) or a held String → hit `shift enemy`; miss enemy + String on you.
  - Seduce needs known Desire (+2) or a bond ●● → hit warm; miss cool + String.
  - Deceive → hit records a lie (`flags.lies`); the GM's `exposeLie` → enemy + 2 Strings; miss → String + door closed (any nature).
- **Roll** (speaker's client, `TSLTalk.roll`): `preview()` builds the visible math (skill + Leanings + bond ● + lever + help vs DC `10 + prof + max(WIS, INT)` + dial + size − 4×openings). It never consults the nature. A KEY approach rolls a second d20 and keeps the better, a WALL keeps the worse — on all four techniques of the approach, reads included. Grades: strong (DC+5 / nat 20), success, failure, botch (DC−5 / nat 1). A miss may burn a String (+5). Then `TSLGMActions.request("talkResolve", payload)` with `technique`.
- **Resolve** (GM only): re-derives key/wall from the truth, records knowledge.
  - Strong + big ask/gambit → a String on them (small gives none — anti-farming).
  - Misses: at most ONE String on the speaker per roll (Heart, Fear lever, gambit blow-up, botch). A firm nature refusing a big ask/gambit closes the door + `shift cool`.
  - Names the nature once key AND wall are known. ONE card, then a pulse `{technique, approach, job, grade, paid, rel, ended, granted}`.
- "The door is closed for the scene" / "they won't be read again this scene" are narrative — the GM holds them.
- **Emotions & scars** (`emotions.js`): an emotion is an AE with `statuses: ["tsl-emo-<id>"]` + `flags.emotion {id, by, toward}` (a HUD toggle without the flag counts too). `rollParts(src, tgt, technique)` adds −2 for the speaker's own (Angry→Heart, Frightened→Pressure, Insecure→Reason, Guilty→everything vs `toward`, Hopeless→ask/gambit), ±1 for scars, +2 for the target's (`opens` approach; Guilty only for its `toward`). Sources: every miss except Study → the nature's `hurts` (Seduce → Hopeless); Blackmail → NPC Frightened; exposeLie → NPC Angry; `stringHurt` GM action (Bonds → Hurt). A PC taking one they carry → the scar (once). Pressure wins also give the NPC a String on the speaker. Clearing: × on the tag (owner/GM) → act it out or a friend's comfort → one chat line.
- **Knowledge:** `socialFencing.known {desire,fear,key,wall,price,pressed}` + `revealed` — shared by the party, kept for good. Players never see the archetype (or the GM's dossier) until it is named; the GM sees the truth marked "hidden".

## Data on actor flags (scope `tsl-social-conflict`)
- `socialFencing` — `{ archetypeId, revealed, known, stance (after a no: nature|yield|firm|ask), intent (Agenda — GM text, what they want from the party), notes, triad {power, attention, order} (Leanings dots, PCs; pool 4), points {desire, fear, mask, line} }`. Archetype ids are legacy-stable (`machiavellian` = Schemer, `exalted` = Idol, `dogmatic` = Zealot).
- `bonds` — `[{ id, targetActorId, type, attitude (= strength 0..3), notes }]`, mirrored.
- `stringList` — `[{ id, label, targetActorId }]`.
- `openings` — on NPCs: `{ sceneId, list: [{ type (pressure|heart|reason), byId }] }`.
- `lies` — on NPCs: `[{ id, byId, at }]`, until the GM brings one out.
- ActiveEffects: emotions (`flags.emotion`, status `tsl-emo-*`) and scars (`flags.scar`) — `migrateToV3` leaves them alone.
- `exchange` / `encounter` / `willpower` / `woundTrack` — dead; `migrateToV3` unsets them.

## Settings
`useSystemRollDialog` (default true), `socialDcBonus` (0), hidden `dataVersion` (migrations).

## Hard-won platform lessons (still true)
- **`"socket": true` in module.json** is what makes Foundry relay `module.<id>` socket events. Without it every player → GM message is silently dropped. Changing it, or adding a new script file to the manifest, needs a **world restart**, not F5.
- **Who is a PC:** always `SocialArchetypeManager.isPC(actor)` = type `"character"` OR player-owned — never `hasPlayerOwner` alone. The author tests alone as the only (GM) user, where nobody owns the characters; with `hasPlayerOwner` every character read as an NPC and Talk showed the GM cheat sheet instead of the ask (2026-10-14).
- The Chronicle normalises to the **world actor** (`game.actors.get(actor.id)`) — unlinked tokens hand over synthetic actors with token-local flags.
- Canvas picking uses a **DOM capture listener on `#board`** + `canvas.canvasCoordinatesFromClient` (PIXI 8 removed `canvas.app.view`).
- **a5e**: `system.bonuses.*` are RecordFields — a flat AE does nothing; numeric bonuses go through `flags.a5e.effects.bonuses.<kind>` (CUSTOM mode, the bonus record as JSON; list all four `attackTypes`). a5e roll-mode keys are `rollMode.{attack,abilityCheck,abilitySave,skillCheck}.all` (not `savingThrow`). AC: `system.attributes.ac.changes.bonuses.value`. dnd5e: `system.bonuses.*` / `system.attributes.ac.bonus`.
- Foundry gives `<button>` a stretchy base — every button needs an explicit width strategy.
- Look before claiming a UI works: `tools/preview.js --shoot` (portraits via env `TSL_PREVIEW_PORTRAITS`, never commit local paths). After an update mid-session, F5 — stale clients look broken.

## UI conventions
- CSS variables `--tsl-*` (dark: `--tsl-bg #150c0f`, text `#f0dfc8`, accent `#e8557a`); approach colours Pressure `#e8557a`, Heart `#9b6ee8`, Reason `#55b8e8`; gold `#e0b45e` (`--tsl-sway`, a legacy name) for sizes, prices and strong results; red `#d0574d` for walls and bad results. Fonts: Cinzel titles, EB Garamond body (with fallbacks).
- **No emoji in UI** — Font Awesome icons (key = `fa-key`, wall = `fa-door-closed`, read = `fa-eye`).
- Dialogs use `tslDialogOptions()` (dark theme). One card per roll; the result also shows where Roll was clicked.
- UI text is hardcoded English (i18n is a TODO); talk to the user in Ukrainian.

## Known issues / TODO
- [ ] Playtest one real scene; tune the strong threshold (DC+5), the opening bonus (4), the emotion penalty (2), the size shifts (±4) and the lever bonus from it (`docs/v3-design.md` §5).
- [ ] Multiplayer socket test (player rolls → GM resolves) in a live world.
- [ ] Migrate ApplicationV1 → V2 and Dialog → DialogV2 before ~v16.
- [ ] i18n: move UI strings into `lang/en.json`, add `uk.json`.

## Developer notes
- The author runs Foundry v13/v14 in a Ukrainian locale; other modules: `a5e-mancer`, `enhancedcombathud-a5e`, `epic-rolls-ua`, `lockpick-minigame`, `vtools`.
- Releases: bump the version, commit, push to main, `git archive` the zip, `gh release create vX.Y.Z <zip> module.json`, verify the latest manifest — only when the user asks to push.
