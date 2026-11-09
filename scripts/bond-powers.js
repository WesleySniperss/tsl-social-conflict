/**
 * tsl-social-conflict | bond-powers.js
 *
 * What a bond does beyond the talk (restored from v1.52–v2.0):
 *   • the AURA — standing near someone you have a bond with, in a fight or
 *     not (the user, 2026-11-06: «має працювати всюди»): each type its own
 *     levers (BOND_TYPES[*].aura), ±1 each, ×2 at ●●●; several bonds in reach
 *     sum, each lever capped at ±2. Off the map, nobody carries one — a token
 *     taken off or a scene changed leaves no aura behind;
 *   • the ●●● SIGNATURE — once per long rest (BOND_SIGNATURES): what it puts
 *     on the sheets ends after that one's next roll; the rest is the GM's to
 *     play. A long rest makes it ready again.
 * (The ●● ability is rules text the GM applies — nothing to track.)
 *
 * Foundry's Active Effects are flat and global: there is no "while within X ft
 * of Y". So the active GM recomputes who is in reach and keeps ONE
 * module-managed effect per actor (status `tsl-bond-aura`: an icon on the
 * token, never in the HUD palette, so nobody toggles it by hand).
 *
 * a5e: saves, checks, attacks, damage and initiative are RecordFields — a flat
 * change does nothing — so they go through the system's own CUSTOM keys
 * `flags.a5e.effects.bonuses.<kind>` with the bonus record as JSON.
 */

console.log("TSL | Loading bond-powers.js...");

const BOND_POWER_SCOPE = "tsl-social-conflict";
const BOND_AURA_STATUS = "tsl-bond-aura";
const BOND_AURA_IMG    = "icons/svg/aura.svg";

class TSLBondAuras {

  /** Reach in scene distance units; 0 turns auras off. */
  static range() {
    try { return Number(game.settings.get(BOND_POWER_SCOPE, "bondAuraRange") ?? 15); }
    catch { return 15; }
  }

  /** A bond that runs all the way (●●●) hits harder than a passing one. */
  static magnitude(strength) { return strength >= 3 ? 2 : 1; }

  /** A type's aura at a strength: { attack, save, … } (no label), or null. */
  static leversOf(typeId, strength) {
    const aura = SocialArchetypeManager.getBondType(typeId)?.aura;
    if (!aura || strength <= 0) return null;
    const n = TSLBondAuras.magnitude(strength), out = {};
    for (const [k, v] of Object.entries(aura)) if (k !== "label" && v) out[k] = Math.max(-2, Math.min(2, v * n));
    return out;
  }

  static _a5eBonus(kind, label, n, types = null) {
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    const attackTypes = ["meleeWeaponAttack", "rangedWeaponAttack", "meleeSpellAttack", "rangedSpellAttack"];
    const body = { label, formula: `${n}`, default: true, img: BOND_AURA_IMG, context: {} };
    if (kind === "attacks") body.context = { attackTypes, spellLevels: [], requiresProficiency: false };
    if (kind === "damage") { body.damageType = ""; body.context = { attackTypes, damageTypes: [], isCritBonus: false, spellLevels: [] }; }
    if (kind === "initiative") body.context = { spellLevels: [], requiresProficiency: false };
    if (kind === "abilities") body.context = { types: types ?? ["check", "save"], abilities, requiresProficiency: false };
    return { key: `flags.a5e.effects.bonuses.${kind}`, mode: 0, value: JSON.stringify(body), priority: 20 };
  }

