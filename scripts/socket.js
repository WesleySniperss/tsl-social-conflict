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
        if (game.user.isGM) TSLGMActions.handle(data, senderId);
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
    if (!game.users?.activeGM) {
      ui.notifications?.warn?.(_t("A GM must be connected for that — nothing was spent."));
      return false;
    }
    TSLSocket.emit("GM_ACTION", { action, args });
    return true;
  }

  /** The character a player's action speaks for — they must own it. */
  static _actorOf(action, args) {
    switch (action) {
      case "talkResolve": return args?.srcId;
      case "bondMirror":  return args?.actorId;
      case "abilityOutcome": return args?.pcId;   // the answer to an NPC's move (the card checks it's theirs)
      case "invokeSignature": return args?.actorId;
      case "stringSet": return args?.pcId;   // a String marked by hand on the player's own character — either way
      default: return null;
    }
  }

  /** What any player may ask for: it speaks for no one's character (a caption pinned to the shared map). */
  static OPEN = new Set(["boardPatch"]);

  static async handle({ action, args }, senderId = null) {
    if (!game.user.isGM) return;
    // With two GM clients connected, only the designated active GM executes.
    if (game.users.activeGM && !game.users.activeGM.isSelf) return;
    // A player acts only through a character they own.
    const sender = senderId ? game.users.get(senderId) : null;
    if (senderId && !sender?.isGM && !TSLGMActions.OPEN.has(action)) {
      const actor = game.actors.get(TSLGMActions._actorOf(action, args));
      if (!sender || !actor?.testUserPermission?.(sender, "OWNER")) {
        console.warn(`TSL | Refused "${action}" from ${sender?.name ?? senderId}: not their character.`);
        return;
      }
    }
    try {
      switch (action) {
        case "talkResolve":
          // A technique — apply what follows (emotions, Strings, bonds, lies, knowledge), post its card.
          await TSLTalk.resolve(args);
          break;
        case "bondMirror":
          // A player changed their side of a bond: the other side follows.
          await TSLBondStore.applyMirror(args);
          break;
        case "boardPatch":
          // A caption pinned to (or moved on, or taken off) the shared relationship map.
          await TSLSceneVisualizer.applyBoardPatch(args);
          break;
        case "invokeSignature":
          // A ●●● bond's signature, once per long rest.
          await TSLBondPowers.invokeSignature(args);
          break;
        case "stringSet":
          // A player marks a String by hand: theirs on someone, or someone's on them — their own character only.
          if (args?.pcId !== args?.holderId && args?.pcId !== args?.targetId) { console.warn("TSL | Refused stringSet: not about their character."); break; }
          await TSLStringStore.set(args.holderId, args.targetId, args.on);
          break;
        case "abilityOutcome":
          // A character answers an NPC's pull on a String (or answers it with their own: Quits).
          await TSLAbilities.outcome(args, senderId);
          break;
        default:
          console.warn(`TSL | Unknown GM action: ${action}`);
      }
    } catch (err) {
      console.error(`TSL | GM action "${action}" failed:`, err);
    }
  }
}
