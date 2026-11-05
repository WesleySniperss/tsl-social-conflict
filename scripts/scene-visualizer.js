/**
 * tsl-social-conflict | scene-visualizer.js
 *
 * The relationship map — a board for the whole table, in TWO windows (same
 * class, different `mode`):
 *   • "scene" — the characters on THIS canvas scene (a player sees only the
 *     tokens they can see).
 *   • "world" — every socially-relevant actor in the world: the GM's
 *     overview; a player sees only their own cast.
 *
 * On the board: portraits with their names (and a caption under the name, if
 * someone wrote one); bonds as lines (colour = approach, thickness = strength,
 * dashed = hostile) with a label that names the bond and carries its caption;
 * Strings as gold arrows from whoever holds one to whom; and captions pinned to
 * the board itself ("The abbey", "Owes the guild").
 *
 * Drag a portrait or a caption to move it, drag the background to pan, the
 * wheel zooms. A click shows who someone is and what ties them — nothing opens
 * on a click; the Chronicle opens from its button there.
 *
 * Where it is kept: the GM's arrangement and every caption are shared (the
 * scene's flag `board`, or the world setting `worldBoard`); a player's drags
 * arrange only their own view (kept in their browser). Anyone nobody has
 * placed is put by a small force layout — the same on every client — so the
 * bound stay close and strangers apart.
 *
 * A "social pulse" (an ask or a read resolving anywhere) plays on the board: a
 * beam speaker → NPC, a flash, the answer floating over them.
 *
 * ApplicationV1 (like the other windows), referenced defensively.
 */

console.log("TSL | Loading scene-visualizer.js...");

const _TSLVizBase = globalThis.Application ?? foundry?.appv1?.api?.Application;
const VIZ_SCOPE = "tsl-social-conflict";
/** A portrait's radius on the board: the 60px disc and its 3px ring. */
const VIZ_R = 33;

class TSLSceneVisualizer extends _TSLVizBase {

  // Two independent windows, keyed by mode.
  static _instances = { scene: null, world: null };
  static get instance() { return TSLSceneVisualizer._instances.scene; }

