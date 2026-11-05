/**
 * tsl-social-conflict | abilities.js
 *
 * What an NPC does with a String it holds on a character. Three moves each:
 *   • at the roll — its TRIAD's move (TRIAD_MOVES): after the dice the GM may
 *     spend the String. Power strikes back (−5), Emotion makes the win hurt
 *     (their emotion on the speaker), Order sets the terms (their price, at
 *     any grade). That roll moves no Strings after.
 *   • in the talk, and beyond the scene — its NATURE's two (NPC_ABILITIES).
 *     The GM uses one from the NPC's own Talk tab; a chat card asks for the
 *     answer — give in (D&D Inspiration) or refuse and pay for it; or, for a
 *     deadline, the GM says how it ended. Whoever holds a String on that NPC
 *     can answer with it instead: Quits — both burn, nothing happens.
 * An NPC takes a String on a character when that character loses a roll to
 * them (and when a win costs one: Pressure, a Deal, a price that is a debt).
 * One at a time. Inspired by Thirsty Sword Lesbians — its GM moves for each
 * playbook and its Influence with a String (Powered by Lesbians).
 *
 * Every text is English, translated in place by TSLi18n.apply().
 */

console.log("TSL | Loading abilities.js...");

const ABILITY_SCOPE = "tsl-social-conflict";

/**
 * A triad's move at the roll. `on`: "any" roll, or only a "hit" (a win that
 * stands). Emotion's emotion is the nature's own (`hurts`): Guilt is toward
 * them.
 */
const TRIAD_MOVES = {
  power:     { id: "strike-back", triad: "power", on: "any", name: "Strike back",
    text: "After the dice, they spend the String: −5 to the roll. Your own +5, turned against you." },
  attention: { id: "feel-it", triad: "attention", on: "hit", name: "You'll feel it",
    text: "You get what you asked for — and carry their emotion for it (the Martyr and the Caretaker: Guilt toward them; the Idol: Insecure)." },
  order:     { id: "my-terms", triad: "order", on: "hit", name: "On my terms",
    text: "You get it — and pay their price, whatever the grade, even after a Demand or Blackmail." },
};

/**
 * A nature's own two. `when`: "talk" (in a conversation), "roll" (when any
 * roll of yours fails) or "beyond" (between scenes). Each outcome: `by` "pc"
 * (the player answers — or the GM) or "gm" (the GM says how it ended); `fx`:
 *   "inspire" — Inspiration; "keep" — the String stays theirs; "flip" — their
 *   String burns and the character takes one on them; "silence" — every ask
 *   counts as one against their interests until lifted;
 *   { emotion } — on the character (Guilt toward them);
 *   { shift: "warm" | "cool" } — the degree of the bond between them;
 *   { begin } — a relationship where there is none (a roll never renames one);
 *   { pick: "friend" | "npc" | "lie", shift?, emotion?, transfer? } — the GM
 *   picks who it lands on.
 * `result` — the line on the card: {pc}, {npc}, {who} (whoever was picked).
 */
