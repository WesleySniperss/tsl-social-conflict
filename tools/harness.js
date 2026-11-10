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
  ["tsl-social-conflict.systemRollDialog", false],
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
const hookFns = {};
let hookSeq = 0;
globalThis.Hooks = {
  on: (n, fn) => { (hookFns[n] ??= new Map()).set(++hookSeq, fn); return hookSeq; },
  once: (n, fn) => { (onceHooks[n] ??= []).push(fn); return 1; },
  off: (n, id) => { hookFns[n]?.delete(id); },
  callAll: (n, ...a) => { for (const fn of [...(hookFns[n]?.values() ?? [])]) fn(...a); return true; },
  call: () => true,
  _fire: (n, ...a) => { for (const fn of onceHooks[n] ?? []) try { fn(...a); } catch (e) {} },
};
globalThis.CONFIG = { statusEffects: [], A5E: { ROLL_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } } };
globalThis.CONST = { ACTIVE_EFFECT_MODES: { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 }, ACTIVE_EFFECT_SHOW_ICON: { NEVER: 0, CONDITIONAL: 1, ALWAYS: 2 } };   // as on v14

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
    updateEmbeddedDocuments: async (_t, arr) => {
      for (const u of arr) {
        const e = effects.find((x) => x.id === u._id);
        if (!e) continue;
        const { _id, ...rest } = clone(u);
        Object.assign(e, rest);
        if (rest.statuses) e.statuses = new Set(rest.statuses);
      }
      return arr;
    },
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
  "SKILL_LABELS", "STRING_CAP", "migrateToV3", "TSL_I18N", "TSLi18n", "TSL_UK", "TALK_GRADES", "JOB_GRADES",
  "TSLAbilities", "TRIAD_MOVES", "NPC_ABILITIES", "TSLBondAuras", "TSLBondNear", "TSLBondMoments", "TSLBondPowers", "BOND_ABILITIES", "BOND_SIGNATURES", "tidyStringsAndLeanings", "READ_DEPTH"];
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
    ok(`eight maneuvers: every approach asks once and goes all in once; a lie belongs to no approach; one Read; each a pair of different skills`, TE.length === 8
      && R.APPROACH_ORDER.every((ap) => ["ask", "gambit"].every((job) => TE.filter((t) => t.approach === ap && t.job === job).length === 1))
      && R.TECHNIQUES.deceive.anyWay && !R.TECHNIQUES.deceive.approach
      && TE.filter((t) => t.job === "read" && !t.approach).length === 1
      && TE.every((t) => t.skills.length === 2 && t.skills[0] !== t.skills[1]) && R.JOB_ORDER.join() === "read,ask,gambit");
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
    await SAM.setActorData(p, { triad: { power: 0, attention: 2, order: 1 } });   // Leanings: Heart ●●, Reason ●
    await BS.add("numP", "numN", { type: "friend", attitude: 2 });
    pc("numH");
    await SAM.setKnown(n, { desire: true });
    const pv = T.preview(p, n, { technique: "appeal", helperId: "numH", lever: "desire" });
    ok(`preview: +7 Persuasion +2 Heart leaning +2 bond +2 Desire +2 help = ${pv.mod}`, pv.mod === 15 && pv.parts.length === 5 && pv.parts.some((x) => x.label === "Heart leaning" && x.value === 2));
    ok(`…a Leaning counts only on its own way: a Demand gets no Heart dots — and with none in Pressure, while leaning elsewhere, it's foreign ground: −1`, T.preview(p, n, { technique: "demand" }).parts.some((x) => /foreign ground/.test(x.label) && x.value === -1) && !T.preview(p, n, { technique: "demand" }).parts.some((x) => x.label === "Heart leaning"));
    ok(`…and an NPC has a nature, not Leanings`, SAM.leaningDots(n, "heart") === 0);
    const lp = pc("numLean");
    const l1 = await SAM.setLeaning(lp, "power", 3), l2 = await SAM.setLeaning(lp, "attention", 2);
    const tri = SAM.getCharacterNotes(lp).triad;
    const l3 = await SAM.setLeaning(lp, "attention", 1);
    ok(`Leanings: 4 dots to spread, at most 3 in one — past the pool it's refused; the same dot again takes one off`,
      l1 && !l2 && tri.power === 3 && tri.attention === 0 && l3 && SAM.getCharacterNotes(lp).triad.attention === 1 && !(await SAM.setLeaning(lp, "order", 1)) && (await SAM.setLeaning(lp, "attention", 1)) && SAM.getCharacterNotes(lp).triad.attention === 0);
    const leanFx = () => lp.effects.filter((e) => e.flags?.[SCOPE]?.triadBonus);
    ok(`Leanings on the sheet, as before: Power ●●● → +3 Intimidation on every check (one effect); an empty triad gives nothing`,
      SAM.leanSkillBonus(lp, "itm") === 3 && SAM.leanSkillBonus(lp, "ins") === 0 && leanFx().length === 1 && leanFx()[0].changes.some((c) => c.key === "system.skills.itm.bonuses.check" && c.value === "+3"));
    await SAM.setLeaning(lp, "power", 3);
    ok(`…it follows the dots: one off — +2; Power ●● is the archetype (a lead of 2)`, SAM.leanSkillBonus(lp, "itm") === 2 && leanFx().length === 1 && SAM.rulingTriad(lp) === "power");
    await SAM.setLeaning(lp, "power", 2); await SAM.setLeaning(lp, "power", 1);
    ok(`…and with no dots, no effect`, !leanFx().length && SAM.rulingTriad(lp) === null);
    p.system.skills.prf = { total: 4, proficient: 1 };
    const pb = T.preview(p, n, { technique: "appeal" });
    ok(`a maneuver's second skill backs the roll: trained in Performance — Appeal gets your proficiency (+3 here)`, pb.backed && pb.support === "prf" && pb.parts.some((x) => /Performance backs it/.test(x.label) && x.value === 3));
    p.system.skills.prf = { total: 4 };
    ok(`a lever you don't know yet isn't offered`, T.preview(p, n, { technique: "appeal", lever: "fear" }).lever === null);
    ok(`levers are for asks: a Read never takes one`, T.preview(p, n, { technique: "read", lever: "desire" }).lever === null);
    const keys = (o) => Object.keys(o).sort().join();
    ok(`the preview never consults the nature: key and wall look alike`,
      keys(T.preview(p, n, { technique: "appeal" })) === keys(T.preview(p, n, { technique: "demand" })) && !("rel" in pv));
    ok(`each maneuver is a pair of D&D skills — Read Insight + Investigation, Demand Intimidation + Athletics, Appeal Persuasion + Performance, Argument Persuasion + History, Deal Persuasion + Insight…`,
      ["read:ins,inv", "demand:itm,ath", "appeal:per,prf", "argument:per,his", "blackmail:itm,inv", "seduce:per,prf", "bargain:per,ins", "deceive:dec,prf"]
        .every((x) => { const [t, k] = x.split(":"); return R.TECHNIQUES[t].skills.join() === k; }));
    const brute = makeActor("numBrute", { cha: -1 }, { skills: { itm: { total: -1 }, ath: { total: 6, proficient: 1 }, ins: { total: 1 } } });
    ok(`the better of the two rolls: the face Demands with Intimidation (+3), the brute with Athletics (+6)`,
      T.preview(p, n, { technique: "demand" }).skill === "itm" && T.preview(brute, n, { technique: "demand" }).skill === "ath" && T.preview(brute, n, { technique: "demand" }).parts[0].value === 6);
    ok(`the odds are exact: +7 against DC 14 — 70%, with advantage 91%, with disadvantage 49%; a 20 always hits, a 1 never`,
      T.hitChance(7, 14) === 0.7 && Math.abs(T.hitChance(7, 14, "adv") - 0.91) < 1e-9 && Math.abs(T.hitChance(7, 14, "dis") - 0.49) < 1e-9
      && T.hitChance(0, 30) === 0.05 && T.hitChance(30, 10) === 0.95);
    const kn = npc("numK", "tyrant");                  // key Heart, wall Pressure
    const relBefore = T.knownRelation(kn, "heart");
    await SAM.setKnown(kn, { key: true });
    const r1 = [T.knownRelation(kn, "heart"), T.knownRelation(kn, "pressure"), T.knownRelation(kn, "reason")].join();
    await SAM.setKnown(kn, { wall: true });
    const r2 = [T.knownRelation(kn, "pressure"), T.knownRelation(kn, "reason")].join();
    const ch = T.chance(p, kn, { technique: "appeal" });
    ok(`the odds use only what the party knows: unknown → a normal roll; their key known → advantage; both known → the third is a normal roll for sure`,
      relBefore === "unknown" && r1 === "key,unknown,unknown" && r2 === "wall,plain" && ch.mode === "adv" && T.knownRelation(kn, null) === null);
    ok(`their guard: a Friend ●● toward you lowers the DC by 2 — on a Read too`, T.preview(p, n, { technique: "read" }).dcMods.some((m) => /guard is down/.test(m.label) && m.value === -2));
    const foe = npc("numFoe", "tyrant");
    await BS.add("numFoe", "numP", { type: "enemy", attitude: 1 });
    ok(`…an Enemy ● is wary of you: DC +1`, T.preview(p, foe, { technique: "read" }).dcMods.some((m) => /wary/.test(m.label) && m.value === 1));
    ok(`a Read has no size and no approach: the base DC (and their guard)`, T.preview(p, n, { technique: "read" }).dc === 12 && T.preview(p, n, { technique: "read" }).size === null
      && T.preview(p, n, { technique: "read" }).approach === null && !T.preview(p, n, { technique: "read" }).parts.some((x) => /leaning|bond/.test(x.label)));
    ok(`no openings: an ask against them still needs leverage`, /needs leverage/.test(T.preview(pc("numQ"), npc("numM", "broker"), { technique: "argument", size: "against" }).blocked ?? ""));
    ok(`only NPCs are asked`, !!T.preview(n, p, { technique: "appeal" }).blocked);
  }

  // ═══ Asks: what winning each way costs ══════════════════════════════════════
  {
    const p = pc("aP"), d = npc("aD", "duelist");         // Duelist: key Pressure, wall Heart, firm
    const r1 = await roll(p, d, { technique: "demand", size: "costly" }, [12, 3]);
    ok(`Demand: they give in — no price asked`, r1.grade === "success" && r1.paid === null && /gives in — no price/.test(lastCard()));
    ok(`…but they remember it: a String on you — and the roll names no bond (they're Strangers, as the String made them)`, SS.countOn("aD", "aP") === 1 && SS.countOn("aP", "aD") === 0 && bond("aD", "aP") === "stranger1");
    await roll(p, d, { technique: "demand", size: "costly" }, [18, 2]);
    ok(`a strong Demand: a String on them — and still no bond is named by a roll`, SS.countOn("aP", "aD") === 1 && bond("aD", "aP") === "stranger1");
    const c = npc("aC", "caretaker");                     // Caretaker: key Heart; their price hands them a String
    const r3 = await roll(p, c, { technique: "appeal", size: "costly" }, [9, 3], ["pay"]);
    ok(`Appeal: "yes, but" — their price paid is a debt (a String on you); a plain yes gives you none, and names no bond`,
      r3.grade === "success" && r3.paid && SS.countOn("aC", "aP") === 1 && SS.countOn("aP", "aC") === 0 && bond("aC", "aP") === "stranger1");
    const q = pc("aQ");
    await roll(q, d, { technique: "appeal", size: "costly" }, [15, 2]);
    ok(`Appeal into their wall misses: you showed your heart — a String on you; a proud one closes the door`,
      SS.countOn("aD", "aQ") === 1 && /door is closed/.test(lastCard()) && /A public challenge/.test(lastCard()));
    const b = npc("aB", "broker");
    await roll(q, b, { technique: "demand", size: "costly" }, [8]);
    ok(`a yielding nature keeps listening — a plain miss costs their emotion, no String (only a bad one does)`, !/door is closed/.test(lastCard()) && SS.countOn("aB", "aQ") === 0 && R.TSLEmotions.has(q, "hopeless"));
    await roll(q, b, { technique: "argument", size: "small" }, [15, 2]);
    ok(`a yes to a small ask wins a String too — the GM calls the roll, so there's nothing to farm`, SS.countOn("aQ", "aB") === 1 && /They took your word for it/.test(lastCard()));
    const t = npc("aT", "tyrant");
    await roll(q, t, { technique: "argument", size: "small" }, [1]);
    ok(`a bad miss (a natural 1): a String on you; a small ask slams no door`, SS.countOn("aT", "aQ") === 1 && !/door is closed/.test(lastCard()));
    const h = npc("aH", "hermit");
    await SAM.setKnown(h, { fear: true });
    await roll(q, h, { technique: "demand", size: "against", lever: "fear" }, [3, 2]);
    ok(`a threat that misses cuts both ways: a String on you`, SS.countOn("aH", "aQ") === 1);
    await SS.add("aQ", "aH", 1);
    const r = await roll(q, h, { technique: "argument", size: "costly" }, [4, 3], ["burn", "pay"]);
    ok(`a near miss: burn a String for +5 and it lands (${r.total} vs ${r.dc})`, r.stringSpent && (r.grade === "success" || r.grade === "strong") && SS.countOn("aQ", "aH") === 0);
    ok(`one at a time: at most ${R.STRING_CAP} String on one person`, R.STRING_CAP === 1 && (await SS.add("aQ", "aH", 5)) === 1);
  }

  // ═══ The Read ══════════════════════════════════════════════════════════════
  {
    const p = pc("rP"), h = npc("rH", "hermit");          // key Reason — but a Read has no approach
    const cardsBefore = globalThis.__cards.length;
    const r1 = await roll(p, h, { technique: "read" }, [14], ["o1"]);
    const [pub, whisper] = globalThis.__cards.slice(cardsBefore);
    ok(`a Read on what they hide (their Fear) isn't told: the card says the GM lets it show — nothing on record yet; no approach, so no second die`,
      r1.rel === "plain" && r1.natureDie === null && !SAM.getKnown(h).fear && /What do they fear\?/.test(pub?.content ?? "") && /the GM lets it show/.test(pub?.content ?? "")
      && !pub?.whisper && bond("rH", "rP") === "none");
    const fearText = T.answerFor(h, "fear");
    ok(`…the GM gets a whisper: their Fear, how to let it show, and a button for when the players name it`,
      Array.isArray(whisper?.whisper) && /Let it show/.test(whisper?.content ?? "") && whisper.content.includes(foundry.utils.escapeHTML(fearText))
      && /Let them flinch from it/.test(whisper.content) && /data-tsl-tell="fear"/.test(whisper.content) && !(pub?.content ?? "").includes(foundry.utils.escapeHTML(fearText)));
    await T.nameTell("rH", "fear", "rP");
    ok(`…they name it, the GM presses it: their Fear is the party's now (a slim line for the table, no Fear in it)`,
      SAM.getKnown(h).fear && /Named: .*Fear/.test(lastCard()) && !lastCard().includes(foundry.utils.escapeHTML(fearText)) && /They named it|Named — the party knows it now/.test(T._tellCardHTML(h, p, ["fear"])));
    await roll(p, h, { technique: "read" }, [15], ["o1", "o1"]);
    ok(`a strong Read: two answers, told straight — how they take Pressure, Heart or Reason (key and wall)`, SAM.getKnown(h).key && SAM.getKnown(h).wall && !SAM.getKnown(h).desire);
    const b = npc("rB", "broker");
    await roll(p, b, { technique: "read" }, [6]);
    ok(`a missed Read: they notice — no emotion, no String`, /They notice/.test(lastCard()) && R.TSLEmotions.of(p).length === 0 && SS.countOn("rB", "rP") === 0);
    const m = npc("rM", "martyr");
    await roll(p, m, { technique: "read" }, [1]);
    ok(`a bad Read: they notice — and still no String: reading someone is safe`, SS.countOn("rM", "rP") === 0 && /They notice/.test(lastCard()));
  }

  // ═══ Gambits ════════════════════════════════════════════════════════════════
  {
    const p = pc("gP"), h = npc("gH", "hermit");          // wall Pressure, firm
    ok(`Blackmail needs a hold: their Fear or a String`, /Blackmail needs/.test(T.preview(p, h, { technique: "blackmail" }).blocked ?? ""));
    await SAM.setKnown(h, { fear: true });
    const pv = T.preview(p, h, { technique: "blackmail" });
    ok(`…their Fear is enough — and it plays on it (+${R.LEVER_BONUS})`, !pv.blocked && pv.lever === "fear");
    await roll(p, h, { technique: "blackmail", size: "costly" }, [17, 15]);
    ok(`Blackmail lands strong: a String on them, and one on you (they'll pay you back) — whether they're your Enemy now is the GM's to say`, SS.countOn("gP", "gH") === 1 && SS.countOn("gH", "gP") === 1 && bond("gH", "gP") === "stranger1" && /never forgive/.test(lastCard()));
    const p2 = pc("gQ"), h2 = npc("gH2", "hermit");
    await SS.add("gQ", "gH2", 1);
    await roll(p2, h2, { technique: "blackmail", size: "costly" }, [3, 2], ["keep"]);
    ok(`Blackmail called badly: a String on you — and the door closes; the bond is left to the GM`,
      SS.countOn("gH2", "gQ") === 1 && BS.find("gH2", "gQ")?.type !== "enemy" && /calls your bluff/.test(lastCard()) && /door is closed/.test(lastCard()));
    const c = npc("gC", "caretaker");                     // key Heart
    ok(`Seduce needs their Desire or a bond ●●`, /Seduce needs/.test(T.preview(p, c, { technique: "seduce" }).blocked ?? ""));
    await SAM.setKnown(c, { desire: true });
    await roll(p, c, { technique: "seduce", size: "small" }, [8, 12]);
    ok(`Seduce lands: they do it for you — and the roll doesn't make you anything to each other`, BS.find("gC", "gP")?.type !== "friend" && /for you/.test(lastCard()));
    const i = npc("gI", "exalted");                       // Idol: key Heart, firm
    await SAM.setKnown(i, { desire: true });
    await roll(p, i, { technique: "seduce", size: "costly" }, [2, 3]);
    ok(`Seduce fails: heartbreak — Hopeless, no String on a plain miss; a proud one closes the door`, SS.countOn("gI", "gP") === 0 && /heartbreak/.test(lastCard()) && /door is closed/.test(lastCard()));
    const s = npc("gS", "machiavellian");                 // Schemer: wall Reason
    await roll(p, s, { technique: "deceive", approach: "reason", size: "costly" }, [18, 16]);
    ok(`Deceive lands (even into their wall): they believe it — the lie is on record`, T.lies(s).length === 1 && /The lie holds/.test(lastCard()) && SS.countOn("gP", "gS") === 1);
    await T.exposeLie(s, T.lies(s)[0].id);
    ok(`the GM brings the lie out: an Enemy — the liar's String on them burns, and they take one on the liar`, T.lies(s).length === 0 && SS.countOn("gS", "gP") === 1 && SS.countOn("gP", "gS") === 0 && bond("gS", "gP") === "enemy2" && /The lie comes out/.test(lastCard()) && /String on them burns/.test(lastCard()));
    const m = npc("gM", "martyr");                        // yields — but a lie caught ends it anyway
    await roll(p, m, { technique: "deceive", size: "costly" }, [3]);
    ok(`Deceive caught: a String on you, and the door closes — even on a yielding nature`, SS.countOn("gM", "gP") === 1 && /catches the lie/.test(lastCard()) && /door is closed/.test(lastCard()));
    // A lie is told some way — and their key and wall count for that way.
    const lk = npc("gLk", "machiavellian"), lw = npc("gLw", "machiavellian");  // Schemer: key Heart, wall Reason
    const sob = await roll(pc("gQ1"), lk, { technique: "deceive", approach: "heart", size: "small" }, [4, 17]);
    ok(`a lie told through their key (a sob story to a Schemer): advantage — and the party learns the key; the card says how it was told`,
      sob.rel === "key" && sob.natural === 17 && SAM.getKnown(lk).key && /Heart · Deceive/.test(lastCard()));
    const forged = await roll(pc("gQ2"), lw, { technique: "deceive", approach: "reason", size: "small" }, [17, 4]);
    ok(`the same lie through their wall (forged proof): disadvantage`, forged.rel === "wall" && forged.natural === 4 && SAM.getKnown(lw).wall);
    const lb = npc("gLb", "hermit"), lq = pc("gQ3");
    await BS.add("gQ3", "gLb", { type: "friend", attitude: 2 });
    await R.TSLEmotions.add(lb, "frightened");
    const lieParts = (way) => T.preview(lq, lb, { technique: "deceive", approach: way }).parts.map((x) => x.label).join();
    ok(`the bond and what they feel count for the way it was told: a friend's lie through Heart +●, a bluff at the Frightened +2`,
      /bond/.test(lieParts("heart")) && !/bond/.test(lieParts("pressure")) && /Frightened/.test(lieParts("pressure")) && !/Frightened/.test(lieParts("heart")));
    ok(`a lie told no particular way is a normal roll, against the same DC`, T.preview(lq, lb, { technique: "deceive" }).approach === null && T.relation(lb, null) === "plain");
    ok(`a maneuver with its own approach ignores what the form says`, T.preview(lq, lb, { technique: "demand", approach: "heart" }).approach === "pressure");
    const lt = npc("gLt", "hermit");                      // Hermit: Heart is a normal roll, and they harden before witnesses
    await roll(pc("gQ4"), lt, { technique: "deceive", approach: "heart", size: "costly" }, [20]);
    ok(`the card speaks of a lie, not a deal: they believe it, a big lie — and a String on them`,
      /They believe it/.test(lastCard()) && /Heart · Deceive · Big lie/.test(lastCard()) && /They believe you/.test(lastCard()) && SS.countOn("gQ4", "gLt") === 1);
    await roll(pc("gQ5"), npc("gLu", "hermit"), { technique: "deceive", approach: "heart", size: "costly", witnesses: true }, [6]);
    ok(`caught before witnesses: you lose face — for being caught, not for being refused`, /Caught/.test(lastCard()) && /Caught before witnesses/.test(lastCard()) && !/Refused before witnesses/.test(lastCard()));
    await roll(pc("gQ6"), npc("gLv", "duelist"), { technique: "deceive", approach: "reason", size: "costly", witnesses: true }, [8]);
    ok(`believed before witnesses on a plain win: no String — the crowd adds none of its own`, !/Everyone saw/.test(lastCard()) && SS.countOn("gQ6", "gLv") === 0);
  }

  // ═══ A Deal: you give your word ══════════════════════════════════════════════
  {
    const p = pc("dP"), b = npc("dB", "broker");              // Broker: key Reason
    const strong = await roll(p, b, { technique: "bargain", size: "costly" }, [18, 2]);
    ok(`a Deal on your terms: they do it, and you give your word — on record, a String on you, the bond still waiting`,
      strong.grade === "strong" && T.deals(b).length === 1 && T.deals(b)[0].byId === "dP" && !T.deals(b)[0].price && SS.countOn("dB", "dP") === 1
      && /On your terms/.test(lastCard()) && /agrees — on your terms/.test(lastCard()) && /You gave your word/.test(lastCard()) && BS.find("dB", "dP")?.type === "stranger");
    await T.settleDeal(b, T.deals(b)[0].id, true);
    ok(`word kept: the String goes, and you're Allies — which feeds your next Reason`, T.deals(b).length === 0 && SS.countOn("dB", "dP") === 0 && BS.find("dB", "dP")?.type === "ally"
      && BS.find("dP", "dB")?.type === "ally" && /The word is kept/.test(lastCard()) && T.preview(p, b, { technique: "bargain" }).parts.some((x) => /bond/.test(x.label) && x.value === 1));
    const t = npc("dT", "tyrant"), q = pc("dQ");              // the Tyrant takes Reason as a normal roll
    const plain = await roll(q, t, { technique: "bargain", size: "costly" }, [8], ["pay"]);
    ok(`a Deal on their terms: their price, paid, is your word`, plain.grade === "success" && plain.paid === true && T.deals(t)[0]?.price === true && SS.countOn("dT", "dQ") === 1
      && /On their terms/.test(lastCard()) && /on your knee/.test(lastCard()));
    const m = npc("dM", "martyr");                            // their price is a debt in itself — still one String
    await roll(pc("dR"), m, { technique: "bargain", size: "costly" }, [8], ["pay"]);
    ok(`one String for one word, even when the price is a debt in itself`, SS.countOn("dM", "dR") === 1 && T.deals(m).length === 1);
    game.user.isGM = false;
    await T.settleDeal(t, T.deals(t)[0].id, false);
    game.user.isGM = true;
    ok(`only the GM marks how a deal ended`, T.deals(t).length === 1);
    await T.settleDeal(t, T.deals(t)[0].id, false);
    ok(`word broken: Enemies — and they keep the String`, T.deals(t).length === 0 && SS.countOn("dT", "dQ") === 1 && BS.find("dT", "dQ")?.type === "enemy" && /The word is broken/.test(lastCard()) && /keeps the String/.test(lastCard()));
    const w = npc("dW", "tyrant");
    await roll(pc("dU"), w, { technique: "bargain", size: "costly" }, [8], ["walk"]);
    ok(`walk away from their terms: no deal, no word, no String`, T.deals(w).length === 0 && SS.countOn("dW", "dU") === 0);
    const x = npc("dX", "tyrant");
    await roll(pc("dV"), x, { technique: "bargain", size: "costly" }, [3]);
    ok(`a miss: no deal — their emotion, nothing on record`, /No deal/.test(lastCard()) && /turns the deal down/.test(lastCard()) && T.deals(x).length === 0 && R.TSLEmotions.has(game.actors.get("dV"), "frightened"));
    const u = npc("dY", "tyrant"), up = pc("dZ");
    const against = T.preview(up, u, { technique: "argument", size: "against" }), staked = T.preview(up, u, { technique: "bargain", size: "against" });
    ok(`a Deal is Reason's all-in: something against their interests needs leverage to argue — not to stake your word`, /needs leverage/.test(against.blocked ?? "") && !staked.blocked && staked.job === "gambit");
    const priceless = staked.mod;
    await SAM.setKnown(u, { price: true });
    ok(`…and it plays on their Price, once you know it: +2`, T.preview(up, u, { technique: "bargain" }).mod === priceless + 2 && T.preview(up, u, { technique: "bargain" }).parts.some((x) => /their Price/.test(x.label)));
  }

  // ═══ An Argument: they see it your way ═══════════════════════════════════════
  {
    const p = pc("eaP"), t = npc("eaT", "tyrant");            // the Tyrant takes Reason as a normal roll
    const hit = await roll(p, t, { technique: "argument", size: "costly" }, [8], ["pay"]);
    ok(`an Argument lands: no word given, no String either way — their price paid; and the roll names no bond`, hit.grade === "success" && T.deals(t).length === 0 && SS.countOn("eaT", "eaP") === 0 && !BS.find("eaT", "eaP")
      && /for a price/.test(lastCard()));
    const b = npc("eaB", "broker");
    await roll(pc("eaQ"), b, { technique: "argument", size: "small" }, [15, 2]);
    ok(`a strong one needs no price — and wins a String on them`, /does it/.test(lastCard()) && SS.countOn("eaQ", "eaB") === 1 && BS.find("eaB", "eaQ")?.type === "stranger");
    const m = npc("eaM", "tyrant");
    await roll(pc("eaR"), m, { technique: "argument", size: "small" }, [2]);
    ok(`a plain miss: they out-argue you — their emotion, no String`, SS.countOn("eaM", "eaR") === 0 && R.TSLEmotions.has(game.actors.get("eaR"), "frightened"));
  }

  // ═══ How they feel about you counts ══════════════════════════════════════════
  {
    const p = pc("hoP"), foe = npc("hoF", "hermit"), pal = npc("hoG", "hermit");
    await BS.add("hoP", "hoF", { type: "enemy", attitude: 2 });
    await BS.add("hoP", "hoG", { type: "friend", attitude: 2 });
    const bondOf = (npcA, tech) => T.preview(p, npcA, { technique: tech, approach: tech === "deceive" ? "heart" : null }).parts.filter((x) => /bond/.test(x.label)).reduce((a, x) => a + x.value, 0);
    ok(`an Enemy won't hear you out: −● on anything but Pressure (Appeal ${bondOf(foe, "appeal")}, Argument ${bondOf(foe, "argument")}, a lie through Heart ${bondOf(foe, "deceive")}) — and +● on Pressure (${bondOf(foe, "demand")})`,
      bondOf(foe, "appeal") === -2 && bondOf(foe, "argument") === -2 && bondOf(foe, "deceive") === -2 && bondOf(foe, "demand") === 2);
    ok(`an Enemy gives you nothing to read: −● Insight on a Read (${bondOf(foe, "read")})`, bondOf(foe, "read") === -2);
    ok(`a Friend: +● on Heart, +● when Persuasion rolls (an Argument ${bondOf(pal, "argument")}) — not twice on an Appeal (${bondOf(pal, "appeal")}) — and −● when Intimidation rolls (a Demand ${bondOf(pal, "demand")})`,
      bondOf(pal, "appeal") === 2 && bondOf(pal, "argument") === 2 && bondOf(pal, "demand") === -2);
    const c = npc("hoC", "hermit");
    await roll(p, c, { technique: "demand", size: "small" }, [12, 9]);
    ok(`a Demand names no bond: the one it pressed is no Rival — only what the String made them (${bond("hoC", "hoP")})`, BS.find("hoC", "hoP")?.type !== "rival");
    const close = npc("hoK", "broker");
    await BS.add("hoP", "hoK", { type: "family", attitude: 1 });
    await roll(p, close, { technique: "demand", size: "small" }, [18]);
    ok(`pressing your own family wins — and leaves you Guilty toward them`, R.TSLEmotions.of(p).some((e) => e.id === "guilty" && e.toward === "hoK") && /someone close to you/.test(lastCard()));
    await R.TSLEmotions.clear(p, "guilty");
  }

  // ═══ Their wall: no backing ══════════════════════════════════════════════════
  {
    const p = pc("wbP");
    p.system.skills.prf = { total: 4, proficient: 1 };
    const r = await roll(p, npc("wbD", "duelist"), { technique: "appeal", size: "small" }, [15, 15]);   // Duelist: wall Heart
    ok(`into their wall the second skill doesn't back you: 15 + 7 + 3 − 3 = ${r.total}, and the card says so`, r.rel === "wall" && r.wallLost === 3 && r.total === 22 && /Performance doesn(?:'|&#0?39;)t help/.test(lastCard()));
    const k = await roll(p, npc("wbT", "tyrant"), { technique: "appeal", size: "small" }, [15, 15], ["pay"]);   // Tyrant: key Heart
    ok(`…on their key it does`, k.rel === "key" && !k.wallLost && k.total === 25);
  }

  // ═══ Balance across the levels: the targets ═════════════════════════════════
  {
    settingsMap.set("tsl-social-conflict.socialDcBonus", 0);
    const tiers = [[1, 2, 3, 2], [5, 3, 4, 2], [9, 4, 5, 3], [13, 5, 5, 4], [17, 6, 5, 5]];
    const seen = [];
    let wallOk = true, gapOk = true, keyOk = true, oneOk = true, knowOk = true;
    for (const [lvl, pb, cha, stat] of tiers) {
      const who = (id, per, prf) => makeActor(id, { cha }, { prof: pb, skills: { per: { total: per, proficient: 1 }, prf: { total: cha, proficient: prf ? 1 : 0 } } });
      const both = who(`baB${lvl}`, cha + pb, true), one = who(`baO${lvl}`, cha + pb, false), weak = who(`baW${lvl}`, 1 + pb, false);
      const them = (arch) => { const a = makeActor(`ba${arch}${lvl}`, { wis: stat }, { npc: true, prof: pb }); a.flags["tsl-social-conflict"] = { socialFencing: { archetypeId: arch, known: { key: true, wall: true, desire: true } } }; return a; };
      const keyN = them("tyrant"), wallN = them("duelist"), plainN = them("hermit");
      const pct = (a, n, lever) => T.chance(a, n, { technique: "appeal", lever }).p * 100;
      const w = pct(both, wallN), pl = pct(both, plainN), o = pct(one, plainN), oKey = pct(one, keyN), wk = pct(weak, keyN, "desire");
      seen.push(`L${lvl} ${Math.round(w)}/${Math.round(pl)}/${Math.round(o)}/${Math.round(wk)}`);
      if (w > 50) wallOk = false;
      if (pl - w < 30) gapOk = false;
      if (oKey - o < 20) keyOk = false;
      if (o < 50 || o > 70) oneOk = false;
      if (Math.round(wk) < Math.round(pl) - 15) knowOk = false;   // whole points, as the odds are shown
    }
    ok(`balance, levels 1–17 (wall / plain with both skills / plain with one / a weak one with key and lever): ${seen.join(", ")}`, true);
    ok(`…no one rolls above 50% into a wall, however trained`, wallOk);
    ok(`…the nature always decides: wall to plain is at least 30 points, plain to key at least 20 for a one-skill face`, gapOk && keyOk);
    ok(`…a one-skill face stays at 50–70% at every level: the DC keeps up`, oneOk);
    ok(`…knowing the person stays within 15 points of the best-trained face going in blind`, knowOk);
  }

  // ═══ “Are they telling the truth?” ═══════════════════════════════════════════
  {
    const p = pc("trP"), n = npc("trN", "hermit");
    ok(`a Read can always ask if they're telling the truth — it's about this moment, not the person`, T.openQuestions(n).at(-1) === "truth" && !R.READ_ORDER.includes("truth"));
    const options = T.openQuestions(n).length;
    await roll(p, n, { technique: "read" }, [14], [`o${options - 1}`]);
    ok(`…the GM answers straight; nothing goes on record, and it can be asked again`, /Are they telling the truth\?/.test(lastCard()) && /The GM answers straight/.test(lastCard())
      && !SAM.getKnown(n).truth && T.openQuestions(n).includes("truth"));
    await SAM.setActorData(n, { intent: "Sell the map twice" });
    await roll(p, n, { technique: "read" }, [14], [`o${T.openQuestions(n).length - 2}`]);
    ok(`…and so can "what are they after right now?" — their Agenda, if the GM wrote one`, /What are they after right now\?/.test(lastCard()) && /Sell the map twice/.test(lastCard()) && !SAM.getKnown(n).intent && T.openQuestions(n).includes("intent"));
    await SAM.setActorData(n, { intent: "" });
    await roll(p, n, { technique: "read" }, [14], [`o${T.openQuestions(n).length - 2}`]);
    ok(`…with none written, the GM says`, /The GM tells you what they(?:'|&#0?39;)re after/.test(lastCard()));
  }

  // ═══ What the talk did — the GM marks it, no roll ═════════════════════════════
  {
    const TE = R.TSLEmotions;
    const p = pc("prP"), q = pc("prQ"), d = npc("prD", "broker");
    const pct = (x) => `${Math.round(x * 100)}%`;
    const before = T.chance(q, d, { technique: "demand" }).p;
    const marked = await TE.mark(d, "frightened");
    const after = T.chance(q, d, { technique: "demand" }).p;
    ok(`the words landed: the GM marks them Frightened — no roll — and every Pressure ask gets +2, for anyone (Demand ${pct(before)} → ${pct(after)})`,
      marked === "added" && TE.has(d, "frightened") && /The words landed/.test(lastCard()) && /is <b>Frightened<\/b>/.test(lastCard())
      && T.preview(q, d, { technique: "demand" }).parts.some((x) => /Frightened/.test(x.label) && x.value === 2) && after > before);
    const cards = globalThis.__cards.length;
    ok(`marking it again takes it back — quietly: a correction, no card`, (await TE.mark(d, "frightened")) === "removed" && !TE.has(d, "frightened") && globalThis.__cards.length === cards);
    const h = npc("prH", "hermit");
    await TE.mark(h, "guilty", { toward: "prQ" });
    ok(`Guilty is owed to someone: only the one they wronged gets +2 to Heart`, TE.of(h).find((e) => e.id === "guilty")?.toward === "prQ" && /Guilty → /.test(lastCard())
      && T.preview(q, h, { technique: "appeal" }).parts.some((x) => /Guilty/.test(x.label)) && !T.preview(p, h, { technique: "appeal" }).parts.some((x) => /Guilty/.test(x.label)));
    await TE.mark(h, "guilty", { toward: "prP" });
    ok(`…marked toward someone else, it moves — still one Guilty`, TE.of(h).filter((e) => e.id === "guilty").length === 1 && TE.of(h).find((e) => e.id === "guilty")?.toward === "prP");
    ok(`Guilty with nobody to owe it to marks nothing`, (await TE.mark(h, "guilty")) === null);
    game.user.isGM = false; d.isOwner = false;
    const byPlayer = await TE.mark(d, "angry");
    const own = await TE.mark(p, "hopeless");
    game.user.isGM = true; d.isOwner = true;
    ok(`a player can't put an emotion on someone else's character — only the GM can`, byPlayer === null && !TE.has(d, "angry"));
    ok(`…but on their own character they can, both ways`, own === "added" && TE.has(p, "hopeless"));
    await TE.unset(p, "hopeless");
  }

  // ═══ Before witnesses ═══════════════════════════════════════════════════════
  {
    const TE = R.TSLEmotions;
    const p = pc("wP"), d = npc("wD", "duelist"), t = npc("wT", "tyrant");   // Duelist bends +2, Tyrant hardens −2; Reason is plain to both
    const keys = (o) => Object.keys(o).sort().join();
    const pd = T.preview(p, d, { technique: "argument", witnesses: true }), pt = T.preview(p, t, { technique: "argument", witnesses: true });
    ok(`before witnesses the preview never consults the nature: a bending and a hardening one look alike`,
      pd.witnesses && pt.witnesses && keys(pd) === keys(pt) && pd.mod === pt.mod && !("audience" in pd));
    ok(`a Read has no witnesses`, T.preview(p, d, { technique: "read", witnesses: true }).witnesses === false);
    const r1 = await roll(p, d, { technique: "argument", size: "costly", witnesses: true }, [5], ["pay"]);
    ok(`the room tips the roll: 5 + 7 = 12, +2 before witnesses — the Duelist bends, 14 is a hit`, r1.audience === 2 && r1.total === 14 && r1.grade === "success");
    ok(`…a plain yes wins no String (only a strong one does), and the party now knows how they take an audience`,
      SS.countOn("wP", "wD") === 0 && !/Everyone saw/.test(lastCard()) && /they bend/.test(lastCard()) && SAM.getKnown(d).audience);
    pc("wX"); npc("wY", "duelist");
    await SS.add("wX", "wY", 1);
    ok(`…a String with no bond before makes them Strangers — so it shows in Bonds`, BS.find("wX", "wY")?.type === "stranger" && BS.find("wY", "wX")?.type === "stranger");
    const q = pc("wQ");
    const r2 = await roll(q, t, { technique: "argument", size: "costly", witnesses: true }, [8]);
    ok(`the Tyrant hardens (−2): 15 becomes 13 — a no before witnesses: their Frightened, and you lose face (Insecure)`,
      r2.audience === -2 && r2.total === 13 && r2.grade === "failure" && TE.has(q, "frightened") && TE.has(q, "insecure") && /loses face/.test(lastCard()));
    const r3 = await roll(pc("wR"), t, { technique: "argument", size: "costly" }, [8], ["pay"]);
    ok(`the same words in private: no audience, a plain hit — no String`, r3.audience === 0 && r3.grade === "success" && SS.countOn("wR", "wT") === 0);
    const sent = [], emit = game.socket.emit;
    game.socket.emit = (_n, msg) => sent.push(msg);
    const r4 = await roll(pc("wS"), d, { technique: "argument", size: "small", witnesses: true }, [9], ["pay"]);
    game.socket.emit = emit;
    ok(`witnesses add no String of their own; the Scene is told it was public`,
      (r4.grade === "success" || r4.grade === "strong") && SS.countOn("wS", "wD") === 1 && !/Everyone saw/.test(lastCard())
      && sent.some((m) => m.type === "SOCIAL_PULSE" && m.data.witnesses === true));
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
    await roll(pc("mQ"), sch, { technique: "argument", size: "costly" }, [5, 3]);
    ok(`once their key and wall are known, they're named — and the mask falls`, SAM.isRevealed(sch) && /The mask falls: they only played the Caretaker/.test(lastCard()));
  }

  // ═══ A strong Read: two answers, and still no String ═════════════════════════
  {
    const p = pc("sP"), b = npc("sB", "broker");
    const r = await roll(p, b, { technique: "read" }, [17], ["o0", "o0"]);
    ok(`a strong Read on what they want and fear: both shown, neither told — and no String either way (a Read moves none)`,
      r.grade === "strong" && r.questions.join() === "desire,fear" && !SAM.getKnown(b).desire && !SAM.getKnown(b).fear
      && /data-tsl-tell="desire"[\s\S]*data-tsl-tell="fear"/.test(lastCard()) && SS.countOn("sP", "sB") === 0 && SS.countOn("sB", "sP") === 0);
    makeActor("sX"); makeActor("sY");
    await BS.add("sX", "sY", { type: "stranger", attitude: 1 });
    const w = await BS.shift("sX", "sY", "warm");
    ok(`warmth names nothing: a Stranger stays a Stranger until someone says who they are`, w === null && bond("sX", "sY") === "stranger1");
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
    await roll(s1, t1, { technique: "argument", size: "small" }, [2]);
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
    ok(`winning by Pressure costs: they hold a String on you — while you hold one on them (one each way)`, SS.countOn("eD", "eV") === 1 && SS.countOn("eV", "eD") === 1);
    const s4 = pc("eW"), b = npc("eB", "broker");
    await SAM.setKnown(b, { fear: true });
    await roll(s4, b, { technique: "blackmail", size: "costly" }, [16]);
    ok(`Blackmail lands: they're Frightened of you — and they'll pay you back (a String on you)`, TE.has(b, "frightened") && SS.countOn("eB", "eW") === 1);

    const g = npc("eG", "machiavellian"), liar = pc("eL");
    await g.setFlag(SCOPE, "lies", [{ id: "l1", byId: "eL", at: 1 }]);
    await T.exposeLie(g, "l1");
    ok(`a lie brought out leaves them Angry`, TE.has(g, "angry"));
  }

  // ═══ Bonds ══════════════════════════════════════════════════════════════════
  {
    for (const id of ["bA", "bB", "bC", "bD", "bE", "bF", "bG", "bH"]) makeActor(id);
    await BS.add("bA", "bB", { type: "friend", attitude: 2 });
    let s = await BS.shift("bA", "bB", "cool");
    ok(`the story cools a bond's degree (●● → ${s.strength}), on both sides — the type stays`, s.strength === 1 && BS.find("bB", "bA")?.attitude === 1 && bond("bA", "bB") === "friend1");
    s = await BS.shift("bA", "bB", "warm");
    ok(`…and warms it again (${s.strength})`, s.strength === 2 && bond("bA", "bB") === "friend2");
    ok(`moving the degree makes no bond where there was none`, (await BS.shift("bC", "bA", "cool")) === null && !BS.find("bC", "bA"));
    s = await BS.begin("bC", "bE", "friend");
    ok(`where they're nothing to each other, the story may begin it: Friends ●, on both sides`, s.created && bond("bC", "bE") === "friend1" && bond("bE", "bC") === "friend1");
    await BS.add("bE", "bF", { type: "friend", attitude: 1 });
    ok(`…but never renames one: a friendship stays a friendship`, (await BS.begin("bE", "bF", "rival")) === null && bond("bE", "bF") === "friend1");
    await BS.add("bG", "bH", { type: "rival", attitude: 1 });
    s = await BS.begin("bG", "bH", "enemy", 2);
    ok(`…a hostile turn on a hostile bond hardens it (Rival ● → ●●), still a Rival`, s?.strength === 2 && bond("bG", "bH") === "rival2");
    await BS.add("bC", "bD", { type: "mentor", attitude: 1 });
    ok(`a bond is mirrored with its counterpart type`, BS.find("bD", "bC")?.type === "protege");
  }

  // ═══ A bond's powers: ●● ability, ●●● signature (once per long rest), aura ════
  {
    ok(`every type but Stranger has its approach, an ●● ability, a ●●● signature and an aura`,
      R.BOND_TYPES.filter((t) => t.id !== "stranger").every((t) => SAM.bondApproach(t.id) && SAM.getBondAbility(t.id)?.text && SAM.getBondSignature(t.id)?.text && t.aura?.label)
      && !SAM.getBondAbility("stranger") && !SAM.getBondSignature("stranger"));
    ok(`every aura is as it was: ±1 or ±2 a lever, doubled at ●●●, never past ±2`, R.BOND_TYPES.every((t) => !t.aura || Object.entries(t.aura).every(([k, v]) => k === "label" || [1, 2].includes(Math.abs(v))))
      && R.BOND_TYPES.every((t) => !t.aura || Object.values(R.TSLBondAuras.leversOf(t.id, 3)).every((v) => Math.abs(v) <= 2)));
    const A = R.TSLBondAuras;
    ok(`a Lover close by: +1 initiative and +2 AC at ● — +2 each at ●●●`, A.leversOf("lover", 1).ac === 2 && A.leversOf("lover", 1).init === 1 && A.leversOf("lover", 3).ac === 2 && A.leversOf("lover", 3).init === 2 && A.leversOf("stranger", 3) === null);
    const p = pc("spP"), fr = pc("spF");
    await BS.add("spP", "spF", { type: "friend", attitude: 2 });
    const sigOf = () => BS.find("spP", "spF");
    ok(`at ●● the signature waits`, !(await R.TSLGMActions.handle({ action: "invokeSignature", args: { actorId: "spP", bondId: sigOf().id } })) && !sigOf().sigUsed);
    await BS.update("spP", sigOf().id, { type: "sworn", attitude: 3 });
    const fxBefore = p.effects.length;
    await R.TSLGMActions.handle({ action: "invokeSignature", args: { actorId: "spP", bondId: sigOf().id } });
    ok(`at ●●● it's called on: For the oath — advantage and +5 on the next roll, on the sheet; spent until a long rest`,
      sigOf().sigUsed && p.effects.length === fxBefore + 1 && p.effects.at(-1).flags?.[SCOPE]?.bondMoment && /For the oath/.test(lastCard()) && /long rest/.test(lastCard()));
    const cards = globalThis.__cards.length;
    await R.TSLGMActions.handle({ action: "invokeSignature", args: { actorId: "spP", bondId: sigOf().id } });
    ok(`…not twice`, globalThis.__cards.length === cards);
    await BS.clearSignatures("spP");
    ok(`a long rest makes it ready again`, !sigOf().sigUsed);
    // The bond on the token: two tokens 10 ft apart on a ready canvas.
    const was = { ready: canvas.ready, placeables: canvas.tokens.placeables, grid: canvas.grid };
    canvas.ready = true;
    canvas.grid = { measurePath: (pts) => ({ distance: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 20 }) };   // 20 px a foot
    const at = (a, x, hidden = false) => ({ actor: a, center: { x, y: 0 }, document: { hidden } });
    canvas.tokens.placeables = [at(p, 0), at(fr, 200)];
    const wasCombat = game.combat;
    const statusOf = (a) => a.effects.filter((e) => e.flags?.[SCOPE]?.bondStatus);
    const hasAura = (a) => statusOf(a).length > 0;
    game.combat = null;
    p.effects.push({ id: "oldAura", name: "Bonds in reach", statuses: new Set(["tsl-bond-aura"]), flags: { [SCOPE]: { bondAura: true } } });
    await A._refresh();
    const outOfFight = hasAura(p) && hasAura(fr);
    ok(`close by, with no fight on, the bond is there all the same — it works everywhere; the single aura of 3.14 is gone`, outOfFight && !p.effects.some((e) => e.id === "oldAura"));
    game.combat = { started: true, scene: null };
    await A._refresh();
    const [aura] = statusOf(p), [liege] = statusOf(fr);
    ok(`the bond is a status on the token like any other: "${aura?.name}" — its own icon, tinted the way it runs, the aura on the sheet (●●●: ±2): ${aura?.description?.replace(/<[^>]+>/g, "") ?? "none"}`,
      !!aura && aura.name === "Sworn ●●● — spF" && [...aura.statuses].includes("tsl-bond-sworn") && aura.img === "icons/svg/holy-shield.svg"
      && aura.tint === R.APPROACHES.reason.color && aura.changes.length > 0 && /Oathbound/.test(aura.description)
      && aura.showIcon === CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
    ok(`…and the other one carries it from their side: "${liege?.name}"`, !!liege && liege.name === "Liege ●●● — spP" && [...liege.statuses].includes("tsl-bond-liege") && aura.img !== liege.img);
    const fxCount = p.effects.length;
    let writes = 0;
    const upd = p.updateEmbeddedDocuments, crt = p.createEmbeddedDocuments;
    p.updateEmbeddedDocuments = async (...x) => { writes++; return upd(...x); };
    p.createEmbeddedDocuments = async (...x) => { writes++; return crt(...x); };
    await A._refresh();
    p.updateEmbeddedDocuments = upd; p.createEmbeddedDocuments = crt;
    ok(`…and nothing is written again while nobody moves`, writes === 0 && p.effects.length === fxCount && statusOf(p)[0] === aura);
    canvas.tokens.placeables = [at(p, 0), at(fr, 2000)];
    await A._refresh();
    ok(`…and comes off when they're 100 ft apart`, !hasAura(p) && !hasAura(fr));
    canvas.tokens.placeables = [at(p, 0), at(fr, 200)];
    await A._refresh();
    const backOn = hasAura(p);
    canvas.tokens.placeables = [at(fr, 200)];
    await A._refresh();
    ok(`…and off anyone taken off the map — nothing left behind on the sheet`, backOn && !hasAura(p) && !hasAura(fr));
    canvas.tokens.placeables = [at(p, 0), at(fr, 200, true)];
    await A._refresh();
    ok(`…a token the GM hid neither gives nor carries one — its place isn't given away`, !hasAura(p) && !hasAura(fr));
    canvas.tokens.placeables = [at(p, 0), at(fr, 200)];
    game.combat = null;
    await A._refresh();
    ok(`…and when the fight ends, standing together, they keep it`, hasAura(p) && hasAura(fr));
    // Several bonds close by: each its own status; together each lever stops at ±2.
    const fam = pc("spM");
    await BS.add("spP", "spM", { type: "family", attitude: 3 });
    canvas.tokens.placeables = [at(p, 0), at(fr, 200), at(fam, 240)];
    await A._refresh();
    const saves = statusOf(p).map((e) => e.changes.filter((c) => /abilities/.test(c.key) && /"save"/.test(c.value)).map((c) => Number(JSON.parse(c.value).formula)).reduce((s, v) => s + v, 0));
    ok(`two bonds close by: two statuses on the token; the saves they give stop at +2 together (${saves.join(" + ")})`, statusOf(p).length === 2 && saves.reduce((s, v) => s + v, 0) === 2);
    // Between two NPCs: on the sheet, off the token — no NPC's secret ally shows.
    const n1 = npc("spN1"), n2 = npc("spN2");
    await BS.add("spN1", "spN2", { type: "ally", attitude: 1 });
    canvas.tokens.placeables = [at(n1, 1000), at(n2, 1100)];
    await A._refresh();
    const [secret] = statusOf(n1);
    ok(`between two NPCs the aura works on the sheet, but nothing shows on the token`, !!secret && secret.changes.length > 0 && secret.statuses.size === 0
      && secret.showIcon === CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER);
    // v14 draws an effect on the token only with showIcon ALWAYS: an emotion says so; one made before 3.15 gets it on the GM's load.
    const em = pc("spE");
    await R.TSLEmotions.mark(em, "angry", { title: "test" });
    const fresh = em.effects.find((e) => e.flags?.[SCOPE]?.emotion);
    em.effects.push({ id: "oldEmo", name: "Frightened", statuses: new Set(["tsl-emo-frightened"]), showIcon: 1, flags: { [SCOPE]: { emotion: { id: "frightened" } } } });
    await R.tidyStringsAndLeanings();
    ok(`an emotion shows on the token like any status (v14's showIcon), and one put on before 3.15 is shown after the GM's load`,
      fresh?.showIcon === CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS && em.effects.find((e) => e.id === "oldEmo")?.showIcon === CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
    game.combat = wasCombat;
    Object.assign(canvas, { ready: was.ready, grid: was.grid }); canvas.tokens.placeables = was.placeables;
  }

  // ═══ Bonds in reach, on screen: their token wears the bond, the corner lists it ═══
  {
    const N = R.TSLBondNear;
    const me = pc("nrP"), rival = npc("nrR"), pal = npc("nrF"), mentor = npc("nrM");
    await BS.add("nrP", "nrR", { type: "rival", attitude: 2 });
    await BS.add("nrP", "nrF", { type: "friend", attitude: 3 });
    await BS.add("nrP", "nrM", { type: "mentor", attitude: 1 });
    await SS.add("nrP", "nrR", 1);        // a String on the rival
    await SS.add("nrF", "nrP", 1);        // the friend holds one on Lyra
    const was = { ready: canvas.ready, placeables: canvas.tokens.placeables, controlled: canvas.tokens.controlled, grid: canvas.grid, user: game.user };
    canvas.ready = true;
    canvas.grid = { measurePath: (pts) => ({ distance: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 20 }) };   // 20 px a foot
    const tk = (a, x) => ({ id: "t" + a.id, actor: a, center: { x, y: 0 }, x: x - 50, y: -50, w: 100, visible: true, document: { hidden: false, texture: { src: "" } } });
    const tMe = tk(me, 0), tR = tk(rival, 200), tF = tk(pal, 240), tM = tk(mentor, 2000);
    canvas.tokens.placeables = [tMe, tR, tF, tM];
    canvas.tokens.controlled = [tMe];
    const ids = (ps) => ps.map((p) => p.other.actor.id).join(",");
    const gmPairs = N.pairs();
    ok(`the GM, their token selected: the rival (10 ft) and the friend (12 ft) are in reach, nearest first — the mentor 100 ft off is not: ${ids(gmPairs)}`, ids(gmPairs) === "nrR,nrF");
    canvas.tokens.controlled = [];
    ok(`…with nothing selected, the GM's corner stays empty`, N.pairs().length === 0);
    game.user = { id: "pl1", isGM: false, name: "Player" };
    ok(`a player: their own character on the map is enough, selected or not`, ids(N.pairs()) === "nrR,nrF");
    tR.document.hidden = true;
    ok(`…a token the GM hid is never listed for a player`, ids(N.pairs()) === "nrF");
    tR.document.hidden = false; tF.visible = false;
    ok(`…nor one out of their sight`, ids(N.pairs()) === "nrR");
    tF.visible = true;
    const html = N.panelHTML(N.pairs());
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    ok(`the corner panel lists both, with what the aura gives right now, their guard, the Strings and the ●● / ●●● powers: ${text.slice(0, 150)}…`,
      /Bonds in reach/.test(text) && /nrR/.test(text) && /nrF/.test(text) && /They have your back/.test(text) && /\+2 to saving throws/.test(text)
      && /their guard is down for you: DC −3/.test(text) && /Steady me/.test(text) && /— ready/.test(text) && /String on them/.test(text) && /String on you/.test(text));
    ok(`…each with the same icon its token carries, tinted the way the bond runs`, /mask-image:url\('icons\/svg\/sword\.svg'\)/.test(html) && /mask-image:url\('icons\/svg\/tankard\.svg'\)/.test(html) && html.includes(R.APPROACHES.pressure.color));
    const mineNow = N.statusesOf(me);
    ok(`the Chronicle sees what the token carries, worked out the GM's way: ${mineNow.map((w) => w.type.label + " — " + w.partner.name).join(", ")}`,
      mineNow.map((w) => w.partner.id).join(",") === "nrR,nrF" && /tsl-bs-chip/.test(N.chipHTML(mineNow[0])) && /Rival/.test(N.chipHTML(mineNow[0])));
    const folded = N.panelHTML(N.pairs(), { folded: true });
    ok(`…folded: only the header and the count`, /tsl-bn-count">2</.test(folded) && !/tsl-bn-row/.test(folded));
    settingsMap.set(`${SCOPE}.bondAuraRange`, 0);
    const off = N.panelHTML(N.pairs());
    ok(`auras off (reach 0): the bonds still show within 15 ft, with no aura claimed`, N.pairs().length === 2 && !/They have your back/.test(off));
    settingsMap.delete(`${SCOPE}.bondAuraRange`);
    settingsMap.set(`${SCOPE}.bondNearShow`, false);
    ok(`…and each viewer can turn it off`, N.enabled() === false);
    settingsMap.delete(`${SCOPE}.bondNearShow`);
    game.user = was.user;
    Object.assign(canvas, { ready: was.ready, grid: was.grid }); canvas.tokens.placeables = was.placeables; canvas.tokens.controlled = was.controlled;
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
    await SS.add("pH", "pT", 1);
    await SS.pull(h, t, "guard");
    const g = h.effects.filter((e) => e.flags?.[SCOPE]?.stringPull)[1];
    ok(`dnd5e guard: +5 AC as a plain number`, g?.changes.length === 1 && g.changes[0].key === "system.attributes.ac.bonus" && g.changes[0].value === "+5");
    game.system.id = "a5e";
    const reg = {}, on0 = Hooks.on;
    Hooks.on = (n, fn) => { (reg[n] ??= []).push(fn); return 0; };
    SS.registerPullHooks();
    Hooks.on = on0;
    const guards = () => h.effects.filter((e) => e.flags?.[SCOPE]?.stringPull?.mode === "guard").length;
    await Promise.all(reg.createChatMessage.map((fn) => fn({ rolls: [1], speaker: { actor: "pT" } })));
    const afterTheirRoll = guards();
    await Promise.all(reg.updateCombat.map((fn) => fn({ combatant: { actor: t } }, { turn: 1 })));
    const afterTheirTurn = guards();
    await Promise.all(reg.updateCombat.map((fn) => fn({ combatant: { actor: h } }, { turn: 2 })));
    ok(`Guard holds for a round: not their roll, not their turn — it ends when the holder's next turn starts`, afterTheirRoll === 1 && afterTheirTurn === 1 && guards() === 0);
    await SS.pull(h, t, "guard").catch(() => {});
    // One String each way: an old world's three on one person count as one, are cut to one on load, and spending it leaves none.
    const tr = makeActor("trH");
    await tr.setFlag(SCOPE, "stringList", [{ id: "a", targetActorId: "pT" }, { id: "b", targetActorId: "pT" }, { id: "c", targetActorId: "pT" }, { id: "d", targetActorId: "pH" }]);
    const shown = SS.countOn("trH", "pT");
    const cut = await SS.trimToCap(tr);
    const left = (tr.getFlag(SCOPE, "stringList") ?? []).length;
    await tr.setFlag(SCOPE, "stringList", [{ id: "a", targetActorId: "pT" }, { id: "b", targetActorId: "pT" }]);
    await SS.spend("trH", "pT");
    ok(`one String each way: three old ones show as one, are cut to one, and spending it leaves none`, shown === 1 && cut === 2 && left === 2 && SS.countOn("trH", "pT") === 0);
  }

  // ═══ The system rolls its own check — without its dialog ═══════════════════
  {
    const p = pc("sysP"), n = npc("sysN", "broker");
    const calls = [];
    p.rollSkillCheck = async (skill, opts) => { calls.push({ skill, opts }); return { rolls: [{ total: 17, dice: [{ results: [{ result: 10, active: true }] }] }] }; };
    const r = await roll(p, n, { technique: "demand", size: "costly" }, []);
    settingsMap.set("tsl-social-conflict.systemRollDialog", true);
    await roll(p, n, { technique: "appeal", size: "small" }, []);
    settingsMap.set("tsl-social-conflict.systemRollDialog", false);
    ok(`a5e rolls its own skill check (Demand → Intimidation) with the module's bonus — no dialog unless the table turns it on`,
      calls.length === 2 && calls[0].skill === "itm" && calls[0].opts.skipRollDialog === true && calls[1].opts.skipRollDialog === false && r.total === 17 && r.systemRoll);
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
    const lost = await roll(p, n, { technique: "argument", size: "costly" }, [3], ["burn"]);
    game.user.isGM = true;
    game.users.activeGM = gm;
    ok(`with no GM connected a player's roll is refused — nothing rolled, no String spent`, lost === null && SS.countOn("lP", "lN") === 1);
  }

  // ═══ The relay refuses what isn't yours ═════════════════════════════════════
  {
    const p = pc("xP"), q = pc("xQ"), n = npc("xN", "broker");
    const mallory = { id: "uMal", name: "Mallory", isGM: false };
    const users = game.users.get;
    game.users.get = (id) => (id === "uMal" ? mallory : users(id));
    q.testUserPermission = (user) => user?.id !== "uMal";      // Mallory doesn't own xQ
    const before = globalThis.__cards.length;
    await R.TSLGMActions.handle({ action: "talkResolve", args: { srcId: "xQ", npcId: "xN", technique: "demand", job: "ask", size: "costly", grade: "strong", total: 30, dc: 14, dice: [20], natural: 20, rel: "plain", parts: [] } }, "uMal");
    await BS.add("xQ", "xN", { type: "friend", attitude: 1 });
    const qSide = BS.getList("xQ"); qSide[0].attitude = 3;
    await q.setFlag(SCOPE, "bonds", qSide);
    await R.TSLGMActions.handle({ action: "bondMirror", args: { actorId: "xQ", targetActorId: "xN", attitude: 3 } }, "uMal");
    ok(`a player can't act through someone else's character: no card, no bond written on the other side`,
      globalThis.__cards.length === before && BS.getStrength("xN", "xQ") === 1);
    game.users.get = users;
    const gm = game.users.activeGM, sentNoGm = [], emit = game.socket.emit;
    game.users.activeGM = null; game.user.isGM = false;
    game.socket.emit = (_n, m) => sentNoGm.push(m);
    const res = R.TSLGMActions.request("abilityOutcome", { messageId: "m?", choice: "quits", pcId: "xP" });
    game.socket.emit = emit; game.user.isGM = true; game.users.activeGM = gm;
    ok(`with no GM connected an action is refused out loud — nothing sent, nothing spent`, res === false && sentNoGm.length === 0);
  }

  // ═══ The Chronicle refreshes only for what it shows ═════════════════════════
  {
    const p = pc("cP"), n = npc("cN", "hermit"), other = npc("cO", "broker");
    const app = new R.SocialFencingApp(p);
    let renders = 0;
    app.rendered = true; app.render = () => { renders++; };
    app._face("cN"); app._tab = "profile";
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Hooks.callAll("updateActor", p, { system: { attributes: { hp: { value: 3 } } } });
    Hooks.callAll("updateActor", other, { flags: { "tsl-social-conflict": { x: 1 } } });
    await wait(90);
    ok(`a hit point lost, or someone else's chronicle — no re-render`, renders === 0);
    Hooks.callAll("updateActor", n, { flags: { "tsl-social-conflict": { socialFencing: {} } } });
    Hooks.callAll("updateActor", p, { flags: { "tsl-social-conflict": { stringList: [] } } });
    Hooks.callAll("createActiveEffect", { parent: n });
    await wait(90);
    ok(`a roll's three updates (knowledge, Strings, an emotion on them) become one render`, renders === 1);
    const field = { matches: () => true };
    globalThis.document = { activeElement: field };
    app.element = [{ contains: (x) => x === field }];
    Hooks.callAll("updateActor", n, { flags: { "tsl-social-conflict": { notes: "x" } } });
    await wait(90);
    const held = renders === 1 && app._stale === true;
    delete globalThis.document; app.element = null; app._stale = false;
    ok(`while someone types in this window, the refresh waits (a half-written note survives)`, held);
    await app.close();
    app.rendered = true;    // were the hooks really let go?
    Hooks.callAll("updateActor", p, { flags: { "tsl-social-conflict": { a: 1 } } });
    await wait(90);
    ok(`a closed Chronicle stops listening`, renders === 1);
  }

  // ═══ A deleted actor leaves nothing behind ═════════════════════════════════
  {
    const p = pc("dP"), q = pc("dQ"), gone = npc("dGone", "tyrant");
    await BS.add("dP", "dGone", { type: "rival", attitude: 2 });
    await SS.add("dP", "dGone", 2); await SS.add("dQ", "dGone", 1); await SS.add("dQ", "dP", 1);   // one each, at most
    const app = new R.SocialFencingApp(p), other = new R.SocialFencingApp(q);
    app.rendered = true; other.rendered = true; other.render = () => {};
    other._face("dGone");
    delete actorStore.dGone;
    Hooks.callAll("deleteActor", gone);
    const n = await BS.forget("dGone");
    ok(`a deleted NPC takes its bonds and Strings with it (${n} entries: a bond, a Stranger, two Strings) — the rest stay`,
      n === 4 && !BS.find("dP", "dGone") && !BS.find("dQ", "dGone") && SS.countOn("dP", "dGone") === 0 && SS.countOn("dQ", "dGone") === 0 && SS.countOn("dQ", "dP") === 1);
    ok(`…and the Talk that faced them forgets them`, other._tTarget === null);
    await other.close(); await app.close();
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
    // key Heart (Appeal), plain Pressure (Demand), wall Reason (Argument).
    const rate = async ({ who = "face", technique, nature = "caretaker", lever = null, N = 400 }) => {
      let yes = 0;
      for (let i = 0; i < N; i++) {
        const p = who === "face" ? pc("dtP") : plain();
        const n = npc("dtN", nature);
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
    // Persuasion all through: the Caretaker's key is Heart (Appeal), their wall Reason (Argument); to the Duelist, Reason is a normal roll.
    const key = await rate({ technique: "appeal" }), flat = await rate({ technique: "argument", nature: "duelist", N: 1000 }), wall = await rate({ technique: "argument" });
    const plainKeyLever = await rate({ who: "plain", technique: "appeal", lever: "desire" });
    console.log = quiet;
    ok(`the person decides: face +7 — key ${key}%, plain ${flat}%, wall ${wall}%`, key - flat >= 15 && flat - wall >= 15);
    ok(`understanding beats charisma: +2 with the key and a lever ${plainKeyLever}% vs the face on plain ground ${flat}%`, plainKeyLever >= flat - 3);
  }

  // ═══ The UI renders ═════════════════════════════════════════════════════════
  {
    const bad = (h) => /undefined|NaN|\[object Object\]|ERR:/.test(h);
    const chip = (h, dir) => (h.match(new RegExp(`<(?:span|button)[^>]*tsl-hold-chip--${dir}[^>]*>[\\s\\S]*?</(?:span|button)>`)) ?? [""])[0];
    const chipOn = (c) => /aria-pressed="true"/.test(c) || /class="[^"]*\bon"/.test(c);
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
    ok(`the first tab (player): what weighs on them with every switch, the Leanings' dots, then their maneuvers best first — no nature`, !bad(pcProfile) && /Your maneuvers/.test(pcProfile)
      && (pcProfile.match(/class="tsl-mine-row/g) ?? []).length === 8 && (pcProfile.match(/data-lean="/g) ?? []).length === 9 && /Leanings/.test(pcProfile)
      && /What weighs on them/.test(pcProfile) && /data-state-emo=/.test(pcProfile) && !/class="tsl-state /.test(pcProfile) && !/archetypeId/.test(pcProfile)
      && pcProfile.indexOf("What weighs on them") < pcProfile.indexOf("Leanings") && pcProfile.indexOf("Leanings") < pcProfile.indexOf("Your maneuvers"));
    ok(`the Chronicle opens on the first tab`, new R.SocialFencingApp(P)._tab === "profile");
    const npcSeen = await render(N, "profile");
    ok(`an NPC's profile, seen by a player: only what the party learned — no dossier, no nature`, !bad(npcSeen)
      && /Leverage/.test(npcSeen) && !/Being outplayed/.test(npcSeen) && !/Never kneel/.test(npcSeen) && !/Schemer/.test(npcSeen) && !/Keep the gate shut/.test(npcSeen));
    const solo = makeActor("uiSolo", { cha: 2 }, { skills: { per: { total: 5 } } });
    solo.hasPlayerOwner = false;
    canvas.tokens.placeables.push(tok(solo));
    const soloTalk = await render(solo, "talk", { _tTarget: "uiN", _tTech: "appeal" });
    ok(`a character nobody owns (the GM testing alone) still gets the roll, not the cheat sheet`, !bad(soloTalk)
      && /data-t-roll/.test(soloTalk) && !/Playing them/.test(soloTalk) && T.isNpc(N) && !T.isNpc(solo));
    const talk = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tSize: "costly" });
    const techs = (talk.match(/data-tech="/g) ?? []).length;
    ok(`Talk (player): the person; plainly or all in (${techs} maneuvers of that approach), with what each looks like; sizes with their DCs, the lever, the String, the roll line`, !bad(talk)
      && techs === 2 && /data-tech="appeal"/.test(talk) && /data-tech="seduce"/.test(talk) && /ask from the heart/.test(talk) && /What are you asking for\?/.test(talk) && /data-size="against"/.test(talk) && /DC 10/.test(talk)
      && /Their Desire/.test(talk) && /You have something on them/.test(talk) && /data-remind/.test(talk) && /vs DC 14/.test(talk) && /Roll — Appeal/.test(talk) && /Nature unread/.test(talk) && !/Schemer/.test(talk));
    ok(`Talk shows the Strings between you right under their name — ticked when you have one on them, a dash for theirs on you — and each is a switch`,
      /tsl-x-id">[\s\S]*tsl-hold-chip--mine/.test(talk) && chipOn(chip(talk, "mine")) && /fa-check/.test(chip(talk, "mine")) && /String on them/.test(chip(talk, "mine"))
      && !chipOn(chip(talk, "theirs")) && /fa-minus/.test(chip(talk, "theirs")) && /String on you/.test(chip(talk, "theirs"))
      && /data-hold-toggle data-holder="uiP" data-target="uiN" data-on="0"/.test(talk) && /data-holder="uiN" data-target="uiP" data-on="1"/.test(talk));
    const bare = await render(Q, "talk", { _tTarget: "uiN" });
    ok(`…and with none, it says so: a dash, "String on them", not a blank`, !bad(bare) && !chipOn(chip(bare, "mine")) && /fa-minus/.test(chip(bare, "mine")) && /String on them/.test(chip(bare, "mine")));
    ok(`no target list — the map, or your target`, !/<select class="tsl-t-target"/.test(talk) && /data-t-pick/.test(talk) && /Someone else/.test(talk));
    ok(`an ask offers who's watching — in private or before witnesses`, /data-wit="0"/.test(talk) && /data-wit="1"/.test(talk));
    const pub = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tWitnesses: true });
    ok(`…before witnesses is marked, and the math is unchanged (the room shows in the result)`, !bad(pub) && /tsl-wit-btn on" data-wit="1"/.test(pub)
      && (pub.match(/tsl-math-part/g) ?? []).length === (talk.match(/tsl-math-part/g) ?? []).length);
    const read = await render(P, "talk", { _tTarget: "uiN", _tTech: "read" });
    ok(`Talk → I read them: no sizes, no witnesses, no approach, Insight, "read"`, !bad(read) && !/data-size=/.test(read) && !/data-wit=/.test(read) && !/data-t-ap=/.test(read)
      && /tsl-mode-btn on" data-t-mode="read"/.test(read) && /Roll — Read them/.test(read) && /\+4 Insight/.test(read));
    ok(`Talk is the roll, not the conversation: talk in character; when the GM calls for it — the four social checks, by name: I persuade, I intimidate, I lie, I read them; odds only on the roll`,
      /Talk in character/.test(talk) && /tsl-mode-btn on" data-t-mode="ask"/.test(talk) && /data-t-mode="press"/.test(talk) && /data-t-mode="lie"/.test(talk) && /data-t-mode="read"/.test(talk)
      && /I persuade/.test(talk) && /I intimidate/.test(talk) && /I lie/.test(talk) && /I read them/.test(talk)
      && /<em>Persuasion<\/em>/.test(talk) && /<em>Intimidation<\/em>/.test(talk) && /<em>Deception<\/em>/.test(talk) && /<em>Insight<\/em>/.test(talk)
      && (talk.match(/data-t-mode="/g) ?? []).length === 4 && (talk.match(/data-t-ap="/g) ?? []).length === 2 && !/data-t-ap="pressure"/.test(talk) && / on" data-t-ap="heart"/.test(talk) && /how they take it — not known yet/.test(talk)
      && /How did your words come at them\?/.test(talk) && /Plainly — or all in\?/.test(talk) && /<b>Persuasion<\/b> \+ Performance/.test(talk)
      && /If it works:/.test(talk) && /If not:/.test(talk) && !/<em>\d+%<\/em>/.test(talk) && /tsl-roll-odds">\d+%/.test(talk)
      && !/tsl-t-skill/.test(talk) && !/data-tech="frighten"|tsl-step/.test(talk) && /What the party knows/.test(talk) && /Not known yet:/.test(talk));
    const dealing = await render(P, "talk", { _tTarget: "uiN", _tTech: "bargain" });
    ok(`Reason's all-in is the Deal, its plain ask an Argument — under "I persuade"`, !bad(dealing) && /tsl-mode-btn on" data-t-mode="ask"/.test(dealing) && / on" data-t-ap="reason"/.test(dealing)
      && /data-tech="argument"/.test(dealing) && /data-tech="bargain"/.test(dealing) && /here(?:'|&#0?39;)s why/.test(dealing) && /Plainly — or all in\?/.test(dealing));
    const willLie = await render(P, "talk", { _tTarget: "uiN", _tMode: "lie" });
    ok(`"I lie" is its own button: first how you tell it — the three ways, in the lie's own words, with how they're known to take each`, !bad(willLie) && /tsl-mode-btn on" data-t-mode="lie"/.test(willLie)
      && /How do you tell the lie\?/.test(willLie) && (willLie.match(/data-t-ap="/g) ?? []).length === 3 && /a threat you can(?:'|&#0?39;)t back up/.test(willLie) && /feelings you don(?:'|&#0?39;)t have/.test(willLie) && /proof that isn(?:'|&#0?39;)t/.test(willLie)
      && /how they take it — not known yet/.test(willLie) && !/threats, a challenge, shame/.test(willLie) && !/data-t-roll/.test(willLie));
    const pressing = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`"I intimidate" is its own button: one way to come at them, so nothing to pick — plainly or all in, in its own words, Intimidation on the roll`, !bad(pressing) && /tsl-mode-btn on" data-t-mode="press"/.test(pressing)
      && !/data-t-ap="/.test(pressing) && /threats, a challenge, shame/.test(pressing) && /how they take it — not known yet/.test(pressing) && !/How did your words come at them/.test(pressing)
      && /data-tech="demand"/.test(pressing) && /data-tech="blackmail"/.test(pressing) && /What do you demand\?/.test(pressing) && /Something small/.test(pressing) && !/What are you asking for/.test(pressing)
      && /<b>Intimidation<\/b> \+ Athletics/.test(pressing) && /Roll — Demand/.test(pressing));
    const bm = await render(P, "talk", { _tTarget: "uiN", _tTech: "blackmail" });
    ok(`…Blackmail is its all-in, under the same button`, !bad(bm) && /tsl-mode-btn on" data-t-mode="press"/.test(bm) && /Roll — Blackmail/.test(bm));
    const modeOf = (extra) => Object.assign(new R.SocialFencingApp(P), extra)._modeNow();
    ok(`the maneuver says which button it's under: Appeal, Argument, Seduce, Deal — I persuade; Demand, Blackmail — I intimidate; Deceive — I lie; Read — I read them`,
      ["appeal", "argument", "seduce", "bargain"].every((t) => modeOf({ _tTech: t }) === "ask") && ["demand", "blackmail"].every((t) => modeOf({ _tTech: t }) === "press")
      && modeOf({ _tTech: "deceive" }) === "lie" && modeOf({ _tTech: "read" }) === "read" && modeOf({ _tTech: null, _tMode: "lie" }) === "lie" && modeOf({ _tTech: null, _tMode: null }) === null);
    const lying = await render(P, "talk", { _tTarget: "uiN", _tTech: "deceive", _tApproach: "pressure" });
    ok(`…then its own form: how big the lie is, not "what are you asking for" — and what it risks`, !bad(lying) && / on" data-t-ap="pressure"/.test(lying) && !/data-tech="/.test(lying)
      && /How big is the lie\?/.test(lying) && /A small lie/.test(lying) && /A bold lie/.test(lying) && !/What are you asking for/.test(lying) && /Roll — Deceive/.test(lying) && /<b>Deception<\/b>|\+\d+ Deception/.test(lying) && /If not:/.test(lying));
    ok(`…a Deal says plainly what it is before the roll: your word, a String until you deliver — and the stake of Strings`, /Roll — Deal/.test(dealing) && /you give your word/.test(dealing) && /until you deliver/.test(dealing) && dealing.includes("a strong win (5 over, or a 20)"));
    const asking = await render(P, "talk", { _tTarget: "uiN", _tMode: "ask" });
    ok(`…"I ask" first asks how your words came at them — through the heart, or reason; nothing to roll until that's said`, !bad(asking) && /data-t-ap="heart"/.test(asking) && /data-t-ap="reason"/.test(asking) && (asking.match(/data-t-ap="/g) ?? []).length === 2 && !/data-tech=/.test(asking) && !/data-t-roll/.test(asking));
    await SAM.setActorData(N, { maskId: "caretaker" });
    const masked = await render(P, "talk", { _tTarget: "uiN" });
    ok(`facing them with no roll called: only what you know, and the four things you might do — nothing to click through`, !bad(masked)
      && (masked.match(/data-t-mode="/g) ?? []).length === 4 && !/data-t-ap=/.test(masked) && !/data-tech=/.test(masked) && !/data-t-roll/.test(masked));
    ok(`a player sees the face they show — “seems: Caretaker” — and how they seem, not who they are`, !bad(masked)
      && /seems: Caretaker/.test(masked) && /How they seem/.test(masked) && !/Schemer/.test(masked) && /data-tooltip="[^"]*Is that their true face/.test(masked));
    const none = await render(P, "talk", {});
    ok(`Talk with nobody targeted asks whom you're talking to — and offers the map`, !bad(none) && /Who are you talking to/.test(none) && /Pick on the map/.test(none));
    game.user.targets = new Set([tok(N)]);
    const aimed = await render(P, "talk", {});
    game.user.targets = new Set();
    ok(`target their token (T) and Talk faces them`, !bad(aimed) && /Captain/.test(aimed) && /data-t-mode="ask"/.test(aimed));
    const result = await render(P, "talk", { _tTarget: "uiN", _tResult: { technique: "appeal", grade: "success", total: 17, dc: 14, rel: "key", paid: true } });
    await R.TSLEmotions.add(P, "frightened", { by: "uiN" });
    await R.TSLEmotions.add(N, "insecure", { by: "uiP" });
    const felt = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`Talk shows what weighs on you (with ×) and what they feel — and it counts in the roll`, !bad(felt)
      && /class="tsl-state /.test(felt) && /data-emo-clear="uiP"/.test(felt) && /Feeling/.test(felt) && /Insecure/.test(felt) && /you(?:'|&#39;)re Frightened/.test(felt));
    ok(`the result shows where you rolled`, !bad(result) && /Appeal: They do it — for a price/.test(result) && /you paid their price/.test(result));
    const bonds = await render(P, "bonds", { _expandedBonds: new Set([BS.find("uiP", "uiN").id]) });
    ok(`bonds: type, strength, the String — Invest and Pull (no Hurt any more)`, !bad(bonds) && /tsl-str-track/.test(bonds) && /Pull \+5/.test(bonds) && /data-invest="uiN"/.test(bonds) && !/data-hurt=/.test(bonds) && /Rival/.test(bonds));
    const shut = await render(P, "bonds");
    ok(`…all at once, nothing opened: the type (a player sees it, can't change it), the dots, and the Strings both ways — each a switch for the player`, !bad(shut)
      && /tsl-bond-type-tag/.test(shut) && !/<select class="tsl-bond-type"/.test(shut) && /tsl-str-track/.test(shut)
      && chipOn(chip(shut, "mine")) && !!chip(shut, "theirs") && /data-hold-toggle data-holder="uiP" data-target="uiN"/.test(shut) && /data-holder="uiN" data-target="uiP"/.test(shut));
    ok(`…a bond with anyone: a name (all but yourself and who you're bonded with), the map, or an actor dragged in`, /class="tsl-bond-find"/.test(shut) && /<datalist/.test(shut)
      && /<option value="Mira">/.test(shut) && !/<option value="Captain">/.test(shut) && !/<option value="Lyra">/.test(shut) && /drag an actor in/.test(shut));
    const everyTab = await Promise.all(["bonds", "talk", "codex"].map((t) => render(P, t, { _tTarget: "uiN" })));
    const firstTab = await render(P, "profile");
    ok(`what weighs on them: on the first tab in full, a strip at the top of every other — the emotion, what it costs, × to let it go, and Change for its player`,
      everyTab.every((h) => !bad(h) && /class="tsl-state "/.test(h) && /Frightened/.test(h) && /−2 Pressure/.test(h) && /data-emo-clear="uiP"/.test(h) && /data-state-open/.test(h))
      && /Frightened/.test(firstTab) && /−2 Pressure/.test(firstTab) && /data-emo-clear="uiP"/.test(firstTab));
    const mineOpen = await render(P, "profile", { _stateOpen: true });
    ok(`…Change opens every emotion and scar as a switch, for the player on their own character`, !bad(mineOpen) && (mineOpen.match(/data-state-emo="/g) ?? []).length === 5 && (mineOpen.match(/data-state-scar="/g) ?? []).length === 5);
    P.isOwner = false;
    const notMine = await render(P, "profile", { _stateOpen: true });
    P.isOwner = true;
    ok(`…and nobody else's: no Change, no switches, no ×`, !bad(notMine) && !/data-state-open/.test(notMine) && !/data-state-emo/.test(notMine) && !/data-emo-clear/.test(notMine));
    const calm = await render(Q, "profile");
    ok(`…and when nothing does, it says so`, !bad(calm) && /tsl-state-none/.test(calm));
    const locked = await render(Q, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`Blackmail with nothing on them is locked — and says why, and how to get it`, !bad(locked)
      && /locked" data-tech="blackmail"/.test(locked) && /nothing to blackmail them with yet/.test(locked) && /data-tooltip="[^"]*needs something on them[^"]*Read[^"]*String/.test(locked));
    let codexOk = true, words = 0;
    for (const c of ["start", "roll", "people", "emo", "strings", "bonds", "gm"]) {
      const h = await render(P, "codex", { _codexCat: c });
      if (bad(h) || !/tsl-cx-lead/.test(h)) codexOk = false;
      if (c === "gm" && /Where to do what/.test(h)) codexOk = false;
      if (c === "roll" && !(/I persuade/.test(h) && /What they say/.test(h) && /tsl-cx-res/.test(h))) codexOk = false;
      if (c === "start" && !(/Roll when the GM says/.test(h) && /One roll/.test(h) && /Words you(?:'|&#39;)ll see/.test(h))) codexOk = false;
      if (c === "strings" && !/5 over the DC, or a 20/.test(h)) codexOk = false;
      words += h.replace(/<[^>]+>/g, " ").split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
    }
    ok(`Codex: every page renders for a player (no GM page) — ${words} words`, codexOk);
    game.user.isGM = true;
    // ── The GM's own hand: everything on a character, at once, no roll ──
    {
      const gmStrip = await render(N, "bonds");
      const open = await render(N, "bonds", { _stateOpen: true });
      const npcFirst = await render(N, "profile");
      ok(`the GM sees Change on the strip; it opens every emotion as a switch (scars only on characters) — and on the NPC's first tab they're all there already`, !bad(gmStrip) && /data-state-open/.test(gmStrip) && !/data-state-emo/.test(gmStrip)
        && !bad(open) && (open.match(/data-state-emo="/g) ?? []).length === 5 && !/data-state-scar/.test(open)
        && !bad(npcFirst) && (npcFirst.match(/data-state-emo="/g) ?? []).length === 5 && npcFirst.indexOf("What weighs on them") < npcFirst.indexOf("Nature"));
      const pcOpen = await render(Q, "profile", { _stateOpen: true });
      ok(`…on a character, the five scars too — and Guilty asks toward whom`, !bad(pcOpen) && (pcOpen.match(/data-state-scar="/g) ?? []).length === 5 && /class="tsl-state-toward"/.test(pcOpen));
      const app = new R.SocialFencingApp(N);
      await app._toggleState("emo", "angry");
      const on = R.TSLEmotions.has(N, "angry");
      await app._toggleState("emo", "angry");
      ok(`one click puts Angry on them, a second takes it off — no roll, never a scar`, on && !R.TSLEmotions.has(N, "angry") && !R.TSLEmotions.scars(N).length);
      await app._toggleState("emo", "guilty", "uiQ");
      const g = R.TSLEmotions.of(N).find((e) => e.id === "guilty");
      ok(`…Guilty is owed to someone: toward whom the GM picked`, g?.toward === "uiQ");
      await R.TSLEmotions.unset(N, "guilty");
      const qApp = new R.SocialFencingApp(Q);
      await qApp._toggleState("scar", "flinch");
      const scarred = R.TSLEmotions.scars(Q).includes("flinch");
      const scarView = await render(Q, "talk", { _tTarget: "uiN" });
      await qApp._toggleState("scar", "flinch");
      ok(`a scar by hand — shown at once, with × for the GM — and taken off again`, scarred && /data-scar-clear="flinch"/.test(scarView) && !R.TSLEmotions.scars(Q).includes("flinch"));
      const rowGM = await render(P, "bonds");
      ok(`the GM changes the type right in the row, and puts a String on or off either way`, !bad(rowGM) && /<select class="tsl-bond-type"/.test(rowGM)
        && /data-hold-toggle data-holder="uiP" data-target="uiN"/.test(rowGM) && /data-hold-toggle data-holder="uiN" data-target="uiP"/.test(rowGM));
      const before = SS.countOn("uiN", "uiP");
      if (before) await SS.spend("uiN", "uiP");
      await SS.add("uiN", "uiP", 1);
      const theirs = await render(P, "bonds");
      ok(`…theirs on you shows as soon as it's there — the warning, not a dash`, chipOn(chip(theirs, "theirs")) && /fa-triangle-exclamation/.test(chip(theirs, "theirs")) && /String on you/.test(chip(theirs, "theirs")));
      await SS.spend("uiN", "uiP");
      const W = pc("uiW"); W.name = "Wren";
      const pApp = new R.SocialFencingApp(P);
      pApp.render = () => {};
      await pApp._bondWith(W);
      ok(`a bond with anyone, not only who's on the map — and it opens`, !!BS.find("uiP", "uiW") && pApp._expandedBonds.has(BS.find("uiP", "uiW").id) && !pApp._bondCandidates().some((a) => a.id === "uiW"));
      await BS.remove("uiP", BS.find("uiP", "uiW").id);
      if (!SS.countOn("uiP", "uiN")) await SS.add("uiP", "uiN", 1);
      const first = await render(P, "profile");
      ok(`the first tab: the Strings at hand — who here you have something on, and what to do with it now`, !bad(first) && /Strings — here/.test(first)
        && /data-remind-on="uiN"/.test(first) && /data-pull-on="uiN" data-mode="strike"/.test(first) && /data-pull-on="uiN" data-mode="guard"/.test(first) && /data-invest="uiN"/.test(first)
        && first.indexOf("Strings — here") < first.indexOf("Leanings"));
      const bondsShut = await render(P, "bonds");
      ok(`every bond shows what it gives without opening it: per ●, the aura, ●●, ●●●`, !bad(bondsShut) && /tsl-bp-gives/.test(bondsShut) && /tsl-bp-box/.test(bondsShut) && /Caption &amp; notes|Caption & notes/.test(bondsShut));
      const readNo = await render(P, "talk", { _tTarget: "uiN", _tTech: "read" });
      const readYes = await render(P, "talk", { _tTarget: "uiN", _tTech: "read", _tQuestions: ["fear"] });
      ok(`the Read: what you look for is picked before the roll — no pick, no roll`, !bad(readNo) && /data-read-q="fear"/.test(readNo) && /data-t-roll disabled/.test(readNo)
        && /tsl-rq on tsl-rq--deep" data-read-q="fear"/.test(readYes) && !/data-t-roll disabled/.test(readYes)
        && /tsl-rq  ?" data-read-q="key"/.test(readNo) && /the GM lets show/.test(readNo));
    }
    {
      const rp = pc("rqP"), rn = npc("rqN", "tyrant");
      canvas.tokens.placeables.push({ actor: rp, visible: true, document: { hidden: false } }, { actor: rn, visible: true, document: { hidden: false } });
      const before = globalThis.__dialogCount;
      await roll(rp, rn, { technique: "read", questions: ["fear", "key"] }, [20]);
      ok(`…and on a strong hit both are taken up — the key told straight, the Fear shown for the GM to play; no question asked after the roll`,
        globalThis.__dialogCount === before && !SAM.getKnown(rn).fear && SAM.getKnown(rn).key && /data-tsl-tell="fear"/.test(lastCard()));
      // Naming the nature opens its card — but what they want and fear still has to come out in play.
      await SAM.setRevealed(rn, true);
      ok(`a named nature opens its card (key, wall, price…) — not what they themselves want and fear`,
        SAM.getKnown(rn).wall && SAM.getKnown(rn).price && !SAM.getKnown(rn).fear && !SAM.getKnown(rn).desire && T.openQuestions(rn).includes("fear"));
      // The String is a switch, either way; a player's on an NPC's side goes through the GM.
      const had = SS.countOn("uiP", "uiN");
      if (had) await SS.spend("uiP", "uiN");
      const on1 = await SS.set("uiP", "uiN", true), now1 = SS.countOn("uiP", "uiN");
      const again = await SS.set("uiP", "uiN", true);
      const off1 = await SS.set("uiP", "uiN", false);
      ok(`a String by hand: on — once (one at a time) — and off; a line in the chat each time`, on1 && now1 === 1 && !again && off1 && SS.countOn("uiP", "uiN") === 0 && /no longer has anything on/.test(lastCard()));
      if (had) await SS.add("uiP", "uiN", 1);
      game.user.isGM = false; N.isOwner = false;
      const asked = [], emit = game.socket.emit;
      game.socket.emit = (_n, m) => asked.push(m?.data);
      await SS.set("uiN", "uiP", true);
      game.socket.emit = emit; game.user.isGM = true; N.isOwner = true;
      ok(`…a player marking the NPC's String on them: the GM writes it`, asked.some((d) => d?.action === "stringSet" && d.args?.holderId === "uiN" && d.args?.pcId === "uiP"));
      const mal = { id: "uMal2", name: "Mallory", isGM: false }, getU = game.users.get;
      game.users.get = (id) => (id === "uMal2" ? mal : getU(id));
      const Z = pc("uiZ"); Z.testUserPermission = (u) => u?.id === "uMal2";
      const beforeQ = SS.countOn("uiN", "uiQ");
      await R.TSLGMActions.handle({ action: "stringSet", args: { holderId: "uiN", targetId: "uiQ", on: !beforeQ, pcId: "uiZ" } }, "uMal2");
      await R.TSLGMActions.handle({ action: "stringSet", args: { holderId: "uiN", targetId: "uiZ", on: true, pcId: "uiZ" } }, "uMal2");
      game.users.get = getU;
      ok(`…the relay writes only about the player's own character`, SS.countOn("uiN", "uiQ") === beforeQ && SS.countOn("uiN", "uiZ") === 1);
      // Our menu holds the social statuses only — D&D's conditions stay with the system (the token HUD).
      const savedFx = CONFIG.statusEffects;
      CONFIG.statusEffects = [...savedFx, { id: "prone", name: "Prone", img: "icons/svg/falling.svg" }, { id: "blinded", name: "Blinded", img: "icons/svg/blind.svg" }];
      Q.effects.push({ id: "fxProne", name: "Prone", statuses: new Set(["prone"]), flags: {} });
      const proneView = await render(Q, "talk", { _tTarget: "uiN", _stateOpen: true });
      const firstTab = await render(Q, "profile");
      ok(`our menu holds only the social statuses — emotions and scars; D&D's conditions (Prone, Blinded…) are the system's, not listed even while one is on`,
        !bad(proneView) && !/Prone|Blinded/.test(proneView) && !/Prone|Blinded/.test(firstTab) && /data-state-emo="angry"/.test(firstTab) && /data-state-scar=/.test(firstTab));
      Q.effects.splice(Q.effects.findIndex((e) => e.id === "fxProne"), 1);
      CONFIG.statusEffects = savedFx;
    }
    const gmTalk = await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" });
    ok(`the GM sees the truth (the nature tagged hidden) — and the mask they wear`, !bad(gmTalk) && /Schemer/.test(gmTalk) && /hidden/.test(gmTalk) && /tsl-x-mask/.test(gmTalk) && /Caretaker/.test(gmTalk));
    const gmProfile2 = await render(N, "profile");
    ok(`the GM sets the mask in Profile → Nature`, !bad(gmProfile2) && /name="maskId"/.test(gmProfile2) && /value="caretaker" selected/.test(gmProfile2) && /a mask over who they really are/.test(gmProfile2));
    const sheet = await render(N, "talk");
    ok(`an NPC's own Talk tab is the GM's live screen — how they take each approach, the mask to act out, the lies they believe`, !bad(sheet) && /Playing them/.test(sheet) && /Yes, but/.test(sheet)
      && /leaves the speaker <b>Insecure<\/b>/.test(sheet) && (sheet.match(/class="tsl-take tsl-take--/g) ?? []).length === 3 && /tsl-take--key/.test(sheet) && /tsl-take--wall/.test(sheet)
      && /Your own weakness/.test(sheet) && /act out its face/.test(sheet) && /Help with a hook/.test(sheet) && /data-lie-out="lie1"/.test(sheet) && /Lyra lied to them/.test(sheet));
    ok(`…and what the talk did, marked there with no roll: what came out, the emotions the words left (Guilty — toward each character here)`, /From the talk/.test(sheet)
      && /data-known="desire"/.test(sheet) && /data-gm-feel="frightened"/.test(sheet) && /tsl-feel on" data-gm-feel="insecure"/.test(sheet) && /data-gm-feel="guilty" data-toward="uiP"/.test(sheet));
    ok(`…and it offers to ask them as each character on the scene`, /data-t-as="uiP"/.test(sheet) && /data-t-as="uiQ"/.test(sheet) && !/data-t-as="uiN"/.test(sheet));
    ok(`…their Agenda and their Line are there too: what they're after, and where it stops`, /Agenda/.test(sheet) && /Keep the gate shut/.test(sheet) && /Their Line/.test(sheet) && /Never kneel/.test(sheet));
    ok(`…and the GM can mark what their words left on each character here — Guilt toward them`, /Their words landed on:/.test(sheet) && /data-gm-feel="angry" data-on="uiP"/.test(sheet) && /data-gm-feel="guilty" data-on="uiQ" data-toward="uiN"/.test(sheet));
    const marked = await R.TSLEmotions.mark(Q, "insecure");
    ok(`…a mark lands on the character: a card says what it costs them, and Talk shows it`, marked === "added" && R.TSLEmotions.has(Q, "insecure") && /The words landed/.test(lastCard()) && /Insecure/.test(lastCard()) && /second-guess/.test(lastCard()));
    await R.TSLEmotions.mark(Q, "insecure");
    ok(`…and a click takes it back — no scar for a correction`, !R.TSLEmotions.has(Q, "insecure") && R.TSLEmotions.scars(Q).length === 0);
    await R.TSLEmotions.mark(Q, "guilty", { toward: "uiN" });
    ok(`…Guilty is toward the NPC: −2 against them, no one else`, R.TSLEmotions.of(Q).find((e) => e.id === "guilty")?.toward === "uiN");
    await R.TSLEmotions.mark(Q, "guilty", { toward: "uiN" });
    await N.setFlag("tsl-social-conflict", "deals", [{ id: "d1", byId: "uiP", price: true, at: 0 }, { id: "d2", byId: "uiQ", price: false, at: 0 }]);
    const sheetWord = await render(N, "talk");
    ok(`the word given shows on the GM's screen — their price, or their own terms — with Kept and Broken`, !bad(sheetWord) && /Word given/.test(sheetWord) && /data-deal-kept="d1"/.test(sheetWord) && /data-deal-broken="d2"/.test(sheetWord)
      && /gave their word: /.test(sheetWord) && /on their own terms/.test(sheetWord));
    game.user.isGM = false;
    const owes = await render(P, "talk", { _tTarget: "uiN" });
    game.user.isGM = true;
    ok(`…and the one who gave it sees what they owe — only their own`, !bad(owes) && /You gave them your word: /.test(owes) && !/on your terms\./.test(owes) && !/data-deal-kept/.test(owes));
    game.user.isGM = false;
    const friend = await render(Q, "talk", { _tTarget: "uiN" });
    game.user.isGM = true;
    ok(`a lie shows only to the one who told it — with no way to bring it out`, /They believe your lie/.test(owes) && !/data-lie-out/.test(owes) && !bad(friend) && !/They believe your lie/.test(friend));
    const opened = R.SocialFencingDialog.open(P, { tab: "talk", target: "uiN" });
    ok(`one click opens that character's Talk, already facing the NPC`, opened?._tab === "talk" && opened?._tTarget === "uiN");
    R.SocialFencingDialog._instances.clear();
    const viz = new R.TSLSceneVisualizer({ mode: "scene" });
    let vh = "";
    try { vh = viz._renderHTML(); } catch (err) { vh = "ERR:" + err.stack; }
    ok(`the Scene renders the cast, their bonds, what they feel — and the face they show`, !bad(vh) && /tsl-viz-node/.test(vh) && /Rival/.test(vh) && /tsl-viz-emos/.test(vh) && /seems: Caretaker/.test(vh));
    ok(`…and who holds Strings on whom, as gold arrows (the GM sees every one)`, /tsl-viz-hold-chip/.test(vh) && /class="tsl-viz-hold"/.test(vh) && vh.includes(`${P.name} holds a String on ${N.name}`));
    N.isOwner = false; Q.isOwner = false; game.user.isGM = false;
    await SS.add("uiN", "uiP", 1);
    await SS.add("uiN", "uiQ", 1);
    const vp = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML();
    game.user.isGM = true; N.isOwner = true; Q.isOwner = true;
    ok(`…a player sees the Strings that touch their own characters — theirs and those held on them — not other people's`,
      vp.includes(`${P.name} holds a String on ${N.name}`) && vp.includes(`${N.name} holds a String on ${P.name}`) && !vp.includes(`${N.name} holds a String on ${Q.name}`));
    await SS.spend("uiN", "uiQ");

    // ═══ The relationship map: a board ═══
    {
      const sceneFlags = {};
      canvas.scene.getFlag = (_s, k) => sceneFlags[k];
      canvas.scene.setFlag = async (_s, k, v) => { sceneFlags[k] = JSON.parse(JSON.stringify(v)); };
      const named = (h, a) => h.includes(`class="tsl-viz-name">${a.name}<`);
      const spot = (h, id) => (h.match(new RegExp(`data-node="${id}"[^>]*style="left:([-\\d.]+)px;top:([-\\d.]+)px`)) ?? []).slice(1).join(",");
      const a1 = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML(), a2 = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML();
      ok(`the board shows everyone's name, and lays out the unplaced the same way on every client`, named(a1, P) && named(a1, N) && named(a1, Q) && spot(a1, "uiN") && spot(a1, "uiN") === spot(a2, "uiN"));
      await R.TSLSceneVisualizer.applyBoardPatch({ mode: "scene", pos: [{ id: "uiN", x: 321, y: -40 }] });
      const placed = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML();
      ok(`…where the GM puts someone, they stay — for everyone`, spot(placed, "uiN") === "321.0,-40.0" && sceneFlags.board?.pos?.length === 1);
      await R.TSLSceneVisualizer.applyBoardPatch({ mode: "scene", note: { id: "n1", x: 10, y: 20, text: "The abbey" } });
      const v = new R.TSLSceneVisualizer({ mode: "scene" });
      const withNote = v._renderHTML();
      ok(`…a caption pinned to the board shows there`, /class="tsl-viz-note[^"]*" data-note="n1"/.test(withNote) && /The abbey/.test(withNote));
      await R.TSLSceneVisualizer.applyBoardPatch({ mode: "scene", note: { id: "n1", text: "" } });
      ok(`…and an emptied caption comes off`, !sceneFlags.board.notes.length);
      await SAM.setActorData(N, { title: "head of the guild" });
      v._sel = { kind: "node", id: "uiN" };
      const nodePanel = v._renderHTML();
      ok(`a click on someone shows who they are and what ties them — the Chronicle opens only from its button`, /tsl-viz-panel/.test(nodePanel) && /data-open-chron="uiN"/.test(nodePanel)
        && /head of the guild/.test(nodePanel) && /tsl-viz-caption/.test(nodePanel) && /class="tsl-viz-node[^"]* sel"/.test(nodePanel));
      v._sel = { kind: "edge", id: ["uiN", "uiP"].sort().join("|") };
      const edgePanel = v._renderHTML();
      ok(`…a click on a line shows the pair, their bond, the Strings between them — and lets you caption it`, /tsl-viz-panel/.test(edgePanel) && /data-edit-label=/.test(edgePanel)
        && /Rival/.test(edgePanel) && edgePanel.includes(`${P.name} holds a String on ${N.name}`));
      const b = BS.find("uiP", "uiN");
      await BS.update("uiP", b.id, { label: "the river debt" });
      ok(`a bond's caption is shared — both sides carry it, and it shows on the line`, BS.find("uiN", "uiP")?.label === "the river debt" && /tsl-viz-edge-label">the river debt</.test(new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML()));
      await SAM.setActorData(N, { title: "" });
      delete canvas.scene.getFlag; delete canvas.scene.setFlag;
    }

    // ═══ A bond is one: a player's side reaches the NPC's through the GM ═══
    {
      const p2 = pc("syP"), n2 = npc("syN", "broker");
      await BS.add("syP", "syN", { type: "ally", attitude: 1 });
      // A player changed their side, the NPC's couldn't be written: they drift apart…
      const mine = BS.getList("syP");
      mine[0].attitude = 2; mine[0].label = "sworn at the ford";
      await p2.setFlag(SCOPE, "bonds", mine);
      await BS.applyMirror({ actorId: "syP", targetActorId: "syN", attitude: 2, label: "sworn at the ford" });
      ok(`the GM writes a player's change on the NPC's side (strength and caption)`, BS.find("syN", "syP")?.attitude === 2 && BS.find("syN", "syP")?.label === "sworn at the ford");
      const theirs = BS.getList("syN");
      theirs[0].attitude = 0;
      await n2.setFlag(SCOPE, "bonds", theirs);
      await BS.reconcileAll();
      ok(`…and on load, a pair that drifted apart is mended: the player's side wins`, BS.find("syN", "syP")?.attitude === 2);
      await p2.setFlag(SCOPE, "bonds", []);
      await BS.applyMirror({ actorId: "syP", targetActorId: "syN", remove: true });
      ok(`…ending it on the player's side ends it on the NPC's`, !BS.find("syN", "syP"));
      game.user.isGM = false;
      const asked = globalThis.__gmAsked = [];
      const emit = game.socket.emit;
      game.socket.emit = (_n, msg) => asked.push(msg?.data?.action);
      n2.isOwner = false;
      await BS.add("syP", "syN", { type: "friend", attitude: 1 });
      game.socket.emit = emit; n2.isOwner = true; game.user.isGM = true;
      ok(`…a player's new bond with an NPC is sent to the GM to mirror`, asked.includes("bondMirror"));
    }

    // ═══ What an NPC does with a String: their moves ═══
    {
      const AB = R.TSLAbilities;
      ok(`every nature has two moves of its own and every triad one at the roll — each with its answers`,
        R.SOCIAL_ARCHETYPES.every((a) => (R.NPC_ABILITIES[a.id] ?? []).length === 2 && R.NPC_ABILITIES[a.id].every((m) => m.outcomes?.length && m.text && ["talk", "roll", "beyond"].includes(m.when)))
        && Object.keys(R.SOCIAL_TRIADS).every((t) => R.TRIAD_MOVES[t]?.text));
      // Chat cards that wait for an answer.
      const msgs = [], create = globalThis.ChatMessage.create;
      globalThis.ChatMessage.create = async (data) => {
        const m = await create(data);
        m.id = `m${msgs.length}`; m.flags = JSON.parse(JSON.stringify(data.flags ?? {}));
        m.getFlag = (sc, k) => m.flags?.[sc]?.[k];
        m.update = async (patch) => { for (const [k, v] of Object.entries(patch)) { if (k === "content") m.content = v; else setProperty(m, k, v); } return m; };
        msgs.push(m);
        return m;
      };
      game.messages = { get: (id) => msgs.find((m) => m.id === id), get contents() { return msgs; } };
      const card = () => msgs[msgs.length - 1];
      const answer = (choice) => AB.outcome({ messageId: card().id, choice });

      const p = pc("abP"), ty = npc("abT", "tyrant");
      ok(`no String on them, no move`, (await AB.use(ty, p, "order")) === null);
      await SS.add("abT", "abP", 1);
      await AB.use(ty, p, "order");
      ok(`the GM pulls a String: a card asks the character for an answer — the String isn't spent yet`, /An order before witnesses/.test(card().content) && /data-tsl-ab-choice="no"/.test(card().content) && SS.countOn("abT", "abP") === 1);
      ok(`…one card at a time for the pair`, (await AB.use(ty, p, "order")) === null);
      await answer("no");
      ok(`refused: Frightened, the String spent, the card closed with what happened`, R.TSLEmotions.has(p, "frightened") && SS.countOn("abT", "abP") === 0 && !/data-tsl-ab-choice/.test(card().content) && /refuses/.test(card().content) && card().flags[SCOPE].ability.open === false);
      const sc = npc("abS", "machiavellian");
      await SS.add("abS", "abP", 1);
      await AB.use(sc, p, "hook");
      await answer("yes");
      ok(`the Schemer's hook, taken: Inspiration — and the String stays with them`, /Inspiration/.test(card().content) && SS.countOn("abS", "abP") === 1);
      await SS.add("abP", "abS", 1);
      await AB.use(sc, p, "hook");
      ok(`…holding one on them, you may answer with it`, /data-tsl-ab-choice="quits"/.test(card().content));
      await answer("quits");
      ok(`Quits: both Strings burn, and nothing happens`, SS.countOn("abS", "abP") === 0 && SS.countOn("abP", "abS") === 0 && /Quits/.test(card().content));
      const du = npc("abD", "duelist");
      await SS.add("abD", "abP", 1);
      await AB.use(du, p, "challenge");
      await answer("won");
      ok(`the Duelist's challenge, won: their String burns, and yours is on them`, SS.countOn("abD", "abP") === 0 && SS.countOn("abP", "abD") === 1);
      const he = npc("abH", "hermit");
      await SS.add("abH", "abP", 1);
      await AB.use(he, p, "silence");
      await answer("ok");
      const shut = T.preview(p, he, { technique: "argument", size: "costly" });
      ok(`the Hermit's silence: every ask 4 harder until they're brought a truth`, AB.silenced(he, "abP") && shut.dcMods.some((m) => m.value === 4) && shut.dc === T.dcFor(he, "costly").dc + 4);
      await AB.setSilence(he, "abP", false);
      ok(`…and the GM lifts it`, !AB.silenced(he, "abP") && T.preview(p, he, { technique: "argument", size: "costly" }).dc === T.dcFor(he, "costly").dc);
      const br = npc("abB", "broker"), buyer = npc("abX", "tyrant");
      const was = canvas.tokens.placeables;
      canvas.tokens.placeables = [{ actor: br }, { actor: buyer }, { actor: p }];
      await SS.add("abB", "abP", 1);
      await AB.use(br, p, "sold");
      await answer("ok");
      canvas.tokens.placeables = was;
      ok(`the Broker sells your debt: their String on you is someone else's now`, SS.countOn("abB", "abP") === 0 && SS.countOn("abX", "abP") === 1 && /sells their String/.test(card().content));
      game.messages = undefined;
      globalThis.ChatMessage.create = create;

      // At the roll: the triad's move, the GM's call after the dice.
      const q = pc("abQ"), d2 = npc("abD2", "duelist");          // Power; key Pressure
      await SS.add("abD2", "abQ", 1);
      const sb = await roll(q, d2, { technique: "demand", size: "costly" }, [15, 3], ["use"]);
      ok(`Power strikes back: −5 after the dice turns a hit into a miss — and no String moves after (${sb.total} vs ${sb.dc})`,
        sb.grade === "failure" && /Strike back/.test(lastCard()) && SS.countOn("abD2", "abQ") === 0 && SS.countOn("abQ", "abD2") === 0 && /no String moves/.test(lastCard()));
      const mt = npc("abM", "martyr");                             // Emotion; key Pressure
      await SS.add("abM", "abQ", 1);
      await roll(q, mt, { technique: "demand", size: "small" }, [16, 2], ["use"]);
      ok(`Emotion makes the win hurt: you get it — and carry their Guilt, toward them`, R.TSLEmotions.of(q).some((e) => e.id === "guilty" && e.toward === "abM") && /You(?:'|&#39;)ll feel it/.test(lastCard()) && SS.countOn("abM", "abQ") === 0);
      const hr = npc("abH2", "hermit");                            // Order; key Reason
      await SS.add("abH2", "abQ", 1);
      await roll(q, hr, { technique: "argument", size: "small" }, [18, 2], ["use"]);
      ok(`Order sets the terms: a strong yes — at their price all the same`, /On my terms/.test(lastCard()) && /On their terms/.test(lastCard()) && SAM.getKnown(hr).price);
      await SS.add("abD2", "abQ", 1);
      const kept = await roll(q, d2, { technique: "demand", size: "costly" }, [20, 3]);
      ok(`…and the GM may keep it: the roll stands, and the stake moves as usual (a 20: a String on them; theirs stays one)`, kept.grade === "strong" && SS.countOn("abD2", "abQ") === 1 && SS.countOn("abQ", "abD2") === 1);

      // A player's String: they agree with no roll; or invest it in the bond.
      const r = pc("abR"), fr = npc("abF", "caretaker");
      await SS.add("abR", "abF", 1);
      const before = globalThis.__cards.length;
      ok(`remind them: they agree — no roll, and the String is spent`, (await SS.remind(r, fr, { size: "costly" })) && SS.countOn("abR", "abF") === 0 && globalThis.__cards.length === before + 1 && /agrees — no roll/.test(lastCard()));
      await SS.add("abR", "abF", 1);
      await SS.remind(r, fr, { size: "against" });
      ok(`…against their interests, the GM says what it would take`, /the GM says what it would take/.test(lastCard()));
      await SS.add("abR", "abF", 1);
      ok(`invest with no bond yet: you choose what you become`, (await SS.invest(r, fr)) === null && (await SS.invest(r, fr, "ally"))?.type === "ally" && BS.find("abF", "abR")?.type === "ally" && SS.countOn("abR", "abF") === 0);
      await SS.add("abR", "abF", 1);
      await SS.invest(r, fr);
      ok(`…then each String invested is +1 ●, on both sides`, BS.getStrength("abR", "abF") === 2 && BS.getStrength("abF", "abR") === 2);
      const ri = npc("abRi", "duelist");
      await BS.add("abR", "abRi", { type: "rival", attitude: 2 });
      await SS.add("abR", "abRi", 1);
      await SS.invest(r, ri);
      ok(`…invested in a hostile bond, it makes peace: −1 ●`, bond("abR", "abRi") === "rival1");
      game.user.isGM = false;
      const pBonds = await render(r, "bonds", { _expandedBonds: new Set([BS.find("abR", "abF").id]) });
      game.user.isGM = true;
      ok(`a player can't raise the dots by hand — only by investing (lowering is theirs)`, /data-strength="3" disabled/.test(pBonds) && /data-strength="1" (?!disabled)/.test(pBonds) && /data-invest="abF"/.test(pBonds));
      await SS.add("abT", "abP", 1);
      const screen = await render(ty, "talk");
      ok(`the GM's screen: their three moves, and whom they can pull a String on`, /Their moves/.test(screen) && /Strike back/.test(screen) && /An example made/.test(screen) && /data-ab-use="order" data-on="abP"/.test(screen));
    }

    // ═══ Only those on the map with you ═══
    const away = makeActor("uiAway", { cha: 1 }, { skills: { per: { total: 2 } } });
    const offMap = await render(away, "talk", { _tTarget: "uiN" });
    const farNpc = npc("uiFar", "broker");
    const gone = await render(P, "talk", { _tTarget: "uiFar" });
    ok(`you talk only to whoever is on the map with you: not on the map — no techniques; a target not here — dropped`,
      !bad(offMap) && /isn(?:'|&#39;)t on this map/.test(offMap) && !/data-tech=/.test(offMap)
      && !bad(gone) && /Who are you talking to/.test(gone) && !/data-tech=/.test(gone));
    const farSheet = await render(farNpc, "talk");
    ok(`…and an NPC who isn't on the map can't be asked "as" anyone`, /isn(?:'|&#39;)t on this map/.test(farSheet) && !/data-t-as=/.test(farSheet));

    // ═══ A public scene ═══
    const sceneFlags = {};
    canvas.scene.getFlag = (sc, k) => sceneFlags[k];
    canvas.scene.setFlag = async (sc, k, v) => { sceneFlags[k] = v; };
    await T.setPublicScene(true);
    const court = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal" });
    const own = await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tWitnesses: false });
    const gmViz = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML();
    game.user.isGM = false;
    const plViz = new R.TSLSceneVisualizer({ mode: "scene" })._renderHTML();
    game.user.isGM = true;
    ok(`the GM declares the scene public: every ask starts before witnesses (marked "the scene"); a speaker can still go private`,
      T.publicScene() && /tsl-wit-btn on" data-wit="1"/.test(court) && /(the scene)/.test(court) && /tsl-wit-btn on" data-wit="0"/.test(own));
    ok(`…the GM switches it on the Social Scene; players see that it's public`, /data-public/.test(gmViz) && /tsl-viz-public on/.test(gmViz)
      && !/data-public/.test(plViz) && /tsl-viz-public on/.test(plViz));
    await T.setPublicScene(false);
    delete canvas.scene.getFlag; delete canvas.scene.setFlag;

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
    L.missing = new Set();      // before the switch: the data texts are translated in it, and a miss there counts
    I.setLanguage("uk");
    const ukNames = R.SOCIAL_ARCHETYPES.map((a) => a.label.toLowerCase());
    const ukLeak = Object.entries(R.ARCHETYPE_REACTIONS).flatMap(([, pool]) => pool.map((l) => UK[l] ?? "")).find((l) => ukNames.some((x) => l.toLowerCase().includes(x)));
    ok(`Ukrainian: the natures, techniques and emotions speak it (${R.TECHNIQUES.appeal.label}, ${R.SOCIAL_ARCHETYPES[0].label}, ${R.EMOTIONS.frightened.label}) — and no reaction names a nature${ukLeak ? ` (leak: "${ukLeak}")` : ""}`,
      R.TECHNIQUES.appeal.label === "Прохання" && R.SOCIAL_ARCHETYPES[0].label === "Тиран" && R.EMOTIONS.frightened.label === "Переляк" && !ukLeak);
    const ukViews = [
      await render(P, "talk", { _tTarget: "uiN", _tTech: "appeal", _tWitnesses: true }),
      await render(P, "talk", { _tTarget: "uiN", _tTech: "read" }),
      await render(P, "talk", { _tTarget: "uiN", _tMode: "ask" }),
      await render(P, "talk", { _tTarget: "uiN", _tMode: "lie" }),
      await render(P, "talk", { _tTarget: "uiN", _tTech: "demand" }),
      await render(P, "talk", { _tTarget: "uiN", _tTech: "deceive", _tApproach: "reason" }),
      await render(P, "talk", { _tTarget: "uiN", _tResult: { technique: "bargain", grade: "success", total: 16, dc: 14, rel: "plain", paid: false, witnesses: true, audience: -2 } }),
      await render(P, "profile"), await render(P, "bonds", { _expandedBonds: new Set([BS.find("uiP", "uiN").id]) }),
      await render(N, "profile"), await render(N, "talk"),
    ];
    for (const c of ["start", "roll", "people", "emo", "strings", "bonds", "gm"]) ukViews.push(await render(P, "codex", { _codexCat: c }));
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
    await R.TSLEmotions.mark(ukN, "guilty", { toward: "ukP" });
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
