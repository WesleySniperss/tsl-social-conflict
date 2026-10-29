# TSL: Social Conflict

Foundry VTT module — social conflict for D&D (dnd5e, a5e) inspired by **Thirsty Sword Lesbians**: you want something from an NPC who doesn't want to give it. **The conversation is played live** — the players talk in character, the GM answers as the NPC and plays their hidden nature; what the talk reveals and the emotions it leaves, the GM marks with no roll. **A roll only when the GM calls for it** (1–3 a conversation, often 1): say what the words really were — one of **seven maneuvers, each a pair of D&D skills** (Demand · Appeal · Bargain to ask, Blackmail · Seduce · Deceive to go all in, or Read them) — rolled in the system's own check window; the NPC's hidden **psychological nature** shapes every result: a key, a wall, a price, how they push back — and the **emotion** it leaves on whoever misses (five TSL emotions on everyone; a repeated one leaves a **scar**).

**v3 (3.0.0) is a rebuild.** The design and its measured numbers live in `docs/v3-design.md` (Ukrainian) — read it before changing rules. v1/v2 (Composure, 17 maneuvers, wounds/boons/scars, the conflict window, the TSL 2d6 mode) are in git history and the v2.0.0 release. The v3 draft "exchange" (Sway, an Agenda clock, rounds, the NPC's counter-roll, three states) was dropped before release for **the Ask** (the user, 2026-10-14: "якось щось не те" — it still had a duel's skeleton). The bare Ask then played "boring, shallow, too few techniques" (the user, same day), so **Techniques** went on top of it — the user's pick of three options: 12 techniques with distinct jobs, three openings (moods, not points), and a cost per approach. After a review the same day (the user: "а статуси, шрами, рани?"), **emotions & scars** (v3.1.0) closed two measured holes — free retries of Opens, and Pressure's "cost" that was a bonus — and brought back statuses/wounds/scars in TSL's lean form. Then (2026-10-15, the user) **openings and the Open row went** ("наративно не мають сенсу"), the **three Reads became one**, and the talk target became **the map** (Foundry targeting, T, or Pick on the map — no list: "what if there are 50?"). Then (2026-10-17, v3.3.0, the user: "мені все ще не вистачає вайбу втм") the **VtM layer**: **masks** (Nature / Demeanor), **witnesses** (Elysium), the court-intrigue tone, and a thought-through **String economy** instead of Boons ("струни ж дають бонуси, і в бою теж, треба лише гарно продумати за що їх отримують") — plus **Ukrainian**, with a language setting. Then (2026-10-29, v3.6.0, the user: "я все ще не розумію суть, ціль і логіку … маневри мають бути прив'язані до навичок і їх комбінацій … достатньо лише вікна системи … ти забув всі наші розмови?") maneuvers on **skill pairs** again (as in v1.21: the better rolls, the other backs it +2 if trained), **no Leanings** (no stats of the module's own — the sheet is the character), the system's check window ON by default. A first cut also had "three steps" (Understand → Prepare → Get it, each a roll) and a Prepare row (Frighten/Reproach/Corner); the user rejected it the same day — «Ти знову береш механіки без урахунку ролплею живого відіграшу і розмови. Рол за розмову робиться максимум 3 рази, іноді і один» — so v3.6.0 shipped **roleplay first**: the talk is played, the GM marks what it did (known facts, emotions) with no roll, and Talk is only the roll the GM calls for. Don't resurrect the exchange or v2 without a reason from play — don't strip the maneuvers back to one skill, don't add module-owned stats, and **don't turn the conversation into a sequence of rolled moves**: anything the GM can decide from the roleplay needs no roll.

## License
- TSL open license: **Powered by Lesbians** (poweredbylesbians.com); code and text **CC BY-SA 4.0**.
- Keep the TSL attribution in README and the module description. Thirsty Sword Lesbians™ is a trademark of April Kit Walsh, published by Evil Hat Productions.

## Target platform
- **Foundry VTT v13** minimum, **v14 verified** (ApplicationV1 / Dialog V1 are deprecated-but-functional there; removal ~v16).
- Systems: `dnd5e` and `a5e` (Level Up). Vanilla JS + the Foundry API, no frameworks, no Handlebars — windows build raw HTML strings.
- Requires the `vtools` module (toolbar button).

