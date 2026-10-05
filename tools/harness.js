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
  ["tsl-social-conflict.npcDefenseAuto", true],
  ["tsl-social-conflict.emotionalLayer", "full"],
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
    // `globalThis.__forceDice = [..]` feeds exact faces (consumed in order) for
    // deterministic tests; otherwise the dice are random.
    const face = () => (globalThis.__forceDice?.length ? globalThis.__forceDice.shift() : 1 + Math.floor(Math.random() * +faces));
    const results = Array.from({ length: +n }, () => ({ result: face() }));
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
// Form dialogs (radio groups) read `globalThis.__formPick = { <input name>: value }`.
globalThis.__dialogPick = null;   // set a button key to auto-click that one
globalThis.__formPick = null;
globalThis.__dialogCount = 0;     // how many dialogs actually opened
globalThis.Dialog = class Dialog {
  constructor(cfg) { this.cfg = cfg; }
  render() {
    const cfg = this.cfg;
    globalThis.__dialogCount++;
    // exercise the render() tooltip-injector against a fake DOM
    const buttonsEl = Object.keys(cfg.buttons ?? {}).map((k) => ({ dataset: { button: k }, setAttribute() {}, }));
    const fakeRoot = {
      querySelectorAll: () => buttonsEl,
      querySelector: (sel) => {
        const m = String(sel).match(/input\[name="?([\w-]+)"?\]:checked/);
        const v = m ? globalThis.__formPick?.[m[1]] : undefined;
        return v != null ? { value: v } : null;
      },
    };
    try { cfg.render?.([fakeRoot]); } catch (e) {}
    const keys = Object.keys(cfg.buttons ?? {});
    const key = (globalThis.__dialogPick && keys.includes(globalThis.__dialogPick)) ? globalThis.__dialogPick : (cfg.default ?? keys[0]);
    const cb = cfg.buttons?.[key]?.callback;
    // Foundry V1 dialogs hand callbacks a jQuery-like array — mirror that
    if (cb) cb([fakeRoot]); else cfg.close?.();
    return this;
  }
};

globalThis.HTMLElement = class HTMLElement {};   // browsers have it; dialog callbacks test `instanceof`
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
globalThis.__fxSeq = 0;
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
    // Effects get an id (deletion is by id) and an update() that honours dotted
    // keys like Foundry does ("flags.tsl-social-conflict.tier").
    createEmbeddedDocuments: async (_t, arr) => {
      for (const e of arr) {
        e.id ??= "fx" + (++globalThis.__fxSeq);
        e.statuses = new Set(e.statuses ?? []);
        e.update = async (p) => {
          for (const [k, v] of Object.entries(p)) setProperty(e, k, k === "statuses" ? new Set(v) : v);
          return e;
        };
        effects.push(e);
      }
      return arr;
    },
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
  "TSLConditionEffects", "TSLWillpower", "TSLGMActions", "TSLSocket", "ConflictStore",
  "MOVES", "TSLPlaybooks", "SOCIAL_TRIADS", "SOCIAL_CONDITION_ORDER", "SOCIAL_ARCHETYPES", "TSLConflictApp",
  "ARCHETYPE_TELLS", "ARCHETYPE_REACTIONS"];
let api;
try {
  api = new Function(combined + "\nreturn { " + EXPORTS.map((e) => `${e}: typeof ${e} !== "undefined" ? ${e} : undefined`).join(", ") + " };")();
} catch (e) {
  console.log("PARSE/LOAD FAIL:", e.stack);
  process.exit(1);
}
console.log("All scripts loaded.");

