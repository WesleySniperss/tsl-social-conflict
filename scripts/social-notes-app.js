/**
 * tsl-social-conflict | social-notes-app.js
 *
 * The Chronicle — one window per character, opened from the token HUD.
 *
 *   Profile — an NPC: (GM) its hidden nature, what it does after a "no", what
 *             the party knows, the dossier, its Agenda. A player character:
 *             Leanings (dots per approach) and notes.
 *   Bonds   — relationships: type + strength (one shared bond, mirrored on
 *             both sides), Strings held (and Pull: +5 strike or guard).
 *   Talk    — where you act: pick an NPC, then one of twelve TECHNIQUES
 *             (Pressure · Heart · Reason × Open · Ask · Read · Gambit). An
 *             NPC's own Talk tab is the GM's cheat sheet for playing them.
 *   Codex   — the rules.
 *
 * Access: the GM sees and edits everything; players open only actors they own.
 */

console.log("TSL | Loading social-notes-app.js...");

class SocialFencingDialog {
  static _instances = new Map();

  static open(actor, opts = {}) {
    if (!actor) return;
    // Chronicle data lives on the WORLD actor. An unlinked token hands us its
    // synthetic actor (same id, token-local flags) — normalise to the base
    // actor so every copy of a character shares one chronicle.
    actor = game.actors.get(actor.id) ?? actor;
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("You can only open the Chronicle of characters you own.");
      return;
    }
    // opts.target — open already talking to this NPC (from the NPC's own Talk tab).
    const aim = (app) => {
      if (opts.tab) app._tab = opts.tab;
      if (opts.target) { app._tTarget = opts.target; app._tTech = null; app._tLever = null; app._tResult = null; }
    };
    const existing = SocialFencingDialog._instances.get(actor.id);
    if (existing) {
      aim(existing);
      if (opts.tab || opts.target) existing.render(true);
      existing.bringToTop?.();
      return existing;
    }
    const app = new SocialFencingApp(actor);
    aim(app);
    SocialFencingDialog._instances.set(actor.id, app);
    app.render(true);
    return app;
  }
}

const SocialNotesDialog = SocialFencingDialog;

// ApplicationV1 base — still shipped (deprecated) in v13/v14. Referenced
// defensively so a build that moves V1 under foundry.appv1 still loads.
const _SocialAppBase = globalThis.Application ?? foundry?.appv1?.api?.Application;

class SocialFencingApp extends _SocialAppBase {
  constructor(actor, options = {}) {
    super(options);
    this._actor   = actor;
    this._tab     = SocialArchetypeManager.isPC(actor) ? "talk" : "profile";
    this._codexCat = "start";
    this._picking = false;
    this._expandedBonds = new Set();
    // Talk
    this._tTarget   = null;     // the NPC this character is talking to
    this._tTech     = null;     // the technique picked (a TECHNIQUES id)
    this._tSize     = "costly"; // "small" | "costly" | "against"
    this._tSkill    = null;
    this._tHelper   = null;
    this._tLever    = null;     // "desire" | "fear"
    this._tResult   = null;     // the last roll, shown where Roll was clicked

    // Re-render when this character changes — or the NPC they're talking to
    // (what the party knows lives on the NPC).
    this._flagHook = Hooks.on("updateActor", (a) => {
      if (a.id === this._actor.id || a.id === this._tTarget) this.render(false);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:          "tsl-social-fencing",
      title:       "Chronicle",
      template:    null,
      width:       520,
      height:      "auto",
      resizable:   true,
      minimizable: true,
      classes:     ["tsl-fencing"],
    });
  }

  get id()    { return `tsl-social-fencing-${this._actor.id}`; }
  get title() { return `${this._actor.name} — Chronicle`; }

  async _renderInner(data) { return $(this._buildHTML(data)); }

  // ── Data ────────────────────────────────────────────────────────────────────

  async getData() {
    const isGM = game.user.isGM;
    return {
      isGM,
      canEdit: isGM || this._actor.isOwner,
      isPC: SocialArchetypeManager.isPC(this._actor),
      notes: SocialArchetypeManager.getCharacterNotes(this._actor),
      archetype: SocialArchetypeManager.getArchetype(this._actor),
      bonds: this._buildBondData(),
      candidates: this._buildCandidates(),
    };
  }

  _buildBondData() {
    const actorId = this._actor.id;
    return TSLBondStore.getList(actorId).map(b => {
      const target = game.actors.get(b.targetActorId);
      return {
        ...b,
        targetName: target?.name ?? "(missing actor)",
        targetImg:  target?.img ?? "icons/svg/mystery-man.svg",
        stringCount: TSLStringStore.countOn(actorId, b.targetActorId),
      };
    });
  }

