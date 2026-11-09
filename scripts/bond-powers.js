/**
 * tsl-social-conflict | bond-powers.js
 *
 * What a bond does beyond the talk (restored from v1.52–v2.0):
 *   • ON THE TOKEN — a bond in reach is a status like any other (the user,
 *     2026-11-09: «додаватися до інших статусів і відображатися як і вони на
 *     токені»). Standing within the aura's reach of someone you have a bond
 *     with, each of you carries that bond as an effect: the type's icon,
 *     tinted the way the bond runs (Pressure, Heart, Reason), named with its
 *     dots and the other one. It carries the bond's AURA, in a fight or not
 *     (the user, 2026-11-06: «має працювати всюди»): each type its own levers
 *     (BOND_TYPES[*].aura), ±1 each, ×2 at ●●●; several bonds in reach sum,
 *     each lever capped at ±2, and every status carries its share. Off the
 *     map, or hidden by the GM, nobody carries one. Between two NPCs it works
 *     on the sheet but stays off the token: an NPC's ally is the GM's secret;
 *   • the ●●● SIGNATURE — once per long rest (BOND_SIGNATURES): what it puts
 *     on the sheets ends after that one's next roll; the rest is the GM's to
 *     play. A long rest makes it ready again;
 *   • BONDS IN REACH (TSLBondNear) — on each viewer's screen, a corner panel
 *     lists who is in reach and what the bond gives right now.
 * (The ●● ability is rules text the GM applies — nothing to track.)
 *
 * Foundry's Active Effects are flat and global: there is no "while within X ft
 * of Y". So the active GM recomputes who is in reach and keeps one
 * module-managed effect per bond in reach (`flags.bondStatus`; status
 * `tsl-bond-<type>`, never in the HUD palette, so nobody toggles it by hand).
 *
 * a5e: saves, checks, attacks, damage and initiative are RecordFields — a flat
 * change does nothing — so they go through the system's own CUSTOM keys
 * `flags.a5e.effects.bonuses.<kind>` with the bonus record as JSON.
 */

console.log("TSL | Loading bond-powers.js...");

const BOND_POWER_SCOPE   = "tsl-social-conflict";
const BOND_AURA_IMG      = "icons/svg/aura.svg";
const BOND_NEAR_FALLBACK = 15;   // ft: "in reach" when the auras are off — the bond still shows

class TSLBondAuras {

  /** The aura's reach in scene distance units; 0 turns the auras off. */
  static range() {
    try { return Number(game.settings.get(BOND_POWER_SCOPE, "bondAuraRange") ?? 15); }
    catch { return 15; }
  }

