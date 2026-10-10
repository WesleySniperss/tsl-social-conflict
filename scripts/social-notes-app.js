/**
 * tsl-social-conflict | social-notes-app.js
 *
 * The Social Chronicle — per-character dossier and relationship ledger.
 *
 *   Profile — (GM) the hidden archetype; NATURE for everyone (Leanings dots +
 *             When pressed); profiling points (Desire / Fear / Weakness / Mask
 *             / The Line); the GM's Agenda; free notes.
 *   Bonds   — relationships with other PCs/NPCs: type + strength (one shared
 *             bond, mirrored on both sides), the "Read as" guess, Strings (and
 *             Pull: +5 strike or guard, a real effect), the dossier.
 *             New bonds can be added from a candidate list or by clicking a
 *             visible, non-hidden token on the canvas.
 *   Fencing — the maneuver console (act, roll, see the result in place), this
 *             character's composure, states and the levers they hold, then the
 *             emotional layer (Willpower, Wounds, Boons, Scars).
 *   Codex   — the rules, generated from the data.
 *
 * Access: GM sees and edits everything; players open only actors they own.
 * What a player knows about others lives in their OWN chronicle's bonds.
 */

console.log("TSL | Loading social-notes-app.js...");

// ─── Static manager ───────────────────────────────────────────────────────────

class SocialFencingDialog {
  static _instances = new Map();

  static open(actor) {
    if (!actor) return;
    // Chronicle data lives on the WORLD actor. An unlinked token hands us its
    // synthetic actor (same id, token-local flags) — writing there would give
    // every token its own private bonds/strings. Normalize to the base actor
    // so all copies of a character share one chronicle.
    actor = game.actors.get(actor.id) ?? actor;
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("You can only open the Chronicle of characters you own. What you know about others is written in your own character's Bonds.");
      return;
    }
    if (SocialFencingDialog._instances.has(actor.id)) {
      SocialFencingDialog._instances.get(actor.id).bringToTop?.();
      return;
    }
    const app = new SocialFencingApp(actor);
    SocialFencingDialog._instances.set(actor.id, app);
    app.render(true);
  }
}

const SocialNotesDialog = SocialFencingDialog;

// ─── Application ──────────────────────────────────────────────────────────────

// ApplicationV1 base — still shipped (deprecated) in v13/v14. Reference it
// defensively so a build that moves V1 under foundry.appv1 still loads.
const _SocialAppBase = globalThis.Application ?? foundry?.appv1?.api?.Application;

