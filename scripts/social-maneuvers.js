/**
 * tsl-social-conflict | social-maneuvers.js
 *
 * Social Fencing maneuver data and roller.
 * UI is handled by SocialFencingApp / TSLConflictApp.
 *
 * Flow: rollManeuver() only rolls dice and posts the chat card (any client).
 * Effects (conditions, strings, patience, resolve, profile reveal) are applied
 * exclusively on the GM client via SocialManeuverRoller.applyOutcome(), reached
 * either directly (GM) or through the GM_ACTION socket relay (players).
 */

console.log("TSL | Loading social-maneuvers.js...");

// ─── Maneuver groups ──────────────────────────────────────────────────────────

const MANEUVER_GROUPS = [
  { id: "general",   label: "General Tactics" },
  { id: "power",     label: "Triad of Power" },
  { id: "attention", label: "Triad of Emotion" },
  { id: "order",     label: "Triad of Reason" },
];

// ─── Maneuver data ────────────────────────────────────────────────────────────
//
// Each SCHOOL has a mechanical identity, and every maneuver a distinct role:
//   General — safe basics: the scout, the jab, the setup (no vuln/imm drama)
//   Power   — domination: tempo and pressure; hits harder, risks harder
//   Emotion — hearts: statuses that chain into combos
//   Order   — ledgers: economy (Strings), information, field control
//
// vulnerabilityTags ∩ archetype.vulnerabilities → Advantage, +1 Resolve damage
// immunityTags      ∩ archetype.immunities      → auto-fail, target Defiant
// reveals: true       → success whispers a TELL of their nature to the roller
// failPatience        → Patience burned on a failure (default 1)

const SOCIAL_MANEUVERS = [

  // ── General Tactics ─────────────────────────────────────────────────────────

  {
    id:    "cold_reading",
    name:  "Read Them",
    skill: "Insight",
    icon:  "fa-eye",
    group: "general",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The scout. Watch the seams of their public face — no pressure, just attention.",
    successText:  "A tell of their nature is whispered to you — deduce the archetype and note your guess in your Bond. You gain 1 String.",
    failText:     "The mask holds. Patience −1.",
    immuneText:   null,
    applyOnSuccess: null,
    grantStrings: 1,
    reveals: true,
    resolveDamage: 0,
    worksThroughDefiant: true,
  },

  {
    id:    "sow_doubt",
    name:  "Mock",
    skill: "Deception",
    icon:  "fa-theater-masks",
    group: "general",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: [],
    immunityTags:      ["sow doubt", "criticism"],   // Exalted
    description:  "The jab. A joke with a razor in it — and it cuts twice as deep into someone already off balance. Kick them while they're down.",
    successText:  "The barb lands where it hurts. Resolve −1 (−2 if they were off balance).",
    failText:     "The joke dies in the air. Patience −1.",
    immuneText:   "They cannot imagine being the punchline. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 0,
    resolveDamage: 1,
    kickWhileDown: true,   // +1 dmg if the target has ANY fencing status (not consumed)
  },

  {
    id:    "instigate",
    name:  "Taunt",
    skill: "Performance",
    icon:  "fa-fire",
    group: "general",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: [],
    immunityTags:      ["intimidate", "emotional intimidation"],  // Tyrant, Hermit
    description:  "The setup. Needle their temper until composure slips — then strike into the gap.",
    successText:  "They lose their cool — Provoked: the next maneuver against them gains +2.",
    failText:     "They remain unmoved. Patience −1.",
    immuneText:   "They answer with cold control. Target becomes Defiant.",
    applyOnSuccess: "provoked",
    grantStrings: 0,
    resolveDamage: 0,
  },

  // ── Triad of Power — domination: hits harder, risks harder ─────────────────

  {
    id:    "flatter",
    name:  "Flatter",
    skill: "Persuasion",
    icon:  "fa-crown",
    group: "power",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["appease", "flattery"],       // Tyrant → Advantage
    immunityTags:      [],
    description:  "Hold up the reflection they wish were true. Power through worship — they kneel to their own image.",
    successText:  "They fall for their own reflection — Smitten (cannot act against you; your Persuasion maneuvers gain Advantage). Resolve −1.",
    failText:     "The mirror shows the flattery for what it is. Patience −1.",
    immuneText:   null,
    applyOnSuccess: "smitten",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "feigned_weakness",
    name:  "Play Weak",
    skill: "Deception",
    icon:  "fa-mask",
    group: "power",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["deceive", "feigned weakness"],  // Machiavellian → Advantage
    immunityTags:      ["scorn for weakness"],            // Duelist
    description:  "The deep bait. Show them your throat and count what they reveal reaching for it.",
    successText:  "They lunge at the opening and show you everything. You gain 3 Strings on them.",
    failText:     "They circle the bait, unconvinced. Patience −1.",
    immuneText:   "Weakness earns only their contempt. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 3,
    resolveDamage: 0,
  },

  {
    id:    "throw_gauntlet",
    name:  "Humiliate",
    skill: "Intimidation",
    icon:  "fa-khanda",
    group: "power",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    vulnerabilityTags: ["challenge", "glory"],            // Duelist → Advantage
    immunityTags:      ["emotional intimidation"],        // Hermit
    description:  "The heavy blow. Dare them before witnesses — glorious if it lands, costly if it hangs in the air.",
    successText:  "The dare shatters their footing. Resolve −2.",
    failText:     "The gauntlet lies ignored, and the room saw you drop it. Patience −2.",
    immuneText:   "They walk away from the theatrics. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 0,
    resolveDamage: 2,
    failPatience: 2,
    combos: { provoked: { label: "They lash out into your trap — the fall is twice as public", resolveDamage: 1 } },
  },

  // ── Triad of Emotion — hearts: statuses that chain into combos ─────────────

  {
    id:    "love_bombing",
    name:  "Charm",
    skill: "Performance",
    icon:  "fa-heart",
    group: "attention",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: ["love bombing"],              // Exalted → Advantage
    immunityTags:      ["persuade", "sympathy"],      // Martyr
    description:  "Lay siege with sweetness. Adoration as a weapon — they open the gates themselves.",
    successText:  "The gates open — Smitten (cannot act against you; your Persuasion maneuvers gain Advantage). They confide: you gain 1 String.",
    failText:     "The display leaves them cold.",
    immuneText:   "Your sweetness deepens their contempt. Target becomes Defiant.",
    applyOnSuccess: "smitten",
    grantStrings: 1,
    resolveDamage: 0,
    combos: { desperate: { label: "Starved for warmth, they cling to the first kind word", resolveDamage: 1 } },
  },

  {
    id:    "cold_shoulder",
    name:  "Stir Jealousy",
    skill: "Performance",
    icon:  "fa-heart-circle-exclamation",
    group: "attention",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: ["stone-walling", "ignore"],   // Martyr → Advantage
    immunityTags:      ["selfless focus"],            // Caretaker
    description:  "Warmth, aimed past them. Laugh at another's joke, praise a rival's wit, let your attention settle anywhere but on them — and let them feel the room tilt away.",
    successText:  "Their eyes keep flicking to your new favorite. They talk faster, lean closer — Desperate (the next Flatter or Charm against them gains Advantage). Resolve −1.",
    failText:     "They genuinely don't care who you smile at. Patience −1.",
    immuneText:   "They're pleased to see someone else get the attention. Target becomes Defiant.",
    applyOnSuccess: "desperate",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "guilt_trip",
    name:  "Guilt Trip",
    skill: "Persuasion",
    icon:  "fa-scale-unbalanced",
    group: "attention",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["guilt", "obligation"],       // Caretaker → Advantage
    immunityTags:      ["shameless"],                 // Machiavellian
    description:  "Present the ledger of everything owed in hurt and kindness — and let it crush.",
    successText:  "The weight settles on their shoulders — Guilted (your next maneuver against them gains Advantage). Resolve −1.",
    failText:     "They shrug the weight off. Patience −1.",
    immuneText:   "Shame needs a conscience. Target becomes Defiant.",
    applyOnSuccess: "guilted",
    grantStrings: 0,
    resolveDamage: 1,
    combos: { smitten: { label: "A smitten heart weighs every debt double", strings: 1 } },
  },

  // ── Triad of Reason — ledgers: economy, information, field control ──────────

  {
    id:    "gaslight",
    name:  "Undermine",
    skill: "Deception",
    icon:  "fa-brain",
    group: "order",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["gaslighting", "exploiting dogma"],  // Dogmatic → Advantage
    immunityTags:      ["ledger mind"],                       // Broker
    description:  "Field control. Pull one thread of what they believe and let the whole cloth loosen.",
    successText:  "Their certainty frays — Rattled: the DC to sway them drops by 5 for the scene.",
    failText:     "The weave holds firm. Patience −1.",
    immuneText:   "Feelings aren't entries in their books. Target becomes Defiant.",
    applyOnSuccess: "rattled",
    grantStrings: 0,
    resolveDamage: 0,
  },

  {
    id:    "logic_exploit",
    name:  "Cross-Examine",
    skill: "Investigation",
    icon:  "fa-puzzle-piece",
    group: "order",
    skillKeys:       { dnd5e: "inv", "a5e-for-dnd5e": "investigation" },
    vulnerabilityTags: ["information deficit", "logic puzzles"],  // Hermit → Advantage
    immunityTags:      ["bribes", "emotions", "pure logic"],      // Dogmatic, Machiavellian
    description:  "The scholar's cut. Find the flaw in their reasoning and pry it open — it hurts AND it teaches.",
    successText:  "The flaw betrays them — a tell of their nature is whispered to you, you gain 1 String, and their certainty bleeds. Resolve −1.",
    failText:     "Your argument doesn't land. Patience −1.",
    immuneText:   "They dismiss the reasoning outright. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 1,
    reveals: true,
    resolveDamage: 1,
    combos: { guilted: { label: "Guilt makes them over-explain — every excuse is a loose thread", strings: 1 } },
  },

  {
    id:    "sweeten_deal",
    name:  "Bargain",
    skill: "Persuasion",
    icon:  "fa-coins",
    group: "order",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["deal", "greed"],             // Broker → Advantage
    immunityTags:      ["bribes"],                    // Dogmatic
    description:  "Every gift is a link. Put a concrete offer on the table and watch it close around their wrist.",
    successText:  "They accept the terms — and the chain. You gain 2 Strings; the obligation weighs. Resolve −1.",
    failText:     "Your price is wrong. Patience −1.",
    immuneText:   "They recoil from the offer as corruption itself. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 2,
    resolveDamage: 1,
    combos: { desperate: { label: "A desperate soul signs anything", strings: 1 } },
  },
];

