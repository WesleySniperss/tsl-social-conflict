/**
 * tsl-social-conflict | bond-store.js
 *
 * Chronicle of Bonds — persistent relationship entries between actors.
 * Stored as actor flags, editable by the actor's owner and the GM.
 *
 * Flag path: actor.flags["tsl-social-conflict"]["bonds"]
 * Value: [{ id, targetActorId, type, attitude, perceivedArchetypeId, profileKnown, notes }]
 *
 *   type                 — bond type id from BOND_TYPES (social-archetypes.js)
 *   attitude             — how THIS actor feels about the target, -3..+3.
 *                          Used as a DC shift when the target tries to sway this actor.
 *   perceivedArchetypeId — what this actor BELIEVES the target's archetype is (may be wrong)
 *   profileKnown         — true once verified (Study the Mask / Crack the Cipher success)
 */

console.log("TSL | Loading bond-store.js...");

const BOND_FLAG = "tsl-social-conflict";

class TSLBondStore {

  // ── Read ─────────────────────────────────────────────────────────────────────

  /** All bonds recorded on this actor. */
  static getList(actorId) {
    const actor = game.actors.get(actorId);
    return actor?.getFlag(BOND_FLAG, "bonds") ?? [];
  }

  /** The bond `actorId` holds toward `targetActorId`, or null. */
  static find(actorId, targetActorId) {
    return TSLBondStore.getList(actorId).find(b => b.targetActorId === targetActorId) ?? null;
  }

  /**
   * Attitude of `actorId` toward `targetActorId` (-3..+3, 0 if no bond).
   * In Social Fencing this shifts the DC to sway `actorId`.
   */
  static getAttitude(actorId, targetActorId) {
    return TSLBondStore.find(actorId, targetActorId)?.attitude ?? 0;
  }

  /** Does any actor owned by the current user hold a verified read on target? */
  static profileKnownByUser(targetActorId) {
    if (game.user.isGM) return true;
    return game.actors.contents.some(a =>
      a.isOwner &&
      TSLBondStore.getList(a.id).some(b => b.targetActorId === targetActorId && b.profileKnown)
    );
  }

  static canEdit(actorId) {
    if (game.user.isGM) return true;
    return game.actors.get(actorId)?.isOwner ?? false;
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  static async _saveList(actorId, list) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.setFlag(BOND_FLAG, "bonds", list);
  }

  /** Add a bond toward targetActorId (no duplicates). Returns the entry. */
  static async add(actorId, targetActorId, data = {}) {
    if (actorId === targetActorId) return null;
    const list = TSLBondStore.getList(actorId);
    const existing = list.find(b => b.targetActorId === targetActorId);
    if (existing) return existing;

    const entry = {
      id: foundry.utils.randomID(),
      targetActorId,
      type:                 data.type ?? "stranger",
      attitude:             data.attitude ?? 0,
      perceivedArchetypeId: data.perceivedArchetypeId ?? null,
      profileKnown:         data.profileKnown ?? false,
      notes:                data.notes ?? "",
    };
    list.push(entry);
    await TSLBondStore._saveList(actorId, list);
    return entry;
  }

  static async update(actorId, bondId, updates) {
    const list  = TSLBondStore.getList(actorId);
    const entry = list.find(b => b.id === bondId);
    if (!entry) return;
    Object.assign(entry, updates);
    await TSLBondStore._saveList(actorId, list);
  }

  static async remove(actorId, bondId) {
    const list = TSLBondStore.getList(actorId).filter(b => b.id !== bondId);
    await TSLBondStore._saveList(actorId, list);
  }

  /**
   * Shift how `actorId` feels about `targetActorId` by delta (clamped −3..+3).
   * Creates the bond if missing. Fencing outcomes write history: being swayed
   * warms the bond toward the winner, walking away cools it — VTM blood-bond
   * style escalation across sessions.
   */
  static async shiftAttitude(actorId, targetActorId, delta) {
    if (!delta || actorId === targetActorId) return null;
    const clamp = (v) => Math.max(-3, Math.min(3, v));
    const bond = TSLBondStore.find(actorId, targetActorId);
    if (bond) {
      await TSLBondStore.update(actorId, bond.id, { attitude: clamp((bond.attitude ?? 0) + delta) });
      return clamp((bond.attitude ?? 0) + delta);
    }
    await TSLBondStore.add(actorId, targetActorId, { attitude: clamp(delta) });
    return clamp(delta);
  }

  /**
   * A successful read (Study the Mask / Crack the Cipher) — GM side.
   * Creates/updates the source's bond: perceived archetype becomes the real one.
   */
  static async reveal(sourceActorId, targetActorId) {
    const target = game.actors.get(targetActorId);
    if (!target) return;
    const realArchetypeId = SocialArchetypeManager.getActorData(target)?.archetypeId ?? null;

    const bond = TSLBondStore.find(sourceActorId, targetActorId);
    if (bond) {
      await TSLBondStore.update(sourceActorId, bond.id, {
        perceivedArchetypeId: realArchetypeId,
        profileKnown: true,
      });
    } else {
      await TSLBondStore.add(sourceActorId, targetActorId, {
        perceivedArchetypeId: realArchetypeId,
        profileKnown: true,
      });
    }
  }
}
