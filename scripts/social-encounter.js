/**
 * tsl-social-conflict | social-encounter.js
 *
 * Tracks social encounter resources, storing world-synced state on Actor flags.
 *
 * EVERY side of an exchange carries the same two tracks (v1.80):
 *   Resolve  — your will. Landed maneuvers chip it; at 0 you are SWAYED:
 *              you concede the exchange (the big loss).
 *   Patience — your composure. YOUR OWN misses spend it, and so does every
 *              parry you make; at 0 you BREAK OFF: you lose your footing and
 *              leave the exchange (a lesser loss — no concession, but the
 *              other side takes a String on you).
 * So pressing costs you (a miss spends your composure) and defending costs
 * you (a parry spends it too) — nobody wins by simply parrying everything.
 *
 * An exchange belongs to the scene it started in: once it resolves, the two
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
      patience: 0,
      maxPatience: 0,
      resolve: 0,
      maxResolve: 0,
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
    return enc;
  }

  /** Has this actor's exchange ended (swayed or broke off) in the current scene? */
  static isResolved(actor) {
    return !!SocialEncounterManager.getEncounter(actor).outcome;
  }

  static async setEncounter(actor, payload) {
    if (!actor) return;
    await actor.setFlag(SocialEncounterManager.getFlagScope(), "encounter", payload);
    return payload;
  }

  /**
   * Suggested track values derived from the actor's sheet (dnd5e/a5e):
   *   Resolve  = CHA mod (floor 1) — force of personality: the will to not
   *              concede. Kept low on purpose: a mook (~1) folds in one hit, a
   *              boss (~5-6) breaks in ~2 heavy finishers. The real damage comes
   *              from the maneuver SCHOOL (General 1 / archetype 2 / Humiliate 3),
   *              not from a stuffy HP tank.
   *   Patience = WIS + CHA mod (floor 2) — composure + social poise: how many
   *              misses and parries you can afford before you break off.
   * (No single stat triple-dips: DC = WIS + INT, Resolve = CHA,
   *  Patience = WIS + CHA.)
   * GM can still nudge either track in the Chronicle.
   */
  static suggestTracks(actor) {
    const abilities = actor?.system?.abilities ?? {};
    const mod = (k) => {
      const v = abilities[k]?.mod;
      return typeof v === "number" ? v : 0;
    };
    const cha = mod("cha"), wis = mod("wis");
    return {
      resolve:  Math.max(1, cha),
      patience: Math.max(2, wis + cha),
      hint: `Resolve CHA (${cha >= 0 ? "+" : ""}${cha}, floor 1), Patience WIS+CHA (${wis + cha >= 0 ? "+" : ""}${wis + cha}, floor 2)`,
    };
  }

  /**
   * Ensure an actor has live tracks before a maneuver touches them — no
   * "Start Encounter" ceremony. Auto-starts from sheet defaults on the first
   * maneuver (for BOTH sides), unless an exchange in this scene already
   * resolved. An exchange left over from another scene restarts fresh.
   */
  static async ensureActive(actor) {
    if (!actor) return null;
    const enc = SocialEncounterManager.getEncounter(actor);   // stale → empty
    if (enc.active || enc.outcome) return enc;
    const s = SocialEncounterManager.suggestTracks(actor);
    return SocialEncounterManager.startEncounter(actor, s.patience, s.resolve);
  }

  static async startEncounter(actor, patience = 4, resolve = 3) {
    if (!actor) return null;
    const encounter = {
      active: true,
      patience,
      maxPatience: patience,
      resolve,
      maxResolve: resolve,
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
   * Spend or restore composure. `sourceId` is the OTHER side of the exchange —
   * if this empties the track, they are the one who wins it.
   */
  static async adjustPatience(actor, delta, sourceId = null) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;

    encounter.patience = Math.min(Math.max(encounter.patience + delta, 0), encounter.maxPatience);
    encounter.updatedAt = Date.now();
    if (encounter.patience === 0) {
      encounter.active = false;
      encounter.outcome = "walked";   // stored id kept for old saves; shown as "broke off"
      await SocialEncounterManager.setEncounter(actor, encounter);
      await SocialEncounterManager._resolveConsequences(actor, sourceId, "walked");
      return encounter;
    }
    await SocialEncounterManager.setEncounter(actor, encounter);
    return encounter;
  }

  static async adjustResolve(actor, delta, sourceId = null) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;

    encounter.resolve = Math.min(Math.max(encounter.resolve + delta, 0), encounter.maxResolve);
    encounter.updatedAt = Date.now();
    if (encounter.resolve === 0) {
      encounter.active = false;
      encounter.outcome = "swayed";
      await SocialEncounterManager.setEncounter(actor, encounter);
      await SocialEncounterManager._resolveConsequences(actor, sourceId, "swayed");
      return encounter;
    }
    await SocialEncounterManager.setEncounter(actor, encounter);
    return encounter;
  }

  /**
   * Everything that happens the moment a track empties. GM side. `actor` is
   * the one who LOST; `sourceId` is the side that wins the exchange.
   *   swayed     → they concede; their bond toward the winner deepens (+1);
   *                the winner gains a String — the concession is a hold.
   *   walked     → (shown as "broke off") they lost their composure and left;
   *                no concession, but the bond cools (−1) and the winner gains
   *                a String on them.
   * Either way the WINNER's agenda (if the GM gave them one) advances.
   * NOTE: fencing statuses are NOT cleared here — they carry their own
   * durations and REAL combat riders, so if the talk turns to blades they must
   * still bite. They expire on their own (scene/rounds) or the GM clears them.
   */
  static async _resolveConsequences(actor, sourceId, outcome) {
    const winner = sourceId ? game.actors.get(sourceId) : null;
    let gainedString = false;
    let shift = null;

    if (winner) {
      // The loser's bond toward the winner moves — type-aware: for an Enemy or
      // Rival it runs the other way (swayed eases the hostility, broke off
      // hardens it).
      shift = await TSLBondStore.shiftAfterExchange(actor.id, sourceId, outcome);
      gainedString = (await TSLStringStore.add(sourceId, actor.id, 1)) > 0;
    }

    await SocialEncounterManager._announce(actor, outcome, { winner, gainedString, shift });
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

  /** Display label for a stored outcome id ("walked" is shown as "Broke off"). */
  static outcomeLabel(outcome) {
    return outcome === "swayed" ? "Swayed" : outcome === "walked" ? "Broke off" : "";
  }

  /** Hover text for a finished exchange — one wording for every surface. */
  static outcomeTip(outcome) {
    const over = " The exchange is over until the GM resets it (Chronicle → Fencing) or play moves to another scene.";
    return outcome === "swayed"
      ? `Swayed — their Resolve hit 0: they LOST the exchange and concede the point / do what was asked (the GM frames it). Their bond toward the winner deepens +1; the winner gains a String on them.${over}`
      : `Broke off — their Patience (composure) hit 0, spent on their own misses and parries: they LOST the exchange and left it. No concession, but their bond toward the winner cools −1 and the winner gains a String on them.${over}`;
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
          `They <strong>concede the exchange</strong> — they do the thing, or grant the point (the GM frames exactly what).`,
          bondLine,
          opts.gainedString ? `${who} gains a <strong>String</strong> on them — the concession is a hold to invoke later.` : null,
          winnerAgenda ? `${who} gets what they came for — <strong>their agenda advances</strong> (GM: see their Profile).` : null,
          `Any fencing statuses on them <strong>linger</strong> — if this turns to a fight, they still bite.`,
        ].filter(Boolean)
      : [
          `Their composure runs out — they <strong>break off</strong>. No concession, but they leave the field to ${who}.`,
          bondLine,
          opts.gainedString ? `${who} saw them crack — <strong>a String</strong> on them.` : null,
          winnerAgenda ? `${who} holds the field — <strong>their agenda advances</strong> (GM: see their Profile).` : null,
          exitFlavor ? esc(exitFlavor) : null,
          `Any fencing statuses on them <strong>linger</strong> — if this turns to a fight, they still bite.`,
        ].filter(Boolean);

    const cls = outcome === "swayed" ? "success" : "immune";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--${cls}">
        <div class="tsl-mv-header"><i class="fas ${outcome === "swayed" ? "fa-heart-crack" : "fa-door-open"}"></i>
          <span class="tsl-mv-name">${esc(actor.name)} — ${outcome === "swayed" ? "Swayed" : "Breaks off"}</span></div>
        <ul class="tsl-mv-consequences">${bullets.map(b => `<li>${b}</li>`).join("")}</ul>
      </div>`,
    });
  }
}
