/**
 * tsl-social-conflict | hud-button.js
 *
 * One VTools toolbar button, "Social": it opens (or closes) the Social Scene —
 * the everyone-can-see relationship map, with every roll shown as it happens.
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
        title:   _t("Social"),
        icon:    "fas fa-people-arrows",
        onClick: () => TSLSceneVisualizer.toggle(),
      });
      console.log("TSL | VTools button registered");
    } catch (err) {
      console.error("TSL | Error registering VTools button:", err);
    }
  }
}