## Design pillars (judge every change against these)
1. **Understand the person.** Knowing an NPC beats charisma. (Measured: a +2 character who knows the key beats a +7 face pressing blind.)
2. **What you say matters.** The line comes first; the maneuver is what the line really is (the GM holds them to it).
3. **The only mystery is the person.** Numbers are open (the DC is visible); the nature is hidden — but readable.
4. **Everyone at the table can contribute.** Everyone talks; one reads, another asks; skill pairs give the brute (Athletics) and the scholar (Investigation) maneuvers of their own; a friend helps (+2); a String can set up a friend's ask (Hurt → an emotion on them).
5. **Consequences outlive the scene.** Emotions last until acted out, scars for good; Strings and bonds carry into the campaign and into combat.
6. **The core fits on one screen.** Resist adding layers in response to "it feels thin" — first ask what decision the core loop is missing (that mistake built v2).
7. **The talk is played, not clicked.** The module keeps the person (hidden nature), remembers what the talk did, and counts the 1–3 rolls the GM calls for. Whatever the GM can decide from the roleplay takes no roll (the user, 2026-10-29).

## Files
```
scripts/
  i18n.js               _t("English text", {placeholders}) → the user's language; TSLi18n (resolve auto/en/uk, setLanguage, apply = data texts translated in place, originals kept in a hidden __en, rerender)
  i18n-uk.js            TSL_UK — the Ukrainian dictionary, English text as the key (~1000 entries; the harness checks coverage)
  socket.js             TSLSocket (SOCIAL_PULSE, GM_ACTION relay) + TSLGMActions (player actions run on the GM)
  social-archetypes.js  APPROACHES (+ `cost`: what winning that way costs), SOCIAL_TRIADS, 9 SOCIAL_ARCHETYPES (key/wall/price/press/pressed), tells & reactions pools,
                        PROFILE_POINTS, BOND_TYPES, SocialArchetypeManager (flags, known facts, stance)
  string-store.js       TSLStringStore — Strings (cap 3), spend, Pull (real AE, ends itself) + its per-system changes
  bond-store.js         TSLBondStore — bonds mirrored on both actors, shift (warm | cool | sour | enemy)
  emotions.js           TSLEmotions — EMOTIONS (5, TSL) + SCARS (5) as ActiveEffects: of/has/add (repeat → scar)/clear/unset, mark (the GM, from the talk — no roll), rollParts, hurt (String → emotion), HUD statuses
  talk.js               TSLTalk — TECHNIQUES (7 maneuvers, `skills` = a pair), TECH_JOBS (read/ask/gambit), ASK_SIZES, READ_QUESTIONS (8); DCs, preview, roll (speaker), prompts (price, questions + the strong Read's String, String burn),
                        resolve (GM), lies on the NPC, exposeLie, card, pulse
  social-notes-app.js   The Chronicle (Profile · Bonds · Talk · Codex); the talk target follows Foundry targeting (`targetToken` hook) or Pick on the map; an NPC's own Talk tab = the GM's live screen (how to play each approach; "From the talk" marks: known facts + emotions) + "Ask them as" buttons (open a PC's Talk already facing the NPC: `open(pc, {tab, target})`)
  social-hud.js         Token HUD button + actor context menu → Chronicle
  scene-visualizer.js   The Social Scene (relationship map, emotions, named natures, live pulses) — "scene" and "world" windows
  hud-button.js         VTools "Social" button → Scene
  main.js               settings, ready hook, migrations (token chronicles; v3 cleanup)
styles/tsl.css          all styling
docs/v3-design.md       the design (Ukrainian) — rules, decisions, measured balance
tools/harness.js        stubbed-Foundry tests (node tools/harness.js) — run after EVERY change
tools/preview.js        static renders + headless-Chrome screenshots of every surface (--lang=uk for Ukrainian)
```

