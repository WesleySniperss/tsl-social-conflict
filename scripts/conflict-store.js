/**
 * tsl-social-conflict | conflict-store.js
 *
 * Centralised, reactive state for one conflict session.
 * GM owns the state — players receive updates via socket.
 */

console.log("TSL | Loading conflict-store.js...");

const PARTICIPANT_COLORS = [
  "#e8557a", "#9b6ee8", "#55b8e8", "#e8a855", "#55e885", "#e87855",
];

const CONDITIONS = [
  { id: "smitten",  label: "Smitten",  color: "#e8557a" },
  { id: "angry",    label: "Angry",    color: "#e85555" },
  { id: "scared",   label: "Scared",   color: "#9b6ee8" },
  { id: "guilty",   label: "Guilty",   color: "#e8a855" },
  { id: "hopeless", label: "Hopeless", color: "#5588e8" },
];

const MOVES = [
  {
    id: "speak",
    name: "Speak from the Heart",
    icon: "fa-comment-dots",
    stat: "Passion",
    target: true,
    desc: "On 10+: they must act on it or gain a Condition; if their tracks are running, sincerity chips 1 Resolve. On 7-9: they act on it but you gain a Condition — and they gain a String on you.",
    onStrong: { resolve: 1 },
    onWeak:   { stringsOnYou: 1 },
  },
  {
    id: "support",
    name: "Emotional Support",
    icon: "fa-hand-holding-heart",
    stat: "Grace",
    target: true,
    desc: "On 10+: clear one of their Conditions (your choice). On 7-9: they clear one Condition (their choice).",
  },
  {
    id: "read",
    name: "Read the Room",
    icon: "fa-eye",
    stat: "Wit",
    target: true,
    desc: "Study someone. On 10+: ask the GM two questions, gain a String on them, and a tell of their nature is whispered to you. On 7-9: ask one question.",
    onStrong: { strings: 1, reveal: true },
  },
  {
    id: "provoke",
    name: "Provoke",
    icon: "fa-fire",
    stat: "Nerve",
    target: true,
    desc: "On 10+: they act rashly, you gain +1 forward; if their tracks are running, the outburst chips 1 Resolve. On 7-9: they act rashly but so do you.",
    onStrong: { resolve: 1 },
  },
  {
    id: "inspire",
    name: "Inspire",
    icon: "fa-sun",
    stat: "Spirit",
    target: false,
    desc: "On 10+: clear one of your own Conditions and gain +1 forward. On 7-9: clear a Condition.",
  },
  {
    id: "kiss",
    name: "Finally Kiss",
    icon: "fa-heart",
    stat: null,
    target: true,
    desc: "Both agree. Both gain +1 ongoing for the rest of the scene. The conflict ends.",
    special: true,
  },
];

/**
 * A single participant in the conflict.
 * @typedef {Object} Participant
 * @property {string}   tokenId
 * @property {string}   actorId
 * @property {string}   name
 * @property {string}   img         - token image URL
 * @property {string}   color       - accent color (player color)
 * @property {Object[]} stats       - [{ name, value, source }]
 * @property {Object}   conditions  - { smitten: false, angry: false, ... }
 */

/**
 * Full conflict state.
 * @typedef {Object} ConflictState
 * @property {boolean}        active
 * @property {Participant[]}  participants  - 2 or more; shrinks as participants yield or kiss
 * @property {number}         turn          - index into participants (wraps on removal)
 * @property {Object[]}       log           - [{ text, type }]
 * @property {boolean}        resolved
 * @property {string|null}    resolution    - "kiss" | "yield_0" | "yield_1" | null
 */

function emptyConditions() {
  return Object.fromEntries(CONDITIONS.map(c => [c.id, false]));
}

class ConflictStore {
  /** @type {ConflictState} */
  static state = null;

  /** Listeners registered by the UI */
  static _listeners = new Set();

  /**
   * Initialise a fresh conflict from two tokens.
   */
  static init(tokens) {
    const makeParticipant = (token, i) => {
      const actor = token.actor;
      const stats = TSLStatResolver?.resolve(actor) ?? [];
      return {
        tokenId:    token.id,
        actorId:    actor.id,
        name:       token.name,
        img:        token.texture?.src ?? actor.img,
        color:      PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
        stats,
        conditions: emptyConditions(),
      };
    };

    ConflictStore.state = {
      active:       true,
      participants: tokens.map((t, i) => makeParticipant(t, i)),
      selectedTokenIds: [],
      turn:         0,
      log:          [],
      resolved:     false,
      resolution:   null,
    };

    ConflictStore._broadcast();
    return ConflictStore.state;
  }

