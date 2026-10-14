# TSL: Social Conflict

Social conflict for **Foundry VTT v13+** (v14 verified), built for **dnd5e** and **a5e** (Level Up). You want something from an NPC who doesn't want to give it, and the person matters more than the dice. Every NPC has a hidden **psychological nature**: a **key** that opens them, a **wall** they close against, and a **price** they name when they give in. Read them first, and a modest character beats a silver tongue who never looked. Inspired by the emotional mechanics of **Thirsty Sword Lesbians**.

## Twelve techniques

No turns, no tracks, no declared goal. Say your line, pick the **technique** it really is, and roll once against a **visible DC = 10 + their proficiency + the better of WIS/INT**. The roll goes through the system's own skill dialog. Every technique is an approach doing a job:

| | Pressure | Heart | Reason |
|---|---|---|---|
| **Open** — get them ready | Shake | Flatter | Tempt |
| **Ask** — get it now | Demand | Appeal | Bargain |
| **Read** — learn something | Provoke | Confide | Study |
| **Gambit** — all in | Blackmail | Seduce | Deceive |

- **Openings.** A hit with an Open leaves a mood on them: *Shaken*, *Moved* or *Curious*.
  - Each opening makes the next ask 4 easier, and counts as leverage.
  - An ask spends them. Any other miss closes one.
  - So the question at the heart of every talk is: ask now, or risk one more technique?
- **Asks** are sized by what they cost *them*:

  | Size | What it is | DC |
  |---|---|---|
  | Small | a favour, a door | −4 |
  | Costly | something it costs them to give | — |
  | Against them | against their interests or loyalties | +4 |

  An ask against them needs leverage: an opening, their Desire or Fear, a String, or a deep bond.
- **Reads** answer one question for the whole party (two on a strong hit). Study is safe. Provoke gets them talking but sours the bond. Confide warms it but exposes you.
- **Gambits** bring their own leverage and leave lasting marks:
  - **Blackmail** plays on their Fear and makes an enemy.
  - **Seduce** plays on their Desire.
  - **Deceive** works until the GM brings the lie out — then they turn on you.

What winning costs depends on the approach:

| Approach | When it works | When it misses |
|---|---|---|
| **Pressure** | They give in without a price, but remember it: the bond sours, and they take a String on you. | Nothing extra. |
| **Heart** | The bond warms. | You exposed yourself: they take a String on you. |
| **Reason** | A clean deal; "yes, but" names their price. | Nothing extra. |

What they say:

| Result | When | What happens |
|---|---|---|
| **Strong hit** | 5 over, or a 20 | It works. An ask or gambit for something big also hands you a String on them. |
| **Hit** | a hit | It works. An Appeal or a Bargain gets "yes, but": their nature names the price; you pay, or you walk away. |
| **Miss** | a miss | They push back their own way, and it hurts: you take their nature's **emotion** (anything but a quiet Study). A proud nature, refused something big, closes the door for the scene. |
| **Bad miss** | 5 under, or a 1 | As a miss, and they take a String on you as well. |

After a miss you may burn a String on them for +5. Your roll adds:
- the skill that fits your words;
- +1 per Leanings dot in that approach;
- +● for a bond that runs that way;
- +2 for their known Desire or Fear;
- +2 when a friend helps.

## Emotions and scars

Five emotions, as in Thirsty Sword Lesbians. Anyone can carry them, a player character or an NPC. They show as status icons on the token; the GM can also toggle them from the Token HUD.

| Emotion | On whoever feels it | For whoever plays on it | Let it go |
|---|---|---|---|
| **Angry** | −2 on Heart | +2 to Pressure against them | lash out: hurt someone, or break something |
| **Frightened** | −2 on Pressure | +2 to Pressure against them | back down, or flee what scares you |
| **Guilty** | −2 on everything against the one you wronged | +2 to Heart from the one they wronged | make amends |
| **Insecure** | −2 on Reason | +2 to Heart against them | prove yourself with a reckless risk |
| **Hopeless** | −2 on asks and gambits | +2 to Reason against them | give something up, or accept comfort |

