/**
 * tsl-social-conflict | main.js
 * Module entry point: settings, the ready hook, one-time data migrations.
 */

const TSL_SCOPE = "tsl-social-conflict";

Hooks.once("init", () => {
  console.log("TSL | Social Conflict module initialising...");

  // The module's language — each user's own. "Auto" follows Foundry's language.
  // Registered first: every other text below is in that language.
  game.settings.register(TSL_SCOPE, "language", {
    name: "Language / Мова",
    hint: "The language of this module's windows and chat cards. Auto follows Foundry's own language. — Мова вікон і карток модуля. «Авто» — як у самого Foundry.",
    scope: "client", config: true, type: String, default: "auto",
    choices: { auto: "Auto / Авто", en: "English", uk: "Українська" },
    onChange: (v) => {
      TSLi18n.setLanguage(v);
      try { TSLEmotions.registerStatuses(); } catch { /* not ready */ }
      TSLi18n.rerender();
    },
  });
  let pick = "auto";
  try { pick = game.settings.get(TSL_SCOPE, "language"); } catch { /* first run */ }
  TSLi18n.setLanguage(pick);

  // The system's own check window is the roll (the user's choice): the module
  // fills in the maneuver's skill and its bonus; the window is where the
  // ability, extra dice or a situational modifier change. (The old key
  // "useSystemRollDialog" is no longer read.)
  game.settings.register(TSL_SCOPE, "systemRollDialog", {
    name: _t("Roll in the system's window"),
    hint: _t("On (the default): every maneuver opens the system's own check window, already set to its skill and bonus — change the ability or add dice there if the scene calls for it. Off: the check is rolled at once, the same way."),
    scope: "world", config: true, type: Boolean, default: true,
  });

  game.settings.register(TSL_SCOPE, "socialDcBonus", {
    name: _t("Social difficulty"),
    hint: _t("Added to every NPC's DC on top of 10 + proficiency + the better of WIS/INT (a small ask is 4 easier, an ask against their interests 4 harder). Raise it if people are too easy to move at your table."),
    scope: "world", config: true, type: Number, default: 0,
    range: { min: -5, max: 10, step: 1 },
  });

  // Which data migrations have run in this world (hidden).
  game.settings.register(TSL_SCOPE, "dataVersion", {
    scope: "world", config: false, type: Number, default: 0,
  });
});

Hooks.once("vtools.ready", () => {
  try {
    if (typeof TSLHudButton !== "undefined") TSLHudButton.register();
  } catch (err) {
    console.error("TSL | Error registering the toolbar button:", err);
  }
});

/**
 * Rescue chronicle data written to TOKEN DELTAS by pre-1.9.5 versions (each
 * unlinked token kept a private copy). Merge it into the world actor and wipe
 * the delta. GM client, idempotent.
 */
async function migrateTokenChronicles() {
  if (!game.user?.isGM) return;
  for (const scene of game.scenes ?? []) {
    for (const tok of scene.tokens ?? []) {
      if (tok.actorLink) continue;
      const delta = tok.delta?.flags?.[TSL_SCOPE];
      if (!delta || foundry.utils.isEmpty(delta)) continue;
      const base = game.actors.get(tok.actorId);
      if (!base) continue;
      try {
        if (delta.socialFencing && !base.getFlag(TSL_SCOPE, "socialFencing"))
          await base.setFlag(TSL_SCOPE, "socialFencing", delta.socialFencing);
        if (Array.isArray(delta.bonds) && delta.bonds.length) {
          const bonds = base.getFlag(TSL_SCOPE, "bonds") ?? [];
          const have  = new Set(bonds.map(b => b.targetActorId));
          const extra = delta.bonds.filter(b => b?.targetActorId && !have.has(b.targetActorId));
          if (extra.length) await base.setFlag(TSL_SCOPE, "bonds", [...bonds, ...extra]);
        }
        if (Array.isArray(delta.stringList) && delta.stringList.length) {
          const strings = base.getFlag(TSL_SCOPE, "stringList") ?? [];
          const have    = new Set(strings.map(s => s.id));
          const extra   = delta.stringList.filter(s => s?.id && !have.has(s.id));
          if (extra.length) await base.setFlag(TSL_SCOPE, "stringList", [...strings, ...extra]);
        }
        await tok.delta.update({ [`flags.-=${TSL_SCOPE}`]: null });
        console.log(`TSL | Migrated token-local chronicle of "${tok.name}" (${scene.name}) into actor "${base.name}"`);
      } catch (err) {
        console.warn(`TSL | Chronicle migration failed for token "${tok.name}":`, err);
      }
    }
  }
}

