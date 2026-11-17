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
 *     (the user, 2026-11-06: «має працювати всюди»; 2026-11-14: «мають давати
 *     якісь автоматизовані механічні плюси що будуть корисні і для битви»):
 *     each type its own lever, +1 a ● (BOND_TYPES[*].aura.per), a second one
 *     from ●● (`plus`); several bonds in reach sum, each lever capped at ±3,
 *     and every status carries its share. Off the map, or hidden by the GM,
 *     nobody carries one. Reach is measured between the tokens' EDGES — a
 *     dragon's centre is 10 ft from its own skin.
 *     It is one of the SYSTEM's statuses (`tslShowIcon` / `tslSystemStatus`):
 *     the system lists it wherever it lists its own — a5e's Effects Panel in
 *     the corner of the screen — and its text holds everything about the bond
 *     (the aura, their guard, the Strings both ways, ●● and ●●● ready or
 *     spent). It shows between any two — two NPCs as well: until 3.18 that
 *     pair stayed off the token, and whoever tested with NPCs saw nothing.
 *     The module draws nothing of its own on the map (the user, 2026-11-14);
 *   • the ●● ABILITY and the ●●● SIGNATURE — each once per long rest
 *     (BOND_ABILITIES, BOND_SIGNATURES): what one puts on the sheets ends after
 *     that one's next roll; temporary hit points and an emotion let go land at
 *     once; the rest is the GM's to play. A long rest makes both ready again
 *     (dnd5e.restCompleted; a5e.restCompleted — its RestManager, the rest type
 *     in `data`, the actor on the rest's chat message).
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
const BOND_AURA_CAP      = 3;    // what all the bonds in reach can add to one lever, or take from it

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

  /**
   * A type's aura at a strength: { attack, save, … }, or null. Its lever grows
   * +1 a ● (`per`); from ●● a second one joins (`plus`); what it costs is flat
   * (`minus`).
   */
  static leversOf(typeId, strength) {
    const aura = SocialArchetypeManager.getBondType(typeId)?.aura;
    if (!aura || strength <= 0) return null;
    const out = {};
    const add = (k, v) => { if (v) out[k] = Math.max(-BOND_AURA_CAP, Math.min(BOND_AURA_CAP, (out[k] ?? 0) + v)); };
    if (aura.per) add(aura.per, Math.min(3, strength));
    if (strength >= 2) for (const [k, v] of Object.entries(aura.plus ?? {})) add(k, v);
    for (const [k, v] of Object.entries(aura.minus ?? {})) add(k, v);
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
    // Spell DC: numeric on both; a maneuver DC only a5e has.
    if (tally.spellDC) num(isA5e ? "system.attributes.spellDC" : "system.bonuses.spell.dc", tally.spellDC);
    if (tally.maneuverDC && isA5e) num("system.attributes.maneuverDC", tally.maneuverDC);
    // Attacks and their damage: weapons and spells alike, on both systems.
    const kinds = ["mwak", "rwak", "msak", "rsak"];
    if (tally.attack) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("attacks", label, tally.attack));
      else for (const k of kinds) num(`system.bonuses.${k}.attack`, tally.attack);
    }
    if (tally.damage) {
      if (isA5e) out.push(TSLBondAuras._a5eBonus("damage", label, tally.damage));
      else for (const k of kinds) num(`system.bonuses.${k}.damage`, tally.damage);
    }
    if (tally.init) isA5e ? out.push(TSLBondAuras._a5eBonus("initiative", label, tally.init)) : num("system.attributes.init.bonus", tally.init);
    return out;
  }

  /** "+1 to attack rolls · +1 AC" — in words. */
  static describe(tally) {
    const s = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
    return [
      tally.attack ? _t("{n} to attack rolls", { n: s(tally.attack) }) : null,
      tally.damage ? _t("{n} to damage", { n: s(tally.damage) }) : null,
      tally.save ? _t("{n} to saving throws", { n: s(tally.save) }) : null,
      tally.check ? _t("{n} to ability checks", { n: s(tally.check) }) : null,
      tally.ac ? _t("{n} AC", { n: s(tally.ac) }) : null,
      tally.init ? _t("{n} to initiative", { n: s(tally.init) }) : null,
      tally.spellDC ? _t("{n} to your spell save DC", { n: s(tally.spellDC) }) : null,
      tally.maneuverDC && game.system?.id === "a5e" ? _t("{n} to your maneuver DC", { n: s(tally.maneuverDC) }) : null,
    ].filter(Boolean).join(" · ");
  }

  /** The same, short — for a chip: "damage +2 · AC −2". */
  static short(tally) {
    const s = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
    const names = { attack: _t("attack"), damage: _t("damage"), save: _t("saves"), check: _t("checks"), ac: _t("AC"), init: _t("initiative"), spellDC: _t("spell DC"), maneuverDC: _t("maneuver DC") };
    return Object.entries(tally).filter(([k, v]) => v && names[k] && (k !== "maneuverDC" || game.system?.id === "a5e")).map(([k, v]) => `${names[k]} ${s(v)}`).join(" · ");
  }

  /** Where a token stands and how big it is, in pixels — from its document: a move is done there before the picture catches up. */
  static rect(t) {
    const d = t.document ?? t, size = canvas.dimensions?.size ?? 100;
    const px = (typeof d.getSize === "function" ? d.getSize() : null) ?? {};
    const w = Number(px.width ?? ((d.width ?? 0) * (canvas.grid?.sizeX ?? size) || t.w)) || size;
    const h = Number(px.height ?? ((d.height ?? 0) * (canvas.grid?.sizeY ?? size) || t.h)) || size;
    const x = Number(d.x ?? t.x ?? (t.center ? t.center.x - w / 2 : 0));
    const y = Number(d.y ?? t.y ?? (t.center ? t.center.y - h / 2 : 0));
    return { x, y, w, h };
  }

  /**
   * How far apart two tokens are, in scene units — between their EDGES, the way
   * reach is counted at a table: two that stand side by side are 0 ft apart,
   * whatever their size. On a square grid a diagonal step counts as one (5 ft).
   */
  static distance(a, b) {
    const size = canvas.dimensions?.size, unit = canvas.dimensions?.distance;
    if (!size || !unit) return Infinity;
    const A = TSLBondAuras.rect(a), B = TSLBondAuras.rect(b);
    const gap = (a1, a2, b1, b2) => Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));
    const dx = gap(A.x, A.x + A.w, B.x, B.x + B.w), dy = gap(A.y, A.y + A.h, B.y, B.y + B.h);
    const square = canvas.grid?.isSquare ?? (canvas.grid?.type === 1);
    const px = square ? Math.max(dx, dy) : Math.hypot(dx, dy);
    return Math.round((px / size) * unit * 100) / 100;
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

  /** Each lever summed and capped at ±3 — every status carries its share of it (the farthest give way first). */
  static share(list) {
    for (const w of list) w.share = { ...w.levers };
    const keys = new Set(list.flatMap(w => Object.keys(w.levers)));
    for (const k of keys) {
      const total = list.reduce((s, w) => s + (w.levers[k] ?? 0), 0);
      let excess = total - Math.max(-BOND_AURA_CAP, Math.min(BOND_AURA_CAP, total));
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
    return TSLBondAuras.describe(w.share ?? w.levers) || _t("nothing more — bonds close by give ±{n} at most", { n: BOND_AURA_CAP });
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
    // Everything about the bond sits in the status's own text — the platform shows it wherever it shows
    // a status (a5e: the Effects Panel's tooltip): the Strings both ways, the ●● ability, the ●●● signature.
    if (TSLStringStore.countOn(actor.id, partner.id) > 0) lines.push(`<i class="fas fa-check"></i> ${esc(_t("String on them"))}`);
    if (TSLStringStore.countOn(partner.id, actor.id) > 0) lines.push(`<i class="fas fa-triangle-exclamation"></i> ${esc(_t("String on you"))}`);
    const ability = type.id !== "stranger" && str >= 2 ? SocialArchetypeManager.getBondAbility(type.id) : null;
    if (ability) lines.push(`●● <b>${esc(ability.label)}</b> — ${esc(w.bond?.abUsed ? _t("spent") : _t("ready"))}`);
    const signature = type.id !== "stranger" && str >= 3 ? SocialArchetypeManager.getBondSignature(type.id) : null;
    if (signature) lines.push(`●●● <b>${esc(signature.label)}</b> — ${esc(w.bond?.sigUsed ? _t("spent") : _t("ready"))}`);
    // On every pair in reach — two NPCs too (hidden there until 3.18: whoever tested with NPCs saw nothing).
    const data = {
      name, img: type.statusImg ?? BOND_AURA_IMG, tint: TSLBondAuras.tintOf(type),
      description: lines.join("<br>"),
      changes: TSLBondAuras.changes(w.share ?? {}, name),
      statuses: [`tsl-bond-${type.id}`, TSL_STATUS_MARK], ...tslShowIcon(true),
    };
    // What was written, as one string: compared on the next pass instead of reading the effect back
    // (v14 stores changes in its own shape, so a read-back never matches).
    const sig = JSON.stringify([data.name, data.img, data.tint, data.description, data.statuses, data.showIcon ?? null,
      data.system?.effectType ?? null, data.changes.map(c => `${c.key}|${c.mode}|${c.value}`)]);
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
    Hooks.on("updateToken", (_doc, chg) => { if (["x", "y", "hidden", "width", "height"].some(k => k in (chg ?? {}))) go(); });
    // A bond, a String (the status says who holds one on whom) or a name changed.
    Hooks.on("updateActor", (_a, chg) => {
      const f = chg?.flags?.[BOND_POWER_SCOPE];
      if ((f && ["bonds", "stringList", "-=bonds", "-=stringList"].some(k => k in f)) || "name" in (chg ?? {})) go();
    });
    // A bond in reach isn't taken off by hand (the system's panel lets anyone try): it comes straight back.
    Hooks.on("deleteActiveEffect", (effect) => { if (effect?.flags?.[BOND_POWER_SCOPE]?.bondStatus) go(); });
    go();   // `ready` comes after `canvasReady` on load: the first pass is now
  }
}
globalThis.TSLBondAuras = TSLBondAuras;

