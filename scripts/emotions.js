/**
 * tsl-social-conflict | emotions.js
 *
 * v3 — EMOTIONS & SCARS (design: docs/v3-design.md §3).
 *
 * Five emotions, as in Thirsty Sword Lesbians: Angry, Frightened, Guilty,
 * Insecure, Hopeless. Anyone can carry them — a player character or an NPC —
 * as real ActiveEffects with a token status icon. Each one is a state of the
 * whole person, toward everyone (the user, 2026-11-14: «не проти лише когось
 * одного, а проти всіх»), and it works beyond the talk that left it:
 *   in a conversation — −2 on the maneuvers it spoils for whoever feels it,
 *     +2 to the approach that plays on it for whoever talks to them (and their
 *     wall against that approach doesn't stand);
 *   everywhere else — on the SHEET, by itself (`sheet`): an edge and a
 *     burden, +2 / −2, in a fight too. Anger hits harder and guards worse;
 *     fear guards better and strikes worse; and so on round the five levers
 *     (damage · AC · attack · saves · initiative), each raised by one emotion
 *     and lowered by another.
 * Each is let go by acting it out in character, or by a friend's comfort.
 *
 * Where they come from:
 *   • the talk itself: when the words land, the GM marks it — no roll (mark);
 *   • a miss (of the reads, only a Provoke): the NPC hits back with its
 *     nature's emotion;
 *   • an NPC's move, refused (abilities.js);
 *   • gambits: Blackmail frightens them, a broken heart leaves you Hopeless,
 *     a lie brought out leaves them Angry.
 * A player character who takes an emotion they already carry takes its SCAR
 * instead — permanent, one per emotion: a +1 / −1 twist to how they reach
 * people, and the emotion's own edge and burden at ±1 on the sheet, for good.
 */

console.log("TSL | Loading emotions.js...");

const EMOTION_SCOPE = "tsl-social-conflict";

/**
 * Whether one of our effects shows on the token. Foundry v14 draws an effect
 * there only if it has a duration or its `showIcon` says ALWAYS; v13 drew any
 * effect with a status. Ours — an emotion, a String pulled, a bond in reach, a
 * signature's moment — have no duration (the story ends them), so they say
 * ALWAYS; NEVER keeps one off the token. v13 has no such field: nothing to add.
 */
function tslShowIcon(show = true) {
  const S = globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON;
  return { ...(S ? { showIcon: show ? S.ALWAYS : S.NEVER } : {}), ...(show ? tslSystemStatus() : {}) };
}
/**
 * What makes an effect of ours one of the SYSTEM's statuses — listed where the
 * system lists its own, with no window of the module's (the user, 2026-11-14:
 * «ВШИТИ ЦЕ В СИСТЕМУ ДО ЗВИЧАЙНИХ СТАТУСІВ НА ПЛАТФОРМІ»).
 *  • a5e: its Effects Panel (the corner of the screen, for the token you control)
 *    lists conditions, on-use and timed effects only — a plain passive effect
 *    never shows there. A status the system toggles itself is created with
 *    `system.effectType: "condition"`; ours say the same.
 *  • dnd5e: nothing to add — the token and the sheet's Effects tab show any effect.
 */
function tslSystemStatus() {
  return globalThis.game?.system?.id === "a5e" ? { system: { effectType: "condition" } } : {};
}
/**
 * A status id no system knows (a bond in reach, a String pulled, a signature's
 * moment) travels with this second one: a5e's Effects Panel removes an effect
 * with ONE status through Actor#toggleStatusEffect, which throws for an id that
 * isn't in CONFIG.statusEffects; with two it simply deletes the effect.
 */
const TSL_STATUS_MARK = "tsl-social";
/** What an emotion costs the one who feels it. */
const EMOTION_PENALTY = 2;
/** What it gives those who play on it. */
const EMOTION_BONUS = 2;

/** What the same emotion does on the sheet, everywhere: its edge, and its burden. */
const EMOTION_SHEET = 2;
/** A scar keeps both, smaller, for good. */
const SCAR_SHEET = 1;
/** Bumped when what an emotion or a scar puts on a sheet changes: older effects are written anew on the GM's load. */
const EMOTION_FX_VERSION = 2;

/**
 * The five emotions. `spoils` — whose maneuvers it spoils (an approach, or
 * some jobs), against anyone. `opens` — the approach that plays on it in
 * someone else, for anyone. `sheet` — the lever it raises and the one it
 * lowers on the sheet (bond-powers.js builds the system's changes).
 * `clear` — how it's let go.
 */
