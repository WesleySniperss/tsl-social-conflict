/**
 * tsl-social-conflict | emotions.js
 *
 * v3 — EMOTIONS & SCARS (design: docs/v3-design.md §3).
 *
 * Five emotions, as in Thirsty Sword Lesbians: Angry, Frightened, Guilty,
 * Insecure, Hopeless. Anyone can carry them — a player character or an NPC —
 * as real ActiveEffects with a token status icon. The module applies them in
 * its own rolls:
 *   on the one who feels it — −2 on the techniques the emotion spoils;
 *   on a target who feels it — +2 to techniques that play on it.
 * Each is let go by acting it out in character, or by a friend's comfort.
 *
 * Where they come from:
 *   • the talk itself: when the words land, the GM marks it — no roll (mark);
 *   • a miss (anything but a Read): the NPC hits back with its nature's emotion;
 *   • an NPC's move, refused (abilities.js);
 *   • gambits: Blackmail frightens them, a broken heart leaves you Hopeless,
 *     a lie brought out leaves them Angry.
 * A player character who takes an emotion they already carry takes its SCAR
 * instead — permanent, one per emotion, a +1 / −1 twist to how they reach
 * people.
 */

console.log("TSL | Loading emotions.js...");

const EMOTION_SCOPE = "tsl-social-conflict";
/** What an emotion costs the one who feels it. */
const EMOTION_PENALTY = 2;
/** What it gives those who play on it. */
const EMOTION_BONUS = 2;

/**
 * The five emotions. `spoils` — whose techniques it spoils (an approach, some
 * jobs, or everything against the one you feel it toward). `opens` — the
 * approach that plays on it in someone else. `clear` — how it's let go.
 */
const EMOTIONS = {
  angry: {
    id: "angry", label: "Angry", img: "icons/svg/fire.svg", color: "#e8553d",
    spoils: { approach: "heart" },     spoilsText: "−2 on Heart — you can't be tender",
    opens: "pressure",                 opensText: "+2 to Pressure against them — they bite at the bait",
    clear: "Lash out — hurt someone, or break something that matters.", scar: "shortFuse",
  },
  frightened: {
    id: "frightened", label: "Frightened", img: "icons/svg/terror.svg", color: "#9fb4c8",
    spoils: { approach: "pressure" },  spoilsText: "−2 on Pressure — you can't push",
    opens: "pressure",                 opensText: "+2 to Pressure against them — threats land",
    clear: "Run from it — back down, or flee what scares you.", scar: "flinch",
  },
  guilty: {
    id: "guilty", label: "Guilty", img: "icons/svg/net.svg", color: "#c9a25b",
    spoils: { toward: true },          spoilsText: "−2 on everything against the one you wronged",
    opens: "heart",                    opensText: "+2 to Heart from the one they wronged — they want to make amends",
    clear: "Make amends — confess, repay, or sacrifice something for them.", scar: "debt",
  },
  insecure: {
    id: "insecure", label: "Insecure", img: "icons/svg/daze.svg", color: "#b58fd6",
    spoils: { approach: "reason" },    spoilsText: "−2 on Reason — you second-guess every argument",
    opens: "heart",                    opensText: "+2 to Heart against them — they crave approval",
    clear: "Prove yourself — take a reckless risk to show what you're worth.", scar: "mask",
  },
  hopeless: {
    id: "hopeless", label: "Hopeless", img: "icons/svg/downgrade.svg", color: "#7d8a99",
    spoils: { jobs: ["ask", "gambit"] }, spoilsText: "−2 on asks and gambits — there seems no point in asking",
    opens: "reason",                   opensText: "+2 to Reason against them — they'll take any way out",
    clear: "Let go — give up on something, or let someone comfort you.", scar: "hollow",
  },
};
const EMOTION_ORDER = ["angry", "frightened", "guilty", "insecure", "hopeless"];