// ─── Roller ────────────────────────────────────────────────────────────────────

// A String is a TRUMP CARD: burning one is +5 — it almost always turns a
// near miss. Earned rarely (baits, deep reads, and above all: OPENING UP at
// the table), held as a +1 grip, spent as the gamble after the die falls.
const STRING_SPEND_BONUS = 5;

/** Maneuvers that feed on the Desperate status. */
const ATTENTION_MANEUVERS = ["flatter", "love_bombing"];

/**
 * The triad counter cycle — every archetype is soft-weak (+2 to the attacker)
 * against maneuvers of the school that counters its ruling triad:
 *   Power breaks Emotion  (dominance cows the needy)
 *   Emotion cracks Reason  (feelings undermine systems)
 *   Reason binds Power     (contracts and logic tie the mighty down)
 * Maps maneuver group → the defender triad it counters.
 */
const TRIAD_COUNTERS = { power: "attention", attention: "order", order: "power" };

/**
 * THE ANSWER — one rule for "don't get caught". When you fumble badly (miss
 * by 5+) or hit their immunity outright, the archetype answers in its
 * triad's own language, and the debuff lands on YOU:
 *   Power   — they tower over the misstep: YOU are Rattled.
 *   Emotion — they make your fumble about THEIR hurt: YOU are Guilted.
 *   Reason  — they file it away: a String on you.
 * Predictable if you know their nature; evidence for deduction if you don't.
 */
const TRIAD_ANSWER = {
  power:     { status: "rattled",
               risk: "you'll be Rattled",
               line: (src, tgt) => `${tgt} answers the misstep with sheer presence — <b>${src} is Rattled</b>.` },
  attention: { status: "guilted",
               risk: "you'll be Guilted",
               line: (src, tgt) => `${tgt} turns the fumble into THEIR wound, and the room feels it — <b>${src} is Guilted</b>.` },
  order:     { strings: 1,
               risk: "they'll gain a String on you",
               line: (src, tgt) => `${tgt} quietly files the fumble away — <b>a String on ${src}</b>.` },
};