class SocialFencingApp extends _SocialAppBase {
  constructor(actor, options = {}) {
    super(options);
    this._actor   = actor;
    this._tab     = "profile";
    this._picking = false;
    this._onPickCanvas = null;
    this._onPickCancel = null;
    this._expandedBonds = new Set(); // collapsed by default — lists get long
    // Fencing-tab maneuver console (this actor fences a chosen target)
    this._fenceTargetId   = null;
    this._fenceManeuverId = null;
    this._fenceLeverage   = null;
    this._fenceStringSpend = false;
    this._fenceRoll       = null;  // { name, icon, total, dc, outcome } for the overlay

    this._flagHook = Hooks.on("updateActor", (a) => {
      if (a.id === actor.id) this.render(true);
    });
    this._createEffHook = Hooks.on("createActiveEffect", (e) => {
      if (e.parent?.id === actor.id) this.render(true);
    });
    this._updateEffHook = Hooks.on("updateActiveEffect", (e) => {
      if (e.parent?.id === actor.id) this.render(true);
    });
    this._deleteEffHook = Hooks.on("deleteActiveEffect", (e) => {
      if (e.parent?.id === actor.id) this.render(true);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:          "tsl-social-fencing",
      title:       "Social Chronicle",
      template:    null,
      width:       500,
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
    const isGM    = game.user.isGM;
    const canEdit = isGM || this._actor.isOwner;
    const notes   = SocialArchetypeManager.getCharacterNotes(this._actor);
    const archetype = SocialArchetypeManager.getArchetype(this._actor);
    const encounter = SocialEncounterManager.getEncounter(this._actor);

    const activeConditions = Object.fromEntries(
      SOCIAL_CONDITION_ORDER.map(id => [id, !!SocialArchetypeManager.getActiveCondition(this._actor, id)])
    );
    // This character's lasting emotional Wounds — toggled in the Fencing tab.
    // Value is the TIER (0 = not carried, 1 Light · 2 Deep · 3 Breaking point).
    const activeWounds = (typeof TSLConditionEffects !== "undefined")
      ? Object.fromEntries(TSLConditionEffects.ORDER.map(id =>
          [id, TSLConditionEffects.getTier(this._actor, id)]))
      : {};
    // The four positive emotions (Boons) — GM-given, toggled in the Fencing tab.
    const activeBoons = (typeof TSLConditionEffects !== "undefined")
      ? Object.fromEntries((TSLConditionEffects.BOON_ORDER ?? []).map(id =>
          [id, TSLConditionEffects.getTier(this._actor, id)]))
      : {};
    // Willpower — the emotional-layer resource (pool = proficiency bonus).
    const willpower = (typeof TSLWillpower !== "undefined")
      ? { cur: TSLWillpower.get(this._actor), max: TSLWillpower.getMax(this._actor) }
      : null;
    // Permanent Scars this character carries (calcified Wounds).
    const activeScars = (typeof TSLConditionEffects !== "undefined")
      ? TSLConditionEffects.getScars(this._actor) : [];

    return {
      isGM, canEdit, notes, archetype, encounter, activeConditions, activeWounds,
      activeBoons, willpower, activeScars,
      bonds: this._buildBondData(),
      candidates: this._buildCandidates(),
    };
  }

  _buildBondData() {
    const actorId = this._actor.id;
    return TSLBondStore.getList(actorId).map(b => {
      const target = game.actors.get(b.targetActorId);
      const stringCount = TSLStringStore.getList(actorId)
        .filter(e => e.targetActorId === b.targetActorId).length;
      return {
        ...b,
        targetName: target?.name ?? "(missing actor)",
        targetImg:  target?.img ?? "icons/svg/mystery-man.svg",
        stringCount,
      };
    });
  }

  /**
   * Actors a new bond can point to:
   *   - visible, non-hidden tokens on the current scene
   *   - player characters
   *   - anyone already recorded in some chronicle (GM convenience)
   */
  _buildCandidates() {
    const bonded = new Set(TSLBondStore.getList(this._actor.id).map(b => b.targetActorId));
    bonded.add(this._actor.id);

    // Only people actually on the battlemap — never the whole actor directory.
    // (Players see visible tokens; the GM sees hidden ones too.) To relate to
    // someone off-scene, drop a token or use the canvas Pick button.
    const map = new Map();
    for (const t of (canvas.tokens?.placeables ?? [])) {
      if (!t.actor || bonded.has(t.actor.id) || map.has(t.actor.id)) continue;
      if (!game.user.isGM && (t.document.hidden || !t.visible)) continue;
      map.set(t.actor.id, t.actor);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── HTML ────────────────────────────────────────────────────────────────────

  _buildHTML(ctx) {
    const tabs = [
      { id: "profile", label: "Profile", icon: "fa-fingerprint" },
      { id: "bonds",   label: "Bonds",   icon: "fa-link" },
    ];
    const fencingOn = game.settings.get("tsl-social-conflict", "conflictMode") !== "tsl";
    // Fencing is now everyone's action menu: owner OR GM can maneuver from here
    if (fencingOn && (ctx.isGM || this._actor.isOwner)) tabs.push({ id: "fencing", label: "Fencing", icon: "fa-khanda" });
    tabs.push({ id: "codex", label: "Codex", icon: "fa-book-open" });
    if (!tabs.some(t => t.id === this._tab)) this._tab = "profile";

    const tabBtns = tabs.map(t => `
      <button class="tsl-chr-tab ${this._tab === t.id ? "active" : ""}" data-tab="${t.id}">
        <i class="fas ${t.icon}"></i> ${t.label}
      </button>`).join("");

    const body =
      this._tab === "bonds"   ? this._buildBondsTab(ctx)   :
      this._tab === "fencing" ? this._buildFencingTab(ctx) :
      this._tab === "codex"   ? this._buildCodexTab(ctx)   :
                                this._buildProfileTab(ctx);

    return `
      <div class="tsl-notes-root tsl-chr-root">
        <nav class="tsl-chr-tabs">${tabBtns}</nav>
        ${body}
        ${ctx.canEdit ? "" : `<div class="tsl-notes-footer tsl-notes-footer--readonly">Read only</div>`}
      </div>`;
  }

  // ── Profile tab ─────────────────────────────────────────────────────────────

  _buildProfileTab({ notes, archetype, canEdit, isGM }) {
    const esc      = foundry.utils.escapeHTML;
    const disabled = canEdit ? "" : "disabled";
    const isPC     = this._actor.hasPlayerOwner;

    const archetypeOpts = Object.values(SOCIAL_TRIADS).map(triad => {
      const opts = SOCIAL_ARCHETYPES.filter(a => a.triad === triad.id).map(a =>
        `<option value="${a.id}" ${notes.archetypeId === a.id ? "selected" : ""}>${a.label}</option>`
      ).join("");
      return `<optgroup label="${triad.label}">${opts}</optgroup>`;
    }).join("");

    const archDesc = archetype ? this._buildArchetypeCard(archetype) : "";

    // Profiling points, each with its hint
    const pointRows = PROFILE_POINTS.map(p => `
      <div class="tsl-chr-point">
        <span class="tsl-chr-point-label" data-tooltip="${esc(p.hint)}">
          <i class="fas ${p.icon}"></i> ${p.label}
        </span>
        <input type="text" data-point="${p.id}" value="${esc(notes.points[p.id] ?? "")}"
               placeholder="${esc(p.placeholder)}" ${disabled} />
      </div>`).join("");

    return `
      ${!isGM ? "" : `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="GM ONLY — the hidden TRUE nature: which maneuvers cut deep (◎) and which bounce off (✕), which school rules them, and how they hold up when pressed. Players never see it; they deduce it from tells and write their guess in their Bonds.${isPC ? " A player character usually needs none — others read them by their Leanings." : ""}">Archetype · hidden nature (GM)</div>
        <select name="archetypeId" ${disabled}>
          <option value="">— Unknown / None —</option>
          ${archetypeOpts}
        </select>
        ${archDesc}
        ${!notes.archetypeId ? "" : `
        <label class="tsl-reveal-toggle" data-tooltip="Open this nature to the whole table — players then see the archetype and its ◎/✕/▲ marks, the payoff for a read well earned. The difficulty number stays yours.">
          <input type="checkbox" name="archetypeRevealed" ${SocialArchetypeManager.isRevealed(this._actor) ? "checked" : ""} ${disabled}>
          <span>Reveal this nature to players ${SocialArchetypeManager.isRevealed(this._actor) ? "<b>(open)</b>" : ""}</span>
        </label>`}
      </section>`}

      ${this._buildNatureSection(notes, archetype, canEdit)}

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="The dossier. Desire, Fear and Weakness are LEVERAGE — fill one and it becomes a card anyone pressing them can play once per exchange. Mask and The Line are for reading them (a Cross-Examine that exposes them reveals their Mask). Hover each label for how to use it at the table.">Profiling</div>
        ${pointRows}
      </section>

      ${(game.settings.get("tsl-social-conflict", "conflictMode") === "fencing") ? "" : (() => {
        // TSL playbook (class): its signature moves join the basic five in conflicts
        const pbId = SocialArchetypeManager.getActorData(this._actor)?.playbookId ?? "";
        const pb   = TSLPlaybooks.getById(pbId);
        const opts = TSLPlaybooks.getOptions().map(o =>
          `<option value="${o.id}" ${pbId === o.id ? "selected" : ""}>${o.label}</option>`).join("");
        const card = pb ? `
          <div class="tsl-chr-arch-hint"><i class="fas ${pb.icon}"></i> ${esc(pb.essence)}</div>
          <div class="tsl-notes-arch-meta">
            ${pb.moves.map(m => `<span class="tsl-arch-mv-chip tsl-arch-mv-chip--playbook"
                data-tooltip="${esc(m.desc)}"><i class="fas ${m.icon}"></i> ${esc(m.name)} · ${m.stat}</span>`).join("")}
          </div>` : "";
        return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Thirsty Sword Lesbians playbook (class). Its two signature emotional moves appear in conflicts next to the basic five.">Playbook (TSL)</div>
        <select name="playbookId" ${disabled}>
          <option value="">— None —</option>
          ${opts}
        </select>
        ${card}
      </section>`;
      })()}

      ${!isGM ? "" : `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="GM only. What THEY want from the party in this conversation — a secret, a promise, money, humiliation. If they WIN the exchange (the other side gives in or storms off), this agenda ADVANCES: losing the exchange must cost the players something.">Agenda — what they want (GM)</div>
        <textarea name="intent" rows="2" placeholder="What do they want from this conversation?">${esc(notes.intent)}</textarea>
      </section>`}

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Anything the dossier above doesn't cover — how they behave, quirks, history, the story behind their Desire.">Notes</div>
        <textarea name="notes" rows="3" placeholder="How they behave, history, the why behind their Desire…" ${disabled}>${esc(notes.notes)}</textarea>
      </section>`;
  }

  /**
   * NATURE (v2.0) — one block for EVERYONE, player character or NPC, with two
   * halves:
   *   Leanings     — the triad dots: the schools they reach for (+1 per dot on
   *                  that school's maneuvers) — and a clear lead is how others
   *                  read and answer them.
   *   When pressed — how they hold up: accept a state or hold the line; give
   *                  in or storm off when their composure breaks.
   * An NPC follows its archetype for both until the GM sets otherwise; a
   * player sets their own.
   */
  _buildNatureSection(notes, archetype, canEdit) {
    const esc      = foundry.utils.escapeHTML;
    const disabled = canEdit ? "" : "disabled";
    const isPC     = this._actor.hasPlayerOwner;
    const short    = (id) => (SOCIAL_TRIADS[id]?.label ?? id).replace("Triad of ", "");

    // ── Leanings: TRIAD_POINT_POOL dots across the three schools ──
    const triadTotal = Object.values(notes.triad).reduce((s, v) => s + (v || 0), 0);
    const remaining  = TRIAD_POINT_POOL - triadTotal;
    // An NPC with no dots of its own leans the way its archetype does (●●).
    const implied = !isPC && triadTotal === 0 && archetype ? archetype.triad : null;
    const triadRows = Object.values(SOCIAL_TRIADS).map(triad => {
      const val   = notes.triad[triad.id] ?? 0;
      const ghost = implied === triad.id ? 2 : 0;
      const pips = Array.from({ length: 3 }, (_, i) => `
        <button class="tsl-chr-triad-pip ${i < val ? "filled" : ""} ${!val && i < ghost ? "implied" : ""}"
                data-triad="${triad.id}" data-value="${i + 1}"
                style="--triad-color:${triad.color}" ${disabled}></button>`).join("");
      return `
        <div class="tsl-chr-triad-row">
          <span class="tsl-chr-triad-label" style="--triad-color:${triad.color}" data-tooltip="${esc(triad.hint)}">
            <i class="fas ${triad.icon}"></i> ${triad.label}
          </span>
          <div class="tsl-chr-triad-pips">${pips}</div>
        </div>`;
    }).join("");

    // The dots' SECOND effect (player characters), made explicit: what the
    // 'Social Leanings' effect adds to everyday skills on the sheet.
    const leanLine = isPC ? (() => {
      const TS = SocialArchetypeManager.TRIAD_SKILLS;
      const chips = Object.entries(TS).map(([t, m]) => {
        const v = SocialArchetypeManager.leanSkillBonus(this._actor, m.key);
        const tl = short(t);
        return v ? `<span class="tsl-chr-lean-chip" data-tooltip="${esc(`${tl} ${"●".repeat(v)} → +${v} ${m.label} — ${m.why}. It is an effect on your sheet (Social Leanings), so it counts on EVERY ${m.label} check; a maneuver that rolls ${m.label} shows it as 'incl. +${v} leaning'. A maneuver of the ${tl} school that ALSO rolls ${m.label} gets both bonuses — your signature move.`)}">+${v} ${m.label}</span>` : null;
      }).filter(Boolean);
      return chips.length
        ? `<div class="tsl-chr-lean"><span class="tsl-chr-lean-label">On your sheet:</span>${chips.join("")}<span class="tsl-chr-lean-note">every check, maneuvers included</span></div>`
        : `<div class="tsl-chr-lean tsl-chr-lean--empty">Dots also sharpen everyday checks: Power → Intimidation, Emotion → Insight, Reason → Deception (+1 per dot).</div>`;
    })() : implied
      ? `<div class="tsl-chr-lean tsl-chr-lean--empty">No dots of their own — they lean the way their archetype does (${esc(short(implied))} ●●). Click a dot to set their own.</div>`
      : "";

    // ── When pressed ──
    const ST     = SocialArchetypeManager.PRESSED_STANCES;
    const legacy = { open: "yield", measured: "yield", guarded: "firm", proud: "firm" };
    const stored = SocialArchetypeManager.getActorData(this._actor).stance;
    const sel    = legacy[stored] ?? stored ?? (isPC ? "ask" : "nature");
    const now    = SocialArchetypeManager.getStance(this._actor);   // what will actually happen
    const ids    = Object.keys(ST).filter(id => id !== "nature" || archetype || sel === "nature");
    const archPressed = archetype?.pressed ?? "yield";
    const opts = ids.map(id => `<option value="${id}" ${sel === id ? "selected" : ""}>${esc(ST[id].label)}${
      id === "nature" && archetype ? ` (${esc(ST[archPressed]?.label ?? archPressed)})` : ""}</option>`).join("");
    const tipAll = Object.values(ST).map(st => `<b>${st.label}</b> — ${st.tip}`).join("<br>");
    const effect = {
      yield: "Accepts what's put on them; when their composure breaks they give in.",
      firm:  "Holds the line with a fresh Wound while they can; when their composure breaks they storm off (and carry a Grudge).",
      ask:   "A window asks every time — accept or hold the line; give in or storm off.",
    }[now] ?? "";
    const why = sel === "nature" && archetype?.pressedWhy ? ` <i>${esc(archetype.label)}: ${esc(archetype.pressedWhy)}.</i>` : "";
    const autoOff = !isPC && now === "ask" && sel !== "ask"
      ? ` <i>(NPCs ask you right now — the world setting “NPCs act on their nature” is off.)</i>` : "";

    return `
      <section class="tsl-notes-section tsl-nature">
        <div class="tsl-notes-section-title" data-tooltip="${esc(`Nature — how ${this._actor.name} fights with words. Two halves: LEANINGS (the schools they reach for, and how others read them) and WHEN PRESSED (how they hold up). ${isPC ? "You set both." : "An NPC follows its archetype for both until you set otherwise."}`)}">
          Nature
        </div>
        <div class="tsl-nature-sub">
          <span class="tsl-nature-sub-title" data-tooltip="${esc(`Spend ${TRIAD_POINT_POOL} dots. They cut both ways.<br><b>Attack:</b> +1 per dot on that school's maneuvers (−1 on a 0-dot school while you lean elsewhere)${isPC ? " — AND +1 per dot to one everyday skill on your sheet" : ""}.<br><b>Defence:</b> a ruling school (a clear lead of 2+●) is how others read you: the school that beats it gets +2 against you, the school it beats −2, and a bad miss against you earns your Answer. A 0-dot school is your blind side. Split evenly = unreadable, but no Answer.${isPC ? "" : "<br>An NPC with an archetype defends by its archetype; its dots shape only how it attacks."}`)}">Leanings</span>
          <span class="tsl-chr-triad-budget ${remaining < 0 ? "over" : remaining === 0 ? "spent" : ""}">${
            remaining < 0 ? `${-remaining} over — lower a school` : `${remaining} / ${TRIAD_POINT_POOL} left`}</span>
        </div>
        ${triadRows}
        ${leanLine}
        <div class="tsl-nature-sub tsl-nature-sub--pressed">
          <span class="tsl-nature-sub-title" data-tooltip="${esc(`When pressed — how ${this._actor.name} holds up. It decides two moments: a state put on them (accept it, or hold the line by carrying a Wound instead) and their composure breaking (give in and concede, or storm off and carry a Grudge).<br>${tipAll}`)}">When pressed</span>
          <select name="stance" ${disabled}>${opts}</select>
        </div>
        <div class="tsl-stance-hint">${esc(effect)}${why}${autoOff}</div>
      </section>`;
  }

  /**
   * Rich archetype card: essence, play hint, tells, craves/dreads and the
   * maneuver matrix spelled out by NAME — which maneuvers cut deep and
   * which bounce off. Answers "how do maneuvers combine with archetypes"
   * right where the archetype is chosen.
   */
  _buildArchetypeCard(archetype, compact = false) {
    const esc   = foundry.utils.escapeHTML;
    const triad = SOCIAL_TRIADS[archetype.triad];
    const rel   = SocialArchetypeManager.getManeuverRelationsFor(archetype);

    const chip = (m, cls, sym, effect) => `
      <span class="tsl-arch-mv-chip tsl-arch-mv-chip--${cls}"
            data-tooltip="${esc(m.description)}<br><i>${esc(effect)}</i>">
        ${sym} <i class="fas ${m.icon}"></i> ${esc(m.name)}
      </span>`;
    const vulnChips = rel.vulnerable.map(m => chip(m, "vulnerable", "◎", "Against this nature: Advantage on the roll, +1 composure off them.")).join("");
    const immChips  = rel.immune.map(m => chip(m, "immune", "✕", "Against this nature: it fails outright, costs you like a miss, they Answer, and they turn Defiant.")).join("");

    const tells = !compact && archetype.tells?.length
      ? `<ul class="tsl-arch-tells">${archetype.tells.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`
      : "";
    // Where the nature comes from (real psychology) and its strong / weak sides
    const sides = (archetype.psych || archetype.strengths || archetype.weaknesses) ? `
        <div class="tsl-arch-sides">
          ${archetype.psych ? `<div class="tsl-arch-psych" data-tooltip="The real-world type this nature is drawn from — so you can play it true."><i class="fas fa-book-open"></i> ${esc(archetype.psych)}</div>` : ""}
          ${archetype.strengths ? `<div class="tsl-arch-side tsl-arch-side--strong"><b>Strong:</b> ${esc(archetype.strengths)}</div>` : ""}
          ${archetype.weaknesses ? `<div class="tsl-arch-side tsl-arch-side--weak"><b>Weak:</b> ${esc(archetype.weaknesses)}</div>` : ""}
        </div>` : "";

    return `
      <div class="tsl-arch-card" style="--triad-color:${triad?.color ?? "#806858"}">
        ${compact ? `<div class="tsl-arch-card-name">${esc(archetype.label)}</div>` : `
        <span class="tsl-arch-card-triad" data-tooltip="${esc(triad?.hint ?? "")}">
          <i class="fas ${triad?.icon ?? "fa-user"}"></i> ${esc(triad?.label ?? "")}
        </span>`}
        <div class="tsl-notes-arch-desc">${esc(archetype.description)}</div>
        ${compact ? "" : `<div class="tsl-chr-arch-hint"><i class="fas fa-lightbulb"></i> ${esc(archetype.hint ?? "")}</div>`}
        ${tells}
        <div class="tsl-arch-cd">
          <span data-tooltip="What feeds them — offer it to gain ground."><i class="fas fa-gem"></i> ${esc(archetype.craves ?? "")}</span>
          <span data-tooltip="What breaks them — press it to shake them."><i class="fas fa-ghost"></i> ${esc(archetype.dreads ?? "")}</span>
        </div>
        ${sides}
        ${archetype.pressed ? `<div class="tsl-arch-pressed" data-tooltip="When pressed — how this nature holds up: whether it accepts a state or holds the line, and whether it gives in or storms off when its composure breaks. (The GM can change it per NPC in Profile → Nature.)"><i class="fas ${archetype.pressed === "firm" ? "fa-door-open" : "fa-handshake"}"></i> <b>When pressed:</b> ${archetype.pressed === "firm" ? "stands firm" : "gives ground"}${archetype.pressedWhy ? ` — ${esc(archetype.pressedWhy)}` : ""}</div>` : ""}
        <div class="tsl-arch-matrix">
          ${vulnChips ? `<div class="tsl-arch-matrix-row">${vulnChips}</div>` : ""}
          ${immChips  ? `<div class="tsl-arch-matrix-row">${immChips}</div>`  : ""}
        </div>
      </div>`;
  }

  // ── Codex tab — the rulebook page: triads, archetypes, statuses ─────────────

  /**
   * The Feelings page — the whole emotional layer, generated from the data so
   * it never drifts: Willpower, the five Wounds (urge / ultimate / clears /
   * which Scar), the four Boons, the five Scars, and the Wound→Scar lifecycle.
   */
  _buildFeelingsCodex() {
    if (typeof TSLConditionEffects === "undefined") {
      return `<section class="tsl-notes-section"><p>The emotional layer isn't loaded.</p></section>`;
    }
    const esc  = foundry.utils.escapeHTML;
    const CE   = TSLConditionEffects;
    // FULL = Wounds + Willpower, Ultimates, Give in, Boons, Scars.
    // BASIC (world setting) = the Wounds alone.
    const full = CE.isFullLayer();
    const ultLine = (m) => full && m?.ultimate
      ? `<div class="tsl-codex-gain">●●● ${esc(m.ultimate.name)} (1 Willpower): ${esc(m.ultimate.text)}</div>` : "";
    const woundRows = CE.ORDER.map(id => {
      const m = CE.getMeta(id); if (!m) return "";
      const sc = m.bond ? ` → about a person: settles into a <b>${esc(SocialArchetypeManager.getBondType(m.bond).label)}</b> bond with them`
        : full && m.scar && CE.getScarMeta(m.scar) ? ` → calcifies into <b>${esc(CE.getScarMeta(m.scar).label)}</b>`
        : ` → never sets: a long rest only eases it`;
      const giveIn = full ? `Give in → ${esc((m.leanIn ?? "").replace(/\{source\}/g, "them"))} · ` : "";
      return `<div class="tsl-codex-combo"><b>${esc(m.label)}</b> <span class="tsl-codex-gain">${esc(m.signature ?? "")}</span>
        <div class="tsl-codex-howto">Urge — ${esc((m.urge ?? "").replace(/\{source\}/g, "the source"))}</div>${ultLine(m)}
        <div style="font-size:12px;opacity:.85">${giveIn}Clears: ${esc(m.clears ?? "")}${sc}</div></div>`;
    }).join("");
    const boonRows = (CE.BOON_ORDER ?? []).map(id => {
      const m = CE.getMeta(id); if (!m) return "";
      return `<div class="tsl-codex-combo"><b>${esc(m.label)}</b> <span class="tsl-codex-gain">${esc(m.signature ?? "")}</span>${ultLine(m)}</div>`;
    }).join("");
    const scarRows = (CE.SCAR_ORDER ?? []).map(id => {
      const m = CE.getScarMeta(id); if (!m) return "";
      const from = CE.getMeta(m.from)?.label ?? m.from;
      return `<div class="tsl-codex-combo"><b>${esc(m.label)}</b> <span style="opacity:.8">(from ${esc(from)})</span>
        <div class="tsl-codex-howto">${esc(m.ability)}</div>${ultLine(m)}
        <div style="font-size:12px;opacity:.85">Cost: ${esc(m.cost)} · Clears: ${esc(m.clears)}</div></div>`;
    }).join("");

    const woundsBlurb = full
      ? `From Holding the Line (a refused state turns into its Wound), a public humiliation, storming off (a Grudge), a sincere Feelings move, or plain drama. Each escalates <b>● → ●● → ●●●</b>; pressed again it <b>deepens</b>. Its <b>urge</b> pulls you — give in (the <b>Give in</b> button) → +1 Willpower. A long rest eases a Wound one tier (a Light one heals); left at ●●● it <b>calcifies</b> — into a Scar if it's about you, into a <b>bond</b> if it's about someone. Wounds weighing <b>4+</b> (sum of tiers) = <b>Overwhelmed</b>: you can't hold the line any more — every state lands.`
      : `From Holding the Line (a refused state turns into its Wound), a public humiliation, storming off (a Grudge), a sincere Feelings move, or plain drama. Each escalates <b>● → ●● → ●●●</b>; pressed again it <b>deepens</b>. Its <b>urge</b> is a roleplay prompt — play it. A long rest eases a Wound one tier (a Light one heals); one about <b>someone</b> left at ●●● settles into a <b>bond</b> with them instead. Wounds weighing <b>4+</b> (sum of tiers) = <b>Overwhelmed</b>: you can't hold the line any more — every state lands.`;
    const lifecycle = full
      ? `<b>Wound → deepen (● → ●● → ●●●) → long rest.</b> At ●●● it <b>calcifies</b>: a Wound about yourself becomes its <b>Scar</b> (then you're immune to that Wound); a Wound about someone — Obsession, Grudge — becomes a <b>bond</b> with them (a Crush, an Enemy) or deepens the one you share. A lesser Wound <b>eases one tier</b>. So ●●● is your last chance to heal it — or fire its ⚡ Ultimate — before it's permanent. Boons fade when the moment passes (a long rest ends them); Scars lift only through their <b>Clears</b> arc.`
      : `<b>Wound → deepen (● → ●● → ●●●) → long rest.</b> A long rest eases every Wound one tier. A Wound about someone — Obsession, Grudge — left at ●●● becomes a <b>bond</b> with them (a Crush, an Enemy) or deepens the one you share. <i>(This table plays the BASIC emotional layer: no Willpower, Boons or Scars.)</i>`;

    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The emotional layer${full ? "" : " — basic"}</div>
        ${full ? `
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">⬡ Willpower — the resource</summary>
          <div class="tsl-codex-hint-sm">Your emotional reserve across the days (not Composure, which is how much pressure you take inside one exchange). Pool = your <b>proficiency bonus</b>, refilled on a <b>long rest</b>. Spend 1 to fire an <b>Ultimate</b> (the ⚡ button — what it says is <i>automatic</i> goes on the sheets as a short effect that ends itself after the roll or the turn; what says <i>GM</i> the table plays) (a ●●● Wound / Boon, or a Scar) or to push past a Wound's hard block. Restore 1 by <b>giving in</b> to a Wound's urge — the <b>Give in</b> button on the Wound. It lives in the <b>Fencing</b> tab.</div>
        </details>` : ""}
        <details class="tsl-codex-sub"${full ? "" : " open"}>
          <summary class="tsl-codex-sub-title">❤ Wounds — the dark ${CE.ORDER.length}</summary>
          <div class="tsl-codex-hint-sm">${woundsBlurb}</div>
          <div class="tsl-codex-combo-list">${woundRows}</div>
        </details>
        ${full ? `
        <details class="tsl-codex-sub">
          <summary class="tsl-codex-sub-title">✦ Boons — the bright ${(CE.BOON_ORDER ?? []).length}</summary>
          <div class="tsl-codex-hint-sm">The GM grants these for courage, love, triumph or grit. A scaling bonus + a ●●● ultimate (1 Willpower). They do <b>not</b> count toward Overwhelmed.</div>
          <div class="tsl-codex-combo-list">${boonRows}</div>
        </details>
        <details class="tsl-codex-sub">
          <summary class="tsl-codex-sub-title">🩹 Scars — the permanent ${(CE.SCAR_ORDER ?? []).length}</summary>
          <div class="tsl-codex-hint-sm">What a Wound about <b>yourself</b> becomes when it's left at ●●● through a long rest (${(CE.SCAR_ORDER ?? []).map(id => esc(CE.getMeta(CE.getScarMeta(id)?.from)?.label ?? "")).filter(Boolean).join(", ")}). Permanent — lifted only by the story (never a rest). Each grants an ability and a cost — the numbers sit on your sheet and the module enforces the rest; only what depends on the situation is the GM's — and makes you <b>immune to the Wound it came from</b> (so it can't carry a held line for you, either). A Wound about a <b>person</b> (Obsession, Grudge) doesn't scar you — it settles into your relationship with them.</div>
          <div class="tsl-codex-combo-list">${scarRows}</div>
        </details>` : ""}
        <details class="tsl-codex-sub">
          <summary class="tsl-codex-sub-title">The lifecycle</summary>
          <div class="tsl-codex-hint-sm">${lifecycle}</div>
        </details>
      </section>`;
  }

  _buildCodexTab() {
    const esc = foundry.utils.escapeHTML;

    // The Codex must describe THIS world, not the module's full feature list.
    // A "Social Fencing only" table has no 2d6 Feelings moves; a "TSL only"
    // table has no maneuvers, composure, states or openings at all.
    let mode = "both";
    try { mode = game.settings.get("tsl-social-conflict", "conflictMode") ?? "both"; } catch { /* defaults */ }
    const tslOn     = mode !== "fencing";   // the 2d6 Feelings layer
    const fencingOn = mode !== "tsl";       // d20 maneuvers, composure, states
    const fullLayer = (typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer());

    // A titled, COLLAPSIBLE block of short bullets — the page opens as a tidy
    // list of headers you expand on demand, instead of one long scroll.
    const sub = (title, items, opened = false) => `
      <details class="tsl-codex-sub"${opened ? " open" : ""}>
        <summary class="tsl-codex-sub-title">${title}</summary>
        <ul class="tsl-codex-how">${items.map(i => `<li>${i}</li>`).join("")}</ul>
      </details>`;

    // A key term: dotted underline + a hover definition.
    const GLOSSARY = {
      "Composure": "How much pressure someone can take before they crack — everyone in the exchange has it: 2 + CHA + WIS (never below 2). A maneuver that lands on you takes it down (1–3 by school, +1 on a weak spot, +1 on a clean hit); every miss costs the one who missed (1, a risky move 2). At 0 you've lost the exchange — you give in, or storm off.",
      "social DC": "The hidden difficulty you roll against: 10 + their WIS save + INT save (proficiency baked in), or their passive Insight if higher. Only the GM ever sees the number. A natural 1 always misses.",
      "support skill": "A SECOND skill each maneuver leans on (e.g. Read Them = Insight + Investigation). If you're TRAINED in it, your proficiency bonus is added on top of the main roll; if not, it adds nothing.",
      "state": "What a moment in the talk does to a person — Provoked, Cowed, Beholden… Each one changes what they DO (whom they must answer, what they can't try, a roll at disadvantage) or hands someone a LEVER to call in. Fleeting: used up, run out with time (rounds in a fight), or cleared by a long rest.",
      "lever": "A state you can CALL IN once: Beholden (call the debt — a truthful answer or a reasonable request, plus one of their secrets) or Enthralled (ask a favor — granted, and the spell ends). The button sits on the state.",
      "opening": "Something on your target that makes a matching maneuver stronger (⊕): a state you set up that a finisher cashes (Taunt's Provoked → Humiliate), or a lasting Wound they carry that certain maneuvers press for +2.",
      "Wound": "A lasting feeling — Wrath, Shame, Fear, Jealousy… It pushes the one who carries it (an urge), escalates ● → ●● → ●●●, opens matching maneuvers against them (+2), and heals only through the story; a long rest eases it one step.",
      "String": "A hold on a person — at most 3 on any one. Earned by opening up in character, by maneuvers that hand you a lever (reads, Lie, Play Weak, Bargain…), or by winning an exchange. No passive effect: it is only ever spent — +5 to a missed maneuver against them (the gamble), or PULLED for +5 to your next attack, check or save against them (or +5 AC against their next attack). A pull is a real effect on your sheet, so it works in a fight.",
      "the Answer": "On a bad miss (5+ under) or pressing a nature where it can't be reached, the target strikes back in its school's language: Power → you're Rattled · Emotion → you're Beholden to them · Reason → they take a String on you.",
      "Hold the Line": "When a maneuver puts a STATE on you, refuse it by carrying the matching lasting Wound instead (refuse Provoked → Wrath or Grudge). The composure hit still lands. Not against the one who provoked you, not once you're Overwhelmed, not with that Wound already at ●●●.",
      "Overwhelmed": "Wounds weighing 4 or more (add up their tiers). You can't hold the line any more — every state put on you lands.",
      "give in": "Composure broken — you concede: you do the thing or grant the point (the GM frames it). Your bond toward the winner deepens +1 (an enemy's hostility eases instead), and the winner takes a String on you.",
      "storm off": "Composure broken — but you refuse to concede. You still LOSE: you carry a Grudge against the winner, the bond cools −1 (an enemy's hardens instead), and the winner takes a String on you.",
      "Nature": "How someone fights with words — two halves: Leanings (the schools they reach for, and how others read them) and When pressed (accept states or hold the line; give in or storm off).",
      "leverage": "A filled dossier point — Desire, Fear or Weakness — playable once per exchange for a strong edge. The buttons sit under the roll bar.",
      "bond": "ONE shared relationship between two people, with a TYPE and a STRENGTH (0–3 ●). Record it on either side and it appears on both. It is your weapon (+● on its school), their guard (DC up or down), and a set of skill edges and costs.",
      "Advantage": "Roll two d20 and keep the higher. Disadvantage: keep the lower. Both at once cancel out.",
    };
    const term = (name, txt) => {
      const tip = (txt ?? GLOSSARY[name] ?? "").replaceAll('"', "&quot;");
      return `<span class="tsl-term" data-tooltip="${tip}">${name}</span>`;
    };
    const stName = (id) => SOCIAL_CONDITIONS[id]?.label ?? id;
    const wName  = (id) => (typeof TSLConditionEffects !== "undefined" ? TSLConditionEffects.getMeta(id)?.label : null) ?? id;
    const mName  = (id) => SOCIAL_MANEUVERS.find(m => m.id === id)?.name ?? id;

    // ── Start: the duel in six steps ──────────────────────────────────────────
    const quickStart = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">How a social duel works</div>
        <ol class="tsl-codex-how tsl-codex-quick">
          <li><b>Pick who.</b> In <b>Fencing</b>, choose a target (or <b>Map</b> to click their token). One person at a time — never yourself.</li>
          <li><b>Pick a maneuver.</b> Four schools; General holds the basics. Hover any chip for exactly what it does to <b>this</b> person. Each rolls a main skill + a ${term("support skill")}.</li>
          <li><b>Roll.</b> The system's own roll dialog opens with your bonuses pre-filled. The ${term("social DC")} stays hidden — only the GM sees it. The result shows right where you clicked Roll.</li>
          <li><b>A hit</b> takes their ${term("Composure")} down — and many maneuvers also put a ${term("state")} on them: it changes what they do next (Provoked must answer you; Cowed won't dare threaten you) or hands you a ${term("lever")} to call in. They may ${term("Hold the Line")} — refuse the state by carrying a lasting ${term("Wound")} instead.</li>
          <li><b>A miss</b> costs <b>your</b> composure — pressing is never free. A bad miss also lets them <b>Answer</b>.</li>
          <li><b>At 0 composure the exchange is lost.</b> The loser chooses: ${term("give in")} (concede the point) or ${term("storm off")} (refuse, but carry a Grudge). Either way the winner takes a String. Players decide in the moment; NPCs follow their ${term("Nature")}.</li>
        </ol>
      </section>`;

    // A worked example: walk one exchange end to end and name every part.
    const walkthrough = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">A scene, start to finish</div>
        <div class="tsl-codex-scene">
          <div><b>The scene.</b> An hour to dawn. Lyra must get through the river gate; <b>Captain Roell</b> has orders to let no one pass. Nobody draws steel — this is a battle of words.</div>
          <div><b>The goal.</b> Crack Roell's ${term("Composure")} (6) before her own (5) runs out — every miss costs her. When his breaks, he has lost: he gives in and opens the gate — or storms off, the gate stays shut, and he carries a Grudge.</div>
        </div>
        <ol class="tsl-codex-how tsl-codex-quick">
          <li><b>She sizes him up.</b> <b>Read Them</b> lands: a tell is whispered to her — <i>“he keeps checking the duty ledger.”</i> She writes her guess in her Bond — <i>read as Broker</i> — and gains a String. Her chips now show marks for a Broker: <b>◎</b> on Bargain.</li>
          <li><b>She sets him up.</b> <b>Taunt</b> lands: −1 composure (6 → 5), and he's <b>${stName("provoked")}</b> — his next maneuver must come at <i>her</i>, and he can't hold the line against her. And now <b>Humiliate</b> shows a <b>⊕</b>: an ${term("opening")}.</li>
          <li><b>She cashes it.</b> <b>Humiliate</b> lands: 3 + 1 for the opening → −4 (5 → 1). ${stName("provoked")} is spent, and the public unmaking leaves him a lasting <b>${wName("shamed")}</b>.</li>
          <li><b>He answers.</b> <b>Intimidate</b> — <i>“Leave now or hang at dawn.”</i> It lands: −2 for her (5 → 3), and she'd be <b>${stName("cowed")}</b> (no Power moves or threats against him). She <b>holds the line</b> — refuses it and carries <b>${wName("scared")}</b> instead.</li>
          <li><b>She switches schools.</b> <b>Bargain</b> — <i>“One page from that ledger, and you walk away a free man.”</i> Her read was right: a weak spot — Advantage, 2 + 1 → his composure hits <b>0</b>.</li>
          <li><b>How it ends.</b> He has lost. As a Broker he <b>gives in</b> — <i>business is business</i> — and unbars the gate; she takes a String on him. Had he been a Duelist he'd have <b>stormed off</b>: no gate, but he'd carry a Grudge against her. And had her own misses emptied <i>her</i> composure first, it would be Lyra who cracked.</li>
        </ol>
      </section>`;

    // ── Openings: one condition → maneuvers table, built from the data ──────
    const setupRows = SOCIAL_CONDITION_ORDER.map(st => {
      const from = SOCIAL_MANEUVERS.filter(m => m.applyOnSuccess === st && !m.support).map(m => m.name);
      return from.length ? `<li><b>${from.join(", ")}</b> &nbsp;→&nbsp; makes them <b>${esc(stName(st))}</b></li>` : null;
    }).filter(Boolean).join("");
    const openings = {}; // label → [{ name, gain }]
    const push = (cond, name, gain) => (openings[cond] ??= []).push({ name, gain });
    for (const m of SOCIAL_MANEUVERS) {
      for (const [st, c] of Object.entries(m.combos ?? {})) {
        const gain = [c.damage ? `+${c.damage} composure` : null, c.strings ? `+${c.strings} String` : null].filter(Boolean).join(", ");
        push(stName(st), m.name, gain);
      }
    }
    const kicker = SOCIAL_MANEUVERS.find(m => m.kickWhileDown);
    if (kicker) push("carrying any state", kicker.name, "+1 composure");
    const woundMap = {};
    for (const [mid, conds] of Object.entries(CONDITION_OPENINGS)) {
      for (const cond of Object.keys(conds)) (woundMap[cond] ??= new Set()).add(mName(mid));
    }
    for (const [cond, ms] of Object.entries(woundMap)) for (const name of ms) push(wName(cond), name, "+2");
    const openingRows = Object.entries(openings).map(([cond, list]) =>
      `<li>They're <b>${esc(cond)}</b> &nbsp;→&nbsp; ${list.map(e => `${esc(e.name)} <span class="tsl-codex-gain">(${esc(e.gain)})</span>`).join(", ")}</li>`).join("");
    const comboReference = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Openings (⊕) — the cheat sheet</div>
        <div class="tsl-codex-hint-sm">One rule: <b>something on your target makes a matching maneuver stronger.</b> When it's live, that chip shows a <b>⊕</b>. First you put a state on them; then you press it. A state you set up is <b>spent</b> when a finisher cashes it; a lasting Wound is <b>never</b> spent — it keeps giving +2 until the story heals it.</div>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">Step 1 · Put a state on them</summary>
          <ul class="tsl-codex-how tsl-codex-combo">${setupRows}</ul>
          <div class="tsl-codex-hint-sm">Lasting Wounds come from Holding the Line (a refused state turns into one), a public humiliation, a sincere Feelings move, or storming off.</div>
        </details>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">Step 2 · Press it — when they're X, these gain ⊕</summary>
          <ul class="tsl-codex-how tsl-codex-combo">${openingRows}</ul>
        </details>
      </section>`;

    // ── States: what each does, how long, in a fight — from the data ─────────
    const EXTRA_FROM = {
      rattled:    "the Answer of a Power nature",
      guilted:    "the Answer of an Emotion nature",
      provoked:   "an Enthralled spell broken by a Power move",
      suspicious: "a Deception maneuver that misses badly",
      defiant:    "pressing a nature where it can't be reached",
      undaunted:  "a clean Reassure",
    };
    const stateRow = (id) => {
      const meta = SOCIAL_CONDITIONS[id];
      const from = [...SOCIAL_MANEUVERS.filter(m => m.applyOnSuccess === id).map(m => m.name), EXTRA_FROM[id]].filter(Boolean).join(" · ");
      const holds = (meta.holdAs ?? []).map(wName);
      const refuse = meta.positive ? "a good state — nothing to refuse"
        : meta.noHold ? "can't be refused"
        : holds.length ? `hold the line as <b>${holds.map(esc).join("</b> or <b>")}</b>` : "—";
      const rounds = meta.rounds ?? 1;
      const lasts = `until used, or ${SocialArchetypeManager._spanLabel(meta.seconds)} · ${rounds} round${rounds > 1 ? "s" : ""} in a fight`;
      const auto = (meta.dnd5eChanges?.length || meta.a5eChanges?.length);
      const bonds = meta.bonds ? (() => {
        const lbl = (ids) => (ids ?? []).map(t => SocialArchetypeManager.getBondType(t).label).join(", ");
        const parts = [meta.bonds.deepen?.length ? `runs deep (two uses) from a ${lbl(meta.bonds.deepen)}` : null,
                       meta.bonds.resist?.length ? `won't take from an ${lbl(meta.bonds.resist)}` : null].filter(Boolean).join("; ");
        return `<div class="tsl-codex-status-bonds"><b>♥ Bonds:</b> ${esc(parts)} — <i>${esc(meta.bonds.why ?? "")}</i>.</div>`;
      })() : "";
      return `
        <div class="tsl-codex-status">
          <img src="${meta.icon}" alt="">
          <div>
            <div class="tsl-codex-status-name">${esc(meta.label)} <i class="tsl-codex-status-gist">— ${esc(meta.gist ?? "")}</i></div>
            <div class="tsl-codex-status-desc">${esc(meta.description)}</div>
            ${meta.lever ? `<div class="tsl-codex-status-lever"><i class="fas ${meta.lever.icon}"></i> <b>${esc(meta.lever.label)}</b> — a button on the state: they ${esc(meta.lever.text)}.</div>` : ""}
            <div class="tsl-codex-status-meta"><b>From:</b> ${esc(from || "—")} · <b>Refuse:</b> ${refuse} · <b>Lasts:</b> ${esc(lasts)}</div>
            ${bonds}
            ${meta.combat ? `<div class="tsl-codex-status-combat"><span class="tsl-codex-auto tsl-codex-auto--${auto ? "on" : "gm"}" data-tooltip="${auto ? "Real numbers on the token while it lasts — no one has to remember it." : "A short rule the GM applies — it depends on who's who, so it can't be a flat number."}">${auto ? "on the sheet" : "GM"}</span> <b>In a fight:</b> ${esc(meta.combat)}</div>` : ""}
          </div>
        </div>`;
    };
    const STATE_GROUPS = [
      { title: "Pressure — what your maneuvers do to them", ids: ["provoked", "rattled", "humbled", "cowed", "exposed", "desperate", "intrigued"] },
      { title: "Levers — what they owe you",               ids: ["smitten", "guilted"] },
      { title: "Walls — what mistakes build",               ids: ["suspicious", "defiant"] },
      { title: "Steadiness — what a friend gives",          ids: ["steadied", "undaunted"] },
    ];
    const statuses = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">States — what a moment does to a person</div>
        <div class="tsl-codex-hint-sm">A state is never a bare “+2 next roll”. It changes what the person <b>does</b> — whom they must answer, what they can't try, a roll at disadvantage — or hands someone a ${term("lever")} to call in. The name says the rule: a provoked person lashes out, a cowed one won't challenge you, a beholden one owes you.</div>
        <div class="tsl-codex-faq">
          <div><b>Are they automatic?</b> In the talk — <b>yes, fully</b>: the module enforces every rule (a blocked maneuver, a disadvantage, the lever button, who must answer whom). In a fight — those marked <span class="tsl-codex-auto tsl-codex-auto--on">on the sheet</span> change real numbers on the token (AC, attacks, saves, skills); those marked <span class="tsl-codex-auto tsl-codex-auto--gm">GM</span> are a one-line rule the GM applies, because they depend on who's who.</div>
          <div><b>How long?</b> Short. Most are <b>spent by the very thing they cause</b> (Provoked once they lash out, Rattled after their next maneuver, a lever once it's called). Otherwise they run out with game time — or, in a fight, after a few rounds, ticked down by Foundry on the bearer's turn. A <b>long rest clears them all</b>. The lasting layer is <b>Wounds</b> (the Feelings page) — not these.</div>
          <div><b>Into combat?</b> Yes — when talk turns to steel, every state stays on the token with its fight rule. Ending the exchange (giving in, storming off) doesn't clear them.</div>
          <div><b>Bonds bend them.</b> From someone who matters in the right way a state <b>runs deep</b> (two uses, ×2 on the tag); from someone they're set against it <b>won't take</b> at all.</div>
        </div>
        ${STATE_GROUPS.map((g, i) => `
          <details class="tsl-codex-sub"${i === 0 ? " open" : ""}>
            <summary class="tsl-codex-sub-title">${esc(g.title)}</summary>
            <div class="tsl-codex-statuses">${g.ids.filter(id => SOCIAL_CONDITIONS[id]).map(stateRow).join("")}</div>
          </details>`).join("")}
      </section>`;

    // ── The moves, by school — rolls / hit / miss / how / say / real tactic ──
    const REAL_TACTIC = {
      cold_reading:     "Cold reading & baselining — mentalists read strangers from small cues; interrogators learn someone's normal first, then watch for change. (One tell proves little — real lie-spotting from a single cue is barely better than chance.)",
      persuade:         "Rational persuasion — a fair case built on common ground (Aristotle's logos; Cialdini's 'unity': we want the same thing).",
      intimidate:       "Coercion — a credible threat of consequences. It works only while the threat is believed; a called bluff costs you face.",
      lie:              "Pretexting — a false story that changes their maths ('your partner already confessed' is a real interrogation ploy).",
      reassure:         "Emotional support — naming what someone does right and reminding them who they are steadies them (the 'secure base' of attachment research).",
      sow_doubt:        "Ridicule — a put-down played for an audience; status games run on who laughs at whom.",
      instigate:        "Goading / baiting — provoke a feeling so they act before they think.",
      flatter:          "Ingratiation — flattery works even when people suspect it: it feeds the self-image they want to believe.",
      feigned_weakness: "Playing naïve (elicitation) — seem harmless or lost so they explain, correct or gloat — and give themselves away. A social-engineering classic.",
      throw_gauntlet:   "Public shaming — a 'degradation ceremony': strip someone's standing before witnesses. Shame tends to turn into fury later.",
      love_bombing:     "Love bombing — sudden, overwhelming affection that lowers defences (documented in cult recruitment and abusive relationships).",
      cold_shoulder:    "Triangulation & scarcity — warm to a rival so your attention feels scarce; people chase what they might lose.",
      guilt_trip:       "Guilt induction — make your hurt their responsibility; it is how people steer those who care about them.",
      gaslight:         "Sowing doubt — plant uncertainty about what they know or remember. (Real gaslighting is a long pattern inside a dependent relationship; one conversation only plants the seed.)",
      logic_exploit:    "Strategic use of evidence — let them commit to a story, then reveal the one fact it can't survive (a modern interview method).",
      sweeten_deal:     "Reciprocity — Cialdini's first principle of influence: an offer creates an obligation to answer it.",
      invoke_authority: "Appeal to authority — people obey a legitimate higher power (Milgram); in doubt, they reach for a rule to follow.",
    };
    const SCHOOL_LABEL = {
      general:   "General — the basics anyone reaches for (no weak spots; only Mock and Taunt can hit a wall)",
      power:     "Power — domination: hit harder, risk harder",
      attention: "Emotion — the heart: warmth and its absence",
      order:     "Reason — the cold mind: doubt, proof, leverage",
    };
    const bondNote = (stId) => {
      const b = SOCIAL_CONDITIONS[stId]?.bonds;
      if (!b) return "";
      const lbl = (ids) => (ids ?? []).map(id => SocialArchetypeManager.getBondType(id).label.toLowerCase()).join(" / ");
      const parts = [b.deepen?.length ? `×2 from a ${lbl(b.deepen)}` : null, b.resist?.length ? `won't take from an ${lbl(b.resist)}` : null].filter(Boolean);
      return parts.length ? ` <span class="tsl-codex-gain">(${parts.join("; ")})</span>` : "";
    };
    const movesRef = ["general", "power", "attention", "order"].map(g => {
      const rows = SOCIAL_MANEUVERS.filter(m => m.group === g).map(m => {
        const skills = `${esc(m.skill)}${m.skill2 ? ` + ${esc(m.skill2)}` : ""}`;
        let hit, miss;
        if (m.support) {
          const heal = m.heal ?? 1;
          hit  = `aimed at an <b>ally</b> (DC 10): <b>+${heal}</b> composure back and <b>${esc(stName("steadied"))}</b> — a clean hit gives +${heal + 1} and <b>${esc(stName("undaunted"))}</b> too`;
          miss = `nothing — a kind word that misses <b>costs you nothing</b>.`;
        } else {
          const dmg = m.damage ? `<b>−${m.damage}</b> composure` : (m.reveals ? "a whispered tell + a String" : "<b>no blow — a set-up</b>");
          const st  = m.applyOnSuccess ? ` · they're <b>${esc(stName(m.applyOnSuccess))}</b>${bondNote(m.applyOnSuccess)}` : "";
          const wnd = m.woundOnSuccess ? ` · a lasting <b>${esc(wName(m.woundOnSuccess))}</b> Wound` : "";
          const str = (m.grantStrings && !m.reveals) ? ` · +${m.grantStrings} String${m.grantStrings > 1 ? "s" : ""}` : "";
          const tell = (m.reveals && m.damage) ? " · a whispered tell + a String" : "";
          const combo = m.combos ? ` · cashes ${Object.keys(m.combos).map(c => `<b>${esc(stName(c))}</b>`).join("/")} for more` : "";
          const kick = m.kickWhileDown ? ` · <b>+1</b> vs someone already carrying a state` : "";
          hit = `${dmg}${st}${wnd}${tell}${str}${kick}${combo}`;
          const cost = m.failCost ?? 1;
          const bad = m.sincere
            ? " A bad miss draws <b>no Answer</b> — it was honest."
            : ` A <b>bad</b> miss (5+ under) → <b>they Answer</b> too${m.caughtOnBotch ? " — and you're <b>caught lying</b>: they take a String on you" : ""}${m.skill === "Deception" ? ", and they turn <b>Suspicious</b> of your lies" : ""}.`;
          miss = `nothing lands, and <b>you lose ${cost} composure</b>${cost > 1 ? " (a risky move)" : ""}.${bad}`;
        }
        const how = m.howto   ? `<div class="tsl-codex-howto">▸ ${esc(m.howto)}</div>` : "";
        const ex  = m.example ? `<div class="tsl-codex-example">${esc(m.example)}</div>` : "";
        const rel = SocialArchetypeManager.getArchetypeRelationsFor(m);
        const cuts = rel.vulnerable.length ? ` <span class="tsl-codex-gain">◎ cuts deep on the ${rel.vulnerable.map(a => esc(a.label)).join(", ")}</span>` : "";
        const walls = rel.immune.length ? ` <span class="tsl-codex-gain">✕ bounces off the ${rel.immune.map(a => esc(a.label)).join(", ")}</span>` : "";
        const sides = (m.edge || m.risk) ? `
          ${m.edge ? `<div class="tsl-codex-side tsl-codex-side--strong"><b>Strong:</b> ${esc(m.edge)}${cuts}</div>` : ""}
          ${m.risk ? `<div class="tsl-codex-side tsl-codex-side--weak"><b>Weak:</b> ${esc(m.risk)}${walls}</div>` : ""}` : "";
        return `<div class="tsl-codex-combo tsl-codex-move">
          <div class="tsl-codex-move-head"><b>${esc(m.name)}</b> <span class="tsl-codex-gain">rolls ${skills}</span></div>
          <div class="tsl-codex-outcome tsl-codex-outcome--hit"><b>✓ Hit:</b> ${hit}</div>
          <div class="tsl-codex-outcome tsl-codex-outcome--miss"><b>✗ Miss:</b> ${miss}</div>
          ${sides}
          ${how}${ex}
          <div class="tsl-codex-tactic"><i>${esc(REAL_TACTIC[m.id] ?? "")}</i></div>
        </div>`;
      }).join("");
      return `<details class="tsl-codex-sub" open><summary class="tsl-codex-sub-title">${SCHOOL_LABEL[g]}</summary>${rows}</details>`;
    }).join("");
    const numbers = `
      <details class="tsl-codex-sub">
        <summary class="tsl-codex-sub-title">Where the numbers come from</summary>
        <div class="tsl-codex-combo"><b>Your roll</b> — a d20 + the move's <b>main skill</b>, plus your <b>proficiency bonus</b> if you're trained in its <b>support skill</b> (plus any situation bonus). A <b>natural 1</b> always misses. On A5E this opens the system's own check dialog.</div>
        <div class="tsl-codex-combo"><b>Composure</b> <span class="tsl-codex-gain">the one track — everyone has it</span> — <b>2 + CHA + WIS</b> (never below 2): force of personality and self-possession. A mook (~2) cracks in a hit or two; a hardened noble (~8) takes four or five — or two heavy blows on a weak spot. A landed maneuver takes it by school (General 1 · archetype schools 2 · Humiliate 3), +1 on a weak spot, +1 on a clean hit; <b>your own misses</b> take yours (1, a risky move 2). At 0 the exchange is lost.</div>
        <div class="tsl-codex-combo"><b>Social DC</b> <span class="tsl-codex-gain">how hard they are to move</span> — the higher of their passive Insight, or <b>10 + their WIS save + INT save</b> (proficiency baked in, so a save-hardened target really resists). ${game.user.isGM ? "You see it; players don't." : "You never see the number — difficulty is learned by trying."}</div>
        <div class="tsl-codex-combo"><b>Strings</b> <span class="tsl-codex-gain">trump cards</span> — spend one for <b>+5</b>: after a miss against that person, or pulled for your next attack, check or save against them (or AC). Earned by opening your heart in play, by maneuvers that hand you a lever, or by winning an exchange.</div>
        <div class="tsl-codex-hint-sm">Press a move their <b>nature is immune</b> to and it backfires — no effect, it costs you like a miss, they Answer, and they turn <b>Defiant</b> (maneuver-proof until a successful <b>Read Them</b> cracks it).</div>
        <div class="tsl-codex-hint-sm">Once someone gives in or storms off, that exchange is over for them — no more maneuvers until the GM resets it (Chronicle → Fencing) or play moves to another scene.</div>
      </details>`;
    const moves = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The moves</div>
        <div class="tsl-codex-hint-sm"><b>General</b> holds the basics anyone reaches for — read · mock · goad · persuade · threaten · lie — plus <b>Reassure</b>, the one you aim at a friend. The other three schools are the archetype game. Each line shows what it <b>rolls</b>, what a <b>✓ Hit</b> does and what a <b>✗ Miss</b> costs; the <b>▸</b> line is how you play it; the <b>quote</b> is something you might say; the small <i>italic</i> is the real tactic it models.</div>
        <div class="tsl-codex-hint-sm tsl-codex-safety"><b>A note on content.</b> Several moves model real manipulation tactics — love bombing, triangulation, guilt-tripping, sowing doubt. They're here because intrigue needs people who use them. Agree on lines & veils at session zero, keep a safety tool (the X-card, Script Change) on the table, and let anyone step out of a scene when they need to — Thirsty Sword Lesbians treats that as part of play, not an interruption.</div>
        ${numbers}
        ${movesRef}
      </section>`;

    // ── Nature: Leanings + When pressed, then the nine archetypes ────────────
    const ST = SocialArchetypeManager.PRESSED_STANCES;
    const triadBlocks = Object.values(SOCIAL_TRIADS).map(triad => {
      const cards = SOCIAL_ARCHETYPES.filter(a => a.triad === triad.id).map(a => this._buildArchetypeCard(a, true)).join("");
      return `
        <section class="tsl-notes-section tsl-codex-triad" style="--triad-color:${triad.color}">
          <div class="tsl-codex-triad-head"><i class="fas ${triad.icon}"></i> ${esc(triad.label)}</div>
          <div class="tsl-codex-triad-hint">${esc(triad.hint)}</div>
          ${cards}
        </section>`;
    }).join("");
    const natures = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Nature — how someone fights with words</div>
        <div class="tsl-codex-hint-sm">Everyone — player character or NPC — has the same two halves, set in <b>Chronicle → Profile → Nature</b>.</div>
        <div class="tsl-codex-combo"><b>Leanings</b> <span class="tsl-codex-gain">the schools you reach for</span> — ${TRIAD_POINT_POOL} dots across Power, Emotion and Reason. <b>+1 per dot</b> on that school's maneuvers; <b>−1</b> on a school with none while you lean elsewhere. For a player character each dot also adds +1 to a skill on the sheet (Power → Intimidation, Emotion → Insight, Reason → Deception). A clear lead (2+ dots, ahead of the rest) is your <b>ruling school</b> — how others read you: the school that beats it gets +2 against you, the one it beats −2, and a bad miss against you earns your Answer. An NPC's archetype is its ruling school; with no dots of its own it leans that way (●●).</div>
        <div class="tsl-codex-combo"><b>When pressed</b> <span class="tsl-codex-gain">how you hold up</span> — it decides two moments: a <b>state</b> put on you (accept it, or ${term("Hold the Line")}) and your <b>composure breaking</b> (${term("give in")} or ${term("storm off")}).
          <ul class="tsl-codex-how">${Object.values(ST).map((st) => `<li><b>${esc(st.label)}</b> — ${esc(st.tip.replace(/^./, (ch) => ch.toLowerCase()))}</li>`).join("")}</ul></div>
        <div class="tsl-codex-hint-sm"><b>The hidden half (NPCs).</b> The GM also gives an NPC an <b>archetype</b> — which maneuvers cut deep (◎) and which bounce off (✕). It is never handed to players: deduce it, write your guess in their Bond (“Read as”), and your chip marks follow your read. Each nature has at least one weak spot and one wall, and the traps sit INSIDE a school, so knowing the school isn't enough.</div>
        <div class="tsl-codex-hint-sm"><b>Where they come from.</b> The three schools follow the psychoanalyst Karen Horney's three ways people cope with others — <b>against</b> them (Power), <b>toward</b> them (Emotion), <b>away</b> from them (Reason). Each nature is drawn from a recognised character type, named on its card with what it's strong against, weak to, and how it holds up when pressed. Play the person, not the label.</div>
      </section>
      ${triadBlocks}`;

    // ── Details: reading, schools, Strings, holding the line, bonds ───────────
    const reference = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The details</div>
        ${sub("Read them — nature is hidden", [
          `No one is handed the archetype. A successful <b>Read Them</b> whispers a private <b>tell</b> — deduce who they are and note your guess in the Bond (“Read as”).`,
          `Once you write a guess, the chip marks (◎ weak spot · ✕ walled · ▲ yields) follow <b>your read</b> — a theory, so a wrong guess shows wrong marks. The <b>difficulty</b> stays the GM's to know. Outcomes are the proof: an unexpected bounce, a surprise clean hit, a whispered tell tell you if your read was right.`,
        ])}
        ${sub("Schools beat schools — rock, paper, scissors", [
          `Every nature rules one school, and the three cycle: <b>Power breaks Emotion · Emotion cracks Reason · Reason binds Power.</b>`,
          `Press the school that <b>beats</b> their nature: <b>+2</b>. Press the school their nature <b>beats</b>: <b>−2</b>. Their <b>own</b> school is even — 0.`,
          `You are never told which it was — you feel it in the results.`,
        ])}
        ${sub("Reading the chip corners", [
          `<b>⊕</b> — an ${term("opening")} is live: this maneuver gains a bonus because of something they carry. Everyone sees ⊕; it reads off visible states and Wounds.`,
          `<b>◎</b> weak spot · <b>✕</b> walled · <b>▲</b> their nature yields to this school. These follow <b>your read</b> — guess wrong and the marks are wrong; the OUTCOME sets you straight. No guess yet → no marks. (The GM always sees the truth.)`,
        ])}
        ${sub("Grades & the Answer", [
          `A <b>clean hit</b> (5+ over) takes 1 more composure. A <b>bad miss</b> (5+ under) — or pressing a nature where it can't be reached — earns ${term("the Answer")}.`,
          `The GM confirms close calls (within 2 of the number, or a natural 1); a clear result simply applies.`,
          `Fumble that badly as a player and you gain <b>Inspiration</b> — losing spectacularly is worth something.`,
        ])}
        ${sub("Strings — earned, then spent (in a fight too)", [
          `A ${term("String")} is a hold on a person. You earn one by <b>opening up</b> in character (a true fear, a confession — the GM grants it on the person you bared yourself to), by maneuvers that <b>hand you a lever</b> (Read Them, Lie, Play Weak, Bargain, Cross-Examine, Charm), or by <b>winning an exchange</b>.`,
          `<b>After a miss</b> against that person you're offered to burn one for <b>+5</b> — decided after you see the die, against a hidden number.`,
          `<b>Pull it</b> (Chronicle → Bonds → <b>Pull</b>) and choose: <b>Strike</b> — +5 to your next attack roll, ability check or saving throw against them; or <b>Guard</b> — +5 AC against their next attack. It goes on your sheet as a <b>real effect</b> and ends by itself once used — so it works in the middle of a fight.`,
          `At most <b>${typeof STRING_CAP !== "undefined" ? STRING_CAP : 3} Strings on any one person</b> — a few deep levers, not a stack.`,
        ], true)}
        ${sub("Hold the line — when a state lands on YOU", [
          `The words can't be unsaid, but you may ${term("Hold the Line")}: refuse the <b>state</b> by carrying the matching lasting <b>Wound</b> instead — refuse Provoked and it festers as Wrath or a Grudge. The composure hit still lands.`,
          `Not against the one who provoked you (anger drops the guard), not with that Wound already at ●●●, and not once you're ${term("Overwhelmed")} — then every state lands.`,
          `Which Wound you choose matters: it opens matching maneuvers against you (+2) until the story heals it.`,
        ])}
        ${sub("Win or lose — composure", [
          `One track for everyone: ${term("Composure")}. Their hits take yours; your misses take yours too. Whoever reaches 0 first has lost the exchange.`,
          `The loser chooses how: ${term("give in")} (concede — the bond toward the winner deepens) or ${term("storm off")} (refuse — but carry a Grudge, and the bond cools). Either way the winner takes a String. Someone <b>Desperate</b> can't storm off from the one they're desperate about, and someone <b>Enthralled</b> would never storm off from the one who charmed them — anyone else, they can.`,
          `A <b>natural 1</b> always misses, however big your bonus.`,
          ...(tslOn ? [`Or win honestly: the 2d6 <b>Feelings</b> moves (Speak from the Heart, Read the Room) take composure and reveal nature <b>without</b> manipulation.`] : []),
          `${term("leverage")} (once each per exchange): <b>Desire</b> (Advantage, +1 composure off them), <b>Fear</b> (+3 to the roll — but a miss costs you 1 more), <b>Weakness</b> (an ordinary approach lands like a weak spot).`,
        ])}
        ${sub("The relationship is the terrain", [
          `A ${term("bond")} is <b>ONE shared relationship</b> — one TYPE, one STRENGTH (0–3 ●). Write it on either person and it appears on both. (Directional pairs flip to fit: your <b>Mentor</b> is their <b>Protégé</b>; if you're <b>Sworn</b> to someone, they are your <b>Liege</b>.)`,
          `It works both ways at once: your <b>weapon</b> — its school gets <b>+●</b> — and their <b>guard</b>: a friend, lover or the one sworn to you opens up (easier), an enemy is wary (harder).`,
          `<b>Every type also bends specific skills, ±● — an edge AND a cost.</b> You can't threaten a friend (−● Intimidation), can't lie to your own blood (−● Deception), can't sweet-talk hatred (−● Persuasion vs an enemy). Hover any bond type to see its edges.`,
          `Your read of them and your notes stay <b>private</b> — only the relationship itself is shared.`,
          ...(fullLayer ? [`<b>Deep bonds grant abilities.</b> At <b>●●</b> a relationship unlocks a distinctive ability; at <b>●●●</b> a <b>signature</b> you invoke once per long rest — its automatic part lands on both sheets and ends itself after the roll (the <b>Invoke</b> button on the Bond).`] : []),
          `Closeness costs: land a <b>Power</b> play on a friend, family, a lover, your protégé, your liege or a confidant and it works — but they gain a <b>String</b> on you.`,
          `Losing moves the bond: the one who gives in grows closer to the winner (+1●); the one who storms off cools toward them (−1●). For an Enemy or Rival it runs the other way.`,
        ])}
        ${sub("Bonds reach into a real fight", [
          `Standing within <b>${(() => { try { return game.settings.get("tsl-social-conflict", "bondAuraRange"); } catch { return 15; } })()} ft</b> of someone you're bonded to changes how you <b>fight</b> — automatically, as tokens move. Every relationship does something different, and it doubles at ●●● (any one line caps at ±2).`,
          ...BOND_TYPES.filter(t => t.combatAura).map(t => {
            const a = t.combatAura;
            const nm = { attack: "attack rolls", damage: "weapon damage", save: "saving throws", check: "ability checks", ac: "AC", init: "initiative", spellDC: "spell save DC", maneuverDC: "maneuver DC" };
            const bits = Object.entries(a).filter(([k]) => k !== "label")
              .map(([k, v]) => `<b>${v > 0 ? "+" : "−"}${Math.abs(v)}</b> ${nm[k]}`).join(", ");
            return `<b>${t.label}</b> — “${a.label}”: ${bits}`;
          }),
          `While any of this is live you carry a <b>Bonds in reach</b> mark on your token. It comes and goes on its own as people move — nobody switches it by hand.`,
        ])}
      </section>`;

    const gm = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Running it (GM)</div>
        ${sub("Setting the scene", [
          `<b>Draw blades only when it's real:</b> the NPC is unwilling AND the stakes matter. A favor, an easy lie, a routine haggle is one ordinary check, not an exchange.`,
          `<b>Size the ask by composure:</b> a mook (~2) cracks in a hit or two; a hardened noble (~8) takes four or five — or two heavy blows on a weak spot. Nudge it in their Chronicle → Fencing. Demand played leverage for the impossible; nobody betrays their king over a nice speech.`,
          `<b>Safety first:</b> these moves include real abuse tactics (love bombing, triangulation, guilt-tripping, sowing doubt). Set lines & veils at session zero and keep an X-card or Script Change in reach — especially when an NPC turns them on a player character.`,
          `<b>A crowd hardens people:</b> +1 DC per extra voice pressing the same target (the situational modifier). Let the party pick one speaker; the rest pass Strings, Reassure, and leverage.`,
        ])}
        ${sub("Playing the opponent", [
          `<b>NPCs act on their nature:</b> each NPC's <b>When pressed</b> (Profile → Nature) decides on its own whether it accepts a state or holds the line, and whether it gives in or storms off when broken — by default from its archetype (each card says which). Set <b>Decide each time</b> on the ones you want to steer by hand.`,
          `<b>Both sides play:</b> give each NPC an <b>Agenda</b> (Profile → GM field) — what THEY want. Answer player maneuvers with the NPC's own: press back, demand, bluff. A Provoked NPC <i>must</i> come at whoever provoked it.`,
          `<b>Losing must cost:</b> if the NPC wins the exchange, its Agenda advances.`,
          `<b>Composure is everyone's clock:</b> misses cost the one who misses, on both sides. When an NPC is low, play them fraying — shorter answers, a glance at the door.`,
          `<b>States run themselves</b> — they're spent by use, time (advance the clock), rounds in a fight, or a long rest. Clear any by hand with × (conflict card, or their Fencing tab).`,
        ])}
        ${sub("Rewarding play", [
          `<b>Reward open hearts:</b> when a player truly opens up, grant a <b>String</b> on the one they opened up to (💖 on the conflict card, or the Bonds tab). This is the main way Strings should enter play.`,
          `<b>You have the final word</b> on close calls: the grade is pre-selected — one click.`,
        ])}
      </section>`;

    // One long scroll was too much — split it into pickable categories.
    const cats = [
      { id: "start",    label: "Start",    icon: "fa-play",          html: quickStart + (fencingOn ? walkthrough : "") },
      { id: "moves",    label: "Moves",    icon: "fa-hand-fist",     html: moves,          needs: "fencing" },
      { id: "statuses", label: "States",   icon: "fa-bolt",          html: statuses,       needs: "fencing" },
      { id: "openings", label: "Openings", icon: "fa-plus",          html: comboReference, needs: "fencing" },
      { id: "feelings", label: "Feelings", icon: "fa-heart",         html: this._buildFeelingsCodex() },
      { id: "natures",  label: "Nature",   icon: "fa-masks-theater", html: natures,        needs: "fencing" },
      { id: "details",  label: "Details",  icon: "fa-book",          html: reference },
      { id: "gm",       label: "GM",       icon: "fa-crown",         html: gm, gmOnly: true },
    ].filter(c => (!c.gmOnly || game.user.isGM) && (c.needs !== "fencing" || fencingOn));

    if (!cats.some(c => c.id === this._codexCat)) this._codexCat = cats[0].id;
    const nav = cats.map(c =>
      `<button type="button" class="tsl-codex-cat ${this._codexCat === c.id ? "active" : ""}" data-codex-cat="${c.id}">
         <i class="fas ${c.icon}"></i> ${c.label}
       </button>`).join("");

    return `
      <div class="tsl-codex-nav">${nav}</div>
      ${cats.find(c => c.id === this._codexCat).html}`;
  }

  // ── Bonds tab ───────────────────────────────────────────────────────────────

  _buildBondsTab({ bonds, candidates, canEdit, isGM }) {
    const esc      = foundry.utils.escapeHTML;
    const disabled = canEdit ? "" : "disabled";

    const typeOpts = (selected) => BOND_TYPES.map(t =>
      `<option value="${t.id}" ${selected === t.id ? "selected" : ""}>${t.label}</option>`
    ).join("");

    const archOpts = (selected) => [
      `<option value="">? Unknown</option>`,
      ...SOCIAL_ARCHETYPES.map(a =>
        `<option value="${a.id}" ${selected === a.id ? "selected" : ""}>${a.label}</option>`),
    ].join("");

    // Bond STRENGTH 0–3 ● — how deep this relationship runs. Old ±attitude
    // saves read as their absolute value.
    const bondStr = (bond) => Math.min(3, Math.abs(bond.attitude ?? 0));
    const attitudeDots = (bond) => Array.from({ length: 4 }, (_, v) =>
      `<button class="tsl-chr-att-dot ${bondStr(bond) === v ? "active" : ""} ${v > 0 && v <= bondStr(bond) ? "filled" : ""} ${v > 0 ? "pos" : "zero"}"
              data-bond-id="${bond.id}" data-attitude="${v}" ${disabled}
              data-tooltip="${v === 0 ? "Faded — no bond effects" : `Strength ${v}: ${"●".repeat(v)} — scales the bond's buffs and their guard`}">${v === 0 ? "✕" : ""}</button>`
    ).join("");

    // Collapsed one-line summaries; click a row to unfold its editors.
    const rows = bonds.length ? bonds.map(b => {
      const type = SocialArchetypeManager.getBondType(b.type);
      const open = this._expandedBonds.has(b.id);
      const perceived = SOCIAL_ARCHETYPES.find(a => a.id === b.perceivedArchetypeId);
      const bStr    = Math.min(3, Math.abs(b.attitude ?? 0));
      const attCls  = bStr > 0 ? "pos" : "zero";
      const attText = bStr > 0 ? "●".repeat(bStr) : "○";
      // Every read is a guess now — the pencil is a reminder, not a verdict
      const knownDot = perceived
        ? `<i class="fas fa-pencil tsl-chr-known-dot tsl-chr-known-dot--no" data-tooltip="Your read — may be wrong"></i>`
        : "";

      const details = !open ? "" : `
        <div class="tsl-chr-bond-details">
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="${esc(type.hint)}">Bond</span>
            <select class="tsl-chr-bond-type" data-bond-id="${b.id}" ${disabled}>${typeOpts(b.type)}</select>
            ${canEdit ? `<button class="tsl-chr-bond-remove" data-bond-id="${b.id}" data-tooltip="Remove bond">✕</button>` : ""}
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="How deep the bond runs, 0–3 ●. It scales everything the bond TYPE gives — your +● weapon school, their DC guard, and the type's skill edges and costs (±●). Giving in to them deepens it; storming off from them cools it (an Enemy or Rival runs the other way).">Strength</span>
            <div class="tsl-chr-att-track">${attitudeDots(b)}</div>
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="Your working guess at their archetype — deduce it from the tells Read Them whispers and from what happens when you roll. Refine it as you learn; the GM plays their true nature either way.">Read as</span>
            <select class="tsl-chr-bond-arch" data-bond-id="${b.id}" ${disabled}>${archOpts(b.perceivedArchetypeId)}</select>
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="Strings you hold on them — emotional leverage, at most ${STRING_CAP} on one person. A String gives nothing while held: you SPEND it for +5 — after a miss against them, or Pulled.">Strings</span>
            <span class="tsl-chr-str-pips" data-tooltip="${b.stringCount} / ${STRING_CAP}">${"●".repeat(Math.min(STRING_CAP, b.stringCount))}${"○".repeat(Math.max(0, STRING_CAP - b.stringCount))}</span>
            ${canEdit ? `
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="1"  data-tooltip="${b.stringCount >= STRING_CAP ? `At the limit — you can hold at most ${STRING_CAP} Strings on one person` : `Gain a string on them (at most ${STRING_CAP} on one person)`}" ${b.stringCount >= STRING_CAP ? "disabled" : ""}>+</button>
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="-1" data-tooltip="Spend / remove a string" ${b.stringCount ? "" : "disabled"}>−</button>
              <button class="tsl-chr-str-pull" data-target="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
                data-tooltip="PULL THE STRING — burn 1 and choose: STRIKE (+5 to your next attack roll, ability check or saving throw against them) or GUARD (+5 AC against their next attack). It lands on your sheet as a real effect and ends by itself once used — it works mid-fight. Posts a public card.">Pull +5</button>` : ""}
          </div>
          <input type="text" class="tsl-chr-bond-notes" data-bond-id="${b.id}" value="${esc(b.notes)}"
                 placeholder="History, debts, secrets between you…" ${disabled} />
          ${(() => {
            if (bStr < 2 || !(typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer())) return "";
            const ab = SocialArchetypeManager.getBondAbility(b.type);
            if (!ab) return "";
            return `
              <div class="tsl-chr-ability" data-tooltip="A close (●●) bond grants a distinctive ability — passive or situational, the GM adjudicates when it fits.">
                <div class="tsl-chr-ab-head"><i class="fas fa-link"></i> Ability (●●) — <b>${esc(ab.label)}</b></div>
                <div class="tsl-chr-ab-text">${esc(ab.text)}</div>
              </div>`;
          })()}
          ${(() => {
            if (bStr !== 3 || !(typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer())) return "";
            const sig = SocialArchetypeManager.getBondSignature(b.type);
            if (!sig) return "";
            return `
              <div class="tsl-chr-signature ${b.sigUsed ? "used" : ""}" data-tooltip="A fully-realized (●●●) bond grants a signature you may invoke once per long rest. What is marked (automatic) goes on the sheets — yours and theirs — and ends itself after the roll; what is marked (GM) the table plays.">
                <div class="tsl-chr-sig-head"><i class="fas fa-star"></i> Signature (●●●) — <b>${esc(sig.label)}</b></div>
                <div class="tsl-chr-sig-text">${esc(sig.text)}</div>
                ${canEdit ? (b.sigUsed
                  ? `<div class="tsl-chr-sig-used">Spent — refreshes on a long rest.</div>`
                  : `<button class="tsl-chr-sig-use" data-bond-id="${b.id}" data-target="${b.targetActorId}">Invoke</button>`) : ""}
              </div>`;
          })()}
          ${this._buildBondDossier(b)}
        </div>`;

      return `
      <div class="tsl-chr-bond ${open ? "open" : ""}" data-bond-id="${b.id}">
        <div class="tsl-chr-bond-head" data-bond-toggle="${b.id}">
          <img class="tsl-chr-bond-img" src="${b.targetImg}" alt="">
          <span class="tsl-chr-bond-name">${esc(b.targetName)}</span>
          <span class="tsl-chr-bond-tag" data-tooltip="${esc(type.hint)}"><i class="fas ${type.icon}"></i> ${type.label}</span>
          ${perceived ? `<span class="tsl-chr-bond-tag" data-tooltip="Read as ${esc(perceived.label)}"><i class="fas ${SOCIAL_TRIADS[perceived.triad]?.icon ?? "fa-user"}"></i></span>` : ""}
          ${knownDot}
          <span class="tsl-chr-att-badge tsl-chr-att-badge--${attCls}" data-tooltip="Bond strength">${attText}</span>
          ${b.stringCount ? `<span class="tsl-chr-bond-strings" data-tooltip="Strings held on them"><i class="fas fa-masks-theater"></i>${b.stringCount}</span>` : ""}
          <i class="fas fa-chevron-${open ? "up" : "down"} tsl-chr-bond-chevron"></i>
        </div>
        ${details}
      </div>`;
    }).join("") : `<div class="tsl-notes-string-empty">No bonds recorded yet.</div>`;

    const addControls = canEdit ? `
      <div class="tsl-chr-add">
        <select class="tsl-chr-add-select">
          <option value="">— Add a bond… —</option>
          ${candidates.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}
        </select>
        <button class="tsl-chr-pick-btn ${this._picking && this._pickMode === "bond" ? "picking" : ""}"
                data-bond-pick data-tooltip="Pick from canvas: click a visible token on the map to bond with it. Esc cancels.">
          <i class="fas fa-crosshairs"></i> ${this._picking && this._pickMode === "bond" ? "Click a token… (Esc)" : "Pick token"}
        </button>
      </div>` : "";

    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="The chronicle of ${foundry.utils.escapeHTML(this._actor.name)}'s relationships. Attitude shifts fencing DCs; 'Read as' is what they believe about others.">Bonds</div>
        ${addControls}
        <div class="tsl-chr-bond-list">${rows}</div>
      </section>`;
  }

  /**
   * Profile the bonded target from inside the bond — the same Desire / Fear /
   * Weakness / Mask / Line dossier as their own Profile tab, with the same
   * hints. Writes to the TARGET's flags, so it's editable only by their
   * GM/owner; otherwise it shows read-only what has been learned.
   */
  _buildBondDossier(b) {
    if (game.settings.get("tsl-social-conflict", "conflictMode") === "tsl") return "";
    const esc = foundry.utils.escapeHTML;
    const target = game.actors.get(b.targetActorId);
    if (!target) return "";
    const canEditTarget = game.user.isGM || target.isOwner;
    const notes = SocialArchetypeManager.getCharacterNotes(target);
    const dis = canEditTarget ? "" : "disabled";

    const rows = PROFILE_POINTS.map(p => `
      <div class="tsl-chr-point">
        <span class="tsl-chr-point-label" data-tooltip="${esc(p.hint)}"><i class="fas ${p.icon}"></i> ${p.label}</span>
        <input type="text" class="tsl-bond-point" data-target="${b.targetActorId}" data-point="${p.id}"
               value="${esc(notes.points[p.id] ?? "")}" placeholder="${esc(p.placeholder)}" ${dis} />
      </div>`).join("");

    const note = canEditTarget
      ? `<div class="tsl-fc-note">Fill Desire / Fear / Weakness to unlock leverage cards against them.</div>`
      : `<div class="tsl-fc-note">Only ${esc(target.name)}'s GM can edit this — it shows what you've learned.</div>`;

    return `
      <div class="tsl-bond-dossier">
        <div class="tsl-bond-dossier-title" data-tooltip="Profile ${esc(target.name)} — their profiling points. Hover each for what it means and how to use it.">Their dossier</div>
        ${rows}
        ${note}
      </div>`;
  }

  // ── Fencing tab: personal maneuver console + (GM) status board ──────────────

  _buildFencingTab(ctx) {
    // Order: ACT first (the console — target, maneuvers, the roll and its
    // result in one place), then this character's own composure, states and
    // the levers they hold, then the lasting emotional layer (Willpower →
    // Wounds → Boons → Scars), and for the GM the scene board at the end.
    // The BASIC emotional layer is the Wounds alone (world setting).
    const fullLayer  = (typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer());
    return this._buildManeuverConsole(ctx)
      + this._buildSelfFencing(ctx)
      + (fullLayer ? this._buildWillpowerPanel(ctx) : "")
      + this._buildWoundToggles(ctx)
      + (fullLayer ? this._buildBoonToggles(ctx) : "")
      + (fullLayer ? this._buildScarsSection(ctx) : "")
      + (ctx.isGM ? this._buildStatusBoard() : "");
  }

  /**
   * One composure line — pips + count. Before the exchange starts it shows,
   * faded, what they'll start with, so the number is never a mystery.
   */
  _composureHTML(actor, own = false) {
    const esc = foundry.utils.escapeHTML;
    const enc = SocialEncounterManager.getEncounter(actor);
    if (enc.outcome) {
      return `<div class="tsl-chr-outcome tsl-chr-outcome--${enc.outcome}" data-tooltip="${esc(SocialEncounterManager.outcomeTip(enc.outcome))}">${
        enc.outcome === "swayed" ? `<i class="fas fa-handshake"></i> Gave in` : `<i class="fas fa-door-open"></i> Stormed off`}</div>`;
    }
    const live = !!enc.active;
    const max  = live ? (enc.maxComposure ?? 0) : SocialEncounterManager.suggestTracks(actor).composure;
    const cur  = live ? (enc.composure ?? 0) : max;
    const pips = Array.from({ length: max }, (_, i) =>
      `<span class="tsl-notes-pip tsl-notes-pip--composure ${i < cur ? "filled" : ""}"></span>`).join("");
    const who  = own ? "Your" : "Their";
    const tip  = `${who} composure — how much pressure ${own ? "you" : "they"} can take before cracking: 2 + CHA + WIS (never below 2).${live ? "" : " Not pressed yet — this is the starting value."} A maneuver that lands takes it down (1–3 by school, +1 on a weak spot, +1 on a clean hit); every miss costs the one who missed. At 0 the exchange is lost: give in (concede), or storm off and carry a Grudge.`;
    return `<div class="tsl-comp ${live ? "" : "tsl-comp--idle"} ${live && cur <= Math.max(1, Math.floor(max / 3)) ? "tsl-comp--low" : ""}" data-tooltip="${esc(tip)}">
      <span class="tsl-comp-label">Composure</span><span class="tsl-comp-pips">${pips}</span>
      <span class="tsl-comp-count">${live ? `${cur}/${max}` : `starts at ${max}`}</span>
    </div>`;
  }

  /**
   * A state as a tag: the full rule on hover (one wording everywhere), an ×
   * for the GM, and a lever button when THIS character is the one who can
   * call it in (Beholden → call the debt · Enthralled → ask a favor).
   */
  _stateTag(c, onActor, clearable = false) {
    const esc    = foundry.utils.escapeHTML;
    const holder = c.sourceActorId ? game.actors.get(c.sourceActorId) : null;
    const tip    = SocialArchetypeManager.stateTooltip(c.id, { charges: c.charges, source: holder?.name ?? null });
    const x = clearable
      ? `<button class="tsl-tag-x" data-clear-state="${c.id}" data-tooltip="Clear ${esc(c.meta.label)}">×</button>` : "";
    const lever = (c.meta.lever && holder && holder.id === this._actor.id && onActor.id !== this._actor.id)
      ? `<button class="tsl-lever-btn" data-call-lever="${c.id}" data-holder="${holder.id}" data-target-actor="${onActor.id}"
           data-tooltip="${esc(`${c.meta.lever.label}: ${onActor.name} ${c.meta.lever.text}.`)}"><i class="fas ${c.meta.lever.icon}"></i> ${esc(c.meta.lever.label)}</button>`
      : "";
    return `<span class="tsl-status-tag ${c.meta.positive ? "tsl-status-tag--good" : ""}" style="--st-color:${c.meta.color ?? "#806858"}"
      data-tooltip="${tip.replaceAll('"', "&quot;")}">${esc(c.meta.label)}${c.charges > 1 ? " ×2" : ""}${x}</span>${lever}`;
  }

  /**
   * Willpower panel — the emotional-layer resource, shown in the Fencing tab.
   * Pool = proficiency bonus, refilled on a long rest. Spend it on an Ultimate
   * or to push past a Wound's block; restore it by giving in to a Wound's urge.
   * The − / + buttons let the owner (or GM) adjust it by hand.
   */
  _buildWillpowerPanel(ctx) {
    if (!ctx.willpower) return "";
    const { cur, max } = ctx.willpower;
    const dots = `${"◆".repeat(Math.max(0, cur))}${"◇".repeat(Math.max(0, max - cur))}`;
    return `
      <section class="tsl-notes-section tsl-wp-panel">
        <div class="tsl-notes-section-title" data-tooltip="Willpower — your emotional reserve across the days (not Composure: that's how much pressure you take inside one exchange). Pool = proficiency bonus, refilled on a long rest. Spend 1 to power an Ultimate (Wound / Boon / Scar) or push past a Wound's hard block; restore 1 by GIVING IN to a Wound's urge (the Give in button on the Wound).">⬡ Willpower</div>
        <div class="tsl-wp-row">
          <button class="tsl-wp-btn" data-wp="-1" data-tooltip="Spend 1 — an Ultimate, or overriding a Wound's block" ${cur <= 0 ? "disabled" : ""}>−</button>
          <span class="tsl-wp-dots" data-tooltip="${cur} / ${max}">${dots}</span>
          <button class="tsl-wp-btn" data-wp="1" data-tooltip="Restore 1 — you gave in to a Wound's urge" ${cur >= max ? "disabled" : ""}>+</button>
          <span class="tsl-wp-num">${cur}/${max}</span>
        </div>
      </section>`;
  }

  /**
   * The Boons (positive emotions) as on/off toggles for THIS character —
   * GM-given rewards for courage, love, triumph or grit. Mirrors the ❤ Wounds
   * menu (tier ▲/▼, dossier tooltip) but they don't count toward Overwhelmed.
   * Handler keys on [data-boon].
   */
  _buildBoonToggles(ctx) {
    if (typeof TSLConditionEffects === "undefined" || !TSLConditionEffects.BOON_ORDER) return "";
    const esc = foundry.utils.escapeHTML;
    const btns = TSLConditionEffects.BOON_ORDER.map(id => {
      const m = TSLConditionEffects.getMeta(id);
      if (!m) return "";
      const tier = Number(ctx.activeBoons?.[id]) || 0;
      const on   = tier > 0;
      const tip  = TSLConditionEffects.dossier(id, tier || 1, "them");
      const dots = on ? `<span class="tsl-wound-tier tsl-boon-tier">${"●".repeat(tier)}${"○".repeat(3 - tier)}</span>` : "";
      const steps = on ? `<span class="tsl-wound-steps">
          <button class="tsl-wound-ease" data-boon-ease="${id}" data-tooltip="Lower one tier — below the first it fades">▼</button>
          <button class="tsl-wound-deepen" data-boon-deepen="${id}" data-tooltip="Raise one tier — up to ●●●" ${tier >= 3 ? "disabled" : ""}>▲</button>
        </span>` : "";
      const wp = ctx.willpower?.cur ?? 0;
      const ultBtn = (tier >= 3 && m.ultimate)
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-ult-kind="boon" data-tooltip="<b>${esc(m.ultimate.name)}</b>: ${esc(m.ultimate.text)}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
      return `<div class="tsl-wound-row tsl-boon-row ${on ? "on" : ""}">
        <button class="tsl-cond-toggle tsl-boon-toggle ${on ? "active" : ""}" data-boon="${id}" data-tooltip="${tip}">
          <img src="${m.icon}" alt=""><span>${esc(m.label)}</span>${dots}
        </button>${steps}${ultBtn}
      </div>`;
    }).join("");
    const active = Object.values(ctx.activeBoons ?? {}).filter(Boolean).length;
    const names  = TSLConditionEffects.BOON_ORDER.map(id => TSLConditionEffects.getMeta(id)?.label).filter(Boolean).join(" / ");
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Positive emotions the GM grants for courage, love, triumph or grit (${esc(names)}). Each gives a scaling bonus and a ●●● ultimate (spend 1 Willpower). They do NOT count toward Overwhelmed, and a long rest ends them.">✦ Boons</div>
        <div class="tsl-cond-grid">${btns}</div>
        ${active ? `<button class="tsl-cond-clear tsl-boon-clear" data-tooltip="Remove all Boons from ${esc(this._actor.name)}.">Clear all boons</button>` : ""}
      </section>`;
  }

  /**
   * Permanent Scars — what a Wound becomes when left at ●●● through a long rest.
   * Shown only when the character carries at least one (they're not a menu you
   * fill; the GM/owner can toggle each off/on). A Scar with an active ultimate
   * gets a ⚡ (spend 1 Willpower). Keyed on [data-scar]; violet accent.
   */
  _buildScarsSection(ctx) {
    if (typeof TSLConditionEffects === "undefined" || !TSLConditionEffects.SCAR_ORDER) return "";
    const esc = foundry.utils.escapeHTML;
    const active = ctx.activeScars ?? [];
    if (!active.length && !ctx.isGM) return "";   // players only see it once they have one
    const wp = ctx.willpower?.cur ?? 0;
    // Retired scars (Vendetta, Bound Heart) still show if someone carries one,
    // so it can be read and lifted.
    const ids = [...TSLConditionEffects.SCAR_ORDER, ...active.filter(id => !TSLConditionEffects.SCAR_ORDER.includes(id))];
    const btns = ids.map(id => {
      const m = TSLConditionEffects.getScarMeta(id);
      if (!m) return "";
      const on  = active.includes(id);
      const tip = TSLConditionEffects.scarDossier(id);
      const ultBtn = (on && m.ultimate)
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-ult-kind="scar" data-tooltip="<b>${esc(m.ultimate.name)}</b>: ${esc(m.ultimate.text)}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
      return `<div class="tsl-wound-row tsl-scar-row ${on ? "on" : ""}">
        <button class="tsl-cond-toggle tsl-scar-toggle ${on ? "active" : ""}" data-scar="${id}" data-tooltip="${tip}">
          <img src="${m.icon}" alt=""><span>${esc(m.label)}</span>
        </button>${ultBtn}
      </div>`;
    }).join("");
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Permanent character Scars — what a Wound about yourself becomes when it's left at ●●● through a long rest. Each grants an ability and a lasting cost, and makes you immune to the Wound it came from. They lift only through the story (the 'Clears' line), never a rest.">🩹 Scars</div>
        <div class="tsl-cond-grid">${btns}</div>
      </section>`;
  }

  /**
   * The lasting emotional Wounds as on/off toggles for THIS character.
   * The same wounds shown on the conflict card and the token HUD, here in the
   * Chronicle so they're managed from the token-opened window. Reuses the
   * toggle styling (.tsl-cond-*); handler keys on [data-wound].
   */
  _buildWoundToggles(ctx) {
    if (typeof TSLConditionEffects === "undefined") return "";
    const esc = foundry.utils.escapeHTML;
    const btns = TSLConditionEffects.ORDER.map(id => {
      const m = TSLConditionEffects.getMeta(id);
      if (!m) return "";
      const tier = Number(ctx.activeWounds[id]) || 0;
      const on   = tier > 0;
      const tip  = TSLConditionEffects.dossier(id, tier || 1, "them");   // raw HTML dossier
      const dots = on ? `<span class="tsl-wound-tier">${"●".repeat(tier)}${"○".repeat(3 - tier)}</span>` : "";
      const steps = on ? `<span class="tsl-wound-steps">
          <button class="tsl-wound-ease" data-wound-ease="${id}" data-tooltip="Ease one tier — below Light it heals">▼</button>
          <button class="tsl-wound-deepen" data-wound-deepen="${id}" data-tooltip="Press deeper — up to the breaking point" ${tier >= 3 ? "disabled" : ""}>▲</button>
        </span>` : "";
      const wp = ctx.willpower?.cur ?? 0;
      const ultBtn = (tier >= 3 && m.ultimate && TSLConditionEffects.isFullLayer())
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-ult-kind="wound" data-tooltip="<b>${esc(m.ultimate.name)}</b>: ${esc((m.ultimate.text ?? "").replace(/{source}/g, "them"))}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
      // Give in to the urge (VtM-style refuel): you act on it, at real cost,
      // and get 1 Willpower back (Inspiration for Despair). Posts a public card
      // so the table sees what was traded.
      const giveBtn = on && TSLConditionEffects.isFullLayer()
        ? `<button class="tsl-givein-btn" data-give-in="${id}" data-tooltip="Give in — ${esc((m.leanIn ?? "").replace(/\{source\}/g, "them"))} Posts it to chat so the table sees what you traded.">Give in</button>` : "";
      return `<div class="tsl-wound-row ${on ? "on" : ""}">
        <button class="tsl-cond-toggle tsl-wound-toggle ${on ? "active" : ""}" data-wound="${id}" data-tooltip="${tip}">
          <img src="${m.icon}" alt=""><span>${esc(m.label)}</span>${dots}
        </button>${steps}${giveBtn}${ultBtn}
      </div>`;
    }).join("");
    const active = Object.values(ctx.activeWounds).filter(Boolean).length;
    // Overwhelmed counts WEIGHT, not number: the sum of the Wounds' tiers.
    const load = Object.values(ctx.activeWounds).reduce((sum, t) => sum + (Number(t) || 0), 0);
    const overwhelmed = load >= 4
      ? `<div class="tsl-overwhelmed" data-tooltip="Wounds weighing 4 or more (the sum of their tiers) — Overwhelmed: this character can't hold the line any more — every state put on them lands.">⚠ Overwhelmed — Wounds weigh ${load}</div>`
      : load ? `<div class="tsl-wound-load" data-tooltip="The weight of your Wounds: the sum of their tiers (● = 1, ●● = 2, ●●● = 3). At 4 you are Overwhelmed — you can't hold the line any more.">Weight ${load} / 4</div>` : "";
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Lasting emotional Wounds on ${esc(this._actor.name)}. Each pushes them to act (an urge), escalates ● → ●● → ●●●, opens matching maneuvers against them (+2), and heals only through the story — a long rest eases it one step. They come from Holding the Line (a refused state turns into one), a public humiliation, a sincere Feelings move, or storming off (Grudge). Weight 4+ = Overwhelmed. A Wound about someone, left at ●●● overnight, becomes a bond with them.">❤ Wounds</div>
        <div class="tsl-cond-grid">${btns}</div>
        ${overwhelmed}
        ${active ? `<button class="tsl-cond-clear tsl-wound-clear" data-tooltip="Remove all Wounds from ${esc(this._actor.name)}.">Clear all wounds</button>` : ""}
      </section>`;
  }

  /**
   * The maneuver console — THIS character presses a chosen target: pick who,
   * see their composure and states, pick a maneuver, roll. The result shows
   * right where the Roll button was (the bar is pinned), so it never needs a
   * scroll to find. No GM-launched conflict required.
   */
  _buildManeuverConsole(ctx) {
    const esc = foundry.utils.escapeHTML;
    const src = this._actor;

    // Target candidates: scene tokens with an actor, excluding self.
    // Players only ever see tokens they can actually SEE — no hidden tokens,
    // nothing outside their vision (no metagaming a stranger off a list).
    const seen = new Set([src.id]);
    const targets = [];
    for (const t of (canvas.tokens?.placeables ?? [])) {
      if (!t.actor || seen.has(t.actor.id)) continue;
      if (!ctx.isGM && (t.document.hidden || !t.visible)) continue;
      seen.add(t.actor.id);
      targets.push({ id: t.actor.id, name: t.actor.name });
    }
    const targetOpts = targets.map(t =>
      `<option value="${t.id}" ${this._fenceTargetId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");

    const tgt = this._fenceTargetId ? game.actors.get(this._fenceTargetId) : null;
    let body;
    if (!tgt) {
      body = `<div class="tsl-fc-note">Choose who to press — a name above, or <b>Map</b> to click their token.</div>`;
    } else {
      // GM sees the truth; a player sees THEIR OWN GUESS from the Bond ("Read
      // as") — UNLESS the GM has opened this nature, then everyone reads truth.
      const seeArch = ctx.isGM || SocialArchetypeManager.isRevealed(tgt);
      const guessId = TSLBondStore.find(src.id, tgt.id)?.perceivedArchetypeId ?? null;
      const arch  = seeArch
        ? SocialArchetypeManager.getArchetype(tgt)
        : (guessId ? SocialArchetypeManager.getArchetypeById(guessId) : null);
      const isGuess = !seeArch;
      const triad = arch ? SOCIAL_TRIADS[arch.triad] : null;

      const archLine = arch
        ? `<span class="tsl-fc-arch" style="--triad-color:${triad?.color ?? "#806858"}" data-tooltip="${isGuess ? "<b>Your read (may be wrong)</b><br>" : ""}${esc(arch.hint ?? arch.description)}">${isGuess ? `<i class="fas fa-pencil tsl-guess-i"></i>` : `<i class="fas ${triad?.icon ?? "fa-user"}"></i>`} ${esc(arch.label)}${isGuess ? "?" : ""}</span>`
        : (() => {
            const lean = seeArch ? SocialArchetypeManager.leaningRead(tgt) : null;
            return lean
              ? `<span class="tsl-fc-arch" style="--triad-color:${lean.color}" data-tooltip="${esc(lean.tip)}"><i class="fas ${lean.icon}"></i> ${esc(lean.label)}</span>`
              : `<span class="tsl-fc-arch tsl-fc-arch--unread" data-tooltip="Their nature is a riddle — Read Them whispers a tell; note your guess in your Bond ('Read as') and the chip marks follow your read.">Nature unread</span>`;
          })();

      // Maneuver chips grouped by school — marks follow the viewer's read
      const chips = MANEUVER_GROUPS.map(g => {
        const mvs = SOCIAL_MANEUVERS.filter(m => m.group === g.id);
        const color = SOCIAL_TRIADS[g.id]?.color ?? "#806858";
        const short = (SOCIAL_TRIADS[g.id]?.label ?? g.label).replace("Triad of ", "");
        const cs = mvs.map(m => {
          const isSel = this._fenceManeuverId === m.id;
          const rel   = SocialManeuverRoller.getRelation(tgt, m, seeArch ? undefined : (arch ?? null));
          const comboReady =
            (m.combos && Object.keys(m.combos).some(st => SocialArchetypeManager.getActiveCondition(tgt, st)))
            || (m.kickWhileDown && SOCIAL_CONDITION_ORDER.some(st => !SOCIAL_CONDITIONS[st].positive && SocialArchetypeManager.getActiveCondition(tgt, st)))
            || !!findOpening(tgt, m);
          // Weak/strong marks follow the READ: the GM's truth, or a player's own
          // THEORY (their Bond guess `arch`). No theory → no marks. ⊕ (a live
          // opening) always shows — it reads off visible states.
          const showMarks = seeArch || !!arch;
          const mark  = showMarks && rel === "immune" ? `<span class="tsl-chip-mark tsl-chip-mark--imm">✕</span>`
                      : showMarks && rel === "vulnerable" ? `<span class="tsl-chip-mark tsl-chip-mark--vuln">◎</span>`
                      : comboReady ? `<span class="tsl-chip-mark tsl-chip-mark--combo">⊕</span>` : "";
          // What this maneuver actually does against THIS target, right now
          // (veiled, follows the viewer's read). The console always has a target.
          const liveTip = "<br><b>Vs " + esc(tgt.name) + ":</b><br>" +
            SocialManeuverRoller.describeVsTarget(src, tgt, m, ctx.isGM)
              .map(l => esc(l)).join("<br>");
          const howLine = (m.howto ? `<br>▸ <i>${esc(m.howto)}</i>` : "")
            + (m.edge ? `<br><b>Strong:</b> ${esc(m.edge)}` : "")
            + (m.risk ? `<br><b>Weak:</b> ${esc(m.risk)}` : "");
          return `<button class="tsl-chip ${isSel ? "selected" : ""}" data-fence-maneuver="${m.id}"
                    data-tooltip="<b>${esc(m.name)}</b> · ${esc(m.skill)}${m.skill2 ? ` + ${esc(m.skill2)}` : ""}<br>${esc(m.description)}${howLine}${liveTip}">
                    <i class="fas ${m.icon}"></i><span class="tsl-chip-name">${esc(m.name)}</span>${mark}</button>`;
        }).join("");
        const schoolTip = SOCIAL_TRIADS[g.id]?.hint
          ?? "The basics anyone reaches for — read, jab, goad, persuade, threaten, lie — plus Reassure, aimed at a friend. No weak spots to find; only Mock and Taunt can hit a wall. Persuade is sincere (no Answer, clears Suspicion), Intimidate hits hard but a miss costs you 2, a Lie that misses badly gets you caught.";
        return `<div class="tsl-chip-group" style="--triad-color:${color}">
          <div class="tsl-chip-group-label" data-tooltip="${esc(schoolTip)}">${esc(short)}</div><div class="tsl-chip-grid">${cs}</div></div>`;
      }).join("");

      // Their states (with a lever button when THIS character holds it) and
      // the Wounds they visibly carry — right where you pick the move.
      const tgtConds  = SocialArchetypeManager.getActiveConditions(tgt);
      const statusRow = tgtConds.length
        ? `<div class="tsl-status-row">${tgtConds.map(c => this._stateTag(c, tgt)).join("")}</div>` : "";
      const wounds = (typeof TSLConditionEffects !== "undefined")
        ? TSLConditionEffects.ORDER.map(id => ({ id, tier: TSLConditionEffects.getTier(tgt, id) })).filter(w => w.tier > 0) : [];
      const woundRow = wounds.length
        ? `<div class="tsl-status-row tsl-fc-wounds">${wounds.map(w => {
            const m = TSLConditionEffects.getMeta(w.id);
            const cc = CONDITIONS.find(c => c.id === w.id);
            return `<span class="tsl-wound-pill" style="--cond-color:${cc?.color ?? "#c87a8a"}" data-tooltip="${TSLConditionEffects.dossier(w.id, w.tier, "them").replaceAll('"', "&quot;")}"><span class="tsl-wound-name">${esc(m?.label ?? w.id)}</span><span class="tsl-wound-tier">${"●".repeat(w.tier)}</span></span>`;
          }).join("")}</div>` : "";

      // Portrait + name + composure share one aligned header block, mirroring
      // the conflict window's participant cards — one design language.
      body = `
        <div class="tsl-fc-head" style="--triad-color:${triad?.color ?? "rgba(255,255,255,0.18)"}">
          <img class="tsl-fc-portrait" src="${tgt.img ?? "icons/svg/mystery-man.svg"}" alt="">
          <div class="tsl-fc-head-main">
            <div class="tsl-fc-head-row">
              <div class="tsl-fc-head-name">${esc(tgt.name)}</div>
              ${archLine}
            </div>
            ${this._composureHTML(tgt)}
            ${statusRow}
            ${woundRow}
          </div>
        </div>
        <div class="tsl-fc-maneuvers">${chips}</div>
        ${SocialManeuverRoller.chipLegend(ctx.isGM)}
        ${this._buildFenceBar(ctx, src, tgt, arch, isGuess)}`;
    }

    return `
      <section class="tsl-notes-section tsl-fc">
        <div class="tsl-notes-section-title" data-tooltip="Press someone from your own menu: pick who, pick a maneuver, roll. No GM setup needed — the exchange starts with the first maneuver.">⚔ ${esc(src.name)} acts</div>
        <div class="tsl-fc-target-row">
          <span class="tsl-fc-target-label">Target</span>
          <select class="tsl-fc-target">
            <option value="">${targets.length ? "— choose —" : "no other tokens on scene"}</option>
            ${targetOpts}
          </select>
          <button class="tsl-chr-pick-btn ${this._picking && this._pickMode === "target" ? "picking" : ""}"
                  data-fence-pick data-tooltip="Pick the target by clicking its token on the map. Esc cancels.">
            <i class="fas fa-crosshairs"></i> ${this._picking && this._pickMode === "target" ? "Click a token…" : "Map"}
          </button>
        </div>
        ${body}
      </section>`;
  }

  /**
   * The roll's result, shown IN the pinned bar — exactly where the Roll button
   * was, so nobody hunts for it. The dice's verdict; the GM confirms close
   * calls and the chat card carries what followed.
   */
  _buildFenceResult() {
    const esc = foundry.utils.escapeHTML;
    const r   = this._fenceRoll;
    const kind = (r.outcome === "success" || r.outcome === "crit") ? "hit" : r.outcome === "immune" ? "wall" : "miss";
    const label = r.outcome === "crit"    ? "★ Clean hit"
                : r.outcome === "success" ? "✓ It lands"
                : r.outcome === "immune"  ? "✕ Walled off"
                : r.outcome === "botch"   ? (r.natural === 1 ? "Natural 1 — ⚔ they answer" : "⚔ A bad miss — they answer")
                : r.natural === 1         ? "Natural 1 — a miss"
                : "✗ A miss";
    const note = r.auto
      ? "Intrigued — it lands on its own. What followed is on the chat card."
      : "The dice's verdict — the GM confirms a close call. What followed is on the chat card.";
    return `<div class="tsl-bar tsl-bar--fence tsl-bar--result tsl-bar--result-${kind}">
      <div class="tsl-res-line">
        <span class="tsl-res-move"><i class="fas ${r.icon}"></i> ${esc(r.name)}${r.target ? ` → ${esc(r.target)}` : ""}</span>
        <span class="tsl-res-total">${r.total}</span>
        <span class="tsl-bar-dim">${game.user.isGM ? `vs DC ${r.dc}` : "vs ?"}</span>
      </div>
      <div class="tsl-res-grade tsl-res-grade--${kind}" data-tooltip="${esc(SocialManeuverRoller.gradeTip(r.outcome, r.natural))}">${label}</div>
      <div class="tsl-res-note">${esc(note)}</div>
      <button class="tsl-fence-close">Continue</button>
    </div>`;
  }

  /** The pre-roll action bar for the selected maneuver in the console.
   *  `dispArch` is what the viewer believes (GM: truth, player: guess) —
   *  predictions follow it; the real roll follows the truth. */
  _buildFenceBar(ctx, src, tgt, dispArch, isGuess) {
    if (this._fenceRoll) return this._buildFenceResult();
    const m = this._fenceManeuverId ? SocialManeuverRoller.getManeuver(this._fenceManeuverId) : null;
    if (!m) return `<div class="tsl-fc-note tsl-fc-note--pick">Pick a maneuver to see the roll.</div>`;
    const esc   = foundry.utils.escapeHTML;
    // GM assesses on the truth; a player's bar follows THEIR THEORY (dispArch =
    // their Bond guess) — provisional marks/hints, corrected by outcomes. No
    // theory → no archetype analysis. The dice always follow the truth.
    const known = !!dispArch;
    const a = SocialManeuverRoller.assess(src, tgt, m, {
      leverage: this._fenceLeverage,
      archetypeOverride: ctx.isGM ? undefined : (dispArch ?? null),
    });
    const extra  = a.bonus;

    const bonusList =
      a.bonusReasons.map(b => `${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label.split(" — ")[0])}`);
    const extraChip = extra ? `<span class="tsl-bar-extra ${extra >= 0 ? "pos" : "neg"}" data-tooltip="${esc(bonusList.join(", "))}${isGuess && known ? " — predictions follow your read" : ""}">${extra >= 0 ? "+" : "−"}${Math.abs(extra)}</span>` : "";
    const advMark = (a.advantage ? `<span class="tsl-bar-adv" data-tooltip="${esc(a.advantageReasons.join("; "))}${isGuess ? " — if your read is right" : ""}">ADV${isGuess && a.relation === "vulnerable" ? "?" : ""}</span>` : "")
      + (a.disadvantage ? `<span class="tsl-bar-dis" data-tooltip="${esc(a.disadvantageReasons.join("; "))}${a.advantage ? " — with Advantage too, they cancel out" : ""}">DIS</span>` : "");

    // Held Strings show as the gamble reserve — spendable AFTER a miss
    const held = TSLStringStore.getList(src.id).filter(e => e.targetActorId === tgt.id);
    const strBtn = held.length
      ? `<span class="tsl-fc-string" data-tooltip="You hold ${held.length} String${held.length > 1 ? "s" : ""} on them. No passive bonus — on a MISS you'll be offered to burn one for +${STRING_SPEND_BONUS} (the gamble). In a fight, Pull one from your Bonds: +${STRING_SPEND_BONUS} to your next attack, check or save against them, or +${STRING_SPEND_BONUS} AC against their next attack."><i class="fas fa-masks-theater"></i> ${held.length}</span>`
      : "";

    // Leverage toggles — once each per exchange, from a filled dossier point
    const enc = SocialEncounterManager.getEncounter(tgt);
    const points = SocialArchetypeManager.getCharacterNotes(tgt).points;
    const LEV = [
      { id: "desire",   label: "Desire",   icon: "fa-gem",         fx: "Advantage; +1 composure off them on a hit." },
      { id: "fear",     label: "Fear",     icon: "fa-ghost",       fx: "+3 to the roll — but a miss costs YOU 1 more composure." },
      { id: "weakness", label: "Weakness", icon: "fa-heart-crack", fx: "An ordinary approach lands like a weak spot: Advantage, +1 composure." },
    ];
    const levBtns = (!a.support && !enc.outcome)
      ? LEV.filter(l => (points[l.id] ?? "").trim()).map(l => {
          const used = enc.leverage?.[l.id];
          const sel  = this._fenceLeverage === l.id;
          return `<button class="tsl-lev-btn ${sel ? "selected" : ""}" data-fence-leverage="${l.id}" ${used ? "disabled" : ""}
                    data-tooltip="${esc(used ? `${l.label} — already played this exchange` : `${l.label}: ${points[l.id] ?? ""} — ${l.fx} Once per exchange.`)}"><i class="fas ${l.icon}"></i> ${l.label}</button>`;
        }).join("")
      : "";

    const readPrefix = isGuess ? "Your read: " : "";
    let hint = "", hintCls = "dim";
    if (a.relation === "blocked")        { hint = a.relationReason; hintCls = "imm"; }
    else if (a.support)                  { hint = "♥ A kind word to an ally — DC 10, and a miss costs you nothing."; hintCls = "vuln"; }
    else if (known && a.relation === "immune")     { hint = `${readPrefix}${a.relationReason} — ${isGuess ? "if you're right, it fails, costs you like a miss, and they turn Defiant." : "it fails, costs you like a miss, and they turn Defiant."}`; hintCls = "imm"; }
    else if (a.autoSuccess)              { hint = `✦ ${a.autoReason} — this one lands on its own.`; hintCls = "vuln"; }
    else if (a.selfLast)                 { hint = `⚠ Your composure is nearly gone — miss now and you crack (−${a.missCost}).`; hintCls = "imm"; }
    else if (a.canBreak)                 { hint = "⚔ They're at the edge — land this and their composure breaks."; hintCls = "vuln"; }
    else if (known && a.relation === "vulnerable") { hint = `${readPrefix}this should cut deep — Advantage & +1 composure${isGuess ? " (if your read is right)" : ""}.`; hintCls = "vuln"; }
    else if (a.combo)                    { hint = `⊕ Opening — ${a.combo.label}.`; hintCls = "vuln"; }
    else if (a.opening)                  { hint = `⊕ Opening — ${a.opening.flavor} (+2).`; hintCls = "vuln"; }
    else if (a.disadvantage)             { hint = `DIS — ${a.disadvantageReasons[0]}.`; hintCls = "imm"; }
    else if (known && a.answerRisk)      { hint = `${readPrefix}fumble badly here and their answer comes — ${a.answerRisk}${isGuess ? " (if your read is right)" : ""}.`; hintCls = "imm"; }
    else if (a.undaunted)                { hint = "✦ Undaunted — if this misses, it costs you nothing."; hintCls = "vuln"; }
    else if (a.selfThin)                 { hint = "⏳ Your own composure is wearing thin — pick your shots."; }
    else if (!known)                     { hint = "Their nature is a riddle — read tells, then note your guess in your Bond ('Read as')."; }

    // YOUR composure, right where you decide — a miss spends it.
    const selfLine = `<div class="tsl-fc-self">${this._composureHTML(src, true)}<span class="tsl-fc-self-cost">${a.support ? "a miss costs nothing" : a.missCost ? `a miss costs ${a.missCost}` : "a miss costs nothing (Undaunted)"}</span></div>`;

    // A visible, plain-language breakdown of every modifier in play — so it's
    // obvious WHERE the bonuses come from, not hidden in a tooltip.
    // The DC itself (and its modifiers) is GM knowledge — players earn a feel
    // for the difficulty from outcomes, not from a readout.
    const breakdown = [];
    breakdown.push(`<span class="tsl-fc-mod tsl-fc-mod--base"${a.leanSkill ? ` data-tooltip="${esc(`Your ${a.leanSkill.triad} dots add +${a.leanSkill.value} to ${m.skill} on your sheet (Social Leanings) — ${a.leanSkill.why}.`)}"` : ""}>${esc(m.skill)} ${a.skillMod >= 0 ? "+" : "−"}${Math.abs(a.skillMod)}${a.leanSkill ? ` <i>(incl. +${a.leanSkill.value} ${esc(a.leanSkill.triad)} leaning)</i>` : ""}</span>`);
    for (const b of a.bonusReasons) {
      breakdown.push(`<span class="tsl-fc-mod ${b.value >= 0 ? "pos" : "neg"}">${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label)}</span>`);
    }
    for (const r of a.advantageReasons) breakdown.push(`<span class="tsl-fc-mod adv">ADV — ${esc(r)}</span>`);
    for (const r of a.disadvantageReasons ?? []) breakdown.push(`<span class="tsl-fc-mod neg">DIS — ${esc(r)}</span>`);
    if (ctx.isGM) {
      for (const dm of a.dcMods) breakdown.push(`<span class="tsl-fc-mod ${dm.value < 0 ? "pos" : "neg"}">DC ${dm.value > 0 ? "+" : "−"}${Math.abs(dm.value)} · ${esc(dm.label)}</span>`);
    }
    if (isGuess && known) breakdown.push(`<span class="tsl-fc-mod">predictions follow your read — may be wrong</span>`);

    const dcHtml = ctx.isGM
      ? `<span class="tsl-bar-dim">vs DC <b>${a.dc}</b></span>`
      : `<span class="tsl-bar-dim">vs <b data-tooltip="The difficulty is hidden — only the GM sees the number. Read them, watch outcomes, and you'll sense it.">?</b></span>`;

    // The Roll button is its own full-width row — never squeezed into the
    // matchup flex line where a layout hiccup can push it out of sight. A
    // blocked target shows an explicit walled row instead of a silent gap.
    const blocked = a.relation === "blocked";
    return `<div class="tsl-bar tsl-bar--fence">
      <div class="tsl-bar-line">
        <div class="tsl-bar-core">
          <span class="tsl-bar-move">${esc(m.name)} ${advMark}</span>
          <span class="tsl-bar-roll">${esc(m.skill)} ${a.skillMod >= 0 ? "+" : "−"} ${Math.abs(a.skillMod)} ${extraChip}
            ${dcHtml}</span>
        </div>
        ${strBtn}
      </div>
      ${levBtns ? `<div class="tsl-bar-lev">${levBtns}</div>` : ""}
      <div class="tsl-fc-breakdown">${breakdown.join("")}</div>
      ${hint ? `<div class="tsl-bar-hint tsl-bar-hint--${hintCls}">${esc(hint)}</div>` : ""}
      ${(() => {
        const pv = SocialManeuverRoller.previewOutcomes(a, m);
        return pv ? `<div class="tsl-bar-stakes"><span class="tsl-stake-hit">✓ ${esc(pv.hit)}</span><span class="tsl-stake-sep">·</span><span class="tsl-stake-miss">✗ ${esc(pv.miss)}</span></div>` : "";
      })()}
      ${blocked ? "" : selfLine}
      ${blocked
        ? `<div class="tsl-fc-walled">✕ ${esc(a.relationReason ?? "Walled off — a successful Read Them breaks the wall.")}</div>`
        : `<button class="tsl-fc-roll tsl-roll-btn" style="--active-color:#9b6ee8">Roll ${esc(m.name)}</button>`}
    </div>`;
  }

  /**
   * THIS character in the exchange — for everyone who sees the tab: their
   * composure (the GM can nudge or reset it), the states on them (what they
   * must or can't do right now — the GM sets or clears them), and the LEVERS
   * they hold on others in the scene, each with its call-in button.
   */
  _buildSelfFencing(ctx) {
    const esc   = foundry.utils.escapeHTML;
    const actor = this._actor;
    const enc   = ctx.encounter;
    const isGM  = ctx.isGM;

    const gmCtl = !isGM ? "" : enc.active
      ? `<span class="tsl-comp-ctl">
           <button class="tsl-comp-adj" data-delta="-1" data-tooltip="−1 composure (at 0 the exchange is lost)">−</button>
           <button class="tsl-comp-adj" data-delta="1" data-tooltip="+1 composure">+</button>
           <button class="tsl-comp-reset" data-enc-action="end" data-tooltip="End the exchange for ${esc(actor.name)} — the next maneuver starts fresh.">Reset</button>
         </span>`
      : enc.outcome
        ? `<span class="tsl-comp-ctl"><button class="tsl-comp-reset" data-enc-action="end" data-tooltip="Clear the result so a new exchange can begin (it clears on its own in another scene).">Reset</button></span>`
        : "";

    const live = SocialArchetypeManager.getActiveConditions(actor);
    const tags = live.map(c => this._stateTag(c, actor, isGM)).join("");
    const have = new Set(live.map(c => c.id));
    const add  = isGM
      ? `<select class="tsl-add-select tsl-self-state-add" data-tooltip="Put a state on ${esc(actor.name)} by hand">
           <option value="">+ State</option>
           ${SOCIAL_CONDITION_ORDER.filter(id => !have.has(id)).map(id => `<option value="${id}">${esc(SOCIAL_CONDITIONS[id].label)}</option>`).join("")}
         </select>`
      : "";

    // Levers this character holds on anyone in the scene (Beholden / Enthralled)
    const seen = new Set([actor.id]);
    const levers = [];
    for (const t of (canvas.tokens?.placeables ?? [])) {
      const a = t.actor;
      if (!a || seen.has(a.id)) continue;
      seen.add(a.id);
      for (const c of SocialArchetypeManager.getActiveConditions(a)) {
        if (c.meta.lever && c.sourceActorId === actor.id) levers.push({ a, c });
      }
    }
    const leverRows = levers.map(({ a, c }) => `
      <div class="tsl-lever-row">
        <img class="tsl-lever-img" src="${a.img ?? "icons/svg/mystery-man.svg"}" alt="">
        <span class="tsl-lever-text"><b>${esc(a.name)}</b> is ${esc(c.meta.label)} — ${esc((c.meta.gist ?? "").replace(/^./, (ch) => ch.toLowerCase()))}</span>
        <button class="tsl-lever-btn" data-call-lever="${c.id}" data-holder="${actor.id}" data-target-actor="${a.id}"
          data-tooltip="${esc(`${c.meta.lever.label}: ${a.name} ${c.meta.lever.text}. Calling it in ends it.`)}"><i class="fas ${c.meta.lever.icon}"></i> ${esc(c.meta.lever.label)}</button>
      </div>`).join("");

    return `
      <section class="tsl-notes-section tsl-self">
        <div class="tsl-notes-section-title" data-tooltip="${esc(actor.name)} in the exchange: their composure, the states on them right now (each changes what they do — hover for the rule), and the levers they hold on others.">${esc(actor.name)} in the exchange</div>
        <div class="tsl-self-comp">${this._composureHTML(actor, !isGM || actor.isOwner)}${gmCtl}</div>
        <div class="tsl-status-row tsl-self-states">
          <span class="tsl-row-label tsl-row-label--state" data-tooltip="States — what a moment in the talk did to ${esc(actor.name)}. Each changes what they DO, or hands someone a lever. Gone once used, when the scene's time runs out (rounds in a fight), or after a long rest.">States</span>
          ${tags || `<span class="tsl-row-empty">none</span>`}${add}
        </div>
        ${leverRows ? `<div class="tsl-levers"><div class="tsl-levers-title" data-tooltip="States you put on people that you can CALL IN once — a debt (Beholden) or a favor (Enthralled).">Levers you hold</div>${leverRows}</div>` : ""}
      </section>`;
  }

  /**
   * A scene-wide "who has what" board (GM): every token whose actor carries a
   * state, a live exchange, or a finished one. Read-only overview.
   */
  _buildStatusBoard() {
    const esc  = foundry.utils.escapeHTML;
    const seen = new Set();
    const rows = [];
    for (const t of (canvas.tokens?.placeables ?? [])) {
      const actor = t.actor;
      if (!actor || seen.has(actor.id) || actor.id === this._actor.id) continue;
      seen.add(actor.id);
      const conds = SocialArchetypeManager.getActiveConditions(actor);
      const enc   = SocialEncounterManager.getEncounter(actor);
      const noteworthy = conds.length || enc.active || enc.outcome;
      if (!noteworthy) continue;

      const dots = conds.map(c => {
        const tip = SocialArchetypeManager.stateTooltip(c.id, { charges: c.charges, source: c.sourceActorId ? game.actors.get(c.sourceActorId)?.name : null });
        return `<span class="tsl-board-tag" style="--st-color:${c.meta.color ?? "#806858"}" data-tooltip="${tip.replaceAll('"', "&quot;")}">${esc(c.meta.label)}${c.charges > 1 ? " ×2" : ""}</span>`;
      }).join("");
      const tracks = enc.active
        ? `<span class="tsl-board-track" data-tooltip="Composure ${enc.composure} of ${enc.maxComposure}">${enc.composure}/${enc.maxComposure}</span>`
        : enc.outcome
          ? `<span class="tsl-board-out tsl-board-out--${enc.outcome}" data-tooltip="${esc(SocialEncounterManager.outcomeTip(enc.outcome))}">${enc.outcome === "swayed" ? "gave in" : "stormed off"}</span>`
          : "";
      rows.push(`
        <div class="tsl-board-row">
          <img class="tsl-board-img" src="${t.document.texture?.src || actor.img}" alt="">
          <span class="tsl-board-name">${esc(actor.name)}</span>
          <span class="tsl-board-dots">${dots}</span>
          ${tracks}
        </div>`);
    }

    const body = rows.length
      ? rows.join("")
      : `<div class="tsl-notes-string-empty">No one else in the scene carries a state or is in an exchange.</div>`;
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Everyone on the scene who carries a state, is in an exchange, or has finished one (GM).">Scene board</div>
        <div class="tsl-board">${body}</div>
      </section>`;
  }

  // ── Listeners ────────────────────────────────────────────────────────────────

  activateListeners(html) {
    super.activateListeners(html);
    const el = html instanceof HTMLElement ? html : html[0];
    this._bindListeners(el);
  }

  _bindListeners(el) {
    const canEdit = game.user.isGM || this._actor.isOwner;

    // Tabs
    el.querySelectorAll(".tsl-chr-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        this.render(true);
      });
    });

    // Codex categories — one long scroll split into pickable sections
    el.querySelectorAll("[data-codex-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        this._codexCat = btn.dataset.codexCat;
        this.render(true);
      });
    });

    // Bond rows fold/unfold (readers can browse too)
    el.querySelectorAll("[data-bond-toggle]").forEach(head => {
      head.addEventListener("click", () => {
        const id = head.dataset.bondToggle;
        if (this._expandedBonds.has(id)) this._expandedBonds.delete(id);
        else this._expandedBonds.add(id);
        this.render(true);
      });
    });

    if (!canEdit) return;

    // ── Profile: instant-save fields ─────────────────────────────────────────
    el.querySelector("select[name='archetypeId']")?.addEventListener("change", (e) => {
      // Changing the nature retracts any earlier reveal — it's a new secret.
      SocialArchetypeManager.setActorData(this._actor, { archetypeId: e.target.value || null, revealed: false });
      this.render(true);
    });

    // Nature → When pressed (owner or GM): accept states or hold the line;
    // give in or storm off.
    el.querySelector("select[name='stance']")?.addEventListener("change", async (e) => {
      await SocialArchetypeManager.setActorData(this._actor, { stance: e.target.value || "nature" });
      this.render(true);
    });

    // GM opens (or re-hides) the true nature to the whole table.
    el.querySelector("input[name='archetypeRevealed']")?.addEventListener("change", async (e) => {
      await SocialArchetypeManager.setRevealed(this._actor, e.target.checked);
      this.render(true);
    });

    el.querySelector("select[name='playbookId']")?.addEventListener("change", (e) => {
      TSLPlaybooks.setForActor(this._actor, e.target.value || null);
    });

    for (const name of ["notes", "intent"]) {
      el.querySelector(`textarea[name='${name}']`)?.addEventListener("change", (e) => {
        SocialArchetypeManager.setActorData(this._actor, { [name]: e.target.value.trim() });
      });
    }

    el.querySelectorAll("input[data-point]").forEach(input => {
      input.addEventListener("change", (e) => {
        SocialArchetypeManager.setActorData(this._actor, {
          points: { [e.target.dataset.point]: e.target.value.trim() },
        });
      });
    });

    el.querySelectorAll(".tsl-chr-triad-pip").forEach(pip => {
      pip.addEventListener("click", async () => {
        const triadId = pip.dataset.triad;
        const clicked = parseInt(pip.dataset.value);
        const triad   = SocialArchetypeManager.getCharacterNotes(this._actor).triad;
        const current = triad[triadId] ?? 0;
        const value   = current === clicked ? clicked - 1 : clicked;
        // Enforce the shared pool — but only ever block an INCREASE, so a
        // character who is over budget (e.g. from before the cap) can still
        // reduce their dots to get back under it.
        const otherTotal = Object.entries(triad).reduce((s, [k, v]) => s + (k === triadId ? 0 : (v || 0)), 0);
        if (value > current && otherTotal + value > TRIAD_POINT_POOL) {
          ui.notifications.warn(`Only ${TRIAD_POINT_POOL} triad points to spend — lower another triad first.`);
          return;
        }
        await SocialArchetypeManager.setActorData(this._actor, { triad: { [triadId]: value } });
        // Dots feed everyday skill checks too — rebuild the bonus effect
        await SocialArchetypeManager.syncTriadBonusEffect(this._actor);
        this.render(true);   // show the new 'On your sheet' line at once
      });
    });

    // ── Bonds ────────────────────────────────────────────────────────────────
    el.querySelector(".tsl-chr-add-select")?.addEventListener("change", async (e) => {
      const targetId = e.target.value;
      if (!targetId) return;
      const entry = await TSLBondStore.add(this._actor.id, targetId);
      if (entry) this._expandedBonds.add(entry.id); // open the fresh bond for editing
    });

    // NOTE: scoped by data attribute — the Fencing tab's "Map" button shares
    // this class, and a class-wide listener would fire on BOTH buttons and
    // instantly cancel the pick the other handler just started.
    el.querySelector("[data-bond-pick]")?.addEventListener("click", () => {
      if (this._picking) this._endPick("Pick cancelled.");
      else this._startPick();
    });

    el.querySelectorAll(".tsl-chr-bond-type").forEach(sel => {
      sel.addEventListener("change", (e) => {
        TSLBondStore.update(this._actor.id, e.target.dataset.bondId, { type: e.target.value });
      });
    });

    el.querySelectorAll(".tsl-chr-bond-arch").forEach(sel => {
      sel.addEventListener("change", (e) => {
        TSLBondStore.update(this._actor.id, e.target.dataset.bondId, {
          perceivedArchetypeId: e.target.value || null,
        });
      });
    });

    el.querySelectorAll(".tsl-chr-att-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        TSLBondStore.update(this._actor.id, dot.dataset.bondId, {
          attitude: parseInt(dot.dataset.attitude),
        });
      });
    });

    el.querySelectorAll(".tsl-chr-bond-notes").forEach(input => {
      input.addEventListener("change", (e) => {
        TSLBondStore.update(this._actor.id, e.target.dataset.bondId, { notes: e.target.value.trim() });
      });
    });

    // Profiling points written onto the bonded target's own dossier
    el.querySelectorAll(".tsl-bond-point").forEach(input => {
      input.addEventListener("change", (e) => {
        const target = game.actors.get(e.target.dataset.target);
        if (!target || !(game.user.isGM || target.isOwner)) return;
        SocialArchetypeManager.setActorData(target, { points: { [e.target.dataset.point]: e.target.value.trim() } });
      });
    });

    el.querySelectorAll(".tsl-chr-bond-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        TSLBondStore.remove(this._actor.id, btn.dataset.bondId);
      });
    });

    // Pull the String: burn one and choose — STRIKE (+5 to the next attack,
    // check or save against them) or GUARD (+5 AC against their next attack).
    // It lands on the sheet as a real effect that ends by itself once used.
    el.querySelectorAll(".tsl-chr-str-pull").forEach(btn => {
      btn.addEventListener("click", async () => {
        const target = game.actors.get(btn.dataset.target);
        if (!target) return;
        const mode = await this._promptPull(target);
        if (!mode) return;
        await TSLStringStore.pull(this._actor, target, mode);
        this.render(true);
      });
    });

    // ★ Invoke a ●●● bond's signature — once per long rest. The GM client marks
    // it spent and puts its effects on both sheets; here we only ask the choice.
    el.querySelectorAll(".tsl-chr-sig-use").forEach(btn => {
      btn.addEventListener("click", async () => {
        const bondId = btn.dataset.bondId;
        const bond   = TSLBondStore.getList(this._actor.id).find(b => b.id === bondId);
        if (!bond || bond.sigUsed) return;
        const sig = SocialArchetypeManager.getBondSignature(bond.type);
        let choice = 0;
        if (sig?.fx?.choose) {
          choice = await this._pickChoice(sig.label, sig.fx.choose.map(c => c.label));
          if (choice === null) return;
        }
        TSLGMActions.request("invokeSignature", { actorId: this._actor.id, bondId, choice });
      });
    });

    el.querySelectorAll(".tsl-chr-str-adj").forEach(btn => {
      btn.addEventListener("click", async () => {
        const targetId = btn.dataset.target;
        const delta    = parseInt(btn.dataset.delta);
        if (delta > 0 && !(await TSLStringStore.add(this._actor.id, targetId, 1)))
          ui.notifications.warn(`At most ${STRING_CAP} Strings on one person.`);
        else           await TSLStringStore.spend(this._actor.id, targetId);
        this.render(true);
      });
    });

    // ── Fencing (GM) ─────────────────────────────────────────────────────────
    el.querySelectorAll(".tsl-comp-adj").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!game.user.isGM) return;
        SocialEncounterManager.adjustComposure(this._actor, parseInt(btn.dataset.delta));
      });
    });

    el.querySelector("[data-enc-action='end']")?.addEventListener("click", () =>
      SocialEncounterManager.endEncounter(this._actor)
    );

    // GM: put a state on this character by hand / clear one (× on its tag)
    el.querySelector(".tsl-self-state-add")?.addEventListener("change", async (e) => {
      if (!game.user.isGM || !e.target.value) return;
      await SocialArchetypeManager.applyCondition(this._actor, e.target.value);
      this.render(true);
    });
    el.querySelectorAll("[data-clear-state]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!game.user.isGM) return;
        await SocialArchetypeManager.removeCondition(this._actor, btn.dataset.clearState);
        this.render(true);
      });
    });

    // Call in a lever this character holds (the GM client applies it)
    el.querySelectorAll(".tsl-lever-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        TSLGMActions.request("callLever", {
          holderId: btn.dataset.holder, targetId: btn.dataset.targetActor, stateId: btn.dataset.callLever,
        });
      });
    });

    // ❤ Wounds toggles — this character's own lasting emotional Wounds. Whoever
    // sees this tab owns the actor (owner or GM), so we apply/remove directly.
    el.querySelectorAll(".tsl-wound-toggle[data-wound]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await TSLConditionEffects.toggleOne(this._actor, btn.dataset.wound);
        this.render(true);
      });
    });
    // ▲ deepen / ▼ ease a wound's tier (Light ● → Deep ●● → Breaking point ●●●)
    el.querySelectorAll("[data-wound-deepen]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TSLConditionEffects.deepen(this._actor, btn.dataset.woundDeepen);
        this.render(true);
      });
    });
    el.querySelectorAll("[data-wound-ease]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TSLConditionEffects.ease(this._actor, btn.dataset.woundEase);
        this.render(true);
      });
    });
    el.querySelector(".tsl-wound-clear")?.addEventListener("click", async () => {
      for (const id of TSLConditionEffects.ORDER) {
        await TSLConditionEffects.removeOne(this._actor, id);
      }
      this.render(true);
    });
    // ❤ Give in to a Wound's urge → +1 Willpower (Despair → Inspiration), public card
    el.querySelectorAll("[data-give-in]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id  = btn.dataset.giveIn;
        const res = await TSLConditionEffects.giveIn(this._actor, id);
        if (!res) return;
        const m   = TSLConditionEffects.getMeta(id);
        const eff = this._actor.effects.find(x => TSLConditionEffects._condOf(x) === id);
        const who = eff?.flags?.["tsl-social-conflict"]?.source ?? "them";
        const esc = foundry.utils.escapeHTML;
        const gain = res.gained === "willpower"   ? "+1 Willpower"
                   : res.gained === "inspiration" ? "gains Inspiration"
                   : id === "hopeless"            ? "already inspired — nothing more"
                   : "Willpower already full — nothing more";
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this._actor }),
          content: `<div class="tsl-maneuver-card tsl-mv--immune"><div class="tsl-mv-outcome tsl-mv-outcome--immune">❤ <b>${esc(this._actor.name)}</b> gives in to <b>${esc(m?.label ?? id)}</b> — <i>${esc((m?.urge ?? "").replace(/\{source\}/g, who))}</i> <span style="opacity:.8">(${esc(gain)})</span></div></div>`,
        });
        this.render(true);
      });
    });

    // ✦ Boons toggles — GM-given positive emotions (same machinery as wounds).
    el.querySelectorAll(".tsl-boon-toggle[data-boon]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await TSLConditionEffects.toggleOne(this._actor, btn.dataset.boon);
        this.render(true);
      });
    });
    el.querySelectorAll("[data-boon-deepen]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TSLConditionEffects.deepen(this._actor, btn.dataset.boonDeepen);
        this.render(true);
      });
    });
    el.querySelectorAll("[data-boon-ease]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TSLConditionEffects.ease(this._actor, btn.dataset.boonEase);
        this.render(true);
      });
    });
    el.querySelector(".tsl-boon-clear")?.addEventListener("click", async () => {
      for (const id of (TSLConditionEffects.BOON_ORDER ?? [])) {
        await TSLConditionEffects.removeOne(this._actor, id);
      }
      this.render(true);
    });

    // 🩹 Scar toggles — permanent states (GM/owner sets or lifts one by hand).
    el.querySelectorAll(".tsl-scar-toggle[data-scar]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await TSLConditionEffects.toggleScar(this._actor, btn.dataset.scar);
        this.render(true);
      });
    });

    // ⬡ Willpower − / + (spend / restore by hand)
    el.querySelectorAll("[data-wp]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (typeof TSLWillpower === "undefined") return;
        const d = Number(btn.dataset.wp);
        if (d < 0) await TSLWillpower.spend(this._actor, -d);
        else       await TSLWillpower.restore(this._actor, d);
        this.render(true);
      });
    });

    // ⚡ Fire an Ultimate (a ●●● Wound / Boon, or a Scar). The GM client spends
    // the Willpower and puts its effects on the sheets; here we only ask whom
    // it touches (allies, a rival, whom it's about, which state to shake off).
    el.querySelectorAll(".tsl-ult-btn[data-ult]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (typeof TSLWillpower === "undefined" || typeof TSLConditionEffects === "undefined") return;
        const id = btn.dataset.ult, kind = btn.dataset.ultKind ?? "wound";
        const m  = kind === "scar" ? TSLConditionEffects.getScarMeta(id) : TSLConditionEffects.getMeta(id);
        if (!m?.ultimate) return;
        if (TSLWillpower.get(this._actor) < 1) { ui.notifications?.warn?.(`${this._actor.name}: no Willpower left.`); return; }
        const fx   = m.ultimate.fx ?? {};
        const args = { actorId: this._actor.id, kind, id };
        if (fx.allies) {
          const ids = await this._pickPeople(`${m.ultimate.name} — who hears you?`, fx.allies.pick === 1 ? 1 : "many");
          if (ids === null) return;
          args.allyIds = ids;
        }
        if (fx.edge?.vs === "pick") {
          const ids = await this._pickPeople(`${m.ultimate.name} — against whom?`, 1);
          if (!ids?.length) return;
          args.pickId = ids[0];
        }
        if ((fx.source || fx.edge?.vs === "source") && kind !== "scar" && !TSLConditionEffects.getWoundSource(this._actor, id)) {
          const ids = await this._pickPeople(`${m.ultimate.name} — who is it about?`, 1);
          if (!ids?.length) return;
          args.sourceId = ids[0];
        }
        if (fx.self?.clearOne) {
          const bad = SocialArchetypeManager.getActiveConditions(this._actor).filter(c => !c.meta.positive);
          if (bad.length > 1) {
            const i = await this._pickChoice(`${m.ultimate.name} — shake off which?`, bad.map(c => c.meta.label));
            if (i === null) return;
            args.clearId = bad[i].id;
          }
        }
        TSLGMActions.request("fireUltimate", args);
      });
    });

    // ── Maneuver console (owner or GM) ───────────────────────────────────────
    el.querySelector(".tsl-fc-target")?.addEventListener("change", (e) => {
      this._fenceTargetId    = e.target.value || null;
      this._fenceManeuverId  = null;
      this._fenceLeverage    = null;
      this._fenceStringSpend = false;
      this.render(true);
    });

    // Pick the maneuver target by clicking a token on the map
    el.querySelector("[data-fence-pick]")?.addEventListener("click", () => {
      if (this._picking) { this._endPick("Pick cancelled."); return; }
      this._startPick((actor) => {
        this._fenceTargetId    = actor.id;
        this._fenceManeuverId  = null;
        this._fenceLeverage    = null;
        this._fenceStringSpend = false;
        this._tab = "fencing";
        ui.notifications.info(`Target: ${actor.name}`);
        this.render(true);
      }, "target");
    });

    el.querySelectorAll("[data-fence-maneuver]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.fenceManeuver;
        this._fenceRoll = null;
        this._fenceManeuverId  = this._fenceManeuverId === id ? null : id;
        this._fenceLeverage    = null;
        this._fenceStringSpend = false;
        this.render(true);
      });
    });

    el.querySelectorAll("[data-fence-leverage]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const id = btn.dataset.fenceLeverage;
        this._fenceLeverage = this._fenceLeverage === id ? null : id;
        this.render(true);
      });
    });

    el.querySelector(".tsl-fc-roll")?.addEventListener("click", () => this._doFenceRoll());
    el.querySelector(".tsl-fence-close")?.addEventListener("click", () => {
      this._fenceRoll = null;
      this.render(true);
    });
  }

  /**
   * Pick people on the scene (not this character): one (radio) or "many"
   * (checkboxes). Resolves to an array of actor ids, or null when cancelled.
   */
  async _pickPeople(title, mode = "many") {
    const esc  = foundry.utils.escapeHTML;
    const seen = new Set([this._actor.id]);
    const people = [];
    for (const t of (canvas.tokens?.placeables ?? [])) {
      const a = t.actor;
      if (!a || seen.has(a.id)) continue;
      if (!game.user.isGM && (t.document?.hidden || !t.visible)) continue;
      seen.add(a.id);
      people.push(a);
    }
    if (!people.length) { ui.notifications?.warn?.("No one else on the scene."); return mode === 1 ? null : []; }
    const type = mode === 1 ? "radio" : "checkbox";
    const rows = people.map((a, i) => `
      <label class="tsl-pick-row"><input type="${type}" name="tsl-pick" value="${a.id}" ${mode === 1 && i === 0 ? "checked" : ""}>
        <img src="${a.img ?? "icons/svg/mystery-man.svg"}" alt=""><span>${esc(a.name)}</span></label>`).join("");
    return new Promise(resolve => {
      new Dialog({
        title,
        content: `<div class="tsl-rollmods tsl-pick">${rows}</div>`,
        buttons: {
          ok:     { icon: '<i class="fas fa-bolt"></i>', label: "Go", callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            resolve([...(root?.querySelectorAll?.('input[name="tsl-pick"]:checked') ?? [])].map(x => x.value).filter(Boolean));
          } },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "ok",
        close: () => resolve(null),
      }, typeof tslDialogOptions === "function" ? tslDialogOptions() : {}).render(true);
    });
  }

  /** One of several labelled choices — resolves to its index, or null. */
  async _pickChoice(title, labels = []) {
    return new Promise(resolve => {
      const buttons = {};
      labels.forEach((label, i) => { buttons[`c${i}`] = { label, callback: () => resolve(i) }; });
      buttons.cancel = { label: "Cancel", callback: () => resolve(null) };
      new Dialog({ title, content: `<div class="tsl-rollmods"><p>Choose:</p></div>`, buttons, default: "c0", close: () => resolve(null) },
        typeof tslDialogOptions === "function" ? tslDialogOptions() : {}).render(true);
    });
  }

  /** Strike or guard? — the choice when a String is pulled. Resolves to a mode or null. */
  async _promptPull(target) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: `${this._actor.name} pulls a String on ${target.name}`,
        content: `<div class="tsl-rollmods">
          <p>Burn one String on <b>${esc(target.name)}</b> — it goes on your sheet as a real effect and ends by itself once used.</p>
        </div>`,
        buttons: {
          strike: { icon: '<i class="fas fa-crosshairs"></i>', label: "Strike +5",
                    callback: () => resolve("strike") },
          guard:  { icon: '<i class="fas fa-shield-halved"></i>', label: "Guard +5 AC",
                    callback: () => resolve("guard") },
          cancel: { label: "Keep it", callback: () => resolve(null) },
        },
        default: "strike",
        close: () => resolve(null),
        render: (html) => {
          const root = html instanceof HTMLElement ? html : html?.[0];
          const tips = {
            strike: `+5 to your next attack roll, ability check or saving throw — aim it at ${target.name}. Ends after that roll.`,
            guard:  `+5 AC — you know how ${target.name} moves. Ends after their next roll, or when your next turn starts.`,
          };
          root?.querySelectorAll?.("button[data-button]").forEach(b => {
            if (tips[b.dataset.button]) b.setAttribute("data-tooltip", tips[b.dataset.button]);
          });
        },
      }, typeof tslDialogOptions === "function" ? tslDialogOptions() : {}).render(true);
    });
  }

  /** Roll the selected maneuver against the selected target, from this menu. */
  async _doFenceRoll() {
    const src = this._actor;
    const tgt = this._fenceTargetId ? game.actors.get(this._fenceTargetId) : null;
    const maneuver = this._fenceManeuverId ? SocialManeuverRoller.getManeuver(this._fenceManeuverId) : null;
    if (!src || !tgt || !maneuver) return;

    const leverage = this._fenceLeverage;
    const assessment = SocialManeuverRoller.assess(src, tgt, maneuver, { leverage });
    if (assessment.relation === "blocked") {
      ui.notifications.warn(assessment.relationReason);
      return;
    }

    // Roll config: the SYSTEM's own dialog when the setting is on (advantage,
    // expertise dice, situational mods live there), else our slim prompt.
    const mods = SocialManeuverRoller.usesSystemDialog(src)
      ? { situational: 0, mode: "normal" }
      : await SocialManeuverRoller.promptRollMods(`${maneuver.name} → ${tgt.name}`, assessment.advantage);
    if (!mods) return;

    // Strings are the post-roll gamble: on a miss, rollManeuver offers to
    // burn one for +5 — decided AFTER the die, against a hidden difficulty.
    const payload = await SocialManeuverRoller.rollManeuver(src, tgt, maneuver, {
      leverage, situational: mods.situational, mode: mods.mode, offerString: true,
    });
    if (!payload) return;   // system dialog cancelled — nothing spent
    if (payload.spentStringPostRoll) {
      const held = TSLStringStore.getList(src.id).filter(e => e.targetActorId === tgt.id);
      if (held.length) await TSLStringStore.removeEntry(src.id, held[0].id);
    }
    TSLGMActions.request("maneuverOutcome", payload);

    this._fenceRoll = {
      name: maneuver.name, icon: maneuver.icon, target: tgt.name,
      total: payload.total, dc: payload.dc, outcome: payload.outcomeType, natural: payload.natural,
      auto: !!payload.auto,
    };
    this._fenceManeuverId  = null;
    this._fenceLeverage    = null;
    this._fenceStringSpend = false;
    this.render(true);
  }

  // ── Canvas picking ───────────────────────────────────────────────────────────

  /**
   * The DOM <canvas> element of the board. Foundry v13 (PIXI 8) removed
   * `canvas.app.view` — the reliable handle is the #board element itself.
   */
  _boardEl() {
    return document.getElementById("board") ?? canvas.app?.canvas ?? canvas.app?.view ?? null;
  }

  /**
   * Enter "click a token on the map" mode. `onPick(actor)` runs with the
   * chosen actor; if omitted, the default adds a Bond. `mode` labels which
   * picker button is showing its active state ("bond" | "target").
   */
  async _startPick(onPick = null, mode = "bond") {
    if (this._picking || !canvas?.stage) return;
    const board = this._boardEl();
    if (!board) {
      ui.notifications.warn("Can't reach the game canvas — use the dropdown instead.");
      return;
    }
    this._picking     = true;
    this._pickMode    = mode;
    this._pickHandler = onPick;

    // Flip the button to its "aiming" state BEFORE minimizing —
    // rendering a minimized window desyncs its content
    this.render(true);
    await this.minimize();

    // Crosshair over the whole map is the mode indicator you can't miss
    board.style.cursor = "crosshair";
    ui.notifications.info(`${mode === "target" ? "Target" : "Bond"} for ${this._actor.name}: click a token on the map. Esc cancels.`);

    // DOM capture listener on the #board element — PIXI stage listeners are
    // not reliable across Foundry versions, a plain DOM event always fires.
    this._onPickCanvas = (event) => {
      if (event.button !== 0) return; // left click only

      // Screen → world coordinates (core helper, manual transform as fallback)
      let pos;
      if (typeof canvas.canvasCoordinatesFromClient === "function") {
        pos = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      } else {
        const rect = board.getBoundingClientRect();
        const t    = canvas.stage.worldTransform;
        pos = {
          x: (event.clientX - rect.left - t.tx) / canvas.stage.scale.x,
          y: (event.clientY - rect.top  - t.ty) / canvas.stage.scale.y,
        };
      }

      const hit = canvas.tokens.placeables.find(t =>
        t.actor && t.visible && t.bounds.contains(pos.x, pos.y)
      );
      if (!hit) return; // empty ground — keep aiming, let Foundry pan/deselect

      // We handle this click — don't let Foundry also select the token
      event.preventDefault();
      event.stopPropagation();

      if (hit.document.hidden && !game.user.isGM) {
        ui.notifications.warn("That token is hidden — reveal it first, or use the dropdown.");
        return;
      }
      if (hit.actor.id === this._actor.id) {
        ui.notifications.warn(`That is ${this._actor.name} themselves — pick someone else.`);
        return;
      }

      const handler = this._pickHandler;
      this._endPick();
      if (handler) handler(hit.actor);
      else this._defaultBondPick(hit.actor);
    };

    this._onPickCancel = (event) => {
      if (event.key !== "Escape") return;
      this._endPick("Pick cancelled.");
    };

    board.addEventListener("pointerdown", this._onPickCanvas, true);
    document.addEventListener("keydown", this._onPickCancel);
  }

  /** Default pick action: create/open a Bond toward the chosen actor. */
  _defaultBondPick(targetActor) {
    const existing = TSLBondStore.find(this._actor.id, targetActor.id);
    if (existing) {
      this._expandedBonds.add(existing.id);
      ui.notifications.info(`${this._actor.name} already has a bond with ${targetActor.name}.`);
      this.render(true);
    } else {
      TSLBondStore.add(this._actor.id, targetActor.id).then((entry) => {
        if (entry) this._expandedBonds.add(entry.id);
        ui.notifications.info(`Bond added: ${this._actor.name} → ${targetActor.name}`);
      });
    }
  }

  /** Leave pick mode, restore the window and refresh the button state. */
  async _endPick(message = null) {
    this._stopPick();
    if (message) ui.notifications.info(message);
    await this.maximize();
    this.render(true);
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
    Hooks.off("updateActor",        this._flagHook);
    Hooks.off("createActiveEffect", this._createEffHook);
    Hooks.off("updateActiveEffect", this._updateEffHook);
    Hooks.off("deleteActiveEffect", this._deleteEffHook);
    SocialFencingDialog._instances.delete(this._actor.id);
    return super.close(options);
  }
}
