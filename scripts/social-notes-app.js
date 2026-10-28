/**
 * tsl-social-conflict | social-notes-app.js
 *
 * The Chronicle — one window per character, opened from the token HUD.
 *
 *   Profile — an NPC: (GM) its hidden nature and the face it shows (a mask,
 *             or its own), what it does after a "no", what the party knows,
 *             the dossier, its Agenda. A player character: Leanings (dots per
 *             approach), emotions & scars, notes.
 *   Bonds   — relationships: type + strength (one shared bond, mirrored on
 *             both sides), Strings held (Pull: +5 strike or guard; Hurt).
 *   Talk    — where you act: face an NPC (target their token, or pick it on
 *             the map), then one of seven TECHNIQUES — in private or before
 *             witnesses. An NPC's own Talk tab is the GM's cheat sheet.
 *   Codex   — the rules.
 *
 * Every word on screen goes through _t() (i18n.js).
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
      ui.notifications.warn(_t("You can only open the Chronicle of characters you own."));
      return;
    }
    // opts.target — open already talking to this NPC (from the NPC's own Talk tab).
    const aim = (app) => {
      if (opts.tab) app._tab = opts.tab;
      if (opts.target) app._face(opts.target);
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

/** The read-question chips' short answers, and a nature's take on an audience. */
function tslAudienceText(n, { short = false } = {}) {
  if (short) return n > 0 ? _t("bend +{n}", { n }) : n < 0 ? _t("harden −{n}", { n: -n }) : _t("no change");
  return n > 0 ? _t("they bend (+{n})", { n }) : n < 0 ? _t("they harden (−{n})", { n: -n }) : _t("no change");
}

class SocialFencingApp extends _SocialAppBase {
  constructor(actor, options = {}) {
    super(options);
    this._actor   = actor;
    this._tab     = SocialArchetypeManager.isPC(actor) ? "talk" : "profile";
    this._codexCat = "start";
    this._picking = false;
    this._expandedBonds = new Set();
    // Talk
    this._tTarget    = null;     // the NPC this character is talking to
    this._tTech      = null;     // the technique picked (a TECHNIQUES id)
    this._tSize      = "costly"; // "small" | "costly" | "against"
    this._tSkill     = null;
    this._tHelper    = null;
    this._tLever     = null;     // "desire" | "fear"
    this._tWitnesses = null;     // in private (false), before witnesses (true) — null: as the scene is
    this._tResult    = null;     // the last roll, shown where Roll was clicked

    // Refresh when what this window shows changes: this character's chronicle,
    // the NPC they face (what the party knows lives on the NPC), the emotions
    // either one carries — not on every hit point lost in a fight. The numbers
    // in Talk (skills, DC) follow the system data only while Talk is open.
    const watched = (id) => !!id && (id === this._actor.id || id === this._tTarget);
    const onEffect = (fx) => { if (watched(fx?.parent?.id)) this._refresh(); };
    this._hooks = [
      ["updateActor", (a, change = {}) => {
        if (!watched(a?.id)) return;
        if (foundry.utils.hasProperty(change, "flags.tsl-social-conflict") || "name" in change || "img" in change
          || (this._tab === "talk" && "system" in change)) this._refresh();
      }],
      ["createActiveEffect", onEffect], ["updateActiveEffect", onEffect], ["deleteActiveEffect", onEffect],
      // The GM declares the scene public or private; another scene comes up.
      ["updateScene", (scene, change = {}) => {
        if (scene?.id === globalThis.canvas?.scene?.id && foundry.utils.hasProperty(change, "flags.tsl-social-conflict")) this._refresh();
      }],
      ["canvasReady", () => this._refresh()],
      // Their actor is deleted: this window closes; the one they faced — Talk forgets them.
      ["deleteActor", (a) => {
        if (a?.id === this._actor.id) this.close();
        else if (a?.id && a.id === this._tTarget) { this._tTarget = null; this._refresh(); }
      }],
      // Target an NPC's token on the map (T) and this character is talking to them.
      ["targetToken", (user, token, targeted) => {
        if (user?.id !== game.user.id || !targeted || !SocialArchetypeManager.isPC(this._actor)) return;
        const a = token?.actor ? (game.actors.get(token.actor.id) ?? token.actor) : null;
        if (!a || !TSLTalk.isNpc(a) || a.id === this._tTarget) return;
        this._face(a.id);
        this._refresh();
      }],
    ].map(([name, fn]) => [name, Hooks.on(name, fn)]);
  }

