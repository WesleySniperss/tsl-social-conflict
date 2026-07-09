/**
 * tsl-social-conflict | tsl-playbooks.js
 *
 * The nine Thirsty Sword Lesbians playbooks (classes), adapted for this
 * module's social conflict: each brings TWO signature emotional moves
 * (2d6 + stat) that appear in the conflict window next to the basic five.
 *
 * Move effects use the same fx fields recordRoll understands:
 *   onStrong / onWeak: { strings, stringsOnYou, reveal, resolve }
 *     strings      — you gain N Strings on the target
 *     stringsOnYou — the target gains N Strings on you
 *     reveal       — the target's profile is revealed in your Chronicle
 *     resolve      — target loses N Resolve (only while their tracks run)
 * Anything else in the move text is adjudicated at the table (Conditions
 * are toggled by the GM on the participant cards).
 *
 * Adapted from Thirsty Sword Lesbians by April Kit Walsh (Evil Hat
 * Productions) under the Powered by Lesbians open license.
 */

console.log("TSL | Loading tsl-playbooks.js...");

const TSL_PLAYBOOKS = [
  {
    id: "beast",
    label: "The Beast",
    icon: "fa-paw",
    essence: "A wild heart in polite company — honesty sharp as claws.",
    moves: [
      {
        id: "pb_bare_fangs", name: "Bare Your Fangs", icon: "fa-paw", stat: "Nerve", target: true,
        desc: "Drop the mask of civility. On 10+: they back down — you gain 1 String. On 7-9: they yield ground, but you gain the Angry Condition.",
        onStrong: { strings: 1 },
      },
      {
        id: "pb_soft_underbelly", name: "Soft Underbelly", icon: "fa-heart", stat: "Passion", target: true,
        desc: "Show the tender thing you hide. On 10+: true connection — clear one of your Conditions; the honesty chips 1 Resolve if their tracks run. On 7-9: they see you — they gain 1 String on you.",
        onStrong: { resolve: 1 },
        onWeak:   { stringsOnYou: 1 },
      },
    ],
  },
  {
    id: "chosen",
    label: "The Chosen",
    icon: "fa-sun",
    essence: "Destiny picked you — and everyone has opinions about that.",
    moves: [
      {
        id: "pb_voice_destiny", name: "Voice of Destiny", icon: "fa-sun", stat: "Spirit", target: true,
        desc: "Speak with the weight of prophecy. On 10+: they believe — 1 String, and 1 Resolve if their tracks run. On 7-9: they believe, but fate demands a price (GM says what).",
        onStrong: { strings: 1, resolve: 1 },
      },
      {
        id: "pb_burden_fate", name: "Burden of Fate", icon: "fa-star", stat: "Passion", target: true,
        desc: "Confess what the calling costs you. On 10+: clear one of your Conditions and take +1 forward. On 7-9: clear a Condition, but they glimpse your fear.",
      },
    ],
  },
  {
    id: "devoted",
    label: "The Devoted",
    icon: "fa-shield",
    essence: "Your heart belongs to a cause — or to a person.",
    moves: [
      {
        id: "pb_in_their_name", name: "In Their Name", icon: "fa-shield", stat: "Passion", target: true,
        desc: "Invoke who or what you serve. On 10+: undeniable sincerity — 1 String, and 1 Resolve if their tracks run. On 7-9: they are moved but wary of your zeal.",
        onStrong: { strings: 1, resolve: 1 },
      },
      {
        id: "pb_steadfast", name: "Steadfast", icon: "fa-anchor", stat: "Spirit", target: true,
        desc: "Take the heat meant for someone else. On 10+: one of their Conditions moves to you (GM toggles) and you gain 1 String on the one you shielded. On 7-9: you share the burden — you both keep it.",
        onStrong: { strings: 1 },
      },
    ],
  },
  {
    id: "infamous",
    label: "The Infamous",
    icon: "fa-crown",
    essence: "Your reputation enters the room before you do.",
    moves: [
      {
        id: "pb_legend_precedes", name: "Legend Precedes You", icon: "fa-crown", stat: "Nerve", target: true,
        desc: "Let the stories do the talking. On 10+: they treat you as the legend — 1 String, and 1 Resolve if their tracks run. On 7-9: they heard a story, but the GM picks which one.",
        onStrong: { strings: 1, resolve: 1 },
      },
      {
        id: "pb_wicked_charm", name: "Wicked Charm", icon: "fa-mask", stat: "Grace", target: true,
        desc: "Turn the bad name into allure. On 10+: they gain the Smitten Condition (GM toggles). On 7-9: so do you.",
      },
    ],
  },
  {
    id: "naturewitch",
    label: "The Nature Witch",
    icon: "fa-leaf",
    essence: "Green calm and old roots; the storm passes through you.",
    moves: [
      {
        id: "pb_calming_presence", name: "Calming Presence", icon: "fa-leaf", stat: "Spirit", target: true,
        desc: "Breathe stillness into the room. On 10+: clear one of their Conditions (their choice) and gain 1 String. On 7-9: you soothe them but absorb it — you gain the Condition instead.",
        onStrong: { strings: 1 },
      },
      {
        id: "pb_speak_thorns", name: "Speak with Thorns", icon: "fa-seedling", stat: "Wit", target: true,
        desc: "Truth wrapped in briars. On 10+: it lands clean — 1 Resolve if their tracks run, and they cannot be Angry at you for it. On 7-9: it stings — they gain the Angry Condition.",
        onStrong: { resolve: 1 },
      },
    ],
  },
  {
    id: "scoundrel",
    label: "The Scoundrel",
    icon: "fa-coins",
    essence: "Charm as sleight of hand — watch the smile, lose your purse.",
    moves: [
      {
        id: "pb_silver_tongue", name: "Silver Tongue", icon: "fa-comment", stat: "Grace", target: true,
        desc: "Talk circles around them. On 10+: you gain 2 Strings. On 7-9: 1 String — but they will want a favor.",
        onStrong: { strings: 2 },
        onWeak:   { strings: 1 },
      },
      {
        id: "pb_devils_bargain", name: "Devil's Bargain", icon: "fa-scale-unbalanced", stat: "Wit", target: true,
        desc: "Offer a deal too clever to refuse. On 10+: it takes — 1 Resolve if their tracks run, and you read their nature. On 7-9: the deal takes, but you owe them too — they gain 1 String on you.",
        onStrong: { resolve: 1, reveal: true },
        onWeak:   { stringsOnYou: 1 },
      },
    ],
  },
  {
    id: "seeker",
    label: "The Seeker",
    icon: "fa-compass",
    essence: "Questions are your compass; every stranger is a map.",
    moves: [
      {
        id: "pb_piercing_questions", name: "Piercing Questions", icon: "fa-magnifying-glass", stat: "Wit", target: true,
        desc: "Ask the thing no one dares to. On 10+: you read their nature and gain 1 String. On 7-9: one honest answer.",
        onStrong: { strings: 1, reveal: true },
      },
      {
        id: "pb_open_heart", name: "Open Heart", icon: "fa-door-open", stat: "Passion", target: true,
        desc: "Answer THEIR unspoken question first. On 10+: trust blooms — each of you may clear one Condition. On 7-9: you show more than you learn — they gain 1 String on you.",
        onWeak: { stringsOnYou: 1 },
      },
    ],
  },
  {
    id: "spookywitch",
    label: "The Spooky Witch",
    icon: "fa-moon",
    essence: "You know things the dark told you, and it shows.",
    moves: [
      {
        id: "pb_unsettling_gaze", name: "Unsettling Gaze", icon: "fa-eye", stat: "Nerve", target: true,
        desc: "Look at them like you already know. On 10+: they flinch first — 1 String, and 1 Resolve if their tracks run. On 7-9: they flinch, but name you a witch — you gain Scared or Angry (GM picks).",
        onStrong: { strings: 1, resolve: 1 },
      },
      {
        id: "pb_whispered_omens", name: "Whispered Omens", icon: "fa-moon", stat: "Wit", target: true,
        desc: "Read the signs around them. On 10+: their nature is revealed, and you may ask one question about what they fear. On 7-9: the omen is cloudy — one vague truth.",
        onStrong: { reveal: true },
      },
    ],
  },
  {
    id: "trickster",
    label: "The Trickster",
    icon: "fa-dice",
    essence: "Chaos with a grin; the punchline is always true.",
    moves: [
      {
        id: "pb_disarming_jest", name: "Disarming Jest", icon: "fa-face-laugh", stat: "Grace", target: true,
        desc: "Break the tension with a joke that cuts true. On 10+: the room exhales — clear one Condition anywhere at the table; the truth in it chips 1 Resolve if their tracks run. On 7-9: funny, but at someone's expense — they gain Angry.",
        onStrong: { resolve: 1 },
      },
      {
        id: "pb_misdirection", name: "Misdirection", icon: "fa-shuffle", stat: "Wit", target: true,
        desc: "While they look the wrong way… On 10+: you gain 2 Strings. On 7-9: 1 String, but you drop something of yours (GM says what).",
        onStrong: { strings: 2 },
        onWeak:   { strings: 1 },
      },
    ],
  },
];

class TSLPlaybooks {
  static getById(id) {
    return TSL_PLAYBOOKS.find(p => p.id === id) ?? null;
  }

  /** The playbook chosen for this actor (flag socialFencing.playbookId). */
  static getForActor(actor) {
    const id = SocialArchetypeManager.getActorData(actor)?.playbookId ?? null;
    return TSLPlaybooks.getById(id);
  }

  static async setForActor(actor, playbookId) {
    await SocialArchetypeManager.setActorData(actor, { playbookId: playbookId || null });
  }

  /** Look up any playbook move by id (used by the GM roll relay). */
  static getMove(moveId) {
    for (const pb of TSL_PLAYBOOKS) {
      const move = pb.moves.find(m => m.id === moveId);
      if (move) return move;
    }
    return null;
  }

  static getOptions() {
    return TSL_PLAYBOOKS.map(p => ({ id: p.id, label: p.label }));
  }
}
