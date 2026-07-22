/**
 * tsl-social-conflict | condition-effects.js
 *
 * Applies TSL conflict conditions as Active Effects on actors after a conflict ends.
 * Effects are removed on Short Rest (or Long Rest).
 * A5E: each condition also adds +1 Strife.
 */

console.log("TSL | Loading condition-effects.js...");

const TSL_EFFECT_FLAG = "tsl-social-conflict";

// Wounds are the lasting emotional layer, and — VtM-style — they PUSH the one
// who carries them. Each has:
//   `urge`   — the Compulsion: what it drives you to do (the roleplay prompt).
//   `resist` — the Willpower tax: acting AGAINST the urge is at disadvantage
//              unless you spend a String to steel yourself (like exerting
//              Willpower to override the Beast).
//   `leanIn` — the refuel: give in to the urge at real cost and you gain a
//              thread (a String on the person it ties you to) — playing your
//              nature pays, exactly as acting on Convictions restores Willpower.
//   `frenzy` — the breaking point: carry it and get pushed again (or hit
//              Overwhelmed) and you lose the leash for one beat; the GM plays it.
//   `clears` — the DRAMATIC action that lifts it (feelings are lived out, not
//              slept off). A long rest is the slow fallback; short rests don't.
const CONDITION_META = {
  smitten: {
    label:  "Smitten",
    icon:   "icons/svg/regen.svg",
    urge:   "Please {source}. Be near them. Earn the look you ache for.",
    resist: "Any roll to oppose, leave, deny, or harm {source} is at disadvantage — spend a String to break the spell for one beat.",
    leanIn: "Bend your plans to be near {source} or win their favour, at real cost → take a String on them.",
    frenzy: "Pushed again while Smitten (or Overwhelmed): you obey — take one reasonable wish of {source}'s as if it were your own.",
    clears: "Confess it — to them, or out loud to someone else — or let them break your heart.",
  },
  angry: {
    label:  "Angry",
    icon:   "icons/svg/fire.svg",
    urge:   "Escalate. Strike. Make them feel what you feel — cold words won't do.",
    resist: "Any roll to stay measured, de-escalate, or show restraint is at disadvantage — spend a String to bite your tongue.",
    leanIn: "Let the anger drive you into something rash or cruel → take a String on whoever lit the fuse.",
    frenzy: "Pushed again while Angry (or Overwhelmed): the leash slips — you lash out, and the GM plays the moment.",
    clears: "Vent it: break something, start the fight, or finally say the words you've been swallowing.",
  },
  scared: {
    label:  "Scared",
    icon:   "icons/svg/terror.svg",
    urge:   "Get away. Give ground. Anything to make the threat stop.",
    resist: "Any roll to hold your ground, advance, or face {source} is at disadvantage — spend a String to steel yourself.",
    leanIn: "Let fear pull you into flight or a bad concession → take a String on the source of your fear.",
    frenzy: "Pushed again while Scared (or Overwhelmed): you break — you flee or freeze, and the GM plays it.",
    clears: "Flee the source and catch your breath somewhere safe — or face it with an ally at your side.",
  },
  guilty: {
    label:  "Guilty",
    icon:   "icons/svg/net.svg",
    urge:   "Make it right. You owe {source}, and it shows in every word.",
    resist: "Any roll to deceive, deny, or press {source} is at disadvantage — spend a String to look them in the eye and lie.",
    leanIn: "Let the guilt move you to confess or over-give to {source}, at cost → take a String on them.",
    frenzy: "Pushed again while Guilty (or Overwhelmed): it spills — you admit the thing you've been hiding.",
    clears: "Confess, or make real amends to the one you wronged.",
  },
  hopeless: {
    label:  "Hopeless",
    icon:   "icons/svg/degen.svg",
    urge:   "Why bother. Let it go. Nothing you do will matter now.",
    resist: "Any roll driven by hope, ambition, or standing up for yourself is at disadvantage — spend a String to find one reason to try.",
    leanIn: "Let despair make you give up or accept the worst, at cost → gain Inspiration (a fumble of the soul that feeds the story).",
    frenzy: "Pushed again while Hopeless (or Overwhelmed): you stop — you yield, sink, or walk away from what mattered.",
    clears: "You cannot clear this alone — someone must rekindle you: comfort, an embrace, a speech that lands.",
  },
};

// Spells/abilities that clear TSL conditions from their targets
const CLEARING_SPELLS = {
  "calm emotions":       ["smitten", "angry", "scared"],
  "greater restoration": ["smitten", "angry", "scared", "guilty", "hopeless"],
  "remove curse":        ["guilty", "hopeless"],
  "heroism":             ["scared"],
};

class TSLConditionEffects {

  /** The VtM-style dossier for a wound (urge / resist / leanIn / frenzy / clears). */
  static getMeta(condId) {
    return CONDITION_META[condId] ?? null;
  }

  /**
   * Called when a conflict resolves.
   * For each participant, applies their active conditions as Active Effects
   * with the opponent's name as context.
   */
  static async applyFromConflict(state) {
    const ps = state.participants;
    for (let i = 0; i < ps.length; i++) {
      const sourceName = ps.length === 2 ? ps[1 - i].name : "Social Conflict";
      await TSLConditionEffects._applyToParticipant(ps[i], sourceName);
    }
  }

  /** Apply conditions for a single participant who yielded mid-conflict. */
  static async applyYieldingParticipant(participant, state) {
    const others = state.participants.filter(p => p.actorId !== participant.actorId);
    const sourceName = others.length === 1 ? others[0].name : "Social Conflict";
    await TSLConditionEffects._applyToParticipant(participant, sourceName);
  }

