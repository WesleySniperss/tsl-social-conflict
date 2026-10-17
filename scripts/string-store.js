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
 * The most Strings one person can hold on ANOTHER (v1.81). A String is a +5
 * trump card on any roll against them — or +5 to your AC / a save against
 * them — so they must stay scarce: a few deep levers, not a stack.
 */
const STRING_CAP = 3;

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

  /** How many Strings `actorId` holds on `targetActorId`. */
  static countOn(actorId, targetActorId) {
    return TSLStringStore.getList(actorId).filter(e => e.targetActorId === targetActorId).length;
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
    const idx  = list.findIndex(e => e.targetActorId === targetActorId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await TSLStringStore._saveList(actorId, list);
    return true;
  }

  // ── Pulling a String — at the table AND in a fight (v2.0) ───────────────────

  /**
   * Pull a String on someone: spend it, and its +5 lands as a REAL effect on
   * the holder, so it works mid-combat too — no mental maths for the table.
   *   strike — +5 to your next attack roll, ability check or saving throw
   *            (aim it at them); it ends after your next roll.
   *   guard  — +5 AC: you know how they move. It ends after THEIR next roll
   *            (their attack) or when your next turn starts.
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
      // A status id makes the token show the icon; it is NOT registered in the
      // HUD palette, so nobody toggles it by hand.
      statuses: ["tsl-string-pull"],
      description: guard
        ? _t("+5 AC against {name} — you know how they move. Ends after their next roll, or when your next turn starts.", { name: target.name })
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
        <div class="tsl-x-outcome">${guard ? _t("+5 AC against their next attack") : _t("+5 to the next attack, check or save against them")}</div>
        <ul class="tsl-x-after"><li class="tsl-x-after-item">${_t("It's on the sheet now and ends by itself once used.")} ${_t("Strings left on them: {n}.", { n: left })}</li></ul>
      </div>`,
    });
    return true;
  }

  /**
   * End pulled Strings once they've done their job. GM client (the active GM)
   * only: a "strike" ends when the holder rolls anything; a "guard" ends when
   * the one it guards against rolls, or when the holder's next turn starts.
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
      for (const a of game.actors) await endPulls(a, p => p.mode === "guard" && p.targetId === speakerId);
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