const NPC_ABILITIES = {
  tyrant: [
    { id: "order", when: "talk", name: "An order before witnesses",
      text: "They give you an order in front of everyone.",
      outcomes: [
        { id: "yes", by: "pc", label: "Obey", result: "{pc} obeys — and takes Inspiration.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Refuse", result: "{pc} refuses: Frightened — and the rest of this talk is before witnesses.", fx: [{ emotion: "frightened" }] },
      ] },
    { id: "example", when: "beyond", name: "An example made",
      text: "By the next session, come and ask it as a favour — on your knee, before their people. If you don't, someone close to you pays for your insolence.",
      outcomes: [
        { id: "knelt", by: "gm", label: "Came and knelt", result: "{pc} came and knelt before their people.", fx: [] },
        { id: "no", by: "gm", label: "Didn't come", result: "{who} pays for {pc}'s insolence: Frightened, and their bond with {pc} cools.", fx: [{ pick: "friend", shift: "cool", emotion: "frightened" }] },
      ] },
  ],
  machiavellian: [
    { id: "hook", when: "talk", name: "A hook",
      text: "A small favour, nothing much — carry a message, keep quiet, look the other way.",
      outcomes: [
        { id: "yes", by: "pc", label: "Do it", result: "{pc} does it — and takes Inspiration. The String stays with them: now there's more to hold over {pc}.", fx: ["inspire", "keep"] },
        { id: "no", by: "pc", label: "Refuse", result: "{pc} refuses: Insecure — what do they know?", fx: [{ emotion: "insecure" }] },
      ] },
    { id: "secret", when: "beyond", name: "I know all about you",
      text: "Your secret reaches whoever it hurts most: a lie you told comes out, or something you hide.",
      outcomes: [
        { id: "lie", by: "gm", label: "A lie comes out", result: "{pc}'s lie comes out.", fx: [{ pick: "lie" }] },
        { id: "other", by: "gm", label: "Something else", result: "Something {pc} hid comes out — the GM says what, and to whom.", fx: [] },
      ] },
  ],
  duelist: [
    { id: "challenge", when: "talk", name: "A challenge",
      text: "A public challenge — blades, a game, words. Accept it, or admit you're the lesser. If you accept, the GM calls the roll.",
      outcomes: [
        { id: "decline", by: "pc", label: "Decline", result: "{pc} declines: Insecure — everyone saw.", fx: [{ emotion: "insecure" }] },
        { id: "won", by: "gm", label: "Accepted — and won", result: "{pc} accepts and wins: their String burns, and {pc} takes one on them.", fx: ["flip"] },
        { id: "lost", by: "gm", label: "Accepted — and lost", result: "{pc} accepts and loses: Insecure — and the String stays with them.", fx: [{ emotion: "insecure" }, "keep"] },
      ] },
    { id: "cut-off", when: "beyond", name: "Cut you off",
      text: "They go after the same thing you do: whatever you go for next — a person, a post, a prize — they get there first, and your first roll for it is at disadvantage.",
      outcomes: [
        { id: "ok", by: "pc", label: "So be it", result: "{npc} is on {pc}'s road: the first roll for what {pc} goes after next is at disadvantage.", fx: [] },
      ] },
  ],
  martyr: [
    { id: "after-all", when: "talk", name: "After everything I've done for you…",
      text: "They remind you what they've given up for you — and ask one thing.",
      outcomes: [
        { id: "yes", by: "pc", label: "Do it", result: "{pc} does it — and takes Inspiration.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Refuse", result: "{pc} refuses: Guilty toward them — and it lasts until {pc} does something for them.", fx: [{ emotion: "guilty" }] },
      ] },
    { id: "need-you", when: "beyond", name: "I can't do without you",
      text: "At the worst moment — before something that matters to you — they're in trouble and call for you.",
      outcomes: [
        { id: "come", by: "pc", label: "Come", result: "{pc} comes — and misses what was to happen (the GM says what it costs).", fx: [] },
        { id: "stay", by: "pc", label: "Don't come", result: "{pc} doesn't come: Guilty toward them — and {who}, one of theirs, becomes a Rival.", fx: [{ emotion: "guilty" }, { pick: "npc", begin: "rival" }] },
      ] },
  ],
  exalted: [
    { id: "room", when: "talk", name: "The room is mine",
      text: "They take the room and expect you to play along — their story, their credit, in front of everyone.",
      outcomes: [
        { id: "yes", by: "pc", label: "Play along", result: "{pc} plays along — and takes Inspiration.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Refuse", result: "{pc} won't: Insecure — they make a fool of {pc} in front of everyone.", fx: [{ emotion: "insecure" }] },
      ] },
    { id: "crowd", when: "beyond", name: "The crowd turns",
      text: "Their version gets around first: you walk into their circle Insecure.",
      outcomes: [
        { id: "ok", by: "pc", label: "So be it", result: "{pc} is Insecure — the room has heard their version.", fx: [{ emotion: "insecure" }] },
      ] },
  ],
  caretaker: [
    { id: "lost-without", when: "roll", name: "You'd be lost without me",
      text: "When a roll of yours fails — any roll, in a fight too — they're there: you roll it again. And the String comes back to them: you owe them again.",
      outcomes: [
        { id: "yes", by: "pc", label: "Accept their help", result: "{pc} accepts: roll it again. The String stays with them.", fx: ["keep"] },
        { id: "no", by: "pc", label: "Refuse it", result: "{pc} refuses their help: Guilty toward them.", fx: [{ emotion: "guilty" }] },
      ] },
    { id: "jealous", when: "beyond", name: "Jealous care",
      text: "They come between you and whoever has been helping you.",
      outcomes: [
        { id: "ok", by: "gm", label: "Between them and…", result: "They come between {pc} and {who}: that bond cools, and {pc} is Guilty toward them.", fx: [{ pick: "friend", shift: "cool" }, { emotion: "guilty" }] },
      ] },
  ],
  dogmatic: [
    { id: "sin", when: "talk", name: "Your sin",
      text: "They quote the law and name your sin — and demand penance: a deed the rule asks for.",
      outcomes: [
        { id: "yes", by: "pc", label: "Do penance", result: "{pc} does penance — and takes Inspiration.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Refuse", result: "{pc} refuses: Angry.", fx: [{ emotion: "angry" }] },
      ] },
    { id: "law", when: "beyond", name: "The law demands",
      text: "In the name of their temple, order or law, they make a demand of you. Not done by the next session — they're your Enemy, and their circle with them.",
      outcomes: [
        { id: "done", by: "gm", label: "Done", result: "{pc} did what the law asked.", fx: [] },
        { id: "not", by: "gm", label: "Not done", result: "{pc} didn't: they're Enemies now — and their circle with them.", fx: [{ begin: "enemy" }] },
      ] },
  ],
  hermit: [
    { id: "question", when: "talk", name: "One question",
      text: "Silence — then one precise question, straight into what hurts. Answer it the way your character would have to.",
      outcomes: [
        { id: "yes", by: "pc", label: "Answer truly", result: "{pc} answers truly — and takes Inspiration.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Evade", result: "{pc} evades: Hopeless.", fx: [{ emotion: "hopeless" }] },
      ] },
    { id: "silence", when: "beyond", name: "Silence",
      text: "They shut you out. Until you bring them a truth about yourself, every ask of yours counts as one against their interests (+4 DC).",
      outcomes: [
        { id: "ok", by: "pc", label: "So be it", result: "They shut {pc} out: every ask counts as one against their interests until {pc} brings them a truth.", fx: ["silence"] },
      ] },
  ],
  broker: [
    { id: "old-debt", when: "talk", name: "An old debt",
      text: "They put an old debt on the table: pay it now — with something of real value.",
      outcomes: [
        { id: "yes", by: "pc", label: "Pay", result: "{pc} pays — and takes Inspiration. The debt is settled.", fx: ["inspire"] },
        { id: "no", by: "pc", label: "Don't pay", result: "{pc} doesn't pay: Hopeless — and the debt stands: the String stays with them.", fx: [{ emotion: "hopeless" }, "keep"] },
      ] },
    { id: "sold", when: "beyond", name: "A debt for sale",
      text: "They sell your debt: their String on you goes to someone else, who uses it their own way.",
      outcomes: [
        { id: "ok", by: "gm", label: "Sell it to…", result: "{npc} sells their String on {pc} to {who}.", fx: [{ pick: "npc", transfer: true }] },
      ] },
  ],
};
for (const [nature, list] of Object.entries(NPC_ABILITIES)) for (const ab of list) ab.nature = nature;

