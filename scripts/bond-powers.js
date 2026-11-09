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
 *   • BONDS IN REACH (TSLBondNear) — on each viewer's screen: a bonded one's
 *     token, once your character is within that reach, wears the bond, and a
 *     corner panel lists it with what it gives right now.
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
 * Bonds in reach, on screen (the user, 2026-11-09: «Статус відносин з нпс має
 * показуватися на токені коли входить в його радіус. І в куточку екрану
 * відповідно теж»). Each client, for its own characters — a player's (the
 * ones they control, else every character of theirs on the map), the GM's
 * selected tokens: when one stands within the aura's reach of someone they
 * have a bond with, that one's token wears the bond (its type, ●, the Strings
 * between them), and a panel in the bottom-left corner, above the players,
 * lists each with what it gives right now. Display only: the aura on the
 * sheet is the GM's (TSLBondAuras). The badges live in the canvas HUD layer
 * (#hud, where the chat bubbles are), so they pan and zoom with the map.
 */
class TSLBondNear {

  /** The viewer's own switch (a client setting). */
  static enabled() {
    try { return game.settings.get(BOND_POWER_SCOPE, "bondNearShow") !== false; }
    catch { return true; }
  }

  /** "In reach" is the aura's reach; with auras off, 15 ft — the bond still shows. */
  static reach() {
    const r = TSLBondAuras.range();
    return r > 0 ? r : 15;
  }

  /** Can this viewer see that token? A badge never gives away a token the player can't see. */
  static seen(t) {
    if (game.user?.isGM) return true;
    return !t?.document?.hidden && t?.visible !== false;
  }

  /** This viewer's own characters on the map: the GM's selected tokens; a player's controlled ones, else all of theirs. */
  static mine() {
    const controlled = (canvas?.tokens?.controlled ?? []).filter(t => t.actor);
    if (game.user?.isGM) return controlled;
    const own = (t) => !!t.actor?.isOwner && SocialArchetypeManager.isPC(t.actor);
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

  /** The badge on their token: a line per bond (names when this viewer has several characters there). */
  static badgeHTML(infos, { names = false } = {}) {
    const esc = foundry.utils.escapeHTML;
    return infos.map(i => {
      const who = names ? `<span class="tsl-bm-who">${esc(game.actors.get(i.myId)?.name ?? "")}</span>` : "";
      const dots = i.type.id === "stranger" ? "" : `<span class="tsl-bm-dots">${TSLBondNear.dots(i.str)}</span>`;
      const strings = (i.mine ? `<i class="fas fa-check tsl-bm-str tsl-bm-str--mine"></i>` : "")
        + (i.theirs ? `<i class="fas fa-triangle-exclamation tsl-bm-str tsl-bm-str--theirs"></i>` : "");
      return `<div class="tsl-bm-line tsl-bm--${TSLBondNear.tone(i.type)}">${who}<i class="fas ${i.type.icon ?? "fa-link"} tsl-bm-icon"></i><span class="tsl-bm-type">${esc(i.type.label)}</span>${dots}${strings}</div>`;
    }).join("");
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
          <div class="tsl-bn-bond"><i class="fas ${i.type.icon ?? "fa-link"}"></i> ${esc(i.type.label)}${stranger ? "" : ` <span class="tsl-bn-dots">${TSLBondNear.dots(i.str)}</span>`}</div>
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

  /** Our layer inside the canvas HUD (rebuilt with the canvas, so looked up every time). */
  static _layer(create) {
    const hud = document.getElementById("hud");
    if (!hud) return null;
    let layer = document.getElementById("tsl-bond-marks");
    if (layer && layer.parentElement !== hud) { layer.remove(); layer = null; }
    if (!layer && create) {
      layer = document.createElement("div");
      layer.id = "tsl-bond-marks";
      hud.append(layer);
    }
    return layer;
  }

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

  static _renderBadges(pairs) {
    const layer = TSLBondNear._layer(pairs.length > 0);
    if (!layer) return;
    const names = new Set(pairs.map(p => p.me.actor.id)).size > 1;
    const byTok = new Map();
    for (const p of pairs) {
      const k = p.other.id ?? p.other.document?.id;
      if (!byTok.has(k)) byTok.set(k, { tok: p.other, list: [] });
      byTok.get(k).list.push(TSLBondNear.info(p));
    }
    const ui = canvas.dimensions?.uiScale ?? 1;
    for (const [k, { tok, list }] of byTok) {
      let el = [...layer.children].find(c => c.dataset.tslTok === k);
      if (!el) {
        el = document.createElement("div");
        el.className = "tsl-bond-mark";
        el.dataset.tslTok = k;
        layer.append(el);
      }
      const html = TSLBondNear.badgeHTML(list, { names });
      if (el._tslSig !== html) { el.innerHTML = html; el._tslSig = html; }
      // Centred over the top edge of their token, sized like its nameplate.
      el.style.left = `${tok.x + (tok.w ?? 0) / 2}px`;
      el.style.top = `${tok.y - 4 * ui}px`;
      el.style.fontSize = `${(15 * ui).toFixed(1)}px`;
    }
    for (const el of [...layer.children]) if (!byTok.has(el.dataset.tslTok)) el.remove();
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

  /** Recompute and redraw (badges and panel). */
  static update() {
    if (typeof document === "undefined") return;
    try {
      const pairs = TSLBondNear.enabled() ? TSLBondNear.pairs() : [];
      TSLBondNear._renderBadges(pairs);
      TSLBondNear._renderPanel(pairs);
    } catch (err) { console.error("TSL | Bonds in reach failed:", err); }
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
    // A new canvas rebuilds the HUD layer: the old badges (and the old scene's panel) go with it.
    Hooks.on("canvasTearDown", () => {
      document.getElementById("tsl-bond-marks")?.remove();
      document.getElementById("tsl-bond-near")?.remove();
    });
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
