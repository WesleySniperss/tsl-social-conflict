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
 *   profileKnown         — true once verified (Read Them / Cross-Examine success)
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
  static async add(actorId, targetActorId, data = {}, _mirrored = false) {
    if (actorId === targetActorId) return null;
    const list = TSLBondStore.getList(actorId);
    const existing = list.find(b => b.targetActorId === targetActorId);
    if (existing) return existing;

    const entry = {
      id: foundry.utils.randomID(),
      targetActorId,
      type:                 data.type ?? "stranger",
      // `attitude` stores the bond's STRENGTH 0..3 (name kept for save
      // compatibility — older ±3 values read as their absolute strength)
      attitude:             data.attitude ?? 1,
      perceivedArchetypeId: data.perceivedArchetypeId ?? null,
      profileKnown:         data.profileKnown ?? false,
      notes:                data.notes ?? "",
    };
    list.push(entry);
    await TSLBondStore._saveList(actorId, list);
    // A bond is ONE shared relationship — mirror the type + strength onto the
    // other actor's record of you (personal read/notes are never mirrored).
    if (!_mirrored) await TSLBondStore._mirror(actorId, targetActorId, { type: entry.type, attitude: entry.attitude });
    return entry;
  }

  static async update(actorId, bondId, updates, _mirrored = false) {
    const list  = TSLBondStore.getList(actorId);
    const entry = list.find(b => b.id === bondId);
    if (!entry) return;
    Object.assign(entry, updates);
    await TSLBondStore._saveList(actorId, list);
    // Only the SHARED facets (type, strength) sync; a read/notes edit does not.
    if (!_mirrored && ("type" in updates || "attitude" in updates)) {
      await TSLBondStore._mirror(actorId, entry.targetActorId, {
        type:     "type" in updates     ? entry.type     : undefined,
        attitude: "attitude" in updates ? entry.attitude : undefined,
      });
    }
  }

  static async remove(actorId, bondId, _mirrored = false) {
    const entry = TSLBondStore.getList(actorId).find(b => b.id === bondId);
    const list  = TSLBondStore.getList(actorId).filter(b => b.id !== bondId);
    await TSLBondStore._saveList(actorId, list);
    // Ending a relationship ends it on both sides.
    if (!_mirrored && entry && TSLBondStore._canWrite(entry.targetActorId)) {
      const rev = TSLBondStore.find(entry.targetActorId, actorId);
      if (rev) await TSLBondStore.remove(entry.targetActorId, rev.id, true);
    }
  }

  /** Can the current user write flags on this actor? (GM always; owners of it.) */
  static _canWrite(actorId) {
    const a = game.actors.get(actorId);
    return !!a && (game.user.isGM || a.isOwner);
  }

  /**
   * Write the mirror of a bond onto the target actor's record of the source —
   * same STRENGTH, the counterpart TYPE (mentor↔protégé, debtor↔creditor;
   * everything else symmetric). Requires write access to the other actor (the
   * GM always has it); a player editing a bond toward an actor they don't own
   * simply won't push the mirror — the GM reconciles it on next load.
   */
  static async _mirror(actorId, targetActorId, { type, attitude } = {}) {
    if (actorId === targetActorId || !TSLBondStore._canWrite(targetActorId)) return;
    const patch = {};
    if (type != null)     patch.type     = SocialArchetypeManager.getBondMirror(type);
    if (attitude != null) patch.attitude = attitude;
    if (!("type" in patch) && !("attitude" in patch)) return;
    const rev = TSLBondStore.find(targetActorId, actorId);
    if (rev) await TSLBondStore.update(targetActorId, rev.id, patch, true);
    else     await TSLBondStore.add(targetActorId, actorId, patch, true);
  }

  /**
   * GM-side: ensure every recorded bond has its mirror on the other actor.
   * Non-destructive — only CREATES a missing counterpart (never overwrites an
   * existing, possibly-different one), so it can't start an edit war with a
   * legacy asymmetric bond. Editing either side afterwards re-syncs both.
   */
  static async reconcileAll() {
    if (!game.user.isGM) return;
    for (const a of (game.actors?.contents ?? [])) {
      for (const b of TSLBondStore.getList(a.id)) {
        if (!game.actors.get(b.targetActorId)) continue;
        if (TSLBondStore.find(b.targetActorId, a.id)) continue;   // already mirrored
        await TSLBondStore.add(b.targetActorId, a.id,
          { type: SocialArchetypeManager.getBondMirror(b.type), attitude: b.attitude }, true);
      }
    }
  }

  /**
   * The STRENGTH (0..3) of `actorId`'s bond toward `targetActorId`.
   * Pre-rework saves stored attitude −3..+3 — read as absolute strength.
   */
  static getStrength(actorId, targetActorId) {
    const bond = TSLBondStore.find(actorId, targetActorId);
    if (!bond) return 0;
    return Math.min(3, Math.abs(bond.attitude ?? 0));
  }

  /**
   * Deepen or cool the bond by delta (strength clamped 0..3). Creates the
   * bond if missing. Fencing outcomes write history: being swayed deepens
   * the bond toward the winner, walking away cools it.
   */
  static async shiftAttitude(actorId, targetActorId, delta) {
    if (!delta || actorId === targetActorId) return null;
    const clamp = (v) => Math.max(0, Math.min(3, v));
    const bond = TSLBondStore.find(actorId, targetActorId);
    if (bond) {
      const next = clamp(Math.min(3, Math.abs(bond.attitude ?? 0)) + delta);
      await TSLBondStore.update(actorId, bond.id, { attitude: next });
      return next;
    }
    await TSLBondStore.add(actorId, targetActorId, { attitude: clamp(delta) });
    return clamp(delta);
  }

  /**
   * A successful read (Read Them / Cross-Examine) — GM side.
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
