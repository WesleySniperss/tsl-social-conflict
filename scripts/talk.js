/**
 * tsl-social-conflict | talk.js
 *
 * v3 — the roll (design: docs/v3-design.md).
 *
 * A conversation is PLAYED, not clicked: the players talk in character, the
 * GM answers as the NPC — and plays their hidden nature, so the table can read
 * it from how they take what is said. What the talk reveals, and the emotions
 * it leaves, the GM marks with no roll (TSLEmotions.mark, the known facts).
 * The module rolls only when the GM calls for it — usually once, when the ask
 * is made; at most two or three times a conversation — and that roll counts
 * everything the talk established. Nobody declares a goal; no turns, no tracks.
 *
 * Eight MANEUVERS, under the four social checks of D&D: what the words really
 * were. Each is a pair of D&D skills: the better one rolls, through the
 * system's own check; the other backs it (+ your proficiency if you're trained in it).
 *   I PERSUADE   — an Appeal (Heart) or an Argument (Reason), sized by what it
 *                  costs THEM; all in: Seduce, or a Deal;
 *   I INTIMIDATE — a Demand (Pressure), sized the same; all in: Blackmail;
 *   I LIE        — Deceive. Not a way of coming at someone, but something you
 *                  can tell any way — a threat, a plea, proof: it takes the
 *                  approach it was told in, and their key and wall count for that;
 *   I READ THEM  — when the talk doesn't show it: one straight answer.
 *
 * The stake of every roll is a String: a strong win (5 over, or a 20) gives
 * the speaker one on them; a bad miss (5 under, or a 1) gives them one on the
 * speaker. Some wins cost one back whatever the grade:
 *   Pressure — they give in without a price, but remember it: a String on you;
 *   a Deal   — your word: they hold a String on you until you deliver;
 *   a price that is a debt.
 * A roll never touches the bond between them: who they are to each other is
 * the GM's (or the player's, investing a String); a bond's type works per ●.
 *
 * The NPC's hidden nature shapes every roll:
 *   KEY   — the approach that opens them: a second d20, keep the better.
 *   WALL  — the approach they close against: a second d20, keep the worse.
 *           (Both are rolled AFTER the first die, so only the result gives
 *           the nature away.)
 *   PRICE — what they want for a "yes, but".
 *   PRESS — how they push back on a "no"; a proud ("firm") nature ends the
 *           talk after refusing something big.
 *   HURTS — the emotion that pushback leaves on whoever missed against them
 *           (emotions.js): every miss but a Read costs one.
 *   AUDIENCE — what witnesses do to an ask: some natures bend before an
 *           audience (+2), some harden (−2). Applied after the roll, like the
 *           key and the wall. Before witnesses a yes to something that costs
 *           them binds them (a String on them), and a no shames you (Insecure).
 *   MASK  — the nature they show (Nature / Demeanor): what the party sees
 *           until it reads through it, or names who they really are.
 *
 * Rolls happen on the speaker's client; what follows (emotions, Strings,
 * bonds, party knowledge, lies) is applied on the GM client through the
 * TSLGMActions relay, which posts ONE card per roll. Every word on screen
 * goes through _t() (i18n.js); the data texts below are translated in place.
 */

console.log("TSL | Loading talk.js...");

const TALK_SCOPE = "tsl-social-conflict";

/** Burning a String after a miss. */
const STRING_SPEND_BONUS = 5;
/** One helper backing the speaker. */
const HELP_BONUS = 2;
/** Playing on their known Desire or Fear. */
const LEVER_BONUS = 2;

/** The module's own dark dialog look. A fresh object each call (Foundry merges options). */
function tslDialogOptions(extra = {}) {
  return { classes: ["dialog", "tsl-dialog"], width: 460, ...extra };
}

/** The skills a line can use (dnd5e & a5e share the keys). */
const SKILL_LABELS = {
  per: "Persuasion", dec: "Deception", itm: "Intimidation", prf: "Performance",
  ins: "Insight", inv: "Investigation", his: "History", ath: "Athletics",
  rel: "Religion", arc: "Arcana",
};
const SKILL_ORDER = Object.keys(SKILL_LABELS);

/** How big the ask is — by what it costs THEM. Shifts the DC. */
const ASK_SIZES = {
  small:   { id: "small",   dc: -4, label: "A small ask",   short: "Small",   hint: "a favour, a door, something they don't guard" },
  costly:  { id: "costly",  dc: 0,  label: "A costly ask",  short: "Costly",  hint: "something it costs them to give" },
  against: { id: "against", dc: 4,  label: "Against them",  short: "Against", hint: "something against their interests or loyalties — it needs leverage" },
};
const ASK_ORDER = ["small", "costly", "against"];

/** What a maneuver does: the ask, the all-in gamble, or a read. */
const TECH_JOBS = {
  read:   { id: "read",   label: "Read",   icon: "fa-eye",          hint: "When the talk doesn't show it: whether it's true, how they'll take you, the face they wear — told straight; what they hide, shown for you to name." },
  ask:    { id: "ask",    label: "Ask",    icon: "fa-hand-holding", hint: "You've made your case: will they do it? Sized by what it costs them; the way your words came at them decides what winning costs." },
  gambit: { id: "gambit", label: "All in", icon: "fa-dice",         hint: "A gamble on leverage — it works on anything, and the consequences last." },
};
const JOB_ORDER = ["read", "ask", "gambit"];

/**
 * The eight maneuvers: an Ask and an All-in for each approach; the lie, told
 * any way (`anyWay`: no approach of its own, it takes the one it was told in);
 * the Read.
 * `skills` — the PAIR of D&D skills it is: the better one rolls (through the
 * system's own check), the other backs it (+ proficiency if trained). `line` — what it
 * looks like in a scene; `win` / `miss` — what happens either way, in plain
 * words; `rule` — the whole of it.
 */
const TECHNIQUES = {
  read:      { approach: null,       job: "read",   label: "Read them", skills: ["ins", "inv"],
    line: "watch them — or dig into who they are",
    win: "one answer for the whole party — two on a strong hit; what they hide, the GM lets show, and you name it",
    miss: "they notice, and won't let you read them again this scene — and that's all: reading someone is safe",
    rule: "Hit: one answer for the whole party; a strong hit, two. The moment and how they react, the GM tells straight; their Desire, Fear or Price, the GM lets show — once you name it, it's on record. Miss: they notice — no emotion, no String. A Read never moves Strings." },
  demand:    { approach: "pressure", job: "ask",    label: "Demand",    skills: ["itm", "ath"],
    line: "do it — or else",
    win: "they give in — no price; but they remember who made them: they take a String on you",
    miss: "they push back their own way — their emotion on you",
    rule: "Hit: they give in, no price — but they take a String on you. Miss: their emotion on you." },
  appeal:    { approach: "heart",    job: "ask",    label: "Appeal",    skills: ["per", "prf"],
    line: "ask from the heart",
    win: "they do it — for their price; a strong hit can put the String it wins on the price instead",
    miss: "you showed your heart: their emotion on you, and a String",
    rule: "Hit: they do it — for their price. A strong hit is worth a String on them: pay the price and keep it, or put it on the price — on your terms. Miss: you showed your heart — their emotion on you, and they take a String on you." },
  argument:  { approach: "reason",   job: "ask",    label: "Argument",  skills: ["per", "his"],
    line: "here's why: the facts, the law, what's in it for them",
    win: "they see it your way and do it — for their price; a strong hit can put the String it wins on the price instead",
    miss: "they out-argue you — their emotion on you",
    rule: "Hit: they see it your way — for their price. A strong hit is worth a String on them: pay the price and keep it, or put it on the price — on your terms. Miss: they out-argue you — their emotion on you." },
  blackmail: { approach: "pressure", job: "gambit", label: "Blackmail", skills: ["itm", "inv"], needs: "fear",
    line: "what you hold over them: their Fear, a secret, a debt",
    win: "they do it, Frightened of you — and they'll pay you back: a String on you",
    miss: "they call your bluff — their emotion on you",
    rule: "Say what you hold over them — a secret from anyone will do: the GM decides if it bites. Their Fear, once the party knows it, adds +2. Hit: they do it, Frightened of you — and they take a String on you. Miss: they call your bluff — their emotion on you. Either way they may be your Enemy now: the GM says." },
  seduce:    { approach: "heart",    job: "gambit", label: "Seduce",    skills: ["per", "prf"], needs: "desire",
    line: "their Desire, or what's between you",
    win: "they do it for you — and you let them close: a String on you",
    miss: "they turn it down — their emotion, and a String on you; if you leaned on a bond of ●● or more, heartbreak instead: Hopeless",
    rule: "Their Desire, once the party knows it, adds +2. Hit: they do it for you, no price — and closeness cuts both ways: they take a String on you. Miss: they've seen your heart — a String on you, and their emotion; if you leaned on a bond of ●● or more, heartbreak instead — you're Hopeless." },
  bargain:   { approach: "reason",   job: "gambit", label: "Deal",      skills: ["per", "ins"], needs: "price",
    line: "your word for theirs: a trade, a promise — their Price, if you know it",
    win: "they do it — and you give your word: they hold a String on you until you deliver. On a plain hit, they name the terms",
    miss: "no deal — their emotion on you",
    rule: "Their Price, if you know it, adds +2. Hit: they do it, and you give your word — they hold a String on you until you deliver (a strong hit: your terms; a plain one: theirs). Kept: their String goes — and if you were nothing to each other, you're Allies. Broken: they keep it, and yours on them burns. Miss: their emotion on you." },
  deceive:   { approach: null, anyWay: true, job: "gambit", label: "Deceive", skills: ["dec", "prf"], icon: "fa-mask", color: "#a9b4c0",
    line: "a lie that works — until it doesn't",
    win: "they believe it and act on it — no price, and no String either; the lie stays on record until it comes out",
    miss: "caught — their emotion on you, and the door closes",
    rule: "Hit: they believe it and act — it wins you no String: a lie is no hold on anyone. It stays on record until it comes out: the GM brings it out, or a bad miss of yours against them does (then your String on them burns, and they take one on you). Miss: caught — their emotion, and the door closes." },
};
for (const [id, t] of Object.entries(TECHNIQUES)) t.id = id;
const TECHNIQUE_ORDER = Object.keys(TECHNIQUES);