  /** Real Active Effect changes for a tally { attack, damage, save, check, ac, init, spellDC, maneuverDC }. */
  static changes(tally, label) {
    const isA5e = game.system.id === "a5e";
    const out = [];
    const num = (key, v) => out.push({ key, mode: 2, value: `${v > 0 ? "+" : ""}${v}`, priority: 20 });
    if (tally.save)  isA5e ? out.push(TSLBondAuras._a5eBonus("abilities", label, tally.save, ["save"])) : num("system.bonuses.abilities.save", tally.save);
    if (tally.check) isA5e ? out.push(TSLBondAuras._a5eBonus("abilities", label, tally.check, ["check"])) : num("system.bonuses.abilities.check", tally.check);
    if (tally.ac) num(isA5e ? "system.attributes.ac.changes.bonuses.value" : "system.attributes.ac.bonus", tally.ac);
    // Spell / maneuver DC: numeric on a5e; dnd5e has no flat key — there it stays words.
    if (tally.spellDC && isA5e) num("system.attributes.spellDC", tally.spellDC);
    if (tally.maneuverDC && isA5e) num("system.attributes.maneuverDC", tally.maneuverDC);
    if (tally.attack) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("attacks", label, tally.attack));
      else { num("system.bonuses.mwak.attack", tally.attack); num("system.bonuses.rwak.attack", tally.attack); }
    }
    if (tally.damage) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("damage", label, tally.damage));
      else { num("system.bonuses.mwak.damage", tally.damage); num("system.bonuses.rwak.damage", tally.damage); }
    }
    if (tally.init) isA5e ? out.push(TSLBondAuras._a5eBonus("initiative", label, tally.init)) : num("system.attributes.init.bonus", tally.init);
    return out;
  }

  /** "+1 to attack rolls · +1 AC" — in words. */
  static describe(tally) {
    const s = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
    return [
      tally.attack ? _t("{n} to attack rolls", { n: s(tally.attack) }) : null,
      tally.damage ? _t("{n} to weapon damage", { n: s(tally.damage) }) : null,
      tally.save ? _t("{n} to saving throws", { n: s(tally.save) }) : null,
      tally.check ? _t("{n} to ability checks", { n: s(tally.check) }) : null,
      tally.ac ? _t("{n} AC", { n: s(tally.ac) }) : null,
      tally.init ? _t("{n} to initiative", { n: s(tally.init) }) : null,
      tally.spellDC ? _t("{n} to your spell save DC", { n: s(tally.spellDC) }) : null,
      tally.maneuverDC ? _t("{n} to your maneuver DC", { n: s(tally.maneuverDC) }) : null,
    ].filter(Boolean).join(" · ");
  }

  /** Distance between two tokens in scene units (the grid's own measure first, pixels as a fallback). */
  static distance(a, b) {
    const A = a.center ?? { x: a.x, y: a.y }, B = b.center ?? { x: b.x, y: b.y };
    try {
      const r = canvas.grid?.measurePath?.([{ x: A.x, y: A.y }, { x: B.x, y: B.y }]);
      const d = typeof r === "number" ? r : r?.distance;
      if (Number.isFinite(d)) return d;
    } catch { /* pixel math below */ }
    const size = canvas.dimensions?.size, unit = canvas.dimensions?.distance;
    if (!size || !unit) return Infinity;
    return (Math.hypot(A.x - B.x, A.y - B.y) / size) * unit;
  }

  /** Recompute every aura on the current scene (the active GM writes them). */
  static async refresh() {
    try { await TSLBondAuras._refresh(); }
    catch (err) { console.error("TSL | Bond auras failed:", err); }
  }

  static async _refresh() {
    if (!game.user?.isGM || (game.users?.activeGM && !game.users.activeGM.isSelf) || !globalThis.canvas?.ready) return;
    const range = TSLBondAuras.range();
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor);
    // Nobody off this map keeps an aura: a token was removed, the scene changed.
    const here = new Set(tokens.map(t => t.actor));
    for (const a of (game.actors?.contents ?? [...(game.actors ?? [])])) {
      if (here.has(a)) continue;
      const stale = (a.effects ?? []).filter(e => e.flags?.[BOND_POWER_SCOPE]?.bondAura).map(e => e.id);
      if (stale.length) { try { await a.deleteEmbeddedDocuments("ActiveEffect", stale); } catch (err) { console.error(`TSL | Bond aura cleanup failed on ${a.name}:`, err); } }
    }
    for (const tok of tokens) {
      const actor = tok.actor;
      const tally = {}, lines = [];
      if (range > 0) {
        for (const bond of TSLBondStore.getList(actor.id)) {
          const str = TSLBondStore.getStrength(actor.id, bond.targetActorId);
          const levers = TSLBondAuras.leversOf(bond.type, str);
          if (!levers) continue;
          const near = tokens.some(o => o !== tok && o.actor?.id === bond.targetActorId && TSLBondAuras.distance(tok, o) <= range);
          if (!near) continue;
          for (const [k, v] of Object.entries(levers)) tally[k] = (tally[k] ?? 0) + v;
          const type = SocialArchetypeManager.getBondType(bond.type);
          lines.push(`<b>${foundry.utils.escapeHTML(type.aura.label)}</b> — ${foundry.utils.escapeHTML(game.actors.get(bond.targetActorId)?.name ?? "?")} (${"●".repeat(str)}): ${TSLBondAuras.describe(levers)}`);
        }
      }
      for (const k of Object.keys(tally)) tally[k] = Math.max(-2, Math.min(2, tally[k]));
      try { await TSLBondAuras._apply(actor, tally, lines); }
      catch (err) { console.error(`TSL | Bond aura failed on ${actor.name}:`, err); }
    }
  }

  /** Create, update or remove the one aura effect — writing only when something changed (tokens move a lot). */
  static async _apply(actor, tally, lines) {
    const existing = actor.effects.find(e => e.flags?.[BOND_POWER_SCOPE]?.bondAura);
    if (!Object.values(tally).some(v => v)) { if (existing) await existing.delete(); return; }
    const name = _t("Bonds in reach");
    const changes = TSLBondAuras.changes(tally, name);
    const description = `${lines.join("<br>")}<br><b>${_t("In all:")}</b> ${TSLBondAuras.describe(tally)}`;
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name, img: BOND_AURA_IMG, description, changes, statuses: [BOND_AURA_STATUS],
        flags: { [BOND_POWER_SCOPE]: { bondAura: true } },
      }]);
      return;
    }
    // Compare canonically: Foundry stores a change's value as a string and adds a priority.
    const canon = (cs) => (cs ?? []).map(c => `${c.key}|${c.mode}|${String(c.value)}`).join("§");
    const text = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    if (canon(existing.changes) !== canon(changes) || text(existing.description) !== text(description) || existing.name !== name)
      await existing.update({ name, changes, description });
  }

  /** Wire the recompute to everything that changes who stands where, or what binds them. */
  static register() {
    const go = foundry.utils?.debounce ? foundry.utils.debounce(() => TSLBondAuras.refresh(), 200) : () => TSLBondAuras.refresh();
    Hooks.on("canvasReady", go);
    Hooks.on("createToken", go);
    Hooks.on("deleteToken", go);
    Hooks.on("updateToken", (_doc, chg) => { if ("x" in (chg ?? {}) || "y" in (chg ?? {})) go(); });
    Hooks.on("updateActor", (_a, chg) => { if (chg?.flags?.[BOND_POWER_SCOPE]?.bonds !== undefined) go(); });
    go();   // `ready` comes after `canvasReady` on load: the first pass is now
  }
}
globalThis.TSLBondAuras = TSLBondAuras;

