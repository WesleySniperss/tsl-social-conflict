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
      // ONE toolbar button (the two were merged — no reason for both). It opens
      // the Social Scene, the everyone-can-see hub: relationship map + live
      // roll/effect pulses. The GM starts an actual conflict from a button
      // INSIDE the Scene (see TSLSceneVisualizer). Falls back to the old
      // conflict-selection flow if the visualiser isn't loaded.
      VTools.register({
        name:    "tsl-social-conflict",
        title:   "Social",
        icon:    "fas fa-people-arrows",
        onClick: () => {
          if (typeof TSLSceneVisualizer !== "undefined") TSLSceneVisualizer.toggle();
          else TSLHudButton._handleClick();
        },
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
