/**
 * tsl-social-conflict | condition-effects.js
 *
 * The emotional layer as Active Effects: Wounds (5, tiered ● → ●●●), Boons (4),
 * Scars (5, permanent), plus Willpower.
 *   Long rest — each Wound eases one tier (a Light one heals); one left at ●●●
 *               calcifies into its Scar instead. Boons fade. Willpower refills.
 *               Short rests don't touch feelings.
 *   A5E — a conflict-window ending (Yield / Kiss) adds +1 Strife per Wound the
 *         participant carries out of it.
 */

console.log("TSL | Loading condition-effects.js...");

const TSL_EFFECT_FLAG = "tsl-social-conflict";

// Per-system change builders — keep the automation honest across dnd5e & a5e
// (verified keys; a5e RecordFields need flags.a5e.effects.*, plain numbers use
// system.* keys). ADD = 2, CUSTOM = 0, OVERRIDE = 5.
const _acMalusDnd  = (n) => ({ key: "system.attributes.ac.bonus", mode: 2, value: String(n) });
const _acMalusA5e  = (n) => ({ key: "system.attributes.ac.changes.bonuses.value", mode: 2, value: String(n) });
const _atkMalusDnd = (n) => ([
  { key: "system.bonuses.mwak.attack", mode: 2, value: String(n) },
  { key: "system.bonuses.rwak.attack", mode: 2, value: String(n) },
]);
const _chkMalusDnd = (n) => ({ key: "system.bonuses.abilities.check", mode: 2, value: String(n) });
const _disA5e      = (what) => ({ key: `flags.a5e.effects.rollMode.${what}.all`, mode: 5, value: -1, priority: 50 });
const _grantAtkA5e = ()     => ({ key: "flags.a5e.effects.grants.rollMode.attack.all", mode: 5, value: 1, priority: 50 });
const _noExpertA5e = ()     => ({ key: "flags.a5e.effects.expertiseDice.all", mode: 5, value: 0, priority: 50 });
const _midiDisAtk  = ()     => ({ key: "flags.midi-qol.disadvantage.attack.all", mode: 0, value: "1" });
const _midiDisChk  = ()     => ({ key: "flags.midi-qol.disadvantage.ability.check.all", mode: 0, value: "1" });

