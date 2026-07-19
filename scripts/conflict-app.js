/**
 * tsl-social-conflict | conflict-app.js
 *
 * Foundry Application — conflict UI.
 * Supports 2+ participants with target selection.
 */

console.log("TSL | Loading conflict-app.js...");

class TSLConflictApp extends Application {
  constructor(options = {}) {
    super(options);
    // Re-render when participant actors change (encounter tracks, strings, effects)
    this._actorHook = Hooks.on("updateActor", (actor) => {
      if (ConflictStore.state?.participants?.some(p => p.actorId === actor.id)) this.render();
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tsl-social-conflict",
      classes: ["tsl-conflict"],
      template: null,
      width: 860,
      height: "auto",
      resizable: true,
      minimizable: true,
    });
  }

  async render(force = false, options = {}) {
    return super.render(force, options);
  }

  async _renderInner(data) {
    const html = this._renderHTML(data);
    return $(html);
  }

  static _instance = null;

  _pendingRoll        = null;
  _selectedMove       = null;
  _selectedTarget     = null;  // participant index
  _pendingStringSpend = null;  // { sourceActorId, stringId } — confirmed when roll fires
  _pendingLeverage    = null;  // "desire" | "fear" | "weakness" — dossier card for this roll
  _gmActingIdx        = 0;     // GM only: which participant the GM is acting as

  static get instance() { return TSLConflictApp._instance; }

  /** Resolve a participant's Actor, working for linked AND unlinked tokens. */
  _participantActor(p) {
    return game.actors.get(p?.actorId) ?? canvas.tokens?.get(p?.tokenId)?.actor ?? null;
  }

  /** Does the current user own this participant? (token fallback for unlinked) */
  _ownsParticipant(p) {
    return this._participantActor(p)?.isOwner ?? false;
  }

  /**
   * There is no turn order — the GM runs initiative however they like.
   * The "actor" of an action is: for a player, the participant they own;
   * for the GM, the participant they've chosen to act as. Returns the
   * participant index, or -1 if this user has no one to act with.
   */
  _actingIndex() {
    const ps = ConflictStore.state?.participants ?? [];
    if (!ps.length) return -1;
    if (game.user.isGM) return Math.min(this._gmActingIdx ?? 0, ps.length - 1);
    return ps.findIndex(p => this._ownsParticipant(p));
  }

  static openConflict(state) {
    if (TSLConflictApp._instance) { TSLConflictApp._instance.render(true); return; }
    const app = new TSLConflictApp();
    TSLConflictApp._instance = app;
    app.render(true);
    app._unsubscribe = ConflictStore.subscribe((newState) => {
      if (!newState) { app.close(); return; }
      app.render(true);
    });
  }

  static async openSelection(tokens = []) {
    ConflictStore.startSelection(tokens);
    TSLConflictApp.openConflict(ConflictStore.state);
  }

  static receiveOpen(data) {
    ConflictStore.load(data.state);
    TSLConflictApp.openConflict(data.state);
  }

  static receiveUpdate(data) {
    ConflictStore.load(data.state);
    if (TSLConflictApp._instance) TSLConflictApp._instance.render(true);
    else TSLConflictApp.openConflict(data.state);
  }

  static receiveClose() { TSLConflictApp._instance?.close(); }

  // ── Render ───────────────────────────────────────────────────────────────────

  async getData() {
    const state = ConflictStore.state;
    if (!state) return { empty: true };

    const selectionMode = !state.active && (!state.participants?.length || state.participants.length === 0);
    const selectedTokenIds = state.selectedTokenIds ?? [];
    const availableTokens = selectionMode
      ? (canvas.tokens?.placeables ?? []).filter((token) => token.actor)
      : [];

    const strings = {};
    const encounters = {};
    const knownArchetypes = {};
    const archIsGuess = {};
    // The archetype a player "sees" is THEIR OWN GUESS from their acting
    // character's Bond ("Read as") — possibly wrong. Only the GM (and the
    // actor's owner) sees the truth. All marks/predictions follow the guess.
    const actingIdx   = this._actingIndex();
    const guessBaseId = !game.user.isGM && actingIdx !== -1
      ? state.participants[actingIdx]?.actorId ?? null
      : null;
    for (const p of state.participants) {
      strings[p.actorId] = TSLStringStore.forParticipant(p, state.participants);
      const actor = game.actors.get(p.actorId);
      encounters[p.actorId] = actor ? SocialEncounterManager.getEncounter(actor) : null;
      if (game.user.isGM || actor?.isOwner) {
        knownArchetypes[p.actorId] = actor ? SocialArchetypeManager.getArchetype(actor) : null;
        archIsGuess[p.actorId] = false;
      } else {
        const guessId = guessBaseId ? TSLBondStore.find(guessBaseId, p.actorId)?.perceivedArchetypeId : null;
        knownArchetypes[p.actorId] = guessId ? SocialArchetypeManager.getArchetypeById(guessId) : null;
        archIsGuess[p.actorId] = true;
      }
    }

    return { state, isGM: game.user.isGM, strings, encounters, knownArchetypes, archIsGuess, selectionMode, availableTokens, selectedTokenIds };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._activateListeners(html);
  }

  _activateListeners(html) {
    const el = html instanceof HTMLElement ? html : html[0];
    el.addEventListener("click", this._onClick.bind(this));

    // GM "acting as" selector — pick which participant the GM acts with
    el.querySelector(".tsl-acting-select")?.addEventListener("change", (e) => {
      this._gmActingIdx        = parseInt(e.target.value);
      this._selectedMove       = null;
      this._selectedTarget     = null;
      this._pendingStringSpend = null;
      this._pendingLeverage    = null;
      this.render();
    });
  }

