/**
 * tsl-social-conflict | scene-visualizer.js
 *
 * The Social Scene — a live relationship map for everyone at the table.
 * Characters on the scene are nodes (portrait + Resolve/Patience + ⚔ States +
 * ❤ Wounds); bonds are the lines between them (colour = school, thickness =
 * strength). When a maneuver resolves anywhere (Chronicle console OR conflict
 * window), a "social pulse" is broadcast to every client and animated here: a
 * beam from actor → target, a flash on the one who was hit, a floating result.
 *
 * Phase 1 = this graph window. Phase 2 (planned) = the same graph drawn as a
 * PIXI overlay on the battlemap between the real tokens.
 *
 * ApplicationV1 (like the other two windows) — referenced defensively so a
 * namespace move (globalThis.Application → foundry.appv1.api.Application) still
 * loads. Read-only for players; it never mutates shared state.
 */

console.log("TSL | Loading scene-visualizer.js...");

const _TSLVizBase = globalThis.Application ?? foundry?.appv1?.api?.Application;

class TSLSceneVisualizer extends _TSLVizBase {

  static _instance = null;
  static get instance() { return TSLSceneVisualizer._instance; }

  constructor(options = {}) {
    super(options);
    this._nodePos = {};        // actorId → { x, y } centre in graph coords
    this._size    = 480;       // graph square side (recomputed per render)
    this._rerender = foundry.utils.debounce(() => this.render(false), 120);
    this._hooks = [];
    this._bindHooks();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tsl-scene-visualizer",
      classes: ["tsl-viz"],
      title: "Social Scene",
      template: null,
      width: 560,
      height: "auto",
      resizable: true,
      minimizable: true,
    });
  }

  static open() {
    if (TSLSceneVisualizer._instance) { TSLSceneVisualizer._instance.render(true); return TSLSceneVisualizer._instance; }
    const app = new TSLSceneVisualizer();
    TSLSceneVisualizer._instance = app;
    app.render(true);
    return app;
  }

  static toggle() {
    if (TSLSceneVisualizer._instance) TSLSceneVisualizer._instance.close();
    else TSLSceneVisualizer.open();
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
    // Scene population changes.
    on("canvasReady", () => this._rerender());
    on("createToken", () => this._rerender());
    on("deleteToken", () => this._rerender());
    on("updateToken", (_doc, chg) => { if ("hidden" in chg) this._rerender(); });
  }

  async close(options = {}) {
    for (const [name, id] of this._hooks) Hooks.off(name, id);
    this._hooks = [];
    TSLSceneVisualizer._instance = null;
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

  /**
   * Who belongs on the social map: player characters always, plus any actor
   * that carries a bond, a fencing State/Wound, or a live encounter — the
   * socially relevant cast, not every goblin on the battlemap. A player only
   * sees tokens they can actually see.
   */
  _collectNodes() {
    const isGM  = game.user.isGM;
    const nodes = [];
    const seen  = new Set();
    for (const tok of (canvas.tokens?.placeables ?? [])) {
      const actor = tok.actor;
      if (!actor || seen.has(actor.id)) continue;
      if (!isGM && (tok.document.hidden || !tok.visible)) continue;

      const enc   = SocialEncounterManager.getEncounter(actor);
      const conds = SocialArchetypeManager.getActiveConditions(actor);
      const wounds = (typeof TSLConditionEffects !== "undefined")
        ? TSLConditionEffects.ORDER.filter(id => TSLConditionEffects.hasCondition(actor, id))
        : [];
      const hasBond = TSLBondStore.getList(actor.id).length > 0;
      const relevant = actor.hasPlayerOwner || hasBond || conds.length || wounds.length
        || enc.active || enc.outcome;
      if (!relevant) continue;

      seen.add(actor.id);
      nodes.push({
        id: actor.id,
        name: actor.name,
        img: actor.img || tok.document.texture?.src || "icons/svg/mystery-man.svg",
        enc, conds, wounds,
        overwhelmed: (typeof TSLConditionEffects !== "undefined")
          && TSLConditionEffects.countConditions(actor) >= 4,
      });
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
    const nodes = this._collectNodes();
    this._nodePos = {};

    if (!nodes.length) {
      return `<div class="tsl-viz-root">
        <div class="tsl-viz-empty">No social scene yet — no bonded characters, tracks or wounds on the canvas.
        Set relationships in a token's Chronicle, and they'll appear here.</div>
      </div>`;
    }

    const { pos, size } = this._layout(nodes.length);
    nodes.forEach((nd, i) => { this._nodePos[nd.id] = pos[i]; });
    const edges = this._collectEdges(nodes.map(n => n.id));

    // ── Edges (SVG lines + midpoint chips) ──
    const lines = edges.map(e => {
      const a = this._nodePos[e.aId], b = this._nodePos[e.bId];
      const w = 1.5 + e.strength * 1.6;
      const op = 0.35 + e.strength * 0.18;
      return `<line class="tsl-viz-edge" data-a="${e.aId}" data-b="${e.bId}"
        x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
        stroke="${e.color}" stroke-width="${w.toFixed(1)}" stroke-opacity="${op.toFixed(2)}"
        stroke-linecap="round" />`;
    }).join("");

    const edgeChips = edges.map(e => {
      const a = this._nodePos[e.aId], b = this._nodePos[e.bId];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dots = "●".repeat(e.strength) + "○".repeat(3 - e.strength);
      const tip  = `${esc(e.label)} — strength ${e.strength}/3 · ${SOCIAL_TRIADS?.[e.school]?.label ?? "—"}`;
      return `<div class="tsl-viz-edge-chip" style="left:${mx.toFixed(1)}px;top:${my.toFixed(1)}px;--edge-col:${e.color}"
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

    return `
      <div class="tsl-viz-root">
        <div class="tsl-viz-head">
          <span class="tsl-viz-title"><i class="fas fa-people-arrows"></i> The Social Scene</span>
          <span class="tsl-viz-sub">${nodes.length} on the map · ${edges.length} bond${edges.length === 1 ? "" : "s"}</span>
          <button class="tsl-viz-refresh" data-tooltip="Redraw"><i class="fas fa-rotate"></i></button>
        </div>
        <div class="tsl-viz-stage" style="width:${size}px;height:${size}px">
          <svg class="tsl-viz-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${lines}</svg>
          ${edgeChips}
          ${nodeHtml}
        </div>
        ${legend}
      </div>`;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const el = html[0] ?? html;

    el.querySelector(".tsl-viz-refresh")?.addEventListener("click", () => this.render(true));

    // Click a node → open that character's Chronicle (GM anyone, owner own).
    el.querySelectorAll(".tsl-viz-node[data-actor-id]").forEach(node => {
      node.addEventListener("click", () => {
        const actor = game.actors.get(node.dataset.actorId);
        if (!actor) return;
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.info(`${actor.name}: you can only open a Chronicle you own.`);
          return;
        }
        if (typeof SocialFencingApp !== "undefined") SocialFencingApp.open(actor);
      });
    });
  }

  // ── Live pulses (called on every client via the socket) ─────────────────────

  /**
   * Animate a resolved maneuver. { srcId, tgtId, group, outcome, damage }.
   * A beam actor→target, a flash on the target, a floating result — no
   * re-render. Safe to call when the window is closed (no-op).
   */
  static pulse(data) {
    const app = TSLSceneVisualizer._instance;
    if (!app?.rendered) return;
    try { app._playPulse(data); } catch (err) { console.warn("TSL | viz pulse failed:", err); }
  }

  _playPulse({ srcId, tgtId, group, outcome, damage } = {}) {
    const root = this.element?.[0];
    const stage = root?.querySelector(".tsl-viz-stage");
    const svg   = root?.querySelector(".tsl-viz-svg");
    if (!stage || !svg) return;

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
      setTimeout(() => line.remove(), 1300);

      // Briefly light up the standing bond edge between them, if any.
      const edge = svg.querySelector(
        `.tsl-viz-edge[data-a="${srcId}"][data-b="${tgtId}"], .tsl-viz-edge[data-a="${tgtId}"][data-b="${srcId}"]`);
      if (edge) { edge.classList.add("pulsing"); setTimeout(() => edge.classList.remove("pulsing"), 1300); }
    }

    // Flash the one who was acted upon.
    const tgtNode = stage.querySelector(`.tsl-viz-node[data-actor-id="${tgtId}"]`);
    if (tgtNode) {
      tgtNode.classList.add(`flash-${kind}`);
      setTimeout(() => tgtNode.classList.remove(`flash-${kind}`), 950);
    }

    // Float the result over the target.
    if (tgt) {
      const label = kind === "wall" ? "walled"
        : kind === "hit" ? (damage > 0 ? `−${damage}` : "hit")
        : "miss";
      const float = document.createElement("div");
      float.className = `tsl-viz-float tsl-viz-float--${kind}`;
      float.textContent = label;
      float.style.left = `${tgt.x}px`;
      float.style.top  = `${tgt.y}px`;
      stage.appendChild(float);
      setTimeout(() => float.remove(), 1200);
    }
  }
}
