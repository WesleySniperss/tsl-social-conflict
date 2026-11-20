/**
 * tsl-social-conflict | emotions.js
 *
 * v3 — EMOTIONS & SCARS (design: docs/v3-design.md §3).
 *
 * Five emotions, as in Thirsty Sword Lesbians: Angry, Frightened, Guilty,
 * Insecure, Hopeless. Anyone can carry one — a player character or an NPC —
 * as a real ActiveEffect with a token status icon, toward everyone. Since 3.21
 * an emotion is a CHARACTER FOR A WHILE, like a compulsion in Vampire (the
 * user, 2026-11-20: «це може працювати десь як компульсія в втм»), after «плюси
 * на емоції мені теж не подобаються» and «Це має бути важливим і рідкісним
 * чинником»:
 *   • it gives a STRENGTH and takes something — D&D's advantage and
 *     disadvantage, on the sheet by itself (`edge` / `flaw`), in a talk and in
 *     a fight alike: a talk rolls a skill, and the skill carries it. No number;
 *   • whoever plays on it rolls that way with advantage (`opens`;
 *     TSLTalk.relationFor) — against their wall it cancels out;
 *   • ONE at a time: a new one pushes the old out; the same one again, on a
 *     character, leaves its SCAR — that emotion's weakness in a talk
 *     (one skill, with disadvantage), permanently;
 *   • it goes when it is acted out — the GM says so, and the character takes
 *     D&D's Inspiration — or it calms down by itself after a long rest, with
 *     no reward. A player can't shed one: they ask the GM (a card).
 *
 * Where they come from — rarely (the user's pick, 2026-11-20: «Провал і ва-банк»):
 *   • a bad miss (5 under the DC, or a 1): the one you faced hits back with
 *     their nature's emotion; any miss of an all-in or a Provoke too;
 *   • a no before witnesses (Insecure), a win against someone close (Guilty),
 *     a broken heart (Hopeless), an NPC's move refused;
 *   • on an NPC: Blackmail (Frightened), a lie brought out (Angry);
 *   • the talk itself, when the words truly land: the GM marks it (mark).
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
/** Bumped when what an emotion or a scar puts on a sheet changes: older effects are written anew on the GM's load. */
const EMOTION_FX_VERSION = 4;
/** Our status icons: one badge each, drawn for the 20 px a token gives a status. */
const TSL_ICONS = "modules/tsl-social-conflict/icons/badges";

/**
 * The five emotions — each a strength without something:
 *   `edge` / `flaw` — what it gives and takes, as specs the sheet understands
 *     (`skill:<key>`, `save:<ability>`, `attack` or `attack:melee`, `init`,
 *     `death`, `immune:<condition>`): advantage on the edge, disadvantage on
 *     the flaw; `edgeText` / `flawText` say it, `edgeShort` / `flawShort` name it
 *     on a tile.
 *   `opens` — the approach that plays on it in someone else: advantage, for anyone.
 *   `clear` — how it's acted out.
 */
