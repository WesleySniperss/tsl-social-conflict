/**
 * tsl-social-conflict | condition-effects.js
 *
 * Applies TSL conflict conditions as Active Effects on actors after a conflict ends.
 * Effects are removed on Short Rest (or Long Rest).
 * A5E: each condition also adds +1 Strife.
 */

console.log("TSL | Loading condition-effects.js...");

const TSL_EFFECT_FLAG = "tsl-social-conflict";

// Icons are core Foundry status icons (icons/svg/*) — present in every install.
// `clears` — the DRAMATIC action that lifts the condition (TSL-style): feelings
// are not cured by a nap, they're cured by living them out. A long rest still
// works as the slow fallback; short rests do NOT touch them.
const CONDITION_META = {
  smitten: {
    label:  "Smitten",
    icon:   "icons/svg/regen.svg",
    hint:   "Disadvantage on attacks against {source}. Their Persuasion checks against you have advantage.",
    clears: "Confess it — to them, or out loud to someone else — or let them break your heart.",
  },
  angry: {
    label:  "Angry",
    icon:   "icons/svg/fire.svg",
    hint:   "Disadvantage on Wisdom checks. Must target {source} when attacking if possible.",
    clears: "Vent it: break something, start the fight, or finally say the words you've been swallowing.",
  },
  scared: {
    label:  "Scared",
    icon:   "icons/svg/terror.svg",
    hint:   "Frightened of {source}. Disadvantage on checks while they are visible.",
    clears: "Flee the source and catch your breath somewhere safe — or face it with an ally at your side.",
  },
  guilty: {
    label:  "Guilty",
    icon:   "icons/svg/net.svg",
    hint:   "Disadvantage on Insight against {source}. Cannot use Help to assist them.",
    clears: "Confess, or make real amends to the one you wronged.",
  },
  hopeless: {
    label:  "Hopeless",
    icon:   "icons/svg/degen.svg",
    hint:   "Disadvantage on death saving throws. Cannot benefit from Inspiration.",
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
    const hint = meta.hint.replace("{source}", sourceName);

    return {
      name:   `${meta.label} (by ${sourceName})`,
      icon:   meta.icon,
      origin: "tsl-social-conflict",
      description: `${hint}<br><b>Clears when:</b> ${meta.clears} (Or a long rest — time dulls everything.)`,
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
