/**
 * tsl-social-conflict | condition-effects.js
 *
 * Applies TSL conflict conditions as Active Effects on actors after a conflict ends.
 * Effects are removed on Short Rest (or Long Rest).
 * A5E: each condition also adds +1 Strife.
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
//   `leanIn`    — the refuel: give in to the urge at cost → a String (Inspiration
//                 for Hopeless). Playing your nature pays, VtM-style.
//   `clears`    — the DRAMATIC action that lifts it. Long rest is the slow
//                 fallback; short rests don't touch it.
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
    ultimate: { name: "Fury", text: "Spend 1 Willpower: an extra melee attack this turn, but −2 AC until your next turn." },
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
    ultimate: { name: "Adrenaline", text: "Spend 1 Willpower: Dash + Disengage as one action, and +2 AC (the body saves itself)." },
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
    ultimate: { name: "Nothing to Lose", text: "Spend 1 Willpower: advantage on everything this turn, ignoring danger and provocations; next turn you act at −2 (spent)." },
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
    ultimate: { name: "One-Track", text: "Spend 1 Willpower: advantage on any action for {source}'s sake this turn — but you do nothing else." },
    scar: "bound_heart",
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
    ultimate: { name: "Reckoning", text: "Spend 1 Willpower: this turn your damage to {source} is doubled, but you roll at disadvantage against everyone else." },
    scar: "vendetta",
    tiers: [
      { label: "Nettled", text: "Consumed by the grudge: −1 initiative & Perception; disadvantage to cooperate with or praise {source}.", dnd5e: [], a5e: [] },
      { label: "Vengeful", text: "−2 initiative & Perception; advantage on actions against {source}, disadvantage to work with them or let it go.", dnd5e: [], a5e: [] },
      { label: "Consumed", text: "−3 initiative & Perception; you'll sabotage your own side to land a blow on {source}. The GM plays it.", dnd5e: [], a5e: [] },
    ],
    leanIn: "Pursue your grudge at real cost → restore 1 Willpower.",
    clears: "Land a real blow on them, a genuine reconciliation, or consciously forgive.",
  },

  // ── The four Boons (positive emotions, Phase 2c). GM-given; `isBoon: true`.
  // They do NOT count toward Overwhelmed, don't compel or calcify. Each scales
  // by tier and its ●●● unlocks an ultimate (1 Willpower).
  valor: {
    label:  "Valor",
    icon:   "icons/svg/upgrade.svg",
    isBoon: true,
    signature: "Courage flares — you stand tall, and fear can't reach you.",
    ultimate: { name: "Heroic Surge", text: "Spend 1 Willpower: an extra action or attack this turn with advantage; allies within reach get +1." },
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
    ultimate: { name: "Shield Them", text: "Spend 1 Willpower: as a reaction, put yourself between {source} and a threat, with advantage." },
    tiers: [
      { label: "Warmed",     text: "+1 to any action to protect or aid {source}, and to saves while near them.", dnd5e: [], a5e: [] },
      { label: "Devoted",    text: "+2 to protect or aid {source}, and to saves near them.", dnd5e: [], a5e: [] },
      { label: "Unyielding", text: "+3 to protect or aid {source}; you'll take a blow meant for them without hesitation.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades if the bond breaks, or the moment that kindled it passes (GM).",
  },
  resolve: {
    label:  "Resolve",
    icon:   "icons/svg/statue.svg",
    isBoon: true,
    signature: "Centred and unshakeable — nothing moves you off your mark.",
    ultimate: { name: "Unbreakable", text: "Spend 1 Willpower: automatically succeed one saving throw vs fear, charm, or compulsion." },
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
    ultimate: { name: "Rally", text: "Spend 1 Willpower: allies who hear you gain advantage on their next roll." },
    tiers: [
      { label: "Heartened", text: "+1 to your ability and skill checks.", dnd5e: [], a5e: [] },
      { label: "Hopeful",   text: "+2 to your checks; an ally you encourage shrugs off Despair.", dnd5e: [], a5e: [] },
      { label: "Radiant",   text: "+3 to your checks; your hope spreads — nearby allies get +1 too.", dnd5e: [], a5e: [] },
    ],
    clears: "Fades when the darkness returns and the moment dims (GM).",
  },
};

// Spells/abilities that clear TSL conditions from their targets
const CLEARING_SPELLS = {
  "calm emotions":       ["obsessed", "angry", "scared"],
  "greater restoration": ["angry", "scared", "hopeless", "obsessed", "spiteful"],
  "remove curse":        ["spiteful", "hopeless"],
  "heroism":             ["scared"],
};

class TSLConditionEffects {

  /** The VtM-style dossier for a wound (urge / resist / leanIn / frenzy / clears). */
  static getMeta(condId) {
    return CONDITION_META[condId] ?? null;
  }

  /**
   * Give in to a Wound's compulsion (act on its Potyah at real cost) → refuel
   * 1 Willpower (the VtM loop: living your nature pays). The one exception is
   * despair/hopeless, whose lean-in feeds Inspiration instead (diffuse, not
   * tied to a person) — the caller grants that. Returns the new Willpower.
   */
  static async giveIn(actor, condId) {
    if (!actor || !CONDITION_META[condId] || typeof TSLWillpower === "undefined") return null;
    return TSLWillpower.restore(actor, 1);
  }

  /** Every wound id, in a stable order — for the token HUD registration. */
  static get ORDER() {
    return ["angry", "spiteful", "obsessed", "scared", "hopeless"];
  }

  /** Boon ids, in display order (the four positive emotions). */
  static get BOON_ORDER() {
    return ["valor", "devotion", "resolve", "hope"];
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
      await TSLConditionEffects._applyToParticipant(ps[i], sourceName);
    }
  }

  /** Apply conditions for a single participant who yielded mid-conflict. */
  static async applyYieldingParticipant(participant, state) {
    const others = state.participants.filter(p => p.actorId !== participant.actorId);
    const sourceName = others.length === 1 ? others[0].name : "Social Conflict";
    await TSLConditionEffects._applyToParticipant(participant, sourceName);
  }

  static async _applyToParticipant(participant, sourceName) {
    const actor = game.actors.get(participant.actorId);
    if (!actor) return;

    const activeConditions = Object.entries(participant.conditions)
      .filter(([_, on]) => on)
      .map(([id]) => id);

    if (!activeConditions.length) return;

    const effects = activeConditions.map(condId =>
      TSLConditionEffects._buildEffect(condId, sourceName, participant.actorId)
    );

    await actor.createEmbeddedDocuments("ActiveEffect", effects);

    // A5E: add Strife for each condition
    if (game.system.id === "a5e-for-dnd5e") {
      const currentStrife = actor.system?.attributes?.strife?.value ?? 0;
      await actor.update({
        "system.attributes.strife.value": currentStrife + activeConditions.length
      });
    }

    ui.notifications.info(
      `${participant.name} carries ${activeConditions.length} condition(s) from the conflict.`
    );
  }

  /**
   * Apply ONE TSL condition to an actor outside a conflict window — used by
   * "Hold the Line" (refusing a maneuver's effect at an emotional cost).
   * Skips silently if the same condition is already carried.
   * Returns how many TSL conditions the actor now carries (4+ = Overwhelmed).
   */
  static async applyOne(actor, condId, sourceName = "Social Fencing") {
    if (!actor || !CONDITION_META[condId]) return 0;
    const existing = actor.effects.find(e => TSLConditionEffects._condOf(e) === condId);
    if (existing) {
      // Pressed again → the wound DEEPENS (up to the breaking point) rather than
      // stacking a duplicate; refresh the source it ties you to.
      const cur = TSLConditionEffects._clampTier(existing.flags?.[TSL_EFFECT_FLAG]?.tier ?? 1);
      if (cur < 3) await TSLConditionEffects.setTier(actor, condId, cur + 1, sourceName);
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        TSLConditionEffects._buildEffect(condId, sourceName, actor.id, 1),
      ]);
    }
    return TSLConditionEffects.countConditions(actor);
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

  /** How many WOUNDS this actor carries (Overwhelmed at 4+). Boons don't count. */
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
    if (meta.ultimate)      lines.push(`<b>●●● ${sub(meta.ultimate.name)}:</b> ${sub(meta.ultimate.text)}`);
    if (!boon && meta.leanIn) lines.push(`<b>Give in:</b> ${sub(meta.leanIn)}`);
    if (meta.clears)        lines.push(`<b>${boon ? "Fades" : "Clears"}:</b> ${sub(meta.clears)}${boon ? "" : " (Or a long rest.)"}`);
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
  static async setTier(actor, condId, tier, sourceName) {
    if (!actor || !CONDITION_META[condId]) return;
    const t = TSLConditionEffects._clampTier(tier);
    const existing = actor.effects.find(x => TSLConditionEffects._condOf(x) === condId);
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        TSLConditionEffects._buildEffect(condId, sourceName ?? "Social Fencing", actor.id, t),
      ]);
      return;
    }
    const f    = existing.flags?.[TSL_EFFECT_FLAG] ?? {};
    const data = TSLConditionEffects._buildEffect(condId, sourceName ?? f.source ?? "them", f.sourceActorId ?? actor.id, t);
    await existing.update({
      name: data.name, description: data.description, changes: data.changes,
      [`flags.${TSL_EFFECT_FLAG}.tier`]: t,
    });
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

  static _buildEffect(condId, sourceName, actorId, tier = 1) {
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
          sourceActorId: actorId ?? null,
          tier:          t,
          restType:      "short",
        }
      },
      // Automation scales with the tier (empty at Light) — per system.
      changes: TSLConditionEffects._changesFor(td),
    };
  }

  // ── Rest hooks ────────────────────────────────────────────────────────────────

  static registerRestHooks() {
    // TSL-style: feelings do not clear on a SHORT rest — they clear when
    // lived out (the "Clears when" line) or, slowly, over a long rest.
    // A long rest also refreshes each ●●● bond's once-per-rest signature perk.
    const onLongRest = (actor) => {
      TSLConditionEffects._clearFromActor(actor);
      if (typeof TSLBondStore !== "undefined") TSLBondStore.clearSignatures?.(actor.id);
      if (typeof TSLWillpower !== "undefined") TSLWillpower.refresh(actor);   // Willpower back to full
    };
    // dnd5e
    Hooks.on("dnd5e.restCompleted", (actor, result) => {
      if (result.longRest) onLongRest(actor);
    });
    // A5E
    Hooks.on("a5e.actorRest", (actor, result) => {
      if (result?.restType === "long") onLongRest(actor);
      // A5E handles strife reduction itself on rest — no extra work needed
    });
  }

  static async _clearFromActor(actor) {
    const toDelete = actor.effects
      .filter(e => e.flags?.[TSL_EFFECT_FLAG]?.restType === "short")
      .map(e => e.id);

    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    }
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
    const toDelete = actor.effects
      .filter(e => {
        const flag = e.flags?.[TSL_EFFECT_FLAG]?.condition;
        return flag && conditionIds.includes(flag);
      })
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