  static startSelection(tokens = []) {
    ConflictStore.state = {
      active: false,
      participants: [],
      selectedTokenIds: tokens.map((t) => t.id),
      turn: 0,
      log: [],
      resolved: false,
      resolution: null,
    };
    ConflictStore._notify();
    return ConflictStore.state;
  }

  static toggleTokenSelection(tokenId) {
    if (!ConflictStore.state) return;
    const selected = new Set(ConflictStore.state.selectedTokenIds || []);
    if (selected.has(tokenId)) selected.delete(tokenId);
    else selected.add(tokenId);
    ConflictStore.state.selectedTokenIds = [...selected];
    ConflictStore._notify();
  }

  static getSelectedTokens() {
    if (!ConflictStore.state?.selectedTokenIds?.length) return [];
    return ConflictStore.state.selectedTokenIds
      .map((id) => canvas.tokens?.get(id))
      .filter((token) => token);
  }

  static createConflictFromSelection() {
    const tokens = ConflictStore.getSelectedTokens();
    if (tokens.length < 2) return null;
    return ConflictStore.init(tokens);
  }

  /**
   * Load state received from GM via socket.
   */
  static load(state) {
    ConflictStore.state = state;
    ConflictStore._notify();
  }

  /** Toggle a condition for a participant */
  static toggleCondition(participantIndex, conditionId) {
    const p = ConflictStore.state.participants[participantIndex];
    p.conditions[conditionId] = !p.conditions[conditionId];

    const active = Object.values(p.conditions).filter(Boolean).length;
    if (active >= 4) {
      ConflictStore.addLog(`⚠ ${p.name} is Overwhelmed — must yield or flee.`, "warn");
    }

    ConflictStore._broadcast();
  }

  /** Record a roll result and advance the turn */
  static recordRoll(participantIndex, move, targetIndex, d1, d2, statValue) {
    const p = ConflictStore.state.participants[participantIndex];
    const target = targetIndex !== null ? ConflictStore.state.participants[targetIndex] : null;
    const total = d1 + d2 + statValue;
    const outcome = total >= 10 ? "Strong Hit" : total >= 7 ? "Weak Hit" : "Miss";

    const targetText = target ? ` → ${target.name}` : "";
    ConflictStore.addLog(
      `${p.name}${targetText}: ${move.name}: ${d1}+${d2}+${statValue} = ${total} (${outcome})`,
      total >= 10 ? "hit" : total >= 7 ? "weak" : "miss"
    );

    // No turn order — the GM runs initiative; anyone acts from their own menu.

    // ── Mechanical effects of emotional moves (GM authoritative) ──────────────
    // Basic and playbook moves share the same fx schema:
    //   onStrong / onWeak: { strings, stringsOnYou, reveal, resolve }
    if (game.user.isGM && target) {
      const src = p.actorId;
      const tgt = target.actorId;
      const fx  = total >= 10 ? move.onStrong : total >= 7 ? move.onWeak : null;
      if (fx) {
        if (fx.strings) {
          TSLStringStore.add(src, tgt, fx.strings);
          ConflictStore.addLog(`🎭 ${p.name} gains ${fx.strings} string${fx.strings > 1 ? "s" : ""} on ${target.name}`, "info");
        }
        if (fx.stringsOnYou) {
          TSLStringStore.add(tgt, src, fx.stringsOnYou);
          ConflictStore.addLog(`🎭 ${target.name} gains a string on ${p.name}`, "info");
        }
        if (fx.reveal) {
          // A tell is whispered to the reader — they deduce the nature themselves
          SocialManeuverRoller.whisperTell(game.actors.get(src), game.actors.get(tgt));
          ConflictStore.addLog(`👁 ${p.name} studies ${target.name} — a tell is whispered`, "info");
        }
        if (fx.resolve) {
          const tgtActor = game.actors.get(tgt);
          if (SocialEncounterManager.getEncounter(tgtActor).active) {
            SocialEncounterManager.adjustResolve(tgtActor, -fx.resolve, src);
            ConflictStore.addLog(`💗 The words land true — ${target.name} loses ${fx.resolve} Resolve`, "hit");
          }
        }
      }
    }

    ConflictStore._broadcast();
    return { total, outcome, d1, d2, statValue };
  }

