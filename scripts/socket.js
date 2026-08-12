/**
 * tsl-social-conflict | socket.js
 * Handles real-time sync of conflict state between GM and all players.
 *
 * GM owns the state. Players never mutate shared state directly:
 * their actions travel as GM_ACTION messages, the GM client executes
 * them (TSLGMActions) and broadcasts the authoritative state back.
 */

console.log("TSL | Loading socket.js...");

const SOCKET_NAME = "module.tsl-social-conflict";

// Temporary diagnostic for the "GM outcome menu never fires when a player rolls"
// report. Surfaces each link of the player→socket→GM→menu chain as an on-screen
// notification so one reproduction shows exactly where it breaks. Remove once fixed.
const TSL_DEBUG_RELAY = true;

class TSLSocket {
  static register() {
    game.socket.on(SOCKET_NAME, (payload) => {
      TSLSocket._handleMessage(payload);
    });
    console.log(`TSL | socket listener attached on ${game.user?.name} (isGM=${game.user?.isGM})`);

    // TEMP self-test: confirm the listener is up on THIS client, then fire a
    // ping. Every client that RECEIVES the ping reports it. This tells us
    // whether custom module-socket events actually travel player↔GM in this
    // world (vs. our GM_ACTION relay silently going nowhere). Auto-runs on
    // load — the GM just reads chat, no reproduction needed.
    if (TSL_DEBUG_RELAY) {
      setTimeout(() => {
        TSLSocket._diag(`✅ listener REGISTERED on this client: ${game.user?.name} (isGM=${game.user?.isGM})`);
        TSLSocket.emit("RELAY_TEST", { from: game.user?.name });
      }, 4000);
    }
  }

  /**
   * TEMP diagnostic: drop a persistent, unmissable breadcrumb into the chat log
   * (whispered to the GM) at each link of the player→socket→GM→menu chain.
   * Unlike ui.notifications it does not auto-dismiss, so the GM can read the
   * whole trail after one reproduction. Remove with TSL_DEBUG_RELAY once fixed.
   */
  static _diag(text) {
    if (!TSL_DEBUG_RELAY) return;
    try {
      const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
      ChatMessage.create({
        content: `<div style="font-family:monospace;font-size:11px;color:#c98aa8;border-left:3px solid #c98aa8;padding-left:6px">🔧 TSL RELAY — ${text}</div>`,
        whisper: gmIds,
      });
    } catch (e) { console.warn("TSL | diag whisper failed:", e); }
  }

  /**
   * Emit a message to all other clients.
   * @param {string} type  - Message type
   * @param {object} data  - Payload
   */
  static emit(type, data) {
    game.socket.emit(SOCKET_NAME, { type, data, senderId: game.user.id });
  }

  /**
   * A "social pulse" — a resolved maneuver — for the Scene Visualizer on EVERY
   * client. Dispatch locally (the sender sees it too, since _handleMessage
   * drops own messages) and emit to everyone else.
   */
  static broadcastPulse(data) {
    if (typeof TSLSceneVisualizer !== "undefined") TSLSceneVisualizer.pulse(data);
    if (typeof TSLConflictApp !== "undefined") TSLConflictApp.pulse?.(data);
    TSLSocket.emit("SOCIAL_PULSE", data);
  }

  static _handleMessage({ type, data, senderId }) {
    // Ignore own messages
    if (senderId === game.user.id) return;

    switch (type) {
      case "CONFLICT_OPEN":
        // A GM opened a conflict — players open their view
        TSLConflictApp.receiveOpen(data);
        break;

      case "CONFLICT_UPDATE":
        // State changed (condition toggled, roll made, turn changed)
        TSLConflictApp.receiveUpdate(data);
        break;

      case "CONFLICT_CLOSE":
        // GM ended the conflict
        TSLConflictApp.receiveClose();
        break;

      case "SOCIAL_PULSE":
        // A maneuver resolved somewhere — animate it for everyone
        if (typeof TSLSceneVisualizer !== "undefined") TSLSceneVisualizer.pulse(data);
        if (typeof TSLConflictApp !== "undefined") TSLConflictApp.pulse?.(data);
        break;

      case "RELAY_TEST":
        // Self-test ping: prove that a custom module-socket event reached THIS
        // client from another. Report it (whispered to the GM).
        console.log(`TSL RELAY | RELAY_TEST received from ${data?.from} by ${game.user?.name}`);
        TSLSocket._diag(`🛰️ module socket DELIVERS: '${data?.from}'s ping arrived at ${game.user?.name} (isGM=${game.user?.isGM})`);
        break;

      case "GM_ACTION":
        // A player performed an action — only the GM client executes it
        console.log(`TSL RELAY | GM_ACTION received from ${senderId}:`, data?.action);
        if (game.user.isGM) {
          TSLSocket._diag(`② GM received '${data?.action}' over the module socket`);
          TSLGMActions.handle(data);
        }
        break;

      default:
        console.warn(`TSL | Unknown socket message type: ${type}`);
    }
  }
}

/**
 * Executes player-originated actions on the GM client.
 * Call TSLGMActions.request() from anywhere: it runs directly for the GM
 * and relays through the socket for players.
 */
class TSLGMActions {
  static request(action, args = {}) {
    if (game.user.isGM) {
      console.log(`TSL RELAY | request(${action}) — GM, handling directly`);
      return TSLGMActions.handle({ action, args });
    }
    console.log(`TSL RELAY | request(${action}) — player, emitting over socket`);
    TSLSocket._diag(`① player ${game.user.name} is relaying '${action}' to the GM`);
    TSLSocket.emit("GM_ACTION", { action, args });
  }

  static async handle({ action, args }) {
    if (!game.user.isGM) return;
    // With two GM clients connected, only the designated active GM executes
    if (game.users.activeGM && !game.users.activeGM.isSelf) {
      console.warn(`TSL RELAY | handle(${action}) SKIPPED — this GM is not the active GM (activeGM=${game.users.activeGM?.name})`);
      if (TSL_DEBUG_RELAY) ui.notifications?.warn(`TSL: '${action}' ignored — another GM is the active GM`);
      return;
    }
    try {
      switch (action) {
        case "moveRoll": {
          // A player rolled a TSL move (basic or playbook) — record it authoritatively
          const { pIdx, moveId, targetIdx, d1, d2, statValue, stringSpent, participantName } = args;
          const move = MOVES.find(m => m.id === moveId) ?? TSLPlaybooks.getMove(moveId);
          if (!move || !ConflictStore.state) return;
          if (stringSpent) ConflictStore.addLog(`🎭 ${participantName} spent a string (+1)`, "info");
          ConflictStore.recordRoll(pIdx, move, targetIdx ?? null, d1, d2, statValue);
          break;
        }

        case "maneuverOutcome":
          // A player rolled a Social Fencing maneuver — apply consequences
          await SocialManeuverRoller.applyOutcome(args);
          break;

        case "kiss":
          ConflictStore.resolveKiss(args.pIdx, args.targetIdx);
          break;

        case "yield":
          ConflictStore.resolveYield(args.pIdx);
          break;

        default:
          console.warn(`TSL | Unknown GM action: ${action}`);
      }
    } catch (err) {
      console.error(`TSL | GM action "${action}" failed:`, err);
    }
  }
}
