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
  { id: "order",     label: "Triad of Order" },
];

// ─── Maneuver data ────────────────────────────────────────────────────────────
//
// vulnerabilityTags ∩ archetype.vulnerabilities → roll with Advantage, resolve −2
// immunityTags      ∩ archetype.immunities      → auto-fail, target Defiant
// reveals: true → success verifies the target's profile in the roller's Chronicle

const SOCIAL_MANEUVERS = [

  // ── General Tactics ─────────────────────────────────────────────────────────

  {
    id:    "cold_reading",
    name:  "Cold Reading",
    skill: "Insight",
    icon:  "fa-eye",
    group: "general",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "Read the NPC's emotional tells and body language.",
    successText:  "Archetype & Motivation revealed in your Chronicle. You gain 1 String on this NPC.",
    failText:     "You can't get a clear read. Patience reduced by 1.",
    immuneText:   null,
    applyOnSuccess: null,
    grantStrings: 1,
    reveals: true,
    resolveDamage: 0,
    worksThroughDefiant: true,
  },

  {
    id:    "sow_doubt",
    name:  "Sow Doubt",
    skill: "Deception",
    icon:  "fa-theater-masks",
    group: "general",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: [],
    immunityTags:      ["sow doubt", "criticism"],   // Exalted
    description:  "Plant a seed of uncertainty to rattle their composure.",
    successText:  "Target is Rattled: the DC to sway them drops by 5 for the scene.",
    failText:     "They see through you. Patience reduced by 1.",
    immuneText:   "Your words slide off them. Target becomes Defiant — immune to social maneuvers for 1 hour.",
    applyOnSuccess: "rattled",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "instigate",
    name:  "Instigate",
    skill: "Intimidation",
    icon:  "fa-fire",
    group: "general",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    vulnerabilityTags: [],
    immunityTags:      ["intimidate", "emotional intimidation"],  // Tyrant, Hermit
    description:  "Needle them until their temper slips.",
    successText:  "They lose their cool — Provoked: the next maneuver against them gains +2.",
    failText:     "They remain unmoved. Patience reduced by 1.",
    immuneText:   "They respond with cold control. Target becomes Defiant.",
    applyOnSuccess: "provoked",
    grantStrings: 0,
    resolveDamage: 1,
  },

  // ── Triad of Power ──────────────────────────────────────────────────────────

  {
    id:    "flatter",
    name:  "Flatter & Appease",
    skill: "Persuasion",
    icon:  "fa-crown",
    group: "power",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["appease", "flattery"],       // Tyrant → Advantage
    immunityTags:      [],
    description:  "Shower them with praise and submission.",
    successText:  "Target is Smitten: cannot act against you; your Persuasion maneuvers roll with Advantage.",
    failText:     "They see through your flattery. Patience reduced by 1.",
    immuneText:   null,
    applyOnSuccess: "smitten",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "feigned_weakness",
    name:  "Feigned Weakness",
    skill: "Deception",
    icon:  "fa-mask",
    group: "power",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["deceive", "feigned weakness"],  // Machiavellian → Advantage
    immunityTags:      ["scorn for weakness"],            // Duelist
    description:  "Pretend to be vulnerable to bait a manipulator.",
    successText:  "They take the bait. You gain 2 Strings on this NPC.",
    failText:     "They don't believe the act. Patience reduced by 1.",
    immuneText:   "Weakness earns only their contempt. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 2,
    resolveDamage: 1,
  },

  {
    id:    "throw_gauntlet",
    name:  "Throw the Gauntlet",
    skill: "Intimidation",
    icon:  "fa-khanda",
    group: "power",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    vulnerabilityTags: ["challenge", "glory"],            // Duelist → Advantage
    immunityTags:      ["emotional intimidation"],        // Hermit
    description:  "Dare them openly, before witnesses.",
    successText:  "Pride takes the bait — Provoked (+2 to the next maneuver against them). You gain 1 String.",
    failText:     "The dare hangs in the air, ignored. Patience reduced by 1.",
    immuneText:   "They walk away from the theatrics. Target becomes Defiant.",
    applyOnSuccess: "provoked",
    grantStrings: 1,
    resolveDamage: 1,
  },

  // ── Triad of Emotion ────────────────────────────────────────────────────────

  {
    id:    "love_bombing",
    name:  "Love Bombing",
    skill: "Performance",
    icon:  "fa-heart",
    group: "attention",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: ["love bombing"],              // Exalted → Advantage
    immunityTags:      ["persuade", "sympathy"],      // Martyr
    description:  "Overwhelm with attention and adoration.",
    successText:  "Target is Smitten: cannot act against you; your Persuasion maneuvers roll with Advantage.",
    failText:     "They are unimpressed by the display.",
    immuneText:   "Your sympathy deepens their contempt. Target becomes Defiant.",
    applyOnSuccess: "smitten",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "cold_shoulder",
    name:  "Cold Shoulder",
    skill: "Insight",
    icon:  "fa-user-slash",
    group: "attention",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["stone-walling", "ignore"],   // Martyr → Advantage
    immunityTags:      ["selfless focus"],            // Caretaker
    description:  "Deliberately ignore them, starving them of attention.",
    successText:  "They grow Desperate: the next Flatter or Love Bombing against them rolls with Advantage.",
    failText:     "Your silence doesn't unsettle them. Patience reduced by 1.",
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
    description:  "Invoke debts, promises, and what they owe.",
    successText:  "The weight lands — Guilted: your next maneuver against them rolls with Advantage.",
    failText:     "They shrug the weight off. Patience reduced by 1.",
    immuneText:   "Shame needs a conscience. Target becomes Defiant.",
    applyOnSuccess: "guilted",
    grantStrings: 0,
    resolveDamage: 1,
  },

  // ── Triad of Order ──────────────────────────────────────────────────────────

  {
    id:    "gaslight",
    name:  "Gaslight",
    skill: "Deception",
    icon:  "fa-brain",
    group: "order",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["gaslighting", "exploiting dogma"],  // Dogmatic → Advantage
    immunityTags:      ["ledger mind"],                       // Broker
    description:  "Make them question their own principles.",
    successText:  "Their worldview cracks — Rattled: the DC to sway them drops by 5 for the scene.",
    failText:     "Their conviction holds firm. Patience reduced by 1.",
    immuneText:   "Feelings aren't entries in their books. Target becomes Defiant.",
    applyOnSuccess: "rattled",
    grantStrings: 0,
    resolveDamage: 1,
  },

  {
    id:    "logic_exploit",
    name:  "Logic Exploit",
    skill: "Investigation",
    icon:  "fa-puzzle-piece",
    group: "order",
    skillKeys:       { dnd5e: "inv", "a5e-for-dnd5e": "investigation" },
    vulnerabilityTags: ["information deficit", "logic puzzles"],  // Hermit → Advantage
    immunityTags:      ["bribes", "emotions", "pure logic"],      // Dogmatic, Machiavellian
    description:  "Expose a gap in their reasoning or knowledge.",
    successText:  "The gap in their understanding is laid bare. Profile revealed, you gain 1 String.",
    failText:     "Your argument doesn't land. Patience reduced by 1.",
    immuneText:   "They dismiss the reasoning outright. Target becomes Defiant.",
    applyOnSuccess: null,
    grantStrings: 1,
    reveals: true,
    resolveDamage: 1,
  },

  {
    id:    "sweeten_deal",
    name:  "Sweeten the Deal",
    skill: "Persuasion",
    icon:  "fa-coins",
    group: "order",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["deal", "greed"],             // Broker → Advantage
    immunityTags:      ["bribes"],                    // Dogmatic
    description:  "Put a concrete offer on the table.",
    successText:  "Terms accepted in principle. You gain 2 Strings on this NPC.",
    failText:     "Your price is wrong. Patience reduced by 1.",
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
 *   Emotion cracks Order  (feelings undermine systems)
 *   Order binds Power     (contracts and logic tie the mighty down)
 * Maps maneuver group → the defender triad it counters.
 */
const TRIAD_COUNTERS = { power: "attention", attention: "order", order: "power" };

class SocialManeuverRoller {
  static getManeuver(id) {
    return SOCIAL_MANEUVERS.find(m => m.id === id) ?? null;
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
      const v = entry?.total ?? entry?.mod ?? entry?.value;
      if (typeof v === "number") return v;
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
    const sys  = actor.system ?? {};
    const wis  = sys.abilities?.wis?.mod ?? 0;
    let prof = sys.attributes?.prof;
    if (typeof prof !== "number") prof = prof?.value;
    if (typeof prof !== "number") {
      const tier = sys.details?.level ?? sys.details?.cr ?? 1;
      prof = 2 + Math.floor((Math.max(1, tier) - 1) / 4);
    }
    return Math.max(SocialManeuverRoller.getPassiveInsight(actor), 10 + wis + prof);
  }

  /** Returns "immune" | "vulnerable" | "neutral" (archetype only, no statuses). */
  static getRelation(targetActor, maneuver) {
    const arch = SocialArchetypeManager.getArchetype(targetActor);
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
    const arch     = SocialArchetypeManager.getArchetype(targetActor);
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
      relationReason = "Defiant — walled off from maneuvers (Cold Reading still works)";
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
      // The attacker's Extended Triad leanings shape their own attack style:
      // +1 per dot in the maneuver's triad; a triad with NO dots (while the
      // profile has some elsewhere) is foreign ground — −1. General tactics
      // are always neutral.
      if (maneuver.group !== "general") {
        const myTriad   = SocialArchetypeManager.getCharacterNotes(sourceActor).triad ?? {};
        const dots      = myTriad[maneuver.group] ?? 0;
        const totalDots = Object.values(myTriad).reduce((s, v) => s + (v || 0), 0);
        const short     = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
        if (dots > 0) {
          bonusReasons.push({ label: `${short} leaning ${"●".repeat(dots)}`, value: dots });
        } else if (totalDots > 0) {
          bonusReasons.push({ label: `Foreign ground — no ${short} leaning`, value: -1 });
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
   * Roll the maneuver and post the chat card. NO side effects here —
   * pass the returned payload to applyOutcome (GM) or the GM_ACTION relay.
   * options.stringBonus — +2 if the roller spent a String on this target.
   */
  static async rollManeuver(sourceActor, targetActor, maneuver, options = {}) {
    const stringBonus = options.stringBonus ?? 0;
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage: options.leverage ?? null });

    const mod     = a.skillMod + stringBonus + a.bonus;
    const formula = a.advantage ? `2d20kh1 + ${mod}` : `1d20 + ${mod}`;
    const roll    = new Roll(formula);
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
      stringBonus, total, outcomeType, outcomeText, assessment: a,
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
      await SocialEncounterManager.adjustPatience(targetActor, -1);
    } else if (outcomeType === "success") {
      if (maneuver.applyOnSuccess)
        await SocialArchetypeManager.applyCondition(targetActor, maneuver.applyOnSuccess, sourceActor);
      // A read pays its String only once — re-reading a known profile earns nothing
      const alreadyKnown = maneuver.reveals
        ? (TSLBondStore.find(sourceActorId, targetActorId)?.profileKnown ?? false)
        : false;
      if (maneuver.grantStrings > 0 && !alreadyKnown)
        await TSLStringStore.add(sourceActorId, targetActorId, maneuver.grantStrings);
      if (maneuver.reveals)
        await TSLBondStore.reveal(sourceActorId, targetActorId);
      let damage = relation === "vulnerable" ? 2 : (maneuver.resolveDamage ?? 1);
      if (leverage === "desire") damage += 1;  // the offer does half the work
      if (damage > 0)
        await SocialEncounterManager.adjustResolve(targetActor, -damage);
    } else {
      // Hard leverage cuts both ways: a failed threat burns extra Patience
      await SocialEncounterManager.adjustPatience(targetActor, leverage === "fear" ? -2 : -1);
    }

    // Fencing writes history: the outcome shifts how the target regards the winner
    const encAfterFx = SocialEncounterManager.getEncounter(targetActor);
    if (!encBefore.outcome && encAfterFx.outcome === "swayed")
      await TSLBondStore.shiftAttitude(targetActorId, sourceActorId, +1);
    else if (!encBefore.outcome && encAfterFx.outcome === "walked")
      await TSLBondStore.shiftAttitude(targetActorId, sourceActorId, -1);

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
                    + a.bonusReasons.map(b => ` ${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${b.label.split(" — ")[0]}`).join("");
    const diceText = a.advantage
      ? `[${d.rawDice[0]}] [${d.rawDice[1]}] → ${Math.max(...d.rawDice)} ${sign}${a.skillMod}${bonusText}`
      : `[${d.rawDice[0]}] ${sign}${a.skillMod}${bonusText}`;

    const dcModsText = a.dcMods.length
      ? ` <span class="tsl-mv-att" data-tooltip="${esc(a.dcMods.map(m => `${m.value > 0 ? "+" : ""}${m.value} ${m.label}`).join(", "))}">(${a.dcBase}${a.dcMods.map(m => `${m.value > 0 ? "+" : "−"}${Math.abs(m.value)}`).join("")})</span>`
      : "";

    const reasons = a.advantageReasons.map(r => `<div class="tsl-mv-reason">✦ ${esc(r)}</div>`).join("");

    const archHtml = arch
      ? `<div class="tsl-mv-archetype">${esc(arch.label)} — ${esc(arch.hint ?? "")}</div>`
      : "";

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
