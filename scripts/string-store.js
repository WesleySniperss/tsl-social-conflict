/**
 * tsl-social-conflict | string-store.js
 *
 * Persistent string (emotional leverage) tracking.
 * Each string is an individual entry with a free-text label.
 * Stored as actor flags — survives between sessions.
 *
 * Flag path: actor.flags["tsl-social-conflict"]["stringList"]
 * Value: [{ id, label, targetActorId }]
 */

console.log("TSL | Loading string-store.js...");

const STRING_FLAG = "tsl-social-conflict";

/**
 * The most Strings one person can hold on ANOTHER: one (the user's call,
 * 2026-11-02). A String is what you have on someone — won on a roll against
 * them, lost on a miss — and it does one thing when spent, so it stays a
 * state, not a stack: you have something on them, or you don't.
 */
const STRING_CAP = 1;

class TSLStringStore {

  // ── Read ─────────────────────────────────────────────────────────────────────

  /** All strings this actor holds, as an array of entry objects. */
  static getList(actorId) {
    const actor = game.actors.get(actorId);
    return actor?.getFlag(STRING_FLAG, "stringList") ?? [];
  }

  static canSee(actorId) {
    if (game.user.isGM) return true;
    return game.actors.get(actorId)?.isOwner ?? false;
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  static async _saveList(actorId, list) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.setFlag(STRING_FLAG, "stringList", list);
  }

  /** How many Strings `actorId` holds on `targetActorId` — one at most: old worlds kept up to three, and they count as one. */
  static countOn(actorId, targetActorId) {
    return Math.min(STRING_CAP, TSLStringStore.getList(actorId).filter(e => e.targetActorId === targetActorId).length);
  }

  /**
   * One String each way, always (the user: «може бути лише по одній струні»).
   * Worlds from before the cap kept up to three on one person: cut every list
   * down to one per person. GM client; returns how many were cut.
   */
  static async trimToCap(actor) {
    const list = actor?.getFlag?.(STRING_FLAG, "stringList") ?? [];
    const seen = new Map(), kept = [];
    for (const e of list) {
      const n = seen.get(e.targetActorId) ?? 0;
      if (n < STRING_CAP) kept.push(e);
      seen.set(e.targetActorId, n + 1);
    }
    if (kept.length !== list.length) await actor.setFlag(STRING_FLAG, "stringList", kept);
    return list.length - kept.length;
  }

  /** Is this holder already at the cap on that person? */
  static isCapped(actorId, targetActorId) {
    return !!targetActorId && TSLStringStore.countOn(actorId, targetActorId) >= STRING_CAP;
  }

  /** Add a new string entry. Returns the new entry (null when at the cap). */
  static async addEntry(actorId, label = "", targetActorId = null) {
    if (TSLStringStore.isCapped(actorId, targetActorId)) return null;
    const list  = TSLStringStore.getList(actorId);
    const entry = { id: foundry.utils.randomID(), label, targetActorId };
    list.push(entry);
    await TSLStringStore._saveList(actorId, list);
    return entry;
  }

  /** Remove the entry with the given id. */
  static async removeEntry(actorId, entryId) {
    const list = TSLStringStore.getList(actorId).filter(e => e.id !== entryId);
    await TSLStringStore._saveList(actorId, list);
  }

  /** Update label or targetActorId on an existing entry. */
  static async updateEntry(actorId, entryId, updates) {
    const list  = TSLStringStore.getList(actorId);
    const entry = list.find(e => e.id === entryId);
    if (entry) Object.assign(entry, updates);
    await TSLStringStore._saveList(actorId, list);
  }

  // ── Convenience wrappers (the Ask and the Chronicle) ────────────────────────