## How it works
- **The talk is played; the roll is called** (v3.6). Players talk in character, the GM answers and plays the nature — the NPC's own Talk tab shows how they take each approach (key: `keyText`, wall: `wallText`, the third: a normal roll), the price, the no, the mask to act out. What the talk does, the GM marks there with NO roll: known facts (`data-known` chips) and emotions (`TSLEmotions.mark(npc, id, {toward})` — again = take it back quietly; Guilty needs `toward`, a PC on the map, and moves if marked toward another; one slim "The words landed" card). A roll only when the GM calls for it: usually one per conversation (the ask), a Read when the talk can't show it, at most 2–3.
- **Maneuvers** (`TECHNIQUES` in code; the UI says "maneuver" / "маневр") — no exchange object, no clocks, no turns. **No declared goal** (the user, 2026-10-13: "ціль в соціалці постійно міняється") — the goal is "get what you want from them, this time"; each ask is its own yes or no. Seven: an approach × a job (`techniqueFor(ap, job)`), plus the Read.
  - **Skills** — every maneuver is a PAIR (`skills: [a, b]`): `bestSkill` picks the better for this actor (no picker), the other **backs it +`SUPPORT_BONUS` (2)** if `TSLTalk.proficient`. Pairs: read ins+inv · demand itm+ath · appeal/seduce per+prf · bargain per+inv · blackmail itm+inv · deceive dec+prf. The user (2026-10-29): "маневри мають бути прив'язані до навичок і їх комбінацій" — v1.21 had primary + support; v3.5's one-skill-each lost it.
  - **read** — `approach: null` (no bond, no key/wall die, no witnesses): 1 question; a strong hit — a 2nd question OR a String on them ("you saw where it hurts", payload `readString`); a miss costs no emotion. 8 questions: desire, fear, key, wall, price, pressed, mask (only if they show a face — `TSLTalk.openQuestions`), audience.

  - **ask** (demand/appeal/bargain) — sized `ASK_SIZES` small −4 / costly 0 / against +4 ("against" needs a lever, a String or a bond ●●+ that matches);
  - **gambit** (blackmail/seduce/deceive), the "All in" row — any size, its own leverage, no price.
  - Each maneuver has a `line` (what it looks like in a scene), `win` / `miss` (plain words, shown before the roll), a `rule`. Maneuver buttons show the line and both skills (the rolling one bold, a tick on a backing one) — no odds; the odds sit only on the Roll button.
