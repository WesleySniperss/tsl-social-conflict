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

  // ── Convenience wrappers (called from conflict-store.js) ─────────────────────

  /**
   * Add `count` entries pre-labelled with the target actor's name, up to the
   * cap. Returns how many were actually added (0 when already holding 3).
   */
  static async add(actorId, targetActorId, count = 1) {
    const targetActor = game.actors.get(targetActorId);
    const label = targetActor?.name ?? "";
    let added = 0;
    for (let i = 0; i < count; i++) {
      if (await TSLStringStore.addEntry(actorId, label, targetActorId)) added++;
    }
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
      ui.notifications?.warn?.("No Strings held on them.");
      return false;
    }
    const guard  = mode === "guard";
    const label  = `String on ${target.name}`;
    const tally  = guard ? { ac: 5 } : { attack: 5, check: 5, save: 5 };
    const changes = (typeof TSLBondAuras !== "undefined") ? TSLBondAuras._changes(tally, label) : [];
    await holder.createEmbeddedDocuments("ActiveEffect", [{
      name: guard ? `🎭 ${label} — +5 AC` : `🎭 ${label} — +5`,
      img: "icons/svg/net.svg",
      origin: `module.${STRING_FLAG}`,
      disabled: false,
      changes,
      // A status id makes the token show the icon; it is NOT registered in the
      // HUD palette, so nobody toggles it by hand.
      statuses: ["tsl-string-pull"],
      description: guard
        ? `+5 AC against ${target.name} — you know how they move. Ends after their next roll, or when your next turn starts.`
        : `+5 to your next attack roll, ability check or saving throw — aimed at ${target.name}. Ends after your next roll.`,
      flags: { [STRING_FLAG]: { stringPull: { mode: guard ? "guard" : "strike", targetId: target.id } } },
    }]);
    const left = TSLStringStore.countOn(holder.id, target.id);
    const esc  = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">🎭 <b>${esc(holder.name)}</b> pulls a String on <b>${esc(target.name)}</b> — ${guard
        ? "<b>+5 AC</b> against their next attack (it's on the sheet now)"
        : "<b>+5</b> to the next attack, check or save against them (it's on the sheet now)"}. ${left} String${left === 1 ? "" : "s"} left.</div></div>`,
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Build display data for a participant in the conflict app.
   * Returns null if the current user can't see this participant's strings.
   *
   * held:     enriched list of string entries (label, targetName, targetIdx)
   * incoming: aggregated counts of strings others hold on this participant
   */
  static forParticipant(participant, allParticipants) {
    if (!TSLStringStore.canSee(participant.actorId)) return null;

    const rawHeld = TSLStringStore.getList(participant.actorId);

    const held = rawHeld.map(e => ({
      ...e,
      targetName: allParticipants.find(p => p.actorId === e.targetActorId)?.name ?? null,
      targetIdx:  allParticipants.findIndex(p => p.actorId === e.targetActorId),
    }));

    const incoming = allParticipants
      .filter(p => p.actorId !== participant.actorId)
      .map(p => {
        const count = TSLStringStore.getList(p.actorId)
          .filter(e => e.targetActorId === participant.actorId).length;
        return count > 0 ? { actorId: p.actorId, name: p.name, count } : null;
      })
      .filter(Boolean);

    return { held, incoming };
  }
}
