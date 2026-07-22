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
    skill2:          "Investigation",
    skillKeys2:      { dnd5e: "inv", "a5e-for-dnd5e": "investigation" },
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
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
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
    skill2:          "Intimidation",
    skillKeys2:      { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
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
    skill2:          "Deception",
    skillKeys2:      { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["appease", "flattery"],       // Tyrant → Advantage
    immunityTags:      [],
    description:  "Hold up the reflection they wish were true. Power through worship — they kneel to their own image.",
    successText:  "They fall for their own reflection — Enthralled (cannot act against you; your Persuasion maneuvers gain Advantage). Resolve −1.",
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
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
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
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
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
    skill2:          "Persuasion",
    skillKeys2:      { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["love bombing"],              // Exalted → Advantage
    immunityTags:      ["persuade", "sympathy"],      // Martyr
    description:  "Lay siege with sweetness. Adoration as a weapon — they open the gates themselves.",
    successText:  "The gates open — Enthralled (cannot act against you; your Persuasion maneuvers gain Advantage). They confide: you gain 1 String.",
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
    skill2:          "Deception",
    skillKeys2:      { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["stone-walling", "ignore"],   // Martyr → Advantage
    immunityTags:      ["selfless focus"],            // Caretaker
    description:  "Warmth, aimed anywhere but at them. Make it clear you're wanted elsewhere — praise a rival present OR conjure one who isn't ('others would leap at this'), hint you're spoiled for choice. The rival can be real or invented; what bites is the fear of losing you to someone. They chase what they think they're losing.",
    successText:  "The thought of someone else in your favor gnaws at them. They talk faster, lean closer, work to win you back — Desperate (the next Flatter or Charm against them gains Advantage). Resolve −1.",
    failText:     "They call the bluff — they don't believe in your other admirers. Patience −1.",
    immuneText:   "They'd rather you gave the attention to someone who needs it. Target becomes Defiant.",
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
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
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
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
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
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
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
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
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
// near miss. Earned by OPENING UP at the table and by breaking through a
// target's Resolve. It gives NO passive edge — it is only ever SPENT (the
// post-miss gamble, or the anytime 🎭+5 on any roll against that person).
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

/**
 * THE CIRCULATION — emotional WOUNDS (TSL Conditions) are open doors for
 * matching maneuvers: +2, NOT consumed (wounds clear through drama, not use).
 * This closes the loop TSL-style: Speak from the Heart / Hold the Line
 * inflict Conditions → Conditions open doors for the fencing → landed
 * maneuvers force new Hold-the-Line choices → new wounds, new doors.
 * Which wound you take when holding the line decides which doors open on you.
 */
const CONDITION_OPENINGS = {
  instigate:      { angry:    "their temper is already lit" },
  throw_gauntlet: { angry:    "their temper is already lit" },
  flatter:        { smitten:  "their heart is already open" },
  love_bombing:   { smitten:  "their heart is already open", hopeless: "in the dark, any warmth will do" },
  guilt_trip:     { guilty:   "their guilt spills into every answer" },
  logic_exploit:  { guilty:   "their guilt spills into every answer" },
  gaslight:       { scared:   "their fear makes every doubt land" },
  sow_doubt:      { scared:   "their fear makes every doubt land" },
  sweeten_deal:   { hopeless: "in the dark, any offer glows" },
};

/** First open wound on the target that this maneuver can walk through. */
function findOpening(targetActor, maneuver) {
  if (typeof TSLConditionEffects === "undefined") return null;
  for (const [condId, flavor] of Object.entries(CONDITION_OPENINGS[maneuver.id] ?? {})) {
    if (TSLConditionEffects.hasCondition(targetActor, condId)) return { cond: condId, flavor };
  }
  return null;
}

class SocialManeuverRoller {
  static getManeuver(id) {
    return SOCIAL_MANEUVERS.find(m => m.id === id) ?? null;
  }

  /**
   * A small key for the corner marks on maneuver chips. The GM sees the
   * archetype ones (◎/✕/▲); everyone sees ⊕ (it reads off visible statuses).
   */
  static chipLegend(isGM) {
    const items = isGM
      ? [
          "<b>◎</b> their weak spot — cuts deep (Advantage, +1 damage)",
          "<b>✕</b> bounces off / they're walled",
          "<b>▲</b> their nature yields to this school (+2)",
          "<b>⊕</b> an opening is live — a condition on them makes this maneuver stronger (a status you set up, or a lasting emotional wound they carry)",
        ]
      : [
          "<b>⊕</b> an opening is live — a condition on them makes this maneuver stronger (a status you set up, or a lasting emotional wound they carry)",
        ];
    return `<div class="tsl-chip-legend">${items.join("<br>")}</div>`;
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

  /** The modifier for a skillKeys map on this actor (0 if none resolves). */
  static _modForKeys(actor, skillKeys) {
    if (!skillKeys) return 0;
    // Try the system-native key first, then the other systems' keys —
    // and read whichever numeric field the system actually computes.
    const keys = [...new Set([
      skillKeys[game.system.id],
      skillKeys["a5e-for-dnd5e"],
      skillKeys["dnd5e"],
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

  /** The PRIMARY skill modifier (the d20 roll's own skill). */
  static getSkillMod(actor, maneuver) {
    return SocialManeuverRoller._modForKeys(actor, maneuver.skillKeys);
  }

  /** The SECONDARY skill modifier — added as a bonus on top (0 if none). */
  static getSkillMod2(actor, maneuver) {
    return SocialManeuverRoller._modForKeys(actor, maneuver.skillKeys2);
  }

  static getPassiveInsight(actor) {
    const skills = actor.system?.skills ?? {};
    const ins = skills.ins ?? skills.insight;
    if (typeof ins?.passive === "number") return ins.passive;
    const v = ins?.total ?? ins?.mod ?? ins?.value;
    return 10 + (typeof v === "number" ? v : 0);
  }

  /**
   * Social DC — the target defends with TWO mental stats, mirroring the
   * attacker's two skills: 10 + WIS mod + INT mod + proficiency, or passive
   * Insight when that's higher (Insight experts keep their edge). WIS is
   * their read/willpower, INT their refusal to be fooled — a clever target
   * resists on both axes; a dim one folds. Proficiency falls back to level/CR
   * math when the system doesn't expose it.
   */
  static getSocialDC(actor) {
    const wis = actor.system?.abilities?.wis?.mod ?? 0;
    const int = actor.system?.abilities?.int?.mod ?? 0;
    return Math.max(
      SocialManeuverRoller.getPassiveInsight(actor),
      10 + wis + int + SocialManeuverRoller.getProfBonus(actor)
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

    // ── DC: 10 + WIS + INT + proficiency (or passive Insight), ± bond/Rattled ──
    const dcBase = SocialManeuverRoller.getSocialDC(targetActor);
    const dcMods = [];
    // THEIR bond toward you is their guard: type × strength decides whether
    // the door stands open (friend/lover/debt: DC −strength) or barred
    // (enemy: DC +strength — you can't charm hatred).
    const theirBond = TSLBondStore.find(targetActor.id, sourceActor.id);
    if (theirBond) {
      const meta = SocialArchetypeManager.getBondType(theirBond.type);
      const str  = TSLBondStore.getStrength(targetActor.id, sourceActor.id);
      const dcFx = (meta?.guardDc ?? 0) * str;
      if (dcFx) {
        dcMods.push({
          label: dcFx < 0
            ? `their guard is down for you — ${meta.label} ${"●".repeat(str)}`
            : `they are wary of you — ${meta.label} ${"●".repeat(str)}`,
          value: dcFx,
        });
      }
    }
    if (cond("rattled")) dcMods.push({ label: "Rattled", value: -5 });
    // (Strings give no passive DC change — they are only ever spent, never held for an edge.)
    // A wearing conversation hardens people: past half Patience the door is closing
    const enc = SocialEncounterManager.getEncounter(targetActor);
    const patienceThin = enc.active && enc.patience <= Math.floor(enc.maxPatience / 2);
    const lastExchange = enc.active && enc.patience === 1;
    if (patienceThin) dcMods.push({ label: "their patience wears thin", value: 1 });
    // (No "home ground" DC bump: a school pressed against its OWN school is
    //  even — 0. A defender's nature instead defends through the rock-paper-
    //  scissors of schools below: +2 for you, −2, or nothing.)
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
      relationReason = "You are Enthralled by them — you cannot bring yourself to move against them";
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
    let   opening          = null;
    let   advantage        = relation === "vulnerable";
    if (advantage) advantageReasons.push(relationReason);

    if (relation !== "blocked" && relation !== "immune") {
      // Two skills, always: the maneuver rolls its PRIMARY on the d20, and its
      // SECONDARY skill's modifier rides on top as a flat bonus (Read Them is
      // Insight + Investigation, etc). Shown plainly — it's the actor's own skill.
      if (maneuver.skill2) {
        const s2 = SocialManeuverRoller.getSkillMod2(sourceActor, maneuver);
        if (s2) bonusReasons.push({ label: `${maneuver.skill2} (support skill)`, value: s2 });
      }
      if (leverage === "desire" && !advantage) {
        advantage = true;
        advantageReasons.push("Dangling their Desire — the offer speaks for you");
      }
      if (leverage === "fear") {
        bonusReasons.push({ label: "Pressing their Fear", value: 3 });
      }
      if (!advantage && maneuver.skill === "Persuasion" && condBy("smitten")) {
        advantage = true;
        advantageReasons.push("Enthralled by you — Persuasion flows easy");
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
      // Open wounds: a matching TSL Condition is a door standing open — +2,
      // never consumed (wounds clear through drama, not through use)
      opening = findOpening(targetActor, maneuver);
      if (opening) {
        const condLabel = { smitten: "Smitten", angry: "Angry", scared: "Scared", guilty: "Guilty", hopeless: "Hopeless" }[opening.cond] ?? opening.cond;
        bonusReasons.push({ label: `opening — they're ${condLabel} (${opening.flavor})`, value: 2 });
      }
      // Rock-paper-scissors of schools against the defender's ruling nature:
      // the SAME school is even (0); the school that COUNTERS their nature gets
      // +2; the school their nature COUNTERS takes −2. (Power breaks Emotion
      // breaks Reason breaks Power.) Works on archetypes AND on dots-built
      // defenders with a ruling triad; General tactics are always neutral.
      if (defTriad && maneuver.group !== "general") {
        const atkShort = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
        const defShort = (SOCIAL_TRIADS[defTriad]?.label ?? "").replace("Triad of ", "");
        if (TRIAD_COUNTERS[maneuver.group] === defTriad) {
          bonusReasons.push({ label: `${atkShort} counters ${defShort} — their nature bends to this school`, value: 2, kind: "counter" });
        } else if (TRIAD_COUNTERS[defTriad] === maneuver.group) {
          bonusReasons.push({ label: `${defShort} counters ${atkShort} — their nature resists this school`, value: -2, kind: "countered" });
        }
        // same school → nothing: even ground
      }
      // A dots-built defender's BLIND side: a school they never learned
      // (0 dots while invested elsewhere) finds nothing guarding the door
      if (defProfile && defProfile.total > 0 && maneuver.group !== "general"
          && (defProfile.dots[maneuver.group] ?? 0) === 0) {
        bonusReasons.push({ label: "an unguarded approach — nothing in them answers this school", value: 1 });
      }
      // Strings give NO passive edge — they are a resource you SPEND (+5 on any
      // roll against this person), never a standing buff. See applyOutcome for
      // how they're earned: breaking through someone's Resolve wins you a thread.
      // YOUR bond toward them is your weapon: its school gets +STRENGTH
      // (hearts respond to hearts, rivalries to power plays, debts to bargains)
      const myBond = TSLBondStore.find(sourceActor.id, targetActor.id);
      const bondMeta = myBond ? SocialArchetypeManager.getBondType(myBond.type) : null;
      const myStr = TSLBondStore.getStrength(sourceActor.id, targetActor.id);
      if (bondMeta?.school && bondMeta.school === maneuver.group && myStr > 0) {
        bonusReasons.push({ label: `Bond: ${bondMeta.label} ${"●".repeat(myStr)} — this approach runs deep between you`, value: myStr });
      }
      // What this KIND of relationship does to the SKILL you're rolling — the
      // reason the type matters and isn't just its school. Every type gives an
      // edge and a cost: you can't threaten a friend, can't lie to your own
      // blood, can't sweet-talk hatred. Scales with the bond's strength.
      const skillFx = (bondMeta?.skills ?? {})[maneuver.skill] ?? 0;
      if (skillFx && myStr > 0) {
        // Scales with the bond's strength, but capped at ±3 so a strong bond
        // with a −2 skill can't reach an absurd −6.
        const val = Math.max(-3, Math.min(3, skillFx * myStr));
        bonusReasons.push({
          label: `${bondMeta.label} ${"●".repeat(myStr)} — ${val > 0 ? "your bond sharpens" : "your bond blunts"} ${maneuver.skill}`,
          value: val,
        });
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
      bonus, bonusReasons, combo, kick, opening, answerRisk,
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
   * Plain-language, VEILED breakdown of what a maneuver does against THIS
   * target right now — for the chip tooltips once a target is picked. Follows
   * the viewer's read (truth for the GM, the guess for a player) and never
   * leaks the archetype name or the DC. Returns an array of short lines.
   */
  static describeVsTarget(sourceActor, targetActor, maneuver, dispArch, isGM) {
    // The GM assesses on the TRUTH and sees everything; a player never sees
    // the archetype weak/strong analysis at all — only what they themselves
    // bring and what's plainly visible (statuses, wounds). Nature is deduced
    // from OUTCOMES, not read off a tooltip.
    // ...unless the GM has OPENED this nature to the table — then the read is
    // public and everyone sees the analysis (the DC number still stays GM-only).
    const seeArch = isGM || SocialArchetypeManager.isRevealed(targetActor);
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver,
      { archetypeOverride: seeArch ? undefined : null });
    const out = [];

    // Relation — hidden, EXCEPT a live Defiant wall (that's a visible status)
    if (a.relation === "blocked")           out.push("✕ Walled off right now — nothing gets through");
    else if (seeArch && a.relation === "immune")     out.push("✕ Bounces off them — auto-fails, they turn Defiant");
    else if (seeArch && a.relation === "vulnerable") out.push("◎ Cuts deep here — Advantage & +1 Resolve damage");

    // Opening from a set-up status (observable — safe for players)
    if (a.combo) {
      const st  = SOCIAL_CONDITIONS[a.combo.status]?.label ?? a.combo.status;
      const pay = [a.combo.resolveDamage ? `+${a.combo.resolveDamage} damage` : null,
                   a.combo.strings ? `+${a.combo.strings} String` : null].filter(Boolean).join(", ");
      out.push(`⊕ Opening — they're ${st}${pay ? `: ${pay}` : ""}`);
    }
    if (a.opening) out.push(`⊕ Opening — +2 (${a.opening.flavor})`);
    if (a.kick)    out.push("⊕ Opening — they have a status: +1 Resolve damage");

    // Flat bonuses. Archetype/defense-derived ones (counter, blind side) are
    // GM-only; the player's OWN bonuses (skill, bond, leaning) always show.
    for (const b of a.bonusReasons) {
      if (b.kind === "counter")   { if (seeArch) out.push(`▲ Their nature bends to this school — +${b.value}`); continue; }
      if (b.kind === "countered") { if (seeArch) out.push(`▽ Their nature resists this school — ${b.value}`); continue; }
      if (/unguarded approach/i.test(b.label)) { if (seeArch) out.push(`+${b.value} an unguarded approach`); continue; }
      const sign = b.value >= 0 ? "+" : "−";
      out.push(`${sign}${Math.abs(b.value)} ${b.label.split(" — ")[0]}`);
    }
    // Advantage sources that aren't the (GM-only) relation itself — these are
    // observable statuses/leverage, safe to show either way.
    for (const r of a.advantageReasons) {
      if (r === a.relationReason) continue;
      out.push(`ADV — ${r}`);
    }
    // The GM alone sees the difficulty math
    if (isGM) for (const m of a.dcMods) out.push(`DC ${m.value > 0 ? "+" : "−"}${Math.abs(m.value)} · ${m.label}`);

    if (!out.length) out.push("No special interaction you can see — read them by rolling.");
    return out;
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
  /**
   * Should this actor's maneuvers roll through the SYSTEM's own skill-check
   * dialog (A5E: advantage, expertise dice, situational mods) instead of the
   * module's plain d20 + prompt? World setting; needs the system API.
   */
  static usesSystemDialog(actor) {
    try {
      return game.settings.get("tsl-social-conflict", "useSystemRollDialog")
        && typeof actor?.rollSkillCheck === "function";
    } catch { return false; }
  }

  static async rollManeuver(sourceActor, targetActor, maneuver, options = {}) {
    let stringBonus   = options.stringBonus ?? 0;
    const situational = options.situational ?? 0;
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage: options.leverage ?? null });

    // Advantage from the situation + the dialog; dis + adv cancel out (5e rules)
    let wantAdv = a.advantage || options.mode === "adv";
    let wantDis = options.mode === "dis";

    let roll, rawDice, total;
    let systemRoll = false;
    if (SocialManeuverRoller.usesSystemDialog(sourceActor)) {
      // The SYSTEM rolls the skill (its dialog owns advantage/expertise/
      // situational); our fencing extras ride along as a pre-filled
      // situational modifier. Outcome vs the hidden DC stays ours.
      systemRoll = true;
      const key   = maneuver.skillKeys?.dnd5e;   // a5e uses the same 3-letter keys
      const extra = stringBonus + a.bonus + situational;
      const advMode = a.advantage && !wantDis ? (CONFIG.A5E?.ROLL_MODE?.ADVANTAGE ?? 1) : undefined;
      const msg = await sourceActor.rollSkillCheck(key, {
        situationalMods: extra ? `${extra >= 0 ? "+" : ""}${extra}` : "",
        ...(advMode !== undefined ? { rollMode: advMode } : {}),
      });
      roll = msg?.rolls?.[0] ?? null;
      if (!roll) return null;                    // dialog cancelled — nothing spent
      total    = roll.total;
      rawDice  = roll.dice?.[0]?.results?.map(r => r.result) ?? [];
      wantAdv  = rawDice.length > 1;             // display only — the system already resolved it
      wantDis  = false;
    } else {
      const die = wantAdv && wantDis ? "1d20" : wantAdv ? "2d20kh1" : wantDis ? "2d20kl1" : "1d20";
      const mod = a.skillMod + stringBonus + a.bonus + situational;
      roll = new Roll(`${die} + ${mod}`);
      await roll.evaluate();
      rawDice = roll.dice[0].results.map(r => r.result);
      total   = roll.total;
    }

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

    // The card is NOT posted here — it is posted by the GM in applyOutcome,
    // AFTER the GM confirms the outcome (so the shared card always reflects
    // the GM's final ruling, never a proposed result the GM then overrode).
    // The acting client still gets its instant dice overlay from the payload.
    return {
      sourceActorId: sourceActor.id,
      targetActorId: targetActor.id,
      maneuverId:    maneuver.id,
      outcomeType,                               // the DICE's verdict — the GM may adjust
      relation:      a.relation,
      consumed:      isWalled ? [] : a.consumes,
      combo:         isWalled ? null : a.combo,
      leverage:      a.leverage,
      total,
      dc: a.dc,
      spentString: stringBonus > 0,
      spentStringPostRoll,
      // ── card payload (rebuilt & posted on the GM client) ──
      card: {
        rawDice, systemRoll,
        stringBonus, situational,
        advantage: wantAdv && !wantDis,
        disadvantage: wantDis && !wantAdv,
        rollData: systemRoll ? null : roll.toJSON(),
      },
    };
  }

  /**
   * The GM's final word: after the dice, confirm the grade against the hidden
   * DC (proposed result pre-selected). GM CLIENT ONLY; resolves to a grade
   * ("crit"|"success"|"failure"|"botch"). Skipped (returns proposed) when the
   * setting is off or the outcome is deterministic (walled).
   */
  static async promptOutcome(sourceActor, targetActor, maneuver, total, dc, proposed) {
    let on = true;
    try { on = game.settings.get("tsl-social-conflict", "gmDecidesOutcome") !== false; } catch {}
    if (!on || proposed === "immune") return proposed;
    const esc = foundry.utils.escapeHTML;
    const margin = total - dc;
    return new Promise(resolve => {
      new Dialog({
        title: `${sourceActor.name} → ${targetActor.name}: ${maneuver.name}`,
        content: `<div class="tsl-rollmods">
          <p>Total <b>${total}</b> vs DC <b>${dc}</b> — margin <b>${margin >= 0 ? "+" : ""}${margin}</b>.</p>
          <p class="notes">You have the final word on whether it lands. The computed grade is pre-selected.</p>
        </div>`,
        buttons: {
          crit:    { label: "★ Clean hit", callback: () => resolve("crit") },
          success: { label: "✓ Success",   callback: () => resolve("success") },
          failure: { label: "✗ Failure",   callback: () => resolve("failure") },
          botch:   { label: "⚔ They answer", callback: () => resolve("botch") },
        },
        default: proposed,
        close: () => resolve(proposed),
      }).render(true);
    });
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
    // The deepest pool of all — Read Them is cast most, so it draws from the
    // 20-per-archetype whisper set (falling back to the old tells/craves/dreads
    // if a custom archetype has no pool).
    const tell = arch ? SocialArchetypeManager.pickTell(arch.id) : null;
    const fallback = arch
      ? [...(arch.tells ?? []), `They seem to crave: ${arch.craves ?? "?"}`, `They seem to dread: ${arch.dreads ?? "?"}`]
      : null;
    const line = tell ?? (fallback?.length ? fallback[Math.floor(Math.random() * fallback.length)] : null);
    const text = line
      ? `🔍 Reading ${esc(targetActor.name)}: <i>“${esc(line)}”</i><br><span class="tsl-mv-target">Deduce their nature and note your guess in your Bond (“Read as”).</span>`
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
    const { sourceActorId, targetActorId, maneuverId, relation, consumed, combo, leverage, spentString } = payload;
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);
    if (!sourceActor || !targetActor || !maneuver) return;

    // No "Start Encounter" ceremony — the first maneuver against a target
    // brings its Resolve/Patience tracks to life from sheet defaults.
    await SocialEncounterManager.ensureActive(targetActor);
    const encBefore = SocialEncounterManager.getEncounter(targetActor);

    // The GM has the final word: confirm the grade against the hidden DC
    // (the dice's verdict is pre-selected). Deterministic walls skip this.
    let outcomeType = payload.outcomeType;
    if (relation !== "immune" && relation !== "blocked") {
      outcomeType = await SocialManeuverRoller.promptOutcome(
        sourceActor, targetActor, maneuver, payload.total, payload.dc, payload.outcomeType);
    }
    payload.outcomeType = outcomeType;   // keep the shared log in sync

    // Post the shared card NOW (GM side), reflecting the GM's final ruling —
    // built from the truth-side assessment, before any one-shot burns away.
    if (payload.card) {
      const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage });
      const outcomeText =
        relation === "blocked" ? "They are Defiant — only Read Them gets through, and a successful read breaks the wall." :
        relation === "immune"  ? (maneuver.immuneText ?? "Target becomes Defiant.") :
        outcomeType === "crit"    ? `Clean through the guard. ${maneuver.successText}` :
        outcomeType === "botch"   ? `${maneuver.failText} The opening is yours no longer — they answer.` :
        (outcomeType === "success") ? maneuver.successText : maneuver.failText;
      // A landed blow shows WHO you hit: a veiled archetype reaction (evidence,
      // never a name). Skipped for Read Them — its clue is the private whisper.
      const reaction = (!maneuver.reveals && (outcomeType === "success" || outcomeType === "crit"))
        ? SocialArchetypeManager.pickReaction(SocialArchetypeManager.getArchetype(targetActor)?.id)
        : null;
      await SocialManeuverRoller._postCard({
        sourceActor, targetActor, maneuver, assessment: a, reaction,
        total: payload.total, outcomeType, outcomeText,
        rawDice: payload.card.rawDice, systemRoll: payload.card.systemRoll,
        stringBonus: payload.card.stringBonus, situational: payload.card.situational,
        advantage: payload.card.advantage, disadvantage: payload.card.disadvantage,
        roll: payload.card.rollData ? Roll.fromData(payload.card.rollData) : null,
      });
    }

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
      // Breaking through their social health (Resolve) wins you a thread — a
      // String. This is the fencing earn, alongside baring your heart in play.
      // It does NOT stack with a maneuver whose own fiction already hands you a
      // String (Play Weak, Charm, reads, cashed combos) — those keep their grant.
      const earnedByDesign = (maneuver.grantStrings ?? 0) + (combo?.strings ?? 0);
      if (damage > 0 && earnedByDesign === 0) {
        await TSLStringStore.add(sourceActorId, targetActorId, 1);
        const escS = foundry.utils.escapeHTML;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
          content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">🧵 Through their guard — <b>${escS(sourceActor.name)}</b> gains a String on ${escS(targetActor.name)}.</div></div>`,
        });
      }
      // The cost of closeness: turning POWER on someone you love wounds YOU.
      // Your own bond type decides — and the Guilt opens doors against you.
      const myBond2 = TSLBondStore.find(sourceActorId, targetActorId);
      const myMeta2 = myBond2 ? SocialArchetypeManager.getBondType(myBond2.type) : null;
      if (maneuver.group === "power" && myMeta2?.guilt
          && typeof TSLConditionEffects !== "undefined"
          && !TSLConditionEffects.hasCondition(sourceActor, "guilty")) {
        await TSLConditionEffects.applyOne(sourceActor, "guilty", targetActor.name);
        const esc2 = foundry.utils.escapeHTML;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
          content: `<div class="tsl-maneuver-card tsl-mv--immune"><div class="tsl-mv-outcome tsl-mv-outcome--immune">💔 It worked — and it cost: turning power on ${esc2(targetActor.name)} leaves <b>${esc2(sourceActor.name)} Guilty</b>.</div></div>`,
        });
      }
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
                        // Don't solve the riddle in public: veil archetype-derived
                        // labels, and keep card labels SHORT (no parentheticals)
                        const label = b.kind === "counter"   ? "a hidden yielding"
                          : b.kind === "countered" ? "a hidden resistance"
                          : b.label.split(" — ")[0].replace(/\s*\(.+\)\s*$/, "");
                        return ` ${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${label}`;
                      }).join("");
    const kept = d.advantage ? Math.max(...d.rawDice)
               : d.disadvantage ? Math.min(...d.rawDice)
               : d.rawDice[0];
    // A system-dialog roll already carries its own breakdown in the system's
    // card — ours just shows the dice and what the module added on top.
    const diceText = d.systemRoll
      ? `[${d.rawDice.join("] [")}] — system check${d.stringBonus ? ` +${d.stringBonus} String` : ""}`
      : d.rawDice.length > 1
        ? `[${d.rawDice.join("] [")}] → ${kept} ${sign}${a.skillMod}${bonusText}${d.disadvantage ? " (dis)" : ""}`
        : `[${d.rawDice[0]}] ${sign}${a.skillMod}${bonusText}`;

    // Evidence without answers: the two dice already show the Advantage; the
    // reason lines must not name the archetype for everyone to read.
    const reasons = a.advantageReasons.map(r => {
      const veiled = a.relation === "vulnerable" && r === a.relationReason
        ? "You struck something raw — this approach truly works on them"
        : r;
      return `<div class="tsl-mv-reason">◎ ${esc(veiled)}</div>`;
    }).join("");

    // Never bake the archetype name into the shared card — even when the GM
    // rolls, players would read it. The GM has the participant badge for that.
    const archHtml = "";
    void arch;

    const badgeHtml = a.relation !== "neutral"
      ? `<span class="tsl-mv-badge tsl-mv-badge--${a.relation === "vulnerable" ? "vulnerable" : "immune"}">${a.relation === "vulnerable" ? "◎ Vulnerable" : "✕ Walled"}</span>`
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
  ${a.combo ? `<div class="tsl-mv-reason">⊕ Opening — ${esc(a.combo.label)}</div>` : ""}
  <div class="tsl-mv-roll">
    <span class="tsl-mv-dice">${diceText}</span>
    <span class="tsl-mv-vs" data-tooltip="The difficulty stays with the GM — the card never shows it.">vs DC ?</span>
    <span class="tsl-mv-total tsl-mv-total--${d.outcomeType}">${d.total}</span>
  </div>
  <div class="tsl-mv-outcome tsl-mv-outcome--${d.outcomeType}">${esc(d.outcomeText)}</div>
  ${d.reaction ? `<div class="tsl-mv-tell">${esc(d.reaction)}</div>` : ""}
</div>`,
      // A system roll already lives in the system's own message — re-attaching
      // it here would fire dice animations twice
      rolls: d.systemRoll ? [] : [d.roll],
    });
  }
}
