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

  /** Add a new string entry. Returns the new entry. */
  static async addEntry(actorId, label = "", targetActorId = null) {
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

  /** Add `count` entries pre-labelled with the target actor's name. */
  static async add(actorId, targetActorId, count = 1) {
    const targetActor = game.actors.get(targetActorId);
    const label = targetActor?.name ?? "";
    for (let i = 0; i < count; i++) {
      await TSLStringStore.addEntry(actorId, label, targetActorId);
    }
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