  static async _applyToParticipant(participant, sourceName) {
    const actor = game.actors.get(participant.actorId);
    if (!actor) return;

    const activeConditions = Object.entries(participant.conditions)
      .filter(([_, on]) => on)
      .map(([id]) => id);

    if (!activeConditions.length) return;

    const effects = activeConditions.map(condId =>
      TSLConditionEffects._buildEffect(condId, sourceName, participant.actorId)
    );

    await actor.createEmbeddedDocuments("ActiveEffect", effects);

    // A5E: add Strife for each condition
    if (game.system.id === "a5e-for-dnd5e") {
      const currentStrife = actor.system?.attributes?.strife?.value ?? 0;
      await actor.update({
        "system.attributes.strife.value": currentStrife + activeConditions.length
      });
    }

    ui.notifications.info(
      `${participant.name} carries ${activeConditions.length} condition(s) from the conflict.`
    );
  }

  /**
   * Apply ONE TSL condition to an actor outside a conflict window — used by
   * "Hold the Line" (refusing a maneuver's effect at an emotional cost).
   * Skips silently if the same condition is already carried.
   * Returns how many TSL conditions the actor now carries (4+ = Overwhelmed).
   */
  static async applyOne(actor, condId, sourceName = "Social Fencing") {
    if (!actor || !CONDITION_META[condId]) return 0;
    const has = actor.effects.some(e => e.flags?.[TSL_EFFECT_FLAG]?.condition === condId);
    if (!has) {
      await actor.createEmbeddedDocuments("ActiveEffect", [
        TSLConditionEffects._buildEffect(condId, sourceName, actor.id),
      ]);
    }
    return TSLConditionEffects.countConditions(actor);
  }

  /** Does this actor carry a given TSL condition (actor-level effect)? */
  static hasCondition(actor, condId) {
    return !!actor?.effects?.some?.(e =>
      !e.disabled && e.flags?.[TSL_EFFECT_FLAG]?.condition === condId);
  }

  /** How many TSL conditions this actor carries (Overwhelmed at 4+). */
  static countConditions(actor) {
    if (!actor) return 0;
    const seen = new Set();
    for (const e of actor.effects) {
      const c = e.flags?.[TSL_EFFECT_FLAG]?.condition;
      if (c && CONDITION_META[c]) seen.add(c);
    }
    return seen.size;
  }

  static _buildEffect(condId, sourceName, _actorId) {
    const meta = CONDITION_META[condId];
    const sub  = (s) => (s ?? "").replace("{source}", sourceName);

    // A VtM-style dossier the carrier actually feels: the urge, the price of
    // fighting it, the reward for giving in, and the point it takes the wheel.
    const description = [
      `<b>Urge:</b> ${sub(meta.urge)}`,
      `<b>Fight it:</b> ${sub(meta.resist)}`,
      `<b>Give in:</b> ${sub(meta.leanIn)}`,
      `<b>Breaking point:</b> ${sub(meta.frenzy)}`,
      `<b>Clears when:</b> ${meta.clears} (Or a long rest — time dulls everything.)`,
    ].join("<br>");

    return {
      name:   `${meta.label} (by ${sourceName})`,
      icon:   meta.icon,
      origin: "tsl-social-conflict",
      description,
      flags: {
        [TSL_EFFECT_FLAG]: {
          condition: condId,
          source:    sourceName,
          restType:  "short",
        }
      },
      // No changes array — purely informational, player applies disadvantage manually
      changes: [],
    };
  }

  // ── Rest hooks ────────────────────────────────────────────────────────────────

  static registerRestHooks() {
    // TSL-style: feelings do not clear on a SHORT rest — they clear when
    // lived out (the "Clears when" line) or, slowly, over a long rest.
    // dnd5e
    Hooks.on("dnd5e.restCompleted", (actor, result) => {
      if (result.longRest) {
        TSLConditionEffects._clearFromActor(actor);
      }
    });

    // A5E
    Hooks.on("a5e.actorRest", (actor, result) => {
      if (result?.restType === "long") {
        TSLConditionEffects._clearFromActor(actor);
        // A5E handles strife reduction itself on rest — no extra work needed
      }
    });
  }

  static async _clearFromActor(actor) {
    const toDelete = actor.effects
      .filter(e => e.flags?.[TSL_EFFECT_FLAG]?.restType === "short")
      .map(e => e.id);

    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    }
  }

  // ── Spell/ability clearing ────────────────────────────────────────────────────

  static registerSpellHooks() {
    // dnd5e
    Hooks.on("dnd5e.useItem", (item, config, options) => {
      const spellName = item.name?.toLowerCase();
      const condsToClear = CLEARING_SPELLS[spellName];
      if (!condsToClear) return;

      // Clear from all targeted tokens
      for (const target of game.user.targets) {
        const actor = target.actor;
        if (!actor) continue;
        TSLConditionEffects._clearConditions(actor, condsToClear);
      }
    });

    // A5E
    Hooks.on("a5e.itemActivated", (item, activationData) => {
      const spellName = item.name?.toLowerCase();
      const condsToClear = CLEARING_SPELLS[spellName];
      if (!condsToClear) return;

      for (const target of game.user.targets) {
        const actor = target.actor;
        if (!actor) continue;
        TSLConditionEffects._clearConditions(actor, condsToClear);
      }
    });
  }

  static async _clearConditions(actor, conditionIds) {
    const toDelete = actor.effects
      .filter(e => {
        const flag = e.flags?.[TSL_EFFECT_FLAG]?.condition;
        return flag && conditionIds.includes(flag);
      })
      .map(e => e.id);

    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    }
  }
}