/**
 * Bonds in reach, for the Chronicle's "Close by" row: what an actor carries on
 * its token right now, worked out as the GM works it out. Display only.
 *
 * There is NO window of the module's for this on the map (the user, 2026-11-14:
 * «ВІКНО СТАТУСУ В КУТУ ЕКРАНА, АБСОЛЮТНО НЕПОТРІБНЕ… ВШИТИ ЦЕ В СИСТЕМУ ДО
 * ЗВИЧАЙНИХ СТАТУСІВ НА ПЛАТФОРМІ»): the corner panel of 3.14–3.17 is gone. A
 * bond in reach is a status like any other (TSLBondAuras) — the system draws
 * it on the token and lists it wherever it lists its own (a5e: the Effects
 * Panel in the corner), with everything about it in the status's own text.
 */
class TSLBondNear {

  /** A token that's there for this viewer: never one the GM hid, and for a player never one out of their sight. */
  static seen(t) {
    if (t?.document?.hidden) return false;
    return !!game.user?.isGM || t?.visible !== false;
  }

  /** What `actor` carries on its token right now — the bonds in reach, nearest first (no GM needed to see it). */
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
      statuses: ["tsl-bond-moment", TSL_STATUS_MARK], ...tslShowIcon(), description: TSLBondMoments.describe(gifts, actor),
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

