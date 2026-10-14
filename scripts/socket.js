/**
 * tsl-social-conflict | socket.js
 *
 * The GM owns every shared write: what the party learns lives on the NPC
 * (players can't write it), and a String or a bond may land on someone else's
 * actor. A player's roll travels as a GM_ACTION message; the GM client applies
 * what follows (TSLGMActions) and it syncs back as ordinary actor-flag
 * updates. SOCIAL_PULSE tells every open Social Scene to animate it.
 *
 * IMPORTANT: this channel only works because module.json declares
 * `"socket": true` — Foundry's server relays `module.<id>` events between
 * clients ONLY for modules that set it. Without it every message is silently
 * dropped. Changing the flag needs a full world restart, not a browser reload.
 */

console.log("TSL | Loading socket.js...");

const SOCKET_NAME = "module.tsl-social-conflict";

class TSLSocket {
  static register() {
    game.socket.on(SOCKET_NAME, (payload) => TSLSocket._handleMessage(payload));
  }

  /** Emit a message to all other clients. */
  static emit(type, data) {
    game.socket.emit(SOCKET_NAME, { type, data, senderId: game.user.id });
  }

  /**
   * A social pulse — an ask or a read just resolved — for the Social
   * Scene on EVERY client: play it locally (own messages are dropped on
   * receipt) and emit to everyone else.
   */
  static broadcastPulse(data) {
    if (typeof TSLSceneVisualizer !== "undefined") TSLSceneVisualizer.pulse(data);
    TSLSocket.emit("SOCIAL_PULSE", data);
  }

  static _handleMessage({ type, data, senderId }) {
    if (senderId === game.user.id) return;
    switch (type) {
      case "SOCIAL_PULSE":
        if (typeof TSLSceneVisualizer !== "undefined") TSLSceneVisualizer.pulse(data);
        break;
      case "GM_ACTION":
        if (game.user.isGM) TSLGMActions.handle(data);
        break;
      default:
        console.warn(`TSL | Unknown socket message type: ${type}`);
    }
  }
}

/**
 * Player-originated actions, executed on the GM client. Call
 * TSLGMActions.request() from anywhere: it runs directly for the GM and relays
 * through the socket for players.
 */
class TSLGMActions {
  static request(action, args = {}) {
    if (game.user.isGM) return TSLGMActions.handle({ action, args });
    TSLSocket.emit("GM_ACTION", { action, args });
  }

  static async handle({ action, args }) {
    if (!game.user.isGM) return;
    // With two GM clients connected, only the designated active GM executes.
    if (game.users.activeGM && !game.users.activeGM.isSelf) return;
    try {
      switch (action) {
        case "talkResolve":
          // A technique — apply what follows (openings, emotions, Strings, bonds, lies, knowledge), post its card.
          await TSLTalk.resolve(args);
          break;
        case "stringHurt":
          // A String spent to make someone feel something.
          await TSLEmotions.hurt(args);
          break;
        default:
          console.warn(`TSL | Unknown GM action: ${action}`);
      }
    } catch (err) {
      console.error(`TSL | GM action "${action}" failed:`, err);
    }
  }
}
