/**
 * tsl-social-conflict | social-archetypes.js
 *
 * Defines NPC Archetypes, decision vulnerabilities/immunities, and Active Effects
 * used by the Social Fencing encounter system.
 */

console.log("TSL | Loading social-archetypes.js...");

const SOCIAL_FENCING_SCOPE = "tsl-social-conflict";

/**
 * The Extended Triad — three drives that rule a personality.
 * Each character can lean into several triads (0–3), but their
 * Archetype is the dominant expression of one of them.
 */
const SOCIAL_TRIADS = {
  power: {
    id: "power",
    label: "Triad of Power",
    icon: "fa-chess-king",
    color: "#e8557a",
    hint: "Control, dominance, ambition. Tyrant · Machiavellian · Duelist. They respect strength and despise servility — flattery, bait and open challenge work; raw threats usually bounce. Counter cycle: Power breaks Emotion, but Reason binds Power.",
  },
  attention: {
    id: "attention",
    label: "Triad of Emotion",
    icon: "fa-heart",
    color: "#9b6ee8",
    hint: "Attention, affection, the need to be seen. Martyr · Exalted · Caretaker. Feed or starve their hunger for attention; cold logic slides right off them. Counter cycle: Emotion cracks Reason, but Power cows Emotion.",
  },
  order: {
    id: "order",
    label: "Triad of Reason",
    icon: "fa-scale-balanced",
    color: "#55b8e8",
    hint: "Rules, systems, certainty. Dogmatic · Hermit · Broker. Exploit contradictions, information and deals; naked emotion is noise to them. Counter cycle: Reason binds Power, but Emotion cracks Reason.",
  },
};

