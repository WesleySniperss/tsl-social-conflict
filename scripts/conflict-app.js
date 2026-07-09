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

  static get instance() { return TSLConflictApp._instance; }

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
    for (const p of state.participants) {
      strings[p.actorId] = TSLStringStore.forParticipant(p, state.participants);
      const actor = game.actors.get(p.actorId);
      encounters[p.actorId] = actor ? SocialEncounterManager.getEncounter(actor) : null;
      // Archetype is visible to the GM, the actor's owner, and anyone with a verified read
      const known = game.user.isGM || actor?.isOwner || TSLBondStore.profileKnownByUser(p.actorId);
      knownArchetypes[p.actorId] = known && actor ? SocialArchetypeManager.getArchetype(actor) : null;
    }

    return { state, isGM: game.user.isGM, strings, encounters, knownArchetypes, selectionMode, availableTokens, selectedTokenIds };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._activateListeners(html);
  }

  _activateListeners(html) {
    const el = html instanceof HTMLElement ? html : html[0];
    el.addEventListener("click", this._onClick.bind(this));
  }

  _renderHTML(context) {
    if (context.empty) return "<p>No active conflict.</p>";
    const { state, isGM, strings, encounters, knownArchetypes, selectionMode, availableTokens, selectedTokenIds } = context;

    // If a participant was removed (yield/kiss) while a target was selected, clear stale refs
    if (this._selectedTarget !== null && this._selectedTarget >= (state.participants?.length ?? 0)) {
      this._selectedTarget = null;
      this._pendingStringSpend = null;
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
    const activeP       = state.participants[state.turn];
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
    // TSL Conditions as one compact pip row (hover for the name, GM clicks to toggle)
    const renderConditions = (p, idx) => `
      <div class="tsl-cond-row-compact" data-tooltip="TSL Conditions — at 4+ they are Overwhelmed">${CONDITIONS.map(c => `
        <button class="tsl-condition tsl-condition--compact ${p.conditions[c.id] ? "active" : ""}"
          data-participant="${idx}" data-condition="${c.id}"
          style="--cond-color:${c.color}" ${!isGM ? "disabled" : ""}
          data-tooltip="<b>${c.label}</b>${p.conditions[c.id] ? " — active" : ""}">
          <span class="tsl-condition-pip"></span>
          <span class="tsl-condition-tag">${c.label.slice(0, 2)}</span>
        </button>`).join("")}
      </div>`;

    const renderStrings = (p, idx) => {
      const data = strings[p.actorId];
      if (!data) return "";
      const isActiveTurn = state.turn === idx && !state.resolved;
      const pendingSpend = this._pendingStringSpend;

      if (!data.held.length && !data.incoming.length) return "";

      const heldRows = data.held.map(s => {
        const isPending = pendingSpend?.stringId === s.id;
        const canSpend  = isActiveTurn && s.targetIdx !== -1;
        const spendBtn  = canSpend
          ? `<button class="tsl-spend-string ${isPending ? "pending" : ""}"
               data-source-actor="${p.actorId}"
               data-string-id="${s.id}"
               data-target-idx="${s.targetIdx}"
               title="${isPending ? "Cancel" : "Spend (+1 roll)"}">→</button>`
          : "";
        const removeBtn = isGM
          ? `<button class="tsl-string-remove" data-actor="${p.actorId}" data-string-id="${s.id}" title="Remove">✕</button>`
          : "";
        const label = s.label || (s.targetName ? s.targetName : "—");
        return `<div class="tsl-string-row">
          <span class="tsl-string-dot"></span>
          <span class="tsl-string-name">${foundry.utils.escapeHTML(label)}</span>
          ${spendBtn}${removeBtn}
        </div>`;
      }).join("");

      const incomingRows = data.incoming.map(s =>
        `<div class="tsl-string-row tsl-string-row--incoming">
          <span class="tsl-string-count">${s.count}×</span>
          <span class="tsl-string-name">${foundry.utils.escapeHTML(s.name)}</span>
        </div>`
      ).join("");

      return `<div class="tsl-strings">
        ${heldRows ? `<div class="tsl-strings-label">Holds</div>${heldRows}` : ""}
        ${incomingRows ? `<div class="tsl-strings-label tsl-strings-label--incoming">Held by</div>${incomingRows}` : ""}
      </div>`;
    };

    // Patience/Resolve tracks when a fencing encounter is running for this actor
    const renderEncounter = (p) => {
      if (!showFencing) return "";
      const enc = encounters?.[p.actorId];
      if (!enc?.active) {
        // GM can arm the tracks right here; fine-tuning lives in the Chronicle
        if (!isGM || state.resolved) return "";
        const suggested = SocialEncounterManager.suggestTracks(game.actors.get(p.actorId));
        return `<button class="tsl-enc-begin" data-actor-id="${p.actorId}"
                     data-tooltip="Start Patience ${suggested.patience} & Resolve ${suggested.resolve} for this participant (${foundry.utils.escapeHTML(suggested.hint)}). Adjust in their Chronicle → Fencing.">
               <i class="fas fa-khanda"></i> Start tracks</button>`;
      }
      const pips = (val, max, cls) => Array.from({ length: max }, (_, i) =>
        `<span class="tsl-enc-pip tsl-enc-pip--${cls} ${i < val ? "filled" : ""}"></span>`).join("");
      return `<div class="tsl-enc-tracks">
        <div class="tsl-enc-track" data-tooltip="Resolve — break it to sway them. Successful maneuvers reduce it (2 on a vulnerability).">
          <span class="tsl-enc-track-label">Resolve</span>${pips(enc.resolve, enc.maxResolve, "resolve")}
        </div>
        <div class="tsl-enc-track" data-tooltip="Patience — failures and triggered immunities burn it. At 0 they walk away.">
          <span class="tsl-enc-track-label">Patience</span>${pips(enc.patience, enc.maxPatience, "patience")}
        </div>
      </div>`;
    };

    // Active fencing statuses (Rattled, Smitten, Provoked…) as icon chips
    const renderStatuses = (p) => {
      if (!showFencing) return "";
      const actor = game.actors.get(p.actorId);
      const conds = SocialArchetypeManager.getActiveConditions(actor);
      if (!conds.length) return "";
      return `<div class="tsl-status-row">${conds.map(c => `
        <span class="tsl-status-chip" data-tooltip="<b>${c.meta.label}</b><br>${foundry.utils.escapeHTML(c.meta.description)}">
          <img src="${c.meta.icon}" alt="${c.meta.label}"><span>${c.meta.label}</span>
        </span>`).join("")}</div>`;
    };

    const renderParticipant = (p, idx) => {
      const isActive   = state.turn === idx && !state.resolved;
      const isTarget   = this._selectedTarget === idx;
      const selectable = needsTarget && !isActive && !state.resolved;
      const condCount  = Object.values(p.conditions).filter(Boolean).length;
      const arch       = knownArchetypes?.[p.actorId];
      const canYield   = !state.resolved && (isGM || game.actors.get(p.actorId)?.isOwner);
      const triad      = arch ? SOCIAL_TRIADS[arch.triad] : null;
      const playbook   = TSLPlaybooks.getForActor(game.actors.get(p.actorId));
      // Known archetype badge doubles as an intel dossier (hover = the whole read)
      const esc0       = foundry.utils.escapeHTML;
      const dossierTip = arch ? [
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
          ? `<div class="tsl-participant-arch" style="--triad-color:${triad?.color ?? "#806858"}"
                 data-tooltip="${dossierTip}">
               <i class="fas ${triad?.icon ?? "fa-user"}"></i> ${arch.label} <i class="fas fa-circle-info tsl-intel-i"></i></div>`
          : `<div class="tsl-participant-system" data-tooltip="Their archetype is hidden. A successful Cold Reading or Logic Exploit reveals it.">Nature unread</div>`;
      return `
        <div class="tsl-participant ${isActive ? "active" : ""} ${isTarget ? "target-selected" : ""} ${selectable ? "selectable" : ""}"
             data-idx="${idx}" style="--p-color:${p.color}" ${selectable ? `data-select-target="${idx}"` : ""}>
          <div class="tsl-participant-header">
            <img class="tsl-portrait" src="${p.img}" alt="${p.name}">
            <div class="tsl-participant-info">
              <div class="tsl-participant-name">${p.name}</div>
              ${subtitle}
            </div>
            ${isActive ? `<div class="tsl-turn-badge" style="--active-color:${p.color}">Turn</div>` : ""}
            ${isTarget ? `<div class="tsl-turn-badge" style="--active-color:#e8a855">Target</div>` : ""}
          </div>
          ${renderEncounter(p)}
          ${renderStatuses(p)}
          <div class="tsl-conditions">${renderConditions(p, idx)}</div>
          ${condCount >= 4 ? `<div class="tsl-overwhelmed">⚠ Overwhelmed</div>` : ""}
          ${renderStrings(p, idx)}
          ${canYield ? `<button class="tsl-yield-btn" data-participant="${idx}">🏳 Yield</button>` : ""}
        </div>`;
    };

    // ── Center: moves + target + roll ──────────────────────────────────────────
    const renderStats = () => activeP.stats.map(s => `
      <div class="tsl-stat">
        <span class="tsl-stat-name">${s.name}</span>
        <span class="tsl-stat-value">${s.value >= 0 ? "+" : ""}${s.value}</span>
      </div>`).join("");

    const renderTargetList = () => state.participants.map((p, i) =>
      i === state.turn ? "" :
      `<button class="tsl-target-btn ${this._selectedTarget === i ? "selected" : ""}" data-select-target="${i}">${p.name}</button>`
    ).join("");

    // ── Social Maneuvers — compact chips, archetype matrix in the tooltip ──────
    const renderManeuvers = () => {
      const esc      = foundry.utils.escapeHTML;
      const srcActor = game.actors.get(activeP.actorId);
      const tgtActor = hasTarget ? game.actors.get(state.participants[this._selectedTarget].actorId) : null;
      const seeRel   = tgtActor && !!knownArchetypes?.[tgtActor.id];

      const srcTriad  = srcActor ? (SocialArchetypeManager.getCharacterNotes(srcActor).triad ?? {}) : {};
      const totalDots = Object.values(srcTriad).reduce((s, v) => s + (v || 0), 0);

      return MANEUVER_GROUPS.map(g => {
        const mvs   = SOCIAL_MANEUVERS.filter(m => m.group === g.id);
        const color = SOCIAL_TRIADS[g.id]?.color ?? "#806858";
        // Attack style from the Extended Triad: +1 per dot, −1 on foreign ground
        const short = (SOCIAL_TRIADS[g.id]?.label ?? "").replace("Triad of ", "");
        const dots  = srcTriad[g.id] ?? 0;
        let elementBadge = "";
        if (g.id !== "general") {
          if (dots > 0)
            elementBadge = `<span class="tsl-mv-group-star" data-tooltip="${activeP.name}'s ${short} leaning ${"●".repeat(dots)} — +${dots} to these maneuvers (+1 per Extended Triad dot, set in the Chronicle Profile)">★ +${dots}</span>`;
          else if (totalDots > 0)
            elementBadge = `<span class="tsl-mv-group-star tsl-mv-group-star--malus" data-tooltip="Foreign ground — ${activeP.name} has no ${short} leaning: −1 to these maneuvers">▼ −1</span>`;
        }
        const chips = mvs.map(m => {
          const isSel   = move?.id === m.id;
          const rel     = tgtActor ? SocialManeuverRoller.getRelation(tgtActor, m) : "neutral";
          const tgtArch = tgtActor ? knownArchetypes?.[tgtActor.id] : null;
          const counter = seeRel && tgtArch && TRIAD_COUNTERS[m.group] === tgtArch.triad;
          const relCls  = seeRel && rel !== "neutral" ? `tsl-mv-chip--${rel}`
                        : counter ? "tsl-mv-chip--counter" : "";
          const relDot  = seeRel && rel !== "neutral"
            ? `<span class="tsl-mv-chip-rel">${rel === "immune" ? "⚡" : "✦"}</span>`
            : counter ? `<span class="tsl-mv-chip-rel tsl-mv-chip-rel--counter">»</span>` : "";
          const mod  = srcActor ? SocialManeuverRoller.getSkillMod(srcActor, m) : 0;
          const sign = mod >= 0 ? "+" : "";
          // Which archetypes this cuts / bounces off — rules knowledge, shown to all
          const ar = SocialArchetypeManager.getArchetypeRelationsFor(m);
          const counterShort = TRIAD_COUNTERS[m.group]
            ? (SOCIAL_TRIADS[TRIAD_COUNTERS[m.group]]?.label ?? "").replace("Triad of ", "") : null;
          const tip = [
            `<b>${esc(m.name)}</b> · ${esc(m.skill)} ${sign}${mod}`,
            esc(m.description),
            ar.vulnerable.length ? `✦ Cuts deep: ${esc(ar.vulnerable.map(x => x.label).join(", "))}` : null,
            ar.immune.length     ? `⚡ Bounces off: ${esc(ar.immune.map(x => x.label).join(", "))}` : null,
            counterShort         ? `» School counter: +2 vs ${esc(counterShort)} archetypes` : null,
          ].filter(Boolean).join("<br>").replaceAll('"', "&quot;");
          return `
            <button class="tsl-mv-chip ${isSel ? "selected" : ""} ${relCls}"
                    data-maneuver="${m.id}" data-tooltip="${tip}">
              <i class="fas ${m.icon}"></i>
              <span class="tsl-mv-chip-name">${esc(m.name)}</span>
              <span class="tsl-mv-chip-mod">${sign}${mod}</span>
              ${relDot}
            </button>`;
        }).join("");
        return `<div class="tsl-mv-group" style="--triad-color:${color}">
          <div class="tsl-mv-group-label">${g.label}${elementBadge ? " " + elementBadge : ""}</div>
          <div class="tsl-mv-chip-grid">${chips}</div>
        </div>`;
      }).join("");
    };

    const centerBottom = () => {
      if (!move) {
        if (state.resolved) return "";
        // First-glance orientation: what to do and what winning means (per mode)
        const pickLabel = showTSL && showFencing ? "pick a move or maneuver"
                        : showTSL ? "pick a move" : "pick a maneuver";
        const rollLabel = showFencing
          ? `roll — a maneuver is a plain D&D check: <b>d20 + skill vs their social DC</b> (10 + WIS + proficiency)`
          : `roll <b>2d6 + stat</b> — 10+ strong hit, 7–9 weak hit, 6− miss`;
        const goal = showFencing
          ? `<b>Goal:</b> successes break their <span class="tsl-objective-res">Resolve</span> (0 = swayed);
             failures burn their <span class="tsl-objective-pat">Patience</span> (0 = they walk away).
             Or end it with 🏳 Yield${showKiss ? " / 💋 Finally Kiss" : ""}.`
          : `<b>Goal:</b> pile Conditions on them — at 4+ they are <b>Overwhelmed</b> and must yield or flee.
             Strings are your leverage (+1 on a roll). End it with 🏳 Yield${showKiss ? " / 💋 Finally Kiss" : ""}.`;
        return `<div class="tsl-objective">
          <div class="tsl-objective-steps">
            <span class="tsl-objective-step"><b>1</b> ${pickLabel}</span>
            <span class="tsl-objective-step"><b>2</b> pick a target</span>
            <span class="tsl-objective-step"><b>3</b> ${rollLabel}</span>
          </div>
          <div class="tsl-objective-goal" data-tooltip="${showFencing
            ? "The GM arms the tracks with 'Start tracks' on a participant card. Without tracks, rolls still work — conditions and Strings flow — but there is no score to break."
            : "Conditions are toggled by the GM on the participant cards; moves say when someone gains or clears one."}">
            ${goal}
          </div>
        </div>`;
      }
      if (move.special) {
        if (!hasTarget) return `<div class="tsl-target-prompt">Choose partner</div><div class="tsl-target-list">${renderTargetList()}</div>`;
        return `<button class="tsl-kiss-btn">💋 Finally Kiss</button>`;
      }
      if (needsTarget && !hasTarget) {
        return `<div class="tsl-target-prompt">Choose target</div><div class="tsl-target-list">${renderTargetList()}</div>`;
      }
      if (isManeuver) {
        // ── Duel panel: everything the dice will do, spelled out pre-roll ─────
        const esc      = foundry.utils.escapeHTML;
        const srcActor = game.actors.get(activeP.actorId);
        const tgtP     = state.participants[this._selectedTarget];
        const tgtActor = game.actors.get(tgtP.actorId);
        if (!srcActor || !tgtActor) return "";
        const a      = SocialManeuverRoller.assess(srcActor, tgtActor, move, { leverage: this._pendingLeverage });
        const seeRel = !!knownArchetypes?.[tgtActor.id];
        const sign   = a.skillMod >= 0 ? "+" : "";

        // ── Dossier leverage cards (VTM-style), once per encounter each ───────
        const enc        = encounters?.[tgtP.actorId];
        const profKnown  = isGM || (TSLBondStore.find(activeP.actorId, tgtP.actorId)?.profileKnown ?? false);
        const tgtPoints  = SocialArchetypeManager.getCharacterNotes(tgtActor).points;
        const LEVERAGE_META = [
          { id: "desire",   label: "Desire",   icon: "fa-gem",         effect: "Advantage; on success +1 extra Resolve damage." },
          { id: "fear",     label: "Fear",     icon: "fa-ghost",       effect: "+3 to the roll; if you fail, they lose 1 extra Patience." },
          { id: "weakness", label: "Weakness", icon: "fa-heart-crack", effect: "A neutral maneuver counts as a vulnerability strike." },
        ];
        let leverageRow = "";
        if (enc?.active && profKnown) {
          const btns = LEVERAGE_META.filter(l => (tgtPoints[l.id] ?? "").trim()).map(l => {
            const used     = enc.leverage?.[l.id];
            const selected = this._pendingLeverage === l.id;
            const tip = used
              ? `<b>${l.label}</b> — already played this encounter; they've heard the pitch.`
              : `<b>${l.label}:</b> ${esc(tgtPoints[l.id])}<br><i>${l.effect} Once per encounter.</i>`;
            return `<button class="tsl-lev-btn ${selected ? "selected" : ""}" data-leverage="${l.id}"
                            ${used ? "disabled" : ""} data-tooltip="${tip.replaceAll('"', "&quot;")}">
                      <i class="fas ${l.icon}"></i> ${l.label}</button>`;
          }).join("");
          if (btns) leverageRow = `
            <div class="tsl-duel-lev">
              <span class="tsl-duel-lev-label" data-tooltip="Leverage from the dossier — play what you know about them. Each card once per encounter.">Leverage</span>
              ${btns}
            </div>`;
        } else if (profKnown && !enc?.active
                   && LEVERAGE_META.some(l => (tgtPoints[l.id] ?? "").trim())) {
          // Dossier is armed but the encounter isn't — nudge without nagging
          leverageRow = `<div class="tsl-duel-rel tsl-duel-rel--unknown">
            <i class="fas fa-gem"></i> Leverage cards ready — they unlock once the GM starts Patience &amp; Resolve tracks</div>`;
        }

        const bonusHtml = [
          ...(this._pendingStringSpend
            ? [`<span class="tsl-duel-chip tsl-duel-chip--bonus">+${STRING_SPEND_BONUS} String</span>`]
            : []),
          ...a.bonusReasons.map(b => {
            // The counter-school bonus applies regardless, but before a read
            // it must not leak the target's triad — tease, don't tell
            const veiled = b.kind === "counter" && !seeRel;
            const label  = veiled ? "Something in them yields to this school…" : b.label;
            const short  = veiled ? "?" : esc(b.label.split(" — ")[0]);
            return `
            <span class="tsl-duel-chip ${b.value >= 0 ? "tsl-duel-chip--bonus" : "tsl-duel-chip--malus"}"
                  data-tooltip="${esc(label)}">${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${short}</span>`;
          }),
        ].join("");

        const dcChips = a.dcMods.map(m =>
          `<span class="tsl-duel-chip" data-tooltip="${esc(m.label)}">${m.value > 0 ? "+" : "−"}${Math.abs(m.value)}</span>`
        ).join("");

        // Archetype intel only when read; status combos are public knowledge
        let relLine = "";
        if (a.relation === "blocked")
          relLine = `<div class="tsl-duel-rel tsl-duel-rel--immune">⚡ ${esc(a.relationReason)}</div>`;
        else if (seeRel && a.relation === "immune")
          relLine = `<div class="tsl-duel-rel tsl-duel-rel--immune">⚡ ${esc(a.relationReason)} — it will fail and they will turn Defiant</div>`;
        else if (seeRel && a.relation === "vulnerable")
          relLine = `<div class="tsl-duel-rel tsl-duel-rel--vulnerable">✦ ${esc(a.relationReason)} — Advantage & double Resolve damage</div>`;
        else if (isGM && !a.arch)
          relLine = `<div class="tsl-duel-rel tsl-duel-rel--unknown"><i class="fas fa-user-slash"></i> No archetype set — open their Chronicle to arm the vulnerability matrix</div>`;
        else if (!seeRel)
          relLine = `<div class="tsl-duel-rel tsl-duel-rel--unknown"><i class="fas fa-eye-slash"></i> Their nature is unread — Cold Reading reveals weak spots</div>`;

        const comboLines = a.advantageReasons
          .filter(r => r !== a.relationReason)
          .map(r => `<div class="tsl-duel-rel tsl-duel-rel--vulnerable">✦ ${esc(r)}</div>`)
          .join("");

        // Insight strip: what a read target craves and dreads, right where you aim
        const intelLine = seeRel && a.arch
          ? `<div class="tsl-duel-intel" data-tooltip="From the dossier — play to these">💎 ${esc(a.arch.craves ?? "")} · 👻 ${esc(a.arch.dreads ?? "")}</div>`
          : "";

        // A read that already paid out earns no second String
        const alreadyRead = move.reveals && (TSLBondStore.find(activeP.actorId, tgtP.actorId)?.profileKnown ?? false);
        const readNote = alreadyRead
          ? `<div class="tsl-duel-rel tsl-duel-rel--unknown"><i class="fas fa-book-open"></i> Already read — success re-confirms the profile but grants no new String</div>`
          : "";

        const blocked = a.relation === "blocked";
        const walled  = blocked || (seeRel && a.relation === "immune");
        const preview = walled ? "" : `
          <div class="tsl-duel-outcomes">
            <div class="tsl-duel-outcome tsl-duel-outcome--hit"><span class="tsl-duel-oc-label">≥ ${a.dc}</span>${esc(move.successText)}</div>
            <div class="tsl-duel-outcome tsl-duel-outcome--miss"><span class="tsl-duel-oc-label">&lt; ${a.dc}</span>${esc(move.failText)}</div>
          </div>`;

        return `<div class="tsl-duel">
          <div class="tsl-duel-row">
            <div class="tsl-duel-side">
              <img src="${activeP.img}" alt="">
              <div class="tsl-duel-side-info">
                <div class="tsl-duel-side-name">${esc(activeP.name)}</div>
                <div class="tsl-duel-side-stat">${esc(move.skill)} <b>${sign}${a.skillMod}</b>${bonusHtml}</div>
              </div>
            </div>
            <div class="tsl-duel-vs">${a.advantage ? `<span class="tsl-duel-adv" data-tooltip="Roll 2d20, keep the highest">ADV</span>` : "vs"}</div>
            <div class="tsl-duel-side tsl-duel-side--target">
              <div class="tsl-duel-side-info">
                <div class="tsl-duel-side-name">${esc(tgtP.name)}</div>
                <div class="tsl-duel-side-stat">DC <b>${a.dc}</b>${dcChips}</div>
              </div>
              <img src="${tgtP.img}" alt="">
            </div>
          </div>
          ${intelLine}
          ${leverageRow}
          ${relLine}${comboLines}${readNote}
          ${preview}
          ${blocked ? "" : `<button class="tsl-roll-btn" style="--active-color:${activeColor}">🎲 Roll ${esc(move.name)}</button>`}
        </div>`;
      }
      return `<div class="tsl-stats-row">${renderStats()}</div>
              <button class="tsl-roll-btn" style="--active-color:${activeColor}">🎲 Roll ${move.name}</button>`;
    };

    // ── Dice overlay (2d6 moves and d20 maneuvers share the stage) ─────────────
    const diceOverlay = this._pendingRoll ? (() => {
      const r = this._pendingRoll;
      if (r.kind === "maneuver") {
        const oc    = r.outcome === "success" ? "Strong Hit" : "Miss";
        const label = r.outcome === "success" ? "Success" : r.outcome === "immune" ? "⚡ Walled off" : "Failure";
        return `<div class="tsl-dice-overlay"><div class="tsl-dice-panel tsl-dice-panel--maneuver">
          <div class="tsl-dice-move"><i class="fas ${r.icon}"></i> ${r.moveName}</div>
          <div class="tsl-dice-total" data-outcome="${oc}">${r.total}</div>
          <div class="tsl-dice-breakdown">vs DC ${r.dc}</div>
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
            : `<div class="tsl-turn-indicator">⚔ ${activeP.name}'s Turn</div>`}
          ${isGM ? `<button class="tsl-close-btn" title="End Conflict">✕</button>` : ""}
        </div>
        <div class="tsl-participants">
          ${state.participants.map((p, i) => renderParticipant(p, i)).join("")}
        </div>
        <div class="tsl-center ${!state.resolved && !this._canAct() ? "tsl-center--locked" : ""}">
          ${!showTSL ? "" : `
          <div class="tsl-section-label" data-tooltip="TSL emotional moves: 2d6 + stat. 10+ strong hit, 7–9 weak hit, 6− miss. They drive Conditions, not Resolve.">Emotional Moves · 2d6</div>
          <div class="tsl-moves-grid">
            ${MOVES.filter(m => !m.special).map(m => `
              <button class="tsl-move ${move?.id === m.id ? "selected" : ""}" data-move="${m.id}" data-tooltip="${foundry.utils.escapeHTML(m.desc)}">
                <i class="fas ${m.icon}"></i>
                <span class="tsl-move-name">${m.name}</span>
                <span class="tsl-move-stat">${m.stat}</span>
              </button>`).join("")}
            ${(() => {
              // The active participant's TSL playbook adds its signature moves
              const pb = TSLPlaybooks.getForActor(game.actors.get(activeP.actorId));
              if (!pb) return "";
              return pb.moves.map(m => `
              <button class="tsl-move tsl-move--playbook ${move?.id === m.id ? "selected" : ""}" data-move="${m.id}"
                      data-tooltip="<b>${pb.label}</b><br>${foundry.utils.escapeHTML(m.desc)}">
                <i class="fas ${m.icon}"></i>
                <span class="tsl-move-name">${m.name}</span>
                <span class="tsl-move-stat">${m.stat}</span>
              </button>`).join("");
            })()}
          </div>
          ${(() => {
            if (!showKiss) return "";
            const km = MOVES.find(m => m.special);
            return `
          <button class="tsl-move tsl-move--special ${move?.id === km.id ? "selected" : ""}" data-move="${km.id}" data-tooltip="${foundry.utils.escapeHTML(km.desc)}">
            <i class="fas ${km.icon}"></i> ${km.name}
          </button>`; })()}
          ${move && !move.special && !move.skillKeys ? `<div class="tsl-move-desc">${move.desc}</div>` : ""}`}
          ${!showFencing ? "" : `
          <div class="tsl-section-label" style="margin-top:8px" data-tooltip="Social Fencing maneuvers: d20 + skill vs their social DC (10 + WIS + proficiency, or passive Insight if higher; ± attitude, −5 Rattled). Success chips Resolve, failure burns Patience. Hover a maneuver: which archetypes it cuts, bounces off, and which triad its school counters.">Maneuvers · d20</div>
          <div class="tsl-mv-conflict-groups">${renderManeuvers()}</div>`}
          ${centerBottom()}
        </div>
        <div class="tsl-log">
          ${state.log.map(e => `<div class="tsl-log-entry tsl-log--${e.type}">${e.text}</div>`).join("")}
        </div>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  /** Only the GM or the owner of the active participant may act on this turn. */
  _canAct() {
    const state = ConflictStore.state;
    if (!state?.active || state.resolved) return false;
    if (game.user.isGM) return true;
    const activeP = state.participants[state.turn];
    return game.actors.get(activeP?.actorId)?.isOwner ?? false;
  }

  _onClick(event) {
    const el = event.target.closest("[data-select-target], [data-select-token], .tsl-start-conflict-btn, .tsl-condition, .tsl-move, .tsl-mv-chip, .tsl-roll-btn, .tsl-kiss-btn, .tsl-yield-btn, .tsl-dice-close, .tsl-close-btn, .tsl-spend-string, .tsl-string-remove, .tsl-enc-begin, .tsl-lev-btn");
    if (!el) return;

    // GM: arm Patience & Resolve tracks for a participant (sheet-derived defaults)
    if (el.matches(".tsl-enc-begin") && game.user.isGM) {
      const actor = game.actors.get(el.dataset.actorId);
      if (actor) {
        const s = SocialEncounterManager.suggestTracks(actor);
        SocialEncounterManager.startEncounter(actor, s.patience, s.resolve);
      }
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

    if (el.matches(".tsl-condition") && game.user.isGM) {
      ConflictStore.toggleCondition(parseInt(el.dataset.participant), el.dataset.condition);
      return;
    }

    if (el.matches(".tsl-mv-chip") && el.dataset.maneuver) {
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

    if (el.matches(".tsl-move")) {
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
      if (!this._canAct()) return;
      TSLGMActions.request("kiss", { pIdx: ConflictStore.state.turn, targetIdx: this._selectedTarget });
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
      if (!game.user.isGM && !game.actors.get(p.actorId)?.isOwner) return;
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

  async _doRoll(move, targetIndex) {
    if (move.skillKeys) return this._doManeuverRoll(move, targetIndex);
    const state       = ConflictStore.state;
    const pIdx        = state.turn;
    const participant = state.participants[pIdx];
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
    const srcP       = state.participants[state.turn];
    const tgtP       = state.participants[targetIndex];
    const srcActor   = game.actors.get(srcP.actorId);
    const tgtActor   = tgtP ? game.actors.get(tgtP.actorId) : null;
    if (!srcActor || !tgtActor) return;

    // Hard wall (Defiant target / Smitten attacker): no roll, no wasted resources
    const leverage   = this._pendingLeverage;
    const assessment = SocialManeuverRoller.assess(srcActor, tgtActor, maneuver, { leverage });
    if (assessment.relation === "blocked") {
      ui.notifications.warn(assessment.relationReason);
      return;
    }

    // Spend string if pending — +2 to the maneuver roll
    let stringBonus = 0;
    if (this._pendingStringSpend) {
      const { sourceActorId, stringId } = this._pendingStringSpend;
      await TSLStringStore.removeEntry(sourceActorId, stringId);
      stringBonus = STRING_SPEND_BONUS;
      this._pendingStringSpend = null;
    }
    this._pendingLeverage = null;

    const payload = await SocialManeuverRoller.rollManeuver(srcActor, tgtActor, maneuver, { stringBonus, leverage });

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