  /** How close is "in reach": the aura's reach — or, with the auras off, 15 ft (the bond still shows, giving nothing). */
  static reach() {
    const r = TSLBondAuras.range();
    return r > 0 ? r : BOND_NEAR_FALLBACK;
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

  /** The colour a bond's status is tinted: the way it runs — Pressure, Heart or Reason. */
  static tintOf(type) {
    return APPROACHES[SocialArchetypeManager.bondApproach(type.id)]?.color ?? "#e0b45e";
  }

  /** Our bond effects on an actor — and the one aura effect of before 3.15, which goes. */
  static ours(actor) {
    return (actor?.effects ?? []).filter(e => e.flags?.[BOND_POWER_SCOPE]?.bondStatus || e.flags?.[BOND_POWER_SCOPE]?.bondAura);
  }

  /**
   * Who `tok` stands close to: [{ bond, type, str, partner, d, levers }] — one
   * per bond (its nearest token), nearest first. A Stranger is no one to you
   * yet: no status. `levers` — the aura (empty with the auras off, or at 0 ●).
   */
  static closeTo(tok, tokens, reach = TSLBondAuras.reach(), withAura = TSLBondAuras.range() > 0) {
    const actor = tok.actor, out = [];
    for (const bond of TSLBondStore.getList(actor.id)) {
      const type = SocialArchetypeManager.getBondType(bond.type);
      if (type.id === "stranger" || !bond.targetActorId || bond.targetActorId === actor.id) continue;
      let near = null, nd = Infinity;
      for (const o of tokens) {
        if (o === tok || o.actor?.id !== bond.targetActorId) continue;
        const d = TSLBondAuras.distance(tok, o);
        if (d <= reach && d < nd) { near = o; nd = d; }
      }
      if (!near) continue;
      const str = TSLBondStore.getStrength(actor.id, bond.targetActorId);
      out.push({ bond, type, str, partner: near.actor, d: nd, levers: (withAura && TSLBondAuras.leversOf(type.id, str)) || {} });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Each lever summed and capped at ±2, as before — every status carries its share of it (the farthest give way first). */
  static share(list) {
    for (const w of list) w.share = { ...w.levers };
    const keys = new Set(list.flatMap(w => Object.keys(w.levers)));
    for (const k of keys) {
      const total = list.reduce((s, w) => s + (w.levers[k] ?? 0), 0);
      let excess = total - Math.max(-2, Math.min(2, total));
      for (let i = list.length - 1; i >= 0 && excess; i--) {
        const v = list[i].share[k] ?? 0;
        if (excess > 0 && v > 0) { const cut = Math.min(v, excess); list[i].share[k] = v - cut; excess -= cut; }
        else if (excess < 0 && v < 0) { const cut = Math.max(v, excess); list[i].share[k] = v - cut; excess -= cut; }
      }
    }
    for (const w of list) for (const k of Object.keys(w.share)) if (!w.share[k]) delete w.share[k];
    return list;
  }

  /** What one bond in reach gives right now, in words (its share of the aura). */
  static gives(w) {
    if (!w.type.aura || !Object.keys(w.levers ?? {}).length) return "";
    return TSLBondAuras.describe(w.share ?? w.levers) || _t("nothing more — bonds close by give ±2 at most");
  }

  /** The status one bond in reach puts on `actor`. */
  static statusData(actor, w) {
    const esc = foundry.utils.escapeHTML;
    const { type, str, partner } = w;
    const name = `${type.label}${str ? ` ${"●".repeat(str)}` : ""} — ${partner.name}`;
    const lines = [];
    const gives = TSLBondAuras.gives(w);
    if (gives) lines.push(`<b>${esc(type.aura.label)}</b>: ${esc(gives)}`);
    const theirs = TSLBondStore.find(partner.id, actor.id);
    const g = theirs ? (SocialArchetypeManager.getBondType(theirs.type).guard ?? 0) * TSLBondStore.getStrength(partner.id, actor.id) : 0;
    if (g) lines.push(esc(g < 0 ? _t("their guard is down for you: DC −{n}", { n: -g }) : _t("they're wary of you: DC +{n}", { n: g })));
    // Between two NPCs it works on the sheet, but stays off the token: an NPC's ally is the GM's secret.
    const shown = SocialArchetypeManager.isPC(actor) || SocialArchetypeManager.isPC(partner);
    const data = {
      name, img: type.statusImg ?? BOND_AURA_IMG, tint: TSLBondAuras.tintOf(type),
      description: lines.join("<br>"),
      changes: TSLBondAuras.changes(w.share ?? {}, name),
      statuses: shown ? [`tsl-bond-${type.id}`] : [], ...tslShowIcon(shown),
    };
    // What was written, as one string: compared on the next pass instead of reading the effect back
    // (v14 stores changes in its own shape, so a read-back never matches).
    const sig = JSON.stringify([data.name, data.img, data.tint, data.description, data.statuses, data.showIcon ?? null,
      data.changes.map(c => `${c.key}|${c.mode}|${c.value}`)]);
    data.flags = { [BOND_POWER_SCOPE]: { bondStatus: { partnerId: partner.id, type: type.id, strength: str, sig } } };
    return data;
  }

  /** Recompute every bond in reach on the current scene (the active GM writes them). */
  static async refresh() {
    try { await TSLBondAuras._refresh(); }
    catch (err) { console.error("TSL | Bond statuses failed:", err); }
  }

  static async _refresh() {
    if (!game.user?.isGM || (game.users?.activeGM && !game.users.activeGM.isSelf) || !globalThis.canvas?.ready) return;
    const placed = (canvas.tokens?.placeables ?? []).filter(t => t.actor);
    // A token the GM hid isn't there yet, for anyone: it neither gives nor carries a bond.
    const tokens = placed.filter(t => !t.document?.hidden);
    const here = new Set(tokens.map(t => t.actor));
    // Nobody off this map — or hidden on it — keeps one: a token was removed or hidden, the scene changed.
    const everyone = new Set([...(game.actors?.contents ?? [...(game.actors ?? [])]), ...placed.map(t => t.actor)]);
    for (const a of everyone) {
      if (here.has(a)) continue;
      const stale = TSLBondAuras.ours(a).map(e => e.id);
      if (stale.length) { try { await a.deleteEmbeddedDocuments("ActiveEffect", stale); } catch (err) { console.error(`TSL | Bond status cleanup failed on ${a.name}:`, err); } }
    }
    const reach = TSLBondAuras.reach(), withAura = TSLBondAuras.range() > 0;
    // One set per actor: a character on the map twice carries each bond once (its nearest).
    const byActor = new Map();
    for (const tok of tokens) {
      if (!byActor.has(tok.actor)) byActor.set(tok.actor, []);
      byActor.get(tok.actor).push(tok);
    }
    for (const [actor, toks] of byActor) {
      const best = new Map();
      for (const tok of toks) for (const w of TSLBondAuras.closeTo(tok, tokens, reach, withAura))
        if (!best.has(w.partner.id) || w.d < best.get(w.partner.id).d) best.set(w.partner.id, w);
      const want = TSLBondAuras.share([...best.values()].sort((a, b) => a.d - b.d));
      try { await TSLBondAuras._apply(actor, want); }
      catch (err) { console.error(`TSL | Bond statuses failed on ${actor.name}:`, err); }
    }
  }

  /** Create, update or remove the bond statuses — writing only what changed (tokens move a lot). */
  static async _apply(actor, want) {
    const SC = BOND_POWER_SCOPE;
    const have = new Map(), drop = [];
    for (const e of TSLBondAuras.ours(actor)) {
      const f = e.flags?.[SC]?.bondStatus;
      if (!f?.partnerId || have.has(f.partnerId)) drop.push(e.id);   // the old single aura, or a double
      else have.set(f.partnerId, e);
    }
    const create = [];
    for (const w of want) {
      const data = TSLBondAuras.statusData(actor, w);
      const e = have.get(w.partner.id);
      have.delete(w.partner.id);
      if (e && e.flags?.[SC]?.bondStatus?.sig === data.flags[SC].bondStatus.sig) continue;   // as it was: nothing to write
      // Changed (the dots, a name, the share of the aura): written anew — a fresh effect takes
      // the same shape on v13 and v14, where an update of the old `changes` may not.
      if (e) drop.push(e.id);
      create.push(data);
    }
    drop.push(...[...have.values()].map(e => e.id));
    if (drop.length) await actor.deleteEmbeddedDocuments("ActiveEffect", drop);
    if (create.length) await actor.createEmbeddedDocuments("ActiveEffect", create);
  }

  /** Wire the recompute to everything that changes who stands where, who's hidden, or what binds them. */
  static register() {
    const go = foundry.utils?.debounce ? foundry.utils.debounce(() => TSLBondAuras.refresh(), 200) : () => TSLBondAuras.refresh();
    Hooks.on("canvasReady", go);
    Hooks.on("createToken", go);
    Hooks.on("deleteToken", go);
    Hooks.on("updateToken", (_doc, chg) => { if ("x" in (chg ?? {}) || "y" in (chg ?? {}) || "hidden" in (chg ?? {})) go(); });
    Hooks.on("updateActor", (_a, chg) => { if (chg?.flags?.[BOND_POWER_SCOPE]?.bonds !== undefined || "name" in (chg ?? {})) go(); });
    go();   // `ready` comes after `canvasReady` on load: the first pass is now
  }
}
globalThis.TSLBondAuras = TSLBondAuras;

/**
 * Bonds in reach, in a corner of the screen (the user, 2026-11-09: «І в
 * куточку екрану відповідно теж»). Each client, for its own characters — a
 * player's (the ones they control, else every character of theirs on the
 * map), the GM's selected tokens: a panel in the bottom-left corner, above the
 * players, lists everyone in reach with what the bond gives right now — the
 * aura, their guard, the Strings both ways, the ●● ability, whether the ●●●
 * signature is ready. The tokens themselves carry the bond as a status
 * (TSLBondAuras, the GM's job). Display only.
 */
class TSLBondNear {

  /** The viewer's own switch (a client setting). */
  static enabled() {
    try { return game.settings.get(BOND_POWER_SCOPE, "bondNearShow") !== false; }
    catch { return true; }
  }

  /** "In reach" is the aura's reach; with the auras off, 15 ft. */
  static reach() { return TSLBondAuras.reach(); }

  /** A token that's there for this viewer: never one the GM hid, and for a player never one out of their sight. */
  static seen(t) {
    if (t?.document?.hidden) return false;
    return !!game.user?.isGM || t?.visible !== false;
  }

  /** This viewer's own characters on the map: the GM's selected tokens; a player's controlled ones, else all of theirs. */
  static mine() {
    const controlled = (canvas?.tokens?.controlled ?? []).filter(t => t.actor && !t.document?.hidden);
    if (game.user?.isGM) return controlled;
    const own = (t) => !!t.actor?.isOwner && SocialArchetypeManager.isPC(t.actor) && !t.document?.hidden;
    const picked = controlled.filter(own);
    return picked.length ? picked : (canvas?.tokens?.placeables ?? []).filter(own);
  }

  /** Who is in reach of whom: [{ me, other, bond, d }] — one per my token and bonded person (their nearest token), nearest first. */
  static pairs() {
    if (!globalThis.canvas?.ready) return [];
    const reach = TSLBondNear.reach();
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor && TSLBondNear.seen(t));
    const out = [];
    for (const me of TSLBondNear.mine()) {
      const myId = me.actor.id;
      for (const bond of TSLBondStore.getList(myId)) {
        if (!bond?.targetActorId || bond.targetActorId === myId) continue;
        let best = null, bestD = Infinity;
        for (const o of tokens) {
          if (o === me || o.actor?.id !== bond.targetActorId) continue;
          const d = TSLBondAuras.distance(me, o);
          if (d <= reach && d < bestD) { best = o; bestD = d; }
        }
        if (best) out.push({ me, other: best, bond, d: bestD });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /**
   * What `actor` carries on its token right now — the bonds in reach, worked
   * out as the GM works them out (for the Chronicle: no GM needed to see it).
   */
  static statusesOf(actor) {
    if (!globalThis.canvas?.ready || !actor) return [];
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor && TSLBondNear.seen(t));
    const best = new Map();
    for (const tok of tokens.filter(t => t.actor.id === actor.id))
      for (const w of TSLBondAuras.closeTo(tok, tokens))
        if (!best.has(w.partner.id) || w.d < best.get(w.partner.id).d) best.set(w.partner.id, w);
    return TSLBondAuras.share([...best.values()].sort((a, b) => a.d - b.d));
  }

  /** Is this actor on the map for this viewer? */
  static onMap(actor) {
    return !!actor && (canvas?.tokens?.placeables ?? []).some(t => t.actor?.id === actor.id && TSLBondNear.seen(t));
  }

  /** What one pair holds: the type, ●, the Strings both ways, their guard toward me. */
  static info(p) {
    const myId = p.me.actor.id, otherId = p.other.actor.id;
    const type = SocialArchetypeManager.getBondType(p.bond.type);
    const theirBond = TSLBondStore.find(otherId, myId);
    const theirType = theirBond ? SocialArchetypeManager.getBondType(theirBond.type) : null;
    return {
      myId, otherId, type, bond: p.bond,
      str: TSLBondStore.getStrength(myId, otherId),
      mine: TSLStringStore.countOn(myId, otherId) > 0,
      theirs: TSLStringStore.countOn(otherId, myId) > 0,
      guard: (theirType?.guard ?? 0) * (theirBond ? TSLBondStore.getStrength(otherId, myId) : 0),
    };
  }

  static dots(str) { return "●".repeat(str) + "○".repeat(Math.max(0, 3 - str)); }

  static tone(type) { return type.id === "stranger" ? "stranger" : type.hostile ? "hostile" : "warm"; }

  /** A bond's status icon, tinted the way it runs — the same as on the token. */
  static icon(type) {
    if (type.id === "stranger" || !type.statusImg) return `<i class="fas ${type.icon ?? "fa-link"} tsl-bs-ico tsl-bs-ico--fa"></i>`;
    const img = foundry.utils.escapeHTML(type.statusImg);
    return `<span class="tsl-bs-ico" style="background-color:${TSLBondAuras.tintOf(type)};-webkit-mask-image:url('${img}');mask-image:url('${img}')"></span>`;
  }

  /** A bond in reach as a chip — what's on the token, for the Chronicle. */
  static chipHTML(w) {
    const esc = foundry.utils.escapeHTML;
    const gives = TSLBondAuras.gives(w);
    const tip = `<b>${esc(w.type.label)}${w.str ? ` ${"●".repeat(w.str)}` : ""}</b> — ${esc(w.partner.name)}${gives ? `<br>${esc(w.type.aura.label)}: ${esc(gives)}` : ""}`;
    return `<span class="tsl-bs-chip tsl-bs--${TSLBondNear.tone(w.type)}" data-tooltip="${esc(tip)}">${TSLBondNear.icon(w.type)}<b>${esc(w.type.label)}</b>${w.str ? `<span class="tsl-bs-dots">${"●".repeat(w.str)}</span>` : ""}<span class="tsl-bs-who">${esc(w.partner.name)}</span></span>`;
  }

  /** One person in the corner panel: who, the bond, what it gives right now, their guard, the Strings, ●● / ●●●. */
  static rowHTML(p, { names = false } = {}) {
    const esc = foundry.utils.escapeHTML;
    const i = TSLBondNear.info(p);
    const other = p.other.actor, me = p.me.actor;
    const img = p.other.document?.texture?.src || other.img || "icons/svg/mystery-man.svg";
    const stranger = i.type.id === "stranger";
    const levers = TSLBondAuras.range() > 0 ? TSLBondAuras.leversOf(i.type.id, i.str) : null;
    const aura = levers && i.type.aura
      ? `<div class="tsl-bn-line tsl-bn-aura"><i class="fas fa-shield-heart"></i> <b>${esc(i.type.aura.label)}</b> — ${esc(TSLBondAuras.describe(levers))}</div>` : "";
    const guard = i.guard
      ? `<div class="tsl-bn-line tsl-bn-guard ${i.guard > 0 ? "wary" : ""}"><i class="fas ${i.guard > 0 ? "fa-eye" : "fa-unlock"}"></i> ${i.guard < 0 ? _t("their guard is down for you: DC −{n}", { n: -i.guard }) : _t("they're wary of you: DC +{n}", { n: i.guard })}</div>` : "";
    const ab = !stranger && i.str >= 2 ? SocialArchetypeManager.getBondAbility(i.type.id) : null;
    const sig = !stranger && i.str >= 3 ? SocialArchetypeManager.getBondSignature(i.type.id) : null;
    const powers = [
      ab ? `<span class="tsl-bn-pow" data-tooltip="${esc(ab.text)}"><span class="tsl-bn-pd">●●</span> ${esc(ab.label)}</span>` : "",
      sig ? `<span class="tsl-bn-pow tsl-bn-pow--sig ${i.bond.sigUsed ? "used" : ""}" data-tooltip="${esc(`${sig.text}<br><i>${i.bond.sigUsed ? _t("Spent — ready again after a long rest.") : _t("once per long rest")}</i>`)}"><span class="tsl-bn-pd">●●●</span> ${esc(sig.label)} — ${i.bond.sigUsed ? _t("spent") : _t("ready")}</span>` : "",
    ].join("");
    const chip = (dir, on) => `<span class="tsl-hold-chip tsl-hold-chip--${dir} ${on ? "on" : ""}"><i class="fas ${on ? (dir === "mine" ? "fa-check" : "fa-triangle-exclamation") : "fa-minus"}"></i> ${dir === "mine" ? _t("String on them") : _t("String on you")}</span>`;
    return `<div class="tsl-bn-row tsl-bn--${TSLBondNear.tone(i.type)}" data-bn-open="${esc(me.id)}" data-tooltip="${esc(_t("Open {name}'s bonds", { name: me.name }))}">
      <div class="tsl-bn-top">
        <img class="tsl-bn-img" src="${esc(img)}" alt="">
        <div class="tsl-bn-who">
          <div class="tsl-bn-name"><b>${esc(other.name)}</b>${names ? ` <span class="tsl-bn-me">· ${esc(me.name)}</span>` : ""}</div>
          <div class="tsl-bn-bond">${TSLBondNear.icon(i.type)} ${esc(i.type.label)}${stranger ? "" : ` <span class="tsl-bn-dots">${TSLBondNear.dots(i.str)}</span>`}</div>
        </div>
      </div>
      ${stranger && i.type.hint ? `<div class="tsl-bn-line tsl-bn-muted">${esc(i.type.hint)}</div>` : ""}
      ${aura}${guard}
      <div class="tsl-bn-tags">${chip("mine", i.mine)}${chip("theirs", i.theirs)}</div>
      ${powers ? `<div class="tsl-bn-tags">${powers}</div>` : ""}
    </div>`;
  }

  /** The corner panel: a header (folds it) and a row per person in reach. */
  static panelHTML(pairs, { folded = false } = {}) {
    const names = new Set(pairs.map(p => p.me.actor.id)).size > 1;
    return `<header class="tsl-bn-head" data-bn-fold data-tooltip="${foundry.utils.escapeHTML(folded ? _t("Unfold") : _t("Fold"))}">
        <i class="fas fa-link"></i><span class="tsl-bn-title">${_t("Bonds in reach")}</span><span class="tsl-bn-count">${pairs.length}</span>
        <i class="fas ${folded ? "fa-chevron-up" : "fa-chevron-down"} tsl-bn-fold"></i>
      </header>${folded ? "" : `<div class="tsl-bn-list">${pairs.map(p => TSLBondNear.rowHTML(p, { names })).join("")}</div>`}`;
  }

  // ── On screen ────────────────────────────────────────────────────────────────

  static _folded() { try { return localStorage.getItem("tsl-bond-near-folded") === "1"; } catch { return false; } }
  static _setFolded(v) { try { localStorage.setItem("tsl-bond-near-folded", v ? "1" : "0"); } catch { /* private window */ } }

  /** The panel: in the left column, right above the players (it scales with the interface). */
  static _panel(create) {
    let el = document.getElementById("tsl-bond-near");
    if (el || !create) return el;
    const col = document.getElementById("ui-left-column-1");
    if (!col) return null;
    el = document.createElement("section");
    el.id = "tsl-bond-near";
    el.addEventListener("click", (ev) => TSLBondNear._onClick(ev));
    const players = document.getElementById("players");
    if (players?.parentElement === col) col.insertBefore(el, players);
    else col.append(el);
    return el;
  }

  static _onClick(ev) {
    if (ev.target.closest("[data-bn-fold]")) {
      TSLBondNear._setFolded(!TSLBondNear._folded());
      TSLBondNear.update();
      return;
    }
    const row = ev.target.closest("[data-bn-open]");
    const actor = row ? game.actors.get(row.dataset.bnOpen) : null;
    if (actor) SocialFencingDialog.open(actor, { tab: "bonds" });
  }

  static _renderPanel(pairs) {
    const el = TSLBondNear._panel(pairs.length > 0);
    if (!el) return;
    if (!pairs.length) { el.remove(); return; }
    const html = TSLBondNear.panelHTML(pairs, { folded: TSLBondNear._folded() });
    if (el._tslSig === html) return;   // tokens animate every frame: touch the DOM only on a change
    el._tslSig = html;
    el.innerHTML = html;
  }

  /** Recompute and redraw the panel. */
  static update() {
    if (typeof document === "undefined") return;
    try { TSLBondNear._renderPanel(TSLBondNear.enabled() ? TSLBondNear.pairs() : []); }
    catch (err) { console.error("TSL | Bonds in reach failed:", err); }
  }

  /** At most once a frame: a moving token refreshes every frame. */
  static schedule() {
    if (TSLBondNear._queued) return;
    TSLBondNear._queued = true;
    const run = () => { TSLBondNear._queued = false; TSLBondNear.update(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /** Follow everything that moves a token, shows or hides one, or changes a bond or a String. */
  static register() {
    const go = () => TSLBondNear.schedule();
    for (const h of ["canvasReady", "controlToken", "createToken", "deleteToken", "updateToken", "refreshToken", "sightRefresh"]) Hooks.on(h, go);
    Hooks.on("updateActor", (_a, chg) => {
      const f = chg?.flags?.[BOND_POWER_SCOPE];
      if ((f && ("bonds" in f || "stringList" in f || "-=bonds" in f || "-=stringList" in f)) || "name" in (chg ?? {}) || "img" in (chg ?? {})) go();
    });
    // A new scene: the old one's panel goes.
    Hooks.on("canvasTearDown", () => { document.getElementById("tsl-bond-near")?.remove(); });
    go();
  }
}
globalThis.TSLBondNear = TSLBondNear;

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
      statuses: ["tsl-bond-moment"], ...tslShowIcon(), description: TSLBondMoments.describe(gifts, actor),
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