const SOCIAL_ARCHETYPES = [
  // ── Triad of Power ──────────────────────────────────────────────────────────
  {
    id: "tyrant",
    label: "Tyrant",
    triad: "power",
    vulnerabilities: ["appease", "flattery"],
    immunities: ["intimidate"],
    description: "Control-focused antagonist who resists force and bends only to praise.",
    hint: "Feed the ego, never confront it head-on. Flattery opens doors; threats slam them shut.",
    craves: "Control and visible submission",
    dreads: "Looking weak in front of others",
    tells: [
      "Commands the room and interrupts freely",
      "Punishes defiance, rewards loyalty",
      "Never admits fault in public",
    ],
  },
  {
    id: "machiavellian",
    label: "Machiavellian",
    triad: "power",
    vulnerabilities: ["deceive", "feigned weakness"],
    immunities: ["pure logic", "shameless"],
    description: "A covert manipulator who is vulnerable to subtle deception.",
    hint: "Let them think they're winning. Feigned weakness baits them; guilt and clean logic are games they've already won.",
    craves: "Leverage and hidden advantage",
    dreads: "Being outplayed at their own game",
    tells: [
      "Answers questions with questions",
      "Trades favors, never gives them",
      "Watches the exits and weighs everyone",
    ],
  },
  {
    id: "duelist",
    label: "Duelist",
    triad: "power",
    vulnerabilities: ["challenge", "glory"],
    immunities: ["scorn for weakness"],
    description: "A proud contender who must answer any worthy challenge — and despises cheap tricks.",
    hint: "Honor is the lever. A worthy challenge excites them; playing weak earns only contempt.",
    craves: "A worthy opponent and public glory",
    dreads: "Being dismissed as unworthy",
    tells: [
      "Takes every dare personally",
      "Keeps score of slights and victories",
      "Despises trickery, loves an audience",
    ],
  },

  // ── Triad of Emotion ────────────────────────────────────────────────────────
  {
    id: "martyr",
    label: "Martyr",
    triad: "attention",
    vulnerabilities: ["stone-walling", "ignore"],
    immunities: ["persuade", "sympathy"],
    description: "Seeks attention through suffering and recoils from sympathy.",
    hint: "Sympathy feeds the martyrdom. Starve them of attention — it is the only currency they fear losing.",
    craves: "Witnesses to their suffering",
    dreads: "An empty room, an unmoved face",
    tells: [
      "Recounts their sacrifices unprompted",
      "Refuses help but resents its absence",
      "Suffers loudly, forgives publicly",
    ],
  },
  {
    id: "exalted",
    label: "Exalted",
    triad: "attention",
    vulnerabilities: ["love bombing"],
    immunities: ["sow doubt", "criticism"],
    description: "Thrives on worship and resists attacks on their ego.",
    hint: "Worship works, criticism doesn't. They cannot resist adoration — or forgive doubt.",
    craves: "Worship and recognition",
    dreads: "Being outshone",
    tells: [
      "Collects admirers and titles",
      "Retells old triumphs at any excuse",
      "Takes critique as betrayal",
    ],
  },
  {
    id: "caretaker",
    label: "Caretaker",
    triad: "attention",
    vulnerabilities: ["guilt", "obligation"],
    immunities: ["selfless focus"],
    description: "Needs to be needed. Obligation and guilt move them; being ignored does not.",
    hint: "They need to be needed. Guilt and duty steer them; the cold shoulder means nothing to someone who gives, not takes.",
    craves: "Being needed",
    dreads: "A debt they cannot repay",
    tells: [
      "Feeds, mends and fixes before being asked",
      "Apologizes for other people's failings",
      "Cannot watch someone struggle alone",
    ],
  },

  // ── Triad of Reason ──────────────────────────────────────────────────────────
  {
    id: "dogmatic",
    label: "Dogmatic",
    triad: "order",
    vulnerabilities: ["gaslighting", "exploiting dogma"],
    immunities: ["bribes", "emotions"],
    description: "Trusts rules and ritual more than people, and can be shaken by contradiction.",
    hint: "Quote their own scripture back at them. Bribes and tears are just noise against doctrine.",
    craves: "Order upheld and confirmed",
    dreads: "A contradiction inside the doctrine",
    tells: [
      "Quotes rules, texts and precedents",
      "Distrusts exceptions and shortcuts",
      "Ritual first, reason second",
    ],
  },
  {
    id: "hermit",
    label: "Hermit",
    triad: "order",
    vulnerabilities: ["information deficit", "logic puzzles"],
    immunities: ["emotional intimidation"],
    description: "Withdrawn and wary, they can be drawn out by clever reasoning.",
    hint: "Bring puzzles, not pressure. They open up for knowledge and shut down for shouting.",
    craves: "Understanding, without exposure",
    dreads: "Being known while not knowing",
    tells: [
      "Speaks little, observes everything",
      "Answers only well-posed questions",
      "Guards knowledge like treasure",
    ],
  },
  {
    id: "broker",
    label: "Broker",
    triad: "order",
    vulnerabilities: ["deal", "greed"],
    immunities: ["ledger mind"],
    description: "A pragmatist who trusts contracts over feelings and weighs every word for profit.",
    hint: "Everything is a trade. Put a real offer on the table; sentiment discounts nothing.",
    craves: "Profitable terms, closed contracts",
    dreads: "A debt left unsettled in their books",
    tells: [
      "Reframes everything as a deal",
      "Names a price even for sentiment",
      "Keeps meticulous accounts",
    ],
  },
];

/**
 * Profiling points — the "main points" of a dossier.
 * Each has a play-facing hint shown as a tooltip.
 */
