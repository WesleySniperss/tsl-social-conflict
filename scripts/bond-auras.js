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

const BOND_AURA_FLAG = "tsl-social-conflict";
const BOND_AURA_KEY  = "bondAura";

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

  /** Distance between two tokens in scene units (grid-aware, v13 measurePath). */
  static _distance(a, b) {
    try {
      const p = [{ x: a.center.x, y: a.center.y }, { x: b.center.x, y: b.center.y }];
      if (canvas.grid?.measurePath) return canvas.grid.measurePath(p).distance;
      const px = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      return (px / canvas.dimensions.size) * canvas.dimensions.distance;
    } catch { return Infinity; }
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
        img: "icons/svg/aura.svg",
        description, changes,
        flags: { [BOND_AURA_FLAG]: { [BOND_AURA_KEY]: true } },
      }]);
      return;
    }
    // Only write when something actually changed — token drags fire a lot.
    if (JSON.stringify(existing.changes ?? []) !== JSON.stringify(changes)
        || (existing.description ?? "") !== description) {
      await existing.update({ changes, description });
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
    // Editing a bond re-arms the aura without anyone having to move.
    Hooks.on("updateActor",  (a, chg) => { if (chg?.flags?.[BOND_AURA_FLAG]?.bonds) go(); });
    console.log("TSL | Bond auras registered");
  }
}
