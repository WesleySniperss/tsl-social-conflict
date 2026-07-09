/**
 * tsl-social-conflict | social-hud.js
 *
 * One button on the Token HUD and one context-menu item —
 * both open the unified SocialFencingDialog.
 */

console.log("TSL | Loading social-hud.js...");

class SocialHUD {
  static register() {
    try {
      Hooks.on("renderTokenHUD",        (app, html) => SocialHUD.onRenderTokenHUD(app, html));
      Hooks.on("getActorContextOptions", (app, items) => SocialHUD.onGetActorContextOptions(app, items));
      console.log("TSL | SocialHUD hooks registered");
    } catch (err) {
      console.error("TSL | Error registering SocialHUD hooks:", err);
    }
  }

  static onRenderTokenHUD(app, html) {
    const actor = app.document?.actor;
    if (!actor) return;

    const leftCol = html.querySelector(".col.left");
    if (!leftCol) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control-icon tsl-hud-fencing";
    btn.setAttribute("data-tooltip", "Social Chronicle — profile & bonds");
    btn.setAttribute("aria-label",   "Social Chronicle");
    btn.innerHTML = '<i class="fas fa-address-book" inert></i>';
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      app.close();
      SocialFencingDialog.open(actor);
    });

    leftCol.appendChild(btn);
  }

  static onGetActorContextOptions(app, menuItems) {
    menuItems.push({
      name:      "Social Chronicle",
      icon:      '<i class="fas fa-address-book"></i>',
      condition: () => true,
      callback:  li => {
        const actor = game.actors.get(li.closest("[data-entry-id]")?.dataset.entryId);
        if (actor) SocialFencingDialog.open(actor);
      },
    });
  }
}

console.log("TSL | social-hud.js loaded");
