/**
 * tsl-social-conflict | social-encounter.js
 *
 * Tracks social encounter resources, storing world-synced state on Actor flags.
 *
 * Two opposing tracks give Social Fencing its push-your-luck tension:
 *   Resolve  — the target's will. Successful maneuvers chip it away;
 *              at 0 the target is SWAYED (you win the exchange).
 *   Patience — the target's tolerance. Failures and triggered immunities
 *              burn it; at 0 the target WALKS AWAY (scene ends against you).
 */

console.log("TSL | Loading social-encounter.js...");

class SocialEncounterManager {
  static getFlagScope() {
    return SOCIAL_FENCING_SCOPE;
  }

  static getEncounter(actor) {
    return actor?.getFlag(SocialEncounterManager.getFlagScope(), "encounter") ?? {
      active: false,
      patience: 0,
      maxPatience: 0,
      resolve: 0,
      maxResolve: 0,
      round: 0,
      outcome: null,
    };
  }

  static async setEncounter(actor, payload) {
    if (!actor) return;
    await actor.setFlag(SocialEncounterManager.getFlagScope(), "encounter", payload);
    return payload;
  }

  /**
   * Suggested track values derived from the actor's sheet (dnd5e/a5e):
   *   Resolve  = 3 + WIS mod — in 5e resisting persuasion IS a Wisdom thing.
   *              Clamped 3..6 so TWO strong combos break even the toughest:
   *              a cashed damage combo (e.g. Taunt→Humiliate = 3) twice = 6.
   *   Patience = 4 + CHA mod — force of personality keeps composure. 3..7.
   * Used for the automatic start on the first maneuver; the GM can still nudge.
   */
  static suggestTracks(actor) {
    const abilities = actor?.system?.abilities ?? {};
    const mod = (k) => {
      const v = abilities[k]?.mod;
      return typeof v === "number" ? v : 0;
    };
    const clampR = (v) => Math.max(3, Math.min(6, v));
    const clampP = (v) => Math.max(3, Math.min(7, v));
    return {
      resolve:  clampR(3 + mod("wis")),
      patience: clampP(4 + mod("cha")),
      hint: `Resolve 3 + WIS (${mod("wis") >= 0 ? "+" : ""}${mod("wis")}, cap 6 → 2 combos break it), Patience 4 + CHA (${mod("cha") >= 0 ? "+" : ""}${mod("cha")}, cap 7)`,
    };
  }

  /**
   * Ensure a target has live tracks before a maneuver lands — no "Start
   * Encounter" ceremony. Auto-starts from sheet defaults on the first
   * maneuver, unless a prior exchange already resolved (has an outcome).
   */
  static async ensureActive(actor) {
    if (!actor) return null;
    const enc = SocialEncounterManager.getEncounter(actor);
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
      active: false,
      patience: 0,
      maxPatience: 0,
      resolve: 0,
      maxResolve: 0,
      round: 0,
      outcome: null,
      updatedAt: Date.now(),
    });
  }

  static async adjustPatience(actor, delta, sourceId = null) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;

    encounter.patience = Math.min(Math.max(encounter.patience + delta, 0), encounter.maxPatience);
    encounter.updatedAt = Date.now();
    if (encounter.patience === 0) {
      encounter.active = false;
      encounter.outcome = "walked";
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
   * Everything that happens the moment a track empties. GM side.
   *   swayed  → the loser's regard for the winner warms (+1); the winner
   *             gains a String — the concession is a hold to invoke later;
   *             the scene's fencing statuses clear.
   *   walked  → regard cools (−1); statuses clear; a triad-flavored exit.
   */
  static async _resolveConsequences(actor, sourceId, outcome) {
    let gainedString = false;
    let tookString   = false;
    const winner = sourceId ? game.actors.get(sourceId) : null;

    if (outcome === "swayed" && winner) {
      await TSLBondStore.shiftAttitude(actor.id, sourceId, +1);
      await TSLStringStore.add(sourceId, actor.id, 1);
      gainedString = true;
    } else if (outcome === "walked" && winner) {
      await TSLBondStore.shiftAttitude(actor.id, sourceId, -1);
      // Walking away is not a draw: they spent this whole exchange READING
      // you while you failed to land — they leave holding a String on you.
      await TSLStringStore.add(actor.id, sourceId, 1);
      tookString = true;
    }

    // The exchange is over — clear the scene's fencing statuses on the loser
    for (const id of SOCIAL_CONDITION_ORDER) {
      await SocialArchetypeManager.removeCondition(actor, id);
    }

    await SocialEncounterManager._announce(actor, outcome, { winner, gainedString, tookString });
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

  static async _announce(actor, outcome, opts = {}) {
    const esc  = foundry.utils.escapeHTML;
    const who  = opts.winner ? esc(opts.winner.name) : "the winner";
    // Frenzy-flavored exits: HOW they break depends on their ruling triad
    const arch = SocialArchetypeManager.getArchetype(actor);
    const walkFlavor = {
      power:     "The failed play reads as disrespect — expect them to answer from a position of force.",
      attention: "They leave wounded and loud; everyone in their orbit will hear their version first.",
      order:     "They close the ledger on this conversation — it will not reopen on the same terms.",
    }[arch?.triad] ?? "";

    const bullets = outcome === "swayed"
      ? [
          `They <strong>concede the exchange</strong> — they do the thing, or grant the point (the GM frames exactly what).`,
          `The bond toward ${who} deepens — <strong>strength +1</strong>.`,
          opts.gainedString ? `${who} gains a <strong>String</strong> on them — the concession is a hold to invoke later.` : null,
          `The scene's fencing statuses on them clear.`,
        ].filter(Boolean)
      : [
          `They <strong>disengage</strong> — this conversation is over on their terms.`,
          `The bond toward ${who} cools — <strong>strength −1</strong>.`,
          opts.tookString ? `They spent the whole exchange reading ${who} — <strong>they gain a String</strong> on them.` : null,
          SocialArchetypeManager.getCharacterNotes(actor).intent?.trim()
            ? `They leave with what they came for — <strong>their agenda advances</strong> (GM: see their Profile).`
            : null,
          walkFlavor ? esc(walkFlavor) : null,
          `The scene's fencing statuses on them clear.`,
        ].filter(Boolean);

    const cls = outcome === "swayed" ? "success" : "immune";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--${cls}">
        <div class="tsl-mv-header"><i class="fas ${outcome === "swayed" ? "fa-heart-crack" : "fa-door-open"}"></i>
          <span class="tsl-mv-name">${esc(actor.name)} — ${outcome === "swayed" ? "Swayed" : "Walks away"}</span></div>
        <ul class="tsl-mv-consequences">${bullets.map(b => `<li>${b}</li>`).join("")}</ul>
      </div>`,
    });
  }
}
