/**
 * tsl-social-conflict | emotions.js
 *
 * v3 — EMOTIONS & SCARS (design: docs/v3-design.md §3).
 *
 * Five emotions, as in Thirsty Sword Lesbians: Angry, Frightened, Guilty,
 * Insecure, Hopeless. Anyone can carry them — a player character or an NPC —
 * as real ActiveEffects with a token status icon, toward everyone (the user,
 * 2026-11-14: «не проти лише когось одного, а проти всіх»). Since 3.20 each is
 * ONE flaw and ONE opening (the user's pick, 2026-11-19: «Одна вада, одна
 * вразливість», after «Треба переробити емоції і їх механіку»):
 *   on whoever feels it — −2 on one way of talking (`spoils`) and −2 on one
 *     roll in a fight (`sheet`, on the sheet by itself); no edge;
 *   for whoever plays on it — that approach rolls with ADVANTAGE (`opens`);
 *     against their wall it cancels out, as advantage and disadvantage do in
 *     D&D: a normal roll (TSLTalk.relationFor).
 * Acted out in the scene it goes, and the character takes Inspiration; a
 * friend's comfort lets it go with no reward.
 *
 * Where they come from:
 *   • the talk itself: when the words land, the GM marks it — no roll (mark);
 *   • a miss (of the reads, only a Provoke): the NPC hits back with its
 *     nature's emotion;
 *   • an NPC's move, refused (abilities.js);
 *   • gambits: Blackmail frightens them, a broken heart leaves you Hopeless,
 *     a lie brought out leaves them Angry.
 * A player character who takes an emotion they already carry takes its SCAR
 * too — permanent, one per emotion: −1 on the same two things.
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
/** What an emotion costs the one who feels it, in a talk. */
const EMOTION_PENALTY = 2;
/** …and on the sheet, in a fight too. */
const EMOTION_SHEET = 2;
/** What a scar keeps of both, permanently. */
const SCAR_PENALTY = 1;
const SCAR_SHEET = 1;
/** Bumped when what an emotion or a scar puts on a sheet changes: older effects are written anew on the GM's load. */
const EMOTION_FX_VERSION = 3;
/** Our status icons: one badge each, drawn for the 20 px a token gives a status. */
const TSL_ICONS = "modules/tsl-social-conflict/icons/status";

/**
 * The five emotions. `spoils` — whose maneuvers it spoils (an approach, or
 * some jobs), −2, against anyone. `opens` — the approach that plays on it in
 * someone else: advantage, for anyone. `sheet` — the one roll it costs on the
 * sheet, −2 (bond-powers.js builds the system's changes). `clear` — how it's
 * acted out.
 */
const EMOTIONS = {
  angry: {
    id: "angry", label: "Angry", img: `${TSL_ICONS}/emo-angry.svg`, color: "#e8553d",
    spoils: { approach: "heart" },     spoilsText: "−2 on Heart — you can't be tender",
    opens: "pressure",                 opensText: "Pressure against them rolls with advantage — they bite at the bait",
    sheet: "ac",                       sheetText: "you rush in and leave yourself open",
    clear: "Lash out — hurt someone, or break something that matters.", scar: "shortFuse",
  },
  frightened: {
    id: "frightened", label: "Frightened", img: `${TSL_ICONS}/emo-frightened.svg`, color: "#9fb4c8",
    spoils: { approach: "pressure" },  spoilsText: "−2 on Pressure — you can't push",
    opens: "pressure",                 opensText: "Pressure against them rolls with advantage — threats land",
    sheet: "attack",                   sheetText: "your hand shakes",
    clear: "Run from it — back down, or flee what scares you.", scar: "flinch",
  },
  guilty: {
    id: "guilty", label: "Guilty", img: `${TSL_ICONS}/emo-guilty.svg`, color: "#c9a25b",
    spoils: { jobs: ["gambit"] },      spoilsText: "−2 on all-ins and lies — your conscience gets in the way",
    opens: "heart",                    opensText: "Heart against them rolls with advantage — they want to make amends",
    sheet: "init",                     sheetText: "you hesitate to act",
    clear: "Make amends — confess, repay, or sacrifice something for the one you wronged.", scar: "debt",
  },
  insecure: {
    id: "insecure", label: "Insecure", img: `${TSL_ICONS}/emo-insecure.svg`, color: "#b58fd6",
    spoils: { approach: "reason" },    spoilsText: "−2 on Reason — you second-guess every argument",
    opens: "heart",                    opensText: "Heart against them rolls with advantage — they crave approval",
    sheet: "save",                     sheetText: "you don't believe you can hold",
    clear: "Prove yourself — take a reckless risk to show what you're worth.", scar: "mask",
  },
  hopeless: {
    id: "hopeless", label: "Hopeless", img: `${TSL_ICONS}/emo-hopeless.svg`, color: "#7d8a99",
    spoils: { jobs: ["ask"] },         spoilsText: "−2 on plain asks — there seems no point in asking",
    opens: "reason",                   opensText: "Reason against them rolls with advantage — they'll take any way out",
    sheet: "damage",                   sheetText: "you strike without belief",
    clear: "Let go — give up on something, or let someone comfort you.", scar: "hollow",
  },
};
const EMOTION_ORDER = ["angry", "frightened", "guilty", "insecure", "hopeless"];

