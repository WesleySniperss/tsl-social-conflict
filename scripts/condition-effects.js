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
    ultimate: { name: "Reckoning", text: "Spend 1 Willpower: this turn your damage to {source} is doubled, but you roll at disadvantage against everyone else." },
    bond: "enemy",
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
  // id stays `resolve` (saved effects use it) — the LABEL is Conviction so it
  // never reads like the Resolve track.
  resolve: {
    label:  "Conviction",
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

// ─── Scars — permanent character states a Wound calcifies into (Phase: Scars).
// Not tiered, not cleared by rest; only the `clears` arc lifts one. Each keys
// back to the Wound it comes `from` (having the Scar makes you immune to that
// Wound). Some carry an active `ultimate` (1 Willpower). Bite is mostly rules
// text for now (target-conditional); the auto-apply engine formalizes it later.
const SCAR_META = {
  cruelty: {
    label: "Cruelty", icon: "icons/svg/blood.svg", from: "angry",
    ability: "+2 Intimidation; your social strikes land +1 harder.",
    ultimate: { name: "Berserk", text: "Spend 1 Willpower: one of your attacks this turn auto-crits, and you resist the damage of one attack against you." },
    cost: "−2 Persuasion, Deception & Insight — people sense the cruelty in you.",
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
    ability: "+2 to saving throws vs fear and charm — you feel less.",
    cost: "−2 Insight (empathy) & Persuasion (warmth); you can't raise a bond above ●●.",
    clears: "Someone breaks through the ice — a bond deepened to ●●●.",
  },
  hollow: {
    label: "The Hollow", icon: "icons/svg/degen.svg", from: "hopeless",
    ability: "Immune to fear and charm — nothing reaches you.",
    cost: "Nothing reaches you — not even hope: you gain no benefit from Inspiration, and −1 to all checks.",
    clears: "Someone restores your sense of meaning (a speech, a bond).",
  },
};
// Scars are about YOU (what a Wound made of you); Wounds about a PERSON become bonds.
const SCAR_ORDER = ["cruelty", "cold", "hollow"];

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

  static _buildScarEffect(scarId) {
    const m = SCAR_META[scarId];
    return {
      name: m.label,
      img: m.icon, icon: m.icon,
      origin: TSL_EFFECT_FLAG,
      description: TSLConditionEffects.scarDossier(scarId),
      statuses: [`tsl-scar-${scarId}`],
      flags: { [TSL_EFFECT_FLAG]: { scar: scarId } },
      changes: [],   // automation is a later pass — the bite is rules text for now
      // NO duration/restType: Scars are permanent (only the `clears` arc lifts one).
    };
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

    const activeConditions = Object.entries(participant.conditions)
      .filter(([id, on]) => on && CONDITION_META[id])
      .map(([id]) => id);

    if (!activeConditions.length) return;

    // A card pip already put its Wound on the actor the moment it was toggled
    // (ConflictStore.toggleCondition → applyOne) — only add what's missing, or
    // every carried Wound would end the conflict duplicated.
    for (const condId of activeConditions) {
      if (!TSLConditionEffects.hasCondition(actor, condId))
        await TSLConditionEffects.applyOne(actor, condId, sourceName, sourceId);
    }

    // A5E (system id "a5e"): +1 Strife for each Wound carried out of the
    // conflict. Strife is a plain number at system.attributes.strife.
    if (game.system.id === "a5e") {
      const cur = Number(foundry.utils.getProperty(actor, "system.attributes.strife")) || 0;
      await actor.update({ "system.attributes.strife": cur + activeConditions.length });
    }

    ui.notifications.info(
      `${participant.name} carries ${activeConditions.length} Wound(s) out of the conflict.`
    );
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
   * can't parry and can't hold the line — they must yield or flee.
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
