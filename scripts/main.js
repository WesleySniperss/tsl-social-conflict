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

  // The Web of Bonds' board: where the GM put everyone, and the captions pinned
  // to it (hidden). A scene's own board lives on the scene (flag "board").
  game.settings.register(TSL_SCOPE, "worldBoard", {
    scope: "world", config: false, type: Object, default: {},
  });

  // How far a bond reaches (its aura) — in a fight or not. 0 turns auras off.
  game.settings.register(TSL_SCOPE, "bondAuraRange", {
    name: _t("Bond aura reach"),
    hint: _t("Standing this close (feet) to someone you have a bond with — in a fight or not — puts the bond on both tokens as a status, with its aura. 0 turns the auras off; the bond still shows within 15 ft."),
    scope: "world", config: true, type: Number, default: 15,
    range: { min: 0, max: 60, step: 5 },
    onChange: () => { try { TSLBondAuras.refresh(); TSLBondNear.update(); } catch { /* not ready */ } },
  });

  game.settings.register(TSL_SCOPE, "bondNearShow", {
    name: _t("Bonds in reach: the corner panel"),
    hint: _t("A panel in the bottom-left corner lists everyone your character stands close to with a bond — what it gives right now, the Strings both ways. On your screen only; the GM sees it for the tokens they select. The bond itself shows on the tokens as a status either way."),
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => { try { TSLBondNear.update(); } catch { /* not ready */ } },
  });

  // Cards that wait for an answer: an NPC's pull on a String; the GM's "let it show" after a Read.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try { TSLAbilities.bindCard(message, html); }
    catch (err) { console.warn("TSL | ability card:", err); }
    try { TSLTalk.bindTellCard(message, html); }
    catch (err) { console.warn("TSL | tell card:", err); }
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

/**
 * Every load, on the active GM: one String each way in every list (worlds
 * from before the cap kept up to three on one person), and every character's
 * Leanings on their sheet (the effect that sharpens Intimidation / Insight /
 * Deception). Both are no-ops when nothing is off.
 */
async function tidyStringsAndLeanings() {
  if (!game.user?.isGM || (game.users?.activeGM && !game.users.activeGM.isSelf)) return;
  let cut = 0, shown = 0;
  // v14 draws an effect on the token only with showIcon ALWAYS (or a duration): our statuses made
  // before 3.15 never said so — an emotion, a String pulled, a signature's moment — so they get it now.
  const ALWAYS = globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS;
  const ours = (e) => e.flags?.[TSL_SCOPE]?.emotion || e.flags?.[TSL_SCOPE]?.stringPull || e.flags?.[TSL_SCOPE]?.bondMoment;
  for (const actor of game.actors?.contents ?? []) {
    try { cut += await TSLStringStore.trimToCap(actor); } catch (err) { console.warn(`TSL | String trim failed on ${actor.name}:`, err); }
    if (ALWAYS !== undefined) {
      const fix = (actor.effects ?? []).filter(e => ours(e) && e.showIcon !== ALWAYS).map(e => ({ _id: e.id, showIcon: ALWAYS }));
      if (fix.length) { try { await actor.updateEmbeddedDocuments("ActiveEffect", fix); shown += fix.length; } catch (err) { console.warn(`TSL | status icons failed on ${actor.name}:`, err); } }
    }
    if (!SocialArchetypeManager.isPC(actor)) continue;
    try { await SocialArchetypeManager.syncLeaningEffect(actor); } catch (err) { console.warn(`TSL | Leanings effect failed on ${actor.name}:`, err); }
  }
  if (cut) console.log(`TSL | one String each way: ${cut} extra String(s) cut`);
  if (shown) console.log(`TSL | ${shown} status(es) now shown on their tokens`);
}

Hooks.once("ready", () => {
  // The socket FIRST — it carries every player action to the GM. A migration
  // below that threw must never leave the GM deaf to the players.
  try { TSLSocket.register(); }
  catch (err) { console.error("TSL | Error registering the socket:", err); }

  migrateToV3().then(() => tidyStringsAndLeanings()).catch(err => console.error("TSL | migration failed:", err));
  migrateTokenChronicles().catch(err => console.error("TSL | migrateTokenChronicles failed:", err));
  // A bond is one shared relationship — fill in any missing mirror.
  TSLBondStore.reconcileAll().catch(err => console.error("TSL | TSLBondStore.reconcileAll failed:", err));
  // A pulled String is a real effect — end it once it has done its job.
  try { TSLStringStore.registerPullHooks(); }
  catch (err) { console.error("TSL | String pull hooks failed:", err); }
  // A bond reaches into a fight (its aura); its ●●● signature lasts one roll and comes back with a long rest.
  try { TSLBondAuras.register(); TSLBondMoments.registerHooks(); TSLBondPowers.registerRestHooks(); }
  catch (err) { console.error("TSL | bond powers failed:", err); }
  // On every screen: a bonded one's token in reach wears the bond, and the corner panel lists it.
  try { TSLBondNear.register(); }
  catch (err) { console.error("TSL | bonds in reach failed:", err); }
  try { SocialHUD.register(); }
  catch (err) { console.error("TSL | SocialHUD failed:", err); }
  // An actor deleted from the world takes its bonds and Strings with it (the active GM tidies up).
  Hooks.on("deleteActor", (actor) => {
    if (!game.user.isGM || (game.users.activeGM && !game.users.activeGM.isSelf)) return;
    TSLBondStore.forget(actor.id).catch(err => console.warn("TSL | bond cleanup failed:", err));
  });

  console.log("TSL | Ready");
});