// ─── Wound tracker — the ○○○ counter: 3 strikes and it calcifies to a Scar ──
// Per-wound occurrence count on the actor flag tsl-social-conflict.woundTrack
// ({ <woundId>: 0..3 }). A long rest eases the acute effect but NOT this count;
// a genuine heal RESETS it; reaching 3 means the Wound is ready to calcify.
const WOUND_CALCIFY_AT = 3;

class TSLWoundTracker {
  static all(actor) { return { ...(actor?.getFlag?.(WP_SCOPE, "woundTrack") ?? {}) }; }
  static get(actor, woundId) { return Math.max(0, (TSLWoundTracker.all(actor)[woundId] | 0)); }

  /** +by ticks (capped at the calcify threshold); returns the new count. */
  static async bump(actor, woundId, by = 1) {
    const t = TSLWoundTracker.all(actor);
    t[woundId] = Math.min(WOUND_CALCIFY_AT, Math.max(0, (t[woundId] | 0) + by));
    await actor?.setFlag?.(WP_SCOPE, "woundTrack", t);
    return t[woundId];
  }

  /** A genuine heal clears the strikes for this wound. */
  static async reset(actor, woundId) {
    const t = TSLWoundTracker.all(actor);
    if (woundId in t) { delete t[woundId]; await actor?.setFlag?.(WP_SCOPE, "woundTrack", t); }
  }

  static shouldCalcify(actor, woundId) { return TSLWoundTracker.get(actor, woundId) >= WOUND_CALCIFY_AT; }
}
