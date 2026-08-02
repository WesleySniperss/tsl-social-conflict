/**
 * tsl-social-conflict | scene-visualizer.js
 *
 * The relationship map — a live graph for everyone at the table. It comes in
 * TWO windows (same class, different `mode`):
 *   • "scene" — only the characters on THIS canvas scene (filtered to what a
 *     player can see). The everyone-can-open view, for the table.
 *   • "world" — every socially-relevant actor in the world (all bonds at once).
 *     The GM's overview of the whole web; a player sees only their own cast.
 * Both can be open at the same time.
 *
 * Nodes = portrait + Resolve/Patience + ⚔ States + ❤ Wounds; edges = bonds
 * (colour = school, thickness = strength). When a maneuver resolves anywhere,
 * a "social pulse" is broadcast to every client and animated here: a beam
 * actor → target, a flash on the one hit, a floating result, and — if the
 * blow ended the exchange — the swayed / walked drama.
 *
 * ZOOM scales the MAP inside a fixed viewport (the window keeps its size; the
 * map scrolls when zoomed past the viewport). Resize the window for more map.
 *
 * ApplicationV1 (like the other two windows) — referenced defensively so a
 * namespace move (globalThis.Application → foundry.appv1.api.Application) still
 * loads. Read-only for players; it never mutates shared state.
 */

console.log("TSL | Loading scene-visualizer.js...");

const _TSLVizBase = globalThis.Application ?? foundry?.appv1?.api?.Application;

class TSLSceneVisualizer extends _TSLVizBase {

  // Two independent windows, keyed by mode.
  static _instances = { scene: null, world: null };
  static get instance() { return TSLSceneVisualizer._instances.scene; }