  /**
   * Add `count` entries pre-labelled with the target actor's name, up to the
   * cap. Returns how many were actually added (0 when already holding 3).
   * A hold is a relationship too: with no bond between them yet, they become
   * Strangers — so the String shows in Bonds, where it is pulled or spent.
   */
  static async add(actorId, targetActorId, count = 1) {
    const targetActor = game.actors.get(targetActorId);
    const label = targetActor?.name ?? "";
    let added = 0;
    for (let i = 0; i < count; i++) {
      if (await TSLStringStore.addEntry(actorId, label, targetActorId)) added++;
    }
    if (added && targetActor && typeof TSLBondStore !== "undefined" && !TSLBondStore.find(actorId, targetActorId))
      await TSLBondStore.add(actorId, targetActorId, { type: "stranger", attitude: 1 });
    return added;
  }

  /**
   * Spend 1 string targeting targetActorId.
   * Removes the first matching entry and returns true, or false if none found.
   */
  static async spend(actorId, targetActorId) {
    const list = TSLStringStore.getList(actorId);
    if (!list.some(e => e.targetActorId === targetActorId)) return false;
    // One at a time: spending it leaves nothing on them (an old world's extra copies go with it).
    await TSLStringStore._saveList(actorId, list.filter(e => e.targetActorId !== targetActorId));
    return true;
  }

