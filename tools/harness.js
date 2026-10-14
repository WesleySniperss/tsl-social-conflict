/**
 * tools/harness.js — stubbed-Foundry smoke test for tsl-social-conflict (v3).
 *
 * Runs OUTSIDE Foundry: stubs the globals the scripts touch, concatenates the
 * manifest's classic scripts into ONE `new Function` scope (they share a lexical
 * env exactly like <script> tags), then drives the real logic and prints
 * ok/FAIL lines. Ends with "DONE — pipeline clean" on success.
 *
 * Run:  node tools/harness.js
 * It only needs Node built-ins. Not in module.json — never loads in Foundry.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));

// ── Foundry stubs ────────────────────────────────────────────────────────────
const settingsMap = new Map([
  ["tsl-social-conflict.useSystemRollDialog", false],
  ["tsl-social-conflict.socialDcBonus", 0],
  ["tsl-social-conflict.dataVersion", 0],
]);
globalThis.__settings = settingsMap;

const getProperty = (obj, key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setProperty = (obj, key, val) => {
  const parts = key.split("."); let o = obj;
  while (parts.length > 1) { const k = parts.shift(); o = (o[k] ??= {}); }
  o[parts[0]] = val; return true;
};
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
// Foundry's mergeObject merges deeply by default — so must the stub.
const mergeObject = (a, b) => {
  const out = JSON.parse(JSON.stringify(a ?? {}));
  for (const [k, v] of Object.entries(b ?? {})) out[k] = isObj(v) && isObj(out[k]) ? mergeObject(out[k], v) : v;
  return out;
};
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

globalThis.foundry = {
  utils: {
    mergeObject, deepClone: clone, duplicate: clone,
    getProperty, setProperty, hasProperty: (o, k) => getProperty(o, k) !== undefined,
    isEmpty: (o) => !o || Object.keys(o).length === 0,
    randomID: () => "id" + Math.random().toString(36).slice(2, 10),
    escapeHTML: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    debounce: (fn) => fn,
  },
  appv1: { api: {} },
};

// jQuery-ish shim: our apps do `$(html)` in _renderInner and `html[0]` elsewhere.
globalThis.$ = (x) => (typeof x === "string" ? [{ innerHTML: x, querySelector: () => null, querySelectorAll: () => [] }] : x);

class StubApplication {
  constructor(options = {}) { this.options = options; this.element = null; this.rendered = false; }
  static get defaultOptions() { return {}; }
  async render() { this.rendered = true; return this; }
  activateListeners() {}
  async minimize() {}
  async maximize() {}
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
    // `globalThis.__forceDice = [..]` feeds exact faces (consumed in order).
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
};

let CARD_SUSPECT = 0;
globalThis.__cards = [];
const suspect = (c) => { if (typeof c === "string" && /undefined|NaN|\[object Object\]/.test(c)) { CARD_SUSPECT++; console.log("CARD SUSPECT:", c.slice(0, 300)); } };
globalThis.ChatMessage = {
  create: async (data) => {
    suspect(data.content);
    const msg = { content: data.content, whisper: data.whisper, rolls: data.rolls,
      update: async (p) => { if ("content" in p) { suspect(p.content); msg.content = p.content; } return msg; } };
    globalThis.__cards.push(msg);
    return msg;
  },
  getSpeaker: ({ actor } = {}) => (actor ? { actor: actor.id, alias: actor.name } : {}),
};

// Dialog stub: auto-press a chosen button (default: the `default`), or a queue
// of picks `__dialogQueue` consumed one per dialog. Radio forms read
// `__formPick = { <input name>: value }`.
globalThis.__dialogPick = null;
globalThis.__dialogQueue = [];
globalThis.__formPick = null;
globalThis.__dialogCount = 0;
globalThis.__dialogs = [];
globalThis.Dialog = class Dialog {
  constructor(cfg, opts) { this.cfg = cfg; this.opts = opts; }
  render() {
    const cfg = this.cfg;
    globalThis.__dialogCount++;
    globalThis.__dialogs.push(cfg);
    const fakeRoot = {
      querySelectorAll: () => [],
      querySelector: (sel) => {
        const m = String(sel).match(/input\[name="?([\w-]+)"?\]:checked/);
        const v = m ? globalThis.__formPick?.[m[1]] : undefined;
        return v != null ? { value: v } : null;
      },
    };
    const keys = Object.keys(cfg.buttons ?? {});
    const queued = globalThis.__dialogQueue.length ? globalThis.__dialogQueue.shift() : null;
    const want = queued ?? globalThis.__dialogPick;
    const key = (want && keys.includes(want)) ? want : (cfg.default ?? keys[0]);
    const cb = cfg.buttons?.[key]?.callback;
    if (cb) cb([fakeRoot]); else cfg.close?.();
    return this;
  }
};

globalThis.HTMLElement = class HTMLElement {};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.canvas = { tokens: { placeables: [], get: () => null }, stage: {}, app: {}, grid: {}, dimensions: {}, scene: { id: "scene1" } };

const onceHooks = {};
globalThis.Hooks = {
  on: () => 1, once: (n, fn) => { (onceHooks[n] ??= []).push(fn); return 1; },
  off: () => {}, callAll: () => {}, call: () => {},
  _fire: (n, ...a) => { for (const fn of onceHooks[n] ?? []) try { fn(...a); } catch (e) {} },
};
globalThis.CONFIG = { statusEffects: [], A5E: { ROLL_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } } };
globalThis.CONST = { ACTIVE_EFFECT_MODES: { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 } };

// ── Actor factory (dnd5e/a5e-ish) ────────────────────────────────────────────
const actorStore = {};
globalThis.__fxSeq = 0;
function makeActor(id, { cha = 0, wis = 0, con = 0, int = 0 } = {}, { npc = false, prof = 2, skills = {} } = {}) {
  const flags = {};
  const effects = [];
  const a = {
    id, name: id, img: "", type: npc ? "npc" : "character", isOwner: true, hasPlayerOwner: !npc,
    system: { abilities: { cha: { mod: cha }, wis: { mod: wis }, con: { mod: con }, int: { mod: int } },
      attributes: { prof }, skills: clone(skills) },
    effects, flags, token: null,
    testUserPermission: () => true,
    getFlag: (scope, key) => getProperty(flags, `${scope}.${key}`),
    // Foundry stores a copy — so does the stub (a forgotten save shows up).
    setFlag: async (scope, key, val) => { setProperty(flags, `${scope}.${key}`, clone(val)); return a; },
    unsetFlag: async (scope, key) => { const s = flags[scope]; if (s) delete s[key]; return a; },
    update: async (patch) => { for (const [k, v] of Object.entries(patch)) setProperty(a, k, v); return a; },
    createEmbeddedDocuments: async (_t, arr) => {
      for (const e of arr) {
        e.id ??= "fx" + (++globalThis.__fxSeq);
        e.statuses = new Set(e.statuses ?? []);
        effects.push(e);
      }
      return arr;
    },
    deleteEmbeddedDocuments: async (_t, ids) => { for (const i of ids) { const idx = effects.findIndex((e) => e.id === i); if (idx >= 0) effects.splice(idx, 1); } },
  };
  actorStore[id] = a;
  return a;
}

globalThis.game = {
  system: { id: "a5e" },
  user: { id: "gm1", isGM: true, name: "GM" },
  users: { activeGM: { isSelf: true, id: "gm1" }, filter: () => [], find: () => null, get: () => ({ name: "?" }) },
  actors: {
    get: (id) => actorStore[id],
    get contents() { return Object.values(actorStore); },
    [Symbol.iterator]: function* () { for (const k of Object.keys(actorStore)) yield actorStore[k]; },
  },
  settings: { get: (s, k) => settingsMap.get(`${s}.${k}`), set: async (s, k, v) => settingsMap.set(`${s}.${k}`, v), register: () => {} },
  socket: { on: () => {}, emit: () => {} },
  i18n: { localize: (s) => s },
  modules: { get: () => undefined },
  scenes: Object.assign([], { active: { id: "scene1" } }),
};

// ── Load: concatenate manifest scripts into one scope ────────────────────────
const combined = manifest.scripts.map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")).join("\n;\n");
const EXPORTS = ["SocialArchetypeManager", "TSLTalk", "TSLStringStore", "TSLBondStore", "SocialFencingApp",
  "SocialFencingDialog", "TSLGMActions", "TSLSocket", "TSLSceneVisualizer", "TSLHudButton",
  "SOCIAL_ARCHETYPES", "SOCIAL_TRIADS", "APPROACHES", "APPROACH_ORDER", "ASK_SIZES", "ASK_ORDER",
  "TECHNIQUES", "TECH_JOBS", "JOB_ORDER", "OPENINGS", "OPENING_BONUS", "LEVER_BONUS",
  "TSLEmotions", "EMOTIONS", "EMOTION_ORDER", "SCARS",
  "READ_QUESTIONS", "READ_ORDER", "ARCHETYPE_TELLS", "ARCHETYPE_REACTIONS", "BOND_TYPES", "PROFILE_POINTS",
  "SKILL_LABELS", "STRING_CAP", "migrateToV3"];
let api;
try {
  api = new Function(combined + "\nreturn { " + EXPORTS.map((e) => `${e}: typeof ${e} !== "undefined" ? ${e} : undefined`).join(", ") + " };")();
} catch (e) {
  console.log("PARSE/LOAD FAIL:", e.stack);
  process.exit(1);
}
console.log("All scripts loaded.");

// Reusable by tools/preview.js (require() skips the test run).
module.exports = { api, makeActor, actorStore, settingsMap };

if (require.main === module) (async () => {
  const R = api;
  let pass = true;
  const ok = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) pass = false; };
  const T = R.TSLTalk, SAM = R.SocialArchetypeManager, BS = R.TSLBondStore, SS = R.TSLStringStore;
  const SCOPE = "tsl-social-conflict";
  // A face: Persuasion +7, Deception +6, Insight +4 …
  const face = { per: { total: 7, proficient: 1 }, dec: { total: 6, proficient: 1 }, itm: { total: 3 }, prf: { total: 4 },
    ins: { total: 4, proficient: 1 }, inv: { total: 2 }, his: { total: 1 }, ath: { total: 0 } };
  const npcSkills = { per: { total: 5 }, dec: { total: 4 }, itm: { total: 6 }, prf: { total: 2 }, ins: { total: 4 } };
  const pc  = (id, abil = { cha: 3, wis: 1, int: 1 }) => makeActor(id, abil, { skills: face, prof: 3 });
  const npc = (id, arch, abil = { cha: 2, wis: 2, int: 1 }) => {          // base DC 14
    const a = makeActor(id, abil, { npc: true, prof: 2, skills: npcSkills });
    if (arch) a.flags[SCOPE] = { socialFencing: { archetypeId: arch } };
    return a;
  };
  // Roll with fixed dice (the first d20, then the nature die if any); queue dialog picks.
  const roll = async (src, tgt, opts, dice, picks = []) => {
    globalThis.__forceDice = [...dice];
    globalThis.__dialogQueue = [...picks];
    const p = await T.roll(src, tgt, opts);
    globalThis.__forceDice = null;
    globalThis.__dialogQueue = [];
    return p;
  };
  const lastCard = () => globalThis.__cards[globalThis.__cards.length - 1]?.content ?? "";
  const open = (n) => T.openings(n).map((o) => o.type).join();
  const bond = (a, b) => { const x = BS.find(a, b); return x ? `${x.type}${x.attitude}` : "none"; };

  // ═══ Data ═══════════════════════════════════════════════════════════════════
  {
    const A = R.SOCIAL_ARCHETYPES;
    ok(`nine natures, each with a key ≠ wall, a price, a pushback and what they do after a no`,
      A.length === 9 && A.every((a) => R.APPROACHES[a.key] && R.APPROACHES[a.wall] && a.key !== a.wall && a.keyText && a.wallText
        && a.press && a.price?.text && typeof a.price.string === "boolean" && ["yield", "firm"].includes(a.pressed) && a.pressedWhy));
    ok(`inside each triad all three key/wall pairs differ (the triad alone never tells you)`,
      Object.keys(R.SOCIAL_TRIADS).every((t) => new Set(A.filter((a) => a.triad === t).map((a) => `${a.key}|${a.wall}`)).size === 3));
    ok(`no approach is safe blind: each is the wall of exactly three natures`,
      R.APPROACH_ORDER.every((ap) => A.filter((a) => a.wall === ap).length === 3));
    ok(`prices differ: ${A.filter((a) => a.price.string).length} of 9 hand them a String on you`, new Set(A.map((a) => a.price.text)).size === 9 && A.filter((a) => a.price.string).length === 4);
    const tells = Object.values(R.ARCHETYPE_TELLS), reacts = Object.values(R.ARCHETYPE_REACTIONS);
    ok(`the pools came over intact: 9 × 40 tells, 9 × 20 reactions`,
      tells.length === 9 && tells.every((p) => p.length === 40) && reacts.length === 9 && reacts.every((p) => p.length === 20));
    const labels = A.map((a) => a.label.toLowerCase());
    const leak = [...tells.flat(), ...reacts.flat()].find((l) => labels.some((x) => l.toLowerCase().includes(x)));
    ok(`every pool line is veiled — no line names a nature${leak ? ` (leak: "${leak}")` : ""}`, !leak);
    const TE = Object.values(R.TECHNIQUES);
    ok(`twelve techniques: every approach does every job exactly once`, TE.length === 12
      && R.APPROACH_ORDER.every((ap) => R.JOB_ORDER.every((job) => TE.filter((t) => t.approach === ap && t.job === job).length === 1)));
    ok(`every technique has a line, a rule and skills; every approach says what winning costs`,
      TE.every((t) => t.line && t.rule && t.skills.length && t.skills.every((k) => R.SKILL_LABELS[k])) && R.APPROACH_ORDER.every((ap) => R.APPROACHES[ap].cost));
    ok(`three openings, one per approach`, R.APPROACH_ORDER.every((ap) => R.OPENINGS[ap]?.label) && Object.keys(R.OPENINGS).length === 3);
    ok(`six read questions, including the price`, R.READ_ORDER.join() === "desire,fear,key,wall,price,pressed");
    ok(`bonds feed approaches: friend → Heart, rival → Pressure, ally → Reason, stranger → none`,
      SAM.bondApproach("friend") === "heart" && SAM.bondApproach("rival") === "pressure" && SAM.bondApproach("ally") === "reason" && SAM.bondApproach("stranger") === null);
  }

  // ═══ Numbers ════════════════════════════════════════════════════════════════
  {
    const n = npc("numN", "tyrant");                  // wis 2, int 1, prof 2
    ok(`DC = 10 + prof + better of WIS/INT (${T.baseDC(n)} = 14)`, T.baseDC(n) === 14);
    ok(`the ask's size moves it: small ${T.dcFor(n, "small").dc}, costly ${T.dcFor(n, "costly").dc}, against ${T.dcFor(n, "against").dc}`,
      T.dcFor(n, "small").dc === 10 && T.dcFor(n, "costly").dc === 14 && T.dcFor(n, "against").dc === 18);
    ok(`each opening makes it ${R.OPENING_BONUS} easier (costly, two openings: ${T.dcFor(n, "costly", 2).dc})`, T.dcFor(n, "costly", 2).dc === 6);
    settingsMap.set("tsl-social-conflict.socialDcBonus", 3);
    ok(`the table's dial adds to every DC (${T.dcFor(n, "costly").dc} = 17)`, T.dcFor(n, "costly").dc === 17);
    settingsMap.set("tsl-social-conflict.socialDcBonus", 0);
    const p = pc("numP");
    p.system.skills.per = { mod: 3, proficient: 1 };
    ok(`a5e skill: ability mod + proficiency (${T.skillMod(p, "per")} = 6)`, T.skillMod(p, "per") === 6);
    p.system.skills.per = { total: 7, proficient: 1 };
    await SAM.setActorData(p, { triad: { power: 0, attention: 2, order: 1 } });
    await BS.add("numP", "numN", { type: "friend", attitude: 2 });
    pc("numH");
    await SAM.setKnown(n, { desire: true });
    const pv = T.preview(p, n, { technique: "appeal", helperId: "numH", lever: "desire" });
    ok(`preview: +7 Persuasion +2 leaning +2 bond +2 Desire +2 help = ${pv.mod}`, pv.mod === 15 && pv.parts.length === 5);
    ok(`a lever you don't know yet isn't offered`, T.preview(p, n, { technique: "appeal", lever: "fear" }).lever === null);
    ok(`levers are for asks: an Open never takes one`, T.preview(p, n, { technique: "flatter", lever: "desire" }).lever === null);
    const keys = (o) => Object.keys(o).sort().join();
    ok(`the preview never consults the nature: key and wall look alike`,
      keys(T.preview(p, n, { technique: "appeal" })) === keys(T.preview(p, n, { technique: "demand" })) && !("rel" in pv));
    ok(`each technique rolls its own skill: Study → Insight, Deceive → Deception, Shake → Deception`,
      T.preview(p, n, { technique: "study" }).skill === "ins" && T.preview(p, n, { technique: "deceive" }).skill === "dec" && T.preview(p, n, { technique: "shake" }).skill === "dec");
    ok(`opening and reading have no size: the base DC`, T.preview(p, n, { technique: "shake" }).dc === 14 && T.preview(p, n, { technique: "study" }).size === null);
    ok(`only NPCs are asked`, !!T.preview(n, p, { technique: "appeal" }).blocked);
  }

  // ═══ Openings: get them ready, then ask ═════════════════════════════════════
  {
    const p = pc("oP"), n = npc("oN", "broker");          // Broker: key Reason, wall Heart, yields, a plain price
    const r1 = await roll(p, n, { technique: "shake" }, [12]);          // plain: 12 + 6 = 18 vs 14
    ok(`Shake hits: they're Shaken`, r1.grade === "success" && open(n) === "pressure" && /Shaken/.test(lastCard()));
    ok(`the same opening can't be stacked`, /already Shaken/.test(T.preview(p, n, { technique: "shake" }).blocked ?? ""));
    await roll(p, n, { technique: "tempt" }, [3, 15]);                   // their key: the better die
    ok(`Tempt on their key: Curious too — two openings`, open(n) === "pressure,reason");
    ok(`openings make the ask easier (costly: DC ${T.preview(p, n, { technique: "bargain" }).dc})`, T.preview(p, n, { technique: "bargain" }).dc === 6);
    ok(`an opening counts as leverage for an ask against them`, !T.preview(p, n, { technique: "bargain", size: "against" }).blocked);
    const r3 = await roll(p, n, { technique: "flatter" }, [15, 4]);     // their wall: 4 + 7 = 11 — a miss
    ok(`Flatter into their wall misses: a String on you (Heart), and an opening closes`,
      r3.rel === "wall" && r3.grade === "failure" && SS.countOn("oN", "oP") === 1 && open(n) === "pressure" && /no longer Curious/.test(lastCard()));
    const r4 = await roll(p, n, { technique: "bargain", size: "costly" }, [6, 2], ["pay"]);   // DC 10: 6 + 7 = 13
    ok(`Bargain spends the opening: "yes, but" for their price — and nothing lingers`,
      r4.grade === "success" && r4.paid === true && r4.openingsUsed === 1 && open(n) === "" && bond("oN", "oP") === "none" && /for a price/.test(lastCard()));
    await n.setFlag(SCOPE, "openings", { sceneId: "another-scene", list: [{ type: "heart", byId: "oP" }] });
    ok(`openings from another scene read as none`, open(n) === "");
    await n.setFlag(SCOPE, "openings", { sceneId: T._sceneId(), list: [{ type: "heart", byId: "oP" }] });
    ok(`…while this scene's count`, open(n) === "heart");
    await T.clearOpenings(n);
    ok(`the GM can clear them`, open(n) === "");
  }

  // ═══ Asks: what winning each way costs ══════════════════════════════════════
  {
    const p = pc("aP"), d = npc("aD", "duelist");         // Duelist: key Pressure, wall Heart, firm
    const r1 = await roll(p, d, { technique: "demand", size: "costly" }, [10, 3]);
    ok(`Demand: they give in — no price asked`, r1.grade === "success" && r1.paid === null && /gives in — no price/.test(lastCard()));
    ok(`…but they remember it: no bond becomes a Rival ●`, bond("aD", "aP") === "rival1");
    await roll(p, d, { technique: "demand", size: "costly" }, [18, 2]);
    ok(`a strong Demand for something big: a String on them, and the rivalry hardens (●●)`, SS.countOn("aP", "aD") === 1 && bond("aD", "aP") === "rival2");
    const c = npc("aC", "caretaker");                     // Caretaker: key Heart; their price hands them a String
    const r3 = await roll(p, c, { technique: "appeal", size: "costly" }, [9, 3], ["pay"]);
    ok(`Appeal: "yes, but" — their price paid (a String on you), and the bond warms: a Friend ●`,
      r3.grade === "success" && r3.paid && SS.countOn("aC", "aP") === 1 && bond("aC", "aP") === "friend1");
    const q = pc("aQ");
    await roll(q, d, { technique: "appeal", size: "costly" }, [15, 2]);
    ok(`Appeal into their wall misses: you showed your heart — a String on you; a proud one closes the door`,
      SS.countOn("aD", "aQ") === 1 && /door is closed/.test(lastCard()) && /A public challenge/.test(lastCard()));
    const b = npc("aB", "broker");
    await roll(q, b, { technique: "demand", size: "costly" }, [4]);
    ok(`a yielding nature keeps listening — but the miss still hurts: their emotion, no String`, !/door is closed/.test(lastCard()) && SS.countOn("aB", "aQ") === 0 && R.TSLEmotions.has(q, "hopeless"));
    await roll(q, b, { technique: "bargain", size: "small" }, [15, 2]);
    ok(`a strong yes to a small ask: no String (favours can't be farmed)`, SS.countOn("aQ", "aB") === 0);
    const t = npc("aT", "tyrant");
    await roll(q, t, { technique: "bargain", size: "small" }, [1]);
    ok(`a bad miss (a natural 1): a String on you; a small ask slams no door`, SS.countOn("aT", "aQ") === 1 && !/door is closed/.test(lastCard()));
    const h = npc("aH", "hermit");
    await SAM.setKnown(h, { fear: true });
    await roll(q, h, { technique: "demand", size: "against", lever: "fear" }, [3, 2]);
    ok(`a threat that misses cuts both ways: a String on you`, SS.countOn("aH", "aQ") === 1);
    await SS.add("aQ", "aH", 1);
    const r = await roll(q, h, { technique: "bargain", size: "costly" }, [4, 3], ["burn", "pay"]);
    ok(`a near miss: burn a String for +5 and it lands (${r.total} vs ${r.dc})`, r.stringSpent && (r.grade === "success" || r.grade === "strong") && SS.countOn("aQ", "aH") === 0);
    ok(`the cap: at most ${R.STRING_CAP} Strings on one person`, (await SS.add("aQ", "aH", 5)) === R.STRING_CAP);
  }

  // ═══ Reads: three ways ══════════════════════════════════════════════════════
  {
    const p = pc("rP"), h = npc("rH", "hermit");          // key Reason
    const r1 = await roll(p, h, { technique: "study" }, [14, 3], ["o1"]);
    ok(`Study: an answer for the party (their Fear) — and their key shows in the dice`,
      r1.rel === "key" && SAM.getKnown(h).fear && SAM.getKnown(h).key && /What do they fear\?/.test(lastCard()) && bond("rH", "rP") === "none");
    const d = npc("rD", "duelist");                       // key Pressure
    await roll(p, d, { technique: "provoke" }, [12, 5], ["o0"]);
    ok(`Provoke: they blurt it out — and resent you: a Rival ●`, SAM.getKnown(d).desire && bond("rD", "rP") === "rival1");
    const c = npc("rC", "caretaker");                     // key Heart
    await roll(p, c, { technique: "confide" }, [12, 3], ["o0", "o0"]);
    ok(`Confide, strong: two answers — and the bond warms`, SAM.getKnown(c).desire && SAM.getKnown(c).fear && bond("rC", "rP") === "friend1");
    const b = npc("rB", "broker");                        // wall Heart
    await roll(p, b, { technique: "confide" }, [16, 2]);
    ok(`Confide into their wall: you exposed yourself — one String on you`, SS.countOn("rB", "rP") === 1 && /They notice/.test(lastCard()));
    const m = npc("rM", "martyr");
    await roll(p, m, { technique: "study" }, [1]);
    ok(`a bad read: they read you instead — a String on you`, SS.countOn("rM", "rP") === 1 && /read you instead/.test(lastCard()));
  }

  // ═══ Gambits ════════════════════════════════════════════════════════════════
  {
    const p = pc("gP"), h = npc("gH", "hermit");          // wall Pressure, firm
    ok(`Blackmail needs a hold: their Fear or a String`, /Blackmail needs/.test(T.preview(p, h, { technique: "blackmail" }).blocked ?? ""));
    await SAM.setKnown(h, { fear: true });
    const pv = T.preview(p, h, { technique: "blackmail" });
    ok(`…their Fear is enough — and it plays on it (+${R.LEVER_BONUS})`, !pv.blocked && pv.lever === "fear");
    await roll(p, h, { technique: "blackmail", size: "costly" }, [17, 15]);
    ok(`Blackmail lands: they do it, a String on them — and they're your Enemy (●●)`, SS.countOn("gP", "gH") === 1 && bond("gH", "gP") === "enemy2");
    const p2 = pc("gQ"), h2 = npc("gH2", "hermit");
    await SS.add("gQ", "gH2", 1);
    await roll(p2, h2, { technique: "blackmail", size: "costly" }, [3, 2], ["keep"]);
    ok(`Blackmail called: a String on you, an Enemy all the same — and the door closes`,
      SS.countOn("gH2", "gQ") === 1 && BS.find("gH2", "gQ")?.type === "enemy" && /calls your bluff/.test(lastCard()) && /door is closed/.test(lastCard()));
    const c = npc("gC", "caretaker");                     // key Heart
    ok(`Seduce needs their Desire or a bond ●●`, /Seduce needs/.test(T.preview(p, c, { technique: "seduce" }).blocked ?? ""));
    await SAM.setKnown(c, { desire: true });
    await roll(p, c, { technique: "seduce", size: "small" }, [8, 12]);
    ok(`Seduce lands: they do it for you — the bond deepens`, bond("gC", "gP") === "friend1" && /for you/.test(lastCard()));
    const i = npc("gI", "exalted");                       // Idol: key Heart, firm
    await SAM.setKnown(i, { desire: true });
    await roll(p, i, { technique: "seduce", size: "costly" }, [2, 3]);
    ok(`Seduce fails: heartbreak — a String on you; a proud one closes the door`, SS.countOn("gI", "gP") === 1 && /heartbreak/.test(lastCard()) && /door is closed/.test(lastCard()));
    const s = npc("gS", "machiavellian");                 // Schemer: wall Reason
    await roll(p, s, { technique: "deceive", size: "costly" }, [18, 16]);
    ok(`Deceive lands (even into their wall): they believe it — the lie is on record`, T.lies(s).length === 1 && /The lie holds/.test(lastCard()) && SS.countOn("gP", "gS") === 1);
    await T.exposeLie(s, T.lies(s)[0].id);
    ok(`the GM brings the lie out: an Enemy, and two Strings on the liar`, T.lies(s).length === 0 && SS.countOn("gS", "gP") === 2 && bond("gS", "gP") === "enemy2" && /The lie comes out/.test(lastCard()));
    const m = npc("gM", "martyr");                        // yields — but a lie caught ends it anyway
    await roll(p, m, { technique: "deceive", size: "costly" }, [3]);
    ok(`Deceive caught: a String on you, and the door closes — even on a yielding nature`, SS.countOn("gM", "gP") === 1 && /catches the lie/.test(lastCard()) && /door is closed/.test(lastCard()));
  }

  // ═══ Emotions & scars ═══════════════════════════════════════════════════════
  {
    const E = R.EMOTIONS, TE = R.TSLEmotions;
    ok(`five emotions: each spoils something, opens something, is let go some way, and scars`,
      R.EMOTION_ORDER.length === 5 && R.EMOTION_ORDER.every((id) => E[id].spoilsText && R.APPROACHES[E[id].opens] && E[id].clear && R.SCARS[E[id].scar]?.from === id));
    ok(`every nature hurts with an emotion of its own`, R.SOCIAL_ARCHETYPES.every((a) => E[a.hurts]) && new Set(R.SOCIAL_ARCHETYPES.map((a) => a.hurts)).size === 5);
    globalThis.CONFIG = globalThis.CONFIG ?? {};
    CONFIG.statusEffects = [{ id: "dead", name: "Dead", img: "icons/svg/skull.svg" }];
    TE.registerStatuses(); TE.registerStatuses();
    ok(`the five join the Token HUD's statuses, once`, CONFIG.statusEffects.filter((x) => x.id.startsWith("tsl-emo-")).length === 5);

    const p = pc("eP"), q = pc("eQ"), n = npc("eN", "tyrant"), m = npc("eM", "martyr");
    const parts = (src, tgt, tech) => T.preview(src, tgt, { technique: tech }).parts.filter((x) => /you're|they're|scar/.test(x.label)).map((x) => `${x.label} ${x.value}`).join(", ");
    await TE.add(p, "angry", { by: "eN" });
    ok(`Angry on you: −2 on Heart (${parts(p, n, "appeal")}), nothing on Pressure`, parts(p, n, "appeal") === "you're Angry -2" && parts(p, n, "demand") === "");
    await TE.add(q, "hopeless");
    ok(`Hopeless: −2 on asks and gambits, not on opens or reads`, parts(q, n, "bargain") === "you're Hopeless -2" && parts(q, n, "deceive") === "you're Hopeless -2" && parts(q, n, "tempt") === "" && parts(q, n, "study") === "");
    await TE.add(q, "guilty", { toward: "eM" });
    ok(`Guilty toward someone: −2 on everything against them, nobody else`, /Guilty -2/.test(parts(q, m, "tempt")) && !/Guilty/.test(parts(q, n, "tempt")));
    await TE.add(n, "frightened", { by: "eP" });
    ok(`a Frightened NPC: +2 to Pressure against them`, /they're Frightened 2/.test(parts(q, n, "demand")) && !/Frightened/.test(parts(q, n, "appeal")));
    await TE.add(m, "guilty", { by: "eP", toward: "eP" });
    ok(`an NPC Guilty toward you: +2 to your Heart — only yours`, /they're Guilty 2/.test(parts(p, m, "flatter")) && !/they're Guilty/.test(parts(q, m, "flatter")));
    const sc = await TE.add(p, "angry");
    ok(`already Angry: a scar instead — Short Fuse (+1 Pressure, −1 Heart, for good)`, sc.scar === "shortFuse" && /scar — Short Fuse 1/.test(parts(p, n, "demand")) && /scar — Short Fuse -1/.test(parts(p, n, "appeal")));
    ok(`…once: the third time leaves nothing more`, (await TE.add(p, "angry")).scar === null && TE.scars(p).length === 1);
    ok(`an NPC doesn't scar`, (await TE.add(n, "frightened")).scar === null && TE.scars(n).length === 0);
    await p.createEmbeddedDocuments("ActiveEffect", [{ name: "Insecure", statuses: ["tsl-emo-insecure"] }]);
    ok(`a status toggled by hand on the HUD counts`, TE.has(p, "insecure"));
    await TE.clear(p, "angry", "eQ");
    ok(`let go — a friend's comfort; one line in the chat`, !TE.has(p, "angry") && /lets go of Angry/.test(lastCard()) && /comforts them/.test(lastCard()));

    // Where they come from, on the real pipeline.
    const s1 = pc("eS"), t1 = npc("eT", "tyrant");                          // wall Pressure; hurts: Frightened
    await roll(s1, t1, { technique: "shake" }, [14, 3]);
    ok(`a missed Shake into the Tyrant's wall: their pushback leaves you Frightened`, TE.has(s1, "frightened") && /is <b>Frightened<\/b>/.test(lastCard()) && /An order in front of witnesses/.test(lastCard()));
    await roll(s1, t1, { technique: "tempt" }, [2]);
    ok(`miss again while still Frightened: a scar — Flinch`, TE.scars(s1).includes("flinch") && /leaves a scar/.test(lastCard()));
    const s2 = pc("eU"), h = npc("eH", "hermit");
    await roll(s2, h, { technique: "study" }, [3, 2]);
    ok(`a quiet Study that misses costs no emotion`, TE.of(s2).length === 0);
    const c = npc("eC", "exalted");                                         // Idol hurts Insecure — but heartbreak is Hopeless
    await SAM.setKnown(c, { desire: true });
    await roll(s2, c, { technique: "seduce", size: "costly" }, [2, 3]);
    ok(`a broken heart leaves you Hopeless (not the nature's Insecure)`, TE.has(s2, "hopeless") && !TE.has(s2, "insecure"));
    const s3 = pc("eV"), d = npc("eD", "duelist");                          // key Pressure
    for (let i = 0; i < 3; i++) await roll(s3, d, { technique: "demand", size: "small" }, [12, 12]);
    ok(`winning by Pressure costs: three Demands — they hold ${SS.countOn("eD", "eV")} Strings on you`, SS.countOn("eD", "eV") === 3);
    const s4 = pc("eW"), b = npc("eB", "broker");
    await SAM.setKnown(b, { fear: true });
    await roll(s4, b, { technique: "blackmail", size: "costly" }, [16]);
    ok(`Blackmail lands: they're Frightened of you — and they'll pay you back (a String on you)`, TE.has(b, "frightened") && SS.countOn("eB", "eW") === 1);

    // A player spends a String to hurt an NPC — through the GM.
    const sent = [];
    const emit = game.socket.emit;
    game.socket.emit = (_n, msg) => sent.push(msg);
    game.user.isGM = false;
    await SS.add("eW", "eB", 1);
    await R.TSLGMActions.request("stringHurt", { holderId: "eW", targetId: "eB", emotion: "insecure" });
    game.user.isGM = true;
    game.socket.emit = emit;
    ok(`a player's Hurt travels to the GM`, sent.length === 1 && sent[0].data.action === "stringHurt" && !TE.has(b, "insecure"));
    const held = SS.countOn("eW", "eB");
    await R.TSLGMActions.handle(sent[0].data);
    ok(`…who spends one String (${held} → ${SS.countOn("eW", "eB")}) and makes them Insecure`, TE.has(b, "insecure") && SS.countOn("eW", "eB") === held - 1 && /pulls a String/.test(lastCard()));
    const g = npc("eG", "machiavellian"), liar = pc("eL");
    await g.setFlag(SCOPE, "lies", [{ id: "l1", byId: "eL", at: 1 }]);
    await T.exposeLie(g, "l1");
    ok(`a lie brought out leaves them Angry`, TE.has(g, "angry"));
  }

  // ═══ Bonds ══════════════════════════════════════════════════════════════════
  {
    for (const id of ["bA", "bB", "bC", "bD", "bE", "bF"]) makeActor(id);
    await BS.add("bA", "bB", { type: "friend", attitude: 2 });
    let s = await BS.shift("bA", "bB", "cool");
    ok(`a slammed door cools a warm bond (●● → ${s.strength}), on both sides`, s.strength === 1 && BS.find("bB", "bA")?.attitude === 1);
    s = await BS.shift("bA", "bB", "warm");
    ok(`a Heart win warms it again (${s.strength})`, s.strength === 2);
    ok(`a slammed door makes no bond where there was none`, (await BS.shift("bC", "bA", "cool")) === null && !BS.find("bC", "bA"));
    s = await BS.shift("bC", "bE", "warm");
    ok(`a Heart win with a stranger begins a Friendship ●`, s.created && bond("bC", "bE") === "friend1");
    await BS.add("bE", "bF", { type: "friend", attitude: 1 });
    s = await BS.shift("bE", "bF", "sour");
    ok(`Pressure sours a thin friendship into a Rivalry ●`, s.turned && bond("bE", "bF") === "rival1" && bond("bF", "bE") === "rival1");
    s = await BS.shift("bA", "bB", "enemy");
    ok(`Blackmail turns even a friend into an Enemy ●●`, s.turned && bond("bA", "bB") === "enemy2");
    await BS.add("bC", "bD", { type: "mentor", attitude: 1 });
    ok(`a bond is mirrored with its counterpart type`, BS.find("bD", "bC")?.type === "protege");
  }

  // ═══ Strings in a fight (Pull) ══════════════════════════════════════════════
  {
    const h = makeActor("pH"), t = makeActor("pT");
    await SS.add("pH", "pT", 2);
    await SS.pull(h, t, "strike");
    const fx = h.effects.find((e) => e.flags?.[SCOPE]?.stringPull);
    ok(`a5e strike: the system's own CUSTOM bonus keys (attack, checks, saves)`,
      fx && fx.changes.length === 3 && fx.changes.every((c) => c.mode === 0 && /flags\.a5e\.effects\.bonuses/.test(c.key)));
    game.system.id = "dnd5e";
    await SS.pull(h, t, "guard");
    const g = h.effects.filter((e) => e.flags?.[SCOPE]?.stringPull)[1];
    ok(`dnd5e guard: +5 AC as a plain number`, g?.changes.length === 1 && g.changes[0].key === "system.attributes.ac.bonus" && g.changes[0].value === "+5");
    game.system.id = "a5e";
  }

  // ═══ The relay ══════════════════════════════════════════════════════════════
  {
    const sent = [];
    const emit = game.socket.emit;
    game.socket.emit = (_n, msg) => sent.push(msg);
    game.user.isGM = false;
    const p = pc("lP"), n = npc("lN", "hermit");
    globalThis.__forceDice = [2];
    await T.roll(p, n, { technique: "shake" });
    globalThis.__forceDice = null;
    game.user.isGM = true;
    game.socket.emit = emit;
    ok(`a player's roll relays to the GM and changes nothing locally`, sent.length === 1 && sent[0].type === "GM_ACTION"
      && sent[0].data.action === "talkResolve" && sent[0].data.args?.technique === "shake" && !SAM.getKnown(n).wall);
    await R.TSLGMActions.handle(sent[0].data);
    ok(`the GM applies it (the wall is now known)`, SAM.getKnown(n).wall);
    // No GM connected: refuse before anything is rolled or a String burned.
    const gm = game.users.activeGM;
    game.users.activeGM = null;
    game.user.isGM = false;
    await SS.add("lP", "lN", 1);
    const lost = await roll(p, n, { technique: "bargain", size: "costly" }, [3], ["burn"]);
    game.user.isGM = true;
    game.users.activeGM = gm;
    ok(`with no GM connected a player's roll is refused — nothing rolled, no String spent`, lost === null && SS.countOn("lP", "lN") === 1);
    // The GM resolves in the SPEAKER's scene, even while looking at another one.
    const sp = pc("lS"), sn = npc("lO", "broker");
    globalThis.__forceDice = [15];
    const pay = await T.roll(sp, sn, { technique: "shake" });
    globalThis.__forceDice = null;
    await sn.unsetFlag(SCOPE, "openings");
    const viewed = canvas.scene;
    canvas.scene = { id: "gm-elsewhere" };
    await T.resolve(pay);
    canvas.scene = viewed;
    ok(`the GM, looking at another scene, still opens them in the speaker's scene`, open(sn) === "pressure");
  }

  // ═══ v3 migration ═══════════════════════════════════════════════════════════
  {
    const a = makeActor("migA");
    await a.createEmbeddedDocuments("ActiveEffect", [
      { name: "⚔ Rattled", flags: { [SCOPE]: { condition: "rattled" } } },
      { name: "❤ Wrath", statuses: ["tsl-wound-angry"] },
      { name: "Bonds in reach", flags: { [SCOPE]: { bondAura: true } } },
      { name: "String", flags: { [SCOPE]: { stringPull: { mode: "strike" } } }, statuses: ["tsl-string-pull"] },
      { name: "Bless", flags: { dnd5e: {} } },
    ]);
    await a.setFlag(SCOPE, "encounter", { composure: 3 });
    await a.setFlag(SCOPE, "exchange", { v: 3 });
    await R.migrateToV3();
    ok(`v3 migration: old states/wounds/auras and draft exchanges gone; the pulled String kept`,
      a.effects.map((e) => e.name).join("|") === "String|Bless" && a.getFlag(SCOPE, "encounter") === undefined
      && a.getFlag(SCOPE, "exchange") === undefined && settingsMap.get("tsl-social-conflict.dataVersion") === 3);
  }

  // ═══ The design targets, on the real pipeline ═══════════════════════════════
  {
    const plain = () => makeActor("dtP", { cha: 0, wis: 1 }, { prof: 2, skills: { per: { total: 2 }, ins: { total: 3 }, itm: { total: 3 }, dec: { total: 1 }, prf: { total: 1 }, inv: { total: 2 }, his: { total: 0 } } });
    // How often a costly ask lands against an average NPC (DC 14) — the Caretaker:
    // key Heart (Appeal), plain Pressure (Demand), wall Reason (Bargain).
    const rate = async ({ who = "face", technique, lever = null, prep = null, N = 400 }) => {
      let yes = 0;
      for (let i = 0; i < N; i++) {
        const p = who === "face" ? pc("dtP") : plain();
        const n = npc("dtN", "caretaker");
        if (lever) await SAM.setKnown(n, { desire: true });
        if (prep) await T.roll(p, n, { technique: prep });
        globalThis.__dialogQueue = ["pay"];
        const r = await T.roll(p, n, { technique, size: "costly", lever });
        globalThis.__dialogQueue = [];
        if (r.grade === "strong" || r.grade === "success") yes++;
      }
      return Math.round((100 * yes) / N);
    };
    const quiet = console.log;
    console.log = () => {};
    const key = await rate({ technique: "appeal" }), flat = await rate({ technique: "demand", N: 1000 }), wall = await rate({ technique: "bargain" });
    const plainKeyLever = await rate({ who: "plain", technique: "appeal", lever: "desire" });
    const prepared = await rate({ technique: "demand", prep: "shake", N: 1000 });
    console.log = quiet;
    ok(`the person decides: face +7 — key ${key}%, plain ${flat}%, wall ${wall}%`, key - flat >= 15 && flat - wall >= 15);
    ok(`understanding beats charisma: +2 with the key and a lever ${plainKeyLever}% vs the face on plain ground ${flat}%`, plainKeyLever >= flat - 3);
    ok(`preparing still pays, though a missed Shake now costs an emotion: Shake, then Demand ${prepared}% vs a cold Demand ${flat}%`, prepared - flat >= 5);
  }

  // ═══ The UI renders ═════════════════════════════════════════════════════════
  {
    const bad = (h) => /undefined|NaN|\[object Object\]|ERR:/.test(h);
    const P = pc("uiP"), N = npc("uiN", "machiavellian"), Q = pc("uiQ");
    P.name = "Lyra"; N.name = "Captain"; Q.name = "Mira";
    await SAM.setActorData(N, { intent: "Keep the gate shut", points: { desire: "Leverage", fear: "Being outplayed", mask: "Bored", line: "Never kneel" } });
    await SAM.setKnown(N, { desire: true });
    await BS.add("uiP", "uiN", { type: "rival", attitude: 2 });
    await SS.add("uiP", "uiN", 1);
    await N.setFlag(SCOPE, "openings", { sceneId: T._sceneId(), list: [{ type: "pressure", byId: "uiQ" }] });
    await N.setFlag(SCOPE, "lies", [{ id: "lie1", byId: "uiP", at: 1 }]);
    const tok = (a) => ({ actor: a, visible: true, document: { hidden: false } });
    canvas.tokens.placeables = [tok(P), tok(N), tok(Q)];
    const render = async (actor, tab, extra = {}) => {
      const app = new R.SocialFencingApp(actor);
      app._tab = tab; Object.assign(app, extra);
      try { return app._buildHTML(await app.getData()); } catch (err) { return "ERR:" + err.stack; }
    };
    const gmNpcProfile = await render(N, "profile");
    ok(`NPC profile (GM): nature card with key, wall and price; the facts; dossier; agenda`, !bad(gmNpcProfile)
      && /Key · Heart/.test(gmNpcProfile) && /Wall · Reason/.test(gmNpcProfile) && /favour, to be named later/.test(gmNpcProfile) && /data-known="price"/.test(gmNpcProfile));
    game.user.isGM = false;
    const pcProfile = await render(P, "profile");
    ok(`PC profile (player): Leanings and notes, no nature`, !bad(pcProfile) && /Leanings/.test(pcProfile) && !/archetypeId/.test(pcProfile));
    const npcSeen = await render(N, "profile");
    ok(`an NPC's profile, seen by a player: only what the party learned — no dossier, no nature`, !bad(npcSeen)
      && /Leverage/.test(npcSeen) && !/Being outplayed/.test(npcSeen) && !/Never kneel/.test(npcSeen) && !/Schemer/.test(npcSeen) && !/Keep the gate shut/.test(npcSeen));
    const solo = makeActor("uiSolo", { cha: 2 }, { skills: { per: { total: 5 } } });
    solo.hasPlayerOwner = false;
    const soloTalk = await render(solo, "talk", { _tTarget: "uiN", _tTech: "appeal" });
    ok(`a character nobody owns (the GM testing alone) still gets the techniques, not the cheat sheet`, !bad(soloTalk)
      && /data-t-roll/.test(soloTalk) && !/Playing them/.test(soloTalk) && T.isNpc(N) && !T.isNpc(solo));
    const talk = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tSize: "costly" });
    const techs = (talk.match(/data-tech="/g) ?? []).length;
    ok(`Talk (player): the person, the openings, ${techs} techniques, sizes with their DCs, the lever, the String, the roll line`, !bad(talk)
      && techs === 12 && /tsl-opening/.test(talk) && /Shaken/.test(talk) && /data-size="against"/.test(talk) && /DC 6/.test(talk)
      && /Their Desire/.test(talk) && /1 String on them/.test(talk) && /vs DC 10/.test(talk) && /Appeal — ask/.test(talk) && /Nature unread/.test(talk) && !/Schemer/.test(talk));
    ok(`an opening already on them: its Open is spent`, /class="tsl-tech-btn[^"]*done[^"]*"\s+data-tech="shake"/.test(talk));
    const study = await render(P, "talk", { _tTarget: "uiN", _tTech: "study" });
    ok(`Talk → Study: no sizes, Insight, "read"`, !bad(study) && !/data-size=/.test(study) && /Study — read/.test(study) && /Insight \+4/.test(study));
    const none = await render(P, "talk", {});
    ok(`Talk with nobody picked asks whom you're talking to`, !bad(none) && /Who are you talking to/.test(none));
    const result = await render(P, "talk", { _tTarget: "uiN", _tResult: { technique: "appeal", grade: "success", total: 17, dc: 14, rel: "key", paid: true } });
    await R.TSLEmotions.add(P, "frightened", { by: "uiN" });
    await R.TSLEmotions.add(N, "insecure", { by: "uiP" });
    const felt = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`Talk shows what weighs on you (with ×) and what they feel — and it counts in the roll`, !bad(felt)
      && /tsl-you/.test(felt) && /data-emo-clear="uiP"/.test(felt) && /Feeling/.test(felt) && /Insecure/.test(felt) && /you(?:'|&#39;)re Frightened/.test(felt));
    ok(`the result shows where you rolled`, !bad(result) && /Appeal: They do it — for a price/.test(result) && /you paid their price/.test(result));
    const bonds = await render(P, "bonds", { _expandedBonds: new Set([BS.find("uiP", "uiN").id]) });
    ok(`bonds: type, strength, Strings, Pull and Hurt`, !bad(bonds) && /tsl-str-track/.test(bonds) && /Pull \+5/.test(bonds) && /data-hurt="uiN"/.test(bonds) && /Rival/.test(bonds));
    const pcProfile2 = await render(P, "profile");
    ok(`a character's profile lists emotions & scars`, !bad(pcProfile2) && /Emotions &amp; scars|Emotions & scars/.test(pcProfile2) && /Frightened/.test(pcProfile2));
    let codexOk = true, words = 0;
    for (const c of ["start", "ap", "read", "emo", "natures", "bonds", "gm"]) {
      const h = await render(P, "codex", { _codexCat: c });
      if (bad(h)) codexOk = false;
      if (c === "gm" && /Running it/.test(h)) codexOk = false;
      if (c === "ap" && !/Twelve techniques/.test(h)) codexOk = false;
      words += h.replace(/<[^>]+>/g, " ").split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
    }
    ok(`Codex: every page renders for a player (no GM page) — ${words} words`, codexOk);
    game.user.isGM = true;
    const gmTalk = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`the GM sees the truth (the nature tagged hidden) and can clear openings`, !bad(gmTalk) && /Schemer/.test(gmTalk) && /hidden/.test(gmTalk) && /data-open-clear="uiN"/.test(gmTalk));
    const sheet = await render(N, "talk");
    ok(`an NPC's own Talk tab is the GM's cheat sheet — with the lies they believe`, !bad(sheet) && /Playing them/.test(sheet) && /Yes, but/.test(sheet) && /leaves the speaker <b>Insecure<\/b>/.test(sheet)
      && /Help with a hook/.test(sheet) && /data-lie-out="lie1"/.test(sheet) && /Lyra lied to them/.test(sheet));
    ok(`…and it offers to ask them as each character on the scene`, /data-t-as="uiP"/.test(sheet) && /data-t-as="uiQ"/.test(sheet) && !/data-t-as="uiN"/.test(sheet));
    const opened = R.SocialFencingDialog.open(P, { tab: "talk", target: "uiN" });
    ok(`one click opens that character's Talk, already facing the NPC`, opened?._tab === "talk" && opened?._tTarget === "uiN");
    R.SocialFencingDialog._instances.clear();
    const viz = new R.TSLSceneVisualizer({ mode: "scene" });
    let vh = "";
    try { vh = viz._renderHTML(); } catch (err) { vh = "ERR:" + err.stack; }
    ok(`the Scene renders the cast, their bonds and their openings`, !bad(vh) && /tsl-viz-node/.test(vh) && /Rival/.test(vh) && /tsl-viz-openings/.test(vh));
    canvas.tokens.placeables = [];
  }

  ok(`no card ever showed undefined / NaN (${CARD_SUSPECT})`, CARD_SUSPECT === 0);
  console.log(pass ? "DONE — pipeline clean" : "DONE — FAILURES above");
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.log("HARNESS CRASH", e.stack); process.exit(1); });