  /**
   * Re-render soon. A roll lands as several updates at once (knowledge,
   * Strings, bonds, emotions) — they become one render. While someone types
   * in a field of this window, it waits for them to leave it: a re-render
   * would wipe the half-written text.
   */
  _refresh() {
    if (!this.rendered) return;
    const root = this.element?.[0] ?? this.element;
    const typing = globalThis.document?.activeElement;
    if (root?.contains?.(typing) && typing.matches?.("textarea, input[type='text']")) { this._stale = true; return; }
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => { this._refreshTimer = null; if (this.rendered) this.render(false); }, 60);
  }

  /** Face someone new: a fresh talk (no technique, no lever, private). */
  _face(id) {
    this._tTarget = id; this._tTech = null; this._tLever = null; this._tResult = null; this._tWitnesses = null;
  }

  /** Who's watching now: the speaker's pick, or else what the GM set for the scene. */
  _witnessesNow() { return this._tWitnesses ?? TSLTalk.publicScene(); }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:          "tsl-social-fencing",
      title:       _t("Chronicle"),
      template:    null,
      width:       520,
      height:      "auto",
      resizable:   true,
      minimizable: true,
      classes:     ["tsl-fencing"],
    });
  }

  get id()    { return `tsl-social-fencing-${this._actor.id}`; }
  get title() { return _t("{name} — Chronicle", { name: this._actor.name }); }

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
    };
  }

  _buildBondData() {
    const actorId = this._actor.id;
    return TSLBondStore.getList(actorId).map(b => {
      const target = game.actors.get(b.targetActorId);
      return {
        ...b,
        targetName: target?.name ?? _t("(missing actor)"),
        targetImg:  target?.img ?? "icons/svg/mystery-man.svg",
        stringCount: TSLStringStore.countOn(actorId, b.targetActorId),
      };
    });
  }

  /** Whoever this user has targeted on the map (Foundry's T) — the world actor; NPCs only if `npcOnly`. */
  _targeted({ npcOnly = false } = {}) {
    for (const t of game.user?.targets ?? []) {
      const a = t.actor ? (game.actors.get(t.actor.id) ?? t.actor) : null;
      if (!a || a.id === this._actor.id) continue;
      if (npcOnly && !TSLTalk.isNpc(a)) continue;
      return a;
    }
    return null;
  }

  /** This actor's token on the map in view — or null (a player sees only the tokens they can see). */
  _tokenOf(actorId) {
    if (!actorId) return null;
    return (canvas.tokens?.placeables ?? []).find(t => (t.actor?.id ?? t.document?.actorId) === actorId
      && (game.user.isGM || (!t.document?.hidden && t.visible !== false))) ?? null;
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
      { id: "profile", label: _t("Profile"), icon: "fa-fingerprint" },
      { id: "bonds",   label: _t("Bonds"),   icon: "fa-link" },
      { id: "talk",    label: _t("Talk"),    icon: "fa-comments" },
      { id: "codex",   label: _t("Codex"),   icon: "fa-book-open" },
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
          style="--pip:${ap.color}" ${dis} aria-label="${esc(ap.label)} ${i + 1}"></button>`).join("");
      return `<div class="tsl-lean-row">
        <span class="tsl-lean-label" style="--c:${ap.color}" data-tooltip="${esc(`${ap.gist} ${ap.examples}.`)}">
          <i class="fas ${ap.icon}"></i> ${esc(ap.label)}</span>
        <span class="tsl-pips">${pips}</span>
        <span class="tsl-lean-val">${val ? `+${val}` : ""}</span>
      </div>`;
    }).join("");
    const name = esc(this._actor.name);
    return `
      <section class="tsl-sec">
        <div class="tsl-sec-head">
          <span class="tsl-sec-title">${_t("Leanings")}</span>
          <span class="tsl-budget ${left < 0 ? "over" : left === 0 ? "spent" : ""}">${left < 0
            ? _t("{n} over — lower one", { n: -left }) : _t("{n} / {pool} left", { n: left, pool: TRIAD_POINT_POOL })}</span>
        </div>
        <p class="tsl-note">${_t("How {name} reaches for people. Each dot is <b>+1</b> when you ask someone that way.", { name })}</p>
        ${rows}
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Emotions & scars")}</span></div>
        ${this._emotionRow(this._actor, { label: _t("Now"), canClear: canEdit, scars: true })
          || `<p class="tsl-note">${_t("Nothing weighs on {name} right now.", { name })}</p>`}
        <p class="tsl-note">${_t("Miss against someone and they hit back with their emotion; a String spent on you can do it too. Each costs −2 somewhere until you act it out. Take one you already carry, and it leaves a scar — for good.")}</p>
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Notes")}</span></div>
        <textarea name="notes" rows="4" placeholder="${esc(_t("Who they are with people — history, wants, what they hide…"))}" ${dis}>${esc(notes.notes)}</textarea>
      </section>`;
  }

  /** An NPC: nature and mask (GM), what the party knows, dossier, agenda, notes. */
  _buildNpcProfile({ notes, archetype, isGM, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const npc = this._actor;

    // Players see the nature only once it is named.
    const natureSec = !isGM ? (archetype && SocialArchetypeManager.isRevealed(npc) ? `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Nature")}</span></div>
        ${this._archetypeCard(archetype)}
      </section>` : "") : (() => {
      const natureOpts = (sel, own = null) => Object.values(SOCIAL_TRIADS).map(t => `<optgroup label="${esc(`${t.label} — ${t.horney}`)}">${
        SOCIAL_ARCHETYPES.filter(a => a.triad === t.id).map(a =>
          `<option value="${a.id}" ${sel === a.id ? "selected" : ""}>${esc(a.label)}${own && a.id === own ? ` — ${_t("their own face")}` : ""}</option>`).join("")}</optgroup>`).join("");
      const ST  = SocialArchetypeManager.PRESSED_STANCES;
      const sel = SocialArchetypeManager.getActorData(npc).stance ?? "nature";
      const stanceOpts = Object.entries(ST).map(([id, s]) => `<option value="${id}" ${sel === id ? "selected" : ""}>${esc(s.label)}${
        id === "nature" && archetype ? ` (${archetype.pressed === "firm" ? _t("ends it") : _t("keeps listening")})` : ""}</option>`).join("");
      const named = SocialArchetypeManager.isRevealed(npc);
      const shown = SocialArchetypeManager.getShown(npc), mask = SocialArchetypeManager.getMask(npc);
      const face = !shown ? _t("They show nothing — the party sees “Nature unread”.")
        : mask ? _t("The party sees the {mask} — a mask over who they really are.", { mask: esc(mask.label) })
        : _t("They show their own face — one Read (“Is that their true face?”) names them.");
      return `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Nature")}</span><span class="tsl-gm-tag">GM</span></div>
        <select name="archetypeId" ${dis}><option value="">${_t("— none —")}</option>${natureOpts(notes.archetypeId)}</select>
        ${archetype ? this._archetypeCard(archetype) : `<p class="tsl-note">${_t("Without a nature they have no key and no wall, and name no particular price.")}</p>`}
        <div class="tsl-field-row">
          <label data-tooltip="${esc(_t("The face they show the world — what the party sees at first. Their own nature: an open face. Another nature: a MASK — the party sees it, and may believe it, until a Read asks “Is that their true face?” or they're figured out. Nothing: unreadable."))}"><i class="fas fa-mask"></i> ${_t("Mask")}</label>
          <select name="maskId" ${dis}><option value="">${_t("— shows nothing —")}</option>${natureOpts(notes.maskId, notes.archetypeId)}</select>
        </div>
        <p class="tsl-note tsl-mask-note">${face}</p>
        <div class="tsl-field-row">
          <label data-tooltip="${esc(Object.values(ST).map(s => `<b>${s.label}</b> — ${s.tip}`).join("<br>"))}">${_t("After a no")}</label>
          <select name="stance" ${dis}>${stanceOpts}</select>
        </div>
        ${archetype ? `<label class="tsl-check" data-tooltip="${esc(_t("Name the nature to the table: players see the whole card. The module names it on its own once the party knows the key and the wall — or sees through an open face."))}">
          <input type="checkbox" name="revealed" ${named ? "checked" : ""} ${dis}> <span>${named ? _t("Named to the table — players see the card") : _t("Named to the table")}</span></label>` : ""}
      </section>`;
    })();

    const known = SocialArchetypeManager.getKnown(npc);
    const shows = !!SocialArchetypeManager.getShown(npc);
    const knownChips = READ_ORDER.filter(q => q !== "mask" || shows || isGM).map(q => `<button type="button" class="tsl-known ${known[q] ? "on" : ""}" data-known="${q}" ${isGM ? "" : "disabled"}
        data-tooltip="${esc(`${READ_QUESTIONS[q].label}<br>${known[q] ? _t("The party knows.") : _t("Hidden from the party.")}${isGM ? ` ${_t("Click to toggle.")}` : ""}`)}">${esc(READ_QUESTIONS[q].short)}</button>`).join("");

    // The dossier is the GM's truth; players see only the answers the party has learned.
    const points = PROFILE_POINTS.map(p => `
      <div class="tsl-field-row">
        <label data-tooltip="${esc(p.hint)}"><i class="fas ${p.icon}"></i> ${esc(p.label)}</label>
        <input type="text" data-point="${p.id}" value="${esc(notes.points[p.id] ?? "")}" placeholder="${esc(p.placeholder)}" ${dis}>
      </div>`).join("");
    const carded = archetype && SocialArchetypeManager.isRevealed(npc);   // the card already says key, wall, price, after a no, witnesses
    const learned = isGM ? "" : READ_ORDER.filter(q => known[q] && (!carded || q === "desire" || q === "fear") && (q !== "mask" || shows)).map(q =>
      `<span>${esc(READ_QUESTIONS[q].short)}</span><span>${esc(TSLTalk.answerFor(npc, q))}</span>`).join("");

    const feeling = this._emotionRow(npc, { label: _t("Feeling"), canClear: isGM });
    return `
      ${natureSec}
      ${feeling ? `<section class="tsl-sec">${feeling}</section>` : ""}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("What the party knows")}</span></div>
        <div class="tsl-known-row">${knownChips}</div>
        ${learned ? `<div class="tsl-arch-grid tsl-cheat">${learned}</div>` : ""}
        <p class="tsl-note">${_t("A Read answers these, one question at a time; some the party learns by doing. Knowledge of a person lasts.")}</p>
      </section>
      ${!isGM ? "" : `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Dossier")}</span></div>
        ${points}
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Agenda")}</span><span class="tsl-gm-tag">GM</span></div>
        <textarea name="intent" rows="2" placeholder="${esc(_t("What do they want from the party? It shapes their price and how they push back."))}">${esc(notes.intent)}</textarea>
      </section>`}
      ${!isGM && !canEdit ? "" : `
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Notes")}</span></div>
        <textarea name="notes" rows="3" placeholder="${esc(_t("How they behave, history…"))}" ${dis}>${esc(notes.notes)}</textarea>
      </section>`}`;
  }

  /** The full card of a nature (the GM's view, once it is named — or the face they show). */
  _archetypeCard(a) {
    const esc = foundry.utils.escapeHTML;
    const t = SOCIAL_TRIADS[a.triad];
    const key = APPROACHES[a.key], wall = APPROACHES[a.wall];
    return `<div class="tsl-arch" style="--c:${t?.color ?? "#9b6ee8"}">
      <div class="tsl-arch-head"><b>${esc(a.label)}</b><span>${esc(t?.label ?? "")} — ${esc(t?.horney ?? "")}</span></div>
      <div class="tsl-arch-desc">${esc(a.description)}</div>
      <div class="tsl-arch-kw tsl-arch-kw--key"><span><i class="fas ${key.icon}"></i> ${_t("Key")} · ${esc(key.label)}</span>${esc(a.keyText)}</div>
      <div class="tsl-arch-kw tsl-arch-kw--wall"><span><i class="fas ${wall.icon}"></i> ${_t("Wall")} · ${esc(wall.label)}</span>${esc(a.wallText)}</div>
      <div class="tsl-arch-grid">
        <span>${_t("Price")}</span><span>${esc(a.price.text)}${a.price.string ? ` <i>${_t("(a String on you)")}</i>` : ""}</span>
        <span>${_t("On a no")}</span><span>${esc(a.press)}</span>
        <span>${_t("After a no")}</span><span>${a.pressed === "firm" ? _t("ends it") : _t("keeps listening")} — ${esc(a.pressedWhy)}</span>
        <span>${_t("Before witnesses")}</span><span>${tslAudienceText(a.audience ?? 0)} — ${esc(a.audienceWhy ?? "")}</span>
        <span>${_t("Craves")}</span><span>${esc(a.craves)}</span>
        <span>${_t("Dreads")}</span><span>${esc(a.dreads)}</span>
      </div>
      <div class="tsl-arch-psych">${esc(a.psych)}</div>
    </div>`;
  }

  // ── Bonds ───────────────────────────────────────────────────────────────────

  _buildBondsTab({ bonds, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const typeOpts = (sel) => BOND_TYPES.map(t => `<option value="${t.id}" ${SocialArchetypeManager.getBondType(sel).id === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("");

    const rows = bonds.length ? bonds.map(b => {
      const type = SocialArchetypeManager.getBondType(b.type);
      const str  = Math.min(3, Math.abs(b.attitude ?? 0));
      const ap   = APPROACHES[SocialArchetypeManager.bondApproach(type.id)];
      const open = this._expandedBonds.has(b.id);
      const strTrack = [0, 1, 2, 3].map(v => `<button type="button" class="tsl-str ${v === 0 ? "zero" : ""} ${v > 0 && v <= str ? "on" : ""} ${v === str ? "cur" : ""}"
          data-bond-id="${b.id}" data-strength="${v}" ${dis} data-tooltip="${esc(v === 0 ? _t("Faded — no effect")
            : `${"●".repeat(v)}${ap ? ` — ${_t("+{n} when you ask them with {approach}", { n: v, approach: ap.label })}` : ""}`)}">${v === 0 ? "✕" : ""}</button>`).join("");
      const details = !open ? "" : `
        <div class="tsl-bond-body">
          <div class="tsl-field-row">
            <label data-tooltip="${esc(type.hint)}">${_t("Bond")}</label>
            <select class="tsl-bond-type" data-bond-id="${b.id}" ${dis}>${typeOpts(b.type)}</select>
            ${canEdit ? `<button type="button" class="tsl-icon-btn tsl-bond-remove" data-bond-id="${b.id}" data-tooltip="${esc(_t("End this bond (on both sides)"))}"><i class="fas fa-trash"></i></button>` : ""}
          </div>
          <div class="tsl-field-row">
            <label data-tooltip="${esc(`${_t("How deep it runs, 0–3 ●.")} ${ap ? _t("+1 per ● when you ask them that way.") : _t("A Stranger bond has no effect.")} ${_t("A Heart win warms it; Pressure sours it; a door slammed on you cools it.")}`)}">${_t("Strength")}</label>
            <span class="tsl-str-track">${strTrack}</span>
          </div>
          <div class="tsl-field-row">
            <label data-tooltip="${esc(_t("Strings you hold on them — a hold, at most {cap} on one person. Spend one for +5 after a miss against them, Pull it in a fight, or Hurt them with it. Holding one is leverage for an ask against their interests.", { cap: STRING_CAP }))}">${_t("Strings")}</label>
            <span class="tsl-strings">${"●".repeat(b.stringCount)}${"○".repeat(Math.max(0, STRING_CAP - b.stringCount))}</span>
            ${canEdit ? `
              <button type="button" class="tsl-icon-btn" data-str-adj="1" data-target="${b.targetActorId}" ${b.stringCount >= STRING_CAP ? "disabled" : ""} data-tooltip="${esc(_t("Gain a String on them — when they open up to you in play: a confession, a secret, a moment of weakness (the GM's call)"))}">+</button>
              <button type="button" class="tsl-icon-btn" data-str-adj="-1" data-target="${b.targetActorId}" ${b.stringCount ? "" : "disabled"} data-tooltip="${esc(_t("Remove a String"))}">−</button>
              <button type="button" class="tsl-btn tsl-pull" data-pull="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
                data-tooltip="${esc(_t("PULL — burn one: STRIKE (+5 to your next attack, check or save against them) or GUARD (+5 AC against their next attack). It goes on your sheet and ends itself once used."))}">${_t("Pull +5")}</button>
              <button type="button" class="tsl-btn tsl-pull" data-hurt="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
                data-tooltip="${esc(_t("HURT — spend one to make them feel something: Angry, Frightened, Guilty, Insecure or Hopeless. Say how, in the scene — the GM says if it fits."))}">${_t("Hurt")}</button>` : ""}
          </div>
          <input type="text" class="tsl-bond-notes" data-bond-id="${b.id}" value="${esc(b.notes ?? "")}" placeholder="${esc(_t("History, debts, secrets between you…"))}" ${dis}>
        </div>`;
      return `<div class="tsl-bond ${open ? "open" : ""}">
        <div class="tsl-bond-head" data-bond-toggle="${b.id}">
          <img src="${b.targetImg}" alt="">
          <span class="tsl-bond-name">${esc(b.targetName)}</span>
          <span class="tsl-bond-type-tag" style="--c:${ap?.color ?? "#8a7d72"}" data-tooltip="${esc(type.hint)}"><i class="fas ${type.icon}"></i> ${esc(type.label)}</span>
          <span class="tsl-bond-dots">${str ? "●".repeat(str) : "○"}</span>
          ${b.stringCount ? `<span class="tsl-bond-strings" data-tooltip="${esc(_t("Strings you hold on them"))}"><i class="fas fa-masks-theater"></i> ${b.stringCount}</span>` : ""}
          <i class="fas fa-chevron-${open ? "up" : "down"} tsl-bond-chev"></i>
        </div>
        ${details}
      </div>`;
    }).join("") : `<p class="tsl-note tsl-empty">${_t("No bonds yet.")}</p>`;

    const aimed = this._targeted();
    const picking = this._picking && this._pickMode === "bond";
    const add = canEdit ? `<div class="tsl-add-row tsl-add-row--pick">
        <span class="tsl-note">${_t("Add a bond:")}</span>
        ${aimed && !TSLBondStore.find(this._actor.id, aimed.id) ? `<button type="button" class="tsl-btn" data-bond-target="${aimed.id}"
          data-tooltip="${esc(_t("The token you've targeted on the map (T)"))}"><i class="fas fa-bullseye"></i> ${esc(aimed.name)}</button>` : ""}
        <button type="button" class="tsl-btn ${picking ? "picking" : ""}" data-bond-pick
          data-tooltip="${esc(_t("Click a token on the map to bond with it. Esc cancels."))}"><i class="fas fa-crosshairs"></i> ${picking ? _t("Click a token…") : _t("Pick on the map")}</button>
      </div>` : "";

    return `<section class="tsl-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Bonds")}</span></div>
      ${add}
      <div class="tsl-bonds">${rows}</div>
    </section>`;
  }

  // ── Talk ────────────────────────────────────────────────────────────────────

  _buildTalkTab(ctx) {
    // An NPC's own Talk tab: the GM's cheat sheet for playing them.
    if (!ctx.isPC) {
      if (!ctx.isGM) return `<p class="tsl-note tsl-empty">${_t("Talk from your own character's Chronicle.")}</p>`;
      return this._askAsRow() + this._cheatSheet(this._actor);
    }
    const esc = foundry.utils.escapeHTML;
    const me = this._actor;
    // You talk to whoever is here — on this map, with you.
    if (!this._tokenOf(me.id)) {
      this._tTarget = null;
      return `<section class="tsl-sec tsl-t-who">
        <p class="tsl-note">${_t("<b>{name} isn't on this map.</b> You talk to whoever is here with you — put {name}'s token on the scene, then pick who to talk to.", { name: esc(me.name) })}</p>
      </section>`;
    }
    if (this._tTarget && !this._tokenOf(this._tTarget)) this._tTarget = null;
    // Nobody picked yet: the NPC this user targets on the map will do.
    if (!this._tTarget) this._tTarget = this._targeted({ npcOnly: true })?.id ?? null;
    const tgt = this._tTarget ? game.actors.get(this._tTarget) : null;
    const picking = this._picking && this._pickMode === "target";
    const pick = `<button type="button" class="tsl-btn tsl-t-pick ${picking ? "picking" : ""}" data-t-pick data-tooltip="${esc(_t("Click an NPC's token on the map — or target it (T). Esc cancels."))}">
        <i class="fas fa-crosshairs"></i> ${picking ? _t("Click their token…") : tgt ? _t("Someone else") : _t("Pick on the map")}</button>`;
    const mine = this._emotionRow(me, { label: _t("You"), canClear: ctx.canEdit, scars: true, effects: "mine" });
    return `
      ${mine ? `<section class="tsl-sec tsl-you">${mine}</section>` : ""}
      ${tgt ? this._personPanel(tgt, { ...ctx, speaker: me }, pick) : `<section class="tsl-sec tsl-t-who">
        <p class="tsl-note">${_t("<b>Who are you talking to?</b> Target their token on the map — hover it and press <b>T</b> — or pick it:")}</p>
        ${pick}
      </section>`}
      ${tgt ? this._askPanel(me, tgt, ctx) : ""}`;
  }

  /**
   * On an NPC's own Talk tab: the asking happens in the SPEAKER's Chronicle —
   * one click opens it, already talking to this NPC. Only the characters on
   * this map, and only if the NPC is here too.
   */
  _askAsRow() {
    const esc = foundry.utils.escapeHTML;
    const me = esc(this._actor.name);
    if (!this._tokenOf(this._actor.id)) return `<p class="tsl-note tsl-t-where"><i class="fas fa-circle-info"></i> ${_t("{name} isn't on this map — put their token on the scene, and the characters here can talk to them.", { name: me })}</p>`;
    const pcs = this._scenePcs();
    if (!pcs.length) return `<p class="tsl-note tsl-t-where"><i class="fas fa-circle-info"></i> ${_t("Asking happens in the speaker's Chronicle — put a player character's token on this scene, then ask from it.")}</p>`;
    return `<section class="tsl-sec tsl-t-where tsl-t-askas">
      <span class="tsl-t-askas-label"><i class="fas fa-circle-info"></i> ${_t("Ask or read {name} as:", { name: me })}</span>
      <div class="tsl-t-askas-row">${pcs.map(a => `<button type="button" class="tsl-btn" data-t-as="${a.id}" data-tooltip="${esc(_t("Open {pc}'s Chronicle — Talk, already facing {npc}", { pc: a.name, npc: this._actor.name }))}">
        <img src="${a.img ?? "icons/svg/mystery-man.svg"}" alt=""> ${esc(a.name)}</button>`).join("")}</div>
    </section>`;
  }

  /** Who they are, and what the party knows of them — in words (the GM sees the truth, marked). */
  _personPanel(npc, ctx, pick = "") {
    const esc  = foundry.utils.escapeHTML;
    const isGM = ctx.isGM;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const named = SocialArchetypeManager.isRevealed(npc);
    const known = SocialArchetypeManager.getKnown(npc);
    const shown = SocialArchetypeManager.getShown(npc);
    const mask  = SocialArchetypeManager.getMask(npc);
    const tint  = (a) => SOCIAL_TRIADS[a.triad]?.color ?? "#9b6ee8";

    // The nature: the truth for the GM (and once named); what they show, for players.
    let nature;
    if (arch && (named || isGM)) {
      const face = named ? "" : mask
        ? ` <span class="tsl-x-mask" data-tooltip="${esc(_t("The mask they wear: the party sees the {mask}.", { mask: mask.label }))}"><i class="fas fa-mask"></i> ${esc(mask.label)}</span>`
        : shown ? ` <span class="tsl-x-mask" data-tooltip="${esc(_t("They show their own face."))}">${_t("open face")}</span>` : "";
      nature = `<span class="tsl-x-nature" style="--c:${tint(arch)}">${esc(arch.label)}${!named ? ` <i class="tsl-hidden-tag">${_t("hidden")}</i>` : ""}${face}</span>`;
    } else if (shown) {
      nature = known.mask && mask
        ? `<span class="tsl-x-nature tsl-x-nature--mask" style="--c:${tint(shown)}" data-tooltip="${esc(_t("A mask: they only play the {mask}. Who they really are is still unread.", { mask: shown.label }))}"><i class="fas fa-mask"></i> ${esc(_t("{mask} — a mask", { mask: shown.label }))}</span>`
        : `<span class="tsl-x-nature tsl-x-nature--seems" style="--c:${tint(shown)}" data-tooltip="${esc(_t("What they show: the {nature} — maybe their true face, maybe a mask.", { nature: shown.label }))}">${esc(_t("seems: {nature}", { nature: shown.label }))}</span>`;
    } else {
      nature = `<span class="tsl-x-nature tsl-x-nature--unread">${_t("Nature unread")}</span>`;
    }

    // What the party knows, in words — and, in one line, what it doesn't know yet.
    const asked = READ_ORDER.filter(q => q !== "mask" || shown || isGM);
    const rows = asked.filter(q => known[q] || isGM).map(q => {
      const secret = !known[q] ? "tsl-know-secret" : "";
      return `<span class="${secret}" data-tooltip="${esc(READ_QUESTIONS[q].label)}">${esc(READ_QUESTIONS[q].short)}</span><span class="${secret}">${this._factText(npc, q)}${secret
        ? ` <i class="tsl-hidden-tag">${_t("the party doesn't know")}</i>` : ""}</span>`;
    }).join("");
    const unknown = isGM ? [] : asked.filter(q => !known[q]);
    const more = !unknown.length ? "" : `<div class="tsl-know-more">${_t("Not known yet:")} ${unknown.map(q =>
      `<span data-tooltip="${esc(READ_QUESTIONS[q].label)}">${esc(READ_QUESTIONS[q].short.toLowerCase())}</span>`).join(", ")}. ${_t("Read them to find out.")}</div>`;
    const know = rows || more ? `<div class="tsl-know-wrap">${rows ? `<div class="tsl-know-head">${_t("What the party knows")}</div><div class="tsl-know">${rows}</div>` : ""}${more}</div>` : "";

    // The holds between the speaker and them — Strings either way (Talk only).
    const sp = ctx.speaker;
    const mine = sp ? TSLStringStore.countOn(sp.id, npc.id) : 0, theirs = sp ? TSLStringStore.countOn(npc.id, sp.id) : 0;
    const holds = !(mine || theirs) ? "" : `<div class="tsl-holds">${mine ? `<span class="tsl-hold tsl-hold--mine" data-tooltip="${esc(_t("Strings you hold on them — burn one for +5 after a miss, Pull it in a fight, or Hurt them with it."))}">
        <i class="fas fa-masks-theater"></i> ${_t("You hold")} <b>${"●".repeat(mine)}</b></span>` : ""}${theirs ? `<span class="tsl-hold tsl-hold--theirs" data-tooltip="${esc(_t("Strings they hold on you — the GM can spend one to Hurt you, or Pull it against you in a fight."))}">
        <i class="fas fa-masks-theater"></i> ${_t("They hold")} <b>${"●".repeat(theirs)}</b></span>` : ""}</div>`;

    // How they seem — the face they show, as a card (players, until it's seen through).
    const seems = !isGM && shown && !named && !(known.mask && mask)
      ? `<details class="tsl-x-card-open"><summary>${_t("How they seem")}</summary><p class="tsl-note">${_t("What they show the world — it may be a mask.")}</p>${this._archetypeCard(shown)}</details>` : "";
    return `<section class="tsl-sec tsl-x-panel">
      <div class="tsl-x-top">
        <img class="tsl-x-portrait" src="${npc.img ?? "icons/svg/mystery-man.svg"}" alt="">
        <div class="tsl-x-id"><span class="tsl-x-name">${esc(npc.name)}</span>${nature}</div>
        <span class="tsl-x-phase" data-tooltip="${esc(_t("Their DC: 10 + proficiency + the better of WIS/INT. A small ask is 4 easier, one against their interests 4 harder."))}">${_t("DC {dc}", { dc: TSLTalk.dcFor(npc).dc })}</span>
        ${pick}
      </div>
      ${know}
      ${holds}
      ${this._emotionRow(npc, { label: _t("Feeling"), canClear: isGM, effects: "theirs" })}
      ${arch && named && !isGM ? `<details class="tsl-x-card-open"><summary>${_t("Their nature")}</summary>${this._archetypeCard(arch)}</details>` : seems}
    </section>`;
  }

  /** One thing the party may know about them, in words. */
  _factText(npc, q) {
    const esc = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(npc);
    switch (q) {
      case "key": case "wall": {
        const ap = arch ? APPROACHES[arch[q]] : null;
        if (!ap) return _t("none");
        return `<i class="fas ${ap.icon}" style="color:${ap.color}"></i> <b>${esc(ap.label)}</b> — ${q === "key" ? _t("you roll with advantage") : _t("you roll with disadvantage")}`;
      }
      case "mask": {
        const shown = SocialArchetypeManager.getShown(npc), mask = SocialArchetypeManager.getMask(npc);
        return !shown ? _t("shows nothing") : mask ? `<i class="fas fa-mask"></i> ${esc(_t("{mask} — a mask", { mask: mask.label }))}` : _t("true face");
      }
      case "audience": return arch ? `${tslAudienceText(arch.audience ?? 0)} — ${esc(arch.audienceWhy ?? "")}` : _t("no change");
      default: return esc(TSLTalk.answerFor(npc, q));
    }
  }

  /**
   * What someone feels — and the scars they carry — as tags. `effects`: "mine"
   * shows what each costs the one who feels it, "theirs" what it opens for
   * others. × lets an emotion go (its owner or the GM).
   */
  _emotionRow(actor, { label = _t("Feeling"), canClear = false, scars = false, effects = null } = {}) {
    const esc = foundry.utils.escapeHTML;
    const emos = TSLEmotions.of(actor);
    const sc = scars ? TSLEmotions.scars(actor) : [];
    if (!emos.length && !sc.length) return "";
    const tags = emos.map(e => {
      const d = EMOTIONS[e.id];
      const by = game.actors.get(e.by)?.name;
      const toward = e.toward ? game.actors.get(e.toward)?.name : null;
      const s = d.spoils ?? {};
      const eff = effects === "mine"
        ? (s.approach ? _t("−2 {approach}", { approach: APPROACHES[s.approach]?.label ?? "" }) : s.jobs ? _t("−2 asks & all in")
          : toward ? _t("−2 against {name}", { name: toward }) : _t("−2 against the one you wronged"))
        : effects === "theirs" ? _t("+2 {approach}", { approach: APPROACHES[d.opens]?.label ?? "" }) : "";
      const tip = `<b>${d.label}</b>${by ? ` — ${_t("from {name}", { name: by })}` : ""}<br>${_t("On them:")} ${d.spoilsText}${toward ? ` (${_t("toward {name}", { name: toward })})` : ""}.<br>${_t("For others:")} ${d.opensText}.<br><i>${_t("Let it go:")} ${d.clear}</i>`;
      return `<span class="tsl-emo" style="--c:${d.color}" data-tooltip="${esc(tip)}"><img src="${d.img}" alt=""> ${esc(d.label)}${toward && effects !== "mine" ? ` → ${esc(toward)}` : ""}${eff
        ? ` <small class="tsl-emo-eff">${esc(eff)}</small>` : ""}${canClear
        ? `<button type="button" class="tsl-emo-x" data-emo-clear="${actor.id}" data-emo="${e.id}" aria-label="${esc(_t("Let it go"))}" data-tooltip="${esc(_t("Let it go — act it out, or a friend's comfort"))}">×</button>` : ""}</span>`;
    }).join("");
    const scarTags = sc.map(id => `<span class="tsl-scar" data-tooltip="${esc(`<b>${_t("Scar — {scar}", { scar: SCARS[id].label })}</b><br>${SCARS[id].text}`)}"><img src="icons/svg/blood.svg" alt=""> ${esc(SCARS[id].label)}</span>`).join("");
    return `<div class="tsl-emos"><span class="tsl-row-label">${label}</span>${tags}${scarTags}</div>`;
  }

  /**
   * How you come at them. The three approaches side by side — each with how
   * this person is known to take it (their key: advantage; their wall:
   * disadvantage), its ask and its all-in gamble, with your odds — and reading
   * them. Then the technique picked: what happens either way, what you ask
   * for, who's watching, the roll.
   */
  _askPanel(src, npc, ctx) {
    const esc = foundry.utils.escapeHTML;
    const known = SocialArchetypeManager.getKnown(npc);
    if (this._tTech && !TECHNIQUES[this._tTech]) this._tTech = null;
    const strings = TSLStringStore.countOn(src.id, npc.id);
    const tie = TSLBondStore.find(src.id, npc.id) ? TSLBondStore.getStrength(src.id, npc.id) : 0;
    const READ_COLOR = "#d9b46a";
    const witnesses = this._witnessesNow();
    const odds = (id) => TSLTalk.chance(src, npc, { technique: id, size: this._tSize, helperId: this._tHelper,
      lever: id === this._tTech ? this._tLever : null, witnesses });
    const pct = (c) => `${Math.round(c.p * 100)}%`;
    const lockOf = (id) => id === "blackmail" && !known.fear && !strings ? _t("needs their Fear or a String on them")
      : id === "seduce" && !known.desire && tie < 2 ? _t("needs their Desire or a bond ●●") : null;
    const btn = (tech, cls = "") => {
      const lock = lockOf(tech.id), c = odds(tech.id);
      return `<button type="button" class="tsl-tech-btn ${cls} ${this._tTech === tech.id ? "on" : ""} ${lock ? "locked" : ""}" data-tech="${tech.id}"
        data-tooltip="${esc(`<b>${tech.label}</b> — ${tech.line}.<br>${tech.rule}`)}">
        <b>${lock ? `<i class="fas fa-lock"></i> ` : ""}${esc(tech.label)}</b>
        <span>${lock ? esc(lock) : `${esc(SKILL_LABELS[c.pv.skill] ?? "")} · <em>${pct(c)}</em>`}</span></button>`;
    };
    const how = {
      key: `<i class="fas fa-key"></i> ${_t("their key — advantage")}`,
      wall: `<i class="fas fa-door-closed"></i> ${_t("their wall — disadvantage")}`,
      plain: _t("a normal roll"),
      unknown: `<i class="fas fa-question"></i> ${_t("how they take it — not known yet")}`,
    };
    const cols = APPROACH_ORDER.map(apId => {
      const ap = APPROACHES[apId], rel = TSLTalk.knownRelation(npc, apId);
      return `<div class="tsl-ap tsl-ap--${rel}" style="--c:${ap.color}">
        <div class="tsl-ap-head" data-tooltip="${esc(`<b>${ap.label}</b> — ${ap.gist} ${ap.examples}.<br>${ap.cost}`)}"><i class="fas ${ap.icon}"></i> ${esc(ap.label)}</div>
        <div class="tsl-ap-ex">${esc(ap.short)}</div>
        <div class="tsl-ap-rel">${how[rel]}</div>
        ${btn(TECHNIQUES[techniqueFor(apId, "ask")])}
        <div class="tsl-ap-or" data-tooltip="${esc(TECH_JOBS.gambit.hint)}">${_t("or all in")}</div>
        ${btn(TECHNIQUES[techniqueFor(apId, "gambit")], "tsl-tech-btn--gambit")}
      </div>`;
    }).join("");
    const rd = odds("read");
    const readBtn = `<button type="button" class="tsl-tech-btn tsl-tech-btn--read ${this._tTech === "read" ? "on" : ""}" data-tech="read" style="--c:${READ_COLOR}"
      data-tooltip="${esc(`<b>${TECHNIQUES.read.label}</b> — ${TECHNIQUES.read.line}.<br>${TECHNIQUES.read.rule}`)}">
      <b><i class="fas fa-eye"></i> ${esc(TECHNIQUES.read.label)}</b>
      <span>${_t("learn something about them, for the whole party")} · ${esc(SKILL_LABELS[rd.pv.skill] ?? "")} · <em>${pct(rd)}</em></span></button>`;

    let picked = "";
    if (this._tTech) {
      const c = odds(this._tTech), pv = c.pv, tech = TECHNIQUES[pv.technique];
      const color = pv.approach ? APPROACHES[pv.approach].color : READ_COLOR;
      const sizes = !pv.sized ? "" : `<div class="tsl-q">${_t("What are you asking for?")}</div>
        <div class="tsl-sizes">${ASK_ORDER.map(id => {
          const a = ASK_SIZES[id];
          return `<button type="button" class="tsl-size ${pv.size === id ? "on" : ""}" data-size="${id}"
            data-tooltip="${esc(`${a.label} — ${a.hint}.`)}"><b>${esc(a.label)}</b><span>${_t("DC {dc}", { dc: TSLTalk.dcFor(npc, id).dc })}</span></button>`;
        }).join("")}</div>`;
      // Who's watching: known only as far as the party has read how they take an audience.
      const aud = (known.audience ? ` <i class="tsl-wit-known">(${tslAudienceText(SocialArchetypeManager.audienceOf(npc), { short: true })})</i>` : "")
        + (this._tWitnesses === null && pv.witnesses ? ` <i class="tsl-wit-known" data-tooltip="${esc(_t("This scene is before witnesses — a court, a feast, a crowd."))}">(${_t("the scene")})</i>` : "");
      const witness = !pv.sized ? "" : `<div class="tsl-q">${_t("Who's watching?")}</div>
        <div class="tsl-wit">
          <button type="button" class="tsl-wit-btn ${pv.witnesses ? "" : "on"}" data-wit="0"
            data-tooltip="${esc(_t("Just you, them, and whoever helps. Nothing more rides on it."))}"><i class="fas fa-user-lock"></i> ${_t("In private")}</button>
          <button type="button" class="tsl-wit-btn ${pv.witnesses ? "on" : ""}" data-wit="1"
            data-tooltip="${esc(_t("Before witnesses — a court, a crowd, their own people. A yes to something that costs them binds them: everyone saw it — a String on them. A no shames you: you lose face — Insecure. And some natures bend before an audience while others harden: you'll see which in the result, or read it first."))}"><i class="fas fa-users"></i> ${_t("Before witnesses")}${aud}</button>
        </div>`;
      const helpers = this._scenePcs(src.id).map(a => `<option value="${a.id}" ${a.id === pv.helperId ? "selected" : ""}>${esc(a.name)}</option>`).join("");
      const help = `<label class="tsl-help" data-tooltip="${esc(_t("A friend backs your words: +{n}.", { n: HELP_BONUS }))}">${_t("Help")}
        <select class="tsl-t-help"><option value="">${_t("nobody")}</option>${helpers}</select></label>`;
      const levers = pv.job !== "ask" ? "" : ["desire", "fear"].filter(l => pv.leverOk[l]).map(l => {
        const what = l === "desire" ? _t("their Desire") : _t("their Fear");
        const tip = `${_t("Play on {what}: “{answer}” — +{n}, and it counts as leverage.", { what, answer: TSLTalk.answerFor(npc, l), n: LEVER_BONUS })}${l === "fear" ? ` ${_t("A threat cuts both ways: if the ask fails, they take a String on you.")}` : ""}`;
        return `<button type="button" class="tsl-lever ${pv.lever === l ? "on" : ""}" data-lever="${l}" data-tooltip="${esc(tip)}">
          <i class="fas ${l === "desire" ? "fa-gem" : "fa-ghost"}"></i> ${l === "desire" ? _t("Their Desire") : _t("Their Fear")} +${LEVER_BONUS}</button>`;
      }).join("");
      const held = pv.strings ? `<span class="tsl-note tsl-t-strings" data-tooltip="${esc(_t("Burn one for +{n} after a miss — you'll be asked.", { n: STRING_SPEND_BONUS }))}">
        <i class="fas fa-masks-theater"></i> ${pv.strings === 1 ? _t("1 String on them") : _t("{n} Strings on them", { n: pv.strings })}</span>` : "";
      const math = pv.parts.map(p => `<span class="tsl-math-part ${p.value < 0 ? "tsl-math-part--neg" : ""}">${p.value >= 0 ? "+" : "−"}${Math.abs(p.value)} ${esc(p.label)}</span>`).join("");
      const dcMods = pv.dcMods.map(m => ` ${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${esc(m.label)}`).join("");
      const mode = c.mode === "adv" ? _t("with advantage — their key") : c.mode === "dis" ? _t("with disadvantage — their wall") : "";
      picked = `<div class="tsl-pick" style="--c:${color}">
        <div class="tsl-pick-title"><b>${esc(tech.label)}</b>${tech.line ? ` — ${esc(tech.line)}` : ""}</div>
        <div class="tsl-pick-out tsl-pick-out--win"><span>${_t("If it works:")}</span> ${esc(tech.win)}.</div>
        <div class="tsl-pick-out tsl-pick-out--miss"><span>${_t("If not:")}</span> ${esc(tech.miss)}.</div>
        ${sizes}
        ${witness}
        <div class="tsl-pick-row">${help}${levers}${held}</div>
        ${pv.blocked ? `<div class="tsl-x-blocked">${esc(pv.blocked)}</div>` : ""}
        <button type="button" class="tsl-roll" data-t-roll ${pv.blocked ? "disabled" : ""} style="--c:${color}">
          <i class="fas fa-dice-d20"></i> ${_t("Roll — {technique}", { technique: esc(tech.label) })} <span class="tsl-roll-odds">${pct(c)}</span></button>
        <div class="tsl-x-math">
          <span class="tsl-math-die">d20</span>${math}
          <span class="tsl-math-vs" data-tooltip="${esc(_t("10 + their proficiency + the better of WIS / INT = {base}", { base: pv.dcBase }) + dcMods)}">${_t("vs DC {dc}", { dc: pv.dc })}</span>
          ${mode ? `<span class="tsl-math-mode ${c.mode === "dis" ? "tsl-math-mode--dis" : ""}">${mode}</span>` : ""}
        </div>
      </div>`;
    }

    return `<section class="tsl-sec tsl-x-speak">
      <p class="tsl-note tsl-how">${_t("<b>Say your line out loud</b> — then pick what it really is. Not sure how they'll take it? Read them first.")}</p>
      <div class="tsl-aps">${cols}</div>
      ${readBtn}
      ${picked}
      ${this._resultHTML()}
    </section>`;
  }

  /** The last roll, right where Roll was clicked — and what to do next. */
  _resultHTML() {
    const r = this._tResult;
    if (!r) return "";
    const esc = foundry.utils.escapeHTML;
    const tech = TECHNIQUES[r.technique];
    const hit = r.grade === "strong" || r.grade === "success";
    const bits = [];
    if (r.rel === "key") bits.push(_t("their key — advantage"));
    if (r.rel === "wall") bits.push(_t("their wall — disadvantage"));
    if (r.witnesses) bits.push(r.audience ? `${_t("before witnesses")} — ${tslAudienceText(r.audience)}` : _t("before witnesses"));
    const priced = tech?.job === "ask" && r.grade === "success" && TSLTalk.hasPrice(r.technique);
    if (priced) bits.push(r.paid ? _t("you paid their price") : _t("you walked away from their price"));
    if (tech?.job === "read" && r.questions?.length) bits.push(_t("learned: {what}", { what: r.questions.map(q => READ_QUESTIONS[q]?.short).join(", ") }));
    if (tech?.job === "read" && r.readString) bits.push(_t("kept a String on them"));
    const next = tech?.job === "read"
      ? (hit ? _t("The party knows more now — see “What the party knows” above.") : _t("They noticed. Try another way — or ask without knowing."))
      : hit ? (priced && !r.paid ? _t("You walked away from the deal — they keep what you asked for.") : _t("They gave it. What it cost — in the chat card."))
      : _t("They refused — and it left a mark (see the chat card). Try another approach, read them, or come back with leverage.");
    const cls = hit ? (r.grade === "strong" ? "crit" : "success") : r.grade === "botch" ? "botch" : "failure";
    return `<div class="tsl-result tsl-result--${cls}">
      <span class="tsl-result-total">${r.total}</span>
      <span class="tsl-result-vs">${_t("vs {dc}", { dc: r.dc })}</span>
      <span class="tsl-result-label">${esc(`${tech ? `${tech.label}: ` : ""}${TSLTalk.gradeLabel(r.technique, r.grade)}`)}</span>
      ${bits.length ? `<span class="tsl-result-bits">${esc(bits.join(" · "))}</span>` : ""}
      <span class="tsl-next">${esc(next)}</span>
      <button type="button" class="tsl-result-x" data-t-clear-result aria-label="${esc(_t("Dismiss"))}">×</button>
    </div>`;
  }

  /** An NPC's own Talk tab: how to play them, what they feel, the lies they believe, the Strings they hold. */
  _cheatSheet(npc) {
    const esc = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const shown = SocialArchetypeManager.getShown(npc), mask = SocialArchetypeManager.getMask(npc);
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
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Playing them")}</span><span class="tsl-gm-tag">GM</span></div>
        ${arch ? `<div class="tsl-arch-grid tsl-cheat">
          <span>${_t("Key")}</span><span><b>${esc(APPROACHES[arch.key].label)}</b> — ${esc(arch.keyText)}</span>
          <span>${_t("Wall")}</span><span><b>${esc(APPROACHES[arch.wall].label)}</b> — ${esc(arch.wallText)}</span>
          <span>${_t("Yes, but")}</span><span>${esc(arch.price.text)}${arch.price.string ? ` <i>${_t("(a String on the asker)")}</i>` : ""}</span>
          <span>${_t("On a no")}</span><span>${esc(arch.press)} <i>${_t("Every miss but a Read leaves the speaker <b>{emotion}</b>.", { emotion: esc(EMOTIONS[arch.hurts]?.label ?? _t("shaken")) })}</i></span>
          <span>${_t("After a no")}</span><span>${stance === "firm" ? _t("they end it — the door is closed for the scene") : stance === "yield" ? _t("they keep listening") : _t("your call")}</span>
          <span>${_t("Before witnesses")}</span><span>${tslAudienceText(arch.audience ?? 0)} — ${esc(arch.audienceWhy ?? "")}</span>
          <span>${_t("Mask")}</span><span>${mask ? _t("they show the <b>{mask}</b> — a mask", { mask: esc(mask.label) }) : shown ? _t("an open face — what they show is who they are") : _t("they show nothing")}</span>
        </div>` : `<p class="tsl-note">${_t("No nature set — pick one in Profile, and this becomes your cheat sheet.")}</p>`}
        <p class="tsl-note">${_t("Roll only when they're unwilling and it matters. The players pick the technique, size the ask and say who's watching — say so if the words don't match. Their Strings are yours to spend: Bonds → Hurt.")}</p>
      </section>
      ${lies.length ? `<section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Lies they believe")}</span><span class="tsl-gm-tag">GM</span></div>
        ${lies.map(l => `<div class="tsl-lie"><span><i class="fas fa-mask"></i> ${_t("{name} lied to them", { name: esc(game.actors.get(l.byId)?.name ?? _t("someone")) })}</span>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-lie-out="${l.id}" data-tooltip="${esc(_t("The truth comes out: they turn on the liar (Enemy) and take two Strings on them."))}">${_t("Bring it out")}</button></div>`).join("")}
      </section>` : ""}
      ${held.size ? `<section class="tsl-sec"><div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Strings they hold")}</span></div>
        <p class="tsl-note">${[...held].map(([who, n]) => `${esc(who)} ${"●".repeat(n)}`).join(" · ")} — ${_t("spend one for +5 against them, Pull it in a fight, or Hurt them with it (their Bonds).")}</p></section>` : ""}`;
  }

  // ── Codex ───────────────────────────────────────────────────────────────────

  _buildCodexTab({ isGM }) {
    const cats = [
      { id: "start",   label: _t("How it works"), icon: "fa-play" },
      { id: "ap",      label: _t("Techniques"),   icon: "fa-hand-fist" },
      { id: "read",    label: _t("Reading"),      icon: "fa-eye" },
      { id: "emo",     label: _t("Emotions"),     icon: "fa-heart-crack" },
      { id: "natures", label: _t("Natures"),      icon: "fa-masks-theater" },
      { id: "bonds",   label: _t("Strings & bonds"), icon: "fa-link" },
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
    const grid = `<div class="tsl-cx-grid"><span></span>${APPROACH_ORDER.map(id => `<b style="--c:${APPROACHES[id].color}"><i class="fas ${APPROACHES[id].icon}"></i> ${esc(APPROACHES[id].label)}</b>`).join("")}
      ${["ask", "gambit"].map(job => `<i>${esc(TECH_JOBS[job].label)}</i>${APPROACH_ORDER.map(ap => `<span>${esc(TECHNIQUES[techniqueFor(ap, job)].label)}</span>`).join("")}`).join("")}
      <i>${esc(TECH_JOBS.read.label)}</i><span class="tsl-cx-grid-wide">${esc(TECHNIQUES.read.label)}</span></div>`;
    const li = (...items) => `<ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
    switch (cat) {
      case "ap": return `
        <h3>${_t("Seven techniques")}</h3>
        <p>${_t("Say your line, then pick what it really is. Each technique rolls the D&D skill it naturally is.")}</p>
        ${APPROACH_ORDER.map(id => {
          const ap = APPROACHES[id];
          return `<div class="tsl-cx-card" style="--c:${ap.color}">
            <div class="tsl-cx-card-head"><i class="fas ${ap.icon}"></i> ${esc(ap.label)} <span>${esc(ap.gist)} ${esc(ap.cost)}</span></div>
            ${["ask", "gambit"].map(job => {
              const t = TECHNIQUES[techniqueFor(id, job)];
              return `<p><b>${esc(t.label)}</b> <span class="tsl-cx-small">(${esc(TECH_JOBS[job].label.toLowerCase())} — ${esc(t.line)})</span> ${esc(t.rule)}</p>`;
            }).join("")}
          </div>`;
        }).join("")}
        <div class="tsl-cx-card" style="--c:#d9b46a">
          <div class="tsl-cx-card-head"><i class="fas fa-eye"></i> ${esc(TECHNIQUES.read.label)} <span>${esc(TECHNIQUES.read.line)}.</span></div>
          <p>${esc(TECHNIQUES.read.rule)}</p>
        </div>
        <h3>${_t("Ask or all in?")}</h3>
        ${li(_t("<b>Ask</b> — Demand, Appeal or Bargain: the way you come at them decides what winning costs. Sized by what it costs them; something against their interests needs leverage."),
             _t("<b>All in</b> — Blackmail, Seduce or Deceive: any size, no price — but each leaves a mark that lasts (an enemy, a bond, a lie on record)."))}
        <h3>${_t("Key and wall")}</h3>
        ${li(`<b><i class="fas fa-key"></i> ${_t("Key")}</b> — ${_t("the approach that opens them: you roll with <b>advantage</b> — a second d20, keep the better.")}`,
             `<b><i class="fas fa-door-closed"></i> ${_t("Wall")}</b> — ${_t("the approach they close against: <b>disadvantage</b> — a second d20, keep the worse.")}`,
             _t("The third approach is a normal roll. Before the roll you don't know which is which — the second die tells you, or a Read does. A Read has no approach."))}
        <h3>${_t("How big is the ask?")}</h3>
        <ul>${ASK_ORDER.map(id => `<li><b>${esc(ASK_SIZES[id].label)}</b> — ${esc(ASK_SIZES[id].hint)}. ${_t("DC {shift}", { shift: `${ASK_SIZES[id].dc > 0 ? "+" : ASK_SIZES[id].dc < 0 ? "−" : "±"}${Math.abs(ASK_SIZES[id].dc)}` })}.</li>`).join("")}</ul>
        <p class="tsl-cx-small">${_t("An ask against them needs leverage: their Desire or Fear, a String on them, or a deep bond (●●) that runs your way. Going all in brings its own.")}</p>
        <h3>${_t("In private, or before witnesses")}</h3>
        <p>${_t("Before an ask or a gambit, say who is watching. Before witnesses, everything weighs more:")}</p>
        ${li(_t("<b>A yes binds them</b> — for anything that costs them, everyone saw them give it: a String on them."),
             _t("<b>A no shames you</b> — you lose face: you're Insecure."),
             _t("<b>The room tips the roll</b> — some natures bend before an audience (+2: an Idol performs generosity, a Duelist must answer a challenge), others harden (−2: a Tyrant never bends where their people can see). Like the key and the wall, it shows in the result — or read it first."))}
        <h3>${_t("Your roll")}</h3>
        <p>${_t("d20 + <b>the technique's skill</b> + <b>Leanings</b> (+1 per dot in that approach) + <b>bond</b> (+● if it runs that way) + <b>their Desire or Fear</b> (+{lever}, once you know it) + <b>help</b> (+{help}) ± <b>emotions</b>, against <b>DC = 10 + their proficiency + the better of WIS/INT</b>, shifted by the size of an ask.", { lever: LEVER_BONUS, help: HELP_BONUS })}</p>`;

      case "read": return `
        <h3>${_t("Reading people")}</h3>
        <p>${_t("<b>Read them</b>: watch, listen, ask the one right question — an Insight check. A hit answers one question:")}</p>
        <ol class="tsl-cx-qs">${READ_ORDER.map(q => `<li>${esc(READ_QUESTIONS[q].label)}</li>`).join("")}</ol>
        ${li(_t("<b>A strong hit</b> answers a second question — or, instead, keep what you saw: <b>a String on them</b>. You saw where it hurts."),
             _t("What you learn goes into the party's dossier on them — for good."),
             _t("Once the party knows their <b>key and their wall</b>, the nature is named and its whole card opens."),
             _t("A miss: they notice, and won't be read again this scene — but a Read never costs you an emotion. A bad miss: they read you instead — a String on you."))}
        <h3>${_t("Masks")}</h3>
        <p>${_t("What you see first is the nature they <b>show</b> — “seems: Idol”. Sometimes it is their true face. Sometimes it is a <b>mask</b>: a Schemer playing the Caretaker, a Martyr playing the Tyrant — and the mask's key may be their wall.")}</p>
        ${li(_t("Ask “<b>Is that their true face?</b>” — an open face names them on the spot; a mask shows as a mask."),
             _t("Or learn the hard way: once you know their key and their wall, they're named — and the mask falls."),
             _t("Someone who shows nothing is simply unread."))}
        <h3>${_t("Learning by doing")}</h3>
        <p>${_t("Every technique teaches: the second die shows their key or their wall; their price shows when they say “yes, but”; a slammed door shows what they do after a no; the room shows how they take witnesses.")}</p>
        <h3>${_t("Nine natures, three ways of coping")}</h3>
        <p>${_t("Karen Horney described three ways people cope with others — moving <b>against</b> them (Power), <b>toward</b> them (Emotion), <b>away</b> from them (Order). Inside a triad every nature has a different key and wall: knowing someone's way is never enough. Read the person.")}</p>`;

      case "emo": return `
        <h3>${_t("Five emotions")}</h3>
        <p>${_t("As in Thirsty Sword Lesbians, anyone can carry them — your character, or the person you're talking to. They show on the token. Each one costs whoever feels it, and helps whoever plays on it — until it's let go.")}</p>
        ${EMOTION_ORDER.map(id => {
          const d = EMOTIONS[id];
          return `<div class="tsl-cx-card" style="--c:${d.color}">
            <div class="tsl-cx-card-head"><img class="tsl-emo-ico" src="${d.img}" alt=""> ${esc(d.label)}</div>
            <p><b>${_t("On you")}</b> ${esc(d.spoilsText)}.</p>
            <p><b>${_t("On them")}</b> ${esc(d.opensText)}.</p>
            <p><b>${_t("Let it go")}</b> ${esc(d.clear)} <span class="tsl-cx-small">${_t("Or a friend's comfort.")}</span></p>
          </div>`;
        }).join("")}
        <h3>${_t("Where they come from")}</h3>
        ${li(_t("<b>A miss</b> — anything but a Read: the person hits back with their nature's emotion. Each nature hurts in its own way (Natures)."),
             _t("<b>Before witnesses</b> — a no in front of others: you lose face, and you're Insecure."),
             _t("<b>A String</b> spent on someone (Bonds → Hurt) — players on NPCs, and the GM's NPCs on players. Say how, in the scene."),
             _t("<b>Gambits</b> — Blackmail leaves them Frightened; a broken heart leaves you Hopeless; a lie brought out leaves them Angry."))}
        <h3>${_t("Scars")}</h3>
        <p>${_t("Take an emotion you already carry, and it leaves a <b>scar</b> instead — for good, one per emotion. A scar is a twist, not just a wound:")}</p>
        <ul>${Object.values(SCARS).map(sc => `<li><b>${esc(sc.label)}</b> (${esc(EMOTIONS[sc.from].label)}) — ${esc(sc.text)}</li>`).join("")}</ul>`;

      case "natures": return `
        <h3>${_t("The nine natures")}</h3>
        <p>${_t("The catalog is open to everyone; who is which is not — and some wear another's face.")}</p>
        ${Object.values(SOCIAL_TRIADS).map(t => `
          <div class="tsl-cx-triad" style="--c:${t.color}"><b>${esc(t.label)}</b> — ${_t("moving {how}", { how: esc(t.horney) })}</div>
          ${SOCIAL_ARCHETYPES.filter(x => x.triad === t.id).map(x => `
            <div class="tsl-cx-card" style="--c:${t.color}">
              <div class="tsl-cx-card-head">${esc(x.label)} <span>${esc(x.description)}</span></div>
              <p><span class="tsl-cx-k"><i class="fas fa-key"></i> ${esc(APPROACHES[x.key].label)}</span> ${esc(x.keyText)}</p>
              <p><span class="tsl-cx-w"><i class="fas fa-door-closed"></i> ${esc(APPROACHES[x.wall].label)}</span> ${esc(x.wallText)}</p>
              <p><span class="tsl-cx-p"><i class="fas fa-handshake"></i> ${_t("Price")}</span> ${esc(x.price.text)}${x.price.string ? ` <i>${_t("(a String on you)")}</i>` : ""}</p>
              <p><span class="tsl-cx-w"><i class="fas fa-heart-crack"></i> ${_t("Hurts")}</span> ${esc(x.press)} ${_t("Miss against them and you're <b>{emotion}</b>.", { emotion: esc(EMOTIONS[x.hurts]?.label ?? _t("shaken")) })}</p>
              <p><span class="tsl-cx-p"><i class="fas fa-users"></i> ${_t("Before witnesses")}</span> ${tslAudienceText(x.audience ?? 0)} — ${esc(x.audienceWhy ?? "")}.</p>
              <p class="tsl-cx-small">${x.pressed === "firm" ? _t("After a no, they end it") : _t("After a no, they keep listening")} — ${esc(x.pressedWhy)}. ${esc(x.psych)}</p>
            </div>`).join("")}`).join("")}`;

      case "bonds": return `
        <h3>${_t("Strings")}</h3>
        <p>${_t("A String is a hold on one person — a debt, a weakness seen, a line crossed in front of others. At most {cap} on anyone. It does nothing while you hold it; you <b>spend</b> it:", { cap: STRING_CAP })}</p>
        ${li(_t("<b>After a miss</b> against them: burn one for <b>+{n}</b>.", { n: STRING_SPEND_BONUS }),
             _t("<b>Pull it in a fight</b> (Bonds → Pull): <b>Strike</b> +5 to your next attack, check or save against them, or <b>Guard</b> +5 AC against their next attack. It goes on your sheet and ends itself."),
             _t("<b>Hurt</b> (Bonds → Hurt): spend one to make them feel something — an emotion — and set up a friend's ask. The GM's NPCs do it to you too."),
             _t("Holding one is <b>leverage</b> — for an ask against their interests, or for Blackmail."))}
        <h3>${_t("How you get a hold on them")}</h3>
        ${li(_t("<b>They give more than they meant to</b> — a strong hit on an ask or a gambit for something big."),
             _t("<b>They give before witnesses</b> — a yes to something that costs them, in front of others: they can't take it back."),
             _t("<b>You see where it hurts</b> — a strong Read: keep a String instead of a second answer."),
             _t("<b>They open up to you</b> — a confession, a secret, a moment of weakness in play: the GM hands you one (Bonds → +)."))}
        <h3>${_t("How they get one on you")}</h3>
        ${li(_t("<b>You made them</b> — you win by Pressure, or by Blackmail: they'll pay you back."),
             _t("<b>You showed your heart</b> — a Heart technique misses, or a seduction breaks."),
             _t("<b>You got caught</b> — a threat or a bluff called, a lie seen through; a lie brought out later costs two."),
             _t("<b>You paid their price</b> — some prices are a debt (the card says so)."),
             _t("<b>A bad miss</b> — or a bad Read: they read you instead."))}
        <p class="tsl-cx-small">${_t("At most one String changes hands each way per roll. A hold on someone you have no bond with makes you Strangers — so it shows in Bonds, ready to spend.")}</p>
        <h3>${_t("Bonds")}</h3>
        <p>${_t("A bond is a type and a strength (●–●●●), shared by both people. Your bond toward someone gives <b>+1 per ●</b> on techniques of the approach it runs:")}</p>
        <ul>${APPROACH_ORDER.map(id => `<li><b>${esc(APPROACHES[id].label)}</b> — ${BOND_TYPES.filter(t => SocialArchetypeManager.bondApproach(t.id) === id).map(t => esc(t.label)).join(", ")}</li>`).join("")}</ul>
        <p>${_t("Techniques move bonds: Heart wins <b>warm</b> them (a stranger becomes a Friend); Pressure wins <b>sour</b> them (a stranger becomes a Rival); Blackmail makes an <b>Enemy</b>; a slammed door or a broken heart <b>cools</b> them.")}</p>
        <h3>${_t("Lies")}</h3>
        <p>${_t("A lie that works stays on record. When the GM brings it out, they turn on the liar — an Enemy, and two Strings on them.")}</p>`;

      case "gm": return `
        <h3>${_t("Running it")}</h3>
        ${li(_t("<b>Roll only when they're unwilling and it matters.</b> Otherwise, talk."),
             _t("<b>Nobody declares a goal.</b> Every ask stands on its own — when what the party wants changes, they just ask for the new thing."),
             _t("<b>Hold them to the words.</b> The technique is what the line really is: an Appeal that's really a threat is a Demand. Say so before the roll."),
             _t("<b>Size the ask</b> by what it costs them, not by how tough they are."),
             _t("<b>On a “yes, but”</b> their nature names the price (the NPC's Talk tab is your cheat sheet). The player decides whether to pay."),
             _t("<b>On a “no”</b> they push back their own way — play their “on a no” line. A proud one, refused something big, closes the door for the scene."),
             _t("<b>Don't let them re-roll the same ask</b> without something new: a lever, a String, an emotion on them, another approach, another room."),
             _t("<b>Their Line</b> is real: an ask that crosses it is simply refused — no roll."),
             _t("<b>Lies come out</b> when the story says so — bring them out from their Talk tab."),
             _t("<b>Play the emotions.</b> An Angry NPC snaps; a Frightened one gives ground. Let an emotion go (× on its tag) when it's acted out — and hold the players to theirs."),
             _t("<b>Their Strings are your weapons.</b> When an NPC has a hold on someone, spend it (their Bonds → Hurt or Pull) at the moment it would land."),
             _t("<b>Reward the heart:</b> when an NPC opens up to a character — a confession, a secret, a weakness shown — give that character a String on them (Bonds → +). The same works the other way."))}
        <h3>${_t("The court")}</h3>
        ${li(_t("<b>Give them a face.</b> In an NPC's Profile, set the <b>Mask</b>: their own nature for an open face, another for a mask, nothing for someone unreadable. The party sees it in Talk and on the Scene as “seems: …”."),
             _t("<b>Say who's watching.</b> A hall, a feast, a crowd, their own people — the player sets “before witnesses”; hold them to it. For a whole court, make the scene public (the Social Scene's header): every ask there starts before witnesses. A word in a back room is private."),
             _t("<b>Play the room.</b> A Tyrant never bends where their people can see; an Idol performs generosity for an audience. The card's “before witnesses” line says how each takes it."),
             _t("<b>Every favour is a debt.</b> Strings are the court's currency: let NPCs collect them, trade on them, and call them in when it hurts most."))}
        <h3>${_t("Content")}</h3>
        <p>${_t("Some techniques model real manipulation — blackmail, guilt, coldness, seduction, lies. Agree on limits with your table before you play them, and keep them on NPCs unless everyone wants otherwise.")}</p>`;

      default: return `
        <p class="tsl-cx-motto">${_t("Every word is a move. Every favour is a debt. Everyone wears a mask — and someone is always watching.")}</p>
        <h3>${_t("What it's for")}</h3>
        <p>${_t("You want something from someone who doesn't want to give it — and it matters. Not one Persuasion check: the <b>person</b> decides how your words land. Everyone has a hidden nature that opens to one approach and closes against another. The whole game is to <b>understand the person</b>.")}</p>
        <h3>${_t("How to play — three steps")}</h3>
        <ol class="tsl-cx-steps">
          <li>${_t("<b>Say your line</b> out loud, in character — to someone on the map with you.")}</li>
          <li>${_t("<b>Pick what it really is</b> in Talk: press them (<b>Pressure</b>), go through their feelings (<b>Heart</b>), or make it worth their while (<b>Reason</b>) — as an ask, or all in. Not sure how they'll take it? <b>Read them</b> first.")}</li>
          <li>${_t("<b>Roll.</b> The card in the chat says what they do — and what it costs you.")}</li>
        </ol>
        <p class="tsl-t-where"><i class="fas fa-circle-info"></i> ${_t("<b>Where:</b> right-click your character's token → the {icon} button → <b>Talk</b>. Target who you're talking to on the map (hover their token, press <b>T</b>) — or <b>Pick on the map</b>.", { icon: `<i class="fas fa-address-book"></i>` })}</p>
        ${grid}
        <h3>${_t("Why the approach matters")}</h3>
        <p>${_t("Each person has a <b>key</b> — the approach that works on them: you roll with <b>advantage</b>. And a <b>wall</b> — the one they close against: <b>disadvantage</b>. The third is a normal roll. You don't know which is which until you try — or read them. Talk shows your odds on every technique, from what the party knows.")}</p>
        <h3>${_t("Which skill")}</h3>
        <p>${_t("Each technique rolls the D&D skill it naturally is: Demand and Blackmail — Intimidation; Appeal, Bargain and Seduce — Persuasion; Deceive — Deception; Read them — Insight. Play to the party's strengths: let the one who frightens do the pressing.")}</p>
        <h3>${_t("What they say")}</h3>
        ${li(_t("<b>Strong hit</b> (5 over, or a 20) — it works. An ask or gambit for something big also hands you a String on them."),
             _t("<b>Hit</b> — it works; an Appeal or a Bargain gets “yes, but”: their nature names the price — pay it, or walk away."),
             _t("<b>Miss</b> — they push back their own way, and it hurts: you take their nature's <b>emotion</b> (−2 somewhere until you act it out) — anything but a Read. A proud one, refused something big, closes the door for the scene."),
             _t("<b>Bad miss</b> (5 under, or a 1) — and a String on you as well."))}
        <p>${_t("After a miss you may burn a String on them for +{n}.", { n: STRING_SPEND_BONUS })}</p>
        <h3>${_t("What winning costs")}</h3>
        <ul>${APPROACH_ORDER.map(id => `<li><b>${esc(APPROACHES[id].label)}</b> — ${esc(APPROACHES[id].cost)}</li>`).join("")}</ul>
        <h3>${_t("In private, or before witnesses")}</h3>
        <p>${_t("Say who is watching. <b>Before witnesses</b> a yes to anything that costs them binds them — a String on them — and a no shames you: Insecure. Some natures bend before an audience; others harden.")}</p>
        <h3>${_t("An example")}</h3>
        <p>${_t("Captain Roell won't open the gate. Lyra reads the captain first — Insight: the key is Heart. “Captain, I'd never ask you to break your orders — only to be who your soldiers believe you are.” An Appeal, with advantage: a hit. “Yes — but ask it as a favour. On your knee, before my people.” Lyra kneels. The gate opens — and Roell remembers who knelt.")}</p>`;
    }
  }

  // ── Listeners ───────────────────────────────────────────────────────────────

  activateListeners(html) {
    super.activateListeners(html);
    this._bindListeners(html instanceof HTMLElement ? html : html[0]);
  }

  _bindListeners(el) {
    if (!el) return;
    // A refresh held back while typing runs once the field is left.
    el.addEventListener("focusout", () => { if (this._stale) { this._stale = false; setTimeout(() => this._refresh(), 0); } });
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
    on("[data-t-pick]", "click", () => {
      if (this._picking) return this._endPick(_t("Pick cancelled."));
      this._startPick((actor) => {
        if (SocialArchetypeManager.isPC(actor)) { ui.notifications.warn(_t("You ask NPCs — pick someone the GM plays.")); return; }
        this._face(actor.id);
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
    on("[data-wit]", "click", (_e, n) => { this._tWitnesses = n.dataset.wit === "1"; this.render(false); });
    on(".tsl-t-help", "change", (e) => { this._tHelper = e.target.value || null; this.render(false); });
    on("[data-lever]", "click", (_e, n) => { this._tLever = this._tLever === n.dataset.lever ? null : n.dataset.lever; this.render(false); });
    on("[data-t-roll]", "click", async (_e, n) => {
      const npc = game.actors.get(this._tTarget);
      if (!npc || !this._tTech) return;
      n.disabled = true;
      const p = await TSLTalk.roll(this._actor, npc, { technique: this._tTech, size: this._tSize, skill: this._tSkill, helperId: this._tHelper, lever: this._tLever, witnesses: this._witnessesNow() });
      if (p) {
        this._tResult = { technique: p.technique, grade: p.grade, total: p.total, dc: p.dc, rel: p.rel, paid: p.paid,
          questions: p.questions, readString: p.readString, witnesses: p.witnesses, audience: p.audience };
        this._tLever = null;
        this._tTech = null;
      }
      this.render(false);
    });
    on("[data-lie-out]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.exposeLie(this._actor, n.dataset.lieOut); });
    on("[data-emo-clear]", "click", async (_e, n) => {
      const actor = game.actors.get(n.dataset.emoClear);
      if (!actor || !(game.user.isGM || actor.isOwner)) return;
      const how = await this._promptLetGo(actor, n.dataset.emo);
      if (how) await TSLEmotions.clear(actor, n.dataset.emo, how);
      this.render(false);
    });
    on("[data-t-clear-result]", "click", () => { this._tResult = null; this.render(false); });

    if (!canEdit) return;

    // ── Profile ──
    on("select[name='archetypeId']", "change", (e) => {
      // A new nature is a new secret: un-name it, forget what was known about the old one.
      SocialArchetypeManager.setActorData(this._actor, { archetypeId: e.target.value || null, revealed: false, known: {} });
    });
    on("select[name='maskId']", "change", (e) => {
      // A new face: whatever the party saw through before no longer holds.
      const known = { ...(SocialArchetypeManager.getActorData(this._actor).known ?? {}), mask: false };
      SocialArchetypeManager.setActorData(this._actor, { maskId: e.target.value || null, known });
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
        ui.notifications.warn(_t("Only {n} dots to spread — lower another approach first.", { n: TRIAD_POINT_POOL }));
        return;
      }
      await SocialArchetypeManager.setActorData(this._actor, { triad: { ...triad, [triadId]: value } });
    });

    // ── Bonds ──
    on("[data-bond-target]", "click", async (_e, n) => {
      const entry = await TSLBondStore.add(this._actor.id, n.dataset.bondTarget);
      if (entry) { this._expandedBonds.add(entry.id); this.render(false); }
    });
    on("[data-bond-pick]", "click", () => {
      if (this._picking) this._endPick(_t("Pick cancelled."));
      else this._startPick();
    });
    on(".tsl-bond-type", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { type: e.target.value }));
    on(".tsl-str", "click", (_e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { attitude: Number(n.dataset.strength) }));
    on(".tsl-bond-notes", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { notes: e.target.value.trim() }));
    on(".tsl-bond-remove", "click", (_e, n) => TSLBondStore.remove(this._actor.id, n.dataset.bondId));
    on("[data-str-adj]", "click", async (_e, n) => {
      if (Number(n.dataset.strAdj) > 0) {
        if (!(await TSLStringStore.add(this._actor.id, n.dataset.target, 1))) ui.notifications.warn(_t("At most {n} Strings on one person.", { n: STRING_CAP }));
      } else await TSLStringStore.spend(this._actor.id, n.dataset.target);
      this.render(false);
    });
    on("[data-hurt]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.hurt);
      if (!target) return;
      const emotion = await this._promptHurt(target);
      if (emotion) await TSLGMActions.request("stringHurt", { holderId: this._actor.id, targetId: target.id, emotion });
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

  /** Which emotion a String buys — the GM judges that the moment fits. */
  async _promptHurt(target) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      const buttons = {};
      for (const id of EMOTION_ORDER) buttons[id] = { label: EMOTIONS[id].label, callback: () => resolve(id) };
      buttons.cancel = { label: _t("Keep it"), callback: () => resolve(null) };
      new Dialog({
        title: _t("{holder} pulls a String on {target}", { holder: this._actor.name, target: target.name }),
        content: `<div class="tsl-dlg"><p>${_t("Spend one String on <b>{name}</b> to make them feel something — say how, in the scene. The GM says if it fits.", { name: esc(target.name) })}</p>
          <ul class="tsl-dlg-list">${EMOTION_ORDER.map(id => `<li><b>${esc(EMOTIONS[id].label)}</b> — ${esc(EMOTIONS[id].spoilsText)}.</li>`).join("")}</ul></div>`,
        buttons,
        default: "cancel",
        close: () => resolve(null),
      }, tslDialogOptions({ width: 480 })).render(true);
    });
  }

  /** Letting an emotion go: acted out in the scene, or a friend's comfort. */
  async _promptLetGo(actor, id) {
    const esc = foundry.utils.escapeHTML;
    const d = EMOTIONS[id];
    if (!d) return null;
    const friends = this._scenePcs(actor.id).slice(0, 3);
    return new Promise(resolve => {
      const buttons = { act: { label: _t("Acted it out"), callback: () => resolve("act") } };
      for (const fr of friends) buttons[`f${fr.id}`] = { label: _t("{friend} comforts them", { friend: fr.name }), callback: () => resolve(fr.id) };
      buttons.cancel = { label: _t("Not yet"), callback: () => resolve(null) };
      new Dialog({
        title: _t("{name} — let go of {emotion}?", { name: actor.name, emotion: d.label }),
        content: `<div class="tsl-dlg"><p>${_t("{emotion} goes when it's acted out in the scene:", { emotion: esc(d.label) })}</p>
          <p class="tsl-dlg-price">${esc(d.clear)}</p>
          <p class="notes">${_t("Or a friend comforts them.")}</p></div>`,
        buttons,
        default: "act",
        close: () => resolve(null),
      }, tslDialogOptions()).render(true);
    });
  }

  /** Strike or guard? — the choice when a String is pulled. */
  async _promptPull(target) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: _t("{holder} pulls a String on {target}", { holder: this._actor.name, target: target.name }),
        content: `<div class="tsl-dlg"><p>${_t("Burn one String on <b>{name}</b>. It goes on your sheet and ends itself once used.", { name: esc(target.name) })}</p>
          <ul class="tsl-dlg-list"><li>${_t("<b>Strike</b> — +5 to your next attack, check or save against them.")}</li>
          <li>${_t("<b>Guard</b> — +5 AC against their next attack.")}</li></ul></div>`,
        buttons: {
          strike: { icon: '<i class="fas fa-crosshairs"></i>', label: _t("Strike +5"), callback: () => resolve("strike") },
          guard:  { icon: '<i class="fas fa-shield-halved"></i>', label: _t("Guard +5 AC"), callback: () => resolve("guard") },
          cancel: { label: _t("Keep it"), callback: () => resolve(null) },
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
    if (!board) { ui.notifications.warn(_t("Can't reach the game canvas.")); return; }
    this._picking = true;
    this._pickMode = mode;
    this._pickHandler = onPick;
    this.render(false);
    await this.minimize();
    board.style.cursor = "crosshair";
    ui.notifications.info(_t("Click a token on the map for {name}. Esc cancels.", { name: this._actor.name }));

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
      if (hit.document.hidden && !game.user.isGM) { ui.notifications.warn(_t("That token is hidden.")); return; }
      if (hit.actor.id === this._actor.id) { ui.notifications.warn(_t("That is {name} themselves.", { name: this._actor.name })); return; }
      const handler = this._pickHandler;
      this._endPick();
      if (handler) handler(hit.actor);
      else this._defaultBondPick(hit.actor);
    };
    this._onPickCancel = (event) => { if (event.key === "Escape") this._endPick(_t("Pick cancelled.")); };
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
        ui.notifications.info(_t("Bond added: {a} → {b}", { a: this._actor.name, b: targetActor.name }));
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
    for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
    clearTimeout(this._refreshTimer);
    SocialFencingDialog._instances.delete(this._actor.id);
    return super.close(options);
  }
}