/** TSL Conditions offered by "Hold the Line", by the school of the incoming maneuver. */
const HOLD_LINE_CONDITIONS = {
  power:     ["angry", "scared"],
  attention: ["smitten", "guilty"],
  order:     ["scared", "hopeless"],
  general:   ["angry", "guilty"],
};

class SocialManeuverRoller {
  static getManeuver(id) {
    return SOCIAL_MANEUVERS.find(m => m.id === id) ?? null;
  }

  /** The actor's proficiency bonus (number), with level/CR fallback. */
  static getProfBonus(actor) {
    const sys = actor.system ?? {};
    let prof = sys.attributes?.prof;
    if (typeof prof !== "number") prof = prof?.value;
    if (typeof prof !== "number") {
      const tier = sys.details?.level ?? sys.details?.cr ?? 1;
      prof = 2 + Math.floor((Math.max(1, tier) - 1) / 4);
    }
    return prof;
  }

  static getSkillMod(actor, maneuver) {
    // Try the system-native key first, then the other systems' keys —
    // and read whichever numeric field the system actually computes.
    const keys = [...new Set([
      maneuver.skillKeys[game.system.id],
      maneuver.skillKeys["a5e-for-dnd5e"],
      maneuver.skillKeys["dnd5e"],
    ].filter(Boolean))];
    for (const key of keys) {
      const entry = actor.system?.skills?.[key];
      if (!entry) continue;
      // dnd5e computes .total = ability + proficiency + bonuses — trust it
      if (typeof entry.total === "number") return entry.total;
      let v = entry.mod ?? entry.value;
      if (typeof v !== "number") continue;
      // Systems without .total (a5e) expose the raw ability mod plus a
      // proficiency flag/multiplier — fold proficiency in ourselves so a
      // trained character actually rolls better than an untrained one.
      const mult = Number(entry.proficient ?? entry.prof ?? entry.proficiency ?? 0);
      if (mult > 0) v += Math.floor(SocialManeuverRoller.getProfBonus(actor) * mult);
      return v;
    }
    return 0;
  }

  static getPassiveInsight(actor) {
    const skills = actor.system?.skills ?? {};
    const ins = skills.ins ?? skills.insight;
    if (typeof ins?.passive === "number") return ins.passive;
    const v = ins?.total ?? ins?.mod ?? ins?.value;
    return 10 + (typeof v === "number" ? v : 0);
  }

  /**
   * Social DC scales with the target like a save DC scales with a caster:
   * 10 + WIS mod + proficiency bonus, or passive Insight when that's higher
   * (Insight experts keep their edge). Proficiency falls back to level/CR
   * math when the system doesn't expose it.
   */
  static getSocialDC(actor) {
    const wis = actor.system?.abilities?.wis?.mod ?? 0;
    return Math.max(
      SocialManeuverRoller.getPassiveInsight(actor),
      10 + wis + SocialManeuverRoller.getProfBonus(actor)
    );
  }

  /**
   * Returns "immune" | "vulnerable" | "neutral" (archetype only, no statuses).
   * `archOverride`: undefined → use the target's REAL archetype (GM/roll);
   * an Archetype or null → use that instead (a player's GUESS for display).
   */
  static getRelation(targetActor, maneuver, archOverride = undefined) {
    const arch = archOverride !== undefined ? archOverride : SocialArchetypeManager.getArchetype(targetActor);
    if (!arch) return "neutral";
    if (maneuver.immunityTags.some(t => arch.immunities.includes(t)))           return "immune";
    if (maneuver.vulnerabilityTags.some(t => arch.vulnerabilities.includes(t))) return "vulnerable";
    return "neutral";
  }