/** When each move happens, in words. */
const ABILITY_WHEN = {
  roll: "at a roll",
  talk: "in the talk",
  beyond: "beyond the scene",
};

class TSLAbilities {

  /** Their three: the triad's move at the roll, and the nature's two. */
  static of(npc) {
    const arch = SocialArchetypeManager.getArchetype(npc);
    if (!arch) return { triad: null, nature: [] };
    return { triad: TRIAD_MOVES[arch.triad] ?? null, nature: NPC_ABILITIES[arch.id] ?? [] };
  }

  static find(npc, id) {
    return TSLAbilities.of(npc).nature.find(a => a.id === id) ?? null;
  }

  /** Fill {placeholders} in a data text (already in the user's language). */
  static fill(s, data) {
    return String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(data, k) ? String(data[k]) : m));
  }

  /** A card still waiting for its answer, for this pair. */
  static pending(npcId, pcId) {
    return (game.messages?.contents ?? []).find(m => {
      const f = m.getFlag?.(ABILITY_SCOPE, "ability");
      return f?.open && f.npcId === npcId && f.pcId === pcId;
    }) ?? null;
  }

  /**
   * The GM uses a nature's move on a character they hold a String on: a card
   * asks for the answer. The String is spent when it's answered (and not at
   * all on Quits).
   */
  static async use(npc, pc, abilityId) {
    if (!game.user.isGM || !npc || !pc) return null;
    const ab = TSLAbilities.find(npc, abilityId);
    if (!ab) return null;
    if (!TSLStringStore.countOn(npc.id, pc.id)) {
      ui.notifications?.warn?.(_t("{npc} holds no String on {pc}.", { npc: npc.name, pc: pc.name }));
      return null;
    }
    if (TSLAbilities.pending(npc.id, pc.id)) {
      ui.notifications?.warn?.(_t("{npc} already pulled that String — the card waits for its answer.", { npc: npc.name }));
      return null;
    }
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: npc }),
      content: TSLAbilities._card(npc, pc, ab),
      flags: { [ABILITY_SCOPE]: { ability: { npcId: npc.id, pcId: pc.id, abilityId: ab.id, open: true } } },
    });
  }

  static _card(npc, pc, ab, result = null) {
    const esc = foundry.utils.escapeHTML;
    const quits = TSLStringStore.countOn(pc.id, npc.id) > 0;
    const btns = result ? "" : `<div class="tsl-ab-btns">${ab.outcomes.map(o => `<button type="button" class="tsl-ab-btn" data-tsl-ab-choice="${o.id}" data-by="${o.by}">${esc(o.label)}</button>`).join("")}
      ${quits ? `<button type="button" class="tsl-ab-btn tsl-ab-btn--quits" data-tsl-ab-choice="quits" data-by="pc" data-tooltip="${esc(_t("Answer with your own String on them: both burn, and nothing happens."))}"><i class="fas fa-masks-theater"></i> ${_t("Quits")}</button>` : ""}</div>
      <div class="tsl-ab-wait">${_t("Waiting for {pc}'s answer.", { pc: esc(pc.name) })}</div>`;
    return `<div class="tsl-x-card tsl-ab-card">
      <div class="tsl-x-head"><i class="fas fa-masks-theater"></i><span class="tsl-x-title">${_t("{npc} pulls a String on {pc}", { npc: esc(npc.name), pc: esc(pc.name) })}</span></div>
      <div class="tsl-ab-name">«${esc(ab.name)}» <small>${esc(_t(ABILITY_WHEN[ab.when] ?? ""))}</small></div>
      <div class="tsl-ab-text">${esc(ab.text)}</div>
      ${btns}
      ${result ? `<ul class="tsl-x-after">${result.map(l => `<li class="tsl-x-after-item ${l.tone ? `tsl-x-after--${l.tone}` : ""}">${l.html}</li>`).join("")}</ul>` : ""}
    </div>`;
  }

  /**
   * The answer to a card (GM client — players come through the relay). The
   * character's owner answers for "pc" outcomes and Quits; only the GM for
   * "gm" outcomes.
   */
  static async outcome({ messageId, choice } = {}, senderId = null) {
    if (!game.user.isGM) return;
    const msg = game.messages?.get?.(messageId);
    const f = msg?.getFlag?.(ABILITY_SCOPE, "ability");
    if (!f?.open) return;
    const npc = game.actors.get(f.npcId), pc = game.actors.get(f.pcId);
    const ab = npc ? TSLAbilities.find(npc, f.abilityId) : null;
    if (!npc || !pc || !ab) return;
    const sender = senderId ? game.users.get(senderId) : game.user;
    const byGM = !!sender?.isGM;
    const esc = foundry.utils.escapeHTML;
    const lines = [];
    const data = { pc: esc(pc.name), npc: esc(npc.name), who: "" };

    if (choice === "quits") {
      if (!byGM && !pc.testUserPermission?.(sender, "OWNER")) return;
      if (!(await TSLStringStore.spend(pc.id, npc.id))) return;
      await TSLStringStore.spend(npc.id, pc.id);
      lines.push({ html: _t("{pc} answers with their own String on {npc}: Quits — both burn, and nothing happens.", data), tone: "good" });
    } else {
      const o = ab.outcomes.find(x => x.id === choice);
      if (!o || (o.by === "gm" && !byGM) || (!byGM && !pc.testUserPermission?.(sender, "OWNER"))) return;
      if (!TSLStringStore.countOn(npc.id, pc.id)) {
        lines.push({ html: _t("{npc} no longer holds a String on {pc} — nothing happens.", data), tone: "" });
      } else {
        let keep = false, flip = false, picked = null;
        const after = [];
        for (const fx of o.fx ?? []) {
          if (fx === "keep") keep = true;
          else if (fx === "flip") flip = true;
          else if (fx === "inspire") after.push({ html: await TSLAbilities.inspire(pc), tone: "good" });
          else if (fx === "silence") {
            await TSLAbilities.setSilence(npc, pc.id, true);
          } else if (fx.emotion) {
            const r = await TSLEmotions.add(pc, fx.emotion, { by: npc.id, toward: fx.emotion === "guilty" ? npc.id : null });
            if (r?.scar) after.push({ html: _t("{name} was already {emotion} — it leaves a scar: <b>{scar}</b>.", { name: esc(pc.name), emotion: EMOTIONS[fx.emotion].label, scar: SCARS[r.scar].label }), tone: "bad" });
          } else if ((fx.shift || fx.begin) && !fx.pick) {
            const s = fx.begin ? await TSLBondStore.begin(npc.id, pc.id, fx.begin, fx.begin === "enemy" ? 2 : 1) : await TSLBondStore.shift(npc.id, pc.id, fx.shift);
            after.push({ html: s ? TSLTalk._bondLine(npc, pc, s) : _t("What they are to each other now is the GM's call (Bonds)."), tone: "bad" });
          } else if (fx.pick) {
            picked = await TSLAbilities._pick(fx.pick, npc, pc);
            if (!picked) { after.push({ html: _t("Nobody fits — the GM tells it in the scene."), tone: "" }); continue; }
            if (fx.pick === "lie") { await TSLTalk.exposeLie(picked.npc, picked.lie.id); data.who = esc(picked.npc.name); continue; }
            data.who = esc(picked.name);
            if (fx.transfer) { await TSLStringStore.add(picked.id, pc.id, 1); continue; }
            const s = fx.begin ? await TSLBondStore.begin(picked.id, pc.id, fx.begin, 1)
              : fx.pick === "friend" ? await TSLBondStore.shift(pc.id, picked.id, fx.shift) : await TSLBondStore.shift(picked.id, pc.id, fx.shift);
            if (s) after.push({ html: TSLTalk._bondLine(fx.pick === "friend" ? pc : picked, fx.pick === "friend" ? picked : pc, s), tone: "bad" });
            if (fx.emotion) await TSLEmotions.add(picked, fx.emotion, { by: npc.id });
          }
        }
        if (!keep) await TSLStringStore.spend(npc.id, pc.id);
        if (flip) await TSLStringStore.add(pc.id, npc.id, 1);
        lines.push({ html: TSLAbilities.fill(o.result, data), tone: o.fx?.some(x => x === "inspire" || x === "flip") ? "good" : "bad" }, ...after);
        if (!keep && !flip) lines.push({ html: _t("The String is spent.", data), tone: "" });
      }
    }
    await msg.update({ content: TSLAbilities._card(npc, pc, ab, lines), [`flags.${ABILITY_SCOPE}.ability.open`]: false });
  }

  /** D&D Inspiration (dnd5e and a5e keep it as a flag on the sheet); otherwise a note to mark it. */
  static async inspire(actor) {
    const esc = foundry.utils.escapeHTML;
    if (typeof foundry.utils.getProperty(actor, "system.attributes.inspiration") === "boolean") {
      await actor.update({ "system.attributes.inspiration": true });
      return _t("{name} takes Inspiration.", { name: esc(actor.name) });
    }
    return _t("{name} takes Inspiration — mark it on the sheet.", { name: esc(actor.name) });
  }

  /** The Hermit's silence: who it holds against (until the GM lifts it). */
  static silenced(npc, pcId) {
    const list = SocialArchetypeManager.getActorData(npc).silence;
    return Array.isArray(list) && list.includes(pcId);
  }
  static async setSilence(npc, pcId, on) {
    const list = (SocialArchetypeManager.getActorData(npc).silence ?? []).filter(id => id !== pcId);
    if (on) list.push(pcId);
    await SocialArchetypeManager.setActorData(npc, { silence: list });
  }

  /** The GM picks who a move lands on: a friend of theirs, an NPC, or one of their lies. */
  static async _pick(kind, npc, pc) {
    let options = [];
    if (kind === "friend") {
      options = TSLBondStore.getList(pc.id).map(b => game.actors.get(b.targetActorId))
        .filter(a => a && a.id !== npc.id && !SocialArchetypeManager.getBondType(TSLBondStore.find(pc.id, a.id)?.type)?.hostile)
        .map(a => ({ label: a.name, value: a }));
    } else if (kind === "npc") {
      const onScene = (globalThis.canvas?.tokens?.placeables ?? []).map(t => t.actor ? (game.actors.get(t.actor.id) ?? t.actor) : null);
      const pool = onScene.filter(Boolean).length ? onScene : (game.actors?.contents ?? []);
      const seen = new Set();
      options = pool.filter(a => a && a.id !== npc.id && a.id !== pc.id && TSLTalk.isNpc(a) && !seen.has(a.id) && seen.add(a.id))
        .map(a => ({ label: a.name, value: a }));
    } else if (kind === "lie") {
      for (const a of (game.actors?.contents ?? [])) for (const l of TSLTalk.lies(a)) if (l.byId === pc.id) options.push({ label: _t("The lie to {name}", { name: a.name }), value: { npc: a, lie: l } });
    }
    if (!options.length) return null;
    const o = await TSLTalk._pickOne(_t("{npc}: who does it land on?", { npc: npc.name }), _t("Pick one."), options.slice(0, 10));
    return o?.value ?? null;
  }

  /** At the roll: the GM may spend their String on their triad's move. */
  static async promptMove(npc, src, move, p) {
    const esc = foundry.utils.escapeHTML;
    return new Promise(resolve => {
      new Dialog({
        title: _t("{npc} holds a String on {pc}", { npc: npc.name, pc: src.name }),
        content: `<div class="tsl-dlg">
          <p>${_t("{pc} rolled {total} against DC {dc}: {grade}.", { pc: esc(src.name), total: p.total, dc: p.dc, grade: esc(TSLTalk.gradeLabel(p.technique, p.grade)) })}</p>
          <p><b>«${esc(move.name)}»</b> — ${esc(move.text)}</p>
          <p class="notes">${_t("Spend their String on it? Then this roll moves no Strings.")}</p></div>`,
        buttons: {
          use:  { icon: '<i class="fas fa-masks-theater"></i>', label: _t("Spend it"), callback: () => resolve(true) },
          keep: { label: _t("Not now"), callback: () => resolve(false) },
        },
        default: "keep",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
  }

  /** Wire a card's buttons — each user sees only the answers that are theirs to give. */
  static bindCard(message, html) {
    const f = message?.getFlag?.(ABILITY_SCOPE, "ability");
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!f || !root) return;
    const pc = game.actors.get(f.pcId);
    const mine = game.user.isGM || !!pc?.isOwner;
    root.querySelectorAll("[data-tsl-ab-choice]").forEach(btn => {
      if (!f.open || !mine || (btn.dataset.by === "gm" && !game.user.isGM)) { btn.remove(); return; }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        root.querySelectorAll("[data-tsl-ab-choice]").forEach(b => { b.disabled = true; });
        TSLGMActions.request("abilityOutcome", { messageId: message.id, choice: btn.dataset.tslAbChoice, pcId: f.pcId });
      });
    });
    // "Waiting for their answer" is for everyone else.
    if (root.querySelector("[data-tsl-ab-choice]")) root.querySelector(".tsl-ab-wait")?.remove();
  }
}