const PROFILE_POINTS = [
  {
    id: "desire",
    label: "Desire",
    icon: "fa-gem",
    placeholder: "What do they want above all?",
    hint: "What they want above all. Leverage (once per encounter): dangle it in a duel for Advantage and +1 extra Resolve damage on success.",
  },
  {
    id: "fear",
    label: "Fear",
    icon: "fa-ghost",
    placeholder: "What do they dread losing or facing?",
    hint: "What they dread losing or facing. Leverage (once per encounter): press it for +3 on the roll — but if you fail, the threat costs them 1 extra Patience.",
  },
  {
    id: "weakness",
    label: "Weakness",
    icon: "fa-heart-crack",
    placeholder: "Vice, blind spot, or a person they can't refuse…",
    hint: "A vice, blind spot, or person they can't refuse. Leverage (once per encounter): expose it to turn a neutral maneuver into a vulnerability strike.",
  },
  {
    id: "mask",
    label: "Mask",
    icon: "fa-masks-theater",
    placeholder: "How they present vs who they are…",
    hint: "The face they show the world — and what it hides. Strip the mask in public to shake their footing.",
  },
  {
    id: "line",
    label: "The Line",
    icon: "fa-hand",
    placeholder: "What will they never do?",
    hint: "What they will never do, no matter the price. Push them across it and the conversation is over — permanently.",
  },
];

/** Bond types for the Chronicle of Bonds, each with a table-facing hint. */
// `school` — the bond's passive: maneuvers of that school get +1 against this
// person (the relationship itself is a lever: hearts respond to hearts,
// rivalries to power plays, debts to bargains).
const BOND_TYPES = [
  { id: "stranger", label: "Stranger",  icon: "fa-circle-question", school: null,        hint: "Barely acquainted — everything is still to be written." },
  { id: "ally",     label: "Ally",      icon: "fa-handshake",       school: "order",     hint: "Shared cause. They'll take risks for you while your interests align. Passive: +1 on Reason maneuvers against them." },
  { id: "friend",   label: "Friend",    icon: "fa-mug-hot",         school: "attention", hint: "Genuine warmth. Easier to comfort, harder to deceive. Passive: +1 on Emotion maneuvers against them." },
  { id: "family",   label: "Family",    icon: "fa-house-chimney",   school: "attention", hint: "Blood or chosen. Guilt and obligation cut deepest here. Passive: +1 on Emotion maneuvers against them." },
  { id: "crush",    label: "Crush",     icon: "fa-heart-circle-exclamation", school: "attention", hint: "One-sided longing. Smitten comes easily; rejection stings twice. Passive: +1 on Emotion maneuvers against them." },
  { id: "lover",    label: "Lover",     icon: "fa-heart",           school: "attention", hint: "Hearts entangled. Finally Kiss can end a conflict; betrayal wounds double. Passive: +1 on Emotion maneuvers against them." },
  { id: "mentor",   label: "Mentor",    icon: "fa-graduation-cap",  school: "attention", hint: "They shaped you. Their approval still matters more than you admit. Passive: +1 on Emotion maneuvers against them." },
  { id: "protege",  label: "Protégé",   icon: "fa-seedling",        school: "attention", hint: "You shaped them. Responsibility pulls at you when they are threatened. Passive: +1 on Emotion maneuvers against them." },
  { id: "rival",    label: "Rival",     icon: "fa-khanda",          school: "power",     hint: "A respected opponent. Challenges and one-upmanship escalate fast. Passive: +1 on Power maneuvers against them." },
  { id: "enemy",    label: "Enemy",     icon: "fa-skull",           school: "power",     hint: "Open hostility. Every word is a weapon already drawn. Passive: +1 on Power maneuvers against them." },
  { id: "indebted", label: "Indebted",  icon: "fa-scale-unbalanced", school: "order",    hint: "You owe them. Leverage flows their way until the debt is paid. Passive: +1 on Reason maneuvers against them." },
  { id: "creditor", label: "Creditor",  icon: "fa-scale-unbalanced-flip", school: "order", hint: "They owe you — a String made formal. Call it in at the right moment. Passive: +1 on Reason maneuvers against them." },
];