  /**
   * The single source of truth for how a maneuver lands on a target:
   * archetype relation, status combos, DC breakdown, advantage and bonuses.
   * Used by the pre-roll Duel Panel AND by the roll itself, so what the
   * player sees is exactly what the dice do.
   *
   * options.leverage — "desire" | "fear" | "weakness" | null. A dossier card
   * (VTM-style leverage), playable once per encounter:
   *   desire   — soft leverage: Advantage; on success +1 extra Resolve damage
   *   fear     — hard leverage: +3 to the roll; on failure the target loses 1 extra Patience
   *   weakness — exposes the crack: a neutral maneuver counts as a vulnerability
   *
   * Returns {
   *   arch, relation: "blocked"|"immune"|"vulnerable"|"neutral", relationReason,
   *   advantage, advantageReasons: [str], bonus, bonusReasons: [{label,value}],
   *   dc, dcBase, dcMods: [{label,value}], skillMod, consumes: [conditionId], leverage
   * }
   */
  static assess(sourceActor, targetActor, maneuver, options = {}) {
    const leverage = options.leverage ?? null;
    const scope    = SocialArchetypeManager.getFlagScope();
    // options.archetypeOverride: a player's GUESS (or null = no guess) used for
    // the pre-roll display; leave undefined to use the REAL archetype (rolls, GM).
    const arch     = options.archetypeOverride !== undefined
      ? options.archetypeOverride
      : SocialArchetypeManager.getArchetype(targetActor);
    // Defensive identity: an NPC defends with its archetype's triad; a PC
    // (no archetype) defends with the triad THEY built from dots. A split
    // build has no ruling nature — unreadable, but answerless.
    const defProfile = arch ? null : SocialArchetypeManager.getDefensiveProfile(targetActor);
    const defTriad   = arch?.triad ?? defProfile?.ruling ?? null;
    const skillMod = SocialManeuverRoller.getSkillMod(sourceActor, maneuver);
    const cond     = (id) => SocialArchetypeManager.getActiveCondition(targetActor, id);
    const condBy   = (id) => {
      const e = cond(id);
      return e && e.flags?.[scope]?.sourceActorId === sourceActor.id ? e : null;
    };

    // ── DC: 10 + WIS + proficiency (or passive Insight), ± attitude/Rattled ──
    const dcBase = SocialManeuverRoller.getSocialDC(targetActor);
    const dcMods = [];
    const attitude = TSLBondStore.getAttitude(targetActor.id, sourceActor.id);
    if (attitude) dcMods.push({ label: attitude > 0 ? "they like you" : "they distrust you", value: -attitude });
    if (cond("rattled")) dcMods.push({ label: "Rattled", value: -5 });
    // Strings are leverage even unspent — THEIRS on you stiffen their guard
    const theirGrip = TSLStringStore.getList(targetActor.id)
      .filter(e => e.targetActorId === sourceActor.id).length;
    if (theirGrip) dcMods.push({ label: `they hold ${theirGrip} String${theirGrip > 1 ? "s" : ""} on you`, value: 1 });
    // A wearing conversation hardens people: past half Patience the door is closing
    const enc = SocialEncounterManager.getEncounter(targetActor);
    const patienceThin = enc.active && enc.patience <= Math.floor(enc.maxPatience / 2);
    const lastExchange = enc.active && enc.patience === 1;
    if (patienceThin) dcMods.push({ label: "their patience wears thin", value: 1 });
    // A dots-built defender knows their OWN school's tricks — home ground
    if (defProfile && defProfile.total > 0 && maneuver.group !== "general"
        && defProfile.ruling === maneuver.group) {
      dcMods.push({ label: "they know this game — home ground", value: 2 });
    }
    const dc = dcMods.reduce((sum, m) => sum + m.value, dcBase);

    // ── Hard walls: Defiant target / Smitten attacker ────────────────────────
    // Cold Reading slips through Defiant (observing is not influencing) —
    // the wall turn stays playable: you study them while they fume.
    let relation = "neutral";
    let relationReason = null;
    const smittenSelf = SocialArchetypeManager.getActiveCondition(sourceActor, "smitten");
    const smittenBy   = smittenSelf?.flags?.[scope]?.sourceActorId === targetActor.id;
    if (cond("defiant") && !maneuver.worksThroughDefiant) {
      relation = "blocked";
      relationReason = "Defiant — walled off from maneuvers. A successful Read Them breaks the wall.";
    } else if (smittenBy) {
      relation = "blocked";
      relationReason = "You are Smitten with them — you cannot bring yourself to move against them";
    } else if (arch && maneuver.immunityTags.some(t => arch.immunities.includes(t))) {
      relation = "immune";
      relationReason = `${arch.label}: this approach slides right off them`;
    } else if (arch && maneuver.vulnerabilityTags.some(t => arch.vulnerabilities.includes(t))) {
      relation = "vulnerable";
      relationReason = `${arch.label}: this is exactly their weak spot`;
    }

    // Exposed weakness turns a neutral approach into a vulnerability strike
    if (leverage === "weakness" && relation === "neutral") {
      relation = "vulnerable";
      relationReason = "Exposed weakness — the crack where pressure works";
    }

    // ── Status combos — a one-shot is consumed ONLY if it is what grants ─────
    // the advantage; a free source (vulnerability, Smitten) is used first.
    const advantageReasons = [];
    const bonusReasons     = [];
    const consumes         = [];
    let   combo            = null;
    let   kick             = false;
    let   advantage        = relation === "vulnerable";
    if (advantage) advantageReasons.push(relationReason);

    if (relation !== "blocked" && relation !== "immune") {
      if (leverage === "desire" && !advantage) {
        advantage = true;
        advantageReasons.push("Dangling their Desire — the offer speaks for you");
      }
      if (leverage === "fear") {
        bonusReasons.push({ label: "Pressing their Fear", value: 3 });
      }
      if (!advantage && maneuver.skill === "Persuasion" && condBy("smitten")) {
        advantage = true;
        advantageReasons.push("Smitten by you — Persuasion flows easy");
      }
      if (!advantage && condBy("guilted")) {
        advantage = true;
        advantageReasons.push("Guilted by you — they owe you an answer");
        consumes.push("guilted");
      }
      if (!advantage && ATTENTION_MANEUVERS.includes(maneuver.id) && cond("desperate")) {
        advantage = true;
        advantageReasons.push("Desperate for attention — they drink it in");
        consumes.push("desperate");
      }
      // Provoked is a flat +2 — it always applies and always burns
      if (cond("provoked")) {
        bonusReasons.push({ label: "Provoked — off balance", value: 2 });
        consumes.push("provoked");
      }
      // Named combos: this maneuver CASHES IN a set-up status for an extra
      // effect (bonus damage / a String) on success. The status burns.
      for (const [st, meta] of Object.entries(maneuver.combos ?? {})) {
        if (!cond(st)) continue;
        combo = { status: st, label: meta.label, resolveDamage: meta.resolveDamage ?? 0, strings: meta.strings ?? 0 };
        if (!consumes.includes(st)) consumes.push(st);
        break;
      }
      // Kick them while they're down: +1 damage against a target with ANY
      // fencing status (not consumed — mockery doesn't calm anyone)
      if (maneuver.kickWhileDown && SOCIAL_CONDITION_ORDER.some(id => cond(id))) kick = true;
      // The triad counter cycle: the defender's ruling triad is soft against
      // the school that counters it (Power→Emotion→Order→Power). Works on
      // archetypes AND on dots-built defenders with a ruling triad.
      if (defTriad && TRIAD_COUNTERS[maneuver.group] === defTriad) {
        const atkShort = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
        const defShort = (SOCIAL_TRIADS[defTriad]?.label ?? "").replace("Triad of ", "");
        bonusReasons.push({ label: `${atkShort} counters ${defShort} — their kind bends to this school`, value: 2, kind: "counter" });
      }
      // A dots-built defender's BLIND side: a school they never learned
      // (0 dots while invested elsewhere) finds nothing guarding the door
      if (defProfile && defProfile.total > 0 && maneuver.group !== "general"
          && (defProfile.dots[maneuver.group] ?? 0) === 0) {
        bonusReasons.push({ label: "an unguarded approach — nothing in them answers this school", value: 1 });
      }
      // Held Strings are a standing grip on them — +1 even before you spend one
      const myGrip = TSLStringStore.getList(sourceActor.id)
        .filter(e => e.targetActorId === targetActor.id).length;
      if (myGrip) {
        bonusReasons.push({ label: `String grip (${myGrip} held) — you know which threads to pull`, value: 1 });
      }
      // Bond passive: the relationship itself is a lever — its school gets +1
      // (hearts respond to hearts, rivalries to power plays, debts to bargains)
      const myBond = TSLBondStore.find(sourceActor.id, targetActor.id);
      const bondMeta = myBond ? SocialArchetypeManager.getBondType(myBond.type) : null;
      if (bondMeta?.school && bondMeta.school === maneuver.group) {
        bonusReasons.push({ label: `Bond: ${bondMeta.label} — this approach runs deep between you`, value: 1 });
      }
      // The attacker's Extended Triad leanings shape their own attack style:
      // +1 per dot in the maneuver's triad; a triad with NO dots (while the
      // profile has some elsewhere) is foreign ground — −1. General tactics
      // are always neutral. Dots are for PCs; an NPC with no dots fights from
      // its ARCHETYPE's school instead (counts as 2●, no foreign-ground malus)
      // — the GM sets one field and the NPC has a style.
      if (maneuver.group !== "general") {
        const myTriad   = SocialArchetypeManager.getCharacterNotes(sourceActor).triad ?? {};
        const dots      = myTriad[maneuver.group] ?? 0;
        const totalDots = Object.values(myTriad).reduce((s, v) => s + (v || 0), 0);
        const short     = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
        if (totalDots > 0) {
          if (dots > 0) {
            bonusReasons.push({ label: `${short} leaning ${"●".repeat(dots)}`, value: dots });
          } else {
            bonusReasons.push({ label: `Foreign ground — no ${short} leaning`, value: -1 });
          }
        } else {
          const myArch = SocialArchetypeManager.getArchetype(sourceActor);
          if (myArch && myArch.triad === maneuver.group) {
            // Veiled label — never name the attacker's archetype to the table
            bonusReasons.push({ label: "In their element — this school comes naturally", value: 2 });
          }
        }
      }
    }

    // The Answer you risk on a bad miss — worded from the same defensive
    // identity the rest of the assessment uses (archetype truth/guess, or a
    // PC's ruling triad), so the warning follows your read.
    const answerRisk = defTriad && relation !== "blocked" && relation !== "immune"
      ? TRIAD_ANSWER[defTriad]?.risk ?? null
      : null;

    const bonus = bonusReasons.reduce((s, b) => s + b.value, 0);
    return {
      arch, relation, relationReason,
      advantage, advantageReasons,
      bonus, bonusReasons, combo, kick, answerRisk,
      patienceThin, lastExchange,
      dc, dcBase, dcMods, skillMod, consumes, leverage,
    };
  }