  constructor(options = {}) {
    super(options);
    this._mode    = options.mode === "world" ? "world" : "scene";
    this._pos     = new Map();   // actorId → { x, y } on the board (this render)
    this._pending = new Map();   // dropped but not saved yet — wins over the stored spot
    this._nodes = []; this._edges = []; this._holds = []; this._notes = [];
    this._view    = null;        // { x, y, z } — this client's pan and zoom
    this._sel     = null;        // { kind: "node" | "edge" | "note", id }
    this._animatingUntil = 0;    // while a pulse plays, auto re-renders wait
    this._rt = null;
    // Auto re-render — never mid-pulse, or the animation is wiped after a flash.
    // The change that triggers it often lands just BEFORE the pulse sets
    // _animatingUntil, so the tick re-checks when it fires.
    this._rerender = () => {
      clearTimeout(this._rt);
      const tick = () => {
        const remaining = this._animatingUntil - Date.now();
        if (remaining > 0) { this._rt = setTimeout(tick, remaining + 30); return; }
        if (this.rendered && !this._dragging) this.render(false);
        else if (this._dragging) this._rt = setTimeout(tick, 200);
      };
      this._rt = setTimeout(tick, 140);
    };
    this._hooks = [];
    this._bindHooks();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tsl-scene-visualizer",
      classes: ["tsl-viz"],
      title: _t("Social Scene"),
      template: null,
      width: 900,
      height: 700,
      resizable: true,
      minimizable: true,
    });
  }

  static open(mode = "scene") {
    const key = mode === "world" ? "world" : "scene";
    const existing = TSLSceneVisualizer._instances[key];
    if (existing) { existing.render(true); existing.bringToTop?.(); return existing; }
    const app = new TSLSceneVisualizer({
      mode: key,
      id:      key === "world" ? "tsl-relationship-visualizer" : "tsl-scene-visualizer",
      title:   key === "world" ? _t("Web of Bonds — all relationships") : _t("Social Scene"),
      classes: ["tsl-viz", key === "world" ? "tsl-viz--world" : "tsl-viz--scene"],
    });
    TSLSceneVisualizer._instances[key] = app;
    app.render(true);
    return app;
  }

  static toggle(mode = "scene") {
    const key = mode === "world" ? "world" : "scene";
    if (TSLSceneVisualizer._instances[key]) TSLSceneVisualizer._instances[key].close();
    else TSLSceneVisualizer.open(key);
  }

  // ── Live-update hooks ──────────────────────────────────────────────────────

  _bindHooks() {
    const on = (name, fn) => this._hooks.push([name, Hooks.on(name, fn)]);
    // Bonds, Strings, natures, captions live on actor flags.
    on("updateActor", (actor, chg) => {
      if (foundry.utils.hasProperty(chg, `flags.${VIZ_SCOPE}`) || "name" in (chg ?? {}) || "img" in (chg ?? {})) this._rerender();
    });
    // Emotions and scars are ActiveEffects — only ours move the map, not every
    // condition and concentration check of a fight.
    const effectTouch = (effect) => {
      if (effect?.parent?.documentName !== "Actor") return;
      if (effect.flags?.[VIZ_SCOPE] || [...(effect.statuses ?? [])].some(s => String(s).startsWith("tsl-"))) this._rerender();
    };
    on("createActiveEffect", effectTouch);
    on("deleteActiveEffect", effectTouch);
    on("updateActiveEffect", effectTouch);
    on("canvasReady", () => this._rerender());
    // This scene's board, or whether it's public.
    on("updateScene", (scene, chg) => {
      if (scene?.id === globalThis.canvas?.scene?.id && foundry.utils.hasProperty(chg ?? {}, `flags.${VIZ_SCOPE}`)) this._rerender();
    });
    // The Web of Bonds' board.
    on("updateSetting", (setting) => { if (setting?.key === `${VIZ_SCOPE}.worldBoard` && this._mode === "world") this._rerender(); });
    on("createToken", () => this._rerender());
    on("deleteToken", () => this._rerender());
    on("updateToken", (_doc, chg) => { if ("hidden" in (chg ?? {})) this._rerender(); });
  }

  async close(options = {}) {
    clearTimeout(this._rt);
    for (const [name, id] of this._hooks) Hooks.off(name, id);
    this._hooks = [];
    if (TSLSceneVisualizer._instances[this._mode] === this) TSLSceneVisualizer._instances[this._mode] = null;
    return super.close(options);
  }

  async _renderInner() {
    return $(this._renderHTML());
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  /** School → colour, from the canonical triad palette. */
  static schoolColor(school) {
    return SOCIAL_TRIADS?.[school]?.color ?? "#8a7d72";
  }

  /** A node record from an actor (+ optional token for its art). */
  _nodeData(actor, tok) {
    const arch = SocialArchetypeManager.getArchetype(actor);
    const revealed = SocialArchetypeManager.isRevealed(actor);
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img || tok?.document?.texture?.src || "icons/svg/mystery-man.svg",
      pc: SocialArchetypeManager.isPC(actor),
      title: SocialArchetypeManager.getCharacterNotes(actor).title,
      arch,
      named: arch && revealed ? arch : null,
      seems: revealed ? null : SocialArchetypeManager.getShown(actor),
      unmasked: !revealed && SocialArchetypeManager.getKnown(actor).mask && !!SocialArchetypeManager.getMask(actor),
      hasBond: TSLBondStore.getList(actor.id).length > 0 || TSLStringStore.getList(actor.id).length > 0,
      emotions: TSLEmotions.of(actor).map(e => e.id),
    };
  }

  static _isRelevant(nd) {
    return nd.pc || nd.hasBond || !!nd.named || !!nd.seems || nd.emotions.length > 0 || !!nd.title;
  }

  /**
   * Who belongs on the board — player characters first, then by name (every
   * client gets the same order, so the same layout).
   *  • scene: the socially-relevant cast among the tokens on THIS scene (a
   *    player only sees tokens they can see);
   *  • world: every socially-relevant actor (a player: those they own or
   *    that a player owns).
   */
  _collectNodes() {
    const isGM  = game.user.isGM;
    const nodes = [];
    const seen  = new Set();
    const take = (actor, tok) => {
      if (!actor || seen.has(actor.id)) return;
      const nd = this._nodeData(actor, tok);
      if (!TSLSceneVisualizer._isRelevant(nd)) return;
      seen.add(actor.id);
      nodes.push(nd);
    };
    if (this._mode === "world") {
      for (const actor of game.actors) {
        if (!isGM && !(actor?.isOwner || actor?.hasPlayerOwner)) continue;
        take(actor, null);
      }
    } else {
      for (const tok of (canvas.tokens?.placeables ?? [])) {
        if (!isGM && (tok.document?.hidden || !tok.visible)) continue;
        // The world actor: an unlinked token's synthetic actor keeps no chronicle of its own.
        take(tok.actor ? (game.actors.get(tok.actor.id) ?? tok.actor) : null, tok);
      }
    }
    return nodes.sort((a, b) => (b.pc - a.pc) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  /**
   * One line per related pair. A bond is kept on both sides (mirrored) — the
   * line reads both: their two names when they differ (Mentor · Protégé), the
   * stronger strength, the caption from either side. A Stranger pair gets a
   * line only when it carries a caption.
   */
  _collectEdges(ids) {
    const set = new Set(ids);
    const pairs = new Map();
    for (const aId of ids) {
      for (const b of TSLBondStore.getList(aId)) {
        const bId = b.targetActorId;
        if (!set.has(bId) || aId === bId) continue;
        const key = [aId, bId].sort().join("|");
        const p = pairs.get(key) ?? { key, sides: {} };
        p.sides[aId] = b;
        pairs.set(key, p);
      }
    }
    const strength = (b) => (b ? Math.min(3, Math.abs(b.attitude ?? 0)) : 0);
    const out = [];
    for (const p of pairs.values()) {
      const [aId, bId] = p.key.split("|");
      const sa = p.sides[aId], sb = p.sides[bId];
      const ta = sa ? SocialArchetypeManager.getBondType(sa.type) : null;
      const tb = sb ? SocialArchetypeManager.getBondType(sb.type) : null;
      const real = (t) => t && t.id !== "stranger";
      const main = real(ta) ? ta : real(tb) ? tb : null;
      const label = String(sa?.label || sb?.label || "").trim();
      if (!main && !label) continue;
      const names = main && real(ta) && real(tb) && ta.id !== tb.id ? [ta.label, tb.label] : main ? [main.label] : [];
      out.push({
        key: p.key, aId, bId, names, label,
        type: main?.id ?? "stranger",
        stranger: !main,
        hostile: !!main?.hostile,
        school: main?.school ?? null,
        color: main ? TSLSceneVisualizer.schoolColor(main.school) : "#8a7d72",
        strength: main ? Math.max(strength(real(ta) ? sa : null), strength(real(tb) ? sb : null)) : 0,
      });
    }
    return out;
  }

  /** Strings between people on the board: the GM sees them all, a player those that touch their own characters. */
  _collectHolds(ids) {
    const set = new Set(ids);
    const mine = (id) => game.user.isGM || !!game.actors.get(id)?.isOwner;
    const out = [];
    for (const from of ids) {
      const by = new Map();
      for (const s of TSLStringStore.getList(from)) {
        if (s.targetActorId !== from && set.has(s.targetActorId)) by.set(s.targetActorId, (by.get(s.targetActorId) ?? 0) + 1);
      }
      for (const [to, n] of by) if (mine(from) || mine(to)) out.push({ from, to, n });
    }
    return out;
  }

  // ── The board: where people stand, and the captions pinned to it ───────────

  /** The shared board of a mode: { pos: [{id, x, y}], notes: [{id, x, y, text}] }. */
  static boardData(mode, scene = globalThis.canvas?.scene) {
    let raw = {};
    try {
      raw = mode === "world" ? (game.settings.get(VIZ_SCOPE, "worldBoard") ?? {}) : (scene?.getFlag?.(VIZ_SCOPE, "board") ?? {});
    } catch { raw = {}; }
    return {
      pos: Array.isArray(raw?.pos) ? raw.pos.filter(p => p?.id && Number.isFinite(p.x) && Number.isFinite(p.y)) : [],
      notes: Array.isArray(raw?.notes) ? raw.notes.filter(n => n?.id && Number.isFinite(n.x) && Number.isFinite(n.y)) : [],
    };
  }

  /**
   * GM: change the shared board. `pos` — spots for portraits; `note` — a
   * caption added or changed (its id, and x/y and/or text); `removeNote` — a
   * caption's id to take off; `resetPos` — everyone back to the automatic
   * layout. Players' captions arrive here through the GM relay.
   */
  static async applyBoardPatch({ mode = "scene", sceneId = null, pos = null, note = null, removeNote = null, resetPos = false } = {}) {
    if (!game.user.isGM) return;
    const world = mode === "world";
    const scene = world ? null : (game.scenes?.get?.(sceneId) ?? globalThis.canvas?.scene ?? null);
    if (!world && !scene?.setFlag) return;
    const data = TSLSceneVisualizer.boardData(world ? "world" : "scene", scene);
    const num = (v) => (Number.isFinite(+v) ? Math.round(+v) : null);
    if (resetPos) data.pos = [];
    for (const p of (Array.isArray(pos) ? pos : [])) {
      const x = num(p?.x), y = num(p?.y);
      if (!p?.id || x == null || y == null) continue;
      data.pos = data.pos.filter(q => q.id !== p.id).concat({ id: String(p.id), x, y });
    }
    if (note?.id) {
      const x = num(note.x), y = num(note.y);
      const text = "text" in note ? String(note.text ?? "").trim().slice(0, 200) : null;
      const i = data.notes.findIndex(n => n.id === note.id);
      if (i >= 0) {
        if (text === "") data.notes.splice(i, 1);
        else data.notes[i] = { ...data.notes[i], ...(x != null ? { x } : {}), ...(y != null ? { y } : {}), ...(text != null ? { text } : {}) };
      } else if (text && x != null && y != null) data.notes.push({ id: String(note.id), x, y, text });
    }
    if (removeNote) data.notes = data.notes.filter(n => n.id !== removeNote);
    if (data.notes.length > 100) data.notes = data.notes.slice(-100);
    if (world) await game.settings.set(VIZ_SCOPE, "worldBoard", data);
    else await scene.setFlag(VIZ_SCOPE, "board", data);
  }

  /** A player's own arrangement (this browser only). */
  _localKey() {
    return `${VIZ_SCOPE}.board.${this._mode === "world" ? "world" : (globalThis.canvas?.scene?.id ?? "none")}.${game.user?.id ?? "?"}`;
  }
  _localPos() {
    if (game.user.isGM) return {};
    try { return JSON.parse(globalThis.localStorage?.getItem(this._localKey()) ?? "{}") ?? {}; } catch { return {}; }
  }
  _saveLocal(obj) {
    try { globalThis.localStorage?.setItem(this._localKey(), JSON.stringify(obj)); } catch { /* private window */ }
  }

  /**
   * Where everyone stands: a placed portrait keeps its spot; the rest are put
   * by a small force layout (deterministic — every client gets the same):
   * player characters start in the middle, the cast around them; bonds pull
   * people together, everyone pushes everyone apart, and nobody drifts off.
   */
  _layout(nodes, edges, holds, fixed) {
    const P = new Map();
    for (const [id, p] of fixed) P.set(id, { x: p.x, y: p.y });
    const free = nodes.filter(n => !P.has(n.id));
    const pcs = free.filter(n => n.pc), npcs = free.filter(n => !n.pc);
    // Start free people near the middle of whoever is already placed.
    let cx = 0, cy = 0;
    if (P.size) { for (const p of P.values()) { cx += p.x; cy += p.y; } cx /= P.size; cy /= P.size; }
    const ring = (list, r, phase) => list.forEach((n, i) => {
      const a = phase + (i / Math.max(1, list.length)) * Math.PI * 2;
      P.set(n.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    });
    ring(pcs, pcs.length > 1 ? 120 : 0, -Math.PI / 2);
    ring(npcs, 250 + npcs.length * 8, -Math.PI / 2 + 0.35);
    if (!free.length) return P;

    const ids = nodes.map(n => n.id);
    const links = [...edges.map(e => [e.aId, e.bId, 1]), ...holds.map(h => [h.from, h.to, 0.35])];
    const isFree = new Set(free.map(n => n.id));
    for (let it = 0; it < 240; it++) {
      const F = new Map(ids.map(id => [id, { x: 0, y: 0 }]));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = P.get(ids[i]), b = P.get(ids[j]);
          let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (j - i) || 1; dy = 1; d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2), f = 30000 / d2;
          F.get(ids[i]).x += (dx / d) * f; F.get(ids[i]).y += (dy / d) * f;
          F.get(ids[j]).x -= (dx / d) * f; F.get(ids[j]).y -= (dy / d) * f;
        }
      }
      for (const [s, t, w] of links) {
        const a = P.get(s), b = P.get(t);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 200) * 0.05 * w;
        F.get(s).x += (dx / d) * f; F.get(s).y += (dy / d) * f;
        F.get(t).x -= (dx / d) * f; F.get(t).y -= (dy / d) * f;
      }
      const cap = 26 * (1 - it / 260);
      for (const id of ids) {
        if (!isFree.has(id)) continue;
        const f = F.get(id), p = P.get(id);
        f.x -= (p.x - cx) * 0.012; f.y -= (p.y - cy) * 0.012;   // nobody drifts off
        const m = Math.hypot(f.x, f.y), k = m > cap ? cap / m : 1;
        P.set(id, { x: p.x + f.x * k, y: p.y + f.y * k });
      }
    }
    return P;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _renderHTML() {
    const esc   = foundry.utils.escapeHTML;
    const isGM  = game.user.isGM;
    const world = this._mode === "world";
    this._pending ??= new Map();     // defensive (survives Object.create in tests)
    const nodes = this._collectNodes();
    const ids = nodes.map(n => n.id);
    const edges = this._collectEdges(ids);
    const holds = this._collectHolds(ids);
    const board = TSLSceneVisualizer.boardData(this._mode);
    const fixed = new Map(board.pos.filter(p => ids.includes(p.id)).map(p => [p.id, p]));
    const local = this._localPos();
    for (const id of ids) if (local[id]) fixed.set(id, local[id]);
    for (const [id, p] of this._pending) if (ids.includes(id)) fixed.set(id, p);
    this._nodes = nodes; this._edges = edges; this._holds = holds; this._notes = board.notes;
    this._pos = this._layout(nodes, edges, holds, fixed);
    this._hasLocal = !isGM && Object.keys(local).some(id => ids.includes(id));
    if (this._sel && !this._selExists(this._sel)) this._sel = null;

    // ── Header ──
    const modeBtn = world
      ? `<button type="button" class="tsl-viz-mode" data-open-mode="scene" data-tooltip="${esc(_t("Switch to just this scene — what players see"))}"><i class="fas fa-clapperboard"></i> ${_t("This scene")}</button>`
      : (isGM ? `<button type="button" class="tsl-viz-mode" data-open-mode="world" data-tooltip="${esc(_t("Open the full web — every relationship in the world"))}"><i class="fas fa-globe"></i> ${_t("All bonds")}</button>` : "");
    // A public scene (a court, a feast, Elysium): every ask here starts before witnesses.
    const pub = !world && TSLTalk.publicScene();
    const publicBtn = world ? "" : isGM
      ? `<button type="button" class="tsl-viz-mode tsl-viz-public ${pub ? "on" : ""}" data-public data-tooltip="${esc(pub
          ? _t("The whole scene is before witnesses — a court, a feast, a crowd: every ask and gambit here starts before witnesses. Click to make it private.")
          : _t("The scene is private. Click to put every ask and gambit here before witnesses — a court, a feast, a crowd."))}"><i class="fas ${pub ? "fa-users" : "fa-user-lock"}"></i> ${pub ? _t("Before witnesses") : _t("In private")}</button>`
      : pub ? `<span class="tsl-viz-public on" data-tooltip="${esc(_t("This scene is before witnesses — a court, a feast, a crowd."))}"><i class="fas fa-users"></i> ${_t("Before witnesses")}</span>` : "";
    const noteBtn = this._canNotes() ? `<button type="button" class="tsl-viz-mode" data-add-note data-tooltip="${esc(_t("Pin a caption to the board — a place, a faction, a rumour. Everyone sees it; drag it where it belongs."))}"><i class="fas fa-note-sticky"></i> ${_t("Caption")}</button>` : "";
    const resetBtn = isGM
      ? `<button type="button" class="tsl-viz-zoom-btn" data-reset-layout data-tooltip="${esc(_t("Arrange everyone afresh — for every player"))}"><i class="fas fa-wand-magic-sparkles"></i></button>`
      : this._hasLocal ? `<button type="button" class="tsl-viz-mode" data-reset-layout data-tooltip="${esc(_t("Put everyone back where the GM placed them"))}"><i class="fas fa-rotate-left"></i> ${_t("As the GM has it")}</button>` : "";
    const sub = `${world ? _t("in the web: {n}", { n: nodes.length }) : _t("on the map: {n}", { n: nodes.length })} · ${_t("bonds: {n}", { n: edges.filter(e => !e.stranger).length })}`;
    const head = `
      <div class="tsl-viz-head">
        <span class="tsl-viz-title"><i class="fas ${world ? "fa-globe" : "fa-people-arrows"}"></i> ${world ? _t("Web of Bonds") : _t("The Social Scene")}</span>
        <span class="tsl-viz-sub">${sub}</span>
        ${publicBtn}${noteBtn}${modeBtn}
        <span class="tsl-viz-zoom">
          <button type="button" class="tsl-viz-zoom-btn" data-zoom="out" data-tooltip="${esc(_t("Zoom out"))}">−</button>
          <button type="button" class="tsl-viz-zoom-btn" data-zoom="fit" data-tooltip="${esc(_t("Show everyone"))}"><i class="fas fa-expand"></i></button>
          <button type="button" class="tsl-viz-zoom-btn" data-zoom="in" data-tooltip="${esc(_t("Zoom in"))}">+</button>
        </span>
        ${resetBtn}
      </div>`;

    if (!nodes.length && !board.notes.length) {
      const empty = world
        ? _t("No relationships yet anywhere — set bonds in any character's Chronicle and the whole web appears here.")
        : _t("No social scene yet — no bonded characters on the canvas. Set relationships in a token's Chronicle, and they'll appear here.");
      return `<div class="tsl-viz-root">${head}<div class="tsl-viz-empty">${empty}</div></div>`;
    }

    const lit = this._lit();
    const nodeHtml = nodes.map(nd => {
      const p = this._pos.get(nd.id);
      const tint = (a) => SOCIAL_TRIADS[a.triad]?.color ?? "#9b6ee8";
      const tag = nd.named
        ? `<div class="tsl-viz-named" style="--c:${tint(nd.named)}" data-tooltip="${esc(_t("Figured out: {nature} — {description}", { nature: nd.named.label, description: nd.named.description }))}">${esc(nd.named.label)}</div>`
        : nd.seems
        ? `<div class="tsl-viz-named tsl-viz-named--seems ${nd.unmasked ? "tsl-viz-named--mask" : ""}" style="--c:${tint(nd.seems)}" data-tooltip="${esc(nd.unmasked
            ? _t("A mask: they only play the {mask}. Who they really are is still unread.", { mask: nd.seems.label })
            : _t("What they show: the {nature} — maybe their true face, maybe a mask.", { nature: nd.seems.label }))}">${nd.unmasked
            ? `<i class="fas fa-mask"></i> ${esc(nd.seems.label)}` : esc(_t("seems: {nature}", { nature: nd.seems.label }))}</div>`
        : "";
      const ring = nd.pc ? "var(--tsl-sway, #e0b45e)" : nd.named ? tint(nd.named) : "rgba(255, 255, 255, 0.28)";
      const emos = nd.emotions.length ? `<div class="tsl-viz-emos">${nd.emotions.map(id => `<img src="${EMOTIONS[id].img}" alt="" data-tooltip="${esc(`${EMOTIONS[id].label} — ${EMOTIONS[id].spoilsText}`)}">`).join("")}</div>` : "";
      const cls = `${nd.pc ? " tsl-viz-node--pc" : ""}${this._sel?.kind === "node" && this._sel.id === nd.id ? " sel" : ""}${lit && !lit.nodes.has(nd.id) ? " dim" : ""}`;
      return `<div class="tsl-viz-node${cls}" data-node="${nd.id}" data-actor-id="${nd.id}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px">
        <div class="tsl-viz-disc" style="--ring:${ring}"><img class="tsl-viz-portrait" src="${esc(nd.img)}" alt="" draggable="false"></div>
        <div class="tsl-viz-name">${esc(nd.name)}</div>
        ${nd.title ? `<div class="tsl-viz-caption">${esc(nd.title)}</div>` : ""}
        ${tag}${emos}
      </div>`;
    }).join("");
    const noteHtml = board.notes.map(n => `<div class="tsl-viz-note${this._sel?.kind === "note" && this._sel.id === n.id ? " sel" : ""}${lit ? " dim" : ""}" data-note="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px">${esc(n.text)}</div>`).join("");

    const legend = `
      <div class="tsl-viz-legend">
        ${APPROACH_ORDER.map(id => {
          const ap = APPROACHES[id];
          const types = BOND_TYPES.filter(t => SocialArchetypeManager.bondApproach(t.id) === id).map(t => t.label).join(", ");
          return `<span data-tooltip="${esc(_t("{approach} bonds — {types}", { approach: ap.label, types }))}"><span style="color:${ap.color}">◼</span> <i style="color:${ap.color}">${ap.label}</i></span>`;
        }).join("")}
        <span><span class="tsl-viz-legend-hold">⟶</span> ${_t("a String: who holds one on whom")}</span>
        <span class="tsl-viz-legend-note">${_t("thicker = stronger · dashed = hostile")}</span>
      </div>
      <div class="tsl-viz-hint"><i class="fas fa-hand-pointer"></i> ${_t("Drag a portrait or a caption to move it · drag the background to pan · the wheel zooms · a click shows who they are and what ties them.")}${isGM
        ? ` ${_t("Where you put them, everyone sees.")}` : ` ${_t("Your arrangement is yours alone.")}`}</div>`;

    const v = this._view;
    const transform = v ? `transform:translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) scale(${v.z.toFixed(3)});` : "";
    return `
      <div class="tsl-viz-root">
        ${head}
        <div class="tsl-viz-viewport" data-viewport>
          <div class="tsl-viz-world" style="${transform}">
            <svg class="tsl-viz-svg" width="1" height="1">${this._svgInner()}</svg>
            <div class="tsl-viz-chips">${this._chipsHTML()}</div>
            ${noteHtml}
            ${nodeHtml}
          </div>
          ${this._panelHTML()}
        </div>
        ${legend}
      </div>`;
  }

  /** What the selection lights up (the rest dims): a person and everyone tied to them; a pair. */
  _lit() {
    const s = this._sel;
    if (!s || s.kind === "note") return null;
    if (s.kind === "node") {
      const nodes = new Set([s.id]);
      for (const e of this._edges) if (e.aId === s.id || e.bId === s.id) { nodes.add(e.aId); nodes.add(e.bId); }
      for (const h of this._holds) if (h.from === s.id || h.to === s.id) { nodes.add(h.from); nodes.add(h.to); }
      return { nodes, pair: (a, b) => a === s.id || b === s.id };
    }
    const [a, b] = s.id.split("|");
    return { nodes: new Set([a, b]), pair: (x, y) => [x, y].sort().join("|") === s.id };
  }

  _selExists(s) {
    if (s.kind === "node") return this._nodes.some(n => n.id === s.id);
    if (s.kind === "note") return this._notes.some(n => n.id === s.id);
    const [a, b] = s.id.split("|");
    return this._pos.has(a) && this._pos.has(b);
  }

  /** A String's arrow: from the holder's portrait to the target's, bent to one side (so two ways part). */
  _holdPath(h) {
    const a = this._pos.get(h.from), b = this._pos.get(h.to);
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < VIZ_R * 2 + 12) return null;
    const ux = dx / d, uy = dy / d;
    const sx = a.x + ux * (VIZ_R + 4), sy = a.y + uy * (VIZ_R + 4);
    const ex = b.x - ux * (VIZ_R + 7), ey = b.y - uy * (VIZ_R + 7);
    const bend = Math.min(56, d * 0.24);
    const qx = (sx + ex) / 2 - uy * bend, qy = (sy + ey) / 2 + ux * bend;
    // Its mask sits two thirds along, nearer the one it's held on — clear of the bond's label in the middle.
    const t = 0.68, u = 1 - t;
    return {
      d: `M${sx.toFixed(1)},${sy.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
      mx: u * u * sx + 2 * u * t * qx + t * t * ex, my: u * u * sy + 2 * u * t * qy + t * t * ey,
    };
  }

  _svgInner() {
    const lit = this._lit();
    const arrow = `tsl-viz-arrow-${this._mode}`;
    const lines = this._edges.map(e => {
      const a = this._pos.get(e.aId), b = this._pos.get(e.bId);
      if (!a || !b) return "";
      const w = e.stranger ? 1.2 : 1.6 + e.strength * 1.5;
      const op = e.stranger ? 0.45 : 0.42 + e.strength * 0.17;
      const dash = e.stranger ? ` stroke-dasharray="2 6"` : e.hostile ? ` stroke-dasharray="11 6"` : "";
      const cls = `tsl-viz-edge${e.strength >= 3 ? " tsl-viz-edge--strong" : ""}${lit ? (lit.pair(e.aId, e.bId) ? " lit" : " dim") : ""}`;
      return `<line class="${cls}" data-a="${e.aId}" data-b="${e.bId}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
        stroke="${e.color}" stroke-width="${w.toFixed(1)}" stroke-opacity="${op.toFixed(2)}" stroke-linecap="round"${dash} />`;
    }).join("");
    const holds = this._holds.map(h => {
      const p = this._holdPath(h);
      if (!p) return "";
      return `<path class="tsl-viz-hold${lit ? (lit.pair(h.from, h.to) ? " lit" : " dim") : ""}" d="${p.d}" marker-end="url(#${arrow})" />`;
    }).join("");
    return `<defs><marker id="${arrow}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#e0b45e" /></marker></defs>
      <g class="tsl-viz-lines">${lines}</g><g class="tsl-viz-holdlines">${holds}</g>`;
  }

  _chipsHTML() {
    const esc = foundry.utils.escapeHTML;
    const lit = this._lit();
    const edgeChips = this._edges.map(e => {
      const a = this._pos.get(e.aId), b = this._pos.get(e.bId);
      if (!a || !b) return "";
      const sel = this._sel?.kind === "edge" && this._sel.id === e.key;
      const cls = `${sel ? " sel" : ""}${lit && !lit.pair(e.aId, e.bId) ? " dim" : ""}${e.stranger ? " tsl-viz-edge-chip--bare" : ""}`;
      const head = e.stranger ? "" : `<span class="tsl-viz-edge-type">${e.names.map(n => esc(n)).join(" · ")}</span><span class="tsl-viz-edge-dots">${"●".repeat(e.strength)}${"○".repeat(3 - e.strength)}</span>`;
      return `<div class="tsl-viz-edge-chip${cls}" data-edge="${e.key}" style="left:${((a.x + b.x) / 2).toFixed(1)}px;top:${((a.y + b.y) / 2).toFixed(1)}px;--edge-col:${e.color}">${head}${e.label ? `<span class="tsl-viz-edge-label">${esc(e.label)}</span>` : ""}</div>`;
    }).join("");
    const holdChips = this._holds.map(h => {
      const p = this._holdPath(h);
      if (!p) return "";
      const tip = _t("{holder} holds a String on {target}", { holder: game.actors.get(h.from)?.name ?? "?", target: game.actors.get(h.to)?.name ?? "?" });
      return `<div class="tsl-viz-hold-chip${lit && !lit.pair(h.from, h.to) ? " dim" : ""}" data-edge="${[h.from, h.to].sort().join("|")}" style="left:${p.mx.toFixed(1)}px;top:${p.my.toFixed(1)}px" data-tooltip="${esc(tip)}"><i class="fas fa-masks-theater"></i></div>`;
    }).join("");
    return edgeChips + holdChips;
  }

  // ── The panel: who they are, what ties them ────────────────────────────────

  _panelHTML() {
    const s = this._sel;
    if (!s) return "";
    const body = s.kind === "node" ? this._panelNode(s.id) : s.kind === "edge" ? this._panelEdge(s.id) : this._panelNote(s.id);
    if (!body) return "";
    return `<div class="tsl-viz-panel"><button type="button" class="tsl-viz-panel-x" data-desel aria-label="${foundry.utils.escapeHTML(_t("Close"))}">×</button>${body}</div>`;
  }

  _panelNode(id) {
    const esc = foundry.utils.escapeHTML;
    const actor = game.actors.get(id), nd = this._nodes.find(n => n.id === id);
    if (!actor || !nd) return "";
    const isGM = game.user.isGM;
    const mayEdit = isGM || actor.isOwner;
    const onBoard = new Set(this._nodes.map(n => n.id));
    const tint = (a) => SOCIAL_TRIADS[a.triad]?.color ?? "#9b6ee8";
    // The nature, as far as the table knows it (the GM also sees the truth).
    const nature = nd.named ? `<span class="tsl-viz-named" style="--c:${tint(nd.named)}">${esc(nd.named.label)}</span>`
      : nd.seems ? `<span class="tsl-viz-named tsl-viz-named--seems" style="--c:${tint(nd.seems)}">${esc(nd.unmasked ? _t("{mask} — a mask", { mask: nd.seems.label }) : _t("seems: {nature}", { nature: nd.seems.label }))}</span>`
      : nd.pc ? "" : `<span class="tsl-viz-dim">${_t("Nature unread")}</span>`;
    const truth = isGM && nd.arch && !nd.named ? `<div class="tsl-viz-p-row tsl-viz-dim">${_t("Their nature (only you see it): {nature}", { nature: esc(nd.arch.label) })}</div>` : "";
    const feels = TSLEmotions.of(actor).map(e => {
      const d = EMOTIONS[e.id];
      const toward = e.toward ? game.actors.get(e.toward)?.name : null;
      return `<span class="tsl-viz-emo" style="--c:${d.color}" data-tooltip="${esc(`${d.label} — ${d.spoilsText}`)}"><img src="${d.img}" alt=""> ${esc(d.label)}${toward ? ` → ${esc(toward)}` : ""}</span>`;
    }).join("");
    // Their bonds: to whoever is on the board (the GM: to anyone at all).
    const bonds = TSLBondStore.getList(id).map(b => {
      const other = game.actors.get(b.targetActorId);
      if (!other || (!isGM && !onBoard.has(other.id))) return "";
      const t = SocialArchetypeManager.getBondType(b.type), str = Math.min(3, Math.abs(b.attitude ?? 0));
      if (t.id === "stranger" && !b.label) return "";   // a String alone makes Strangers — the arrows already say it
      const pick = onBoard.has(other.id) ? ` data-sel-edge="${[id, other.id].sort().join("|")}" class="tsl-viz-click"` : "";
      return `<li${pick}><b>${esc(other.name)}</b> — <span style="color:${TSLSceneVisualizer.schoolColor(t.school)}">${esc(t.label)}</span>${t.id !== "stranger" ? ` <span class="tsl-viz-dots">${"●".repeat(str)}${"○".repeat(3 - str)}</span>` : ""}${b.label ? ` <i>«${esc(b.label)}»</i>` : ""}</li>`;
    }).filter(Boolean).join("");
    const holdsOn = this._holds.filter(h => h.from === id).map(h => esc(game.actors.get(h.to)?.name ?? "?"));
    const heldBy  = this._holds.filter(h => h.to === id).map(h => esc(game.actors.get(h.from)?.name ?? "?"));
    const strings = [
      holdsOn.length ? `<div class="tsl-viz-p-row"><i class="fas fa-masks-theater"></i> ${_t("Holds a String on: {list}", { list: holdsOn.join(", ") })}</div>` : "",
      heldBy.length ? `<div class="tsl-viz-p-row"><i class="fas fa-masks-theater"></i> ${_t("A String on them is held by: {list}", { list: heldBy.join(", ") })}</div>` : "",
    ].join("");
    return `
      <div class="tsl-viz-p-head"><img src="${esc(nd.img)}" alt=""><div><b>${esc(nd.name)}</b>${nd.title ? `<small>${esc(nd.title)}</small>` : ""}${nature ? `<div>${nature}</div>` : ""}</div></div>
      ${truth}
      ${feels ? `<div class="tsl-viz-p-row tsl-viz-p-feels">${feels}</div>` : ""}
      ${bonds ? `<div class="tsl-viz-p-label">${_t("Bonds")}</div><ul class="tsl-viz-p-list">${bonds}</ul>` : `<div class="tsl-viz-p-row tsl-viz-dim">${_t("No bonds yet.")}</div>`}
      ${strings}
      <div class="tsl-viz-p-actions">
        ${mayEdit ? `<button type="button" data-edit-title="${id}"><i class="fas fa-pen"></i> ${nd.title ? _t("Change the caption") : _t("Add a caption")}</button>` : ""}
        ${mayEdit ? `<button type="button" data-open-chron="${id}"><i class="fas fa-address-book"></i> ${_t("Open the Chronicle")}</button>` : ""}
      </div>`;
  }

  _panelEdge(key) {
    const esc = foundry.utils.escapeHTML;
    const [aId, bId] = key.split("|");
    const a = game.actors.get(aId), b = game.actors.get(bId);
    if (!a || !b) return "";
    const e = this._edges.find(x => x.key === key);
    const sa = TSLBondStore.find(aId, bId), sb = TSLBondStore.find(bId, aId);
    const rows = [];
    if (e && !e.stranger) {
      const ta = sa ? SocialArchetypeManager.getBondType(sa.type) : null, tb = sb ? SocialArchetypeManager.getBondType(sb.type) : null;
      if (ta && tb && ta.id !== tb.id) {
        rows.push(`<div class="tsl-viz-p-row">${_t("{a} to {b}: {type}", { a: esc(a.name), b: esc(b.name), type: `<b>${esc(ta.label)}</b>` })}</div>`);
        rows.push(`<div class="tsl-viz-p-row">${_t("{a} to {b}: {type}", { a: esc(b.name), b: esc(a.name), type: `<b>${esc(tb.label)}</b>` })}</div>`);
      } else rows.push(`<div class="tsl-viz-p-row"><b>${esc(e.names[0] ?? "")}</b> <span class="tsl-viz-dots" style="color:${e.color}">${"●".repeat(e.strength)}${"○".repeat(3 - e.strength)}</span></div>`);
      const ap = APPROACHES[SocialArchetypeManager.bondApproach(e.type)];
      if (ap && e.strength) rows.push(`<div class="tsl-viz-p-row tsl-viz-dim">${e.hostile
        ? _t("+{n} on {approach} against each other, −{n} on anything else: they won't hear each other out.", { n: e.strength, approach: ap.label })
        : _t("+{n} on {approach} against each other", { n: e.strength, approach: ap.label })}</div>`);
    } else rows.push(`<div class="tsl-viz-p-row tsl-viz-dim">${_t("No bond between them yet.")}</div>`);
    if (e?.label) rows.push(`<div class="tsl-viz-p-row tsl-viz-p-caption">«${esc(e.label)}»</div>`);
    for (const h of this._holds.filter(h => [h.from, h.to].sort().join("|") === key)) {
      rows.push(`<div class="tsl-viz-p-row"><i class="fas fa-masks-theater"></i> ${esc(_t("{holder} holds a String on {target}", { holder: game.actors.get(h.from)?.name ?? "?", target: game.actors.get(h.to)?.name ?? "?" }))}</div>`);
    }
    const mayLabel = game.user.isGM || a.isOwner || b.isOwner;
    return `
      <div class="tsl-viz-p-head tsl-viz-p-head--pair"><img src="${esc(a.img || "icons/svg/mystery-man.svg")}" alt=""><i class="fas fa-arrows-left-right"></i><img src="${esc(b.img || "icons/svg/mystery-man.svg")}" alt="">
        <div><b>${esc(a.name)}</b> &amp; <b>${esc(b.name)}</b></div></div>
      ${rows.join("")}
      <div class="tsl-viz-p-actions">
        ${mayLabel ? `<button type="button" data-edit-label="${key}"><i class="fas fa-pen"></i> ${e?.label ? _t("Change the caption") : _t("Add a caption")}</button>` : ""}
      </div>`;
  }

  _panelNote(id) {
    const esc = foundry.utils.escapeHTML;
    const n = this._notes.find(x => x.id === id);
    if (!n) return "";
    return `<div class="tsl-viz-p-head"><i class="fas fa-note-sticky tsl-viz-p-icon"></i><div><b>${esc(n.text)}</b><small>${_t("A caption on the board")}</small></div></div>
      <div class="tsl-viz-p-actions">${this._canNotes() ? `
        <button type="button" data-edit-note="${esc(id)}"><i class="fas fa-pen"></i> ${_t("Change")}</button>
        <button type="button" data-del-note="${esc(id)}"><i class="fas fa-trash"></i> ${_t("Take it off")}</button>` : ""}</div>`;
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /** Captions on the board: the GM, and players while a GM is there to pin them. */
  _canNotes() {
    return game.user.isGM || !!game.users?.activeGM;
  }

  _viewport() { return (this.element?.[0] ?? this.element)?.querySelector?.("[data-viewport]") ?? null; }

  _applyView(vp = this._viewport()) {
    const w = vp?.querySelector(".tsl-viz-world");
    if (w && this._view) w.style.transform = `translate(${this._view.x.toFixed(1)}px, ${this._view.y.toFixed(1)}px) scale(${this._view.z.toFixed(3)})`;
  }

  /** Everyone in view: zoom and pan to fit the board. */
  _fit(vp = this._viewport()) {
    if (!vp) return;
    const W = vp.clientWidth || 800, H = vp.clientHeight || 500;
    const pts = [...this._pos.values(), ...this._notes];
    if (!pts.length) { this._view = { x: W / 2, y: H / 2, z: 1 }; return this._applyView(vp); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90, minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 110;
    const z = Math.max(0.3, Math.min(1.2, W / (maxX - minX), H / (maxY - minY)));
    this._view = { x: W / 2 - ((minX + maxX) / 2) * z, y: H / 2 - ((minY + maxY) / 2) * z, z };
    this._applyView(vp);
  }

  _zoomAt(factor, cx, cy, vp = this._viewport()) {
    if (!vp || !this._view) return;
    const v = this._view;
    const z1 = Math.max(0.25, Math.min(2.5, v.z * factor));
    const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
    this._view = { x: cx - wx * z1, y: cy - wy * z1, z: z1 };
    this._applyView(vp);
  }

  /** Lines, arrows and their labels follow a portrait being dragged. */
  _redrawLinks(vp = this._viewport()) {
    if (!vp) return;
    const svg = vp.querySelector(".tsl-viz-svg"), chips = vp.querySelector(".tsl-viz-chips");
    if (svg) svg.innerHTML = this._svgInner();
    if (chips) chips.innerHTML = this._chipsHTML();
  }

  _select(sel) {
    this._sel = sel;
    this.render(false);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const el = html?.[0] ?? html;
    if (!el?.querySelector) return;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener("click", (e) => { e.stopPropagation(); fn(n, e); }));

    // The GM: this scene is public / private.
    on("[data-public]", () => TSLTalk.setPublicScene(!TSLTalk.publicScene()));
    // Jump to the other window (scene ↔ world).
    on("[data-open-mode]", (n) => TSLSceneVisualizer.open(n.dataset.openMode));
    on("[data-add-note]", () => this._addNote());
    on("[data-reset-layout]", () => this._resetLayout());
    const vp = el.querySelector("[data-viewport]");
    on("[data-zoom]", (n) => {
      if (!vp) return;
      if (n.dataset.zoom === "fit") return this._fit(vp);
      this._zoomAt(n.dataset.zoom === "in" ? 1.2 : 1 / 1.2, vp.clientWidth / 2, vp.clientHeight / 2, vp);
    });
    // The panel.
    on("[data-desel]", () => this._select(null));
    on("[data-sel-edge]", (n) => this._select({ kind: "edge", id: n.dataset.selEdge }));
    on("[data-open-chron]", (n) => { const a = game.actors.get(n.dataset.openChron); if (a) SocialFencingDialog.open(a); });
    on("[data-edit-title]", (n) => this._editTitle(n.dataset.editTitle));
    on("[data-edit-label]", (n) => this._editLabel(n.dataset.editLabel));
    on("[data-edit-note]", (n) => this._editNote(n.dataset.editNote));
    on("[data-del-note]", (n) => this._patchNotes({ removeNote: n.dataset.delNote }).then(() => this._select(null)));

    if (!vp) return;
    // The first time, fit everyone in — once the window has its size (it's set after the listeners).
    if (this._view) this._applyView(vp);
    else requestAnimationFrame(() => { if (!this._view) this._fit(this._viewport() ?? vp); });
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this._zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top, vp);
    }, { passive: false });
    vp.addEventListener("pointerdown", (ev) => this._onPointerDown(ev, vp));
  }

  /**
   * One gesture on the board: drag a portrait or a caption, pan the
   * background — or, if it didn't move, a click: select what's under it (the
   * background clears the selection).
   */
  _onPointerDown(ev, vp) {
    if (ev.button !== 0 || ev.target.closest?.(".tsl-viz-panel")) return;
    const nodeEl = ev.target.closest?.("[data-node]");
    const noteEl = !nodeEl && ev.target.closest?.("[data-note]");
    const edgeEl = !nodeEl && !noteEl && ev.target.closest?.("[data-edge]");
    const kind = nodeEl ? "node" : noteEl ? "note" : edgeEl ? "edge" : "pan";
    const id = nodeEl?.dataset.node ?? noteEl?.dataset.note ?? edgeEl?.dataset.edge ?? null;
    const note = kind === "note" ? this._notes.find(n => n.id === id) : null;
    const movable = kind === "node" || kind === "pan" || (kind === "note" && this._canNotes());
    ev.preventDefault();
    const start = { x: ev.clientX, y: ev.clientY };
    const z = this._view?.z || 1;
    const orig = kind === "node" ? { ...this._pos.get(id) } : kind === "note" ? { x: note?.x ?? 0, y: note?.y ?? 0 } : { x: this._view?.x ?? 0, y: this._view?.y ?? 0 };
    let moved = false, at = null;
    try { vp.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
    const onMove = (e) => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > 4 && movable) { moved = true; this._dragging = kind !== "pan"; vp.classList.add(kind === "pan" ? "panning" : "dragging"); }
      if (!moved) return;
      if (kind === "pan") { this._view = { ...this._view, x: orig.x + dx, y: orig.y + dy }; this._applyView(vp); return; }
      at = { x: orig.x + dx / z, y: orig.y + dy / z };
      if (kind === "node") {
        this._pos.set(id, at);
        nodeEl.style.left = `${at.x.toFixed(1)}px`; nodeEl.style.top = `${at.y.toFixed(1)}px`;
        this._redrawLinks(vp);
      } else { noteEl.style.left = `${at.x.toFixed(1)}px`; noteEl.style.top = `${at.y.toFixed(1)}px`; }
    };
    const onUp = () => {
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
      vp.classList.remove("panning", "dragging");
      this._dragging = false;
      if (moved) {
        if (kind === "node" && at) this._savePos(id, at);
        if (kind === "note" && at) { if (note) { note.x = Math.round(at.x); note.y = Math.round(at.y); } this._patchNotes({ note: { id, x: at.x, y: at.y } }); }
        return;
      }
      this._select(kind === "pan" ? null : { kind, id });
    };
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);
  }

  /** Keep where a portrait was put: the GM's spot is everyone's; a player's is their own. */
  async _savePos(id, p) {
    const pos = { x: Math.round(p.x), y: Math.round(p.y) };
    if (!game.user.isGM) {
      const local = this._localPos();
      local[id] = pos;
      this._saveLocal(local);
      this._hasLocal = true;
      return;
    }
    this._pending.set(id, pos);
    try { await TSLSceneVisualizer.applyBoardPatch({ mode: this._mode, sceneId: globalThis.canvas?.scene?.id, pos: [{ id, ...pos }] }); }
    finally { this._pending.delete(id); }
  }

  /** The GM: everyone back to the automatic layout, for every player. A player: back to the GM's arrangement. */
  async _resetLayout() {
    if (!game.user.isGM) {
      this._saveLocal({});
      this._view = null;
      return this.render(false);
    }
    const yes = await new Promise(resolve => new Dialog({
      title: _t("Arrange everyone afresh?"),
      content: `<div class="tsl-dlg"><p>${_t("Everyone on this board goes back to the automatic layout — for every player. The captions stay where they are.")}</p></div>`,
      buttons: { yes: { icon: '<i class="fas fa-wand-magic-sparkles"></i>', label: _t("Arrange afresh"), callback: () => resolve(true) }, no: { label: _t("Cancel"), callback: () => resolve(false) } },
      default: "no",
      close: () => resolve(false),
    }, tslDialogOptions()).render(true));
    if (!yes) return;
    this._view = null;
    await TSLSceneVisualizer.applyBoardPatch({ mode: this._mode, sceneId: globalThis.canvas?.scene?.id, resetPos: true });
  }

  /** Change the board's captions: the GM writes them, a player's go through the GM. */
  async _patchNotes(patch) {
    const args = { ...patch, mode: this._mode, sceneId: globalThis.canvas?.scene?.id ?? null };
    if (game.user.isGM) return TSLSceneVisualizer.applyBoardPatch(args);
    if (!game.users?.activeGM) { ui.notifications?.warn?.(_t("Captions on the board need a GM online.")); return; }
    return TSLGMActions.request("boardPatch", args);
  }

  async _addNote() {
    const text = await this._promptText({ title: _t("A caption on the board"), label: _t("A place, a faction, a rumour — a few words. Drag it where it belongs."), placeholder: _t("e.g. The abbey · Owes the guild") });
    if (!text) return;
    const vp = this._viewport();
    const v = this._view ?? { x: 0, y: 0, z: 1 };
    const W = vp?.clientWidth ?? 800, H = vp?.clientHeight ?? 500;
    const id = foundry.utils.randomID();
    await this._patchNotes({ note: { id, x: (W / 2 - v.x) / v.z, y: (H / 3 - v.y) / v.z, text } });
    this._sel = { kind: "note", id };
  }

  async _editNote(id) {
    const n = this._notes.find(x => x.id === id);
    if (!n) return;
    const text = await this._promptText({ title: _t("A caption on the board"), label: _t("Empty takes it off the board."), value: n.text });
    if (text === null) return;
    await this._patchNotes({ note: { id, text } });
  }

  /** The few words under someone's name — the GM for anyone, a player for their own. */
  async _editTitle(id) {
    const actor = game.actors.get(id);
    if (!actor || !(game.user.isGM || actor.isOwner)) return;
    const text = await this._promptText({ title: _t("A caption for {name}", { name: actor.name }), label: _t("Who they are, in a few words — under their name on the map."),
      value: SocialArchetypeManager.getCharacterNotes(actor).title, placeholder: _t("e.g. head of the guild · the river gate's watch"), max: 60 });
    if (text === null) return;
    await SocialArchetypeManager.setActorData(actor, { title: text.slice(0, 60) });
  }

  /** The caption on the line between two people — on the bond, so both of them see it. */
  async _editLabel(key) {
    const [aId, bId] = String(key).split("|");
    const a = game.actors.get(aId), b = game.actors.get(bId);
    if (!a || !b) return;
    const [side, other] = game.user.isGM || a.isOwner ? [a, b] : b.isOwner ? [b, a] : [null, null];
    if (!side) return;
    const bond = TSLBondStore.find(side.id, other.id) ?? TSLBondStore.find(other.id, side.id);
    const text = await this._promptText({ title: _t("{a} & {b}", { a: a.name, b: b.name }), label: _t("A few words on the line between them — both of them see it."),
      value: bond?.label ?? "", placeholder: _t("e.g. sisters · a debt for a rescue"), max: 60 });
    if (text === null) return;
    const mine = TSLBondStore.find(side.id, other.id);
    if (mine) await TSLBondStore.update(side.id, mine.id, { label: text.slice(0, 60) });
    else if (text) await TSLBondStore.add(side.id, other.id, { type: "stranger", label: text.slice(0, 60) });
  }

  /** A line of text — the caption being written. Resolves to the text, or null if cancelled. */
  _promptText({ title, label = "", value = "", placeholder = "", max = 80 }) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title,
        content: `<div class="tsl-dlg"><p>${esc(label)}</p><input type="text" name="tsl-text" maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus></div>`,
        buttons: {
          ok: { icon: '<i class="fas fa-check"></i>', label: _t("Save"), callback: (html) => {
            const root = html?.[0] ?? html;
            const input = root?.querySelector?.("input[name='tsl-text']");
            resolve(input ? String(input.value ?? "").trim() : null);
          } },
          cancel: { label: _t("Cancel"), callback: () => resolve(null) },
        },
        default: "ok",
        close: () => resolve(null),
      }, tslDialogOptions({ width: 400 })).render(true);
    });
  }

  // ── Live pulses (called on every client via the socket) ─────────────────────

  /**
   * Animate a maneuver that just resolved, on BOTH windows that are open.
   * { srcId, tgtId, technique, approach, job, grade, paid, rel, ended, granted, witnesses }
   */
  static pulse(data) {
    for (const key of ["scene", "world"]) {
      const app = TSLSceneVisualizer._instances[key];
      if (!app?.rendered) continue;
      try { app._playPulse(data); } catch (err) { console.warn("TSL | viz pulse failed:", err); }
    }
  }

  _playPulse({ srcId, tgtId, technique = null, approach, job = null, grade, paid = null, rel = null, ended = false, granted = false, witnesses = false } = {}) {
    const root = this.element?.[0] ?? this.element;
    const stage = root?.querySelector?.(".tsl-viz-world");   // the board's coordinate space
    const svg   = root?.querySelector?.(".tsl-viz-svg");
    if (!stage || !svg) return;

    // Hold off any auto re-render (from this outcome's flag changes) until the
    // whole animation has played — otherwise it flashes for a split second.
    this._animatingUntil = Math.max(this._animatingUntil, Date.now() + 3600);

    const hit = grade === "strong" || grade === "success";
    const kind = rel === "wall" && !hit ? "wall" : hit ? "hit" : "miss";
    const src = this._pos.get(srcId);
    const tgt = this._pos.get(tgtId);

    // A beam from the speaker to them (only if both are on the board).
    if (src && tgt && srcId !== tgtId) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", src.x); line.setAttribute("y1", src.y);
      line.setAttribute("x2", tgt.x); line.setAttribute("y2", tgt.y);
      line.setAttribute("class", `tsl-viz-beam tsl-viz-beam--${kind}`);
      svg.appendChild(line);
      setTimeout(() => line.remove(), 2000);
      // Light up the bond between them, if there is one.
      const edge = svg.querySelector(`.tsl-viz-edge[data-a="${srcId}"][data-b="${tgtId}"], .tsl-viz-edge[data-a="${tgtId}"][data-b="${srcId}"]`);
      if (edge) { edge.classList.add("pulsing"); setTimeout(() => edge.classList.remove("pulsing"), 2000); }
    }

    // Flash the one who was acted upon, with a spreading ring.
    const tgtNode = stage.querySelector(`.tsl-viz-node[data-actor-id="${tgtId}"]`);
    if (tgtNode) {
      tgtNode.classList.add(`flash-${kind}`);
      setTimeout(() => tgtNode.classList.remove(`flash-${kind}`), 1800);
    }
    if (tgt) {
      const ring = document.createElement("div");
      ring.className = `tsl-viz-ring tsl-viz-ring--${kind}${witnesses ? " tsl-viz-ring--public" : ""}`;
      ring.style.left = `${tgt.x}px`;
      ring.style.top  = `${tgt.y}px`;
      stage.appendChild(ring);
      setTimeout(() => ring.remove(), 1400);

      // The answer, floating over them — long enough to read.
      const label = job === "read" || approach === "read" ? (hit ? _t("read") : _t("noticed"))
        : technique === "deceive" ? (hit ? _t("they believe it") : _t("caught"))
        : technique === "bargain" ? (grade === "strong" || (grade === "success" && paid) ? _t("a deal") : _t("no deal"))
        : job === "gambit" ? (hit ? _t("it works") : _t("it blows up"))
        : grade === "strong" ? _t("yes")
        : grade === "success" ? (technique === "demand" ? _t("gives in") : paid ? _t("yes, for a price") : _t("a price refused"))
        : _t("no");
      const float = document.createElement("div");
      float.className = `tsl-viz-float tsl-viz-float--${kind}${witnesses ? " tsl-viz-float--public" : ""}`;
      float.textContent = label;
      if (witnesses) { const icon = document.createElement("i"); icon.className = "fas fa-users"; float.prepend(icon, " "); }
      float.style.left = `${tgt.x}px`;
      float.style.top  = `${tgt.y}px`;
      stage.appendChild(float);
      setTimeout(() => float.remove(), 3000);
    }

    // A proud one refused something big and ended the talk: the door closes.
    if (ended) this._playResolution(stage, tgtNode, tgt, "ended");
    else if (granted && (grade === "strong" || job === "gambit")) this._playResolution(stage, tgtNode, tgt, "yes");
  }

  /** The climax on the NPC's portrait: a warm yes, or the door closing. */
  _playResolution(stage, node, pos, what) {
    if (!node) return;
    const tone = what === "ended" ? "walked" : "swayed";
    node.classList.add(`resolve-${tone}`);
    setTimeout(() => node.classList.remove(`resolve-${tone}`), 3200);
    if (!pos) return;
    const burst = document.createElement("div");
    burst.className = `tsl-viz-burst tsl-viz-burst--${tone}`;
    burst.style.left = `${pos.x}px`;
    burst.style.top  = `${pos.y}px`;
    stage.appendChild(burst);
    setTimeout(() => burst.remove(), 1800);
    const word = document.createElement("div");
    word.className = `tsl-viz-resolveword tsl-viz-resolveword--${tone}`;
    word.textContent = what === "ended" ? _t("DOOR CLOSED") : _t("AGREED");
    word.style.left = `${pos.x}px`;
    word.style.top  = `${pos.y}px`;
    stage.appendChild(word);
    setTimeout(() => word.remove(), 3400);
  }
}
