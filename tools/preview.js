/**
 * tools/preview.js — render the module's windows to static HTML pages wrapped in
 * Foundry's own window chrome + core CSS, so they can be screenshotted outside a
 * live world (headless Chrome). Dev tooling only — never loaded by Foundry.
 *
 * Run:   node tools/preview.js <outDir> [foundryPublicDir] [--shoot] [--only=a,b]
 *   --shoot   also screenshots every page with headless Chrome ($CHROME or the
 *             default install path) into <outDir>/<page>.png
 *   --only    limit to page names containing one of the given fragments
 * Env:   FOUNDRY_PUBLIC          Foundry's resources/app/public dir
 *        TSL_PREVIEW_PORTRAITS   a folder with a.webp / b.webp (optional portraits)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { api: R, makeActor, settingsMap } = require("./harness.js");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]));
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const positional = args.filter((a) => !a.startsWith("--"));

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(positional[0] ?? path.join(ROOT, "preview-out"));
const PUB = positional[1] ?? process.env.FOUNDRY_PUBLIC ?? "D:/Games/FVTT/Foundry Virtual Tabletop/resources/app/public";
const PORTRAITS = process.env.TSL_PREVIEW_PORTRAITS;
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const url = (p) => "file:///" + p.replace(/\\/g, "/").replace(/ /g, "%20");
const portrait = (file) => url(PORTRAITS ? `${PORTRAITS}/${file}` : `${PUB}/icons/svg/mystery-man.svg`);
const SM = R.SocialManeuverRoller, EM = R.SocialEncounterManager, SAM = R.SocialArchetypeManager;
const CE = R.TSLConditionEffects;
const mv = (id) => R.SOCIAL_MANEUVERS.find((m) => m.id === id);

// A D&D world runs the fencing layer alone (the module's default since v1.42).
settingsMap.set("tsl-social-conflict.conflictMode", "fencing");

// ── capture chat cards & dialogs ─────────────────────────────────────────────
const cards = [];
// Cards behave like real ChatMessages: a roll card is UPDATED with what followed.
globalThis.ChatMessage.create = async (d) => { const m = { ...d, update: async (p) => Object.assign(m, p) }; cards.push(m); return m; };
const dialogs = [];
const BaseDialog = globalThis.Dialog;
globalThis.Dialog = class extends BaseDialog {
  constructor(cfg, opts) { super(cfg); this.opts = opts; }
  render() { dialogs.push({ ...this.cfg, opts: this.opts }); return super.render(); }
};

// ── a small cast ─────────────────────────────────────────────────────────────
const skills = () => ({
  per: { mod: 5, total: 7, proficient: 1 }, dec: { mod: 4, total: 6, proficient: 1 },
  itm: { mod: 4, total: 4 }, prf: { mod: 4, total: 6, proficient: 1 }, ins: { mod: 1, total: 3, proficient: 1 },
  inv: { mod: 1, total: 1 }, his: { mod: 1, total: 1 },
});
const cast = (id, name, img, stats, npc = false) => {
  const a = makeActor(id, stats);
  a.name = name; a.img = img; a.system.skills = skills();
  if (npc) a.hasPlayerOwner = false;
  return a;
};
const lyra  = cast("lyra", "Lyra Vane", portrait("a.webp"), { cha: 4, wis: 1, int: 1 });
const roell = cast("roell", "Captain Roell", portrait("b.webp"), { cha: 3, wis: 2, int: 1 }, true);
const mira  = cast("mira", "Mira Ashgrove", url(`${PUB}/icons/svg/mystery-man.svg`), { cha: 2, wis: 2, int: 2 });
const duke  = cast("duke", "Duke Halvard", portrait("b.webp"), { cha: 6, wis: 3, int: 2 }, true);
const tok = (a) => ({ id: "t-" + a.id, actor: a, name: a.name, visible: true, document: { hidden: false, actorId: a.id }, texture: { src: a.img } });
globalThis.canvas.tokens.placeables = [tok(lyra), tok(roell), tok(mira)];
globalThis.canvas.scene = { id: "scene1" };
globalThis.game.scenes = Object.assign([], { active: { id: "scene1" } });
game.users.filter = () => [{ id: "gm1", isGM: true }];

async function setup() {
  await SAM.setActorData(lyra, { triad: { power: 1, attention: 2, order: 1 } });
  await SAM.setArchetype(roell, "tyrant");
  await SAM.setArchetype(duke, "tyrant");
  await SAM.setActorData(roell, { intent: "Keep the river gate shut until the duke arrives.",
    points: { desire: "To be obeyed without asking twice", fear: "Looking weak before his men", weakness: "His late brother's honour", mask: "Calm, bored authority", line: "He will never kneel in public" } });
  await R.TSLBondStore.add("lyra", "roell", { type: "rival", attitude: 2 });
  await R.TSLBondStore.add("lyra", "mira", { type: "lover", attitude: 3 });
  await EM.ensureActive(lyra);
  await EM.ensureActive(roell);
  await EM.adjustComposure(lyra, -2);
  await EM.adjustComposure(roell, -3);
  await SAM.applyCondition(roell, "provoked", lyra);
  await SAM.applyCondition(roell, "guilted", lyra);
  await SAM.applyCondition(lyra, "rattled", roell);
  await CE.applyOne(roell, "shamed", "Lyra Vane", "lyra");
  await CE.setTier(roell, "shamed", 2, "Lyra Vane", "lyra");
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
  .app.window-app { position: relative !important; margin: 16px; max-height: none; }
  #shot-root { display: flex; flex-direction: column; align-items: flex-start; }
  #shot-chat { width: 300px; margin: 16px; }
</style>`;
const windowHTML = ({ id, classes = [], title, width, height, inner }) => `
<div id="${id}" class="app window-app ${classes.join(" ")}" style="width:${width}px;${height ? `height:${height}px;` : ""}">
  <header class="window-header flexrow draggable resizable">
    <h4 class="window-title">${title}</h4>
    <a class="header-button control close"><i class="fas fa-times"></i>Close</a>
  </header>
  <section class="window-content">${inner}</section>
</div>`;
const pages = [];   // { name, file, w, h }
const page = (name, body, w = 540, h = 1400) => {
  if (only.length && !only.some((o) => name.includes(o))) return;
  const file = path.join(OUT, name + ".html");
  fs.writeFileSync(file, `<!doctype html><html><head>${head}</head><body class="vtt game system-a5e theme-dark"><div id="shot-root">${body}</div></body></html>`);
  pages.push({ name, file, w, h });
};
const safe = async (fn) => { try { return await fn(); } catch (e) { return `<pre style="color:#f88;white-space:pre-wrap">${e.stack}</pre>`; } };

(async () => {
  await setup();

  // ── Chronicle — every tab, GM and player ──
  const chron = async (actor, tab, extra = {}, who = "gm") => {
    game.user.isGM = who === "gm";
    const app = new R.SocialFencingApp(actor);
    app._tab = tab; Object.assign(app, extra);
    const html = await safe(async () => app._buildHTML(await app.getData()));
    game.user.isGM = true;
    return windowHTML({ id: `tsl-social-fencing-${actor.id}`, classes: ["tsl-fencing"], title: `${actor.name} — Chronicle`, width: 500, inner: html });
  };
  page("chronicle-profile-npc", await chron(roell, "profile"), 540, 1150);
  page("chronicle-profile-pc", await chron(lyra, "profile", {}, "player"), 540, 800);
  page("chronicle-bonds", await chron(lyra, "bonds", { _expandedBonds: new Set(R.TSLBondStore.getList("lyra").slice(0, 1).map((b) => b.id)) }), 540, 950);
  page("chronicle-bonds-collapsed", await chron(lyra, "bonds"), 540, 420);
  page("chronicle-fencing-player", await chron(lyra, "fencing", { _fenceTargetId: "roell", _fenceManeuverId: "throw_gauntlet" }, "player"), 540, 1250);
  page("chronicle-fencing-notarget", await chron(lyra, "fencing", {}, "player"), 540, 700);
  page("chronicle-fencing-gm", await chron(roell, "fencing", { _fenceTargetId: "lyra", _fenceManeuverId: "flatter" }), 540, 1700);
  page("chronicle-fencing-result", await chron(lyra, "fencing", { _fenceTargetId: "roell", _fenceManeuverId: null,
    _fenceRoll: { name: "Flatter", icon: "fa-crown", target: "Captain Roell", total: 19, dc: 15, outcome: "success", natural: 14 } }, "player"), 540, 1250);
  for (const cat of ["start", "moves", "statuses", "openings", "feelings", "natures", "details", "gm"]) {
    page(`chronicle-codex-${cat}`, await chron(lyra, "codex", { _codexCat: cat }), 540, 1400);
  }

  // ── Conflict window ──
  {
    const conds = Object.fromEntries((R.ConflictStore.CONDITIONS ?? []).map?.((c) => [c.id ?? c, false]) ?? []);
    const part = (a, color) => ({ tokenId: "t-" + a.id, actorId: a.id, name: a.name, img: a.img, color, stats: [], conditions: { ...conds } });
    const live = { active: true, selectedTokenIds: [], turn: 0, log: [], resolved: false, resolution: null,
      participants: [part(lyra, "#e8557a"), part(roell, "#9b6ee8")] };
    const conflict = async (name, state, extra = {}, who = "gm", h = 900) => {
      R.ConflictStore.state = state;
      game.user.isGM = who === "gm";
      if (who === "player") { lyra.isOwner = true; roell.isOwner = false; }
      const app = new R.TSLConflictApp();
      Object.assign(app, { _pendingRoll: null, _selectedMove: null, _selectedTarget: 1, _pendingStringSpend: null,
        _pendingLeverage: null, _gmActingIdx: 0 }, extra);
      const inner = await safe(async () => app._renderHTML(await app.getData()));
      roell.isOwner = true; game.user.isGM = true;
      page(name, windowHTML({ id: "tsl-social-conflict", classes: ["tsl-conflict"], title: "Social Conflict", width: 860, inner }), 900, h);
    };
    await conflict("conflict-select", { active: false, selectedTokenIds: ["t-lyra"], participants: [], log: [] }, {}, "gm", 520);
    await conflict("conflict-empty", live, { _selectedTarget: null });
    await conflict("conflict-move", live, { _selectedMove: mv("throw_gauntlet") });
    await conflict("conflict-player", live, { _selectedMove: mv("flatter") }, "player");
    await conflict("conflict-result", live, { _pendingRoll: { kind: "maneuver", moveName: "Humiliate", icon: "fa-khanda", target: "Captain Roell", total: 22, dc: 15, outcome: "crit", natural: 18 } });
    await conflict("conflict-resolved", { ...live, resolved: true, resolution: "yield" }, {}, "gm", 600);
    R.ConflictStore.state = null;
  }

  // ── Social Scene ──
  if (R.TSLSceneVisualizer) {
    for (const mode of ["scene", "world"]) {
      const app = new R.TSLSceneVisualizer({ mode });
      const inner = await safe(() => app._renderHTML());
      page(`scene-${mode}`, windowHTML({ id: "tsl-scene-visualizer", classes: ["tsl-viz"], title: mode === "world" ? "Web of Bonds" : "Social Scene", width: 620, height: 640, inner }), 660, 700);
    }
  }

  // ── Dialogs (each prompt once, captured as built) ──
  {
    settingsMap.set("tsl-social-conflict.gmConfirmCloseOnly", false);
    await SM.promptOutcome(lyra, roell, mv("flatter"), 16, 15, "success", { natural: 9 });
    settingsMap.set("tsl-social-conflict.gmConfirmCloseOnly", true);
    await SM.promptRollMods("Flatter — situational modifiers", true);
    await SM.promptStringBurn(13, mv("flatter"), 2);
    await SM.promptHoldLine({ defender: lyra, attacker: roell, maneuver: mv("intimidate"), status: "cowed", holdOptions: ["scared", "spiteful"], stance: "ask" });
    await EM.promptBreak(lyra, roell);
    await new R.SocialFencingApp(lyra)._promptPull(roell);
    await new R.SocialFencingApp(lyra)._pickPeople("Rally — who hears you?", "many");
  }

  // ── Chat cards: one exchange against the Duke, the way a table would play it ──
  {
    SM.promptOutcome = async (_s, _t, _m, _tot, _dc, proposed) => proposed;
    await EM.startEncounter(duke, 14);   // a deep well of composure, so every kind of card shows up
    await EM.startEncounter(lyra, 9);    // and Lyra fresh for this scene
    await SAM.removeCondition(lyra, "rattled");
    // Real rolls (the same pipeline as the table: assess → rollManeuver →
    // applyOutcome), with the grade pinned so every kind of card shows up.
    const roll = async (id, outcomeType, dice) => {
      globalThis.__forceDice = [...dice];
      const p = await SM.rollManeuver(lyra, duke, mv(id), {});
      globalThis.__forceDice = null;
      if (!p) return console.log("no payload for", id);
      if (outcomeType) p.outcomeType = outcomeType;
      try { await SM.applyOutcome(p); } catch (e) { console.log("applyOutcome:", id, e.message); }
    };
    duke.hasPlayerOwner = true;   // the PC-style window once, so it's captured
    await roll("flatter", "success", [14, 9]);
    duke.hasPlayerOwner = false;  // then the NPC holds up by its nature (Stands firm)
    await roll("sow_doubt", "failure", [6]);
    await roll("persuade", "crit", [18]);
    await roll("lie", "botch", [3]);
    await roll("instigate", null, [15]);
    await roll("cold_reading", "success", [13]);
    await roll("throw_gauntlet", "success", [9]);
    const li = (c) => `<li class="chat-message message flexcol ${c.whisper?.length ? "whisper" : ""}"><header class="message-header flexrow"><h4 class="message-sender">${c.speaker?.alias ?? "Lyra Vane"}</h4><span class="message-metadata"><time class="message-timestamp">just now</time></span></header><div class="message-content">${c.content ?? ""}</div></li>`;
    for (let i = 0; i < cards.length; i += 4) {
      page(`chat-${i / 4 + 1}`, `<section id="shot-chat" class="sidebar-tab chat-sidebar"><ol id="chat-log" class="chat-log plain">${cards.slice(i, i + 4).map(li).join("")}</ol></section>`, 340, 1500);
    }
    const dl = dialogs.map((d) => windowHTML({ id: "dlg", classes: d.opts?.classes ?? ["dialog"], title: d.title ?? "Dialog", width: d.opts?.width ?? 400,
      inner: `<div class="dialog-content">${d.content ?? ""}</div><div class="dialog-buttons">${Object.entries(d.buttons ?? {}).map(([k, b]) => `<button class="dialog-button ${k} ${k === d.default ? "default bright" : ""}">${b.icon ?? ""} ${b.label ?? k}</button>`).join("")}</div>` })).join("");
    page("dialogs", dl || "<p>no dialogs</p>", 520, 2000);
  }

  console.log(pages.map((p) => p.name).join("\n"));

  if (flags.has("--shoot")) {
    if (!fs.existsSync(CHROME)) { console.log(`No Chrome at ${CHROME} — set $CHROME.`); return; }
    for (const p of pages) {
      execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
        "--virtual-time-budget=4000", `--screenshot=${path.join(OUT, p.name + ".png")}`, `--window-size=${p.w},${p.h}`, url(p.file)],
        { stdio: "ignore" });
    }
    console.log(`shot ${pages.length} pages → ${OUT}`);
  }
})().catch((e) => { console.log("PREVIEW FAIL", e.stack); process.exit(1); });