  /** People a new bond can point to: tokens on the current scene (players see visible ones). */
  _buildCandidates() {
    const bonded = new Set(TSLBondStore.getList(this._actor.id).map(b => b.targetActorId));
    bonded.add(this._actor.id);
    const map = new Map();
    for (const t of (canvas.tokens?.placeables ?? [])) {
      if (!t.actor || bonded.has(t.actor.id) || map.has(t.actor.id)) continue;
      if (!game.user.isGM && (t.document.hidden || !t.visible)) continue;
      map.set(t.actor.id, t.actor);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** NPCs on the scene this character can talk to (players: visible tokens only). */
  _sceneNpcs() {
    const map = new Map();
    for (const t of (canvas.tokens?.placeables ?? [])) {
      const a = t.actor;
      if (!a || a.id === this._actor.id || SocialArchetypeManager.isPC(a) || map.has(a.id)) continue;
      if (!game.user.isGM && (t.document.hidden || !t.visible)) continue;
      map.set(a.id, a);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Player characters on the scene (helpers). */
  _scenePcs(exceptId = null) {
    const map = new Map();
    for (const t of (canvas.tokens?.placeables ?? [])) {
      const a = t.actor;
      if (!a || !SocialArchetypeManager.isPC(a) || a.id === exceptId || map.has(a.id)) continue;
      if (!game.user.isGM && (t.document.hidden || !t.visible)) continue;
      map.set(a.id, a);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Shell ───────────────────────────────────────────────────────────────────

  _buildHTML(ctx) {
    const tabs = [
      { id: "profile", label: "Profile", icon: "fa-fingerprint" },
      { id: "bonds",   label: "Bonds",   icon: "fa-link" },
      { id: "talk",    label: "Talk",    icon: "fa-comments" },
      { id: "codex",   label: "Codex",   icon: "fa-book-open" },
    ];
    if (!tabs.some(t => t.id === this._tab)) this._tab = "profile";
    const tabBtns = tabs.map(t => `
      <button type="button" class="tsl-tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
        <i class="fas ${t.icon}"></i><span>${t.label}</span>
      </button>`).join("");
    const body =
      this._tab === "bonds" ? this._buildBondsTab(ctx) :
      this._tab === "talk"  ? this._buildTalkTab(ctx)  :
      this._tab === "codex" ? this._buildCodexTab(ctx) :
                              this._buildProfileTab(ctx);
    return `<div class="tsl-chr">
      <nav class="tsl-tabs">${tabBtns}</nav>
      <div class="tsl-body">${body}</div>
    </div>`;
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  _buildProfileTab(ctx) {
    return ctx.isPC ? this._buildPcProfile(ctx) : this._buildNpcProfile(ctx);
  }

  /** A player character: Leanings (dots per approach) + notes. */
  _buildPcProfile({ notes, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const total = Object.values(notes.triad).reduce((s, v) => s + (v || 0), 0);
    const left  = TRIAD_POINT_POOL - total;
    const rows = APPROACH_ORDER.map(id => {
      const ap  = APPROACHES[id];
      const val = notes.triad[ap.leaning] ?? 0;
      const pips = Array.from({ length: 3 }, (_, i) =>
        `<button type="button" class="tsl-pip ${i < val ? "on" : ""}" data-lean="${ap.leaning}" data-value="${i + 1}"
          style="--pip:${ap.color}" ${dis} aria-label="${ap.label} ${i + 1}"></button>`).join("");
      return `<div class="tsl-lean-row">
        <span class="tsl-lean-label" style="--c:${ap.color}" data-tooltip="${esc(`${ap.gist} ${ap.examples}.`)}">
          <i class="fas ${ap.icon}"></i> ${ap.label}</span>
        <span class="tsl-pips">${pips}</span>
        <span class="tsl-lean-val">${val ? `+${val}` : ""}</span>
      </div>`;
    }).join("");
    return `
      <section class="tsl-sec">
        <div class="tsl-sec-head">
          <span class="tsl-sec-title">Leanings</span>
          <span class="tsl-budget ${left < 0 ? "over" : left === 0 ? "spent" : ""}">${left < 0 ? `${-left} over — lower one` : `${left} / ${TRIAD_POINT_POOL} left`}</span>
        </div>
        <p class="tsl-note">How ${esc(this._actor.name)} reaches for people. Each dot is <b>+1</b> when you ask someone that way.</p>
        ${rows}
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Notes</span></div>
        <textarea name="notes" rows="4" placeholder="Who they are with people — history, wants, what they hide…" ${dis}>${esc(notes.notes)}</textarea>
      </section>`;
  }

  /** An NPC: nature (GM), what the party knows, dossier, agenda, notes. */
  _buildNpcProfile({ notes, archetype, isGM, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const npc = this._actor;

    // Players see the nature only once it is named.
    const natureSec = !isGM ? (archetype && SocialArchetypeManager.isRevealed(npc) ? `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Nature</span></div>
        ${this._archetypeCard(archetype)}
      </section>` : "") : (() => {
      const opts = Object.values(SOCIAL_TRIADS).map(t => `<optgroup label="${t.label} — ${t.horney}">${
        SOCIAL_ARCHETYPES.filter(a => a.triad === t.id).map(a =>
          `<option value="${a.id}" ${notes.archetypeId === a.id ? "selected" : ""}>${a.label}</option>`).join("")}</optgroup>`).join("");
      const ST  = SocialArchetypeManager.PRESSED_STANCES;
      const sel = SocialArchetypeManager.getActorData(npc).stance ?? "nature";
      const stanceOpts = Object.entries(ST).map(([id, s]) => `<option value="${id}" ${sel === id ? "selected" : ""}>${esc(s.label)}${
        id === "nature" && archetype ? ` (${archetype.pressed === "firm" ? "ends it" : "keeps listening"})` : ""}</option>`).join("");
      const named = SocialArchetypeManager.isRevealed(npc);
      return `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Nature</span><span class="tsl-gm-tag">GM</span></div>
        <select name="archetypeId" ${dis}><option value="">— none —</option>${opts}</select>
        ${archetype ? this._archetypeCard(archetype) : `<p class="tsl-note">Without a nature they have no key and no wall, and name no particular price.</p>`}
        <div class="tsl-field-row">
          <label data-tooltip="${esc(Object.values(ST).map(s => `<b>${s.label}</b> — ${s.tip}`).join("<br>"))}">After a no</label>
          <select name="stance" ${dis}>${stanceOpts}</select>
        </div>
        ${archetype ? `<label class="tsl-check" data-tooltip="Name the nature to the table: players see the whole card. The module names it on its own once the party knows the key and the wall.">
          <input type="checkbox" name="revealed" ${named ? "checked" : ""} ${dis}> <span>Named to the table${named ? " — players see the card" : ""}</span></label>` : ""}
      </section>`;
    })();

    const known = SocialArchetypeManager.getKnown(npc);
    const knownChips = READ_ORDER.map(q => `<button type="button" class="tsl-known ${known[q] ? "on" : ""}" data-known="${q}" ${isGM ? "" : "disabled"}
        data-tooltip="${esc(`${READ_QUESTIONS[q].label}<br>${known[q] ? "The party knows." : "Hidden from the party."}${isGM ? " Click to toggle." : ""}`)}">${READ_QUESTIONS[q].short}</button>`).join("");

    // The dossier is the GM's truth; players see only the answers the party has learned.
    const points = PROFILE_POINTS.map(p => `
      <div class="tsl-field-row">
        <label data-tooltip="${esc(p.hint)}"><i class="fas ${p.icon}"></i> ${p.label}</label>
        <input type="text" data-point="${p.id}" value="${esc(notes.points[p.id] ?? "")}" placeholder="${esc(p.placeholder)}" ${dis}>
      </div>`).join("");
    const carded = archetype && SocialArchetypeManager.isRevealed(npc);   // the card already says key, wall, price, after a no
    const learned = isGM ? "" : READ_ORDER.filter(q => known[q] && (!carded || q === "desire" || q === "fear")).map(q =>
      `<span>${READ_QUESTIONS[q].short}</span><span>${esc(TSLTalk.answerFor(npc, q))}</span>`).join("");

    return `
      ${natureSec}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">What the party knows</span></div>
        <div class="tsl-known-row">${knownChips}</div>
        ${learned ? `<div class="tsl-arch-grid tsl-cheat">${learned}</div>` : ""}
        <p class="tsl-note">A Read answers these, one question at a time; some the party learns by doing. Knowledge of a person lasts.</p>
      </section>
      ${!isGM ? "" : `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Dossier</span></div>
        ${points}
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Agenda</span><span class="tsl-gm-tag">GM</span></div>
        <textarea name="intent" rows="2" placeholder="What do they want from the party? It shapes their price and how they push back.">${esc(notes.intent)}</textarea>
      </section>`}
      ${!isGM && !canEdit ? "" : `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Notes</span></div>
        <textarea name="notes" rows="3" placeholder="How they behave, history…" ${dis}>${esc(notes.notes)}</textarea>
      </section>`}`;
  }

  /** The full card of a nature (the GM's view, or once it is named). */
  _archetypeCard(a) {
    const esc = foundry.utils.escapeHTML;
    const t = SOCIAL_TRIADS[a.triad];
    const key = APPROACHES[a.key], wall = APPROACHES[a.wall];
    return `<div class="tsl-arch" style="--c:${t?.color ?? "#9b6ee8"}">
      <div class="tsl-arch-head"><b>${esc(a.label)}</b><span>${esc(t?.label ?? "")} — ${esc(t?.horney ?? "")}</span></div>
      <div class="tsl-arch-desc">${esc(a.description)}</div>
      <div class="tsl-arch-kw tsl-arch-kw--key"><span><i class="fas ${key.icon}"></i> Key · ${key.label}</span>${esc(a.keyText)}</div>
      <div class="tsl-arch-kw tsl-arch-kw--wall"><span><i class="fas ${wall.icon}"></i> Wall · ${wall.label}</span>${esc(a.wallText)}</div>
      <div class="tsl-arch-grid">
        <span>Price</span><span>${esc(a.price.text)}${a.price.string ? " <i>(a String on you)</i>" : ""}</span>
        <span>On a no</span><span>${esc(a.press)}</span>
        <span>After a no</span><span>${a.pressed === "firm" ? "ends it" : "keeps listening"} — ${esc(a.pressedWhy)}</span>
        <span>Craves</span><span>${esc(a.craves)}</span>
        <span>Dreads</span><span>${esc(a.dreads)}</span>
      </div>
      <div class="tsl-arch-psych">${esc(a.psych)}</div>
    </div>`;
  }

  // ── Bonds ───────────────────────────────────────────────────────────────────

  _buildBondsTab({ bonds, candidates, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const typeOpts = (sel) => BOND_TYPES.map(t => `<option value="${t.id}" ${SocialArchetypeManager.getBondType(sel).id === t.id ? "selected" : ""}>${t.label}</option>`).join("");

    const rows = bonds.length ? bonds.map(b => {
      const type = SocialArchetypeManager.getBondType(b.type);
      const str  = Math.min(3, Math.abs(b.attitude ?? 0));
      const ap   = APPROACHES[SocialArchetypeManager.bondApproach(type.id)];
      const open = this._expandedBonds.has(b.id);
      const strTrack = [0, 1, 2, 3].map(v => `<button type="button" class="tsl-str ${v === 0 ? "zero" : ""} ${v > 0 && v <= str ? "on" : ""} ${v === str ? "cur" : ""}"
          data-bond-id="${b.id}" data-strength="${v}" ${dis} data-tooltip="${v === 0 ? "Faded — no effect" : `${"●".repeat(v)}${ap ? ` — +${v} when you ask them with ${ap.label}` : ""}`}">${v === 0 ? "✕" : ""}</button>`).join("");
      const details = !open ? "" : `
        <div class="tsl-bond-body">
          <div class="tsl-field-row">
            <label data-tooltip="${esc(type.hint)}">Bond</label>
            <select class="tsl-bond-type" data-bond-id="${b.id}" ${dis}>${typeOpts(b.type)}</select>
            ${canEdit ? `<button type="button" class="tsl-icon-btn tsl-bond-remove" data-bond-id="${b.id}" data-tooltip="End this bond (on both sides)"><i class="fas fa-trash"></i></button>` : ""}
          </div>
          <div class="tsl-field-row">
            <label data-tooltip="How deep it runs, 0–3 ●.${ap ? ` +1 per ● when you ask them that way.` : " A Stranger bond has no effect."} Doing something against their interests for you deepens it; a door slammed on you cools it.">Strength</label>
            <span class="tsl-str-track">${strTrack}</span>
          </div>
          <div class="tsl-field-row">
            <label data-tooltip="Strings you hold on them — a hold, at most ${STRING_CAP} on one person. Spend one for +5 after a miss against them, or Pull it in a fight. Holding one is leverage for an ask against their interests.">Strings</label>
            <span class="tsl-strings">${"●".repeat(b.stringCount)}${"○".repeat(Math.max(0, STRING_CAP - b.stringCount))}</span>
            ${canEdit ? `
              <button type="button" class="tsl-icon-btn" data-str-adj="1" data-target="${b.targetActorId}" ${b.stringCount >= STRING_CAP ? "disabled" : ""} data-tooltip="Gain a String on them — e.g. when you open your heart to them in play (the GM's call)">+</button>
              <button type="button" class="tsl-icon-btn" data-str-adj="-1" data-target="${b.targetActorId}" ${b.stringCount ? "" : "disabled"} data-tooltip="Remove a String">−</button>
              <button type="button" class="tsl-btn tsl-pull" data-pull="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
                data-tooltip="PULL — burn one: STRIKE (+5 to your next attack, check or save against them) or GUARD (+5 AC against their next attack). It goes on your sheet and ends itself once used.">Pull +5</button>` : ""}
          </div>
          <input type="text" class="tsl-bond-notes" data-bond-id="${b.id}" value="${esc(b.notes ?? "")}" placeholder="History, debts, secrets between you…" ${dis}>
        </div>`;
      return `<div class="tsl-bond ${open ? "open" : ""}">
        <div class="tsl-bond-head" data-bond-toggle="${b.id}">
          <img src="${b.targetImg}" alt="">
          <span class="tsl-bond-name">${esc(b.targetName)}</span>
          <span class="tsl-bond-type-tag" style="--c:${ap?.color ?? "#8a7d72"}" data-tooltip="${esc(type.hint)}"><i class="fas ${type.icon}"></i> ${type.label}</span>
          <span class="tsl-bond-dots">${str ? "●".repeat(str) : "○"}</span>
          ${b.stringCount ? `<span class="tsl-bond-strings" data-tooltip="Strings you hold on them"><i class="fas fa-masks-theater"></i> ${b.stringCount}</span>` : ""}
          <i class="fas fa-chevron-${open ? "up" : "down"} tsl-bond-chev"></i>
        </div>
        ${details}
      </div>`;
    }).join("") : `<p class="tsl-note tsl-empty">No bonds yet.</p>`;

    const add = canEdit ? `<div class="tsl-add-row">
        <select class="tsl-bond-add"><option value="">Add a bond…</option>${candidates.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
        <button type="button" class="tsl-btn ${this._picking && this._pickMode === "bond" ? "picking" : ""}" data-bond-pick
          data-tooltip="Click a token on the map to bond with it. Esc cancels."><i class="fas fa-crosshairs"></i> ${this._picking && this._pickMode === "bond" ? "Click a token…" : "Pick"}</button>
      </div>` : "";

    return `<section class="tsl-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title">Bonds</span></div>
      ${add}
      <div class="tsl-bonds">${rows}</div>
    </section>`;
  }

  // ── Talk ────────────────────────────────────────────────────────────────────

  _buildTalkTab(ctx) {
    // An NPC's own Talk tab: the GM's cheat sheet for playing them.
    if (!ctx.isPC) {
      if (!ctx.isGM) return `<p class="tsl-note tsl-empty">Talk from your own character's Chronicle.</p>`;
      return this._askAsRow() + this._cheatSheet(this._actor);
    }
    const esc = foundry.utils.escapeHTML;
    const npcs = this._sceneNpcs();
    if (this._tTarget && !game.actors.get(this._tTarget)) this._tTarget = null;
    const tgt = this._tTarget ? game.actors.get(this._tTarget) : null;
    const picking = this._picking && this._pickMode === "target";
    const opts = npcs.map(a => `<option value="${a.id}" ${a.id === this._tTarget ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    const extra = tgt && !npcs.some(a => a.id === tgt.id) ? `<option value="${tgt.id}" selected>${esc(tgt.name)}</option>` : "";
    return `
      <section class="tsl-sec">
        <div class="tsl-target-row">
          <select class="tsl-t-target"><option value="">Who are you talking to?</option>${extra}${opts}</select>
          <button type="button" class="tsl-btn ${picking ? "picking" : ""}" data-t-pick data-tooltip="Click an NPC's token on the map. Esc cancels.">
            <i class="fas fa-crosshairs"></i> ${picking ? "Click a token…" : "Map"}</button>
        </div>
        ${!npcs.length && !tgt ? `<p class="tsl-note">No NPC tokens on this scene — place one on the map first.</p>` : ""}
      </section>
      ${tgt ? this._personPanel(tgt, ctx) : `<p class="tsl-note tsl-empty">Pick who you're talking to — from the list, or <b>Map</b> and click their token. Then the twelve techniques appear: open them up, ask, read them — or go all in.</p>`}
      ${tgt ? this._askPanel(this._actor, tgt, ctx) : ""}`;
  }

  /**
   * On an NPC's own Talk tab: the asking happens in the SPEAKER's Chronicle —
   * one click opens it, already talking to this NPC.
   */
  _askAsRow() {
    const esc = foundry.utils.escapeHTML;
    const pcs = this._scenePcs();
    if (!pcs.length) return `<p class="tsl-note tsl-t-where"><i class="fas fa-circle-info"></i> Asking happens in the speaker's Chronicle — put a player character's token on this scene, then ask from it.</p>`;
    return `<section class="tsl-sec tsl-t-where tsl-t-askas">
      <span class="tsl-t-askas-label"><i class="fas fa-circle-info"></i> Ask or read ${esc(this._actor.name)} as:</span>
      <div class="tsl-t-askas-row">${pcs.map(a => `<button type="button" class="tsl-btn" data-t-as="${a.id}" data-tooltip="Open ${esc(a.name)}'s Chronicle — Talk, already facing ${esc(this._actor.name)}">
        <img src="${a.img ?? "icons/svg/mystery-man.svg"}" alt=""> ${esc(a.name)}</button>`).join("")}</div>
    </section>`;
  }

  /** Who they are, as far as the party knows (the GM sees the truth, marked). */
  _personPanel(npc, ctx) {
    const esc  = foundry.utils.escapeHTML;
    const isGM = ctx.isGM;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const named = SocialArchetypeManager.isRevealed(npc);
    const known = SocialArchetypeManager.getKnown(npc);
    const nature = arch && (named || isGM)
      ? `<span class="tsl-x-nature" style="--c:${SOCIAL_TRIADS[arch.triad]?.color}">${esc(arch.label)}${!named ? ` <i class="tsl-hidden-tag">hidden</i>` : ""}</span>`
      : `<span class="tsl-x-nature tsl-x-nature--unread">Nature unread</span>`;
    const facts = READ_ORDER.map(q => {
      const k = known[q];
      if (!k && !isGM) return `<span class="tsl-fact unknown" data-tooltip="${esc(READ_QUESTIONS[q].label)} — read them to find out."><b>${READ_QUESTIONS[q].short}</b> ?</span>`;
      let val;
      if (q === "key" || q === "wall") {
        const ap = arch ? APPROACHES[arch[q]] : null;
        val = ap ? `<i class="fas ${ap.icon}" style="color:${ap.color}"></i> ${ap.label}` : "none";
      } else if (q === "pressed") {
        const st = SocialArchetypeManager.getStance(npc);
        val = st === "firm" ? "ends it" : st === "yield" ? "keeps listening" : "either";
      } else {
        val = esc(TSLTalk.answerFor(npc, q));
      }
      return `<span class="tsl-fact ${k ? "" : "secret"}" data-tooltip="${esc(`${READ_QUESTIONS[q].label}${k ? "" : " — hidden from the party"}`)}"><b>${READ_QUESTIONS[q].short}</b> ${val}</span>`;
    }).join("");
    return `<section class="tsl-sec tsl-x-panel">
      <div class="tsl-x-top">
        <img class="tsl-x-portrait" src="${npc.img ?? "icons/svg/mystery-man.svg"}" alt="">
        <div class="tsl-x-id"><span class="tsl-x-name">${esc(npc.name)}</span>${nature}</div>
        <span class="tsl-x-phase" data-tooltip="Their DC: 10 + proficiency + the better of WIS/INT. A small ask is 4 easier, one against their interests 4 harder.">DC ${TSLTalk.dcFor(npc).dc}</span>
      </div>
      <div class="tsl-facts">${facts}</div>
      ${this._openingsRow(npc, { gm: isGM })}
      ${arch && named && !isGM ? `<details class="tsl-x-card-open"><summary>Their nature</summary>${this._archetypeCard(arch)}</details>` : ""}
    </section>`;
  }

  /** The openings on them, as tags (the next ask is easier for each). */
  _openingsRow(npc, { gm = false } = {}) {
    const esc = foundry.utils.escapeHTML;
    const list = TSLTalk.openings(npc);
    const tags = list.map(o => {
      const ap = APPROACHES[o.type];
      const by = game.actors.get(o.byId)?.name;
      return `<span class="tsl-opening" style="--c:${ap.color}" data-tooltip="${esc(`${OPENINGS[o.type].label} — ${OPENINGS[o.type].hint}${by ? ` (${by})` : ""}. The next ask is ${OPENING_BONUS} easier; it counts as leverage. An ask spends it; any other miss closes one.`)}">
        <i class="fas fa-unlock"></i> ${OPENINGS[o.type].label}</span>`;
    }).join("");
    return `<div class="tsl-openings">
      <span class="tsl-openings-label" data-tooltip="${esc(TECH_JOBS.open.hint)}">Openings</span>
      ${tags || `<span class="tsl-openings-none">none yet — Open them first to make a big ask easier</span>`}
      ${gm && list.length ? `<button type="button" class="tsl-btn tsl-btn--tiny" data-open-clear="${npc.id}" data-tooltip="Clear the openings (a new scene, a pause, a change of heart)">Clear</button>` : ""}
    </div>`;
  }

  /** The twelve techniques — approach × job — and, once one is picked, its roll. */
  _askPanel(src, npc, ctx) {
    const esc = foundry.utils.escapeHTML;
    const known = SocialArchetypeManager.getKnown(npc);
    const arch = SocialArchetypeManager.getArchetype(npc);
    const openings = TSLTalk.openings(npc);
    if (this._tTech && !TECHNIQUES[this._tTech]) this._tTech = null;

    const mark = (id) => {
      if (!arch) return "";
      if (known.key && arch.key === id) return ` <i class="fas fa-key tsl-mark--key" data-tooltip="Their key — the better of two dice"></i>`;
      if (known.wall && arch.wall === id) return ` <i class="fas fa-door-closed tsl-mark--wall" data-tooltip="Their wall — the worse of two dice"></i>`;
      return "";
    };
    const heads = APPROACH_ORDER.map(id => {
      const ap = APPROACHES[id];
      return `<span class="tsl-tech-ap" style="--c:${ap.color}" data-tooltip="${esc(`<b>${ap.label}</b> — ${ap.gist} ${ap.cost}`)}"><i class="fas ${ap.icon}"></i> ${ap.label}${mark(id)}</span>`;
    }).join("");
    const rows = JOB_ORDER.map(job => {
      const cells = APPROACH_ORDER.map(apId => {
        const tech = TECHNIQUES[techniqueFor(apId, job)];
        const ap = APPROACHES[apId];
        const done = job === "open" && openings.some(o => o.type === apId);
        const locked = (tech.id === "blackmail" && !known.fear && !TSLStringStore.countOn(src.id, npc.id))
          || (tech.id === "seduce" && !known.desire && (TSLBondStore.find(src.id, npc.id) ? TSLBondStore.getStrength(src.id, npc.id) : 0) < 2);
        return `<button type="button" class="tsl-tech-btn ${this._tTech === tech.id ? "on" : ""} ${done ? "done" : ""} ${locked ? "locked" : ""}"
          data-tech="${tech.id}" style="--c:${ap.color}" ${done ? "disabled" : ""}
          data-tooltip="${esc(`<b>${tech.label}</b> — ${tech.line}.<br>${tech.rule}${done ? `<br><i>They're already ${OPENINGS[apId].label}.</i>` : ""}`)}">
          ${done ? `<i class="fas fa-check"></i> ` : locked ? `<i class="fas fa-lock"></i> ` : ""}${tech.label}</button>`;
      }).join("");
      return `<span class="tsl-tech-job" data-tooltip="${esc(TECH_JOBS[job].hint)}"><i class="fas ${TECH_JOBS[job].icon}"></i> ${TECH_JOBS[job].label}</span>${cells}`;
    }).join("");

    let body = `<p class="tsl-note tsl-t-caption">Say your line — then pick the technique it really is.</p>`;
    if (this._tTech) {
      const pv = TSLTalk.preview(src, npc, { technique: this._tTech, size: this._tSize, skill: this._tSkill, helperId: this._tHelper, lever: this._tLever });
      const tech = TECHNIQUES[pv.technique];
      const sizes = !pv.sized ? "" : `<div class="tsl-sizes">${ASK_ORDER.map(id => {
        const a = ASK_SIZES[id];
        const dc = TSLTalk.dcFor(npc, id, pv.openings.length).dc;
        return `<button type="button" class="tsl-size ${pv.size === id ? "on" : ""}" data-size="${id}"
          data-tooltip="${esc(`${a.label} — ${a.hint}.`)}"><b>${a.short}</b><span>DC ${dc}</span></button>`;
      }).join("")}</div>`;
      const caption = `<b>${esc(tech.label)}</b> — ${esc(tech.line)}. ${esc(tech.rule)}${pv.sized ? ` <i>${esc(ASK_SIZES[pv.size].label)}: ${esc(ASK_SIZES[pv.size].hint)}.</i>` : ""}`;
      const skillOpts = [...tech.skills, ...SKILL_ORDER.filter(k => !tech.skills.includes(k))].map(k => {
        const v = TSLTalk.skillMod(src, k);
        return `<option value="${k}" ${k === pv.skill ? "selected" : ""}>${SKILL_LABELS[k]} ${v >= 0 ? "+" : ""}${v}${tech.skills.includes(k) ? "" : " ·"}</option>`;
      }).join("");
      const helpers = this._scenePcs(src.id).map(a => `<option value="${a.id}" ${a.id === pv.helperId ? "selected" : ""}>${esc(a.name)}</option>`).join("");
      const levers = pv.job !== "ask" ? "" : ["desire", "fear"].filter(l => pv.leverOk[l]).map(l =>
        `<button type="button" class="tsl-lever ${pv.lever === l ? "on" : ""}" data-lever="${l}"
          data-tooltip="${esc(`Play on their ${l === "desire" ? "Desire" : "Fear"}: “${TSLTalk.answerFor(npc, l)}” — +${LEVER_BONUS}, and it counts as leverage.${l === "fear" ? " A threat cuts both ways: if the ask fails, they take a String on you." : ""}`)}">
          <i class="fas ${l === "desire" ? "fa-gem" : "fa-ghost"}"></i> Their ${l === "desire" ? "Desire" : "Fear"} +${LEVER_BONUS}</button>`).join("");
      const strings = pv.strings ? `<span class="tsl-note tsl-t-strings" data-tooltip="Burn one for +${STRING_SPEND_BONUS} after a miss — you'll be asked.">
        <i class="fas fa-masks-theater"></i> ${pv.strings} String${pv.strings > 1 ? "s" : ""} on them</span>` : "";
      const math = pv.parts.map(p => `<span class="tsl-math-part">${p.value >= 0 ? "+" : "−"}${Math.abs(p.value)} ${esc(p.label)}</span>`).join("");
      const dcMods = pv.dcMods.map(m => ` ${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${esc(m.label)}`).join("");
      const verb = { open: "roll", ask: "ask", read: "read", gambit: "all in" }[pv.job];
      body = `
        <p class="tsl-note tsl-t-caption">${caption}</p>
        ${sizes}
        <div class="tsl-x-opts">
          <label>Skill <select class="tsl-t-skill">${skillOpts}</select></label>
          <label>Help <select class="tsl-t-help"><option value="">nobody</option>${helpers}</select></label>
        </div>
        ${levers || strings ? `<div class="tsl-x-levers">${levers}${strings}</div>` : ""}
        <div class="tsl-x-math">
          <span class="tsl-math-die">d20</span>${math}
          <span class="tsl-math-vs" data-tooltip="${esc(`10 + their proficiency + the better of WIS / INT = ${pv.dcBase}${dcMods}`)}">vs DC ${pv.dc}</span>
        </div>
        ${pv.blocked ? `<div class="tsl-x-blocked">${esc(pv.blocked)}</div>` : ""}
        <button type="button" class="tsl-roll" data-t-roll ${pv.blocked ? "disabled" : ""} style="--c:${APPROACHES[pv.approach].color}">
          <i class="fas fa-dice-d20"></i> ${esc(tech.label)} — ${verb}</button>`;
    }

    return `<section class="tsl-sec tsl-x-speak">
      <div class="tsl-tech"><span></span>${heads}${rows}</div>
      ${body}
      ${this._resultHTML()}
    </section>`;
  }

  /** The last roll, right where Roll was clicked. */
  _resultHTML() {
    const r = this._tResult;
    if (!r) return "";
    const esc = foundry.utils.escapeHTML;
    const tech = TECHNIQUES[r.technique];
    const hit = r.grade === "strong" || r.grade === "success";
    const bits = [];
    if (r.rel === "key") bits.push("their key — the better die");
    if (r.rel === "wall") bits.push("their wall — the worse die");
    if (tech?.job === "open" && hit) bits.push(`they're ${OPENINGS[tech.approach].label}`);
    if (tech?.job === "ask" && r.grade === "success" && TSLTalk.hasPrice(r.technique)) bits.push(r.paid ? "you paid their price" : "you walked away from their price");
    if (tech?.job === "read" && r.questions?.length) bits.push(`learned: ${r.questions.map(q => READ_QUESTIONS[q]?.short).join(", ")}`);
    const cls = hit ? (r.grade === "strong" ? "crit" : "success") : r.grade === "botch" ? "botch" : "failure";
    return `<div class="tsl-result tsl-result--${cls}">
      <span class="tsl-result-total">${r.total}</span>
      <span class="tsl-result-vs">vs ${r.dc}</span>
      <span class="tsl-result-label">${esc(`${tech ? `${tech.label}: ` : ""}${TSLTalk.gradeLabel(r.technique, r.grade)}`)}</span>
      ${bits.length ? `<span class="tsl-result-bits">${esc(bits.join(" · "))}</span>` : ""}
      <button type="button" class="tsl-result-x" data-t-clear-result aria-label="Dismiss">×</button>
    </div>`;
  }

  /** An NPC's own Talk tab: how to play them, their openings, the lies they believe, the Strings they hold. */
  _cheatSheet(npc) {
    const esc = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const held = TSLStringStore.getList(npc.id).reduce((m, e) => {
      const who = game.actors.get(e.targetActorId)?.name;
      if (who) m.set(who, (m.get(who) ?? 0) + 1);
      return m;
    }, new Map());
    const stance = SocialArchetypeManager.getStance(npc);
    const lies = TSLTalk.lies(npc);
    return `
      ${this._personPanel(npc, { isGM: true })}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Playing them</span><span class="tsl-gm-tag">GM</span></div>
        ${arch ? `<div class="tsl-arch-grid tsl-cheat">
          <span>Key</span><span><b>${APPROACHES[arch.key].label}</b> — ${esc(arch.keyText)}</span>
          <span>Wall</span><span><b>${APPROACHES[arch.wall].label}</b> — ${esc(arch.wallText)}</span>
          <span>Yes, but</span><span>${esc(arch.price.text)}${arch.price.string ? " <i>(a String on the asker)</i>" : ""}</span>
          <span>On a no</span><span>${esc(arch.press)}</span>
          <span>After a no</span><span>${stance === "firm" ? "they end it — the door is closed for the scene" : stance === "yield" ? "they keep listening" : "your call"}</span>
        </div>` : `<p class="tsl-note">No nature set — pick one in Profile, and this becomes your cheat sheet.</p>`}
        <p class="tsl-note">Roll only when they're unwilling and it matters. The players pick the technique and size the ask — say so if the words don't match.</p>
      </section>
      ${lies.length ? `<section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">Lies they believe</span><span class="tsl-gm-tag">GM</span></div>
        ${lies.map(l => `<div class="tsl-lie"><span><i class="fas fa-mask"></i> ${esc(game.actors.get(l.byId)?.name ?? "someone")} lied to them</span>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-lie-out="${l.id}" data-tooltip="The truth comes out: they turn on the liar (Enemy) and take two Strings on them.">Bring it out</button></div>`).join("")}
      </section>` : ""}
      ${held.size ? `<section class="tsl-sec"><div class="tsl-sec-head"><span class="tsl-sec-title">Strings they hold</span></div>
        <p class="tsl-note">${[...held].map(([who, n]) => `${esc(who)} ${"●".repeat(n)}`).join(" · ")} — spend one for +5 against them, or Pull it (Bonds).</p></section>` : ""}`;
  }

  // ── Codex ───────────────────────────────────────────────────────────────────

  _buildCodexTab({ isGM }) {
    const cats = [
      { id: "start",   label: "How it works", icon: "fa-play" },
      { id: "ap",      label: "Techniques",   icon: "fa-hand-fist" },
      { id: "read",    label: "Reading",      icon: "fa-eye" },
      { id: "natures", label: "Natures",      icon: "fa-masks-theater" },
      { id: "bonds",   label: "Strings & bonds", icon: "fa-link" },
      ...(isGM ? [{ id: "gm", label: "GM", icon: "fa-crown" }] : []),
    ];
    if (!cats.some(c => c.id === this._codexCat)) this._codexCat = "start";
    const nav = cats.map(c => `<button type="button" class="tsl-cx-cat ${this._codexCat === c.id ? "on" : ""}" data-codex-cat="${c.id}">
      <i class="fas ${c.icon}"></i> ${c.label}</button>`).join("");
    return `<div class="tsl-codex">
      <nav class="tsl-cx-nav">${nav}</nav>
      <div class="tsl-cx-page">${this._codexPage(this._codexCat)}</div>
    </div>`;
  }

  _codexPage(cat) {
    const esc = foundry.utils.escapeHTML;
    const grid = `<div class="tsl-cx-grid"><span></span>${APPROACH_ORDER.map(id => `<b style="--c:${APPROACHES[id].color}"><i class="fas ${APPROACHES[id].icon}"></i> ${APPROACHES[id].label}</b>`).join("")}
      ${JOB_ORDER.map(job => `<i>${TECH_JOBS[job].label}</i>${APPROACH_ORDER.map(ap => `<span>${TECHNIQUES[techniqueFor(ap, job)].label}</span>`).join("")}`).join("")}</div>`;
    switch (cat) {
      case "ap": return `
        <h3>Twelve techniques</h3>
        <p>Every technique is a way of coming at someone doing one job. Pick the one your words really are — any skill that fits them can roll.</p>
        ${APPROACH_ORDER.map(id => {
          const ap = APPROACHES[id];
          return `<div class="tsl-cx-card" style="--c:${ap.color}">
            <div class="tsl-cx-card-head"><i class="fas ${ap.icon}"></i> ${ap.label} <span>${esc(ap.gist)} ${esc(ap.cost)}</span></div>
            ${JOB_ORDER.map(job => {
              const t = TECHNIQUES[techniqueFor(id, job)];
              return `<p><b>${esc(t.label)}</b> <span class="tsl-cx-small">(${TECH_JOBS[job].label.toLowerCase()} — ${esc(t.line)})</span> ${esc(t.rule)}</p>`;
            }).join("")}
          </div>`;
        }).join("")}
        <h3>Key and wall</h3>
        <ul>
          <li><b><i class="fas fa-key"></i> Key</b> — the approach that opens them: on any of its four techniques you roll a second d20 and keep the better.</li>
          <li><b><i class="fas fa-door-closed"></i> Wall</b> — the approach they close against: a second d20, keep the worse.</li>
          <li>The third is plain ground. Both show only in the result — the second die is how you find out.</li>
        </ul>
        <h3>How big is the ask?</h3>
        <ul>${ASK_ORDER.map(id => `<li><b>${ASK_SIZES[id].label}</b> — ${esc(ASK_SIZES[id].hint)}. DC ${ASK_SIZES[id].dc > 0 ? "+" : ASK_SIZES[id].dc < 0 ? "−" : "±"}${Math.abs(ASK_SIZES[id].dc)}.</li>`).join("")}</ul>
        <p class="tsl-cx-small">An ask against them needs leverage: an opening, their Desire or Fear, a String on them, or a deep bond (●●) that runs your way. A gambit brings its own.</p>
        <h3>Your roll</h3>
        <p>d20 + the skill that fits + <b>Leanings</b> (+1 per dot in that approach) + <b>bond</b> (+● if it runs that way) + <b>their Desire or Fear</b> (+${LEVER_BONUS}, once you know it) + <b>help</b> (+${HELP_BONUS}), against <b>DC = 10 + their proficiency + the better of WIS/INT</b> — shifted by the size of an ask, and ${OPENING_BONUS} easier for each opening.</p>`;

      case "read": return `
        <h3>Three ways to read someone</h3>
        <ul>
          <li><b>Study</b> (Reason) — watch them, ask the one right question. Safe.</li>
          <li><b>Provoke</b> (Pressure) — needle them until they blurt it out. It works on a hothead — and they resent you for it.</li>
          <li><b>Confide</b> (Heart) — open up, so they open up too. The bond warms; but a miss leaves you exposed.</li>
        </ul>
        <p>A hit answers one question — two on a strong hit:</p>
        <ol class="tsl-cx-qs">${READ_ORDER.map(q => `<li>${READ_QUESTIONS[q].label}</li>`).join("")}</ol>
        <ul>
          <li>What you learn goes into the party's dossier on them — for good.</li>
          <li>Once the party knows their <b>key and their wall</b>, the nature is named and its whole card opens.</li>
          <li>A miss: they notice, and won't be read again this scene. A bad miss: they read you instead — a String on you.</li>
        </ul>
        <h3>Learning by doing</h3>
        <p>Every technique teaches: the second die shows their key or their wall; their price shows when they say "yes, but"; a slammed door shows what they do after a no.</p>
        <h3>Nine natures, three ways of coping</h3>
        <p>Karen Horney described three ways people cope with others — moving <b>against</b> them (Power), <b>toward</b> them (Emotion), <b>away</b> from them (Order). Inside a triad every nature has a different key and wall: knowing someone's way is never enough. Read the person.</p>`;

      case "natures": return `
        <h3>The nine natures</h3>
        <p>The catalog is open to everyone; who is which is not.</p>
        ${Object.values(SOCIAL_TRIADS).map(t => `
          <div class="tsl-cx-triad" style="--c:${t.color}"><b>${t.label}</b> — moving ${t.horney}</div>
          ${SOCIAL_ARCHETYPES.filter(x => x.triad === t.id).map(x => `
            <div class="tsl-cx-card" style="--c:${t.color}">
              <div class="tsl-cx-card-head">${esc(x.label)} <span>${esc(x.description)}</span></div>
              <p><span class="tsl-cx-k"><i class="fas fa-key"></i> ${APPROACHES[x.key].label}</span> ${esc(x.keyText)}</p>
              <p><span class="tsl-cx-w"><i class="fas fa-door-closed"></i> ${APPROACHES[x.wall].label}</span> ${esc(x.wallText)}</p>
              <p><span class="tsl-cx-p"><i class="fas fa-handshake"></i> Price</span> ${esc(x.price.text)}${x.price.string ? " <i>(a String on you)</i>" : ""}</p>
              <p class="tsl-cx-small">After a no, they ${x.pressed === "firm" ? "end it" : "keep listening"} — ${esc(x.pressedWhy)}. ${esc(x.psych)}</p>
            </div>`).join("")}`).join("")}`;

      case "bonds": return `
        <h3>Strings</h3>
        <p>A String is a hold on one person — at most ${STRING_CAP} on anyone. It does nothing while you hold it; you <b>spend</b> it.</p>
        <ul>
          <li><b>After a miss</b> against them: burn one for <b>+${STRING_SPEND_BONUS}</b>.</li>
          <li><b>Pull it in a fight</b> (Bonds → Pull): <b>Strike</b> +5 to your next attack, check or save against them, or <b>Guard</b> +5 AC against their next attack. It goes on your sheet and ends itself.</li>
          <li>Holding one is <b>leverage</b> — for an ask against their interests, or for Blackmail.</li>
        </ul>
        <p>You gain one on a strong hit with an ask or a gambit for something big (it cost them more than they show), and when you open your heart in play — the GM hands it over. They gain one on you when a Heart technique misses, when your threat or your lie fails, when you pay certain prices, and on a bad miss.</p>
        <h3>Bonds</h3>
        <p>A bond is a type and a strength (●–●●●), shared by both people. Your bond toward someone gives <b>+1 per ●</b> on techniques of the approach it runs:</p>
        <ul>${APPROACH_ORDER.map(id => `<li><b>${APPROACHES[id].label}</b> — ${BOND_TYPES.filter(t => SocialArchetypeManager.bondApproach(t.id) === id).map(t => t.label).join(", ")}</li>`).join("")}</ul>
        <p>Techniques move bonds: Heart wins <b>warm</b> them (a stranger becomes a Friend); Pressure wins <b>sour</b> them (a stranger becomes a Rival); Blackmail makes an <b>Enemy</b>; a slammed door or a broken heart <b>cools</b> them.</p>
        <h3>Lies</h3>
        <p>A lie that works stays on record. When the GM brings it out, they turn on the liar — an Enemy, and two Strings on them.</p>`;

      case "gm": return `
        <h3>Running it</h3>
        <ul>
          <li><b>Roll only when they're unwilling and it matters.</b> Otherwise, talk.</li>
          <li><b>Nobody declares a goal.</b> Every ask stands on its own — when what the party wants changes, they just ask for the new thing.</li>
          <li><b>Hold them to the words.</b> The technique is what the line really is: a "Flatter" that's a threat is a Shake. Say so before the roll.</li>
          <li><b>Size the ask</b> by what it costs them, not by how tough they are.</li>
          <li><b>Openings are moods, not points.</b> They last while the moment lasts — clear them (their Talk tab) when the scene moves on.</li>
          <li><b>On a "yes, but"</b> their nature names the price (the NPC's Talk tab is your cheat sheet). The player decides whether to pay.</li>
          <li><b>On a "no"</b> they push back their own way — play their "on a no" line. A proud one, refused something big, closes the door for the scene.</li>
          <li><b>Don't let them re-roll the same ask</b> without something new: an opening, a lever, a String, another technique.</li>
          <li><b>Their Line</b> is real: an ask that crosses it is simply refused — no roll.</li>
          <li><b>Lies come out</b> when the story says so — bring them out from their Talk tab.</li>
          <li><b>Reward the heart:</b> when a player opens up in character, give them a String on the one they opened up to (Bonds → +).</li>
        </ul>
        <h3>Content</h3>
        <p>Some techniques model real manipulation — blackmail, guilt, coldness, seduction, lies. Agree on limits with your table before you play them, and keep them on NPCs unless everyone wants otherwise.</p>`;

      default: return `
        <h3>The talk</h3>
        <p>You want something from someone who doesn't want to give it, and it matters. You say your line — and pick the <b>technique</b> it really is. One roll; the person decides how it lands.</p>
        <p class="tsl-t-where"><i class="fas fa-circle-info"></i> <b>Where:</b> right-click your character's token → the <i class="fas fa-address-book"></i> button → <b>Talk</b>. Pick who you're talking to (or <b>Map</b> and click their token).</p>
        ${grid}
        <ul>
          <li><b>Open</b> — get them ready. A hit leaves an <b>opening</b> on them (Shaken, Moved, Curious): the next ask is ${OPENING_BONUS} easier per opening, and it counts as leverage. An ask spends them; any other miss closes one.</li>
          <li><b>Ask</b> — get what you want now, sized by what it costs them: small (DC −4), costly, or against them (DC +4, needs leverage).</li>
          <li><b>Read</b> — learn something for the whole party.</li>
          <li><b>Gambit</b> — all in, on leverage: Blackmail, Seduce, Deceive.</li>
        </ul>
        <h3>What winning costs</h3>
        <ul>${APPROACH_ORDER.map(id => `<li><b>${APPROACHES[id].label}</b> — ${esc(APPROACHES[id].cost)}</li>`).join("")}</ul>
        <h3>What they say</h3>
        <ul>
          <li><b>Strong hit</b> (5 over, or a 20) — it works. An ask or gambit for something big also hands you a String on them.</li>
          <li><b>Hit</b> — it works; an Appeal or a Bargain gets "yes, but": their nature names the price — pay it, or walk away.</li>
          <li><b>Miss</b> — they push back their own way. A proud one, refused something big, closes the door for the scene.</li>
          <li><b>Bad miss</b> (5 under, or a 1) — and it costs you: a String on you.</li>
        </ul>
        <p>After a miss you may burn a String on them for +${STRING_SPEND_BONUS}.</p>
        <h3>The person</h3>
        <p>Every NPC has a hidden nature. Its <b>key</b> approach gives you the better of two dice; its <b>wall</b> the worse. Its <b>price</b>, its <b>pushback</b> and what it does <b>after a no</b> are its own. Read them to find out — or learn the hard way.</p>`;
    }
  }

  // ── Listeners ───────────────────────────────────────────────────────────────

  activateListeners(html) {
    super.activateListeners(html);
    this._bindListeners(html instanceof HTMLElement ? html : html[0]);
  }

  _bindListeners(el) {
    if (!el) return;
    const on = (sel, ev, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener(ev, (e) => fn(e, n)));
    const canEdit = game.user.isGM || this._actor.isOwner;

    on("[data-tab]", "click", (_e, n) => { this._tab = n.dataset.tab; this.render(false); });
    on("[data-codex-cat]", "click", (_e, n) => { this._codexCat = n.dataset.codexCat; this.render(false); });
    on("[data-bond-toggle]", "click", (_e, n) => {
      const id = n.dataset.bondToggle;
      if (this._expandedBonds.has(id)) this._expandedBonds.delete(id); else this._expandedBonds.add(id);
      this.render(false);
    });

    // ── Talk ──
    on("[data-t-as]", "click", (_e, n) => {
      const pc = game.actors.get(n.dataset.tAs);
      if (pc) SocialFencingDialog.open(pc, { tab: "talk", target: this._actor.id });
    });
    on(".tsl-t-target", "change", (e) => {
      this._tTarget = e.target.value || null;
      this._tTech = null; this._tSkill = null; this._tLever = null; this._tResult = null;
      this.render(false);
    });
    on("[data-t-pick]", "click", () => {
      if (this._picking) return this._endPick("Pick cancelled.");
      this._startPick((actor) => {
        if (SocialArchetypeManager.isPC(actor)) { ui.notifications.warn("You ask NPCs — pick someone the GM plays."); return; }
        this._tTarget = actor.id; this._tTech = null; this._tResult = null;
        this.render(false);
      }, "target");
    });
    on("[data-tech]", "click", (_e, n) => {
      this._tTech = this._tTech === n.dataset.tech ? null : n.dataset.tech;
      this._tSkill = null;
      if (TECHNIQUES[this._tTech]?.job !== "ask") this._tLever = null;
      this.render(false);
    });
    on("[data-size]", "click", (_e, n) => { this._tSize = n.dataset.size; this.render(false); });
    on(".tsl-t-skill", "change", (e) => { this._tSkill = e.target.value; this.render(false); });
    on(".tsl-t-help", "change", (e) => { this._tHelper = e.target.value || null; this.render(false); });
    on("[data-lever]", "click", (_e, n) => { this._tLever = this._tLever === n.dataset.lever ? null : n.dataset.lever; this.render(false); });
    on("[data-t-roll]", "click", async (_e, n) => {
      const npc = game.actors.get(this._tTarget);
      if (!npc || !this._tTech) return;
      n.disabled = true;
      const p = await TSLTalk.roll(this._actor, npc, { technique: this._tTech, size: this._tSize, skill: this._tSkill, helperId: this._tHelper, lever: this._tLever });
      if (p) {
        this._tResult = { technique: p.technique, grade: p.grade, total: p.total, dc: p.dc, rel: p.rel, paid: p.paid, questions: p.questions };
        this._tLever = null;
        this._tTech = null;
      }
      this.render(false);
    });
    on("[data-open-clear]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.clearOpenings(game.actors.get(n.dataset.openClear)); });
    on("[data-lie-out]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.exposeLie(this._actor, n.dataset.lieOut); });
    on("[data-t-clear-result]", "click", () => { this._tResult = null; this.render(false); });

    if (!canEdit) return;

    // ── Profile ──
    on("select[name='archetypeId']", "change", (e) => {
      // A new nature is a new secret: un-name it, forget what was known about the old one.
      SocialArchetypeManager.setActorData(this._actor, { archetypeId: e.target.value || null, revealed: false, known: {} });
    });
    on("select[name='stance']", "change", (e) => SocialArchetypeManager.setActorData(this._actor, { stance: e.target.value || "nature" }));
    on("input[name='revealed']", "change", (e) => SocialArchetypeManager.setRevealed(this._actor, e.target.checked));
    on("[data-known]", "click", (_e, n) => {
      if (!game.user.isGM) return;
      const k = SocialArchetypeManager.getActorData(this._actor).known ?? {};
      SocialArchetypeManager.setKnown(this._actor, { [n.dataset.known]: !k[n.dataset.known] });
    });
    for (const name of ["notes", "intent"]) {
      on(`textarea[name='${name}']`, "change", (e) => SocialArchetypeManager.setActorData(this._actor, { [name]: e.target.value.trim() }));
    }
    on("input[data-point]", "change", (e, n) => SocialArchetypeManager.setActorData(this._actor, { points: { [n.dataset.point]: e.target.value.trim() } }));
    on("[data-lean]", "click", async (_e, n) => {
      const triadId = n.dataset.lean;
      const clicked = Number(n.dataset.value);
      const triad = SocialArchetypeManager.getCharacterNotes(this._actor).triad;
      const cur = triad[triadId] ?? 0;
      const value = cur === clicked ? clicked - 1 : clicked;
      const others = Object.entries(triad).reduce((s, [k, v]) => s + (k === triadId ? 0 : (v || 0)), 0);
      if (value > cur && others + value > TRIAD_POINT_POOL) {
        ui.notifications.warn(`Only ${TRIAD_POINT_POOL} dots to spread — lower another approach first.`);
        return;
      }
      await SocialArchetypeManager.setActorData(this._actor, { triad: { ...triad, [triadId]: value } });
    });

    // ── Bonds ──
    on(".tsl-bond-add", "change", async (e) => {
      if (!e.target.value) return;
      const entry = await TSLBondStore.add(this._actor.id, e.target.value);
      if (entry) { this._expandedBonds.add(entry.id); this.render(false); }
    });
    on("[data-bond-pick]", "click", () => {
      if (this._picking) this._endPick("Pick cancelled.");
      else this._startPick();
    });
    on(".tsl-bond-type", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { type: e.target.value }));
    on(".tsl-str", "click", (_e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { attitude: Number(n.dataset.strength) }));
    on(".tsl-bond-notes", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { notes: e.target.value.trim() }));
    on(".tsl-bond-remove", "click", (_e, n) => TSLBondStore.remove(this._actor.id, n.dataset.bondId));
    on("[data-str-adj]", "click", async (_e, n) => {
      if (Number(n.dataset.strAdj) > 0) {
        if (!(await TSLStringStore.add(this._actor.id, n.dataset.target, 1))) ui.notifications.warn(`At most ${STRING_CAP} Strings on one person.`);
      } else await TSLStringStore.spend(this._actor.id, n.dataset.target);
      this.render(false);
    });
    on("[data-pull]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.pull);
      if (!target) return;
      const mode = await this._promptPull(target);
      if (mode) await TSLStringStore.pull(this._actor, target, mode);
      this.render(false);
    });
  }

  /** Strike or guard? — the choice when a String is pulled. */
  async _promptPull(target) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: `${this._actor.name} pulls a String on ${target.name}`,
        content: `<div class="tsl-dlg"><p>Burn one String on <b>${esc(target.name)}</b>. It goes on your sheet and ends itself once used.</p>
          <ul class="tsl-dlg-list"><li><b>Strike</b> — +5 to your next attack, check or save against them.</li>
          <li><b>Guard</b> — +5 AC against their next attack.</li></ul></div>`,
        buttons: {
          strike: { icon: '<i class="fas fa-crosshairs"></i>', label: "Strike +5", callback: () => resolve("strike") },
          guard:  { icon: '<i class="fas fa-shield-halved"></i>', label: "Guard +5 AC", callback: () => resolve("guard") },
          cancel: { label: "Keep it", callback: () => resolve(null) },
        },
        default: "strike",
        close: () => resolve(null),
      }, tslDialogOptions()).render(true);
    });
  }

  // ── Canvas picking ──────────────────────────────────────────────────────────

  /** The DOM <canvas> of the board (PIXI 8 removed canvas.app.view). */
  _boardEl() {
    return document.getElementById("board") ?? canvas.app?.canvas ?? canvas.app?.view ?? null;
  }

  /**
   * "Click a token on the map" mode. `onPick(actor)` runs with the chosen
   * actor (default: add a Bond). A DOM capture listener on #board — PIXI stage
   * listeners are not reliable across Foundry versions.
   */
  async _startPick(onPick = null, mode = "bond") {
    if (this._picking || !canvas?.stage) return;
    const board = this._boardEl();
    if (!board) { ui.notifications.warn("Can't reach the game canvas — use the list instead."); return; }
    this._picking = true;
    this._pickMode = mode;
    this._pickHandler = onPick;
    this.render(false);
    await this.minimize();
    board.style.cursor = "crosshair";
    ui.notifications.info(`Click a token on the map for ${this._actor.name}. Esc cancels.`);

    this._onPickCanvas = (event) => {
      if (event.button !== 0) return;
      let pos;
      if (typeof canvas.canvasCoordinatesFromClient === "function") {
        pos = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      } else {
        const rect = board.getBoundingClientRect();
        const t = canvas.stage.worldTransform;
        pos = { x: (event.clientX - rect.left - t.tx) / canvas.stage.scale.x, y: (event.clientY - rect.top - t.ty) / canvas.stage.scale.y };
      }
      const hit = canvas.tokens.placeables.find(t => t.actor && t.visible && t.bounds.contains(pos.x, pos.y));
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      if (hit.document.hidden && !game.user.isGM) { ui.notifications.warn("That token is hidden."); return; }
      if (hit.actor.id === this._actor.id) { ui.notifications.warn(`That is ${this._actor.name} themselves.`); return; }
      const handler = this._pickHandler;
      this._endPick();
      if (handler) handler(hit.actor);
      else this._defaultBondPick(hit.actor);
    };
    this._onPickCancel = (event) => { if (event.key === "Escape") this._endPick("Pick cancelled."); };
    board.addEventListener("pointerdown", this._onPickCanvas, true);
    document.addEventListener("keydown", this._onPickCancel);
  }

  _defaultBondPick(targetActor) {
    const existing = TSLBondStore.find(this._actor.id, targetActor.id);
    if (existing) {
      this._expandedBonds.add(existing.id);
      this.render(false);
    } else {
      TSLBondStore.add(this._actor.id, targetActor.id).then(entry => {
        if (entry) this._expandedBonds.add(entry.id);
        ui.notifications.info(`Bond added: ${this._actor.name} → ${targetActor.name}`);
      });
    }
  }

  async _endPick(message = null) {
    this._stopPick();
    if (message) ui.notifications.info(message);
    await this.maximize();
    this.render(false);
  }

  _stopPick() {
    if (!this._picking) return;
    this._picking = false;
    this._pickMode = null;
    this._pickHandler = null;
    const board = this._boardEl();
    if (board) {
      board.style.cursor = "";
      if (this._onPickCanvas) board.removeEventListener("pointerdown", this._onPickCanvas, true);
    }
    if (this._onPickCancel) document.removeEventListener("keydown", this._onPickCancel);
    this._onPickCanvas = null;
    this._onPickCancel = null;
  }

  async close(options = {}) {
    this._stopPick();
    Hooks.off("updateActor", this._flagHook);
    SocialFencingDialog._instances.delete(this._actor.id);
    return super.close(options);
  }
}