/**
 * A signature's gift on a sheet: { adv } (advantage) and/or { bonus } (a number,
 * or "prof" — the bearer's proficiency bonus). It ends after the bearer's
 * next roll (the active GM removes it).
 */
class TSLBondMoments {
  static changes(gifts, label, actor) {
    const out = [];
    if (gifts.adv) {
      if (game.system.id === "a5e") {
        for (const k of ["attack", "abilityCheck", "abilitySave", "skillCheck"])
          out.push({ key: `flags.a5e.effects.rollMode.${k}.all`, mode: 5, value: 1, priority: 60 });
      } else {
        for (const k of ["attack", "ability.check", "ability.save"])
          out.push({ key: `system.rolls.${k}.mode`, mode: 2, value: 1, priority: 20 });
      }
    }
    const bonus = gifts.bonus === "prof" ? (typeof TSLTalk !== "undefined" ? TSLTalk.profBonus(actor) : 2) : Number(gifts.bonus) || 0;
    if (bonus) out.push(...TSLBondAuras.changes({ attack: bonus, check: bonus, save: bonus }, label));
    return out;
  }

  static describe(gifts, actor = null) {
    const bonus = gifts.bonus === "prof" ? (actor && typeof TSLTalk !== "undefined" ? TSLTalk.profBonus(actor) : null) : gifts.bonus;
    return [
      gifts.adv ? _t("advantage on the next roll") : null,
      bonus ? _t("+{n} on the next roll", { n: bonus }) : gifts.bonus === "prof" ? _t("your proficiency bonus again on the next roll") : null,
    ].filter(Boolean).join(" · ");
  }

