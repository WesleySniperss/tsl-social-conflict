/**
 * tsl-social-conflict | talk.js
 *
 * v3 — TECHNIQUES (design: docs/v3-design.md).
 *
 * Social play is a conversation, not a duel: nobody declares a goal, there are
 * no turns and no tracks. When a character wants something from an NPC who
 * doesn't want to give it, they say the line and pick what it really is —
 * one of seven TECHNIQUES — and roll once against a visible DC:
 *   ASK    — get what you want now, sized by what it costs THEM; the way you
 *            come at them (Pressure · Heart · Reason) decides what winning
 *            costs: Demand · Appeal · Bargain.
 *   ALL IN — a gambit on leverage, with consequences that last: Blackmail ·
 *            Seduce · Deceive.
 *   READ   — learn something about them for the whole party.
 *
 * What winning costs depends on the approach:
 *   Pressure — they give in without a price, but remember it: the bond sours,
 *              and they take a String on you.
 *   Heart    — the bond warms; but a miss exposes you: a String on you.
 *   Reason   — clean: a deal ("yes, but" names their price); nothing lingers.
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
 *
 * Rolls happen on the speaker's client; what follows (emotions, Strings,
 * bonds, party knowledge, lies) is applied on the GM client through the
 * TSLGMActions relay, which posts ONE card per roll.
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

/** What a technique does. */
const TECH_JOBS = {
  ask:    { id: "ask",    label: "Ask",    icon: "fa-hand-holding", hint: "Get what you want, now. How you come at them decides what winning costs." },
  gambit: { id: "gambit", label: "All in", icon: "fa-dice",         hint: "A gamble on leverage — it works on anything, and the consequences last." },
  read:   { id: "read",   label: "Read",   icon: "fa-eye",          hint: "Learn something about them — for the whole party." },
};
const JOB_ORDER = ["ask", "gambit", "read"];

/**
 * The seven techniques: three asks and three gambits (one per approach), and
 * the Read. `line` — what it looks like in a scene (shown under its name);
 * `rule` — what it does.
 */
const TECHNIQUES = {
  demand:    { approach: "pressure", job: "ask",    label: "Demand",    skills: ["itm", "per", "ath", "dec"],
    line: "do it — or else",
    rule: "Hit: they give in — no price, but they remember it: the bond sours, and they take a String on you." },
  appeal:    { approach: "heart",    job: "ask",    label: "Appeal",    skills: ["per", "prf", "ins"],
    line: "ask from the heart",
    rule: "Hit: they do it, and the bond warms — a plain hit for their price. Miss: you showed your heart — a String on you." },
  bargain:   { approach: "reason",   job: "ask",    label: "Bargain",   skills: ["per", "inv", "ins", "his"],
    line: "make it worth their while",
    rule: "Hit: a deal — on your terms on a strong hit, for their price on a plain one. Nothing lingers." },
  blackmail: { approach: "pressure", job: "gambit", label: "Blackmail", skills: ["itm", "dec", "inv"], needs: "fear",
    line: "their Fear, or your hold on them",
    rule: "Needs their Fear or a String on them. Hit: they do it, Frightened of you — your enemy now, and they'll pay you back (a String on you). Miss: they call your bluff — enemies all the same, and a String on you." },
  seduce:    { approach: "heart",    job: "gambit", label: "Seduce",    skills: ["per", "prf", "dec"], needs: "desire",
    line: "their Desire, or what's between you",
    rule: "Needs their Desire or a bond of ●●. Hit: they do it for you — the bond deepens. Miss: heartbreak — the bond cools, a String on you, and you're Hopeless." },
  deceive:   { approach: "reason",   job: "gambit", label: "Deceive",   skills: ["dec"],
    line: "a lie that works — until it doesn't",
    rule: "Hit: they believe it and act — the lie stays on record until the GM brings it out. Miss: caught — a String on you, and the door closes." },
  read:      { approach: null,       job: "read",   label: "Read them", skills: ["ins", "inv", "his"],
    line: "watch, listen, ask the one right question",
    rule: "Hit: one answer about them for the whole party (two on a strong hit). Miss: they notice — but it costs no emotion. Bad miss: they read you instead (a String on you)." },
};
for (const [id, t] of Object.entries(TECHNIQUES)) t.id = id;
const TECHNIQUE_ORDER = Object.keys(TECHNIQUES);

