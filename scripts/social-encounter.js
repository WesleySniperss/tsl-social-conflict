/**
 * tsl-social-conflict | social-encounter.js
 *
 * Tracks a social exchange, storing world-synced state on Actor flags.
 *
 * ONE track for everyone (v2.0): COMPOSURE — how much pressure you can take
 * before you crack. A maneuver that lands on you takes it down; YOUR OWN miss
 * takes yours down (pressing is never free). When it hits 0 you have LOST the
 * exchange, and you choose how:
 *   give in   (stored "swayed") — you concede the point / do what was asked;
 *             the bond toward the winner deepens, and they take a String.
 *   storm off (stored "walked") — you refuse, but it costs: you carry a Grudge
 *             against the winner, the bond cools, and they take a String.
 * Who chooses: a player decides in the moment; an NPC follows its nature
 * ("When pressed": gives ground → give in, stands firm → storm off). Someone
 * Desperate for the winner, or Enthralled by them, can't storm off from them.
 *
 * An exchange belongs to the scene it started in: once it resolves, both
 * sides are out of it until the GM resets it or play moves to another scene.
 */

console.log("TSL | Loading social-encounter.js...");

class SocialEncounterManager {
  static getFlagScope() {
    return SOCIAL_FENCING_SCOPE;
  }

  static _emptyEncounter() {
    return {
      active: false,
      composure: 0,
      maxComposure: 0,
      round: 0,
      outcome: null,
    };
  }

  /** The scene exchanges are scoped to — the ACTIVE scene (where the table is). */
  static _sceneId() {
    try { return game.scenes?.active?.id ?? globalThis.canvas?.scene?.id ?? null; }
    catch { return null; }
  }

  /**
   * An exchange started in another scene (or by a version that didn't record
   * one) is over: a new scene is a new conversation. With no scene at all,
   * nothing is ever stale.
   */
  static isStale(enc) {
    if (!enc || (!enc.active && !enc.outcome)) return false;
    const scene = SocialEncounterManager._sceneId();
    return !!scene && enc.sceneId !== scene;
  }

  static getEncounter(actor) {
    const enc = actor?.getFlag(SocialEncounterManager.getFlagScope(), "encounter");
    if (!enc || SocialEncounterManager.isStale(enc)) return SocialEncounterManager._emptyEncounter();
    // A pre-2.0 exchange carried Resolve + Patience: its Resolve becomes Composure.
    if (enc.composure == null && enc.resolve != null) {
      return { ...enc, composure: enc.resolve, maxComposure: enc.maxResolve ?? enc.resolve };
    }
    return enc;
  }

  /** Has this actor's exchange ended (gave in or stormed off) in the current scene? */
  static isResolved(actor) {
    return !!SocialEncounterManager.getEncounter(actor).outcome;
  }

  static async setEncounter(actor, payload) {
    if (!actor) return;
    await actor.setFlag(SocialEncounterManager.getFlagScope(), "encounter", payload);
    return payload;
  }

  /**
   * Composure from the sheet: 2 + CHA mod + WIS mod (never below 2) — force of
   * personality plus self-possession. A mook (~2) folds in a hit or two, an
   * ordinary hero (~5–6) takes three, a hardened noble (~8–9) four or five.
   * The weight of a blow comes from the maneuver's SCHOOL (General 1 ·
   * archetype schools 2 · Humiliate 3), not from a bloated track.
   * The GM can nudge it in the Chronicle.
   */
  static suggestTracks(actor) {
    const abilities = actor?.system?.abilities ?? {};
    const mod = (k) => {
      const v = abilities[k]?.mod;
      return typeof v === "number" ? v : 0;
    };
    const cha = mod("cha"), wis = mod("wis");
    const sum = 2 + cha + wis;
    return {
      composure: Math.max(2, sum),
      hint: `Composure 2 + CHA (${cha >= 0 ? "+" : ""}${cha}) + WIS (${wis >= 0 ? "+" : ""}${wis}), never below 2`,
    };
  }

  /**
   * Ensure an actor has a live track before a maneuver touches them — no
   * "Start Encounter" ceremony. Auto-starts from the sheet on the first
   * maneuver (for BOTH sides), unless an exchange in this scene already
   * resolved. An exchange left over from another scene restarts fresh.
   */
  static async ensureActive(actor) {
    if (!actor) return null;
    const enc = SocialEncounterManager.getEncounter(actor);   // stale → empty
    if (enc.active || enc.outcome) return enc;
    return SocialEncounterManager.startEncounter(actor, SocialEncounterManager.suggestTracks(actor).composure);
  }

  static async startEncounter(actor, composure = 4) {
    if (!actor) return null;
    const c = Math.max(1, composure | 0);
    const encounter = {
      active: true,
      composure: c,
      maxComposure: c,
      round: 1,
      outcome: null,
      sceneId: SocialEncounterManager._sceneId(),
      // Dossier leverage — each card can be played once per encounter
      leverage: { desire: false, fear: false, weakness: false },
      updatedAt: Date.now(),
    };
    return SocialEncounterManager.setEncounter(actor, encounter);
  }

