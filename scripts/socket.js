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

class TSLSocket {
  static register() {
    game.socket.on(SOCKET_NAME, (payload) => {
      TSLSocket._handleMessage(payload);
    });
  }

  /**
   * Emit a message to all other clients.
   * @param {string} type  - Message type
   * @param {object} data  - Payload
   */
  static emit(type, data) {
    game.socket.emit(SOCKET_NAME, { type, data, senderId: game.user.id });
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

      case "GM_ACTION":
        // A player performed an action — only the GM client executes it
        if (game.user.isGM) TSLGMActions.handle(data);
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
    if (game.user.isGM) return TSLGMActions.handle({ action, args });
    TSLSocket.emit("GM_ACTION", { action, args });
  }

  static async handle({ action, args }) {
    if (!game.user.isGM) return;
    // With two GM clients connected, only the designated active GM executes
    if (game.users.activeGM && !game.users.activeGM.isSelf) return;
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