A friend's comfort lets any of them go, too. Where emotions come from:
- **a miss**: each nature hits back with its own emotion (the Tyrant frightens you, the Duelist makes you angry, the Martyr makes you guilty…);
- **a String** spent on someone (Bonds → Hurt): players do it to NPCs, and the GM's NPCs do it to players;
- **gambits**: Blackmail leaves them Frightened; a broken heart leaves you Hopeless; a lie brought out leaves them Angry.

Take an emotion you already carry, and it leaves a **scar** instead. A scar is permanent, one per emotion, and a twist rather than just a wound:

| Scar | From | For good |
|---|---|---|
| Short Fuse | Angry | +1 Pressure, −1 Heart |
| Flinch | Frightened | +1 on Reads, −1 Pressure |
| Debt | Guilty | +1 Heart, −1 Reason |
| The Mask | Insecure | +1 on Gambits, −1 on Reads |
| Hollow | Hopeless | +1 Reason, −1 on Opens |

## Nine natures

The natures follow Karen Horney's three ways of coping with people:
- moving **against** them — Power: Tyrant, Schemer, Duelist;
- moving **toward** them — Emotion: Martyr, Idol, Caretaker;
- moving **away** from them — Order: Zealot, Hermit, Broker.

Each nature is grounded in a real character type. Each has:
- a **key** approach: on all four of its techniques you roll a second d20 and keep the better;
- a **wall** approach: a second d20, keep the worse;
- its own **price** for a "yes, but";
- its own pushback on a no, and the emotion it leaves on you when you miss;
- whether it keeps listening after refusing something big.

The second die is rolled after the first, so nothing before the roll gives the nature away; the result does. Inside a triad all three key/wall pairs differ, so knowing someone's way is never enough.

**Reading people.** A hit answers one question for the whole party:
- what they want;
- what they fear;
- what would open them;
- what would close them;
- what they'd want in return;
- whether they end it after a no.

The party keeps every answer. Once it knows the key and the wall, the nature is named and its whole card opens.

## Strings and bonds

- **Strings** are a hold on one person, at most 3 each. A String can be:
  - spent for **+5** after a miss against them;
  - spent to **Hurt** them: make them feel an emotion;
  - used as leverage for an ask against their interests, or for Blackmail;
  - **Pulled** in a fight. Strike gives +5 to your next attack, check or save against them. Guard gives +5 AC against their next attack. Either one is a real effect on your sheet that ends itself.
- **Bonds** are one shared relationship per pair, mirrored on both actors: a type (friend, lover, rival, enemy, sworn, confidant…) and a strength ●–●●●.
  - A bond gives +1 per ● on techniques of the approach it runs: Heart for love and family, Pressure for rivals and enemies, Reason for allies, oaths and trust.
  - Heart wins warm bonds (a stranger becomes a Friend).
  - Pressure wins sour them (a stranger becomes a Rival).
  - Blackmail and exposed lies make Enemies.
  - Slammed doors and broken hearts cool bonds.

## Windows

- **Chronicle**: right-click a token, then the address-book button. It has four tabs:
  - *Profile*: an NPC's nature, dossier and Agenda for the GM, and what the party has learned for players; a player character's Leanings, emotions and scars;
  - *Bonds*;
  - **Talk**: the twelve techniques, your emotions and theirs, the NPC's openings, the roll. On an NPC's own sheet this tab is the GM's cheat sheet: key, wall, price, pushback, the lies they believe, and buttons to ask them as any character on the scene;
  - *Codex*: the in-game manual.
- **Social Scene**: the **Social** button on the VTools toolbar. It is a live relationship map for everyone: portraits, bonds as lines, openings and named natures, and every roll animated as it happens. *This scene* is for the table; *All bonds* is for the GM.

## Settings

A global social-difficulty dial, and whether rolls use the system's own skill dialog.

Upgrading from 2.x: the first world load removes the old v2 states, wounds, scars and auras from sheets; v3's emotions and scars replace them. Bonds, Strings, dossiers and natures are kept.

Requires the **vtools** module.

## License

This work uses material from the **Thirsty Sword Lesbians** roleplaying game (found at https://swordlesbians.com), designed by April Kit Walsh and published by Evil Hat Productions, LLC, pursuant to the open license available at **poweredbylesbians.com**.

The text of this work is offered under a **CC BY-SA 4.0** license.

*Thirsty Sword Lesbians™ is a trademark of April Kit Walsh.*