  /**
   * The stakes of this exchange, in plain words — what a hit buys and what a
   * miss costs. Built from the SAME assessment the dice use (guess-based for
   * players), so the wager you read is the wager you make.
   * Returns { hit, miss } or null when there is nothing to weigh (walled).
   */
  static previewOutcomes(a, maneuver) {
    if (!a || a.relation === "blocked" || a.relation === "immune") return null;
    const dmg = (maneuver.resolveDamage ?? 1)
      + (a.relation === "vulnerable" ? 1 : 0)
      + (a.combo?.resolveDamage ?? 0)
      + (a.leverage === "desire" ? 1 : 0)
      + (a.kick ? 1 : 0);
    const strings = (maneuver.grantStrings ?? 0) + (a.combo?.strings ?? 0);
    const applies = maneuver.applyOnSuccess
      ? SOCIAL_CONDITIONS[maneuver.applyOnSuccess]?.label ?? maneuver.applyOnSuccess
      : null;
    const hit = [
      dmg ? `−${dmg} Resolve` : null,
      applies ? `they're ${applies}` : null,
      strings ? `+${strings} String${strings > 1 ? "s" : ""}` : null,
      maneuver.reveals ? "a tell" : null,
    ].filter(Boolean).join(" · ") || "pressure";
    const burn = (maneuver.failPatience ?? 1) + (a.leverage === "fear" ? 1 : 0);
    const miss = [
      `−${burn} their Patience`,
      a.answerRisk ? `badly — their answer (${a.answerRisk})` : null,
    ].filter(Boolean).join(" · ");
    return { hit, miss };
  }

  /**
   * The post-roll gamble: the die is cast, the DC is hidden — burn a String
   * for +5 and hope it turns the exchange? Decided AFTER seeing the total.
   */
  static async promptStringBurn(total, maneuver, heldCount) {
    return new Promise(resolve => {
      new Dialog({
        title: `${maneuver.name} — it doesn't land…`,
        content: `<div class="tsl-rollmods">
          <p>Your total is <b>${total}</b> — and it isn't enough. You hold
          ${heldCount} String${heldCount > 1 ? "s" : ""} on them.</p>
          <p class="notes">Pull the thread for +${STRING_SPEND_BONUS}? The difficulty is hidden — this is a bet.</p>
        </div>`,
        buttons: {
          burn: { icon: '<i class="fas fa-masks-theater"></i>', label: `Burn a String (+${STRING_SPEND_BONUS})`, callback: () => resolve(true) },
          keep: { label: "Let it stand", callback: () => resolve(false) },
        },
        default: "keep",
        close: () => resolve(false),
      }).render(true);
    });
  }

