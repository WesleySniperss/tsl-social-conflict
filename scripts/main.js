/**
 * tsl-social-conflict | main.js
 * Module entry point.
 */

Hooks.once("init", () => {
  console.log("TSL | Social Conflict module initialising...");

  game.settings.register("tsl-social-conflict", "conflictMode", {
    name: "Conflict mode",
    hint: "Which layers the conflict window shows. Full: TSL emotional moves + Social Fencing maneuvers. TSL only: pure Thirsty Sword Lesbians (moves, Conditions, Strings, playbooks — no d20 maneuvers or tracks). Fencing only: classic D&D social combat without the 2d6 layer.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      both:    "Full — TSL moves + Social Fencing",
      tsl:     "TSL only (pure Thirsty Sword Lesbians)",
      fencing: "Social Fencing only (classic D&D)",
    },
    default: "both",
    onChange: () => {
      TSLConflictApp?.instance?.render(true);
      SocialFencingDialog?._instances?.forEach(app => app.render(true));
    },
  });

  game.settings.register("tsl-social-conflict", "enableKiss", {
    name: "Enable “Finally Kiss” move",
    hint: "Show the Thirsty Sword Lesbians special move that ends a conflict with a mutual kiss (+1 attitude both ways). Always available in TSL-only mode.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once("vtools.ready", () => {
  console.log("TSL | vtools ready, registering HUD button");
  try {
    if (typeof TSLHudButton !== "undefined") {
      TSLHudButton.register();
    } else {
      console.warn("TSL | TSLHudButton not found");
    }
  } catch (err) {
    console.error("TSL | Error registering TSLHudButton:", err);
  }
});

Hooks.once("ready", () => {
  console.log("TSL | Social Conflict ready hook firing");

  // Fencing statuses join the token HUD's main status list — toggling them
  // there is equivalent to the module applying them (matched via `tsl-<id>`).
  // Register the FULL effect data, not just the icon: a status toggled from
  // the HUD must carry the same combat changes, description, duration and
  // native-condition links as one the module applies itself.
  try {
    for (const id of SOCIAL_CONDITION_ORDER) {
      const meta = SOCIAL_CONDITIONS[id];
      if (!meta || CONFIG.statusEffects.some(s => s.id === `tsl-${id}`)) continue;
      const fx = SocialArchetypeManager.buildConditionEffect(id);
      CONFIG.statusEffects.push({
        id: `tsl-${id}`,
        name: `${meta.label} (Social)`,
        img: meta.icon,
        description: fx.description,
        changes: fx.changes,
        duration: fx.duration,
        statuses: meta.links ?? [],
        flags: fx.flags,
      });
    }
    console.log("TSL | Fencing statuses registered in CONFIG.statusEffects");
  } catch (err) {
    console.error("TSL | Error registering status effects:", err);
  }

  try {
    console.log("TSL | Registering TSLSocket...");
    if (typeof TSLSocket !== "undefined") {
      TSLSocket.register();
      console.log("TSL | TSLSocket registered");
    } else {
      console.warn("TSL | TSLSocket class not found");
    }
  } catch (err) {
    console.error("TSL | Error registering TSLSocket:", err);
  }

  try {
    console.log("TSL | Registering TSLConditionEffects...");
    if (typeof TSLConditionEffects !== "undefined") {
      TSLConditionEffects.registerRestHooks();
      TSLConditionEffects.registerSpellHooks();
      console.log("TSL | TSLConditionEffects registered");
    } else {
      console.warn("TSL | TSLConditionEffects class not found");
    }
  } catch (err) {
    console.error("TSL | Error registering TSLConditionEffects:", err);
  }

  try {
    console.log("TSL | Checking for SocialHUD...");
    if (typeof SocialHUD !== "undefined") {
      console.log("TSL | SocialHUD found, registering...");
      SocialHUD.register();
      console.log("TSL | SocialHUD registered");
    } else {
      console.warn("TSL | SocialHUD class not found — social notes HUD will be unavailable");
    }
  } catch (err) {
    console.error("TSL | Error registering SocialHUD:", err);
  }

  console.log("TSL | Ready hook complete");
});