/** A scar — what an emotion leaves when it hits the same place twice. Permanent. */
const SCARS = {
  shortFuse: { id: "shortFuse", label: "Short Fuse", from: "angry",
    plus: { approach: "pressure" }, minus: { approach: "heart" },
    text: "+1 on Pressure, −1 on Heart — for good." },
  flinch:    { id: "flinch",    label: "Flinch",     from: "frightened",
    plus: { job: "read" },          minus: { approach: "pressure" },
    text: "+1 on Reads (you watch everyone), −1 on Pressure — for good." },
  debt:      { id: "debt",      label: "Debt",       from: "guilty",
    plus: { approach: "heart" },    minus: { approach: "reason" },
    text: "+1 on Heart, −1 on Reason (you can't bargain with people) — for good." },
  mask:      { id: "mask",      label: "Two Faces",  from: "insecure",
    plus: { job: "gambit" },        minus: { job: "read" },
    text: "+1 on Gambits (you lie well), −1 on Reads (you no longer trust any face) — for good." },
  hollow:    { id: "hollow",    label: "Hollow",     from: "hopeless",
    plus: { approach: "reason" },   minus: { approach: "heart" },
    text: "+1 on Reason, −1 on Heart (you can't warm anyone up any more) — for good." },
};

class TSLEmotions {

  static statusId(id) { return `tsl-emo-${id}`; }

  /** The five emotions on the Token HUD's status palette (the GM can toggle them by hand). */
  static registerStatuses() {
    if (!Array.isArray(CONFIG?.statusEffects)) return;
    for (const id of EMOTION_ORDER) {
      const sid = TSLEmotions.statusId(id);
      const have = CONFIG.statusEffects.find(s => s.id === sid);
      if (have) { have.name = EMOTIONS[id].label; continue; }
      CONFIG.statusEffects.push({ id: sid, name: EMOTIONS[id].label, img: EMOTIONS[id].img });
    }
  }