/**
 * v3: the emotional layer (Wounds, Boons, Scars, Willpower, moments), the
 * fencing states, the bond auras and the Leanings skill effect are gone. Remove the Active Effects those versions put
 * on sheets — they would otherwise keep their old riders (−AC, disadvantage…)
 * with nothing left to explain or end them — and their bookkeeping flags.
 * Pulled Strings stay (Pull is still part of v3). GM client, once per world.
 */
async function migrateToV3() {
  if (!game.user?.isGM) return;
  let version = 0;
  try { version = Number(game.settings.get(TSL_SCOPE, "dataVersion")) || 0; } catch { /* new world */ }
  if (version >= 3) return;

  // v2's states, wounds, scars and auras — never a pulled String, nor v3's emotions and scars.
  const isOld = (e) => {
    const f = e.flags?.[TSL_SCOPE];
    if (f?.stringPull || f?.emotion || f?.scar) return false;
    if (f) return true;
    return [...(e.statuses ?? [])].some(s => typeof s === "string" && s.startsWith("tsl-") && s !== "tsl-string-pull" && !s.startsWith("tsl-emo-"));
  };
  const actors = [...(game.actors?.contents ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const tok of scene.tokens ?? []) if (!tok.actorLink && tok.actor) actors.push(tok.actor);
  }
  let removed = 0;
  for (const actor of actors) {
    const ids = (actor.effects ?? []).filter(isOld).map(e => e.id);
    if (ids.length) {
      try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids); removed += ids.length; }
      catch (err) { console.warn(`TSL | v3 cleanup failed on ${actor.name}:`, err); }
    }
    for (const key of ["encounter", "willpower", "woundTrack", "exchange"]) {
      if (actor.getFlag?.(TSL_SCOPE, key) === undefined) continue;
      try { await actor.unsetFlag(TSL_SCOPE, key); } catch { /* ignore */ }
    }
  }
  await game.settings.set(TSL_SCOPE, "dataVersion", 3);
  if (removed) {
    console.log(`TSL | v3: removed ${removed} old social effect(s)`);
    ui.notifications?.info?.(_t("TSL Social Conflict v3: removed {n} old social effect(s) from sheets (states, wounds, scars). Strings, bonds and dossiers are kept.", { n: removed }));
  }
}

// The five emotions join the Token HUD's status palette (after every system has set its own).
Hooks.once("setup", () => {
  try { TSLEmotions.registerStatuses(); }
  catch (err) { console.error("TSL | Emotion statuses failed:", err); }
});

Hooks.once("ready", () => {
  // The socket FIRST — it carries every player action to the GM. A migration
  // below that threw must never leave the GM deaf to the players.
  try { TSLSocket.register(); }
  catch (err) { console.error("TSL | Error registering the socket:", err); }

  migrateToV3().catch(err => console.error("TSL | v3 migration failed:", err));
  migrateTokenChronicles().catch(err => console.error("TSL | migrateTokenChronicles failed:", err));
  // A bond is one shared relationship — fill in any missing mirror.
  TSLBondStore.reconcileAll().catch(err => console.error("TSL | TSLBondStore.reconcileAll failed:", err));
  // A pulled String is a real effect — end it once it has done its job.
  try { TSLStringStore.registerPullHooks(); }
  catch (err) { console.error("TSL | String pull hooks failed:", err); }
  try { SocialHUD.register(); }
  catch (err) { console.error("TSL | SocialHUD failed:", err); }
  // An actor deleted from the world takes its bonds and Strings with it (the active GM tidies up).
  Hooks.on("deleteActor", (actor) => {
    if (!game.user.isGM || (game.users.activeGM && !game.users.activeGM.isSelf)) return;
    TSLBondStore.forget(actor.id).catch(err => console.warn("TSL | bond cleanup failed:", err));
  });

  console.log("TSL | Ready");
});