  constructor(options = {}) {
    super(options);
    this._mode      = options.mode === "world" ? "world" : "scene";
    this._nodePos   = {};      // actorId → { x, y } centre in graph coords
    this._customPos = {};      // actorId → { x, y } — user-dragged overrides (session)
    this._zoom      = 1;       // graph zoom (0.4–2.5), personal to this client
    this._size      = 480;     // graph square side (recomputed per render)
    this._animatingUntil = 0;  // while a pulse is playing, defer auto re-renders
    this._rt        = null;
    // Auto re-render (bonds/tracks/effects changed) — but NEVER mid-pulse, or
    // the freshly-drawn animation gets wiped and the effect only flashes for a
    // fraction of a second. The state changes that trigger this fire in the SAME
    // pass as the pulse (and often just BEFORE it sets _animatingUntil), so the
    // scheduled tick RE-CHECKS at fire time and defers itself until the pulse is
    // done, rather than deciding the wait up front.
    this._rerender = () => {
      clearTimeout(this._rt);
      const tick = () => {
        const remaining = this._animatingUntil - Date.now();
        if (remaining > 0) { this._rt = setTimeout(tick, remaining + 30); return; }
        if (this.rendered) this.render(false);
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
      title: "Social Scene",
      template: null,
      width: 620,
      height: 640,          // fixed — the MAP zooms inside, not the window
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
      title:   key === "world" ? "Web of Bonds — all relationships" : "Social Scene",
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
    const scope = "tsl-social-conflict";
    const on = (name, fn) => this._hooks.push([name, Hooks.on(name, fn)]);
    // Bonds & encounter tracks live on actor flags.
    on("updateActor", (actor, chg) => {
      if (foundry.utils.hasProperty(chg, `flags.${scope}`)) this._rerender();
    });
    // States & Wounds are ActiveEffects.
    const effectTouch = (effect) => {
      if (effect?.parent?.documentName === "Actor") this._rerender();
    };
    on("createActiveEffect", effectTouch);
    on("deleteActiveEffect", effectTouch);
    on("updateActiveEffect", effectTouch);
    // Scene population changes (only matter to the scene window, but harmless).
    on("canvasReady", () => this._rerender());
    on("createToken", () => this._rerender());
    on("deleteToken", () => this._rerender());
    on("updateToken", (_doc, chg) => { if ("hidden" in chg) this._rerender(); });
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

  /** Build a node record from an actor (+ optional token for scene art). */
  _nodeData(actor, tok) {
    const enc    = SocialEncounterManager.getEncounter(actor);
    const conds  = SocialArchetypeManager.getActiveConditions(actor);
    const wounds = (typeof TSLConditionEffects !== "undefined")
      ? TSLConditionEffects.ORDER.filter(id => TSLConditionEffects.hasCondition(actor, id))
      : [];
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img || tok?.document?.texture?.src || "icons/svg/mystery-man.svg",
      enc, conds, wounds,
      hasBond: TSLBondStore.getList(actor.id).length > 0,
      overwhelmed: (typeof TSLConditionEffects !== "undefined")
        && TSLConditionEffects.countConditions(actor) >= 4,
    };
  }

  static _isRelevant(nd, actor) {
    return actor.hasPlayerOwner || nd.hasBond || nd.conds.length || nd.wounds.length
      || nd.enc.active || nd.enc.outcome;
  }

  /**
   * Who belongs on the map.
   *  • scene mode: player characters + the socially-relevant cast that are
   *    tokens on THIS scene (a player only sees tokens they can see).
   *  • world mode: every socially-relevant actor in the world (a player is
   *    limited to actors they own or that have a player owner).
   */
  _collectNodes() {
    const isGM  = game.user.isGM;
    const nodes = [];
    const seen  = new Set();

    if (this._mode === "world") {
      for (const actor of game.actors) {
        if (!actor || seen.has(actor.id)) continue;
        if (!isGM && !(actor.isOwner || actor.hasPlayerOwner)) continue;
        const nd = this._nodeData(actor, null);
        if (!TSLSceneVisualizer._isRelevant(nd, actor)) continue;
        seen.add(actor.id);
        nodes.push(nd);
      }
      return nodes;
    }

    for (const tok of (canvas.tokens?.placeables ?? [])) {
      const actor = tok.actor;
      if (!actor || seen.has(actor.id)) continue;
      if (!isGM && (tok.document.hidden || !tok.visible)) continue;
      const nd = this._nodeData(actor, tok);
      if (!TSLSceneVisualizer._isRelevant(nd, actor)) continue;
      seen.add(actor.id);
      nodes.push(nd);
    }
    return nodes;
  }

  /**
   * One edge per related pair. Bonds are mirrored (v1.32), so a pair may be
   * recorded on both actors — dedupe by unordered pair and read the strongest.
   */
  _collectEdges(nodeIds) {
    const set = new Set(nodeIds);
    const edges = new Map();  // "a|b" (sorted) → edge
    for (const aId of nodeIds) {
      for (const b of TSLBondStore.getList(aId)) {
        const bId = b.targetActorId;
        if (!set.has(bId) || aId === bId) continue;
        const key = [aId, bId].sort().join("|");
        const type = SocialArchetypeManager.getBondType(b.type);
        if (!type || type.id === "stranger") continue;
        const strength = Math.min(3, Math.abs(b.attitude ?? 0));
        const existing = edges.get(key);
        if (existing && existing.strength >= strength) continue;
        edges.set(key, {
          aId, bId,
          label: type.label,
          school: type.school,
          color: TSLSceneVisualizer.schoolColor(type.school),
          strength,
        });
      }
    }
    return [...edges.values()];
  }

  /** Circular layout: place n nodes on a circle, store centres for pulses. */
  _layout(n) {
    const R    = Math.max(120, Math.round(26 * n));
    const pad  = 70;                     // room for node label + tags
    const size = 2 * R + pad * 2;
    const c    = size / 2;
    this._size = size;
    const pos = [];
    if (n === 1) { pos.push({ x: c, y: c }); return { pos, size }; }
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      pos.push({ x: c + R * Math.cos(ang), y: c + R * Math.sin(ang) });
    }
    return { pos, size };
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  _renderHTML() {
    const esc   = foundry.utils.escapeHTML;
    this._customPos ??= {};          // defensive (survives Object.create in tests)
    const world = this._mode === "world";
    const nodes = this._collectNodes();
    this._nodePos = {};

    // Header — the GM starts an actual Social Conflict from the scene view, and
    // can jump to the other window (all-bonds ↔ this-scene).
    const modeBtn = world
      ? `<button class="tsl-viz-mode" data-open-mode="scene" data-tooltip="Switch to just this scene — what players see"><i class="fas fa-clapperboard"></i> This scene</button>`
      : (game.user.isGM
          ? `<button class="tsl-viz-mode" data-open-mode="world" data-tooltip="Open the full web — every relationship in the world"><i class="fas fa-globe"></i> All bonds</button>`
          : "");
    const head = (subLabel) => `
      <div class="tsl-viz-head">
        <span class="tsl-viz-title"><i class="fas ${world ? "fa-globe" : "fa-people-arrows"}"></i> ${world ? "Web of Bonds" : "The Social Scene"}</span>
        <span class="tsl-viz-sub">${subLabel}</span>
        ${modeBtn}
        ${(!world && game.user.isGM) ? `<button class="tsl-viz-conflict" data-tooltip="Start a Social Conflict — the shared roll board — with the tokens you have selected on the canvas.">⚔ Conflict</button>` : ""}
        <span class="tsl-viz-zoom" data-tooltip="Zoom the MAP (or scroll-wheel over it). Drag a portrait to rearrange.">
          <button class="tsl-viz-zoom-btn" data-zoom="out">−</button>
          <button class="tsl-viz-zoom-btn" data-zoom="reset" data-tooltip="Reset zoom & layout">⟲</button>
          <button class="tsl-viz-zoom-btn" data-zoom="in">+</button>
        </span>
        <button class="tsl-viz-refresh" data-tooltip="Redraw"><i class="fas fa-rotate"></i></button>
      </div>`;

    if (!nodes.length) {
      const empty = world
        ? "No relationships yet anywhere — set bonds in any character's Chronicle and the whole web appears here."
        : `No social scene yet — no bonded characters, tracks or wounds on the canvas. Set relationships in a token's Chronicle, and they'll appear here.${game.user.isGM ? " Or select tokens and hit ⚔ Conflict above." : ""}`;
      return `<div class="tsl-viz-root">
        ${head(world ? "no bonds recorded yet" : "nobody on the map yet")}
        <div class="tsl-viz-empty">${empty}</div>
      </div>`;
    }

    const { pos, size } = this._layout(nodes.length);
    // User-dragged positions win over the circular default (kept for the session).
    nodes.forEach((nd, i) => { this._nodePos[nd.id] = this._customPos[nd.id] ?? pos[i]; });
    const edges = this._collectEdges(nodes.map(n => n.id));

    // ── Edges (SVG lines + midpoint chips) ──
    const lines = edges.map(e => {
      const a = this._nodePos[e.aId], b = this._nodePos[e.bId];
      const w = 1.5 + e.strength * 1.6;
      const op = 0.35 + e.strength * 0.18;
      return `<line class="tsl-viz-edge${e.strength >= 3 ? " tsl-viz-edge--strong" : ""}" data-a="${e.aId}" data-b="${e.bId}"
        x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
        stroke="${e.color}" stroke-width="${w.toFixed(1)}" stroke-opacity="${op.toFixed(2)}"
        stroke-linecap="round" />`;
    }).join("");

    const edgeChips = edges.map(e => {
      const a = this._nodePos[e.aId], b = this._nodePos[e.bId];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dots = "●".repeat(e.strength) + "○".repeat(3 - e.strength);
      const tip  = `${esc(e.label)} — strength ${e.strength}/3 · ${SOCIAL_TRIADS?.[e.school]?.label ?? "—"}`;
      return `<div class="tsl-viz-edge-chip" data-a="${e.aId}" data-b="${e.bId}" style="left:${mx.toFixed(1)}px;top:${my.toFixed(1)}px;--edge-col:${e.color}"
        data-tooltip="${tip}"><span class="tsl-viz-edge-type">${esc(e.label)}</span><span class="tsl-viz-edge-dots">${dots}</span></div>`;
    }).join("");

    // ── Nodes ──
    const nodeHtml = nodes.map(nd => {
      const p = this._nodePos[nd.id];
      const tracks = nd.enc.active
        ? `<div class="tsl-viz-tracks" data-tooltip="Resolve ${nd.enc.resolve}/${nd.enc.maxResolve} · Patience ${nd.enc.patience}/${nd.enc.maxPatience}">
             <span class="tsl-viz-tr tsl-viz-tr--r">R ${nd.enc.resolve}</span><span class="tsl-viz-tr tsl-viz-tr--p">P ${nd.enc.patience}</span>
           </div>`
        : nd.enc.outcome
          ? `<div class="tsl-viz-outcome tsl-viz-outcome--${nd.enc.outcome}">${nd.enc.outcome === "swayed" ? "swayed" : "walked"}</div>`
          : "";
      const stateTags = nd.conds.map(c =>
        `<span class="tsl-viz-dot tsl-viz-dot--state" style="--dot:${c.meta.color ?? "#9b6ee8"}" data-tooltip="⚔ <b>${esc(c.meta.label)}</b> — ${esc(c.meta.description ?? "")}"></span>`
      ).join("");
      const woundTags = nd.wounds.map(id => {
        const m = TSLConditionEffects.getMeta(id);
        return `<span class="tsl-viz-dot tsl-viz-dot--wound" data-tooltip="❤ <b>${esc(m?.label ?? id)}</b> — a lasting Wound"></span>`;
      }).join("");
      const tags = (stateTags || woundTags)
        ? `<div class="tsl-viz-tags">${stateTags}${woundTags}</div>` : "";
      return `<div class="tsl-viz-node ${nd.overwhelmed ? "overwhelmed" : ""}" data-actor-id="${nd.id}"
                   style="left:${(p.x - 46).toFixed(1)}px;top:${(p.y - 46).toFixed(1)}px"
                   data-tooltip="${esc(nd.name)}${nd.overwhelmed ? " — Overwhelmed" : ""} · click to open their Chronicle">
        <img class="tsl-viz-portrait" src="${nd.img}" alt="">
        <div class="tsl-viz-name">${esc(nd.name)}</div>
        ${tracks}${tags}
      </div>`;
    }).join("");

    const legend = `
      <div class="tsl-viz-legend">
        <span data-tooltip="Power — rivalry, oaths of dominance">◼ <i style="color:${TSLSceneVisualizer.schoolColor("power")}">Power</i></span>
        <span data-tooltip="Emotion — love, family, longing">◼ <i style="color:${TSLSceneVisualizer.schoolColor("attention")}">Emotion</i></span>
        <span data-tooltip="Reason — allegiance, trust, the given word">◼ <i style="color:${TSLSceneVisualizer.schoolColor("order")}">Reason</i></span>
        <span class="tsl-viz-legend-note">line thickness = bond strength</span>
      </div>`;

    // A FIXED viewport scrolls; the inner canvas is the map, scaled by zoom.
    // The stage box takes the zoomed extent so scrollbars appear when the map
    // grows past the viewport — the WINDOW itself never changes size.
    const z = this._zoom || 1;
    return `
      <div class="tsl-viz-root">
        ${head(`${nodes.length} ${world ? "in the web" : "on the map"} · ${edges.length} bond${edges.length === 1 ? "" : "s"} · ${Math.round(z * 100)}%`)}
        <div class="tsl-viz-viewport">
          <div class="tsl-viz-stage" style="width:${(size * z).toFixed(0)}px;height:${(size * z).toFixed(0)}px">
            <div class="tsl-viz-canvas" style="width:${size}px;height:${size}px;transform:scale(${z});transform-origin:0 0">
              <svg class="tsl-viz-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${lines}</svg>
              ${edgeChips}
              ${nodeHtml}
            </div>
          </div>
        </div>
        ${legend}
      </div>`;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const el = html[0] ?? html;

    el.querySelector(".tsl-viz-refresh")?.addEventListener("click", () => this.render(true));

    // Jump to the other window (scene ↔ world).
    el.querySelector(".tsl-viz-mode")?.addEventListener("click", (e) => {
      e.stopPropagation();
      TSLSceneVisualizer.open(e.currentTarget.dataset.openMode);
    });

    // GM: start the shared Social Conflict roll board from the selected tokens.
    el.querySelector(".tsl-viz-conflict")?.addEventListener("click", () => {
      if (typeof TSLHudButton !== "undefined") TSLHudButton._handleClick();
      else if (typeof TSLConflictApp !== "undefined") TSLConflictApp.openSelection(canvas.tokens?.controlled ?? []);
    });

    // Click a node → open that character's Chronicle (GM anyone, owner own).
    const openChronicle = (actor) =>
      (typeof SocialFencingDialog !== "undefined") ? SocialFencingDialog.open(actor)
      : (typeof SocialNotesDialog  !== "undefined") ? SocialNotesDialog.open(actor)
      : null;
    // Drag a portrait to rearrange the map; a clean click (no drag) opens the
    // Chronicle. Positions persist for the session; ⟲ resets them.
    el.querySelectorAll(".tsl-viz-node[data-actor-id]").forEach(node => {
      node.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        const id    = node.dataset.actorId;
        const start = { x: ev.clientX, y: ev.clientY };
        const orig  = { ...(this._nodePos[id] ?? { x: 0, y: 0 }) };
        let moved = false;
        try { node.setPointerCapture(ev.pointerId); } catch (e) {}
        const onMove = (e) => {
          const z = this._zoom || 1;
          const dx = (e.clientX - start.x) / z;
          const dy = (e.clientY - start.y) / z;
          if (!moved && Math.hypot(dx, dy) > 4) { moved = true; node.classList.add("dragging"); }
          if (!moved) return;
          this._nodePos[id] = { x: orig.x + dx, y: orig.y + dy };
          this._repositionNode(id);
        };
        const onUp = () => {
          node.removeEventListener("pointermove", onMove);
          node.removeEventListener("pointerup", onUp);
          node.classList.remove("dragging");
          if (moved) {
            this._customPos[id] = { ...this._nodePos[id] };   // remember the spot
          } else {
            const actor = game.actors.get(id);
            if (!actor) return;
            if (!game.user.isGM && !actor.isOwner) {
              ui.notifications.info(`${actor.name}: you can only open a Chronicle you own.`);
              return;
            }
            openChronicle(actor);
          }
        };
        node.addEventListener("pointermove", onMove);
        node.addEventListener("pointerup", onUp);
      });
    });

    // Zoom — buttons and scroll-wheel over the map; ⟲ resets zoom + layout.
    // Zoom the MAP only: keep the point under the cursor stable by adjusting the
    // viewport scroll, so the window never resizes.
    const viewport = el.querySelector(".tsl-viz-viewport");
    const applyZoom = (nz, anchor) => {
      const z0 = this._zoom || 1;
      const z1 = Math.max(0.4, Math.min(2.5, nz));
      if (z1 === z0) return;
      // Keep the anchor point (in canvas coords) under the same screen spot.
      let ax = null, ay = null;
      if (viewport && anchor) {
        const r = viewport.getBoundingClientRect();
        ax = (viewport.scrollLeft + (anchor.x - r.left)) / z0;
        ay = (viewport.scrollTop  + (anchor.y - r.top))  / z0;
      }
      this._zoom = z1;
      this.render(false);
      // After the re-render, restore scroll so the anchor stays put.
      if (viewport && ax != null) {
        const vp = this.element?.[0]?.querySelector(".tsl-viz-viewport");
        if (vp) {
          const r = viewport.getBoundingClientRect();
          vp.scrollLeft = ax * z1 - (anchor.x - r.left);
          vp.scrollTop  = ay * z1 - (anchor.y - r.top);
        }
      }
    };
    el.querySelectorAll("[data-zoom]").forEach(btn => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = btn.dataset.zoom;
      if (m === "in")       applyZoom((this._zoom || 1) + 0.2);
      else if (m === "out") applyZoom((this._zoom || 1) - 0.2);
      else { this._zoom = 1; this._customPos = {}; this.render(false); }
    }));
    viewport?.addEventListener("wheel", (e) => {
      e.preventDefault();
      applyZoom((this._zoom || 1) + (e.deltaY < 0 ? 0.15 : -0.15), { x: e.clientX, y: e.clientY });
    }, { passive: false });
  }

  /** Live-move a node's DOM + its edges + edge chips to this._nodePos[id]. */
  _repositionNode(id) {
    const root = this.element?.[0];
    if (!root) return;
    const p = this._nodePos[id];
    if (!p) return;
    const node = root.querySelector(`.tsl-viz-node[data-actor-id="${id}"]`);
    if (node) { node.style.left = `${(p.x - 46).toFixed(1)}px`; node.style.top = `${(p.y - 46).toFixed(1)}px`; }
    root.querySelectorAll(".tsl-viz-edge").forEach(line => {
      if (line.dataset.a === id) { line.setAttribute("x1", p.x.toFixed(1)); line.setAttribute("y1", p.y.toFixed(1)); }
      if (line.dataset.b === id) { line.setAttribute("x2", p.x.toFixed(1)); line.setAttribute("y2", p.y.toFixed(1)); }
    });
    root.querySelectorAll(".tsl-viz-edge-chip").forEach(chip => {
      if (chip.dataset.a === id || chip.dataset.b === id) {
        const a = this._nodePos[chip.dataset.a], b = this._nodePos[chip.dataset.b];
        if (a && b) { chip.style.left = `${((a.x + b.x) / 2).toFixed(1)}px`; chip.style.top = `${((a.y + b.y) / 2).toFixed(1)}px`; }
      }
    });
  }

  // ── Live pulses (called on every client via the socket) ─────────────────────

  /**
   * Animate a resolved maneuver on BOTH windows that are open.
   * { srcId, tgtId, group, outcome, damage, resolved }.
   */
  static pulse(data) {
    for (const key of ["scene", "world"]) {
      const app = TSLSceneVisualizer._instances[key];
      if (!app?.rendered) continue;
      try { app._playPulse(data); } catch (err) { console.warn("TSL | viz pulse failed:", err); }
    }
  }

  _playPulse({ srcId, tgtId, group, outcome, damage, resolved } = {}) {
    const root = this.element?.[0];
    const stage = root?.querySelector(".tsl-viz-canvas");   // the scaled coord space
    const svg   = root?.querySelector(".tsl-viz-svg");
    if (!stage || !svg) return;

    // Hold off any auto re-render (from this outcome's flag/effect changes) until
    // the whole animation has played — otherwise it flashes for a split second.
    this._animatingUntil = Math.max(this._animatingUntil, Date.now() + 3600);

    const kind = (outcome === "immune" || outcome === "blocked") ? "wall"
      : (outcome === "success" || outcome === "crit") ? "hit"
      : "miss";
    const src = this._nodePos[srcId];
    const tgt = this._nodePos[tgtId];

    // Beam from src → tgt (only if both are on the map).
    if (src && tgt) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", src.x); line.setAttribute("y1", src.y);
      line.setAttribute("x2", tgt.x); line.setAttribute("y2", tgt.y);
      line.setAttribute("class", `tsl-viz-beam tsl-viz-beam--${kind}`);
      svg.appendChild(line);
      setTimeout(() => line.remove(), 2000);

      // Light up the standing bond edge between them, if any.
      const edge = svg.querySelector(
        `.tsl-viz-edge[data-a="${srcId}"][data-b="${tgtId}"], .tsl-viz-edge[data-a="${tgtId}"][data-b="${srcId}"]`);
      if (edge) { edge.classList.add("pulsing"); setTimeout(() => edge.classList.remove("pulsing"), 2000); }
    }

    // Flash the one who was acted upon + a spreading ring so it's unmissable.
    const tgtNode = stage.querySelector(`.tsl-viz-node[data-actor-id="${tgtId}"]`);
    if (tgtNode) {
      tgtNode.classList.add(`flash-${kind}`);
      setTimeout(() => tgtNode.classList.remove(`flash-${kind}`), 1800);
    }
    if (tgt) {
      const ring = document.createElement("div");
      ring.className = `tsl-viz-ring tsl-viz-ring--${kind}`;
      ring.style.left = `${tgt.x}px`;
      ring.style.top  = `${tgt.y}px`;
      stage.appendChild(ring);
      setTimeout(() => ring.remove(), 1400);
    }

    // Float the result over the target — long enough to actually READ it.
    if (tgt) {
      const label = kind === "wall" ? "walled off" : kind === "hit" ? (damage > 0 ? `−${damage} Resolve` : "hit") : "miss";
      const float = document.createElement("div");
      float.className = `tsl-viz-float tsl-viz-float--${kind}`;
      float.textContent = label;
      float.style.left = `${tgt.x}px`;
      float.style.top  = `${tgt.y}px`;
      stage.appendChild(float);
      setTimeout(() => float.remove(), 3000);
    }

    // Resolution drama: this blow ended the exchange. Swayed = a warm break;
    // walked = the node greys out and drifts. Held long enough to read.
    if (resolved && tgtNode) {
      tgtNode.classList.add(`resolve-${resolved}`);
      setTimeout(() => tgtNode.classList.remove(`resolve-${resolved}`), 3200);
      if (tgt) {
        const burst = document.createElement("div");
        burst.className = `tsl-viz-burst tsl-viz-burst--${resolved}`;
        burst.style.left = `${tgt.x}px`;
        burst.style.top  = `${tgt.y}px`;
        stage.appendChild(burst);
        setTimeout(() => burst.remove(), 1800);
        const word = document.createElement("div");
        word.className = `tsl-viz-resolveword tsl-viz-resolveword--${resolved}`;
        word.textContent = resolved === "swayed" ? "SWAYED" : "WALKED AWAY";
        word.style.left = `${tgt.x}px`;
        word.style.top  = `${tgt.y}px`;
        stage.appendChild(word);
        setTimeout(() => word.remove(), 3400);
      }
    }
  }
}