  /**
   * A String marked by hand — the table's own bookkeeping. With one at a time,
   * a String is on or off. The GM marks any; a player marks their own
   * character's, either way: theirs on others is written here, an NPC's on
   * them goes through the GM (a player can't write an NPC). One slim line in
   * the chat, so the table sees the hold change. Returns true when it changed.
   */
  static async set(holderId, targetId, on) {
    const holder = game.actors.get(holderId), target = game.actors.get(targetId);
    if (!holder || !target || holderId === targetId) return false;
    const has = TSLStringStore.countOn(holderId, targetId) > 0;
    if (has === !!on) return false;
    if (!(game.user.isGM || holder.isOwner)) {
      if (!target.isOwner || typeof TSLGMActions === "undefined") return false;
      return !!(await TSLGMActions.request("stringSet", { holderId, targetId, on: !!on, pcId: targetId }));
    }
    if (on) { if (!(await TSLStringStore.add(holderId, targetId, 1))) return false; }
    else if (!(await TSLStringStore.spend(holderId, targetId))) return false;
    const esc = foundry.utils.escapeHTML;
    const data = { holder: esc(holder.name), target: esc(target.name) };
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-x-card tsl-x-card--slim tsl-x--${on ? "strong" : "failure"}">
        <div class="tsl-x-head"><i class="fas fa-masks-theater"></i><span class="tsl-x-title">${on ? _t("{holder} now has something on {target}", data) : _t("{holder} no longer has anything on {target}", data)}</span></div>
      </div>`,
    });
    return true;
  }

  // ── Spending a String in a talk, and investing it ───────────────────────────

  /**
   * "They agree": the holder reminds them what they have on them, instead of
   * the roll the GM called for. Small or costly — they do it; something
   * against their interests — the GM says what it would take (TSL: for an NPC,
   * a String spent may mean they simply agree). No roll: nothing else moves.
   */
  static async remind(holder, target, { size = "costly", technique = null } = {}) {
    if (!holder || !target) return false;
    if (!(await TSLStringStore.spend(holder.id, target.id))) {
      ui.notifications?.warn?.(_t("No Strings held on them."));
      return false;
    }
    const esc = foundry.utils.escapeHTML;
    const against = size === "against";
    const data = { holder: esc(holder.name), target: esc(target.name) };
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-x-card tsl-x-card--slim tsl-x--${against ? "failure" : "strong"}">
        <div class="tsl-x-head"><i class="fas fa-masks-theater"></i><span class="tsl-x-title">${_t("{holder} reminds {target} what they have on them", data)}</span></div>
        <div class="tsl-x-outcome">${against ? _t("Against their interests: the GM says what it would take.") : _t("{target} agrees — no roll.", data)}</div>
        <ul class="tsl-x-after"><li class="tsl-x-after-item">${_t("The String is spent.")}</li></ul>
      </div>`,
    });
    if (!against && typeof TSLTalk !== "undefined") TSLTalk._pulse({ srcId: holder.id, tgtId: target.id, technique, approach: null, job: "ask", grade: "strong", granted: true });
    return true;
  }

  /**
   * Invest the String in the bond: +1 ● — a hostile bond eases −1 ● instead
   * (making peace). With no bond yet (or a Stranger) the holder says what they
   * become to each other (`typeId`). The other side follows — through the GM
   * when the holder can't write it. Returns the bond's new state, or null.
   */
  static async invest(holder, target, typeId = null) {
    if (!holder || !target || typeof TSLBondStore === "undefined") return null;
    const bond = TSLBondStore.find(holder.id, target.id);
    const type = bond ? SocialArchetypeManager.getBondType(bond.type) : null;
    const cur = bond ? Math.min(3, Math.abs(bond.attitude ?? 0)) : 0;
    const fresh = !bond || type.id === "stranger";
    if (fresh && !(typeId && SocialArchetypeManager.getBondType(typeId)?.id === typeId && typeId !== "stranger")) return null;
    if (!fresh && !type.hostile && cur >= 3) return null;
    if (!TSLStringStore.countOn(holder.id, target.id)) return null;
    await TSLStringStore.spend(holder.id, target.id);
    const patch = fresh ? { type: typeId, attitude: 1 } : { attitude: type.hostile ? Math.max(0, cur - 1) : cur + 1 };
    if (bond) await TSLBondStore.update(holder.id, bond.id, patch);
    else await TSLBondStore.add(holder.id, target.id, patch);
    const now = TSLBondStore.find(holder.id, target.id);
    const t = SocialArchetypeManager.getBondType(now?.type);
    const esc = foundry.utils.escapeHTML;
    const dots = "●".repeat(Math.min(3, Math.abs(now?.attitude ?? 0))) || "○";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-x-card tsl-x-card--slim tsl-x--success">
        <div class="tsl-x-head"><i class="fas fa-link"></i><span class="tsl-x-title">${_t("{holder} invests a String in the bond with {target}", { holder: esc(holder.name), target: esc(target.name) })}</span></div>
        <div class="tsl-x-outcome">${!fresh && type.hostile ? _t("Making peace: {type} eases to {dots}.", { type: esc(t.label), dots }) : _t("{type} — {dots}.", { type: esc(t.label), dots })}</div>
      </div>`,
    });
    return now;
  }

  // ── Pulling a String — at the table AND in a fight (v2.0) ───────────────────

  /**
   * Pull a String on someone: spend it, and its +5 lands as a REAL effect on
   * the holder, so it works mid-combat too — no mental maths for the table.
   *   strike — +5 to your next attack roll, ability check or saving throw
   *            (aim it at them); it ends after your next roll.
   *   guard  — +5 AC: you know how they move. It holds for a round — until
   *            the start of your next turn (or the end of the fight).
   * Returns true when a String was spent.
   */
  static async pull(holder, target, mode = "strike") {
    if (!holder || !target) return false;
    if (!(await TSLStringStore.spend(holder.id, target.id))) {
      ui.notifications?.warn?.(_t("No Strings held on them."));
      return false;
    }
    const guard  = mode === "guard";
    const label  = _t("String on {name}", { name: target.name });
    const changes = guard ? TSLStringStore._changes({ ac: 5 }, label)
                          : TSLStringStore._changes({ attack: 5, check: 5, save: 5 }, label);
    await holder.createEmbeddedDocuments("ActiveEffect", [{
      name: guard ? _t("{label} — +5 AC", { label }) : `${label} — +5`,
      img: "icons/svg/net.svg",
      origin: `module.${STRING_FLAG}`,
      disabled: false,
      changes,
      // A status id (and, on v14, showIcon) makes the token show the icon; it is
      // NOT registered in the HUD palette, so nobody toggles it by hand.
      statuses: ["tsl-string-pull"], ...tslShowIcon(),
      description: guard
        ? _t("+5 AC — you know how {name} moves. For a round: until the start of your next turn.", { name: target.name })
        : _t("+5 to your next attack roll, ability check or saving throw — aimed at {name}. Ends after your next roll.", { name: target.name }),
      flags: { [STRING_FLAG]: { stringPull: { mode: guard ? "guard" : "strike", targetId: target.id } } },
    }]);
    const left = TSLStringStore.countOn(holder.id, target.id);
    const esc  = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-x-card tsl-x--good">
        <div class="tsl-x-head"><i class="fas fa-masks-theater"></i><span class="tsl-x-title">${_t("A String is pulled")}</span></div>
        <div class="tsl-x-who">${esc(holder.name)} → ${esc(target.name)}</div>
        <div class="tsl-x-outcome">${guard ? _t("+5 AC until the start of your next turn") : _t("+5 to the next attack, check or save against them")}</div>
        <ul class="tsl-x-after"><li class="tsl-x-after-item">${_t("It's on the sheet now and ends by itself once used.")} ${_t("Strings left on them: {n}.", { n: left })}</li></ul>
      </div>`,
    });
    return true;
  }

  /**
   * End pulled Strings once they've done their job. GM client (the active GM)
   * only: a "strike" ends when the holder rolls anything; a "guard" holds for
   * a round — it ends when the holder's next turn starts, or the fight ends.
   */
  static registerPullHooks() {
    const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.isSelf);
    const endPulls = async (actor, pred) => {
      const ids = (actor?.effects ?? [])
        .filter(e => { const p = e.flags?.[STRING_FLAG]?.stringPull; return p && pred(p); })
        .map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    };
    Hooks.on("createChatMessage", async (msg) => {
      if (!isActiveGM() || !msg?.rolls?.length) return;
      const speakerId = msg.speaker?.actor;
      if (!speakerId) return;
      await endPulls(game.actors.get(speakerId), p => p.mode === "strike");
    });
    // A guard holds for a round: it ends when the holder's next turn starts — or when the fight ends.
    Hooks.on("deleteCombat", async (combat) => {
      if (!isActiveGM()) return;
      for (const c of combat?.combatants ?? []) await endPulls(c.actor, p => p.mode === "guard");
    });
    Hooks.on("updateCombat", async (combat, chg) => {
      if (!isActiveGM() || !("turn" in chg || "round" in chg)) return;
      await endPulls(combat.combatant?.actor, p => p.mode === "guard");
    });
  }

  // ── The effect a pull puts on the sheet ──────────────────────────────────────

  /**
   * Real Active Effect changes for { attack, check, save, ac } on the current
   * system. AC is a plain number on both. On dnd5e the attack/check/save
   * bonuses are formula fields; on a5e `system.bonuses.*` are RECORDS — a flat
   * key does nothing there — so the bonus goes through the system's own
   * CUSTOM key `flags.a5e.effects.bonuses.<kind>`, whose value is the bonus
   * record as JSON (how a5e's own content does it).
   */
  static _changes(tally, label) {
    const isA5e = game.system.id === "a5e";
    const out = [];
    const num = (key, v) => out.push({ key, mode: 2, value: `${v > 0 ? "+" : ""}${v}`, priority: 20 });
    const a5e = (kind, n, context) => out.push({
      key: `flags.a5e.effects.bonuses.${kind}`, mode: 0, priority: 20,
      value: JSON.stringify({ label, formula: `${n}`, default: true, img: "icons/svg/net.svg", context }),
    });
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    if (tally.save) {
      if (isA5e) a5e("abilities", tally.save, { types: ["save"], abilities, requiresProficiency: false });
      else num("system.bonuses.abilities.save", tally.save);
    }
    if (tally.check) {
      if (isA5e) a5e("abilities", tally.check, { types: ["check"], abilities, requiresProficiency: false });
      else num("system.bonuses.abilities.check", tally.check);
    }
    if (tally.ac) num(isA5e ? "system.attributes.ac.changes.bonuses.value" : "system.attributes.ac.bonus", tally.ac);
    if (tally.attack) {
      if (isA5e) a5e("attacks", tally.attack, {
        attackTypes: ["meleeWeaponAttack", "rangedWeaponAttack", "meleeSpellAttack", "rangedSpellAttack"],
        spellLevels: [], requiresProficiency: false });
      else { num("system.bonuses.mwak.attack", tally.attack); num("system.bonuses.rwak.attack", tally.attack); }
    }
    return out;
  }
}
