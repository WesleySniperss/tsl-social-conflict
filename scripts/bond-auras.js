/**
 * tsl-social-conflict | bond-auras.js
 *
 * Bonds reach past the conversation. Standing near someone you have a bond
 * with changes how you FIGHT — the people you love steady your hand, the ones
 * you hate pull you out of position.
 *
 * Foundry's Active Effects are flat and global: there is no native "while
 * within 30 ft of X" key. So proximity is resolved here — the GM client
 * recomputes who is in reach and rebuilds ONE module-managed effect per actor.
 *
 * Two auras, scaled by the bond's strength (+1, or +2 at ●●●):
 *   guard — a bond that steadies you (ally/friend/family/crush/lover/mentor/
 *           protégé/debtor/creditor): +N to saving throws.
 *   press — a bond that pulls you in (rival/enemy): +N to weapon attacks and
 *           −1 AC. You reach for them and leave yourself open.
 *
 * System coverage: saves and AC are numeric on BOTH dnd5e and a5e. dnd5e also
 * takes a numeric weapon-attack bonus; a5e has no actor-level numeric attack
 * key (`system.bonuses.attacks` is a collection of formula objects, not a
 * number), so on a5e the attack line is rules text — the same compromise the
 * module already makes for Desperate's crit range.
 */

console.log("TSL | Loading bond-auras.js...");

const BOND_AURA_FLAG   = "tsl-social-conflict";
const BOND_AURA_KEY    = "bondAura";
// Shown on the token as a status icon, but never registered in
// CONFIG.statusEffects — so it can't be toggled by hand from the token HUD.
const BOND_AURA_STATUS = "tsl-bond-aura";
const BOND_AURA_IMG    = "icons/svg/aura.svg";

class TSLBondAuras {

  /** Aura reach in scene distance units. 0 disables the whole feature. */
  static range() {
    try { return Number(game.settings.get("tsl-social-conflict", "bondAuraRange") ?? 15); }
    catch { return 15; }
  }

  /** A bond that runs all the way (●●●) hits harder than a passing one. */
  static _magnitude(strength) { return strength >= 3 ? 2 : 1; }

  /** The four attack types a5e wants listed explicitly (empty ≠ "all"). */
  static get A5E_ATTACK_TYPES() {
    return ["meleeWeaponAttack", "rangedWeaponAttack", "meleeSpellAttack", "rangedSpellAttack"];
  }

  /**
   * a5e carries attack/damage/initiative bonuses as records under
   * `system.bonuses.*`, not as plain numbers — but the system registers
   * `flags.a5e.effects.bonuses.<kind>` as a CUSTOM-mode effect key whose value
   * is the bonus object as JSON, and rewrites it into a record entry itself.
   * That is how a5e's own content does it (e.g. Inspiring Charge), so our
   * bonus lands in the system's real formulas and its roll dialog.
   */
  static _a5eBonus(kind, label, n) {
    const body = {
      label,
      formula: `${n}`,
      context: { attackTypes: TSLBondAuras.A5E_ATTACK_TYPES, spellLevels: [], requiresProficiency: false },
      default: true,
      img: "icons/svg/aura.svg",
    };
    if (kind === "damage") {
      body.damageType = "";
      body.context = { attackTypes: TSLBondAuras.A5E_ATTACK_TYPES, damageTypes: [], isCritBonus: false, spellLevels: [] };
    }
    if (kind === "initiative") body.context = { spellLevels: [], requiresProficiency: false };
    return {
      key: `flags.a5e.effects.bonuses.${kind === "attack" ? "attacks" : kind}`,
      mode: 0,                       // CUSTOM — a5e parses the JSON itself
      value: JSON.stringify(body),
      priority: 20,
    };
  }

  /**
   * Distance between two tokens in scene units. Tries the grid-aware
   * measurePath first, but NEVER lets an API surprise silently disable the
   * whole feature — anything unexpected falls through to pixel math, and only
   * a genuinely unusable canvas returns Infinity.
   */
  static _distance(a, b) {
    const A = a.center ?? { x: a.x, y: a.y };
    const B = b.center ?? { x: b.x, y: b.y };
    try {
      const r = canvas.grid?.measurePath?.([{ x: A.x, y: A.y }, { x: B.x, y: B.y }]);
      const d = typeof r === "number" ? r : r?.distance;
      if (Number.isFinite(d)) return d;
    } catch { /* fall through to pixel math */ }
    const size = canvas.dimensions?.size, unit = canvas.dimensions?.distance;
    if (!size || !unit) return Infinity;
    return (Math.hypot(A.x - B.x, A.y - B.y) / size) * unit;
  }

