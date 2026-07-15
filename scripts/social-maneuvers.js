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
    description:  "The jab. A joke with a razor in it — reliable, unremarkable, it simply cuts.",
    successText:  "The barb lands where it hurts. Resolve −1.",
    failText:     "The joke dies in the air. Patience −1.",
    immuneText:   "They cannot imagine being the punchline. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "instigate",
    name:  "Taunt",
    skill: "Intimidation",
    icon:  "fa-fire",
    group: "general",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
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
  },

  {
    id:    "cold_shoulder",
    name:  "Ignore Them",
    skill: "Insight",
    icon:  "fa-user-slash",
    group: "attention",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["stone-walling", "ignore"],   // Martyr → Advantage
    immunityTags:      ["selfless focus"],            // Caretaker
    description:  "Deny them the air they burn — attention. Watch the fire gutter and reach for you.",
    successText:  "Starved, they reach for any warmth — Desperate (the next Flatter or Charm against them gains Advantage). Resolve −1.",
    failText:     "Your silence doesn't touch them. Patience −1.",
    immuneText:   "They give attention rather than crave it — your silence changes nothing. Target becomes Defiant.",
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
  },
];

// ─── Roller ────────────────────────────────────────────────────────────────────

const STRING_SPEND_BONUS = 2;

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
      relationReason = "Defiant — walled off from maneuvers (Read Them still works)";
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
      // The triad counter cycle: the defender's ruling triad is soft against
      // the school that counters it (Power→Emotion→Order→Power)
      if (arch && TRIAD_COUNTERS[maneuver.group] === arch.triad) {
        const atkShort = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
        const defShort = (SOCIAL_TRIADS[arch.triad]?.label ?? "").replace("Triad of ", "");
        bonusReasons.push({ label: `${atkShort} counters ${defShort} — their kind bends to this school`, value: 2, kind: "counter" });
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

    const bonus = bonusReasons.reduce((s, b) => s + b.value, 0);
    return {
      arch, relation, relationReason,
      advantage, advantageReasons,
      bonus, bonusReasons,
      dc, dcBase, dcMods, skillMod, consumes, leverage,
    };
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
    const stringBonus = options.stringBonus ?? 0;
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
    const total    = roll.total;
    const isWalled = a.relation === "immune" || a.relation === "blocked";
    const success  = !isWalled && total >= a.dc;

    const outcomeType = isWalled ? "immune" : success ? "success" : "failure";
    const outcomeText =
      a.relation === "blocked" ? "They are Defiant — nothing gets through right now." :
      a.relation === "immune"  ? (maneuver.immuneText ?? "Target becomes Defiant.") :
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
      leverage:      a.leverage,
      total,
      dc: a.dc,
      spentString: stringBonus > 0,
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
    const { sourceActorId, targetActorId, maneuverId, outcomeType, relation, consumed, leverage, spentString } = payload;
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);
    if (!sourceActor || !targetActor || !maneuver) return;

    // No "Start Encounter" ceremony — the first maneuver against a target
    // brings its Resolve/Patience tracks to life from sheet defaults.
    await SocialEncounterManager.ensureActive(targetActor);
    const encBefore = SocialEncounterManager.getEncounter(targetActor);

    // One-shot statuses that influenced this roll burn away
    for (const condId of consumed ?? []) {
      await SocialArchetypeManager.removeCondition(targetActor, condId);
    }
    // A played leverage card is spent whatever the outcome — they heard the pitch
    if (leverage)
      await SocialEncounterManager.markLeverageUsed(targetActor, leverage);

    if (outcomeType === "immune") {
      // Archetype immunity raises the wall; an existing Defiant wall just wastes the attempt
      if (relation === "immune")
        await SocialArchetypeManager.applyCondition(targetActor, "defiant", sourceActor);
      await SocialEncounterManager.adjustPatience(targetActor, -1, sourceActorId);
    } else if (outcomeType === "success") {
      if (maneuver.applyOnSuccess)
        await SocialArchetypeManager.applyCondition(targetActor, maneuver.applyOnSuccess, sourceActor);
      if (maneuver.grantStrings > 0)
        await TSLStringStore.add(sourceActorId, targetActorId, maneuver.grantStrings);
      // A read never hands over the archetype — it whispers a TELL. The player
      // deduces the nature themselves and writes their guess into the Bond.
      if (maneuver.reveals)
        await SocialManeuverRoller.whisperTell(sourceActor, targetActor);
      // A vulnerability strike adds +1 to the maneuver's own damage profile
      let damage = (maneuver.resolveDamage ?? 1) + (relation === "vulnerable" ? 1 : 0);
      if (leverage === "desire") damage += 1;  // the offer does half the work
      if (damage > 0)
        await SocialEncounterManager.adjustResolve(targetActor, -damage, sourceActorId);
    } else {
      // Heavy plays (failPatience) and failed threats (fear) burn extra Patience
      const burn = (maneuver.failPatience ?? 1) + (leverage === "fear" ? 1 : 0);
      await SocialEncounterManager.adjustPatience(targetActor, -burn, sourceActorId);
    }

    // ── Shared conflict integration: log + advance turn ──────────────────────
    const state = ConflictStore.state;
    if (!state?.active || state.resolved) return;
    const srcIdx = state.participants.findIndex(p => p.actorId === sourceActorId);
    const tgtP   = state.participants.find(p => p.actorId === targetActorId);
    if (srcIdx === -1 || !tgtP) return;

    const typeMap = { success: "hit", failure: "miss", immune: "warn" };
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

    const dcModsText = a.dcMods.length
      ? ` <span class="tsl-mv-att" data-tooltip="${esc(a.dcMods.map(m => `${m.value > 0 ? "+" : ""}${m.value} ${m.label}`).join(", "))}">(${a.dcBase}${a.dcMods.map(m => `${m.value > 0 ? "+" : "−"}${Math.abs(m.value)}`).join("")})</span>`
      : "";

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
  <div class="tsl-mv-roll">
    <span class="tsl-mv-dice">${diceText}</span>
    <span class="tsl-mv-vs">vs DC ${a.dc}${dcModsText}</span>
    <span class="tsl-mv-total tsl-mv-total--${d.outcomeType}">${d.total}</span>
  </div>
  <div class="tsl-mv-outcome tsl-mv-outcome--${d.outcomeType}">${esc(d.outcomeText)}</div>
</div>`,
      rolls: [d.roll],
    });
  }
}