/**
 * Social Fencing statuses. Applied as Active Effects; every one of them
 * has a real mechanical bite that assess()/rollManeuver() reads:
 *
 *   rattled   — DC to sway them drops by 5 (their guard is down). Lasts the scene.
 *   smitten   — the charmer's Persuasion maneuvers roll with Advantage. Lasts the scene.
 *   provoked  — one-shot: the NEXT maneuver against them gains +2, then fades.
 *   guilted   — one-shot: the guilter's next maneuver rolls with Advantage, then fades.
 *   desperate — one-shot: the next attention maneuver (Flatter, Charm)
 *               by anyone rolls with Advantage, then fades.
 *   defiant   — walls off ALL maneuvers for an hour. The price of hitting an immunity.
 *
 * oneShot statuses are consumed automatically by applyOutcome after the roll
 * they influenced.
 */
const SOCIAL_CONDITIONS = {
  // Icons are core Foundry status icons (icons/svg/*) — present in every install.
  // `combat` — the rider that matters if talk turns to steel: it goes into the
  // Active Effect's description so the debuff follows them into the fight.
  // `midiChanges` — automation for dnd5e tables running midi-qol (harmless
  // no-ops elsewhere).
  // `links` — matching SYSTEM status ids added to the effect's `statuses`,
  //   so a5e/dnd5e native condition automation (e.g. A5E's own Rattled)
  //   picks the status up as if applied from the core list.
  // `dnd5eChanges` — plain numeric Active Effect changes for dnd5e.
  // `a5eChanges` — Level Up (standalone a5e) changes via the system's own
  //   roll-mode flags (value 1 = advantage, −1 = disadvantage, mode OVERRIDE),
  //   the same encoding a5e's built-in conditions use.
  rattled: {
    id: "rattled",
    label: "Rattled",
    icon: "icons/svg/daze.svg",
    color: "#9b6ee8",
    seconds: 3600,
    oneShot: false,
    description: "Composure cracked: the DC to sway them is reduced by 5. No reactions or expertise dice.",
    combat: "Disadvantage on Wisdom saving throws; no reactions or expertise dice (A5E Rattled).",
    links: ["rattled"],
    midiChanges: [{ key: "flags.midi-qol.disadvantage.ability.save.wis", mode: 0, value: "1" }],
    a5eChanges: [{ key: "flags.a5e.effects.rollMode.abilitySave.wis", mode: 5, value: -1, priority: 50 }],
  },
  smitten: {
    id: "smitten",
    label: "Smitten",
    icon: "icons/svg/regen.svg",
    color: "#e8557a",
    seconds: 3600,
    oneShot: false,
    description: "Charmed: cannot act against the charmer, and the charmer's Persuasion maneuvers roll with Advantage.",
    combat: "Counts as charmed by them: they cannot attack the charmer, and the charmer has advantage on social checks against them (A5E Charmed).",
    links: ["charmed"],
  },
  provoked: {
    id: "provoked",
    label: "Provoked",
    icon: "icons/svg/fire.svg",
    color: "#e8a855",
    seconds: 600,
    oneShot: true,
    description: "Off balance with anger: the next maneuver against them gains +2, then this fades.",
    combat: "Reckless: −2 AC (on A5E, attacks against them have advantage). Must attack the provoker if able.",
    dnd5eChanges: [{ key: "system.attributes.ac.bonus", mode: 2, value: "-2" }],
    a5eChanges: [{ key: "flags.a5e.effects.grants.rollMode.attack.all", mode: 5, value: 1, priority: 50 }],
  },
  guilted: {
    id: "guilted",
    label: "Guilted",
    icon: "icons/svg/net.svg",
    color: "#c07ce8",
    seconds: 600,
    oneShot: true,
    description: "Weighed down by obligation: the guilter's next maneuver rolls with Advantage, then this fades.",
    combat: "The weight drags every swing: −2 on attack rolls (disadvantage on A5E).",
    dnd5eChanges: [
      { key: "system.bonuses.mwak.attack", mode: 2, value: "-2" },
      { key: "system.bonuses.rwak.attack", mode: 2, value: "-2" },
    ],
    a5eChanges: [{ key: "flags.a5e.effects.rollMode.attack.all", mode: 5, value: -1, priority: 50 }],
  },
  desperate: {
    id: "desperate",
    label: "Desperate",
    icon: "icons/svg/falling.svg",
    color: "#5588e8",
    seconds: 600,
    oneShot: true,
    description: "Starved of attention: the next Flatter or Charm against them rolls with Advantage, then this fades.",
    combat: "Disadvantage on Wisdom (Insight) checks; −2 on initiative.",
    dnd5eChanges: [{ key: "system.attributes.init.bonus", mode: 2, value: "-2" }],
    midiChanges: [{ key: "flags.midi-qol.disadvantage.skill.ins", mode: 0, value: "1" }],
    a5eChanges: [
      { key: "flags.a5e.effects.rollMode.skillCheck.ins", mode: 5, value: -1, priority: 50 },
      { key: "system.attributes.initiative.bonus", mode: 2, value: "-2" },
    ],
  },
  defiant: {
    id: "defiant",
    label: "Defiant",
    icon: "icons/svg/holy-shield.svg",
    color: "#e8c855",
    seconds: 600,
    oneShot: false,
    description: "Walls up: immune to social maneuvers (only Read Them slips through — and a successful read breaks the wall). Triggered by striking an archetype's immunity.",
    combat: "Dug in: advantage on Wisdom saving throws — charm and fear break against the wall.",
    midiChanges: [{ key: "flags.midi-qol.advantage.ability.save.wis", mode: 0, value: "1" }],
    a5eChanges: [{ key: "flags.a5e.effects.rollMode.abilitySave.wis", mode: 5, value: 1, priority: 50 }],
  },
};

