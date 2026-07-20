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
    try { return Number(game.settings.get("tsl-social-conflict", "bondAuraRange") ?? 30); }
    catch { return 30; }
  }

  /** A bond that runs all the way (●●●) hits harder than a passing one. */
  static _magnitude(strength) { return strength >= 3 ? 2 : 1; }

  /** Distance between two tokens in scene units (grid-aware, v13 measurePath). */
  static _distance(a, b) {
    try {
      const p = [{ x: a.center.x, y: a.center.y }, { x: b.center.x, y: b.center.y }];
      if (canvas.grid?.measurePath) return canvas.grid.measurePath(p).distance;
      const px = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      return (px / canvas.dimensions.size) * canvas.dimensions.distance;
    } catch { return Infinity; }
  }

  /** Per-system AE changes for one aura kind at magnitude n. */
  static _changes(kind, n) {
    const isA5e = game.system.id === "a5e";
    if (kind === "guard") {
      // Numeric save bonus — this key exists on dnd5e AND a5e.
      return [{ key: "system.bonuses.abilities.save", mode: 2, value: `+${n}`, priority: 20 }];
    }
    // press: you overextend reaching for them
    const out = [isA5e
      ? { key: "system.attributes.ac.changes.bonuses.value", mode: 2, value: "-1", priority: 20 }
      : { key: "system.attributes.ac.bonus",                 mode: 2, value: "-1", priority: 20 }];
    if (!isA5e) {
      out.push({ key: "system.bonuses.mwak.attack", mode: 2, value: `+${n}`, priority: 20 });
      out.push({ key: "system.bonuses.rwak.attack", mode: 2, value: `+${n}`, priority: 20 });
    }
    return out;
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
      let guard = 0, press = 0;
      const who = { guard: [], press: [] };

      if (range > 0) {
        for (const bond of TSLBondStore.getList(actor.id)) {
          const kind = SocialArchetypeManager.getBondType(bond.type)?.combatAura;
          if (!kind) continue;
          const str = TSLBondStore.getStrength(actor.id, bond.targetActorId);
          if (str <= 0) continue;
          // Any token of that person within reach counts.
          const near = tokens.some(o => o !== tok && o.actor?.id === bond.targetActorId
            && TSLBondAuras._distance(tok, o) <= range);
          if (!near) continue;

          const n = TSLBondAuras._magnitude(str);
          if (kind === "guard" && n > guard) guard = n;
          if (kind === "press" && n > press) press = n;
          who[kind].push(game.actors.get(bond.targetActorId)?.name ?? "someone");
        }
      }
      await TSLBondAuras._apply(actor, guard, press, who);
    }
  }

  /** Create / update / remove the single module-managed aura effect. */
  static async _apply(actor, guard, press, who) {
    const existing = actor.effects.find(e => e.flags?.[BOND_AURA_FLAG]?.[BOND_AURA_KEY]);

    if (!guard && !press) {
      if (existing) await existing.delete();
      return;
    }

    const changes = [];
    if (guard) changes.push(...TSLBondAuras._changes("guard", guard));
    if (press) changes.push(...TSLBondAuras._changes("press", press));

    const isA5e = game.system.id === "a5e";
    const lines = [];
    if (guard) lines.push(`<b>At their side</b> (${who.guard.join(", ")}): <b>+${guard}</b> to saving throws — someone you care for is watching, and you hold.`);
    if (press) lines.push(`<b>Blood up</b> (${who.press.join(", ")}): <b>−1 AC</b> — you reach for them and leave yourself open.${isA5e ? ` <em>GM: +${press} to their weapon attacks (a5e has no numeric attack-bonus key — apply by hand).</em>` : ` <b>+${press}</b> to weapon attacks.`}`);
    const description = lines.join("<br>");

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