const EMOTIONS = {
  angry: {
    id: "angry", label: "Angry", img: "icons/svg/fire.svg", color: "#e8553d",
    spoils: { approach: "heart" },     spoilsText: "−2 on Heart — you can't be tender",
    opens: "pressure",                 opensText: "+2 to Pressure against them — they bite at the bait",
    sheet: { up: "damage", down: "ac" }, sheetText: "you hit harder and guard worse",
    clear: "Lash out — hurt someone, or break something that matters.", scar: "shortFuse",
  },
  frightened: {
    id: "frightened", label: "Frightened", img: "icons/svg/terror.svg", color: "#9fb4c8",
    spoils: { approach: "pressure" },  spoilsText: "−2 on Pressure — you can't push",
    opens: "pressure",                 opensText: "+2 to Pressure against them — threats land",
    sheet: { up: "ac", down: "attack" }, sheetText: "you guard better and strike worse",
    clear: "Run from it — back down, or flee what scares you.", scar: "flinch",
  },
  guilty: {
    id: "guilty", label: "Guilty", img: "icons/svg/net.svg", color: "#c9a25b",
    spoils: { jobs: ["gambit"] },      spoilsText: "−2 on all-ins and lies — your conscience gets in the way",
    opens: "heart",                    opensText: "+2 to Heart against them — they want to make amends",
    sheet: { up: "save", down: "init" }, sheetText: "you bear what comes, and hesitate to act",
    clear: "Make amends — confess, repay, or sacrifice something for the one you wronged.", scar: "debt",
  },
  insecure: {
    id: "insecure", label: "Insecure", img: "icons/svg/daze.svg", color: "#b58fd6",
    spoils: { approach: "reason" },    spoilsText: "−2 on Reason — you second-guess every argument",
    opens: "heart",                    opensText: "+2 to Heart against them — they crave approval",
    sheet: { up: "init", down: "damage" }, sheetText: "you rush to prove yourself, and pull your blows",
    clear: "Prove yourself — take a reckless risk to show what you're worth.", scar: "mask",
  },
  hopeless: {
    id: "hopeless", label: "Hopeless", img: "icons/svg/downgrade.svg", color: "#7d8a99",
    spoils: { jobs: ["ask"] },         spoilsText: "−2 on plain asks — there seems no point in asking",
    opens: "reason",                   opensText: "+2 to Reason against them — they'll take any way out",
    sheet: { up: "attack", down: "save" }, sheetText: "nothing to lose: you strike without fear, and don't resist",
    clear: "Let go — give up on something, or let someone comfort you.", scar: "hollow",
  },
};
const EMOTION_ORDER = ["angry", "frightened", "guilty", "insecure", "hopeless"];

/**
 * A scar — what an emotion leaves when it hits the same place twice. Permanent:
 * a twist to how they reach people, and its emotion's edge and burden on the
 * sheet at ±1 (`TSLEmotions.sheetTally`).
 */
const SCARS = {
  shortFuse: { id: "shortFuse", label: "Short Fuse", from: "angry",
    plus: { approach: "pressure" }, minus: { approach: "heart" },
    text: "+1 on Pressure, −1 on Heart (you snap easily, and soften hard) — permanently." },
  flinch:    { id: "flinch",    label: "Flinch",     from: "frightened",
    plus: { job: "read" },          minus: { approach: "pressure" },
    text: "+1 on Reads (you watch everyone), −1 on Pressure — permanently." },
  debt:      { id: "debt",      label: "Debt",       from: "guilty",
    plus: { approach: "heart" },    minus: { approach: "reason" },
    text: "+1 on Heart, −1 on Reason (you'd rather give than argue) — permanently." },
  mask:      { id: "mask",      label: "Two Faces",  from: "insecure",
    plus: { job: "gambit" },        minus: { job: "read" },
    text: "+1 on all-ins and lies (you lie well), −1 on Reads (you no longer trust any face) — permanently." },
  hollow:    { id: "hollow",    label: "Hollow",     from: "hopeless",
    plus: { approach: "reason" },   minus: { approach: "heart" },
    text: "+1 on Reason, −1 on Heart (you can't warm anyone up any more) — permanently." },
};

class TSLEmotions {

  static statusId(id) { return `tsl-emo-${id}`; }

  /** What an emotion (or, at ±1, its scar) puts on a sheet: { damage: 2, ac: -2 }. */
  static sheetTally(id, n = EMOTION_SHEET) {
    const sh = EMOTIONS[id]?.sheet;
    return sh ? { [sh.up]: n, [sh.down]: -n } : {};
  }