  /** Three times their proficiency bonus — what "temporary hit points" means here. */
  static tempFor(actor, spec) {
    if (spec === "prof3") return 3 * (typeof TSLTalk !== "undefined" ? TSLTalk.profBonus(actor) : 2);
    return Math.max(0, Number(spec) || 0);
  }

  /**
   * Give one of them what a power gives (GM client): an emotion let go, or
   * temporary hit points, at once; advantage or a bonus on the sheet until
   * their next roll. Returns what happened, in words (HTML), or "".
   */
  static async give(who, name, gifts, { emo = null } = {}) {
    if (!who || !gifts) return "";
    const esc = foundry.utils.escapeHTML;
    const out = [];
    let cleared = false;
    if (gifts.clear) {
      const feels = TSLEmotions.of(who);
      const id = feels.some(f => f.id === emo) ? emo : feels[0]?.id;
      if (id && await TSLEmotions.unset(who, id)) { cleared = true; out.push(_t("lets go of {emotion}", { emotion: esc(EMOTIONS[id].label) })); }
    }
    // Temporary hit points: on their own — or, beside an emotion to let go, only when there was none.
    if (gifts.temp && !cleared) {
      const n = TSLBondPowers.tempFor(who, gifts.temp);
      const cur = Number(who.system?.attributes?.hp?.temp) || 0;
      if (n > cur) { try { await who.update({ "system.attributes.hp.temp": n }); } catch (err) { console.warn("TSL | temporary hit points failed:", err); } }
      out.push(n > cur ? _t("{n} temporary hit points", { n }) : _t("{n} temporary hit points — they had more already", { n }));
    }
    if (gifts.adv || gifts.bonus) {
      await TSLBondMoments.apply(who, { name, gifts });
      out.push(esc(TSLBondMoments.describe(gifts, who)));
    }
    if (gifts.clear && !cleared && !gifts.temp) out.push(_t("nothing to let go"));
    return out.length ? `<b>${esc(who.name)}</b>: ${out.join(" · ")}` : "";
  }