  static async apply(actor, { name, gifts }) {
    if (!actor || !gifts) return null;
    const changes = TSLBondMoments.changes(gifts, name, actor);
    const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: "icons/svg/aura.svg", origin: `module.${BOND_POWER_SCOPE}`, disabled: false, changes,
      statuses: ["tsl-bond-moment"], description: TSLBondMoments.describe(gifts, actor),
      flags: { [BOND_POWER_SCOPE]: { bondMoment: { gifts } } },
    }]);
    return made ?? null;
  }

  /** End a bearer's moments once they've rolled (active GM). */
  static registerHooks() {
    const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.isSelf);
    Hooks.on("createChatMessage", async (msg) => {
      if (!isActiveGM() || !msg?.rolls?.length) return;
      const actor = game.actors.get(msg.speaker?.actor);
      const ids = (actor?.effects ?? []).filter(e => e.flags?.[BOND_POWER_SCOPE]?.bondMoment).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    });
  }
}

class TSLBondPowers {

  /**
   * ●●● — a bond's signature, once per long rest. GM client (players through
   * the relay). `choice` — which one, when the signature offers two.
   */
  static async invokeSignature({ actorId, bondId, choice = 0 } = {}) {
    if (!game.user.isGM) return false;
    const actor = game.actors.get(actorId);
    const bond = actor ? TSLBondStore.getList(actorId).find(b => b.id === bondId) : null;
    if (!actor || !bond || bond.sigUsed || TSLBondStore.getStrength(actorId, bond.targetActorId) < 3) return false;
    const sig = SocialArchetypeManager.getBondSignature(bond.type);
    if (!sig) return false;
    const partner = game.actors.get(bond.targetActorId) ?? null;
    await TSLBondStore.markSignatureUsed(actorId, bondId);
    let fx = sig.fx ?? {}, picked = null;
    if (fx.choose) { picked = fx.choose[Math.max(0, Math.min(fx.choose.length - 1, choice | 0))]; fx = picked; }
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    for (const [who, gifts] of [[actor, fx.self], [partner, fx.partner]]) {
      if (!who || !gifts) continue;
      await TSLBondMoments.apply(who, { name: sig.label, gifts });
      lines.push(`<b>${esc(who.name)}</b>: ${esc(TSLBondMoments.describe(gifts, who))}`);
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--strong tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-star"></i><span class="tsl-x-title">${esc(sig.label)}</span></div>
        <div class="tsl-x-who">${_t("{name} calls on the bond with {partner}", { name: esc(actor.name), partner: esc(partner?.name ?? "?") })}${picked ? ` — <b>${esc(picked.label)}</b>` : ""}</div>
        <div class="tsl-ab-text">${esc(sig.text)}</div>
        ${lines.length ? `<ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--good">${l}</li>`).join("")}</ul>` : ""}
        <div class="tsl-ab-wait">${_t("Ready again after a long rest.")}</div>
      </div>`,
    });
    return true;
  }

  /** A long rest makes every signature of that character ready again (dnd5e, a5e). */
  static registerRestHooks() {
    const ready = (actor) => { if (actor && (game.user.isGM || actor.isOwner)) TSLBondStore.clearSignatures(actor.id).catch(() => {}); };
    Hooks.on("dnd5e.restCompleted", (actor, result) => { if (result?.longRest) ready(actor); });
    Hooks.on("a5e.actorRest", (actor, result) => { if (result?.restType === "long") ready(actor); });
  }
}