  /** What they feel — [{ id, by, toward, effectId }], from their ActiveEffects (ours or a HUD toggle). */
  static of(actor) {
    const out = [];
    for (const fx of actor?.effects ?? []) {
      const flag = fx.flags?.[EMOTION_SCOPE]?.emotion;
      let id = flag?.id;
      if (!id) {
        const st = [...(fx.statuses ?? [])].find(s => typeof s === "string" && s.startsWith("tsl-emo-"));
        id = st ? st.slice(8) : null;
      }
      if (EMOTIONS[id] && !out.some(o => o.id === id)) out.push({ id, by: flag?.by ?? null, toward: flag?.toward ?? null, effectId: fx.id });
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
  static async add(actor, id, { by = null, toward = null } = {}) {
    const e = EMOTIONS[id];
    if (!actor || !e) return null;
    if (TSLEmotions.has(actor, id)) {
      const scar = SCARS[e.scar];
      if (!SocialArchetypeManager.isPC(actor) || TSLEmotions.scars(actor).includes(scar.id)) return { id, added: false, scar: null };
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: _t("Scar — {scar}", { scar: scar.label }), img: "icons/svg/blood.svg", description: scar.text,
        flags: { [EMOTION_SCOPE]: { scar: scar.id } },
      }]);
      return { id, added: false, scar: scar.id };
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: e.label, img: e.img, statuses: [TSLEmotions.statusId(id)],
      description: `${e.spoilsText}. ${e.clear}`,
      flags: { [EMOTION_SCOPE]: { emotion: { id, by, toward } } },
    }]);
    return { id, added: true, scar: null };
  }

  /** Let it go. `how` — "act" (acted it out) or a friend's actor id (their comfort). Posts one line. */
  static async clear(actor, id, how = "act") {
    const ids = TSLEmotions._effectIds(actor, id);
    if (!ids.length) return false;
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    const esc = foundry.utils.escapeHTML;
    const friend = how !== "act" ? game.actors.get(how) : null;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--success tsl-x-card--slim">
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="${EMOTIONS[id].img}" alt=""><span class="tsl-x-title">${_t("{who} lets go of {emotion}", { who: esc(actor.name), emotion: esc(EMOTIONS[id].label) })}</span></div>
        <div class="tsl-x-who">${friend ? _t("{friend} comforts them.", { friend: esc(friend.name) }) : esc(EMOTIONS[id].clear)}</div>
      </div>`,
    });
    return true;
  }

  /** Take it off without a word — the GM's own correction (no chat line). */
  static async unset(actor, id) {
    const ids = TSLEmotions._effectIds(actor, id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length > 0;
  }

  /**
   * The talk itself landed: the GM marks what it left on someone — an NPC, or
   * a character their words hit. No roll. Guilty is owed to someone (`toward`).
   * Marking what they already feel takes it back (a correction, so never a
   * scar); Guilty toward someone else moves it. One chat line when it lands, so
   * the table sees what it opens — or, on a character, what it costs. GM client.
   * Returns "added" | "removed" | null.
   */
  static async mark(actor, id, { toward = null, title = null } = {}) {
    const e = EMOTIONS[id];
    if (!TSLEmotions.canEdit(actor) || !e) return null;
    if (id === "guilty" && !toward) return null;
    const had = TSLEmotions.of(actor).find(x => x.id === id);
    if (had) {
      await TSLEmotions.unset(actor, id);
      if (id !== "guilty" || had.toward === toward) return "removed";
    }
    await TSLEmotions.add(actor, id, { by: toward, toward: id === "guilty" ? toward : null });
    const esc = foundry.utils.escapeHTML;
    const to = id === "guilty" ? game.actors.get(toward)?.name : null;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--success tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-comments"></i><span class="tsl-x-title">${title ? esc(title) : _t("The words landed")}</span></div>
        <div class="tsl-x-who">${_t("{img} {who} is <b>{emotion}</b> — {opens}.", { img: `<img class="tsl-emo-ico" src="${e.img}" alt="">`,
          who: esc(actor.name), emotion: esc(to ? `${e.label} → ${to}` : e.label), opens: esc(SocialArchetypeManager.isPC(actor) ? e.spoilsText : e.opensText) })}</div>
      </div>`,
    });
    return "added";
  }

  /** A scar put on by hand — the GM, or the character's owner (the story left one). Once each. One line in the chat. */
  static async addScar(actor, scarId) {
    const scar = SCARS[scarId];
    if (!TSLEmotions.canEdit(actor) || !scar || TSLEmotions.scars(actor).includes(scarId)) return false;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: _t("Scar — {scar}", { scar: scar.label }), img: "icons/svg/blood.svg", description: scar.text,
      flags: { [EMOTION_SCOPE]: { scar: scar.id } },
    }]);
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--botch tsl-x-card--slim">
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="icons/svg/blood.svg" alt=""><span class="tsl-x-title">${_t("{who} carries a scar: {scar}", { who: esc(actor.name), scar: esc(scar.label) })}</span></div>
        <div class="tsl-x-who">${esc(scar.text)}</div>
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
      const spoiled = s.approach ? s.approach === approach
        : s.jobs ? s.jobs.includes(tech.job)
        : s.toward ? (!e.toward || e.toward === tgt?.id) : false;
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
      if (e.id === "guilty" && e.toward && e.toward !== src.id) continue;
      parts.push({ label: _t("they're {emotion}", { emotion: EMOTIONS[e.id].label }), value: EMOTION_BONUS });
    }
    return parts;
  }
}

/**
 * The system's own conditions — D&D's Prone, Charmed, Frightened… what the
 * token HUD toggles — shown and switched from the Chronicle too, by the GM or
 * the character's owner. Our own statuses (the emotions, a bond's aura, a pull,
 * a moment) aren't among them; exhaustion is a level, not a switch — it stays
 * on the sheet.
 */
class TSLConditions {
  static list() {
    return (globalThis.CONFIG?.statusEffects ?? [])
      .filter(c => c?.id && !String(c.id).startsWith("tsl-") && c.id !== "exhaustion" && (c.img || c.icon))
      .map(c => ({ id: c.id, name: game.i18n?.localize?.(c.name ?? c.label ?? c.id) ?? (c.name ?? c.id), img: c.img ?? c.icon }));
  }

  /** The ones on them now (from their active effects). */
  static active(actor) {
    const on = actor?.statuses instanceof Set ? actor.statuses
      : new Set((actor?.effects ?? []).filter(e => !e.disabled).flatMap(e => [...(e.statuses ?? [])]));
    return TSLConditions.list().filter(c => on.has(c.id));
  }

  /** On or off — through the system, as the token HUD does it. */
  static async toggle(actor, id, active = undefined) {
    if (!TSLEmotions.canEdit(actor) || typeof actor.toggleStatusEffect !== "function") return false;
    await actor.toggleStatusEffect(id, active === undefined ? {} : { active });
    return true;
  }
}
globalThis.TSLConditions = TSLConditions;
