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
 * Seven MANEUVERS — what the words really were. Each is a pair of D&D skills:
 * the better one rolls, through the system's own check; the other backs it
 * (+2 if you're trained in it).
 *   ASK    — Demand · Appeal · Deal, sized by what it costs THEM;
 *   ALL IN — Blackmail · Seduce, on leverage;
 *   A LIE  — Deceive. Not a way of coming at someone, but something you can
 *            tell any way — a threat, a plea, proof: it takes the approach it
 *            was told in, and their key and wall count for that;
 *   READ   — when the talk doesn't show it: one straight answer.
 *
 * What winning costs depends on the approach:
 *   Pressure — they give in without a price, but remember it: the bond sours,
 *              and they take a String on you.
 *   Heart    — the bond warms; but a miss exposes you: a String on you.
 *   Reason   — you give your word: they do it, and you owe them (a String on
 *              you) until you deliver. Kept — Allies; broken — Enemies. The
 *              GM marks which, on the NPC's Talk tab.
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
  read:   { id: "read",   label: "Read",   icon: "fa-eye",          hint: "When the talk doesn't show it — what they hide, the face they wear: one straight answer, for the whole party." },
  ask:    { id: "ask",    label: "Ask",    icon: "fa-hand-holding", hint: "You've made your case: will they do it? Sized by what it costs them; the way your words came at them decides what winning costs." },
  gambit: { id: "gambit", label: "All in", icon: "fa-dice",         hint: "A gamble on leverage — it works on anything, and the consequences last." },
};
const JOB_ORDER = ["read", "ask", "gambit"];

/** A maneuver's second skill backs the roll: +2 when you're trained in it. */
const SUPPORT_BONUS = 2;

/**
 * The seven maneuvers: an Ask for each approach; an All-in for Pressure and
 * Heart (Reason has none: a deal already stakes your word); the lie, told any way
 * (`anyWay`: no approach of its own, it takes the one it was told in); the Read.
 * `skills` — the PAIR of D&D skills it is: the better one rolls (through the
 * system's own check), the other backs it (+2 if trained). `line` — what it
 * looks like in a scene; `win` / `miss` — what happens either way, in plain
 * words; `rule` — the whole of it.
 */