/** The technique an approach uses for a job. */
function techniqueFor(approach, job) {
  return TECHNIQUE_ORDER.find(id => TECHNIQUES[id].approach === approach && TECHNIQUES[id].job === job) ?? null;
}

/** What a Read can ask. Each answer becomes the party's knowledge for good. */
const READ_QUESTIONS = {
  desire:  { id: "desire",  label: "What do they really want?",       short: "Desire" },
  fear:    { id: "fear",    label: "What do they fear?",              short: "Fear" },
  key:     { id: "key",     label: "What would open them?",           short: "Key" },
  wall:    { id: "wall",    label: "What would close them?",          short: "Wall" },
  price:   { id: "price",   label: "What would they want in return?", short: "Price" },
  pressed: { id: "pressed", label: "After a no, do they end it?",     short: "After a no" },
};
const READ_ORDER = ["desire", "fear", "key", "wall", "price", "pressed"];

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

  /** Roll through the SYSTEM's own skill dialog (A5E) when the setting is on. */
  static usesSystemDialog(actor) {
    return !!TSLTalk._setting("useSystemRollDialog", true) && typeof actor?.rollSkillCheck === "function";
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
    if (dial) mods.push({ label: "table difficulty", value: dial });
    const ask = size ? ASK_SIZES[size] : null;
    if (ask?.dc) mods.push({ label: ask.label.toLowerCase(), value: ask.dc });
    return { base, mods, dc: base + mods.reduce((sum, m) => sum + m.value, 0) };
  }

  static isNpc(actor) { return !!actor && !SocialArchetypeManager.isPC(actor); }

  /** The truth: is this approach their key, their wall, or plain ground? */
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
    return arch?.price ?? { text: "Something in return — the GM names it.", string: false };
  }

  /** Only a heartfelt appeal or a bargain ends in "yes, but" — a demand just gets its way. */
  static hasPrice(technique) { return technique === "appeal" || technique === "bargain"; }

  /** The grade in words for this technique. */
  static gradeLabel(technique, grade) {
    const tech = TECHNIQUES[technique];
    if (!tech) return grade;
    if (tech.job === "ask") return technique === "demand" && grade === "success" ? "They give in" : (TALK_GRADES[grade]?.label ?? grade);
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
    if (n) lines.push(`They take ${n > 1 ? "two <b>Strings</b>" : "a <b>String</b>"} on ${esc(liar.name)}.`);
    const s = await TSLBondStore.shift(npc.id, liar.id, "enemy");
    if (s) lines.push(TSLTalk._bondLine(npc, liar, s));
    const a = await TSLEmotions.add(npc, "angry", { by: liar.id });
    if (a?.added) lines.push(`${esc(npc.name)} is <b>Angry</b>.`);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      content: `<div class="tsl-x-card tsl-x--botch">
        <div class="tsl-x-head"><i class="fas fa-mask"></i><span class="tsl-x-title">The lie comes out</span></div>
        <div class="tsl-x-who">${esc(npc.name)} learns what ${esc(liar.name)} told them was a lie.</div>
        <ul class="tsl-x-after">${lines.map(l => `<li class="tsl-x-after-item tsl-x-after--bad">${l}</li>`).join("")}</ul>
      </div>`,
    });
    TSLTalk._pulse({ srcId: npc.id, tgtId: liar.id, technique: "deceive", approach: "reason", job: "gambit", grade: "botch", rel: "plain", ended: false });
  }

  // ── The speaker's view, before the roll ───────────────────────────────────

  /**
   * Everything the speaker sees before rolling, built only from what is
   * VISIBLE (skills, Leanings, bonds, help, levers, emotions, the DC). It
   * never consults the key or the wall — those show in the result.
   */
  static preview(src, npc, { technique = null, approach = null, size = "costly", skill = null, helperId = null, lever = null } = {}) {
    // An older caller may name only an approach (or "read"): use that approach's ask (or the Read).
    if (!TECHNIQUES[technique]) technique = approach === "read" ? "read" : (techniqueFor(approach, "ask") ?? "appeal");
    const tech = TECHNIQUES[technique];
    const job = tech.job, ap = tech.approach;
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

    const parts = [{ label: SKILL_LABELS[skill] ?? skill, value: TSLTalk.skillMod(src, skill), base: true }];
    const lean = ap ? SocialArchetypeManager.leaningDots(src, ap) : 0;
    if (lean) parts.push({ label: `${APPROACHES[ap].label} leaning`, value: lean });
    if (bond) parts.push({ label: `bond — ${SocialArchetypeManager.getBondType(TSLBondStore.find(src.id, npc.id)?.type).label}`, value: bond });
    if (lever) parts.push({ label: lever === "desire" ? "their Desire" : "their Fear", value: LEVER_BONUS });
    const helper = helperId ? game.actors.get(helperId) : null;
    if (helper && helper.id !== src.id) parts.push({ label: `help — ${helper.name}`, value: HELP_BONUS });
    parts.push(...TSLEmotions.rollParts(src, npc, technique));
    const mod = parts.reduce((sum, p) => sum + p.value, 0);

    const dcInfo = TSLTalk.dcFor(npc, size);

    let blocked = null;
    if (!TSLTalk.isNpc(npc)) blocked = "You talk to NPCs — pick someone the GM plays.";
    else if (job === "ask" && size === "against" && !lever && !strings && bond < 2)
      blocked = "Something against their interests needs leverage: their Desire or Fear, a String on them, or a deep bond (●●) that runs this way — or go all in.";
    else if (technique === "blackmail" && !known.fear && !strings)
      blocked = "Blackmail needs a hold on them: learn their Fear, or hold a String on them.";
    else if (technique === "seduce" && !known.desire && tie < 2)
      blocked = "Seduce needs their Desire — or a bond of ●● between you.";

    return {
      technique, job, approach: ap, isRead: job === "read", sized, size, skill, parts, mod,
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
      ui.notifications?.warn?.("A GM must be connected to resolve a social roll — nothing was rolled or spent.");
      return null;
    }

    // 1) The d20 — through the system's own skill dialog when set, else ours.
    let total, dice, natural, systemRoll = false, rollData = null;
    if (TSLTalk.usesSystemDialog(src)) {
      const extra = pv.mod - pv.parts[0].value;   // the system adds the skill itself
      const msg = await src.rollSkillCheck(pv.skill, { situationalMods: extra ? `${extra >= 0 ? "+" : ""}${extra}` : "" });
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
    let questions = [], paid = null;
    if (pv.job === "read" && (grade === "strong" || grade === "success")) {
      questions = await TSLTalk.promptQuestions(npc, grade === "strong" ? 2 : 1);
    } else if (pv.job === "ask" && grade === "success" && TSLTalk.hasPrice(pv.technique)) {
      paid = await TSLTalk.promptPrice(npc, TSLTalk.priceOf(npc));
    }

    const payload = {
      srcId: src.id, npcId: npc.id, technique: pv.technique, approach: pv.approach, job: pv.job,
      size: pv.size, skill: pv.skill, helperId: pv.helperId, lever: pv.lever, parts: pv.parts, mod: pv.mod,
      total, natural, dice, natureDie, rel, dc: pv.dc, grade, stringSpent, systemRoll, rollData,
      questions, paid,
    };
    // The GM applies it (directly when the GM rolled, through the relay for a player).
    await TSLGMActions.request("talkResolve", payload);
    return payload;
  }

  // ── Prompts ───────────────────────────────────────────────────────────────

  static async promptStringBurn(src, npc, total, dc, held) {
    return new Promise(resolve => {
      new Dialog({
        title: `${src.name} — not quite…`,
        content: `<div class="tsl-dlg">
          <p>${total} against DC ${dc}. You hold <b>${held}</b> String${held > 1 ? "s" : ""} on ${foundry.utils.escapeHTML(npc.name)}.</p>
          <p class="notes">Burn one for +${STRING_SPEND_BONUS}?</p></div>`,
        buttons: {
          burn: { icon: '<i class="fas fa-masks-theater"></i>', label: `Burn a String (+${STRING_SPEND_BONUS})`, callback: () => resolve(true) },
          keep: { label: "Let it stand", callback: () => resolve(false) },
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

  /** A read: which questions (1, or 2 on a strong hit) among those still unanswered. */
  static async promptQuestions(npc, n) {
    const known = SocialArchetypeManager.getKnown(npc);
    const picked = [];
    for (let i = 0; i < n; i++) {
      const open = READ_ORDER.filter(q => !known[q] && !picked.includes(q));
      if (!open.length) break;
      const o = await TSLTalk._pickOne(`Read ${npc.name}${n > 1 ? ` (${i + 1} of ${n})` : ""}`, "What do you look for?",
        open.map(q => ({ q, label: READ_QUESTIONS[q].label })));
      if (!o) break;
      picked.push(o.q);
    }
    return picked;
  }

  /** "Yes, but": they name their price — pay it, or walk away from the deal. */
  static async promptPrice(npc, price) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: `${npc.name} — yes, but…`,
        content: `<div class="tsl-dlg"><p>They'll do it — for a price:</p>
          <p class="tsl-dlg-price">${esc(price.text)}</p>
          ${price.string ? `<p class="notes">Paying it hands them a String on you.</p>` : ""}</div>`,
        buttons: {
          pay:  { icon: '<i class="fas fa-handshake"></i>', label: "Pay it", callback: () => resolve(true) },
          walk: { label: "Walk away", callback: () => resolve(false) },
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
      case "desire": return pts.desire || arch?.craves || "Nothing they let show — the GM describes it.";
      case "fear":   return pts.fear   || arch?.dreads || "Nothing they let show — the GM describes it.";
      case "key":    return arch ? `${APPROACHES[arch.key].label} — ${arch.keyText}` : "Nothing in particular — no approach opens them more than another.";
      case "wall":   return arch ? `${APPROACHES[arch.wall].label} — ${arch.wallText}` : "Nothing in particular — no approach closes them.";
      case "price":  return TSLTalk.priceOf(npc).text;
      case "pressed": {
        const st = SocialArchetypeManager.getStance(npc);
        const why = arch?.pressedWhy && (SocialArchetypeManager.getActorData(npc).stance ?? "nature") === "nature" ? ` — ${arch.pressedWhy}` : "";
        return st === "firm" ? `Refuse them something big and they end it${why}.`
             : st === "yield" ? `They keep listening after a no${why}.`
             : "It could go either way.";
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
    const ap = tech.approach, job = tech.job;
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
    const firm = SocialArchetypeManager.getStance(npc) === "firm";
    const who = esc(npc.name), you = esc(src.name);
    let ended = false, granted = false;
    let stringOnYou = null;   // why they take a String on the speaker — at most one per roll
    const shift = async (how, why = "") => {
      const s = await TSLBondStore.shift(npc.id, src.id, how);
      if (s) note(`${why}${why ? " " : ""}${TSLTalk._bondLine(npc, src, s)}`, "");
    };

    // The die showed their nature — now the party knows it.
    if (rel === "key") {
      if (!known.key) knownPatch.key = true;
      note(`<i class="fas fa-key"></i> <b>${APPROACHES[ap].label}</b> opens them — the better of two dice.`, "good");
    } else if (rel === "wall") {
      if (!known.wall) knownPatch.wall = true;
      note(`<i class="fas fa-door-closed"></i> <b>${APPROACHES[ap].label}</b> closes them — the worse of two dice.`, "bad");
    }

    switch (job) {
      case "read": {
        if (hit) {
          for (const q of (p.questions ?? []).filter(id => READ_QUESTIONS[id])) {
            knownPatch[q] = true;
            note(`<i class="fas fa-eye"></i> <b>${READ_QUESTIONS[q].label}</b> ${esc(TSLTalk.answerFor(npc, q))}`, "good");
          }
          if (!(p.questions ?? []).length) note(`<i class="fas fa-eye"></i> They have nothing left to hide from you.`, "");
        } else {
          note("They notice you studying them — they won't let you read them again this scene.", "bad");
        }
        break;
      }

      case "ask": {
        if (p.grade === "strong") {
          granted = true;
          note(`${who} does it.`, "good");
        } else if (p.grade === "success") {
          if (!TSLTalk.hasPrice(tech.id)) {
            granted = true;
            note(`${who} gives in — no price.`, "good");
          } else {
            const price = TSLTalk.priceOf(npc);
            if (!known.price) knownPatch.price = true;
            if (p.paid) {
              granted = true;
              note(`${who} does it — for a price: <i>${esc(price.text)}</i>`, "good");
              if (price.string) {
                const n = await TSLStringStore.add(npc.id, src.id, 1);
                if (n) note(`Paid — ${who} now holds a <b>String</b> on ${you}.`, "bad");
              } else note(`${you} pays it.`, "");
            } else {
              note(`${who} named a price — <i>${esc(price.text)}</i> — and ${you} walked away from the deal.`, "");
            }
          }
        } else {
          note(`${who} says no.`, "bad");
          if (arch?.press) note(`<i>${esc(arch.press)}</i>`, "");
          if (ap === "heart") stringOnYou = "You showed your heart";
          else if (p.lever === "fear") stringOnYou = "A threat cuts both ways";
        }
        if (granted) {
          // Only something big costs them a String — small favours can't be farmed for leverage.
          if (p.grade === "strong" && big) {
            const n = await TSLStringStore.add(src.id, npc.id, 1);
            if (n) note(`It cost them more than they show — ${you} takes a <b>String</b> on them.`, "good");
          }
          if (ap === "pressure") {
            await shift("sour", "They gave in — and they'll remember it.");
            stringOnYou = "They'll pay you back";
          } else if (ap === "heart") await shift("warm");
        }
        break;
      }

      case "gambit": {
        if (hit) {
          granted = true;
          if (p.grade === "strong" && big) {
            const n = await TSLStringStore.add(src.id, npc.id, 1);
            if (n) note(`${you} takes a <b>String</b> on them.`, "good");
          }
          if (tech.id === "blackmail") {
            note(`${who} does it — with your hand at their throat.`, "good");
            await shift("enemy", "They'll never forgive it.");
            const f = await TSLEmotions.add(npc, "frightened", { by: src.id });
            if (f?.added) note(`<img class="tsl-emo-ico" src="${EMOTIONS.frightened.img}" alt=""> ${who} is <b>Frightened</b> of you — ${esc(EMOTIONS.frightened.opensText)}.`, "good");
            stringOnYou = "They'll pay you back";
          } else if (tech.id === "seduce") {
            note(`${who} does it — for you.`, "good");
            await shift("warm");
          } else {
            note(`${who} believes it — and acts on it.`, "good");
            const lies = TSLTalk.lies(npc);
            lies.push({ id: foundry.utils.randomID(), byId: src.id, at: Date.now() });
            await npc.setFlag(TALK_SCOPE, "lies", lies);
            note(`<i class="fas fa-mask"></i> The lie holds — for now. (The GM can bring it out later.)`, "");
          }
        } else {
          if (arch?.press) note(`<i>${esc(arch.press)}</i>`, "");
          if (tech.id === "blackmail") {
            note(`${who} calls your bluff.`, "bad");
            stringOnYou = "They know you'd stoop to it";
            await shift("enemy");
          } else if (tech.id === "seduce") {
            note(`${who} pulls away — heartbreak.`, "bad");
            stringOnYou = "You showed your heart";
            await shift("cool");
          } else {
            note(`${who} catches the lie.`, "bad");
            stringOnYou = "Caught lying";
            ended = true;
            note(`They're done talking — that door is closed for this scene.`, "bad");
            await shift("cool");
          }
        }
        break;
      }
    }

    // Any miss: the nature hits back; a bad one costs you a String; a proud
    // one, refused something big, is done.
    if (!hit) {
      // The nature hits back with its own emotion — anything but a Read.
      const emo = tech.id === "seduce" ? "hopeless" : job === "read" ? null : arch?.hurts;
      if (emo) {
        const r = await TSLEmotions.add(src, emo, { by: npc.id, toward: emo === "guilty" ? npc.id : null });
        if (r?.added) note(`<img class="tsl-emo-ico" src="${EMOTIONS[emo].img}" alt=""> ${you} is <b>${EMOTIONS[emo].label}</b> (${esc(EMOTIONS[emo].spoilsText)}) — until it is let go.`, "bad");
        else if (r?.scar) note(`<img class="tsl-emo-ico" src="icons/svg/blood.svg" alt=""> ${you} was already ${EMOTIONS[emo].label} — it leaves a scar: <b>${SCARS[r.scar].label}</b>. ${esc(SCARS[r.scar].text)}`, "bad");
      }
      if (p.grade === "botch" && !stringOnYou) stringOnYou = job === "read" ? "They read you instead" : "It costs you";
      if (sized && big && firm && !ended) {
        ended = true;
        note(`They're done talking — that door is closed for this scene.`, "bad");
        if (!known.pressed) knownPatch.pressed = true;
        await shift("cool");
      }
    }
    if (stringOnYou) {
      const n = await TSLStringStore.add(npc.id, src.id, 1);
      if (n) note(`${stringOnYou}: they take a <b>String</b> on ${you}.`, "bad");
    }
    if (p.stringSpent) note(`${you} burned a String on them (+${STRING_SPEND_BONUS}).`, "");

    // What the party learned — and once they know the key AND the wall, the
    // nature is named to the table.
    if (Object.keys(knownPatch).length) await SocialArchetypeManager.setKnown(npc, knownPatch);
    const nowKnown = SocialArchetypeManager.getKnown(npc);
    if (arch && nowKnown.key && nowKnown.wall && !SocialArchetypeManager.isRevealed(npc)) {
      await SocialArchetypeManager.setRevealed(npc, true);
      note(`<i class="fas fa-user-check"></i> Figured out: they're a <b>${esc(arch.label)}</b> — ${esc(arch.description)}`, "good");
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
    TSLTalk._pulse({ srcId: src.id, tgtId: npc.id, technique: tech.id, approach: ap, job, grade: p.grade, paid: p.paid, rel, ended, granted });
  }

  static _bondLine(a, b, s) {
    const esc = foundry.utils.escapeHTML;
    const type = SocialArchetypeManager.getBondType(s.type).label;
    const dots = "●".repeat(s.strength) || "○";
    if (s.turned) return `${esc(a.name)} and ${esc(b.name)} are <b>${esc(type)}s</b> now (${dots}).`;
    if (s.created) return `A bond begins: <b>${esc(type)}</b> (${dots}).`;
    return `Their bond (${esc(type)}) ${s.delta > 0 ? (s.hostile ? "hardens" : "deepens") : (s.hostile ? "eases" : "cools")} to ${dots}.`;
  }

  // ── The card ──────────────────────────────────────────────────────────────

  static _card({ p, tech, src, npc, rel, lines, reaction }) {
    const esc = foundry.utils.escapeHTML;
    const ap = APPROACHES[tech.approach];
    const sized = tech.job === "ask" || tech.job === "gambit";
    const title = `${ap ? `${ap.label} · ` : ""}${tech.label}${sized ? ` · ${ASK_SIZES[p.size]?.short ?? ""}` : ""}`;
    const tag = rel === "key" ? `<span class="tsl-x-tag tsl-x-tag--key"><i class="fas fa-key"></i> Key</span>`
      : rel === "wall" ? `<span class="tsl-x-tag tsl-x-tag--wall"><i class="fas fa-door-closed"></i> Wall</span>` : "";
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
    const bonus = (p.parts ?? []).filter(x => !x.base).map(x =>
      `<span class="tsl-x-bonus ${x.value < 0 ? "tsl-x-bonus--neg" : ""}">${x.value >= 0 ? "+" : "−"}${Math.abs(x.value)} ${esc(x.label)}</span>`).join("")
      + (p.stringSpent ? `<span class="tsl-x-bonus">+${STRING_SPEND_BONUS} String</span>` : "");
    return `<div class="tsl-x-card tsl-x--${p.grade}">
      <div class="tsl-x-head"><i class="fas ${ap?.icon ?? TECH_JOBS[tech.job]?.icon ?? "fa-comments"}"></i><span class="tsl-x-title">${esc(title)}</span>${tag}</div>
      <div class="tsl-x-who">${esc(src.name)} → ${esc(npc.name)}</div>
      <div class="tsl-x-roll">${diceHTML}
        <span class="tsl-x-mod">${p.systemRoll ? "system check" : `${(base?.value ?? 0) >= 0 ? "+" : "−"}${Math.abs(base?.value ?? 0)} ${esc(SKILL_LABELS[p.skill] ?? p.skill)}`}</span>
        <span class="tsl-x-eq">=</span><span class="tsl-x-total">${p.total}</span>
        <span class="tsl-x-vs">vs DC ${p.dc}</span></div>
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
