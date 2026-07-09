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
   *   Resolve  = 2 + WIS mod — in 5e resisting persuasion IS a Wisdom thing
   *   Patience = 3 + CHA mod — force of personality keeps composure in talk
   * Both clamped 2..6; the GM can always override in the Chronicle.
   */
  static suggestTracks(actor) {
    const abilities = actor?.system?.abilities ?? {};
    const mod = (k) => {
      const v = abilities[k]?.mod;
      return typeof v === "number" ? v : 0;
    };
    const clamp = (v) => Math.max(2, Math.min(6, v));
    return {
      resolve:  clamp(2 + mod("wis")),
      patience: clamp(3 + mod("cha")),
      hint: `Resolve 2 + WIS (${mod("wis") >= 0 ? "+" : ""}${mod("wis")}), Patience 3 + CHA (${mod("cha") >= 0 ? "+" : ""}${mod("cha")}), clamped 2–6`,
    };
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

  static async adjustPatience(actor, delta) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;

    encounter.patience = Math.min(Math.max(encounter.patience + delta, 0), encounter.maxPatience);
    encounter.updatedAt = Date.now();
    if (encounter.patience === 0) {
      encounter.active = false;
      encounter.outcome = "walked";
      SocialEncounterManager._announce(actor, "walked");
    }
    await SocialEncounterManager.setEncounter(actor, encounter);
    return encounter;
  }

  static async adjustResolve(actor, delta) {
    if (!actor) return null;
    const encounter = SocialEncounterManager.getEncounter(actor);
    if (!encounter.active) return encounter;

    encounter.resolve = Math.min(Math.max(encounter.resolve + delta, 0), encounter.maxResolve);
    encounter.updatedAt = Date.now();
    if (encounter.resolve === 0) {
      encounter.active = false;
      encounter.outcome = "swayed";
      SocialEncounterManager._announce(actor, "swayed");
    }
    await SocialEncounterManager.setEncounter(actor, encounter);
    return encounter;
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

  static async _announce(actor, outcome) {
    const esc  = foundry.utils.escapeHTML;
    // Frenzy-flavored exits: HOW they break depends on their ruling triad
    const arch = SocialArchetypeManager.getArchetype(actor);
    const walkFlavor = {
      power:     "The failed play reads as disrespect — expect them to answer from a position of force.",
      attention: "They leave wounded and loud; everyone in their orbit will hear their version first.",
      order:     "They close the ledger on this conversation — it will not reopen on the same terms.",
    }[arch?.triad] ?? "";

    const text = outcome === "swayed"
      ? `<strong>${esc(actor.name)}</strong> is <em>swayed</em> — their resolve is broken. They concede the exchange, and their regard for the winner warms (attitude +1).`
      : `<strong>${esc(actor.name)}</strong> runs out of patience and <em>walks away</em> (attitude −1). ${esc(walkFlavor)}`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-maneuver-card tsl-mv--${outcome === "swayed" ? "success" : "immune"}">
        <div class="tsl-mv-outcome tsl-mv-outcome--${outcome === "swayed" ? "success" : "immune"}">${text}</div>
      </div>`,
    });
  }
}
