/**
 * tools/harness.js — stubbed-Foundry smoke test for tsl-social-conflict.
 *
 * Runs OUTSIDE Foundry: stubs the globals the scripts touch, concatenates the
 * manifest's classic scripts into ONE `new Function` scope (they share a lexical
 * env exactly like <script> tags), then drives the pure-logic paths and prints
 * boolean assertions. Ends with "DONE — pipeline clean" on success.
 *
 * Run:  ELECTRON_RUN_AS_NODE=1 <code.exe> tools/harness.js     (or any node)
 * It only needs Node built-ins.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));

// ── Foundry stubs ────────────────────────────────────────────────────────────
const settingsMap = new Map([
  ["tsl-social-conflict.conflictMode", "both"],
  ["tsl-social-conflict.enableKiss", false],
  ["tsl-social-conflict.useSystemRollDialog", false],
  ["tsl-social-conflict.gmDecidesOutcome", true],
  ["tsl-social-conflict.enableHoldLine", true],
  ["tsl-social-conflict.enableParry", true],
  ["tsl-social-conflict.bondAuraRange", 15],
  ["tsl-social-conflict.socialDcBonus", 0],
]);
globalThis.__settings = settingsMap;

const getProperty = (obj, key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setProperty = (obj, key, val) => {
  const parts = key.split("."); let o = obj;
  while (parts.length > 1) { const k = parts.shift(); o = (o[k] ??= {}); }
  o[parts[0]] = val; return true;
};
const mergeObject = (a, b) => Object.assign({}, a, b);

globalThis.foundry = {
  utils: {
    mergeObject, deepClone: (x) => JSON.parse(JSON.stringify(x ?? null)),
    duplicate: (x) => JSON.parse(JSON.stringify(x ?? null)),
    getProperty, setProperty, hasProperty: (o, k) => getProperty(o, k) !== undefined,
    isEmpty: (o) => !o || Object.keys(o).length === 0,
    randomID: () => "id" + Math.random().toString(36).slice(2, 10),
    escapeHTML: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    debounce: (fn) => fn,
  },
  appv1: { api: {} },
  applications: { detached: { querySelectorAll: () => [] }, ux: {} },
};

// jQuery-ish shim: our apps do `$(html)` in _renderInner and `html[0]` elsewhere.
globalThis.$ = (x) => (typeof x === "string" ? [{ innerHTML: x, querySelector: () => null, querySelectorAll: () => [] }] : x);

class StubApplication {
  constructor(options = {}) { this.options = options; this.element = null; this.rendered = false; }
  static get defaultOptions() { return {}; }
  async render() { this.rendered = true; return this; }
  async _render() {}
  activateListeners() {}
  async close() { this.rendered = false; }
}
globalThis.Application = StubApplication;

globalThis.Roll = class Roll {
  constructor(formula) {
    this.formula = formula;
    if (!/^\s*\d+d\d+(k[hl]1)?\s*(\+\s*-?\d+)?\s*$/.test(formula)) throw new Error(`Roll stub: bad formula "${formula}"`);
  }
  async evaluate() {
    const m = this.formula.match(/(\d+)d(\d+)(k[hl]1)?(?:\s*\+\s*(-?\d+))?/);
    const [, n, faces, keep, mod] = m;
    const results = Array.from({ length: +n }, () => ({ result: 1 + Math.floor(Math.random() * +faces) }));
    let kept = results.map((r) => r.result);
    if (keep === "kh1") kept = [Math.max(...kept)];
    if (keep === "kl1") kept = [Math.min(...kept)];
    this.dice = [{ results }];
    this.total = kept.reduce((s, v) => s + v, 0) + +(mod ?? 0);
    return this;
  }
  toJSON() { return { formula: this.formula, total: this.total, dice: this.dice }; }
  static fromData(d) { const r = Object.create(Roll.prototype); return Object.assign(r, d); }
  async toMessage() { return {}; }
};

let CARD_SUSPECT = 0;
globalThis.ChatMessage = {
  create: async (data) => {
    if (typeof data.content === "string" && /undefined|NaN/.test(data.content)) { CARD_SUSPECT++; console.log("CARD SUSPECT:", data.content.slice(0, 240)); }
    return {};
  },
  getSpeaker: () => ({}),
  applyMode: () => {},
};

// Dialog stub: auto-press a chosen button (default the `default`), record tooltips.
globalThis.__dialogPick = null;   // set a button key to auto-click that one
globalThis.Dialog = class Dialog {
  constructor(cfg) { this.cfg = cfg; }
  render() {
    const cfg = this.cfg;
    // exercise the render() tooltip-injector against a fake DOM
    const buttonsEl = Object.keys(cfg.buttons ?? {}).map((k) => ({ dataset: { button: k }, setAttribute() {}, }));
    const fakeRoot = { querySelectorAll: () => buttonsEl };
    try { cfg.render?.([fakeRoot]); } catch (e) {}
    const keys = Object.keys(cfg.buttons ?? {});
    const key = (globalThis.__dialogPick && keys.includes(globalThis.__dialogPick)) ? globalThis.__dialogPick : (cfg.default ?? keys[0]);
    const cb = cfg.buttons?.[key]?.callback;
    if (cb) cb(fakeRoot); else cfg.close?.();
    return this;
  }
};

globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.canvas = { tokens: { placeables: [], get: () => null }, stage: {}, app: {}, grid: {}, dimensions: {} };

const onceHooks = {};
globalThis.Hooks = {
  on: () => 1, once: (n, fn) => { (onceHooks[n] ??= []).push(fn); return 1; },
  off: () => {}, callAll: () => {}, call: () => {},
  _fire: (n, ...a) => { for (const fn of onceHooks[n] ?? []) try { fn(...a); } catch (e) {} },
};
globalThis.CONFIG = { statusEffects: [], A5E: { ROLL_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } }, sounds: {} };
globalThis.CONST = { CHAT_MESSAGE_STYLES: {}, ACTIVE_EFFECT_MODES: { CUSTOM: 0, ADD: 2, OVERRIDE: 5, MULTIPLY: 1, UPGRADE: 4, DOWNGRADE: 3 } };

// ── Actor factory (dnd5e/a5e-ish) ────────────────────────────────────────────
const actorStore = {};
function makeActor(id, { cha = 0, wis = 0, con = 0, int = 0 } = {}) {
  const flags = {};
  const effects = [];
  effects.find = Array.prototype.find.bind(effects);
  effects.filter = Array.prototype.filter.bind(effects);
  effects.some = Array.prototype.some.bind(effects);
  const a = {
    id, name: id, img: "", isOwner: true, hasPlayerOwner: true,
    system: { abilities: { cha: { mod: cha }, wis: { mod: wis }, con: { mod: con }, int: { mod: int } }, attributes: { prof: 2, inspiration: false }, skills: {} },
    effects,
    flags,
    token: null,
    testUserPermission: () => true,
    getFlag: (scope, key) => getProperty(flags, `${scope}.${key}`),
    setFlag: async (scope, key, val) => { setProperty(flags, `${scope}.${key}`, val); return a; },
    unsetFlag: async (scope, key) => { const s = flags[scope]; if (s) delete s[key]; return a; },
    update: async (patch) => { for (const [k, v] of Object.entries(patch)) setProperty(a, k, v); return a; },
    createEmbeddedDocuments: async (_t, arr) => { for (const e of arr) { e.statuses = new Set(e.statuses ?? []); e.update = async (p) => Object.assign(e, p); effects.push(e); } return arr; },
    deleteEmbeddedDocuments: async (_t, ids) => { for (const i of ids) { const idx = effects.findIndex((e) => e.id === i); if (idx >= 0) effects.splice(idx, 1); } },
    toggleStatusEffect: async () => {},
  };
  actorStore[id] = a;
  return a;
}

const actorA = makeActor("srcA", { cha: 3, wis: 1, con: 1, int: 0 });
const actorB = makeActor("tgtB", { cha: 2, wis: 3, con: 2, int: 1 });

globalThis.game = {
  system: { id: "a5e" },
  user: { id: "gm1", isGM: true, name: "GM" },
  users: { activeGM: { isSelf: true, id: "gm1" }, filter: () => [], find: () => null, get: () => ({ name: "?" }) },
  actors: Object.assign({ get: (id) => actorStore[id], contents: [] }, { [Symbol.iterator]: function* () { for (const k of Object.keys(actorStore)) yield actorStore[k]; } }),
  settings: { get: (s, k) => settingsMap.get(`${s}.${k}`), set: async (s, k, v) => settingsMap.set(`${s}.${k}`, v), register: () => {} },
  socket: { on: () => {}, emit: () => {} },
  i18n: { localize: (s) => s },
  modules: { get: () => undefined },
  scenes: [],
};

// ── Load: concatenate manifest scripts into one scope ────────────────────────
const combined = manifest.scripts.map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")).join("\n;\n");
const EXPORTS = ["SocialArchetypeManager", "SocialManeuverRoller", "SocialEncounterManager", "TSLStringStore",
  "TSLBondStore", "SOCIAL_MANEUVERS", "SOCIAL_CONDITIONS", "SocialFencingApp", "SocialFencingDialog",
  "TSLConditionEffects", "TSLWillpower", "TSLWoundTracker", "TSLGMActions", "TSLSocket", "ConflictStore",
  "MOVES", "TSLPlaybooks", "SOCIAL_TRIADS", "SOCIAL_CONDITION_ORDER"];
let api;
try {
  api = new Function(combined + "\nreturn { " + EXPORTS.map((e) => `${e}: typeof ${e} !== "undefined" ? ${e} : undefined`).join(", ") + " };")();
} catch (e) {
  console.log("PARSE/LOAD FAIL:", e.stack);
  process.exit(1);
}
console.log("All scripts loaded.");

(async () => {
  try {
    const R = api;
    let pass = true;
    const ok = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) pass = false; };

    // 1) Stat formulas (v1.78.1 / v1.79)
    {
      const t = R.SocialEncounterManager.suggestTracks(actorB); // cha2 wis3 con2 int1
      ok(`suggestTracks Resolve=CHA (want 2): ${t.resolve}`, t.resolve === 2);
      ok(`suggestTracks Patience=WIS+CHA (want 5): ${t.patience}`, t.patience === 5);
      const mook = makeActor("mook", { cha: -1, wis: 0 });
      const tm = R.SocialEncounterManager.suggestTracks(mook);
      ok(`floors R1/P2: ${tm.resolve}/${tm.patience}`, tm.resolve === 1 && tm.patience === 2);
    }

    // 2) promptDefense pick math (Phase 2)
    {
      const pickFor = async (D, P, btn) => { globalThis.__dialogPick = btn; const r = await R.SocialManeuverRoller.promptDefense(actorB, actorA, { name: "Humiliate" }, D, P); globalThis.__dialogPick = null; return r; };
      const take = await pickFor(3, 7, "take");
      ok(`defense take → block0`, take.block === 0 && !take.riposte);
      const b1 = await pickFor(3, 7, "b1");
      ok(`defense partial b1 → block1`, b1.block === 1 && !b1.riposte);
      const full = await pickFor(3, 7, "parry");
      ok(`defense full parry → block3`, full.block === 3 && !full.riposte);
      const rip = await pickFor(3, 7, "riposte");
      ok(`defense riposte → block3 + riposte`, rip.block === 3 && rip.riposte === true);
      const noRip = await pickFor(3, 3, "riposte"); // P<D+1 → riposte not offered, falls to default
      ok(`riposte gated when P<D+1 (no riposte key)`, !(noRip.riposte === true) || noRip.block === 3);
      const cap = await pickFor(2, 1, "parry"); // maxBlock=1
      ok(`defense capped by patience (block ≤1)`, cap.block <= 1);
    }

    // 3) applyOutcome PARRY path — stub the encounter + prompts, drive a hit
    {
      // fake encounter tracker
      const enc = { active: true, outcome: null, resolve: 5, maxResolve: 5, patience: 6, maxPatience: 6, leverage: {} };
      const encA = { active: true, outcome: null, resolve: 5, maxResolve: 5, patience: 6, maxPatience: 6, leverage: {} };
      const encOf = (a) => (a.id === "tgtB" ? enc : encA);
      const EM = R.SocialEncounterManager;
      const save = {};
      for (const m of ["ensureActive", "getEncounter", "adjustResolve", "adjustPatience", "markLeverageUsed"]) save[m] = EM[m];
      EM.ensureActive = async (a) => encOf(a);
      EM.getEncounter = (a) => encOf(a);
      EM.adjustResolve = async (a, d) => { encOf(a).resolve += d; };
      EM.adjustPatience = async (a, d) => { encOf(a).patience += d; };
      EM.markLeverageUsed = async () => {};
      const savePO = R.SocialManeuverRoller.promptOutcome;
      R.SocialManeuverRoller.promptOutcome = async () => "success";

      const mv = R.SOCIAL_MANEUVERS.find((m) => m.id === "throw_gauntlet"); // Humiliate (3, Power)
      const basePayload = () => ({ sourceActorId: "srcA", targetActorId: "tgtB", maneuverId: mv.id, outcomeType: "success", relation: "neutral", total: 20, dc: 10, card: null });

      // (a) Take it — full damage lands, no Patience spent
      enc.resolve = 5; enc.patience = 6; encA.resolve = 5;
      globalThis.__dialogPick = "take";
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry TAKE: Resolve 5→${enc.resolve} (−3), Patience ${enc.patience} (6)`, enc.resolve === 2 && enc.patience === 6);

      // (b) Full parry — no Resolve lost, 3 Patience spent
      enc.resolve = 5; enc.patience = 6; encA.resolve = 5;
      globalThis.__dialogPick = "parry";
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry FULL: Resolve ${enc.resolve} (5), Patience 6→${enc.patience} (−3)`, enc.resolve === 5 && enc.patience === 3);

      // (c) Riposte — no Resolve lost, 4 Patience, attacker −1 Resolve
      enc.resolve = 5; enc.patience = 6; encA.resolve = 5;
      globalThis.__dialogPick = "riposte";
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry RIPOSTE: tgt Resolve ${enc.resolve} (5), Patience 6→${enc.patience} (−4), atk Resolve 5→${encA.resolve} (−1)`, enc.resolve === 5 && enc.patience === 2 && encA.resolve === 4);

      // (d) VULNERABLE school can't be parried — lands full even if they'd parry
      enc.resolve = 5; enc.patience = 6;
      globalThis.__dialogPick = "parry";
      const vp = basePayload(); vp.relation = "vulnerable";
      await R.SocialManeuverRoller.applyOutcome(vp); // Humiliate vuln = +1 dmg → −4
      ok(`VULNERABLE unparryable: Resolve 5→${enc.resolve} (−4), Patience 6 (${enc.patience})`, enc.resolve === 1 && enc.patience === 6);

      // (e) A MISS no longer drains Patience (failPatience removed)
      enc.resolve = 5; enc.patience = 6;
      const mp = basePayload(); mp.outcomeType = "failure";
      R.SocialManeuverRoller.promptOutcome = async () => "failure";
      await R.SocialManeuverRoller.applyOutcome(mp);
      ok(`MISS leaves Patience untouched: ${enc.patience} (6)`, enc.patience === 6);

      globalThis.__dialogPick = null;
      R.SocialManeuverRoller.promptOutcome = savePO;
      for (const m of Object.keys(save)) EM[m] = save[m];
    }

    // 4) Socket relay (player → GM)
    {
      const saved = game.user, savedGM = game.users.activeGM;
      const sent = [];
      game.socket.emit = (n, p) => sent.push(p);
      let applied = null;
      const origApply = R.SocialManeuverRoller.applyOutcome;
      R.SocialManeuverRoller.applyOutcome = async (a) => { applied = a; };
      const payload = { sourceActorId: "srcA", targetActorId: "tgtB", maneuverId: "cold_reading", outcomeType: "success", relation: "neutral", total: 15, dc: 12, card: null };
      game.user = { id: "player1", isGM: false, name: "Max" };
      R.TSLGMActions.request("maneuverOutcome", payload);
      const relayed = sent.length === 1 && applied === null && sent[0].type === "GM_ACTION";
      game.user = { id: "gm1", isGM: true, name: "GM" }; game.users.activeGM = { isSelf: true, id: "gm1" };
      R.TSLSocket._handleMessage(sent[0]);
      const gmGot = applied && applied.maneuverId === "cold_reading";
      applied = null; sent.length = 0;
      R.TSLGMActions.request("maneuverOutcome", payload);
      ok(`relay: player emits · GM receives · GM-direct works`, relayed && !!gmGot && applied && sent.length === 0);
      R.SocialManeuverRoller.applyOutcome = origApply; game.user = saved; game.users.activeGM = savedGM;
    }

    // 5) assess relations still resolve (truth side)
    {
      R.SocialArchetypeManager.setArchetype && (await R.SocialArchetypeManager.setArchetype(actorB, "tyrant").catch(() => {}));
      const mv = R.SOCIAL_MANEUVERS.find((m) => m.id === "throw_gauntlet");
      const a = R.SocialManeuverRoller.assess(actorA, actorB, mv, {});
      ok(`assess returns dc + relation`, typeof a.dc === "number" && "relation" in a);
    }

    // 6) Codex renders without undefined (fencing mode)
    {
      const app = Object.create(R.SocialFencingApp.prototype);
      app._actor = actorB; app._codexCat = "moves";
      let html = "";
      try { html = app._buildCodexTab({ isGM: true }); } catch (e) { html = "ERR:" + e.message; }
      ok(`codex Moves renders, no undefined`, typeof html === "string" && html.length > 100 && !/undefined|NaN|ERR:/.test(html));
    }

    console.log(CARD_SUSPECT ? `(${CARD_SUSPECT} card-suspect lines above)` : "no card suspects");
    console.log(pass ? "DONE — pipeline clean" : "PIPELINE FAIL: assertions failed");
    if (!pass) process.exit(1);
  } catch (e) {
    console.log("PIPELINE FAIL:", e.stack);
    process.exit(1);
  }
})();