  /** Trigger the "Finally Kiss" special move */
  static resolveKiss(participantIndex, targetIndex) {
    const state = ConflictStore.state;
    const p = state.participants[participantIndex];
    const t = state.participants[targetIndex];
    ConflictStore.addLog(`💋 ${p.name} and ${t.name} — Finally Kiss! Both gain +1 ongoing!`, "kiss");

    if (game.user.isGM) {
      TSLStringStore.add(p.actorId, t.actorId, 1);
      TSLStringStore.add(t.actorId, p.actorId, 1);
      // The kiss writes history — hearts warm on both sides
      TSLBondStore.shiftAttitude(p.actorId, t.actorId, 1);
      TSLBondStore.shiftAttitude(t.actorId, p.actorId, 1);
    }

    if (state.participants.length <= 2) {
      // Classic 2-party ending: conflict is over
      state.resolved = true;
      state.resolution = "kiss";
      ConflictStore._broadcast();
      if (game.user.isGM) TSLConditionEffects.applyFromConflict(state);
      return;
    }

    // Multi-party: apply and remove just the two kissers, conflict continues
    if (game.user.isGM) {
      TSLConditionEffects.applyYieldingParticipant(p, state);
      TSLConditionEffects.applyYieldingParticipant(t, state);
    }
    Object.keys(p.conditions).forEach(k => p.conditions[k] = false);
    Object.keys(t.conditions).forEach(k => t.conditions[k] = false);

    // Remove higher index first so lower index stays valid
    const hi = Math.max(participantIndex, targetIndex);
    const lo = Math.min(participantIndex, targetIndex);
    state.participants.splice(hi, 1);
    state.participants.splice(lo, 1);

    if (state.participants.length <= 1) {
      state.resolved = true;
      state.resolution = "yield_last";
      if (game.user.isGM) TSLConditionEffects.applyFromConflict(state);
    } else {
      if (state.turn >= state.participants.length) state.turn = 0;
      ConflictStore.addLog(`The conflict continues with ${state.participants.length} remaining…`, "info");
    }

    ConflictStore._broadcast();
  }

  /** One participant yields — removes them from the conflict */
  static resolveYield(participantIndex) {
    const p = ConflictStore.state.participants[participantIndex];
    ConflictStore.addLog(`🏳 ${p.name} yields.`, "yield");

    if (game.user.isGM) TSLConditionEffects.applyYieldingParticipant(p, ConflictStore.state);
    // Clear conditions so they're not re-applied at conflict end
    Object.keys(p.conditions).forEach(k => p.conditions[k] = false);

    ConflictStore.state.participants.splice(participantIndex, 1);

    if (ConflictStore.state.participants.length <= 1) {
      ConflictStore.state.resolved = true;
      ConflictStore.state.resolution = "yield_last";
      if (game.user.isGM) TSLConditionEffects.applyFromConflict(ConflictStore.state);
    } else {
      if (ConflictStore.state.turn >= ConflictStore.state.participants.length) {
        ConflictStore.state.turn = 0;
      }
    }

    ConflictStore._broadcast();
  }

  static addLog(text, type = "info") {
    ConflictStore.state.log.unshift({ text, type, ts: Date.now() });
    if (ConflictStore.state.log.length > 30) ConflictStore.state.log.pop();
  }

  static close() {
    ConflictStore.state = null;
    if (game.user.isGM) {
      globalThis.TSLSocket?.emit("CONFLICT_CLOSE", {});
    }
    ConflictStore._notify();
  }

  /** Broadcast to all clients (GM only) then notify local listeners */
  static _broadcast() {
    if (game.user.isGM) {
      globalThis.TSLSocket?.emit("CONFLICT_UPDATE", { state: ConflictStore.state });
    }
    ConflictStore._notify();
  }

  static _notify() {
    for (const fn of ConflictStore._listeners) fn(ConflictStore.state);
  }

  static subscribe(fn) {
    ConflictStore._listeners.add(fn);
    return () => ConflictStore._listeners.delete(fn);
  }
}