  /**
   * ●● the ability, or ●●● the signature — each once per long rest. GM client
   * (players through the relay). `choice` — which one, when a signature
   * offers two; `emo` — which emotion to let go, when the power lets one go.
   */
  static async invoke({ actorId, bondId, tier = 3, choice = 0, emo = null } = {}) {
    if (!game.user.isGM) return false;
    const actor = game.actors.get(actorId);
    const bond = actor ? TSLBondStore.getList(actorId).find(b => b.id === bondId) : null;
    const sig = tier === 3;
    if (!actor || !bond || (sig ? bond.sigUsed : bond.abUsed) || TSLBondStore.getStrength(actorId, bond.targetActorId) < (sig ? 3 : 2)) return false;
    const power = sig ? SocialArchetypeManager.getBondSignature(bond.type) : SocialArchetypeManager.getBondAbility(bond.type);
    if (!power) return false;
    const partner = game.actors.get(bond.targetActorId) ?? null;
    await TSLBondStore.markUsed(actorId, bondId, sig ? "sigUsed" : "abUsed");
    let fx = power.fx ?? {}, picked = null;
    if (fx.choose) { picked = fx.choose[Math.max(0, Math.min(fx.choose.length - 1, choice | 0))]; fx = picked; }
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    for (const [who, gifts] of [[actor, fx.self], [partner, fx.partner]]) {
      const line = await TSLBondPowers.give(who, power.label, gifts, { emo });
      if (line) lines.push(line);
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--${sig ? "strong" : "success"} tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas ${sig ? "fa-star" : "fa-star-half-stroke"}"></i><span class="tsl-x-title">${sig ? "●●●" : "●●"} ${esc(power.label)}</span></div>
        <div class="tsl-x-who">${_t("{name} calls on the bond with {partner}", { name: esc(actor.name), partner: esc(partner?.name ?? "?") })}${picked ? ` — <b>${esc(picked.label)}</b>` : ""}</div>
        <div class="tsl-ab-text">${esc(power.text)}</div>
        ${lines.length ? `<ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--good">${l}</li>`).join("")}</ul>` : ""}
        <div class="tsl-ab-wait">${_t("Ready again after a long rest.")}</div>
      </div>`,
    });
    TSLBondAuras.refresh();   // the status says ready or spent
    return true;
  }

  /** ●●● — kept for older callers. */
  static async invokeSignature(args = {}) { return TSLBondPowers.invoke({ ...args, tier: 3 }); }

  /**
   * A long rest makes every power of that character's bonds ready again —
   * by itself, on whoever's client the rest was taken (the GM's, or the
   * owner's).
   *  • dnd5e: `dnd5e.restCompleted` (actor, result) — `result.longRest`.
   *  • a5e: `a5e.restCompleted` (its RestManager, { data, message }) — the
   *    rest type is `data.restType`; the actor is private to the manager, so
   *    it is read off the rest's own chat message (its speaker).
   */
  static registerRestHooks() {
    const ready = (actor) => {
      actor = actor ? (game.actors.get(actor.id) ?? actor) : null;
      if (actor && (game.user.isGM || actor.isOwner)) TSLBondStore.clearUsed(actor.id).catch(() => {});
    };
    Hooks.on("dnd5e.restCompleted", (actor, result) => { if (result?.longRest) ready(actor); });
    Hooks.on("a5e.restCompleted", (_mgr, info) => {
      if (info?.data?.restType !== "long") return;
      const sp = info?.message?.speaker ?? {};
      ready(game.actors.get(sp.actor) ?? globalThis.canvas?.tokens?.get?.(sp.token)?.actor ?? null);
    });
  }
}