const EMOTIONS = {
  angry: {
    id: "angry", label: "Angry", img: `${TSL_ICONS}/emo-angry.svg`, color: "#e8553d",
    theme: "strength without sight",
    edge: ["attack:melee", "skill:itm"], edgeText: "melee attacks and Intimidation with advantage",
    flaw: ["skill:ins", "save:dex"],     flawText: "Insight and Dexterity saves with disadvantage — you're easy to fool, and you don't dodge",
    edgeShort: "melee attacks, Intimidation", flawShort: "Insight, Dexterity saves",
    opens: "pressure", opensText: "Pressure against them rolls with advantage — they bite at the bait",
    clear: "Lash out — hurt someone, or break something that matters.", scar: "shortFuse",
  },
  frightened: {
    id: "frightened", label: "Frightened", img: `${TSL_ICONS}/emo-frightened.svg`, color: "#9fb4c8",
    theme: "speed without strength",
    edge: ["init", "save:dex"],        edgeText: "initiative and Dexterity saves with advantage — nothing takes you by surprise",
    flaw: ["attack", "skill:itm"],     flawText: "attack rolls and Intimidation with disadvantage — your hand shakes, your threats ring hollow",
    edgeShort: "initiative, Dexterity saves", flawShort: "attacks, Intimidation",
    opens: "pressure", opensText: "Pressure against them rolls with advantage — threats land",
    clear: "Back down — give in, or flee what scares you.", scar: "flinch",
  },
  guilty: {
    id: "guilty", label: "Guilty", img: `${TSL_ICONS}/emo-guilty.svg`, color: "#c9a25b",
    theme: "sincerity without lies",
    edge: ["skill:per", "skill:ins"],  edgeText: "Persuasion and Insight with advantage — you hear others' pain, and they believe you",
    flaw: ["skill:dec", "init"],       flawText: "Deception and initiative with disadvantage — the lie sticks in your throat, and you hesitate",
    edgeShort: "Persuasion, Insight", flawShort: "Deception, initiative",
    opens: "heart", opensText: "Heart against them rolls with advantage — they want to make amends",
    clear: "Make amends — confess, repay, or sacrifice something for the one you wronged.", scar: "debt",
  },
  insecure: {
    id: "insecure", label: "Insecure", img: `${TSL_ICONS}/emo-insecure.svg`, color: "#b58fd6",
    theme: "vigilance without footing",
    edge: ["skill:prc", "skill:inv"],  edgeText: "Perception and Investigation with advantage — you check everything twice and catch every glance",
    flaw: ["skill:prf", "save:wis"],   flawText: "Performance and Wisdom saves with disadvantage — the stage scares you, and you're easy to shake",
    edgeShort: "Perception, Investigation", flawShort: "Performance, Wisdom saves",
    opens: "heart", opensText: "Heart against them rolls with advantage — they crave approval",
    clear: "Prove yourself — take a reckless risk, and tell no one.", scar: "mask",
  },
  hopeless: {
    id: "hopeless", label: "Hopeless", img: `${TSL_ICONS}/emo-hopeless.svg`, color: "#7d8a99",
    theme: "fearlessness without faith",
    edge: ["immune:frightened"],       edgeText: "nothing can frighten you — immune to the Frightened condition",
    flaw: ["skill:per", "death"],      flawText: "Persuasion and death saving throws with disadvantage — no faith in your words, no will to live",
    edgeShort: "can't be frightened", flawShort: "Persuasion, death saves",
    opens: "reason", opensText: "Reason against them rolls with advantage — they'll take any way out",
    clear: "Let go — give up on something, or let someone comfort you.", scar: "hollow",
  },
};
const EMOTION_ORDER = ["angry", "frightened", "guilty", "insecure", "hopeless"];

/**
 * A scar — what an emotion leaves when it hits the same place twice:
 * permanent, one of each — its emotion's weakness in a talk: one skill, with
 * disadvantage. Only the story heals it.
 */
const SCARS = {
  shortFuse: { id: "shortFuse", label: "Short Fuse", from: "angry",      skill: "ins",
    text: "Insight with disadvantage — permanently: you see a slight in every look." },
  flinch:    { id: "flinch",    label: "Flinch",     from: "frightened", skill: "itm",
    text: "Intimidation with disadvantage — permanently: your threats ring hollow." },
  debt:      { id: "debt",      label: "Debt",       from: "guilty",     skill: "dec",
    text: "Deception with disadvantage — permanently: the old debt shows in your face." },
  mask:      { id: "mask",      label: "Two Faces",  from: "insecure",   skill: "prf",
    text: "Performance with disadvantage — permanently: you never quite believe your own act." },
  hollow:    { id: "hollow",    label: "Hollow",     from: "hopeless",   skill: "per",
    text: "Persuasion with disadvantage — permanently: something in you stopped believing." },
};
const SCAR_IMG = `${TSL_ICONS}/scar.svg`;

/** The skills an emotion's spec names (the talk rolls one of them). */
function tslSpecSkill(spec) { return spec.startsWith("skill:") ? spec.slice(6) : null; }

class TSLEmotions {

  static statusId(id) { return `tsl-emo-${id}`; }

  /**
   * One spec as the system's own Active Effect changes, with `mode` +1
   * (advantage) or −1 (disadvantage) — ADD, so the system counts them as D&D
   * does: advantage and disadvantage on one roll cancel out. dnd5e 6 and a5e
   * keep a roll mode on each skill, save, attack type, initiative and death save.
   */
  static modeChanges(spec, mode) {
    const [kind, key] = String(spec).split(":");
    const add = (k, v = mode) => ({ key: k, mode: 2, value: v, priority: 20 });
    if (globalThis.game?.system?.id === "a5e") {
      const attacks = key === "melee" ? ["meleeWeaponAttack", "meleeSpellAttack"] : ["meleeWeaponAttack", "rangedWeaponAttack", "meleeSpellAttack", "rangedSpellAttack"];
      switch (kind) {
        case "skill":  return [add(`system.skills.${key}.rollMode`)];
        case "save":   return [add(`system.abilities.${key}.save.rollMode`)];
        case "attack": return attacks.map(t => add(`system.rolls.attack.${t}.outgoing.rollMode`));
        case "init":   return [add("system.attributes.initiative.rollMode")];
        case "death":  return [add("system.rolls.death.rollMode")];
        case "immune": return [add("system.traits.conditionImmunities", key)];
      }
      return [];
    }
    switch (kind) {
      case "skill":  return [add(`system.skills.${key}.roll.mode`)];
      case "save":   return [add(`system.abilities.${key}.save.roll.mode`)];
      case "attack": return key === "melee" ? ["mwak", "msak"].map(t => add(`system.rolls.attack.${t}.mode`)) : [add("system.rolls.attack.mode")];
      case "init":   return [add("system.attributes.init.roll.mode")];
      case "death":  return [add("system.attributes.death.roll.mode")];
      case "immune": return [add("system.traits.ci.value", key)];
    }
    return [];
  }

