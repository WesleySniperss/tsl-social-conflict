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

/**
 * Refresh already-applied fencing statuses to the CURRENT combat automation.
 * Effects created by older module versions (or bare HUD toggles) carry stale
 * or empty `changes` — they never pick up new riders retroactively on their
 * own. GM client only; cheap no-op when everything already matches.
 */
async function syncExistingConditionEffects(actors) {
  if (!game.user?.isGM) return;
  for (const actor of actors) {
    if (!actor?.effects) continue;
    for (const id of SOCIAL_CONDITION_ORDER) {
      const eff = SocialArchetypeManager.getActiveCondition(actor, id);
      if (!eff?.update) continue;
      const fx = SocialArchetypeManager.buildConditionEffect(id);
      const stale = JSON.stringify(eff.changes ?? []) !== JSON.stringify(fx.changes)
        || (eff.description ?? "") !== fx.description;
      if (!stale) continue;
      try {
        await eff.update({ changes: fx.changes, description: fx.description });
        console.log(`TSL | Refreshed ${id} on ${actor.name} to current combat automation`);
      } catch (err) {
        console.warn(`TSL | Could not refresh ${id} on ${actor.name}:`, err);
      }
    }
  }
}

/**
 * Rescue chronicle data written to TOKEN DELTAS by pre-1.9.5 versions.
 * Back then the Chronicle app wrote to an unlinked token's synthetic actor,
 * so every token kept a private copy of bonds/strings/profile. Merge each
 * token-local copy up into the WORLD actor (union, world data wins) and wipe
 * the delta so nothing shadows the shared chronicle. GM client, idempotent.
 */
async function migrateTokenChronicles() {
  if (!game.user?.isGM) return;
  const scope = "tsl-social-conflict";
  for (const scene of game.scenes ?? []) {
    for (const tok of scene.tokens ?? []) {
      if (tok.actorLink) continue;
      const delta = tok.delta?.flags?.[scope];
      if (!delta || foundry.utils.isEmpty(delta)) continue;
      const base = game.actors.get(tok.actorId);
      if (!base) continue;
      try {
        if (delta.socialFencing && !base.getFlag(scope, "socialFencing"))
          await base.setFlag(scope, "socialFencing", delta.socialFencing);
        if (Array.isArray(delta.bonds) && delta.bonds.length) {
          const bonds = base.getFlag(scope, "bonds") ?? [];
          const have  = new Set(bonds.map(b => b.targetActorId));
          const extra = delta.bonds.filter(b => b?.targetActorId && !have.has(b.targetActorId));
          if (extra.length) await base.setFlag(scope, "bonds", [...bonds, ...extra]);
        }
        if (Array.isArray(delta.stringList) && delta.stringList.length) {
          const strings = base.getFlag(scope, "stringList") ?? [];
          const have    = new Set(strings.map(s => s.id));
          const extra   = delta.stringList.filter(s => s?.id && !have.has(s.id));
          if (extra.length) await base.setFlag(scope, "stringList", [...strings, ...extra]);
        }
        if (delta.encounter && !base.getFlag(scope, "encounter"))
          await base.setFlag(scope, "encounter", delta.encounter);
        await tok.delta.update({ [`flags.-=${scope}`]: null });
        console.log(`TSL | Migrated token-local chronicle of "${tok.name}" (${scene.name}) into actor "${base.name}"`);
      } catch (err) {
        console.warn(`TSL | Chronicle migration failed for token "${tok.name}":`, err);
      }
    }
  }
}

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
      // If the SYSTEM already ships a same-named condition we link to (A5E's
      // own Rattled), don't add a duplicate entry to the HUD — remember the
      // native id as an alias instead, so toggling the system's condition
      // counts as the social status too (getActiveCondition matches it).
      const twin = (meta.links ?? []).find(l => CONFIG.statusEffects.some(s =>
        s.id === l && game.i18n.localize(s.name ?? "") === meta.label));
      if (twin) {
        meta.nativeAlias = twin;
        console.log(`TSL | ${meta.label}: using the system's native "${twin}" status (no duplicate entry)`);
        continue;
      }
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

  // Bring statuses applied by OLDER versions up to the current automation —
  // world actors now, scene token actors (incl. unlinked) once canvas is up.
  // Then rescue pre-1.9.5 token-local chronicles into the shared world actor.
  syncExistingConditionEffects(game.actors?.contents ?? []);
  migrateTokenChronicles();
  Hooks.on("canvasReady", () => {
    syncExistingConditionEffects(
      (canvas.tokens?.placeables ?? []).map(t => t.actor).filter(Boolean)
    );
  });

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