  /**
   * Turn a summed aura tally { attack, damage, save, check, ac, init } into
   * real AE changes for the current system. Saves, checks and AC are plain
   * numbers on both systems; attack/damage/initiative are numbers on dnd5e
   * and JSON bonus records on a5e.
   */
  static _changes(tally, label) {
    const isA5e = game.system.id === "a5e";
    const out   = [];
    const num   = (key, v) => out.push({ key, mode: 2, value: `${v > 0 ? "+" : ""}${v}`, priority: 20 });

    if (tally.save)  num("system.bonuses.abilities.save",  tally.save);
    if (tally.check) num("system.bonuses.abilities.check", tally.check);
    if (tally.ac)    num(isA5e ? "system.attributes.ac.changes.bonuses.value" : "system.attributes.ac.bonus", tally.ac);

    if (tally.attack) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("attack", label, tally.attack));
      else { num("system.bonuses.mwak.attack", tally.attack); num("system.bonuses.rwak.attack", tally.attack); }
    }
    if (tally.damage) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("damage", label, tally.damage));
      else { num("system.bonuses.mwak.damage", tally.damage); num("system.bonuses.rwak.damage", tally.damage); }
    }
    if (tally.init) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("initiative", label, tally.init));
      else num("system.attributes.init.bonus", tally.init);
    }
    return out;
  }

  /** Plain-language line per lever, for the effect description. */
  static _describe(tally) {
    const bits = [];
    const sign = (v) => `${v > 0 ? "+" : ""}${v}`;
    if (tally.attack) bits.push(`${sign(tally.attack)} to attack rolls`);
    if (tally.damage) bits.push(`${sign(tally.damage)} to weapon damage`);
    if (tally.save)   bits.push(`${sign(tally.save)} to saving throws`);
    if (tally.check)  bits.push(`${sign(tally.check)} to ability checks`);
    if (tally.ac)     bits.push(`${sign(tally.ac)} AC`);
    if (tally.init)   bits.push(`${sign(tally.init)} to initiative`);
    return bits.join(" · ");
  }

  /**
   * Recompute every token's bond aura on the current scene. GM only — the
   * effects are shared state, so exactly one client may write them.
   */
  static async refresh() {
    if (!game.user?.isGM || !canvas?.ready) return;
    const range  = TSLBondAuras.range();
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor);

    for (const tok of tokens) {
      const actor = tok.actor;
      const tally = { attack: 0, damage: 0, save: 0, check: 0, ac: 0, init: 0 };
      const lines = [];

      if (range > 0) {
        for (const bond of TSLBondStore.getList(actor.id)) {
          const aura = SocialArchetypeManager.getBondType(bond.type)?.combatAura;
          if (!aura) continue;
          const str = TSLBondStore.getStrength(actor.id, bond.targetActorId);
          if (str <= 0) continue;
          // Any token of that person within reach counts.
          const near = tokens.some(o => o !== tok && o.actor?.id === bond.targetActorId
            && TSLBondAuras._distance(tok, o) <= range);
          if (!near) continue;

          const n    = TSLBondAuras._magnitude(str);
          const each = {};
          for (const [lever, mult] of Object.entries(aura)) {
            if (lever === "label") continue;
            each[lever] = mult * n;
            tally[lever] = (tally[lever] ?? 0) + mult * n;
          }
          const name = game.actors.get(bond.targetActorId)?.name ?? "someone";
          lines.push(`<b>${aura.label}</b> — ${name} (${"●".repeat(str)}): ${TSLBondAuras._describe(each)}`);
        }
      }
      // Several bonds in reach can pile up; keep any one lever sane.
      for (const k of Object.keys(tally)) tally[k] = Math.max(-2, Math.min(2, tally[k]));
      await TSLBondAuras._apply(actor, tally, lines);
    }
  }

  /** Create / update / remove the single module-managed aura effect. */
  static async _apply(actor, tally, lines) {
    const existing = actor.effects.find(e => e.flags?.[BOND_AURA_FLAG]?.[BOND_AURA_KEY]);

    if (!Object.values(tally).some(v => v)) {
      if (existing) await existing.delete();
      return;
    }

    const changes = TSLBondAuras._changes(tally, "Bonds in reach (Social)");
    const description = `${lines.join("<br>")}<br><b>In total:</b> ${TSLBondAuras._describe(tally)}`;

    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Bonds in reach (Social)",
        img: BOND_AURA_IMG,
        description, changes,
        // Carrying a status id makes the effect TEMPORARY, so Foundry paints
        // its icon on the token. The id is deliberately NOT registered in
        // CONFIG.statusEffects, so it never shows in the token HUD's palette:
        // this is a state the world puts you in, not a toggle anyone flips.
        statuses: [BOND_AURA_STATUS],
        flags: { [BOND_AURA_FLAG]: { [BOND_AURA_KEY]: true } },
      }]);
      return;
    }
    // Only write when something actually changed — token drags fire a lot.
    // (An effect from before the icon existed gets the status added here.)
    const hasStatus = existing.statuses?.has?.(BOND_AURA_STATUS)
      ?? (existing.statuses ?? []).includes?.(BOND_AURA_STATUS);
    if (JSON.stringify(existing.changes ?? []) !== JSON.stringify(changes)
        || (existing.description ?? "") !== description || !hasStatus) {
      const patch = { changes, description };
      if (!hasStatus) { patch.statuses = [BOND_AURA_STATUS]; patch.img = BOND_AURA_IMG; }
      await existing.update(patch);
    }
  }

  /** Wire the recompute to everything that can change who stands where. */
  static register() {
    const go = foundry.utils?.debounce
      ? foundry.utils.debounce(() => TSLBondAuras.refresh(), 200)
      : () => TSLBondAuras.refresh();

    Hooks.on("canvasReady",  go);
    Hooks.on("createToken",  go);
    Hooks.on("deleteToken",  go);
    Hooks.on("updateToken",  (doc, chg) => { if ("x" in chg || "y" in chg) go(); });
    // Editing a bond (type, strength — anything of ours) re-arms the aura
    // without anyone having to move a token.
    Hooks.on("updateActor",  (a, chg) => { if (chg?.flags?.[BOND_AURA_FLAG]) go(); });

    // `ready` fires AFTER `canvasReady` on world load, so the hook above will
    // not fire again on its own — do the first pass now or nothing appears
    // until someone happens to drag a token.
    go();
    console.log("TSL | Bond auras registered");
  }

  /**
   * Why is there no aura? Answers it in the console instead of leaving the GM
   * guessing: `TSLBondAuras.explain()` (or explain(token)).
   */
  static explain(token = canvas.tokens?.controlled?.[0]) {
    if (!token?.actor) return console.log("TSL auras | select a token first");
    const range  = TSLBondAuras.range();
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor);
    console.log(`TSL auras | ${token.actor.name} — reach ${range} ft${range ? "" : " (DISABLED: set bondAuraRange above 0)"}`);
    const bonds = TSLBondStore.getList(token.actor.id);
    if (!bonds.length) return console.log("TSL auras | this actor has no bonds recorded");
    for (const b of bonds) {
      const meta = SocialArchetypeManager.getBondType(b.type);
      const str  = TSLBondStore.getStrength(token.actor.id, b.targetActorId);
      const other = tokens.filter(o => o !== token && o.actor?.id === b.targetActorId);
      const dist = other.length ? Math.min(...other.map(o => TSLBondAuras._distance(token, o))) : null;
      console.log(`TSL auras | ${game.actors.get(b.targetActorId)?.name ?? b.targetActorId}:`,
        `type=${b.type}${meta?.combatAura ? "" : " (NO AURA — Stranger has none)"}`,
        `strength=${str}${str ? "" : " (0 ● — no effect)"}`,
        other.length ? `nearest token ${Math.round(dist)} ft ${dist <= range ? "IN REACH" : "out of reach"}`
                     : "no token of theirs on this scene");
    }
  }
}