  /** Burn a leverage card (desire/fear/weakness) for this encounter. GM side. */
  static async markLeverageUsed(actor, type) {
    if (!actor || !["desire", "fear", "weakness"].includes(type)) return;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return;
    encounter.leverage = { desire: false, fear: false, weakness: false, ...encounter.leverage, [type]: true };
    encounter.updatedAt = Date.now();
    await SocialEncounterManager.setEncounter(actor, encounter);
  }

  static async endEncounter(actor) {
    if (!actor) return null;
    return SocialEncounterManager.setEncounter(actor, {
      ...SocialEncounterManager._emptyEncounter(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Lose (or recover) composure. `sourceId` is the OTHER side of the exchange —
   * if this breaks them, that side wins it.
   */
  static async adjustComposure(actor, delta, sourceId = null) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;
    encounter.composure = Math.min(Math.max((encounter.composure ?? 0) + delta, 0), encounter.maxComposure ?? 0);
    delete encounter.resolve; delete encounter.maxResolve;
    delete encounter.patience; delete encounter.maxPatience;
    encounter.updatedAt = Date.now();
    if (encounter.composure > 0) {
      await SocialEncounterManager.setEncounter(actor, encounter);
      return encounter;
    }
    // Broken — decide HOW they lose, then settle it.
    const { outcome, why } = await SocialEncounterManager._breakPoint(actor, sourceId);
    encounter.active  = false;
    encounter.outcome = outcome;
    await SocialEncounterManager.setEncounter(actor, encounter);
    await SocialEncounterManager._resolveConsequences(actor, sourceId, outcome, { why });
    return encounter;
  }

  /** Pre-2.0 names — both are just Composure now. */
  static async adjustResolve(actor, delta, sourceId = null)  { return SocialEncounterManager.adjustComposure(actor, delta, sourceId); }
  static async adjustPatience(actor, delta, sourceId = null) { return SocialEncounterManager.adjustComposure(actor, delta, sourceId); }

  /**
   * The moment composure breaks: give in ("swayed") or storm off ("walked")?
   * Someone Desperate for the WINNER can't walk away from them, and someone
   * Enthralled by the winner would never storm off from them — both only
   * toward that person; otherwise their nature decides ("When pressed"), or —
   * for a player character / "Decide each time" — a window.
   */
  static async _breakPoint(actor, sourceId) {
    const scope  = SocialArchetypeManager.getFlagScope();
    const winner = sourceId ? game.actors.get(sourceId) : null;
    const desp = SocialArchetypeManager.getActiveCondition(actor, "desperate");
    if (desp && winner && desp.flags?.[scope]?.sourceActorId === winner.id)
      return { outcome: "swayed", why: `Desperate — they can't bear to lose ${winner.name}` };
    const thrall = SocialArchetypeManager.getActiveCondition(actor, "smitten");
    if (thrall && winner && thrall.flags?.[scope]?.sourceActorId === winner.id)
      return { outcome: "swayed", why: `Enthralled — they'd never storm off from ${winner.name}` };
    const stance = SocialArchetypeManager.getStance(actor);
    if (stance === "yield") return { outcome: "swayed", why: null, stance };
    if (stance === "firm")  return { outcome: "walked", why: null, stance };
    return { outcome: await SocialEncounterManager.promptBreak(actor, winner), why: null, stance };
  }

  /** The window at the breaking point (a player, or an NPC set to decide each time). */
  static async promptBreak(actor, winner) {
    const esc = foundry.utils.escapeHTML;
    const who = winner ? esc(winner.name) : "the other side";
    return new Promise(resolve => {
      new Dialog({
        title: `${actor.name} — composure breaks`,
        content: `<div class="tsl-rollmods">
          <p><b>${esc(actor.name)}</b> can't hold out against ${who} any longer — this exchange is lost. How?</p>
          <p class="notes">Give in: concede the point, the bond toward ${who} deepens, and they take a String. Storm off: refuse — but carry a Grudge against ${who}, the bond cools, and they still take a String.</p>
        </div>`,
        buttons: {
          give:  { icon: '<i class="fas fa-handshake"></i>',   label: "Give in",    callback: () => resolve("swayed") },
          storm: { icon: '<i class="fas fa-door-open"></i>',   label: "Storm off",  callback: () => resolve("walked") },
        },
        default: "give",
        close: () => resolve("swayed"),
      }, typeof tslDialogOptions === "function" ? tslDialogOptions() : {}).render(true);
    });
  }

  /**
   * Everything that happens when composure breaks. GM side. `actor` is the one
   * who LOST; `sourceId` is the side that wins the exchange.
   *   swayed (gave in)    → the bond toward the winner deepens (type-aware), and
   *                         the winner gains a String — the concession is a hold.
   *   walked (stormed off) → the bond cools (type-aware), they carry a Grudge
   *                         against the winner, and the winner still gains a String.
   * Either way the WINNER's agenda (if the GM gave them one) advances.
   * States are NOT cleared — they carry their own durations and real combat
   * riders, so if the talk turns to blades they still bite.
   */
  static async _resolveConsequences(actor, sourceId, outcome, ctx = {}) {
    const winner = sourceId ? game.actors.get(sourceId) : null;
    let gainedString = false;
    let shift = null;
    let grudge = false;

    if (winner) {
      // The loser's bond toward the winner moves — type-aware: for an Enemy or
      // Rival it runs the other way (giving in eases the hostility, storming
      // off hardens it).
      shift = await TSLBondStore.shiftAfterExchange(actor.id, sourceId, outcome);
      gainedString = (await TSLStringStore.add(sourceId, actor.id, 1)) > 0;
      // Storming off has a price: the refusal festers into a Grudge.
      if (outcome === "walked" && typeof TSLConditionEffects !== "undefined") {
        await TSLConditionEffects.applyOne(actor, "spiteful", winner.name, winner.id);
        grudge = true;
      }
    }

    await SocialEncounterManager._announce(actor, outcome, { winner, gainedString, shift, grudge, why: ctx.why });
  }

  static async advanceRound(actor) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;
    encounter.round += 1;
    encounter.updatedAt = Date.now();
    await SocialEncounterManager.setEncounter(actor, encounter);
    return encounter;
  }

  /** Display label for a stored outcome id. */
  static outcomeLabel(outcome) {
    return outcome === "swayed" ? "Gave in" : outcome === "walked" ? "Stormed off" : "";
  }

  /** Hover text for a finished exchange — one wording for every surface. */
  static outcomeTip(outcome) {
    const over = " The exchange is over until the GM resets it (Chronicle → Fencing) or play moves to another scene.";
    return outcome === "swayed"
      ? `Gave in — their composure broke and they LOST the exchange: they concede the point / do what was asked (the GM frames it). Their bond toward the winner deepens; the winner gains a String on them.${over}`
      : `Stormed off — their composure broke and they LOST the exchange, but refused to concede: they carry a Grudge against the winner, their bond cools, and the winner gains a String on them.${over}`;
  }

  static async _announce(actor, outcome, opts = {}) {
    const esc  = foundry.utils.escapeHTML;
    const who  = opts.winner ? esc(opts.winner.name) : "the other side";
    // HOW they leave depends on their ruling triad — the hook for what comes next
    const arch = SocialArchetypeManager.getArchetype(actor);
    const exitFlavor = {
      power:     "They take it as disrespect — expect them to answer later, from a position of force.",
      attention: "They leave wounded and loud; everyone in their orbit will hear their version first.",
      order:     "They close the ledger on this conversation — it will not reopen on the same terms.",
    }[arch?.triad] ?? "";
    const winnerAgenda = opts.winner
      ? SocialArchetypeManager.getCharacterNotes(opts.winner).intent?.trim()
      : "";

    // How the bond moved (type-aware: an Enemy/Rival bond runs the other way)
    const typeLabel = opts.shift?.type ? SocialArchetypeManager.getBondType(opts.shift.type).label : null;
    const bondLine = !opts.winner ? null
      : opts.shift?.hostile
        ? (opts.shift.delta < 0
            ? `Their hostility toward ${who} eases (${esc(typeLabel)}) — <strong>strength −1</strong>: they had to listen.`
            : `Their hostility toward ${who} hardens (${esc(typeLabel)}) — <strong>strength +1</strong>.`)
        : (outcome === "swayed"
            ? `The bond toward ${who} deepens — <strong>strength +1</strong>.`
            : `The bond toward ${who} cools — <strong>strength −1</strong>.`);

    const bullets = outcome === "swayed"
      ? [
          `Their composure breaks — they <strong>give in</strong>: they do the thing, or grant the point (the GM frames exactly what).${opts.why ? ` <i>(${esc(opts.why)})</i>` : ""}`,
          bondLine,
          opts.gainedString ? `${who} gains a <strong>String</strong> on them — the concession is a hold to invoke later.` : null,
          winnerAgenda ? `${who} gets what they came for — <strong>their agenda advances</strong> (GM: see their Profile).` : null,
          `Any states on them <strong>linger</strong> — if this turns to a fight, they still bite.`,
        ].filter(Boolean)
      : [
          `Their composure breaks — but they <strong>storm off</strong> rather than concede. They lose the exchange; they grant nothing.`,
          opts.grudge ? `They carry a <strong>Grudge</strong> against ${who} — the refusal festers.` : null,
          bondLine,
          opts.gainedString ? `${who} saw them crack — <strong>a String</strong> on them.` : null,
          winnerAgenda ? `${who} holds the field — <strong>their agenda advances</strong> (GM: see their Profile).` : null,
          exitFlavor ? esc(exitFlavor) : null,
          `Any states on them <strong>linger</strong> — if this turns to a fight, they still bite.`,
        ].filter(Boolean);

    const cls = outcome === "swayed" ? "success" : "immune";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--${cls}">
        <div class="tsl-mv-header"><i class="fas ${outcome === "swayed" ? "fa-handshake" : "fa-door-open"}"></i>
          <span class="tsl-mv-name">${esc(actor.name)} — ${outcome === "swayed" ? "Gives in" : "Storms off"}</span></div>
        <ul class="tsl-mv-consequences">${bullets.map(b => `<li>${b}</li>`).join("")}</ul>
      </div>`,
    });
  }
}
