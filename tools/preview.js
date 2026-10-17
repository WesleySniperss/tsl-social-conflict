/**
 * tools/preview.js — render the module's windows to static HTML pages wrapped in
 * Foundry's own window chrome + core CSS, so they can be screenshotted outside a
 * live world (headless Chrome). Dev tooling only — never loaded by Foundry.
 *
 * Run:   node tools/preview.js <outDir> [foundryPublicDir] [--shoot] [--only=a,b] [--lang=uk]
 *   --shoot   also screenshots every page with headless Chrome ($CHROME or the
 *             default install path) into <outDir>/<page>.png
 *   --only    limit to page names containing one of the given fragments
 *   --lang    the module's language for every page (en | uk; default en)
 * Env:   FOUNDRY_PUBLIC          Foundry's resources/app/public dir
 *        TSL_PREVIEW_PORTRAITS   a folder with a.webp / b.webp (optional portraits)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { api: R, makeActor } = require("./harness.js");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]));
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const positional = args.filter((a) => !a.startsWith("--"));
const LANG = (args.find((a) => a.startsWith("--lang=")) ?? "").slice(7) || "en";
R.TSLi18n.setLanguage(LANG);

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(positional[0] ?? path.join(ROOT, "preview-out"));
const PUB = positional[1] ?? process.env.FOUNDRY_PUBLIC ?? "D:/Games/FVTT/Foundry Virtual Tabletop/resources/app/public";
const PORTRAITS = process.env.TSL_PREVIEW_PORTRAITS;
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const url = (p) => "file:///" + p.replace(/\\/g, "/").replace(/ /g, "%20");
const portrait = (file) => url(PORTRAITS ? `${PORTRAITS}/${file}` : `${PUB}/icons/svg/mystery-man.svg`);
const T = R.TSLTalk, SAM = R.SocialArchetypeManager, BS = R.TSLBondStore, SS = R.TSLStringStore;

// ── capture chat cards & dialogs ─────────────────────────────────────────────
const cards = [];
globalThis.ChatMessage.create = async (d) => { const m = { ...d, update: async (p) => Object.assign(m, p) }; cards.push(m); return m; };
const dialogs = [];
const BaseDialog = globalThis.Dialog;
globalThis.Dialog = class extends BaseDialog {
  constructor(cfg, opts) { super(cfg, opts); this.opts = opts; }
  render() { dialogs.push({ ...this.cfg, opts: this.opts }); return super.render(); }
};

// ── a small cast ─────────────────────────────────────────────────────────────
const face = { per: { total: 7, proficient: 1 }, dec: { total: 6, proficient: 1 }, itm: { total: 3 }, prf: { total: 6, proficient: 1 },
  ins: { total: 3, proficient: 1 }, inv: { total: 1 }, his: { total: 1 }, ath: { total: 0 } };
const npcSk = { per: { total: 5 }, dec: { total: 4 }, itm: { total: 6 }, prf: { total: 2 }, ins: { total: 4 } };
const cast = (id, name, img, stats, npc = false) => {
  const a = makeActor(id, stats, { npc, prof: npc ? 2 : 3, skills: npc ? npcSk : face });
  a.name = name; a.img = img;
  return a;
};
const lyra  = cast("lyra", "Lyra Vane", portrait("a.webp"), { cha: 4, wis: 1, int: 1 });
const mira  = cast("mira", "Mira Ashgrove", url(`${PUB}/icons/svg/mystery-man.svg`), { cha: 2, wis: 2, int: 2 });
const roell = cast("roell", "Captain Roell", portrait("b.webp"), { cha: 3, wis: 2, int: 1 }, true);
const duke  = cast("duke", "Duke Halvard", portrait("b.webp"), { cha: 4, wis: 3, int: 2 }, true);
const ilse  = cast("ilse", "Sister Ilse", url(`${PUB}/icons/svg/mystery-man.svg`), { cha: 1, wis: 3, int: 1 }, true);
const tok = (a) => ({ id: "t-" + a.id, actor: a, name: a.name, visible: true, document: { hidden: false, actorId: a.id }, texture: { src: a.img } });
globalThis.canvas.tokens.placeables = [tok(lyra), tok(mira), tok(roell), tok(duke), tok(ilse)];
game.users.filter = () => [{ id: "gm1", isGM: true }];

async function setup() {
  await SAM.setActorData(lyra, { triad: { power: 1, attention: 2, order: 1 }, notes: "Third daughter of a ruined house. Talks her way in, then out." });
  await SAM.setArchetype(roell, "tyrant");
  await SAM.setArchetype(duke, "machiavellian");
  await SAM.setArchetype(ilse, "dogmatic");
  await SAM.setActorData(roell, { intent: "Keep the river gate shut until the duke arrives.",
    points: { desire: "To be obeyed without asking twice", fear: "Looking weak before his men", mask: "Calm, bored authority", line: "He will never kneel in public" } });
  await SAM.setActorData(ilse, { intent: "Find out who let the heretic out.",
    points: { desire: "A clean confession", fear: "That the abbess is the heretic", mask: "Patient, cold courtesy", line: "She will not lie under the roof of the chapel" } });
  await BS.add("lyra", "roell", { type: "rival", attitude: 2 });
  await BS.add("lyra", "mira", { type: "lover", attitude: 3 });
  await BS.add("mira", "ilse", { type: "ally", attitude: 1 });
  await SS.add("lyra", "roell", 1);
  // The faces they show: Roell his own, the duke a mask (a Schemer playing the Caretaker), Ilse a mask too.
  await SAM.setActorData(roell, { maskId: "tyrant" });
  await SAM.setActorData(duke, { maskId: "caretaker" });
  await SAM.setActorData(ilse, { maskId: "martyr" });
}

// ── page shell ───────────────────────────────────────────────────────────────
const head = `<meta charset="utf-8"><base href="${url(PUB)}/">
<link rel="stylesheet" href="${url(PUB + "/fonts/fontawesome/css/all.min.css")}">
<link rel="stylesheet" href="${url(PUB + "/css/foundry2.css")}">
<link rel="stylesheet" href="${url(ROOT + "/styles/tsl.css")}">
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
const pages = [];
const page = (name, body, w = 560, h = 1200) => {
  if (only.length && !only.some((o) => name.includes(o))) return;
  const file = path.join(OUT, name + ".html");
  fs.writeFileSync(file, `<!doctype html><html><head>${head}</head><body class="vtt game system-a5e theme-dark"><div id="shot-root">${body}</div></body></html>`);
  pages.push({ name, file, w, h });
};
const safe = async (fn) => { try { return await fn(); } catch (e) { return `<pre style="color:#f88;white-space:pre-wrap">${e.stack}</pre>`; } };

(async () => {
  await setup();

  const chron = async (actor, tab, extra = {}, who = "gm") => {
    game.user.isGM = who === "gm";
    const app = new R.SocialFencingApp(actor);
    app._tab = tab; Object.assign(app, extra);
    const html = await safe(async () => app._buildHTML(await app.getData()));
    game.user.isGM = true;
    return windowHTML({ id: `tsl-social-fencing-${actor.id}`, classes: ["tsl-fencing"], title: app.title, width: 520, inner: html });
  };

  // ── Chat cards from the real pipeline: an evening at the river gate ──
  {
    const r = async (src, tgt, opts, dice, queue = []) => {
      globalThis.__dialogQueue = [...queue];
      globalThis.__forceDice = [...dice];
      const p = await T.roll(src, tgt, opts);
      globalThis.__forceDice = null;
      globalThis.__dialogQueue = [];
      return p;
    };
    await r(lyra, roell, { technique: "read" }, [14], ["o2"]);                               // Read: what would open him? (the key)
    await r(lyra, roell, { technique: "appeal", size: "costly" }, [6, 3], ["pay"]);           // his key: yes, but — on her knee
    await r(mira, roell, { technique: "demand", size: "small" }, [16, 4]);                   // his wall, but it lands: he gives in, and remembers
    await r(mira, roell, { technique: "bargain", size: "costly" }, [3]);                     // a no: he leaves her Frightened, the door closes
    await r(lyra, roell, { technique: "bargain", size: "costly", witnesses: true }, [9], ["pay"]); // before his men: he hardens (−2), yet gives — everyone saw it
    await r(mira, duke, { technique: "read" }, [17], ["o1", "o0"]);                          // a strong Read: his Fear and his Desire
    await r(lyra, duke, { technique: "blackmail", size: "against" }, [11]);                  // his Fear: an enemy, Frightened
    await r(lyra, duke, { technique: "deceive", size: "costly" }, [17, 9]);                  // a lie into his wall — it holds
    await r(mira, duke, { technique: "seduce", size: "small" }, [5, 2]);                     // his Desire
    await T.exposeLie(duke, T.lies(duke)[0]?.id);                                            // the lie comes out
    await SS.add("lyra", "duke", 1);
    await R.TSLEmotions.hurt({ holderId: "lyra", targetId: "duke", emotion: "insecure" });   // Lyra pulls a String: he's Insecure
    await R.TSLEmotions.clear(mira, "frightened", "lyra");                                    // Lyra comforts Mira
  }
  const li = (c) => `<li class="chat-message message flexcol"><header class="message-header flexrow"><h4 class="message-sender">${c.speaker?.alias ?? "Lyra Vane"}</h4><span class="message-metadata"><time class="message-timestamp">just now</time></span></header><div class="message-content">${c.content ?? ""}</div></li>`;
  for (let i = 0; i < cards.length; i += 4) {
    page(`chat-${i / 4 + 1}`, `<section id="shot-chat" class="sidebar-tab chat-sidebar"><ol id="chat-log" class="chat-log plain">${cards.slice(i, i + 4).map(li).join("")}</ol></section>`, 340, 1700);
  }

  // Sister Ilse: unread, her Desire known, Guilty toward Mira, and a lie of Lyra's on record.
  // Lyra carries an emotion and a scar; Mira is Angry — for the windows.
  await SAM.setKnown(ilse, { desire: true });
  await R.TSLEmotions.add(ilse, "guilty", { by: "mira", toward: "mira" });
  await R.TSLEmotions.add(lyra, "angry", { by: "duke" });
  await R.TSLEmotions.add(lyra, "angry", { by: "duke" });
  await R.TSLEmotions.add(lyra, "hopeless", { by: "duke" });
  await R.TSLEmotions.add(mira, "angry", { by: "roell" });
  await ilse.setFlag("tsl-social-conflict", "lies", [{ id: "lie1", byId: "lyra", at: Date.now() }]);

  page("chronicle-profile-npc", await chron(roell, "profile"), 560, 1250);
  page("chronicle-profile-npc-player", await chron(duke, "profile", {}, "player"), 560, 1000);
  page("chronicle-profile-pc", await chron(lyra, "profile", {}, "player"), 560, 620);
  page("chronicle-bonds", await chron(lyra, "bonds", { _expandedBonds: new Set(BS.getList("lyra").slice(0, 1).map((b) => b.id)) }, "player"), 560, 700);
  page("chronicle-talk-player", await chron(mira, "talk", { _tTarget: "ilse", _tTech: "appeal", _tSize: "costly", _tHelper: "lyra", _tLever: "desire", _tWitnesses: true }, "player"), 560, 1250);
  page("chronicle-talk-blackmail", await chron(mira, "talk", { _tTarget: "ilse", _tTech: "blackmail", _tSize: "against" }, "player"), 560, 1150);
  page("chronicle-talk-read", await chron(lyra, "talk", { _tTarget: "ilse", _tTech: "read" }, "player"), 560, 1050);
  page("chronicle-talk-named", await chron(lyra, "talk", { _tTarget: "duke", _tTech: "appeal", _tSize: "small" }, "player"), 560, 1150);
  page("chronicle-talk-result", await chron(lyra, "talk", { _tTarget: "duke",
    _tResult: { technique: "appeal", grade: "success", total: 18, dc: 15, rel: "key", paid: true, witnesses: true, audience: -2 } }, "player"), 560, 1000);
  page("chronicle-talk-result-read", await chron(mira, "talk", { _tTarget: "duke",
    _tResult: { technique: "read", grade: "strong", total: 21, dc: 15, rel: "plain", questions: ["fear"], readString: true } }, "player"), 560, 1000);
  page("chronicle-talk-notarget", await chron(lyra, "talk", {}, "player"), 560, 400);
  page("chronicle-talk-gm", await chron(lyra, "talk", { _tTarget: "ilse", _tTech: "bargain" }), 560, 1250);
  page("chronicle-talk-npc-gm", await chron(ilse, "talk"), 560, 1000);
  for (const cat of ["start", "ap", "read", "emo", "natures", "bonds", "gm"]) {
    page(`chronicle-codex-${cat}`, await chron(lyra, "codex", { _codexCat: cat }), 560, 1500);
  }

  // ── The Social Scene ──
  for (const mode of ["scene", "world"]) {
    const app = new R.TSLSceneVisualizer({ mode });
    const inner = await safe(() => app._renderHTML());
    page(`scene-${mode}`, windowHTML({ id: mode === "world" ? "tsl-relationship-visualizer" : "tsl-scene-visualizer", classes: ["tsl-viz"], title: mode === "world" ? "Web of Bonds" : "Social Scene", width: 620, height: 640, inner }), 660, 700);
  }

  // ── Dialogs (each prompt once, captured as built) ──
  {
    dialogs.length = 0;
    await T.promptPrice(duke, T.priceOf(duke));
    await T.promptPrice(roell, T.priceOf(roell));
    await T.promptQuestions(ilse, 2, { string: true });
    await T.promptStringBurn(lyra, roell, 12, 14, 1);
    await new R.SocialFencingApp(lyra)._promptPull(roell);
    await new R.SocialFencingApp(lyra)._promptHurt(roell);
    await new R.SocialFencingApp(lyra)._promptLetGo(lyra, "angry");
    const dl = dialogs.map((d) => windowHTML({ id: "dlg", classes: d.opts?.classes ?? ["dialog"], title: d.title ?? "Dialog", width: d.opts?.width ?? 400,
      inner: `<div class="dialog-content">${d.content ?? ""}</div><div class="dialog-buttons">${Object.entries(d.buttons ?? {}).map(([k, b]) => `<button class="dialog-button ${k} ${k === d.default ? "default bright" : ""}">${b.icon ?? ""} ${b.label ?? k}</button>`).join("")}</div>` })).join("");
    page("dialogs", dl || "<p>no dialogs</p>", 520, 1700);
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
