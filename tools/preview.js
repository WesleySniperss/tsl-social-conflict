/**
 * tools/preview.js — render the module's windows to static HTML pages wrapped in
 * Foundry's own window chrome + core CSS, so they can be screenshotted outside a
 * live world (headless Chrome). Dev tooling only — never loaded by Foundry.
 *
 * Run:  node tools/preview.js <outDir> [foundryPublicDir]
 * Then: chrome --headless --screenshot=<png> --window-size=W,H file:///<outDir>/<page>.html
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { api: R, makeActor, settingsMap } = require("./harness.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "preview-out"));
// Foundry's resources/app/public dir (core CSS, fonts, icons): argv[3] or $FOUNDRY_PUBLIC.
const PUB = process.argv[3] ?? process.env.FOUNDRY_PUBLIC ?? "D:/Games/FVTT/Foundry Virtual Tabletop/resources/app/public";
// Optional portraits: $TSL_PREVIEW_PORTRAITS = a folder with any two images (a.webp, b.webp);
// without it everyone wears Foundry's mystery-man.
const PORTRAITS = process.env.TSL_PREVIEW_PORTRAITS;
const portrait = (file) => url(PORTRAITS ? `${PORTRAITS}/${file}` : `${PUB}/icons/svg/mystery-man.svg`);
fs.mkdirSync(OUT, { recursive: true });

const url = (p) => "file:///" + p.replace(/\\/g, "/").replace(/ /g, "%20");
const SM = R.SocialManeuverRoller, EM = R.SocialEncounterManager, SAM = R.SocialArchetypeManager;
const CE = R.TSLConditionEffects;

// ── capture chat cards & dialogs ─────────────────────────────────────────────
const cards = [];
globalThis.ChatMessage.create = async (d) => { cards.push(d); return {}; };
const dialogs = [];
const BaseDialog = globalThis.Dialog;
globalThis.Dialog = class extends BaseDialog {
  render() { dialogs.push(this.cfg); return super.render(); }
};

// ── a small cast ─────────────────────────────────────────────────────────────
const lyra = makeActor("lyra", { cha: 4, wis: 1, int: 1 });
lyra.name = "Lyra Vane"; lyra.img = portrait("a.webp");
const roell = makeActor("roell", { cha: 3, wis: 2, int: 1 });
roell.name = "Captain Roell"; roell.img = portrait("b.webp"); roell.hasPlayerOwner = false;
const mira = makeActor("mira", { cha: 2, wis: 2, int: 2 });
mira.name = "Mira Ashgrove"; mira.img = url(`${PUB}/icons/svg/mystery-man.svg`);
for (const a of [lyra, roell, mira]) a.system.skills = {
  per: { mod: 5, total: 7, proficient: 1 }, dec: { mod: 4, total: 6, proficient: 1 },
  itm: { mod: 4, total: 4 }, prf: { mod: 4, total: 6, proficient: 1 }, ins: { mod: 1, total: 3, proficient: 1 },
  inv: { mod: 1, total: 1 }, his: { mod: 1, total: 1 },
};
const tok = (a) => ({ id: "t-" + a.id, actor: a, name: a.name, visible: true, document: { hidden: false, actorId: a.id } });
globalThis.canvas.tokens.placeables = [tok(lyra), tok(roell), tok(mira)];
globalThis.canvas.scene = { id: "scene1" };
globalThis.game.scenes = Object.assign([], { active: { id: "scene1" } });

async function setup() {
  await SAM.setActorData(lyra, { triad: { power: 1, attention: 2, order: 1 } });
  await SAM.setArchetype(roell, "tyrant");
  await SAM.setActorData(roell, { intent: "Keep the river gate shut until the duke arrives.",
    points: { desire: "To be obeyed without asking twice", fear: "Looking weak before his men", weakness: "His late brother's honour", mask: "Calm, bored authority", line: "He will never kneel in public" } });
  await R.TSLBondStore.add("lyra", "roell", { type: "rival", attitude: 2 });
  await R.TSLBondStore.add("lyra", "mira", { type: "lover", attitude: 3 });
  await EM.startEncounter(lyra, 5, 4);
  await EM.startEncounter(roell, 5, 3);
  await EM.adjustPatience(lyra, -2);
  await EM.adjustResolve?.(roell, -1);
  await SAM.applyCondition(roell, "provoked", "lyra");
  await CE.applyOne(roell, "angry", "Lyra Vane", "lyra");
  await CE.setTier(roell, "angry", 2, "lyra");
  await CE.applyOne(lyra, "obsessed", "Mira Ashgrove", "mira");
  await R.TSLStringStore.add("lyra", "roell", 1);
}

// ── page shell ───────────────────────────────────────────────────────────────
const head = `<meta charset="utf-8"><base href="${url(PUB)}/">
<link rel="stylesheet" href="${url(PUB + "/fonts/fontawesome/css/all.min.css")}">
<link rel="stylesheet" href="${url(PUB + "/css/foundry2.css")}">
<link rel="stylesheet" href="${url(ROOT + "/styles/conflict.css")}">
<style>
  body { background: #2a2a30 url(${url(PUB + "/ui/denim075.png")}); margin:0; overflow:auto; position:static; height:auto; min-height:100vh; }
  .app.window-app { position: relative !important; margin: 16px; }
  #shot-chat { width: 320px; margin: 16px; }
</style>`;
const windowHTML = ({ id, classes = [], title, width, height, inner }) => `
<div id="${id}" class="app window-app ${classes.join(" ")}" style="width:${width}px;${height ? `height:${height}px;` : ""}">
  <header class="window-header flexrow draggable resizable">
    <h4 class="window-title">${title}</h4>
    <a class="header-button control close"><i class="fas fa-times"></i>Close</a>
  </header>
  <section class="window-content">${inner}</section>
</div>`;
const page = (name, body) => {
  const f = path.join(OUT, name + ".html");
  fs.writeFileSync(f, `<!doctype html><html><head>${head}</head><body class="vtt game system-a5e theme-dark">${body}</body></html>`);
  return f;
};

(async () => {
  await setup();
  const written = [];

  // Chronicle — every tab, GM and player
  const chron = async (actor, tab, extra = {}, who = "gm") => {
    game.user.isGM = who === "gm";
    const app = new R.SocialFencingApp(actor);
    app._tab = tab; Object.assign(app, extra);
    const html = app._buildHTML(await app.getData());
    game.user.isGM = true;
    return windowHTML({ id: `tsl-social-fencing-${actor.id}`, classes: ["tsl-fencing"], title: `${actor.name} — Chronicle`, width: 500, inner: html });
  };
  written.push(page("chronicle-profile-npc", await chron(roell, "profile")));
  written.push(page("chronicle-profile-pc", await chron(lyra, "profile", {}, "player")));
  written.push(page("chronicle-bonds", await chron(lyra, "bonds", { _expandedBonds: new Set(R.TSLBondStore.getList("lyra").slice(0, 1).map((b) => b.id)) })));
  written.push(page("chronicle-fencing-player", await chron(lyra, "fencing", { _fenceTargetId: "roell", _fenceManeuverId: "throw_gauntlet" }, "player")));
  written.push(page("chronicle-fencing-gm", await chron(roell, "fencing", { _fenceTargetId: "lyra", _fenceManeuverId: "flatter" })));
  for (const cat of ["start", "moves", "statuses"]) {
    written.push(page(`chronicle-codex-${cat}`, await chron(lyra, "codex", { _codexCat: cat })));
  }

  // Conflict window
  {
    const conds = Object.fromEntries((R.ConflictStore.CONDITIONS ?? []).map?.((c) => [c.id ?? c, false]) ?? []);
    R.ConflictStore.state = { active: true, selectedTokenIds: [], turn: 0, log: [], resolved: false, resolution: null,
      participants: [
        { tokenId: "t-lyra", actorId: "lyra", name: lyra.name, img: lyra.img, color: "#e8557a", stats: [], conditions: { ...conds } },
        { tokenId: "t-roell", actorId: "roell", name: roell.name, img: roell.img, color: "#9b6ee8", stats: [], conditions: { ...conds } },
      ] };
    for (const [nm, mvId, who] of [["conflict-empty", null, "gm"], ["conflict-move", "throw_gauntlet", "gm"], ["conflict-player", "flatter", "player"]]) {
      game.user.isGM = who === "gm";
      const app = new R.TSLConflictApp();
      Object.assign(app, { _pendingRoll: null, _selectedMove: mvId ? R.SOCIAL_MANEUVERS.find((m) => m.id === mvId) : null,
        _selectedTarget: 1, _pendingStringSpend: null, _pendingLeverage: null, _gmActingIdx: 0 });
      if (who === "player") lyra.isOwner = true, roell.isOwner = false;
      let inner;
      try { inner = app._renderHTML(await app.getData()); } catch (e) { inner = `<pre>${e.stack}</pre>`; }
      roell.isOwner = true;
      game.user.isGM = true;
      written.push(page(nm, windowHTML({ id: "tsl-social-conflict", classes: ["tsl-conflict"], title: "Social Conflict", width: 860, inner })));
    }
  }

  // Scene visualizer
  if (R.TSLSceneVisualizer) {
    const app = new R.TSLSceneVisualizer({ mode: "scene" });
    let inner;
    try { inner = app._renderHTML(); } catch (e) { inner = `<pre>${e.stack}</pre>`; }
    written.push(page("scene", windowHTML({ id: "tsl-scene-visualizer", classes: ["tsl-viz"], title: "Social Scene", width: 620, height: 640, inner })));
  }

  // Chat cards + the defence window, from a real maneuver
  {
    SM.promptOutcome = async () => "success";
    globalThis.__formPick = null;
    roell.hasPlayerOwner = true;                // force the window (PC-style "ask")
    const payload = { sourceActorId: "lyra", targetActorId: "roell", maneuverId: "flatter", outcomeType: "success",
      total: 19, dc: 15, natural: 14, card: { rawDice: [14], systemRoll: false } };
    try { await SM.applyOutcome(payload); } catch (e) { console.log("applyOutcome:", e.message); }
    try { await SM.applyOutcome({ ...payload, maneuverId: "sow_doubt", outcomeType: "failure", total: 9, natural: 6, card: { rawDice: [6] } }); } catch (e) { console.log(e.message); }
    roell.hasPlayerOwner = false;
    const li = (c) => `<li class="chat-message message flexcol"><header class="message-header flexrow"><h4 class="message-sender">${c.speaker?.alias ?? "Lyra Vane"}</h4><span class="message-metadata"><time class="message-timestamp">just now</time></span></header><div class="message-content">${c.content ?? ""}</div></li>`;
    written.push(page("chat", `<section id="shot-chat" class="sidebar-tab chat-sidebar"><ol id="chat-log" class="chat-log plain">${cards.map(li).join("")}</ol></section>`));
    const dl = dialogs.map((d) => windowHTML({ id: "dlg", classes: ["dialog", "tsl-dialog"], title: d.title ?? "Dialog", width: 420,
      inner: `<div class="dialog-content">${d.content ?? ""}</div><div class="dialog-buttons">${Object.entries(d.buttons ?? {}).map(([k, b]) => `<button class="dialog-button ${k} ${k === d.default ? "default" : ""}">${b.icon ?? ""} ${b.label ?? k}</button>`).join("")}</div>` })).join("");
    written.push(page("dialogs", dl || "<p>no dialogs</p>"));
  }

  console.log(written.map((f) => path.basename(f)).join("\n"));
})().catch((e) => { console.log("PREVIEW FAIL", e.stack); process.exit(1); });