/**
 * A scar — what an emotion leaves when it hits the same place twice:
 * permanent, one of each, −1 on the same two things as its emotion (the way
 * of talking it spoils, and its roll on the sheet).
 */
const SCARS = {
  shortFuse: { id: "shortFuse", label: "Short Fuse", from: "angry",
    text: "−1 on Heart and −1 AC — permanently: you flare up first." },
  flinch:    { id: "flinch",    label: "Flinch",     from: "frightened",
    text: "−1 on Pressure and −1 to attack rolls — permanently: you flinch before you strike." },
  debt:      { id: "debt",      label: "Debt",       from: "guilty",
    text: "−1 on all-ins and lies and −1 to initiative — permanently: the old debt holds you back." },
  mask:      { id: "mask",      label: "Two Faces",  from: "insecure",
    text: "−1 on Reason and −1 to saving throws — permanently: you never quite believe yourself." },
  hollow:    { id: "hollow",    label: "Hollow",     from: "hopeless",
    text: "−1 on plain asks and −1 to damage — permanently: something in you stopped trying." },
};
const SCAR_IMG = `${TSL_ICONS}/scar.svg`;

class TSLEmotions {

  static statusId(id) { return `tsl-emo-${id}`; }

  /** What an emotion (or, at 1, its scar) costs on a sheet: { ac: -2 }. */
  static sheetTally(id, n = EMOTION_SHEET) {
    const sh = EMOTIONS[id]?.sheet;
    return sh ? { [sh]: -n } : {};
  }

  /** …in words: "−2 AC". */
  static sheetWords(id, n = EMOTION_SHEET) {
    return typeof TSLBondAuras !== "undefined" ? TSLBondAuras.describe(TSLEmotions.sheetTally(id, n)) : "";
  }

  /** …short, for a chip: "AC −2". */
  static sheetShort(id, n = EMOTION_SHEET) {
    return typeof TSLBondAuras !== "undefined" ? TSLBondAuras.short(TSLEmotions.sheetTally(id, n)) : "";
  }

  /** The talk part of it, short: "Heart −2", "all in & lies −2", "asks −2". */
  static talkShort(id, n = EMOTION_PENALTY) {
    const s = EMOTIONS[id]?.spoils ?? {};
    const what = s.approach ? APPROACHES[s.approach]?.label : (s.jobs ?? []).includes("gambit") ? _t("all in & lies") : _t("asks");
    return what ? `${what} −${n}` : "";
  }

  /** The whole flaw at once, short: "Heart −2 · AC −2" (a scar's: "Heart −1 · AC −1"). */
  static flawShort(id, scar = false) {
    return [TSLEmotions.talkShort(id, scar ? SCAR_PENALTY : EMOTION_PENALTY), TSLEmotions.sheetShort(id, scar ? SCAR_SHEET : EMOTION_SHEET)].filter(Boolean).join(" · ");
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

  /** A scar, as Active Effect data: −1 on its emotion's roll on the sheet, permanently. */
  static scarData(scarId) {
    const scar = SCARS[scarId];
    const sheet = TSLEmotions.sheetWords(scar.from, SCAR_SHEET);
    const name = _t("Scar — {scar}", { scar: scar.label });
    return {
      name, img: SCAR_IMG,
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
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="${SCAR_IMG}" alt=""><span class="tsl-x-title">${_t("{who} carries a scar: {scar}", { who: esc(actor.name), scar: esc(scar.label) })}</span></div>
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
    // A scar keeps its emotion's flaw, at −1. What plays on THEIR emotion is no number: advantage (TSLTalk.relationFor).
    for (const id of TSLEmotions.scars(src)) {
      const s = EMOTIONS[SCARS[id].from]?.spoils ?? {};
      const spoiled = s.approach ? s.approach === approach : s.jobs ? s.jobs.includes(tech.job) : false;
      if (spoiled) parts.push({ label: _t("scar — {scar}", { scar: SCARS[id].label }), value: -SCAR_PENALTY });
    }
    return parts;
  }

  /**
   * The emotion on `tgt` that opens this way of talking for `src` (its id), or
   * null: that way rolls with advantage while they carry it — and against
   * their wall it cancels out, a normal roll (TSLTalk.relationFor). Fear lets
   * a threat through, guilt a plea, hopelessness an argument — whoever talks.
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