  /**
   * The pre-roll modifier prompt — same idea as the system's roll dialog:
   * a situational modifier plus advantage/disadvantage the GM calls out.
   * Resolves to { situational, mode } or null when cancelled.
   */
  static async promptRollMods(title, baseAdvantage = false) {
    const content = `
      <div class="tsl-rollmods">
        <div class="form-group">
          <label>Situational modifier</label>
          <input type="number" name="situational" value="0" step="1" autofocus>
        </div>
        <div class="form-group">
          <label>Roll mode</label>
          <select name="mode">
            <option value="normal" selected>Normal</option>
            <option value="adv">Advantage</option>
            <option value="dis">Disadvantage</option>
          </select>
        </div>
        ${baseAdvantage ? `<p class="notes">You already roll with Advantage from the situation; Disadvantage here would cancel it.</p>` : ""}
      </div>`;
    return new Promise(resolve => {
      new Dialog({
        title,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: (html) => {
              const root = html instanceof HTMLElement ? html : html[0];
              resolve({
                situational: parseInt(root.querySelector("[name='situational']")?.value) || 0,
                mode: root.querySelector("[name='mode']")?.value ?? "normal",
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        close: () => resolve(null),
      }).render(true);
    });
  }

  /**
   * Roll the maneuver and post the chat card. NO side effects here —
   * pass the returned payload to applyOutcome (GM) or the GM_ACTION relay.
   * options.stringBonus  — +2 if the roller spent a String on this target
   * options.situational  — flat modifier from the pre-roll dialog
   * options.mode         — "normal" | "adv" | "dis" from the pre-roll dialog
   */
  static async rollManeuver(sourceActor, targetActor, maneuver, options = {}) {
    let stringBonus   = options.stringBonus ?? 0;
    const situational = options.situational ?? 0;
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage: options.leverage ?? null });

    // Advantage from the situation + the dialog; dis + adv cancel out (5e rules)
    const wantAdv = a.advantage || options.mode === "adv";
    const wantDis = options.mode === "dis";
    const die = wantAdv && wantDis ? "1d20" : wantAdv ? "2d20kh1" : wantDis ? "2d20kl1" : "1d20";

    const mod     = a.skillMod + stringBonus + a.bonus + situational;
    const roll    = new Roll(`${die} + ${mod}`);
    await roll.evaluate();

    const rawDice  = roll.dice[0].results.map(r => r.result);
    let   total    = roll.total;
    const isWalled = a.relation === "immune" || a.relation === "blocked";
    let   success  = !isWalled && total >= a.dc;

    // The post-roll gamble: on a miss the roller may burn a String for +2 —
    // decided AFTER seeing the die, against a difficulty they cannot see.
    let spentStringPostRoll = false;
    if (!isWalled && !success && options.offerString) {
      const held = TSLStringStore.getList(sourceActor.id)
        .filter(e => e.targetActorId === targetActor.id).length;
      if (held > 0 && await SocialManeuverRoller.promptStringBurn(total, maneuver, held)) {
        spentStringPostRoll = true;
        stringBonus += STRING_SPEND_BONUS;
        total       += STRING_SPEND_BONUS;
        success      = total >= a.dc;
      }
    }

    // Graded outcomes — named, never numbered, so chat can't leak the DC:
    //   crit (beat it by 5+) · success · failure · botch (missed by 5+ → the Answer)
    const outcomeType = isWalled ? "immune"
      : success ? (total >= a.dc + 5 ? "crit" : "success")
      : (total <= a.dc - 5 ? "botch" : "failure");
    const outcomeText =
      a.relation === "blocked" ? "They are Defiant — only Read Them gets through, and a successful read breaks the wall." :
      a.relation === "immune"  ? (maneuver.immuneText ?? "Target becomes Defiant.") :
      outcomeType === "crit"   ? `Clean through the guard. ${maneuver.successText}` :
      outcomeType === "botch"  ? `${maneuver.failText} The opening is yours no longer — they answer.` :
      success ? maneuver.successText : maneuver.failText;

    await SocialManeuverRoller._postCard({
      sourceActor, targetActor, maneuver, roll, rawDice,
      stringBonus, situational, total, outcomeType, outcomeText, assessment: a,
      advantage: wantAdv && !wantDis, disadvantage: wantDis && !wantAdv,
    });

    return {
      sourceActorId: sourceActor.id,
      targetActorId: targetActor.id,
      maneuverId:    maneuver.id,
      outcomeType,
      relation:      a.relation,
      consumed:      isWalled ? [] : a.consumes,
      combo:         isWalled ? null : a.combo,
      leverage:      a.leverage,
      total,
      dc: a.dc,
      spentString: stringBonus > 0,
      spentStringPostRoll,
    };
  }

  /**
   * A successful read whispers one TELL of the target's real archetype to the
   * reader's owners (+GM) — evidence, not the answer. GM CLIENT ONLY.
   */
  static async whisperTell(sourceActor, targetActor) {
    if (!sourceActor || !targetActor) return;
    const esc  = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(targetActor);
    const whisper = [
      ...game.users.filter(u => sourceActor.testUserPermission(u, "OWNER")).map(u => u.id),
      ...game.users.filter(u => u.isGM).map(u => u.id),
    ];
    const pool = arch
      ? [...(arch.tells ?? []), `They seem to crave: ${arch.craves ?? "?"}`, `They seem to dread: ${arch.dreads ?? "?"}`]
      : null;
    const text = pool?.length
      ? `🔍 Reading ${esc(targetActor.name)}: <i>“${esc(pool[Math.floor(Math.random() * pool.length)])}”</i><br><span class="tsl-mv-target">Deduce their nature and note your guess in your Bond (“Read as”).</span>`
      : `🔍 Reading ${esc(targetActor.name)}: <i>the GM should describe a tell of their nature</i> (no archetype is set).`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">${text}</div></div>`,
      whisper: [...new Set(whisper)],
    });
  }

  /**
   * Apply the mechanical consequences of a maneuver roll. GM CLIENT ONLY.
   * Players reach this through the GM_ACTION socket relay (socket.js).
   * Also advances the shared conflict (log + turn) when one is running.
   */
  static async applyOutcome(payload) {
    if (!game.user.isGM) return;
    const { sourceActorId, targetActorId, maneuverId, outcomeType, relation, consumed, combo, leverage, spentString } = payload;
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);
    if (!sourceActor || !targetActor || !maneuver) return;

    // No "Start Encounter" ceremony — the first maneuver against a target
    // brings its Resolve/Patience tracks to life from sheet defaults.
    await SocialEncounterManager.ensureActive(targetActor);
    const encBefore = SocialEncounterManager.getEncounter(targetActor);

    // Off-balance check BEFORE anything burns — Mock's kick counts the state
    // the target was actually in when the words landed
    const wasOffBalance = SOCIAL_CONDITION_ORDER.some(id =>
      SocialArchetypeManager.getActiveCondition(targetActor, id));

    // One-shot statuses that influenced this roll burn away
    for (const condId of consumed ?? []) {
      await SocialArchetypeManager.removeCondition(targetActor, condId);
    }
    // A played leverage card is spent whatever the outcome — they heard the pitch
    if (leverage)
      await SocialEncounterManager.markLeverageUsed(targetActor, leverage);

    if (outcomeType === "immune") {
      // Archetype immunity raises the wall; an existing Defiant wall just wastes the attempt
      if (relation === "immune") {
        await SocialArchetypeManager.applyCondition(targetActor, "defiant", sourceActor);
        // ...and the wrong lever earns their Answer outright
        await SocialManeuverRoller._applyAnswer(sourceActor, targetActor);
      }
      await SocialEncounterManager.adjustPatience(targetActor, -1, sourceActorId);
    } else if (outcomeType === "success" || outcomeType === "crit") {
      // Hold the Line: the words landed — the defender may refuse the STATUS
      // and the Resolve hit by taking an emotional wound (a TSL Condition)
      // instead. Asked out loud at the table; the GM clicks the answer.
      let heldTheLine = false;
      if (maneuver.applyOnSuccess && SocialManeuverRoller._holdLineEnabled()) {
        const choice = await SocialManeuverRoller.promptHoldLine(targetActor, maneuver);
        if (choice) {
          heldTheLine = true;
          const count = await TSLConditionEffects.applyOne(targetActor, choice, sourceActor.name);
          const esc = foundry.utils.escapeHTML;
          const condLabel = { smitten: "Smitten", angry: "Angry", scared: "Scared", guilty: "Guilty", hopeless: "Hopeless" }[choice] ?? choice;
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: `<div class="tsl-maneuver-card tsl-mv--immune"><div class="tsl-mv-outcome tsl-mv-outcome--immune">🛡 ${esc(targetActor.name)} holds the line — the words land, but they swallow them: <b>${condLabel}</b>.${count >= 4 ? " <b>Overwhelmed — they must yield or flee.</b>" : ""}</div></div>`,
          });
        }
      }
      if (heldTheLine) {
        // The effect is refused, not erased: Strings/tells the ATTACKER earned
        // still stand (they learned something), but no status, no Resolve hit.
        if (maneuver.grantStrings > 0)
          await TSLStringStore.add(sourceActorId, targetActorId, maneuver.grantStrings);
        if (combo?.strings > 0)
          await TSLStringStore.add(sourceActorId, targetActorId, combo.strings);
        if (maneuver.reveals)
          await SocialManeuverRoller.whisperTell(sourceActor, targetActor);
        return SocialManeuverRoller._afterOutcome(payload, encBefore);
      }
      if (maneuver.applyOnSuccess)
        await SocialArchetypeManager.applyCondition(targetActor, maneuver.applyOnSuccess, sourceActor);
      if (maneuver.grantStrings > 0)
        await TSLStringStore.add(sourceActorId, targetActorId, maneuver.grantStrings);
      // A read never hands over the archetype — it whispers a TELL. The player
      // deduces the nature themselves and writes their guess into the Bond.
      if (maneuver.reveals)
        await SocialManeuverRoller.whisperTell(sourceActor, targetActor);
      // Read Them slips through the Defiant wall — and a SUCCESSFUL read
      // finds the seam and brings it down. Without this, one triggered
      // immunity walls the target off with no counter-play (game time does
      // not tick on its own, so "1 hour" is effectively forever).
      if (maneuver.worksThroughDefiant
          && SocialArchetypeManager.getActiveCondition(targetActor, "defiant")) {
        await SocialArchetypeManager.removeCondition(targetActor, "defiant");
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">🧱 The wall cracks — ${foundry.utils.escapeHTML(targetActor.name)} is no longer Defiant.</div></div>`,
        });
      }
      // A vulnerability strike adds +1 to the maneuver's own damage profile
      let damage = (maneuver.resolveDamage ?? 1) + (relation === "vulnerable" ? 1 : 0);
      if (leverage === "desire") damage += 1;  // the offer does half the work
      // A clean hit (beat the mark by 5+) cuts deeper
      if (outcomeType === "crit") damage += 1;
      // Mock kicks them while they're down: +1 vs a target with any status
      if (maneuver.kickWhileDown && wasOffBalance) damage += 1;
      // A cashed combo pays out on top: extra damage and/or a String
      if (combo) {
        damage += combo.resolveDamage ?? 0;
        if (combo.strings > 0)
          await TSLStringStore.add(sourceActorId, targetActorId, combo.strings);
      }
      if (damage > 0)
        await SocialEncounterManager.adjustResolve(targetActor, -damage, sourceActorId);
    } else {
      // Heavy plays (failPatience) and failed threats (fear) burn extra Patience
      const burn = (maneuver.failPatience ?? 1) + (leverage === "fear" ? 1 : 0);
      await SocialEncounterManager.adjustPatience(targetActor, -burn, sourceActorId);
      // A BAD miss (5+ under) earns their Answer — one rule, one table
      if (outcomeType === "botch") {
        await SocialManeuverRoller._applyAnswer(sourceActor, targetActor);
        // TSL's "mark XP on a miss": a spectacular social fumble feeds the
        // story. A player character who eats the Answer gains Inspiration.
        if (sourceActor.hasPlayerOwner
            && foundry.utils.getProperty(sourceActor, "system.attributes.inspiration") === false) {
          await sourceActor.update({ "system.attributes.inspiration": true });
          const esc = foundry.utils.escapeHTML;
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
            content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">💫 A fumble this good feeds the story — <b>${esc(sourceActor.name)} gains Inspiration</b>.</div></div>`,
          });
        }
      }
    }

    return SocialManeuverRoller._afterOutcome(payload, encBefore);
  }

  /**
   * The Answer: the archetype punishes a bad misstep (botch or immunity hit)
   * in its triad's own language — the debuff lands on the ATTACKER. Public
   * card is veiled: it's evidence of their nature, not the answer sheet.
   */
  static async _applyAnswer(sourceActor, targetActor) {
    // NPC: archetype's triad. PC: the ruling triad of the dots THEY built —
    // the player's chosen nature answers in its own language.
    const realArch = SocialArchetypeManager.getArchetype(targetActor);
    const triad    = realArch?.triad
      ?? SocialArchetypeManager.getDefensiveProfile(targetActor).ruling;
    const answer   = triad ? TRIAD_ANSWER[triad] : null;
    if (!answer) return;
    if (answer.status)  await SocialArchetypeManager.applyCondition(sourceActor, answer.status, targetActor);
    if (answer.strings) await TSLStringStore.add(targetActor.id, sourceActor.id, answer.strings);
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: `<div class="tsl-maneuver-card tsl-mv--immune"><div class="tsl-mv-outcome tsl-mv-outcome--immune">⚔ ${answer.line(esc(sourceActor.name), esc(targetActor.name))}</div></div>`,
    });
  }

  static _holdLineEnabled() {
    try { return game.settings.get("tsl-social-conflict", "enableHoldLine") !== false; }
    catch { return true; }
  }

  /**
   * Ask the table: accept the incoming status, or hold the line and take an
   * emotional wound instead? GM clicks for NPCs; for PCs the GM asks the
   * player out loud — the words were already spoken, only their MEANING is
   * being decided. Resolves to a TSL condition id, or null (accept).
   */
  static async promptHoldLine(targetActor, maneuver) {
    const statusLabel = SOCIAL_CONDITIONS[maneuver.applyOnSuccess]?.label ?? maneuver.applyOnSuccess;
    const pair = HOLD_LINE_CONDITIONS[maneuver.group] ?? HOLD_LINE_CONDITIONS.general;
    const condName = (id) => ({ smitten: "Smitten", angry: "Angry", scared: "Scared", guilty: "Guilty", hopeless: "Hopeless" }[id] ?? id);
    return new Promise(resolve => {
      new Dialog({
        title: `${targetActor.name} — hold the line?`,
        content: `<div class="tsl-rollmods">
          <p>The maneuver lands: <b>${targetActor.name}</b> would become <b>${statusLabel}</b> and lose Resolve.</p>
          <p class="notes">They may HOLD THE LINE instead — the words still cut, but they take an
          emotional Condition and refuse the effect. Four Conditions = Overwhelmed. Ask the table.</p>
        </div>`,
        buttons: {
          accept: { icon: '<i class="fas fa-check"></i>', label: `Accept ${statusLabel}`, callback: () => resolve(null) },
          holdA:  { icon: '<i class="fas fa-shield"></i>', label: `Hold — take ${condName(pair[0])}`, callback: () => resolve(pair[0]) },
          holdB:  { icon: '<i class="fas fa-shield"></i>', label: `Hold — take ${condName(pair[1])}`, callback: () => resolve(pair[1]) },
        },
        default: "accept",
        close: () => resolve(null),
      }).render(true);
    });
  }

  /** Shared-conflict bookkeeping that runs whatever the outcome was. */
  static async _afterOutcome(payload, encBefore) {
    const { sourceActorId, targetActorId, maneuverId, outcomeType, spentString } = payload;
    const targetActor = game.actors.get(targetActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);

    // ── Shared conflict integration: log + advance turn ──────────────────────
    const state = ConflictStore.state;
    if (!state?.active || state.resolved) return;
    const srcIdx = state.participants.findIndex(p => p.actorId === sourceActorId);
    const tgtP   = state.participants.find(p => p.actorId === targetActorId);
    if (srcIdx === -1 || !tgtP) return;

    const typeMap = { success: "hit", crit: "hit", failure: "miss", botch: "warn", immune: "warn" };
    const spendNote = spentString ? " (String spent)" : "";
    ConflictStore.addLog(
      `${state.participants[srcIdx].name} → ${tgtP.name}: ${maneuver.name}${spendNote} — ${outcomeType}`,
      typeMap[outcomeType] ?? "info"
    );

    // If this roll just decided the encounter, say so where everyone looks
    const encAfter = SocialEncounterManager.getEncounter(targetActor);
    if (!encBefore.outcome && encAfter.outcome === "swayed")
      ConflictStore.addLog(`💔 ${tgtP.name}'s resolve is broken — they are swayed.`, "kiss");
    else if (!encBefore.outcome && encAfter.outcome === "walked")
      ConflictStore.addLog(`🚪 ${tgtP.name} runs out of patience and walks away.`, "warn");

    // No turn advance — anyone acts from their own menu, whenever they like.
    ConflictStore._broadcast();
  }

  static async _postCard(d) {
    const esc  = foundry.utils.escapeHTML;
    const a    = d.assessment;
    const arch = game.user.isGM ? a.arch : null;
    const sign = a.skillMod >= 0 ? "+" : "";

    const bonusText = (d.stringBonus ? ` +${d.stringBonus} String` : "")
                    + (d.situational ? ` ${d.situational >= 0 ? "+" : "−"}${Math.abs(d.situational)} situational` : "")
                    + a.bonusReasons.map(b => {
                        // Don't solve the riddle in public: veil archetype-derived labels
                        const label = b.kind === "counter" ? "a hidden yielding" : b.label.split(" — ")[0];
                        return ` ${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${label}`;
                      }).join("");
    const kept = d.advantage ? Math.max(...d.rawDice)
               : d.disadvantage ? Math.min(...d.rawDice)
               : d.rawDice[0];
    const diceText = d.rawDice.length > 1
      ? `[${d.rawDice.join("] [")}] → ${kept} ${sign}${a.skillMod}${bonusText}${d.disadvantage ? " (dis)" : ""}`
      : `[${d.rawDice[0]}] ${sign}${a.skillMod}${bonusText}`;

    // Evidence without answers: the two dice already show the Advantage; the
    // reason lines must not name the archetype for everyone to read.
    const reasons = a.advantageReasons.map(r => {
      const veiled = a.relation === "vulnerable" && r === a.relationReason
        ? "You struck something raw — this approach truly works on them"
        : r;
      return `<div class="tsl-mv-reason">✦ ${esc(veiled)}</div>`;
    }).join("");

    // Never bake the archetype name into the shared card — even when the GM
    // rolls, players would read it. The GM has the participant badge for that.
    const archHtml = "";
    void arch;

    const badgeHtml = a.relation !== "neutral"
      ? `<span class="tsl-mv-badge tsl-mv-badge--${a.relation === "vulnerable" ? "vulnerable" : "immune"}">${a.relation === "vulnerable" ? "✦ Vulnerable" : "⚡ Walled"}</span>`
      : "";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: d.sourceActor }),
      content: `
<div class="tsl-maneuver-card tsl-mv--${d.outcomeType}">
  <div class="tsl-mv-header">
    <i class="fas ${d.maneuver.icon}"></i>
    <span class="tsl-mv-name">${esc(d.maneuver.name)}</span>
    ${badgeHtml}
  </div>
  <div class="tsl-mv-target">↳ ${esc(d.targetActor.name)}</div>
  ${archHtml}
  ${reasons}
  ${a.combo ? `<div class="tsl-mv-reason">◆ Combo — ${esc(a.combo.label)}</div>` : ""}
  <div class="tsl-mv-roll">
    <span class="tsl-mv-dice">${diceText}</span>
    <span class="tsl-mv-vs" data-tooltip="The difficulty stays with the GM — the card never shows it.">vs DC ?</span>
    <span class="tsl-mv-total tsl-mv-total--${d.outcomeType}">${d.total}</span>
  </div>
  <div class="tsl-mv-outcome tsl-mv-outcome--${d.outcomeType}">${esc(d.outcomeText)}</div>
</div>`,
      rolls: [d.roll],
    });
  }
}
