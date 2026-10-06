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
    const oc = (r.outcome === "success" || r.outcome === "crit") ? "Strong Hit" : "Miss";
    const label = r.outcome === "crit"    ? "★ Clean hit"
                : r.outcome === "success" ? "Success"
                : r.outcome === "immune"  ? "✕ Walled off"
                : r.outcome === "botch"   ? (r.natural === 1 ? "Natural 1 — ⚔ They answer" : "⚔ They answer")
                : r.natural === 1         ? "Natural 1 — Failure"
                : "Failure";
    return `<div class="tsl-dice-overlay"><div class="tsl-dice-panel tsl-dice-panel--maneuver">
      <div class="tsl-dice-move"><i class="fas ${r.icon}"></i> ${foundry.utils.escapeHTML(r.name)}</div>
      <div class="tsl-dice-total" data-outcome="${oc}">${r.total}</div>
      <div class="tsl-dice-breakdown">${game.user.isGM ? `vs DC ${r.dc}` : "vs ?"}</div>
      <div class="tsl-dice-outcome" data-outcome="${oc}" data-tooltip="${foundry.utils.escapeHTML(SocialManeuverRoller.gradeTip(r.outcome, r.natural))}">${label}</div>
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

    // The dots' SECOND effect, made explicit: what the 'Social Leanings' effect
    // adds to everyday skills on the sheet (maneuvers that roll them include it).
    const leanLine = (() => {
      const TS = SocialArchetypeManager.TRIAD_SKILLS;
      const chips = Object.entries(TS).map(([t, m]) => {
        const v = SocialArchetypeManager.leanSkillBonus(this._actor, m.key);
        const tl = (SOCIAL_TRIADS[t]?.label ?? t).replace("Triad of ", "");
        return v ? `<span class="tsl-chr-lean-chip" data-tooltip="${esc(`${tl} ${"●".repeat(v)} → +${v} ${m.label} — ${m.why}. It is an effect on your sheet (Social Leanings), so it counts on EVERY ${m.label} check; a maneuver that rolls ${m.label} shows it as 'incl. +${v} leaning'. A maneuver of the ${tl} school that ALSO rolls ${m.label} gets both bonuses — your signature move.`)}">+${v} ${m.label}</span>` : null;
      }).filter(Boolean);
      return chips.length
        ? `<div class="tsl-chr-lean"><span class="tsl-chr-lean-label">On your sheet:</span>${chips.join("")}<span class="tsl-chr-lean-note">every check, maneuvers included</span></div>`
        : `<div class="tsl-chr-lean tsl-chr-lean--empty">Dots also sharpen everyday checks: Power → Intimidation, Emotion → Insight, Reason → Deception (+1 per dot).</div>`;
    })();

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
        <div class="tsl-notes-section-title" data-tooltip="GM ONLY — the character's TRUE nature when targeted: which maneuvers cut deep (◎) and which bounce off (✕). Players never see this; they deduce it from tells and note their guess in their Bonds.">Archetype · their defence (GM)</div>
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
        ${this._actor.hasPlayerOwner ? "" : (() => {
          // How this NPC meets a landed blow on its own (no window for the GM)
          const ST  = SocialArchetypeManager.DEFENSE_STANCES;
          const raw = SocialArchetypeManager.getActorData(this._actor).stance ?? "nature";
          const now = SocialArchetypeManager.getStance(this._actor);
          const opts = Object.entries(ST).map(([id, st]) => `<option value="${id}" ${raw === id ? "selected" : ""}>${esc(st.label)}${id === "nature" && now !== "ask" ? ` (${esc(ST[now]?.label ?? now)})` : ""}</option>`).join("");
          const tip = Object.values(ST).map(st => `<b>${st.label}</b> — ${st.tip}`).join("<br>");
          return `<div class="tsl-stance-row">
            <span class="tsl-stance-label" data-tooltip="${esc(`How this NPC meets a landed blow ON ITS OWN — no window for you.<br>${tip}`)}"><i class="fas fa-shield-halved"></i> Defence stance</span>
            <select name="stance" ${disabled}>${opts}</select>
          </div>
          <div class="tsl-stance-hint">${esc(ST[raw === "nature" ? now : raw]?.tip ?? "")}</div>`;
        })()}
      </section>`}

      ${!this._actor.hasPlayerOwner ? "" : `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Spend ${TRIAD_POINT_POOL} dots. They cut both ways.<br><b>Attack:</b> +1 per dot on that school's maneuvers (−1 on a 0-dot school) — AND +1 per dot to one everyday skill on your sheet (see the line under the dots).<br><b>Defense:</b> a ruling triad (a clear 2+● lead) is your readable nature: the school that beats it gets +2 against you, the school it beats gets −2, and your Answer bites bad misses. A 0-dot school is your blind side. Split evenly = unreadable, but no Answer.">
          Extended Triad · your nature
          <span class="tsl-chr-triad-budget ${remaining < 0 ? "over" : remaining === 0 ? "spent" : ""}">${
            remaining < 0 ? `${-remaining} over — lower a triad` : `${remaining} / ${TRIAD_POINT_POOL} left`
          }</span>
        </div>
        ${triadRows}
        ${leanLine}
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

      ${!isGM ? "" : `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="GM only. What THEY want from the party in this conversation — a secret, a promise, money, humiliation. If they WIN the exchange (the other side breaks off or is swayed), this agenda ADVANCES: losing the exchange must cost the players something.">Agenda — what they want (GM)</div>
        <textarea name="intent" rows="2" placeholder="What do they want from this conversation?">${foundry.utils.escapeHTML(notes.intent)}</textarea>
      </section>`}

      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Anything the dossier above doesn't cover — how they behave, quirks, history, the story behind their Desire.">Notes</div>
        <textarea name="notes" rows="3" placeholder="How they behave, history, the why behind their Desire…" ${disabled}>${foundry.utils.escapeHTML(notes.notes)}</textarea>
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
    const vulnChips = rel.vulnerable.map(m => chip(m, "vulnerable", "◎", "Against this nature: Advantage on the roll, +1 Resolve damage, and it can't be parried.")).join("");
    const immChips  = rel.immune.map(m => chip(m, "immune", "✕", "Against this nature: it fails outright, costs you like a miss, and they turn Defiant.")).join("");

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
        : full && m.scar && CE.getScarMeta(m.scar) ? ` → calcifies into <b>${esc(CE.getScarMeta(m.scar).label)}</b>` : "";
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
      ? `From Hold the Line, a public humiliation, a sincere Feelings move, or plain drama. Each escalates <b>● → ●● → ●●●</b>; pressed again it <b>deepens</b>. Its <b>urge</b> pulls you — give in (the <b>Give in</b> button) → +1 Willpower. A long rest eases a Wound one tier (a Light one heals); left at ●●● it <b>calcifies</b> — into a Scar if it's about you, into a <b>bond</b> if it's about someone. Wounds weighing <b>4+</b> (sum of tiers) = <b>Overwhelmed</b>: no parrying, no holding the line — yield or flee.`
      : `From Hold the Line, a public humiliation, a sincere Feelings move, or plain drama. Each escalates <b>● → ●● → ●●●</b>; pressed again it <b>deepens</b>. Its <b>urge</b> is a roleplay prompt — play it. A long rest eases a Wound one tier (a Light one heals); one about <b>someone</b> left at ●●● settles into a <b>bond</b> with them instead. Wounds weighing <b>4+</b> (sum of tiers) = <b>Overwhelmed</b>: no parrying, no holding the line — yield or flee.`;
    const lifecycle = full
      ? `<b>Wound → deepen (● → ●● → ●●●) → long rest.</b> At ●●● it <b>calcifies</b>: a Wound about yourself becomes its <b>Scar</b> (then you're immune to that Wound); a Wound about someone — Obsession, Grudge — becomes a <b>bond</b> with them (a Crush, an Enemy) or deepens the one you share. A lesser Wound <b>eases one tier</b>. So ●●● is your last chance to heal it — or fire its ⚡ Ultimate — before it's permanent. Boons fade when the moment passes (a long rest ends them); Scars lift only through their <b>Clears</b> arc.`
      : `<b>Wound → deepen (● → ●● → ●●●) → long rest.</b> A long rest eases every Wound one tier. A Wound about someone — Obsession, Grudge — left at ●●● becomes a <b>bond</b> with them (a Crush, an Enemy) or deepens the one you share. <i>(This table plays the BASIC emotional layer: no Willpower, Boons or Scars.)</i>`;

    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The emotional layer${full ? "" : " — basic"}</div>
        ${full ? `
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">⬡ Willpower — the resource</summary>
          <div class="tsl-codex-hint-sm">Your emotional reserve (not the same as Patience, which is your composure in one exchange). Pool = your <b>proficiency bonus</b>, refilled on a <b>long rest</b>. Spend 1 to fire an <b>Ultimate</b> (a ●●● Wound / Boon, or a Scar) or to push past a Wound's hard block. Restore 1 by <b>giving in</b> to a Wound's urge — the <b>Give in</b> button on the Wound. It lives in the <b>Fencing</b> tab.</div>
        </details>` : ""}
        <details class="tsl-codex-sub"${full ? "" : " open"}>
          <summary class="tsl-codex-sub-title">❤ Wounds — the dark five</summary>
          <div class="tsl-codex-hint-sm">${woundsBlurb}</div>
          <div class="tsl-codex-combo-list">${woundRows}</div>
        </details>
        ${full ? `
        <details class="tsl-codex-sub">
          <summary class="tsl-codex-sub-title">✦ Boons — the bright four</summary>
          <div class="tsl-codex-hint-sm">The GM grants these for courage, love, triumph or grit. A scaling bonus + a ●●● ultimate (1 Willpower). They do <b>not</b> count toward Overwhelmed.</div>
          <div class="tsl-codex-combo-list">${boonRows}</div>
        </details>
        <details class="tsl-codex-sub">
          <summary class="tsl-codex-sub-title">🩹 Scars — the permanent three</summary>
          <div class="tsl-codex-hint-sm">What a Wound about <b>yourself</b> becomes at ●●● (Wrath, Fear, Despair). Permanent — lifted only by the story (never a rest). Each grants an ability and a cost, and makes you <b>immune to the Wound it came from</b>. A Wound about a <b>person</b> (Obsession, Grudge) doesn't scar you — it settles into your relationship with them.</div>
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
    // table has no maneuvers, tracks, statuses or openings at all. Documenting
    // switched-off layers is what makes the reference read like another game's.
    let mode = "both";
    try { mode = game.settings.get("tsl-social-conflict", "conflictMode") ?? "both"; } catch { /* defaults */ }
    const tslOn     = mode !== "fencing";   // the 2d6 Feelings layer
    const fencingOn = mode !== "tsl";       // d20 maneuvers, tracks, statuses

    // A titled, COLLAPSIBLE block of short bullets — the page opens as a tidy
    // list of headers you expand on demand, instead of one long scroll.
    // (Native <details>: no JS, works in Foundry. `opened` forces it open.)
    const sub = (title, items, opened = false) => `
      <details class="tsl-codex-sub"${opened ? " open" : ""}>
        <summary class="tsl-codex-sub-title">${title}</summary>
        <ul class="tsl-codex-how">${items.map(i => `<li>${i}</li>`).join("")}</ul>
      </details>`;

    // A key term: dotted underline + a hover definition. `term("Resolve")`
    // looks the name up in GLOSSARY; a second arg overrides the tip.
    const GLOSSARY = {
      "Resolve": "The will to not concede. Landed maneuvers chip it; break it to 0 and they're swayed. Starts at CHA mod (floor 1) — force of personality. Kept low on purpose: the weight is the maneuver's school (General 1 · archetype 2 · Humiliate 3), not the HP bar.",
      "Patience": "Composure — EVERYONE in the exchange has it. Your own misses spend it, and so does every parry you make (1 Patience blocks 1 Resolve). Run out and you break off: you lose the exchange, though you concede nothing. Starts at WIS + CHA mod (floor 2) — self-possession + social poise.",
      "social DC": "The hidden difficulty you roll against: 10 + their WIS save + INT save (proficiency baked in), or their passive Insight if higher. Only the GM ever sees the number. A natural 1 always misses.",
      "support skill": "A SECOND skill each maneuver leans on (e.g. Read Them = Insight + Investigation). If you're TRAINED in it, your proficiency bonus is added on top of the main roll; if not, it adds nothing.",
      "opening": "A condition on your target that makes a matching maneuver stronger. Two kinds, same ⊕ mark: a status you set up this exchange (Provoked, Desperate…) that a finisher cashes, or a lasting emotional wound they carry (Wrath, Grudge, Obsession, Fear, Despair) that certain maneuvers press for +2.",
      "String": "A hold on a person — earned by opening up in character, by maneuvers that hand you a lever (reads, Lie, Play Weak, Bargain…), or by winning an exchange. You can hold at most 3 on any one person. No passive effect; it is only ever spent: +5 on ANY roll against them (even an attack), or +5 to your AC or a save against one of theirs.",
      "the Answer": "On a bad fumble OR hitting an immunity, the archetype strikes back in its triad's language: Power → you're Rattled · Emotion → you're Beholden · Reason → they take a String on you.",
      "Hold the Line": "When a maneuver lands a STATE on you, refuse the state by carrying a fitting emotional Wound instead. The blow itself still has to be met (taken or parried). A Wound already at ●●● can't take more.",
      "Overwhelmed": "Wounds weighing 4 or more (add up their tiers — two Deep ones, or a Breaking point and one more). You can no longer parry or hold the line: yield or flee.",
      "swayed": "Resolve broken to 0 — the big loss. They concede the point / do the thing the winner was after (the GM frames it); their bond toward the winner deepens +1; the winner gains a String on them (and the winner's agenda advances, if the GM gave them one). It can happen to either side. Fencing statuses LINGER — they still bite if talk turns to a fight.",
      "break off": "Patience (composure) ran out — spent on misses and parries. The lesser loss: they leave the exchange without conceding anything, but the bond cools −1 and the other side gains a String on them (and that side's agenda advances, if it has one). It can happen to either side — press too wildly and it's YOU who breaks off.",
      "leverage": "A read dossier unlocks their Desire, Fear or Weakness — each playable once per exchange for a strong edge.",
      "bond": "ONE shared relationship between two people, with a TYPE and a STRENGTH (0–3 ●). Record it on either side and it appears on both. It is your weapon (+● on its school), their guard (DC up or down), and a set of skill edges and costs (±● — you can't threaten a friend, can't lie to family, can't charm an enemy).",
      "Advantage": "Roll two d20 and keep the higher.",
    };
    const term = (name, txt) => {
      const tip = (txt ?? GLOSSARY[name] ?? "").replaceAll('"', "&quot;");
      return `<span class="tsl-term" data-tooltip="${tip}">${name}</span>`;
    };

    // ── Combo reference, generated from the data so it's always accurate ──
    const mName = (id) => SOCIAL_MANEUVERS.find(m => m.id === id)?.name ?? id;
    const capId = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const stName = (id) => SOCIAL_CONDITIONS[id]?.label ?? capId(id);

    // ── ONE idea: a condition on the target opens a matching maneuver (⊕). ──
    // We generate a single condition → maneuvers table from every source, so
    // there is exactly one word to learn ("opening") and one place to look.

    // Half 1 — how you CREATE conditions (which maneuver applies which status).
    const setupRows = SOCIAL_CONDITION_ORDER.map(st => {
      const from = SOCIAL_MANEUVERS.filter(m => m.applyOnSuccess === st).map(m => m.name);
      return from.length ? `<li><b>${from.join(", ")}</b> &nbsp;→&nbsp; makes them <b>${stName(st)}</b></li>` : null;
    }).filter(Boolean).join("");

    // Half 2 — every opening, merged by the condition that triggers it.
    // A condition maps to a list of { name, gain } entries, whatever the source.
    const openings = {}; // condLabel → [{ name, gain }]
    const push = (cond, name, gain) => (openings[cond] ??= []).push({ name, gain });

    // fencing statuses cashed by a finisher (from maneuver.combos)
    for (const m of SOCIAL_MANEUVERS) {
      for (const [st, c] of Object.entries(m.combos ?? {})) {
        const gain = [c.resolveDamage ? `+${c.resolveDamage} dmg` : null, c.strings ? `+${c.strings} String` : null].filter(Boolean).join(", ");
        push(stName(st), m.name, gain);
      }
    }
    // Mock kicks anyone who already carries any status
    const kicker = SOCIAL_MANEUVERS.find(m => m.kickWhileDown);
    if (kicker) push("Any status", kicker.name, "+1 dmg");
    // emotional Conditions they carry (from CONDITION_OPENINGS)
    const woundMap = {};
    for (const [mid, conds] of Object.entries(CONDITION_OPENINGS)) {
      for (const cond of Object.keys(conds)) (woundMap[cond] ??= new Set()).add(mName(mid));
    }
    for (const [cond, ms] of Object.entries(woundMap)) {
      for (const name of ms) push(capId(cond), name, "+2");
    }

    const openingRows = Object.entries(openings).map(([cond, list]) => {
      const parts = list.map(e => `${e.name} <span class="tsl-codex-gain">(${e.gain})</span>`).join(", ");
      return `<li>They're <b>${cond}</b> &nbsp;→&nbsp; ${parts}</li>`;
    }).join("");

    const comboReference = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Openings (⊕) — the cheat sheet</div>
        <div class="tsl-codex-hint-sm">One rule, no jargon: <b>a condition on your target makes a matching maneuver stronger.</b> When one is live, that chip shows a ⊕. First you put a condition on them; then you press it.</div>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">Step 1 · Put a condition on them</summary>
          <ul class="tsl-codex-how tsl-codex-combo">${setupRows}</ul>
          <div class="tsl-codex-hint-sm">Lasting emotional wounds (Wrath / Grudge / Obsession / Fear / Despair) also come from Hold the Line, sincere Feelings moves, or a bad fumble — and stay until the story heals them.</div>
        </details>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">Step 2 · Press it — when they're X, these gain ⊕</summary>
          <ul class="tsl-codex-how tsl-codex-combo">${openingRows}</ul>
        </details>
      </section>`;

    const quickStart = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Your turn, step by step</div>
        <ol class="tsl-codex-how tsl-codex-quick">
          <li><b>Pick who.</b> Choose a target above (or the <b>Map</b> button to click their token). You act on one person at a time — never yourself.</li>
          <li><b>Pick a maneuver.</b> Grouped in four schools (General holds the basics). Hover any chip to see exactly what it does to <b>this</b> target. Each rolls a main skill + a ${term("support skill")}.</li>
          <li><b>Roll it.</b> On A5E the system's own roll dialog opens (advantage, expertise dice) with your fencing bonuses pre-filled. You never see the ${term("social DC", "The number you must beat is hidden — 10 + WIS save + INT save, or passive Insight if higher. Only the GM sees it.")} — only the GM does.</li>
          <li><b>The GM calls it.</b> After the dice, the GM has the final word on whether you got through — clean hit, hit, miss, or fumble.</li>
          <li><b>See what it did.</b> A hit chips their ${term("Resolve")} (they may parry it with their own ${term("Patience")}) or lands a status. A miss costs <b>your</b> Patience; a bad miss also lets them <b>Answer</b>. Break their Resolve → they're ${term("swayed")}; make them spend their Patience to nothing → they ${term("break off")}. Run out of your own Patience first and it's <b>you</b> who breaks off.</li>
        </ol>
      </section>`;

    const reference = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The details</div>
        ${sub("Read them — nature is hidden", [
          `No one is handed the archetype. A successful <b>Read Them</b> whispers a private <b>tell</b> — deduce who they are and note your guess in the Bond ("Read as").`,
          `Once you write a guess, the chip marks (◎ weak spot · ✕ walled · ▲ yields) follow <b>your read</b> — a theory, so a wrong guess shows wrong marks. The <b>difficulty</b> stays the GM's to know. Outcomes are the proof: an unexpected bounce, a surprise clean hit, a whispered tell tell you if your read was right.`,
        ])}
        ${sub("The relationship is the terrain", [
          `A ${term("bond")} is <b>ONE shared relationship</b> — one TYPE, one STRENGTH (0–3 ●). Write it on either person and it appears on both; edit it anywhere and both update. (Directional pairs flip to fit: your <b>Mentor</b> is their <b>Protégé</b>, and if you're <b>Sworn</b> to someone, they are your <b>Liege</b>.)`,
          `That one bond works <b>both ways at once</b>: it is your <b>weapon</b> — its school gets <b>+●</b> (rivals feed Power, love feeds Emotion, oaths and trust feed Reason) — and their <b>guard</b>: a friend, lover or the one who's sworn to you opens up (easier), an enemy is wary (harder).`,
          `<b>Every type also bends specific skills, ±● — an edge AND a cost.</b> You can't threaten a friend (−● Intimidation), can't lie to your own blood (−● Deception), can't sweet-talk hatred (−● Persuasion vs an enemy, though +● Intimidation). That's why the <i>kind</i> of relationship matters, not just its school — an Enemy ●● gives Humiliate +2 school <i>and</i> +2 Intimidation, but Flatter's +2 school is cancelled by −2 Persuasion. Hover any bond type to see its exact edges.`,
          `Your own read of them (the archetype you guessed) and your notes stay <b>private</b> to you — only the relationship itself is shared.`,
          ...((typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer()) ? [
          `<b>Deep bonds grant abilities, not just bigger numbers.</b> At <b>●●</b> a relationship unlocks a <b>distinctive ability</b> — a lover's wordless warning, an enemy you fight forewarned, a confidant who can ease a Wound. At <b>●●●</b> it adds a <b>signature</b> you invoke <b>once per long rest</b> (a mentor's reroll, a lover's rescue). Both live on the Bond in the Chronicle; the signature has an <b>Invoke</b> button.`] : []),
          `Closeness costs: land a <b>Power</b> play on a friend, family, a lover, your protégé, your liege or a confidant and it works — but they gain a <b>String</b> on you.`,
          `Winning moves the bond: the one who is <b>swayed</b> grows closer to the winner (+1●); the one who <b>breaks off</b> cools toward them (−1●).`,
        ])}
        ${sub("Bonds reach into a real fight", [
          `Standing within <b>${(() => { try { return game.settings.get("tsl-social-conflict", "bondAuraRange"); } catch { return 15; } })()} ft</b> of someone you're bonded to changes how you <b>fight</b> — automatically, as tokens move. <b>Every relationship does something different</b>, and it doubles at ●●● (any one line caps at ±2).`,
          ...BOND_TYPES.filter(t => t.combatAura).map(t => {
            const a = t.combatAura;
            const nm = { attack: "attack rolls", damage: "weapon damage", save: "saving throws", check: "ability checks", ac: "AC", init: "initiative", spellDC: "spell save DC", maneuverDC: "maneuver DC" };
            const bits = Object.entries(a).filter(([k]) => k !== "label")
              .map(([k, v]) => `<b>${v > 0 ? "+" : "−"}${Math.abs(v)}</b> ${nm[k]}`).join(", ");
            return `<b>${t.label}</b> — “${a.label}”: ${bits}`;
          }),
          `While any of this is live you carry a <b>Bonds in reach</b> mark on your token. It comes and goes on its own as people move — it is not in the status list and nobody can switch it on or off by hand.`,
          `The GM can change the reach or switch it off entirely in the module settings.`,
        ])}
        ${sub("Schools beat schools — rock, paper, scissors", [
          `Every nature rules one triad, and the three schools cycle: <b>Power breaks Emotion · Emotion cracks Reason · Reason binds Power.</b>`,
          `Press the school that <b>beats</b> their nature and you gain <b>+2</b>. Press the school their nature <b>beats</b> and you take <b>−2</b>. Press their <b>own</b> school and it is <b>even — 0</b>: no edge either way.`,
          `You are never told which it was — you feel it in the results. Their nature is a riddle; the dice are the evidence.`,
        ])}
        ${sub("Reading the chip corners", [
          `<b>⊕</b> — an <b>${term("opening")} is live right now</b>: this maneuver gains a bonus because of a condition they carry. Everyone sees ⊕; it reads off visible statuses.`,
          `<b>◎</b> weak spot (cuts deep) · <b>✕</b> bounces off / walled · <b>▲</b> their nature yields to this school. These follow <b>your read</b> — the archetype you wrote in their Bond (<i>Read as</i>). They are a <b>theory</b>: guess wrong and the marks are wrong, and the OUTCOME sets you straight. No guess yet → no marks. (The GM always sees the truth.)`,
        ])}
        ${sub("Grades & the Answer", [
          `A <b>clean hit</b> (well over) cuts +1 deeper. A <b>bad miss</b> — or hitting an immunity — earns ${term("the Answer")}.`,
          `Fumble that badly as a player and you gain <b>Inspiration</b> — losing spectacularly is worth something.`,
        ])}
        ${sub("Strings — a thread you earn, then spend", [
          `A ${term("String")} is a hold on a person. You earn one by <b>opening up</b> in character (a true fear, a confession — the GM grants it on the person you bared yourself to), by maneuvers that <b>hand you a lever</b> (reads, Lie, Play Weak, Bargain, some openings), or by <b>winning an exchange</b> — swayed or broken off, the winner takes a thread.`,
          `A String is <b>only ever spent</b> — it gives no passive bonus. Burn one for <b>+5 to ANY roll against that person, even an attack</b> — or <b>+5 to your AC or a save against one of theirs</b> ('I know how you move'). The 🎭+5 button, decided after you see the die.`,
          `You can hold at most <b>3 Strings on any one person</b> — a few deep levers, not a stack. Past that, a new thread on them simply doesn't form.`,
        ])}
        ${sub("Hold the line — when it lands on YOU", [
          `The words can't be unsaid, but you may ${term("Hold the Line")}: refuse the <b>state</b> a maneuver would put on you by carrying a fitting emotional <b>Wound</b> instead. The blow itself still lands — take it or parry it in the same window.`,
          `A Wound already at its breaking point (●●●) can't take more. When your Wounds weigh <b>4 or more</b> in total, you are ${term("Overwhelmed")}: no more parrying, no more holding the line — yield or flee.`,
        ])}
        ${sub("Win, lose, or be sincere", [
          `Two ways to win, two ways to lose — for <b>both</b> sides. Break their ${term("Resolve")} to 0 → they're ${term("swayed")} (the big win: they concede). Make them spend their ${term("Patience")} to nothing → they ${term("break off")} (the smaller win: no concession, but you take a String and the field).`,
          `Your own Patience is the price of pressing: every miss spends it (a risky move like Intimidate or Humiliate spends 2), and so does every parry you make when they press back. Run out and <b>you</b> break off.`,
          `A <b>natural 1</b> always misses, however big your bonus.`,
          // Only true where the 2d6 layer actually exists — in "Social Fencing
          // only" worlds there are no Feelings moves, and promising them reads
          // like documentation from a different game.
          ...(tslOn ? [`Or win honestly: the 2d6 <b>Feelings</b> moves (Speak from the Heart, Read the Room) chip Resolve and reveal nature <b>without</b> manipulation — and sincerity <b>can't be parried</b>.`] : []),
          `${term("leverage", GLOSSARY.leverage)} (once each per exchange): once you've filled a point of their dossier, you may play it — <b>Desire</b> (Advantage, +1 damage), <b>Fear</b> (+3 to the roll — but a miss costs you 1 extra Patience), <b>Weakness</b> (an ordinary approach lands like a weak spot: Advantage, +1 damage, and it can't be parried). The buttons sit under the roll bar.`,
        ])}
      </section>`;

    const gm = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Running it (GM)</div>
        ${sub("Setting the scene", [
          `<b>Draw blades only when it's real:</b> the NPC is unwilling AND the stakes matter. A favor, an easy lie, a routine haggle is one ordinary check, not an exchange.`,
          `<b>Size the ask by weight:</b> Resolve runs low (CHA) — a mook folds in one hit, an iron will (~5) takes a couple of heavy finishers, and a target who parries everything can only be worn down into breaking off. A full concession needs their weak spot. Demand played leverage for the impossible; nobody betrays their king over a nice speech.`,
          `<b>Safety first:</b> these moves include real abuse tactics (love bombing, triangulation, guilt-tripping, sowing doubt). Set lines & veils at session zero and keep an X-card or Script Change in reach — especially when an NPC turns them on a player character.`,
          `<b>A crowd hardens people:</b> +1 DC per extra voice pressing the same target (use the situational modifier). Let the party pick one fencer; the rest pass Strings and leverage.`,
        ])}
        ${sub("Playing the opponent", [
          `<b>NPCs defend on their own:</b> each NPC meets a landed blow by its <b>Defence stance</b> (Profile, under the archetype) — by default its nature: Power natures are <b>Proud</b> (they riposte), Emotion natures <b>Measured</b>, Reason natures <b>Guarded</b>. No window for you; set <b>Ask me</b> on the ones you want to steer by hand. A wall can't parry sincerity: an honest Persuade always lands.`,
          `<b>Both sides play:</b> give each fencing NPC an <b>Agenda</b> (Profile → GM field) — what THEY want. Answer every player maneuver with one of the NPC's own: maneuver back, demand, bluff.`,
          `<b>Losing must cost:</b> if the NPC wins the exchange — the PC breaks off or is swayed — the NPC's Agenda advances.`,
          `<b>Patience is everyone's clock:</b> misses and parries spend it on both sides. When an NPC is low, play them fraying — shorter answers, a glance at the door; on the last point, say it plainly. Defend honestly: parrying costs them too, so taking a blow to stay in the fight is a real choice.`,
        ])}
        ${sub("Rewarding play", [
          `<b>Reward open hearts:</b> when a player truly opens up, grant a <b>String</b> on the one they opened up to (💖 on the conflict card, or the Bonds tab). This is the main way Strings should enter play — the price of a bared heart, not button-mashing.`,
          `<b>You have the final word:</b> after each roll you confirm the grade against the hidden DC (it's pre-selected — one click). The story, not the raw die, decides.`,
        ])}
      </section>`;

    // A worked example: the abstract rules above are hard to hold in the head,
    // so walk one exchange end to end and name every part as it happens.
    const walkthrough = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">A scene, start to finish</div>
        <div class="tsl-codex-scene">
          <div><b>The scene.</b> It's an hour to dawn. Lyra must get through the river gate; <b>Captain Roell</b> has orders to let no one pass. Neither will draw steel — this is a battle of words.</div>
          <div><b>The goal.</b> Break Roell's <b>${term("Resolve")}</b> to 0 (talk him round → he's <b>${term("swayed")}</b> and opens the gate) <i>before</i> she runs out of her own <b>${term("Patience")}</b> — every miss spends it. If hers empties first she <b>${term("breaks off", GLOSSARY["break off"])}</b>, and his agenda — keep the gate shut — wins. If he parries so much that <i>his</i> Patience empties, he breaks off instead: no open gate, but he's shaken and she holds a String on him.</div>
        </div>
        <ol class="tsl-codex-how tsl-codex-quick">
          <li><b>She sizes him up.</b> <b>Read Them</b> (Insight + Investigation). It lands: a <b>tell</b> is whispered to her — <i>“he keeps glancing back at the guards.”</i> She notes her guess in her Bond: <i>read as Broker</i>, and gains a String.</li>
          <li><b>She sets him up.</b> <b>Taunt</b> — a jeer for the room. It lands: he's now <b>${SOCIAL_CONDITIONS.provoked?.label ?? "Provoked"}</b> (and 1 Resolve, which he parries — 1 of his Patience). It's a <b>set-up</b>: the real value is what it opens.</li>
          <li><b>The chip changes.</b> Because he carries that condition, <b>Humiliate</b> now shows a <b>⊕</b> — an ${term("opening")}. Hover it to see the payout: the set-up is <i>cashed</i> for extra Resolve damage.</li>
          <li><b>She presses it.</b> Humiliate lands: 3 damage <b>plus</b> the opening — 4 Resolve coming. He can't afford to parry it all, so most of it lands; ${SOCIAL_CONDITIONS.provoked?.label ?? "Provoked"} is <b>spent</b> (⊕ gone), and the public unmaking leaves him a lasting <b>Wrath</b> wound.</li>
          <li><b>He answers.</b> She overreaches on the next move and fumbles — it costs her Patience, and his nature bites back: she's left <b>Rattled</b>. Blades cut both ways.</li>
          <li><b>How it ends.</b> One more landed maneuver takes his Resolve to <b>0</b>: he's <b>swayed</b>. He curses, unbars the gate, and their bond shifts a step. (Had her misses emptied <i>her</i> Patience first, she'd have broken off and he'd have won the scene.)</li>
        </ol>
        <div class="tsl-codex-hint-sm"><b>The two kinds of ⊕, in one line:</b> a <b>status you applied</b> (like ${SOCIAL_CONDITIONS.provoked?.label ?? "Provoked"}) is <i>spent</i> when a finisher cashes it — one shot. A <b>lasting wound</b> they carry (Wrath, Grudge, Obsession, Fear, Despair) is <i>never</i> spent: it keeps giving +2 until the story heals it. Both look the same on the chip; press ⊕ when you see it.</div>
      </section>`;

    const how = quickStart + comboReference + reference + gm;

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
            ${meta.bonds ? (() => {
              const lbl = (ids) => (ids ?? []).map(t => SocialArchetypeManager.getBondType(t).label).join(", ");
              const parts = [meta.bonds.deepen?.length ? `runs deep (two uses) from a ${lbl(meta.bonds.deepen)}` : null,
                             meta.bonds.resist?.length ? `won't take from an ${lbl(meta.bonds.resist)}` : null].filter(Boolean).join("; ");
              return `<div class="tsl-codex-status-bonds"><b>♥ Bonds:</b> ${esc(parts)} — <i>${esc(meta.bonds.why ?? "")}</i>.</div>`;
            })() : ""}
            ${meta.combat ? `<div class="tsl-codex-status-combat"><b>In combat:</b> ${esc(meta.combat)}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    const natures = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The nine natures</div>
        <div class="tsl-codex-hint-sm">A target's nature is never handed to players — deduce it, then note your guess in their Bond and the chip marks follow your read. Each nature has at least one ◎ weak spot and one ✕ wall, and the traps sit INSIDE a triad, so knowing the school isn't enough.</div>
        <div class="tsl-codex-hint-sm"><b>Where they come from.</b> The three triads follow the psychoanalyst Karen Horney's three ways people cope with others — <b>against</b> them (Power), <b>toward</b> them (Emotion), <b>away</b> from them (Reason). Each nature is drawn from a recognised character type, named on its card, with what it's <b>strong</b> against and <b>weak</b> to. Play the person, not the label.</div>
      </section>
      ${triadBlocks}`;

    // Wound dossiers, generated from the data — each wound is now a DISTINCT
    // mechanic that ESCALATES through three tiers (Light ● → Deep ●● → ●●●).
    const woundDossier = ["angry", "spiteful", "obsessed", "scared", "hopeless"].map(id => {
      const m = TSLConditionEffects.getMeta?.(id);
      if (!m) return "";
      const s = (t) => esc((t ?? "").replace(/\{source\}/g, "them"));
      const tiers = (m.tiers ?? []).map((td, i) =>
        `<span class="tsl-codex-gain">${"●".repeat(i + 1)}${"○".repeat(2 - i)} ${esc(td.label)} →</span> ${s(td.text)}`
      ).join("<br>");
      return `<div class="tsl-codex-combo">
        <b>${esc(m.label)}</b> — <i>${s(m.signature ?? m.urge)}</i><br>
        ${tiers}<br>
        <span class="tsl-codex-gain">Give in →</span> ${s(m.leanIn)}<br>
        <span class="tsl-codex-gain">Heals →</span> ${esc(m.clears)}
      </div>`;
    }).join("");

    const statuses = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">Statuses & wounds</div>
        <div class="tsl-codex-hint-sm"><b>Two kinds of condition, and the card keeps them apart.</b> <b>States</b> (below) are the <b>fleeting</b> layer — a maneuver sets one up, it lasts a round or two, and a finisher <b>spends</b> it. <b>Wounds</b> (❤ — Wrath, Grudge, Obsession, Fear, Despair) are the <b>lasting</b> layer — they come from Hold the Line or betrayal, and they don't just sit there: they <b>push the one who carries them</b>. Never worry which is which mid-roll — both show ⊕.</div>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">States — fleeting set-ups (this fight)</summary>
          <div class="tsl-codex-hint-sm">Each arms a ⊕ opening and is <b>spent</b> when a finisher cashes it. <b>Defiant</b> is the odd one — a wall, not an opening, broken only by a successful <b>Read Them</b>.</div>
          <div class="tsl-codex-hint-sm"><b>States know who put them there.</b> What the target is to the one applying it changes how it lands: from someone who matters in the right way it <b>runs deep</b> — it lasts two uses (×2 on the tag); from someone they're set against it <b>won't take</b> at all. The bond read is THEIRS toward you. Each state below says which bonds do what.</div>
          <div class="tsl-codex-statuses">${statusRows}</div>
        </details>
        <details class="tsl-codex-sub" open>
          <summary class="tsl-codex-sub-title">Wounds — they push you (VtM-style)</summary>
          <div class="tsl-codex-hint-sm">Each Wound is a <b>different kind of thing</b> — a rage trade (Wrath), a cold vendetta (Grudge), a fixation (Obsession), a fright (Fear), a grey weight (Despair) — and it <b>escalates</b> through three tiers: <b>● Light → ●● Deep → ●●● Breaking point</b>. Pressed again, it <b>deepens</b> rather than stacking a new one; at the top tier it takes the wheel for a beat.${(typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer())
            ? " <b>Give in</b> at a cost (the Give in button) and you refuel <b>1 Willpower</b> (or Inspiration, for despair). A long rest eases a Wound one tier; one left at ●●● becomes a Scar (a Wound about you) or a bond (a Wound about someone)."
            : " Its urge is a roleplay prompt — play it. A long rest eases a Wound one tier; one about someone left at ●●● becomes a bond with them."} Wounds weighing <b>4+</b> (sum of tiers) = <b>Overwhelmed</b>: no parrying, no holding the line — yield or flee. Set the tier on your own character in the <b>Fencing</b> tab (▲/▼).</div>
          <div class="tsl-codex-combo-list">${woundDossier}</div>
        </details>
      </section>`;

    // The moves, by school, each tagged with the real persuasion tactic
    // it models — so the fiction reads as something people actually do.
    const REAL_TACTIC = {
      cold_reading:     "Cold reading & baselining — mentalists read strangers from small cues; interrogators learn someone's normal first, then watch for change. (One tell proves little — real lie-spotting from a single cue is barely better than chance.)",
      persuade:         "Rational persuasion — a fair case built on common ground (Aristotle's logos; Cialdini's 'unity': we want the same thing).",
      intimidate:       "Coercion — a credible threat of consequences. It works only while the threat is believed; a called bluff costs you face.",
      lie:              "Pretexting — a false story that changes their maths ('your partner already confessed' is a real interrogation ploy).",
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
    // How a state lands depends on who they are to you (their bond toward you)
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
        // What a HIT gives (built from the data): damage / set-up status /
        // lasting wound / Strings / a whispered tell.
        const dmg = m.resolveDamage ? `<b>−${m.resolveDamage}</b> Resolve` : (m.reveals ? "a whispered tell + a String" : "<b>nothing yet — a set-up</b>");
        const st  = m.applyOnSuccess ? ` · they become <b>${esc(SOCIAL_CONDITIONS[m.applyOnSuccess]?.label ?? m.applyOnSuccess)}</b>${bondNote(m.applyOnSuccess)}` : "";
        const wnd = m.woundOnSuccess ? ` · a lasting <b>${esc(TSLConditionEffects.getMeta?.(m.woundOnSuccess)?.label ?? m.woundOnSuccess)}</b> wound` : "";
        const str = (m.grantStrings && !m.reveals) ? ` · +${m.grantStrings} String${m.grantStrings > 1 ? "s" : ""}` : "";
        const combo = m.combos ? ` · cashes ${Object.keys(m.combos).map(c => `<b>${esc(SOCIAL_CONDITIONS[c]?.label ?? c)}</b>`).join("/")} for more` : "";
        const kick = m.kickWhileDown ? ` · <b>+1</b> vs a target already off balance` : "";
        const sincere = m.unparryable ? ` · <b>can't be parried</b>` : "";
        const hit  = `${dmg}${sincere}${st}${wnd}${str}${kick}${combo}`;
        const cost = m.failPatience ?? 1;
        const miss = `nothing lands, and <b>you lose ${cost} Patience</b>${cost > 1 ? " (a risky move)" : ""}. A <b>bad</b> miss (5+ under) → <b>they Answer</b> too (the blow turns back on you)${m.caughtOnBotch ? " — and you're <b>caught lying</b>: they take a String on you" : ""}.`;
        const how = m.howto   ? `<div class="tsl-codex-howto">▸ ${esc(m.howto)}</div>` : "";
        const ex  = m.example ? `<div class="tsl-codex-example">${esc(m.example)}</div>` : "";
        // Strong and weak sides — authored, plus who it cuts / bounces off (from the data)
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
    // Where every number a player sees actually comes from.
    const numbers = `
      <details class="tsl-codex-sub">
        <summary class="tsl-codex-sub-title">Where the numbers come from</summary>
        <div class="tsl-codex-combo"><b>Your roll</b> — a d20 + the move's <b>main skill</b>, plus your <b>proficiency bonus</b> if you're trained in its <b>support skill</b> (plus any situation bonus). A <b>natural 1</b> always misses. On A5E this opens the system's own check dialog.</div>
        <div class="tsl-codex-combo"><b>Resolve</b> <span class="tsl-codex-gain">the will to not concede</span> — <b>CHA</b> modifier (never below 1): force of personality. Kept low — the weight is the maneuver's school. Break it to 0 and they are <b>swayed</b>.</div>
        <div class="tsl-codex-combo"><b>Patience</b> <span class="tsl-codex-gain">composure — everyone has it</span> — <b>WIS + CHA</b> modifier (never below 2). <b>Your own misses</b> spend it (risky moves spend 2), and so does <b>every parry you make</b>. Empty it and you <b>break off</b> — you lose the exchange, but concede nothing.</div>
        <div class="tsl-codex-combo"><b>How a duel goes</b> <span class="tsl-codex-gain">the second blade</span> — when a hit lands, the defender chooses: <b>take it</b> (lose Resolve), <b>parry</b> (spend their own Patience — 1 blocks 1 Resolve), or <b>riposte</b> (block it all and knock 1 Patience off the attacker, one extra Patience). Parrying keeps your will but burns the composure that keeps you in the fight — so neither side can just wall up. A school they're <b>weak</b> to slips past their guard (no parry), and so does a sincere <b>Persuade</b> — an honest case isn't parried, only weighed; one they're <b>immune</b> to slides off — no purchase, and it costs the attacker like a miss. NPCs meet blows by their <b>Defence stance</b> (Open · Measured · Guarded · Proud) — no window.</div>
        <div class="tsl-codex-combo"><b>Social DC</b> <span class="tsl-codex-gain">how hard they are to move</span> — the higher of their passive Insight, or <b>10 + their WIS save + INT save</b> (two mental saves — proficiency baked in, so a save-hardened target really resists). ${game.user.isGM ? "You set/see it; players don't." : "You never see the number — difficulty is learned by trying."}</div>
        <div class="tsl-codex-combo"><b>Strings</b> <span class="tsl-codex-gain">trump cards</span> — spend one for <b>+5</b> on any roll against that person. Earned by opening your heart in play, by maneuvers that hand you a lever, or by winning an exchange.</div>
        <div class="tsl-codex-hint-sm">Press a move their <b>nature is immune</b> to and it backfires — no effect, it costs your Patience like a miss, and they turn <b>Defiant</b> (maneuver-proof until a successful <b>Read Them</b> cracks it).</div>
        <div class="tsl-codex-hint-sm">Once someone is <b>swayed</b> or <b>breaks off</b>, that exchange is over for them — no more maneuvers until the GM resets it (Chronicle → Fencing) or play moves to another scene.</div>
      </details>`;
    const moves = `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title">The moves</div>
        <div class="tsl-codex-hint-sm"><b>General</b> holds the basics anyone reaches for (persuade · threaten · lie · read · mock · goad — no archetype traps); the other three schools are the archetype game. Each line shows what it <b>rolls</b>, what a <b>✓ Hit</b> does and what a <b>✗ Miss</b> costs; the <b>▸ line</b> is how you play it; the <b>quote</b> is something you might actually <b>say in the scene</b>; the small <i>italic</i> is the <b>real tactic</b> it models.</div>
        <div class="tsl-codex-hint-sm tsl-codex-safety"><b>A note on content.</b> Several moves model real manipulation tactics — love bombing, triangulation, guilt-tripping, sowing doubt. They're here because intrigue needs people who use them. Agree on lines & veils at session zero, keep a safety tool (the X-card, Script Change) on the table, and let anyone step out of a scene when they need to — Thirsty Sword Lesbians treats that as part of play, not an interruption.</div>
        ${numbers}
        ${movesRef}
      </section>`;

    // One long scroll was too much — split it into pickable categories.
    const cats = [
      // The walkthrough is one maneuver exchange — meaningless without them.
      { id: "start",    label: "Start",    icon: "fa-play",          html: quickStart + (fencingOn ? walkthrough : "") },
      { id: "moves",    label: "Moves",    icon: "fa-hand-fist",     html: moves,          needs: "fencing" },
      // Openings, statuses and the nine natures are all parts of the d20
      // fencing layer — in a pure-TSL world they simply do not exist.
      { id: "openings", label: "Openings", icon: "fa-plus",          html: comboReference, needs: "fencing" },
      { id: "statuses", label: "Statuses", icon: "fa-bolt",          html: statuses,       needs: "fencing" },
      { id: "feelings", label: "Feelings", icon: "fa-heart",         html: this._buildFeelingsCodex() },
      { id: "details",  label: "Details",  icon: "fa-book",          html: reference },
      { id: "natures",  label: "Natures",  icon: "fa-masks-theater", html: natures,        needs: "fencing" },
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
            <span class="tsl-chr-bond-label" data-tooltip="How deep the bond runs, 0–3 ●. It scales everything the bond TYPE gives — your +● weapon school, their DC guard, and the type's skill edges and costs (±●). Being swayed by them deepens it; breaking off from them cools it.">Strength</span>
            <div class="tsl-chr-att-track">${attitudeDots(b)}</div>
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="Your working guess at their archetype — deduce it from the tells Read Them whispers and from what happens when you roll. Refine it as you learn; the GM plays their true nature either way.">Read as</span>
            <select class="tsl-chr-bond-arch" data-bond-id="${b.id}" ${disabled}>${archOpts(b.perceivedArchetypeId)}</select>
          </div>
          <div class="tsl-chr-bond-line">
            <span class="tsl-chr-bond-label" data-tooltip="Strings you hold on them — emotional leverage, at most ${STRING_CAP} on one person. A String gives nothing while held: you SPEND it for +5.">Strings</span>
            <span class="tsl-chr-str-pips" data-tooltip="${b.stringCount} / ${STRING_CAP}">${"●".repeat(Math.min(STRING_CAP, b.stringCount))}${"○".repeat(Math.max(0, STRING_CAP - b.stringCount))}</span>
            ${canEdit ? `
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="1"  data-tooltip="${b.stringCount >= STRING_CAP ? `At the limit — you can hold at most ${STRING_CAP} Strings on one person` : `Gain a string on them (at most ${STRING_CAP} on one person)`}" ${b.stringCount >= STRING_CAP ? "disabled" : ""}>+</button>
              <button class="tsl-chr-str-adj" data-bond-id="${b.id}" data-target="${b.targetActorId}" data-delta="-1" data-tooltip="Spend / remove a string" ${b.stringCount ? "" : "disabled"}>−</button>
              <button class="tsl-chr-str-pull" data-target="${b.targetActorId}" ${b.stringCount ? "" : "disabled"}
                data-tooltip="PULL THE STRING: burn 1 for +5 — to the roll you just made against them (ANY roll: a maneuver, an attack, a contest), OR to your AC / a save against one of THEIR attacks or effects (you know how they move). Posts a public card.">Pull +5</button>` : ""}
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
              <div class="tsl-chr-signature ${b.sigUsed ? "used" : ""}" data-tooltip="A fully-realized (●●●) bond grants a signature you may invoke once per long rest. GM-adjudicated.">
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
    const consoleHtml = this._buildManeuverConsole(ctx);
    // THIS character's own emotional Wounds — a player sets/clears their own,
    // the GM anyone's. Lives here (the token-opened Chronicle) so wounds are
    // managed in our menu, not only via the token HUD.
    // The BASIC emotional layer is the Wounds alone; Willpower, Boons and
    // Scars appear only in the FULL layer (world setting).
    const fullLayer  = (typeof TSLConditionEffects === "undefined" || TSLConditionEffects.isFullLayer());
    const wpHtml     = fullLayer ? this._buildWillpowerPanel(ctx) : "";
    const woundsHtml = this._buildWoundToggles(ctx);
    const boonsHtml  = fullLayer ? this._buildBoonToggles(ctx) : "";
    const scarsHtml  = fullLayer ? this._buildScarsSection(ctx) : "";
    // Order: the fleeting fencing STATES (used far more often) sit above the
    // lasting emotional layer. Willpower → Wounds → Boons → Scars. The GM's
    // tracks + State toggles come from _buildGMFencing.
    if (!ctx.isGM) return consoleHtml + wpHtml + woundsHtml + boonsHtml + scarsHtml;
    return consoleHtml + this._buildGMFencing(ctx) + wpHtml + woundsHtml + boonsHtml + scarsHtml;
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
        <div class="tsl-notes-section-title" data-tooltip="Willpower — your emotional reserve (not Patience: that's your composure inside one exchange). Pool = proficiency bonus, refilled on a long rest. Spend 1 to power an Ultimate (Wound / Boon / Scar) or push past a Wound's hard block; restore 1 by GIVING IN to a Wound's urge (the Give in button on the Wound).">⬡ Willpower</div>
        <div class="tsl-wp-row">
          <button class="tsl-wp-btn" data-wp="-1" data-tooltip="Spend 1 — an Ultimate, or overriding a Wound's block" ${cur <= 0 ? "disabled" : ""}>−</button>
          <span class="tsl-wp-dots" data-tooltip="${cur} / ${max}">${dots}</span>
          <button class="tsl-wp-btn" data-wp="1" data-tooltip="Restore 1 — you gave in to a Wound's urge" ${cur >= max ? "disabled" : ""}>+</button>
          <span class="tsl-wp-num">${cur}/${max}</span>
        </div>
      </section>`;
  }

  /**
   * The four Boons (positive emotions) as on/off toggles for THIS character —
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
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-tooltip="${esc(m.ultimate.name)} — spend 1 Willpower: ${esc(m.ultimate.text)}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
      return `<div class="tsl-wound-row tsl-boon-row ${on ? "on" : ""}">
        <button class="tsl-cond-toggle tsl-boon-toggle ${on ? "active" : ""}" data-boon="${id}" data-tooltip="${tip}">
          <img src="${m.icon}" alt=""><span>${esc(m.label)}</span>${dots}
        </button>${steps}${ultBtn}
      </div>`;
    }).join("");
    const active = Object.values(ctx.activeBoons ?? {}).filter(Boolean).length;
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Positive emotions the GM grants for courage, love, triumph or grit (Valor / Devotion / Conviction / Hope). Each gives a scaling bonus and a ●●● ultimate (spend 1 Willpower). They do NOT count toward Overwhelmed, and a long rest ends them.">✦ Boons</div>
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
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-tooltip="${esc(m.ultimate.name)} — spend 1 Willpower: ${esc(m.ultimate.text)}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
      return `<div class="tsl-wound-row tsl-scar-row ${on ? "on" : ""}">
        <button class="tsl-cond-toggle tsl-scar-toggle ${on ? "active" : ""}" data-scar="${id}" data-tooltip="${tip}">
          <img src="${m.icon}" alt=""><span>${esc(m.label)}</span>
        </button>${ultBtn}
      </div>`;
    }).join("");
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Permanent character Scars — what a Wound becomes when it's left at ●●● through a long rest. Each grants an ability and a lasting cost, and makes you immune to the Wound it came from. They lift only through the story (the 'Clears' line), never a rest.">🩹 Scars</div>
        <div class="tsl-cond-grid">${btns}</div>
      </section>`;
  }

  /**
   * The five lasting emotional Wounds as on/off toggles for THIS character.
   * The same wounds shown on the conflict card and the token HUD, here in the
   * Chronicle so they're managed from the token-opened window. Reuses the
   * fencing-State toggle styling (.tsl-cond-*); handler keys on [data-wound].
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
        ? `<button class="tsl-ult-btn" data-ult="${id}" data-tooltip="${esc(m.ultimate.name)} — spend 1 Willpower: ${esc(m.ultimate.text)}" ${wp < 1 ? "disabled" : ""}>⚡</button>` : "";
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
      ? `<div class="tsl-overwhelmed" data-tooltip="Wounds weighing 4 or more (the sum of their tiers) — Overwhelmed: this character can no longer parry or hold the line, and must yield or flee.">⚠ Overwhelmed — Wounds weigh ${load}</div>`
      : load ? `<div class="tsl-wound-load" data-tooltip="The weight of your Wounds: the sum of their tiers (● = 1, ●● = 2, ●●● = 3). At 4 you are Overwhelmed — no parrying, no holding the line.">Weight ${load} / 4</div>` : "";
    return `
      <section class="tsl-notes-section">
        <div class="tsl-notes-section-title" data-tooltip="Lasting emotional Wounds on ${esc(this._actor.name)} (Wrath / Grudge / Obsession / Fear / Despair). From Hold the Line, sincere Feelings moves or betrayal — they open doors (+2) until the story heals them. Wounds weighing 4+ (sum of tiers) = Overwhelmed: no parrying, no holding the line. A Wound about someone, left at ●●● overnight, becomes a bond with them. A whole layer apart from the fleeting fencing States.">❤ Wounds</div>
        <div class="tsl-cond-grid">${btns}</div>
        ${overwhelmed}
        ${active ? `<button class="tsl-cond-clear tsl-wound-clear" data-tooltip="Remove all Wounds from ${esc(this._actor.name)}.">Clear all wounds</button>` : ""}
      </section>`;
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
      // GM sees the truth; a player sees THEIR OWN GUESS from the Bond ("Read
      // as") — UNLESS the GM has opened this nature, then everyone reads truth.
      const seeArch = ctx.isGM || SocialArchetypeManager.isRevealed(tgt);
      const guessId = TSLBondStore.find(src.id, tgt.id)?.perceivedArchetypeId ?? null;
      const arch  = seeArch
        ? SocialArchetypeManager.getArchetype(tgt)
        : (guessId ? SocialArchetypeManager.getArchetypeById(guessId) : null);
      const isGuess = !seeArch;
      const known = !!arch;
      const triad = arch ? SOCIAL_TRIADS[arch.triad] : null;

      const pips = (val, max, cls) => Array.from({ length: max }, (_, i) =>
        `<span class="tsl-notes-pip tsl-notes-pip--${cls} ${i < val ? "filled" : ""}"></span>`).join("");
      const tracks = enc.active
        ? `<div class="tsl-fc-tracks">
             <span class="tsl-fc-tk" data-tooltip="Resolve = CHA mod (floor 1) — force of personality. Kept low; weight is the school. Landed maneuvers chip it; break it (0) to sway them."><b>RES</b>${pips(enc.resolve, enc.maxResolve, "resolve")}</span>
             <span class="tsl-fc-tk" data-tooltip="Patience = WIS + CHA mod (floor 2) — their composure. Every parry they make spends it (and so do their own misses); at 0 they break off and lose the exchange."><b>PAT</b>${pips(enc.patience, enc.maxPatience, "patience")}</span>
           </div>`
        : enc.outcome
          ? `<div class="tsl-chr-outcome tsl-chr-outcome--${enc.outcome}" data-tooltip="${esc(SocialEncounterManager.outcomeTip(enc.outcome))}">${enc.outcome === "swayed" ? "💔 Swayed" : "🚪 Broke off"}</div>`
          : `<div class="tsl-fc-note">Their tracks start on your first maneuver.</div>`;

      const archLine = arch
        ? `<span class="tsl-fc-arch" style="--triad-color:${triad?.color ?? "#806858"}" data-tooltip="${isGuess ? "<b>Your read (may be wrong)</b><br>" : ""}${esc(arch.hint ?? arch.description)}">${isGuess ? `<i class="fas fa-pencil tsl-guess-i"></i>` : `<i class="fas ${triad?.icon ?? "fa-user"}"></i>`} ${esc(arch.label)}${isGuess ? "?" : ""}</span>`
        : `<span class="tsl-fc-arch tsl-fc-arch--unread" data-tooltip="Their nature is a riddle — Read Them whispers a tell; note your guess in your Bond ('Read as'). You'll sense their weak spots from outcomes, not the chips.">Nature unread</span>`;

      // Maneuver chips grouped by triad — marks follow the viewer's read
      const chips = MANEUVER_GROUPS.map(g => {
        const mvs = SOCIAL_MANEUVERS.filter(m => m.group === g.id);
        const color = SOCIAL_TRIADS[g.id]?.color ?? "#806858";
        const short = (SOCIAL_TRIADS[g.id]?.label ?? g.label).replace("Triad of ", "");
        const cs = mvs.map(m => {
          const isSel = this._fenceManeuverId === m.id;
          const rel   = SocialManeuverRoller.getRelation(tgt, m, seeArch ? undefined : (arch ?? null));
          const comboReady =
            (m.combos && Object.keys(m.combos).some(st => SocialArchetypeManager.getActiveCondition(tgt, st)))
            || (m.kickWhileDown && SOCIAL_CONDITION_ORDER.some(st => SocialArchetypeManager.getActiveCondition(tgt, st)))
            || !!findOpening(tgt, m);
          // Weak/strong marks follow the READ: the GM's truth, or a player's own
          // THEORY (their Bond guess `arch`). No theory → no marks. ⊕ (a live
          // opening) always shows — it reads off visible statuses.
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
          ?? "The basics anyone reaches for — read, jab, goad, persuade, threaten, lie. No weak spots to find; only Mock and Taunt can hit a wall. Persuade is sincere (can't be parried), Intimidate hits hard but a miss costs 2, a Lie that misses badly gets you caught.";
        return `<div class="tsl-chip-group" style="--triad-color:${color}">
          <div class="tsl-chip-group-label" data-tooltip="${esc(schoolTip)}">${esc(short)}</div><div class="tsl-chip-grid">${cs}</div></div>`;
      }).join("");

      // The target's active social statuses — name tags with the full effect
      // (social + combat rider) in the tooltip, right where you pick the move.
      const tgtConds  = SocialArchetypeManager.getActiveConditions(tgt);
      const statusRow = tgtConds.length
        ? `<div class="tsl-status-row">${tgtConds.map(c => `
            <span class="tsl-status-tag" style="--st-color:${c.meta.color ?? "#806858"}" data-tooltip="<b>${c.meta.label}</b>${c.charges > 1 ? " ×2 — it runs deep (a bond): two uses left" : ""}<br>${esc(c.meta.description)}${c.meta.combat ? `<br><b>Combat:</b> ${esc(c.meta.combat)}` : ""}">${esc(c.meta.label)}${c.charges > 1 ? " ×2" : ""}</span>`).join("")}</div>`
        : "";

      // Portrait + name + tracks share one aligned header block, mirroring
      // the conflict window's participant cards — one design language.
      body = `
        <div class="tsl-fc-head" style="--triad-color:${triad?.color ?? "rgba(255,255,255,0.18)"}">
          <img class="tsl-fc-portrait" src="${tgt.img ?? "icons/svg/mystery-man.svg"}" alt="">
          <div class="tsl-fc-head-main">
            <div class="tsl-fc-head-row">
              <div class="tsl-fc-head-name">${esc(tgt.name)}</div>
              ${archLine}
            </div>
            ${tracks}
            ${statusRow}
          </div>
        </div>
        <div class="tsl-fc-maneuvers">${chips}</div>
        ${SocialManeuverRoller.chipLegend(ctx.isGM)}
        ${this._buildFenceBar(ctx, src, tgt, arch, isGuess)}`;
    }

    return `
      <section class="tsl-notes-section tsl-fc">
        <div class="tsl-notes-section-title" data-tooltip="Fence a target from your own menu: pick who, pick a maneuver, roll. No GM setup needed.">⚔ ${esc(src.name)} acts</div>
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
    // GM assesses on the truth; a player's bar follows THEIR THEORY (dispArch =
    // their Bond guess) — provisional marks/hints, corrected by outcomes. No
    // theory → no archetype analysis. The dice always follow the truth.
    const known = !!dispArch;
    const a = SocialManeuverRoller.assess(src, tgt, m, {
      leverage: this._fenceLeverage,
      archetypeOverride: ctx.isGM ? undefined : (dispArch ?? null),
    });
    const strAdd = this._fenceStringSpend ? STRING_SPEND_BONUS : 0;
    // String spend moved AFTER the roll (the gamble) — no pre-commit toggle
    const extra  = a.bonus;

    const bonusList =
      a.bonusReasons.map(b => `${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label.split(" — ")[0])}`);
    const extraChip = extra ? `<span class="tsl-bar-extra ${extra >= 0 ? "pos" : "neg"}" data-tooltip="${esc(bonusList.join(", "))}${isGuess && known ? " — predictions follow your read" : ""}">${extra >= 0 ? "+" : "−"}${Math.abs(extra)}</span>` : "";
    const advMark = a.advantage ? `<span class="tsl-bar-adv" data-tooltip="${esc(a.advantageReasons.join("; "))}${isGuess ? " — if your read is right" : ""}">ADV${isGuess && a.relation === "vulnerable" ? "?" : ""}</span>` : "";

    // Held Strings show as the gamble reserve — spendable AFTER a miss
    const held = TSLStringStore.getList(src.id).filter(e => e.targetActorId === tgt.id);
    const strBtn = held.length
      ? `<span class="tsl-fc-string" data-tooltip="You hold ${held.length} String${held.length > 1 ? "s" : ""} on them. Strings give no passive bonus — on a MISS you'll be offered to burn one for +${STRING_SPEND_BONUS} (the gamble), or spend one anytime for +${STRING_SPEND_BONUS} on any roll against them."><i class="fas fa-masks-theater"></i> ${held.length}</span>`
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
    else if (known && a.relation === "vulnerable") { hint = `${readPrefix}this should cut deep — Advantage & +1 Resolve damage, and it can't be parried${isGuess ? " (if your read is right)" : ""}.`; hintCls = "vuln"; }
    else if (a.selfLast)                 { hint = `⚠ Your composure is nearly gone — miss now and you break off (−${a.missCost} Patience).`; hintCls = "imm"; }
    else if (a.combo)                    { hint = `⊕ Opening — ${a.combo.label}.`; hintCls = "vuln"; }
    else if (a.opening)                  { hint = `⊕ Opening — ${a.opening.flavor} (+2).`; hintCls = "vuln"; }
    else if (a.lastExchange)             { hint = "⚔ They're at the end of their composure — one more parry and they break off."; hintCls = "vuln"; }
    else if (known && a.answerRisk)      { hint = `${readPrefix}fumble badly here and their answer comes — ${a.answerRisk}${isGuess ? " (if your read is right)" : ""}.`; hintCls = "imm"; }
    else if (a.patienceThin)             { hint = "⏳ They're wearing thin — parrying is costing them."; }
    else if (a.selfThin)                 { hint = "⏳ Your own composure is wearing thin — pick your shots."; }
    else if (!known)                     { hint = "Their nature is a riddle — read tells, then note your guess in your Bond ('Read as')."; }

    // YOUR composure, right where you decide — every miss spends it, and when
    // it's gone you break off. (Starts with your first maneuver.)
    const selfEnc = SocialEncounterManager.getEncounter(src);
    const selfPips = (val, max) => Array.from({ length: max }, (_, i) =>
      `<span class="tsl-notes-pip tsl-notes-pip--patience ${i < val ? "filled" : ""}"></span>`).join("");
    const selfLine = selfEnc.active
      ? `<div class="tsl-fc-self" data-tooltip="Your Patience — your composure in this exchange. Each miss costs ${a.missCost} here (risky moves cost more), and parrying their blows spends it too. At 0 you break off and lose the exchange.">
           <span class="tsl-fc-self-label">Your composure</span>${selfPips(selfEnc.patience, selfEnc.maxPatience)}
           <span class="tsl-fc-self-cost">a miss costs ${a.missCost}</span>
         </div>`
      : `<div class="tsl-fc-self tsl-fc-self--idle" data-tooltip="Your Patience (WIS + CHA, floor 2) starts with your first maneuver. Each miss spends it; at 0 you break off.">
           <span class="tsl-fc-self-label">Your composure</span><span class="tsl-fc-self-cost">starts with your first move · a miss costs ${a.missCost}</span>
         </div>`;

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
            "Their will to not concede — starts at CHA modifier (floor 1), force of personality. Landed maneuvers reduce it (by school: 1–3, +1 on a vulnerability). At 0 they are swayed.")}
         ${track("Patience", encounter.patience, encounter.maxPatience, "patience",
            "Their composure — starts at WIS + CHA modifier (floor 2). Spent by their own misses and by every parry they make (1 blocks 1 Resolve); at 0 they break off and lose the exchange.")}
         <button class="tsl-notes-enc-btn tsl-notes-enc-btn--end" data-enc-action="end" data-tooltip="Clear the tracks. The next maneuver will start fresh ones.">Reset tracks</button>`
      : encounter.outcome
        ? `<div class="tsl-chr-outcome tsl-chr-outcome--${encounter.outcome}" data-tooltip="${esc(SocialEncounterManager.outcomeTip(encounter.outcome))}">
             ${encounter.outcome === "swayed" ? "💔 Swayed — resolve broken." : "🚪 Broke off — composure spent."}
           </div>
           <button class="tsl-notes-enc-btn" data-enc-action="end" data-tooltip="Clear the result so a new exchange can begin (it also clears on its own when play moves to another scene).">Reset</button>`
        : `<div class="tsl-notes-patience-inactive">No exchange yet — tracks start automatically on the first maneuver ${esc(this._actor.name)} makes or takes.</div>`;

    const condBtns = SOCIAL_CONDITION_ORDER.map(id => {
      const on   = activeConditions[id];
      const meta = SOCIAL_CONDITIONS[id];
      return `<button class="tsl-cond-toggle ${on ? "active" : ""}" data-condition="${id}"
                      data-tooltip="<b>${meta.label}</b><br>${esc(meta.description)}${meta.combat ? `<br><b>Combat:</b> ${esc(meta.combat)}` : ""}">
                <img src="${meta.icon}" alt=""><span>${meta.label}</span>
              </button>`;
    }).join("");
    const anyActive = Object.values(activeConditions).some(Boolean);

    return `
      <section class="tsl-notes-section tsl-notes-section--encounter">
        <div class="tsl-notes-section-title" data-tooltip="Resolve (will) and Patience (composure). Every side of an exchange has both: break Resolve → swayed; spend Patience to nothing → broke off. Tracks arm themselves — no setup needed.">${esc(this._actor.name)}'s tracks</div>
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
        `<span class="tsl-board-tag" style="--st-color:${c.meta.color ?? "#806858"}" data-tooltip="<b>${c.meta.label}</b>${c.charges > 1 ? " ×2 — runs deep (a bond)" : ""}<br>${esc(c.meta.description)}">${esc(c.meta.label)}${c.charges > 1 ? " ×2" : ""}</span>`
      ).join("");
      const tracks = enc.active
        ? `<span class="tsl-board-track" data-tooltip="Resolve / Patience">R${enc.resolve} · P${enc.patience}</span>`
        : enc.outcome
          ? `<span class="tsl-board-out tsl-board-out--${enc.outcome}" data-tooltip="${enc.outcome === "swayed" ? "Swayed — their Resolve broke: they conceded / were won over." : "Broke off — their Patience ran out: they lost their footing and left the exchange."}">${enc.outcome === "swayed" ? "swayed" : "broke off"}</span>`
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

    // NPC defence stance (GM) — how they meet a blow without a window
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

    // Pull the String: burn one for +5 to ANY roll against that person —
    // a maneuver, an ATTACK, a contested check. The card announces it; the
    // table applies the +5 to the roll that was just made.
    el.querySelectorAll(".tsl-chr-str-pull").forEach(btn => {
      btn.addEventListener("click", async () => {
        const targetId = btn.dataset.target;
        const list = TSLStringStore.getList(this._actor.id).filter(e => e.targetActorId === targetId);
        if (!list.length) { ui.notifications.warn("No Strings held on them."); return; }
        await TSLStringStore.removeEntry(this._actor.id, list[0].id);
        const target = game.actors.get(targetId);
        const esc = foundry.utils.escapeHTML;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this._actor }),
          content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">🎭 ${esc(this._actor.name)} pulls a String on ${esc(target?.name ?? "them")} — <b>+5</b>: to this roll against them, or to AC / a save against theirs. ${list.length - 1} String${list.length - 1 === 1 ? "" : "s"} left.</div></div>`,
        });
        this.render(true);
      });
    });

    // Invoke a ●●● bond's signature perk — once per long rest.
    el.querySelectorAll(".tsl-chr-sig-use").forEach(btn => {
      btn.addEventListener("click", async () => {
        const bondId = btn.dataset.bondId;
        const bond   = TSLBondStore.getList(this._actor.id).find(b => b.id === bondId);
        if (!bond || bond.sigUsed) return;
        const sig    = SocialArchetypeManager.getBondSignature(bond.type);
        const target = game.actors.get(btn.dataset.target);
        await TSLBondStore.markSignatureUsed(this._actor.id, bondId);
        const esc = foundry.utils.escapeHTML;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this._actor }),
          content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">★ <b>${esc(this._actor.name)}</b> calls on the bond with ${esc(target?.name ?? "them")} — <b>${esc(sig?.label ?? "Signature")}</b>: ${esc(sig?.text ?? "")}</div></div>`,
        });
        this.render(true);
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

    el.querySelector(".tsl-cond-clear:not(.tsl-wound-clear)")?.addEventListener("click", async () => {
      for (const id of SOCIAL_CONDITION_ORDER) {
        await SocialArchetypeManager.removeCondition(this._actor, id);
      }
      this.render(true);
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

    // ⚡ Activate an Ultimate (a ●●● Wound / Boon) — spend 1 Willpower + post it
    el.querySelectorAll(".tsl-ult-btn[data-ult]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (typeof TSLWillpower === "undefined" || typeof TSLConditionEffects === "undefined") return;
        const id = btn.dataset.ult;
        const m = TSLConditionEffects.getMeta(id) || TSLConditionEffects.getScarMeta?.(id);
        if (!m?.ultimate) return;
        if (!(await TSLWillpower.spend(this._actor, 1))) {
          ui.notifications?.warn?.(`${this._actor.name}: no Willpower left.`);
          return;
        }
        const esc = foundry.utils.escapeHTML;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this._actor }),
          content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">⚡ <b>${esc(this._actor.name)}</b> unleashes <b>${esc(m.ultimate.name)}</b> <span style="opacity:.75">(${esc(m.label)}, 1 Willpower)</span> — ${esc(m.ultimate.text)}</div></div>`,
        });
        this.render(true);
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
      name: maneuver.name, icon: maneuver.icon,
      total: payload.total, dc: payload.dc, outcome: payload.outcomeType, natural: payload.natural,
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
