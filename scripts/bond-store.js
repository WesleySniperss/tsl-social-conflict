/**
 * tsl-social-conflict | bond-store.js
 *
 * Chronicle of Bonds — persistent relationships between actors, stored as
 * actor flags and editable by the actor's owner and the GM.
 *
 * Flag path: actor.flags["tsl-social-conflict"]["bonds"]
 * Value: [{ id, targetActorId, type, attitude, notes }]
 *
 *   type     — bond type id from BOND_TYPES (social-archetypes.js)
 *   attitude — the bond's STRENGTH, 0..3 ● (the old name is kept for saved
 *              data; pre-rework ±3 values read as their absolute value)
 *
 * A bond is ONE relationship: its type and strength are mirrored onto the
 * other actor (the counterpart type for mentor ↔ protégé, sworn ↔ liege).
 * Notes stay private to each side.
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

  /** The STRENGTH (0..3) of `actorId`'s bond toward `targetActorId`. */
  static getStrength(actorId, targetActorId) {
    const bond = TSLBondStore.find(actorId, targetActorId);
    return bond ? Math.min(3, Math.abs(bond.attitude ?? 0)) : 0;
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
      type:     data.type ?? "stranger",
      attitude: data.attitude ?? 1,
      notes:    data.notes ?? "",
    };
    list.push(entry);
    await TSLBondStore._saveList(actorId, list);
    if (!_mirrored) await TSLBondStore._mirror(actorId, targetActorId, { type: entry.type, attitude: entry.attitude });
    return entry;
  }

  static async update(actorId, bondId, updates, _mirrored = false) {
    const list  = TSLBondStore.getList(actorId);
    const entry = list.find(b => b.id === bondId);
    if (!entry) return;
    Object.assign(entry, updates);
    await TSLBondStore._saveList(actorId, list);
    // Only the SHARED facets (type, strength) sync; notes do not.
    if (!_mirrored && ("type" in updates || "attitude" in updates)) {
      await TSLBondStore._mirror(actorId, entry.targetActorId, {
        type:     "type" in updates     ? entry.type     : undefined,
        attitude: "attitude" in updates ? entry.attitude : undefined,
      });
    }
  }

  static async remove(actorId, bondId, _mirrored = false) {
    const entry = TSLBondStore.getList(actorId).find(b => b.id === bondId);
    await TSLBondStore._saveList(actorId, TSLBondStore.getList(actorId).filter(b => b.id !== bondId));
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
   * Write the mirror of a bond onto the other actor — same strength, the
   * counterpart type. Needs write access to the other actor (the GM always
   * has it); otherwise the GM reconciles it on the next load.
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
   * GM, on load: give every bond its missing mirror. Non-destructive — it only
   * creates a missing counterpart, never overwrites a differing one.
   */
  static async reconcileAll() {
    if (!game.user.isGM) return;
    for (const a of (game.actors?.contents ?? [])) {
      for (const b of TSLBondStore.getList(a.id)) {
        if (!game.actors.get(b.targetActorId)) continue;
        if (TSLBondStore.find(b.targetActorId, a.id)) continue;
        await TSLBondStore.add(b.targetActorId, a.id,
          { type: SocialArchetypeManager.getBondMirror(b.type), attitude: b.attitude }, true);
      }
    }
  }

  /**
   * GM: an actor is gone — drop every bond and String anyone had toward it,
   * so no "(missing actor)" rows linger. Returns how many entries went.
   */
  static async forget(goneId) {
    if (!game.user.isGM || !goneId) return 0;
    let n = 0;
    for (const a of (game.actors?.contents ?? [])) {
      const bonds = TSLBondStore.getList(a.id), keep = bonds.filter(b => b.targetActorId !== goneId);
      if (keep.length !== bonds.length) { n += bonds.length - keep.length; await TSLBondStore._saveList(a.id, keep); }
      const strings = a.getFlag?.(BOND_FLAG, "stringList") ?? [], kept = strings.filter(e => e.targetActorId !== goneId);
      if (kept.length !== strings.length) { n += strings.length - kept.length; await a.setFlag(BOND_FLAG, "stringList", kept); }
    }
    return n;
  }

  /**
   * How a technique moves what one side feels for the other (`fromId`'s bond toward `toId`).
   *   warm  — the Heart won them over, or they crossed a line for you: +1 ● (a
   *           hostile bond eases −1 instead). No bond yet (or a Stranger): they
   *           become a Friend ●.
   *   cool  — a door slammed, a heart broken: a warm bond cools −1 ●, a hostile
   *           one hardens +1 ●. Only an existing bond moves.
   *   sour  — they gave in to Pressure and will remember it: a hostile bond
   *           hardens +1 ●; a warm one cools −1 ● and, once empty, turns into a
   *           Rival ●. No bond (or a Stranger) becomes a Rival ●.
   *   enemy — blackmail: whatever it was, they're your Enemy now (●●, or one
   *           hotter if they already hated you).
   * Returns { type, strength, delta, hostile, turned, created } after the
   * change, or null when nothing moved.
   */
  static async shift(fromId, toId, how) {
    if (!fromId || !toId || fromId === toId) return null;
    const bond = TSLBondStore.find(fromId, toId);
    const type = bond ? SocialArchetypeManager.getBondType(bond.type) : null;
    const hostile = !!type?.hostile;
    const cur = bond ? Math.min(3, Math.abs(bond.attitude ?? 0)) : 0;
    const clamp = (v) => Math.max(0, Math.min(3, v));
    const set = async (patch) => {
      if (bond) await TSLBondStore.update(fromId, bond.id, patch);
      else await TSLBondStore.add(fromId, toId, patch);
    };

    if (how === "enemy") {
      const strength = hostile ? clamp(cur + 1) : 2;
      if (bond && type.id === "enemy" && strength === cur) return null;
      await set({ type: "enemy", attitude: strength });
      return { type: "enemy", strength, delta: 1, hostile: true, turned: !!bond && type.id !== "enemy", created: !bond };
    }
    if (how === "sour" && (!bond || type.id === "stranger" || (!hostile && cur <= 1))) {
      await set({ type: "rival", attitude: 1 });
      return { type: "rival", strength: 1, delta: -1, hostile: true, turned: !!bond, created: !bond };
    }
    if (!bond || (how === "warm" && type.id === "stranger")) {
      if (how !== "warm") return null;
      await set({ type: "friend", attitude: 1 });
      return { type: "friend", strength: 1, delta: 1, hostile: false, turned: !!bond, created: !bond };
    }
    // warm: +1 (hostile eases); cool / sour: −1 (hostile hardens).
    const delta = (how === "warm" ? 1 : -1) * (hostile ? -1 : 1);
    const strength = clamp(cur + delta);
    if (strength === cur) return null;
    await set({ attitude: strength });
    return { type: type.id, strength, delta, hostile, turned: false, created: false };
  }
}