/** Total Extended Triad points a character may distribute across the three triads. */
const TRIAD_POINT_POOL = 4;

/** Status ids in display order. */
const SOCIAL_CONDITION_ORDER = ["rattled", "smitten", "provoked", "guilted", "desperate", "defiant"];

class SocialArchetypeManager {
  static getFlagScope() {
    return SOCIAL_FENCING_SCOPE;
  }

  static getFlagKey() {
    return "socialFencing";
  }

  static getActorData(actor) {
    return actor?.getFlag(SocialArchetypeManager.getFlagScope(), SocialArchetypeManager.getFlagKey()) ?? {};
  }

  static async setActorData(actor, data) {
    if (!actor) return;
    const current = SocialArchetypeManager.getActorData(actor);
    await actor.setFlag(
      SocialArchetypeManager.getFlagScope(),
      SocialArchetypeManager.getFlagKey(),
      foundry.utils.mergeObject(current, data, { inplace: false })
    );
  }

  static getArchetypeById(id) {
    return SOCIAL_ARCHETYPES.find((archetype) => archetype.id === id) || null;
  }

  static getArchetype(actor) {
    const data = SocialArchetypeManager.getActorData(actor);
    return SocialArchetypeManager.getArchetypeById(data.archetypeId) || null;
  }

  static async setArchetype(actor, archetypeId) {
    const archetype = SocialArchetypeManager.getArchetypeById(archetypeId);
    if (!actor || !archetype) return;
    await SocialArchetypeManager.setActorData(actor, { archetypeId: archetype.id });
    return archetype;
  }

  static getCharacterNotes(actor) {
    const data = SocialArchetypeManager.getActorData(actor);
    return {
      archetypeId: data.archetypeId || null,
      motivation: data.motivation || "",
      personality: data.personality || "",
      psychotype: data.psychotype || "",
      notes: data.notes || "",
      triad: {
        power:     data.triad?.power     ?? 0,
        attention: data.triad?.attention ?? 0,
        order:     data.triad?.order     ?? 0,
      },
      points: Object.fromEntries(
        PROFILE_POINTS.map(p => [p.id, data.points?.[p.id] ?? ""])
      ),
    };
  }

