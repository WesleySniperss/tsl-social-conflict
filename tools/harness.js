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
  "TECHNIQUES", "TECH_JOBS", "JOB_ORDER", "LEVER_BONUS",
  "TSLEmotions", "EMOTIONS", "EMOTION_ORDER", "SCARS",
  "READ_QUESTIONS", "READ_ORDER", "ARCHETYPE_TELLS", "ARCHETYPE_REACTIONS", "BOND_TYPES", "PROFILE_POINTS",
  "SKILL_LABELS", "STRING_CAP", "migrateToV3", "TSL_I18N", "TSLi18n", "TSL_UK", "TALK_GRADES", "JOB_GRADES"];
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
    ok(`seven techniques: every approach asks once and goes all in once — and one Read`, TE.length === 7
      && R.APPROACH_ORDER.every((ap) => ["ask", "gambit"].every((job) => TE.filter((t) => t.approach === ap && t.job === job).length === 1))
      && TE.filter((t) => t.job === "read" && !t.approach).length === 1);
    ok(`every technique has a line, a rule and skills; every approach says what winning costs`,
      TE.every((t) => t.line && t.rule && t.skills.length && t.skills.every((k) => R.SKILL_LABELS[k])) && R.APPROACH_ORDER.every((ap) => R.APPROACHES[ap].cost));
    ok(`eight read questions — the price, the mask and the witnesses among them`, R.READ_ORDER.join() === "desire,fear,key,wall,price,pressed,mask,audience");
    ok(`every nature takes an audience its own way (+2 bend, −2 harden, 0) and says why — some bend, some harden`,
      A.every((a) => [2, -2, 0].includes(a.audience) && a.audienceWhy) && A.some((a) => a.audience > 0) && A.some((a) => a.audience < 0));
    ok(`bonds feed approaches: friend → Heart, rival → Pressure, ally → Reason, stranger → none`,
      SAM.bondApproach("friend") === "heart" && SAM.bondApproach("rival") === "pressure" && SAM.bondApproach("ally") === "reason" && SAM.bondApproach("stranger") === null);
  }

  // ═══ Numbers ════════════════════════════════════════════════════════════════
  {
    const n = npc("numN", "tyrant");                  // wis 2, int 1, prof 2
    ok(`DC = 10 + prof + better of WIS/INT (${T.baseDC(n)} = 14)`, T.baseDC(n) === 14);
    ok(`the ask's size moves it: small ${T.dcFor(n, "small").dc}, costly ${T.dcFor(n, "costly").dc}, against ${T.dcFor(n, "against").dc}`,
      T.dcFor(n, "small").dc === 10 && T.dcFor(n, "costly").dc === 14 && T.dcFor(n, "against").dc === 18);
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
    ok(`levers are for asks: a Read never takes one`, T.preview(p, n, { technique: "read", lever: "desire" }).lever === null);
    const keys = (o) => Object.keys(o).sort().join();
    ok(`the preview never consults the nature: key and wall look alike`,
      keys(T.preview(p, n, { technique: "appeal" })) === keys(T.preview(p, n, { technique: "demand" })) && !("rel" in pv));
    ok(`each technique rolls its own skill: Read → Insight, Deceive → Deception, Demand → Persuasion`,
      T.preview(p, n, { technique: "read" }).skill === "ins" && T.preview(p, n, { technique: "deceive" }).skill === "dec" && T.preview(p, n, { technique: "demand" }).skill === "per");
    ok(`a Read has no size and no approach: the base DC, no Leanings`, T.preview(p, n, { technique: "read" }).dc === 14 && T.preview(p, n, { technique: "read" }).size === null
      && T.preview(p, n, { technique: "read" }).approach === null && !T.preview(p, n, { technique: "read" }).parts.some((x) => /leaning|bond/.test(x.label)));
    ok(`no openings: an ask against them still needs leverage`, /needs leverage/.test(T.preview(pc("numQ"), npc("numM", "broker"), { technique: "bargain", size: "against" }).blocked ?? ""));
    ok(`only NPCs are asked`, !!T.preview(n, p, { technique: "appeal" }).blocked);
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

  // ═══ The Read ══════════════════════════════════════════════════════════════
  {
    const p = pc("rP"), h = npc("rH", "hermit");          // key Reason — but a Read has no approach
    const r1 = await roll(p, h, { technique: "read" }, [14], ["o1"]);
    ok(`Read: an answer for the party (their Fear) — no approach, so no second die`,
      r1.rel === "plain" && r1.natureDie === null && SAM.getKnown(h).fear && /What do they fear\?/.test(lastCard()) && bond("rH", "rP") === "none");
    await roll(p, h, { technique: "read" }, [15], ["o0", "o0"]);
    ok(`a strong Read: two answers`, SAM.getKnown(h).desire && SAM.getKnown(h).key);
    const b = npc("rB", "broker");
    await roll(p, b, { technique: "read" }, [6]);
    ok(`a missed Read: they notice — no emotion, no String`, /They notice/.test(lastCard()) && R.TSLEmotions.of(p).length === 0 && SS.countOn("rB", "rP") === 0);
    const m = npc("rM", "martyr");
    await roll(p, m, { technique: "read" }, [1]);
    ok(`a bad Read: they read you instead — a String on you`, SS.countOn("rM", "rP") === 1 && /read you instead/.test(lastCard()));
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

  // ═══ Before witnesses ═══════════════════════════════════════════════════════
  {
    const TE = R.TSLEmotions;
    const p = pc("wP"), d = npc("wD", "duelist"), t = npc("wT", "tyrant");   // Duelist bends +2, Tyrant hardens −2; Reason is plain to both
    const keys = (o) => Object.keys(o).sort().join();
    const pd = T.preview(p, d, { technique: "bargain", witnesses: true }), pt = T.preview(p, t, { technique: "bargain", witnesses: true });
    ok(`before witnesses the preview never consults the nature: a bending and a hardening one look alike`,
      pd.witnesses && pt.witnesses && keys(pd) === keys(pt) && pd.mod === pt.mod && !("audience" in pd));
    ok(`a Read has no witnesses`, T.preview(p, d, { technique: "read", witnesses: true }).witnesses === false);
    const r1 = await roll(p, d, { technique: "bargain", size: "costly", witnesses: true }, [5], ["pay"]);
    ok(`the room tips the roll: 5 + 7 = 12, +2 before witnesses — the Duelist bends, 14 is a hit`, r1.audience === 2 && r1.total === 14 && r1.grade === "success");
    ok(`…a yes before witnesses binds them: a String on them, and the party now knows how they take an audience`,
      SS.countOn("wP", "wD") === 1 && /Everyone saw them give it/.test(lastCard()) && /they bend/.test(lastCard()) && SAM.getKnown(d).audience);
    ok(`…a String with no bond before makes them Strangers — so it shows in Bonds`, BS.find("wP", "wD")?.type === "stranger" && BS.find("wD", "wP")?.type === "stranger");
    const q = pc("wQ");
    const r2 = await roll(q, t, { technique: "bargain", size: "costly", witnesses: true }, [8]);
    ok(`the Tyrant hardens (−2): 15 becomes 13 — a no before witnesses: their Frightened, and you lose face (Insecure)`,
      r2.audience === -2 && r2.total === 13 && r2.grade === "failure" && TE.has(q, "frightened") && TE.has(q, "insecure") && /loses face/.test(lastCard()));
    const r3 = await roll(pc("wR"), t, { technique: "bargain", size: "costly" }, [8], ["pay"]);
    ok(`the same words in private: no audience, a hit`, r3.audience === 0 && r3.grade === "success" && SS.countOn("wR", "wT") === 0);
  }

  // ═══ Masks ══════════════════════════════════════════════════════════════════
  {
    const p = pc("mP");
    const sch = npc("mS", "machiavellian"), her = npc("mH", "hermit"), bare = npc("mB", "broker");
    await SAM.setActorData(sch, { maskId: "caretaker" });     // a Schemer playing the Caretaker
    await SAM.setActorData(her, { maskId: "hermit" });        // a Hermit showing their own face
    ok(`the face they show: a mask, an open face, or nothing`, SAM.getShown(sch)?.id === "caretaker" && SAM.getMask(sch)?.id === "caretaker"
      && SAM.getShown(her)?.id === "hermit" && SAM.getMask(her) === null && SAM.getShown(bare) === null && SAM.getMask(bare) === null);
    ok(`“Is that their true face?” is asked only of someone who shows one`, T.openQuestions(sch).includes("mask") && !T.openQuestions(bare).includes("mask"));
    await roll(p, sch, { technique: "read" }, [14], ["o6"]);
    ok(`a Read through the mask: they only play the Caretaker — known, but not yet who they are`,
      SAM.getActorData(sch).known?.mask && !SAM.isRevealed(sch) && /It(?:'|&#39;)s a mask/.test(lastCard()));
    await roll(p, her, { technique: "read" }, [14], ["o6"]);
    ok(`an open face, confirmed by a Read, names them on the spot`, SAM.isRevealed(her) && /No mask/.test(lastCard()) && /Figured out/.test(lastCard()));
    await SAM.setKnown(sch, { key: true });
    await roll(pc("mQ"), sch, { technique: "bargain", size: "costly" }, [5, 3]);
    ok(`once their key and wall are known, they're named — and the mask falls`, SAM.isRevealed(sch) && /The mask falls: they only played the Caretaker/.test(lastCard()));
  }

  // ═══ A strong Read keeps a String ═══════════════════════════════════════════
  {
    const p = pc("sP"), b = npc("sB", "broker");
    const r = await roll(p, b, { technique: "read" }, [17], ["o0", "o6"]);
    ok(`a strong Read: one answer, and a String instead of the second — you saw where it hurts`,
      r.grade === "strong" && r.readString && r.questions.length === 1 && SAM.getKnown(b).desire && SS.countOn("sP", "sB") === 1 && /saw where it hurts/.test(lastCard()));
    makeActor("sX"); makeActor("sY");
    await BS.add("sX", "sY", { type: "stranger", attitude: 1 });
    const w = await BS.shift("sX", "sY", "warm");
    ok(`a Stranger won over by the Heart becomes a Friend ●`, w?.turned && bond("sX", "sY") === "friend1" && bond("sY", "sX") === "friend1");
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
    ok(`Hopeless: −2 on asks and gambits, not on reads`, parts(q, n, "bargain") === "you're Hopeless -2" && parts(q, n, "deceive") === "you're Hopeless -2" && parts(q, n, "read") === "");
    await TE.add(q, "guilty", { toward: "eM" });
    ok(`Guilty toward someone: −2 on everything against them, nobody else`, /Guilty -2/.test(parts(q, m, "read")) && !/Guilty/.test(parts(q, n, "read")));
    await TE.add(n, "frightened", { by: "eP" });
    ok(`a Frightened NPC: +2 to Pressure against them`, /they're Frightened 2/.test(parts(q, n, "demand")) && !/Frightened/.test(parts(q, n, "appeal")));
    await TE.add(m, "guilty", { by: "eP", toward: "eP" });
    ok(`an NPC Guilty toward you: +2 to your Heart — only yours`, /they're Guilty 2/.test(parts(p, m, "appeal")) && !/they're Guilty/.test(parts(q, m, "appeal")));
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
    await roll(s1, t1, { technique: "demand", size: "costly" }, [14, 3]);
    ok(`a missed Demand into the Tyrant's wall: their pushback leaves you Frightened`, TE.has(s1, "frightened") && /is <b>Frightened<\/b>/.test(lastCard()) && /An order in front of witnesses/.test(lastCard()));
    await roll(s1, t1, { technique: "bargain", size: "small" }, [2]);
    ok(`miss again while still Frightened: a scar — Flinch`, TE.scars(s1).includes("flinch") && /leaves a scar/.test(lastCard()));
    const s2 = pc("eU"), h = npc("eH", "hermit");
    await roll(s2, h, { technique: "read" }, [3]);
    ok(`a Read that misses costs no emotion`, TE.of(s2).length === 0);
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
    await T.roll(p, n, { technique: "demand", size: "small" });
    globalThis.__forceDice = null;
    game.user.isGM = true;
    game.socket.emit = emit;
    ok(`a player's roll relays to the GM and changes nothing locally`, sent.length === 1 && sent[0].type === "GM_ACTION"
      && sent[0].data.action === "talkResolve" && sent[0].data.args?.technique === "demand" && !SAM.getKnown(n).wall);
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
    const rate = async ({ who = "face", technique, lever = null, N = 400 }) => {
      let yes = 0;
      for (let i = 0; i < N; i++) {
        const p = who === "face" ? pc("dtP") : plain();
        const n = npc("dtN", "caretaker");
        if (lever) await SAM.setKnown(n, { desire: true });
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
    console.log = quiet;
    ok(`the person decides: face +7 — key ${key}%, plain ${flat}%, wall ${wall}%`, key - flat >= 15 && flat - wall >= 15);
    ok(`understanding beats charisma: +2 with the key and a lever ${plainKeyLever}% vs the face on plain ground ${flat}%`, plainKeyLever >= flat - 3);
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
    ok(`Talk (player): the person, ${techs} techniques with what each looks like, sizes with their DCs, the lever, the String, the roll line`, !bad(talk)
      && techs === 7 && /do it — or else/.test(talk) && /data-tech="read"/.test(talk) && /data-size="against"/.test(talk) && /DC 10/.test(talk)
      && /Their Desire/.test(talk) && /1 String on them/.test(talk) && /vs DC 14/.test(talk) && /Roll — Appeal/.test(talk) && /Nature unread/.test(talk) && !/Schemer/.test(talk));
    ok(`no target list — the map, or your target`, !/<select class="tsl-t-target"/.test(talk) && /data-t-pick/.test(talk) && /Someone else/.test(talk));
    ok(`an ask offers who's watching — in private or before witnesses`, /data-wit="0"/.test(talk) && /data-wit="1"/.test(talk));
    const pub = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tWitnesses: true });
    ok(`…before witnesses is marked, and the math is unchanged (the room shows in the result)`, !bad(pub) && /tsl-wit-btn on" data-wit="1"/.test(pub)
      && (pub.match(/tsl-math-part/g) ?? []).length === (talk.match(/tsl-math-part/g) ?? []).length);
    const read = await render(P, "talk", { _tTarget: "uiN", _tTech: "read" });
    ok(`Talk → Read: no sizes, no witnesses, Insight, "read"`, !bad(read) && !/data-size=/.test(read) && !/data-wit=/.test(read) && /Roll — Read them/.test(read) && /Insight \+4/.test(read));
    await SAM.setActorData(N, { maskId: "caretaker" });
    const masked = await render(P, "talk", { _tTarget: "uiN" });
    ok(`a player sees the face they show — “seems: Caretaker” — and how they seem, not who they are`, !bad(masked)
      && /seems: Caretaker/.test(masked) && /How they seem/.test(masked) && !/Schemer/.test(masked) && /data-tooltip="[^"]*Is that their true face/.test(masked));
    const none = await render(P, "talk", {});
    ok(`Talk with nobody targeted asks whom you're talking to — and offers the map`, !bad(none) && /Who are you talking to/.test(none) && /Pick on the map/.test(none));
    game.user.targets = new Set([tok(N)]);
    const aimed = await render(P, "talk", {});
    game.user.targets = new Set();
    ok(`target their token (T) and Talk faces them`, !bad(aimed) && /Captain/.test(aimed) && /data-tech="demand"/.test(aimed));
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
      if (c === "ap" && !/Seven techniques/.test(h)) codexOk = false;
      words += h.replace(/<[^>]+>/g, " ").split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
    }
    ok(`Codex: every page renders for a player (no GM page) — ${words} words`, codexOk);
    game.user.isGM = true;
    const gmTalk = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`the GM sees the truth (the nature tagged hidden) — and the mask they wear`, !bad(gmTalk) && /Schemer/.test(gmTalk) && /hidden/.test(gmTalk) && /tsl-x-mask/.test(gmTalk) && /Caretaker/.test(gmTalk));
    const gmProfile2 = await render(N, "profile");
    ok(`the GM sets the mask in Profile → Nature`, !bad(gmProfile2) && /name="maskId"/.test(gmProfile2) && /value="caretaker" selected/.test(gmProfile2) && /a mask over who they really are/.test(gmProfile2));
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
    ok(`the Scene renders the cast, their bonds, what they feel — and the face they show`, !bad(vh) && /tsl-viz-node/.test(vh) && /Rival/.test(vh) && /tsl-viz-emos/.test(vh) && /seems: Caretaker/.test(vh));

    // ═══ Ukrainian ═══
    const I = R.TSLi18n, L = R.TSL_I18N, UK = R.TSL_UK;
    game.i18n.lang = "uk";
    ok(`“Auto” follows Foundry's language; English and Ukrainian can be forced`, I.resolve("auto") === "uk" && I.resolve("en") === "en" && I.resolve("uk") === "uk");
    game.i18n.lang = "en";
    ok(`…an English Foundry gets English`, I.resolve("auto") === "en");
    // Every literal _t("…") in the scripts, and every reaction line, has its Ukrainian.
    const lit = new Set();
    for (const rel of manifest.scripts.filter((r) => !r.endsWith("i18n.js"))) {
      const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const m of code.matchAll(/_t\(\s*"((?:[^"\\]|\\.)*)"/g)) lit.add(JSON.parse(`"${m[1]}"`));
    }
    const noUk = [...lit, ...Object.values(R.ARCHETYPE_REACTIONS).flat()].filter((k) => typeof UK[k] !== "string");
    ok(`the Ukrainian dictionary covers every line on screen (${lit.size} interface lines, 180 reactions)${noUk.length ? ` — missing: "${noUk[0]}"` : ""}`, noUk.length === 0);
    const ph = (x) => [...String(x).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    const badPh = Object.entries(UK).find(([en, uk]) => ph(en) !== ph(uk));
    ok(`…and keeps every {placeholder}${badPh ? ` (not in: "${badPh[0]}")` : ""}`, !badPh);
    I.setLanguage("uk");
    L.missing = new Set();
    const ukNames = R.SOCIAL_ARCHETYPES.map((a) => a.label.toLowerCase());
    const ukLeak = Object.entries(R.ARCHETYPE_REACTIONS).flatMap(([, pool]) => pool.map((l) => UK[l] ?? "")).find((l) => ukNames.some((x) => l.toLowerCase().includes(x)));
    ok(`Ukrainian: the natures, techniques and emotions speak it (${R.TECHNIQUES.appeal.label}, ${R.SOCIAL_ARCHETYPES[0].label}, ${R.EMOTIONS.frightened.label}) — and no reaction names a nature${ukLeak ? ` (leak: "${ukLeak}")` : ""}`,
      R.TECHNIQUES.appeal.label === "Прохання" && R.SOCIAL_ARCHETYPES[0].label === "Тиран" && R.EMOTIONS.frightened.label === "Переляк" && !ukLeak);
    const ukViews = [
      await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tWitnesses: true }),
      await render(P, "talk", { _tTarget: "uiN", _tTech: "read" }),
      await render(P, "talk", { _tTarget: "uiN", _tResult: { technique: "bargain", grade: "success", total: 16, dc: 14, rel: "plain", paid: false, witnesses: true, audience: -2 } }),
      await render(P, "profile"), await render(P, "bonds", { _expandedBonds: new Set([BS.find("uiP", "uiN").id]) }),
      await render(N, "profile"), await render(N, "talk"),
    ];
    for (const c of ["start", "ap", "read", "emo", "natures", "bonds", "gm"]) ukViews.push(await render(P, "codex", { _codexCat: c }));
    try { ukViews.push(new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML()); } catch (err) { ukViews.push("ERR:" + err.stack); }
    const cardsBefore = globalThis.__cards.length;
    const ukP = pc("ukP"), ukN = npc("ukN", "duelist");
    await roll(ukP, ukN, { technique: "bargain", size: "costly", witnesses: true }, [5], ["pay"]);
    await roll(ukP, ukN, { technique: "appeal", size: "costly" }, [3, 2]);
    await roll(ukP, ukN, { technique: "read" }, [17], ["o0", "o0"]);
    await SAM.setKnown(ukN, { fear: true });
    await roll(ukP, ukN, { technique: "blackmail", size: "costly" }, [2, 19]);
    await roll(ukP, ukN, { technique: "deceive", size: "small" }, [18]);
    await T.exposeLie(ukN, T.lies(ukN)[0]?.id);
    await R.TSLEmotions.clear(ukP, R.TSLEmotions.of(ukP)[0]?.id ?? "angry", "act");
    const ukCards = globalThis.__cards.slice(cardsBefore).map((m) => m.content).join("\n");
    const ukAll = ukViews.join("\n");
    const untranslated = [...L.missing];
    ok(`Ukrainian: every window and Codex page, every card renders — nothing left in English${untranslated.length ? ` (e.g. "${untranslated[0]}")` : ""}`,
      !bad(ukAll) && !bad(ukCards) && untranslated.length === 0 && /Кинути — Прохання/.test(ukAll) && /При свідках/.test(ukAll) && /Кожне слово — хід/.test(ukAll)
      && /Струн/.test(ukCards) && /При свідках/.test(ukCards));
    L.missing = null;
    I.setLanguage("en");
    ok(`…and back to English, the data texts too`, R.TECHNIQUES.appeal.label === "Appeal" && R.SOCIAL_ARCHETYPES[0].label === "Tyrant" && R.EMOTIONS.frightened.label === "Frightened"
      && R.SOCIAL_ARCHETYPES[0].price.text.startsWith("Ask it as a favour"));
    canvas.tokens.placeables = [];
  }

  ok(`no card ever showed undefined / NaN (${CARD_SUSPECT})`, CARD_SUSPECT === 0);
  console.log(pass ? "DONE — pipeline clean" : "DONE — FAILURES above");
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.log("HARNESS CRASH", e.stack); process.exit(1); });