// ── `--audit`: report the archetype vulnerability/immunity distribution ───────
if (process.argv.includes("--audit")) {
  const archs = api.SOCIAL_ARCHETYPES ?? [];
  const mvs = (api.SOCIAL_MANEUVERS ?? []).filter((m) => m.vulnerabilityTags || m.immunityTags);
  const vulnOf = (a, m) => (m.vulnerabilityTags ?? []).some((t) => a.vulnerabilities.includes(t));
  const immOf = (a, m) => (m.immunityTags ?? []).some((t) => a.immunities.includes(t));

  console.log("\n=== Per archetype — how many maneuvers cut / bounce ===");
  const vperA = {}, iperA = {};
  for (const a of archs) {
    const v = mvs.filter((m) => vulnOf(a, m)), i = mvs.filter((m) => immOf(a, m));
    vperA[a.id] = v.length; iperA[a.id] = i.length;
    console.log(`  ${(a.label + " [" + a.triad + "]").padEnd(22)} vuln ${v.length}: ${v.map((m) => m.name).join(", ") || "—"}`);
    console.log(`  ${"".padEnd(22)} imm  ${i.length}: ${i.map((m) => m.name).join(", ") || "—"}`);
  }
  const vs = Object.values(vperA), is = Object.values(iperA);
  console.log(`  → vulnerable-count range ${Math.min(...vs)}–${Math.max(...vs)}, immune-count range ${Math.min(...is)}–${Math.max(...is)}`);

  console.log("\n=== Per maneuver — # archetypes VULNERABLE to it ===");
  const bySchoolV = {}, bySchoolI = {};
  for (const m of mvs) {
    const nv = archs.filter((a) => vulnOf(a, m)).length;
    const ni = archs.filter((a) => immOf(a, m)).length;
    console.log(`  ${m.name.padEnd(16)} [${(m.group + "]").padEnd(10)} vuln-for ${nv}  imm-for ${ni}`);
    bySchoolV[m.group] = (bySchoolV[m.group] ?? 0) + nv;
    bySchoolI[m.group] = (bySchoolI[m.group] ?? 0) + ni;
  }
  const byTriad = {};
  for (const a of archs) byTriad[a.triad] = (byTriad[a.triad] ?? 0) + 1;
  console.log("\nArchetypes per triad:", byTriad);
  console.log("Vulnerability coverage by school:", bySchoolV);
  console.log("Immunity coverage by school:  ", bySchoolI);
  process.exit(0);
}

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

    // 2) The single "meet the blow" window (v1.81): blow + state in one place
    {
      const SMR = R.SocialManeuverRoller;
      const meet = async (o, pick) => { globalThis.__formPick = pick; const r = await SMR.promptMeetBlow({ defender: actorB, attacker: actorA, maneuver: { name: "Humiliate" }, ...o }); globalThis.__formPick = null; return r; };
      const take = await meet({ damage: 3, patience: 7 }, { "tsl-blow": "take" });
      ok(`meet: take → block 0`, take.block === 0 && !take.riposte && take.hold === null);
      const b1 = await meet({ damage: 3, patience: 7 }, { "tsl-blow": "b1" });
      ok(`meet: partial b1 → block 1`, b1.block === 1 && !b1.riposte);
      const full = await meet({ damage: 3, patience: 7 }, { "tsl-blow": "parry" });
      ok(`meet: full parry → block 3`, full.block === 3 && !full.riposte);
      const rip = await meet({ damage: 3, patience: 7 }, { "tsl-blow": "riposte" });
      ok(`meet: riposte → block 3 + riposte`, rip.block === 3 && rip.riposte === true);
      const noRip = await meet({ damage: 3, patience: 4 }, { "tsl-blow": "riposte" });
      ok(`riposte gated when P<D+2 (falls back to take)`, noRip.riposte !== true && noRip.block === 0);
      const cap = await meet({ damage: 2, patience: 1 }, { "tsl-blow": "parry" });
      ok(`parry capped by Patience (block ≤1)`, cap.block <= 1);
      // both rows in ONE window: parry the blow AND hold the line against the state
      const before = globalThis.__dialogCount;
      const both = await meet({ damage: 2, patience: 5, status: "smitten", holdOptions: ["obsessed", "hopeless"] },
        { "tsl-blow": "parry", "tsl-state": "hold-hopeless" });
      ok(`one window answers both: block ${both.block}, hold ${both.hold} (${globalThis.__dialogCount - before} dialog)`,
        both.block === 2 && both.hold === "hopeless" && globalThis.__dialogCount - before === 1);
      // nothing to choose → no window at all
      const b2 = globalThis.__dialogCount;
      const forced = await meet({ damage: 3, patience: 5, unparryable: true }, {});
      ok(`unparryable, no state → no window, it lands`, forced.block === 0 && globalThis.__dialogCount === b2);
      const over = await meet({ damage: 3, patience: 5, overwhelmed: true, status: "smitten", holdOptions: [] }, { "tsl-blow": "parry" });
      ok(`Overwhelmed → can't parry or hold`, over.block === 0 && over.hold === null);
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
      globalThis.__formPick = { "tsl-blow": "take" };
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry TAKE: Resolve 5→${enc.resolve} (−3), Patience ${enc.patience} (6)`, enc.resolve === 2 && enc.patience === 6);

      // (b) Full parry — no Resolve lost, 3 Patience spent
      enc.resolve = 5; enc.patience = 6; encA.resolve = 5;
      globalThis.__formPick = { "tsl-blow": "parry" };
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry FULL: Resolve ${enc.resolve} (5), Patience 6→${enc.patience} (−3)`, enc.resolve === 5 && enc.patience === 3);

      // (c) Riposte — no Resolve lost, 4 Patience, attacker thrown off balance:
      //     their PATIENCE −1 (a riposte shakes you, it doesn't make you concede)
      enc.resolve = 5; enc.patience = 6; encA.resolve = 5; encA.patience = 6;
      globalThis.__formPick = { "tsl-blow": "riposte" };
      await R.SocialManeuverRoller.applyOutcome(basePayload());
      ok(`parry RIPOSTE: tgt Resolve ${enc.resolve} (5), Patience 6→${enc.patience} (−4), atk Patience 6→${encA.patience} (−1), atk Resolve ${encA.resolve} (5)`,
        enc.resolve === 5 && enc.patience === 2 && encA.patience === 5 && encA.resolve === 5);

      // (d) VULNERABLE school can't be parried — lands full even if they'd parry
      enc.resolve = 5; enc.patience = 6;
      globalThis.__formPick = { "tsl-blow": "parry" };
      const vp = basePayload(); vp.relation = "vulnerable";
      await R.SocialManeuverRoller.applyOutcome(vp); // Humiliate vuln = +1 dmg → −4
      ok(`VULNERABLE unparryable: Resolve 5→${enc.resolve} (−4), Patience 6 (${enc.patience})`, enc.resolve === 1 && enc.patience === 6);

      // (e) A MISS costs the ATTACKER's own composure — Humiliate is risky (2) —
      //     and never touches the target's Patience
      enc.resolve = 5; enc.patience = 6; encA.patience = 6;
      const mp = basePayload(); mp.outcomeType = "failure";
      R.SocialManeuverRoller.promptOutcome = async () => "failure";
      await R.SocialManeuverRoller.applyOutcome(mp);
      ok(`MISS: attacker Patience 6→${encA.patience} (−2, Humiliate is risky), target Patience ${enc.patience} (6)`, encA.patience === 4 && enc.patience === 6);

      globalThis.__dialogPick = null; globalThis.__formPick = null;
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

    const SM = R.SocialManeuverRoller, EM = R.SocialEncounterManager, CE = R.TSLConditionEffects;
    const mv = (id) => R.SOCIAL_MANEUVERS.find((m) => m.id === id);
    const pay = (src, tgt, id, extra = {}) => ({ sourceActorId: src, targetActorId: tgt, maneuverId: id,
      outcomeType: "success", relation: "neutral", total: 20, dc: 10, card: null, ...extra });
    const holds = (a, b) => R.TSLStringStore.getList(a).filter((e) => e.targetActorId === b).length;
    const savedPO = SM.promptOutcome;

    // 7) v1.80 — Patience is YOUR composure (real encounter manager, real flags)
    {
      const atk = makeActor("atkM", { cha: 3, wis: 1 });   // R3 P4
      const def = makeActor("defM", { cha: 1, wis: 1 });   // R1 P2
      SM.promptOutcome = async () => "failure";
      await SM.applyOutcome(pay("atkM", "defM", "persuade", { outcomeType: "failure" }));
      ok(`miss spends the ATTACKER's Patience 4→${EM.getEncounter(atk).patience}, target untouched ${EM.getEncounter(def).patience}/2`,
        EM.getEncounter(atk).patience === 3 && EM.getEncounter(def).patience === 2);
      // the defender parries every hit — it costs THEIR composure, and at 0 they break off and LOSE
      SM.promptOutcome = async () => "success";
      // (Mock: a plain, parryable 1-damage maneuver — Persuade is sincere now and can't be parried)
      globalThis.__formPick = { "tsl-blow": "parry" };
      await SM.applyOutcome(pay("atkM", "defM", "sow_doubt"));
      await SM.applyOutcome(pay("atkM", "defM", "sow_doubt"));
      globalThis.__formPick = null;
      const dEnc = EM.getEncounter(def);
      ok(`parried to 0 → defender broke off (outcome "${dEnc.outcome}"), attacker takes the String (${holds("atkM", "defM")}), defender none (${holds("defM", "atkM")})`,
        dEnc.outcome === "walked" && holds("atkM", "defM") === 1 && holds("defM", "atkM") === 0);
      // the exchange is over: nothing more lands either way
      const blockA = SM.assess(atk, def, mv("persuade"), {});
      const blockB = SM.assess(def, atk, mv("persuade"), {});
      ok(`finished exchange blocks both directions`, blockA.relation === "blocked" && blockB.relation === "blocked" && /over|out of/.test(blockA.relationReason));
      const before = EM.getEncounter(atk).patience;
      SM.promptOutcome = async () => "failure";
      await SM.applyOutcome(pay("atkM", "defM", "persuade", { outcomeType: "failure" }));
      ok(`applyOutcome after the end changes nothing (attacker Patience ${EM.getEncounter(atk).patience} = ${before})`, EM.getEncounter(atk).patience === before);

      // the ATTACKER can lose too: a risky miss (Intimidate, −2) empties a fragile attacker
      const atk2 = makeActor("atkB", { cha: 0, wis: 0 });   // R1 P2
      makeActor("defB", { cha: 2, wis: 2 });
      await SM.applyOutcome(pay("atkB", "defB", "intimidate", { outcomeType: "failure" }));
      ok(`attacker broke off on their own misses (outcome "${EM.getEncounter(atk2).outcome}"), the defender takes the String (${holds("defB", "atkB")})`,
        EM.getEncounter(atk2).outcome === "walked" && holds("defB", "atkB") === 1);

      // Fear leverage that misses backfires on the attacker (+1)
      const atk3 = makeActor("atkF", { cha: 3, wis: 2 });   // P5
      makeActor("defF", { cha: 2, wis: 2 });
      await SM.applyOutcome(pay("atkF", "defF", "persuade", { outcomeType: "failure", leverage: "fear" }));
      ok(`a missed Fear costs the attacker 2 Patience (5→${EM.getEncounter(atk3).patience})`, EM.getEncounter(atk3).patience === 3);

      // a riposte shakes the attacker's Patience — never their Resolve (no "swayed for succeeding")
      const atk4 = makeActor("atkR", { cha: 0, wis: 1 });   // R1 P2 — the old rules swayed this one
      const def4 = makeActor("defR", { cha: 2, wis: 2 });   // P4 ≥ 1+2
      SM.promptOutcome = async () => "success";
      globalThis.__formPick = { "tsl-blow": "riposte" };
      await SM.applyOutcome(pay("atkR", "defR", "sow_doubt"));
      globalThis.__formPick = null;
      const e4 = EM.getEncounter(atk4);
      ok(`riposte: attacker Resolve ${e4.resolve} (1, not swayed), Patience 2→${e4.patience}, defender Patience 4→${EM.getEncounter(def4).patience}`,
        e4.resolve === 1 && !e4.outcome && e4.patience === 1 && EM.getEncounter(def4).patience === 2);
      SM.promptOutcome = savedPO;
    }

    // 8) Incentives, measured on the REAL pipeline (rollManeuver → applyOutcome):
    //    under v1.79 a defender who parried everything won 100% — now it's a race.
    {
      const runs = async (N, atkBonus, policy, moveId = "sow_doubt") => {
        const tally = { swayed: 0, defBroke: 0, atkBroke: 0, other: 0 };
        const atk = makeActor("mcAtk", { cha: 3, wis: 1 });   // R3 P4
        const def = makeActor("mcDef", { cha: 2, wis: 2, int: 3 });   // R2 P4, DC 10+2+3 = 15
        // Mock (Deception) = a plain, parryable blow; Persuade (Persuasion) = the sincere one
        atk.system.skills = { per: { total: atkBonus }, dec: { total: atkBonus }, ins: { total: 0, proficient: 0 }, prf: { total: 0, proficient: 0 } };
        for (let i = 0; i < N; i++) {
          await EM.endEncounter(atk); await EM.endEncounter(def);
          for (let k = 0; k < 40; k++) {
            const p = await SM.rollManeuver(atk, def, mv(moveId), {});
            globalThis.__formPick = { "tsl-blow": policy };
            await SM.applyOutcome(p);
            globalThis.__formPick = null;
            const de = EM.getEncounter(def), ae = EM.getEncounter(atk);
            if (de.outcome === "swayed") { tally.swayed++; break; }
            if (de.outcome === "walked") { tally.defBroke++; break; }
            if (ae.outcome)              { tally.atkBroke++; break; }
            if (k === 39) tally.other++;
          }
        }
        return tally;
      };
      const N = 200;
      const parry = await runs(N, 8, "parry");     // attacker hits 70%
      ok(`always-parry defender no longer always wins: attacker wins ${parry.swayed + parry.defBroke}/${N} (sway ${parry.swayed}, broke them ${parry.defBroke}), attacker broke ${parry.atkBroke}`,
        (parry.swayed + parry.defBroke) / N > 0.5 && parry.other === 0);
      const weak = await runs(N, 2, "parry");      // attacker hits 40%
      ok(`…and a weak attacker can still lose the race: attacker broke off ${weak.atkBroke}/${N}`, weak.atkBroke / N > 0.2);
      const take = await runs(N, 8, "take");
      ok(`a defender who takes every blow gets swayed: ${take.swayed}/${N}`, take.swayed / N > 0.8);
      const sincere = await runs(N, 8, "parry", "persuade");
      ok(`…and sincerity sways even a wall: Persuade vs always-parry → swayed ${sincere.swayed}/${N}`, sincere.swayed / N > 0.8);
    }

    // 9) Natural 1 always misses; the support skill adds proficiency only
    {
      const big = makeActor("natA", { cha: 4, wis: 1 });
      big.system.skills = { per: { total: 30 }, ins: { total: 4, proficient: 1 } };
      big.system.attributes.prof = 3;
      makeActor("natT", { cha: 1, wis: 1 });
      globalThis.__forceDice = [1];
      const p1 = await SM.rollManeuver(big, game.actors.get("natT"), mv("persuade"), {});
      ok(`natural 1 with +33 still misses (natural ${p1.natural}, ${p1.outcomeType})`, p1.natural === 1 && (p1.outcomeType === "failure" || p1.outcomeType === "botch"));
      globalThis.__forceDice = [12];
      const p2 = await SM.rollManeuver(big, game.actors.get("natT"), mv("persuade"), {});
      ok(`an ordinary roll with the same bonus hits (${p2.outcomeType})`, p2.outcomeType === "crit" || p2.outcomeType === "success");
      globalThis.__forceDice = null;

      const sup = makeActor("supA", { cha: 4, wis: 1 });
      sup.system.attributes.prof = 3;
      sup.system.skills = { per: { total: 7 }, dec: { total: 7, proficient: 1 }, ins: { total: 4, proficient: 1 }, inv: { total: 0, proficient: 0 } };
      const tgt = makeActor("supT", { cha: 1, wis: 1 });
      const supOf = (id) => SM.assess(sup, tgt, mv(id), {}).bonusReasons.find((b) => /support/.test(b.label))?.value ?? 0;
      ok(`support = proficiency, not the full modifier: Flatter +${supOf("flatter")} (3, not 7)`, supOf("flatter") === 3);
      ok(`untrained support adds nothing: Read Them +${supOf("cold_reading")}`, supOf("cold_reading") === 0);
      sup.system.skills.dec.proficient = 0.5;
      ok(`half-proficiency support = ⌊prof/2⌋: +${supOf("flatter")}`, supOf("flatter") === 1);
      const pv = SM.previewOutcomes(SM.assess(sup, tgt, mv("intimidate"), {}), mv("intimidate"));
      ok(`stakes line names the miss cost: "${pv.miss}"`, /you lose 2 Patience/.test(pv.miss));
    }

    // 10) Long rest: Wounds ease a tier (●●● → Scar), Boons fade, Willpower refills
    {
      const lr = makeActor("restA", { cha: 1 });
      await CE.setTier(lr, "angry", 3, "X");
      await CE.setTier(lr, "scared", 2, "X");
      await CE.setTier(lr, "hopeless", 1, "X");
      await CE.applyOne(lr, "valor", "GM");
      await R.TSLWillpower.set(lr, 0);
      await CE.onLongRest(lr);
      ok(`●●● Wrath calcified into Cruelty`, !CE.hasCondition(lr, "angry") && CE.hasScar(lr, "cruelty"));
      ok(`●● Fear eased to ● (tier ${CE.getTier(lr, "scared")})`, CE.getTier(lr, "scared") === 1);
      ok(`● Despair healed`, !CE.hasCondition(lr, "hopeless"));
      ok(`Boon faded, Willpower refilled (${R.TSLWillpower.get(lr)}/${R.TSLWillpower.getMax(lr)})`,
        !CE.hasCondition(lr, "valor") && R.TSLWillpower.get(lr) === R.TSLWillpower.getMax(lr));
    }

    // 11) Give in to a Wound → Willpower (Despair → Inspiration); only if carried
    {
      const gi = makeActor("giveA", { cha: 1 });
      await CE.applyOne(gi, "angry", "X");
      await R.TSLWillpower.set(gi, 0);
      const r1 = await CE.giveIn(gi, "angry");
      ok(`give in to Wrath → +1 Willpower (${R.TSLWillpower.get(gi)})`, r1?.gained === "willpower" && R.TSLWillpower.get(gi) === 1);
      ok(`can't give in to a Wound you don't carry`, (await CE.giveIn(gi, "scared")) === null);
      await CE.applyOne(gi, "hopeless", "X");
      const r3 = await CE.giveIn(gi, "hopeless");
      ok(`give in to Despair → Inspiration`, r3?.gained === "inspiration" && gi.system.attributes.inspiration === true);
      ok(`boon is labelled Conviction (not "Resolve")`, CE.getMeta("resolve")?.label === "Conviction");
    }

    // 12) a5e paths: triad dots → 3-letter skill keys; Strife at system.attributes.strife; no duplicate wounds
    {
      const tr = makeActor("triadA");
      await tr.setFlag("tsl-social-conflict", "socialFencing", { triad: { power: 1, attention: 2, order: 0 } });
      await R.SocialArchetypeManager.syncTriadBonusEffect(tr);
      const keys = (tr.effects.find((e) => e.flags?.["tsl-social-conflict"]?.triadBonus)?.changes ?? []).map((c) => c.key);
      ok(`a5e triad AE uses 3-letter keys: ${keys.join(", ")}`,
        keys.includes("system.skills.ins.bonuses.check") && keys.includes("system.skills.itm.bonuses.check") && !keys.some((k) => /insight|intimidation/.test(k)));

      const cp = makeActor("confA");
      cp.system.attributes.strife = 1;
      await CE.applyOne(cp, "angry", "X");   // what a card pip toggle already did
      await CE._applyToParticipant({ actorId: "confA", name: "confA",
        conditions: { angry: true, scared: true, spiteful: false, obsessed: false, hopeless: false } }, "Foe");
      const angryCount = cp.effects.filter((e) => CE._condOf(e) === "angry").length;
      ok(`conflict end: no duplicate Wound (${angryCount}), missing one added, Strife 1→${cp.system.attributes.strife}`,
        angryCount === 1 && CE.hasCondition(cp, "scared") && cp.system.attributes.strife === 3);
    }

    // 13) An exchange belongs to its scene: another scene starts fresh
    {
      game.scenes.active = { id: "sceneA" };
      const st = makeActor("staleA", { cha: 2, wis: 1 });
      await EM.ensureActive(st);
      await EM.adjustResolve(st, -10);
      ok(`resolved in scene A`, EM.isResolved(st));
      game.scenes.active = { id: "sceneB" };
      ok(`in scene B the old exchange is gone`, !EM.getEncounter(st).active && !EM.getEncounter(st).outcome);
      const fresh = await EM.ensureActive(st);
      ok(`…and a new one starts there (sceneId ${fresh?.sceneId})`, fresh?.active && fresh.sceneId === "sceneB");
      delete game.scenes.active;
    }

    // 14) The conflict window's duel bar renders the composure warnings
    {
      const a1 = makeActor("cwA", { cha: 3, wis: 1 });
      makeActor("cwB", { cha: 2, wis: 2 });
      const conds = { angry: false, spiteful: false, obsessed: false, scared: false, hopeless: false };
      R.ConflictStore.state = { active: true, selectedTokenIds: [], turn: 0, log: [], resolved: false, resolution: null,
        participants: [
          { tokenId: "t1", actorId: "cwA", name: "cwA", img: "", color: "#e8557a", stats: [], conditions: { ...conds } },
          { tokenId: "t2", actorId: "cwB", name: "cwB", img: "", color: "#9b6ee8", stats: [], conditions: { ...conds } },
        ] };
      const app = Object.create(R.TSLConflictApp.prototype);
      Object.assign(app, { _pendingRoll: null, _selectedMove: mv("intimidate"), _selectedTarget: 1,
        _pendingStringSpend: null, _pendingLeverage: null, _gmActingIdx: 0 });
      await EM.startEncounter(a1, 2, 3);   // one risky miss from breaking off
      let html = "";
      try { html = app._renderHTML(await app.getData()); } catch (e) { html = "ERR:" + e.stack; }
      ok(`conflict bar renders, warns "composure is nearly gone", shows the miss cost`,
        !/undefined|NaN|ERR:/.test(html) && /composure is nearly gone/.test(html) && /you lose 2 Patience/.test(html));
      if (/ERR:/.test(html)) console.log(html.slice(0, 600));
      R.ConflictStore.state = null;
    }

    // 15) Chronicle console shows YOUR composure; Wounds carry a Give in button
    {
      const me = makeActor("chA", { cha: 3, wis: 1 });
      makeActor("chB", { cha: 2, wis: 2 });
      await EM.startEncounter(me, 4, 3);
      const app = Object.create(R.SocialFencingApp.prototype);
      Object.assign(app, { _actor: me, _fenceTargetId: "chB", _fenceManeuverId: "persuade", _fenceLeverage: null, _fenceStringSpend: false });
      let html = "";
      try { html = app._buildManeuverConsole({ isGM: false }); } catch (e) { html = "ERR:" + e.stack; }
      ok(`console renders "Your composure" + the miss cost, no undefined`,
        !/undefined|NaN|ERR:/.test(html) && /Your composure/.test(html) && /a miss costs 1/.test(html));
      if (/ERR:/.test(html)) console.log(html.slice(0, 600));
      await CE.applyOne(me, "angry", "X");
      let wh = "";
      try { wh = app._buildWoundToggles({ activeWounds: { angry: 1 }, willpower: { cur: 1, max: 2 }, isGM: false }); } catch (e) { wh = "ERR:" + e.stack; }
      ok(`active Wound shows a Give in button`, /data-give-in="angry"/.test(wh) && !/ERR:/.test(wh));
    }

    // ═══ v1.81 ═══════════════════════════════════════════════════════════════
    const SAM = R.SocialArchetypeManager, BS = R.TSLBondStore, SCOPE = "tsl-social-conflict";

    // 16) Archetypes & maneuvers: names, explanations, matrix, veil, Invoke Authority
    {
      const archs = R.SOCIAL_ARCHETYPES;
      const byId = (id) => archs.find((a) => a.id === id);
      ok(`renamed: Schemer / Idol / Zealot (ids kept)`,
        byId("machiavellian")?.label === "Schemer" && byId("exalted")?.label === "Idol" && byId("dogmatic")?.label === "Zealot");
      ok(`every nature explains itself (psych · strong · weak)`, archs.every((a) => a.psych && a.strengths && a.weaknesses));
      ok(`every maneuver has a strong and a weak side`, R.SOCIAL_MANEUVERS.every((m) => m.edge && m.risk));
      const rel = (a) => SAM.getManeuverRelationsFor(a);
      ok(`every nature has ≥1 weak spot and ≥1 wall`, archs.every((a) => rel(a).vulnerable.length >= 1 && rel(a).immune.length >= 1));
      const leaks = [];
      for (const pool of [R.ARCHETYPE_TELLS, R.ARCHETYPE_REACTIONS]) for (const lines of Object.values(pool ?? {}))
        for (const line of lines) for (const a of archs) if (line.toLowerCase().includes(a.label.toLowerCase())) leaks.push(`${a.label}: ${line}`);
      ok(`no tell or reaction names a nature (${leaks.length} leaks)${leaks.length ? " — " + leaks[0] : ""}`, leaks.length === 0);
      const auth = mv("invoke_authority");
      const authRel = SAM.getArchetypeRelationsFor(auth);
      ok(`Invoke Authority: Reason school, cuts the Zealot, bounces off the Tyrant, cashes Rattled`,
        auth?.group === "order" && authRel.vulnerable.some((a) => a.id === "dogmatic") && authRel.immune.some((a) => a.id === "tyrant")
        && auth.combos?.rattled?.resolveDamage === 1);
      ok(`Zealot text matches its mechanics (doubt, not contradiction)`, /unsure|doubt/i.test(byId("dogmatic").hint) && byId("dogmatic").dreads === "Not being sure");
    }

    // 17) Rattled & Enthralled are one-shots; states know about bonds (deep ×2 / won't take)
    {
      const A = makeActor("stA", { cha: 3, wis: 1 }), T = makeActor("stT", { cha: 6, wis: 2 });
      SM.promptOutcome = async () => "failure";
      await SAM.applyCondition(T, "rattled", A);
      const a1 = SM.assess(A, T, mv("persuade"), {});
      ok(`Rattled: DC −5 for the next maneuver, and it spends`, a1.dcMods.some((d) => d.label === "Rattled" && d.value === -5) && a1.consumes.includes("rattled"));
      await SM.applyOutcome(pay("stA", "stT", "persuade", { outcomeType: "failure", consumed: a1.consumes }));
      ok(`…gone after one use`, !SAM.getActiveCondition(T, "rattled"));

      await SAM.applyCondition(T, "smitten", A);
      ok(`Enthralled blocks the charmed one from moving against the charmer`, SM.assess(T, A, mv("persuade"), {}).relation === "blocked");
      const a2 = SM.assess(A, T, mv("lie"), {});
      ok(`Enthralled: the charmer's NEXT maneuver (any) gets Advantage and spends it`, a2.advantage && a2.consumes.includes("smitten"));
      await SM.applyOutcome(pay("stA", "stT", "lie", { outcomeType: "failure", consumed: a2.consumes }));
      ok(`…and then they're free again`, !SAM.getActiveCondition(T, "smitten") && SM.assess(T, A, mv("persuade"), {}).relation !== "blocked");

      // deep: they have a Crush on the charmer → Charm's Enthralled lasts two uses
      await BS.add("stT", "stA", { type: "crush", attitude: 2 });
      SM.promptOutcome = async () => "success";
      await SM.applyOutcome(pay("stA", "stT", "love_bombing"));
      const e = SAM.getActiveCondition(T, "smitten");
      ok(`a Crush makes Enthralled run deep (×${SAM.getCharges(e)})`, !!e && SAM.getCharges(e) === 2);
      await SAM.spendCondition(T, "smitten");
      ok(`…one use spent, one left`, !!SAM.getActiveCondition(T, "smitten") && SAM.getCharges(SAM.getActiveCondition(T, "smitten")) === 1);
      await SAM.spendCondition(T, "smitten");
      ok(`…then it's gone`, !SAM.getActiveCondition(T, "smitten"));

      // resist: an Enemy won't be charmed
      const U = makeActor("stU", { cha: 6, wis: 2 });
      await BS.add("stU", "stA", { type: "enemy", attitude: 1 });
      ok(`preview says it won't take`, SM.assess(A, U, mv("flatter"), {}).stateFx?.mode === "resist"
        && /won't take/.test(SM.previewOutcomes(SM.assess(A, U, mv("flatter"), {}), mv("flatter")).hit));
      await SM.applyOutcome(pay("stA", "stU", "flatter"));
      ok(`an Enemy shrugs off Enthralled — but the blow still lands`, !SAM.getActiveCondition(U, "smitten") && EM.getEncounter(U).resolve < EM.getEncounter(U).maxResolve);

      // the Answer knows bonds too: an Emotion nature's Beholden won't take on someone who's their enemy
      const D = makeActor("ansD", { cha: 4, wis: 2 }), E2 = makeActor("ansE", { cha: 3, wis: 2 });
      await SAM.setArchetype(D, "martyr");
      await BS.add("ansE", "ansD", { type: "enemy", attitude: 1 });
      SM.promptOutcome = async () => "botch";
      await SM.applyOutcome(pay("ansE", "ansD", "persuade", { outcomeType: "botch" }));
      ok(`the Answer respects the bond (Beholden doesn't take on an enemy)`, !SAM.getActiveCondition(E2, "guilted"));
      SM.promptOutcome = savedPO;
    }

    // 18) Hold the Line refuses only the STATE; ●●● can't hold; Overwhelmed = weight ≥ 4
    {
      makeActor("hlA", { cha: 3, wis: 1 });
      const T = makeActor("hlT", { cha: 6, wis: 2 });   // R6 P8
      SM.promptOutcome = async () => "success";
      globalThis.__formPick = { "tsl-blow": "take", "tsl-state": "hold-angry" };
      await SM.applyOutcome(pay("hlA", "hlT", "flatter"));   // 2 dmg + Enthralled
      ok(`held the line: a Wrath wound instead of Enthralled, but the 2 Resolve still landed (${EM.getEncounter(T).resolve}/6)`,
        CE.hasCondition(T, "angry") && !SAM.getActiveCondition(T, "smitten") && EM.getEncounter(T).resolve === 4);
      ok(`the wound remembers who caused it`, CE.getWoundSource(T, "angry") === "hlA");
      await CE.setTier(T, "angry", 3, "hlA", "hlA");
      await EM.adjustResolve(T, +6);
      globalThis.__formPick = { "tsl-blow": "take", "tsl-state": "hold-angry" };
      await SM.applyOutcome(pay("hlA", "hlT", "flatter"));
      ok(`a ●●● wound can't take more — the hold isn't offered, the state lands`, !!SAM.getActiveCondition(T, "smitten"));
      await SAM.removeCondition(T, "smitten");
      await CE.applyOne(T, "scared", "hlA", "hlA");   // weight 3 + 1 = 4
      ok(`Wounds weighing 4 → Overwhelmed (load ${CE.woundLoad(T)})`, CE.isOverwhelmed(T));
      const rBefore = EM.getEncounter(T).resolve, pBefore = EM.getEncounter(T).patience;
      globalThis.__formPick = { "tsl-blow": "parry", "tsl-state": "hold-spiteful" };
      await SM.applyOutcome(pay("hlA", "hlT", "flatter"));
      globalThis.__formPick = null;
      ok(`Overwhelmed: no parry (Resolve ${rBefore}→${EM.getEncounter(T).resolve}, Patience ${pBefore}→${EM.getEncounter(T).patience}), no hold (Enthralled landed)`,
        EM.getEncounter(T).resolve === rBefore - 2 && EM.getEncounter(T).patience === pBefore && !!SAM.getActiveCondition(T, "smitten"));
      SM.promptOutcome = savedPO;
    }

    // 19) Strings: at most 3 on one person
    {
      makeActor("capA"); makeActor("capB");
      const n = await R.TSLStringStore.add("capA", "capB", 5);
      ok(`String cap: asked for 5, got ${n}; capped`, n === 3 && R.TSLStringStore.countOn("capA", "capB") === 3 && R.TSLStringStore.isCapped("capA", "capB"));
    }

    // 20) Bonds after an exchange are type-aware; Wounds about a person settle into bonds
    {
      makeActor("shL"); makeActor("shW"); makeActor("shF"); makeActor("shG");
      await BS.add("shL", "shW", { type: "enemy", attitude: 2 });
      const r1 = await BS.shiftAfterExchange("shL", "shW", "swayed");
      const r2 = await BS.shiftAfterExchange("shL", "shW", "walked");
      ok(`Enemy: swayed eases (→${r1.strength}), broke off hardens (→${r2.strength})`, r1.strength === 1 && r2.strength === 2);
      await BS.add("shF", "shG", { type: "friend", attitude: 1 });
      const r3 = await BS.shiftAfterExchange("shF", "shG", "swayed");
      ok(`Friend: swayed deepens (→${r3.strength})`, r3.strength === 2);

      const B = makeActor("obB"); makeActor("obS");
      await CE.setTier(B, "obsessed", 3, "obS", "obS");
      await CE.onLongRest(B);
      const bond = BS.find("obB", "obS"), mirror = BS.find("obS", "obB");
      ok(`Obsession ●●● overnight → a Crush bond (mirrored), no scar`,
        bond?.type === "crush" && BS.getStrength("obB", "obS") === 1 && mirror?.type === "crush" && !CE.hasCondition(B, "obsessed") && !CE.hasScar(B, "bound_heart"));
      const B2 = makeActor("grB"); makeActor("grS");
      await BS.add("grB", "grS", { type: "rival", attitude: 1 });
      await CE.setTier(B2, "spiteful", 3, "grS", "grS");
      await CE.onLongRest(B2);
      ok(`Grudge ●●● with an existing Rival bond → it deepens (●${BS.getStrength("grB", "grS")}), type kept`,
        BS.find("grB", "grS")?.type === "rival" && BS.getStrength("grB", "grS") === 2);
      const B3 = makeActor("obN");
      await CE.setTier(B3, "obsessed", 3, "someone");
      await CE.onLongRest(B3);
      ok(`…with no known source it simply eases to ●● (tier ${CE.getTier(B3, "obsessed")})`, CE.getTier(B3, "obsessed") === 2);
      ok(`retired scars aren't offered any more`, !CE.SCAR_ORDER.includes("bound_heart") && !CE.SCAR_ORDER.includes("vendetta") && CE.SCAR_ORDER.length === 3);
    }

    // 21) The triad dots' skill bonus is explicit — in the number, the bar and the Profile
    {
      const L = makeActor("leanA", { cha: 1 });
      L.system.skills = { itm: { mod: 1, proficient: 0 } };
      await L.setFlag(SCOPE, "socialFencing", { triad: { power: 2, attention: 0, order: 0 } });
      await SAM.syncTriadBonusEffect(L);
      ok(`Social Leanings: +2 Intimidation read straight from the effect`, SAM.leanSkillBonus(L, "itm") === 2);
      ok(`a5e-style skill (no .total) now includes it: Intimidate +${SM.getSkillMod(L, mv("intimidate"))} (1 + 2)`, SM.getSkillMod(L, mv("intimidate")) === 3);
      ok(`the bar can name it`, SM.getLeanInSkill(L, mv("intimidate"))?.value === 2 && SM.getLeanInSkill(L, mv("intimidate"))?.triad === "Power");
      const app = Object.create(R.SocialFencingApp.prototype);
      app._actor = L;
      let html = "";
      try { html = app._buildProfileTab({ notes: SAM.getCharacterNotes(L), archetype: null, canEdit: true, isGM: false }); } catch (e) { html = "ERR:" + e.stack; }
      ok(`Profile shows "On your sheet: +2 Intimidation"`, /On your sheet:/.test(html) && /\+2 Intimidation/.test(html) && !/undefined|ERR:/.test(html));
      if (/ERR:/.test(html)) console.log(html.slice(0, 500));
    }

    // 22) Fewer windows: the GM confirms only close calls (or a natural 1)
    {
      const c0 = globalThis.__dialogCount;
      const r1 = await savedPO.call(SM, actorA, actorB, mv("persuade"), 20, 14, "crit", { natural: 15 });
      ok(`a clear result applies without a window (${r1})`, r1 === "crit" && globalThis.__dialogCount === c0);
      await savedPO.call(SM, actorA, actorB, mv("persuade"), 15, 14, "success", { natural: 12 });
      await savedPO.call(SM, actorA, actorB, mv("persuade"), 25, 14, "failure", { natural: 1 });
      ok(`a close call and a natural 1 still ask the GM`, globalThis.__dialogCount === c0 + 2);
    }

    // 23) The conflict card shows a deep state as ×2
    {
      const a1 = makeActor("dpA", { cha: 3 }), a2 = makeActor("dpB", { cha: 2 });
      const conds = { angry: false, spiteful: false, obsessed: false, scared: false, hopeless: false };
      await SAM.applyCondition(a2, "smitten", a1, { charges: 2 });
      R.ConflictStore.state = { active: true, selectedTokenIds: [], turn: 0, log: [], resolved: false, resolution: null,
        participants: [
          { tokenId: "t1", actorId: "dpA", name: "dpA", img: "", color: "#e8557a", stats: [], conditions: { ...conds } },
          { tokenId: "t2", actorId: "dpB", name: "dpB", img: "", color: "#9b6ee8", stats: [], conditions: { ...conds } },
        ] };
      const app = Object.create(R.TSLConflictApp.prototype);
      Object.assign(app, { _pendingRoll: null, _selectedMove: null, _selectedTarget: null, _pendingStringSpend: null, _pendingLeverage: null, _gmActingIdx: 0 });
      let html = "";
      try { html = app._renderHTML(await app.getData()); } catch (e) { html = "ERR:" + e.stack; }
      ok(`conflict card: the live state shows as "Enthralled ×2"`, /Enthralled ×2/.test(html) && !/ERR:/.test(html));
      R.ConflictStore.state = null;
    }

    // ═══ v1.82 ═══════════════════════════════════════════════════════════════

    // 24) The three plain basics each have their own identity (Lie no longer dominates)
    {
      ok(`Persuade: 1 Resolve but unparryable · Intimidate: 2 Resolve, a miss costs 2 · Lie: String, but can get you caught`,
        mv("persuade").unparryable === true && mv("persuade").resolveDamage === 1
        && mv("intimidate").resolveDamage === 2 && mv("intimidate").failPatience === 2
        && mv("lie").grantStrings === 1 && mv("lie").caughtOnBotch === true);
      makeActor("gpA", { cha: 3, wis: 1 });
      const T = makeActor("gpT", { cha: 5, wis: 3 });   // R5 P8
      SM.promptOutcome = async () => "success";
      globalThis.__formPick = { "tsl-blow": "parry" };
      const c0 = globalThis.__dialogCount;
      await SM.applyOutcome(pay("gpA", "gpT", "persuade"));
      globalThis.__formPick = null;
      ok(`Persuade can't be parried: Resolve 5→${EM.getEncounter(T).resolve}, Patience untouched (${EM.getEncounter(T).patience}/8), no window`,
        EM.getEncounter(T).resolve === 4 && EM.getEncounter(T).patience === 8 && globalThis.__dialogCount === c0);
      const L = makeActor("gpL", { cha: 3, wis: 2 });
      makeActor("gpV", { cha: 3, wis: 3 });
      SM.promptOutcome = async () => "botch";
      await SM.applyOutcome(pay("gpL", "gpV", "lie", { outcomeType: "botch" }));
      ok(`a Lie that misses badly gets you caught: they hold a String on you (${holds("gpV", "gpL")})`, holds("gpV", "gpL") === 1);
      const pv = SM.previewOutcomes(SM.assess(L, game.actors.get("gpV"), mv("lie"), {}), mv("lie"));
      ok(`…and the stakes line warns about it`, /caught lying/.test(pv.miss));
      SM.promptOutcome = savedPO;
    }

    // 25) NPC defence stances — no window for the GM, a clear rule per stance
    {
      const npc = (id, o = {}) => { const a = makeActor(id, o); a.hasPlayerOwner = false; return a; };
      const pc = makeActor("stPC");
      ok(`player characters always decide (stance "ask")`, SAM.getStance(pc) === "ask");
      const t = npc("stTyr"); await SAM.setArchetype(t, "tyrant");
      const m = npc("stMar"); await SAM.setArchetype(m, "martyr");
      const z = npc("stZea"); await SAM.setArchetype(z, "dogmatic");
      const n0 = npc("stNone");
      ok(`by nature: Power → Proud, Emotion → Measured, Reason → Guarded, none → Measured`,
        SAM.getStance(t) === "proud" && SAM.getStance(m) === "measured" && SAM.getStance(z) === "guarded" && SAM.getStance(n0) === "measured");
      await SAM.setActorData(n0, { stance: "open" });
      ok(`an explicit stance wins`, SAM.getStance(n0) === "open");
      __settings.set("tsl-social-conflict.npcDefenseAuto", false);
      ok(`world setting off → the GM is asked again`, SAM.getStance(t) === "ask");
      __settings.set("tsl-social-conflict.npcDefenseAuto", true);

      const base = { defender: n0, damage: 2, patience: 6, maxPatience: 6, status: "smitten", holdOptions: ["angry", "spiteful"] };
      const auto = (stance, extra = {}) => SM._autoMeet({ ...base, ...extra }, stance);
      const o1 = auto("open");
      ok(`Open: takes it, accepts the state`, o1.block === 0 && !o1.riposte && o1.hold === null);
      const o2 = auto("measured");
      ok(`Measured: parries down to half composure (block ${o2.block}), holds with a fresh wound (${o2.hold})`, o2.block === 2 && o2.hold === "angry");
      const o2b = auto("measured", { patience: 4 });
      ok(`Measured at 4/6: only 1 to spare (block ${o2b.block})`, o2b.block === 1);
      const o3 = auto("guarded", { patience: 2 });
      ok(`Guarded: parries all it can even to its last point (block ${o3.block})`, o3.block === 2 && o3.hold);
      const o4 = auto("proud");
      ok(`Proud: ripostes when it can`, o4.riposte === true && o4.block === 2);
      const o4b = auto("proud", { patience: 2 });
      ok(`Proud with little left: parries but never to its last point (block ${o4b.block})`, !o4b.riposte && o4b.block === 1);
      const o5 = auto("guarded", { unparryable: true });
      ok(`no stance parries the unparryable`, o5.block === 0);

      // through the real pipeline: an NPC target meets the blow with NO window
      makeActor("stAtk", { cha: 3, wis: 1 });
      const g = npc("stGrd", { cha: 5, wis: 3 });   // R5 P8
      await SAM.setActorData(g, { stance: "guarded" });
      SM.promptOutcome = async () => "success";
      const c0 = globalThis.__dialogCount;
      await SM.applyOutcome(pay("stAtk", "stGrd", "flatter"));
      ok(`NPC defended on its own (no window): Resolve ${EM.getEncounter(g).resolve}/5, Patience ${EM.getEncounter(g).patience}/8, held the line: ${CE.hasCondition(g, "angry") || CE.hasCondition(g, "spiteful")}`,
        globalThis.__dialogCount === c0 && EM.getEncounter(g).resolve === 5 && EM.getEncounter(g).patience === 6
        && (CE.hasCondition(g, "angry") || CE.hasCondition(g, "spiteful")) && !SAM.getActiveCondition(g, "smitten"));
      SM.promptOutcome = savedPO;

      // the Profile offers the stance to the GM for an NPC
      const app = Object.create(R.SocialFencingApp.prototype);
      app._actor = t;
      let html = "";
      try { html = app._buildProfileTab({ notes: SAM.getCharacterNotes(t), archetype: SAM.getArchetype(t), canEdit: true, isGM: true }); } catch (e) { html = "ERR:" + e.stack; }
      ok(`Profile shows the Defence stance selector ("By nature (Proud)")`, /name="stance"/.test(html) && /By nature \(Proud\)/.test(html) && !/undefined|ERR:/.test(html));
    }

    // 26) Basic emotional layer: the Wounds alone
    {
      __settings.set("tsl-social-conflict.emotionalLayer", "basic");
      const b = makeActor("basA", { cha: 2 });
      await CE.applyOne(b, "angry", "X");
      const app = Object.create(R.SocialFencingApp.prototype);
      Object.assign(app, { _actor: b, _fenceTargetId: null, _fenceManeuverId: null, _expandedBonds: new Set(), _picking: false });
      const ctx = await app.getData();
      let html = "";
      try { html = app._buildFencingTab(ctx); } catch (e) { html = "ERR:" + e.stack; }
      ok(`basic: Wounds stay; no Willpower, Boons, Scars or Give in`,
        /❤ Wounds/.test(html) && !/⬡ Willpower/.test(html) && !/✦ Boons/.test(html) && !/🩹 Scars/.test(html) && !/data-give-in/.test(html) && !/ERR:/.test(html));
      ok(`basic: wound tooltips drop the Ultimate and Give in lines`, !/Give in:/.test(CE.dossier("angry", 3, "them")) && !/Fury/.test(CE.dossier("angry", 3, "them")));
      await CE.setTier(b, "angry", 3, "X");
      await CE.onLongRest(b);
      ok(`basic: a ●●● Wound about yourself eases instead of scarring (tier ${CE.getTier(b, "angry")}, no Cruelty)`, CE.getTier(b, "angry") === 2 && !CE.hasScar(b, "cruelty"));
      const k = makeActor("basK"); makeActor("basL");
      await R.TSLBondStore.add("basK", "basL", { type: "lover", attitude: 3 });
      const appB = Object.create(R.SocialFencingApp.prototype);
      Object.assign(appB, { _actor: k, _expandedBonds: new Set(R.TSLBondStore.getList("basK").map((x) => x.id)), _picking: false });
      let bh = "";
      try { bh = appB._buildBondsTab(await appB.getData()); } catch (e) { bh = "ERR:" + e.stack; }
      ok(`basic: a ●●● bond shows no ability / signature`, !/tsl-chr-ability/.test(bh) && !/tsl-chr-signature/.test(bh) && !/ERR:/.test(bh));
      if (/ERR:/.test(bh)) console.log(bh.slice(0, 500));
      const cod = Object.create(R.SocialFencingApp.prototype);
      cod._actor = actorB;
      cod._codexCat = "feelings";
      let fh = "";
      try { fh = cod._buildCodexTab({ isGM: true }); } catch (e) { fh = "ERR:" + e.message; }
      ok(`basic: the Feelings page is the Wounds alone, no undefined`, /emotional layer — basic/.test(fh) && !/Willpower — the resource/.test(fh) && !/undefined|ERR:/.test(fh));
      __settings.set("tsl-social-conflict.emotionalLayer", "full");
      let bh2 = "";
      try { bh2 = appB._buildBondsTab(await appB.getData()); } catch (e) { bh2 = "ERR:" + e.stack; }
      ok(`full: the same bond shows its ability and signature again`, /tsl-chr-ability/.test(bh2) && /tsl-chr-signature/.test(bh2));
    }

    // 6) Codex renders without undefined — every page
    {
      const app = Object.create(R.SocialFencingApp.prototype);
      app._actor = actorB;
      for (const cat of ["start", "moves", "openings", "statuses", "feelings", "details", "natures", "gm"]) {
        app._codexCat = cat;
        let html = "";
        try { html = app._buildCodexTab({ isGM: true }); } catch (e) { html = "ERR:" + e.message; }
        ok(`codex ${cat} renders, no undefined`, typeof html === "string" && html.length > 100 && !/undefined|NaN|ERR:/.test(html));
      }
    }

    console.log(CARD_SUSPECT ? `(${CARD_SUSPECT} card-suspect lines above)` : "no card suspects");
    console.log(pass ? "DONE — pipeline clean" : "PIPELINE FAIL: assertions failed");
    if (!pass) process.exit(1);
  } catch (e) {
    console.log("PIPELINE FAIL:", e.stack);
    process.exit(1);
  }
})();