  /** …in words, the edge first: "+2 to damage · −2 AC". */
  static sheetWords(id, n = EMOTION_SHEET) {
    const sh = EMOTIONS[id]?.sheet;
    if (!sh || typeof TSLBondAuras === "undefined") return "";
    return [TSLBondAuras.describe({ [sh.up]: n }), TSLBondAuras.describe({ [sh.down]: -n })].filter(Boolean).join(" · ");
  }

  /** …short, for a chip: "damage +2 · AC −2". */
  static sheetShort(id, n = EMOTION_SHEET) {
    const sh = EMOTIONS[id]?.sheet;
    return sh && typeof TSLBondAuras !== "undefined" ? TSLBondAuras.short({ [sh.up]: n, [sh.down]: -n }) : "";
  }

  /** …and as the system's own Active Effect changes. */
  static sheetChanges(id, label, n = EMOTION_SHEET) {
    try { return typeof TSLBondAuras !== "undefined" && globalThis.game?.system ? TSLBondAuras.changes(TSLEmotions.sheetTally(id, n), label) : []; }
    catch { return []; }
  }

  /** Everything an emotion is, as Active Effect data (ours, and the Token HUD's toggle: the same effect). */
  static effectData(id, { by = null } = {}) {
    const e = EMOTIONS[id];
    const sheet = TSLEmotions.sheetWords(id);
    return {
      name: e.label, img: e.img, statuses: [TSLEmotions.statusId(id)], ...tslShowIcon(),
      description: `${_t("In a talk:")} ${e.spoilsText}.${sheet ? `<br>${_t("Everywhere:")} ${sheet} — ${e.sheetText}.` : ""}<br><i>${_t("Let it go:")} ${e.clear}</i>`,
      changes: TSLEmotions.sheetChanges(id, e.label),
      flags: { [EMOTION_SCOPE]: { emotion: { id, by, fx: EMOTION_FX_VERSION } } },
    };
  }

  /** A scar, as Active Effect data: its emotion's edge and burden at ±1, for good. */
  static scarData(scarId) {
    const scar = SCARS[scarId];
    const sheet = TSLEmotions.sheetWords(scar.from, SCAR_SHEET);
    const name = _t("Scar — {scar}", { scar: scar.label });
    return {
      name, img: "icons/svg/blood.svg",
      description: `${scar.text}${sheet ? `<br>${_t("Everywhere:")} ${sheet}.` : ""}`,
      changes: TSLEmotions.sheetChanges(scar.from, name, SCAR_SHEET),
      flags: { [EMOTION_SCOPE]: { scar: scar.id, fx: EMOTION_FX_VERSION } },
    };
  }

  /**
   * The five emotions on the Token HUD's status palette. A toggle there makes
   * the very effect the module makes: its sheet changes, its text, its flag.
   */
  static registerStatuses() {
    if (!Array.isArray(CONFIG?.statusEffects)) return;
    for (const id of EMOTION_ORDER) {
      const sid = TSLEmotions.statusId(id);
      const { statuses: _own, ...data } = TSLEmotions.effectData(id);
      const entry = { id: sid, ...data };
      const at = CONFIG.statusEffects.findIndex(s => s.id === sid);
      if (at >= 0) CONFIG.statusEffects[at] = entry; else CONFIG.statusEffects.push(entry);
    }
  }

  /**
   * Bring an actor's emotions and scars up to date (the active GM, on load):
   * ones made before they reached the sheet are written anew, with what they
   * give and cost. Returns how many were rewritten.
   */
  static async sync(actor) {
    const old = [], fresh = [];
    for (const fx of actor?.effects ?? []) {
      const f = fx.flags?.[EMOTION_SCOPE];
      if (f?.emotion?.id && EMOTIONS[f.emotion.id]) {
        if (f.emotion.fx === EMOTION_FX_VERSION) continue;
        old.push(fx.id); fresh.push(TSLEmotions.effectData(f.emotion.id, { by: f.emotion.by ?? null }));
      } else if (f?.scar && SCARS[f.scar]) {
        if (f.fx === EMOTION_FX_VERSION) continue;
        old.push(fx.id); fresh.push(TSLEmotions.scarData(f.scar));
      }
    }
    if (!old.length) return 0;
    await actor.deleteEmbeddedDocuments("ActiveEffect", old);
    await actor.createEmbeddedDocuments("ActiveEffect", fresh);
    return old.length;
  }