  /** An emotion's strength and weakness as Active Effect changes. */
  static sheetChanges(id) {
    const e = EMOTIONS[id];
    if (!e || !globalThis.game?.system) return [];
    try { return [...e.edge.flatMap(s => TSLEmotions.modeChanges(s, 1)), ...e.flaw.flatMap(s => TSLEmotions.modeChanges(s, -1))]; }
    catch { return []; }
  }

  /** Everything an emotion is, as Active Effect data (ours, and the Token HUD's toggle: the same effect). */
  static effectData(id, { by = null } = {}) {
    const e = EMOTIONS[id];
    return {
      name: e.label, img: e.img, statuses: [TSLEmotions.statusId(id)], ...tslShowIcon(),
      description: `<b>${e.theme}</b><br>${_t("Gives:")} ${e.edgeText}.<br>${_t("Takes:")} ${e.flawText}.<br>${_t("For others:")} ${e.opensText}.<br><i>${_t("It goes when it's acted out:")} ${e.clear} ${_t("Or after a long rest, by itself.")}</i>`,
      changes: TSLEmotions.sheetChanges(id),
      flags: { [EMOTION_SCOPE]: { emotion: { id, by, fx: EMOTION_FX_VERSION } } },
    };
  }

  /** A scar, as Active Effect data: its skill with disadvantage, permanently. */
  static scarData(scarId) {
    const scar = SCARS[scarId];
    const name = _t("Scar — {scar}", { scar: scar.label });
    let changes = [];
    try { if (globalThis.game?.system) changes = TSLEmotions.modeChanges(`skill:${scar.skill}`, -1); } catch { changes = []; }
    return {
      name, img: SCAR_IMG, description: scar.text, changes,
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
   * ones made before are written anew, with what they give and take now — and
   * since 3.21 one emotion at a time: of several, the newest stays. Returns how
   * many were rewritten or dropped.
   */
  static async sync(actor) {
    const old = [], fresh = [];
    const emos = (actor?.effects?.contents ?? [...(actor?.effects ?? [])]).filter(fx => EMOTIONS[fx.flags?.[EMOTION_SCOPE]?.emotion?.id]);
    const keep = emos.at(-1) ?? null;   // effects keep their creation order: the last one is the newest
    for (const fx of emos) {
      const f = fx.flags[EMOTION_SCOPE].emotion;
      if (fx !== keep) { old.push(fx.id); continue; }
      if (f.fx === EMOTION_FX_VERSION) continue;
      old.push(fx.id); fresh.push(TSLEmotions.effectData(f.id, { by: f.by ?? null }));
    }
    for (const fx of actor?.effects ?? []) {
      const f = fx.flags?.[EMOTION_SCOPE];
      if (!f?.scar || !SCARS[f.scar] || f.fx === EMOTION_FX_VERSION) continue;
      old.push(fx.id); fresh.push(TSLEmotions.scarData(f.scar));
    }
    if (!old.length) return 0;
    await actor.deleteEmbeddedDocuments("ActiveEffect", old);
    if (fresh.length) await actor.createEmbeddedDocuments("ActiveEffect", fresh);
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

  /** Who may put one on someone: the GM, or that character's owner. */
  static canEdit(actor) { return !!actor && (game.user.isGM || !!actor.isOwner); }

  /**
   * Who may take this one off quietly: the GM — or a player, only one they put
   * on their own character themselves (an emotion the table gave them goes
   * through the GM: acted out, or calmed after a long rest).
   */
  static canDrop(actor, id) {
    if (!actor) return false;
    if (game.user.isGM) return true;
    return !!actor.isOwner && TSLEmotions.of(actor).find(e => e.id === id)?.by === actor.id;
  }

  /** The scars they carry — ids, each once. */
  static scars(actor) {
    return [...new Set((actor?.effects ?? []).map(fx => fx.flags?.[EMOTION_SCOPE]?.scar).filter(id => SCARS[id]))];
  }

  /**
   * Make them feel it. One at a time: a new emotion pushes out the one they
   * carried. A character already carrying THIS one takes its scar instead
   * (once — after that, nothing more). Returns { id, added, scar, replaced }.
   * GM client, or the actor's owner.
   */
  static async add(actor, id, { by = null } = {}) {
    const e = EMOTIONS[id];
    if (!actor || !e) return null;
    if (TSLEmotions.has(actor, id)) {
      const scar = SCARS[e.scar];
      if (!SocialArchetypeManager.isPC(actor) || TSLEmotions.scars(actor).includes(scar.id)) return { id, added: false, scar: null, replaced: null };
      await actor.createEmbeddedDocuments("ActiveEffect", [TSLEmotions.scarData(scar.id)]);
      return { id, added: false, scar: scar.id, replaced: null };
    }
    const before = TSLEmotions.of(actor).map(x => x.id);
    const drop = before.flatMap(x => TSLEmotions._effectIds(actor, x));
    if (drop.length) await actor.deleteEmbeddedDocuments("ActiveEffect", drop);
    await actor.createEmbeddedDocuments("ActiveEffect", [TSLEmotions.effectData(id, { by })]);
    return { id, added: true, scar: null, replaced: before[0] ?? null };
  }

  /** What it does, in one line for a card: "{theme}: {edge}; {flaw}." */
  static effectLine(id) {
    const e = EMOTIONS[id];
    return e ? `${e.theme}: ${e.edgeText}; ${e.flawText}.` : "";
  }

  /**
   * Let it go. `how` — "act" (acted out in the scene: the GM's word) or a
   * friend's actor id (their comfort). Acting it out is the point of carrying
   * one: a character who does what the emotion pushes them to — lash out, back
   * down, make amends — takes D&D's Inspiration, as the game rewards playing a
   * flaw. A friend's comfort lets it go with no reward. Posts one line.
   * `{ inspired }` says whether it gave one. The GM's client.
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

  /** Take it off without a word — a correction (no chat line). */
  static async unset(actor, id) {
    const ids = TSLEmotions._effectIds(actor, id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length > 0;
  }

  /**
   * A long rest: whatever they carry, not acted out, calms down by itself —
   * no reward. One slim line. Scars stay. The client that took the rest.
   */
  static async restCalm(actor) {
    const feels = TSLEmotions.of(actor);
    if (!feels.length) return 0;
    const ids = feels.flatMap(e => TSLEmotions._effectIds(actor, e.id));
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-bed"></i><span class="tsl-x-title">${_t("{who}: {emotion} calms down after the rest", { who: esc(actor.name), emotion: esc(feels.map(e => EMOTIONS[e.id].label).join(", ")) })}</span></div>
        <div class="tsl-x-who">${_t("Not acted out — so no Inspiration.")}</div>
      </div>`,
    });
    return feels.length;
  }

  /**
   * A player says their character acted it out: a card the GM confirms (the
   * player can't shed an emotion on their own — the user, 2026-11-19: «Інакше
   * вони будуть кидати аби що щоб позбавитися емоції»). The player's client.
   */
  static async requestLetGo(actor, id) {
    const e = EMOTIONS[id];
    if (!actor || !e || !TSLEmotions.has(actor, id)) return false;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: TSLEmotions._letGoCardHTML(actor, id, null),
      flags: { [EMOTION_SCOPE]: { letGo: { actorId: actor.id, emotion: id, done: null } } },
    });
    return true;
  }

  /** The request card: what acting it out looks like, and the GM's two buttons (or what the GM said). */
  static _letGoCardHTML(actor, id, done) {
    const esc = foundry.utils.escapeHTML;
    const e = EMOTIONS[id];
    const tail = done === "yes" ? `<div class="tsl-tell-done"><i class="fas fa-check"></i> ${_t("The GM agrees: acted out.")}</div>`
      : done === "no" ? `<div class="tsl-tell-done">${_t("The GM says: not yet.")}</div>`
      : `<div class="tsl-letgo-btns"><button type="button" class="tsl-tell-btn" data-tsl-letgo="yes"><i class="fas fa-check"></i> ${_t("Acted out — Inspiration")}</button>
         <button type="button" class="tsl-tell-btn" data-tsl-letgo="no">${_t("Not yet")}</button></div>`;
    return `<div class="tsl-x-card tsl-x-card--slim">
      <div class="tsl-x-head"><img class="tsl-emo-ico" src="${e.img}" alt=""><span class="tsl-x-title">${_t("{who} acts out {emotion}", { who: esc(actor.name), emotion: esc(e.label) })}</span></div>
      <div class="tsl-x-who">${esc(e.clear)} ${_t("Did they? The GM says.")}</div>
      ${tail}
    </div>`;
  }

  /** The request card's buttons — the GM's alone. */
  static bindLetGoCard(message, html) {
    const f = message?.getFlag?.(EMOTION_SCOPE, "letGo");
    const root = typeof HTMLElement !== "undefined" && html instanceof HTMLElement ? html : (html?.[0] ?? html);
    if (!f || !root?.querySelectorAll) return;
    const actor = game.actors.get(f.actorId);
    root.querySelectorAll("[data-tsl-letgo]").forEach(btn => {
      if (!game.user.isGM || !actor || f.done) { btn.remove(); return; }
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        root.querySelectorAll("[data-tsl-letgo]").forEach(b => { b.disabled = true; });
        const yes = btn.dataset.tslLetgo === "yes";
        if (yes) await TSLEmotions.clear(actor, f.emotion, "act");
        await message.update({ content: TSLEmotions._letGoCardHTML(actor, f.emotion, yes ? "yes" : "no"), [`flags.${EMOTION_SCOPE}.letGo.done`]: yes ? "yes" : "no" });
      });
    });
  }

  /**
   * The talk itself landed: the GM marks what it left on someone — an NPC, or
   * a character their words hit. No roll. Marking what they already feel takes
   * it back (a correction, so never a scar). One chat line when it lands, so
   * the table sees what it gives, takes and opens. `by`: whose words left it
   * (a player marking their own character: that character — theirs to undo).
   * Returns "added" | "removed" | null.
   */
  static async mark(actor, id, { by = null, title = null } = {}) {
    const e = EMOTIONS[id];
    if (!TSLEmotions.canEdit(actor) || !e) return null;
    if (TSLEmotions.has(actor, id)) {
      if (!TSLEmotions.canDrop(actor, id)) return null;
      await TSLEmotions.unset(actor, id);
      return "removed";
    }
    await TSLEmotions.add(actor, id, { by });
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--success tsl-x-card--slim">
        <div class="tsl-x-head"><i class="fas fa-comments"></i><span class="tsl-x-title">${title ? esc(title) : _t("The words landed")}</span></div>
        <div class="tsl-x-who">${_t("{img} {who} is <b>{emotion}</b> — {what}", { img: `<img class="tsl-emo-ico" src="${e.img}" alt="">`,
          who: esc(actor.name), emotion: esc(e.label), what: esc(TSLEmotions.effectLine(id)) })}${SocialArchetypeManager.isPC(actor) ? "" : ` ${esc(e.opensText)}.`}</div>
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
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="tsl-x-card tsl-x--botch tsl-x-card--slim">
        <div class="tsl-x-head"><img class="tsl-emo-ico" src="${SCAR_IMG}" alt=""><span class="tsl-x-title">${_t("{who} carries a scar: {scar}", { who: esc(actor.name), scar: esc(scar.label) })}</span></div>
        <div class="tsl-x-who">${esc(scar.text)}</div>
      </div>`,
    });
    return true;
  }

  /** A scar wiped (a story turn earned it) — the GM only: it's permanent. Every copy of it. */
  static async removeScar(actor, scarId) {
    if (!game.user.isGM) return;
    const ids = (actor.effects ?? []).filter(f => f.flags?.[EMOTION_SCOPE]?.scar === scarId).map(f => f.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /**
   * What the speaker's own emotion and scars do to the skill a talk rolls:
   * { adv: [labels], dis: [labels] } — the same advantage and disadvantage the
   * sheet carries (the module counts it itself where it rolls its own d20).
   */
  static skillMode(actor, skill) {
    const out = { adv: [], dis: [] };
    if (!actor || !skill) return out;
    for (const e of TSLEmotions.of(actor)) {
      const d = EMOTIONS[e.id];
      if (d.edge.some(s => tslSpecSkill(s) === skill)) out.adv.push(d.label);
      if (d.flaw.some(s => tslSpecSkill(s) === skill)) out.dis.push(d.label);
    }
    for (const id of TSLEmotions.scars(actor)) if (SCARS[id].skill === skill) out.dis.push(_t("scar — {scar}", { scar: SCARS[id].label }));
    return out;
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