/** The technique an approach uses for a job. */
function techniqueFor(approach, job) {
  return approach ? TECHNIQUE_ORDER.find(id => TECHNIQUES[id].approach === approach && TECHNIQUES[id].job === job) ?? null : null;
}

/** The way a maneuver comes at them: its own — or, for a lie, the way it was told. */
function approachOf(technique, told = null) {
  const t = TECHNIQUES[technique];
  return t?.approach ?? (t?.anyWay && APPROACHES[told] ? told : null);
}

/**
 * What a Read can ask. Three ways to know a person, together (the user,
 * 2026-11-10: «звучить ніби їх усі можна поєднати»):
 *   • the talk — anything, no roll: the GM plays it, the players name it, the
 *     GM marks it known;
 *   • a Read, of the moment and the reaction — whether it's true, what they're
 *     after now, how they'll take a way of talking, their face, the room: the
 *     GM tells it straight (D&D's Insight: intentions, lies, the next move);
 *   • a Read, of what they HIDE (READ_DEPTH: their Desire, Fear, Price): not
 *     told. A hit makes the GM let it show in the scene (a whisper says what
 *     and how); the players name it, and the GM marks it — «страх… треба
 *     показувати відіграшем».
 * Whatever is known is the party's for good.
 */
const READ_QUESTIONS = {
  desire:   { id: "desire",   label: "What do they really want?",       short: "Desire" },
  fear:     { id: "fear",     label: "What do they fear?",              short: "Fear" },
  key:      { id: "key",      label: "What would open them?",           short: "Key" },
  wall:     { id: "wall",     label: "What would close them?",          short: "Wall" },
  price:    { id: "price",    label: "What would they want in return?", short: "Price" },
  pressed:  { id: "pressed",  label: "After a no, do they end it?",     short: "After a no" },
  mask:     { id: "mask",     label: "Is that their true face?",        short: "Mask" },
  audience: { id: "audience", label: "Before witnesses — do they bend or harden?", short: "Witnesses" },
};
/** Asked of the moment, not of the person: always open, and nothing to keep. */
READ_QUESTIONS.intent = { id: "intent", label: "What are they after right now?", short: "What they're after" };
READ_QUESTIONS.truth = { id: "truth", label: "Are they telling the truth?", short: "Truth" };
const READ_MOMENT = ["intent", "truth"];
const READ_ORDER = ["desire", "fear", "key", "wall", "price", "pressed", "mask", "audience"];
/** What they hide: a Read makes the GM show it — the players name it themselves. */
const READ_DEPTH = ["desire", "fear", "price"];

/** The four grades of an ask, as the table reads them. */
const TALK_GRADES = {
  strong:  { label: "They do it",                tone: "good" },
  success: { label: "They do it — for a price",  tone: "good" },
  failure: { label: "No",                        tone: "bad" },
  botch:   { label: "No — and it costs you",     tone: "bad" },
};

/** The grade in words, by what the technique was doing. */
const JOB_GRADES = {
  read:   { strong: "They show you a lot", success: "You see something",  failure: "They notice",           botch: "They notice — and read you" },
  gambit: { strong: "It works",            success: "It works",           failure: "It blows up",           botch: "It blows up — badly" },
};

class TSLTalk {

  // ── Settings ──────────────────────────────────────────────────────────────

  static _setting(key, fallback) {
    try { return game.settings.get(TALK_SCOPE, key) ?? fallback; } catch { return fallback; }
  }

  /**
   * The system rolls the check itself where it can (a5e: its expertise dice
   * and effects count), in its own window by default — already set to the
   * maneuver's skill and bonus; the ability or extra dice change there.
   */
  static usesSystemRoll(actor) { return typeof actor?.rollSkillCheck === "function"; }
  static showsSystemDialog() { return !!TSLTalk._setting("systemRollDialog", true); }

  /** Trained in a skill? (a5e: `proficient`; dnd5e: the proficiency multiplier.) */
  static proficient(actor, key) {
    const e = actor?.system?.skills?.[key];
    if (!e) return false;
    return Number(e.proficient ?? e.prof ?? e.value ?? 0) >= 1;
  }

  // ── Numbers ───────────────────────────────────────────────────────────────

  static profBonus(actor) {
    const sys = actor?.system ?? {};
    let prof = sys.attributes?.prof;
    if (typeof prof !== "number") prof = prof?.value;
    if (typeof prof !== "number") {
      const tier = sys.details?.level ?? sys.details?.cr ?? 1;
      prof = 2 + Math.floor((Math.max(1, Number(tier) || 1) - 1) / 4);
    }
    return prof;
  }

  static abilityMod(actor, key) {
    const ab = actor?.system?.abilities?.[key];
    if (typeof ab?.mod === "number") return ab.mod;
    if (typeof ab?.value === "number") return Math.floor((ab.value - 10) / 2);
    return 0;
  }

  /**
   * A skill's modifier. dnd5e computes `.total` — trust it. a5e exposes the
   * ability mod plus a proficiency flag: fold proficiency in ourselves.
   */
  static skillMod(actor, key) {
    const entry = actor?.system?.skills?.[key];
    if (!entry) return 0;
    if (typeof entry.total === "number") return entry.total;
    let v = entry.mod ?? entry.value;
    if (typeof v !== "number") return 0;
    const mult = Number(entry.proficient ?? entry.prof ?? entry.proficiency ?? 0);
    if (mult > 0) v += Math.floor(TSLTalk.profBonus(actor) * mult);
    return v;
  }

  static bestSkill(actor, keys = SKILL_ORDER) {
    let best = keys[0], top = -Infinity;
    for (const k of keys) {
      const v = TSLTalk.skillMod(actor, k);
      if (v > top) { top = v; best = k; }
    }
    return best;
  }

  /**
   * How hard this person is to move: 10 + proficiency + the better of WIS
   * and INT (reading people, refusing to be fooled). An average NPC is 14.
   */
  static baseDC(actor) {
    return 10 + TSLTalk.profBonus(actor)
      + Math.max(TSLTalk.abilityMod(actor, "wis"), TSLTalk.abilityMod(actor, "int"));
  }

  /** The DC: the person, the table's dial, the size of an ask. */
  static dcFor(npc, size = null) {
    const base = TSLTalk.baseDC(npc);
    const mods = [];
    const dial = Number(TSLTalk._setting("socialDcBonus", 0)) || 0;
    if (dial) mods.push({ label: _t("table difficulty"), value: dial });
    const ask = size ? ASK_SIZES[size] : null;
    if (ask?.dc) mods.push({ label: ask.label.toLowerCase(), value: ask.dc });
    return { base, mods, dc: base + mods.reduce((sum, m) => sum + m.value, 0) };
  }

  static isNpc(actor) { return !!actor && !SocialArchetypeManager.isPC(actor); }

  /**
   * The GM declared this scene public — a court, a feast, Elysium: every ask
   * and gambit here starts before witnesses (a speaker can still go private).
   */
  static publicScene(scene = globalThis.canvas?.scene) { return !!scene?.getFlag?.(TALK_SCOPE, "public"); }

  static async setPublicScene(on, scene = globalThis.canvas?.scene) {
    if (game.user.isGM && scene) await scene.setFlag(TALK_SCOPE, "public", !!on);
  }

  /**
   * How this person is KNOWN to take an approach — "key" (advantage), "wall"
   * (disadvantage), "plain" (a normal roll, for sure) or "unknown". Null for a
   * Read (no approach). Only what the party has learned; never the truth.
   */
  static knownRelation(npc, approach) {
    if (!APPROACHES[approach]) return null;
    const arch = SocialArchetypeManager.getArchetype(npc);
    const k = SocialArchetypeManager.getKnown(npc);
    if (arch && k.key && arch.key === approach) return "key";
    if (arch && k.wall && arch.wall === approach) return "wall";
    return k.key && k.wall ? "plain" : "unknown";
  }

  /** The chance of a hit with d20 + mod against the DC: a 20 always hits, a 1 never does; advantage keeps the better of two dice. */
  static hitChance(mod, dc, mode = "normal") {
    let n = 0;
    for (let f = 1; f <= 20; f++) if (f === 20 || (f !== 1 && f + mod >= dc)) n++;
    const p = n / 20;
    return mode === "adv" ? 1 - (1 - p) ** 2 : mode === "dis" ? p * p : p;
  }