  /** What they feel — [{ id, by, effectId }], from their ActiveEffects (ours or a HUD toggle). */
  static of(actor) {
    const out = [];
    for (const fx of actor?.effects ?? []) {
      const flag = fx.flags?.[EMOTION_SCOPE]?.emotion;
      let id = flag?.id;
      if (!id) {
        const st = [...(fx.statuses ?? [])].find(s => typeof s === "string" && s.startsWith("tsl-emo-"));
        id = st ? st.slice(8) : null;
      }
      if (EMOTIONS[id] && !out.some(o => o.id === id)) out.push({ id, by: flag?.by ?? null, effectId: fx.id });
    }
    return out;
  }

  static has(actor, id) { return TSLEmotions.of(actor).some(e => e.id === id); }

  /** Every effect that IS this emotion — ours or a HUD toggle; two can exist if two rolls landed at once. */
  static _effectIds(actor, id) {
    const sid = TSLEmotions.statusId(id);
    return (actor?.effects ?? []).filter(fx => fx.flags?.[EMOTION_SCOPE]?.emotion?.id === id
      || (!fx.flags?.[EMOTION_SCOPE]?.emotion && [...(fx.statuses ?? [])].includes(sid))).map(fx => fx.id);
  }

  /** Who may change what weighs on someone: the GM, or that character's owner. */
  static canEdit(actor) { return !!actor && (game.user.isGM || !!actor.isOwner); }

  /** The scars they carry — ids, each once. */
  static scars(actor) {
    return [...new Set((actor?.effects ?? []).map(fx => fx.flags?.[EMOTION_SCOPE]?.scar).filter(id => SCARS[id]))];
  }

  /**
   * Make them feel it. A player character already carrying it takes its scar
   * instead (once — after that, nothing more). Returns { id, added, scar }.
   * GM client, or the actor's owner.
   */
  static async add(actor, id, { by = null } = {}) {
    const e = EMOTIONS[id];
    if (!actor || !e) return null;
    if (TSLEmotions.has(actor, id)) {
      const scar = SCARS[e.scar];
      if (!SocialArchetypeManager.isPC(actor) || TSLEmotions.scars(actor).includes(scar.id)) return { id, added: false, scar: null };
      await actor.createEmbeddedDocuments("ActiveEffect", [TSLEmotions.scarData(scar.id)]);
      return { id, added: false, scar: scar.id };
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [TSLEmotions.effectData(id, { by })]);
    return { id, added: true, scar: null };
  }

