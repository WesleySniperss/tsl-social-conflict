/**
 * tsl-social-conflict | social-notes-app.js
 *
 * The Chronicle — one window per character, opened from the token HUD.
 *
 *   Profile — an NPC: (GM) its hidden nature and the face it shows (a mask,
 *             or its own), what it does after a "no", what the party knows,
 *             the dossier, its Agenda. A player character: their maneuvers
 *             from the sheet (best first), emotions & scars, notes.
 *   Bonds   — relationships: type + strength (one shared bond, mirrored on
 *             both sides), the String held (Invest; Pull: +5 strike or guard).
 *   Talk    — the roll, when the GM calls for it (the talk itself is played
 *             at the table): face an NPC (target their token, or pick it on
 *             the map), then the four social checks of D&D — persuade,
 *             intimidate, lie, read them: eight maneuvers, each a pair of D&D
 *             skills. An NPC's own Talk tab is the GM's live screen: how to
 *             play them, and what the talk revealed and left on them (no roll).
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
    this._tab     = "profile";   // the first tab: who they are, and what weighs on them now
    this._codexCat = "start";
    this._picking = false;
    this._expandedBonds = new Set();
    // Talk
    this._tTarget    = null;     // the NPC this character is talking to
    this._tTech      = null;     // the maneuver picked (a TECHNIQUES id)
    this._tMode      = null;     // "ask" | "read" — what you're doing, once the GM calls for a roll
    this._tApproach  = null;     // how your words came at them (a lie takes it from here)
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
        if (scene?.id === globalThis.canvas?.scene?.id && foundry.utils.hasProperty(change, "flags.tsl-social-conflict.public")) this._refresh();
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
    this._tQuestions = [];
    this._tTarget = id; this._tTech = null; this._tMode = null; this._tApproach = null; this._tLever = null; this._tResult = null; this._tWitnesses = null;
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
        theirCount: TSLStringStore.countOn(b.targetActorId, actorId),
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
      ${this._tab === "profile" ? "" : this._stateStrip(ctx)}
      <div class="tsl-body">${body}</div>
    </div>`;
  }

  /**
   * What weighs on this person right now — emotions, scars and the system's own
   * conditions (D&D's) — on every tab, so nobody has to go looking. Everyone
   * who opens the Chronicle sees it. Its owner and the GM change it: × takes one
   * off; "Change" opens the palette, where every one of them is a switch.
   */
  _stateStrip(ctx) {
    const esc = foundry.utils.escapeHTML;
    const a = this._actor;
    const can = TSLEmotions.canEdit(a);
    const tags = this._stateTags(a, ctx.isPC);
    const open = can && this._stateOpen;
    return `<div class="tsl-state ${open ? "open" : ""}">
      <div class="tsl-state-row">
        <span class="tsl-state-label" data-tooltip="${esc(_t("Emotions: −2 somewhere for whoever feels one, +2 for whoever plays on it, until it's let go (×). A scar stays for good."))}"><i class="fas fa-heart-pulse"></i> ${_t("Feels")}</span>
        <div class="tsl-state-tags">${tags || `<span class="tsl-state-none">${_t("nothing right now")}</span>`}</div>
        ${can ? `<button type="button" class="tsl-state-edit ${open ? "on" : ""}" data-state-open
          data-tooltip="${esc(open ? _t("Close") : _t("Put on or take off an emotion, a scar or a condition — no roll"))}"><i class="fas fa-${open ? "xmark" : "pen"}"></i> ${open ? _t("Close") : _t("Change")}</button>` : ""}
      </div>
      ${open ? this._statePalette(a) : ""}
    </div>`;
  }

  /** What's on them now, as tags: emotions (what each costs, or opens), scars, conditions — × for whoever may change it. */
  _stateTags(a, isPC = SocialArchetypeManager.isPC(a)) {
    const esc = foundry.utils.escapeHTML;
    const can = TSLEmotions.canEdit(a);
    return this._emotionTags(a, { canClear: can, effects: isPC ? "mine" : "theirs", scars: true, scarX: can })
      + TSLConditions.active(a).map(c => `<span class="tsl-cond-tag" data-tooltip="${esc(c.name)}"><img src="${c.img}" alt=""> ${esc(c.name)}${can
        ? `<button type="button" class="tsl-emo-x" data-cond-off="${c.id}" aria-label="${esc(_t("Take it off"))}" data-tooltip="${esc(_t("Take it off"))}">×</button>` : ""}</span>`).join("");
  }

  /**
   * The first tab's own: what weighs on them now — and, for whoever may change
   * it (the GM; a player on their own character), every emotion, scar and
   * condition as a switch right below, nothing to open.
   */
  _stateSection(ctx) {
    const a = this._actor;
    const tags = this._stateTags(a, ctx.isPC);
    return `<section class="tsl-sec tsl-state-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title"><i class="fas fa-heart-pulse"></i> ${_t("What weighs on them")}</span></div>
      <div class="tsl-state-tags">${tags || `<span class="tsl-state-none">${_t("nothing right now")}</span>`}</div>
      ${TSLEmotions.canEdit(a) ? this._statePalette(a) : ""}
    </section>`;
  }

  /**
   * The palette: every emotion, scar and condition as a switch — on or off, one
   * click, no roll. The GM's on anyone; a player's on their own character.
   * Guilt is owed to someone.
   */
  _statePalette(a) {
    const esc = foundry.utils.escapeHTML;
    const feels = TSLEmotions.of(a), scars = TSLEmotions.scars(a);
    const pc = SocialArchetypeManager.isPC(a);
    const people = this._peopleOf(a);
    const guilt = feels.find(f => f.id === "guilty");
    const towardSel = people.length ? `<select class="tsl-state-toward" data-tooltip="${esc(_t("Guilty toward whom"))}">${people.map(p =>
      `<option value="${p.id}" ${guilt?.toward === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>` : "";
    const emo = EMOTION_ORDER.map(id => {
      const d = EMOTIONS[id], on = feels.some(f => f.id === id);
      const sw = `<button type="button" class="tsl-feel ${on ? "on" : ""}" data-state-emo="${id}" style="--c:${d.color}" aria-pressed="${on}"
        data-tooltip="${esc(`<b>${d.label}</b> — ${pc ? d.spoilsText : d.opensText}.<br>${on ? _t("Click to take it off.") : _t("Click to put it on.")}`)}"><img src="${d.img}" alt=""> ${esc(d.label)}</button>`;
      return id === "guilty" && towardSel ? `<span class="tsl-feel-pair">${sw}<span class="tsl-feel-to">${_t("toward")}</span>${towardSel}</span>` : sw;
    }).join("");
    const sc = Object.values(SCARS).map(s => {
      const on = scars.includes(s.id);
      return `<button type="button" class="tsl-feel tsl-feel--scar ${on ? "on" : ""}" data-state-scar="${s.id}" aria-pressed="${on}"
        data-tooltip="${esc(`<b>${_t("Scar — {scar}", { scar: s.label })}</b> (${EMOTIONS[s.from].label})<br>${s.text}<br>${on ? _t("Click to take it off.") : _t("Click to put it on.")}`)}"><img src="icons/svg/blood.svg" alt=""> ${esc(s.label)}</button>`;
    }).join("");
    const active = new Set(TSLConditions.active(a).map(c => c.id));
    const conds = TSLConditions.list().map(c => `<button type="button" class="tsl-cond ${active.has(c.id) ? "on" : ""}" data-state-cond="${c.id}" aria-pressed="${active.has(c.id)}"
        data-tooltip="${esc(`<b>${c.name}</b><br>${active.has(c.id) ? _t("Click to take it off.") : _t("Click to put it on.")}`)}"><img src="${c.img}" alt=""> ${esc(c.name)}</button>`).join("");
    const group = (icon, title, hint, body) => `<div class="tsl-pal-group">
        <div class="tsl-pal-head"><b><i class="fas ${icon}"></i> ${title}</b><span>${hint}</span></div>
        <div class="tsl-feels">${body}</div>
      </div>`;
    return `<div class="tsl-state-pal">
      ${group("fa-heart-crack", _t("Emotions"), _t("−2 for whoever feels one, +2 for whoever plays on it — until it's let go"), emo)}
      ${pc ? group("fa-droplet", _t("Scars"), _t("for good — the same emotion twice leaves one"), sc) : ""}
      ${conds ? group("fa-person-falling", _t("Conditions"), _t("the system's own — the same as on the token"), conds) : ""}
      <p class="tsl-note">${_t("Click to put one on or take it off — no roll. An emotion or a scar put on posts a line in the chat.")}</p>
    </div>`;
  }

  /** Who someone could feel guilty toward: the people they're bonded with, and everyone on this map. */
  _peopleOf(a) {
    const out = new Map();
    for (const b of TSLBondStore.getList(a.id)) { const x = game.actors.get(b.targetActorId); if (x) out.set(x.id, x); }
    for (const t of (canvas?.tokens?.placeables ?? [])) { const x = t.actor ? (game.actors.get(t.actor.id) ?? t.actor) : null; if (x && !out.has(x.id)) out.set(x.id, x); }
    out.delete(a.id);
    // The characters first — guilt is most often owed to one of them.
    const pc = (x) => (SocialArchetypeManager.isPC(x) ? 0 : 1);
    return [...out.values()].sort((x, y) => pc(x) - pc(y) || (x.name ?? "").localeCompare(y.name ?? ""));
  }

  /** The switch: an emotion, a scar or a condition, on or off — the GM on anyone, a player on their own. */
  async _toggleState(kind, id, toward = null) {
    const a = this._actor;
    if (!TSLEmotions.canEdit(a)) return;
    if (kind === "cond") { await TSLConditions.toggle(a, id); return; }
    if (kind === "scar") {
      if (TSLEmotions.scars(a).includes(id)) await TSLEmotions.removeScar(a, id);
      else await TSLEmotions.addScar(a, id);
      return;
    }
    if (id === "guilty" && !toward) toward = this._peopleOf(a)[0]?.id ?? null;
    if (id === "guilty" && !toward) { ui.notifications.warn(_t("Guilty is owed to someone — give them a bond, or put that person on the map.")); return; }
    await TSLEmotions.mark(a, id, { toward, title: game.user.isGM ? _t("The GM marks it") : _t("Marked by its player") });
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  _buildProfileTab(ctx) {
    return this._stateSection(ctx) + this._stringsSection(ctx) + (ctx.isPC ? this._buildPcProfile(ctx) : this._buildNpcProfile(ctx));
  }

  /**
   * Leanings — the character's archetype, as before (v1.8–v2): dots in the
   * three triads (Power · Emotion · Order — the families of the nine natures),
   * TRIAD_POINT_POOL to spread, LEANING_MAX in one. A lead of 2+ is who they
   * are. Each dot sharpens an everyday check ON THE SHEET (Power → Intimidation,
   * Emotion → Insight, Order → Deception — every check, fights included), and
   * is +1 on a maneuver of its way (Pressure · Heart · Reason); a way with no
   * dots, while leaning elsewhere, is foreign ground (−1).
   */
  _leaningsSection({ notes, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const a = this._actor;
    const total = Object.values(notes.triad).reduce((sum, v) => sum + (v || 0), 0);
    const left = TRIAD_POINT_POOL - total;
    const TS = SocialArchetypeManager.TRIAD_SKILLS;
    const ruling = SocialArchetypeManager.rulingTriad(a);
    const natures = (t) => SOCIAL_ARCHETYPES.filter(x => x.triad === t).map(x => x.label).join(" · ");
    const rows = Object.values(SOCIAL_TRIADS).map(t => {
      const ap = APPROACHES[APPROACH_ORDER.find(id => APPROACHES[id].school === t.id)];
      const skill = SKILL_LABELS[TS[t.id].key] ?? TS[t.id].label;
      const val = Math.min(LEANING_MAX, notes.triad[t.id] ?? 0);
      const pips = Array.from({ length: LEANING_MAX }, (_, i) => `<button type="button" class="tsl-pip ${i < val ? "on" : ""}" data-lean="${t.id}" data-value="${i + 1}"
          style="--pip:${t.color}" ${dis} aria-label="${esc(t.label)} ${i + 1}" data-tooltip="${esc(i + 1 === val ? _t("Click again to take this dot off.")
            : _t("{n} — +{n} {skill} on your sheet, +{n} on {approach}", { n: i + 1, skill, approach: ap.label }))}"></button>`).join("");
      const gives = val
        ? `<b>+${val} ${esc(skill)}</b> · +${val} ${esc(ap.label)}`
        : `<span class="tsl-lean-none">${total ? _t("foreign ground: −1 on {approach}", { approach: esc(ap.label) }) : _t("+1 {skill} a dot", { skill: esc(skill) })}</span>`;
      return `<div class="tsl-lean-row tsl-lean-row--triad ${ruling === t.id ? "ruling" : ""}" style="--c:${t.color}">
        <span class="tsl-lean-label" data-tooltip="${esc(`${t.label} — ${_t("moving {how}", { how: t.horney })}<br>${natures(t.id)}`)}"><i class="fas ${t.icon}"></i> ${esc(t.label)}<small>${esc(natures(t.id))}</small></span>
        <span class="tsl-pips">${pips}</span>
        <span class="tsl-lean-val">${gives}</span>
      </div>`;
    }).join("");
    const who = ruling
      ? _t("<b>{name}'s archetype: {triad}</b> — {natures}.", { name: esc(a.name), triad: esc(SOCIAL_TRIADS[ruling].label), natures: esc(natures(ruling)) })
      : total ? _t("No archetype yet — lead one triad by 2 dots to have one.") : _t("Spread the dots: they are who {name} is with people.", { name: esc(a.name) });
    const sheet = Object.entries(TS).map(([t, m]) => ({ n: SocialArchetypeManager.leanSkillBonus(a, m.key), label: SKILL_LABELS[m.key] ?? m.label })).filter(x => x.n);
    return `<section class="tsl-sec tsl-lean-sec">
      <div class="tsl-sec-head">
        <span class="tsl-sec-title">${_t("Leanings — archetype")}</span>
        <span class="tsl-budget ${left < 0 ? "over" : left === 0 ? "spent" : ""}">${left < 0 ? _t("{n} over — lower one", { n: -left }) : _t("{n} / {pool} left", { n: left, pool: TRIAD_POINT_POOL })}</span>
      </div>
      <p class="tsl-note">${who}</p>
      ${rows}
      <p class="tsl-note tsl-lean-sheet">${sheet.length
        ? _t("<b>On your sheet:</b> {list} — on every check with that skill, fights and social rolls included.", { list: sheet.map(x => `+${x.n} ${esc(x.label)}`).join(", ") })
        : _t("Each dot is +1 to a skill on your sheet — Power: Intimidation, Emotion: Insight, Order: Deception — and +1 on maneuvers of its way. {pool} dots, at most {max} in one.", { pool: TRIAD_POINT_POOL, max: LEANING_MAX })}</p>
    </section>`;
  }

  /**
   * The Strings at hand: who here — on this map — this character has
   * something on, with what they can do with it right now (no digging into
   * Bonds): remind them (they agree, no roll), Pull it (Strike or Guard),
   * invest it. Then who here has something on them, and who else they hold
   * one on, off this map.
   */
  _stringsSection(ctx) {
    const esc = foundry.utils.escapeHTML;
    const me = this._actor;
    const pc = SocialArchetypeManager.isPC(me);
    const canAct = ctx.canEdit;
    const here = new Map();
    for (const t of (canvas?.tokens?.placeables ?? [])) {
      const x = t.actor ? (game.actors.get(t.actor.id) ?? t.actor) : null;
      if (!x || x.id === me.id || here.has(x.id)) continue;
      if (!game.user.isGM && (t.document?.hidden || t.visible === false)) continue;
      here.set(x.id, x);
    }
    const heldIds = [...new Set(TSLStringStore.getList(me.id).map(e => e.targetActorId))];
    const heldHere = heldIds.filter(id => here.has(id)).map(id => here.get(id));
    const heldAway = heldIds.filter(id => !here.has(id)).map(id => game.actors.get(id)).filter(Boolean);
    const onMe = [...here.values()].filter(x => TSLStringStore.countOn(x.id, me.id) > 0);
    const row = (x) => `<div class="tsl-sr">
        <img src="${x.img ?? "icons/svg/mystery-man.svg"}" alt=""><span class="tsl-sr-name">${esc(x.name)}</span>
        ${canAct ? `<span class="tsl-sr-acts">
          ${pc ? `<button type="button" class="tsl-btn tsl-btn--tiny" data-remind-on="${x.id}" data-tooltip="${esc(_t("Spend it: they agree to a small or costly ask — no roll. Against their interests, the GM says what it would take."))}"><i class="fas fa-hand-holding-heart"></i> ${_t("Remind them")}</button>` : ""}
          <button type="button" class="tsl-btn tsl-btn--tiny" data-pull-on="${x.id}" data-mode="strike" data-tooltip="${esc(_t("Burn it: +5 to your next attack, check or save against them."))}"><i class="fas fa-crosshairs"></i> ${_t("Strike +5")}</button>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-pull-on="${x.id}" data-mode="guard" data-tooltip="${esc(_t("Burn it: +5 AC until the start of your next turn."))}"><i class="fas fa-shield-halved"></i> ${_t("Guard +5 AC")}</button>
          ${pc ? `<button type="button" class="tsl-btn tsl-btn--tiny" data-invest="${x.id}" data-tooltip="${esc(_t("Invest it in your bond: +1 ● (a hostile one eases −1 ●)."))}"><i class="fas fa-link"></i> ${_t("Invest +1 ●")}</button>` : ""}
        </span>` : ""}
      </div>`;
    return `<section class="tsl-sec tsl-strings-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title"><i class="fas fa-masks-theater"></i> ${_t("Strings — here")}</span></div>
      ${heldHere.length ? heldHere.map(row).join("") : `<p class="tsl-note">${_t("Nothing on anyone on this map. A strong win against someone (5 over the DC, or a 20) gives you a String on them.")}</p>`}
      ${onMe.length ? `<p class="tsl-note tsl-sr-theirs"><i class="fas fa-triangle-exclamation"></i> ${_t("Something on you: {list}", { list: onMe.map(x => esc(x.name)).join(", ") })}</p>` : ""}
      ${heldAway.length ? `<p class="tsl-note">${_t("Also on: {list} — not on this map.", { list: heldAway.map(x => esc(x.name)).join(", ") })}</p>` : ""}
    </section>`;
  }

  /**
   * A player character: their maneuvers — what each one rolls for them, from
   * their own sheet (the better of its two skills, the other backing it) —
   * best first; emotions & scars; notes. No stats of the module's own: the
   * character sheet is the character.
   */
  _buildPcProfile(ctx) {
    const { notes, canEdit } = ctx;
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const name = esc(this._actor.name);
    const READ_COLOR = "#d9b46a";
    const sign = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
    const mine = TECHNIQUE_ORDER.map(id => {
      const t = TECHNIQUES[id];
      const skill = TSLTalk.bestSkill(this._actor, t.skills);
      const support = t.skills.find(k => k !== skill) ?? null;
      const backed = !!support && TSLTalk.proficient(this._actor, support);
      const lean = t.approach ? SocialArchetypeManager.leaningMod(this._actor, t.approach) : 0;
      return { t, skill, support, backed, lean, total: TSLTalk.skillMod(this._actor, skill) + (backed ? TSLTalk.profBonus(this._actor) : 0) + lean };
    }).sort((x, y) => y.total - x.total);
    const top = mine[0]?.total ?? 0;
    const rows = mine.map(m => {
      const ap = APPROACHES[m.t.approach];
      return `<div class="tsl-mine-row ${m.total >= top - 1 ? "tsl-mine-row--best" : ""}" style="--c:${ap?.color ?? m.t.color ?? READ_COLOR}"
        data-tooltip="${esc(`<b>${m.t.label}</b> — ${m.t.line}.<br>${[m.t.anyWay ? _t("Any way") : m.t.job === "gambit" ? TECH_JOBS.gambit.label : "", ap?.label ?? ""].filter(Boolean).join(" · ")}`)}">
        <span class="tsl-mine-name"><i class="fas ${ap?.icon ?? m.t.icon ?? "fa-eye"}"></i> ${esc(m.t.label)}</span>
        <span class="tsl-mine-skills">${esc(SKILL_LABELS[m.skill] ?? m.skill)}${m.support ? ` + ${esc(SKILL_LABELS[m.support] ?? m.support)}${m.backed ? ` <i class="fas fa-check" data-tooltip="${esc(_t("Trained — it backs the roll: +{n}", { n: TSLTalk.profBonus(this._actor) }))}"></i>` : ""}` : ""}${m.lean ? ` · <span class="tsl-mine-lean ${m.lean < 0 ? "neg" : ""}">${esc(m.lean > 0 ? _t("{approach} leaning", { approach: ap.label }) : _t("no {approach} leaning — foreign ground", { approach: ap.label }))} ${m.lean > 0 ? "+" : "−"}${Math.abs(m.lean)}</span>` : ""}</span>
        <span class="tsl-mine-bonus">${sign(m.total)}</span>
      </div>`;
    }).join("");
    return `
      ${this._leaningsSection(ctx)}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Your maneuvers")}</span></div>
        <p class="tsl-note">${_t("From {name}'s sheet and Leanings: each maneuver rolls the better of its two skills, the other backs it (+{n}, your proficiency) if {name} is trained in it, and the Leaning of its way adds its dots. Best first — play to your strengths, and let the party do the rest.", { name, n: TSLTalk.profBonus(this._actor) })}</p>
        <div class="tsl-mine">${rows}</div>
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

    return `
      ${natureSec}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("What the party knows")}</span></div>
        <div class="tsl-known-row">${knownChips}</div>
        ${learned ? `<div class="tsl-arch-grid tsl-cheat">${learned}</div>` : ""}
        <p class="tsl-note">${_t("Mark what comes out in the talk (here, or in their Talk tab). A Read answers one question at a time; the dice show the key and the wall. Knowledge of a person lasts.")}</p>
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

  /**
   * Every bond at once — who, what you are to each other, how deep, and the
   * Strings both ways (ticked when they're there) — without opening anything.
   * The GM changes the type, the dots and either String right in the row; a
   * player lowers their dots and sees the rest. "What it gives" opens the
   * type's powers, Invest / Pull, the caption and private notes. A bond can be
   * made with anyone: by name, by dragging an actor in, or from the map.
   */
  _buildBondsTab({ bonds, canEdit }) {
    const esc = foundry.utils.escapeHTML;
    const dis = canEdit ? "" : "disabled";
    const isGM = game.user.isGM;
    const me = this._actor;
    const typeOpts = (sel) => BOND_TYPES.map(t => `<option value="${t.id}" ${SocialArchetypeManager.getBondType(sel).id === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("");

    const rows = bonds.length ? bonds.map(b => {
      const type = SocialArchetypeManager.getBondType(b.type);
      const str  = Math.min(3, Math.abs(b.attitude ?? 0));
      const ap   = APPROACHES[SocialArchetypeManager.bondApproach(type.id)];
      const open = this._expandedBonds.has(b.id);
      // Only the GM sets the dots by hand; a player raises them by investing a String (lowering is theirs).
      const raiseLocked = (v) => !isGM && v > str;
      const strTrack = [0, 1, 2, 3].map(v => `<button type="button" class="tsl-str ${v === 0 ? "zero" : ""} ${v > 0 && v <= str ? "on" : ""} ${v === str ? "cur" : ""}"
          data-bond-id="${b.id}" data-strength="${v}" ${canEdit && !raiseLocked(v) ? "" : "disabled"} data-tooltip="${esc(raiseLocked(v) ? _t("Raise it by investing a String on them.") : v === 0 ? _t("Faded — no effect")
            : `${"●".repeat(v)} — ${_t("How deep it runs, 0–3 ●.")}`)}">${v === 0 ? "✕" : ""}</button>`).join("");
      // The type is the story's: the GM's to set. Everyone else sees it.
      const typeCtl = isGM
        ? `<select class="tsl-bond-type" data-bond-id="${b.id}" style="--c:${ap?.color ?? "#8a7d72"}" data-tooltip="${esc(type.hint)}">${typeOpts(b.type)}</select>`
        : `<span class="tsl-bond-type-tag" style="--c:${ap?.color ?? "#8a7d72"}" data-tooltip="${esc(type.hint)}"><i class="fas ${type.icon}"></i> ${esc(type.label)}</span>`;
      // The Strings, both ways: the GM puts them on and takes them off; a player can drop their own.
      const holdSwitch = (dir) => canEdit ? (dir === "mine" ? { holderId: me.id, targetId: b.targetActorId } : { holderId: b.targetActorId, targetId: me.id }) : null;
      const fresh = type.id === "stranger";
      const canInvest = b.stringCount > 0 && (fresh || (type.hostile ? str > 0 : str < 3));
      const details = `
        <div class="tsl-bond-body">
          <p class="tsl-note tsl-bond-hint"><i class="fas ${type.icon}"></i> ${esc(type.hint)}</p>
          ${this._bondPowersHTML(b, type, str, canEdit)}
          ${canEdit ? `<div class="tsl-bond-acts">
            <button type="button" class="tsl-btn tsl-pull" data-invest="${b.targetActorId}" ${canInvest ? "" : "disabled"}
              data-tooltip="${esc(type.hostile ? _t("MAKE PEACE — spend your String on them: the hostile bond eases −1 ●. Both of you see it.") : fresh ? _t("INVEST — spend your String on them: you choose what you become to each other, at ●. Both of you see it.") : _t("INVEST — spend your String on them: +1 ● in this bond. Both of you see it."))}">${type.hostile ? _t("Make peace") : _t("Invest +1 ●")}</button>
            <button type="button" class="tsl-btn tsl-pull" data-pull="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
              data-tooltip="${esc(_t("PULL — burn it: STRIKE (+5 to your next attack, check or save against them) or GUARD (+5 AC until the start of your next turn). It goes on your sheet and ends itself."))}">${_t("Pull +5")}</button>
          </div>` : ""}
          ${!open ? "" : `<div class="tsl-field-row">
            <label data-tooltip="${esc(_t("A few words on the line between you on the relationship map — both of you see it."))}">${_t("Caption")}</label>
            <input type="text" class="tsl-bond-label" data-bond-id="${b.id}" maxlength="60" value="${esc(b.label ?? "")}" placeholder="${esc(_t("e.g. sisters · a debt for a rescue"))}" ${dis}>
          </div>
          <input type="text" class="tsl-bond-notes" data-bond-id="${b.id}" value="${esc(b.notes ?? "")}" placeholder="${esc(_t("History, debts, secrets between you… (only you see this)"))}" ${dis}>`}
        </div>`;
      return `<div class="tsl-bond ${open ? "open" : ""}">
        <div class="tsl-bond-line">
          <img src="${b.targetImg}" alt="">
          <span class="tsl-bond-name">${esc(b.targetName)}</span>
          ${typeCtl}
          <span class="tsl-str-track">${strTrack}</span>
          ${canEdit ? `<button type="button" class="tsl-icon-btn tsl-bond-remove" data-bond-id="${b.id}" data-name="${esc(b.targetName)}" aria-label="${esc(_t("End this bond (on both sides)"))}" data-tooltip="${esc(_t("End this bond (on both sides)"))}"><i class="fas fa-trash"></i></button>` : ""}
        </div>
        <div class="tsl-bond-sub">
          ${this._holdChip("mine", b.stringCount, holdSwitch("mine"))}
          ${this._holdChip("theirs", b.theirCount, holdSwitch("theirs"))}
          <button type="button" class="tsl-bond-more" data-bond-toggle="${b.id}">${open ? _t("Hide notes") : _t("Caption & notes")} <i class="fas fa-chevron-${open ? "up" : "down"}"></i></button>
        </div>
        ${details}
      </div>`;
    }).join("") : `<p class="tsl-note tsl-empty">${_t("No bonds yet.")}</p>`;

    // A bond with anyone: by name, from the map, or an actor dragged in from the sidebar.
    const aimed = this._targeted();
    const picking = this._picking && this._pickMode === "bond";
    const listId = `tsl-bond-who-${me.id}`;
    const add = canEdit ? `<div class="tsl-bond-add">
        <span class="tsl-q">${_t("Add a bond")}</span>
        <div class="tsl-bond-add-row">
          <input type="text" class="tsl-bond-find" list="${listId}" placeholder="${esc(_t("A name…"))}" autocomplete="off">
          <datalist id="${listId}">${this._bondCandidates().map(a => `<option value="${esc(a.name)}"></option>`).join("")}</datalist>
          <button type="button" class="tsl-btn" data-bond-find data-tooltip="${esc(_t("Add a bond with whoever has this name"))}"><i class="fas fa-plus"></i></button>
          ${aimed && !TSLBondStore.find(me.id, aimed.id) ? `<button type="button" class="tsl-btn" data-bond-target="${aimed.id}"
            data-tooltip="${esc(_t("The token you've targeted on the map (T)"))}"><i class="fas fa-bullseye"></i> ${esc(aimed.name)}</button>` : ""}
          <button type="button" class="tsl-btn ${picking ? "picking" : ""}" data-bond-pick
            data-tooltip="${esc(_t("Click a token on the map to bond with it. Esc cancels."))}"><i class="fas fa-crosshairs"></i> ${picking ? _t("Click a token…") : _t("On the map")}</button>
        </div>
        <span class="tsl-note">${_t("…or drag an actor in from the sidebar.")}</span>
      </div>` : "";

    return `<section class="tsl-sec tsl-bonds-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Bonds")}</span></div>
      ${add}
      <div class="tsl-bonds">${rows}</div>
    </section>`;
  }

  /** Who this character could bond with: every actor this user can see, but themselves and those already bonded. */
  _bondCandidates() {
    const me = this._actor;
    return (game.actors?.contents ?? [...(game.actors ?? [])])
      .filter(a => a && a.id !== me.id && !TSLBondStore.find(me.id, a.id)
        && (game.user.isGM || (a.testUserPermission?.(game.user, "LIMITED") ?? true)))
      .sort((x, y) => (x.name ?? "").localeCompare(y.name ?? ""));
  }

  /** Make a bond with someone, or open the one there is. */
  async _bondWith(actor) {
    if (!actor || actor.id === this._actor.id) return;
    const had = TSLBondStore.find(this._actor.id, actor.id);
    const entry = had ?? await TSLBondStore.add(this._actor.id, actor.id);
    if (!entry) return;
    if (!had) ui.notifications.info(_t("Bond added: {a} → {b}", { a: this._actor.name, b: actor.name }));
    this._expandedBonds.add(entry.id);
    this.render(false);
  }

  /** Yes or no, in the module's dark dialog. */
  _confirm(title, text) {
    return new Promise(resolve => {
      new Dialog({
        title,
        content: `<div class="tsl-dlg"><p>${text}</p></div>`,
        buttons: {
          yes: { icon: '<i class="fas fa-check"></i>', label: _t("Yes"), callback: () => resolve(true) },
          no: { label: _t("No"), callback: () => resolve(false) },
        },
        default: "no",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
  }

  /**
   * What a bond's type gives, per ●: on which approach, with which skill, what
   * it forbids, its aura close by — then its ●● ability and its ●●●
   * signature (once per long rest). Shown locked until the bond is that deep.
   */
  _bondPowersHTML(b, type, str, canEdit) {
    if (type.id === "stranger") return "";
    const esc = foundry.utils.escapeHTML;
    const ap = APPROACHES[SocialArchetypeManager.bondApproach(type.id)];
    const n = Math.max(1, str);
    const skill = (k) => esc(SKILL_LABELS[k] ?? k);
    const gives = [
      ap ? _t("+{n} on {approach}", { n, approach: `<b>${esc(ap.label)}</b>` }) : null,
      type.hostile ? _t("−{n} on anything else: they won't hear you out", { n }) : null,
      type.edge ? _t("+{n} when {skill} rolls", { n, skill: `<b>${skill(type.edge)}</b>` }) : null,
      type.cost ? _t("−{n} when {skill} rolls", { n, skill: `<b>${skill(type.cost)}</b>` }) : null,
      type.guilt ? _t("Pressure on them leaves you Guilty") : null,
      type.guard ? (type.guard < 0 ? _t("their guard is down for you: DC −{n}", { n }) : _t("they're wary of you: DC +{n}", { n })) : null,
    ].filter(Boolean);
    const levers = TSLBondAuras.leversOf(type.id, n);
    const reach = TSLBondAuras.range();
    const aura = type.aura && levers && reach > 0 ? `<div class="tsl-bp-row" data-tooltip="${esc(_t("Within {reach} ft of each other, in a fight or not — it goes on your sheet by itself, and doubles at ●●●.", { reach }))}">
        <i class="fas fa-shield-heart"></i> ${_t("Close by:")} <b>${esc(type.aura.label)}</b> — ${esc(TSLBondAuras.describe(levers))}</div>` : "";
    const ab = SocialArchetypeManager.getBondAbility(type.id);
    const sig = SocialArchetypeManager.getBondSignature(type.id);
    const ability = ab ? `<div class="tsl-bp-box ${str >= 2 ? "" : "locked"}">
        <div class="tsl-bp-head"><span class="tsl-bp-dots">●●</span> <b>${esc(ab.label)}</b>${str >= 2 ? "" : ` <i>${_t("at ●●")}</i>`}</div>
        <div class="tsl-bp-text">${esc(ab.text)}</div></div>` : "";
    const ready = str >= 3 && !b.sigUsed;
    const signature = sig ? `<div class="tsl-bp-box tsl-bp-box--sig ${str >= 3 ? "" : "locked"} ${b.sigUsed ? "used" : ""}">
        <div class="tsl-bp-head"><span class="tsl-bp-dots">●●●</span> <b>${esc(sig.label)}</b> <i>${str >= 3 ? _t("once per long rest") : _t("at ●●●")}</i></div>
        <div class="tsl-bp-text">${esc(sig.text)}</div>
        ${str >= 3 && canEdit ? (ready
          ? `<button type="button" class="tsl-btn tsl-bp-use" data-sig-invoke="${b.id}"><i class="fas fa-star"></i> ${_t("Call on it")}</button>`
          : `<div class="tsl-bp-spent">${_t("Spent — ready again after a long rest.")}${game.user.isGM ? ` <button type="button" class="tsl-btn tsl-btn--tiny" data-sig-reset="${b.id}">${_t("Ready it")}</button>` : ""}</div>`) : ""}
      </div>` : "";
    return `<div class="tsl-bp">
      <div class="tsl-bp-gives"><span class="tsl-bp-label">${_t("Per ●, against them:")}</span> ${gives.join(" · ")}</div>
      ${aura}${ability}${signature}
    </div>`;
  }

  /** A signature that offers two: which one? */
  async _promptSigChoice(sig) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      const buttons = {};
      sig.fx.choose.forEach((c, i) => { buttons[`c${i}`] = { label: c.label, callback: () => resolve(i) }; });
      buttons.cancel = { label: _t("Not now"), callback: () => resolve(null) };
      new Dialog({
        title: sig.label,
        content: `<div class="tsl-dlg"><p>${esc(sig.text)}</p></div>`,
        buttons,
        default: "c0",
        close: () => resolve(null),
      }, tslDialogOptions()).render(true);
    });
  }

  // ── Talk ────────────────────────────────────────────────────────────────────

  _buildTalkTab(ctx) {
    // An NPC's own Talk tab: the GM's cheat sheet for playing them.
    if (!ctx.isPC) {
      if (!ctx.isGM) return `<p class="tsl-note tsl-empty">${_t("Talk from your own character's Chronicle.")}</p>`;
      const screen = `<p class="tsl-note tsl-gm-screen"><i class="fas fa-user-secret"></i> ${_t("<b>Your screen for playing {name}</b> — only the GM sees it. The players talk and roll from their own Chronicles; here you see how to play {name}, mark what the talk did to them, and use what they hold on the characters.", { name: foundry.utils.escapeHTML(this._actor.name) })}</p>`;
      return screen + this._askAsRow() + this._cheatSheet(this._actor);
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
    return `
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
      `<span data-tooltip="${esc(READ_QUESTIONS[q].label)}">${esc(READ_QUESTIONS[q].short.toLowerCase())}</span>`).join(", ")}. ${_t("Watch how they take your words — or read them.")}</div>`;
    const know = rows || more ? `<div class="tsl-know-wrap">${rows ? `<div class="tsl-know-head">${_t("What the party knows")}</div><div class="tsl-know">${rows}</div>` : ""}${more}</div>` : "";

    // The Strings between the speaker and them, either way — right under the name, ticked or not (Talk only).
    const sp = ctx.speaker;
    const sw = ctx.canEdit;
    const holds = sp ? `<span class="tsl-x-holds">${this._holdChip("mine", TSLStringStore.countOn(sp.id, npc.id), sw ? { holderId: sp.id, targetId: npc.id } : null)}${this._holdChip("theirs", TSLStringStore.countOn(npc.id, sp.id), sw ? { holderId: npc.id, targetId: sp.id } : null)}</span>` : "";

    // The word the speaker gave them (a Deal), until the GM marks how it ended.
    const word = !sp ? "" : TSLTalk.deals(npc).filter(d => d.byId === sp.id).map(d => `<div class="tsl-word" data-tooltip="${esc(_t("Keep it, and their String on you goes; break it, and yours on them burns. The GM marks it."))}">
        <i class="fas fa-handshake"></i> ${d.price ? _t("You gave them your word: {price}", { price: esc(TSLTalk.priceOf(npc).text) }) : _t("You gave them your word — on your terms.")}</div>`).join("");

    // …and the lie they believe, until it comes out.
    const lied = sp && TSLTalk.lies(npc).some(l => l.byId === sp.id) ? `<div class="tsl-word tsl-word--lie" data-tooltip="${esc(_t("Until it comes out — then your String on them burns, and they take one on you. The GM decides when."))}">
        <i class="fas fa-mask"></i> ${_t("They believe your lie.")}</div>` : "";

    // How they seem — the face they show, as a card (players, until it's seen through).
    const seems = !isGM && shown && !named && !(known.mask && mask)
      ? `<details class="tsl-x-card-open"><summary>${_t("How they seem")}</summary><p class="tsl-note">${_t("What they show the world — it may be a mask.")}</p>${this._archetypeCard(shown)}</details>` : "";
    return `<section class="tsl-sec tsl-x-panel">
      <div class="tsl-x-top">
        <img class="tsl-x-portrait" src="${npc.img ?? "icons/svg/mystery-man.svg"}" alt="">
        <div class="tsl-x-id"><span class="tsl-x-name">${esc(npc.name)}</span>${nature}${holds}</div>
        <span class="tsl-x-phase" data-tooltip="${esc(_t("Their DC: 10 + proficiency + the better of WIS/INT. A small ask is 4 easier, one against their interests 4 harder."))}">${_t("DC {dc}", { dc: TSLTalk.dcFor(npc).dc })}</span>
        ${pick}
      </div>
      ${know}
      ${word}
      ${lied}
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
  _emotionRow(actor, { label = _t("Feeling"), ...opts } = {}) {
    const tags = this._emotionTags(actor, opts);
    return tags ? `<div class="tsl-emos"><span class="tsl-row-label">${label}</span>${tags}</div>` : "";
  }

  /**
   * A String, one way, at a glance — ticked when it's there, a dash when it
   * isn't. `mine`: this character has something on them; `theirs`: they have
   * something on this character. `controls` — the GM's + / − beside it.
   */
  _holdChip(dir, n, toggle = null) {
    const esc = foundry.utils.escapeHTML;
    const mine = dir === "mine";
    const tip = mine
      ? (n ? _t("You have something on them. Spend it: they agree with no roll (Talk → Remind them), +5 after a miss, invest it in your bond, or Pull it in a fight.")
        : _t("Nothing on them yet. A strong win against them (5 over the DC, or a 20) gives you one; the GM can give you one from the talk."))
      : (n ? _t("They have something on you. It powers their moves — at your roll, in the talk, beyond the scene — or a Pull in a fight. Answer one with your own String: Quits.")
        : _t("They have nothing on you. A bad miss against them (5 under the DC, or a 1) — or a win that costs one — gives them one."));
    const icon = n ? (mine ? "fa-check" : "fa-triangle-exclamation") : "fa-minus";
    const inner = `<i class="fas ${icon}"></i> ${mine ? _t("String on them") : _t("String on you")}`;
    if (!toggle) return `<span class="tsl-hold-chip tsl-hold-chip--${dir} ${n ? "on" : ""}" data-tooltip="${esc(tip)}">${inner}</span>`;
    // One at a time, so a String is on or off: the chip itself is the switch.
    return `<button type="button" class="tsl-hold-chip tsl-hold-chip--${dir} tsl-hold-chip--btn ${n ? "on" : ""}" aria-pressed="${!!n}"
      data-hold-toggle data-holder="${toggle.holderId}" data-target="${toggle.targetId}" data-on="${n ? 0 : 1}"
      data-tooltip="${esc(`${tip}<br><i>${n ? _t("Click: take it off by hand.") : _t("Click: mark it by hand.")}</i>`)}">${inner}</button>`;
  }

  /** The tags themselves: each emotion (× to let it go) and, with `scars`, each scar (× for the GM: `scarX`). */
  _emotionTags(actor, { canClear = false, scars = false, scarX = false, effects = null } = {}) {
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
    const scarTags = sc.map(id => `<span class="tsl-scar" data-tooltip="${esc(`<b>${_t("Scar — {scar}", { scar: SCARS[id].label })}</b><br>${SCARS[id].text}`)}"><img src="icons/svg/blood.svg" alt=""> ${esc(SCARS[id].label)}${scarX
      ? `<button type="button" class="tsl-emo-x" data-scar-clear="${id}" aria-label="${esc(_t("Take the scar off"))}" data-tooltip="${esc(_t("Take the scar off — a story turn healed it"))}">×</button>` : ""}</span>`).join("");
    return tags + scarTags;
  }

  /** What the speaker is doing: asking, intimidating, lying or reading — from the maneuver picked, or else the button pressed. */
  _modeNow() {
    const t = TECHNIQUES[this._tTech];
    return !t ? this._tMode : t.job === "read" ? "read" : t.anyWay ? "lie" : t.approach === "pressure" ? "press" : "ask";
  }

  /**
   * The roll — only when the GM calls for it. The talk itself is played at
   * the table; this asks what happened in it: what you're doing (the four
   * social checks of D&D: asking, intimidating, lying, reading them), how your
   * words came at them, plainly or all in, what you asked for, who saw it, what
   * you played on, who backed you — and rolls with all of it, your odds on the
   * button.
   */
  _askPanel(src, npc, ctx) {
    const esc = foundry.utils.escapeHTML;
    const known = SocialArchetypeManager.getKnown(npc);
    if (this._tTech && !TECHNIQUES[this._tTech]) this._tTech = null;
    const strings = TSLStringStore.countOn(src.id, npc.id);
    const tie = TSLBondStore.find(src.id, npc.id) ? TSLBondStore.getStrength(src.id, npc.id) : 0;
    const READ_COLOR = "#d9b46a";
    const witnesses = this._witnessesNow();
    const cur = this._tTech ? TECHNIQUES[this._tTech] : null;
    const mode = this._modeNow();
    const ap = cur?.approach ?? this._tApproach ?? (mode === "press" ? "pressure" : null);
    // A lie isn't a way of coming at them: it's told in one.
    const lieWay = { pressure: _t("a threat you can't back up"), heart: _t("feelings you don't have"), reason: _t("proof that isn't, a deal you won't keep") };
    const lineOf = (t) => t.anyWay ? (lieWay[ap] ?? t.line) : t.line;
    const pct = (c) => `${Math.round(c.p * 100)}%`;
    // All in needs its own leverage — say what is missing, and how to get it.
    const lockOf = (id) => id === "blackmail" && !known.fear && !strings
      ? { text: _t("nothing to blackmail them with yet"), why: _t("Blackmail needs something on them: their <b>Fear</b> — the party learns it from a Read, or the GM marks it when it comes out in the talk — or a <b>String</b> on them (a strong win against them). Until then, threaten them plainly: a Demand.") }
      : id === "seduce" && !known.desire && tie < 2
      ? { text: _t("needs their Desire or a bond ●●"), why: _t("Seduce plays on what they want, or on what is between you: their <b>Desire</b> — from a Read, or the GM marks it when it comes out in the talk — or a bond of ●● or more. Until then, ask from the heart: an Appeal.") }
      : null;
    // A maneuver's two skills: the one that rolls in bold, a tick on the one that backs it.
    const skillsOf = (tech, pv) => tech.skills.map(k => k === pv.skill ? `<b>${esc(SKILL_LABELS[k] ?? k)}</b>`
      : `${esc(SKILL_LABELS[k] ?? k)}${pv.backed && k === pv.support ? ` <i class="fas fa-check" data-tooltip="${esc(_t("Trained — it backs the roll: +{n}", { n: TSLTalk.profBonus(this._actor) }))}"></i>` : ""}`).join(" + ");

    // What you're doing, now that the GM calls for a roll.
    const modeBtn = (id, icon, label, skill, what) => `<button type="button" class="tsl-mode-btn ${mode === id ? "on" : ""}" data-t-mode="${id}">
      <i class="fas ${icon}"></i><b>${label}</b><span><em>${esc(SKILL_LABELS[skill])}</em> — ${what}</span></button>`;
    const modes = `<div class="tsl-modes">
      ${modeBtn("ask", "fa-comments", _t("I persuade"), "per", _t("I've said what I want: will they do it?"))}
      ${modeBtn("press", "fa-hand-fist", _t("I intimidate"), "itm", _t("a threat, a challenge, shame: will they give in?"))}
      ${modeBtn("lie", "fa-mask", _t("I lie"), "dec", _t("what I said isn't true: will they believe it?"))}
      ${modeBtn("read", "fa-eye", _t("I read them"), "ins", _t("what the talk doesn't show: what they hide, whether it's true"))}
    </div>`;

    // How your words came at them: the ways that fit what you're doing — and how this person is known to take each.
    const ways = { ask: ["heart", "reason"], press: ["pressure"], lie: APPROACH_ORDER }[mode] ?? null;
    let how = "";
    if (ways) {
      const lying = mode === "lie", pressing = mode === "press";
      const rels = {
        key: `<i class="fas fa-key"></i> ${_t("their key — advantage")}`,
        wall: `<i class="fas fa-door-closed"></i> ${_t("their wall — disadvantage")}`,
        plain: _t("a normal roll"),
        unknown: `<i class="fas fa-question"></i> ${_t("how they take it — not known yet")}`,
      };
      const aps = ways.map(apId => {
        const a = APPROACHES[apId], rel = TSLTalk.knownRelation(npc, apId);
        const tip = esc(lying ? `<b>${a.label}</b> — ${lieWay[apId]}.<br>${_t("Their key and wall count for the way you tell it.")}` : `<b>${a.label}</b> — ${a.gist} ${a.examples}.<br>${a.cost}`);
        const inner = `<span class="tsl-ap-head"><i class="fas ${a.icon}"></i> ${esc(a.label)}</span>
          <span class="tsl-ap-ex">${esc(lying ? lieWay[apId] : a.short)}</span>
          <span class="tsl-ap-rel">${rels[rel]}</span>`;
        // Intimidating has one way: nothing to pick, only how they're known to take it.
        return pressing ? `<div class="tsl-ap tsl-ap--${rel}" style="--c:${a.color}" data-tooltip="${tip}">${inner}</div>`
          : `<button type="button" class="tsl-ap tsl-ap-btn tsl-ap--${rel} ${ap === apId ? "on" : ""}" data-t-ap="${apId}" style="--c:${a.color}" data-tooltip="${tip}">${inner}</button>`;
      }).join("");
      // Plainly, or all in: the two maneuvers of that approach.
      const mv = (t, tag) => {
        const lock = lockOf(t.id);
        const pv = TSLTalk.preview(src, npc, { technique: t.id });
        return `<button type="button" class="tsl-tech-btn ${t.job === "gambit" ? "tsl-tech-btn--gambit" : ""} ${this._tTech === t.id ? "on" : ""} ${lock ? "locked" : ""}" data-tech="${t.id}" style="--c:${APPROACHES[ap].color}"
          data-tooltip="${esc(lock ? `<b>${t.label}</b> — ${lock.why}` : `<b>${t.label}</b> — ${t.line}.<br>${t.rule}<br><i>${_t("The better of its two skills rolls; the other backs it (+{n}, your proficiency) if you're trained in it.", { n: TSLTalk.profBonus(this._actor) })}</i>`)}">
          <span class="tsl-mv-top"><em>${tag}</em><b>${lock ? `<i class="fas fa-lock"></i> ` : ""}${esc(t.label)}</b></span>
          <span class="tsl-mv-skills">${lock ? esc(lock.text) : `${esc(t.line)} · ${skillsOf(t, pv)}`}</span></button>`;
      };
      const allIn = lying ? null : TECHNIQUES[techniqueFor(ap, "gambit")];
      how = `${pressing ? "" : `<div class="tsl-q">${lying ? _t("How do you tell the lie?") : _t("How did your words come at them?")}</div>`}
        <div class="tsl-aps" style="--n:${ways.length}">${aps}</div>
        ${allIn ? `<div class="tsl-q">${_t("Plainly — or all in?")}</div>
        <div class="tsl-mvq">${mv(TECHNIQUES[techniqueFor(ap, "ask")], _t("Plainly"))}${mv(allIn, _t("All in"))}</div>` : ""}`;
    }

    let picked = "";
    if (this._tTech) {
      const c = TSLTalk.chance(src, npc, { technique: this._tTech, approach: ap, size: this._tSize, helperId: this._tHelper, lever: this._tLever, witnesses });
      const pv = c.pv, tech = TECHNIQUES[pv.technique];
      const color = pv.approach ? APPROACHES[pv.approach].color : READ_COLOR;
      const sizes = !pv.sized ? "" : `<div class="tsl-q">${tech.anyWay ? _t("How big is the lie?") : pv.approach === "pressure" ? _t("What do you demand?") : _t("What are you asking for?")}</div>
        <div class="tsl-sizes">${ASK_ORDER.map(id => {
          const a = TSLTalk.sizeOf(tech.id, id);
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
            data-tooltip="${esc(_t("Before witnesses — a court, a crowd, their own people. A no shames you: you lose face — Insecure. And some natures bend before an audience while others harden: you'll see which in the result, or read it first."))}"><i class="fas fa-users"></i> ${_t("Before witnesses")}${aud}</button>
        </div>`;
      // Someone else at the table backed you in this talk: +2, and only you roll.
      const others = this._scenePcs(src.id);
      const help = !others.length ? "" : `<div class="tsl-q">${_t("Did anyone back you up?")}</div>
        <div class="tsl-helpers">
          <button type="button" class="tsl-helper ${pv.helperId ? "" : "on"}" data-help="">${_t("Nobody")}</button>
          ${others.map(a => `<button type="button" class="tsl-helper ${a.id === pv.helperId ? "on" : ""}" data-help="${a.id}">
            <img src="${a.img ?? "icons/svg/mystery-man.svg"}" alt=""> ${esc(a.name)}</button>`).join("")}
        </div>
        <p class="tsl-note tsl-help-note">${_t("Only if they really said or did something for you in this talk — backed your words, played along, drew the NPC's eye: +{n} to your roll. They don't roll, and nothing lands on them.", { n: HELP_BONUS })}</p>`;
      const levers = pv.job !== "ask" ? "" : ["desire", "fear"].filter(l => pv.leverOk[l]).map(l => {
        const what = l === "desire" ? _t("their Desire") : _t("their Fear");
        const tip = `${_t("Play on {what}: “{answer}” — +{n}, and it counts as leverage.", { what, answer: TSLTalk.answerFor(npc, l), n: LEVER_BONUS })}`;
        return `<button type="button" class="tsl-lever ${pv.lever === l ? "on" : ""}" data-lever="${l}" data-tooltip="${esc(tip)}">
          <i class="fas ${l === "desire" ? "fa-gem" : "fa-ghost"}"></i> ${l === "desire" ? _t("Their Desire") : _t("Their Fear")} +${LEVER_BONUS}</button>`;
      }).join("");
      const held = pv.strings ? `<span class="tsl-note tsl-t-strings" data-tooltip="${esc(_t("Burn it for +{n} after a miss — you'll be asked.", { n: STRING_SPEND_BONUS }))}">
        <i class="fas fa-masks-theater"></i> ${_t("You have something on them")}</span>`
        + (pv.sized ? `<button type="button" class="tsl-btn tsl-remind" data-remind data-tooltip="${esc(_t("Spend your String instead of the roll: a small or costly ask — they agree; one against their interests — the GM says what it would take."))}"><i class="fas fa-hand-holding-heart"></i> ${_t("Remind them — no roll")}</button>` : "") : "";
      const theirHold = pv.sized && TSLStringStore.countOn(npc.id, src.id) ? `<div class="tsl-note tsl-t-theirs"><i class="fas fa-masks-theater"></i> ${_t("They have something on you: they may spend it on this roll, after the dice.")}</div>` : "";
      const math = pv.parts.map(p => `<span class="tsl-math-part ${p.value < 0 ? "tsl-math-part--neg" : ""}">${p.value >= 0 ? "+" : "−"}${Math.abs(p.value)} ${esc(p.label)}</span>`).join("");
      const dcMods = pv.dcMods.map(m => ` ${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${esc(m.label)}`).join("");
      const rollMode = c.mode === "adv" ? _t("with advantage — their key") : c.mode === "dis" ? (pv.backed ? _t("with disadvantage, and {skill} doesn't help — their wall", { skill: SKILL_LABELS[pv.support] ?? pv.support }) : _t("with disadvantage — their wall")) : "";
      picked = `<div class="tsl-pick" style="--c:${color}">
        <div class="tsl-pick-title"><b>${esc(tech.label)}</b> — ${esc(lineOf(tech))} <span class="tsl-pick-skills">· ${skillsOf(tech, pv)}</span></div>
        <div class="tsl-pick-out tsl-pick-out--win"><span>${_t("If it works:")}</span> ${esc(tech.win)}.</div>
        <div class="tsl-pick-out tsl-pick-out--miss"><span>${_t("If not:")}</span> ${esc(tech.miss)}.</div>
        ${pv.sized ? `<div class="tsl-pick-out tsl-pick-out--stake"><span>${_t("Strings:")}</span> ${_t("a strong win (5 over, or a 20) — you take one on them; a bad miss (5 under, or a 1) — they take one on you.")}</div>` : ""}
        ${sizes}
        ${tech.job === "read" ? this._readQuestionsHTML(npc) : ""}
        ${witness}
        ${levers ? `<div class="tsl-q">${_t("Did your words play on what you know?")}</div><div class="tsl-pick-row">${levers}</div>` : ""}
        ${help}
        ${held ? `<div class="tsl-pick-row">${held}</div>` : ""}
        ${theirHold}
        ${pv.blocked ? `<div class="tsl-x-blocked">${esc(pv.blocked)}</div>` : ""}
        <button type="button" class="tsl-roll" data-t-roll ${pv.blocked || (tech.job === "read" && !this._readPicks(npc).length) ? "disabled" : ""} style="--c:${color}">
          <i class="fas fa-dice-d20"></i> ${_t("Roll — {technique}", { technique: esc(tech.label) })} <span class="tsl-roll-odds">${pct(c)}</span></button>
        <div class="tsl-x-math">
          <span class="tsl-math-die">d20</span>${math}
          <span class="tsl-math-vs" data-tooltip="${esc(_t("10 + their proficiency + the better of WIS / INT = {base}", { base: pv.dcBase }) + dcMods)}">${_t("vs DC {dc}", { dc: pv.dc })}</span>
          ${rollMode ? `<span class="tsl-math-mode ${c.mode === "dis" ? "tsl-math-mode--dis" : ""}">${rollMode}</span>` : ""}
        </div>
      </div>`;
    }

    return `<section class="tsl-sec tsl-x-speak">
      <p class="tsl-note tsl-how">${_t("<b>Talk in character</b> — the GM answers as {name}. Watch how they take what you say: that's how you read them. Roll only when the GM calls for it — usually once a conversation.", { name: esc(npc.name) })}</p>
      ${modes}
      ${how}
      ${picked}
      ${this._resultHTML()}
    </section>`;
  }

  /** The questions picked for a Read, still open about them (the first is answered on a hit, the second on a strong one). */
  _readPicks(npc) {
    const open = TSLTalk.openQuestions(npc);
    return (this._tQuestions ?? []).filter(q => open.includes(q)).slice(0, 2);
  }

  /** "What do you look for?" — the Read's questions, chosen before the roll and played as you watch them. */
  _readQuestionsHTML(npc) {
    const esc = foundry.utils.escapeHTML;
    const picks = this._readPicks(npc);
    const chips = TSLTalk.openQuestions(npc).map(q => {
      const i = picks.indexOf(q);
      return `<button type="button" class="tsl-rq ${i >= 0 ? "on" : ""}" data-read-q="${q}" aria-pressed="${i >= 0}">${i >= 0 ? `<b>${i + 1}</b>` : ""}${esc(READ_QUESTIONS[q].label)}</button>`;
    }).join("");
    return `<div class="tsl-q">${_t("What do you look for?")}</div>
      <div class="tsl-rqs">${chips || `<span class="tsl-note">${_t("They have nothing left to hide from you.")}</span>`}</div>
      <p class="tsl-note">${_t("Pick it now and play it — say what you watch for. A hit answers the first; a strong hit, the second too. The GM tells it in the scene.")}</p>`;
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
    const priced = r.grade === "success" && TSLTalk.hasPrice(r.technique);
    if (priced) bits.push(r.paid ? _t("you paid their price") : _t("you walked away from their price"));
    if (tech?.job === "read" && r.questions?.length) bits.push(_t("learned: {what}", { what: r.questions.map(q => READ_QUESTIONS[q]?.short).join(", ") }));
    const next = tech?.job === "read"
      ? (hit ? _t("The party knows more now — see “What the party knows” above.") : _t("They noticed. Keep talking — how they take what you say shows them too."))
      : tech?.anyWay ? (hit ? _t("They believe it — for now. If it ever comes out, they hold a String on you.") : _t("Caught — and it left a mark (see the chat card). They won't listen to you again this scene."))
      : hit ? (priced && !r.paid ? _t("You walked away from the deal — they keep what you asked for.")
        : r.technique === "bargain" ? _t("They'll do it — and your word is given. Keep it, and their String on you goes; break it, and yours on them burns.")
        : _t("They gave it. What it cost — in the chat card."))
      : _t("They refused — and it left a mark (see the chat card). Play it out. Ask again only with something new: another way in, a lever, what the talk has left on them.");
    const cls = hit ? (r.grade === "strong" ? "crit" : "success") : r.grade === "botch" ? "botch" : "failure";
    return `<div class="tsl-result tsl-result--${cls}">
      <span class="tsl-result-total">${r.total}</span>
      <span class="tsl-result-vs">${_t("vs {dc}", { dc: r.dc })}</span>
      <span class="tsl-result-label">${esc(`${tech ? `${tech.label}: ` : ""}${TSLTalk.gradeLabel(r.technique, r.grade)}`)}</span>
      ${bits.length ? `<span class="tsl-result-bits">${esc(bits.join(" · "))}</span>` : ""}
      <span class="tsl-next">${esc(next)}</span>
      ${r.theirHold ? `<span class="tsl-next tsl-t-theirs"><i class="fas fa-masks-theater"></i> ${esc(_t("They had something on you: if they spent it on this roll, the chat card has the final word."))}</span>` : ""}
      <button type="button" class="tsl-result-x" data-t-clear-result aria-label="${esc(_t("Dismiss"))}">×</button>
    </div>`;
  }

  /**
   * An NPC's own Talk tab — the GM's screen for a live conversation: how to
   * play them (how they take each approach, their price, their no), what the
   * talk has revealed and left on them (marked here, no roll), the lies they
   * believe, the Strings they hold.
   */
  _cheatSheet(npc) {
    const esc = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const shown = SocialArchetypeManager.getShown(npc), mask = SocialArchetypeManager.getMask(npc);
    const stance = SocialArchetypeManager.getStance(npc);
    const lies = TSLTalk.lies(npc);
    const deals = TSLTalk.deals(npc);
    // What they're after in this talk, and where it stops — the two things to keep in mind while playing them.
    const notes = SocialArchetypeManager.getCharacterNotes(npc);
    const plan = [
      notes.intent ? `<span>${_t("Agenda")}</span><span>${esc(notes.intent)}</span>` : "",
      notes.points.line ? `<span>${_t("Their Line")}</span><span>${esc(notes.points.line)} <i>${_t("(an ask that crosses it is refused — no roll)")}</i></span>` : "",
    ].join("");
    // How they take each approach — what to act out, so the table can read them.
    const takes = !arch ? "" : APPROACH_ORDER.map(id => {
      const a = APPROACHES[id];
      const rel = arch.key === id ? "key" : arch.wall === id ? "wall" : "plain";
      const tag = rel === "key" ? `<i class="fas fa-key"></i> ${_t("their key — advantage")}`
        : rel === "wall" ? `<i class="fas fa-door-closed"></i> ${_t("their wall — disadvantage")}` : _t("a normal roll");
      const text = rel === "key" ? esc(arch.keyText) : rel === "wall" ? esc(arch.wallText)
        : _t("Neither opens nor closes them — they weigh it like anyone would.");
      return `<div class="tsl-take tsl-take--${rel}" style="--c:${a.color}">
        <span class="tsl-take-ap"><span><i class="fas ${a.icon}"></i> ${esc(a.label)}</span><small>${tag}</small></span><span>${text}</span></div>`;
    }).join("");
    const face = mask
      ? _t("They show the <b>{mask}</b> — a mask. Until it falls, act out its face: it seems to open to {key} and close to {wall}. The dice still follow who they really are.", {
          mask: esc(mask.label), key: esc(APPROACHES[mask.key]?.label ?? ""), wall: esc(APPROACHES[mask.wall]?.label ?? "") })
      : shown ? _t("an open face — what they show is who they are") : _t("they show nothing");
    // What the talk did — marked as it happens: what came out, what the words left on them.
    const known = SocialArchetypeManager.getKnown(npc);
    const chips = READ_ORDER.filter(q => q !== "mask" || shown).map(q => `<button type="button" class="tsl-known ${known[q] ? "on" : ""}" data-known="${q}"
        data-tooltip="${esc(`${READ_QUESTIONS[q].label}<br>${known[q] ? _t("The party knows.") : _t("Hidden from the party.")} ${_t("Click to toggle.")}`)}">${esc(READ_QUESTIONS[q].short)}</button>`).join("");
    const feels = TSLEmotions.of(npc);
    const feel = (id, toward = null) => {
      const d = EMOTIONS[id], to = toward ? game.actors.get(toward) : null;
      const on = feels.some(f => f.id === id && (!toward || f.toward === toward));
      return `<button type="button" class="tsl-feel ${on ? "on" : ""}" data-gm-feel="${id}" ${toward ? `data-toward="${toward}"` : ""} style="--c:${d.color}"
        data-tooltip="${esc(`<b>${d.label}</b> — ${d.opensText}.<br>${_t("Let it go:")} ${d.clear}`)}"><img src="${d.img}" alt=""> ${esc(to ? `${d.label} → ${to.name}` : d.label)}</button>`;
    };
    const feelRow = EMOTION_ORDER.filter(id => id !== "guilty").map(id => feel(id)).join("")
      + this._scenePcs().map(p => feel("guilty", p.id)).join("");
    // …and what their words left on the characters here. Guilt is toward them.
    const feelPcs = this._scenePcs().map(p => {
      const carried = TSLEmotions.of(p);
      return `<div class="tsl-feel-pc"><span>${esc(p.name)}</span>${EMOTION_ORDER.map(id => {
        const d = EMOTIONS[id];
        return `<button type="button" class="tsl-feel tsl-feel--icon ${carried.some(f => f.id === id) ? "on" : ""}" data-gm-feel="${id}" data-on="${p.id}" ${id === "guilty" ? `data-toward="${npc.id}"` : ""} style="--c:${d.color}" aria-label="${esc(d.label)}"
          data-tooltip="${esc(`<b>${d.label}</b> — ${d.spoilsText}.<br>${_t("Let it go:")} ${d.clear}`)}"><img src="${d.img}" alt=""></button>`;
      }).join("")}</div>`;
    }).join("");
    return `
      ${this._personPanel(npc, { isGM: true })}
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Playing them")}</span><span class="tsl-gm-tag">GM</span></div>
        ${plan ? `<div class="tsl-arch-grid tsl-cheat tsl-plan">${plan}</div>` : ""}
        ${arch ? `<div class="tsl-takes">${takes}</div>
        <div class="tsl-arch-grid tsl-cheat">
          <span>${_t("Yes, but")}</span><span>${esc(arch.price.text)}${arch.price.string ? ` <i>${_t("(a String on the asker)")}</i>` : ""}</span>
          <span>${_t("On a no")}</span><span>${esc(arch.press)} <i>${_t("Every miss but a Read leaves the speaker <b>{emotion}</b>.", { emotion: esc(EMOTIONS[arch.hurts]?.label ?? _t("shaken")) })}</i></span>
          <span>${_t("After a no")}</span><span>${stance === "firm" ? _t("they end it — the door is closed for the scene") : stance === "yield" ? _t("they keep listening") : _t("your call")}</span>
          <span>${_t("Before witnesses")}</span><span>${tslAudienceText(arch.audience ?? 0)} — ${esc(arch.audienceWhy ?? "")}</span>
          <span>${_t("Mask")}</span><span>${face}</span>
        </div>` : `<p class="tsl-note">${_t("No nature set — pick one in Profile, and this becomes your cheat sheet.")}</p>`}
        <p class="tsl-note">${_t("Play them live: let each approach land the way it's written here — the table reads them from it. Call for a roll only when they're unwilling and it matters: usually once, when the ask is made; a Read when the talk can't show it; another ask only with something new. What they hold on the characters powers their moves — below.")}</p>
      </section>
      <section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("From the talk")}</span><span class="tsl-gm-tag">GM</span></div>
        <div class="tsl-q">${_t("It came out — the party knows:")}</div>
        <div class="tsl-known-row">${chips}</div>
        <div class="tsl-q">${_t("The words landed — they feel:")}</div>
        <div class="tsl-feels">${feelRow}</div>
        ${feelPcs ? `<div class="tsl-q">${_t("Their words landed on:")}</div><div class="tsl-feel-pcs">${feelPcs}</div>` : ""}
        <p class="tsl-note">${_t("No roll for what the talk itself does — mark it as it happens. An emotion gives +2 to the approach that plays on it until they act it out (Guilty — only to the one they wronged), and costs whoever feels it −2 somewhere. Click again to take it back.")}</p>
      </section>
      ${deals.length ? `<section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Word given")}</span><span class="tsl-gm-tag">GM</span></div>
        ${deals.map(d => { const name = esc(game.actors.get(d.byId)?.name ?? _t("someone"));
          return `<div class="tsl-lie"><span><i class="fas fa-handshake"></i> ${d.price ? _t("{name} gave their word: {price}", { name, price: esc(TSLTalk.priceOf(npc).text) }) : _t("{name} gave their word — on their own terms", { name })}</span>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-deal-kept="${d.id}" data-tooltip="${esc(_t("Word kept: their String goes — and if they were nothing to each other, they're Allies now."))}">${_t("Kept")}</button>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-deal-broken="${d.id}" data-tooltip="${esc(_t("Word broken: they keep their String, and the speaker's on them burns — strangers become Enemies; anything else is your call."))}">${_t("Broken")}</button></div>`; }).join("")}
      </section>` : ""}
      ${lies.length ? `<section class="tsl-sec">
        <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Lies they believe")}</span><span class="tsl-gm-tag">GM</span></div>
        ${lies.map(l => `<div class="tsl-lie"><span><i class="fas fa-mask"></i> ${_t("{name} lied to them", { name: esc(game.actors.get(l.byId)?.name ?? _t("someone")) })}</span>
          <button type="button" class="tsl-btn tsl-btn--tiny" data-lie-out="${l.id}" data-tooltip="${esc(_t("The truth comes out: the liar's String on them burns, and they take one on the liar — strangers become Enemies; anything else is your call."))}">${_t("Bring it out")}</button></div>`).join("")}
      </section>` : ""}
      ${this._movesSection(npc)}`;
  }

  /**
   * The GM's screen: their three moves — the triad's at the roll (you're asked
   * after the dice), the nature's two used from here on a character they hold
   * a String on — and who they hold one on, who they've shut out.
   */
  _movesSection(npc) {
    const esc = foundry.utils.escapeHTML;
    const { triad, nature } = TSLAbilities.of(npc);
    if (!triad && !nature.length) return "";
    const holders = TSLStringStore.getList(npc.id).map(e => game.actors.get(e.targetActorId)).filter(Boolean);
    const when = (w) => esc(_t(ABILITY_WHEN[w] ?? ""));
    const triadName = SOCIAL_TRIADS[triad?.triad]?.label ?? "";
    const card = (ab, use) => `<div class="tsl-abil">
        <div class="tsl-abil-head"><b>«${esc(ab.name)}»</b> <small>${use}</small></div>
        <div class="tsl-abil-text">${esc(ab.text)}</div>${ab.id && ab.outcomes ? `
        <div class="tsl-abil-use">${holders.length ? `<span>${_t("Pull it on:")}</span> ${holders.map(a => `<button type="button" class="tsl-btn tsl-btn--tiny" data-ab-use="${ab.id}" data-on="${a.id}">${esc(a.name)}</button>`).join("")}`
          : `<span class="tsl-abil-none">${_t("They hold no String on anyone yet.")}</span>`}</div>` : ""}
      </div>`;
    const silenced = (SocialArchetypeManager.getActorData(npc).silence ?? []).map(id => game.actors.get(id)).filter(Boolean);
    return `<section class="tsl-sec tsl-abil-sec">
      <div class="tsl-sec-head"><span class="tsl-sec-title">${_t("Their moves")}</span><span class="tsl-gm-tag">GM</span></div>
      <p class="tsl-note">${_t("Each costs the String they hold on that character. They take one when a character badly misses against them (5 under, or a 1) — and when a win costs it: Pressure, Blackmail, a Deal, a price that is a debt. One at a time.")}</p>
      ${holders.length ? `<div class="tsl-abil-holds"><i class="fas fa-masks-theater"></i> ${_t("They have something on: {list}", { list: holders.map(a => esc(a.name)).join(", ") })}</div>` : ""}
      <div class="tsl-abil-list">
        ${triad ? card(triad, `${when("roll")} · ${esc(triadName)} — ${esc(_t("you'll be asked after the dice"))}`) : ""}
        ${nature.map(ab => card(ab, when(ab.when))).join("")}
      </div>
      ${silenced.length ? `<div class="tsl-abil-silence">${silenced.map(a => `<span><i class="fas fa-volume-xmark"></i> ${_t("Shut out: {name}", { name: esc(a.name) })}</span>
        <button type="button" class="tsl-btn tsl-btn--tiny" data-silence-lift="${a.id}" data-tooltip="${esc(_t("They brought a truth: the silence lifts."))}">${_t("Lift")}</button>`).join("")}</div>` : ""}
    </section>`;
  }

  // ── Codex ───────────────────────────────────────────────────────────────────

  /**
   * The rules, in the order a table needs them: how a conversation goes, what
   * to press when the GM says roll, who the people are, emotions, Strings,
   * bonds — and the GM's page. Each page opens with one plain sentence; the
   * rest is short steps and tables, each saying where to find it on screen.
   */
  _buildCodexTab({ isGM }) {
    const cats = [
      { id: "start",   label: _t("How to play"), icon: "fa-play" },
      { id: "roll",    label: _t("The roll"),    icon: "fa-dice-d20" },
      { id: "people",  label: _t("People"),      icon: "fa-user-secret" },
      { id: "emo",     label: _t("Emotions"),    icon: "fa-heart-crack" },
      { id: "strings", label: _t("Strings"),     icon: "fa-masks-theater" },
      { id: "bonds",   label: _t("Bonds"),       icon: "fa-link" },
      ...(isGM ? [{ id: "gm", label: _t("GM"), icon: "fa-crown" }] : []),
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
    const sk = (t) => t.skills.map(k => esc(SKILL_LABELS[k] ?? k)).join(" + ");
    const lead = (html) => `<p class="tsl-cx-lead">${html}</p>`;
    const steps = (items) => `<ol class="tsl-cx-flow">${items.map(([icon, title, text]) => `<li><b><i class="fas ${icon}"></i> ${title}</b><span>${text}</span></li>`).join("")}</ol>`;
    const td = (c) => c && typeof c === "object" ? `<td${c.span ? ` colspan="${c.span}"` : ""}>${c.html}</td>` : `<td>${c}</td>`;
    const table = (head, rows, cls = "") => `<table class="tsl-cx-table ${cls}">${head ? `<tr>${head.map(x => `<th>${x}</th>`).join("")}</tr>` : ""}${
      rows.map(r => Array.isArray(r) ? `<tr>${r.map(td).join("")}</tr>` : `<tr class="${r.cls ?? ""}">${r.cells.map(td).join("")}</tr>`).join("")}</table>`;
    const where = (html) => `<p class="tsl-t-where tsl-cx-where"><i class="fas fa-hand-pointer"></i> ${html}</p>`;
    const li = (...items) => `<ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
    const apTag = (id) => { const a = APPROACHES[id]; return `<span class="tsl-cx-ap" style="--c:${a.color}"><i class="fas ${a.icon}"></i> ${esc(a.label)}</span>`; };
    const T = TECHNIQUES;
    const nm = (id) => `<b>${esc(T[id].label)}</b>`;
    switch (cat) {
      case "roll": {
        const btn = (icon, label, skill, text) => `<div class="tsl-cx-btn"><b><i class="fas ${icon}"></i> ${label}</b><em>${esc(SKILL_LABELS[skill] ?? skill)}</em><span>${text}</span></div>`;
        return `
        ${lead(_t("When the GM says “roll”, press what you did. Talk then asks only what matters for this roll — and shows your chance on the Roll button."))}
        <div class="tsl-cx-btns">
          ${btn("fa-comments", _t("I persuade"), "per", _t("You asked — will they do it? Say how: through the <b>Heart</b> (feelings, sympathy) or through <b>Reason</b> (facts, what's in it for them)."))}
          ${btn("fa-hand-fist", _t("I intimidate"), "itm", _t("A threat, a challenge, shame — will they give in?"))}
          ${btn("fa-mask", _t("I lie"), "dec", _t("What you said isn't true — will they believe it? Tell it any way."))}
          ${btn("fa-eye", _t("I read them"), "ins", _t("What the talk won't show: what they hide, whether it's true."))}
        </div>
        <h3>${_t("Plainly, or all in")}</h3>
        ${table([_t("You…"), _t("Plainly"), _t("All in")], [
          [`${_t("I persuade")} ${apTag("heart")}`, nm("appeal"), `${nm("seduce")}<small>${_t("needs their Desire or a bond ●●")}</small>`],
          [`${_t("I persuade")} ${apTag("reason")}`, nm("argument"), nm("bargain")],
          [`${_t("I intimidate")} ${apTag("pressure")}`, nm("demand"), `${nm("blackmail")}<small>${_t("needs their Fear or a String on them")}</small>`],
          [_t("I lie"), { span: 2, html: `${nm("deceive")} <small>${_t("told any way — their key and wall count for the way you tell it")}</small>` }],
          [_t("I read them"), { span: 2, html: nm("read") }],
        ], "tsl-cx-plain")}
        <p>${_t("<b>All in</b> works at any size, but leaves a mark: Seduce — a broken heart if it fails; a Deal — your word; Blackmail — they'll pay you back. Until you have what Seduce or Blackmail plays on, its button is locked and says what's missing.")}</p>
        <h3>${_t("Each maneuver")}</h3>
        ${table([_t("Maneuver"), _t("If it works"), _t("If not")], TECHNIQUE_ORDER.map(id => [`<b>${esc(T[id].label)}</b><small>${sk(T[id])}</small>`, esc(T[id].win), esc(T[id].miss)]), "tsl-cx-moves")}
        <p class="tsl-cx-small">${_t("The better of the two skills rolls, through the system's own check; the other adds your proficiency bonus if you're trained in it — but not into their wall.")}</p>
        <h3>${_t("How big is it?")}</h3>
        ${table([_t("Size"), "", _t("DC")], ASK_ORDER.map(id => [`<b>${esc(ASK_SIZES[id].label)}</b>`, esc(ASK_SIZES[id].hint), `<b>${ASK_SIZES[id].dc > 0 ? "+" : ASK_SIZES[id].dc < 0 ? "−" : "±"}${Math.abs(ASK_SIZES[id].dc)}</b>`]), "tsl-cx-sizes")}
        <p class="tsl-cx-small">${_t("Against them needs leverage: their Desire or Fear, a String on them, or a bond of ●● that runs the same way — or go all in. A lie is sized the same way: a small one −4, a bold one +4.")}</p>
        <h3>${_t("Who's watching?")}</h3>
        ${table(null, [
          [`<b><i class="fas fa-user-lock"></i> ${_t("In private")}</b>`, _t("Nothing more rides on it.")],
          [`<b><i class="fas fa-users"></i> ${_t("Before witnesses")}</b>`, _t("A no shames you: Insecure. Some natures bend before an audience (+2), most harden (−2) — you'll see which in the result. The GM can make a whole scene public.")],
        ], "tsl-cx-adds")}
        <h3>${_t("What adds to your roll")}</h3>
        ${table(null, [
          [`<b>${_t("skill")}</b>`, _t("the better of the maneuver's two")],
          [`<b>+${TSLTalk.profBonus(this._actor)}</b>`, _t("your proficiency, if you're trained in the other skill (not into their wall)")],
          [`<b>±●</b>`, _t("your Leanings: +1 a dot on that way, −1 on a way with none while you lean elsewhere (their skill bonus is already on your sheet)")],
          [`<b>+${LEVER_BONUS}</b>`, _t("their Desire or Fear, once the party knows it — if your words played on it")],
          [`<b>+${HELP_BONUS}</b>`, _t("a friend who really backed you in the talk (they don't roll)")],
          [`<b>±2</b>`, _t("emotions: one of theirs that your way plays on +2; one of yours that spoils it −2")],
          [`<b>±●</b>`, _t("your bond with them (see Bonds)")],
          [`<b>DC ±●</b>`, _t("their bond toward you: a friend's guard is down (DC −●), an enemy is wary (DC +●)")],
          [`<b>±1</b>`, _t("your scars")],
          [`<b><i class="fas fa-key"></i> / <i class="fas fa-door-closed"></i></b>`, _t("their key: advantage · their wall: disadvantage")],
        ], "tsl-cx-adds")}
        <h3>${_t("What they say")}</h3>
        ${table([_t("Result"), _t("When"), _t("What happens")], [
          { cls: "tsl-cx-r--strong", cells: [`<b>${_t("Strong")}</b>`, _t("5 over the DC, or a 20"), _t("It works, on your terms — no price. You take a String on them.")] },
          { cls: "tsl-cx-r--hit", cells: [`<b>${_t("Hit")}</b>`, _t("the DC or more"), _t("It works. An Appeal, an Argument or a Deal says “yes, but” — their price: pay it, or walk away.")] },
          { cls: "tsl-cx-r--miss", cells: [`<b>${_t("Miss")}</b>`, _t("under the DC"), _t("No — they push back their own way, and you take their emotion (not on a Read). A proud one, refused something big, ends the talk.")] },
          { cls: "tsl-cx-r--botch", cells: [`<b>${_t("Bad miss")}</b>`, _t("5 under, or a 1"), _t("As a miss — and they take a String on you.")] },
        ], "tsl-cx-res")}
        <p class="tsl-cx-small">${_t("After a miss you may burn your String on them for +{n}.", { n: STRING_SPEND_BONUS })}</p>
        <h3>${_t("What winning costs")}</h3>
        ${table(null, APPROACH_ORDER.map(id => [apTag(id), esc(APPROACHES[id].cost)]))}`;
      }

      case "people": {
        const triads = Object.values(SOCIAL_TRIADS);
        const apCell = (id) => apTag(id);
        return `
        ${lead(_t("Everyone the GM plays has a hidden <b>nature</b>. It decides which words open them, which close them, what they ask in return — and how they hit back."))}
        ${table(null, [
          [`<b class="tsl-cx-k"><i class="fas fa-key"></i> ${_t("Key")}</b>`, _t("the way that opens them — you roll with <b>advantage</b> (two d20, keep the better)")],
          [`<b class="tsl-cx-w"><i class="fas fa-door-closed"></i> ${_t("Wall")}</b>`, _t("the way they close against — <b>disadvantage</b>, and your second skill doesn't help")],
          [`<b>${_t("The third way")}</b>`, _t("a normal roll")],
        ])}
        <h3>${_t("How to figure them out")}</h3>
        ${steps([
          ["fa-ear-listen", _t("Watch the talk"), _t("The GM plays how they take each way of talking: warmth, a cold face, a sneer.")],
          ["fa-dice", _t("The dice tell"), _t("On a roll, the second die shows a key or a wall — and the party writes it down.")],
          ["fa-eye", _t("Read them"), _t("Pick what you look for before the roll, and play it. A hit answers the first, for the whole party; a strong hit, the second too.")],
        ])}
        <ol class="tsl-cx-qs">${[...READ_ORDER, ...READ_MOMENT].map(q => `<li>${esc(READ_QUESTIONS[q].label)}</li>`).join("")}</ol>
        <p>${_t("What the party learns, it keeps. Once it knows their <b>key and wall</b>, the nature is named and its whole card opens.")}</p>
        <h3>${_t("Masks")}</h3>
        <p>${_t("What you see first is the face they <b>show</b> — “seems: Caretaker”. It may be who they are, or a mask: a Schemer playing the Caretaker. Ask “Is that their true face?” — or learn their key and wall, and the mask falls.")}</p>
        <h3>${_t("Nine natures")}</h3>
        <p class="tsl-cx-small">${_t("Three ways people cope with others (Karen Horney): <b>against</b> them — Power; <b>toward</b> them — Emotion; <b>away</b> from them — Order. Within one, every nature has a different key and wall.")}</p>
        ${table([_t("Nature"), _t("Key"), _t("Wall"), _t("A miss leaves you")], triads.flatMap(t => [
          { cls: "tsl-cx-triad-row", cells: [{ span: 4, html: `<b style="color:${t.color}">${esc(t.label)}</b> — ${_t("moving {how}", { how: esc(t.horney) })}` }] },
          ...SOCIAL_ARCHETYPES.filter(x => x.triad === t.id).map(x => [`<b>${esc(x.label)}</b>`, apCell(x.key), apCell(x.wall), esc(EMOTIONS[x.hurts]?.label ?? "")]),
        ]), "tsl-cx-nat")}
        <p class="tsl-cx-small">${_t("Open one for the whole of it:")}</p>
        ${triads.map(t => SOCIAL_ARCHETYPES.filter(x => x.triad === t.id).map(x => `<details class="tsl-cx-more" style="--c:${t.color}">
          <summary><b>${esc(x.label)}</b> <span>${esc(x.description)}</span></summary>
          <p><span class="tsl-cx-k"><i class="fas fa-key"></i> ${esc(APPROACHES[x.key].label)}</span> ${esc(x.keyText)}</p>
          <p><span class="tsl-cx-w"><i class="fas fa-door-closed"></i> ${esc(APPROACHES[x.wall].label)}</span> ${esc(x.wallText)}</p>
          <p><span class="tsl-cx-p"><i class="fas fa-handshake"></i> ${_t("Price")}</span> ${esc(x.price.text)}${x.price.string ? ` <i>${_t("(a String on you)")}</i>` : ""}</p>
          <p><span class="tsl-cx-w"><i class="fas fa-heart-crack"></i> ${_t("On a no")}</span> ${esc(x.press)}</p>
          <p><span class="tsl-cx-p"><i class="fas fa-users"></i> ${_t("Before witnesses")}</span> ${tslAudienceText(x.audience ?? 0)} — ${esc(x.audienceWhy ?? "")}.</p>
          <p class="tsl-cx-small">${x.pressed === "firm" ? _t("After a no, they end it") : _t("After a no, they keep listening")} — ${esc(x.pressedWhy)}. ${esc(x.psych)}</p>
        </details>`).join("")).join("")}`;
      }

      case "emo": return `
        ${lead(_t("Five emotions, as in Thirsty Sword Lesbians — on anyone. Each one costs the one who feels it −2, and gives +2 to whoever plays on it — until it's let go."))}
        ${table([_t("Emotion"), _t("On whoever feels it"), _t("For whoever plays on it"), _t("Let it go")], EMOTION_ORDER.map(id => {
          const d = EMOTIONS[id];
          return [`<span class="tsl-cx-emo" style="--c:${d.color}"><img src="${d.img}" alt=""> ${esc(d.label)}</span>`, esc(d.spoilsText), esc(d.opensText), esc(d.clear)];
        }), "tsl-cx-emos")}
        <p class="tsl-cx-small">${_t("A friend's comfort lets any of them go, too.")}</p>
        <h3>${_t("Where they come from")}</h3>
        ${li(_t("<b>The talk</b> — your words land: a threat, a reproach, a truth with no way out. The GM marks it, no roll."),
             _t("<b>A miss</b> — anything but a Read: they hit back with their nature's emotion."),
             _t("<b>A no before witnesses</b> — you lose face: Insecure."),
             _t("<b>All in</b> — Blackmail leaves them Frightened; a broken heart leaves you Hopeless; a lie brought out leaves them Angry."),
             _t("<b>An NPC's move</b> — refuse it, and it may leave their emotion on you."))}
        <h3>${_t("Scars")}</h3>
        <p>${_t("Take an emotion you already carry, and it leaves a <b>scar</b> instead — for good, one of each.")}</p>
        ${table([_t("Scar"), _t("From"), _t("For good")], Object.values(SCARS).map(s => [`<b>${esc(s.label)}</b>`, esc(EMOTIONS[s.from].label), esc(s.text)]))}
        ${where(_t("<b>Where:</b> the first tab of the Chronicle, Profile — what weighs on them now, and every emotion, scar and condition as a switch (the GM on anyone, a player on their own character). On the other tabs, a strip at the top: × takes one off, Change opens the switches."))}`;

      case "strings": return `
        ${lead(_t("A <b>String</b> is something you have on someone — a debt, a secret, a weakness seen. <b>One at a time each way</b>: you have something on them, or you don't."))}
        <h3>${_t("How Strings move")}</h3>
        ${table(null, [
          { cls: "tsl-cx-r--strong", cells: [`<b><i class="fas fa-check"></i> ${_t("You take one on them")}</b>`, _t("a strong win — 5 over the DC, or a 20 — on an ask, an all-in or a lie; or the GM hands you one from the talk: a confession, a secret, a favour owed")] },
          { cls: "tsl-cx-r--botch", cells: [`<b><i class="fas fa-triangle-exclamation"></i> ${_t("They take one on you")}</b>`, _t("a bad miss — 5 under, or a 1; or a win that costs one: Pressure and Blackmail (they'll pay you back), a Deal (your word, until you keep it), a price that is a debt")] },
          [`<b><i class="fas fa-minus"></i> ${_t("Nothing moves")}</b>`, _t("a plain win or a plain miss; a Read; a roll on which a String was spent")],
        ], "tsl-cx-res")}
        <h3>${_t("Spending yours")}</h3>
        ${table(null, [
          [`<b>${_t("Remind them")}</b>`, _t("they agree — no roll (Talk → Remind them). Against their interests, the GM says what it would take.")],
          [`<b>+${STRING_SPEND_BONUS}</b>`, _t("after a miss against them")],
          [`<b>${_t("Invest")}</b>`, _t("+1 ● in your bond (Bonds); a hostile one eases −1 ● instead")],
          [`<b>${_t("Pull")}</b>`, _t("in a fight: +5 to your next attack, check or save against them — or +5 AC until the start of your next turn")],
          [`<b>${_t("Quits")}</b>`, _t("when they pull theirs on you, answer with yours: both burn, nothing happens")],
          [`<b>${_t("Leverage")}</b>`, _t("holding one lets you ask against their interests, or blackmail them")],
        ])}
        <h3>${_t("Theirs on you: their moves")}</h3>
        ${li(_t("<b>At your roll</b> — Power strikes back (−5 after the dice); Emotion makes you feel it (you win, and carry their emotion); Order sets the terms (you win, and pay their price)."),
             _t("<b>In the talk, or beyond the scene</b> — two moves of their nature's own. A chat card asks for your answer: give in (and take Inspiration), or refuse and pay for it."),
             _t("<b>In a fight</b> — any of them can Pull theirs against you."))}
        ${where(_t("<b>Where:</b> the Profile lists who here you have something on, with what to do with it now; Talk shows it under the name of whoever you face; Bonds shows both ways, for everyone."))}`;

      case "bonds": return `
        ${lead(_t("A bond is <b>who you are to each other</b> — its type — and <b>how deep it runs</b>: ●, ●● or ●●●. Both of you see the same bond. A roll never changes it."))}
        <h3>${_t("How it changes")}</h3>
        ${li(_t("<b>The type</b> — the GM sets it; or you do, when you invest a String in a new bond."),
             _t("<b>The dots</b> — +1 ● for each String you invest; the GM moves them when the story does; lowering them is up to you."),
             _t("<b>A Rival or an Enemy</b> — a String invested makes peace: −1 ●."))}
        <h3>${_t("What it gives — per ●, against that person")}</h3>
        ${li(_t("+1 on the way the bond runs: Heart for love and family, Pressure for rivals and enemies, Reason for allies, oaths and trust."),
             _t("+1 when its skill rolls (a Friend: Persuasion; Family: Insight); −1 when the skill it forbids rolls — you can't frighten a lover, or fool your teacher."),
             _t("A Rival or an Enemy won't hear you out: −1 on anything but Pressure."),
             _t("Press someone close to you — a friend, family, a lover — and you win, but feel Guilty toward them."),
             _t("Their bond toward you is their guard: someone close lets it down (DC −● when you ask them); an Enemy is wary (DC +●)."))}
        <h3>${_t("Close by")}</h3>
        <p>${_t("Standing close to each other — in a fight or not — the bond's aura goes on your sheet by itself: ±1 per bonus, ±2 at ●●●; several bonds add up to ±2 at most. Step apart, or leave the map, and it comes off.")}</p>
        <p>${_t("On the map it shows at once: when your character comes within that reach, their token wears the bond — its type, ●, a <b>tick</b> if you have a String on them, a <b>!</b> if they have one on you — and the panel in the bottom-left corner, above the players, lists everyone in reach with what the bond gives right now. Click a name there to open your bonds.")}</p>
        <h3>${_t("●● and ●●●")}</h3>
        <p>${_t("At ●● the type's own ability opens. At ●●● — its signature, once per long rest (Bonds → Call on it, right in its row).")}</p>
        ${table([_t("Bond"), _t("Per ●"), "●●", _t("●●● — once per long rest")], BOND_TYPES.filter(t => t.id !== "stranger").map(t => {
          const tap = APPROACHES[SocialArchetypeManager.bondApproach(t.id)];
          const per = [tap ? `+ ${esc(tap.label)}` : "", t.edge ? `+ ${esc(SKILL_LABELS[t.edge])}` : "", t.cost ? `− ${esc(SKILL_LABELS[t.cost])}` : "", t.hostile ? esc(_t("− the rest")) : ""].filter(Boolean).join(", ");
          return [`<b>${esc(t.label)}</b>`, per, esc(SocialArchetypeManager.getBondAbility(t.id)?.label ?? ""), esc(SocialArchetypeManager.getBondSignature(t.id)?.label ?? "")];
        }), "tsl-cx-bonds")}
        ${where(_t("<b>Where:</b> the Bonds tab — everyone you're bonded with: the type, the dots, the Strings both ways and what the bond gives, all in sight."))}`;

      case "gm": return `
        ${lead(_t("You play the people; the module remembers them and counts the few rolls."))}
        <h3>${_t("Where to do what")}</h3>
        ${table(null, [
          [`<b>${_t("Emotions and scars")}</b>`, _t("on anyone: the first tab of their Chronicle — every emotion, scar and condition is a switch there; players do the same on their own character")],
          [`<b>${_t("Bonds and Strings")}</b>`, _t("the Bonds tab: the type, the dots and the Strings both ways, right in the row — a String is a switch, click it; add anyone by name, or drag an actor in")],
          [`<b>${_t("What came out")}</b>`, _t("the NPC's Talk tab or Profile: click a fact to mark it known")],
          [`<b>${_t("How to play them")}</b>`, _t("the NPC's Talk tab: how they take each way, their price, their no, the mask to act out")],
          [`<b>${_t("Moves, words, lies")}</b>`, _t("the NPC's Talk tab: pull a String, mark a word kept or broken, bring a lie out")],
          [`<b>${_t("A public scene")}</b>`, _t("the Social Scene's header: every ask there starts before witnesses")],
        ], "tsl-cx-adds")}
        <h3>${_t("Running a conversation")}</h3>
        ${li(_t("<b>Play them live.</b> Let each way of talking land as their Talk tab says — the table reads them from it."),
             _t("<b>Mark what the talk does</b> — what comes out, what the words leave on them. No roll."),
             _t("<b>Roll rarely</b> — when they're unwilling and it matters: usually once; a Read when the talk can't show it; two or three at most."),
             _t("<b>Hold them to their words.</b> An Appeal that's really a threat is a Demand — say so before the roll."),
             _t("<b>Size the ask</b> by what it costs them, not by how tough they are."),
             _t("<b>Yes, but</b> — their nature names the price; the player decides whether to pay."),
             _t("<b>No</b> — they push back their own way. Don't let the same ask be rolled again without something new."),
             _t("<b>Their Line</b> is real: an ask that crosses it is refused, no roll."),
             _t("<b>Reward the heart:</b> when an NPC opens up to someone, give that character a String on them (Bonds → +)."))}
        <h3>${_t("The court")}</h3>
        ${li(_t("<b>Give them a face</b> — Profile → Mask: their own nature, another one (a mask), or nothing."),
             _t("<b>Say who's watching</b> — a hall, a feast, their own people. A Tyrant never bends where their people can see; an Idol performs for an audience."),
             _t("<b>Every favour is a debt.</b> Let NPCs collect Strings, and call them in when it hurts most."))}
        <h3>${_t("Content")}</h3>
        <p>${_t("Some maneuvers model real manipulation — blackmail, guilt, coldness, seduction, lies. Agree on limits with your table before you play them, and keep them on NPCs unless everyone wants otherwise.")}</p>`;

      default: return `
        <p class="tsl-cx-motto">${_t("Every word is a move. Every favour is a debt. Everyone wears a mask — and someone is always watching.")}</p>
        ${lead(_t("You want something from someone who doesn't want to give it. <b>Talk to them in character</b> — the module keeps who they are and what the talk did, and you roll only when the GM says so."))}
        ${steps([
          ["fa-comments", _t("Talk"), _t("Speak as your character. The GM answers as them — and plays who they really are: some words open them, others close them.")],
          ["fa-pen-nib", _t("The GM marks what the talk did"), _t("What came out — what they want, what they fear, what they'd ask in return — and the emotion your words left on them. No roll.")],
          ["fa-dice-d20", _t("Roll when the GM says"), _t("Usually once a conversation. In Talk, press what you did: <b>I persuade</b>, <b>I intimidate</b>, <b>I lie</b> or <b>I read them</b>.")],
          ["fa-scale-balanced", _t("Take the answer"), _t("Yes; yes, but — at their price; or no — and their emotion on you. A big win or a bad miss also moves a String.")],
          ["fa-link", _t("It stays"), _t("What you learned, the emotions, Strings and bonds go on into the next scene — and into a fight.")],
        ])}
        ${where(_t("<b>Where:</b> right-click your token → {icon} → the Chronicle. In <b>Talk</b>, target the one you talk to: hover their token and press <b>T</b>.", { icon: `<i class="fas fa-address-book"></i>` }))}
        <h3>${_t("An example")}</h3>
        <p class="tsl-cx-ex">${_t("Captain Roell won't open the gate. Lyra talks to him. She pushes — “Open it, or answer to the Duke” — and he goes cold: the GM is playing his wall. She changes tack: “You swore to protect these people. They're outside your gate.” He looks away; the GM marks him Guilty toward Lyra. “Be who your soldiers believe you are.” — “Roll.” One roll: an Appeal — Heart is his key, so advantage — and +2 for the guilt. “Yes — but ask it as a favour. On your knee, before my people.” Lyra kneels. The gate opens — and Roell remembers who knelt.")}</p>
        <h3>${_t("Words you'll see")}</h3>
        <dl class="tsl-cx-terms">${[
          [_t("Nature"), _t("Who they are inside. It decides how your words land. Hidden — until the party figures them out.")],
          [_t("Key · Wall"), _t("The way of talking that opens them (you roll with advantage) — and the one that closes them (disadvantage).")],
          [_t("DC"), _t("How hard they are to move: 10 + their proficiency + the better of WIS and INT. Always shown.")],
          [_t("String"), _t("Something you have on someone: a debt, a secret, a weakness. One at a time each way.")],
          [_t("Leanings"), _t("Your archetype: dots in Power, Emotion and Order. Each is +1 to a skill on your sheet — Intimidation, Insight, Deception — and +1 on maneuvers of its way. On the Profile.")],
          [_t("Bond"), _t("Who you are to each other, and how deep it runs: ●, ●● or ●●●.")],
          [_t("Emotion · Scar"), _t("What a moment left on someone: −2 for them, +2 for whoever plays on it. The same one twice leaves a scar.")],
          [_t("Mask"), _t("A face someone shows that isn't their own.")],
        ].map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join("")}</dl>`;
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
    // What you're doing, now that the GM calls for a roll: the four social checks. Again — put it away.
    // Intimidating and reading have one way to go, so their form opens at once.
    on("[data-t-mode]", "click", (_e, n) => {
      const m = n.dataset.tMode;
      this._tMode = this._modeNow() === m ? null : m;
      this._tTech = this._tMode === "read" ? "read" : this._tMode === "press" ? "demand" : null;
      this._tApproach = null;
      this._tLever = null;
      this.render(false);
    });
    // How your words came at them — a lie stays a lie; an ask is plain at first, all in stays all in where there is one.
    on("[data-t-ap]", "click", (_e, n) => {
      const was = TECHNIQUES[this._tTech];
      this._tApproach = n.dataset.tAp;
      this._tTech = this._modeNow() === "lie" ? "deceive" : (was?.job === "gambit" && techniqueFor(this._tApproach, "gambit")) || techniqueFor(this._tApproach, "ask");
      this.render(false);
    });
    on("[data-tech]", "click", (_e, n) => {
      this._tTech = n.dataset.tech;
      this._tSkill = null;
      if (TECHNIQUES[this._tTech]?.job !== "ask") this._tLever = null;
      this.render(false);
    });
    // The GM marks what the talk left on them — no roll.
    on("[data-gm-feel]", "click", async (_e, n) => {
      if (!game.user.isGM) return;
      await TSLEmotions.mark(n.dataset.on ? game.actors.get(n.dataset.on) : this._actor, n.dataset.gmFeel, { toward: n.dataset.toward || null });
      this.render(false);
    });
    on("[data-size]", "click", (_e, n) => { this._tSize = n.dataset.size; this.render(false); });
    on("[data-wit]", "click", (_e, n) => { this._tWitnesses = n.dataset.wit === "1"; this.render(false); });
    on("[data-help]", "click", (_e, n) => { this._tHelper = n.dataset.help || null; this.render(false); });
    on("[data-lever]", "click", (_e, n) => { this._tLever = this._tLever === n.dataset.lever ? null : n.dataset.lever; this.render(false); });
    on("[data-t-roll]", "click", async (_e, n) => {
      const npc = game.actors.get(this._tTarget);
      if (!npc || !this._tTech) return;
      n.disabled = true;
      const theirHold = !game.user.isGM && TSLStringStore.countOn(npc.id, this._actor.id) > 0;
      const p = await TSLTalk.roll(this._actor, npc, { technique: this._tTech, approach: this._tApproach, size: this._tSize, skill: this._tSkill, helperId: this._tHelper, lever: this._tLever, witnesses: this._witnessesNow(), questions: this._readPicks(npc) });
      if (p) {
        this._tResult = { technique: p.technique, grade: p.grade, total: p.total, dc: p.dc, rel: p.rel, paid: p.paid,
          questions: p.questions, witnesses: p.witnesses, audience: p.audience, theirHold };
        this._tLever = null;
        this._tTech = null;
        this._tMode = null;
        this._tApproach = null;
      }
      this.render(false);
    });
    on("[data-remind]", "click", async () => {
      const npc = game.actors.get(this._tTarget);
      if (!npc || !this._tTech) return;
      if (await TSLStringStore.remind(this._actor, npc, { size: this._tSize, technique: this._tTech })) {
        this._tTech = null; this._tMode = null; this._tApproach = null; this._tLever = null;
      }
      this.render(false);
    });
    // The GM: an NPC pulls its String on a character — one of its nature's moves.
    on("[data-ab-use]", "click", async (_e, n) => {
      if (!game.user.isGM) return;
      await TSLAbilities.use(this._actor, game.actors.get(n.dataset.on), n.dataset.abUse);
    });
    on("[data-silence-lift]", "click", async (_e, n) => {
      if (game.user.isGM) await TSLAbilities.setSilence(this._actor, n.dataset.silenceLift, false);
    });
    on("[data-lie-out]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.exposeLie(this._actor, n.dataset.lieOut); });
    on("[data-deal-kept]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.settleDeal(this._actor, n.dataset.dealKept, true); });
    on("[data-deal-broken]", "click", (_e, n) => { if (game.user.isGM) TSLTalk.settleDeal(this._actor, n.dataset.dealBroken, false); });
    on("[data-emo-clear]", "click", async (_e, n) => {
      const actor = game.actors.get(n.dataset.emoClear);
      if (!actor || !(game.user.isGM || actor.isOwner)) return;
      const how = await this._promptLetGo(actor, n.dataset.emo);
      if (how) await TSLEmotions.clear(actor, n.dataset.emo, how);
      this.render(false);
    });
    on("[data-t-clear-result]", "click", () => { this._tResult = null; this.render(false); });
    // The Read's questions: click to pick (two at most, in order), again to drop.
    on("[data-read-q]", "click", (_e, n) => {
      const q = n.dataset.readQ;
      const cur = [...(this._tQuestions ?? [])];
      this._tQuestions = cur.includes(q) ? cur.filter(x => x !== q) : [...cur, q].slice(-2);
      this.render(false);
    });

    // ── What weighs on them: the GM's palette ──
    on("[data-state-open]", "click", () => { if (!TSLEmotions.canEdit(this._actor)) return; this._stateOpen = !this._stateOpen; this.render(false); });
    on("[data-state-cond]", "click", async (_e, n) => { await this._toggleState("cond", n.dataset.stateCond); this.render(false); });
    on("[data-cond-off]", "click", async (_e, n) => { await TSLConditions.toggle(this._actor, n.dataset.condOff, false); this.render(false); });
    on("[data-hold-toggle]", "click", async (_e, n) => {
      n.disabled = true;
      await TSLStringStore.set(n.dataset.holder, n.dataset.target, n.dataset.on === "1");
      this.render(false);
    });
    on("[data-state-emo]", "click", async (_e, n) => {
      if (!TSLEmotions.canEdit(this._actor)) return;
      const toward = el.querySelector(".tsl-state-toward")?.value || null;
      await this._toggleState("emo", n.dataset.stateEmo, toward);
      this.render(false);
    });
    on("[data-state-scar]", "click", async (_e, n) => {
      if (!TSLEmotions.canEdit(this._actor)) return;
      await this._toggleState("scar", n.dataset.stateScar);
      this.render(false);
    });
    on("[data-scar-clear]", "click", async (_e, n) => {
      if (!TSLEmotions.canEdit(this._actor)) return;
      const scar = SCARS[n.dataset.scarClear];
      if (!scar || !(await this._confirm(_t("Take the scar off"), _t("Take <b>{scar}</b> off {name}? A scar is for good — take it off only when the story healed it.", { scar: foundry.utils.escapeHTML(scar.label), name: foundry.utils.escapeHTML(this._actor.name) })))) return;
      await TSLEmotions.removeScar(this._actor, scar.id);
      this.render(false);
    });

    if (!canEdit) return;

    // ── Profile ──
    on("[data-lean]", "click", async (_e, n) => {
      if (!(await SocialArchetypeManager.setLeaning(this._actor, n.dataset.lean, Number(n.dataset.value))))
        ui.notifications.warn(_t("Only {n} dots to spread — lower another approach first.", { n: TRIAD_POINT_POOL }));
    });
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
    // ── Bonds ──
    on("[data-bond-target]", "click", (_e, n) => this._bondWith(game.actors.get(n.dataset.bondTarget)));
    on("[data-bond-pick]", "click", () => {
      if (this._picking) this._endPick(_t("Pick cancelled."));
      else this._startPick();
    });
    on(".tsl-bond-type", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { type: e.target.value }));
    on(".tsl-str", "click", (_e, n) => {
      const v = Number(n.dataset.strength);
      if (!game.user.isGM && v > (TSLBondStore.getList(this._actor.id).find(b => b.id === n.dataset.bondId)?.attitude ?? 0)) return;
      TSLBondStore.update(this._actor.id, n.dataset.bondId, { attitude: v });
    });
    // ●●● — the bond's signature, once per long rest (the GM applies it).
    on("[data-sig-invoke]", "click", async (_e, n) => {
      const bond = TSLBondStore.getList(this._actor.id).find(x => x.id === n.dataset.sigInvoke);
      const sig = bond ? SocialArchetypeManager.getBondSignature(bond.type) : null;
      if (!sig) return;
      const choice = sig.fx?.choose ? await this._promptSigChoice(sig) : 0;
      if (choice === null) return;
      await TSLGMActions.request("invokeSignature", { actorId: this._actor.id, bondId: bond.id, choice });
      this.render(false);
    });
    on("[data-sig-reset]", "click", async (_e, n) => {
      if (game.user.isGM) await TSLBondStore.update(this._actor.id, n.dataset.sigReset, { sigUsed: false });
    });
    // The Strings at hand (the first tab): remind them, or Pull it — no digging.
    on("[data-remind-on]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.remindOn);
      if (target) await TSLStringStore.remind(this._actor, target, { size: "costly" });
      this.render(false);
    });
    on("[data-pull-on]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.pullOn);
      if (target) await TSLStringStore.pull(this._actor, target, n.dataset.mode === "guard" ? "guard" : "strike");
      this.render(false);
    });
    on("[data-invest]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.invest);
      if (!target) return;
      const bond = TSLBondStore.find(this._actor.id, target.id);
      const fresh = !bond || SocialArchetypeManager.getBondType(bond.type).id === "stranger";
      const typeId = fresh ? await this._promptBondType(target) : null;
      if (fresh && !typeId) return;
      await TSLStringStore.invest(this._actor, target, typeId);
      this.render(false);
    });
    on(".tsl-bond-notes", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { notes: e.target.value.trim() }));
    on(".tsl-bond-label", "change", (e, n) => TSLBondStore.update(this._actor.id, n.dataset.bondId, { label: e.target.value.trim().slice(0, 60) }));
    on(".tsl-bond-remove", "click", async (_e, n) => {
      const esc = foundry.utils.escapeHTML;
      if (await this._confirm(_t("End this bond (on both sides)"), _t("End the bond between <b>{a}</b> and <b>{b}</b>? Its type, dots, caption and notes go — on both sides.", { a: esc(this._actor.name), b: esc(n.dataset.name ?? "") }))) {
        await TSLBondStore.remove(this._actor.id, n.dataset.bondId);
      }
    });
    // A bond with anyone: by name (Enter or +), or an actor dragged in from the sidebar.
    const findBond = () => {
      const input = el.querySelector(".tsl-bond-find");
      const name = input?.value?.trim().toLowerCase();
      if (!name) return;
      const actor = this._bondCandidates().find(a => a.name.toLowerCase() === name)
        ?? this._bondCandidates().find(a => a.name.toLowerCase().startsWith(name));
      if (!actor) { ui.notifications.warn(_t("Nobody by that name.")); return; }
      this._bondWith(actor);
    };
    on("[data-bond-find]", "click", () => findBond());
    on(".tsl-bond-find", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findBond(); } });
    on(".tsl-bonds-sec", "dragover", (e) => { e.preventDefault(); });
    on(".tsl-bonds-sec", "drop", async (e) => {
      e.preventDefault();
      let data = null;
      try { data = JSON.parse(e.dataTransfer?.getData("text/plain") || "null"); } catch { data = null; }
      if (data?.type !== "Actor") return;
      const dropped = data.uuid ? (globalThis.fromUuidSync?.(data.uuid) ?? null) : null;
      const actor = game.actors.get(dropped?.id ?? data.id ?? String(data.uuid ?? "").split(".").pop());
      if (!actor) { ui.notifications.warn(_t("Only an actor of this world can be bonded.")); return; }
      this._bondWith(actor);
    });
    on("[data-pull]", "click", async (_e, n) => {
      const target = game.actors.get(n.dataset.pull);
      if (!target) return;
      const mode = await this._promptPull(target);
      if (mode) await TSLStringStore.pull(this._actor, target, mode);
      this.render(false);
    });
  }

  /** A String invested where there's no bond yet: what do they become to each other? */
  async _promptBondType(target) {
    const esc = foundry.utils.escapeHTML;
    const types = BOND_TYPES.filter(t => t.id !== "stranger" && !t.hostile);
    return new Promise(resolve => {
      new Dialog({
        title: _t("{holder} and {target}", { holder: this._actor.name, target: target.name }),
        content: `<div class="tsl-dlg"><p>${_t("You invest your String on <b>{name}</b>: what do you become to each other?", { name: esc(target.name) })}</p>
          <select name="tsl-bond-type">${types.map(t => `<option value="${t.id}">${esc(t.label)}${t.hint ? ` — ${esc(t.hint)}` : ""}</option>`).join("")}</select></div>`,
        buttons: {
          ok: { icon: '<i class="fas fa-link"></i>', label: _t("Invest +1 ●"), callback: (html) => resolve((html?.[0] ?? html)?.querySelector?.("select[name='tsl-bond-type']")?.value || null) },
          cancel: { label: _t("Keep it"), callback: () => resolve(null) },
        },
        default: "ok",
        close: () => resolve(null),
      }, tslDialogOptions({ width: 460 })).render(true);
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
          <li>${_t("<b>Guard</b> — +5 AC for a round: until the start of your next turn.")}</li></ul></div>`,
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

    // Caught on the window before the canvas sees it: picking someone must not
    // also select their token (and open whatever opens when a token is selected).
    this._onPickCanvas = (event) => {
      if (event.button !== 0 || !(event.target === board || board.contains?.(event.target))) return;
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
      event.stopImmediatePropagation();
      if (hit.document.hidden && !game.user.isGM) { ui.notifications.warn(_t("That token is hidden.")); return; }
      if (hit.actor.id === this._actor.id) { ui.notifications.warn(_t("That is {name} themselves.", { name: this._actor.name })); return; }
      const handler = this._pickHandler;
      this._endPick();
      if (handler) handler(hit.actor);
      else this._defaultBondPick(hit.actor);
    };
    this._onPickCancel = (event) => { if (event.key === "Escape") this._endPick(_t("Pick cancelled.")); };
    window.addEventListener("pointerdown", this._onPickCanvas, true);
    document.addEventListener("keydown", this._onPickCancel);
  }

  _defaultBondPick(targetActor) { this._bondWith(targetActor); }

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
    if (board) board.style.cursor = "";
    if (this._onPickCanvas) window.removeEventListener("pointerdown", this._onPickCanvas, true);
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
