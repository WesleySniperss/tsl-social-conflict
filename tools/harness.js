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
  ["tsl-social-conflict.bondAuraRange", 15],
  ["tsl-social-conflict.socialDcBonus", 0],
  ["tsl-social-conflict.npcDefenseAuto", true],
  ["tsl-social-conflict.emotionalLayer", "full"],
  ["tsl-social-conflict.gmConfirmCloseOnly", true],
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
// Every created card is kept (globalThis.__cards) and can be UPDATED like a
// real ChatMessage — the roll card folds what followed into itself.
globalThis.__cards = [];
const suspect = (c) => { if (typeof c === "string" && /undefined|NaN/.test(c)) { CARD_SUSPECT++; console.log("CARD SUSPECT:", c.slice(0, 240)); } };
globalThis.ChatMessage = {
  create: async (data) => {
    suspect(data.content);
    const msg = { content: data.content, whisper: data.whisper,
      update: async (p) => { if ("content" in p) { suspect(p.content); msg.content = p.content; } return msg; } };
    globalThis.__cards.push(msg);
    return msg;
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
  "ARCHETYPE_TELLS", "ARCHETYPE_REACTIONS", "TSLSceneVisualizer", "TSLMoments"];
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

// Reusable by tools/preview.js (require() skips the test run).
module.exports = { api, makeActor, actorStore, settingsMap };

if (require.main === module) (async () => {
  try {
    const R = api;
    let pass = true;
    const ok = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) pass = false; };
    const SM = R.SocialManeuverRoller, EM = R.SocialEncounterManager, CE = R.TSLConditionEffects;
    const SAM = R.SocialArchetypeManager, BS = R.TSLBondStore, SS = R.TSLStringStore, SCOPE = "tsl-social-conflict";
    const mv = (id) => R.SOCIAL_MANEUVERS.find((m) => m.id === id);
    const pay = (src, tgt, id, extra = {}) => ({ sourceActorId: src, targetActorId: tgt, maneuverId: id,
      outcomeType: "success", relation: "neutral", total: 20, dc: 10, card: null, ...extra });
    const holds = (a, b) => SS.getList(a).filter((e) => e.targetActorId === b).length;
    const comp = (a) => EM.getEncounter(a).composure;
    const savedPO = SM.promptOutcome;
    const grade = (g) => { SM.promptOutcome = async () => g; };
    const npc = (id, o = {}) => { const a = makeActor(id, o); a.hasPlayerOwner = false; return a; };

    // ═══ v2.0 — ONE track: Composure ═════════════════════════════════════════

    // 1) Composure from the sheet: 2 + CHA + WIS, never below 2
    {
      const t = EM.suggestTracks(actorB);   // cha2 wis3
      ok(`Composure = 2 + CHA + WIS (want 7): ${t.composure}`, t.composure === 7);
      const mook = makeActor("mook", { cha: -1, wis: 0 });
      ok(`floor 2 (mook): ${EM.suggestTracks(mook).composure}`, EM.suggestTracks(mook).composure === 2);
      const legacy = makeActor("legacy");
      await legacy.setFlag(SCOPE, "encounter", { active: true, resolve: 3, maxResolve: 4, patience: 5, maxPatience: 5, outcome: null });
      const le = EM.getEncounter(legacy);
      ok(`a pre-2.0 exchange reads its Resolve as Composure (${le.composure}/${le.maxComposure})`, le.composure === 3 && le.maxComposure === 4);
    }

    // 2) A hit takes the target's composure; a miss takes the attacker's own
    {
      const A = makeActor("hA", { cha: 3, wis: 1 });   // 6
      const T = makeActor("hT", { cha: 2, wis: 2 });   // 6
      grade("success");
      await SM.applyOutcome(pay("hA", "hT", "persuade"));
      ok(`hit: Persuade takes 1 (target ${comp(T)}/6), attacker untouched (${comp(A)}/6)`, comp(T) === 5 && comp(A) === 6);
      grade("crit");
      await SM.applyOutcome(pay("hA", "hT", "persuade", { outcomeType: "crit" }));
      ok(`clean hit: +1 (target ${comp(T)})`, comp(T) === 3);
      grade("failure");
      await SM.applyOutcome(pay("hA", "hT", "intimidate", { outcomeType: "failure" }));
      ok(`miss: a risky Intimidate costs the ATTACKER 2 (${comp(A)}/6), target untouched (${comp(T)})`, comp(A) === 4 && comp(T) === 3);
      await SM.applyOutcome(pay("hA", "hT", "persuade", { outcomeType: "failure", leverage: "fear" }));
      ok(`a missed Fear backfires +1 (attacker ${comp(A)})`, comp(A) === 2);
      const V = makeActor("hV", { cha: 3, wis: 3 });  // 8
      grade("success");
      await SM.applyOutcome(pay("hA", "hV", "flatter", { relation: "vulnerable" }));
      ok(`a weak spot hits +1 (Flatter 2+1 → ${comp(V)}/8)`, comp(V) === 5);
      const pv = SM.previewOutcomes(SM.assess(A, V, mv("intimidate"), {}), mv("intimidate"));
      ok(`stakes line: "${pv.miss}"`, /you lose 2 composure/.test(pv.miss) && /composure/.test(pv.hit));
    }

    // 3) The break point: give in or storm off — who decides, and what it costs
    {
      // a PLAYER decides in the moment (a window)
      makeActor("bkA", { cha: 3, wis: 1 });
      const P = makeActor("bkP", { cha: 0, wis: 0 });   // 2
      grade("success");
      globalThis.__dialogPick = "storm";
      await SM.applyOutcome(pay("bkA", "bkP", "throw_gauntlet"));   // −3
      globalThis.__dialogPick = null;
      const pe = EM.getEncounter(P);
      ok(`player broke and STORMED OFF by choice (${pe.outcome}): a Grudge about the winner (${CE.getWoundSource(P, "spiteful")}), the winner holds a String (${holds("bkA", "bkP")})`,
        pe.outcome === "walked" && CE.hasCondition(P, "spiteful") && CE.getWoundSource(P, "spiteful") === "bkA" && holds("bkA", "bkP") === 1);
      // NPCs follow their nature — no window
      const brk = npc("bkBroker", { cha: 0, wis: 0 }); await SAM.setArchetype(brk, "broker");
      const due = npc("bkDuel",   { cha: 0, wis: 0 }); await SAM.setArchetype(due, "duelist");
      const c0 = globalThis.__dialogCount;
      await SM.applyOutcome(pay("bkA", "bkBroker", "throw_gauntlet"));
      await SM.applyOutcome(pay("bkA", "bkDuel", "throw_gauntlet"));
      ok(`NPCs break by nature, no window: Broker gives in (${EM.getEncounter(brk).outcome}), Duelist storms off (${EM.getEncounter(due).outcome}) with a Grudge`,
        globalThis.__dialogCount === c0 && EM.getEncounter(brk).outcome === "swayed" && EM.getEncounter(due).outcome === "walked" && CE.hasCondition(due, "spiteful") && !CE.hasCondition(brk, "spiteful"));
      // Desperate can't storm off; Enthralled never storms off from the charmer
      const D = makeActor("bkD", { cha: 0, wis: 0 }); await SAM.setActorData(D, { stance: "firm" });
      await SAM.applyCondition(D, "desperate", game.actors.get("bkA"));
      await SM.applyOutcome(pay("bkA", "bkD", "throw_gauntlet"));
      const E = makeActor("bkE", { cha: 0, wis: 0 }); await SAM.setActorData(E, { stance: "firm" });
      await SAM.applyCondition(E, "smitten", game.actors.get("bkA"));
      await SM.applyOutcome(pay("bkA", "bkE", "persuade"));   // Persuade isn't Power — the spell holds
      await SM.applyOutcome(pay("bkA", "bkE", "persuade"));
      ok(`"Stands firm", yet Desperate gives in (${EM.getEncounter(D).outcome}) and so does the Enthralled (${EM.getEncounter(E).outcome})`,
        EM.getEncounter(D).outcome === "swayed" && EM.getEncounter(E).outcome === "swayed");
      // a finished exchange is over in both directions
      const blockA = SM.assess(game.actors.get("bkA"), P, mv("persuade"), {});
      const blockB = SM.assess(P, game.actors.get("bkA"), mv("persuade"), {});
      ok(`finished exchange blocks both directions`, blockA.relation === "blocked" && blockB.relation === "blocked");
      // the attacker can lose too — on their own misses
      const W = makeActor("bkW", { cha: 0, wis: 0 });   // 2
      makeActor("bkX", { cha: 2, wis: 2 });
      grade("failure");
      globalThis.__dialogPick = "give";
      await SM.applyOutcome(pay("bkW", "bkX", "intimidate", { outcomeType: "failure" }));
      globalThis.__dialogPick = null;
      ok(`attacker cracked on a risky miss (${EM.getEncounter(W).outcome}); the defender takes the String (${holds("bkX", "bkW")})`,
        EM.getEncounter(W).outcome === "swayed" && holds("bkX", "bkW") === 1);
      SM.promptOutcome = savedPO;
    }

    // 4) Hold the Line — the one defensive choice, against a STATE
    {
      const D = makeActor("hlD", { cha: 4, wis: 2 });
      const o = { defender: D, attacker: actorA, maneuver: mv("flatter"), status: "smitten", holdOptions: ["obsessed", "jealous"], stance: "ask" };
      globalThis.__formPick = { "tsl-state": "accept" };
      ok(`window: accept → no hold`, (await SM.promptHoldLine(o)).hold === null);
      globalThis.__formPick = { "tsl-state": "hold-jealous" };
      ok(`window: hold the line → Jealousy`, (await SM.promptHoldLine(o)).hold === "jealous");
      globalThis.__formPick = null;
      const c0 = globalThis.__dialogCount;
      const y = await SM.promptHoldLine({ ...o, stance: "yield" });
      const f = await SM.promptHoldLine({ ...o, stance: "firm" });
      ok(`"Gives ground" accepts, "Stands firm" holds with a fresh Wound (${f.hold}) — no window`, y.hold === null && f.hold === "obsessed" && globalThis.__dialogCount === c0);
      await CE.applyOne(D, "obsessed", "X"); await CE.applyOne(D, "jealous", "X");
      ok(`"Stands firm" with no fresh Wound left accepts`, (await SM.promptHoldLine({ ...o, stance: "firm" })).hold === null);

      // through the pipeline: the hold refuses the state; the composure hit still lands
      makeActor("hlA", { cha: 3, wis: 1 });
      const T = makeActor("hlT", { cha: 3, wis: 3 });   // 8, a PC → window
      grade("success");
      globalThis.__formPick = { "tsl-state": "hold-angry" };
      await SM.applyOutcome(pay("hlA", "hlT", "instigate"));   // Taunt: 1 + Provoked
      globalThis.__formPick = null;
      ok(`held: Wrath instead of Provoked, the blow landed (${comp(T)}/8), the Wound remembers its source`,
        CE.hasCondition(T, "angry") && !SAM.getActiveCondition(T, "provoked") && comp(T) === 7 && CE.getWoundSource(T, "angry") === "hlA");
      await CE.setTier(T, "angry", 3, "hlA", "hlA"); await CE.setTier(T, "spiteful", 3, "hlA", "hlA");
      globalThis.__formPick = { "tsl-state": "hold-angry" };
      const c1 = globalThis.__dialogCount;
      await SM.applyOutcome(pay("hlA", "hlT", "instigate"));
      globalThis.__formPick = null;
      ok(`both Wounds at ●●● → nothing to hold with: no window, the state lands`, !!SAM.getActiveCondition(T, "provoked") && globalThis.__dialogCount === c1);
      ok(`Overwhelmed = weight ≥ 4 (load ${CE.woundLoad(T)})`, CE.isOverwhelmed(T));
      SM.promptOutcome = savedPO;
    }

    // ═══ States change what people DO ════════════════════════════════════════
    {
      const A = makeActor("sA", { cha: 3, wis: 1 }), B = makeActor("sB", { cha: 3, wis: 1 }), T = makeActor("sT", { cha: 4, wis: 3 });

      // Provoked: must answer the provoker; can't hold the line against them; spent once they lash out
      await SAM.applyCondition(T, "provoked", A);
      ok(`Provoked: a maneuver at someone else is blocked`, SM.assess(T, B, mv("persuade"), {}).relation === "blocked");
      ok(`…at the provoker it's allowed`, SM.assess(T, A, mv("persuade"), {}).relation !== "blocked");
      grade("success");
      const c0 = globalThis.__dialogCount;
      globalThis.__formPick = { "tsl-state": "hold-obsessed" };
      await SM.applyOutcome(pay("sA", "sT", "flatter"));
      globalThis.__formPick = null;
      ok(`…and can't hold the line against the provoker (Enthralled landed, no window)`, !!SAM.getActiveCondition(T, "smitten") && globalThis.__dialogCount === c0);
      await SAM.removeCondition(T, "smitten");
      await SM.applyOutcome(pay("sT", "sA", "persuade"));
      ok(`…spent once they've lashed out`, !SAM.getActiveCondition(T, "provoked"));

      // Cowed: no Power moves or threats at whoever cowed them
      await SAM.applyCondition(T, "cowed", A);
      ok(`Cowed: Flatter and Intimidate at the one who cowed them are blocked; Persuade and others aren't`,
        SM.assess(T, A, mv("flatter"), {}).relation === "blocked" && SM.assess(T, A, mv("intimidate"), {}).relation === "blocked"
        && SM.assess(T, A, mv("persuade"), {}).relation !== "blocked" && SM.assess(T, B, mv("flatter"), {}).relation !== "blocked");
      await SAM.removeCondition(T, "cowed");

      // Rattled / Humbled / Exposed — the attacker's own rolls falter
      await SAM.applyCondition(A, "rattled", T);
      const r1 = SM.assess(A, T, mv("persuade"), {});
      ok(`Rattled: disadvantage on their next maneuver`, r1.disadvantage && /Rattled/.test(r1.disadvantageReasons.join()));
      grade("failure");
      await SM.applyOutcome(pay("sA", "sT", "persuade", { outcomeType: "failure" }));
      ok(`…spent once they've acted`, !SAM.getActiveCondition(A, "rattled"));
      await SAM.applyCondition(A, "humbled", T);
      ok(`Humbled: Performance / Intimidation maneuvers at disadvantage, Persuade isn't`,
        SM.assess(A, T, mv("instigate"), {}).disadvantage && !SM.assess(A, T, mv("persuade"), {}).disadvantage);
      grade("success");
      await SM.applyOutcome(pay("sA", "sT", "persuade"));
      ok(`…landing a maneuver wins the face back`, !SAM.getActiveCondition(A, "humbled"));
      await SAM.applyCondition(A, "exposed", T);
      ok(`Exposed: Deception maneuvers at disadvantage`, SM.assess(A, T, mv("lie"), {}).disadvantage && !SM.assess(A, T, mv("persuade"), {}).disadvantage);
      await SAM.removeCondition(A, "exposed");

      // Exposed on a target whispers their Mask to the one who caught them out
      await SAM.setActorData(T, { points: { mask: "The loyal captain" } });
      const n0 = globalThis.__cards.length;
      await SM.applyOutcome(pay("sA", "sT", "logic_exploit"));
      const whispered = globalThis.__cards.slice(n0).some((c) => c.whisper && /Mask/.test(c.content) && /loyal captain/.test(c.content));
      ok(`Cross-Examine exposes them — and their Mask is whispered`, !!SAM.getActiveCondition(T, "exposed") && whispered);

      // Suspicious: a Deception that misses badly; their lies falter; an honest word clears it
      const S = makeActor("sS", { cha: 3, wis: 1 }), L = makeActor("sL", { cha: 3, wis: 3 });
      grade("botch");
      await SM.applyOutcome(pay("sL", "sS", "lie", { outcomeType: "botch" }));
      ok(`a botched Lie: they're Suspicious of the liar`, SAM.getActiveCondition(S, "suspicious")?.flags?.[SCOPE]?.sourceActorId === "sL");
      ok(`…the liar's Deception falters against them`, SM.assess(L, S, mv("sow_doubt"), {}).disadvantage);
      grade("success");
      await SM.applyOutcome(pay("sL", "sS", "persuade"));
      ok(`…and an honest Persuade clears it`, !SAM.getActiveCondition(S, "suspicious"));

      // Intrigued: the next read lands on its own — even a natural 1 — and spends it
      const I = makeActor("sI", { cha: 2, wis: 2 });
      await SAM.applyCondition(I, "intrigued", A);
      ok(`Intrigued: Read Them lands on its own`, SM.assess(A, I, mv("cold_reading"), {}).autoSuccess);
      globalThis.__forceDice = [1];
      const p = await SM.rollManeuver(A, I, mv("cold_reading"), {});
      globalThis.__forceDice = null;
      ok(`…even on a natural 1 (${p.outcomeType}, auto ${p.auto})`, (p.outcomeType === "success" || p.outcomeType === "crit") && p.auto === true);
      SM.promptOutcome = savedPO;
      const c2 = globalThis.__dialogCount;
      await SM.applyOutcome(p);
      ok(`…no GM window for it, and Intrigued is spent`, globalThis.__dialogCount === c2 && !SAM.getActiveCondition(I, "intrigued"));

      // Steadied: the next state doesn't take
      const St = makeActor("sSt", { cha: 2, wis: 2 });
      await SAM.applyCondition(St, "steadied", B);
      grade("success");
      await SM.applyOutcome(pay("sA", "sSt", "instigate"));
      ok(`Steadied shrugs off Provoked (and is spent)`, !SAM.getActiveCondition(St, "provoked") && !SAM.getActiveCondition(St, "steadied"));

      // Defiant: walled except for Read Them, which cracks it
      const Df = makeActor("sDf", { cha: 2, wis: 2 });
      await SAM.applyCondition(Df, "defiant", A);
      ok(`Defiant: Persuade blocked, Read Them slips through`, SM.assess(A, Df, mv("persuade"), {}).relation === "blocked" && SM.assess(A, Df, mv("cold_reading"), {}).relation !== "blocked");
      await SM.applyOutcome(pay("sA", "sDf", "cold_reading"));
      ok(`…a successful read cracks the wall`, !SAM.getActiveCondition(Df, "defiant"));

      // Enthralled curdles into Provoked when the charmer turns Power on them
      const Ch = makeActor("sCh", { cha: 5, wis: 3 });
      await SAM.applyCondition(Ch, "smitten", A);
      ok(`Enthralled: they can't move against the charmer`, SM.assess(Ch, A, mv("persuade"), {}).relation === "blocked");
      await SM.applyOutcome(pay("sA", "sCh", "throw_gauntlet"));
      ok(`…a Power move from the charmer breaks it into Provoked`, !SAM.getActiveCondition(Ch, "smitten") && SAM.getActiveCondition(Ch, "provoked")?.flags?.[SCOPE]?.sourceActorId === "sA");

      // Mock kicks someone already carrying a (bad) state; a good one doesn't count
      const K = makeActor("sK", { cha: 3, wis: 3 });   // 8
      await SAM.applyCondition(K, "steadied", B);
      ok(`a good state isn't "off balance"`, !SM.assess(A, K, mv("sow_doubt"), {}).kick);
      await SAM.removeCondition(K, "steadied");
      await SAM.applyCondition(K, "rattled", B);
      ok(`a bad one is: Mock kicks (+1)`, SM.assess(A, K, mv("sow_doubt"), {}).kick);
      SM.promptOutcome = savedPO;
    }

    // Levers — Beholden and Enthralled are called in by whoever put them there
    {
      const H = makeActor("lvH", { cha: 3 }), T = makeActor("lvT", { cha: 2 }), O = makeActor("lvO");
      await SAM.setActorData(T, { points: { fear: "Losing the ship" } });
      await SAM.applyCondition(T, "guilted", H);
      ok(`someone else can't call it`, (await SM.callLever("lvO", "lvT", "guilted")) === false && !!SAM.getActiveCondition(T, "guilted"));
      const n0 = globalThis.__cards.length;
      ok(`the holder calls the debt`, (await SM.callLever("lvH", "lvT", "guilted")) === true);
      const made = globalThis.__cards.slice(n0);
      ok(`…a public card + a secret whispered, and the debt is gone`,
        made.some((c) => /Call the debt/.test(c.content)) && made.some((c) => c.whisper && /Losing the ship/.test(c.content)) && !SAM.getActiveCondition(T, "guilted"));
      await SAM.applyCondition(T, "smitten", H, { charges: 2 });
      await SM.callLever("lvH", "lvT", "smitten");
      ok(`a deep Enthralled (×2) asks two favors`, SAM.getCharges(SAM.getActiveCondition(T, "smitten")) === 1);
      // the GM relay
      const sent = []; const se = game.socket.emit; game.socket.emit = (n, p) => sent.push(p);
      const su = game.user; game.user = { id: "p1", isGM: false, name: "P" };
      R.TSLGMActions.request("callLever", { holderId: "lvH", targetId: "lvT", stateId: "smitten" });
      game.user = su;
      ok(`a player's call goes to the GM`, sent.length === 1 && sent[0].type === "GM_ACTION" && sent[0].data?.action === "callLever");
      game.socket.emit = se;
    }

    // Reassure — the one maneuver aimed at a friend
    {
      const A = makeActor("rsA", { cha: 3, wis: 1 }), F = makeActor("rsF", { cha: 2, wis: 2 });   // 6
      ok(`Reassure: DC 10, a miss costs nothing`, SM.assess(A, F, mv("reassure"), {}).dc === 10 && SM.assess(A, F, mv("reassure"), {}).missCost === 0);
      await EM.ensureActive(F); await EM.adjustComposure(F, -3);
      grade("success");
      await SM.applyOutcome(pay("rsA", "rsF", "reassure"));
      ok(`hit: +1 composure (3→${comp(F)}) and Steadied`, comp(F) === 4 && !!SAM.getActiveCondition(F, "steadied"));
      grade("crit");
      await SM.applyOutcome(pay("rsA", "rsF", "reassure", { outcomeType: "crit" }));
      ok(`clean hit: +2 (→${comp(F)}) and Undaunted`, comp(F) === 6 && !!SAM.getActiveCondition(F, "undaunted"));
      grade("failure");
      const before = comp(A);
      await SM.applyOutcome(pay("rsA", "rsF", "reassure", { outcomeType: "failure" }));
      ok(`miss: costs the reassurer nothing (${comp(A)} = ${before})`, comp(A) === before);
      // Undaunted: their next miss costs nothing, then it's spent
      const T2 = makeActor("rsT", { cha: 2, wis: 2 });
      const f0 = comp(F);
      await SM.applyOutcome(pay("rsF", "rsT", "intimidate", { outcomeType: "failure" }));
      ok(`Undaunted: a missed Intimidate costs nothing (${comp(F)} = ${f0}), and it's spent`, comp(F) === f0 && !SAM.getActiveCondition(F, "undaunted"));
      SM.promptOutcome = savedPO;
    }

    // States know bonds: deep ×2 / won't take; the Answer too
    {
      const A = makeActor("bdA", { cha: 3, wis: 1 }), T = makeActor("bdT", { cha: 6, wis: 2 });
      await BS.add("bdT", "bdA", { type: "crush", attitude: 2 });
      grade("success");
      globalThis.__formPick = { "tsl-state": "accept" };
      await SM.applyOutcome(pay("bdA", "bdT", "love_bombing"));
      globalThis.__formPick = null;
      ok(`a Crush makes Enthralled run deep (×${SAM.getCharges(SAM.getActiveCondition(T, "smitten"))})`, SAM.getCharges(SAM.getActiveCondition(T, "smitten")) === 2);
      const U = makeActor("bdU", { cha: 6, wis: 2 });
      await BS.add("bdU", "bdA", { type: "enemy", attitude: 1 });
      ok(`the preview says it won't take`, /won't take/.test(SM.previewOutcomes(SM.assess(A, U, mv("flatter"), {}), mv("flatter")).hit));
      await SM.applyOutcome(pay("bdA", "bdU", "flatter"));
      ok(`an Enemy shrugs off Enthralled — the blow still lands (${comp(U)}/10)`, !SAM.getActiveCondition(U, "smitten") && comp(U) === 8);
      const D = makeActor("ansD", { cha: 4, wis: 2 }), E2 = makeActor("ansE", { cha: 3, wis: 2 });
      await SAM.setArchetype(D, "martyr");
      await BS.add("ansE", "ansD", { type: "enemy", attitude: 1 });
      grade("botch");
      await SM.applyOutcome(pay("ansE", "ansD", "flatter", { outcomeType: "botch" }));
      ok(`the Answer respects the bond (Beholden doesn't take on an enemy)`, !SAM.getActiveCondition(E2, "guilted"));
      SM.promptOutcome = savedPO;
    }

    // How long states last — and that they stop once they've run out
    {
      const meta = R.SOCIAL_CONDITIONS.provoked;
      ok(`in a fight a state runs by ROUNDS (${JSON.stringify(SAM.stateDuration(meta, { inCombat: true }))})`, SAM.stateDuration(meta, { inCombat: true }).rounds === 1 && !("seconds" in SAM.stateDuration(meta, { inCombat: true })));
      ok(`out of one, by game time (${JSON.stringify(SAM.stateDuration(meta, { inCombat: false }))})`, SAM.stateDuration(meta, { inCombat: false }).seconds === 600);
      const F = makeActor("durF"); F.inCombat = true;
      await SAM.applyCondition(F, "guilted", actorA);
      ok(`applied mid-fight: duration ${JSON.stringify(SAM.getActiveCondition(F, "guilted")?.duration)}`, SAM.getActiveCondition(F, "guilted")?.duration?.rounds === 3);
      const x = SAM.getActiveCondition(F, "guilted"); x.active = false;   // Foundry v14: expired → suppressed
      ok(`an expired state no longer counts`, !SAM.getActiveCondition(F, "guilted"));
      const C = makeActor("clrC");
      for (const id of ["provoked", "cowed", "intrigued"]) await SAM.applyCondition(C, id, actorA);
      await CE.applyOne(C, "angry", "X");
      await CE.onLongRest(C);
      ok(`a long rest clears every state (a Wound only eases)`, R.SOCIAL_CONDITION_ORDER.every((id) => !SAM.getActiveCondition(C, id)) && !CE.hasCondition(C, "angry"));
      const tip = SAM.stateTooltip("guilted", { charges: 2, source: "Lyra" });
      ok(`one tooltip says it all: lever, ×2, how long, refuse, in a fight`, /Call the debt/.test(tip) && /×2/.test(tip) && /Lasts:/.test(tip) && /Refuse it:/.test(tip) && /In a fight:/.test(tip) && !/undefined/.test(tip));
    }

    // Strings: at most 3; Pull is a real effect (strike / guard) that ends itself
    {
      makeActor("capA"); makeActor("capB");
      const n = await SS.add("capA", "capB", 5);
      ok(`String cap: asked for 5, got ${n}`, n === 3 && SS.isCapped("capA", "capB"));
      const H = game.actors.get("capA"), G = game.actors.get("capB");
      ok(`Pull — strike`, await SS.pull(H, G, "strike"));
      const st = H.effects.find((e) => e.flags?.[SCOPE]?.stringPull?.mode === "strike");
      ok(`…a String spent (${SS.countOn("capA", "capB")} left), +5 effect on the sheet (${st?.changes?.length} changes)`, SS.countOn("capA", "capB") === 2 && st && st.changes.length === 3);
      await SS.pull(H, G, "guard");
      const gd = H.effects.find((e) => e.flags?.[SCOPE]?.stringPull?.mode === "guard");
      ok(`Pull — guard: +5 AC`, gd && gd.changes.some((c) => /ac/.test(c.key) && /5/.test(c.value)));
      // the hooks end them: the holder rolls → strike gone; the target rolls → guard gone
      const handlers = {}; const on = Hooks.on; Hooks.on = (n2, fn) => { handlers[n2] = fn; return 1; };
      SS.registerPullHooks(); Hooks.on = on;
      await handlers.createChatMessage({ rolls: [{}], speaker: { actor: "capA" } });
      ok(`the holder's next roll ends the strike (guard stays)`, !H.effects.some((e) => e.flags?.[SCOPE]?.stringPull?.mode === "strike") && H.effects.some((e) => e.flags?.[SCOPE]?.stringPull?.mode === "guard"));
      await handlers.createChatMessage({ rolls: [{}], speaker: { actor: "capB" } });
      ok(`their next roll ends the guard`, !H.effects.some((e) => e.flags?.[SCOPE]?.stringPull));
      makeActor("capZ");
      ok(`no String, no pull`, (await SS.pull(H, game.actors.get("capZ"), "strike")) === false);
    }

    // Desperate binds them to the one who made them so — not to everyone
    {
      const A = makeActor("dsA", { cha: 3, wis: 1 }), B = makeActor("dsB", { cha: 3, wis: 1 });
      const T1 = makeActor("dsT1", { cha: 0, wis: 0 }), T2 = makeActor("dsT2", { cha: 0, wis: 0 });
      for (const t of [T1, T2]) { await SAM.setActorData(t, { stance: "firm" }); await SAM.applyCondition(t, "desperate", A); }
      grade("success");
      await SM.applyOutcome(pay("dsA", "dsT1", "throw_gauntlet"));
      await SM.applyOutcome(pay("dsB", "dsT2", "throw_gauntlet"));
      ok(`Desperate for A: broken by A → gives in (${EM.getEncounter(T1).outcome}); broken by B → can still storm off (${EM.getEncounter(T2).outcome})`,
        EM.getEncounter(T1).outcome === "swayed" && EM.getEncounter(T2).outcome === "walked");
      SM.promptOutcome = savedPO;
    }

    // Scars: real numbers on the sheet, rules the module enforces, immunity that can't be gamed
    {
      const sc = (a, id) => a.effects.find((e) => e.flags?.[SCOPE]?.scar === id);
      const C = makeActor("scC", { cha: 3, wis: 1 }); await CE.applyScar(C, "cruelty");
      const keys = (sc(C, "cruelty")?.changes ?? []).map((c) => `${c.key}=${c.value}`);
      ok(`Cruelty is on the sheet: ${keys.join(", ")}`, keys.includes("system.skills.itm.bonuses.check=+2") && keys.includes("system.skills.per.bonuses.check=-2"));
      const V = makeActor("scV", { cha: 3, wis: 3 });   // 8
      ok(`Cruelty: the preview counts the extra composure (${SM.assess(C, V, mv("persuade"), {}).estDamage})`, SM.assess(C, V, mv("persuade"), {}).estDamage === 2);
      grade("success");
      await SM.applyOutcome(pay("scC", "scV", "persuade"));
      ok(`…and a landed Persuade takes 2 (8→${comp(V)})`, comp(V) === 6);
      const before = comp(V);
      await SM.applyOutcome(pay("scC", "scV", "cold_reading"));
      ok(`…a read isn't a blow — it stays at 0 (${comp(V)})`, comp(V) === before);

      const M = makeActor("scM", { cha: 3, wis: 3 }); await CE.applyScar(M, "mask");
      ok(`the Mask: reading them rolls with disadvantage`, SM.assess(C, M, mv("cold_reading"), {}).disadvantage);
      const pm = SM.assess(M, V, mv("persuade"), {}).bonusReasons.find((b) => /Mask/.test(b.label));
      ok(`…and their honest Persuade takes −2 (${pm?.value})`, pm?.value === -2);
      globalThis.__formPick = { "tsl-state": "hold-shamed" };
      await SM.applyOutcome(pay("scC", "scM", "sow_doubt"));   // Mock → Humbled (holdAs Shame / Wrath)
      globalThis.__formPick = null;
      ok(`immune to Shame → it can't carry a held line: Humbled lands`, !!SAM.getActiveCondition(M, "humbled") && CE.getTier(M, "shamed") === 0);
      const n0 = globalThis.__cards.length;
      await SM.applyOutcome(pay("scC", "scM", "throw_gauntlet", { card: { rawDice: [14], systemRoll: false } }));
      const card = globalThis.__cards.slice(n0).map((c) => c.content).join(" ");
      ok(`Humiliate vs the Mask: the card says the shame doesn't stick (and none does)`, /doesn't stick/.test(card) && !/It sticks/.test(card) && CE.getTier(M, "shamed") === 0);

      const H = makeActor("scH", { cha: 3, wis: 3 }); await CE.applyScar(H, "hollow");
      ok(`the Hollow: Cowed won't take (preview: ${SM.assess(C, H, mv("intimidate"), {}).stateFx?.mode})`, SM.assess(C, H, mv("intimidate"), {}).stateFx?.mode === "resist");
      await SM.applyOutcome(pay("scC", "scH", "intimidate"));
      ok(`…the threat still lands, the fear doesn't (${comp(H)}/8, Cowed: ${!!SAM.getActiveCondition(H, "cowed")})`, comp(H) < 8 && !SAM.getActiveCondition(H, "cowed"));
      ok(`…and −1 to every check is on the sheet`, (sc(H, "hollow")?.changes ?? []).some((c) => /abilities/.test(c.key) && /-1/.test(String(c.value))));

      const old = makeActor("scOld");
      await old.createEmbeddedDocuments("ActiveEffect", [{ name: "The Cold", flags: { [SCOPE]: { scar: "cold" } }, changes: [], description: "old" }]);
      const n = await CE.resyncScars([old]);
      ok(`a Scar from before v2.0 is brought up to date (${n}): ${(sc(old, "cold")?.changes ?? []).length} changes`, n === 1 && sc(old, "cold").changes.length === 2);
      SM.promptOutcome = savedPO;
    }

    // Moments: what ⚡ Ultimates and ★ Signatures put on the sheet — and take off again
    {
      const MO = R.TSLMoments;
      const mom = (a) => a.effects.filter((e) => e.flags?.[SCOPE]?.moment);
      const keysOf = (cs) => cs.map((c) => `${c.key}=${c.value}`);
      // the keys each system really reads
      const advA5e = keysOf(MO.changes({ adv: true }));
      ok(`a5e advantage → the four roll modes the system expands (incl. abilitySave): ${advA5e.length}`,
        advA5e.includes("flags.a5e.effects.rollMode.abilitySave.all=1") && advA5e.includes("flags.a5e.effects.rollMode.attack.all=1") && advA5e.length === 4);
      game.system.id = "dnd5e";
      const advDnd = keysOf(MO.changes({ adv: true, critOn: 2 }));
      ok(`dnd5e advantage → system.rolls.*.mode (+ crit on 2 via DOWNGRADE)`, advDnd.includes("system.rolls.ability.save.mode=1") && advDnd.includes("system.rolls.attack.mode=1")
        && MO.changes({ critOn: 2 })[0].mode === 3);
      game.system.id = "a5e";
      ok(`a5e: no state writes the dead savingThrow key; Desperate's crit range DOWNGRADEs`,
        !JSON.stringify(R.SOCIAL_CONDITIONS).includes("rollMode.savingThrow") && R.SOCIAL_CONDITIONS.desperate.dnd5eChanges.find((c) => /Critical/.test(c.key)).mode === 3);

      // ⚡ Wrath's Fury: only at ●●●, spends 1 Willpower, −2 AC until the next turn
      const W = makeActor("ulW", { cha: 2, wis: 1 });
      await CE.applyOne(W, "angry", "X");
      await R.TSLWillpower.set(W, 2);
      ok(`not at ●●● → refused, nothing spent`, (await MO.fireUltimate({ actorId: "ulW", kind: "wound", id: "angry" })) === false && R.TSLWillpower.get(W) === 2);
      await CE.setTier(W, "angry", 3, "X");
      const n0 = globalThis.__cards.length;
      ok(`at ●●● it fires`, await MO.fireUltimate({ actorId: "ulW", kind: "wound", id: "angry" }));
      const fury = mom(W)[0];
      ok(`Fury: 1 Willpower spent (${R.TSLWillpower.get(W)}), −2 AC on the sheet until the next turn, a card`,
        R.TSLWillpower.get(W) === 1 && fury?.changes.some((c) => /ac/.test(c.key) && /-2/.test(String(c.value))) && fury.flags[SCOPE].moment.ends === "turn"
        && globalThis.__cards.slice(n0).some((c) => /Fury/.test(c.content) && /−2 AC/.test(c.content)));

      // the hooks end them on time
      const handlers = {}; const on = Hooks.on; Hooks.on = (n, fn) => { handlers[n] = fn; return 1; };
      MO.registerHooks(); Hooks.on = on;
      W.inCombat = true;
      await handlers.createChatMessage({ rolls: [{}], speaker: { actor: "ulW" } });
      ok(`in a fight a roll doesn't end a "turn" moment`, mom(W).length === 1);
      await handlers.updateCombat({ round: 2, turn: 0, combatant: { actor: W } }, { turn: 0 });
      ok(`…their next turn does`, mom(W).length === 0);
      W.inCombat = false;

      // Rally: the allies named get advantage on their next roll — then it's gone
      const H = makeActor("ulH", { cha: 2 }), A1 = makeActor("ulA1"), A2 = makeActor("ulA2");
      await CE.setTier(H, "hope", 3, "GM");
      await MO.fireUltimate({ actorId: "ulH", kind: "boon", id: "hope", allyIds: ["ulA1", "ulA2"] });
      ok(`Rally: both allies carry advantage`, MO.hasAdv(A1) && MO.hasAdv(A2) && !MO.hasAdv(H));
      await handlers.createChatMessage({ rolls: [{}], speaker: { actor: "ulA1" } });
      ok(`…an ally's roll spends theirs only`, !MO.hasAdv(A1) && MO.hasAdv(A2));

      // a moment's advantage reaches the maneuver roll too
      ok(`advantage from a moment shows in assess`, SM.assess(A2, A1, mv("persuade"), {}).advantage);

      // Eye of the Storm: shake off the state you name, then Steadied
      const C = makeActor("ulC", { cha: 2 });
      await SAM.applyCondition(C, "rattled", A1); await SAM.applyCondition(C, "cowed", A1);
      await CE.setTier(C, "calm", 3, "GM");
      await MO.fireUltimate({ actorId: "ulC", kind: "boon", id: "calm", clearId: "cowed" });
      ok(`Eye of the Storm: Cowed gone, Rattled kept, Steadied`, !SAM.getActiveCondition(C, "cowed") && !!SAM.getActiveCondition(C, "rattled") && !!SAM.getActiveCondition(C, "steadied"));

      // Infectious: allies recover composure and shake off a state
      const J = makeActor("ulJ", { cha: 2 }), F = makeActor("ulF", { cha: 2, wis: 2 });
      await EM.ensureActive(F); await EM.adjustComposure(F, -2);
      await SAM.applyCondition(F, "humbled", A1);
      await CE.setTier(J, "joy", 3, "GM");
      const f0 = comp(F);
      await MO.fireUltimate({ actorId: "ulJ", kind: "boon", id: "joy", allyIds: ["ulF"] });
      ok(`Infectious: +1 composure (${f0}→${comp(F)}) and Humbled shaken off`, comp(F) === f0 + 1 && !SAM.getActiveCondition(F, "humbled"));

      // Unbreakable: the next save counts its d20 as a 20 (a5e minRoll on every save)
      const U = makeActor("ulU"); await CE.setTier(U, "resolve", 3, "GM");
      await MO.fireUltimate({ actorId: "ulU", kind: "boon", id: "resolve" });
      ok(`Unbreakable: minRoll 20 on all six saves`, mom(U)[0]?.changes.filter((c) => /save\.minRoll/.test(c.key) && c.value === 20).length === 6);

      // Claim: an edge on your next maneuver against the rival you name — spent by it
      const Jl = makeActor("ulJl", { cha: 3, wis: 1 }), Rv = makeActor("ulRv", { cha: 2, wis: 2 }), Ot = makeActor("ulOt", { cha: 2, wis: 2 });
      await CE.setTier(Jl, "jealous", 3, "X");
      await MO.fireUltimate({ actorId: "ulJl", kind: "wound", id: "jealous", pickId: "ulRv" });
      ok(`Claim: advantage against the rival, not against anyone else`, SM.assess(Jl, Rv, mv("persuade"), {}).advantage && !SM.assess(Jl, Ot, mv("persuade"), {}).advantage);
      grade("success");
      await SM.applyOutcome(pay("ulJl", "ulRv", "persuade"));
      ok(`…spent by that maneuver`, !MO.edgeVs(Jl, "ulRv"));

      // Reckoning: the next maneuver against the one the Grudge is about lands twice as hard
      const Gr = makeActor("ulGr", { cha: 3, wis: 1 }), Gs = makeActor("ulGs", { cha: 3, wis: 3 });   // 8
      await CE.setTier(Gr, "spiteful", 3, "ulGs", "ulGs");
      await MO.fireUltimate({ actorId: "ulGr", kind: "wound", id: "spiteful" });
      ok(`Reckoning: the preview doubles it (${SM.assess(Gr, Gs, mv("persuade"), {}).estDamage})`, SM.assess(Gr, Gs, mv("persuade"), {}).estDamage === 2);
      await SM.applyOutcome(pay("ulGr", "ulGs", "persuade"));
      ok(`…and the blow takes 2 (8→${comp(Gs)}), edge spent`, comp(Gs) === 6 && !MO.edgeVs(Gr, "ulGs"));

      // Turn the Tables: if it lands, they carry Shame too
      const Sh = makeActor("ulSh", { cha: 3, wis: 1 }), Ss = makeActor("ulSs", { cha: 3, wis: 3 });
      await CE.setTier(Sh, "shamed", 3, "ulSs", "ulSs");
      await MO.fireUltimate({ actorId: "ulSh", kind: "wound", id: "shamed" });
      await SM.applyOutcome(pay("ulSh", "ulSs", "persuade"));
      ok(`Turn the Tables: the one who shamed them now carries Shame`, CE.hasCondition(Ss, "shamed"));

      // Own the Room: each challenger's next maneuver is at disadvantage — once each
      const P = makeActor("ulP", { cha: 3, wis: 3 }), X1 = makeActor("ulX1", { cha: 2, wis: 1 }), X2 = makeActor("ulX2", { cha: 2, wis: 1 });
      await CE.setTier(P, "pride", 3, "GM");
      await MO.fireUltimate({ actorId: "ulP", kind: "boon", id: "pride" });
      ok(`Own the Room: challengers at disadvantage`, SM.assess(X1, P, mv("persuade"), {}).disadvantage && SM.assess(X2, P, mv("persuade"), {}).disadvantage);
      grade("failure");
      await SM.applyOutcome(pay("ulX1", "ulP", "persuade", { outcomeType: "failure" }));
      ok(`…once each: X1 has run into it, X2 hasn't yet`, !SM.assess(X1, P, mv("persuade"), {}).disadvantage && SM.assess(X2, P, mv("persuade"), {}).disadvantage);

      // Berserk (a Scar): on dnd5e the next weapon attack crits on 2–20
      game.system.id = "dnd5e";
      const B = makeActor("ulB"); await CE.applyScar(B, "cruelty"); await R.TSLWillpower.set(B, 1);
      await MO.fireUltimate({ actorId: "ulB", kind: "scar", id: "cruelty" });
      ok(`Berserk: crit threshold 2 on the sheet`, mom(B)[0]?.changes.some((c) => /weaponCriticalThreshold/.test(c.key) && String(c.value) === "2"));
      game.system.id = "a5e";

      // ★ Signatures: once per long rest, effects on both sheets
      const Me = makeActor("sgMe"), Pr = makeActor("sgPr"), En = makeActor("sgEn", { cha: 3, wis: 3 }), Lg = makeActor("sgLg");
      await BS.add("sgMe", "sgPr", { type: "mentor", attitude: 3 });   // they are my protégé? mentor ↔ protégé mirror
      const myToPr = BS.getList("sgPr").find((b) => b.targetActorId === "sgMe");
      ok(`the mirror makes them hold a ●●● ${myToPr?.type} bond toward me`, myToPr?.type === "protege");
      await MO.invokeSignature({ actorId: "sgPr", bondId: myToPr.id });
      ok(`Someone is watching: advantage on both sheets, the signature spent`, MO.hasAdv(Me) && MO.hasAdv(Pr) && BS.getList("sgPr").find((b) => b.id === myToPr.id)?.sigUsed);
      ok(`…a second invoke before a long rest is refused`, (await MO.invokeSignature({ actorId: "sgPr", bondId: myToPr.id })) === false);
      await BS.add("sgMe", "sgEn", { type: "enemy", attitude: 3 });
      const toEn = BS.getList("sgMe").find((b) => b.targetActorId === "sgEn");
      await MO.invokeSignature({ actorId: "sgMe", bondId: toEn.id });
      ok(`Personal: the next maneuver against the enemy lands twice as hard`, !!MO.edgeVs(Me, "sgEn")?.fencing.double);
      await BS.add("sgLg", "sgMe", { type: "liege", attitude: 3 });
      const toSw = BS.getList("sgLg").find((b) => b.targetActorId === "sgMe");
      await MO.invokeSignature({ actorId: "sgLg", bondId: toSw.id, choice: 1 });
      ok(`By my word, "I press them": +5 on the liege's next roll`, mom(Lg).some((e) => e.changes.length > 0 && /5/.test(JSON.stringify(e.changes))));
      SM.promptOutcome = savedPO;
    }

    // ═══ Kept from earlier versions ══════════════════════════════════════════

    // Socket relay (player → GM)
    {
      const saved = game.user, savedGM = game.users.activeGM;
      const sent = [];
      const se = game.socket.emit; game.socket.emit = (n, p) => sent.push(p);
      let applied = null;
      const origApply = SM.applyOutcome;
      SM.applyOutcome = async (a) => { applied = a; };
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
      SM.applyOutcome = origApply; game.user = saved; game.users.activeGM = savedGM; game.socket.emit = se;
    }

    // A race on the REAL pipeline (rollManeuver → applyOutcome): pressing costs
    {
      const runs = async (N, atkBonus) => {
        const tally = { atkWins: 0, atkCracks: 0, other: 0 };
        const atk = makeActor("mcAtk", { cha: 3, wis: 1 });          // 6
        const def = npc("mcDef", { cha: 2, wis: 2, int: 3 });        // 6, DC 15
        atk.system.skills = { dec: { total: atkBonus }, prf: { total: 0, proficient: 0 } };
        for (let i = 0; i < N; i++) {
          await EM.endEncounter(atk); await EM.endEncounter(def);
          for (const e of [...def.effects]) await def.deleteEmbeddedDocuments("ActiveEffect", [e.id]);
          for (let k = 0; k < 40; k++) {
            const p = await SM.rollManeuver(atk, def, mv("sow_doubt"), {});
            await SM.applyOutcome(p);
            if (EM.getEncounter(def).outcome) { tally.atkWins++; break; }
            if (EM.getEncounter(atk).outcome) { tally.atkCracks++; break; }
            if (k === 39) tally.other++;
          }
        }
        return tally;
      };
      SM.promptOutcome = async (_s, _t, _m, _tot, _dc, p) => p;
      const strong = await runs(150, 8);   // hits 70%
      ok(`a strong attacker wins the race: ${strong.atkWins}/150 (cracked ${strong.atkCracks})`, strong.atkWins / 150 > 0.8 && strong.other === 0);
      const weak = await runs(150, 2);     // hits 40%
      ok(`a weak one often cracks first: ${weak.atkCracks}/150`, weak.atkCracks / 150 > 0.2);
      SM.promptOutcome = savedPO;
    }

    // Natural 1 always misses; the support skill adds proficiency only
    {
      const big = makeActor("natA", { cha: 4, wis: 1 });
      big.system.skills = { per: { total: 30 }, ins: { total: 4, proficient: 1 } };
      big.system.attributes.prof = 3;
      makeActor("natT", { cha: 1, wis: 1 });
      globalThis.__forceDice = [1];
      const p1 = await SM.rollManeuver(big, game.actors.get("natT"), mv("persuade"), {});
      ok(`natural 1 with +33 still misses (${p1.outcomeType})`, p1.natural === 1 && (p1.outcomeType === "failure" || p1.outcomeType === "botch"));
      globalThis.__forceDice = [12];
      const p2 = await SM.rollManeuver(big, game.actors.get("natT"), mv("persuade"), {});
      ok(`an ordinary roll with the same bonus hits (${p2.outcomeType})`, p2.outcomeType === "crit" || p2.outcomeType === "success");
      globalThis.__forceDice = null;
      const sup = makeActor("supA", { cha: 4, wis: 1 });
      sup.system.attributes.prof = 3;
      sup.system.skills = { per: { total: 7 }, dec: { total: 7, proficient: 1 }, ins: { total: 4, proficient: 1 }, inv: { total: 0, proficient: 0 } };
      const tgt = makeActor("supT", { cha: 1, wis: 1 });
      const supOf = (id) => SM.assess(sup, tgt, mv(id), {}).bonusReasons.find((b) => /support/.test(b.label))?.value ?? 0;
      ok(`support = proficiency, not the full modifier: Flatter +${supOf("flatter")} (3)`, supOf("flatter") === 3);
      ok(`untrained support adds nothing: Read Them +${supOf("cold_reading")}`, supOf("cold_reading") === 0);
    }

    // Long rest: Wounds ease / calcify, Boons fade, Willpower refills
    {
      const lr = makeActor("restA", { cha: 1 });
      await CE.setTier(lr, "angry", 3, "X");
      await CE.setTier(lr, "scared", 2, "X");
      await CE.setTier(lr, "hopeless", 1, "X");
      await CE.setTier(lr, "shamed", 3, "X");
      await CE.applyOne(lr, "valor", "GM");
      await R.TSLWillpower.set(lr, 0);
      await CE.onLongRest(lr);
      ok(`●●● Wrath → Cruelty, ●●● Shame → The Mask`, !CE.hasCondition(lr, "angry") && CE.hasScar(lr, "cruelty") && CE.hasScar(lr, "mask"));
      ok(`●● Fear eased to ● (${CE.getTier(lr, "scared")}), ● Despair healed`, CE.getTier(lr, "scared") === 1 && !CE.hasCondition(lr, "hopeless"));
      ok(`Boon faded, Willpower refilled`, !CE.hasCondition(lr, "valor") && R.TSLWillpower.get(lr) === R.TSLWillpower.getMax(lr));
      ok(`nine Wounds, eight Boons, four Scars`, CE.ORDER.length === 9 && CE.BOON_ORDER.length === 8 && CE.SCAR_ORDER.length === 4);
    }

    // Give in to a Wound → Willpower (Despair → Inspiration); only if carried
    {
      const gi = makeActor("giveA", { cha: 1 });
      await CE.applyOne(gi, "jealous", "X");
      await R.TSLWillpower.set(gi, 0);
      const r1 = await CE.giveIn(gi, "jealous");
      ok(`give in to Jealousy → +1 Willpower`, r1?.gained === "willpower" && R.TSLWillpower.get(gi) === 1);
      ok(`can't give in to a Wound you don't carry`, (await CE.giveIn(gi, "scared")) === null);
      await CE.applyOne(gi, "hopeless", "X");
      ok(`give in to Despair → Inspiration`, (await CE.giveIn(gi, "hopeless"))?.gained === "inspiration");
    }

    // a5e: triad dots → 3-letter skill keys; Strife counts the Wounds actually carried
    {
      const tr = makeActor("triadA");
      await tr.setFlag(SCOPE, "socialFencing", { triad: { power: 1, attention: 2, order: 0 } });
      await SAM.syncTriadBonusEffect(tr);
      const keys = (tr.effects.find((e) => e.flags?.[SCOPE]?.triadBonus)?.changes ?? []).map((c) => c.key);
      ok(`a5e triad AE uses 3-letter keys`, keys.includes("system.skills.ins.bonuses.check") && keys.includes("system.skills.itm.bonuses.check"));
      const cp = makeActor("confA");
      cp.system.attributes.strife = 1;
      await CE.applyOne(cp, "angry", "X");
      await CE._applyToParticipant({ actorId: "confA", name: "confA", conditions: { angry: true, scared: true } }, "Foe");
      const angryCount = cp.effects.filter((e) => CE._condOf(e) === "angry").length;
      ok(`conflict end: no duplicate Wound (${angryCount}), missing one added, Strife 1→${cp.system.attributes.strife}`,
        angryCount === 1 && CE.hasCondition(cp, "scared") && cp.system.attributes.strife === 3);
      const cq = makeActor("confB"); cq.system.attributes.strife = 0;
      await CE.applyOne(cq, "shamed", "X");
      await CE._applyToParticipant({ actorId: "confB", name: "confB", conditions: {} }, "Foe");
      ok(`a Wound put on the actor directly still counts (Strife ${cq.system.attributes.strife})`, cq.system.attributes.strife === 1);
    }

    // An exchange belongs to its scene
    {
      game.scenes.active = { id: "sceneA" };
      const st = makeActor("staleA", { cha: 2, wis: 1 });
      await EM.ensureActive(st);
      await SAM.setActorData(st, { stance: "yield" });
      await EM.adjustComposure(st, -10);
      ok(`resolved in scene A`, EM.isResolved(st));
      game.scenes.active = { id: "sceneB" };
      ok(`in scene B the old exchange is gone`, !EM.getEncounter(st).active && !EM.getEncounter(st).outcome);
      const fresh = await EM.ensureActive(st);
      ok(`…a new one starts there`, fresh?.active && fresh.sceneId === "sceneB");
      delete game.scenes.active;
    }

    // Natures: names, explanations, the matrix, the veil, how each holds up
    {
      const archs = R.SOCIAL_ARCHETYPES;
      const byId = (id) => archs.find((a) => a.id === id);
      ok(`renamed: Schemer / Idol / Zealot (ids kept)`, byId("machiavellian")?.label === "Schemer" && byId("exalted")?.label === "Idol" && byId("dogmatic")?.label === "Zealot");
      ok(`every nature explains itself and says how it holds up`, archs.every((a) => a.psych && a.strengths && a.weaknesses && ["yield", "firm"].includes(a.pressed) && a.pressedWhy));
      ok(`every maneuver has a strong and a weak side`, R.SOCIAL_MANEUVERS.every((m) => m.edge && m.risk));
      const rel = (a) => SAM.getManeuverRelationsFor(a);
      ok(`every nature has ≥1 weak spot and ≥1 wall`, archs.every((a) => rel(a).vulnerable.length >= 1 && rel(a).immune.length >= 1));
      const leaks = [];
      for (const pool of [R.ARCHETYPE_TELLS, R.ARCHETYPE_REACTIONS]) for (const lines of Object.values(pool ?? {}))
        for (const line of lines) for (const a of archs) if (line.toLowerCase().includes(a.label.toLowerCase())) leaks.push(`${a.label}: ${line}`);
      ok(`no tell or reaction names a nature (${leaks.length})${leaks.length ? " — " + leaks[0] : ""}`, leaks.length === 0);
      ok(`every state has a gist and a rule; every state you can refuse names its Wounds`,
        R.SOCIAL_CONDITION_ORDER.every((id) => R.SOCIAL_CONDITIONS[id].gist && R.SOCIAL_CONDITIONS[id].description
          && (R.SOCIAL_CONDITIONS[id].noHold || R.SOCIAL_CONDITIONS[id].positive || (R.SOCIAL_CONDITIONS[id].holdAs ?? []).every((w) => CE.getMeta(w)))));
      ok(`"When pressed": a PC decides in the moment, an NPC follows its nature, the world switch makes NPCs ask`,
        (() => { const pc = makeActor("wpPC"); const n1 = npc("wpN"); return SAM.getStance(pc) === "ask"; })());
      const nT = npc("wpT"); await SAM.setArchetype(nT, "tyrant");
      const nB = npc("wpB"); await SAM.setArchetype(nB, "broker");
      __settings.set("tsl-social-conflict.npcDefenseAuto", false);
      const asked = SAM.getStance(nT);
      __settings.set("tsl-social-conflict.npcDefenseAuto", true);
      ok(`…Tyrant stands firm, Broker gives ground, auto off → ask`, SAM.getStance(nT) === "firm" && SAM.getStance(nB) === "yield" && asked === "ask");
      await SAM.setActorData(nB, { stance: "guarded" });
      ok(`an old v1.82 stance maps over (guarded → firm)`, SAM.getStance(nB) === "firm");
    }

    // Wounds about a person settle into bonds; bond shifts are type-aware
    {
      makeActor("shL"); makeActor("shW"); makeActor("shF"); makeActor("shG");
      await BS.add("shL", "shW", { type: "enemy", attitude: 2 });
      const r1 = await BS.shiftAfterExchange("shL", "shW", "swayed");
      const r2 = await BS.shiftAfterExchange("shL", "shW", "walked");
      ok(`Enemy: giving in eases (→${r1.strength}), storming off hardens (→${r2.strength})`, r1.strength === 1 && r2.strength === 2);
      const B = makeActor("obB"); makeActor("obS");
      await CE.setTier(B, "obsessed", 3, "obS", "obS");
      await CE.onLongRest(B);
      ok(`Obsession ●●● overnight → a Crush bond (mirrored)`, BS.find("obB", "obS")?.type === "crush" && BS.find("obS", "obB")?.type === "crush" && !CE.hasCondition(B, "obsessed"));
    }

    // The triad dots' skill bonus is explicit
    {
      const L = makeActor("leanA", { cha: 1 });
      L.system.skills = { itm: { mod: 1, proficient: 0 } };
      await L.setFlag(SCOPE, "socialFencing", { triad: { power: 2, attention: 0, order: 0 } });
      await SAM.syncTriadBonusEffect(L);
      ok(`Social Leanings: +2 Intimidation, and the skill includes it (${SM.getSkillMod(L, mv("intimidate"))})`, SAM.leanSkillBonus(L, "itm") === 2 && SM.getSkillMod(L, mv("intimidate")) === 3);
    }

    // The GM confirms only close calls (or a natural 1)
    {
      const c0 = globalThis.__dialogCount;
      const r1 = await savedPO.call(SM, actorA, actorB, mv("persuade"), 20, 14, "crit", { natural: 15 });
      ok(`a clear result applies without a window (${r1})`, r1 === "crit" && globalThis.__dialogCount === c0);
      await savedPO.call(SM, actorA, actorB, mv("persuade"), 15, 14, "success", { natural: 12 });
      await savedPO.call(SM, actorA, actorB, mv("persuade"), 25, 14, "failure", { natural: 1 });
      ok(`a close call and a natural 1 still ask`, globalThis.__dialogCount === c0 + 2);
    }

    // One roll, one card
    {
      const card = (dice = [3]) => ({ rawDice: dice, systemRoll: false });
      makeActor("ocA", { cha: 3, wis: 2 });
      const T = npc("ocT", { cha: 4, wis: 2 }); await SAM.setArchetype(T, "tyrant");   // Power → Rattled
      SM.promptOutcome = async (_s, _t, _m, _tot, _dc, p) => p;
      let n0 = globalThis.__cards.length;
      await SM.applyOutcome(pay("ocA", "ocT", "lie", { outcomeType: "botch", total: 4, natural: 3, card: card() }));
      let made = globalThis.__cards.slice(n0);
      const c = made[0]?.content ?? "";
      ok(`a botched Lie is ONE card (${made.length}): the Answer, caught, Suspicious, Inspiration`,
        made.length === 1 && /Rattled/.test(c) && /gains a String on/.test(c) && /Suspicious/.test(c) && /Inspiration/.test(c));
      const P = makeActor("ocP", { cha: 5, wis: 3 });   // 10
      makeActor("ocB", { cha: 3, wis: 1 });
      await SM.applyOutcome(pay("ocB", "ocP", "throw_gauntlet", { card: card([15]) }));
      ok(`Humiliate leaves a lasting Shame (tier ${CE.getTier(P, "shamed")})`, CE.getTier(P, "shamed") === 1);
      const W = npc("ocW", { cha: 0, wis: 0 }); await SAM.setArchetype(W, "broker");   // 2 → one Humiliate breaks
      makeActor("ocV", { cha: 3, wis: 1 });
      n0 = globalThis.__cards.length;
      await SM.applyOutcome(pay("ocV", "ocW", "throw_gauntlet", { card: card([16]) }));
      made = globalThis.__cards.slice(n0);
      ok(`a break: the roll card first, then "Gives in" (${made.length} cards)`, made.length === 2 && /Humiliate/.test(made[0].content) && /Gives in/.test(made[1].content));
      ok(`a blow that landed shows the target's reaction line`, /tsl-mv-tell/.test(made[0].content));
      const a = { ...SM.assess(actorA, T, mv("persuade"), {}), advantageReasons: ["Dangling their Desire — the offer speaks for you"], relation: "neutral" };
      const html = SM._cardContent({ sourceActor: actorA, targetActor: T, maneuver: mv("persuade"), assessment: a,
        total: 18, outcomeType: "success", outcomeText: "x", rawDice: [12, 6], advantage: true });
      ok(`advantage wears ADV (not ◎); the higher die is kept`, /tsl-mv-adv">ADV</.test(html) && /tsl-mv-die ">12</.test(html) && /tsl-mv-die--dropped">6</.test(html));
      SM.promptOutcome = savedPO;
    }

    // ═══ The windows render ═════════════════════════════════════════════════

    // Conflict window: composure, states (+ State / lever), the result in the bar
    {
      const a1 = makeActor("cwA", { cha: 3, wis: 1 }), a2 = makeActor("cwB", { cha: 2, wis: 2 });
      await SAM.applyCondition(a2, "smitten", a1, { charges: 2 });
      await SAM.applyCondition(a2, "guilted", a1);
      await CE.applyOne(a2, "shamed", "cwA", "cwA");
      R.ConflictStore.state = { active: true, selectedTokenIds: [], turn: 0, log: [], resolved: false, resolution: null,
        participants: [
          { tokenId: "t1", actorId: "cwA", name: "cwA", img: "", color: "#e8557a", stats: [], conditions: {} },
          { tokenId: "t2", actorId: "cwB", name: "cwB", img: "", color: "#9b6ee8", stats: [], conditions: {} },
        ] };
      const app = Object.create(R.TSLConflictApp.prototype);
      Object.assign(app, { _pendingRoll: null, _selectedMove: mv("intimidate"), _selectedTarget: 1, _pendingStringSpend: null, _pendingLeverage: null, _gmActingIdx: 0 });
      await EM.startEncounter(a1, 2);   // one risky miss from cracking
      let html = "";
      try { html = app._renderHTML(await app.getData()); } catch (e) { html = "ERR:" + e.stack; }
      ok(`conflict window renders: Composure, "nearly gone", the miss cost, no undefined`,
        !/undefined|NaN|ERR:/.test(html) && /Composure/.test(html) && /composure is nearly gone/.test(html) && /you lose 2 composure/.test(html));
      ok(`…states as tags (Enthralled ×2), a lever to call, + State for the GM, the Shame wound`,
        /Enthralled ×2/.test(html) && /data-call-lever="guilted"/.test(html) && /tsl-state-add/.test(html) && /Shame/.test(html));
      if (/ERR:/.test(html)) console.log(html.slice(0, 600));
      app._pendingRoll = { kind: "maneuver", moveName: "Intimidate", icon: "fa-hand-fist", target: "cwB", total: 17, dc: 14, outcome: "success", natural: 11 };
      let rh = "";
      try { rh = app._renderHTML(await app.getData()); } catch (e) { rh = "ERR:" + e.stack; }
      ok(`the result shows IN the bar (no overlay), with Continue`, /tsl-bar--result/.test(rh) && /tsl-dice-close/.test(rh) && !/tsl-dice-overlay/.test(rh) && !/ERR:/.test(rh));
      R.ConflictStore.state = null;
    }

    // Chronicle: console, own exchange + levers, result in place, Nature, wounds, codex
    {
      const me = makeActor("chA", { cha: 3, wis: 1 }), them = makeActor("chB", { cha: 2, wis: 2 });
      await EM.startEncounter(me, 4);
      await SAM.applyCondition(them, "guilted", me);
      const savedTokens = canvas.tokens.placeables;
      canvas.tokens.placeables = [{ actor: them, document: { hidden: false, texture: {} }, visible: true }];
      const app = Object.create(R.SocialFencingApp.prototype);
      Object.assign(app, { _actor: me, _fenceTargetId: "chB", _fenceManeuverId: "persuade", _fenceLeverage: null, _fenceStringSpend: false, _fenceRoll: null, _expandedBonds: new Set(), _picking: false });
      const ctx = await app.getData();
      let html = "";
      try { html = app._buildFencingTab({ ...ctx, isGM: false }); } catch (e) { html = "ERR:" + e.stack; }
      ok(`console + own exchange render: Composure, "a miss costs 1", the lever row, no undefined`,
        !/undefined|NaN|ERR:/.test(html) && /Composure/.test(html) && /a miss costs 1/.test(html) && /Levers you hold/.test(html) && /Call the debt/.test(html));
      if (/ERR:/.test(html)) console.log(html.slice(0, 600));
      app._fenceRoll = { name: "Persuade", icon: "fa-comments", target: "chB", total: 9, dc: 15, outcome: "failure", natural: 7 };
      let rh = "";
      try { rh = app._buildManeuverConsole({ ...ctx, isGM: false }); } catch (e) { rh = "ERR:" + e.stack; }
      ok(`the console shows the result where Roll was`, /tsl-bar--result/.test(rh) && /✗ A miss/.test(rh) && /tsl-fence-close/.test(rh) && !/ERR:/.test(rh));
      canvas.tokens.placeables = savedTokens;

      const t = npc("natT2"); await SAM.setArchetype(t, "duelist");
      const pa = Object.create(R.SocialFencingApp.prototype); pa._actor = t;
      let ph = "";
      try { ph = pa._buildProfileTab({ notes: SAM.getCharacterNotes(t), archetype: SAM.getArchetype(t), canEdit: true, isGM: true }); } catch (e) { ph = "ERR:" + e.stack; }
      ok(`Profile: one Nature block (Leanings + When pressed "By nature (Stands firm)"), implied dots for the NPC`,
        /Leanings/.test(ph) && /When pressed/.test(ph) && /By nature \(Stands firm\)/.test(ph) && /implied/.test(ph) && !/undefined|ERR:/.test(ph));
      const pc = makeActor("natPC");
      const pp = Object.create(R.SocialFencingApp.prototype); pp._actor = pc;
      let pch = "";
      try { pch = pp._buildProfileTab({ notes: SAM.getCharacterNotes(pc), archetype: null, canEdit: true, isGM: false }); } catch (e) { pch = "ERR:" + e.stack; }
      ok(`a player's Profile: the same Nature block, "Decide each time" chosen, no archetype selector`,
        /Leanings/.test(pch) && /value="ask" selected/.test(pch) && !/name="archetypeId"/.test(pch) && !/ERR:/.test(pch));

      await CE.applyOne(me, "jealous", "X");
      let wh = "";
      try { wh = app._buildWoundToggles({ activeWounds: { jealous: 1 }, willpower: { cur: 1, max: 2 }, isGM: false }); } catch (e) { wh = "ERR:" + e.stack; }
      ok(`an active Wound has its Give in button`, /data-give-in="jealous"/.test(wh) && !/ERR:/.test(wh));

      const cod = Object.create(R.SocialFencingApp.prototype); cod._actor = actorB;
      for (const cat of ["start", "moves", "statuses", "openings", "feelings", "natures", "details", "gm"]) {
        cod._codexCat = cat;
        let ch = "";
        try { ch = cod._buildCodexTab({ isGM: true }); } catch (e) { ch = "ERR:" + e.message; }
        ok(`codex ${cat} renders, no undefined`, ch.length > 100 && !/undefined|NaN|ERR:/.test(ch) && ch.includes(`data-codex-cat="${cat}"`));
        if (/ERR:/.test(ch)) console.log(ch.slice(0, 300));
      }
      cod._codexCat = "statuses";
      const sh = cod._buildCodexTab({ isGM: true });
      ok(`the States page answers: automatic? how long? into combat?`, /Are they automatic\?/.test(sh) && /How long\?/.test(sh) && /Into combat\?/.test(sh) && /on the sheet/.test(sh));
      const anyOld = ["start", "moves", "statuses", "feelings", "natures", "details", "gm"].some((cat) => {
        cod._codexCat = cat; return /\bResolve\b|\bPatience\b|parr(y|ied)|riposte|break off|broke off/i.test(cod._buildCodexTab({ isGM: true }).replace(/Conviction|resolve:/g, ""));
      });
      ok(`no page mentions the old Resolve / Patience / parry`, !anyOld);
    }

    // Basic emotional layer: the Wounds alone
    {
      __settings.set("tsl-social-conflict.emotionalLayer", "basic");
      const b = makeActor("basA", { cha: 2 });
      await CE.applyOne(b, "angry", "X");
      const app = Object.create(R.SocialFencingApp.prototype);
      Object.assign(app, { _actor: b, _fenceTargetId: null, _fenceManeuverId: null, _fenceRoll: null, _expandedBonds: new Set(), _picking: false });
      let html = "";
      try { html = app._buildFencingTab(await app.getData()); } catch (e) { html = "ERR:" + e.stack; }
      ok(`basic: Wounds stay; no Willpower, Boons, Scars or Give in`,
        /❤ Wounds/.test(html) && !/⬡ Willpower/.test(html) && !/✦ Boons/.test(html) && !/🩹 Scars/.test(html) && !/data-give-in/.test(html) && !/ERR:/.test(html));
      __settings.set("tsl-social-conflict.emotionalLayer", "full");
    }

    console.log(CARD_SUSPECT ? `(${CARD_SUSPECT} card-suspect lines above)` : "no card suspects");
    console.log(pass ? "DONE — pipeline clean" : "PIPELINE FAIL: assertions failed");
    if (!pass) process.exit(1);
  } catch (e) {
    console.log("PIPELINE FAIL:", e.stack);
    process.exit(1);
  }
})();