// Wounds are the lasting emotional layer, and — VtM-style — they PUSH the one
// who carries them. Redesigned (v1.55) so each is a DISTINCT KIND of thing, not
// the same "disadvantage-unless-String" template, and each ESCALATES through
// three tiers as it is pressed again. Schema:
//   `urge`      — the Compulsion (constant): what it drives you to do (RP prompt).
//   `signature` — the one-line mechanical identity that sets this Wound apart.
//   `tiers[0..2]` — Light → Deep → Breaking point (frenzy). Each: { label, text,
//                 dnd5e[], a5e[] } — the effect at that depth + its automation.
//                 Pressing a Wound already carried DEEPENS it (up a tier), it
//                 doesn't just stack a second one.
//   `leanIn`    — the refuel: give in to the urge at cost → 1 Willpower
//                 (Inspiration for Despair). Playing your nature pays, VtM-style.
//   `clears`    — the DRAMATIC action that lifts it. A long rest only eases it
//                 one tier (●●● calcifies into a Scar); short rests don't touch it.
const CONDITION_META = {
  // ── The five Wounds (Phase 2b remap): angry→Wrath, scared→Fear,
  // hopeless→Despair keep their ids; obsessed(Obsession) & spiteful(Grudge)
  // replace the retired smitten/guilty wounds. Each carries the finalized
  // `ultimate` (1 Willpower) + `scar` (the Scar it calcifies into).
  angry: {
    label:  "Wrath",
    icon:   "icons/svg/fire.svg",
    urge:   "Escalate. Strike. Make {source} feel what you feel — cold words won't do.",
    signature: "The red mist — a rage trade: you hit harder and guard less.",
    ultimate: { name: "Fury", text: "Spend 1 Willpower: an extra melee attack this turn (GM) — and −2 AC until your next turn (automatic).",
      fx: { self: { ac: -2, ends: "turn" } } },
    scar: "cruelty",
    tiers: [
      { label: "Simmering", text: "Disadvantage on any roll to stay measured, de-escalate, or show restraint.", dnd5e: [], a5e: [] },
      { label: "Burning",   text: "You attack the problem: advantage on forceful, aggressive actions against the source (attacks, Intimidation, Power maneuvers), disadvantage on careful or subtle ones — and your guard drops (−1 AC).",
        dnd5e: [ _acMalusDnd(-1) ], a5e: [ _acMalusA5e(-1) ] },
      { label: "Seeing red", text: "The leash slips — you lash out at whoever is nearest, ally or not. Your guard is wide open: −2 AC, and attackers press their advantage. The GM plays the moment.",
        dnd5e: [ _acMalusDnd(-2) ], a5e: [ _acMalusA5e(-2), _grantAtkA5e() ] },
    ],
    leanIn: "Let the anger drive you into something rash or cruel → restore 1 Willpower.",
    clears: "Vent it: break something, start the fight, or finally say the words you've been swallowing.",
  },
  scared: {
    label:  "Fear",
    icon:   "icons/svg/terror.svg",
    urge:   "Get away. Give ground. Avoid {source} at any cost.",
    signature: "Frightened of {source} — you flinch at everything and can't close the distance.",
    ultimate: { name: "Adrenaline", text: "Spend 1 Willpower: +2 AC until your next turn (automatic) — and Dash + Disengage as one action (GM). The body saves itself.",
      fx: { self: { ac: 2, ends: "turn" } } },
    scar: "cold",
    tiers: [
      { label: "Uneasy", text: "Disadvantage on rolls to hold your ground or call {source}'s bluff.", dnd5e: [], a5e: [] },
      { label: "Frightened", text: "While {source} is in sight, disadvantage on your attacks and checks, and you cannot willingly move toward them.",
        dnd5e: [ _midiDisAtk(), _midiDisChk() ], a5e: [ _disA5e("attack"), _disA5e("abilityCheck"), _disA5e("skillCheck") ] },
      { label: "Panicked", text: "You break — flee or freeze, drop what you're holding, take the nearest exit. The GM plays it.",
        dnd5e: [ _midiDisAtk(), _midiDisChk() ], a5e: [ _disA5e("attack"), _disA5e("abilityCheck"), _disA5e("skillCheck") ] },
    ],
    leanIn: "Let fear pull you into flight or a bad concession → restore 1 Willpower.",
    clears: "Flee the source and catch your breath somewhere safe — or face it with an ally at your side.",
  },
  hopeless: {
    label:  "Despair",
    icon:   "icons/svg/degen.svg",
    urge:   "Why bother. Let it go. Nothing you do will matter now.",
    signature: "The weight — your ceiling is gone: no spark, no expertise, nothing extra (but you can still crit).",
    ultimate: { name: "Nothing to Lose", text: "Spend 1 Willpower: advantage on everything this turn (automatic), ignoring danger and provocations; next turn you act at −2, spent (GM).",
      fx: { self: { adv: true, ends: "turnEnd" } } },
    scar: "hollow",
    tiers: [
      { label: "Weary", text: "Disadvantage on any roll driven by hope, ambition, or standing up for yourself.", dnd5e: [], a5e: [] },
      { label: "Sinking", text: "The weight settles: −1 to all your ability and skill checks, you gain no benefit from Inspiration, and you roll no expertise dice — nothing extra comes.",
        dnd5e: [ _chkMalusDnd(-1) ], a5e: [ _noExpertA5e() ] },
      { label: "Given up", text: "You stop — yield, sink, or walk away from what mattered. −2 to checks, you roll no expertise dice. The GM plays it.",
        dnd5e: [ _chkMalusDnd(-2) ], a5e: [ _noExpertA5e(), _disA5e("abilityCheck"), _disA5e("skillCheck") ] },
    ],
    leanIn: "Let despair make you give up or accept the worst, at cost → gain Inspiration (a fumble of the soul that feeds the story).",
    clears: "You cannot clear this alone — someone must rekindle you: comfort, an embrace, a speech that lands.",
  },

  // ── New emotions (Phase 2b) — defined here, wired in a later step. Their
  // numeric bite is largely target-conditional ("vs {source}"), so for now
  // it lives as rules text; the auto-apply-by-target engine formalizes it.
  // `ultimate` (name/text, costs 1 Willpower) and `scar` (the Scar it calcifies
  // into) are the finalized design fields; the surviving wounds gain them in
  // the remap step.
  obsessed: {
    label:  "Obsession",
    icon:   "icons/svg/heal.svg",
    urge:   "Be near {source}, please them, put them above all else.",
    signature: "Fixated on one person — you can't strike them, and they sway you with ease.",
    ultimate: { name: "One-Track", text: "Spend 1 Willpower: advantage on everything you do this turn (automatic) — but only for {source}'s sake; you do nothing else (GM).",
      fx: { self: { adv: true, ends: "turnEnd" } } },
    // A Wound ABOUT someone settles into your relationship with them (v1.81):
    // left at ●●● through a long rest it becomes / deepens a bond toward its source.
    bond: "crush",
    tiers: [
      { label: "Preoccupied", text: "Your mind keeps drifting to {source}: −1 Perception & Insight.", dnd5e: [], a5e: [] },
      { label: "Fixated", text: "−2 Perception & Insight; you cannot use maneuvers against {source}, and they persuade or command you with advantage.", dnd5e: [], a5e: [] },
      { label: "Consumed", text: "−3 Perception & Insight; you abandon duty or safety for {source}. The GM plays the beat.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Drop what matters to be near or win {source} → restore 1 Willpower.",
    clears: "Have them and find it hollow, or a hard reality-check from a friend.",
  },
  spiteful: {
    label:  "Grudge",
    icon:   "icons/svg/blood.svg",
    urge:   "Get even with {source}; undermine and oppose them at every turn.",
    signature: "A cold vendetta against one person — you strike harder at them and struggle to let it go.",
    ultimate: { name: "Reckoning", text: "Spend 1 Willpower: your next maneuver against {source} takes double composure (automatic) and your damage to them is doubled this turn (GM) — but you roll at disadvantage against everyone else (GM).",
      fx: { edge: { vs: "source", double: true } } },
    bond: "enemy",
    tiers: [
      { label: "Nettled", text: "Consumed by the grudge: −1 initiative & Perception; disadvantage to cooperate with or praise {source}.", dnd5e: [], a5e: [] },
      { label: "Vengeful", text: "−2 initiative & Perception; advantage on actions against {source}, disadvantage to work with them or let it go.", dnd5e: [], a5e: [] },
      { label: "Consumed", text: "−3 initiative & Perception; you'll sabotage your own side to land a blow on {source}. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Pursue your grudge at real cost → restore 1 Willpower.",
    clears: "Land a real blow on them, a genuine reconciliation, or consciously forgive.",
  },

  // ── v2.0: four more Wounds. Each is what a REFUSED state turns into when
  // someone holds the line (see SOCIAL_CONDITIONS[*].holdAs), and each has its
  // own shape. Shame calcifies into The Mask; Doubt, Jealousy and Grief simply
  // ease with time (no Scar).
  shamed: {
    label:  "Shame",
    icon:   "icons/svg/invisible.svg",
    urge:   "Hide. Shrink. Get out of {source}'s sight — and never let anyone see you like that again.",
    signature: "Exposed and small — you can't hold anyone's gaze, least of all an audience's.",
    ultimate: { name: "Turn the Tables", text: "Spend 1 Willpower: make someone else the spectacle — your next maneuver against {source} gets advantage, and if it lands they carry Shame too (automatic).",
      fx: { edge: { vs: "source", adv: true, woundOnHit: "shamed" } } },
    scar: "mask",
    tiers: [
      { label: "Flushed",   text: "Disadvantage on Performance and Persuasion in front of anyone who saw it happen.", dnd5e: [], a5e: [] },
      { label: "Mortified", text: "You avoid {source} and the witnesses; disadvantage on every social roll in front of them.", dnd5e: [], a5e: [] },
      { label: "Wanting to vanish", text: "You leave the room, the scene, the party — or lash out to make it stop. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Hide, withdraw, or cover it with a lie at real cost → restore 1 Willpower.",
    clears: "Be seen at your worst and accepted anyway — or win back your standing in front of the same people.",
  },
  doubting: {
    label:  "Doubt",
    icon:   "icons/svg/direction.svg",
    urge:   "Second-guess everything — above all what {source} made you question.",
    signature: "You no longer trust your own read — of them, or of yourself.",
    ultimate: { name: "Leap of Faith", text: "Spend 1 Willpower: act on instinct — advantage on your next roll (automatic), and Doubt's penalties don't touch you until your next turn (GM).",
      fx: { self: { adv: true, ends: "roll" } } },
    tiers: [
      { label: "Unsure",          text: "−1 Insight; you can't take the first word you hear as true.", dnd5e: [], a5e: [] },
      { label: "Second-guessing", text: "Disadvantage on Insight and on Read Them; you must ask someone before you commit to a plan.", dnd5e: [], a5e: [] },
      { label: "Paralysed",       text: "You can't decide — you freeze, defer, or follow whoever speaks loudest. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Defer to someone else's judgement against your own instinct → restore 1 Willpower.",
    clears: "Be proven right — or have someone you trust tell you, and mean it, that you were.",
  },
  jealous: {
    label:  "Jealousy",
    icon:   "icons/svg/poison.svg",
    urge:   "Watch {source}. Keep them close. Make sure no one else matters to them more.",
    signature: "Green-eyed over someone — every warm word they give another lands like a slap.",
    ultimate: { name: "Claim", text: "Spend 1 Willpower: step between {source} and a rival — your next maneuver against the rival you name gets advantage (automatic), and everyone sees why.",
      fx: { edge: { vs: "pick", adv: true } } },
    tiers: [
      { label: "Watchful",    text: "Disadvantage on Insight about {source} — you see betrayal everywhere.", dnd5e: [], a5e: [] },
      { label: "Possessive",  text: "You can't let {source} out of your sight; disadvantage on anything that leaves them alone with someone else.", dnd5e: [], a5e: [] },
      { label: "Green-eyed",  text: "You make a scene — accuse, cling, or sabotage the rival. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Act on the jealousy — interrupt, accuse, cling — at real cost → restore 1 Willpower.",
    clears: "{source} chooses you, plainly and in front of others — or you let them go.",
  },
  grieving: {
    label:  "Grief",
    icon:   "icons/svg/light-off.svg",
    urge:   "Look back. Keep returning to what was lost; nothing in front of you matters as much.",
    signature: "A loss you carry — the world goes quiet and grey around it.",
    ultimate: { name: "For Them", text: "Spend 1 Willpower: do this one for what you lost — advantage on your next roll, and the ally you name gets +1 on theirs (automatic).",
      fx: { self: { adv: true, ends: "roll" }, allies: { pick: 1, bonus: 1, ends: "roll" } } },
    tiers: [
      { label: "Heavy",      text: "−1 initiative and Perception; your mind keeps wandering back.", dnd5e: [], a5e: [] },
      { label: "Hollowed",   text: "Disadvantage on Performance and on anything meant to cheer, inspire or celebrate.", dnd5e: [], a5e: [] },
      { label: "Lost in it", text: "You stop — sit with it, refuse to go on, or give away what reminds you. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Stop to grieve when there's no time for it → restore 1 Willpower.",
    clears: "Mourn it properly — a rite, a memorial, the words said aloud — with someone beside you.",
  },

  // ── The four Boons (positive emotions, Phase 2c). GM-given; `isBoon: true`.
  // They do NOT count toward Overwhelmed, don't compel or calcify. Each scales
  // by tier and its ●●● unlocks an ultimate (1 Willpower).
  valor: {
    label:  "Valor",
    icon:   "icons/svg/upgrade.svg",
    isBoon: true,
    signature: "Courage flares — you stand tall, and fear can't reach you.",
    ultimate: { name: "Heroic Surge", text: "Spend 1 Willpower: advantage on everything this turn (automatic) and an extra action or attack (GM); the allies you name get +1 on their next roll (automatic).",
      fx: { self: { adv: true, ends: "turnEnd" }, allies: { pick: "many", bonus: 1, ends: "roll" } } },
    tiers: [
      { label: "Steady",     text: "Advantage on saving throws vs fear.", dnd5e: [], a5e: [] },
      { label: "Emboldened", text: "Advantage on saves vs fear; you cannot be Frightened.", dnd5e: [], a5e: [] },
      { label: "Fearless",   text: "Immune to fear; allies who can see you share the save advantage vs fear.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades when the danger passes and the blood cools (GM's call).",
  },
  devotion: {
    label:  "Devotion",
    icon:   "icons/svg/heal.svg",
    isBoon: true,
    signature: "Love as strength — you fight harder for {source} than for yourself.",
    ultimate: { name: "Shield Them", text: "Spend 1 Willpower: as a reaction, put yourself between {source} and a threat (GM) — your next roll has advantage (automatic).",
      fx: { self: { adv: true, ends: "roll" } } },
    tiers: [
      { label: "Warmed",     text: "+1 to any action to protect or aid {source}, and to saves while near them.", dnd5e: [], a5e: [] },
      { label: "Devoted",    text: "+2 to protect or aid {source}, and to saves near them.", dnd5e: [], a5e: [] },
      { label: "Unyielding", text: "+3 to protect or aid {source}; you'll take a blow meant for them without hesitation.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades if the bond breaks, or the moment that kindled it passes (GM).",
  },
  // id stays `resolve` (saved effects use it) — the LABEL is Conviction so it
  // never read like the old (pre-2.0) Resolve track.
  resolve: {
    label:  "Conviction",
    icon:   "icons/svg/statue.svg",
    isBoon: true,
    signature: "Centred and unshakeable — nothing moves you off your mark.",
    ultimate: { name: "Unbreakable", text: "Spend 1 Willpower: your next saving throw counts its d20 as a 20 — for fear, charm or compulsion (automatic).",
      fx: { self: { saveMin: 20, ends: "roll" } } },
    tiers: [
      { label: "Composed",  text: "+1 to saving throws; you can't be cowed off your position.", dnd5e: [], a5e: [] },
      { label: "Resolute",  text: "+2 to saving throws; immune to being cowed or intimidated.", dnd5e: [], a5e: [] },
      { label: "Immovable", text: "+3 to saving throws; you shrug off the first attempt each scene to sway, frighten, or charm you.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades once the trial is over and you let your guard down (GM).",
  },
  hope: {
    label:  "Hope",
    icon:   "icons/svg/sun.svg",
    isBoon: true,
    signature: "Uplift — you believe it can still go right, and it's contagious.",
    ultimate: { name: "Rally", text: "Spend 1 Willpower: the allies you name gain advantage on their next roll (automatic).",
      fx: { allies: { pick: "many", adv: true, ends: "roll" } } },
    tiers: [
      { label: "Heartened", text: "+1 to your ability and skill checks.", dnd5e: [], a5e: [] },
      { label: "Hopeful",   text: "+2 to your checks; an ally you encourage shrugs off Despair.", dnd5e: [], a5e: [] },
      { label: "Radiant",   text: "+3 to your checks; your hope spreads — nearby allies get +1 too.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades when the darkness returns and the moment dims (GM).",
  },

  // ── v2.0: four more Boons.
  calm: {
    label:  "Calm",
    icon:   "icons/svg/sound-off.svg",
    isBoon: true,
    signature: "Still water — nothing they say finds a grip.",
    ultimate: { name: "Eye of the Storm", text: "Spend 1 Willpower: shake off one state you carry right now, and you're Steadied — the next one can't touch you (automatic).",
      fx: { self: { clearOne: true, steady: true } } },
    tiers: [
      { label: "Settled",      text: "Advantage on Insight; you can't be Rattled.", dnd5e: [], a5e: [] },
      { label: "Serene",       text: "You can't be Rattled or Provoked.", dnd5e: [], a5e: [] },
      { label: "Unshakeable",  text: "No state can be put on you while it lasts.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades when the storm finally reaches you (GM).",
  },
  trust: {
    label:  "Trust",
    icon:   "icons/svg/bridge.svg",
    isBoon: true,
    signature: "You believe in {source} — and it shows.",
    ultimate: { name: "On Your Word", text: "Spend 1 Willpower: act on {source}'s word without question — advantage on your next roll, and they get +1 on theirs (automatic).",
      fx: { self: { adv: true, ends: "roll" }, source: { bonus: 1, ends: "roll" } } },
    tiers: [
      { label: "Open",     text: "+1 to help {source}; their Reassure on you always lands.", dnd5e: [], a5e: [] },
      { label: "Trusting", text: "+2 to help {source}; nothing they say can be used against you.", dnd5e: [], a5e: [] },
      { label: "Certain",  text: "+3 to help {source}; you'd follow them anywhere, and everyone can see it.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades if {source} breaks the trust (GM).",
  },
  pride: {
    label:  "Pride",
    icon:   "icons/svg/tower-flag.svg",
    isBoon: true,
    signature: "Standing tall — you remember exactly what you are.",
    ultimate: { name: "Own the Room", text: "Spend 1 Willpower: everyone who challenges you rolls their next maneuver against you with disadvantage — once each, for the scene or three rounds (automatic).",
      fx: { guard: true } },
    tiers: [
      { label: "Proud",       text: "Advantage on Performance; you can't be Humbled.", dnd5e: [], a5e: [] },
      { label: "Commanding",  text: "+2 to Intimidation and Persuasion; you can't be Humbled or Cowed.", dnd5e: [], a5e: [] },
      { label: "Untouchable", text: "No one can make you lose face this scene — a Humiliate against you lands but leaves no Shame.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades when you're brought low, or the moment of glory passes (GM).",
  },
  joy: {
    label:  "Joy",
    icon:   "icons/svg/tankard.svg",
    isBoon: true,
    signature: "Light in the chest — it spills over onto everyone near you.",
    ultimate: { name: "Infectious", text: "Spend 1 Willpower: the allies you name each recover 1 composure and shake off one state (automatic).",
      fx: { allies: { pick: "many", composure: 1, clearOne: true } } },
    tiers: [
      { label: "Glad",      text: "+1 to Performance and Persuasion.", dnd5e: [], a5e: [] },
      { label: "Delighted", text: "+2 to Performance and Persuasion; your Reassure restores 1 more composure.", dnd5e: [], a5e: [] },
      { label: "Elated",    text: "+3; allies near you can't be Rattled.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades with the evening, or the first real blow (GM).",
  },
};

// Spells/abilities that clear TSL conditions from their targets
const CLEARING_SPELLS = {
  "calm emotions":       ["obsessed", "angry", "scared", "jealous", "shamed"],
  "greater restoration": ["angry", "scared", "hopeless", "obsessed", "spiteful", "jealous", "doubting", "shamed", "grieving"],
  "remove curse":        ["spiteful", "hopeless"],
  "heroism":             ["scared", "doubting"],
};

// ─── Scars — permanent character states a Wound calcifies into.
// Not tiered, not cleared by rest; only the `clears` arc lifts one. Each keys
// back to the Wound it comes `from` (having the Scar makes you immune to that
// Wound). Some carry an active `ultimate` (1 Willpower).
// v2.0 — the bite is REAL where it can be: `skills` (±N to a skill on the
// sheet, both systems) and `checks` (±N to every ability check) become the
// effect's changes; the module enforces `harder` (+N composure on a landed
// maneuver), `unreadable` (reads against them at disadvantage), `insincere`
// (−N on their honest maneuvers) and `numbStates` (states that won't take).
// Only what depends on the situation stays a line for the GM.
const SCAR_META = {
  cruelty: {
    label: "Cruelty", icon: "icons/svg/blood.svg", from: "angry",
    ability: "+2 Intimidation, and every maneuver of yours that lands takes 1 more composure (automatic).",
    ultimate: { name: "Berserk", text: "Spend 1 Willpower: your next weapon attack crits on anything but a 1 (automatic on dnd5e, GM on A5E), and you resist the damage of one attack against you (GM).",
      fx: { self: { critOn: 2, ends: "roll" } } },
    cost: "−2 Persuasion, Deception & Insight — people sense the cruelty in you (automatic).",
    skills: { itm: 2, per: -2, dec: -2, ins: -2 },
    harder: 1,
    clears: "An arc of mercy: spare or aid those you could have crushed.",
  },
  // RETIRED (v1.81): a Grudge now settles into an Enemy bond, an Obsession into
  // a Crush — these two scars only duplicated those relationships. Kept so an
  // actor that already carries one can still read and remove it.
  vendetta: {
    retired: true,
    label: "Vendetta", icon: "icons/svg/skull.svg", from: "spiteful",
    ability: "+2 and Help as a bonus action against your némesis.",
    ultimate: { name: "Vendetta", text: "Spend 1 Willpower: this turn, advantage on everything against your némesis, disadvantage against everyone else." },
    cost: "−2 on all social rolls against them; spend a String to pass up a chance to oppose them.",
    clears: "The némesis falls, or a genuine reconciliation.",
  },
  bound_heart: {
    retired: true,
    label: "Bound Heart", icon: "icons/svg/heal.svg", from: "obsessed",
    ability: "+2 to protect or aid the one you love, and to saves protecting them; the frenzy has passed — you CAN act against them now.",
    cost: "−2 to act against them in a fight.",
    clears: "Betrayal, death, or an arc of letting go.",
  },
  cold: {
    label: "The Cold", icon: "icons/svg/frozen.svg", from: "scared",
    ability: "+2 to saving throws vs fear and charm — you feel less (GM).",
    cost: "−2 Insight (empathy) & Persuasion (warmth) (automatic); you can't raise a bond above ●● (GM).",
    skills: { ins: -2, per: -2 },
    clears: "Someone breaks through the ice — a bond deepened to ●●●.",
  },
  mask: {
    label: "The Mask", icon: "icons/svg/card-joker.svg", from: "shamed",
    ability: "+2 Deception, and your face gives nothing away — Read Them and Cross-Examine against you roll with disadvantage (automatic).",
    cost: "When you mean it, it doesn't show — −2 on your honest maneuvers, Persuade and Reassure (automatic).",
    skills: { dec: 2 },
    unreadable: true,
    insincere: 2,
    clears: "Take the mask off in front of someone — let them see the shame, and stay.",
  },
  hollow: {
    label: "The Hollow", icon: "icons/svg/degen.svg", from: "hopeless",
    ability: "Nothing reaches you — Cowed and Enthralled don't take on you (automatic); immune to fear and charm effects (GM).",
    cost: "Not even hope: you gain no benefit from Inspiration (GM), and −1 to every ability check (automatic).",
    checks: -1,
    numbStates: ["cowed", "smitten"],
    clears: "Someone restores your sense of meaning (a speech, a bond).",
  },
};
// Scars are about YOU (what a Wound made of you); Wounds about a PERSON become bonds.
const SCAR_ORDER = ["cruelty", "cold", "hollow", "mask"];

class TSLConditionEffects {

  /**
   * FULL emotional layer (default) = Wounds + Willpower, Ultimates, Give in,
   * Boons, Scars and bond abilities/signatures. BASIC (world setting
   * `emotionalLayer`) = the Wounds alone — fewer moving parts for the table.
   */
  static isFullLayer() {
    try { return game.settings.get("tsl-social-conflict", "emotionalLayer") !== "basic"; }
    catch { return true; }
  }

  /** The VtM-style dossier for a wound (urge / resist / leanIn / frenzy / clears). */
  static getMeta(condId) {
    return CONDITION_META[condId] ?? null;
  }

  /**
   * Give in to a Wound's compulsion (act on its urge, at real cost) → refuel
   * 1 Willpower (the VtM loop: living your nature pays). Despair is the one
   * exception: its lean-in feeds Inspiration instead (diffuse, not tied to a
   * person). Only a Wound you actually carry can be given in to.
   * Returns { gained: "willpower" | "inspiration" | "none", willpower? } or null.
   */
  static async giveIn(actor, condId) {
    const meta = CONDITION_META[condId];
    if (!actor || !meta || meta.isBoon || !TSLConditionEffects.hasCondition(actor, condId)) return null;
    if (condId === "hopeless") {
      if (foundry.utils.getProperty(actor, "system.attributes.inspiration") === false) {
        await actor.update({ "system.attributes.inspiration": true });
        return { gained: "inspiration" };
      }
      return { gained: "none" };
    }
    if (typeof TSLWillpower === "undefined") return { gained: "none" };
    const before = TSLWillpower.get(actor);
    const after  = await TSLWillpower.restore(actor, 1);
    return { gained: after > before ? "willpower" : "none", willpower: after };
  }

  // ── Scars — permanent states a Wound calcifies into ──────────────────────────

  static get SCAR_ORDER() { return SCAR_ORDER.slice(); }
  static getScarMeta(scarId) { return SCAR_META[scarId] ?? null; }
  /** The Scar a given Wound calcifies into (or null). */
  static scarForWound(woundId) { return CONDITION_META[woundId]?.scar ?? null; }

  /** Tooltip / effect-description HTML for a Scar. */
  static scarDossier(scarId) {
    const m = SCAR_META[scarId];
    if (!m) return "";
    const lines = [];
    if (m.ability)  lines.push(`<b>Ability:</b> ${m.ability}`);
    if (m.ultimate) lines.push(`<b>●●● ${m.ultimate.name}:</b> ${m.ultimate.text}`);
    if (m.cost)     lines.push(`<b>Cost:</b> ${m.cost}`);
    if (m.clears)   lines.push(`<b>Clears:</b> ${m.clears}`);
    return lines.filter(Boolean).join("<br>");
  }

  /** The numbers a Scar puts on the sheet (both systems): skills ±N, every check ±N. */
  static _scarChanges(scarId) {
    const m = SCAR_META[scarId] ?? {};
    const out = [];
    for (const [key, v] of Object.entries(m.skills ?? {}))
      out.push({ key: `system.skills.${key}.bonuses.check`, mode: 2, value: `${v > 0 ? "+" : ""}${v}`, priority: 20 });
    // Every ability check: dnd5e has a numeric field; a5e takes a bonus record
    // through its own CUSTOM key (the same helper the bond auras use).
    if (m.checks && typeof TSLBondAuras !== "undefined") out.push(...TSLBondAuras._changes({ check: m.checks }, m.label));
    return out;
  }

  static _buildScarEffect(scarId) {
    const m = SCAR_META[scarId];
    return {
      name: m.label,
      img: m.icon, icon: m.icon,
      origin: TSL_EFFECT_FLAG,
      description: TSLConditionEffects.scarDossier(scarId),
      statuses: [`tsl-scar-${scarId}`],
      flags: { [TSL_EFFECT_FLAG]: { scar: scarId } },
      changes: TSLConditionEffects._scarChanges(scarId),
      // NO duration/restType: Scars are permanent (only the `clears` arc lifts one).
    };
  }

  /**
   * Scars applied before v2.0 carried no changes (the bite was text only).
   * Bring every carried Scar up to date — once, on the GM client at ready.
   */
  static async resyncScars(actors = game.actors) {
    const canon = (cs) => JSON.stringify((cs ?? []).map(c => `${c.key}|${c.mode}|${String(c.value)}`));
    let n = 0;
    for (const actor of (actors ?? [])) {
      for (const e of (actor?.effects ?? [])) {
        const id = e.flags?.[TSL_EFFECT_FLAG]?.scar;
        if (!id || !SCAR_META[id] || !e.update) continue;
        const changes = TSLConditionEffects._scarChanges(id);
        const description = TSLConditionEffects.scarDossier(id);
        if (canon(e.changes) === canon(changes) && (e.description ?? "") === description) continue;
        await e.update({ changes, description });
        n++;
      }
    }
    return n;
  }

  /** Is this actor immune to a Wound — does it carry the Scar that Wound sets into? */
  static isImmune(actor, woundId) {
    const scarId = CONDITION_META[woundId]?.scar;
    return !!scarId && TSLConditionEffects.hasScar(actor, scarId);
  }

  static hasScar(actor, scarId) {
    return !!actor?.effects?.some?.(e => !e.disabled &&
      (e.flags?.[TSL_EFFECT_FLAG]?.scar === scarId || [...(e.statuses ?? [])].includes(`tsl-scar-${scarId}`)));
  }

  static getScars(actor) {
    const out = new Set();
    for (const e of (actor?.effects ?? [])) {
      if (e.disabled) continue;
      const s = e.flags?.[TSL_EFFECT_FLAG]?.scar;
      if (s && SCAR_META[s]) out.add(s);
      for (const st of (e.statuses ?? [])) if (typeof st === "string" && st.startsWith("tsl-scar-")) out.add(st.slice("tsl-scar-".length));
    }
    return [...out].filter(id => SCAR_META[id]);
  }

  static async applyScar(actor, scarId) {
    if (!actor || !SCAR_META[scarId] || TSLConditionEffects.hasScar(actor, scarId)) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [TSLConditionEffects._buildScarEffect(scarId)]);
  }

  static async removeScar(actor, scarId) {
    const ids = (actor?.effects ?? [])
      .filter(e => e.flags?.[TSL_EFFECT_FLAG]?.scar === scarId || [...(e.statuses ?? [])].includes(`tsl-scar-${scarId}`))
      .map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  static async toggleScar(actor, scarId) {
    if (!actor || !SCAR_META[scarId]) return;
    if (TSLConditionEffects.hasScar(actor, scarId)) await TSLConditionEffects.removeScar(actor, scarId);
    else await TSLConditionEffects.applyScar(actor, scarId);
  }

  /**
   * A Wound left at ●●● through a long rest CALCIFIES. A Wound about YOU
   * becomes a permanent Scar; a Wound about a PERSON (Obsession, Grudge)
   * settles into your relationship with them instead — a Crush / an Enemy
   * bond toward its source, or a deeper one if you already share a bond.
   * Returns the Scar id, { bond, sourceId }, or null.
   */
  static async calcify(actor, woundId) {
    const meta = CONDITION_META[woundId];
    if (meta?.bond) return TSLConditionEffects._calcifyIntoBond(actor, woundId, meta.bond);
    const scarId = meta?.scar;
    if (!scarId || !SCAR_META[scarId]) return null;
    await TSLConditionEffects.removeOne(actor, woundId);
    await TSLConditionEffects.applyScar(actor, scarId);
    return scarId;
  }

  static async _calcifyIntoBond(actor, woundId, bondType) {
    const srcId = TSLConditionEffects.getWoundSource(actor, woundId);
    const src   = srcId ? game.actors.get(srcId) : null;
    if (!src) {
      // About no one in particular (applied by hand) — with nobody to fix on,
      // the feeling simply recedes a tier instead of setting.
      await TSLConditionEffects.setTier(actor, woundId, 2);
      return null;
    }
    await TSLConditionEffects.removeOne(actor, woundId);
    // A bond is ONE shared relationship mirrored on both actors — the GM client
    // writes it, since a player can't touch the other side's flags.
    if (typeof TSLGMActions !== "undefined")
      await TSLGMActions.request("woundToBond", { bearerId: actor.id, sourceId: src.id, bondType, woundId });
    return { bond: bondType, sourceId: src.id };
  }

  /** Every wound id, in a stable order — for the token HUD registration. */
  static get ORDER() {
    return ["angry", "spiteful", "obsessed", "jealous", "scared", "doubting", "shamed", "grieving", "hopeless"];
  }

  /** Boon ids, in display order (the four positive emotions). */
  static get BOON_ORDER() {
    return ["valor", "devotion", "resolve", "hope", "calm", "trust", "pride", "joy"];
  }

  /**
   * Console diagnostic: `TSLConditionEffects.explainHud()`.
   * Prints whether each Wound (❤) and State (⚔) actually landed in the token
   * HUD palette (`CONFIG.statusEffects`) this session. If a wound is missing,
   * the `ready` hook didn't run or another module rebuilt the palette after us
   * — re-register with `TSLConditionEffects.ensureRegistered()`.
   */
  static explainHud() {
    const rows = [];
    for (const id of TSLConditionEffects.ORDER) {
      const hit = CONFIG.statusEffects?.find(s => s.id === `tsl-wound-${id}`);
      rows.push(`  ❤ ${id.padEnd(9)} ${hit ? "IN palette" : "MISSING"}${hit ? ` (name="${hit.name}")` : ""}`);
    }
    if (typeof SOCIAL_CONDITION_ORDER !== "undefined") {
      for (const id of SOCIAL_CONDITION_ORDER) {
        const alias = SOCIAL_CONDITIONS?.[id]?.nativeAlias;
        const hit = CONFIG.statusEffects?.find(s => s.id === `tsl-${id}`);
        rows.push(`  ⚔ ${id.padEnd(9)} ${alias ? `native alias → "${alias}"` : hit ? "IN palette" : "MISSING"}`);
      }
    }
    console.log(`TSL | HUD status palette (system: ${game.system?.id}):\n${rows.join("\n")}`);
    return rows;
  }

  /**
   * Idempotently (re)push any missing Wound entries into CONFIG.statusEffects.
   * Safe to call any time — skips ids already present. Returns how many it added.
   */
  static ensureRegistered() {
    const se = CONFIG.statusEffects;
    if (!se || typeof se.some !== "function") return 0;
    let added = 0;
    for (const id of TSLConditionEffects.ORDER) {
      const sid = `tsl-wound-${id}`;
      if (!se.some(s => s.id === sid)) {
        const w = TSLConditionEffects.buildHudStatus(id);
        if (w) { se.push(w); added++; }
      }
      // Belt-and-suspenders: core's ActiveEffect.fromStatusEffect looks the
      // status up by KEY (`CONFIG.statusEffects[<id>]`), not by array search.
      // The status-effects Proxy registers that key on push — but if another
      // module rebuilt the array as a plain one, the key goes missing and a
      // HUD click throws "Invalid status ID" (icon shows, nothing happens).
      // Re-assert the key so toggling always resolves.
      const entry = se.find(s => s.id === sid);
      if (entry && se[sid] !== entry) se[sid] = entry;
    }
    return added;
  }

  /**
   * A CONFIG.statusEffects entry for a wound, so it shows in the token HUD's
   * status palette (findable, with the full dossier) and can be toggled by
   * hand. The `condition` flag makes a HUD-toggled wound count exactly like one
   * the module applies (hasCondition / countConditions / openings all match).
   */
  static buildHudStatus(condId) {
    const meta = CONDITION_META[condId];
    if (!meta) return null;
    // A HUD toggle applies the wound at tier 1 (Light) — deepening happens in
    // play or via the Chronicle. Tier 1 carries no automation, so the palette
    // entry stays mechanic-light like the fencing-State shape it mirrors.
    const built = TSLConditionEffects._buildEffect(condId, "someone", null, 1);
    return {
      id:          `tsl-wound-${condId}`,
      name:        `❤ ${meta.label}`,   // ❤ groups Wounds together in the sorted palette
      img:         meta.icon,
      description: built.description,
      changes:     built.changes,       // tier 1 = [] for every wound
      duration:    { seconds: 3600 },   // scene-length, like the States (a "temporary" effect)
      origin:      "tsl-social-conflict",
      statuses:    [],                  // the entry id is the single status
      flags:       built.flags,         // carries tsl-social-conflict.condition = condId
    };
  }

  /**
   * Called when a conflict resolves.
   * For each participant, applies their active conditions as Active Effects
   * with the opponent's name as context.
   */
  static async applyFromConflict(state) {
    const ps = state.participants;
    for (let i = 0; i < ps.length; i++) {
      const sourceName = ps.length === 2 ? ps[1 - i].name : "Social Conflict";
      const sourceId   = ps.length === 2 ? ps[1 - i].actorId : null;
      await TSLConditionEffects._applyToParticipant(ps[i], sourceName, sourceId);
    }
  }

  /** Apply conditions for a single participant who yielded mid-conflict. */
  static async applyYieldingParticipant(participant, state) {
    const others = state.participants.filter(p => p.actorId !== participant.actorId);
    const sourceName = others.length === 1 ? others[0].name : "Social Conflict";
    const sourceId   = others.length === 1 ? others[0].actorId : null;
    await TSLConditionEffects._applyToParticipant(participant, sourceName, sourceId);
  }

  static async _applyToParticipant(participant, sourceName, sourceId = null) {
    const actor = game.actors.get(participant.actorId);
    if (!actor) return;

    // The conflict card edits Wounds on the ACTOR directly now; older states
    // could still mark some on the participant — put any the actor lacks on
    // it (never a duplicate), so nothing marked is lost.
    const marked = Object.entries(participant.conditions ?? {})
      .filter(([id, on]) => on && CONDITION_META[id] && !CONDITION_META[id].isBoon)
      .map(([id]) => id);
    for (const condId of marked) {
      if (!TSLConditionEffects.hasCondition(actor, condId))
        await TSLConditionEffects.applyOne(actor, condId, sourceName, sourceId);
    }

    // The Wounds they actually carry out of the conflict — the actor is the truth.
    const carried = TSLConditionEffects.countConditions(actor);
    if (!carried) return;

    // A5E (system id "a5e"): +1 Strife for each Wound carried out of the
    // conflict. Strife is a plain number at system.attributes.strife.
    if (game.system.id === "a5e") {
      const cur = Number(foundry.utils.getProperty(actor, "system.attributes.strife")) || 0;
      await actor.update({ "system.attributes.strife": cur + carried });
    }

    ui.notifications.info(`${participant.name} carries ${carried} Wound(s) out of the conflict.`);
  }

  /**
   * Apply ONE TSL condition to an actor outside a conflict window — used by
   * "Hold the Line" (refusing a maneuver's effect at an emotional cost).
   * Skips silently if the same condition is already carried.
   * Returns how many TSL conditions the actor now carries (4+ = Overwhelmed).
   */
  /**
   * Apply (or deepen) one Wound. `sourceActorId` — the person it's ABOUT (who
   * caused it), remembered on the effect so a Wound about someone can later
   * settle into a relationship with them. Returns the actor's wound LOAD
   * (sum of tiers; 4+ = Overwhelmed).
   */
  static async applyOne(actor, condId, sourceName = "Social Fencing", sourceActorId = null) {
    if (!actor || !CONDITION_META[condId]) return 0;
    // A calcified Scar makes you immune to the Wound it came from — the trauma
    // has already set; you can't take that Wound fresh again.
    const scarId = CONDITION_META[condId]?.scar;
    if (scarId && TSLConditionEffects.hasScar(actor, scarId)) return TSLConditionEffects.woundLoad(actor);
    const src = sourceActorId && sourceActorId !== actor.id ? sourceActorId : null;
    const existing = actor.effects.find(e => TSLConditionEffects._condOf(e) === condId);
    if (existing) {
      // Pressed again → the wound DEEPENS (up to the breaking point) rather than
      // stacking a duplicate; refresh the source it ties you to.
      const cur = TSLConditionEffects._clampTier(existing.flags?.[TSL_EFFECT_FLAG]?.tier ?? 1);
      if (cur < 3) await TSLConditionEffects.setTier(actor, condId, cur + 1, sourceName, src);
      else if (src && existing.update) await existing.update({ [`flags.${TSL_EFFECT_FLAG}.sourceActorId`]: src });
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        TSLConditionEffects._buildEffect(condId, sourceName, src, 1),
      ]);
    }
    return TSLConditionEffects.woundLoad(actor);
  }

  /**
   * Remove ONE wound from an actor. Matches our flag OR a HUD-toggled status id
   * (via _condOf), so a wound applied any way is removable here.
   */
  static async removeOne(actor, condId) {
    if (!actor) return;
    const toDelete = actor.effects
      .filter(e => TSLConditionEffects._condOf(e) === condId)
      .map(e => e.id);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }

  /**
   * Toggle a wound on/off directly on the actor — used by the Chronicle's
   * ❤ Wounds menu (a player on their own character, the GM on anyone). Whoever
   * calls it owns the actor, so no socket relay is needed.
   */
  static async toggleOne(actor, condId, sourceName = "Social Fencing") {
    if (!actor || !CONDITION_META[condId]) return;
    if (TSLConditionEffects.hasCondition(actor, condId)) {
      await TSLConditionEffects.removeOne(actor, condId);
    } else {
      await TSLConditionEffects.applyOne(actor, condId, sourceName);
    }
  }

  /** The wound id an effect represents — via our flag OR the HUD status id. */
  static _condOf(e) {
    const flagged = e.flags?.[TSL_EFFECT_FLAG]?.condition;
    if (flagged) return flagged;
    // A HUD-toggled wound carries the status id tsl-wound-<id> (statuses is a Set).
    for (const s of (e.statuses ?? [])) {
      if (typeof s === "string" && s.startsWith("tsl-wound-")) return s.slice("tsl-wound-".length);
    }
    return null;
  }

  /** Does this actor carry a given TSL condition (actor-level effect)? */
  static hasCondition(actor, condId) {
    return !!actor?.effects?.some?.(e => !e.disabled && TSLConditionEffects._condOf(e) === condId);
  }

  /** Is this emotion a positive Boon (vs a Wound)? */
  static isBoon(condId) { return !!CONDITION_META[condId]?.isBoon; }

  /**
   * The total WEIGHT of the Wounds this actor carries: the sum of their tiers
   * (● = 1, ●● = 2, ●●● = 3). Boons don't count.
   */
  static woundLoad(actor) {
    return TSLConditionEffects.ORDER.reduce((s, id) => s + TSLConditionEffects.getTier(actor, id), 0);
  }

  /**
   * Overwhelmed (v1.81): Wounds weighing 4 or more (two Deep ones, or a
   * Breaking point and one more). Mechanical now: an Overwhelmed character
   * can't hold the line against a state any more — every state lands.
   */
  static isOverwhelmed(actor) {
    return TSLConditionEffects.woundLoad(actor) >= 4;
  }

  /** How many distinct WOUNDS this actor carries. Boons don't count. */
  static countConditions(actor) {
    if (!actor) return 0;
    const seen = new Set();
    for (const e of actor.effects) {
      if (e.disabled) continue;
      const c = TSLConditionEffects._condOf(e);
      if (c && CONDITION_META[c] && !CONDITION_META[c].isBoon) seen.add(c);
    }
    return seen.size;
  }

  // ── Tiers (Light ● / Deep ●● / Breaking point ●●●) ──────────────────────────

  static _clampTier(t) { return Math.max(1, Math.min(3, (t | 0) || 1)); }

  /** Per-system Active-Effect changes for a tier's data. */
  static _changesFor(tierData) {
    const sys  = game.system?.id;
    const list = sys === "dnd5e" ? (tierData.dnd5e ?? [])
               : sys === "a5e"   ? (tierData.a5e ?? [])
               : [];
    return foundry.utils.deepClone(list);
  }

  /**
   * The full dossier for a wound at a given tier — ONE source of truth for
   * every tooltip and the effect description, marking the CURRENT tier (▶).
   */
  static dossier(condId, tier = 1, sourceName = "them") {
    const meta = CONDITION_META[condId];
    if (!meta) return "";
    const sub = (s) => (s ?? "").replace(/\{source\}/g, sourceName);
    const t = TSLConditionEffects._clampTier(tier);
    const boon = !!meta.isBoon;
    const lines = [];
    if (!boon && meta.urge) lines.push(`<b>Urge:</b> ${sub(meta.urge)}`);
    if (meta.signature)     lines.push(`<i>${sub(meta.signature)}</i>`);
    (meta.tiers ?? []).forEach((td, i) => {
      const n = i + 1;
      const dots = "●".repeat(n) + "○".repeat(3 - n);
      lines.push(`${n === t ? "▶ " : ""}<b>${dots} ${td.label}:</b> ${sub(td.text)}`);
    });
    // Ultimates and Give in belong to the FULL layer (they run on Willpower)
    const full = TSLConditionEffects.isFullLayer();
    if (full && meta.ultimate)        lines.push(`<b>●●● ${sub(meta.ultimate.name)}:</b> ${sub(meta.ultimate.text)}`);
    if (full && !boon && meta.leanIn) lines.push(`<b>Give in:</b> ${sub(meta.leanIn)}`);
    if (meta.clears)        lines.push(`<b>${boon ? "Fades" : "Clears"}:</b> ${sub(meta.clears)}${boon ? " (A long rest ends it too.)" : " (A long rest only eases it one tier — left at ●●●, it calcifies into a Scar.)"}`);
    return lines.filter(Boolean).join("<br>");
  }

  /** The tier (1..3) of a wound this actor carries, or 0 if not carried. */
  static getTier(actor, condId) {
    const e = actor?.effects?.find(x => !x.disabled && TSLConditionEffects._condOf(x) === condId);
    return e ? TSLConditionEffects._clampTier(e.flags?.[TSL_EFFECT_FLAG]?.tier ?? 1) : 0;
  }

  /**
   * Set a wound to an exact tier — creating it if absent, updating name /
   * dossier / automation / tier flag if present.
   */
  static async setTier(actor, condId, tier, sourceName, sourceActorId = null) {
    if (!actor || !CONDITION_META[condId]) return;
    const t = TSLConditionEffects._clampTier(tier);
    const existing = actor.effects.find(x => TSLConditionEffects._condOf(x) === condId);
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        TSLConditionEffects._buildEffect(condId, sourceName ?? "Social Fencing", sourceActorId, t),
      ]);
      return;
    }
    const f    = existing.flags?.[TSL_EFFECT_FLAG] ?? {};
    // Older versions stored the BEARER's id here — never treat that as the source.
    const prevSrc = f.sourceActorId && f.sourceActorId !== actor.id ? f.sourceActorId : null;
    const src  = sourceActorId ?? prevSrc;
    const data = TSLConditionEffects._buildEffect(condId, sourceName ?? f.source ?? "them", src, t);
    await existing.update({
      name: data.name, description: data.description, changes: data.changes,
      [`flags.${TSL_EFFECT_FLAG}.tier`]: t,
      [`flags.${TSL_EFFECT_FLAG}.sourceActorId`]: src,
    });
  }

  /** The actor a Wound is ABOUT (who caused it), if known. */
  static getWoundSource(actor, condId) {
    const e = actor?.effects?.find?.(x => !x.disabled && TSLConditionEffects._condOf(x) === condId);
    const src = e?.flags?.[TSL_EFFECT_FLAG]?.sourceActorId ?? null;
    return src && src !== actor.id ? src : null;
  }

  /** Press a wound deeper (create at Light if absent, up to Breaking point). */
  static async deepen(actor, condId, sourceName) {
    const cur = TSLConditionEffects.getTier(actor, condId);
    if (!cur)      return TSLConditionEffects.applyOne(actor, condId, sourceName);
    if (cur >= 3)  return;
    await TSLConditionEffects.setTier(actor, condId, cur + 1, sourceName);
  }

  /** Ease a wound one tier — below Light it heals (removed entirely). */
  static async ease(actor, condId) {
    const cur = TSLConditionEffects.getTier(actor, condId);
    if (!cur)     return;
    if (cur <= 1) return TSLConditionEffects.removeOne(actor, condId);
    await TSLConditionEffects.setTier(actor, condId, cur - 1);
  }

  static _buildEffect(condId, sourceName, sourceActorId = null, tier = 1) {
    const meta = CONDITION_META[condId];
    const t    = TSLConditionEffects._clampTier(tier);
    const td   = meta.tiers[t - 1];

    return {
      name:   `${meta.label} · ${td.label} (${sourceName})`,
      icon:   meta.icon,
      img:    meta.icon,
      origin: "tsl-social-conflict",
      description: TSLConditionEffects.dossier(condId, t, sourceName),
      duration: { seconds: 3600 },
      // SINGLE status (a5e needs exactly one to treat it as active/removable);
      // the entry id doubles as the status, matching a HUD-toggled wound.
      statuses: [`tsl-wound-${condId}`],
      flags: {
        [TSL_EFFECT_FLAG]: {
          condition:     condId,
          source:        sourceName,
          sourceActorId: sourceActorId ?? null,   // who it is ABOUT (null if unknown)
          tier:          t,
        }
      },
      // Automation scales with the tier (empty at Light) — per system.
      changes: TSLConditionEffects._changesFor(td),
    };
  }

  // ── Rest hooks ────────────────────────────────────────────────────────────────

  /**
   * What a LONG rest does to the emotional layer — one pass, in order, every
   * step awaited (the old version fired a "delete every wound" sweep without
   * waiting and then tried to ease the same effects mid-deletion, so lesser
   * wounds simply vanished instead of easing):
   *   Wounds — ●●● calcifies into its Scar; ●● eases to ●; ● heals.
   *   Boons  — fade (the moment that kindled them has passed).
   *   Willpower refills; each ●●● bond's once-per-rest signature refreshes.
   * Short rests don't touch feelings at all.
   */
  static async onLongRest(actor) {
    if (!actor) return;
    for (const id of TSLConditionEffects.ORDER) {
      const t = TSLConditionEffects.getTier(actor, id);
      // ●●● calcifies — into a Scar (a Wound about you) or a bond (a Wound about
      // someone). In the BASIC layer there are no Scars: a Wound about you just eases.
      const scars = TSLConditionEffects.isFullLayer();
      if (t >= 3 && ((scars && TSLConditionEffects.scarForWound(id)) || CONDITION_META[id]?.bond)) await TSLConditionEffects.calcify(actor, id);
      else if (t >= 1) await TSLConditionEffects.ease(actor, id);
    }
    await TSLConditionEffects._clearBoons(actor);
    // A night's sleep ends every social state — the fleeting layer never
    // outlives the day, even if game time never advanced.
    if (typeof SocialArchetypeManager !== "undefined") await SocialArchetypeManager.clearStates?.(actor);
    if (typeof TSLBondStore !== "undefined") await TSLBondStore.clearSignatures?.(actor.id);
    if (typeof TSLWillpower !== "undefined") await TSLWillpower.refresh(actor);
  }

  static registerRestHooks() {
    // dnd5e
    Hooks.on("dnd5e.restCompleted", (actor, result) => {
      if (result?.longRest) TSLConditionEffects.onLongRest(actor);
    });
    // A5E
    Hooks.on("a5e.actorRest", (actor, result) => {
      if (result?.restType === "long") TSLConditionEffects.onLongRest(actor);
      // A5E handles strife reduction itself on rest — no extra work needed
    });
  }

  /** Remove every Boon from this actor (a long rest ends them). */
  static async _clearBoons(actor) {
    const toDelete = (actor?.effects ?? [])
      .filter(e => CONDITION_META[TSLConditionEffects._condOf(e)]?.isBoon)
      .map(e => e.id);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }

  // ── Spell/ability clearing ────────────────────────────────────────────────────

  static registerSpellHooks() {
    // dnd5e
    Hooks.on("dnd5e.useItem", (item, config, options) => {
      const spellName = item.name?.toLowerCase();
      const condsToClear = CLEARING_SPELLS[spellName];
      if (!condsToClear) return;

      // Clear from all targeted tokens
      for (const target of game.user.targets) {
        const actor = target.actor;
        if (!actor) continue;
        TSLConditionEffects._clearConditions(actor, condsToClear);
      }
    });

    // A5E
    Hooks.on("a5e.itemActivated", (item, activationData) => {
      const spellName = item.name?.toLowerCase();
      const condsToClear = CLEARING_SPELLS[spellName];
      if (!condsToClear) return;

      for (const target of game.user.targets) {
        const actor = target.actor;
        if (!actor) continue;
        TSLConditionEffects._clearConditions(actor, condsToClear);
      }
    });
  }

  static async _clearConditions(actor, conditionIds) {
    // Match our flag OR a HUD-toggled wound's status id (via _condOf)
    const toDelete = actor.effects
      .filter(e => conditionIds.includes(TSLConditionEffects._condOf(e)))
      .map(e => e.id);

    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    }
  }
}

// ─── Willpower — the emotional-layer resource (Phase 2 of the rebuild) ───────
// A pool = the actor's PROFICIENCY bonus, refilled on a LONG REST. Spent to
// activate an Ultimate (Wound/Boon/Scar) or to override a Wound's hard block;
// restored by GIVING IN to a Wound's compulsion. Stored on the actor flag
// tsl-social-conflict.willpower (the CURRENT value; absent = full).
const WP_SCOPE = "tsl-social-conflict";

class TSLWillpower {
  /** Max Willpower = proficiency bonus (falls back to a level/CR estimate). */
  static getMax(actor) {
    const p = actor?.system?.attributes?.prof;
    if (typeof p === "number" && p > 0) return p;
    const d = actor?.system?.details ?? {};
    const lvl = Number(d.level ?? d.cr ?? 1) || 1;
    return Math.max(2, 2 + Math.floor((lvl - 1) / 4));
  }

  /** Current Willpower (defaults to full when the flag is unset). */
  static get(actor) {
    const max = TSLWillpower.getMax(actor);
    const v = actor?.getFlag?.(WP_SCOPE, "willpower");
    return typeof v === "number" ? Math.max(0, Math.min(v, max)) : max;
  }

  static async set(actor, n) {
    const val = Math.max(0, Math.min(TSLWillpower.getMax(actor), n | 0));
    return actor?.setFlag?.(WP_SCOPE, "willpower", val);
  }

  /** Spend n — returns false (and changes nothing) if you can't afford it. */
  static async spend(actor, n = 1) {
    if (TSLWillpower.get(actor) < n) return false;
    await TSLWillpower.set(actor, TSLWillpower.get(actor) - n);
    return true;
  }

  /** Regain n (e.g. giving in to a Wound's compulsion), capped at max. */
  static async restore(actor, n = 1) {
    await TSLWillpower.set(actor, TSLWillpower.get(actor) + n);
    return TSLWillpower.get(actor);
  }

  /** Long rest → back to full. */
  static async refresh(actor) {
    return TSLWillpower.set(actor, TSLWillpower.getMax(actor));
  }
}

// ─── Moments — what Ultimates and bond Signatures actually DO (v2.0) ─────────
// The short, sharp effects of a ⚡ Ultimate (Wound / Boon / Scar) or a ★ bond
// Signature: real numbers on the sheet that END THEMSELVES, like a pulled
// String. A moment's flag `moment` says when it ends:
//   "roll"    — after the bearer's next roll (any chat message with dice)
//   "turn"    — when the bearer's next turn starts
//   "turnEnd" — when the current turn passes
//   (out of combat, "turn"/"turnEnd" simply end after the bearer's next roll)
// "Fencing" moments change a maneuver instead of the sheet: an EDGE on your
// next maneuver against someone (advantage / a blow twice as hard / a Wound if
// it lands) — spent by that maneuver — or a GUARD (others' next maneuver
// against you at disadvantage, once each). assess()/applyOutcome() read them.
// Everything is applied on the GM client (TSLGMActions "fireUltimate" /
// "invokeSignature"), since it can touch other people's sheets.
const MOMENT_SCOPE = "tsl-social-conflict";

class TSLMoments {
  /** Sheet changes for a moment's gifts, per system (verified keys). */
  static changes(g = {}, label = "Moment") {
    const sys = game.system.id;
    const out = [];
    if (g.adv) {
      if (sys === "a5e") {
        for (const k of ["attack", "abilityCheck", "abilitySave", "skillCheck"])
          out.push({ key: `flags.a5e.effects.rollMode.${k}.all`, mode: 5, value: 1, priority: 60 });
      } else if (sys === "dnd5e") {
        // dnd5e 6: global advantage modes (skills read the check mode too)
        for (const k of ["attack", "ability.check", "ability.save"])
          out.push({ key: `system.rolls.${k}.mode`, mode: 2, value: 1, priority: 20 });
      }
    }
    if (g.ac) {
      if (sys === "a5e")   out.push(_acMalusA5e(g.ac));
      if (sys === "dnd5e") out.push(_acMalusDnd(g.ac));
    }
    if (g.bonus && typeof TSLBondAuras !== "undefined")
      out.push(...TSLBondAuras._changes({ attack: g.bonus, check: g.bonus, save: g.bonus }, label));
    if (g.saveMin) {
      if (sys === "a5e") for (const a of ["str", "dex", "con", "int", "wis", "cha"])
        out.push({ key: `system.abilities.${a}.save.minRoll`, mode: 4, value: g.saveMin, priority: 20 });
      if (sys === "dnd5e") out.push({ key: "system.rolls.ability.save.min", mode: 4, value: g.saveMin, priority: 20 });
    }
    if (g.critOn && sys === "dnd5e")
      out.push({ key: "flags.dnd5e.weaponCriticalThreshold", mode: 3, value: String(g.critOn), priority: 20 });
    return out;
  }

  /** "advantage on the next roll · +2 AC" — what a moment gives, in words. */
  static describe(g = {}) {
    const until = { roll: "on the next roll", turn: "until the next turn", turnEnd: "this turn" }[g.ends] ?? "";
    return [
      g.adv ? `advantage ${until}` : null,
      g.ac ? `${g.ac > 0 ? "+" : "−"}${Math.abs(g.ac)} AC ${until}` : null,
      g.bonus ? `+${g.bonus} ${until}` : null,
      g.saveMin ? `the next saving throw counts its d20 as a ${g.saveMin}` : null,
      g.critOn ? (game.system.id === "dnd5e" ? `the next weapon attack crits on ${g.critOn}–20` : null) : null,
    ].filter(Boolean).join(" · ");
  }

  /** Put a moment on an actor. `fencing` = an edge/guard read by the maneuver engine. */
  static async apply(actor, { name, icon = "icons/svg/aura.svg", gifts = {}, fencing = null, description = "" } = {}) {
    if (!actor) return null;
    const combat = game.combat ?? null;
    const inFight = !!actor.inCombat;
    const changes = fencing ? [] : TSLMoments.changes(gifts, name);
    const ends = fencing ? "maneuver" : (gifts.ends ?? "roll");
    const data = {
      name, img: icon, origin: `module.${MOMENT_SCOPE}`, disabled: false,
      changes,
      // A status id shows the icon on the token; unregistered in the HUD
      // palette, so nobody toggles it by hand.
      statuses: ["tsl-moment"],
      description: description || TSLMoments.describe(gifts),
      flags: { [MOMENT_SCOPE]: { moment: {
        ends, round: combat?.round ?? null, turn: combat?.turn ?? null, inFight, gifts, fencing,
      } } },
    };
    // A fencing edge or guard runs out on its own: the scene, or three rounds.
    if (fencing) data.duration = inFight ? { rounds: 3 } : { seconds: 3600 };
    const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    return made ?? data;
  }

  /** The fencing moments on an actor: [{ effect, fencing }]. */
  static fencing(actor) {
    return (actor?.effects ?? []).filter(e => !e.disabled && e.active !== false && e.flags?.[MOMENT_SCOPE]?.moment?.fencing)
      .map(e => ({ effect: e, fencing: e.flags[MOMENT_SCOPE].moment.fencing }));
  }

  /** The edge this actor holds for a maneuver against `targetId`, if any. */
  static edgeVs(actor, targetId) {
    return TSLMoments.fencing(actor).find(x => x.fencing.edge && (!x.fencing.vs || x.fencing.vs === targetId)) ?? null;
  }

  /** A guard on `actor` that `attackerId` hasn't run into yet. */
  static guardFor(actor, attackerId) {
    return TSLMoments.fencing(actor).find(x => x.fencing.guard && !(x.fencing.used ?? []).includes(attackerId)) ?? null;
  }

  /** Does this actor carry a sheet moment granting advantage on its next roll? */
  static hasAdv(actor) {
    return (actor?.effects ?? []).some(e => !e.disabled && e.active !== false && e.flags?.[MOMENT_SCOPE]?.moment?.gifts?.adv);
  }

  /** Every actor that might carry a moment: the world's and the scene's tokens. */
  static _actors() {
    const seen = new Map();
    for (const a of (game.actors ?? [])) if (a?.id) seen.set(a.uuid ?? a.id, a);
    for (const t of (globalThis.canvas?.tokens?.placeables ?? [])) if (t.actor) seen.set(t.actor.uuid ?? t.actor.id, t.actor);
    return [...seen.values()];
  }

  static async _end(actor, pred) {
    const ids = (actor?.effects ?? []).filter(e => { const m = e.flags?.[MOMENT_SCOPE]?.moment; return m && pred(m); }).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /** End moments when they've done their job (active GM only). */
  static registerHooks() {
    const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.isSelf);
    Hooks.on("createChatMessage", async (msg) => {
      if (!isActiveGM() || !msg?.rolls?.length) return;
      const actors = new Set();
      try { const sa = ChatMessage.getSpeakerActor?.(msg.speaker); if (sa) actors.add(sa); } catch { /* no speaker */ }
      const wa = game.actors.get(msg.speaker?.actor); if (wa) actors.add(wa);
      for (const a of actors) {
        await TSLMoments._end(a, m => m.ends === "roll" || ((m.ends === "turn" || m.ends === "turnEnd") && !a.inCombat));
      }
    });
    Hooks.on("updateCombat", async (combat, chg) => {
      if (!isActiveGM() || !("turn" in chg || "round" in chg)) return;
      await TSLMoments._end(combat.combatant?.actor, m => m.ends === "turn");
      for (const a of TSLMoments._actors())
        await TSLMoments._end(a, m => m.ends === "turnEnd" && (m.round !== combat.round || m.turn !== combat.turn));
    });
  }

  // ── Firing them (GM client) ──────────────────────────────────────────────

  /** A state to shake off: the chosen one, or the first bad state carried. */
  static _shakeOff(actor, prefer = null) {
    const bad = SocialArchetypeManager.getActiveConditions(actor).filter(c => !c.meta.positive);
    return (prefer && bad.find(c => c.id === prefer)) ?? bad[0] ?? null;
  }

  /**
   * Apply a whole fx block: { self, partner/source/allies, edge, guard }.
   * `who` resolves the people: { self, partner, source, allies[], pick }.
   * Returns lines for the chat card.
   */
  static async _applyFx(fx, who, name, icon) {
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    const give = async (actor, g, label = null) => {
      if (!actor || !g) return;
      if (g.adv || g.ac || g.bonus || g.saveMin || g.critOn) {
        await TSLMoments.apply(actor, { name: `${name}${label ? ` (${label})` : ""}`, icon, gifts: g });
        const d = TSLMoments.describe(g);
        if (d) lines.push(`<b>${esc(actor.name)}</b>: ${esc(d)}`);
      }
      if (g.composure) {
        const enc = SocialEncounterManager.getEncounter(actor);
        if (enc.active) { await SocialEncounterManager.adjustComposure(actor, g.composure); lines.push(`<b>${esc(actor.name)}</b> recovers ${g.composure} composure`); }
      }
      if (g.clearOne) {
        const st = TSLMoments._shakeOff(actor, g === fx.self ? who.clearId : null);
        if (st) { await SocialArchetypeManager.removeCondition(actor, st.id); lines.push(`<b>${esc(actor.name)}</b> shakes off <b>${esc(st.meta.label)}</b>`); }
      }
      if (g.steady) {
        await SocialArchetypeManager.applyCondition(actor, "steadied", who.self);
        lines.push(`<b>${esc(actor.name)}</b> is <b>Steadied</b> — the next state doesn't take`);
      }
    };
    await give(who.self, fx.self);
    if (fx.partner) await give(who.partner, fx.partner);
    if (fx.source)  await give(who.source, fx.source);
    if (fx.allies)  for (const a of (who.allies ?? [])) await give(a, fx.allies);
    if (fx.edge) {
      const vs = fx.edge.vs === "pick" ? who.pick : fx.edge.vs === "partner" ? who.partner : fx.edge.vs === "source" ? who.source : null;
      if (vs) {
        await TSLMoments.apply(who.self, { name, icon, fencing: { edge: true, vs: vs.id, adv: !!fx.edge.adv, double: !!fx.edge.double, woundOnHit: fx.edge.woundOnHit ?? null },
          description: `Your next maneuver against ${vs.name}: ${[fx.edge.adv ? "advantage" : null, fx.edge.double ? "takes double composure" : null, fx.edge.woundOnHit ? `if it lands, they carry ${TSLConditionEffects.getMeta(fx.edge.woundOnHit)?.label ?? fx.edge.woundOnHit}` : null].filter(Boolean).join(", ")}.` });
        lines.push(`<b>${esc(who.self.name)}</b>'s next maneuver against <b>${esc(vs.name)}</b>: ${[fx.edge.adv ? "advantage" : null, fx.edge.double ? "twice as hard" : null, fx.edge.woundOnHit ? `a ${esc(TSLConditionEffects.getMeta(fx.edge.woundOnHit)?.label ?? "")} wound if it lands` : null].filter(Boolean).join(" · ")}`);
      } else {
        lines.push(`<i>No one named — the GM applies the edge by hand.</i>`);
      }
    }
    if (fx.guard) {
      await TSLMoments.apply(who.self, { name, icon, fencing: { guard: true, used: [] },
        description: "Whoever challenges you rolls their next maneuver against you with disadvantage — once each." });
      lines.push(`Whoever challenges <b>${esc(who.self.name)}</b> rolls their next maneuver at disadvantage — once each`);
    }
    return lines;
  }

  static _resolve(ids = []) { return ids.map(id => game.actors.get(id)).filter(Boolean); }

  /**
   * ⚡ Fire an Ultimate (a ●●● Wound / Boon, or a Scar): spend 1 Willpower,
   * put its effects on the sheets, and tell the table. GM client.
   * args: { actorId, kind: "wound"|"boon"|"scar", id, allyIds, pickId, sourceId, clearId }
   */
  static async fireUltimate({ actorId, kind, id, allyIds = [], pickId = null, sourceId = null, clearId = null } = {}) {
    const actor = game.actors.get(actorId);
    const meta  = kind === "scar" ? TSLConditionEffects.getScarMeta(id) : TSLConditionEffects.getMeta(id);
    const ult   = meta?.ultimate;
    if (!actor || !ult) return false;
    const ready = kind === "scar" ? TSLConditionEffects.hasScar(actor, id) : TSLConditionEffects.getTier(actor, id) >= 3;
    if (!ready) { ui.notifications?.warn?.(`${actor.name}: ${meta.label} isn't at its breaking point (●●●).`); return false; }
    if (!(await TSLWillpower.spend(actor, 1))) { ui.notifications?.warn?.(`${actor.name}: no Willpower left.`); return false; }
    const srcId  = sourceId ?? (kind === "scar" ? null : TSLConditionEffects.getWoundSource(actor, id));
    const source = srcId ? game.actors.get(srcId) : null;
    const who = { self: actor, source, allies: TSLMoments._resolve(allyIds), pick: pickId ? game.actors.get(pickId) : null, clearId };
    const lines = await TSLMoments._applyFx(ult.fx ?? {}, who, ult.name, meta.icon);
    const esc = foundry.utils.escapeHTML;
    const text = (ult.text ?? "").replace(/\{source\}/g, source?.name ?? "them");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--success">
        <div class="tsl-mv-header"><i class="fas fa-bolt"></i><span class="tsl-mv-name">${esc(ult.name)}</span></div>
        <div class="tsl-mv-outcome tsl-mv-outcome--success">⚡ <b>${esc(actor.name)}</b> unleashes it <span style="opacity:.75">(${esc(meta.label)}, 1 Willpower)</span> — ${esc(text)}</div>
        ${lines.length ? `<ul class="tsl-mv-after">${lines.map(l => `<li class="tsl-mv-after-item tsl-mv-after--good">${l}</li>`).join("")}</ul>` : ""}
      </div>`,
    });
    return true;
  }

  /**
   * ★ Invoke a ●●● bond's Signature (once per long rest): mark it spent, put
   * its effects on the sheets, tell the table. GM client.
   * args: { actorId, bondId, choice } — choice = index into fx.choose.
   */
  static async invokeSignature({ actorId, bondId, choice = 0 } = {}) {
    const actor = game.actors.get(actorId);
    const bond  = actor ? TSLBondStore.getList(actorId).find(b => b.id === bondId) : null;
    if (!actor || !bond || bond.sigUsed) return false;
    if (TSLBondStore.getStrength(actorId, bond.targetActorId) < 3) return false;
    const sig = SocialArchetypeManager.getBondSignature(bond.type);
    if (!sig) return false;
    const partner = game.actors.get(bond.targetActorId) ?? null;
    await TSLBondStore.markSignatureUsed(actorId, bondId);
    let fx = sig.fx ?? {};
    let picked = null;
    if (fx.choose) { picked = fx.choose[Math.max(0, Math.min(fx.choose.length - 1, choice | 0))]; fx = picked; }
    const lines = await TSLMoments._applyFx(fx, { self: actor, partner, source: partner, allies: [] }, sig.label, "icons/svg/aura.svg");
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--success">
        <div class="tsl-mv-header"><i class="fas fa-star"></i><span class="tsl-mv-name">${esc(sig.label)}</span></div>
        <div class="tsl-mv-outcome tsl-mv-outcome--success">★ <b>${esc(actor.name)}</b> calls on the bond with ${esc(partner?.name ?? "them")}${picked ? ` — <b>${esc(picked.label)}</b>` : ""}: ${esc(sig.text)}</div>
        ${lines.length ? `<ul class="tsl-mv-after">${lines.map(l => `<li class="tsl-mv-after-item tsl-mv-after--good">${l}</li>`).join("")}</ul>` : ""}
      </div>`,
    });
    return true;
  }
}