  static async setCharacterNotes(actor, notes) {
    if (!actor) return;
    const payload = {
      archetypeId: notes.archetypeId || null,
      motivation: notes.motivation || "",
      personality: notes.personality || "",
      psychotype: notes.psychotype || "",
      notes: notes.notes || "",
    };
    if (notes.triad)  payload.triad  = notes.triad;
    if (notes.points) payload.points = notes.points;
    await SocialArchetypeManager.setActorData(actor, payload);
  }

  static getArchetypeOptions() {
    return SOCIAL_ARCHETYPES.map((arch) => ({ id: arch.id, label: arch.label, triad: arch.triad }));
  }

  static getBondType(id) {
    return BOND_TYPES.find(t => t.id === id) ?? BOND_TYPES[0];
  }

  static buildConditionEffect(conditionId, sourceActor = null) {
    const meta = SOCIAL_CONDITIONS[conditionId];
    if (!meta) return null;
    const sourceName = sourceActor?.name || "Social Fencing";

    // The combat rider travels with the effect — if talk turns to steel, the
    // debuff is already on the token. Numeric changes + midi flags automate
    // it on dnd5e; a5eChanges use Level Up's own roll-mode flags; `links`
    // hooks the system's own conditions (A5E Rattled, charmed) so native
    // automation treats it as the real thing.
    const description = meta.combat
      ? `${meta.description}<br><b>Combat:</b> ${meta.combat}`
      : meta.description;
    const changes = game.system.id === "dnd5e"
      ? foundry.utils.deepClone([...(meta.dnd5eChanges ?? []), ...(meta.midiChanges ?? [])])
      : game.system.id === "a5e"
        ? foundry.utils.deepClone(meta.a5eChanges ?? [])
        : [];

    return {
      name:  `${meta.label} (${sourceName})`,
      img:   meta.icon,
      icon:  meta.icon,
      origin: `module.${SocialArchetypeManager.getFlagScope()}`,
      disabled: false,
      duration: { seconds: meta.seconds ?? 3600 },
      statuses: [`tsl-${conditionId}`, ...(meta.links ?? [])],
      flags: {
        [SocialArchetypeManager.getFlagScope()]: {
          condition: conditionId,
          source: sourceName,
          sourceActorId: sourceActor?.id ?? null,
        },
      },
      changes,
      description,
    };
  }

  /** Apply a fencing status. No duplicates — re-applying refreshes the source. */
  static async applyCondition(actor, conditionId, sourceActor = null) {
    if (!actor) return;
    const existing = SocialArchetypeManager.getActiveCondition(actor, conditionId);
    if (existing) {
      // Refresh the source so combo checks (smitten/guilted) point at the newest actor
      if (sourceActor) {
        await existing.update({
          [`flags.${SocialArchetypeManager.getFlagScope()}.sourceActorId`]: sourceActor.id,
          [`flags.${SocialArchetypeManager.getFlagScope()}.source`]: sourceActor.name,
        });
      }
      return existing;
    }
    const effectData = SocialArchetypeManager.buildConditionEffect(conditionId, sourceActor);
    if (!effectData) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return effectData;
  }

  static async removeCondition(actor, conditionId) {
    if (!actor) return;
    // Match flag OR statuses set, like getActiveCondition — a status toggled
    // from the token HUD must be consumable/removable exactly like ours.
    const toRemove = actor.effects.filter((effect) =>
      effect.flags?.[SocialArchetypeManager.getFlagScope()]?.condition === conditionId
      || effect.statuses?.has?.(`tsl-${conditionId}`)
    );
    if (!toRemove.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map((e) => e.id));
  }

  /**
   * The ActiveEffect for a fencing status on this actor, or null.
   * Matches both module-applied effects (flag) and ones toggled from the
   * token HUD's main status list (statuses set `tsl-<id>`).
   */
  static getActiveCondition(actor, conditionId) {
    return actor?.effects.find(e =>
      !e.disabled && (
        e.flags?.[SocialArchetypeManager.getFlagScope()]?.condition === conditionId
        || e.statuses?.has?.(`tsl-${conditionId}`)
      )
    ) ?? null;
  }