  /**
   * Let it go. `how` — "act" (acted it out in the scene) or a friend's actor id
   * (their comfort). Acting it out is the point of carrying one (the user,
   * 2026-11-15: «що цікавого в їх відіграші»): a character who does what the
   * emotion pushes them to — lash out, back down, make amends — takes D&D's
   * Inspiration, as the game rewards playing a flaw. A friend's comfort lets it
   * go with no reward. Posts one line. `{ inspired }` says whether it gave one.
   */
  static async clear(actor, id, how = "act") {
    const ids = TSLEmotions._effectIds(actor, id);
    if (!ids.length) return false;
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    const esc = foundry.utils.escapeHTML;
    const friend = how !== "act" ? game.actors.get(how) : null;
    const inspired = !friend && SocialArchetypeManager.isPC(actor) && typeof TSLAbilities !== "undefined"
      ? await TSLAbilities.inspire(actor) : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--success tsl-x-card--slim">
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="${EMOTIONS[id].img}" alt=""><span class="tsl-x-title">${_t("{who} lets go of {emotion}", { who: esc(actor.name), emotion: esc(EMOTIONS[id].label) })}</span></div>
        <div class="tsl-x-who">${friend ? _t("{friend} comforts them.", { friend: esc(friend.name) }) : esc(EMOTIONS[id].clear)}${inspired ? ` <b>${inspired}</b>` : ""}</div>
      </div>`,
    });
    return { inspired: !!inspired };
  }

  /** Take it off without a word — the GM's own correction (no chat line). */
  static async unset(actor, id) {
    const ids = TSLEmotions._effectIds(actor, id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length > 0;
  }

  /**
   * The talk itself landed: the GM marks what it left on someone — an NPC, or
   * a character their words hit. No roll. Marking what they already feel takes
   * it back (a correction, so never a scar). One chat line when it lands, so
   * the table sees what it opens — or, on a character, what it costs — and
   * what it does on the sheet. `by`: whose words left it (for the record).
   * Returns "added" | "removed" | null.
   */
  static async mark(actor, id, { by = null, title = null } = {}) {
    const e = EMOTIONS[id];
    if (!TSLEmotions.canEdit(actor) || !e) return null;
    if (TSLEmotions.has(actor, id)) { await TSLEmotions.unset(actor, id); return "removed"; }
    await TSLEmotions.add(actor, id, { by });
    const esc = foundry.utils.escapeHTML;
    const sheet = TSLEmotions.sheetWords(id);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--success tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-comments"></i><span class="tsl-x-title">${title ? esc(title) : _t("The words landed")}</span></div>
        <div class="tsl-x-who">${_t("{img} {who} is <b>{emotion}</b> — {opens}.", { img: `<img class="tsl-emo-ico" src="${e.img}" alt="">`,
          who: esc(actor.name), emotion: esc(e.label), opens: esc(SocialArchetypeManager.isPC(actor) ? e.spoilsText : e.opensText) })}${sheet ? ` ${_t("On the sheet: {sheet}.", { sheet: esc(sheet) })}` : ""}</div>
      </div>`,
    });
    return "added";
  }

  /** A scar put on by hand — the GM, or the character's owner (the story left one). Once each. One line in the chat. */
  static async addScar(actor, scarId) {
    const scar = SCARS[scarId];
    if (!TSLEmotions.canEdit(actor) || !scar || TSLEmotions.scars(actor).includes(scarId)) return false;
    await actor.createEmbeddedDocuments("ActiveEffect", [TSLEmotions.scarData(scar.id)]);
    const esc = foundry.utils.escapeHTML;
    const sheet = TSLEmotions.sheetWords(scar.from, SCAR_SHEET);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--botch tsl-x-card--slim">
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="icons/svg/blood.svg" alt=""><span class="tsl-x-title">${_t("{who} carries a scar: {scar}", { who: esc(actor.name), scar: esc(scar.label) })}</span></div>
        <div class="tsl-x-who">${esc(scar.text)}${sheet ? ` ${_t("On the sheet: {sheet}.", { sheet: esc(sheet) })}` : ""}</div>
      </div>`,
    });
    return true;
  }

  /** A scar wiped (a story turn earned it) — the GM, or the character's owner. Every copy of it. */
  static async removeScar(actor, scarId) {
    if (!TSLEmotions.canEdit(actor)) return;
    const ids = (actor.effects ?? []).filter(f => f.flags?.[EMOTION_SCOPE]?.scar === scarId).map(f => f.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /**
   * Emotions' and scars' share of a roll: the speaker's own (a penalty, a
   * scar's twist) and the target's (a bonus for playing on what they feel).
   */
  static rollParts(src, tgt, technique, approach = approachOf(technique)) {
    const tech = TECHNIQUES[technique];
    const parts = [];
    if (!tech || !src) return parts;
    for (const e of TSLEmotions.of(src)) {
      const s = EMOTIONS[e.id].spoils;
      const spoiled = s.approach ? s.approach === approach : s.jobs ? s.jobs.includes(tech.job) : false;
      if (spoiled) parts.push({ label: _t("you're {emotion}", { emotion: EMOTIONS[e.id].label }), value: -EMOTION_PENALTY });
    }
    const fits = (r) => r.approach ? r.approach === approach : r.job === tech.job;
    for (const id of TSLEmotions.scars(src)) {
      const sc = SCARS[id];
      if (fits(sc.plus)) parts.push({ label: _t("scar — {scar}", { scar: sc.label }), value: 1 });
      if (fits(sc.minus)) parts.push({ label: _t("scar — {scar}", { scar: sc.label }), value: -1 });
    }
    for (const e of TSLEmotions.of(tgt)) {
      if (EMOTIONS[e.id].opens !== approach) continue;
      parts.push({ label: _t("they're {emotion}", { emotion: EMOTIONS[e.id].label }), value: EMOTION_BONUS });
    }
    return parts;
  }

  /**
   * The emotion on `tgt` that opens this way of talking for `src` (its id), or
   * null. A state beats a habit: while they carry it, their wall against that
   * way doesn't stand (TSLTalk.relationFor) — fear lets a threat through, guilt
   * a plea, hopelessness an argument — whoever is talking.
   */
  static opening(src, tgt, approach) {
    if (!approach || !tgt) return null;
    for (const e of TSLEmotions.of(tgt)) {
      if (EMOTIONS[e.id]?.opens !== approach) continue;
      return e.id;
    }
    return null;
  }
}
