# TSL: Social Conflict

A social-intrigue toolkit for **Foundry VTT v13+** (v14 verified): a **Chronicle of Bonds** (relationships & profiling), a **Social Fencing** minigame (d20 maneuvers vs a hidden difficulty), and a live **Social Scene** relationship map. Inspired by the emotional mechanics of **Thirsty Sword Lesbians** and the social maneuvering of Vampire: the Masquerade. Built for **dnd5e** and **a5e** (Level Up), with a generic fallback.

## Three windows

- **Chronicle** — right-click a token → the address-book button. A per-character dossier, and where you actually fence (the **Fencing** tab). The **Codex** tab is the full, always-current in-app manual (paged, collapsible, with a worked example scene).
- **Social Scene** — the VTools toolbar **Social** button (everyone can open it). A live relationship map: portraits as nodes, bonds as the lines between them (colour = school, thickness = strength), with live roll/effect pulses (a beam, a flash, the falling Resolve, the swayed/walked drama). Drag the portraits to arrange it; **zoom the map** with the buttons or scroll-wheel (the window stays put, the map scrolls inside). It comes in **two views**: *This scene* (only the current scene — what players see) and *All bonds* (the whole web of relationships, GM overview) — switch with the header button; both can be open at once. The GM starts a shared conflict from the **⚔ Conflict** button here.
- **Conflict window** — the shared roll board when the GM launches a scene; every client sees it and acts from their own copy.

## Chronicle of Bonds

- **Profile** — the character's **archetype** (9 natures across the Power / Emotion / Reason triads — hidden from players by default), their Extended-Triad **dots** (a 4-point pool, PC-only), and the **profiling dossier**: **Desire / Fear / Weakness** are leverage doors you exploit in a conflict; **Mask / The Line** help you read them. Plus a GM-only **Agenda** (their goal in the scene) and free **Notes**. Hover any label for its hint.
- **Bonds** — one shared relationship per pair, **mirrored on both actors**: a **type** (ally, friend, family, crush, lover, mentor, protégé, rival, enemy, sworn, liege, confidant) and a **strength ●–●●●**. A bond bends the numbers (a school edge and skill edges on maneuvers, the guard DC, guilt when you turn Power on someone close), projects a **combat aura** to allies in reach, unlocks a distinctive **ability at ●●** and a once-per-rest **signature** at ●●●. Add a bond from the scene list or by clicking a token on the map.
- Players open only chronicles of actors they own; what they know about anyone else lives in their own Bonds.

## Social Fencing

- **Fifteen maneuvers in four schools.** **General** holds the basics anyone reaches for — read · mock · goad · **persuade** · **threaten** · **lie** — with no archetype traps; the three archetype schools (**Power · Emotion · Reason**) are the deeper game. Each maneuver rolls a main social skill, with a support skill's modifier on top.
- **Resolve vs Patience — and the second blade.** Chip their **Resolve** (CHA modifier, floor 1 — force of personality) to 0 to **sway** them — they concede / do what you were after, their bond deepens, and you gain a String. But a landed hit isn't automatic: the **defender meets it** — *take it* (lose Resolve), *parry* (spend **Patience** to blunt it — 1 blocks 1 Resolve), or *riposte* (block it all and deal 1 Resolve back). **Patience** (WIS + CHA modifier, floor 2) is that defence pool; run it out defending and they're worn down → they **break off** (walk away, their agenda advances). Two ways to lose: your Resolve breaks (convinced) or your Patience runs out (cornered). A school a target is **vulnerable** to can't be parried; one they're **immune** to slides off. Tracks arm on the first maneuver — no setup. Resolve stays low: the weight is the maneuver's **school** (General 1 · archetype 2 · Humiliate 3), so a smart line lands in ~2 heavy hits, not an HP grind.
- **Hidden difficulty & the deduction loop.** The social DC (10 + their WIS save + INT save, or passive Insight) is GM-only. Archetypes are hidden too: a successful **Read Them** whispers a tell, you write your best guess in the target's Bond (*Read as…*), and the weak/strong marks (◎/✕/▲) then follow **your theory** — provisional, so a wrong guess shows wrong marks and the *outcome* corrects you. No guess yet → no marks. The dice always resolve against the truth.
- **Archetype matrix.** Every nature is vulnerable to some maneuvers (advantage, deeper damage) and immune to others (press one and they turn **Defiant**). **Openings (⊕):** a condition on the target makes a matching maneuver stronger.
- **States vs Wounds.** Fleeting fencing **States** (Rattled, Provoked, Enthralled, Beholden, Desperate, Defiant) carry real combat riders and linger even after the talk (so they still bite if it turns to a fight). Lasting emotional **Wounds** (Angry, Scared, Guilty, Hopeless, Smitten) escalate through three tiers and push the one who carries them; four = **Overwhelmed**.
- **Strings** — a trump card: spend one for **+5** on any roll against that person. Earned by breaking their Resolve, opening your heart in play, reads, deals, or giving in to a Wound.
- Optional layers: the **TSL 2d6 feelings moves**, **Hold the Line** (refuse a status by taking a Wound), GM adjudication of every roll, and a global **Social difficulty** dial in Settings.

## Usage

1. **Prep** — right-click a token → the Chronicle → fill in Profile & Bonds. Hover any label for a hint; read the **Codex** tab for the full walkthrough.
2. **Fence** — open a character's Chronicle → **Fencing** tab → pick a target, pick a maneuver, roll. (Or the GM opens the **Social** scene and hits **⚔ Conflict** to launch a shared board.)
3. Tracks start automatically. Break their Resolve to **sway** them, or run their Patience out and they **walk away**. Read targets to reveal tells; spend Strings for +5.
4. The exchange ends on **swayed**, **walked away**, a **Yield**, or a **Finally Kiss**. Any fencing statuses linger into a fight that follows.

Requires the **vtools** module.

## License

This work uses material from the **Thirsty Sword Lesbians** roleplaying game (found at https://swordlesbians.com), designed by April Kit Walsh and published by Evil Hat Productions, LLC, pursuant to the open license available at **poweredbylesbians.com**.

The text of this work is offered under a **CC BY-SA 4.0** license.

*Thirsty Sword Lesbians™ is a trademark of April Kit Walsh.*