  /** All active fencing statuses on this actor: [{ meta, effect, sourceActorId }]. */
  static getActiveConditions(actor) {
    if (!actor) return [];
    const scope = SocialArchetypeManager.getFlagScope();
    return SOCIAL_CONDITION_ORDER
      .map(id => {
        const effect = SocialArchetypeManager.getActiveCondition(actor, id);
        return effect
          ? { meta: SOCIAL_CONDITIONS[id], effect, sourceActorId: effect.flags?.[scope]?.sourceActorId ?? null }
          : null;
      })
      .filter(Boolean);
  }

  /**
   * Which maneuvers cut deep / bounce off for a given archetype — by NAME,
   * computed from the shared tag lists. This is the single source of truth
   * the UI uses to explain the archetype ↔ maneuver matrix.
   */
  static getManeuverRelationsFor(archetype) {
    if (!archetype || typeof SOCIAL_MANEUVERS === "undefined") return { vulnerable: [], immune: [] };
    return {
      vulnerable: SOCIAL_MANEUVERS.filter(m => m.vulnerabilityTags.some(t => archetype.vulnerabilities.includes(t))),
      immune:     SOCIAL_MANEUVERS.filter(m => m.immunityTags.some(t => archetype.immunities.includes(t))),
    };
  }

  /** Inverse lookup: which archetypes are vulnerable / immune to a maneuver. */
  static getArchetypeRelationsFor(maneuver) {
    return {
      vulnerable: SOCIAL_ARCHETYPES.filter(a => maneuver.vulnerabilityTags.some(t => a.vulnerabilities.includes(t))),
      immune:     SOCIAL_ARCHETYPES.filter(a => maneuver.immunityTags.some(t => a.immunities.includes(t))),
    };
  }

  /**
   * Extended Triad dots also sharpen the matching STANDARD skill checks:
   *   Power ● → Intimidation · Emotion ● → Insight · Order ● → Deception
   * Implemented as one module-managed Active Effect (+1 per dot on the
   * skill's check bonus), rebuilt whenever the dots change. PCs only —
   * NPCs have no dots. The aligned maneuver of your own school counting
   * the dot twice (skill bonus + school leaning) is intentional: that is
   * your signature move.
   */
  static async syncTriadBonusEffect(actor) {
    if (!actor) return;
    const scope = SocialArchetypeManager.getFlagScope();
    const stale = actor.effects.filter(e => e.flags?.[scope]?.triadBonus);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
    if (!actor.hasPlayerOwner) return;

    const TRIAD_SKILLS = {
      power:     { dnd5e: "itm", a5e: "intimidation", label: "Intimidation" },
      attention: { dnd5e: "ins", a5e: "insight",      label: "Insight" },
      order:     { dnd5e: "dec", a5e: "deception",    label: "Deception" },
    };
    const triad   = SocialArchetypeManager.getCharacterNotes(actor).triad ?? {};
    const isDnd5e = game.system.id === "dnd5e";
    const changes = [];
    const lines   = [];
    for (const [t, m] of Object.entries(TRIAD_SKILLS)) {
      const dots = triad[t] ?? 0;
      if (!dots) continue;
      const key = isDnd5e ? `system.skills.${m.dnd5e}.bonuses.check` : `system.skills.${m.a5e}.bonuses.check`;
      changes.push({ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: `+${dots}`, priority: 20 });
      lines.push(`+${dots} ${m.label}`);
    }
    if (!changes.length) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Social Leanings",
      img: "icons/svg/upgrade.svg",
      origin: `module.${scope}`,
      disabled: false,
      changes,
      description: `Extended Triad leanings sharpen everyday social checks: ${lines.join(", ")} (Power → Intimidation, Emotion → Insight, Order → Deception; +1 per dot).`,
      flags: { [scope]: { triadBonus: true } },
    }]);
  }
}