  _renderHTML(context) {
    if (context.empty) return "<p>No active conflict.</p>";
    const { state, isGM, strings, encounters, knownArchetypes, archIsGuess, selectionMode, availableTokens, selectedTokenIds } = context;

    // If a participant was removed (yield/kiss) while a target was selected, clear stale refs;
    // also never let the target collapse onto the acting participant (self-target).
    if (this._selectedTarget !== null &&
        (this._selectedTarget >= (state.participants?.length ?? 0)
         || this._selectedTarget === this._actingIndex())) {
      this._selectedTarget = null;
      this._pendingStringSpend = null;
      this._pendingLeverage = null;
    }

    if (selectionMode) {
      const selectedCount = selectedTokenIds.length;
      const renderTokenRow = (token) => {
        const selected = selectedTokenIds.includes(token.id);
        const imgSrc = token.texture?.src || token.actor?.img || "icons/svg/mystery-man.svg";
        return `<button class="tsl-select-token ${selected ? "selected" : ""}" data-select-token="${token.id}">
          <img src="${imgSrc}" alt="${token.name}" />
          <span>${token.name}</span>
        </button>`;
      };
      return `
        <div class="tsl-conflict-root tsl-selection-mode">
          <div class="tsl-header">
            <div class="tsl-header-label">Social Conflict — Select participants</div>
            ${isGM ? `<button class="tsl-close-btn" title="Close">✕</button>` : ""}
          </div>
          <div class="tsl-selection-instructions">
            <p>Select at least two tokens to start a social encounter.</p>
            <p>Selected: ${selectedCount}</p>
          </div>
          <div class="tsl-token-grid">
            ${availableTokens.map(renderTokenRow).join("")}
          </div>
          <div class="tsl-selection-actions">
            ${selectedCount >= 2
              ? `<button class="tsl-start-conflict-btn">Start Conflict (${selectedCount})</button>`
              : `<div class="tsl-selection-hint">Choose ${2 - selectedCount} more token(s).</div>`}
          </div>
        </div>`;
    }
    // The source of actions = the participant this user acts as (no turn order)
    const actingIdx     = this._actingIndex();
    const activeP       = state.participants[actingIdx] ?? state.participants[0];
    const canAct        = actingIdx !== -1 && !state.resolved;
    const move          = this._selectedMove;
    const hasTarget     = this._selectedTarget !== null;
    const activeColor   = activeP?.color ?? "#e8557a";
    const isManeuver    = !!move?.skillKeys;
    const needsTarget   = move?.target === true || isManeuver;

    // Which layers are on: full / pure-TSL / pure-fencing (world setting)
    const mode        = game.settings.get("tsl-social-conflict", "conflictMode");
    const showTSL     = mode !== "fencing";
    const showFencing = mode !== "tsl";
    const showKiss    = game.settings.get("tsl-social-conflict", "enableKiss") || mode === "tsl";

    // ── Participant cards ──────────────────────────────────────────────────────
    // TSL Conditions + Strings share one quiet footer row; names live in tooltips.
    const renderFooter = (p, idx) => {
      const pips = CONDITIONS.map(c => `
        <button class="tsl-cond-pip ${p.conditions[c.id] ? "active" : ""}"
          data-participant="${idx}" data-condition="${c.id}"
          style="--cond-color:${c.color}" ${!isGM ? "disabled" : ""}
          data-tooltip="<b>${c.label}</b>${p.conditions[c.id] ? " — active" : ""}<br>Clears when: ${c.clears}. Not by short rests — feelings are lived out, not slept off."></button>`).join("");

      const data = strings[p.actorId];
      let strChip = "";
      if (data) {
        const held = data.held.length;
        const inc  = data.incoming.reduce((s, x) => s + x.count, 0);
        if (held || inc) {
          const parts = [
            held ? `holds ${held}` : null,
            inc ? `${inc} on them` : null,
          ].filter(Boolean).join(" · ");
          strChip = `<span class="tsl-str-chip" data-tooltip="Strings — ${parts}. Holding a String grips them: +1 on your maneuvers against them. On a missed maneuver you may burn one for +${STRING_SPEND_BONUS} — the gamble. Earned above all by OPENING UP in play.">
            <i class="fas fa-masks-theater"></i>${held || inc}</span>`;
        }
      }

      const awardBtn = isGM
        ? `<button class="tsl-award-string" data-award-string="${idx}"
             data-tooltip="Award a String for roleplay: ${p.name} opened their heart in character — pick who it was aimed at. Vulnerability is how trump cards are made.">
             <i class="fas fa-hand-holding-heart"></i></button>`
        : "";

      return `<div class="tsl-card-footer" data-tooltip="Conditions — 4+ = Overwhelmed">
        <div class="tsl-cond-pips">${pips}</div>${strChip}${awardBtn}
      </div>`;
    };

    // Patience/Resolve tracks — they appear on their own once a maneuver lands
    // (no "Start Encounter" step). Show a resolved outcome if one happened.
    const renderEncounter = (p) => {
      if (!showFencing) return "";
      const enc = encounters?.[p.actorId];
      if (!enc?.active) {
        if (enc?.outcome) {
          return `<div class="tsl-enc-done tsl-enc-done--${enc.outcome}">${
            enc.outcome === "swayed" ? "💔 Swayed" : "🚪 Walked away"}</div>`;
        }
        return "";
      }
      const pips = (val, max, cls) => Array.from({ length: max }, (_, i) =>
        `<span class="tsl-enc-pip tsl-enc-pip--${cls} ${i < val ? "filled" : ""}"></span>`).join("");
      return `<div class="tsl-enc-tracks">
        <div class="tsl-enc-track" data-tooltip="Resolve — break it to sway them (0 = swayed). Successful maneuvers reduce it, 2 on a vulnerability.">
          <span class="tsl-enc-track-label">RES</span>${pips(enc.resolve, enc.maxResolve, "resolve")}
        </div>
        <div class="tsl-enc-track" data-tooltip="Patience — failures and triggered immunities burn it. At 0 they walk away.">
          <span class="tsl-enc-track-label">PAT</span>${pips(enc.patience, enc.maxPatience, "patience")}
        </div>
      </div>`;
    };

    // Active fencing statuses (Rattled, Smitten, Provoked…) — icon dots, names in tooltip
    const renderStatuses = (p) => {
      if (!showFencing) return "";
      const conds = SocialArchetypeManager.getActiveConditions(game.actors.get(p.actorId));
      if (!conds.length) return "";
      return `<div class="tsl-status-row">${conds.map(c => `
        <span class="tsl-status-tag" style="--st-color:${c.meta.color ?? "#806858"}" data-tooltip="<b>${c.meta.label}</b><br>${foundry.utils.escapeHTML(c.meta.description)}${c.meta.combat ? `<br><b>Combat:</b> ${foundry.utils.escapeHTML(c.meta.combat)}` : ""}">${foundry.utils.escapeHTML(c.meta.label)}</span>`).join("")}</div>`;
    };

    const renderParticipant = (p, idx) => {
      const isActing   = actingIdx === idx && !state.resolved;
      const isTarget   = this._selectedTarget === idx;
      // Any participant other than yourself can be the single target
      const selectable = needsTarget && idx !== actingIdx && !state.resolved && canAct;
      const condCount  = Object.values(p.conditions).filter(Boolean).length;
      const arch       = knownArchetypes?.[p.actorId];
      const isGuess    = archIsGuess?.[p.actorId] ?? false;
      const canYield   = !state.resolved && (isGM || this._ownsParticipant(p));
      const triad      = arch ? SOCIAL_TRIADS[arch.triad] : null;
      const playbook   = TSLPlaybooks.getForActor(game.actors.get(p.actorId));
      // The archetype badge doubles as an intel dossier (hover = the whole read).
      // For players it shows THEIR GUESS — clearly marked, possibly wrong.
      const esc0       = foundry.utils.escapeHTML;
      const dossierTip = arch ? [
        isGuess ? `<b>Your read (may be wrong):</b>` : null,
        `<b>${esc0(arch.label)}</b> — ${esc0(arch.description)}`,
        `<i>${esc0(arch.hint ?? "")}</i>`,
        `💎 Craves: ${esc0(arch.craves ?? "?")}<br>👻 Dreads: ${esc0(arch.dreads ?? "?")}`,
        (arch.tells ?? []).length ? `Tells: ${esc0(arch.tells.join(" · "))}` : null,
      ].filter(Boolean).join("<br>").replaceAll('"', "&quot;") : "";
      const subtitle   = !showFencing
        ? (playbook
            ? `<div class="tsl-participant-arch" style="--triad-color:#e8557a" data-tooltip="${foundry.utils.escapeHTML(playbook.essence)}"><i class="fas ${playbook.icon}"></i> ${playbook.label}</div>`
            : `<div class="tsl-participant-system">—</div>`)
        : arch
          ? `<div class="tsl-participant-arch" style="--triad-color:${triad?.color ?? "#806858"}" data-tooltip="${dossierTip}">
               ${isGuess ? `<i class="fas fa-pencil tsl-guess-i"></i>` : `<i class="fas ${triad?.icon ?? "fa-user"}"></i>`} ${arch.label}${isGuess ? "?" : ""}</div>`
          : `<div class="tsl-participant-system" data-tooltip="Their nature is a riddle — watch their tells (Read Them whispers one) and write your guess into your Bond ('Read as'). The ✦/⚡ marks will follow your guess.">Nature unread</div>`;
      const badge = isActing ? `<span class="tsl-turn-badge" style="--active-color:${p.color}">${game.user.isGM ? "Acting" : "You"}</span>`
                  : isTarget ? `<span class="tsl-turn-badge" style="--active-color:#e8a855">Target</span>` : "";
      return `
        <div class="tsl-participant ${isActing ? "active" : ""} ${isTarget ? "target-selected" : ""} ${selectable ? "selectable" : ""} ${condCount >= 4 ? "overwhelmed" : ""}"
             data-idx="${idx}" style="--p-color:${p.color}" ${selectable ? `data-select-target="${idx}"` : ""}>
          <div class="tsl-participant-header">
            <img class="tsl-portrait" src="${p.img}" alt="${p.name}">
            <div class="tsl-participant-info">
              <div class="tsl-participant-name">${p.name}${badge}</div>
              ${subtitle}
            </div>
          </div>
          ${renderEncounter(p)}
          ${renderStatuses(p)}
          ${renderFooter(p, idx)}
          ${canYield ? `<button class="tsl-yield-btn" data-participant="${idx}">Yield</button>` : ""}
        </div>`;
    };

    // ── Center: actions + target + roll ─────────────────────────────────────────
    const renderTargetList = () => state.participants.map((p, i) =>
      i === actingIdx ? "" :
      `<button class="tsl-target-btn ${this._selectedTarget === i ? "selected" : ""}" data-select-target="${i}">${foundry.utils.escapeHTML(p.name)}</button>`
    ).join("");

    // ── Social Maneuvers — one tidy chip grid, thin triad dividers ─────────────
    // All the situational math (leaning, counter, vulnerability) is surfaced in
    // the action bar AFTER you pick; chips stay uniform. A tiny corner mark only
    // flags a known vulnerability/immunity/counter so you can scan for it.
    const renderManeuvers = () => {
      const esc      = foundry.utils.escapeHTML;
      const srcActor = game.actors.get(activeP.actorId);
      const tgtActor = hasTarget ? game.actors.get(state.participants[this._selectedTarget].actorId) : null;
      // Marks follow what THIS VIEWER believes: the GM's truth, or the
      // player's own guess from their Bond — which may be wrong.
      const tgtArch  = tgtActor ? knownArchetypes?.[tgtActor.id] : null;
      const seeRel   = !!tgtArch;

      return MANEUVER_GROUPS.map(g => {
        const mvs   = SOCIAL_MANEUVERS.filter(m => m.group === g.id);
        const color = SOCIAL_TRIADS[g.id]?.color ?? "#806858";
        const short = (SOCIAL_TRIADS[g.id]?.label ?? g.label).replace("Triad of ", "");
        const chips = mvs.map(m => {
          const isSel   = move?.id === m.id;
          const rel     = tgtActor ? SocialManeuverRoller.getRelation(tgtActor, m, isGM ? undefined : (tgtArch ?? null)) : "neutral";
          const counter = seeRel && TRIAD_COUNTERS[m.group] === tgtArch.triad;
          const comboReady = tgtActor && (
            (m.combos && Object.keys(m.combos).some(st => SocialArchetypeManager.getActiveCondition(tgtActor, st)))
            || (m.kickWhileDown && SOCIAL_CONDITION_ORDER.some(st => SocialArchetypeManager.getActiveCondition(tgtActor, st)))
            || !!findOpening(tgtActor, m));
          // Archetype weak/strong marks (✦/⚡/») are the GM's to see — players
          // deduce nature from outcomes, not off the chips. ◆ (armed combo /
          // open wound) stays for everyone: it reads off visible statuses.
          const mark    = isGM && rel === "immune" ? `<span class="tsl-chip-mark tsl-chip-mark--imm">⚡</span>`
                        : isGM && rel === "vulnerable" ? `<span class="tsl-chip-mark tsl-chip-mark--vuln">✦</span>`
                        : comboReady ? `<span class="tsl-chip-mark tsl-chip-mark--combo">◆</span>`
                        : isGM && counter ? `<span class="tsl-chip-mark tsl-chip-mark--counter">»</span>` : "";
          const mod  = srcActor ? SocialManeuverRoller.getSkillMod(srcActor, m) : 0;
          const ar = SocialArchetypeManager.getArchetypeRelationsFor(m);
          const counterShort = TRIAD_COUNTERS[m.group]
            ? (SOCIAL_TRIADS[TRIAD_COUNTERS[m.group]]?.label ?? "").replace("Triad of ", "") : null;
          const comboTip = [
            ...(m.combos ? Object.entries(m.combos).map(([st, c]) =>
              `◆ Combo — consumes ${SOCIAL_CONDITIONS[st]?.label ?? st}: ${c.label}` +
              `${c.resolveDamage ? ` (+${c.resolveDamage} Resolve damage)` : ""}${c.strings ? ` (+${c.strings} String)` : ""}`) : []),
            ...(m.kickWhileDown ? ["◆ Kicks while down: +1 Resolve damage if they have any status (not consumed)"] : []),
            ...Object.entries(CONDITION_OPENINGS[m.id] ?? {}).map(([c, f]) =>
              `❤ Open wound (${c.charAt(0).toUpperCase() + c.slice(1)}): +2 — ${f} (never consumed)`),
          ].join("<br>") || null;
          // Once a target is chosen, the tooltip shows what this maneuver
          // actually does against THEM right now (veiled, follows your read).
          // With no target, it falls back to the generic archetype matrix.
          const liveBlock = (tgtActor && srcActor)
            ? `<b>Vs ${esc(tgtActor.name)}:</b><br>` +
              SocialManeuverRoller.describeVsTarget(srcActor, tgtActor, m, tgtArch ?? null, isGM)
                .map(l => esc(l)).join("<br>")
            : null;
          const tip = [
            `<b>${esc(m.name)}</b> · ${esc(m.skill)} ${mod >= 0 ? "+" : ""}${mod}${m.skill2 ? ` + ${esc(m.skill2)} (support)` : ""}`,
            esc(m.description),
            liveBlock,
            liveBlock ? null : comboTip,
            liveBlock ? null : (ar.vulnerable.length ? `✦ Cuts deep: ${esc(ar.vulnerable.map(x => x.label).join(", "))}` : null),
            liveBlock ? null : (ar.immune.length     ? `⚡ Bounces off: ${esc(ar.immune.map(x => x.label).join(", "))}` : null),
            liveBlock ? null : (counterShort         ? `» School counters ${esc(counterShort)} archetypes (+2)` : null),
          ].filter(Boolean).join("<br>").replaceAll('"', "&quot;");
          return `
            <button class="tsl-chip ${isSel ? "selected" : ""}" data-maneuver="${m.id}" data-tooltip="${tip}">
              <i class="fas ${m.icon}"></i><span class="tsl-chip-name">${esc(m.name)}</span>${mark}
            </button>`;
        }).join("");
        const schoolTip = SOCIAL_TRIADS[g.id]?.hint
          ?? "Safe basics anyone can use — the read, the jab, the taunt. No archetype traps here.";
        return `<div class="tsl-chip-group" style="--triad-color:${color}">
          <div class="tsl-chip-group-label" data-tooltip="${esc(schoolTip)}">${esc(short)}</div>
          <div class="tsl-chip-grid">${chips}</div>
        </div>`;
      }).join("");
    };

    const centerBottom = () => {
      const esc = foundry.utils.escapeHTML;

      // Nothing picked yet: one quiet hint, no wall of instructions.
      if (!move) {
        if (state.resolved) return "";
        const what = showTSL && showFencing ? "a move or maneuver" : showTSL ? "a move" : "a maneuver";
        return `<div class="tsl-hint">Pick ${what}, then a target, to see the roll.</div>`;
      }

      // Finally Kiss / any move that still needs a target → compact target chips.
      if (move.special && !hasTarget)
        return `<div class="tsl-bar tsl-bar--pick"><span class="tsl-bar-label">Partner</span>${renderTargetList()}</div>`;
      if (move.special)
        return `<div class="tsl-bar"><button class="tsl-kiss-btn">💋 Finally Kiss ${esc(state.participants[this._selectedTarget].name)}</button></div>`;
      if (needsTarget && !hasTarget)
        return `<div class="tsl-bar tsl-bar--pick"><span class="tsl-bar-label">Target</span>${renderTargetList()}</div>`;

      const srcActor = game.actors.get(activeP.actorId);
      const tgtP     = hasTarget ? state.participants[this._selectedTarget] : null;

      // ── 2d6 emotional move: attacker · stat +N · Roll ────────────────────────
      if (!isManeuver) {
        const stat  = activeP.stats.find(s => s.name === move.stat) ?? { name: move.stat, value: 0 };
        const bonus = this._pendingStringSpend ? 1 : 0;
        const total = stat.value + bonus;
        return `<div class="tsl-bar">
          <img class="tsl-bar-portrait" src="${activeP.img}" alt="">
          <div class="tsl-bar-core">
            <span class="tsl-bar-move">${esc(move.name)}</span>
            <span class="tsl-bar-roll">2d6 ${total >= 0 ? "+" : "−"} ${Math.abs(total)} <span class="tsl-bar-dim">${esc(stat.name)}${bonus ? " +String" : ""}</span></span>
          </div>
          ${this._stringToggle(activeP, tgtP)}
          <button class="tsl-roll-btn" style="--active-color:${activeColor}">Roll</button>
        </div>`;
      }

      // ── Maneuver: predictions follow YOUR read; the dice follow the truth ────
      const tgtActor = game.actors.get(tgtP.actorId);
      if (!srcActor || !tgtActor) return "";
      const dispArch = knownArchetypes?.[tgtActor.id] ?? null;   // GM: truth · player: guess
      const isGuess  = archIsGuess?.[tgtActor.id] ?? false;
      // GM assesses on the truth; a PLAYER's bar carries no archetype analysis
      // at all (override null) — only their own bonuses and visible statuses.
      // The dice still follow the truth; nature is learned from outcomes.
      const a = SocialManeuverRoller.assess(srcActor, tgtActor, move, {
        leverage: this._pendingLeverage,
        archetypeOverride: isGM ? undefined : null,
      });
      const seeRel  = isGM;
      // String spend moved AFTER the roll (the gamble) — no pre-commit here
      const extra   = a.bonus;

      // Bonus/DC breakdowns fold into single signed numbers with tooltip detail.
      const bonusList =
        a.bonusReasons.map(b => `${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label.split(" — ")[0])}`);
      const extraChip = extra
        ? `<span class="tsl-bar-extra ${extra >= 0 ? "pos" : "neg"}" data-tooltip="${esc(bonusList.join(", "))}${isGuess && seeRel ? " — predictions follow your read" : ""}">${extra >= 0 ? "+" : "−"}${Math.abs(extra)}</span>`
        : "";
      // Players never see the number they must beat — difficulty is earned
      // knowledge (reads, evidence), not a free readout.
      const dcTip  = a.dcMods.length ? ` (${a.dcBase}${a.dcMods.map(m => `${m.value > 0 ? "+" : "−"}${Math.abs(m.value)}`).join("")})` : "";
      const dcHtml = isGM
        ? `<span class="tsl-bar-dim">vs DC <b data-tooltip="${dcTip ? "Base " + dcTip : "10 + WIS + proficiency"}">${a.dc}</b></span>`
        : `<span class="tsl-bar-dim">vs <b data-tooltip="The difficulty is hidden — only the GM sees the number. Read them, watch outcomes, and you'll sense it.">?</b></span>`;

      const advMark = a.advantage
        ? `<span class="tsl-bar-adv" data-tooltip="${esc(a.advantageReasons.join("; "))}${isGuess ? " — if your read is right" : ""}">ADV${isGuess && a.relation === "vulnerable" ? "?" : ""}</span>` : "";
      const relMark = a.relation === "vulnerable" && seeRel ? `<span class="tsl-chip-mark tsl-chip-mark--vuln">✦</span>`
                    : (a.relation === "immune" || a.relation === "blocked") ? `<span class="tsl-chip-mark tsl-chip-mark--imm">⚡</span>` : "";

      // The single most useful sentence, chosen by priority — never a stack.
      const readPrefix = isGuess ? "Your read: " : "";
      let hint = "", hintCls = "dim";
      if (a.relation === "blocked")        { hint = a.relationReason; hintCls = "imm"; }
      else if (seeRel && a.relation === "immune")     { hint = `${readPrefix}${a.relationReason} — ${isGuess ? "if you're right, it fails and they turn Defiant." : "it fails, they turn Defiant."}`; hintCls = "imm"; }
      else if (seeRel && a.relation === "vulnerable") { hint = `${readPrefix}this should cut deep — Advantage & +1 Resolve damage${isGuess ? " (if your read is right)" : ""}.`; hintCls = "vuln"; }
      else if (a.combo)                    { hint = `◆ Combo armed — ${a.combo.label}.`; hintCls = "vuln"; }
      else if (a.opening)                  { hint = `❤ Open wound — ${a.opening.flavor} (+2).`; hintCls = "vuln"; }
      else if (a.lastExchange)             { hint = "⚠ Their patience is at its end — one more misstep ends this."; hintCls = "imm"; }
      else if (seeRel && a.answerRisk)     { hint = `${readPrefix}fumble badly here and their answer comes — ${a.answerRisk}${isGuess ? " (if your read is right)" : ""}.`; hintCls = "imm"; }
      else if (a.patienceThin)             { hint = "⏳ Their patience wears thin — they're getting harder to reach."; }
      else if (a.advantage)                { hint = a.advantageReasons[a.advantageReasons.length - 1]; hintCls = "vuln"; }
      else if (isGM && !a.arch)            { hint = "No archetype set — open their Chronicle to arm weak spots."; }
      else if (!seeRel)                    { hint = "Their nature is a riddle — read tells, then note your guess in your Bond ('Read as')."; }

      const blocked = a.relation === "blocked";
      return `<div class="tsl-bar tsl-bar--duel">
        <div class="tsl-bar-line">
          <img class="tsl-bar-portrait" src="${activeP.img}" alt="">
          <div class="tsl-bar-core">
            <span class="tsl-bar-move">${esc(move.name)} ${relMark}${advMark}</span>
            <span class="tsl-bar-roll">${esc(move.skill)} ${a.skillMod >= 0 ? "+" : "−"} ${Math.abs(a.skillMod)} ${extraChip}
              ${dcHtml}</span>
          </div>
          ${blocked ? "" : `<button class="tsl-roll-btn" style="--active-color:${activeColor}">Roll</button>`}
        </div>
        ${this._leverageToggles(activeP, tgtP, tgtActor)}
        ${hint ? `<div class="tsl-bar-hint tsl-bar-hint--${hintCls}">${esc(hint)}</div>` : ""}
        ${(() => {
          const pv = SocialManeuverRoller.previewOutcomes(a, move);
          return pv ? `<div class="tsl-bar-stakes"><span class="tsl-stake-hit">✓ ${esc(pv.hit)}</span><span class="tsl-stake-sep">·</span><span class="tsl-stake-miss">✗ ${esc(pv.miss)}</span></div>` : "";
        })()}
      </div>`;
    };

    // ── Dice overlay (2d6 moves and d20 maneuvers share the stage) ─────────────
    const diceOverlay = this._pendingRoll ? (() => {
      const r = this._pendingRoll;
      if (r.kind === "maneuver") {
        const oc    = (r.outcome === "success" || r.outcome === "crit") ? "Strong Hit" : "Miss";
        const label = r.outcome === "crit"    ? "✦ Clean hit"
                    : r.outcome === "success" ? "Success"
                    : r.outcome === "immune"  ? "⚡ Walled off"
                    : r.outcome === "botch"   ? "⚔ They answer"
                    : "Failure";
        return `<div class="tsl-dice-overlay"><div class="tsl-dice-panel tsl-dice-panel--maneuver">
          <div class="tsl-dice-move"><i class="fas ${r.icon}"></i> ${r.moveName}</div>
          <div class="tsl-dice-total" data-outcome="${oc}">${r.total}</div>
          <div class="tsl-dice-breakdown">${game.user.isGM ? `vs DC ${r.dc}` : "vs ?"}</div>
          <div class="tsl-dice-outcome" data-outcome="${oc}">${label}</div>
          <button class="tsl-dice-close">Continue</button>
        </div></div>`;
      }
      return `<div class="tsl-dice-overlay"><div class="tsl-dice-panel">
        <div class="tsl-dice-move">${r.moveName}</div>
        <div class="tsl-dice-total" data-outcome="${r.outcome}">${r.total}</div>
        <div class="tsl-dice-breakdown">${r.d1} + ${r.d2} + ${r.statValue} (${r.statName})</div>
        <div class="tsl-dice-outcome" data-outcome="${r.outcome}">${r.outcome}</div>
        <button class="tsl-dice-close">Continue</button>
      </div></div>`;
    })() : "";

    return `
      <div class="tsl-conflict-root ${state.resolved ? "resolved" : ""}" style="--active-color:${activeColor}">
        ${diceOverlay}
        <div class="tsl-header">
          <div class="tsl-header-label">Social Conflict</div>
          ${state.resolved
            ? `<div class="tsl-resolved-banner">${state.resolution === "kiss" ? "💋 Finally kissed — +1 ongoing" : "🏳 Conflict resolved"}</div>`
            : isGM
              ? `<div class="tsl-acting-as" data-tooltip="Whom you act as. Use Foundry's own initiative to decide turn order.">
                   <span class="tsl-acting-label">Acting as</span>
                   <select class="tsl-acting-select">
                     ${state.participants.map((p, i) => `<option value="${i}" ${i === actingIdx ? "selected" : ""}>${foundry.utils.escapeHTML(p.name)}</option>`).join("")}
                   </select>
                 </div>`
              : canAct
                ? `<div class="tsl-turn-indicator">You act as ${foundry.utils.escapeHTML(activeP.name)}</div>`
                : `<div class="tsl-turn-indicator tsl-turn-indicator--spectate">Spectating</div>`}
          ${isGM ? `<button class="tsl-close-btn" title="End Conflict">✕</button>` : ""}
        </div>
        <div class="tsl-participants">
          ${state.participants.map((p, i) => renderParticipant(p, i)).join("")}
        </div>
        <div class="tsl-center ${!canAct ? "tsl-center--locked" : ""}">
          <div class="tsl-actions">
            ${!showTSL ? "" : (() => {
              const esc = foundry.utils.escapeHTML;
              const pb  = TSLPlaybooks.getForActor(game.actors.get(activeP.actorId));
              const moveChip = (m, extra = "") =>
                `<button class="tsl-chip ${extra} ${move?.id === m.id ? "selected" : ""}" data-move="${m.id}"
                         data-tooltip="<b>${esc(m.name)}</b> · 2d6 + ${esc(m.stat)}<br>${esc(m.desc)}">
                   <i class="fas ${m.icon}"></i><span class="tsl-chip-name">${esc(m.name)}</span>
                 </button>`;
              const kiss = showKiss ? (() => { const km = MOVES.find(m => m.special);
                return `<button class="tsl-chip tsl-chip--kiss ${move?.id === km.id ? "selected" : ""}" data-move="${km.id}"
                          data-tooltip="<b>${esc(km.name)}</b><br>${esc(km.desc)}"><i class="fas ${km.icon}"></i><span class="tsl-chip-name">Kiss</span></button>`; })() : "";
              return `<div class="tsl-chip-group tsl-chip-group--tsl">
                <div class="tsl-chip-group-label">Feelings · 2d6</div>
                <div class="tsl-chip-grid">
                  ${MOVES.filter(m => !m.special).map(m => moveChip(m)).join("")}
                  ${pb ? pb.moves.map(m => moveChip(m, "tsl-chip--playbook")).join("") : ""}
                  ${kiss}
                </div>
              </div>`;
            })()}
            ${!showFencing ? "" : renderManeuvers()}
          </div>
          ${centerBottom()}
        </div>
        <div class="tsl-log">
          ${state.log.map(e => `<div class="tsl-log-entry tsl-log--${e.type}">${e.text}</div>`).join("")}
        </div>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  /** A user can act if the conflict is live and they have a participant to act as. */
  _canAct() {
    const state = ConflictStore.state;
    if (!state?.active || state.resolved) return false;
    return this._actingIndex() !== -1;
  }

  /** Compact String-spend toggle for the action bar. */
  _stringToggle(activeP, tgtP) {
    if (!tgtP || !this._canAct()) return "";
    const list = TSLStringStore.getList(activeP.actorId).filter(e => e.targetActorId === tgtP.actorId);
    if (!list.length) return "";
    const s       = list[0];
    const pending = this._pendingStringSpend?.stringId === s.id;
    const idx     = ConflictStore.state.participants.findIndex(p => p.actorId === tgtP.actorId);
    return `<button class="tsl-spend-string ${pending ? "pending" : ""}"
              data-source-actor="${activeP.actorId}" data-string-id="${s.id}" data-target-idx="${idx}"
              data-tooltip="${pending ? "Cancel — String not spent" : `Spend a String for +1 on this 2d6 move (${list.length} held)`}">
              <i class="fas fa-masks-theater"></i> +1</button>`;
  }

  /** Dossier leverage toggles (Desire / Fear / Weakness) for the action bar. */
  _leverageToggles(activeP, tgtP, tgtActor) {
    if (!tgtP || !this._canAct()) return "";
    const esc = foundry.utils.escapeHTML;
    const profKnown = game.user.isGM || (TSLBondStore.find(activeP.actorId, tgtP.actorId)?.profileKnown ?? false);
    if (!profKnown) return "";
    const points = SocialArchetypeManager.getCharacterNotes(tgtActor).points;
    const META = [
      { id: "desire",   label: "Desire",   icon: "fa-gem",         fx: "Advantage; +1 Resolve on success." },
      { id: "fear",     label: "Fear",     icon: "fa-ghost",       fx: "+3; a failed threat burns 1 Patience." },
      { id: "weakness", label: "Weakness", icon: "fa-heart-crack", fx: "A neutral maneuver counts as a vulnerability." },
    ];
    const avail = META.filter(l => (points[l.id] ?? "").trim());
    if (!avail.length) return "";
    const enc = SocialEncounterManager.getEncounter(tgtActor);
    if (!enc.active) return `<div class="tsl-bar-lev"><span class="tsl-bar-lev-hint">Leverage ready — unlocks with the tracks</span></div>`;
    const btns = avail.map(l => {
      const used = enc.leverage?.[l.id];
      const sel  = this._pendingLeverage === l.id;
      const tip  = used ? `${l.label} — already played this encounter`
                        : `${l.label}: ${esc(points[l.id])} — ${l.fx} Once per encounter.`;
      return `<button class="tsl-lev-btn ${sel ? "selected" : ""}" data-leverage="${l.id}" ${used ? "disabled" : ""}
                data-tooltip="${tip.replaceAll('"', "&quot;")}"><i class="fas ${l.icon}"></i> ${l.label}</button>`;
    }).join("");
    return `<div class="tsl-bar-lev">${btns}</div>`;
  }

  _onClick(event) {
    const el = event.target.closest("[data-select-target], [data-select-token], .tsl-start-conflict-btn, .tsl-cond-pip, .tsl-chip, .tsl-roll-btn, .tsl-kiss-btn, .tsl-yield-btn, .tsl-dice-close, .tsl-close-btn, .tsl-spend-string, .tsl-string-remove, .tsl-lev-btn, .tsl-target-btn, .tsl-award-string");
    if (!el) return;

    // GM: award a String for emotional roleplay — "they opened their heart"
    if (el.matches(".tsl-award-string") && game.user.isGM) {
      this._awardStringDialog(parseInt(el.dataset.awardString));
      return;
    }

    // Toggle a dossier leverage card for the pending maneuver
    if (el.matches(".tsl-lev-btn")) {
      if (!this._canAct() || el.disabled) return;
      const type = el.dataset.leverage;
      this._pendingLeverage = this._pendingLeverage === type ? null : type;
      this.render();
      return;
    }

    // Spend string → selects target + marks spend pending until roll fires
    if (el.matches(".tsl-spend-string")) {
      if (!this._canAct()) return;
      const sourceActorId = el.dataset.sourceActor;
      const stringId      = el.dataset.stringId;
      const targetIdx     = parseInt(el.dataset.targetIdx);
      if (this._pendingStringSpend?.stringId === stringId) {
        this._pendingStringSpend = null;
        this._selectedTarget = null;
      } else {
        this._pendingStringSpend = { sourceActorId, stringId };
        this._selectedTarget = targetIdx;
      }
      this.render();
      return;
    }

    // GM: remove individual string entry
    if (el.matches(".tsl-string-remove") && game.user.isGM) {
      TSLStringStore.removeEntry(el.dataset.actor, el.dataset.stringId).then(() => this.render());
      return;
    }

    // Target selection (participant card or target button)
    if (el.dataset.selectTarget !== undefined) {
      const idx = parseInt(el.dataset.selectTarget);
      // If selecting a different target, cancel pending string spend & leverage
      if (this._selectedTarget !== idx) {
        this._pendingStringSpend = null;
        this._pendingLeverage    = null;
      }
      this._selectedTarget = idx;
      this.render();
      return;
    }

    if (el.matches(".tsl-cond-pip") && game.user.isGM) {
      ConflictStore.toggleCondition(parseInt(el.dataset.participant), el.dataset.condition);
      return;
    }

    // Unified action chips: data-maneuver (d20) or data-move (2d6)
    if (el.matches(".tsl-chip") && el.dataset.maneuver) {
      if (!this._canAct()) return;
      const maneuver = SOCIAL_MANEUVERS.find(m => m.id === el.dataset.maneuver);
      if (maneuver) {
        this._selectedMove       = this._selectedMove?.id === maneuver.id ? null : maneuver;
        this._selectedTarget     = null;
        this._pendingStringSpend = null;
        this._pendingLeverage    = null;
        this.render();
      }
      return;
    }

    if (el.matches(".tsl-chip") && el.dataset.move) {
      if (!this._canAct()) return;
      const move = MOVES.find(m => m.id === el.dataset.move) ?? TSLPlaybooks.getMove(el.dataset.move);
      this._selectedMove       = this._selectedMove?.id === el.dataset.move ? null : move;
      this._selectedTarget     = null;
      this._pendingStringSpend = null;
      this._pendingLeverage    = null;
      this.render();
      return;
    }

    if (el.matches(".tsl-roll-btn") && this._selectedMove) {
      if (!this._canAct()) return;
      this._doRoll(this._selectedMove, this._selectedTarget);
      return;
    }

    if (el.matches(".tsl-kiss-btn")) {
      const kissOn = game.settings.get("tsl-social-conflict", "enableKiss")
        || game.settings.get("tsl-social-conflict", "conflictMode") === "tsl";
      if (!kissOn) return;
      if (!this._canAct() || this._selectedTarget === null) return;
      TSLGMActions.request("kiss", { pIdx: this._actingIndex(), targetIdx: this._selectedTarget });
      this._selectedMove       = null;
      this._selectedTarget     = null;
      this._pendingStringSpend = null;
      this.render();
      return;
    }

    if (el.matches(".tsl-yield-btn")) {
      const idx = parseInt(el.dataset.participant);
      const p   = ConflictStore.state?.participants?.[idx];
      if (!p) return;
      if (!game.user.isGM && !this._ownsParticipant(p)) return;
      TSLGMActions.request("yield", { pIdx: idx });
      return;
    }

    if (el.matches(".tsl-dice-close")) {
      this._pendingRoll = null;
      this.render();
      return;
    }

    if (el.matches(".tsl-start-conflict-btn") && game.user.isGM) {
      const state = ConflictStore.createConflictFromSelection();
      if (!state) {
        ui.notifications.warn("Select at least two tokens to begin the conflict.");
        return;
      }
      TSLSocket.emit("CONFLICT_OPEN", { state });
      return;
    }

    if (el.matches(".tsl-select-token") && game.user.isGM) {
      ConflictStore.toggleTokenSelection(el.dataset.selectToken);
      return;
    }

    if (el.matches(".tsl-close-btn") && game.user.isGM) {
      ConflictStore.close();
      return;
    }
  }

  /**
   * GM award: a participant opened their heart in character — grant them a
   * String on the person the openness was aimed at, with a public card.
   * This is the PRIMARY way Strings enter play: vulnerability makes trumps.
   */
  _awardStringDialog(idx) {
    const state = ConflictStore.state;
    const p = state?.participants?.[idx];
    if (!p) return;
    const esc = foundry.utils.escapeHTML;
    const buttons = {};
    state.participants.forEach((o, i) => {
      if (i === idx) return;
      buttons[`t${i}`] = {
        label: o.name,
        callback: async () => {
          await TSLStringStore.add(p.actorId, o.actorId, 1);
          await ChatMessage.create({
            content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">💖 ${esc(p.name)} opens their heart — and a truth shared is a thread: <b>a String on ${esc(o.name)}</b>.</div></div>`,
          });
          ConflictStore.addLog(`💖 ${p.name} opened up — String on ${o.name}`, "kiss");
          ConflictStore._broadcast();
        },
      };
    });
    buttons.cancel = { label: "Cancel" };
    new Dialog({
      title: `${p.name} opened their heart — to whom?`,
      content: `<div class="tsl-rollmods"><p>Award a String for emotional roleplay: a true fear spoken, a confession, the story behind the scar. Pick who the openness was aimed at.</p></div>`,
      buttons,
      default: "cancel",
    }).render(true);
  }

  async _doRoll(move, targetIndex) {
    if (move.skillKeys) return this._doManeuverRoll(move, targetIndex);
    const state       = ConflictStore.state;
    const pIdx        = this._actingIndex();
    const participant = state.participants[pIdx];
    if (!participant) return;
    const stat        = participant.stats.find(s => s.name === move.stat) ?? { name: move.stat, value: 0 };

    // Spend string if pending — adds +1 to roll (the roller owns the source actor)
    let stringBonus = 0;
    if (this._pendingStringSpend) {
      const { sourceActorId, stringId } = this._pendingStringSpend;
      await TSLStringStore.removeEntry(sourceActorId, stringId);
      stringBonus = 1;
      this._pendingStringSpend = null;
    }

    const formula = stringBonus ? `2d6 + ${stringBonus}` : "2d6";
    const roll = new Roll(formula);
    await roll.evaluate();
    const dice   = roll.dice[0].results.map(r => r.result);
    const [d1, d2] = dice;
    const total   = d1 + d2 + stat.value + stringBonus;
    const outcome = total >= 10 ? "Strong Hit" : total >= 7 ? "Weak Hit" : "Miss";

    // The GM client records the roll authoritatively (turn, log, string gains)
    TSLGMActions.request("moveRoll", {
      pIdx, moveId: move.id, targetIdx: targetIndex ?? null,
      d1, d2, statValue: stat.value + stringBonus,
      stringSpent: stringBonus > 0, participantName: participant.name,
    });

    const targetName = targetIndex !== null ? state.participants[targetIndex]?.name : null;
    const bonusText  = stringBonus ? ` +1 string` : "";
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: game.actors.get(participant.actorId) }),
      flavor:  `<strong>${move.name}</strong>${targetName ? ` → ${targetName}` : ""} (${stat.name}: ${stat.value >= 0 ? "+" : ""}${stat.value}${bonusText}) — ${outcome}`,
    });

    this._pendingRoll    = { moveName: move.name, d1, d2, statValue: stat.value + stringBonus, statName: stat.name + bonusText, total, outcome };
    this._selectedMove   = null;
    this._selectedTarget = null;
    this.render();
  }

  async _doManeuverRoll(maneuver, targetIndex) {
    const state      = ConflictStore.state;
    const srcP       = state.participants[this._actingIndex()];
    const tgtP       = state.participants[targetIndex];
    const srcActor   = srcP ? game.actors.get(srcP.actorId) : null;
    const tgtActor   = tgtP ? game.actors.get(tgtP.actorId) : null;
    if (!srcActor || !tgtActor) return;

    // Hard wall (Defiant target / Smitten attacker): no roll, no wasted resources
    const leverage   = this._pendingLeverage;
    const assessment = SocialManeuverRoller.assess(srcActor, tgtActor, maneuver, { leverage });
    if (assessment.relation === "blocked") {
      ui.notifications.warn(assessment.relationReason);
      return;
    }

    // Roll config: the SYSTEM's own dialog when the setting is on (advantage,
    // expertise dice, situational mods live there), else our slim prompt.
    const mods = SocialManeuverRoller.usesSystemDialog(srcActor)
      ? { situational: 0, mode: "normal" }
      : await SocialManeuverRoller.promptRollMods(`${maneuver.name} → ${tgtP.name}`, assessment.advantage);
    if (!mods) return;

    // Strings are the post-roll gamble now: on a miss, rollManeuver offers to
    // burn one for +5 — decided AFTER the die, against a hidden difficulty.
    this._pendingStringSpend = null;
    this._pendingLeverage = null;

    const payload = await SocialManeuverRoller.rollManeuver(srcActor, tgtActor, maneuver, {
      leverage, situational: mods.situational, mode: mods.mode, offerString: true,
    });
    if (!payload) return;   // system dialog cancelled — nothing spent
    if (payload.spentStringPostRoll) {
      const held = TSLStringStore.getList(srcActor.id).filter(e => e.targetActorId === tgtActor.id);
      if (held.length) await TSLStringStore.removeEntry(srcActor.id, held[0].id);
    }

    // Effects + log + turn advance happen on the GM client
    TSLGMActions.request("maneuverOutcome", payload);

    this._pendingRoll = {
      kind: "maneuver",
      moveName: maneuver.name,
      icon: maneuver.icon,
      total: payload.total,
      dc: payload.dc,
      outcome: payload.outcomeType,
    };
    this._selectedMove   = null;
    this._selectedTarget = null;
    this.render();
  }

  async close(options = {}) {
    Hooks.off("updateActor", this._actorHook);
    this._unsubscribe?.();
    this._unsubscribe = null;
    TSLConflictApp._instance = null;
    return super.close(options);
  }
}