- **No openings** since v3.2 (a dead `flags.openings` may linger on old NPCs; nothing reads it); **no Prepare row** (a v3.6 draft, never released). Preparation is the talk itself (the GM's emotion mark), or a String spent to Hurt.
- **No Leanings** since v3.6: no module-owned stats; a PC's Profile shows "Your maneuvers" — all seven from their sheet (skill, backing, total), best first. Old `socialFencing.triad` data stays on actors, unread.
- **The talk target** is a token on the map **with the speaker**: Talk needs the speaker's token on the map in view (`_tokenOf`), drops a target that isn't there, and the NPC's "Ask them as" row needs the NPC on the map (the user, 2026-10-28: "лише ті, що є на карті з тобою"). The `targetToken` hook follows this user's Foundry targeting (T); "Pick on the map" uses the capture listener. No list.
- **Talk (a PC's) is the roll form** (v3.6 layout): what the party knows in words + "Not known yet: … Watch how they take your words — or read them"; "Talk in character … Roll only when the GM calls for it"; two mode buttons — **I ask** / **I read them** (`_tMode`; derived from `_tTech` when one is picked). Nothing else to click until the GM calls a roll. I ask → "How did your words come at them?" (three approach buttons, `data-t-ap`, each with how the person is KNOWN to take it: `TSLTalk.knownRelation` key → advantage, wall → disadvantage, plain → a normal roll, unknown) → "Plainly — or all in?" (the ask and the gambit of that approach) → the picked maneuver: "If it works / If not", "What are you asking for?", "Who's watching?", "Did your words play on what you know?" (levers), help, the Roll button with the odds (`TSLTalk.chance` / `hitChance`: party knowledge only, never the truth); the result says what to do next. Never call the third approach "plain ground" in the UI — it's a normal roll.
- **Costs by approach** (applied in resolve):
  - Pressure wins → no price, bond `shift sour` (none/stranger → Rival ●);
  - Heart wins → `shift warm` (none → Friend ●); Heart misses → a String on the speaker;
  - Reason → clean; Appeal/Bargain plain hits → the nature's `price` prompt (`hasPrice`).
- **Gambits:**
  - Blackmail needs known Fear (+2 lever) or a held String → hit `shift enemy`; miss enemy + String on you.
  - Seduce needs known Desire (+2) or a bond ●● → hit warm; miss cool + String.
  - Deceive → hit records a lie (`flags.lies`); the GM's `exposeLie` → enemy + 2 Strings; miss → String + door closed (any nature).
- **Witnesses** (asks & gambits): the player picks In private / Before witnesses (`_tWitnesses` → `witnesses`). The nature's `audience` (+2 bend / −2 harden / 0, `audienceWhy`) is added AFTER the dice like key/wall (the preview never consults it); `known.audience` learned. A public yes to a costly/against ask or gambit → a String on them ("Everyone saw them give it"; a small one binds nobody — anti-farming); a public no → Insecure ("loses face", unless the nature already hurt with Insecure). The GM can make a whole scene public (scene flag `public`, `TSLTalk.publicScene()`, the button in the Social Scene header): `_tWitnesses` null = follow the scene; the speaker's click overrides.
- **Masks**: `socialFencing.maskId` = the nature they SHOW (GM: Profile → Nature → Mask). `getShown` (any face) / `getMask` (a face ≠ their nature). Players see "seems: X" + "How they seem" (Talk, Scene); key/wall/price are always the true nature's. The mask question names an open face at once; a mask is known as a mask; key+wall known → named → "The mask falls". Default (no maskId) = "Nature unread", as before.
- **Strings** = a debt, a weakness seen, a line crossed before others. Yours on them: strong + big ask/gambit, a yes before witnesses, a strong Read, the GM's + (they open up to you). Theirs on you: a Pressure/Blackmail win, a Heart miss / broken heart, a caught threat/bluff/lie (exposed lie: 2), a price that is a debt, a botch. One each way per roll. `TSLStringStore.add` makes a **Stranger** bond when none exists (so the String shows in Bonds for Pull/Hurt); `shift warm` turns a Stranger into a Friend ●.
- **Roll** (speaker's client, `TSLTalk.roll`): `preview()` builds the visible math (the better skill + support 2 if trained + bond ● + lever + help ± emotions vs DC `10 + prof + max(WIS, INT)` + dial + size). It never consults the nature. The system's check window opens by default (`systemRollDialog` true), set to the skill with the module's bonus as a situational mod. A KEY approach rolls a second d20 and keeps the better, a WALL keeps the worse — on the ask and the gambit of that approach (a Read has no approach). Grades: strong (DC+5 / nat 20), success, failure, botch (DC−5 / nat 1). A miss may burn a String (+5). Then `TSLGMActions.request("talkResolve", payload)` with `technique`.
- **Resolve** (GM only): re-derives key/wall from the truth, records knowledge.
  - Strong + big ask/gambit → a String on them (small gives none — anti-farming).
  - Misses: at most ONE String on the speaker per roll (Heart, Fear lever, gambit blow-up, botch). A firm nature refusing a big ask/gambit closes the door + `shift cool`.
  - Names the nature once key AND wall are known. ONE card, then a pulse `{technique, approach, job, grade, paid, rel, ended, granted, witnesses}`.
- "The door is closed for the scene" / "they won't be read again this scene" are narrative — the GM holds them.
- **Emotions & scars** (`emotions.js`): an emotion is an AE with `statuses: ["tsl-emo-<id>"]` + `flags.emotion {id, by, toward}` (a HUD toggle without the flag counts too). `rollParts(src, tgt, technique)` adds −2 for the speaker's own (Angry→Heart, Frightened→Pressure, Insecure→Reason, Guilty→everything vs `toward`, Hopeless→ask/gambit), ±1 for scars, +2 for the target's (`opens` approach; Guilty only for its `toward`). Sources: the GM's mark from the talk (`mark`, no roll); every miss except a Read → the nature's `hurts` (Seduce → Hopeless); Blackmail → NPC Frightened; exposeLie → NPC Angry; `stringHurt` GM action (Bonds → Hurt). A PC taking one they carry → the scar (once). Pressure wins also give the NPC a String on the speaker. Clearing: × on the tag (owner/GM) → act it out or a friend's comfort → one chat line.
- **Knowledge:** `socialFencing.known {desire,fear,key,wall,price,pressed}` + `revealed` — shared by the party, kept for good. Players never see the archetype (or the GM's dossier) until it is named; the GM sees the truth marked "hidden".

## Data on actor flags (scope `tsl-social-conflict`)
- `socialFencing` — `{ archetypeId, maskId (the nature they show), revealed, known (+ mask, audience), stance (after a no: nature|yield|firm|ask), intent (Agenda — GM text, what they want from the party), notes, points {desire, fear, mask (labelled "Face" since v3.3), line} }`. (`triad` — the v3.0–3.5 Leanings dots — may linger; nothing reads it.) Archetype ids are legacy-stable (`machiavellian` = Schemer, `exalted` = Idol, `dogmatic` = Zealot).
- `bonds` — `[{ id, targetActorId, type, attitude (= strength 0..3), notes }]`, mirrored.
- `stringList` — `[{ id, label, targetActorId }]`.
- `openings` — dead since v3.2 (v3.0–3.1 moods); nothing reads it.
- `lies` — on NPCs: `[{ id, byId, at }]`, until the GM brings one out.
- ActiveEffects: emotions (`flags.emotion`, status `tsl-emo-*`) and scars (`flags.scar`) — `migrateToV3` leaves them alone.
- `exchange` / `encounter` / `willpower` / `woundTrack` — dead; `migrateToV3` unsets them.

## Settings
`language` (client; auto | en | uk — auto follows `game.i18n.lang`; registered first in init, switches live), `systemRollDialog` (default **true** since v3.6 — the system's window is the roll; false: a5e rolls its own check with `skipRollDialog`, same bonus; the old `useSystemRollDialog` is no longer read), `socialDcBonus` (0), hidden `dataVersion` (migrations).

## Hard-won platform lessons (still true)
- **`"socket": true` in module.json** is what makes Foundry relay `module.<id>` socket events. Without it every player → GM message is silently dropped. Changing it, or adding a new script file to the manifest, needs a **world restart**, not F5.
- **Refresh, don't re-render on everything.** The Chronicle listens to updateActor (only `flags.tsl-social-conflict`, name, img; `system` only on Talk), Active Effect hooks for its actor and target, updateScene, deleteActor — all through `_refresh()`: coalesced (60 ms) and held while a text field in the window has focus (a re-render wiped half-typed text). The Scene re-renders only for our effects. Keep new hooks on this path.
- **The relay trusts no one's character but their own:** `TSLGMActions.handle(data, senderId)` checks the sender owns `srcId` / `holderId`. A new GM action needs its actor in `_actorOf`. With no GM online, `request` warns and returns false.
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
- **Every word on screen goes through `_t("English", {placeholders})`** — a plain double-quoted literal (the harness scans for them). A new string needs its Ukrainian in `scripts/i18n-uk.js` (the harness fails on a missing key or a lost {placeholder}). Data texts (natures, techniques, emotions, bonds…) are translated in place by `TSLi18n.apply()` — add new data fields to it. Ukrainian style: the NPC is "вони" (no gendered verbs), the player "ти"; terms Струна, Зв'язок, Натура, Маска, Ключ/Стіна, При свідках, Просити/Ва-банк/Читати, СК, КБ. Chat cards are written in the language of the client that creates them.
- Fonts: Cinzel / EB Garamond aren't loaded — the stacks fall back to Modesto Condensed / Signika (Latin only), then Palatino Linotype / Georgia for Cyrillic. Keep Cyrillic-capable fallbacks; Ukrainian labels are longer — check `--lang=uk` screenshots.
- Talk to the user in Ukrainian.

## Known issues / TODO
- [ ] Playtest one real scene; tune the strong threshold (DC+5), the emotion penalty (2), the size shifts (±4) and the lever bonus from it (`docs/v3-design.md` §5).
- [ ] Multiplayer socket test (player rolls → GM resolves) in a live world.
- [ ] Migrate ApplicationV1 → V2 and Dialog → DialogV2 before ~v16.
- [x] i18n: English + Ukrainian via `_t` (v3.3.0). Foundry's `lang/*.json` isn't used — the module keeps its own dictionary.

## Developer notes
- The author runs Foundry v13/v14 in a Ukrainian locale; other modules: `a5e-mancer`, `enhancedcombathud-a5e`, `epic-rolls-ua`, `lockpick-minigame`, `vtools`.
- Releases: bump the version, commit, push to main, `git archive` the zip, `gh release create vX.Y.Z <zip> module.json`, verify the latest manifest — only when the user asks to push.
