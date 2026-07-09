/**
 * tsl-social-conflict | hud-button.js
 *
 * Registers "Social Conflict" button in the VTools toolbar.
 * GM selects exactly 2 tokens → clicks the button → conflict starts.
 */

console.log("TSL | Loading hud-button.js...");

class TSLHudButton {
  static register() {
    if (typeof VTools === "undefined") {
      console.warn("TSL | VTools not available — toolbar button will not be registered");
      return;
    }

    try {
      VTools.register({
        name:    "tsl-social-conflict",
        title:   "Social Conflict",
        icon:    "fas fa-heart-crack",
        onClick: () => TSLHudButton._handleClick(),
      });
      console.log("TSL | VTools button registered");
    } catch (err) {
      console.error("TSL | Error registering VTools button:", err);
    }
  }

  static _handleClick() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can start a social conflict.");
      return;
    }

    const controlled = canvas.tokens?.controlled ?? [];
    TSLConflictApp.openSelection(controlled);
  }

  static _startConflict(tokens) {
    const state = ConflictStore.init(tokens);
    TSLSocket.emit("CONFLICT_OPEN", { state });
    TSLConflictApp.openConflict(state);
  }
}
