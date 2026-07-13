/**
 * tsl-social-conflict | social-notes-app.js
 *
 * The Social Chronicle — per-character dossier and relationship ledger.
 *
 *   Profile — psychotype: archetype, Extended Triad leanings, profiling
 *             points (Desire / Fear / Weakness / Mask / The Line), free notes.
 *             Every profiling element carries a play-facing tooltip hint.
 *   Bonds   — relationships with other PCs/NPCs: bond type, attitude (-3..+3,
 *             shifts the Social Fencing DC), perceived archetype (may be wrong
 *             from their tells), strings, notes.
 *             New bonds can be added from a candidate list or by clicking a
 *             visible, non-hidden token on the canvas.
 *   Fencing — (GM) encounter tracks: Patience vs Resolve, social conditions.
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

class SocialFencingApp extends Application {
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
    this._deleteEffHook = Hooks.on("deleteActiveEffect", (e) => {
      if (e.parent?.id === actor.id) this.render(true);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:          "tsl-social-fencing",
      title:       "Social Chronicle",
      template:    null,
      width:       460,
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

    return {
      isGM, canEdit, notes, archetype, encounter, activeConditions,
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

    const map = new Map();
    for (const t of (canvas.tokens?.placeables ?? [])) {
      if (!t.actor || t.document.hidden || !t.visible) continue;
      if (!bonded.has(t.actor.id)) map.set(t.actor.id, t.actor);
    }
    for (const a of game.actors.contents) {
      if (bonded.has(a.id) || map.has(a.id)) continue;
      const hasChronicle = !!a.flags?.["tsl-social-conflict"];
      if (a.hasPlayerOwner || (game.user.isGM && hasChronicle)) map.set(a.id, a);
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
        ${this._buildFenceOverlay()}
        <nav class="tsl-chr-tabs">${tabBtns}</nav>
        ${body}
        ${ctx.canEdit ? "" : `<div class="tsl-notes-footer tsl-notes-footer--readonly">Read only</div>`}
      </div>`;
  }

  /** Dice result overlay for a maneuver rolled from this Chronicle. */
  _buildFenceOverlay() {
    const r = this._fenceRoll;
    if (!r) return "";
    const oc = r.outcome === "success" ? "Strong Hit" : "Miss";
    const label = r.outcome === "success" ? "Success" : r.outcome === "immune" ? "⚡ Walled off" : "Failure";
    return `<div class="tsl-dice-overlay"><div class="tsl-dice-panel tsl-dice-panel--maneuver">
      <div class="tsl-dice-move"><i class="fas ${r.icon}"></i> ${foundry.utils.escapeHTML(r.name)}</div>
      <div class="tsl-dice-total" data-outcome="${oc}">${r.total}</div>
      <div class="tsl-dice-breakdown">vs DC ${r.dc}</div>
      <div class="tsl-dice-outcome" data-outcome="${oc}">${label}</div>
      <button class="tsl-fence-close">Continue</button>
    </div></div>`;
  }

  // ── Profile tab ─────────────────────────────────────────────────────────────

  _buildProfileTab({ notes, archetype, canEdit, isGM }) {
    const esc      = foundry.utils.escapeHTML;
    const disabled = canEdit ? "" : "disabled";

    const archetypeOpts = Object.values(SOCIAL_TRIADS).map(triad => {
      const opts = SOCIAL_ARCHETYPES.filter(a => a.triad === triad.id).map(a =>
        `<option value="${a.id}" ${notes.archetypeId === a.id ? "selected" : ""}>${a.label}</option>`
      ).join("");
      return `<optgroup label="${triad.label}">${opts}</optgroup>`;
    }).join("");

    const archDesc = archetype ? this._buildArchetypeCard(archetype) : "";

    // Extended Triad — distribute a shared pool of TRIAD_POINT_POOL points
    const triadTotal = Object.values(notes.triad).reduce((s, v) => s + (v || 0), 0);
    const remaining  = TRIAD_POINT_POOL - triadTotal;
    const triadRows = Object.values(SOCIAL_TRIADS).map(triad => {
      const val  = notes.triad[triad.id] ?? 0;
      const pips = Array.from({ length: 3 }, (_, i) => `
        <button class="tsl-chr-triad-pip ${i < val ? "filled" : ""}"
                data-triad="${triad.id}" data-value="${i + 1}"
                style="--triad-color:${triad.color}" ${disabled}></button>`).join("");
      return `
        <div class="tsl-chr-triad-row">
          <span class="tsl-chr-triad-label" style="--triad-color:${triad.color}"
                data-tooltip="${esc(triad.hint)}">
            <i class="fas ${triad.icon}"></i> ${triad.label}
          </span>
          <div class="tsl-chr-triad-pips">${pips}</div>
        </div>`;
    }).join("");

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
        <div class="tsl-notes-section-title" data-tooltip="GM ONLY — the character's TRUE nature when targeted: which maneuvers cut deep (✦) and which bounce off (⚡). Players never see this; they deduce it from tells and note their guess in their Bonds.">Archetype · their defence (GM)</div>
        <select name="archetypeId" ${disabled}>
          <option value="">— Unknown / None —</option>
          ${archetypeOpts}
        </select>
        ${archDesc}
      </section>`}

      ${!this._actor.hasPlayerOwner ? "" : `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="ATTACK — how THIS character fights when they maneuver others: +1 per dot to that school, −1 on a triad with 0 dots (foreign ground). Dots also sharpen everyday checks: Power → Intimidation, Emotion → Insight, Order → Deception (+1 per dot). Spend a shared pool of ${TRIAD_POINT_POOL} points. Player characters only — NPCs fight from their archetype's school automatically.">
          Extended Triad · your attack
          <span class="tsl-chr-triad-budget ${remaining < 0 ? "over" : remaining === 0 ? "spent" : ""}">${
            remaining < 0 ? `${-remaining} over — lower a triad` : `${remaining} / ${TRIAD_POINT_POOL} left`
          }</span>
        </div>
        ${triadRows}
      </section>`}

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="The main profiling points. Hover each label for how to use it at the table.">Profiling</div>
        ${pointRows}
      </section>

      ${(game.settings.get("tsl-social-conflict", "conflictMode") === "fencing") ? "" : (() => {
        // TSL playbook (class): its signature moves join the basic five in conflicts
        const pbId = SocialArchetypeManager.getActorData(this._actor)?.playbookId ?? "";
        const pb   = TSLPlaybooks.getById(pbId);
        const esc2 = foundry.utils.escapeHTML;
        const opts = TSLPlaybooks.getOptions().map(o =>
          `<option value="${o.id}" ${pbId === o.id ? "selected" : ""}>${o.label}</option>`).join("");
        const card = pb ? `
          <div class="tsl-chr-arch-hint"><i class="fas ${pb.icon}"></i> ${esc2(pb.essence)}</div>
          <div class="tsl-notes-arch-meta">
            ${pb.moves.map(m => `<span class="tsl-arch-mv-chip tsl-arch-mv-chip--playbook"
                data-tooltip="${esc2(m.desc)}"><i class="fas ${m.icon}"></i> ${esc2(m.name)} · ${m.stat}</span>`).join("")}
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

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Why do they want what they want? Feeds the tells whispered on a read.">Motivation</div>
        <textarea name="motivation" rows="2" placeholder="Why do they want this?" ${disabled}>${foundry.utils.escapeHTML(notes.motivation)}</textarea>
      </section>

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Personality</div>
        <textarea name="personality" rows="2" placeholder="How do they behave?" ${disabled}>${foundry.utils.escapeHTML(notes.personality)}</textarea>
      </section>

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Notes</div>
        <textarea name="notes" rows="3" placeholder="Additional context…" ${disabled}>${foundry.utils.escapeHTML(notes.notes)}</textarea>
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
    const vulnChips = rel.vulnerable.map(m => chip(m, "vulnerable", "✦", "Against this archetype: Advantage on the roll, +1 Resolve damage.")).join("");
    const immChips  = rel.immune.map(m => chip(m, "immune", "⚡", "Against this archetype: auto-fails, they turn Defiant for 1 hour.")).join("");

    const tells = !compact && archetype.tells?.length
      ? `<ul class="tsl-arch-tells">${archetype.tells.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`
      : "";

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
        <div class="tsl-arch-matrix">
          ${vulnChips ? `<div class="tsl-arch-matrix-row">${vulnChips}</div>` : ""}
          ${immChips  ? `<div class="tsl-arch-matrix-row">${immChips}</div>`  : ""}
        </div>
      </div>`;
  }

  // ── Codex tab — the rulebook page: triads, archetypes, statuses ─────────────

  _buildCodexTab() {
    const esc = foundry.utils.escapeHTML;

    const how = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">How Fencing Works</div>
        <ol class="tsl-codex-how">
          <li><b>Read them — and guess.</b> No one hands you the archetype. Watch behavior; a successful Study the Mask / Crack the Cipher whispers a <b>tell</b>. Write your guess into your Bond ("Read as") — the ✦/⚡ marks follow YOUR read, right or wrong, while the dice always follow the truth. Wrong guesses teach: an unexpected bounce or a surprising crit is evidence.</li>
          <li><b>Pick the lever.</b> A maneuver is d20 + skill vs their <b>social DC</b> — 10 + WIS + proficiency, or passive Insight if higher (± their attitude to you, −5 if Rattled). Hitting a <span class="tsl-codex-vuln">✦ vulnerability</span> gives Advantage and +1 Resolve damage; hitting an <span class="tsl-codex-imm">⚡ immunity</span> auto-fails and makes them Defiant.</li>
          <li><b>Lean into your nature.</b> Your own Extended Triad dots (Profile tab) power your attacks: <b>+1 per dot</b> on that triad's maneuvers, <b>−1</b> on a triad where you have none — foreign ground. Watch for the ★/▼ badges on the maneuver groups. General Tactics are always neutral.</li>
          <li><b>Know the counter cycle.</b> Every archetype is soft against the school that counters its triad (<b>+2</b> to the attacker, » badge): <b>Power breaks Emotion → Emotion cracks Order → Order binds Power</b>. Read them first — before a read, the panel only whispers that "something in them yields".</li>
          <li><b>Play your leverage.</b> A read dossier unlocks their <b>Desire</b> (Advantage, +1 Resolve damage), <b>Fear</b> (+3, but a failed threat burns their Patience) and <b>Weakness</b> (neutral counts as vulnerable) — each once per encounter.</li>
          <li><b>Win the exchange.</b> Successes break <b>Resolve</b> (0 = swayed, attitude +1); failures burn <b>Patience</b> (0 = they walk away, attitude −1 — and HOW they leave depends on their triad). Statuses chain into combos; Strings buy +2.</li>
          <li><b>Or win sincerely.</b> Emotional moves (2d6) are the honest route: a Strong Hit on Speak from the Heart or Provoke also chips 1 Resolve, and Read the Room (10+) reveals their nature without manipulation.</li>
        </ol>
      </section>`;

    const triadBlocks = Object.values(SOCIAL_TRIADS).map(triad => {
      const cards = SOCIAL_ARCHETYPES
        .filter(a => a.triad === triad.id)
        .map(a => this._buildArchetypeCard(a, true))
        .join("");
      return `
        <section class="tsl-notes-section tsl-codex-triad" style="--triad-color:${triad.color}">
          <div class="tsl-codex-triad-head">
            <i class="fas ${triad.icon}"></i> ${esc(triad.label)}
          </div>
          <div class="tsl-codex-triad-hint">${esc(triad.hint)}</div>
          ${cards}
        </section>`;
    }).join("");

    const statusRows = SOCIAL_CONDITION_ORDER.map(id => {
      const meta = SOCIAL_CONDITIONS[id];
      return `
        <div class="tsl-codex-status">
          <img src="${meta.icon}" alt="">
          <div>
            <div class="tsl-codex-status-name">${esc(meta.label)}${meta.oneShot ? ` <span class="tsl-codex-oneshot" data-tooltip="Consumed by the first roll it affects.">one-shot</span>` : ""}</div>
            <div class="tsl-codex-status-desc">${esc(meta.description)}</div>
          </div>
        </div>`;
    }).join("");

    return `
      ${how}
      ${triadBlocks}
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Statuses</div>
        <div class="tsl-codex-statuses">${statusRows}</div>
      </section>`;
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

    const attitudeDots = (bond) => Array.from({ length: 7 }, (_, i) => {
      const v = i - 3;
      return `<button class="tsl-chr-att-dot ${bond.attitude === v ? "active" : ""} ${v < 0 ? "neg" : v > 0 ? "pos" : "zero"}"
                      data-bond-id="${bond.id}" data-attitude="${v}" ${disabled}
                      data-tooltip="${v > 0 ? "+" : ""}${v}">${v === 0 ? "·" : ""}</button>`;
    }).join("");

    // Collapsed one-line summaries; click a row to unfold its editors.
    const rows = bonds.length ? bonds.map(b => {
      const type = SocialArchetypeManager.getBondType(b.type);
      const open = this._expandedBonds.has(b.id);
      const perceived = SOCIAL_ARCHETYPES.find(a => a.id === b.perceivedArchetypeId);
      const attCls  = b.attitude > 0 ? "pos" : b.attitude < 0 ? "neg" : "zero";
      const attText = b.attitude > 0 ? `+${b.attitude}` : `${b.attitude}`;
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
            <span class="tsl-chr-bond-label" data-tooltip="How ${esc(this._actor.name)} feels about them, −3 hostile … +3 devoted. When THEY try to sway ${esc(this._actor.name)}, this shifts the DC.">Attitude</span>
            <div class="tsl-chr-att-track">${attitudeDots(b)}</div>
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="Your working guess at their archetype — deduce it from tells (Study the Mask whispers one). The ✦/⚡ marks in fencing follow THIS guess, right or wrong; refine it as you learn.">Read as</span>
            <select class="tsl-chr-bond-arch" data-bond-id="${b.id}" ${disabled}>${archOpts(b.perceivedArchetypeId)}</select>
            ${canEdit ? `
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="1"  data-tooltip="Gain a string on them">+</button>
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="-1" data-tooltip="Spend / remove a string" ${b.stringCount ? "" : "disabled"}>−</button>` : ""}
          </div>
          <input type="text" class="tsl-chr-bond-notes" data-bond-id="${b.id}" value="${esc(b.notes)}"
                 placeholder="History, debts, secrets between you…" ${disabled} />
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
          <span class="tsl-chr-att-badge tsl-chr-att-badge--${attCls}" data-tooltip="Attitude">${attText}</span>
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
        <button class="tsl-chr-pick-btn ${this._picking ? "picking" : ""}"
                data-tooltip="Pick from canvas: click a visible token on the map to bond with it. Esc cancels.">
          <i class="fas fa-crosshairs"></i> ${this._picking ? "Click a token… (Esc)" : "Pick token"}
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
    const consoleHtml = this._buildManeuverConsole(ctx);
    // Players get just the console; the GM also gets track control + the board.
    if (!ctx.isGM) return consoleHtml;
    return consoleHtml + this._buildGMFencing(ctx);
  }

  /**
   * The maneuver console — THIS character fences a chosen target: pick a
   * target, see their Resolve/Patience, pick a maneuver, roll (overlay on top).
   * Works from any owner's token menu, no GM-launched conflict required.
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
      body = `<div class="tsl-fc-note">Choose a target above to fence them.</div>`;
    } else {
      const enc   = SocialEncounterManager.getEncounter(tgt);
      // GM sees the truth; a player sees THEIR OWN GUESS from the Bond ("Read as")
      const guessId = TSLBondStore.find(src.id, tgt.id)?.perceivedArchetypeId ?? null;
      const arch  = ctx.isGM
        ? SocialArchetypeManager.getArchetype(tgt)
        : (guessId ? SocialArchetypeManager.getArchetypeById(guessId) : null);
      const isGuess = !ctx.isGM;
      const known = !!arch;
      const triad = arch ? SOCIAL_TRIADS[arch.triad] : null;

      const pips = (val, max, cls) => Array.from({ length: max }, (_, i) =>
        `<span class="tsl-notes-pip tsl-notes-pip--${cls} ${i < val ? "filled" : ""}"></span>`).join("");
      const tracks = enc.active
        ? `<div class="tsl-fc-tracks">
             <span class="tsl-fc-tk" data-tooltip="Resolve = 3 + their WIS mod (3–8). Successful maneuvers chip it; break it (0) to sway them."><b>RES</b>${pips(enc.resolve, enc.maxResolve, "resolve")}</span>
             <span class="tsl-fc-tk" data-tooltip="Patience = 4 + their CHA mod (3–8). Failures burn it; at 0 they walk away."><b>PAT</b>${pips(enc.patience, enc.maxPatience, "patience")}</span>
           </div>`
        : enc.outcome
          ? `<div class="tsl-chr-outcome tsl-chr-outcome--${enc.outcome}">${enc.outcome === "swayed" ? "💔 Swayed" : "🚪 Walked away"}</div>`
          : `<div class="tsl-fc-note">Their tracks start on your first maneuver.</div>`;

      const archLine = arch
        ? `<span class="tsl-fc-arch" style="--triad-color:${triad?.color ?? "#806858"}" data-tooltip="${isGuess ? "<b>Your read (may be wrong)</b><br>" : ""}${esc(arch.hint ?? arch.description)}">${isGuess ? `<i class="fas fa-pencil tsl-guess-i"></i>` : `<i class="fas ${triad?.icon ?? "fa-user"}"></i>`} ${esc(arch.label)}${isGuess ? "?" : ""}</span>`
        : `<span class="tsl-fc-arch tsl-fc-arch--unread" data-tooltip="Their nature is a riddle — Study the Mask whispers a tell; write your guess into your Bond ('Read as') and the ✦/⚡ marks will follow it.">Nature unread</span>`;

      // Maneuver chips grouped by triad — marks follow the viewer's read
      const chips = MANEUVER_GROUPS.map(g => {
        const mvs = SOCIAL_MANEUVERS.filter(m => m.group === g.id);
        const color = SOCIAL_TRIADS[g.id]?.color ?? "#806858";
        const short = (SOCIAL_TRIADS[g.id]?.label ?? g.label).replace("Triad of ", "");
        const cs = mvs.map(m => {
          const isSel = this._fenceManeuverId === m.id;
          const rel   = SocialManeuverRoller.getRelation(tgt, m, ctx.isGM ? undefined : (arch ?? null));
          const mark  = known && rel === "immune" ? `<span class="tsl-chip-mark tsl-chip-mark--imm">⚡</span>`
                      : known && rel === "vulnerable" ? `<span class="tsl-chip-mark tsl-chip-mark--vuln">✦</span>` : "";
          return `<button class="tsl-chip ${isSel ? "selected" : ""}" data-fence-maneuver="${m.id}"
                    data-tooltip="<b>${esc(m.name)}</b> · ${esc(m.skill)}<br>${esc(m.description)}">
                    <i class="fas ${m.icon}"></i><span class="tsl-chip-name">${esc(m.name)}</span>${mark}</button>`;
        }).join("");
        return `<div class="tsl-chip-group" style="--triad-color:${color}">
          <div class="tsl-chip-group-label">${esc(short)}</div><div class="tsl-chip-grid">${cs}</div></div>`;
      }).join("");

      body = `
        <div class="tsl-fc-head">
          <div class="tsl-fc-head-name">${esc(tgt.name)}</div>
          ${archLine}
        </div>
        ${tracks}
        <div class="tsl-fc-maneuvers">${chips}</div>
        ${this._buildFenceBar(ctx, src, tgt, arch, isGuess)}`;
    }

    return `
      <section class="tsl-notes-section tsl-fc">
        <div class="tsl-notes-section-title" data-tooltip="Fence a target from your own menu: pick who, pick a maneuver, roll. No GM setup needed.">Maneuver — ${esc(src.name)} acts</div>
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

  /** The pre-roll action bar for the selected maneuver in the console.
   *  `dispArch` is what the viewer believes (GM: truth, player: guess) —
   *  predictions follow it; the real roll follows the truth. */
  _buildFenceBar(ctx, src, tgt, dispArch, isGuess) {
    const m = this._fenceManeuverId ? SocialManeuverRoller.getManeuver(this._fenceManeuverId) : null;
    if (!m) return `<div class="tsl-fc-note tsl-fc-note--pick">Pick a maneuver to see the roll.</div>`;
    const esc   = foundry.utils.escapeHTML;
    const known = !!dispArch;
    const a = SocialManeuverRoller.assess(src, tgt, m, {
      leverage: this._fenceLeverage,
      archetypeOverride: ctx.isGM ? undefined : (dispArch ?? null),
    });
    const strAdd = this._fenceStringSpend ? STRING_SPEND_BONUS : 0;
    const extra  = a.bonus + strAdd;

    const bonusList = [
      ...(strAdd ? [`+${strAdd} String`] : []),
      ...a.bonusReasons.map(b => `${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label.split(" — ")[0])}`),
    ];
    const extraChip = extra ? `<span class="tsl-bar-extra ${extra >= 0 ? "pos" : "neg"}" data-tooltip="${esc(bonusList.join(", "))}${isGuess && known ? " — predictions follow your read" : ""}">${extra >= 0 ? "+" : "−"}${Math.abs(extra)}</span>` : "";
    const advMark = a.advantage ? `<span class="tsl-bar-adv" data-tooltip="${esc(a.advantageReasons.join("; "))}${isGuess ? " — if your read is right" : ""}">ADV${isGuess && a.relation === "vulnerable" ? "?" : ""}</span>` : "";

    // String spend toggle (src holds a String on tgt)
    const held = TSLStringStore.getList(src.id).filter(e => e.targetActorId === tgt.id);
    const strBtn = held.length
      ? `<button class="tsl-fc-string ${this._fenceStringSpend ? "pending" : ""}" data-tooltip="${this._fenceStringSpend ? "Cancel" : `Spend a String for +${STRING_SPEND_BONUS} (${held.length} held)`}"><i class="fas fa-masks-theater"></i> +${STRING_SPEND_BONUS}</button>`
      : "";

    // Leverage toggles
    const enc = SocialEncounterManager.getEncounter(tgt);
    const points = SocialArchetypeManager.getCharacterNotes(tgt).points;
    const LEV = [
      { id: "desire",   label: "Desire",   icon: "fa-gem" },
      { id: "fear",     label: "Fear",     icon: "fa-ghost" },
      { id: "weakness", label: "Weakness", icon: "fa-heart-crack" },
    ];
    const levBtns = enc.active
      ? LEV.filter(l => (points[l.id] ?? "").trim()).map(l => {
          const used = enc.leverage?.[l.id];
          const sel  = this._fenceLeverage === l.id;
          return `<button class="tsl-lev-btn ${sel ? "selected" : ""}" data-fence-leverage="${l.id}" ${used ? "disabled" : ""}
                    data-tooltip="${esc(l.label)}: ${esc(points[l.id] ?? "")}"><i class="fas ${l.icon}"></i> ${l.label}</button>`;
        }).join("")
      : "";

    const readPrefix = isGuess ? "Your read: " : "";
    let hint = "", hintCls = "dim";
    if (a.relation === "blocked")        { hint = a.relationReason; hintCls = "imm"; }
    else if (known && a.relation === "immune")     { hint = `${readPrefix}${a.relationReason} — ${isGuess ? "if you're right, it fails and they turn Defiant." : "it fails, they turn Defiant."}`; hintCls = "imm"; }
    else if (known && a.relation === "vulnerable") { hint = `${readPrefix}this should cut deep — Advantage & +1 Resolve damage${isGuess ? " (if your read is right)" : ""}.`; hintCls = "vuln"; }
    else if (!known)                     { hint = "Their nature is a riddle — read tells, then note your guess in your Bond ('Read as')."; }

    // A visible, plain-language breakdown of every modifier in play — so it's
    // obvious WHERE the bonuses come from, not hidden in a tooltip.
    const breakdown = [];
    breakdown.push(`<span class="tsl-fc-mod tsl-fc-mod--base">${esc(m.skill)} ${a.skillMod >= 0 ? "+" : "−"}${Math.abs(a.skillMod)}</span>`);
    if (strAdd) breakdown.push(`<span class="tsl-fc-mod pos">+${strAdd} String spent</span>`);
    for (const b of a.bonusReasons) {
      breakdown.push(`<span class="tsl-fc-mod ${b.value >= 0 ? "pos" : "neg"}">${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label)}</span>`);
    }
    for (const r of a.advantageReasons) breakdown.push(`<span class="tsl-fc-mod adv">ADV — ${esc(r)}</span>`);
    for (const dm of a.dcMods) breakdown.push(`<span class="tsl-fc-mod ${dm.value < 0 ? "pos" : "neg"}">DC ${dm.value > 0 ? "+" : "−"}${Math.abs(dm.value)} · ${esc(dm.label)}</span>`);
    if (isGuess && known) breakdown.push(`<span class="tsl-fc-mod">predictions follow your read — may be wrong</span>`);

    const blocked = a.relation === "blocked";
    return `<div class="tsl-bar tsl-bar--fence">
      <div class="tsl-bar-line">
        <div class="tsl-bar-core">
          <span class="tsl-bar-move">${esc(m.name)} ${advMark}</span>
          <span class="tsl-bar-roll">${esc(m.skill)} ${a.skillMod >= 0 ? "+" : "−"} ${Math.abs(a.skillMod)} ${extraChip}
            <span class="tsl-bar-dim">vs DC <b>${a.dc}</b></span></span>
        </div>
        ${strBtn}
        ${blocked ? "" : `<button class="tsl-fc-roll tsl-roll-btn" style="--active-color:#9b6ee8">Roll</button>`}
      </div>
      ${levBtns ? `<div class="tsl-bar-lev">${levBtns}</div>` : ""}
      <div class="tsl-fc-breakdown">${breakdown.join("")}</div>
      ${hint ? `<div class="tsl-bar-hint tsl-bar-hint--${hintCls}">${esc(hint)}</div>` : ""}
    </div>`;
  }

  // ── GM-only fencing controls (tracks + statuses + scene board) ──────────────

  _buildGMFencing({ encounter, activeConditions }) {
    const esc = foundry.utils.escapeHTML;
    const act = encounter.active;

    const track = (label, val, max, cls, tip) => `
      <div class="tsl-notes-patience-track" data-tooltip="${tip}">
        <span class="tsl-notes-patience-label">${label}</span>
        <div class="tsl-notes-pips">
          ${Array.from({ length: max }, (_, i) =>
            `<span class="tsl-notes-pip tsl-notes-pip--${cls} ${i < val ? "filled" : ""}"></span>`).join("")}
        </div>
        <span class="tsl-notes-patience-count">${val}/${max}</span>
        <button class="tsl-notes-patience-adj" data-track="${cls}" data-delta="-1">−</button>
        <button class="tsl-notes-patience-adj" data-track="${cls}" data-delta="1">+</button>
      </div>`;

    // THIS character's tracks appear on their own once a maneuver lands; here
    // the GM can only nudge or reset them (no "Start" — that's automatic now).
    const selfTracks = act
      ? `${track("Resolve", encounter.resolve, encounter.maxResolve, "resolve",
            "Their will. Maneuver successes reduce it — 2 on a vulnerability. At 0 they are swayed.")}
         ${track("Patience", encounter.patience, encounter.maxPatience, "patience",
            "Their tolerance. Failures and triggered immunities reduce it. At 0 they walk away.")}
         <button class="tsl-notes-enc-btn tsl-notes-enc-btn--end" data-enc-action="end" data-tooltip="Clear the tracks. The next maneuver will start fresh ones.">Reset tracks</button>`
      : encounter.outcome
        ? `<div class="tsl-chr-outcome tsl-chr-outcome--${encounter.outcome}">
             ${encounter.outcome === "swayed" ? "💔 Swayed — resolve broken." : "🚪 Walked away — patience exhausted."}
           </div>
           <button class="tsl-notes-enc-btn" data-enc-action="end" data-tooltip="Clear the result so a new exchange can begin.">Reset</button>`
        : `<div class="tsl-notes-patience-inactive">No exchange yet — tracks start automatically on the first maneuver against ${esc(this._actor.name)}.</div>`;

    const condBtns = SOCIAL_CONDITION_ORDER.map(id => {
      const on   = activeConditions[id];
      const meta = SOCIAL_CONDITIONS[id];
      return `<button class="tsl-cond-toggle ${on ? "active" : ""}" data-condition="${id}"
                      data-tooltip="<b>${meta.label}</b><br>${esc(meta.description)}">
                <img src="${meta.icon}" alt=""><span>${meta.label}</span>
              </button>`;
    }).join("");
    const anyActive = Object.values(activeConditions).some(Boolean);

    return `
      <section class="tsl-notes-section tsl-notes-section--encounter">
        <div class="tsl-notes-section-title" data-tooltip="Break their Resolve before their Patience runs out. Tracks arm themselves — no setup needed.">${esc(this._actor.name)}'s tracks</div>
        ${selfTracks}
      </section>
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Fencing statuses on this character. Maneuvers apply them; toggle here to override.">Statuses</div>
        <div class="tsl-cond-grid">${condBtns}</div>
        ${anyActive ? `<button class="tsl-cond-clear" data-tooltip="Remove all fencing statuses.">Clear all statuses</button>` : ""}
      </section>
      ${this._buildStatusBoard()}`;
  }

  /**
   * A scene-wide "who has what" board: every token whose actor carries a
   * fencing status, live tracks, or a resolved outcome. Read-only overview.
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

      const dots = conds.map(c =>
        `<span class="tsl-board-tag" style="--st-color:${c.meta.color ?? "#806858"}" data-tooltip="<b>${c.meta.label}</b><br>${esc(c.meta.description)}">${esc(c.meta.label)}</span>`
      ).join("");
      const tracks = enc.active
        ? `<span class="tsl-board-track" data-tooltip="Resolve / Patience">R${enc.resolve} · P${enc.patience}</span>`
        : enc.outcome
          ? `<span class="tsl-board-out tsl-board-out--${enc.outcome}">${enc.outcome === "swayed" ? "swayed" : "walked"}</span>`
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
      : `<div class="tsl-notes-string-empty">No one in the scene carries a status yet.</div>`;
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Everyone on the scene who currently carries a fencing status, live tracks, or a resolved outcome.">Scene status board</div>
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
      SocialArchetypeManager.setActorData(this._actor, { archetypeId: e.target.value || null });
    });

    el.querySelector("select[name='playbookId']")?.addEventListener("change", (e) => {
      TSLPlaybooks.setForActor(this._actor, e.target.value || null);
    });

    for (const name of ["motivation", "personality", "notes"]) {
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
      });
    });

    // ── Bonds ────────────────────────────────────────────────────────────────
    el.querySelector(".tsl-chr-add-select")?.addEventListener("change", async (e) => {
      const targetId = e.target.value;
      if (!targetId) return;
      const entry = await TSLBondStore.add(this._actor.id, targetId);
      if (entry) this._expandedBonds.add(entry.id); // open the fresh bond for editing
    });

    el.querySelector(".tsl-chr-pick-btn")?.addEventListener("click", () => {
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

    el.querySelectorAll(".tsl-chr-str-adj").forEach(btn => {
      btn.addEventListener("click", async () => {
        const targetId = btn.dataset.target;
        const delta    = parseInt(btn.dataset.delta);
        if (delta > 0) await TSLStringStore.add(this._actor.id, targetId, 1);
        else           await TSLStringStore.spend(this._actor.id, targetId);
        this.render(true);
      });
    });

    // ── Fencing (GM) ─────────────────────────────────────────────────────────
    el.querySelectorAll(".tsl-notes-patience-adj").forEach(btn => {
      btn.addEventListener("click", () => {
        const delta = parseInt(btn.dataset.delta);
        if (btn.dataset.track === "resolve") SocialEncounterManager.adjustResolve(this._actor, delta);
        else                                 SocialEncounterManager.adjustPatience(this._actor, delta);
      });
    });

    el.querySelector("[data-enc-action='end']")?.addEventListener("click", () =>
      SocialEncounterManager.endEncounter(this._actor)
    );

    el.querySelectorAll(".tsl-cond-toggle[data-condition]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const condId = btn.dataset.condition;
        if (btn.classList.contains("active")) {
          await SocialArchetypeManager.removeCondition(this._actor, condId);
        } else {
          await SocialArchetypeManager.applyCondition(this._actor, condId);
        }
        this.render(true);
      });
    });

    el.querySelector(".tsl-cond-clear")?.addEventListener("click", async () => {
      for (const id of SOCIAL_CONDITION_ORDER) {
        await SocialArchetypeManager.removeCondition(this._actor, id);
      }
      this.render(true);
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
        this._fenceManeuverId  = this._fenceManeuverId === id ? null : id;
        this._fenceLeverage    = null;
        this._fenceStringSpend = false;
        this.render(true);
      });
    });

    el.querySelector(".tsl-fc-string")?.addEventListener("click", () => {
      this._fenceStringSpend = !this._fenceStringSpend;
      this.render(true);
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

    // System-style roll dialog: situational modifier + adv/dis. Cancel = free.
    const mods = await SocialManeuverRoller.promptRollMods(`${maneuver.name} → ${tgt.name}`, assessment.advantage);
    if (!mods) return;

    let stringBonus = 0;
    if (this._fenceStringSpend) {
      const held = TSLStringStore.getList(src.id).filter(e => e.targetActorId === tgt.id);
      if (held.length) {
        await TSLStringStore.removeEntry(src.id, held[0].id);
        stringBonus = STRING_SPEND_BONUS;
      }
    }

    const payload = await SocialManeuverRoller.rollManeuver(src, tgt, maneuver, {
      stringBonus, leverage, situational: mods.situational, mode: mods.mode,
    });
    TSLGMActions.request("maneuverOutcome", payload);

    this._fenceRoll = {
      name: maneuver.name, icon: maneuver.icon,
      total: payload.total, dc: payload.dc, outcome: payload.outcomeType,
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
    Hooks.off("deleteActiveEffect", this._deleteEffHook);
    SocialFencingDialog._instances.delete(this._actor.id);
    return super.close(options);
  }
}
