/**
 * tsl-social-conflict | bond-store.js
 *
 * Chronicle of Bonds — persistent relationships between actors, stored as
 * actor flags and editable by the actor's owner and the GM.
 *
 * Flag path: actor.flags["tsl-social-conflict"]["bonds"]
 * Value: [{ id, targetActorId, type, attitude, label, notes }]
 *
 *   type     — bond type id from BOND_TYPES (social-archetypes.js)
 *   attitude — the bond's STRENGTH, 0..3 ● (the old name is kept for saved
 *              data; pre-rework ±3 values read as their absolute value)
 *   label    — a caption for the line between them on the relationship map
 *
 * A bond is ONE relationship: its type, strength and caption are mirrored
 * onto the other actor (the counterpart type for mentor ↔ protégé, sworn ↔
 * liege). Notes stay private to each side. A player can't write an NPC's
 * flags, so their side's change reaches the other side through the GM.
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
      label:    data.label ?? "",
      notes:    data.notes ?? "",
    };
    list.push(entry);
    await TSLBondStore._saveList(actorId, list);
    if (!_mirrored) await TSLBondStore._mirror(actorId, targetActorId, { type: entry.type, attitude: entry.attitude, label: entry.label });
    return entry;
  }

  static async update(actorId, bondId, updates, _mirrored = false) {
    const list  = TSLBondStore.getList(actorId);
    const entry = list.find(b => b.id === bondId);
    if (!entry) return;
    Object.assign(entry, updates);
    await TSLBondStore._saveList(actorId, list);
    // Only the SHARED facets (type, strength, caption) sync; notes do not.
    if (!_mirrored && ("type" in updates || "attitude" in updates || "label" in updates)) {
      await TSLBondStore._mirror(actorId, entry.targetActorId, {
        type:     "type" in updates     ? entry.type     : undefined,
        attitude: "attitude" in updates ? entry.attitude : undefined,
        label:    "label" in updates    ? entry.label    : undefined,
      });
    }
  }

  static async remove(actorId, bondId, _mirrored = false) {
    const entry = TSLBondStore.getList(actorId).find(b => b.id === bondId);
    await TSLBondStore._saveList(actorId, TSLBondStore.getList(actorId).filter(b => b.id !== bondId));
    // Ending a relationship ends it on both sides.
    if (_mirrored || !entry) return;
    if (TSLBondStore._canWrite(entry.targetActorId)) {
      const rev = TSLBondStore.find(entry.targetActorId, actorId);
      if (rev) await TSLBondStore.remove(entry.targetActorId, rev.id, true);
    } else TSLBondStore._relay({ actorId, targetActorId: entry.targetActorId, remove: true });
  }

  /** Can the current user write flags on this actor? (GM always; owners of it.) */
  static _canWrite(actorId) {
    const a = game.actors.get(actorId);
    return !!a && (game.user.isGM || a.isOwner);
  }

  /**
   * Write the mirror of a bond onto the other actor — same strength and
   * caption, the counterpart type. Without write access to the other actor (a
   * player and an NPC), the GM writes it.
   */
  static async _mirror(actorId, targetActorId, { type, attitude, label } = {}) {
    if (actorId === targetActorId) return;
    const patch = {};
    if (type != null)     patch.type     = SocialArchetypeManager.getBondMirror(type);
    if (attitude != null) patch.attitude = attitude;
    if (label != null)    patch.label    = label;
    if (!Object.keys(patch).length) return;
    if (!TSLBondStore._canWrite(targetActorId)) return TSLBondStore._relay({ actorId, targetActorId, type, attitude, label });
    const rev = TSLBondStore.find(targetActorId, actorId);
    if (rev) await TSLBondStore.update(targetActorId, rev.id, patch, true);
    else     await TSLBondStore.add(targetActorId, actorId, patch, true);
  }

  /** Ask the GM to write the other side. Quiet with no GM online: the GM's reconcile on load catches it up. */
  static _relay(args) {
    if (typeof TSLGMActions === "undefined" || !game.users?.activeGM) return;
    TSLGMActions.request("bondMirror", args);
  }

  /**
   * GM: a player changed their side of a bond (`actorId` → `targetActorId`) —
   * write it on the other side. The bond must be on the player's side (or
   * gone from it, for an ending).
   */
  static async applyMirror({ actorId, targetActorId, type, attitude, label, remove = false } = {}) {
    if (!game.user.isGM || !game.actors.get(actorId) || !game.actors.get(targetActorId)) return;
    const own = TSLBondStore.find(actorId, targetActorId);
    if (remove) {
      if (own) return;
      const rev = TSLBondStore.find(targetActorId, actorId);
      if (rev) await TSLBondStore.remove(targetActorId, rev.id, true);
      return;
    }
    if (!own) return;
    await TSLBondStore._mirror(actorId, targetActorId, {
      type: type != null ? own.type : undefined,
      attitude: attitude != null ? own.attitude : undefined,
      label: label != null ? (own.label ?? "") : undefined,
    });
  }

  /**
   * GM, on load: give every bond its missing mirror, and mend a pair whose two
   * sides differ. Only a player's change can leave them apart (the GM writes
   * both sides), so between a player character and an NPC the player's side
   * wins; two player characters that differ are left as they are.
   */
  static async reconcileAll() {
    if (!game.user.isGM) return;
    const isPC = (a) => SocialArchetypeManager.isPC(a);
    for (const a of (game.actors?.contents ?? [])) {
      for (const b of TSLBondStore.getList(a.id)) {
        const other = game.actors.get(b.targetActorId);
        if (!other) continue;
        const rev = TSLBondStore.find(b.targetActorId, a.id);
        const mirror = { type: SocialArchetypeManager.getBondMirror(b.type), attitude: b.attitude, label: b.label ?? "" };
        if (!rev) { await TSLBondStore.add(b.targetActorId, a.id, mirror, true); continue; }
        const differs = rev.type !== mirror.type || (rev.attitude ?? 0) !== (mirror.attitude ?? 0) || (rev.label ?? "") !== mirror.label;
        if (differs && isPC(a) && !isPC(other)) await TSLBondStore.update(b.targetActorId, rev.id, mirror, true);
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
   * The story moves a bond's DEGREE — never its type (`fromId`'s bond toward
   * `toId`; the other side follows). Who they are to each other is the GM's
   * to say, or the player's when a String is invested in a new bond.
   *   warm — +1 ● (a hostile bond eases −1 ● instead);
   *   cool — −1 ● (a hostile bond hardens +1 ● instead).
   * Only a typed bond moves (not a Stranger, not nothing). Returns
   * { type, strength, delta, hostile, turned: false, created: false } or null.
   */
  static async shift(fromId, toId, how) {
    if (!fromId || !toId || fromId === toId || (how !== "warm" && how !== "cool")) return null;
    const bond = TSLBondStore.find(fromId, toId);
    const type = bond ? SocialArchetypeManager.getBondType(bond.type) : null;
    if (!bond || type.id === "stranger") return null;
    const hostile = !!type.hostile;
    const cur = Math.min(3, Math.abs(bond.attitude ?? 0));
    const delta = (how === "warm" ? 1 : -1) * (hostile ? -1 : 1);
    const strength = Math.max(0, Math.min(3, cur + delta));
    if (strength === cur) return null;
    await TSLBondStore.update(fromId, bond.id, { attitude: strength });
    return { type: type.id, strength, delta, hostile, turned: false, created: false };
  }

  /**
   * Where there's no relationship yet (nothing, or Strangers), the story may
   * begin one: they become `typeId` at `strength` ●. A hostile type meeting a
   * hostile bond hardens it +1 ● instead. Any other relationship stays as it
   * is — it changes only by the GM's hand. Returns what `shift` returns (with
   * `created` / `turned`), or null.
   */
  static async begin(fromId, toId, typeId, strength = 1) {
    if (!fromId || !toId || fromId === toId) return null;
    const want = SocialArchetypeManager.getBondType(typeId);
    const bond = TSLBondStore.find(fromId, toId);
    const type = bond ? SocialArchetypeManager.getBondType(bond.type) : null;
    if (!bond || type.id === "stranger") {
      const patch = { type: want.id, attitude: Math.max(1, Math.min(3, strength)) };
      if (bond) await TSLBondStore.update(fromId, bond.id, patch);
      else await TSLBondStore.add(fromId, toId, patch);
      return { type: want.id, strength: patch.attitude, delta: 1, hostile: !!want.hostile, turned: !!bond, created: !bond };
    }
    if (want.hostile && type.hostile) {
      const cur = Math.min(3, Math.abs(bond.attitude ?? 0));
      if (cur >= 3) return null;
      await TSLBondStore.update(fromId, bond.id, { attitude: cur + 1 });
      return { type: type.id, strength: cur + 1, delta: 1, hostile: true, turned: false, created: false };
    }
    return null;
  }

  /** The ●●● signature is once per long rest: \`sigUsed\` is this side's own (never mirrored). */
  static async markSignatureUsed(actorId, bondId) {
    const list = TSLBondStore.getList(actorId);
    const entry = list.find(b => b.id === bondId);
    if (!entry) return;
    entry.sigUsed = true;
    await TSLBondStore._saveList(actorId, list);
  }

  /** A long rest: every signature of this actor's bonds is ready again. */
  static async clearSignatures(actorId) {
    const list = TSLBondStore.getList(actorId);
    if (!list.some(b => b.sigUsed)) return;
    for (const b of list) b.sigUsed = false;
    await TSLBondStore._saveList(actorId, list);
  }
}