const TECHNIQUES = {
  read:      { approach: null,       job: "read",   label: "Read them", skills: ["ins", "inv"],
    line: "watch them — or dig into who they are",
    win: "one answer about them for the whole party — on a strong hit, a second answer or a String on them",
    miss: "they notice, and won't let you read them again this scene — no emotion; on a bad miss they read you instead (a String on you)",
    rule: "Hit: one answer about them for the whole party. Strong hit: a second answer — or a String on them instead (you saw where it hurts). Miss: they notice — but it costs no emotion. Bad miss: they read you instead (a String on you)." },
  demand:    { approach: "pressure", job: "ask",    label: "Demand",    skills: ["itm", "ath"],
    line: "do it — or else",
    win: "they give in — no price, but they remember who made them: the bond sours, and they take a String on you",
    miss: "they push back their own way — you take their emotion (−2 until you act it out)",
    rule: "Hit: they give in — no price, but they remember it: the bond sours, and they take a String on you." },
  appeal:    { approach: "heart",    job: "ask",    label: "Appeal",    skills: ["per", "prf"],
    line: "ask from the heart",
    win: "they do it — for their price on a plain hit — and the bond warms",
    miss: "you take their emotion, and they take a String on you: you showed your heart",
    rule: "Hit: they do it, and the bond warms — a plain hit for their price. Miss: you showed your heart — a String on you." },
  bargain:   { approach: "reason",   job: "ask",    label: "Deal",      skills: ["per", "inv"],
    line: "your word for theirs: a trade, a promise, proof you stand by",
    win: "they do it, and you give your word: a String on you until you deliver. Keep it and you're Allies; break it and you're Enemies. On a plain hit, they name the terms",
    miss: "no deal — you take their emotion",
    rule: "Hit: they do it, and you give your word — a String on you until you deliver (a strong hit: your terms; a plain one: theirs). Keep it: the String goes, and you're Allies. Break it: you're Enemies, and they keep it." },
  blackmail: { approach: "pressure", job: "gambit", label: "Blackmail", skills: ["itm", "inv"], needs: "fear",
    line: "their Fear, or your hold on them",
    win: "they do it, Frightened of you — your enemy now, and they'll pay you back (a String on you)",
    miss: "they call your bluff — enemies all the same: their emotion and a String on you",
    rule: "Needs their Fear or a String on them. Hit: they do it, Frightened of you — your enemy now, and they'll pay you back (a String on you). Miss: they call your bluff — enemies all the same, and a String on you." },
  seduce:    { approach: "heart",    job: "gambit", label: "Seduce",    skills: ["per", "prf"], needs: "desire",
    line: "their Desire, or what's between you",
    win: "they do it for you — the bond deepens",
    miss: "heartbreak — the bond cools, you're Hopeless, and a String on you",
    rule: "Needs their Desire or a bond of ●●. Hit: they do it for you — the bond deepens. Miss: heartbreak — the bond cools, a String on you, and you're Hopeless." },
  deceive:   { approach: null, anyWay: true, job: "gambit", label: "Deceive", skills: ["dec", "prf"], icon: "fa-mask", color: "#a9b4c0",
    line: "a lie that works — until it doesn't",
    win: "they believe it and act on it — the lie stays on record until the GM brings it out",
    miss: "caught — their emotion, a String on you, and the door closes",
    rule: "Hit: they believe it and act — the lie stays on record until the GM brings it out. Miss: caught — a String on you, and the door closes." },
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

/** What a Read can ask. Each answer becomes the party's knowledge for good. */
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
const READ_ORDER = ["desire", "fear", "key", "wall", "price", "pressed", "mask", "audience"];

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
    const rel = TSLTalk.knownRelation(npc, pv.approach);
    const mode = rel === "key" ? "adv" : rel === "wall" ? "dis" : "normal";
    const audience = pv.witnesses && SocialArchetypeManager.getKnown(npc).audience ? SocialArchetypeManager.audienceOf(npc) : 0;
    return { pv, rel, mode, p: TSLTalk.hitChance(pv.mod + audience, pv.dc, mode) };
  }

  /** The truth: is this approach their key, their wall, or neither (a normal roll)? */
  static relation(npc, approach) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    if (!arch || !APPROACHES[approach]) return "plain";
    return arch.key === approach ? "key" : arch.wall === approach ? "wall" : "plain";
  }

  /** Your bond toward them gives +● when your approach runs the way it does. */
  static bondBonus(src, tgt, approach) {
    const bond = TSLBondStore.find(src?.id, tgt?.id);
    if (!bond || SocialArchetypeManager.bondApproach(bond.type) !== approach) return 0;
    return TSLBondStore.getStrength(src.id, tgt.id);
  }

  /** What a nature asks in return for a "yes, but". */
  static priceOf(npc) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    return arch?.price ?? { text: _t("Something in return — the GM names it."), string: false };
  }

  /** Only a heartfelt appeal or a deal ends in "yes, but" — a demand just gets its way. */
  static hasPrice(technique) { return technique === "appeal" || technique === "bargain"; }

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

  /** The GM brings a lie out: they turn on the liar and take two Strings on them. */
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
    const n = await TSLStringStore.add(npc.id, liar.id, 2);
    if (n > 1) lines.push(_t("They take two <b>Strings</b> on {liar}.", { liar: esc(liar.name) }));
    else if (n) lines.push(_t("They take a <b>String</b> on {liar}.", { liar: esc(liar.name) }));
    const s = await TSLBondStore.shift(npc.id, liar.id, "enemy");
    if (s) lines.push(TSLTalk._bondLine(npc, liar, s));
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

  /** The GM says how a deal ended. Kept: the String goes, and they're Allies. Broken: Enemies, and the NPC keeps the String. */
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
    if (!kept) lines.push(_t("{who} keeps the String — and will use it.", { who: esc(npc.name) }));
    else if (await TSLStringStore.spend(npc.id, who.id)) lines.push(_t("{who} lets the String go.", { who: esc(npc.name) }));
    const s = await TSLBondStore.shift(npc.id, who.id, kept ? "ally" : "enemy");
    if (s) lines.push(TSLTalk._bondLine(npc, who, s));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      content: `<div class="tsl-x-card tsl-x--${kept ? "success" : "botch"}">
        <div class="tsl-x-head"><i class="fas fa-handshake"></i><span class="tsl-x-title">${kept ? _t("The word is kept") : _t("The word is broken")}</span></div>
        <div class="tsl-x-who">${esc(who.name)} → ${esc(npc.name)}</div>
        <ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--${kept ? "good" : "bad"}">${l}</li>`).join("")}</ul>
      </div>`,
    });
    TSLTalk._pulse({ srcId: npc.id, tgtId: who.id, technique: "bargain", approach: "reason", job: "ask", grade: kept ? "success" : "botch", paid: kept, rel: "plain", ended: false });
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

    // The maneuver's other skill backs the roll: +2 when you're trained in it.
    const support = tech.skills.find(k => k !== skill) ?? null;
    const backed = !!support && TSLTalk.proficient(src, support);
    const parts = [{ label: SKILL_LABELS[skill] ?? skill, value: TSLTalk.skillMod(src, skill), base: true }];
    if (backed) parts.push({ label: _t("{skill} backs it", { skill: SKILL_LABELS[support] ?? support }), value: SUPPORT_BONUS });
    if (bond) parts.push({ label: _t("bond — {type}", { type: SocialArchetypeManager.getBondType(TSLBondStore.find(src.id, npc.id)?.type).label }), value: bond });
    if (lever) parts.push({ label: lever === "desire" ? _t("their Desire") : _t("their Fear"), value: LEVER_BONUS });
    const helper = helperId ? game.actors.get(helperId) : null;
    if (helper && helper.id !== src.id) parts.push({ label: _t("help — {name}", { name: helper.name }), value: HELP_BONUS });
    parts.push(...TSLEmotions.rollParts(src, npc, technique, ap));
    const mod = parts.reduce((sum, p) => sum + p.value, 0);

    const dcInfo = TSLTalk.dcFor(npc, size);

    let blocked = null;
    if (!TSLTalk.isNpc(npc)) blocked = _t("You talk to NPCs — pick someone the GM plays.");
    else if (job === "ask" && size === "against" && !lever && !strings && bond < 2)
      blocked = _t("Something against their interests needs leverage: their Desire or Fear, a String on them, or a deep bond (●●) that runs this way — or go all in.");
    else if (technique === "blackmail" && !known.fear && !strings)
      blocked = _t("Blackmail needs a hold on them: learn their Fear, or hold a String on them.");
    else if (technique === "seduce" && !known.desire && tie < 2)
      blocked = _t("Seduce needs their Desire — or a bond of ●● between you.");

    return {
      technique, job, approach: ap, isRead: job === "read", sized, size, skill, support, backed, parts, mod, witnesses: sized && !!witnesses,
      helperId: helper && helper.id !== src.id ? helper.id : null,
      lever, leverOk, strings, known, points,
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
    const rel = TSLTalk.relation(npc, pv.approach);
    let natureDie = null;
    if (rel === "key" || rel === "wall") {
      const nr = new Roll("1d20");
      await nr.evaluate();
      natureDie = nr.total;
      const better = rel === "key" ? natureDie > natural : natureDie < natural;
      if (better) { total += natureDie - natural; natural = natureDie; }
    }
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
    let questions = [], paid = null, readString = false;
    if (pv.job === "read" && (grade === "strong" || grade === "success")) {
      ({ questions, string: readString } = await TSLTalk.promptQuestions(npc, grade === "strong" ? 2 : 1, { string: grade === "strong" }));
    } else if (pv.job === "ask" && grade === "success" && TSLTalk.hasPrice(pv.technique)) {
      paid = await TSLTalk.promptPrice(npc, TSLTalk.priceOf(npc), { deal: pv.technique === "bargain" });
    }

    const payload = {
      srcId: src.id, npcId: npc.id, technique: pv.technique, approach: pv.approach, job: pv.job,
      size: pv.size, skill: pv.skill, helperId: pv.helperId, lever: pv.lever, parts: pv.parts, mod: pv.mod,
      total, natural, dice, natureDie, rel, dc: pv.dc, grade, stringSpent, systemRoll, rollData,
      questions, readString, paid, witnesses: pv.witnesses, audience,
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
    return READ_ORDER.filter(q => !known[q] && (q !== "mask" || shows));
  }

  /**
   * A read: which questions (1, or 2 on a strong hit) among those still
   * unanswered. With `string` (a strong hit) the last look may be kept as a
   * hold instead — a String on them. Returns { questions, string }.
   */
  static async promptQuestions(npc, n, { string = false } = {}) {
    const picked = [];
    for (let i = 0; i < n; i++) {
      const options = TSLTalk.openQuestions(npc).filter(q => !picked.includes(q)).map(q => ({ q, label: READ_QUESTIONS[q].label }));
      if (string && i === n - 1) options.push({ q: null, string: true, label: _t("Keep it instead — a String on them: you saw where it hurts") });
      if (!options.length) break;
      const title = n > 1 ? _t("Read {name} ({i} of {n})", { name: npc.name, i: i + 1, n }) : _t("Read {name}", { name: npc.name });
      const o = await TSLTalk._pickOne(title, _t("What do you look for?"), options);
      if (!o) break;
      if (o.string) return { questions: picked, string: true };
      picked.push(o.q);
    }
    return { questions: picked, string: false };
  }

  /** "Yes, but": they name their price — pay it, or walk away from the deal. */
  static async promptPrice(npc, price, { deal = false } = {}) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: _t("{name} — yes, but…", { name: npc.name }),
        content: `<div class="tsl-dlg"><p>${deal ? _t("They'll agree — on their terms:") : _t("They'll do it — for a price:")}</p>
          <p class="tsl-dlg-price">${esc(price.text)}</p>
          ${deal ? `<p class="notes">${_t("You give your word: they hold a String on you until you deliver. Keep it and you're Allies; break it and you're Enemies.")}</p>`
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
    const rel = TSLTalk.relation(npc, ap);   // the truth, not the payload's word
    const arch = SocialArchetypeManager.getArchetype(npc);
    const known = SocialArchetypeManager.getKnown(npc);
    const knownPatch = {};
    const lines = [];
    const note = (html, tone = "") => lines.push({ html, tone });
    const hit = p.grade === "strong" || p.grade === "success";
    const sized = job === "ask" || job === "gambit";
    const ask = sized ? ASK_SIZES[p.size] ?? ASK_SIZES.costly : null;
    const big = !!ask && ask.dc >= 0;   // costly or against
    const witnesses = sized && !!p.witnesses;
    const firm = SocialArchetypeManager.getStance(npc) === "firm";
    const who = esc(npc.name), you = esc(src.name);
    let ended = false, granted = false;
    let stringOnYou = null;   // why they take a String on the speaker — at most one per roll
    let stringOnThem = null;  // why the speaker takes one on them — at most one per roll
    const shift = async (how, why = "") => {
      const s = await TSLBondStore.shift(npc.id, src.id, how);
      if (s) note(`${why}${why ? " " : ""}${TSLTalk._bondLine(npc, src, s)}`, "");
    };
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
            knownPatch[q] = true;
            note(`<i class="fas fa-eye"></i> <b>${READ_QUESTIONS[q].label}</b> ${esc(TSLTalk.answerFor(npc, q))}`, "good");
          }
          if (p.readString) stringOnThem = _t("You saw where it hurts");
          else if (!(p.questions ?? []).length) note(`<i class="fas fa-eye"></i> ${_t("They have nothing left to hide from you.")}`, "");
        } else {
          note(_t("They notice you studying them — they won't let you read them again this scene."), "bad");
        }
        break;
      }

      case "ask": {
        if (p.grade === "strong") {
          granted = true;
          note(tech.id === "bargain" ? _t("{who} agrees — on your terms.", { who }) : _t("{who} does it.", { who }), "good");
        } else if (p.grade === "success") {
          if (!TSLTalk.hasPrice(tech.id)) {
            granted = true;
            note(_t("{who} gives in — no price.", { who }), "good");
          } else {
            const price = TSLTalk.priceOf(npc);
            if (!known.price) knownPatch.price = true;
            if (p.paid && tech.id === "bargain") {
              granted = true;
              note(_t("{who} agrees — on their terms: <i>{price}</i>", { who, price: esc(price.text) }), "good");
            } else if (p.paid) {
              granted = true;
              note(_t("{who} does it — for a price: <i>{price}</i>", { who, price: esc(price.text) }), "good");
              if (price.string) {
                const n = await TSLStringStore.add(npc.id, src.id, 1);
                if (n) note(_t("Paid — {who} now holds a <b>String</b> on {you}.", { who, you }), "bad");
              } else note(_t("{you} pays it.", { you }), "");
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
        if (granted) {
          // Only something big costs them a String — small favours can't be farmed for leverage.
          if (p.grade === "strong" && big) stringOnThem = _t("It cost them more than they show");
          if (ap === "pressure") {
            await shift("sour", _t("They gave in — and they will remember who made them."));
            stringOnYou = _t("They'll pay you back");
          } else if (ap === "heart") await shift("warm");
          else if (ap === "reason") {
            // A deal: your word goes on record, and they hold you to it until the GM says how it ended.
            await npc.setFlag(TALK_SCOPE, "deals", [...TSLTalk.deals(npc), { id: foundry.utils.randomID(), byId: src.id, price: p.grade !== "strong", at: Date.now() }]);
            note(`<i class="fas fa-handshake"></i> ${_t("Your word is on record — keep it, and you're Allies; break it, and you're Enemies.")}`, "");
            stringOnYou = _t("You gave your word");
          }
        }
        break;
      }

      case "gambit": {
        if (hit) {
          granted = true;
          if (p.grade === "strong" && big) stringOnThem = tech.id === "deceive" ? _t("They swallowed it whole") : _t("It cost them more than they show");
          if (tech.id === "blackmail") {
            note(_t("{who} does it — with your hand at their throat.", { who }), "good");
            await shift("enemy", _t("They'll never forgive it."));
            await feel(npc, "frightened", { by: src.id });
            stringOnYou = _t("They'll pay you back");
          } else if (tech.id === "seduce") {
            note(_t("{who} does it — for you.", { who }), "good");
            await shift("warm");
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
            await shift("enemy");
          } else if (tech.id === "seduce") {
            note(_t("{who} pulls away — heartbreak.", { who }), "bad");
            stringOnYou = _t("You showed your heart");
            await shift("cool");
          } else {
            note(_t("{who} catches the lie.", { who }), "bad");
            stringOnYou = _t("Caught lying");
            ended = true;
            note(_t("They're done talking — that door is closed for this scene."), "bad");
            await shift("cool");
          }
        }
        break;
      }
    }

    // A yes before witnesses binds them: everyone saw them give it — when it
    // cost them something (a small favour in public binds nobody: no farming).
    if (granted && witnesses && big && !stringOnThem) stringOnThem = tech.id === "deceive" ? _t("Everyone saw them believe it") : _t("Everyone saw them give it");
    if (stringOnThem) {
      const n = await TSLStringStore.add(src.id, npc.id, 1);
      if (n) note(_t("{why} — {you} takes a <b>String</b> on them.", { why: stringOnThem, you }), "good");
    }

    // Any miss: the nature hits back; before witnesses you lose face too; a
    // bad one costs you a String; a proud one, refused something big, is done.
    if (!hit) {
      // The nature hits back with its own emotion — anything but a Read.
      const emo = tech.id === "seduce" ? "hopeless" : job === "read" ? null : arch?.hurts;
      if (emo) await feel(src, emo, { by: npc.id, toward: emo === "guilty" ? npc.id : null });
      if (witnesses && emo !== "insecure") {
        note(tech.id === "deceive" ? _t("Caught before witnesses — {you} loses face.", { you }) : _t("Refused before witnesses — {you} loses face.", { you }), "bad");
        await feel(src, "insecure", { by: npc.id });
      }
      if (p.grade === "botch" && !stringOnYou) stringOnYou = job === "read" ? _t("They read you instead") : _t("It costs you");
      if (sized && big && firm && !ended) {
        ended = true;
        note(_t("They're done talking — that door is closed for this scene."), "bad");
        if (!known.pressed) knownPatch.pressed = true;
        await shift("cool");
      }
    }
    if (stringOnYou) {
      const n = await TSLStringStore.add(npc.id, src.id, 1);
      if (n) note(_t("{why}: they take a <b>String</b> on {you}.", { why: stringOnYou, you }), "bad");
    }
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
    let rolls = [];
    if (!p.systemRoll && p.rollData) {
      try { rolls = [Roll.fromData(p.rollData)]; } catch { rolls = []; }
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: src }),
      content: TSLTalk._card({ p, tech, src, npc, rel, lines, reaction }),
      rolls,
    });
    TSLTalk._pulse({ srcId: src.id, tgtId: npc.id, technique: tech.id, approach: ap, job, grade: p.grade, paid: p.paid, rel, ended, granted, witnesses });
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

  static _card({ p, tech, src, npc, rel, lines, reaction }) {
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
      ${lines.length ? `<ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item ${l.tone ? `tsl-x-after--${l.tone}` : ""}">${l.html}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  /** Tell the Scene (every client) what just happened. */
  static _pulse(data) {
    try { if (typeof TSLSocket !== "undefined") TSLSocket.broadcastPulse(data); }
    catch (err) { console.warn("TSL | pulse failed:", err); }
  }
}
