/**
 * tsl-social-conflict | bond-auras.js
 *
 * Bonds reach past the conversation. Standing near someone you have a bond
 * with changes how you FIGHT — the people you love steady your hand, the ones
 * you hate pull you out of position.
 *
 * Foundry's Active Effects are flat and global: there is no native "while
 * within X ft of Y" key. So proximity is resolved here — the GM client
 * recomputes who is in reach and rebuilds ONE module-managed effect per actor.
 *
 * Every bond TYPE has its own aura (`BOND_TYPES[*].combatAura`) across six
 * levers — attack, damage, save, check, ac, init — at ±1, doubled at ●●●.
 * Auras from several bonds in reach sum, then each lever clamps to ±2.
 *
 * System coverage: saves, checks and AC are plain numbers on BOTH dnd5e and
 * a5e. Attack/damage/initiative are numbers on dnd5e; on a5e they live in
 * RecordFields that a flat change cannot fill, so we go through the system's
 * own CUSTOM-mode keys (`flags.a5e.effects.bonuses.*`) with the bonus encoded
 * as JSON — see _a5eBonus(). That lands in a5e's real formulas and dialog.
 *
 * The effect carries `statuses: ["tsl-bond-aura"]` so Foundry paints an icon
 * on the token, but that id is NOT in CONFIG.statusEffects, so it can never be
 * toggled by hand from the token HUD.
 *
 * If nothing appears: TSLBondAuras.selfTest() in the console explains why.
 */

console.log("TSL | Loading bond-auras.js...");

const BOND_AURA_FLAG   = "tsl-social-conflict";
const BOND_AURA_KEY    = "bondAura";
// Shown on the token as a status icon, but never registered in
// CONFIG.statusEffects — so it can't be toggled by hand from the token HUD.
const BOND_AURA_STATUS = "tsl-bond-aura";
const BOND_AURA_IMG    = "icons/svg/aura.svg";
const A5E_ABILITIES    = ["str", "dex", "con", "int", "wis", "cha"];

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
  static _a5eBonus(kind, label, n, opts = {}) {
    const body = { label, formula: `${n}`, default: true, img: BOND_AURA_IMG, context: {} };
    switch (kind) {
      case "attacks":
        body.context = { attackTypes: TSLBondAuras.A5E_ATTACK_TYPES, spellLevels: [], requiresProficiency: false };
        break;
      case "damage":
        body.damageType = "";
        body.context = { attackTypes: TSLBondAuras.A5E_ATTACK_TYPES, damageTypes: [], isCritBonus: false, spellLevels: [] };
        break;
      case "initiative":
        body.context = { spellLevels: [], requiresProficiency: false };
        break;
      case "abilities":
        // types picks saves vs checks; listing the abilities explicitly, since
        // an empty array is not reliably read as "all" (see attackTypes).
        body.context = { types: opts.types ?? ["check", "save"], abilities: A5E_ABILITIES, requiresProficiency: false };
        break;
    }
    return {
      key: `flags.a5e.effects.bonuses.${kind}`,
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

    // Saves/checks: dnd5e has real formula fields, but a5e's
    // `system.bonuses.abilities` is a RecordField — writing `.save` to it does
    // NOTHING. On a5e they go through the system's own CUSTOM key, like attacks.
    if (tally.save) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("abilities", `${label} (saves)`, tally.save, { types: ["save"] }));
      else num("system.bonuses.abilities.save", tally.save);
    }
    if (tally.check) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("abilities", `${label} (checks)`, tally.check, { types: ["check"] }));
      else num("system.bonuses.abilities.check", tally.check);
    }
    // AC is genuinely numeric on both (a5e registers it with the default modes).
    if (tally.ac) num(isA5e ? "system.attributes.ac.changes.bonuses.value" : "system.attributes.ac.bonus", tally.ac);

    if (tally.attack) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("attacks", label, tally.attack));
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
    try { return await TSLBondAuras._refresh(); }
    catch (err) {
      // Never fail silently again: an unhandled rejection here is invisible,
      // which is exactly how this feature looked "not implemented" for days.
      console.error("TSL | Bond auras failed to apply:", err);
      ui.notifications?.error("TSL: bond auras failed — see the console (F12).");
    }
  }

  static async _refresh() {
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
      // One bad actor must not abort the sweep for everyone else.
      try { await TSLBondAuras._apply(actor, tally, lines); }
      catch (err) { console.error(`TSL | Bond aura failed on ${actor.name}:`, err); }
    }
  }

  /**
   * One command that answers "why is nothing happening": prints the whole
   * chain — version, system, GM, canvas, reach, every bond with its type,
   * strength and distance, then runs a refresh and reports what landed.
   */
  static async selfTest() {
    const L = [];
    const add = (k, v) => L.push(`${k}: ${v}`);
    add("module", game.modules?.get("tsl-social-conflict")?.version ?? "?");
    add("system", `${game.system?.id} ${game.system?.version ?? ""}`.trim());
    add("isGM", !!game.user?.isGM);
    add("canvas.ready", !!canvas?.ready);
    add("register() ran", TSLBondAuras._registered === true);
    add("reach", `${TSLBondAuras.range()} ft${TSLBondAuras.range() ? "" : "  <-- DISABLED (bondAuraRange is 0)"}`);

    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor);
    add("tokens with actors on scene", tokens.length);
    for (const t of tokens) {
      const bonds = TSLBondStore.getList(t.actor.id);
      add(`* ${t.actor.name}`, bonds.length ? `${bonds.length} bond(s)` : "NO BONDS RECORDED");
      for (const b of bonds) {
        const meta   = SocialArchetypeManager.getBondType(b.type);
        const str    = TSLBondStore.getStrength(t.actor.id, b.targetActorId);
        const others = tokens.filter(o => o !== t && o.actor?.id === b.targetActorId);
        const d      = others.length ? Math.min(...others.map(o => TSLBondAuras._distance(t, o))) : null;
        add(`    -> ${game.actors.get(b.targetActorId)?.name ?? b.targetActorId}`,
          `type=${b.type}${meta?.combatAura ? "" : "  <-- NO AURA (Stranger has none)"}`
          + ` strength=${str}${str ? "" : "  <-- 0 dots, no effect"}`
          + (others.length ? ` distance=${Math.round(d)}ft ${d <= TSLBondAuras.range() ? "IN REACH" : "OUT OF REACH"}`
                           : "  <-- they have no token on this scene"));
      }
    }
    try { await TSLBondAuras._refresh(); add("refresh()", "completed without error"); }
    catch (err) { add("refresh() THREW", err.message); console.error(err); }

    for (const t of tokens) {
      const a = t.actor.effects.find(e => e.flags?.[BOND_AURA_FLAG]?.[BOND_AURA_KEY]);
      add(`aura on ${t.actor.name}`, a ? JSON.stringify(a.changes) : "none");
    }
    const report = L.join("\n");
    console.log("=== TSL bond aura self-test ===\n" + report);
    return report;
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
    TSLBondAuras._registered = true;
    console.log(`TSL | Bond auras registered — reach ${TSLBondAuras.range()} ft. `
      + `Run TSLBondAuras.selfTest() if nothing appears.`);
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

// Reachable from the console for diagnostics regardless of script scoping.
globalThis.TSLBondAuras = TSLBondAuras;