  /**
   * Your odds with a technique, from what the party knows: the visible math,
   * advantage on their known key, disadvantage on their known wall, and the
   * room once the party knows how they take witnesses. { pv, rel, mode, p }.
   */
  static chance(src, npc, opts = {}) {
    const pv = TSLTalk.preview(src, npc, opts);
    const known = TSLTalk.knownRelation(npc, pv.approach);
    // A known wall doesn't stand while they carry an emotion that opens this way (visible to all: it's on them).
    const down = known === "wall" ? TSLEmotions.opening(src, npc, pv.approach) : null;
    const rel = down ? "plain" : known;
    const mode = rel === "key" ? "adv" : rel === "wall" ? "dis" : "normal";
    const audience = pv.witnesses && SocialArchetypeManager.getKnown(npc).audience ? SocialArchetypeManager.audienceOf(npc) : 0;
    const lost = rel === "wall" && pv.backed ? TSLTalk.profBonus(src) : 0;   // no backing against their wall
    return { pv, rel, mode, down, p: TSLTalk.hitChance(pv.mod + audience - lost, pv.dc, mode) };
  }

  /** The truth: is this approach their key, their wall, or neither (a normal roll)? */
  static relation(npc, approach) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    if (!arch || !APPROACHES[approach]) return "plain";
    return arch.key === approach ? "key" : arch.wall === approach ? "wall" : "plain";
  }

  /**
   * The truth for THIS speaker, right now: { rel, down }. A state beats a
   * habit — while they carry an emotion that opens this way (Frightened: a
   * threat; Guilty toward you, Insecure: a plea; Hopeless: an argument), their
   * wall against it doesn't stand: a normal roll, `down` = that emotion. The
   * talk that left the emotion is what took the wall down — no roll for it.
   */
  static relationFor(src, npc, approach) {
    const rel = TSLTalk.relation(npc, approach);
    const down = rel === "wall" ? TSLEmotions.opening(src, npc, approach) : null;
    return { rel: down ? "plain" : rel, down };
  }

  /**
   * Your bond toward them gives +● when your approach runs the way it does. A
   * hostile one costs −● on anything else: they won't hear you out.
   */
  /**
   * What the bond adds to a roll against them (`src`'s bond toward `tgt`), per
   * ●: +1 on its approach; +1 when its edge skill rolls (not on top of the
   * approach's); −1 when its cost skill rolls; a hostile one −1 on any other
   * approach. Parts for the visible math; a Stranger adds nothing.
   */
  static bondParts(src, tgt, approach, skill) {
    const bond = TSLBondStore.find(src?.id, tgt?.id);
    const type = bond ? SocialArchetypeManager.getBondType(bond.type) : null;
    const n = bond ? TSLBondStore.getStrength(src.id, tgt.id) : 0;
    if (!type || type.id === "stranger" || !n) return [];
    const out = [];
    const runs = !!approach && SocialArchetypeManager.bondApproach(type.id) === approach;
    if (runs) out.push({ label: _t("bond — {type}", { type: type.label }), value: n });
    else if (approach && type.hostile) out.push({ label: _t("bond — {type}", { type: type.label }), value: -n });
    if (!runs && type.edge && skill === type.edge) out.push({ label: _t("bond — {type} ({skill})", { type: type.label, skill: SKILL_LABELS[skill] }), value: n });
    if (type.cost && skill === type.cost) out.push({ label: _t("bond — {type} ({skill})", { type: type.label, skill: SKILL_LABELS[skill] }), value: -n });
    return out;
  }

  /** The bond's ● on this approach alone (+ its own, − a hostile one's elsewhere) — what counts as leverage. */
  static bondBonus(src, tgt, approach) {
    const bond = TSLBondStore.find(src?.id, tgt?.id);
    if (!bond || !approach) return 0;
    const strength = TSLBondStore.getStrength(src.id, tgt.id);
    if (SocialArchetypeManager.bondApproach(bond.type) === approach) return strength;
    return SocialArchetypeManager.getBondType(bond.type).hostile ? -strength : 0;
  }

  /** What a nature asks in return for a "yes, but". */
  static priceOf(npc) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    return arch?.price ?? { text: _t("Something in return — the GM names it."), string: false };
  }

  /** Only an appeal, an argument or a deal ends in "yes, but" — a demand just gets its way. */
  static hasPrice(technique) { return technique === "appeal" || technique === "argument" || technique === "bargain"; }

  /** How big it is, in the words of the maneuver: an ask, a demand or a lie — the same DC shifts. */
  static sizeOf(technique, id) {
    const a = ASK_SIZES[id];
    if (!a) return null;
    if (TECHNIQUES[technique]?.anyWay) return TSLTalk.lieSize(id);
    if (TECHNIQUES[technique]?.approach !== "pressure") return a;
    return { ...a, label: { small: _t("Something small"), costly: _t("Something costly"), against: a.label }[id] };
  }

  /** A lie is sized like an ask (the same DC shifts), in its own words. */
  static lieSize(id) {
    return {
      small:   { label: _t("A small lie"), short: _t("Small lie"), hint: _t("easy to believe, and it costs them little to act on it") },
      costly:  { label: _t("A big lie"),   short: _t("Big lie"),   hint: _t("they'd pay dearly if it isn't true") },
      against: { label: _t("A bold lie"),  short: _t("Bold lie"),  hint: _t("it goes against what they know or want — and they must swallow it anyway") },
    }[id] ?? null;
  }

  /** The grade in words for this technique. */
  static gradeLabel(technique, grade) {
    const tech = TECHNIQUES[technique];
    if (!tech) return grade;
    if (technique === "bargain") return { strong: _t("On your terms"), success: _t("On their terms"), failure: _t("No deal"), botch: _t("No deal — and it costs you") }[grade] ?? grade;
    if (technique === "deceive") return { strong: _t("They believe it"), success: _t("They believe it"), failure: _t("Caught"), botch: _t("Caught — and it costs you") }[grade] ?? grade;
    if (tech.job === "ask") return technique === "demand" && grade === "success" ? _t("They give in") : (TALK_GRADES[grade]?.label ?? grade);
    return JOB_GRADES[tech.job]?.[grade] ?? grade;
  }

  // ── Lies (on the NPC) ─────────────────────────────────────────────────────

  /** The lies they believe — [{ id, byId, at }]. */
  static lies(npc) {
    const l = npc?.getFlag?.(TALK_SCOPE, "lies");
    return Array.isArray(l) ? l : [];
  }

  /** The GM brings a lie out: the liar's hold burns, they take a String on the liar — and strangers become Enemies (a relationship is the GM's to change). */
  static async exposeLie(npc, lieId) {
    if (!game.user.isGM || !npc) return;
    const lies = TSLTalk.lies(npc);
    const lie = lies.find(l => l.id === lieId);
    if (!lie) return;
    await npc.setFlag(TALK_SCOPE, "lies", lies.filter(l => l.id !== lieId));
    const liar = game.actors.get(lie.byId);
    if (!liar) return;
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    if (await TSLStringStore.spend(liar.id, npc.id)) lines.push(_t("{liar}'s String on them burns.", { liar: esc(liar.name) }));
    if (await TSLStringStore.add(npc.id, liar.id, 1)) lines.push(_t("They take a <b>String</b> on {liar}.", { liar: esc(liar.name) }));
    const s = await TSLBondStore.begin(npc.id, liar.id, "enemy", 2);
    lines.push(s ? TSLTalk._bondLine(npc, liar, s) : _t("What they are to each other now is the GM's call (Bonds)."));
    const a = await TSLEmotions.add(npc, "angry", { by: liar.id });
    if (a?.added) lines.push(_t("{who} is <b>Angry</b>.", { who: esc(npc.name) }));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      content: `<div class="tsl-x-card tsl-x--botch">
        <div class="tsl-x-head"><i class="fas fa-mask"></i><span class="tsl-x-title">${_t("The lie comes out")}</span></div>
        <div class="tsl-x-who">${_t("{who} learns what {liar} told them was a lie.", { who: esc(npc.name), liar: esc(liar.name) })}</div>
        <ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--bad">${l}</li>`).join("")}</ul>
      </div>`,
    });
    TSLTalk._pulse({ srcId: npc.id, tgtId: liar.id, technique: "deceive", approach: null, job: "gambit", grade: "botch", rel: "plain", ended: false });
  }

  // ── Deals (on the NPC) ────────────────────────────────────────────────────

  /** The word given to them — [{ id, byId, price, at }]; `price`: on their terms (the nature's price), else on the speaker's. */
  static deals(npc) {
    const d = npc?.getFlag?.(TALK_SCOPE, "deals");
    return Array.isArray(d) ? d : [];
  }

  /** The GM says how a deal ended. Kept: their String goes (strangers become Allies). Broken: the NPC keeps theirs, the speaker's burns (strangers become Enemies). */
  static async settleDeal(npc, dealId, kept) {
    if (!game.user.isGM || !npc) return;
    const deals = TSLTalk.deals(npc);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    await npc.setFlag(TALK_SCOPE, "deals", deals.filter(d => d.id !== dealId));
    const who = game.actors.get(deal.byId);
    if (!who) return;
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    if (!kept) {
      lines.push(_t("{who} keeps the String — and will use it.", { who: esc(npc.name) }));
      if (await TSLStringStore.spend(who.id, npc.id)) lines.push(_t("{name}'s String on them burns.", { name: esc(who.name) }));
    }
    else if (await TSLStringStore.spend(npc.id, who.id)) lines.push(_t("{who} lets the String go.", { who: esc(npc.name) }));
    const s = await TSLBondStore.begin(npc.id, who.id, kept ? "ally" : "enemy", kept ? 1 : 2);
    if (s) lines.push(TSLTalk._bondLine(npc, who, s));
    else if (!kept) lines.push(_t("What they are to each other now is the GM's call (Bonds)."));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      content: `<div class="tsl-x-card tsl-x--${kept ? "success" : "botch"}">
        <div class="tsl-x-head"><i class="fas fa-handshake"></i><span class="tsl-x-title">${kept ? _t("The word is kept") : _t("The word is broken")}</span></div>
        <div class="tsl-x-who">${esc(who.name)} → ${esc(npc.name)}</div>
        <ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--${kept ? "good" : "bad"}">${l}</li>`).join("")}</ul>
      </div>`,
    });
    TSLTalk._pulse({ srcId: npc.id, tgtId: who.id, technique: "bargain", approach: "reason", job: "gambit", grade: kept ? "success" : "botch", paid: kept, rel: "plain", ended: false });
  }

  // ── The speaker's view, before the roll ───────────────────────────────────

  /**
   * Everything the speaker sees before rolling, built only from what is
   * VISIBLE (skills, bonds, help, levers, emotions, the DC). It
   * never consults the key, the wall or how they take witnesses — those show
   * in the result.
   */
  static preview(src, npc, { technique = null, approach = null, size = "costly", skill = null, helperId = null, lever = null, witnesses = false } = {}) {
    // An older caller may name only an approach (or "read"): use that approach's ask (or the Read).
    if (!TECHNIQUES[technique]) technique = approach === "read" ? "read" : (techniqueFor(approach, "ask") ?? "appeal");
    const tech = TECHNIQUES[technique];
    const job = tech.job, ap = approachOf(technique, approach);
    const sized = job === "ask" || job === "gambit";
    size = sized ? (ASK_SIZES[size] ? size : "costly") : null;
    skill = skill && SKILL_LABELS[skill] ? skill : TSLTalk.bestSkill(src, tech.skills);

    const known = SocialArchetypeManager.getKnown(npc);
    const points = SocialArchetypeManager.getCharacterNotes(npc).points;
    const strings = TSLStringStore.countOn(src.id, npc.id);
    const bond = ap ? TSLTalk.bondBonus(src, npc, ap) : 0;
    const tie = TSLBondStore.find(src.id, npc.id) ? TSLBondStore.getStrength(src.id, npc.id) : 0;

    // A lever is a known Desire or Fear: you play on it in an ask; a gambit
    // plays on its own (Blackmail on their Fear, Seduce on their Desire).
    const leverOk = { desire: job === "ask" && !!known.desire, fear: job === "ask" && !!known.fear };
    if (job === "gambit") lever = tech.needs && known[tech.needs] ? tech.needs : null;
    else lever = lever && leverOk[lever] ? lever : null;

    // The maneuver's other skill backs the roll: your proficiency, when you're trained in it — it grows with you.
    const support = tech.skills.find(k => k !== skill) ?? null;
    const backed = !!support && TSLTalk.proficient(src, support);
    const parts = [{ label: SKILL_LABELS[skill] ?? skill, value: TSLTalk.skillMod(src, skill), base: true }];
    if (backed) parts.push({ label: _t("{skill} backs it", { skill: SKILL_LABELS[support] ?? support }), value: TSLTalk.profBonus(src) });
    { // The Leanings: +1 a dot on their way — or −1 on a way with no dots while leaning elsewhere (as before).
      const lean = ap ? SocialArchetypeManager.leaningMod(src, ap) : 0;
      if (lean > 0) parts.push({ label: _t("{approach} leaning", { approach: APPROACHES[ap].label }), value: lean });
      else if (lean < 0) parts.push({ label: _t("no {approach} leaning — foreign ground", { approach: APPROACHES[ap].label }), value: lean }); }
    parts.push(...TSLTalk.bondParts(src, npc, ap, skill));
    if (lever) parts.push({ label: lever === "desire" ? _t("their Desire") : lever === "price" ? _t("their Price") : _t("their Fear"), value: LEVER_BONUS });
    const helper = helperId ? game.actors.get(helperId) : null;
    if (helper && helper.id !== src.id) parts.push({ label: _t("help — {name}", { name: helper.name }), value: HELP_BONUS });
    parts.push(...TSLEmotions.rollParts(src, npc, technique, ap));
    const mod = parts.reduce((sum, p) => sum + p.value, 0);

    const dcInfo = TSLTalk.dcFor(npc, size);
    // THEIR bond toward the speaker is their guard (as before): a friend's is
    // down for you (DC −●), an enemy is wary (DC +●).
    { const theirs = TSLBondStore.find(npc.id, src.id);
      const gType = theirs ? SocialArchetypeManager.getBondType(theirs.type) : null;
      const n = theirs ? TSLBondStore.getStrength(npc.id, src.id) : 0;
      const g = (gType?.guard ?? 0) * n;
      if (g) {
        const data = { type: gType.label, dots: "●".repeat(n) };
        dcInfo.mods.push({ label: g < 0 ? _t("their guard is down for you — {type} {dots}", data) : _t("they're wary of you — {type} {dots}", data), value: g });
        dcInfo.dc += g;
      } }
    // Shut out (the Hermit's Silence): until a truth is brought them, every ask is 4 harder.
    if (sized && typeof TSLAbilities !== "undefined" && TSLAbilities.silenced(npc, src.id)) {
      dcInfo.mods.push({ label: _t("their silence"), value: 4 });
      dcInfo.dc += 4;
    }

    let blocked = null;
    if (!TSLTalk.isNpc(npc)) blocked = _t("You talk to NPCs — pick someone the GM plays.");
    else if (job === "ask" && size === "against" && !lever && !strings && bond < 2)
      blocked = _t("Something against their interests needs leverage: their Desire or Fear, a String on them, or a deep bond (●●) that runs this way — or go all in.");
    // All in is never locked (the user, 2026-11-13: «замок на шантажу лишній — вони ж можуть дізнатися цю
    // інформацію і від когось іншого»): what you hold over someone, or what they long for, may have come
    // from anyone — the table knows, the module needn't. Whether it bites is the GM's call; what IS on
    // record (their Fear, Desire, Price) adds its +2. `bare`: nothing of it on record yet — the form says so.
    const bare = (technique === "blackmail" && !known.fear && !strings) || (technique === "seduce" && !known.desire && tie < 2);

    return {
      technique, job, approach: ap, isRead: job === "read", sized, size, skill, support, backed, parts, mod, witnesses: sized && !!witnesses,
      helperId: helper && helper.id !== src.id ? helper.id : null,
      lever, leverOk, strings, known, points, tie, bare,
      dc: dcInfo.dc, dcBase: dcInfo.base, dcMods: dcInfo.mods, blocked,
    };
  }

  // ── The roll (speaker's client) ───────────────────────────────────────────

  static _grade(total, natural, dc) {
    if (natural === 20 || total >= dc + 5) return "strong";
    if (natural !== 1 && total >= dc) return "success";
    if (natural === 1 || total <= dc - 5) return "botch";
    return "failure";
  }

  /**
   * Use a technique. Returns the payload (also relayed to the GM) or null
   * when nothing happened (blocked, or the roll dialog was cancelled).
   */
  static async roll(src, npc, opts = {}) {
    const pv = TSLTalk.preview(src, npc, opts);
    if (pv.blocked) { ui.notifications?.warn?.(pv.blocked); return null; }
    if (!game.user.isGM && !game.users?.activeGM) {
      ui.notifications?.warn?.(_t("A GM must be connected to resolve a social roll — nothing was rolled or spent."));
      return null;
    }

    // 1) The d20 — through the system's own skill dialog when set, else ours.
    let total, dice, natural, systemRoll = false, rollData = null;
    if (TSLTalk.usesSystemRoll(src)) {
      const extra = pv.mod - pv.parts[0].value;   // the system adds the skill itself
      const msg = await src.rollSkillCheck(pv.skill, { skipRollDialog: !TSLTalk.showsSystemDialog(), situationalMods: extra ? `${extra >= 0 ? "+" : ""}${extra}` : "" });
      const r = msg?.rolls?.[0];
      if (!r) return null;                        // cancelled — nothing spent
      systemRoll = true;
      total = r.total;
      const results = r.dice?.[0]?.results ?? [];
      dice = results.map(x => x.result);
      const live = results.filter(x => x.active !== false && !x.discarded).map(x => x.result);
      natural = live.length ? live[0] : (dice[0] ?? null);
    } else {
      const r = new Roll(`1d20 + ${pv.mod}`);
      await r.evaluate();
      dice = r.dice[0].results.map(x => x.result);
      natural = dice[0];
      total = r.total;
      rollData = r.toJSON?.() ?? null;
    }

    // 2) Their nature — known only now. The key opens them (a second die,
    //    keep the better); the wall closes them (a second die, keep the worse).
    //    A wall doesn't stand while they carry an emotion that opens this way.
    const { rel } = TSLTalk.relationFor(src, npc, pv.approach);
    let natureDie = null;
    if (rel === "key" || rel === "wall") {
      const nr = new Roll("1d20");
      await nr.evaluate();
      natureDie = nr.total;
      const better = rel === "key" ? natureDie > natural : natureDie < natural;
      if (better) { total += natureDie - natural; natural = natureDie; }
    }
    // Against their wall your second skill doesn't back you — known, like the die, only now.
    const wallLost = rel === "wall" && pv.backed ? TSLTalk.profBonus(src) : 0;
    total -= wallLost;
    // Before witnesses, some natures bend and some harden — also known only now.
    const audience = pv.witnesses ? SocialArchetypeManager.audienceOf(npc) : 0;
    total += audience;

    // 3) The grade, and the gamble: burn a String for +5 after a miss.
    let grade = TSLTalk._grade(total, natural, pv.dc);
    let stringSpent = false;
    if ((grade === "failure" || grade === "botch") && natural !== 1 && pv.strings > 0
        && await TSLTalk.promptStringBurn(src, npc, total, pv.dc, pv.strings)) {
      if (await TSLStringStore.spend(src.id, npc.id)) {
        stringSpent = true;
        total += STRING_SPEND_BONUS;
        grade = TSLTalk._grade(total, natural, pv.dc);
      }
    }

    // 4) What the speaker decides: which questions (a read), or whether to
    //    pay their price (a "yes, but").
    let questions = [], paid = null, terms = false;
    if (pv.job === "read" && (grade === "strong" || grade === "success")) {
      // Chosen before the roll (the user, 2026-11-09): the first on a hit, the second too on a strong one.
      const open = TSLTalk.openQuestions(npc);
      const asked = (opts.questions ?? []).filter(q => open.includes(q));
      questions = asked.length ? asked.slice(0, grade === "strong" ? 2 : 1) : await TSLTalk.promptQuestions(npc, grade === "strong" ? 2 : 1);
    } else if (grade === "success" && TSLTalk.hasPrice(pv.technique)) {
      paid = await TSLTalk.promptPrice(npc, TSLTalk.priceOf(npc), { deal: pv.technique === "bargain" });
    } else if (grade === "strong" && TSLTalk.hasPrice(pv.technique) && pv.technique !== "bargain") {
      // A strong yes still has their price on it: pay it and keep the String the win is worth —
      // or put that String on it and have it on your terms. With no String to win (one on them
      // already, or one burned on this roll), the win itself buys the terms.
      const noString = stringSpent || TSLStringStore.isCapped(src.id, npc.id);
      paid = noString ? false : await TSLTalk.promptPrice(npc, TSLTalk.priceOf(npc), { strong: true });
      terms = !paid;
    }

    const payload = {
      srcId: src.id, npcId: npc.id, technique: pv.technique, approach: pv.approach, job: pv.job,
      size: pv.size, skill: pv.skill, helperId: pv.helperId, lever: pv.lever, parts: pv.parts, mod: pv.mod,
      total, natural, dice, natureDie, rel, dc: pv.dc, grade, stringSpent, systemRoll, rollData,
      questions, paid, terms, witnesses: pv.witnesses, audience, support: pv.support, wallLost,
    };
    // The GM applies it (directly when the GM rolled, through the relay for a player).
    await TSLGMActions.request("talkResolve", payload);
    return payload;
  }

  // ── Prompts ───────────────────────────────────────────────────────────────

  static async promptStringBurn(src, npc, total, dc, held) {
    return new Promise(resolve => {
      new Dialog({
        title: _t("{name} — not quite…", { name: src.name }),
        content: `<div class="tsl-dlg">
          <p>${_t("{total} against DC {dc}. You hold <b>{held}</b> String(s) on {name}.", { total, dc, held, name: foundry.utils.escapeHTML(npc.name) })}</p>
          <p class="notes">${_t("Burn one for +{bonus}?", { bonus: STRING_SPEND_BONUS })}</p></div>`,
        buttons: {
          burn: { icon: '<i class="fas fa-masks-theater"></i>', label: _t("Burn a String (+{bonus})", { bonus: STRING_SPEND_BONUS }), callback: () => resolve(true) },
          keep: { label: _t("Let it stand"), callback: () => resolve(false) },
        },
        default: total + STRING_SPEND_BONUS >= dc ? "burn" : "keep",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
  }

  /** One pick among labelled options; resolves to the option (default: the first). */
  static async _pickOne(title, intro, options) {
    if (!options.length) return null;
    return new Promise(resolve => {
      const buttons = {};
      options.forEach((o, i) => { buttons[`o${i}`] = { label: o.label, callback: () => resolve(o) }; });
      new Dialog({
        title,
        content: `<div class="tsl-dlg"><p>${intro}</p></div>`,
        buttons,
        default: "o0",
        close: () => resolve(options[0]),
      }, tslDialogOptions()).render(true);
    });
  }

  /** The questions a Read can still ask about them (the mask only when they show a face). */
  static openQuestions(npc) {
    const known = SocialArchetypeManager.getKnown(npc);
    const shows = !!SocialArchetypeManager.getShown(npc);
    return [...READ_ORDER.filter(q => !known[q] && (q !== "mask" || shows)), ...READ_MOMENT];
  }

  /** A read: which questions (1, or 2 on a strong hit) among those still unanswered. */
  static async promptQuestions(npc, n) {
    const picked = [];
    for (let i = 0; i < n; i++) {
      const options = TSLTalk.openQuestions(npc).filter(q => !picked.includes(q)).map(q => ({ q, label: READ_QUESTIONS[q].label }));
      if (!options.length) break;
      const title = n > 1 ? _t("Read {name} ({i} of {n})", { name: npc.name, i: i + 1, n }) : _t("Read {name}", { name: npc.name });
      const o = await TSLTalk._pickOne(title, _t("What do you look for?"), options);
      if (!o) break;
      picked.push(o.q);
    }
    return picked;
  }

  /**
   * "Yes, but": they name their price — pay it, or walk away from the deal.
   * `strong`: a big win — the String it's worth can go on the price instead
   * ("on my terms": no price, no String), or you pay and keep the String.
   * Resolves true when the price is paid.
   */
  static async promptPrice(npc, price, { deal = false, strong = false } = {}) {
    const esc = foundry.utils.escapeHTML;
    if (strong) return new Promise(resolve => {
      new Dialog({
        title: _t("{name} — yes. On whose terms?", { name: npc.name }),
        content: `<div class="tsl-dlg"><p>${_t("A strong win: it's worth a <b>String</b> on them. Their price still stands:")}</p>
          <p class="tsl-dlg-price">${esc(price.text)}</p>
          <p class="notes">${_t("Pay it and keep the String — or put the String on it: on your terms, no price.")}${price.string ? ` ${_t("Paying it hands them a String on you.")}` : ""}</p></div>`,
        buttons: {
          terms: { icon: '<i class="fas fa-crown"></i>', label: _t("On my terms — no String"), callback: () => resolve(false) },
          pay:   { icon: '<i class="fas fa-handshake"></i>', label: _t("Pay it — keep the String"), callback: () => resolve(true) },
        },
        default: "terms",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
    return new Promise(resolve => {
      new Dialog({
        title: _t("{name} — yes, but…", { name: npc.name }),
        content: `<div class="tsl-dlg"><p>${deal ? _t("They'll agree — on their terms:") : _t("They'll do it — for a price:")}</p>
          <p class="tsl-dlg-price">${esc(price.text)}</p>
          ${deal ? `<p class="notes">${_t("You give your word: they hold a String on you until you deliver. Keep it, and it goes; break it, and yours on them burns.")}</p>`
            : price.string ? `<p class="notes">${_t("Paying it hands them a String on you.")}</p>` : ""}</div>`,
        buttons: {
          pay:  { icon: '<i class="fas fa-handshake"></i>', label: deal ? _t("Give your word") : _t("Pay it"), callback: () => resolve(true) },
          walk: { label: _t("Walk away"), callback: () => resolve(false) },
        },
        default: "pay",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
  }

  // ── Consequences (GM client) ──────────────────────────────────────────────

  /** The answer to a read question, from the dossier first, then the nature. */
  static answerFor(npc, q) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    const pts  = SocialArchetypeManager.getCharacterNotes(npc).points;
    switch (q) {
      case "truth": return _t("The GM answers straight: what they just said is true — or it isn't.");
      case "intent": return SocialArchetypeManager.getCharacterNotes(npc).intent || _t("The GM tells you what they're after.");
      case "desire": return pts.desire || arch?.craves || _t("Nothing they let show — the GM describes it.");
      case "fear":   return pts.fear   || arch?.dreads || _t("Nothing they let show — the GM describes it.");
      case "key":    return arch ? `${APPROACHES[arch.key].label} — ${arch.keyText}` : _t("Nothing in particular — no approach opens them more than another.");
      case "wall":   return arch ? `${APPROACHES[arch.wall].label} — ${arch.wallText}` : _t("Nothing in particular — no approach closes them.");
      case "price":  return TSLTalk.priceOf(npc).text;
      case "pressed": {
        const st = SocialArchetypeManager.getStance(npc);
        const why = arch?.pressedWhy && (SocialArchetypeManager.getActorData(npc).stance ?? "nature") === "nature" ? ` — ${arch.pressedWhy}` : "";
        return st === "firm" ? _t("Refuse them something big and they end it{why}.", { why })
             : st === "yield" ? _t("They keep listening after a no{why}.", { why })
             : _t("It could go either way.");
      }
      case "mask": {
        if (!SocialArchetypeManager.getShown(npc)) return _t("They show nothing — no face to see through.");
        const mask = SocialArchetypeManager.getMask(npc);
        return mask ? _t("It's a mask — they only play the {mask}. Whoever they are underneath, it isn't that.", { mask: mask.label })
          : _t("It's their true face — what you see is who they are.");
      }
      case "audience": {
        if (!arch) return _t("Witnesses change nothing for them.");
        return arch.audience > 0 ? _t("They bend before witnesses — {why}.", { why: arch.audienceWhy })
             : arch.audience < 0 ? _t("They harden before witnesses — {why}.", { why: arch.audienceWhy })
             : _t("Witnesses change nothing — {why}.", { why: arch.audienceWhy });
      }
    }
    return "";
  }

  /**
   * Apply a roll. GM client only — players reach it through the relay.
   * Emotions, Strings, bonds, lies and party knowledge change here; one card
   * is posted.
   */
  static async resolve(p) {
    if (!game.user.isGM) return;
    const src = game.actors.get(p?.srcId), npc = game.actors.get(p?.npcId);
    const tech = TECHNIQUES[p?.technique];
    if (!src || !npc || !tech) return;
    const esc = foundry.utils.escapeHTML;
    const ap = approachOf(tech.id, p.approach), job = tech.job;
    const { rel, down: wallDown } = TSLTalk.relationFor(src, npc, ap);   // the truth, not the payload's word
    const arch = SocialArchetypeManager.getArchetype(npc);
    const known = SocialArchetypeManager.getKnown(npc);
    const knownPatch = {};
    const tells = [];   // what a Read caught of what they hide: the GM lets it show (a whisper, after the card)
    const lines = [];
    const note = (html, tone = "") => lines.push({ html, tone });
    const sized = job === "ask" || job === "gambit";

    // Their hold on the speaker: the triad's move at the roll — the GM's call,
    // after the dice. Emotion's and Order's bite only a win that stands; Order's
    // only where no price was paid already.
    let npcMove = null;
    if (sized && arch && typeof TRIAD_MOVES !== "undefined" && TSLStringStore.countOn(npc.id, src.id) > 0) {
      const move = TRIAD_MOVES[arch.triad];
      // A price is in play on a plain yes — and on a strong one the speaker chose to pay.
      const priced = TSLTalk.hasPrice(tech.id) && (p.grade === "success" || (p.grade === "strong" && !!p.paid));
      const won = (p.grade === "strong" || p.grade === "success") && !(priced && !p.paid);
      const fits = move && (move.on === "any" || (move.id === "my-terms" ? won && !priced : won));
      if (fits && await TSLAbilities.promptMove(npc, src, move, p) && await TSLStringStore.spend(npc.id, src.id)) {
        npcMove = move.id;
        note(_t("{npc} pulls their String on {you}: <b>{move}</b>.", { npc: esc(npc.name), you: esc(src.name), move: esc(move.name) }), "bad");
        if (move.id === "strike-back") {
          const was = p.grade;
          p.total -= 5;
          p.grade = TSLTalk._grade(p.total, p.natural, p.dc);
          // A strong yes cut to a plain one: they name their price now, and it's paid.
          if (was === "strong" && p.grade === "success" && TSLTalk.hasPrice(tech.id)) p.paid = true;
        }
      }
    }
    const hit = p.grade === "strong" || p.grade === "success";
    const ask = sized ? ASK_SIZES[p.size] ?? ASK_SIZES.costly : null;
    const big = !!ask && ask.dc >= 0;   // costly or against
    const witnesses = sized && !!p.witnesses;
    const firm = SocialArchetypeManager.getStance(npc) === "firm";
    const who = esc(npc.name), you = esc(src.name);
    let ended = false, granted = false;
    let onTerms = false;      // a strong yes whose String went on their price instead ("on my terms")
    // A Seduce that leaned on what's between you (a bond of ●●+, their Desire not played on): refused, it's heartbreak.
    const heartbreak = tech.id === "seduce" && p.lever !== "desire" && TSLBondStore.getStrength(src.id, npc.id) >= 2;
    let stringOnYou = null;   // why they take a String on the speaker — at most one per roll
    let stringOnThem = null;  // why the speaker takes one on them — at most one per roll
    const feel = async (actor, emo, opts = {}) => {
      const r = await TSLEmotions.add(actor, emo, opts);
      const name = esc(actor.name);
      if (r?.added) note(_t("{img} {name} is <b>{emotion}</b> ({spoils}) — until it is let go.", {
        img: `<img class="tsl-emo-ico" src="${EMOTIONS[emo].img}" alt="">`, name, emotion: EMOTIONS[emo].label, spoils: esc(EMOTIONS[emo].spoilsText) }), "bad");
      else if (r?.scar) note(_t("{img} {name} was already {emotion} — it leaves a scar: <b>{scar}</b>. {text}", {
        img: `<img class="tsl-emo-ico" src="icons/svg/blood.svg" alt="">`, name, emotion: EMOTIONS[emo].label, scar: SCARS[r.scar].label, text: esc(SCARS[r.scar].text) }), "bad");
      return r;
    };

    // The die showed their nature — now the party knows it.
    if (rel === "key") {
      if (!known.key) knownPatch.key = true;
      note(_t("{icon} <b>{approach}</b> is their key — advantage, the better of two dice.", { icon: `<i class="fas fa-key"></i>`, approach: APPROACHES[ap].label }), "good");
    } else if (rel === "wall") {
      if (!known.wall) knownPatch.wall = true;
      note(_t("{icon} <b>{approach}</b> is their wall — disadvantage, the worse of two dice.", { icon: `<i class="fas fa-door-closed"></i>`, approach: APPROACHES[ap].label }), "bad");
    } else if (wallDown && known.wall) {
      // The party knows this is their wall — and sees why it didn't stand. (Unknown, the dice show nothing.)
      note(_t("{icon} <b>{approach}</b> is their wall — but they're {emotion}: it doesn't stand. A normal roll.", { icon: `<i class="fas fa-door-open"></i>`, approach: APPROACHES[ap].label, emotion: EMOTIONS[wallDown].label }), "good");
    }
    // And so did the room.
    if (witnesses && arch) {
      if (!known.audience) knownPatch.audience = true;
      const icon = `<i class="fas fa-users"></i>`;
      if (p.audience > 0) note(_t("{icon} Before witnesses they bend (+{n}) — {why}.", { icon, n: p.audience, why: arch.audienceWhy }), "good");
      else if (p.audience < 0) note(_t("{icon} Before witnesses they harden (−{n}) — {why}.", { icon, n: -p.audience, why: arch.audienceWhy }), "bad");
      else note(_t("{icon} Witnesses change nothing for them — {why}.", { icon, why: arch.audienceWhy }), "");
    }

    switch (job) {
      case "read": {
        if (hit) {
          for (const q of (p.questions ?? []).filter(id => READ_QUESTIONS[id])) {
            if (READ_DEPTH.includes(q)) {
              // What they hide isn't told: the GM lets it show, and the players name it.
              if (!known[q]) tells.push(q);
              note(_t("{icon} <b>{question}</b> You catch something — the GM lets it show now. Watch them, and say what you think it is.", { icon: `<i class="fas fa-eye"></i>`, question: READ_QUESTIONS[q].label }), "good");
              continue;
            }
            if (!READ_MOMENT.includes(q)) knownPatch[q] = true;
            note(`<i class="fas fa-eye"></i> <b>${READ_QUESTIONS[q].label}</b> ${esc(TSLTalk.answerFor(npc, q))}`, "good");
          }
          if (!(p.questions ?? []).length) note(`<i class="fas fa-eye"></i> ${_t("They have nothing left to hide from you.")}`, "");
        } else {
          note(_t("They notice you studying them — they won't let you read them again this scene."), "bad");
        }
        break;
      }

      case "ask": {
        if (p.grade === "strong") {
          granted = true;
          if (!TSLTalk.hasPrice(tech.id)) {
            note(_t("{who} does it.", { who }), "good");
          } else {
            // Their price stands on a strong yes too: paid — and the String kept; or the String put on it.
            const price = TSLTalk.priceOf(npc);
            if (!known.price) knownPatch.price = true;
            if (p.paid) {
              note(_t("{who} does it — for a price: <i>{price}</i>", { who, price: esc(price.text) }), "good");
              if (price.string) stringOnYou = _t("Paid — a debt to them");
              else note(_t("{you} pays it — and keeps what the win is worth.", { you }), "");
            } else if (npcMove === "my-terms") {
              note(_t("{who} does it.", { who }), "good");   // their move sets the terms — said below
            } else {
              onTerms = true;
              note(_t("{who} does it — on {you}'s terms. The String this win was worth went on their price: <i>{price}</i>", { who, you, price: esc(price.text) }), "good");
            }
          }
        } else if (p.grade === "success") {
          if (!TSLTalk.hasPrice(tech.id)) {
            granted = true;
            note(_t("{who} gives in — no price.", { who }), "good");
          } else {
            const price = TSLTalk.priceOf(npc);
            if (!known.price) knownPatch.price = true;
            if (p.paid) {
              granted = true;
              note(_t("{who} does it — for a price: <i>{price}</i>", { who, price: esc(price.text) }), "good");
              if (price.string) stringOnYou = _t("Paid — a debt to them");
              else note(_t("{you} pays it.", { you }), "");
            } else {
              note(_t("{who} named a price — <i>{price}</i> — and {you} walked away from the deal.", { who, you, price: esc(price.text) }), "");
            }
          }
        } else {
          note(_t("{who} says no.", { who }), "bad");
          if (arch?.press) note(`<i>${esc(arch.press)}</i>`, "");
          if (ap === "heart") stringOnYou = _t("You showed your heart");
          else if (p.lever === "fear") stringOnYou = _t("A threat cuts both ways");
        }
        if (granted && ap === "pressure") {
          note(_t("They gave in — and they will remember who made them."), "");
          stringOnYou = _t("They'll pay you back");
        }
        break;
      }

      case "gambit": {
        // A Deal on their terms: give your word, or walk away.
        const onTheirTerms = tech.id === "bargain" && (p.grade === "success" || npcMove === "my-terms");
        if (onTheirTerms && !known.price) knownPatch.price = true;
        if (onTheirTerms && !p.paid && npcMove !== "my-terms") {
          note(_t("{who} named a price — <i>{price}</i> — and {you} walked away from the deal.", { who, you, price: esc(TSLTalk.priceOf(npc).text) }), "");
        } else if (hit) {
          granted = true;
          if (tech.id === "blackmail") {
            note(_t("{who} does it — with your hand at their throat.", { who }), "good");
            note(_t("They'll never forgive it. If they're your Enemy now, the GM sets it in Bonds."), "bad");
            await feel(npc, "frightened", { by: src.id });
            stringOnYou = _t("They'll pay you back");
          } else if (tech.id === "seduce") {
            note(_t("{who} does it — for you.", { who }), "good");
            // All in always binds you: closeness cuts both ways.
            note(_t("You let them close to get it — and they know it."), "");
            stringOnYou = _t("You let them close");
          } else if (tech.id === "bargain") {
            note(onTheirTerms ? _t("{who} agrees — on their terms: <i>{price}</i>", { who, price: esc(TSLTalk.priceOf(npc).text) }) : _t("{who} agrees — on your terms.", { who }), "good");
            // Your word goes on record, and they hold you to it until the GM says how it ended.
            await npc.setFlag(TALK_SCOPE, "deals", [...TSLTalk.deals(npc), { id: foundry.utils.randomID(), byId: src.id, price: onTheirTerms, at: Date.now() }]);
            note(`<i class="fas fa-handshake"></i> ${_t("Your word is on record — keep it, and their String on you goes; break it, and yours on them burns.")}`, "");
            stringOnYou = _t("You gave your word");
          } else {
            note(_t("{who} believes it — and acts on it.", { who }), "good");
            const lies = TSLTalk.lies(npc);
            lies.push({ id: foundry.utils.randomID(), byId: src.id, at: Date.now() });
            await npc.setFlag(TALK_SCOPE, "lies", lies);
            note(`<i class="fas fa-mask"></i> ${_t("The lie holds — for now. (The GM can bring it out later.)")}`, "");
          }
        } else {
          if (arch?.press) note(`<i>${esc(arch.press)}</i>`, "");
          if (tech.id === "blackmail") {
            note(_t("{who} calls your bluff.", { who }), "bad");
            stringOnYou = _t("They know you'd stoop to it");
          } else if (tech.id === "seduce") {
            // Played on what they want: they turn it down. Leaned on what's between you: heartbreak. On charm alone: a no.
            note(heartbreak ? _t("{who} pulls away — heartbreak.", { who })
              : p.lever === "desire" ? _t("{who} sees what you're holding out — and turns it down.", { who })
              : _t("{who} isn't charmed.", { who }), "bad");
            stringOnYou = _t("You showed your heart");
          } else if (tech.id === "bargain") {
            note(_t("{who} turns the deal down.", { who }), "bad");
          } else {
            note(_t("{who} catches the lie.", { who }), "bad");
            stringOnYou = _t("Caught lying");
            ended = true;
            note(_t("They're done talking — that door is closed for this scene."), "bad");
          }
        }
        break;
      }
    }

    // Pressure on someone close — a friend, your own, a lover — wins, and leaves you Guilty toward them.
    // So does getting them to act against themselves, whatever the way: you used what's between you.
    const tie = TSLBondStore.find(src.id, npc.id);
    const close = SocialArchetypeManager.getBondType(tie?.type).guilt && TSLBondStore.getStrength(src.id, npc.id) > 0;
    if (granted && close && (ap === "pressure" || (sized && p.size === "against"))) {
      note(ap === "pressure" ? _t("You pressed someone close to you.") : _t("You had someone close to you act against themselves."), "bad");
      await feel(src, "guilty", { by: npc.id, toward: npc.id });
    }

    // Their move at the roll, when the win stands: the price, or the emotion.
    if (granted && npcMove === "my-terms" && tech.id !== "bargain") {
      if (!known.price) knownPatch.price = true;
      note(_t("On their terms — {who} names their price, and it's paid: <i>{price}</i>", { who, price: esc(TSLTalk.priceOf(npc).text) }), "bad");
    }
    if (granted && npcMove === "feel-it" && arch?.hurts) await feel(src, arch.hurts, { by: npc.id, toward: arch.hurts === "guilty" ? npc.id : null });

    // Any miss: the nature hits back; before witnesses you lose face too; a
    // bad one costs you a String; a proud one, refused something big, is done.
    if (!hit) {
      // The nature hits back with its own emotion — anything but a Read.
      // A Seduce that leaned on what's between you breaks your heart; one that played on their Desire, or went on charm alone, is just a no.
      const emo = heartbreak ? "hopeless" : job === "read" ? null : arch?.hurts;
      if (emo) await feel(src, emo, { by: npc.id, toward: emo === "guilty" ? npc.id : null });
      if (witnesses && emo !== "insecure") {
        note(tech.id === "deceive" ? _t("Caught before witnesses — {you} loses face.", { you }) : _t("Refused before witnesses — {you} loses face.", { you }), "bad");
        await feel(src, "insecure", { by: npc.id });
      }
      if (p.grade === "botch" && !stringOnYou) stringOnYou = _t("It costs you");
      if (sized && big && firm && !ended) {
        ended = true;
        note(_t("They're done talking — that door is closed for this scene."), "bad");
        if (!known.pressed) knownPatch.pressed = true;
      }
    }
    // ── Strings: the stake of the roll, the same for both sides ──
    // A strong win (5 over, or a 20) gives the speaker one on them; a bad miss
    // (5 under, or a 1) gives them one on the speaker. A win's own cost — they
    // remember a threat, they hold your word, a price that is a debt — hands
    // them one on any win. A roll on which either side spent a String moves
    // none: it was used. A Read moves none. One each way, one at a time.
    // Three ways, three costs: Pressure pays when it wins (they remember), Reason
    // pays the price — and the heart pays when it loses: any miss of an ask or an
    // all-in from the heart shows them yours. A lie that works is no hold on
    // anyone: they believe something false, and that isn't leverage.
    const spentHere = !!p.stringSpent || !!npcMove;
    const exposed = !hit && tech.approach === "heart";
    if (!sized || spentHere) { stringOnThem = null; stringOnYou = null; }
    else if (granted) { if (p.grade === "strong" && !onTerms && tech.id !== "deceive") stringOnThem = TSLTalk._winHold(tech.id); }
    else if (!hit) stringOnYou = p.grade === "botch" ? (stringOnYou ?? _t("They have something on you now")) : exposed ? _t("You showed your heart") : null;
    if (stringOnThem) {
      const n = await TSLStringStore.add(src.id, npc.id, 1);
      note(n ? _t("{why} — {you} takes a <b>String</b> on them.", { why: stringOnThem, you })
        : _t("{why} — but {you} already holds a String on them: one at a time.", { why: stringOnThem, you }), n ? "good" : "");
    }
    if (stringOnYou) {
      const n = await TSLStringStore.add(npc.id, src.id, 1);
      note(n ? _t("{why}: they take a <b>String</b> on {you}.", { why: stringOnYou, you })
        : _t("{why} — but they already hold a String on {you}: one at a time.", { why: stringOnYou, you }), n ? "bad" : "");
    }
    if (sized && spentHere) note(_t("A String was spent on this roll — no String moves after it."), "");
    if (p.stringSpent) note(_t("{you} burned a String on them (+{bonus}).", { you, bonus: STRING_SPEND_BONUS }), "");

    // What the party learned — and once they know the key AND the wall, the
    // nature is named to the table, and any mask falls.
    if (Object.keys(knownPatch).length) await SocialArchetypeManager.setKnown(npc, knownPatch);
    const nowKnown = SocialArchetypeManager.getKnown(npc);
    const openFace = !!SocialArchetypeManager.getShown(npc) && !SocialArchetypeManager.getMask(npc);
    if (arch && ((nowKnown.key && nowKnown.wall) || (nowKnown.mask && openFace)) && !SocialArchetypeManager.isRevealed(npc)) {
      await SocialArchetypeManager.setRevealed(npc, true);
      note(_t("{icon} Figured out: they're a <b>{nature}</b> — {description}", { icon: `<i class="fas fa-user-check"></i>`, nature: esc(arch.label), description: esc(arch.description) }), "good");
      const mask = SocialArchetypeManager.getMask(npc);
      if (mask) note(_t("{icon} The mask falls: they only played the {mask}.", { icon: `<i class="fas fa-mask"></i>`, mask: esc(mask.label) }), "good");
      else if (openFace) note(_t("{icon} No mask — what they show is who they are.", { icon: `<i class="fas fa-mask"></i>` }), "good");
    }

    const reaction = rel === "key" && hit && arch ? SocialArchetypeManager.pickReaction(arch.id) : null;
    // A Read that hits also notices one thing they can't help showing — a sign of who they really are
    // (one of 40 per nature; under a mask, the true one). Evidence for the table, never the name.
    const sign = job === "read" && hit && arch ? SocialArchetypeManager.pickTell(arch.id) : null;
    let rolls = [];
    if (!p.systemRoll && p.rollData) {
      try { rolls = [Roll.fromData(p.rollData)]; } catch { rolls = []; }
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: src }),
      content: TSLTalk._card({ p, tech, src, npc, rel, lines, reaction, sign }),
      rolls,
    });
    if (tells.length) await TSLTalk._tellCard(npc, src, tells);
    TSLTalk._pulse({ srcId: src.id, tgtId: npc.id, technique: tech.id, approach: ap, job, grade: p.grade, paid: p.paid, rel, ended, granted, witnesses });
    // A lie they believe unravels when its teller slips badly in front of them: a bad miss against
    // them brings it out by itself — the GM needn't remember to (reading them stays safe).
    if (p.grade === "botch" && job !== "read") {
      const lie = TSLTalk.lies(npc).find(l => l.byId === src.id);
      if (lie) await TSLTalk.exposeLie(npc, lie.id);
    }
  }

  // ── What they hide: the GM lets it show, the players name it ────────────────

  /** How to let it show, without saying it. */
  static tellHow(q) {
    switch (q) {
      case "desire": return _t("Let them reach for it: a glance that lingers, a question too eager, a hand that hesitates.");
      case "fear":   return _t("Let them flinch from it: a change of subject, a laugh too quick, anger out of nowhere.");
      case "price":  return _t("Let them hint at it: what they'd never ask for, a favour they mention twice.");
      default:       return "";
    }
  }

  /** The GM's whisper after a Read caught something hidden: what it is, how to play it, and the button for when they name it. */
  static _tellCardHTML(npc, src, qs) {
    const esc = foundry.utils.escapeHTML;
    const known = SocialArchetypeManager.getKnown(npc);
    const rows = qs.map(q => `<li class="tsl-x-after-item tsl-tell">
        <div><b>${esc(READ_QUESTIONS[q].short)}</b> — <i>${esc(TSLTalk.answerFor(npc, q))}</i></div>
        <div class="tsl-tell-how">${esc(TSLTalk.tellHow(q))}</div>
        ${known[q] ? `<div class="tsl-tell-done"><i class="fas fa-check"></i> ${_t("Named — the party knows it now.")}</div>`
          : `<button type="button" class="tsl-tell-btn" data-tsl-tell="${q}"><i class="fas fa-check"></i> ${_t("They named it — mark it known")}</button>`}
      </li>`).join("");
    return `<div class="tsl-x-card tsl-x-card--slim">
      <div class="tsl-x-head"><i class="fas fa-eye"></i><span class="tsl-x-title">${_t("Let it show — {name}", { name: esc(npc.name) })}</span></div>
      <div class="tsl-x-who">${_t("For the GM only. {who} looked closely: play it in the scene, don't say it. When the players name it, mark it.", { who: esc(src?.name ?? "") })}</div>
      <ul class="tsl-x-after">${rows}</ul>
    </div>`;
  }

  static async _tellCard(npc, src, qs) {
    const gms = (game.users?.filter?.(u => u.isGM) ?? []).map(u => u.id);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      whisper: gms,
      content: TSLTalk._tellCardHTML(npc, src, qs),
      flags: { [TALK_SCOPE]: { tell: { npcId: npc.id, byId: src?.id ?? null, qs } } },
    });
  }

  /** The players named what the GM let show: it's the party's now (the GM's client). */
  static async nameTell(npcId, q, byId = null) {
    if (!game.user?.isGM || !READ_DEPTH.includes(q)) return false;
    const npc = game.actors.get(npcId);
    if (!npc || SocialArchetypeManager.getKnown(npc)[q]) return false;
    await SocialArchetypeManager.setKnown(npc, { [q]: true });
    const esc = foundry.utils.escapeHTML;
    const by = byId ? game.actors.get(byId) : null;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: by ?? npc }),
      content: `<div class="tsl-x-card tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-eye"></i><span class="tsl-x-title">${_t("Named: {name}'s {fact}", { name: esc(npc.name), fact: esc(READ_QUESTIONS[q].short) })}</span></div>
        <div class="tsl-x-who">${_t("The party saw it, and said it. It's on record now — see what the party knows, in Talk.")}</div>
      </div>`,
    });
    return true;
  }

  /** The whisper's button (the GM's alone): they named it — mark it, and the card says so. */
  static bindTellCard(message, html) {
    const f = message?.getFlag?.(TALK_SCOPE, "tell");
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!f || !root) return;
    const npc = game.actors.get(f.npcId);
    root.querySelectorAll("[data-tsl-tell]").forEach(btn => {
      if (!game.user.isGM || !npc) { btn.remove(); return; }
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        btn.disabled = true;
        await TSLTalk.nameTell(f.npcId, btn.dataset.tslTell, f.byId);
        await message.update({ content: TSLTalk._tellCardHTML(npc, f.byId ? game.actors.get(f.byId) : null, f.qs ?? []) });
      });
    });
  }

  /** Why a win gives the speaker a String on them. */
  static _winHold(id) {
    switch (id) {
      case "demand":    return _t("They gave in to you");
      case "blackmail": return _t("You have them by the throat");
      case "appeal":    return _t("They opened up to you");
      case "seduce":    return _t("They let you in");
      case "argument":  return _t("They took your word for it");
      case "bargain":   return _t("The deal binds them too");
      case "deceive":   return _t("They believe you");
      default:          return _t("It cost them more than they show");
    }
  }

  static _bondLine(a, b, s) {
    const esc = foundry.utils.escapeHTML;
    const type = SocialArchetypeManager.getBondType(s.type).label;
    const dots = "●".repeat(s.strength) || "○";
    const data = { a: esc(a.name), b: esc(b.name), type: esc(type), dots };
    if (s.turned) return _t("{a} and {b}: <b>{type}</b> now ({dots}).", data);
    if (s.created) return _t("A bond begins: <b>{type}</b> ({dots}).", data);
    if (s.delta > 0) return s.hostile ? _t("Their bond ({type}) hardens to {dots}.", data) : _t("Their bond ({type}) deepens to {dots}.", data);
    return s.hostile ? _t("Their bond ({type}) eases to {dots}.", data) : _t("Their bond ({type}) cools to {dots}.", data);
  }

  // ── The card ──────────────────────────────────────────────────────────────

  static _card({ p, tech, src, npc, rel, lines, reaction, sign }) {
    const esc = foundry.utils.escapeHTML;
    const ap = APPROACHES[approachOf(tech.id, p.approach)];
    const sized = tech.job === "ask" || tech.job === "gambit";
    const title = `${ap ? `${ap.label} · ` : ""}${tech.label}${sized ? ` · ${(tech.anyWay ? TSLTalk.lieSize(p.size) : ASK_SIZES[p.size])?.short ?? ""}` : ""}`;
    const tag = rel === "key" ? `<span class="tsl-x-tag tsl-x-tag--key"><i class="fas fa-key"></i> ${_t("Key")}</span>`
      : rel === "wall" ? `<span class="tsl-x-tag tsl-x-tag--wall"><i class="fas fa-door-closed"></i> ${_t("Wall")}</span>` : "";
    let kept = false;
    const die = (d, extra = "") => {
      const k = !kept && d === p.natural;
      if (k) kept = true;
      return `<span class="tsl-x-die ${k ? "" : "tsl-x-die--dropped"} ${extra}">${d}</span>`;
    };
    const diceHTML = [
      ...(p.dice ?? []).map(d => die(d)),
      ...(p.natureDie != null ? [die(p.natureDie, rel === "key" ? "tsl-x-die--key" : "tsl-x-die--wall")] : []),
    ].join("");
    const base = (p.parts ?? []).find(x => x.base);
    const pill = (value, label) => `<span class="tsl-x-bonus ${value < 0 ? "tsl-x-bonus--neg" : ""}">${value >= 0 ? "+" : "−"}${Math.abs(value)} ${esc(label)}</span>`;
    const bonus = (p.parts ?? []).filter(x => !x.base).map(x => pill(x.value, x.label)).join("")
      + (p.wallLost ? pill(-p.wallLost, _t("{skill} doesn't help: their wall", { skill: SKILL_LABELS[p.support] ?? p.support })) : "")
      + (p.audience ? pill(p.audience, _t("before witnesses")) : "")
      + (p.stringSpent ? pill(STRING_SPEND_BONUS, _t("String")) : "");
    return `<div class="tsl-x-card tsl-x--${p.grade}">
      <div class="tsl-x-head"><i class="fas ${ap?.icon ?? TECH_JOBS[tech.job]?.icon ?? "fa-comments"}"></i><span class="tsl-x-title">${esc(title)}</span>${tag}${p.witnesses ? `<span class="tsl-x-tag tsl-x-tag--public" data-tooltip="${esc(_t("Before witnesses"))}"><i class="fas fa-users"></i></span>` : ""}</div>
      <div class="tsl-x-who">${esc(src.name)} → ${esc(npc.name)}</div>
      <div class="tsl-x-roll">${diceHTML}
        <span class="tsl-x-mod">${p.systemRoll ? _t("system check") : `${(base?.value ?? 0) >= 0 ? "+" : "−"}${Math.abs(base?.value ?? 0)} ${esc(SKILL_LABELS[p.skill] ?? p.skill)}`}</span>
        <span class="tsl-x-eq">=</span><span class="tsl-x-total">${p.total}</span>
        <span class="tsl-x-vs">${_t("vs DC {dc}", { dc: p.dc })}</span></div>
      ${bonus ? `<div class="tsl-x-bonuses">${bonus}</div>` : ""}
      <div class="tsl-x-outcome">${esc(TSLTalk.gradeLabel(tech.id, p.grade))}</div>
      ${reaction ? `<div class="tsl-x-flavour">${esc(reaction)}</div>` : ""}
      ${sign ? `<div class="tsl-x-flavour tsl-x-sign"><i class="fas fa-fingerprint"></i> <b>${_t("You notice:")}</b> ${esc(sign)}</div>` : ""}
      ${lines.length ? `<ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item ${l.tone ? `tsl-x-after--${l.tone}` : ""}">${l.html}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  /** Tell the Scene (every client) what just happened. */
  static _pulse(data) {
    try { if (typeof TSLSocket !== "undefined") TSLSocket.broadcastPulse(data); }
    catch (err) { console.warn("TSL | pulse failed:", err); }
  }
}
