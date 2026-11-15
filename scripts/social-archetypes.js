/**
 * tsl-social-conflict | social-archetypes.js
 *
 * v3 data (design: docs/v3-design.md):
 *   APPROACHES  — how the speaker comes at someone: Pressure · Heart · Reason.
 *   SOCIAL_TRIADS — how a nature copes with people (Karen Horney): against
 *                 them (Power), toward them (Emotion), away from them (Order).
 *   SOCIAL_ARCHETYPES — the nine hidden natures. Each opens to one approach
 *                 (its KEY) and closes against one (its WALL); the third is
 *                 plain ground. Each names its PRICE when it says "yes, but",
 *                 pushes back its own way on a "no", and either ends the talk
 *                 or keeps listening after refusing something big. Inside a
 *                 triad all three key/wall pairs differ, so knowing the triad
 *                 is never enough — you read the person.
 *   PROFILE_POINTS — the dossier (Desire and Fear are levers).
 *   BOND_TYPES  — relationships; a bond's approach gets +● against that person.
 *   SocialArchetypeManager — reads/writes all of it on actor flags.
 */

console.log("TSL | Loading social-archetypes.js...");

const SOCIAL_FENCING_SCOPE = "tsl-social-conflict";

/**
 * The three APPROACHES. Every maneuver but the Read comes at a person one of
 * these ways. `school` — the bond school that feeds it (+● for a bond of
 * that kind). `cost` — what winning this way costs (talk.js applies it).
 */
const APPROACHES = {
  pressure: {
    id: "pressure", label: "Pressure", icon: "fa-hand-fist", color: "#e8557a", school: "power",
    gist: "Come at them hard.",
    short: "threats, a challenge, shame",
    examples: "a challenge, a threat, shame, coldness, provocation, shaking their certainty, a higher law",
    cost: "They give in without a price — but they remember it: they take a String on you, even when you win.",
    skills: ["itm", "dec", "prf", "per", "ath"],
  },
  heart: {
    id: "heart", label: "Heart", icon: "fa-heart", color: "#9b6ee8", school: "attention",
    gist: "Go through what they feel.",
    short: "charm, pity, guilt",
    examples: "admiration, charm, pity, guilt, jealousy, your own vulnerability",
    cost: "Your heart is on the table: when it misses, they've seen it — a String on you, on any miss — and their emotion with it.",
    skills: ["per", "prf", "ins", "dec"],
  },
  reason: {
    id: "reason", label: "Reason", icon: "fa-scale-balanced", color: "#55b8e8", school: "order",
    gist: "Go through facts and interest.",
    short: "an argument, proof, an offer",
    examples: "an argument, proof, an offer, one precise question, a puzzle",
    cost: "\"Yes, but\": they name their price on a plain hit — pay it, or walk away.",
    skills: ["per", "inv", "ins", "his", "dec"],
  },
};
const APPROACH_ORDER = ["pressure", "heart", "reason"];

/**
 * The three TRIADS — how a nature copes with people (Horney's three
 * directions). Ids are kept from earlier versions (saved data).
 */
const SOCIAL_TRIADS = {
  power: {
    id: "power", label: "Power", icon: "fa-chess-king", color: "#e8557a", horney: "against people",
    hint: "Moving AGAINST people (Karen Horney): control, rivalry, standing. Tyrant · Schemer · Duelist.",
  },
  attention: {
    id: "attention", label: "Emotion", icon: "fa-heart", color: "#9b6ee8", horney: "toward people",
    hint: "Moving TOWARD people: attention, affection, the need to be seen. Martyr · Idol · Caretaker.",
  },
  order: {
    id: "order", label: "Order", icon: "fa-scale-balanced", color: "#55b8e8", horney: "away from people",
    hint: "Moving AWAY from people: rules, knowledge, ledgers. Zealot · Hermit · Broker.",
  },
};

/**
 * The nine natures. `key` / `wall` are approach ids; `keyText` / `wallText`
 * say how that looks in a scene. `price` — what they want in return when they
 * say "yes, but" (`string: true` = paying it hands them a String on you).
 * `press` — how they hit back when you miss; `hurts` — the emotion that
 * leaves on whoever missed against them. `audience` — what witnesses
 * do to an ask (+2 they bend, −2 they harden, 0 nothing; `audienceWhy` says
 * why) — hidden, like the key and the wall. `psych` grounds the type in real
 * psychology. `craves` / `dreads` — what such a person wants and fears when
 * the GM wrote nothing of their own in the dossier.
 * (Whether they'll hear you again after a refusal is the GM's call — the
 * "after a no" stance of before 3.18 is gone: the user, 2026-11-14.)
 */
const SOCIAL_ARCHETYPES = [
  // ── Power — against people ──────────────────────────────────────────────────
  {
    id: "tyrant",
    label: "Tyrant",
    triad: "power",
    key: "heart",
    keyText: "Admiration. Feed the image they need — praise their judgement, ask as a favour, never as a demand — and they grant it to keep the mirror shining.",
    wall: "pressure",
    wallText: "A direct challenge or a threat. Force that pushes back triggers reactance: they dig in on principle.",
    price: { text: "Ask it as a favour — on your knee, where their people can see.", string: false },
    press: "An order in front of witnesses: obey, or lose face.",
    hurts: "frightened",
    audience: -2,
    audienceWhy: "never bend where their people can see",
    description: "Control-focused antagonist who resists force and bends only to praise.",
    hint: "Feed the ego, never confront it head-on. Flattery opens doors; threats slam them shut.",
    psych: "The authoritarian, power-hungry narcissist. Psychoanalysis reads the need for control as armour over a fear of being small; studies of ingratiation find praise works on the powerful even when they suspect it — which is how courts always handled kings.",
    craves: "Control and visible submission",
    dreads: "Looking weak in front of others",
    tells: [
      "Commands the room and interrupts freely",
      "Punishes defiance, rewards loyalty",
      "Never admits fault in public",
    ],
  },
  {
    id: "machiavellian",
    label: "Schemer",   // id stays "machiavellian" (saved data)
    triad: "power",
    key: "heart",
    keyText: "Your own weakness. Let them think they're winning — show a crack, concede something small — and they reach for the bait, showing you their plans as they do.",
    wall: "reason",
    wallText: "Logic and cross-examination. They keep their head, talk their way out, and read you while you read them.",
    price: { text: "A favour, to be named later.", string: true },
    press: "Help with a hook in it — a favour you'll pay for later.",
    hurts: "insecure",
    audience: -2,
    audienceWhy: "deal only behind closed doors",
    description: "A covert manipulator — patient, cynical, always three moves ahead.",
    hint: "Let them think they're winning. Show weakness and they reach for the bait; corner them with logic and they slip away.",
    psych: "Machiavellianism — one of the 'Dark Triad' traits (Christie & Geis's Mach scale): strategic, cynical, emotionally cool. High scorers feel little guilt and stay calm, even convincing, when cornered with questions.",
    craves: "Leverage and hidden advantage",
    dreads: "Being outplayed at their own game",
    tells: [
      "Answers questions with questions",
      "Trades favors, never gives them",
      "Watches the exits and weighs everyone",
    ],
  },
  {
    id: "duelist",
    label: "Duelist",
    triad: "power",
    key: "pressure",
    keyText: "A worthy challenge, before witnesses. Honour is the lever: dare them, and they must answer.",
    wall: "heart",
    wallText: "Pity, pleading or playing small. Weakness earns their contempt, not a lowered guard.",
    price: { text: "Earn it — best them at something first, in front of others.", string: false },
    press: "A public challenge: take it, or admit you're the lesser.",
    hurts: "angry",
    audience: 2,
    audienceWhy: "an audience turns it into a challenge they must answer",
    description: "A proud contender who must answer any worthy challenge — and despises cheap tricks.",
    hint: "Honor is the lever. A worthy challenge excites them; playing weak earns only contempt.",
    psych: "Wilhelm Reich's 'phallic-narcissistic' character: proud, competitive, made for an audience — and vindictive when shamed. Honour cultures run on the same rule: your face in public is everything.",
    craves: "A worthy opponent and public glory",
    dreads: "Being dismissed as unworthy",
    tells: [
      "Takes every dare personally",
      "Keeps score of slights and victories",
      "Despises trickery, loves an audience",
    ],
  },

  // ── Emotion — toward people ─────────────────────────────────────────────────
  {
    id: "martyr",
    label: "Martyr",
    triad: "attention",
    key: "pressure",
    keyText: "A cold demand. Say what's expected of them — flat, unmoved, no thanks and no audience for the sigh — and they do it, to be the one who always does. A threat only hands them a tormentor.",
    wall: "heart",
    wallText: "Sympathy and help. Warmth feeds the martyrdom; they push it away and suffer louder.",
    price: { text: "Say out loud what it costs them — and let them remind you of it.", string: true },
    press: "“After everything I've done for you…” — your move becomes their wound.",
    hurts: "guilty",
    audience: 2,
    audienceWhy: "a sacrifice only counts if someone sees it",
    description: "Seeks attention through suffering and recoils from sympathy.",
    hint: "Sympathy feeds the martyrdom. Starve them of attention — it is the only currency they fear losing.",
    psych: "The masochistic (self-defeating) character of psychoanalysis — Irvin Yalom's 'help-rejecting complainer'. Suffering is how they keep people close: being SEEN to suffer matters more than being helped.",
    craves: "Witnesses to their suffering",
    dreads: "An empty room, an unmoved face",
    tells: [
      "Recounts their sacrifices unprompted",
      "Refuses help but resents its absence",
      "Suffers loudly, forgives publicly",
    ],
  },
  {
    id: "exalted",
    label: "Idol",   // id stays "exalted" (saved data)
    triad: "attention",
    key: "heart",
    keyText: "Adoration. Sudden, undivided warmth — the supply they cannot refuse.",
    wall: "pressure",
    wallText: "Criticism, or a joke at their expense. It isn't heard as information but as an attack — and answered with rage.",
    price: { text: "The credit is theirs — publicly, and you'll back the story.", string: false },
    press: "They steal the room — your words drown in their performance.",
    hurts: "insecure",
    audience: 2,
    audienceWhy: "perform generosity for the room",
    description: "Thrives on worship and resists attacks on their ego.",
    hint: "Worship works, criticism doesn't. They cannot resist adoration — or forgive doubt.",
    psych: "The histrionic, grandiose-narcissistic style: they live on admiration ('narcissistic supply'). Criticism isn't heard as information but as an attack — and answered with narcissistic rage.",
    craves: "Worship and recognition",
    dreads: "Being outshone",
    tells: [
      "Collects admirers and titles",
      "Retells old triumphs at any excuse",
      "Takes critique as betrayal",
    ],
  },
  {
    id: "caretaker",
    label: "Caretaker",
    triad: "attention",
    key: "heart",
    keyText: "Need and guilt. Make your hurt their responsibility and they move to fix it.",
    wall: "reason",
    wallText: "A cold bargain. Offer them a trade and you insult them — they give, they don't sell.",
    price: { text: "Let them do more than you asked — and owe them for it.", string: true },
    press: "Care you never asked for, that leaves you owing.",
    hurts: "guilty",
    audience: 0,
    audienceWhy: "give the same, whoever is watching",
    description: "Needs to be needed. Obligation and guilt move them; a bargain insults them.",
    hint: "They need to be needed. Make your hurt their responsibility and they move to fix it; offer them a bargain and you insult them.",
    psych: "The dependent character — John Bowlby's 'compulsive caregiving': worth is earned by being needed. High guilt-proneness: they feel responsible for everyone's pain.",
    craves: "Being needed",
    dreads: "A debt they cannot repay",
    tells: [
      "Feeds, mends and fixes before being asked",
      "Apologizes for other people's failings",
      "Cannot watch someone struggle alone",
    ],
  },

  // ── Order — away from people ────────────────────────────────────────────────
  {
    id: "dogmatic",
    label: "Zealot",   // id stays "dogmatic" (saved data)
    triad: "order",
    key: "pressure",
    keyText: "Shake their certainty, then hand them a higher law. Doubt is the crack; a greater authority is what they grab.",
    wall: "reason",
    wallText: "Argument. Logic is their fortress — they out-argue you chapter and verse. A bribe is an insult.",
    price: { text: "Swear to keep the rule — they'll hold you to your word.", string: true },
    press: "They quote the law and name your sin — you're an offender, not a partner.",
    hurts: "angry",
    audience: -2,
    audienceWhy: "can't be seen to bend the rule",
    description: "Trusts rules and ritual more than people — certainty is their armour, and doubt the crack in it.",
    hint: "Don't argue — logic is their home ground. Make them unsure, then hand them a higher rule to cling to. A bribe is an insult.",
    psych: "The obsessive character: rules, ritual and certainty hold anxiety at bay. Classic psychoanalysis names the obsessive's torment as doubt itself ('folie du doute') — and the relief as a higher rule to obey.",
    craves: "Order upheld and confirmed",
    dreads: "Not being sure",
    tells: [
      "Quotes rules, texts and precedents",
      "Distrusts exceptions and shortcuts",
      "Ritual first, reason second",
    ],
  },
  {
    id: "hermit",
    label: "Hermit",
    triad: "order",
    key: "reason",
    keyText: "A puzzle, or one precise question. Knowledge is the only trade they respect.",
    wall: "pressure",
    wallText: "Public pressure, shouting, a scene. They simply close the door.",
    price: { text: "A truth for a truth — tell them something real about yourself.", string: false },
    press: "Silence — then one precise question, straight into what hurts.",
    hurts: "hopeless",
    audience: -2,
    audienceWhy: "close up in a crowd",
    description: "Withdrawn and wary, they can be drawn out by clever reasoning.",
    hint: "Bring puzzles, not pressure. They open up for knowledge and shut down for shouting.",
    psych: "The schizoid character (Nancy McWilliams): withdrawn, observant, a rich inner life; the deepest fear is being engulfed or exposed — known while not knowing.",
    craves: "Understanding, without exposure",
    dreads: "Being known while not knowing",
    tells: [
      "Speaks little, observes everything",
      "Answers only well-posed questions",
      "Guards knowledge like treasure",
    ],
  },
  {
    id: "broker",
    label: "Broker",
    triad: "order",
    key: "reason",
    keyText: "A real deal. Make yes the profitable answer and they take it.",
    wall: "heart",
    wallText: "Sentiment. Feelings buy nothing in their ledger.",
    price: { text: "Pay — something of real value, here and now.", string: false },
    press: "A counter-price — or an old debt brought back to the table.",
    hurts: "hopeless",
    audience: -2,
    audienceWhy: "never deal with witnesses",
    description: "A pragmatist who trusts contracts over feelings and weighs every word for profit.",
    hint: "Everything is a trade. Put a real offer on the table; sentiment discounts nothing.",
    psych: "Erich Fromm's 'marketing orientation': people, favours and loyalty as goods on a market. Reciprocity — Cialdini's first principle of influence — is their native language.",
    craves: "Profitable terms, closed contracts",
    dreads: "A debt left unsettled in their books",
    tells: [
      "Reframes everything as a deal",
      "Names a price even for sentiment",
      "Keeps meticulous accounts",
    ],
  },
];

/**
 * ARCHETYPE_REACTIONS — how each nature VISIBLY gives way when the key turns
 * (its line in the roll card). 20 per type, all VEILED: they describe the
 * reaction and never name the nature, so they read as evidence, not answers.
 */
const ARCHETYPE_REACTIONS = {
  tyrant: [
    "A muscle jumps in their jaw — they hate that you saw it.",
    "Their voice drops, reaching for the authority that just slipped.",
    "For a heartbeat they're not the one in control, and it shows.",
    "They straighten, as if posture could take back the ground.",
    "Something imperious flickers and fails to hold.",
    "They glance at who else witnessed it — that matters to them most.",
    "Their knuckles whiten on nothing at all.",
    "An order half-forms on their lips and dies unspoken.",
    "They cover the lapse with command, a beat too late.",
    "The room was theirs a moment ago; they feel it tilt.",
    "They will remember that you did this — you can see the ledger open.",
    "A flash of something ungoverned, then the lid comes down.",
    "They reassert themselves loudly, which tells you it worked quietly.",
    "Their composure is a fist, and the fist just trembled.",
    "They hate needing to answer you at all.",
    "Contempt rises to hide something more like fear of losing hold.",
    "They speak over you — reclaiming the floor they just lost.",
    "The mask of command slips; beneath it is someone used to obedience.",
    "They measure the room's respect and find a coin missing.",
    "Whatever they are, they are not accustomed to being moved.",
  ],
  machiavellian: [
    "They don't flinch — they recalculate, and you see the gears move.",
    "A thin smile: they've already begun turning this to use.",
    "No shame in it, only a note taken for later.",
    "They concede the point the way a player sacrifices a piece.",
    "Their eyes go distant, redrawing the board around what you did.",
    "It costs them nothing to lose face they never valued.",
    "They file your move away with unsettling patience.",
    "A flicker of respect — you play, and they've noticed.",
    "They let you have it, which should worry you.",
    "Nothing wounds them; everything informs them.",
    "They're already three moves past this, and you're in none of them.",
    "A pause, not of hurt, but of arithmetic.",
    "They wear the hit like a coat they'll take off later.",
    "Their sincerity, whatever it was, was never on the table.",
    "You get the sense you've told them more than they told you.",
    "They smile as if you've handed them something useful. You have.",
    "Emotion crosses their face on cue, and never reaches the eyes.",
    "They yield the ground and mark exactly where it was.",
    "Whatever they feel, they've decided what to do with it already.",
    "They treat the wound as data, and you as its source.",
  ],
  duelist: [
    "Their chin lifts — you've made this a contest now.",
    "A grin with an edge: they respect the hit, and want the rematch.",
    "Pride flares hot; they'll answer this if it takes all night.",
    "They take it like a touch scored, already circling for the riposte.",
    "Something in them lights up — you've given them a fight worth having.",
    "They salute the blow, and mean it, and mean to return it.",
    "Blood up, they lean in rather than away.",
    "You've earned their full attention — a dangerous prize.",
    "They laugh, short and sharp, and square their shoulders.",
    "A wound to the pride is the one wound they'll chase.",
    "They'd rather lose gloriously than win quietly, and it shows.",
    "The insult delights them almost as much as it stings.",
    "They mark you now — a worthy opponent, to be beaten properly.",
    "Their honor stands up and demands satisfaction.",
    "You can see them rewriting this as the story where they win.",
    "They take the point on the chin and grin through it.",
    "Retreat isn't in them; they answer forward.",
    "The challenge lands, and they were starving for exactly this.",
    "They flush — not with shame, but with the thrill of a real match.",
    "Whatever they are, they cannot let a gauntlet lie.",
  ],
  martyr: [
    "They wear the wound like proof of something they always knew.",
    "A quiet, wounded sigh — of course it would come to this.",
    "They flinch, and there's something almost grateful in it.",
    "It lands, and they gather the hurt close like it belongs to them.",
    "Their eyes glisten — not broken, but confirmed.",
    "They forgive you before you've finished, which is its own weapon.",
    "The suffering settles on them like a familiar coat.",
    "\"It's alright,\" they say, and clearly mean the opposite.",
    "They collect the injury for the ledger of all they endure.",
    "A tremor, and beneath it something that wanted to be hurt.",
    "They make the wound noble, and you the one who should feel small.",
    "Their pain reaches for an audience, and finds you.",
    "You struck, and they thank you with their eyes for proving them right.",
    "Long-suffering settles over them, almost comfortable.",
    "They bleed quietly and loudly at once.",
    "They'd carry ten more of those, and want you to know it.",
    "The hurt confirms a story they tell themselves about the world.",
    "They yield, wearing the loss like a crown of thorns.",
    "Something in them feeds on being the one who takes the blow.",
    "Whatever they are, being wounded suits them too well.",
  ],
  exalted: [
    "Their poise wobbles — they need to be adored, and you didn't.",
    "A flicker of panic behind the radiant mask.",
    "They glance for the room's approval and don't find enough.",
    "The shine dims; they hadn't planned to be seen this way.",
    "They reach, almost, for the reassurance you withheld.",
    "Being less than dazzling frightens them more than the blow.",
    "They recover the smile a beat late, and the beat is everything.",
    "You denied them the mirror, and it stung worse than any barb.",
    "They fish for the compliment that isn't coming.",
    "The pedestal tips; you watch them fight to keep their footing on it.",
    "They need you to take it back, and hate that they need it.",
    "A crack in the performance, and panic that the audience saw.",
    "They preen to cover it, which only shows the wound.",
    "Their worth felt certain a moment ago; now it wobbles.",
    "They can bear anything but being ordinary, and you made them feel it.",
    "The applause in their head faltered, and they heard the silence.",
    "They turn the radiant face up a notch, straining now.",
    "You can see them counting who still admires them, coming up short.",
    "Their brightness has a brittle edge to it suddenly.",
    "Whatever they are, they cannot stand to shine any less.",
  ],
  caretaker: [
    "Their hands twist — the worry is for you even now.",
    "It lands, and instinct still turns them toward tending it.",
    "A wounded softness: they'd forgive you if you let them.",
    "They absorb it and immediately fret over the damage done.",
    "Guilt they didn't earn settles over them all the same.",
    "They ask if you're alright, and mean it, which disarms you both.",
    "Their first thought is still the wellbeing of the one who struck them.",
    "They make excuses for you before you've offered any.",
    "The hurt turns inward — surely they should have prevented this.",
    "They reach to smooth it over, needing to be needed even now.",
    "A flinch, then concern — for you, absurdly, for you.",
    "They carry the weight of everyone's feelings, yours included.",
    "They'd rather bleed than let the moment be uncomfortable for you.",
    "Something maternal and bruised rises up in them.",
    "They tend the wound as though it were someone else's.",
    "Their kindness doesn't waver; it just costs them more now.",
    "You see them deciding how to protect you from what you just did.",
    "The blow lands, and they apologize, which undoes you a little.",
    "They fold the hurt away so it won't trouble anyone.",
    "Whatever they are, they cannot stop caring for the one who wounds them.",
  ],
  dogmatic: [
    "A crack runs through the certainty, and it frightens them.",
    "They reach for the rule that should cover this, and grasp air.",
    "Their conviction wavers — the ground was supposed to be solid.",
    "They repeat the creed under their breath, steadying, not steady.",
    "Something they were sure of just moved, and they hate it.",
    "They look for the law that makes you wrong, and don't find it fast enough.",
    "Doubt is a stranger to them, and it just knocked.",
    "Their certainty was a wall; you found a loose stone.",
    "They cling harder to the doctrine, which tells you it slipped.",
    "The world had rules a moment ago; one just failed them.",
    "They flinch at the heresy of it more than the hurt.",
    "Their faith in the order of things takes the blow, not their pride.",
    "They recite what they believe, listening for it to sound true again.",
    "You unsettled the foundation, and they feel the structure sway.",
    "They need the world to make sense, and you made it stutter.",
    "A frightened rigidity — bend and they might break.",
    "They defend the principle as if it were their own skin. It is.",
    "The contradiction sits in them like a splinter they can't reach.",
    "They hate that a question can reach where a blade couldn't.",
    "Whatever they are, their certainty is the wound you found.",
  ],
  hermit: [
    "They retreat a step inward, resenting that you got this close.",
    "A guarded look — they'd hoped not to be reached at all.",
    "It lands where they thought no one still could.",
    "They fold further into themselves, exposed and disliking it.",
    "The solitude they armor in just cracked, and they feel the draft.",
    "They resent being seen more than being struck.",
    "You reached past a distance they keep for a reason.",
    "Their walls were built against exactly this, and one gave.",
    "They want to be left alone, and you refused, and it landed.",
    "Something long kept private just showed at the edges.",
    "They flinch from the contact more than the content.",
    "You made them present when they'd chosen to be absent.",
    "The reach itself offends them; that it worked, more so.",
    "They gather their quiet back around themselves, a beat too slow.",
    "They'd forgotten someone could get in. Now they'll remember.",
    "A hunted stillness — they dislike being found.",
    "The word reached the room they'd sealed off, and echoed.",
    "They answer from very far away, and the distance just shortened.",
    "You touched the part of them that keeps everyone out.",
    "Whatever they are, they did not want to be reached — and you reached.",
  ],
  broker: [
    "You can see them price it, adding the cost to some private ledger.",
    "A slow nod — they've booked this, and they'll settle it.",
    "It lands as a debit; they're already thinking terms.",
    "They weigh what it cost them, and what it might be worth.",
    "No feeling crosses their face, only arithmetic.",
    "They tally the exchange and find the balance changed.",
    "Everything is a transaction; you just made a deposit they'll return.",
    "They note the price and, more importantly, that you can charge it.",
    "A merchant's pause — recalculating what you're worth.",
    "They fold the hurt into a figure and move on.",
    "They'd sell you the reaction if it profited them.",
    "You've become a line item, which is how they respect you.",
    "They wonder aloud, almost, what this will cost you later.",
    "The blow converts instantly into leverage in their mind.",
    "They accept the loss like a fee, already pricing the recovery.",
    "Their poker face is a spreadsheet, and a cell just updated.",
    "They mark the debt and the creditor with the same glance.",
    "What moved them, exactly, was the math — and it moved.",
    "They treat the wound as a negotiation that isn't over.",
    "Whatever they are, they've already begun to make it pay.",
  ],
};

/**
 * ARCHETYPE_TELLS — observations that POINT at a nature without naming it
 * (flavour for a successful Read). 40 per type, all veiled.
 */
const ARCHETYPE_TELLS = {
  tyrant: [
    "They arrange the room — and the people in it — without noticing they do it.",
    "Every sentence ends where they decide it ends.",
    "They cannot bear an order questioned, even a small one.",
    "Their eyes go first to who holds the power in any room.",
    "They mistake obedience for love, and expect both.",
    "Praise soothes them instantly; defiance you can watch them file away.",
    "They test small commands to see who jumps.",
    "Comfort, to them, is being the one everyone waits on.",
    "There's a throne in how they sit, wherever they sit.",
    "They dread, above all, being made small in front of others.",
    "Their generosity always comes with a leash attached.",
    "They keep score of slights, and never forgive a public one.",
    "Weakness draws either their protection or their contempt — never nothing.",
    "They speak of loyalty the way others speak of air.",
    "A challenge to their authority lights something cold behind the eyes.",
    "They'd rather be feared and needed than liked and ignored.",
    "Flattery works on them even when they know it's flattery.",
    "Control slipping is the one thing that visibly frightens them.",
    "They gather people the way others gather assets.",
    "Underneath it all: a terror of the day no one obeys.",
    "They enter a room as if it had been waiting for them.",
    "Titles matter to them — theirs, and yours, and the gap between.",
    "They give orders as suggestions and expect them obeyed as orders.",
    "Blame flows downward from them, never up.",
    "They interrupt the way weather interrupts — without apology.",
    "Their patience is a favor they're extending, and they let you know it.",
    "They remember who bowed and who merely nodded.",
    "Disagreement, to them, is a kind of trespass.",
    "They stand where the light and the sightlines are best, always.",
    "They collect deference the way others collect compliments.",
    "A refusal doesn't anger them at once — it appalls them.",
    "They speak of \"my people\" and mean it possessively.",
    "They decide fast, and treat second-guessing as weakness.",
    "Their kindness arrives as largesse, from above.",
    "They watch how you treat the powerless, and judge accordingly.",
    "They keep others waiting to remind everyone who sets the clock.",
    "Their voice expects the room to quiet, and usually it does.",
    "They test loyalty with small, pointless demands.",
    "They trust a room they command, not one that merely likes them.",
    "Cross them once and you become a problem to be managed, not a person.",
  ],
  machiavellian: [
    "Every warmth they show has a purpose you can almost trace.",
    "They lie the way others breathe — smoothly, without tell, without cost.",
    "Shame seems to be a language they never learned.",
    "They watch you the way a player watches a board.",
    "Their sincerity arrives precisely when it's useful.",
    "They have no pride to wound — only plans to protect.",
    "You catch them pricing everyone's usefulness, including yours.",
    "Threats bore them; they've already planned around worse.",
    "They collect secrets the way others collect debts.",
    "Their kindness is real and rented at once.",
    "They fear only being outmaneuvered, and hide even that.",
    "They let insults pass, because grudges are inefficient.",
    "Loyalty, to them, is a tool with an expiry date.",
    "They're never quite where they seem to be standing.",
    "They admire competence and exploit it in the same breath.",
    "Nothing you feel is hidden from them; nothing they feel is shown.",
    "They'd betray you kindly, and expect you to understand.",
    "Every conversation leaves them holding more than they gave.",
    "Guilt and honor are levers to them, not chains.",
    "Underneath it all: the certainty that everyone is playing, so why not win.",
    "Their compliments are always specific — they've been paying attention for a reason.",
    "They ask questions they already know the answers to.",
    "They mirror your manner so smoothly you feel understood, not studied.",
    "Ideas seem to occur to you that they planted an hour ago.",
    "They keep a rival close and pleasant, the better to read them.",
    "Their manner shifts room to room, and none of them are the truth.",
    "They never seem to want anything, which is when they want the most.",
    "They remember the detail you forgot you told them.",
    "Silence is a tool they use as fluently as speech.",
    "They let others take the credit and quietly keep the leverage.",
    "They forgive publicly and adjust privately.",
    "Their anger, when it shows, is always chosen.",
    "They test a lie on you to see how you carry it.",
    "They befriend the overlooked — servants, clerks, the ones who see everything.",
    "They lose small deliberately to win large later.",
    "Gratitude, to them, is a debt they've just issued.",
    "They can hold two faces without a flicker between them.",
    "They never threaten what they can simply arrange.",
    "Your secrets feel safe with them, which is precisely the danger.",
    "They play so patiently you mistake it for having no game.",
  ],
  duelist: [
    "They can't let a challenge lie, even a foolish one.",
    "Their honor is a live thing that stands up when named.",
    "They'd rather lose a glorious fight than win a quiet one.",
    "Every room is measured for who might be worth beating.",
    "Praise of a rival makes them stand taller, jaw set.",
    "They keep their word to the point of ruin, because the word is everything.",
    "A slight to their skill wounds deeper than a slight to their person.",
    "They light up at open opposition; it's servility that bores them.",
    "Their courage is real and hungry for witnesses.",
    "They dread being thought a coward more than being hurt.",
    "They respect anyone who'll actually fight back.",
    "There's a scoreboard in their head, and pride keeps it.",
    "They mistake every disagreement for a duel, and enjoy it.",
    "Backing down is a kind of death to them.",
    "They'd forgive a blow far sooner than an insult to their nerve.",
    "Glory is oxygen; obscurity is the thing they truly fear.",
    "They circle a strong opponent the way others avoid one.",
    "Their vanity is about prowess, not beauty.",
    "You could bait them into anything shaped like a dare.",
    "Underneath it all: the need to prove, again, that they are not afraid.",
    "They'd rather face one worthy foe than a hundred easy ones.",
    "An underhanded victory tastes like ash to them.",
    "They keep their promises like debts of honor, because that's what they are.",
    "A worthy opponent gets their courtesy; a coward gets their contempt.",
    "They're restless in peace and calm in a crisis.",
    "Reputation is a living thing to them, tended daily.",
    "They spare the beaten, and remember who once spared them.",
    "They announce themselves — anonymity feels like hiding.",
    "They test their own limits for the joy of finding them.",
    "A dare works on them like a key in a lock.",
    "They despise a fight won by numbers or by trick.",
    "They keep score of their own failures more harshly than anyone's.",
    "Glory shared is glory doubled to them; glory stolen, unforgivable.",
    "They'd rather be beaten fairly than win by an angle.",
    "They meet insults with a smile and a raised chin.",
    "Their pride is armor and target both, and they know it.",
    "They'll defend a stranger just to prove the principle of it.",
    "They measure a person by how they lose, not how they win.",
    "Boredom is their enemy; a rival, their favorite gift.",
    "They want the story told true, especially the parts that cost them.",
  ],
  martyr: [
    "They keep a quiet tally of everything they've endured for others.",
    "Their sacrifices are never quite as silent as they claim.",
    "They'd rather suffer visibly than be spared quietly.",
    "Guilt slides off some people; on them it finds a hook every time.",
    "They forgive in a way that leaves you feeling worse.",
    "Being needed and being hurt feel, to them, almost the same.",
    "They dread being forgotten more than being wronged.",
    "There's a wound they display and a wound they hide, and both are real.",
    "Ignore them and watch the ache bloom into something like purpose.",
    "They collect slights the way others collect keepsakes.",
    "Their love comes wrapped in what it cost them.",
    "Praise makes them uneasy; pity, strangely, does not.",
    "They cast themselves as the one who gives and gives and is not seen.",
    "A cold shoulder wounds them — attention is the coin they starve for.",
    "They'd carry your burden and mention it forever, gently.",
    "Suffering, to them, is proof of goodness.",
    "They flinch from kindness that asks nothing in return.",
    "The role of the one wronged fits them like a tailored coat.",
    "They want, more than relief, to be witnessed in their hurt.",
    "Underneath it all: the fear that without their suffering, they'd be nothing.",
    "They refuse help just often enough for you to feel guilty offering.",
    "\"Don't worry about me\" is a sentence they deploy like a hook.",
    "They keep a private ledger of every kindness they gave unthanked.",
    "Their self-deprecation is fishing, and the bait is your reassurance.",
    "They'll take the smaller portion, and make sure you notice.",
    "Comfort makes them restless; hardship, oddly, steadies them.",
    "They frame their choices so any outcome leaves them the wronged one.",
    "They apologize for feeling hurt, which somehow hurts you more.",
    "They volunteer for the thankless task, then carry it like a cross.",
    "Being taken for granted is a wound they almost seem to seek.",
    "They remember every time they were overlooked, to the date.",
    "Their generosity always leaves a small, sharp obligation behind.",
    "They'd rather be pitied than helped, if it came to it.",
    "They tell the story of their sacrifice with practiced, weary modesty.",
    "They give until it hurts, and the hurt is the point.",
    "They test your love by how much of their suffering you notice unprompted.",
    "Neglect them and watch the self-sacrifice find fresh fuel.",
    "They wear exhaustion like a medal earned in your service.",
    "They forgive you loudly enough that the room hears the wound.",
    "Beneath the giving is a hunger to be, finally, chosen.",
  ],
  exalted: [
    "They check the room's reflection of themselves constantly.",
    "A compliment lands on them like sunlight; they turn to face it.",
    "Being ordinary is the one thing they cannot abide.",
    "Their confidence is real and dangerously thin.",
    "They perform even when they think no one's watching.",
    "Criticism they wave off too quickly to have not felt it.",
    "They need to be the most of something in every room.",
    "Adoration makes them pliable; you can watch it work.",
    "They dread the day the admiration stops more than any threat.",
    "Their self-worth is a currency printed by other people's eyes.",
    "They collect admirers and call them friends.",
    "A rival's praise costs them more composure than an insult would.",
    "There's a spotlight they carry and constantly adjust.",
    "They'd trade almost anything to feel exceptional again.",
    "Faint praise wounds them worse than open scorn.",
    "They mistake being seen for being loved.",
    "Their radiance dims the instant it goes unwitnessed.",
    "Flattery is the lever, and you can see the whole mechanism.",
    "They fear mediocrity the way others fear death.",
    "Underneath it all: a hollow that only applause can fill, and only briefly.",
    "They tell stories in which they are, always, the most vivid person present.",
    "Their appearance is a project, never quite finished.",
    "They notice the exact moment attention leaves them.",
    "Generosity, from them, is a performance that expects an audience.",
    "They name-drop the way others breathe, casually and constantly.",
    "Another's triumph, near them, curdles into something they hide badly.",
    "They rehearse spontaneity.",
    "They'd rather be envied than trusted.",
    "They fish for the compliment, then deflect it so you'll say it again.",
    "Their worst fear is a room that doesn't turn when they enter.",
    "They keep their best angle toward whoever matters most.",
    "They collect beautiful things, themselves foremost.",
    "Praise a rival in their hearing and watch the temperature drop.",
    "They mistake being watched for being valued, always.",
    "They give gifts that keep their name on your lips.",
    "Their laugh is pitched for the room, not the joke.",
    "They'd forgive cruelty sooner than indifference.",
    "Every surface is a little bit a mirror to them.",
    "They ration their vulnerability like a rare wine, for effect.",
    "Beneath the shine, a child still waiting to be told they're special.",
  ],
  caretaker: [
    "They tend to everyone's comfort before their own, reflexively.",
    "Their worth, to them, is measured in how much they're needed.",
    "Guilt and obligation reach them where nothing else can.",
    "They notice who's hurting in a room before anything else.",
    "Say you're fine and watch them decide, gently, that you're not.",
    "They'd rather be burdened than useless.",
    "Their kindness has a grip in it; being needed is the need.",
    "They dread being unnecessary more than being unloved.",
    "Duty, to them, is a rope they'll follow into any fire.",
    "They apologize for things that were never theirs to answer for.",
    "Withhold your wellbeing and you'll find you can steer them.",
    "They keep giving past the point of sense, and call it love.",
    "A debt named makes them move; they cannot leave one unpaid.",
    "Their care doesn't discriminate — even an enemy's suffering pulls at them.",
    "They fear, quietly, being a burden themselves.",
    "They mistake being indispensable for being safe.",
    "Their softness is real, and it is also how they hold on.",
    "Guilt-trip them and the guilt sticks, whether earned or not.",
    "They tend wounds to avoid tending their own.",
    "Underneath it all: the terror that if they stopped giving, they'd be left.",
    "They feed people — it's the first language they reach for.",
    "They remember your ailments better than you do.",
    "They hover, and call it making sure.",
    "Receiving a kindness visibly unsettles them.",
    "They over-function so no one else has to, then resent that no one does.",
    "They know everyone's troubles and share none of their own.",
    "\"Let me\" is their reflex, before you've even asked.",
    "They mediate every quarrel in the room, needed or not.",
    "They'd cancel their own plans without a second thought, and do.",
    "They keep the remedies, the blankets, the spare everything.",
    "A person in distress pulls them like a tide, even an enemy.",
    "They apologize for the weather, for the wait, for things no one owns.",
    "They measure a day by whether they were useful in it.",
    "They can't rest in a room where someone else is working.",
    "Their love language is labor, and they expect it read.",
    "They'll defend the one who wounded them, if that one is hurting.",
    "They tend to everyone's plate before touching their own.",
    "Ask nothing of them and watch them grow anxious.",
    "They carry other people's secrets like parcels they can't set down.",
    "Beneath the care, a quiet terror of the day they're not required.",
  ],
  dogmatic: [
    "They have a rule for everything, and reach for it under pressure.",
    "Certainty is their armor, and they never take it off.",
    "A contradiction in their creed unsettles them more than a threat.",
    "They quote the law — theirs — the way others cite feelings.",
    "Ambiguity visibly pains them.",
    "They'd rather be right than be happy, and are neither easily.",
    "Their world runs on principle, and principle does not bend.",
    "Point out where their doctrine fails and watch the ground go out.",
    "They mistake conviction for truth, sincerely.",
    "They dread doubt the way others dread the dark.",
    "Bribes and appeals to feeling bounce off; they answer only to the code.",
    "Their faith in the order of things is total, and brittle.",
    "They test the world against a rulebook only they can fully read.",
    "Heresy, to them, is worse than harm.",
    "They cling hardest to the belief that's cracking.",
    "Exploit the gap in their logic and it wounds like nothing else.",
    "Emotion, in an argument, they treat as a category error.",
    "They need the universe to be lawful, and defend that need fiercely.",
    "Consistency is their god, and hypocrisy their unforgivable sin.",
    "Underneath it all: the fear that the rules are just stories they chose.",
    "They divide the world cleanly into right and wrong, with no smudged middle.",
    "Exceptions offend them more than crimes.",
    "They cite an authority the way others cite experience.",
    "Their routines are sacred, and disruption reads as disrespect.",
    "They correct small errors compulsively, even harmless ones.",
    "They'd sooner lose a friend than concede a principle.",
    "Grey areas make them reach for a firmer rule.",
    "They keep their word rigidly, expect the same, and are often disappointed.",
    "They mistake certainty for character.",
    "They test new people against the code before trusting them at all.",
    "Hypocrisy, in others, is the sin they cannot forgive.",
    "They quote the same handful of truths for every occasion.",
    "Doubt, when it comes, they treat as an enemy to be argued down.",
    "They prefer a harsh rule kept to a kind exception made.",
    "Their moral map has no blank spaces, which is its own kind of tell.",
    "They flinch at a joke that treats the sacred lightly.",
    "They'd rather be consistent than merciful.",
    "New evidence unsettles them more than it persuades them.",
    "They defend the letter of a thing when the spirit has fled it.",
    "Beneath the certainty, a horror of a world with no rules at all.",
  ],
  hermit: [
    "They keep a careful distance, and notice when it closes.",
    "Company seems to cost them something visible.",
    "They answer as if from behind a door left barely ajar.",
    "Solitude isn't loneliness to them; it's safety.",
    "They've thought too long alone, and it shows in odd certainties.",
    "Emotional pressure slides off; it's intrusion they can't abide.",
    "They dread being known more than being disliked.",
    "Their walls are old and well-kept.",
    "Reach for them and feel them lean away by reflex.",
    "There are gaps in what they know of people, from staying apart.",
    "They guard their inner rooms like a miser guards coin.",
    "Being drawn out costs them; you can see the reluctance.",
    "They prefer the company of ideas to the company of eyes.",
    "Loud feeling makes them retreat, not respond.",
    "A clever question reaches them where a warm one never could.",
    "They fear the crowd more than the blade.",
    "Their quiet is a fortress, not a mood.",
    "They've half-forgotten how to be reached, and dislike remembering.",
    "What they want, mostly, is for you to leave the door alone.",
    "Underneath it all: a wound that taught them people cost too much.",
    "They speak rarely, and precisely, as if words were expensive.",
    "Small talk visibly exhausts them.",
    "They watch from the edges of a gathering, rarely the center.",
    "They've made themselves self-sufficient to the point of loneliness.",
    "Touch, even friendly, makes them go still.",
    "They keep few possessions, and know exactly where each one is.",
    "They answer a personal question with a fact.",
    "Crowds read to them as noise, not warmth.",
    "They've had long conversations with no one but themselves.",
    "They notice everything and volunteer nothing.",
    "Their home, whatever it is, is a border more than a place.",
    "The directions they give to their inner life always end in a wall.",
    "They'd help you gladly, and prefer you didn't stay.",
    "They ration company like water in a dry season.",
    "Their opinions are strange and firm, aged in isolation.",
    "Warmth aimed at them lands like a spotlight they didn't ask for.",
    "They leave gatherings without goodbyes, slipping the seam.",
    "They trust the quiet, and distrust anyone who fills it too easily.",
    "A locked door, to them, is a comfort, not a barrier.",
    "Beneath the solitude, an old proof that closeness ends in cost.",
  ],
  broker: [
    "They see every relationship as an account, open or settled.",
    "Favors, to them, are never free and never forgotten.",
    "They price things — and people — automatically.",
    "Greed isn't the word; it's the ledger that must balance.",
    "Offer a deal and watch their whole attention arrive at once.",
    "They collect leverage the way others collect grudges — coolly.",
    "Sentiment they treat as a line item, deductible.",
    "They dread being in someone's debt more than being disliked.",
    "Everything is negotiable to them, which is its own kind of tell.",
    "They remember what everyone owes, to the coin.",
    "A better offer will move them where no appeal ever could.",
    "They keep books on friendships.",
    "Their loyalty has a price, and they're not ashamed of the figure.",
    "Emotion in a negotiation strikes them as an amateur's mistake.",
    "They'd sell an advantage they didn't need, to keep the market moving.",
    "Threats they weigh; bargains they savor.",
    "They trust arithmetic over affection, every time.",
    "You can buy almost anything from them except a bad trade.",
    "Pure feeling bounces off; a contract gets through.",
    "Underneath it all: a belief that everything, in the end, has a price.",
    "They open every conversation by finding out what you want.",
    "A free gift makes them suspicious — nothing is free in their world.",
    "They hedge every promise with a quiet condition.",
    "They read a person's worth as fast as others read a face.",
    "Information is the only currency they never stop collecting.",
    "They keep their options open the way others keep their word.",
    "A handshake, to them, is a signature.",
    "They never make the first offer if they can help it.",
    "They remember favors owed to the day and the coin.",
    "They'd rather be respected than liked — respect trades better.",
    "They price their loyalty openly and honor it exactly to the figure.",
    "They treat a threat as a negotiating position, not an insult.",
    "They know what everyone in the room is worth, and to whom.",
    "Sentiment they'll rent you, gladly, at market rate.",
    "They deal even with enemies — especially with enemies.",
    "They keep the terms in their head and the smile on their face.",
    "They never burn a bridge they might toll later.",
    "A good bargain pleases them more than a compliment ever could.",
    "They test your price early, with something small.",
    "Beneath the ledger, a conviction that trust, unpriced, is just risk.",
  ],
};

// <READ_HINTS>
/**
 * READ_HINTS — what the players SEE when a Read answers a question about this
 * person: twenty lines for each nature and each question (the user,
 * 2026-11-14: «Дай на кожен архетип, підклас і підказку по 20 стандартних
 * фраз-підказок на наш інсайт на випадок якщо в чаршиті пусто, щоб гравцям
 * було від чого відштовхуватися»). All VEILED, like the signs: they show the
 * thing and never name the nature. For what they hide (Desire, Fear, Price)
 * the line is the hint the players name it from; for what is told straight
 * (key, wall, witnesses) it is how the answer looks in the scene; for "what
 * are they after?" with no Agenda written, it is the answer. English lines are
 * the keys — each client reads them in its own language (i18n-uk.js).
 */
const READ_HINTS = {
  tyrant: {
    desire: [
      "Their eyes rest longest on whoever bows lowest.",
      "They let a silence run until someone else fills it with an apology.",
      "A servant asks leave to speak, and something in their face settles.",
      "They rearrange where people stand before the talk may begin.",
      "They repeat an order they have already seen obeyed, just to watch it obeyed again.",
      "The word \"permission\" comes up more often than the matter itself.",
      "They watch your hands, not your face, when you agree with them.",
      "They ask who else knows — and whether those people asked first.",
      "A lowered gaze from across the room earns a small nod of theirs.",
      "They correct the title you used for them, gently, and wait to hear it again.",
      "They keep the only chair in the room.",
      "When you thank them, they wait, as if the thanks were not finished.",
      "They ask what you would do if they said no — and enjoy the answer.",
      "Their people move before the order is finished, and they notice who was last.",
      "They speak of the city as something that sits in their palm.",
      "They leave you standing a moment longer than courtesy needs.",
      "A door opens only after they have glanced at it.",
      "They ask you to say it again, slower — the part where you ask.",
      "They smile only once: when someone kneels to pick up what they dropped.",
      "Everything they offer comes with the words \"I allow\".",
    ],
    fear: [
      "A stifled laugh somewhere behind them, and their hand closes into a fist.",
      "They glance at their own guards before answering a hard question.",
      "Someone speaks over them, and for a breath they have no words at all.",
      "They will not sit while anyone taller stands near.",
      "A slip of the tongue, and they look to see who heard it.",
      "They send the room away before they ask you for anything.",
      "The story of a ruler who was laughed at is the one they cut short.",
      "Their voice rises only when their own people are listening.",
      "They ask twice whether the doors are shut.",
      "A stumble on the step, and they blame the step, loudly.",
      "They cannot leave a doubt unanswered while a servant is in the room.",
      "You mention how it would look, and they stop arguing about what it is.",
      "They keep their back to the wall and their people in front of them.",
      "A child points at them, and the whole court holds its breath with them.",
      "They rehearse a refusal under their breath before giving it.",
      "They ask who told you they might agree.",
      "An empty place at their table is explained to you before you ask.",
      "The word \"weak\" makes them look at the nearest witness, not at you.",
      "They would rather lose the thing than be seen handing it over.",
      "When their order is questioned, their eyes count the faces in the room.",
    ],
    price: [
      "They look at the floor in front of you, then at their guards, and wait.",
      "\"People give me things on their knees,\" they remark, to no one.",
      "They ask how you would word it if you were asking a favour.",
      "They mention, twice, that the hall will be full tomorrow.",
      "They gesture for more people to come in before you go on.",
      "A petitioner before you bowed deep and got what he came for; they make sure you saw.",
      "They do not name a sum — they name a posture.",
      "\"Ask me properly,\" they say, and settle back to watch.",
      "Their steward quietly clears a space on the floor before the dais.",
      "They speak of gifts and of tribute, and the difference seems to matter.",
      "They want to hear the word \"please\" where their captains can hear it too.",
      "They turn their ring toward you, as if it were waiting for something.",
      "\"It costs nothing,\" they say, \"but your pride.\"",
      "They ask whether you have ever knelt to anyone.",
      "The coin you offer is pushed back across the table, untouched.",
      "They wait for the room to fall quiet, so everyone hears you ask.",
      "They tell you who else begged for this, and how well.",
      "A cushion lies before their seat; they glance at it, then at you.",
      "They would give it gladly — as a mercy, never as your due.",
      "\"Show them how one asks,\" they say, with a nod at their court.",
    ],
    key: [
      "A word of praise for their judgement, and their shoulders come down.",
      "You ask it as a favour, and they lean toward you for the first time.",
      "They repeat your compliment to the room, a little louder.",
      "Their voice warms when you say only they could decide this.",
      "An admiring question, and they answer at twice the length.",
      "They wave the guards back a step when you speak of their wisdom.",
      "You name what they built, and they begin to show it to you.",
      "A flattering word, and the refusal they had ready is put away.",
      "They pour you wine themselves after you call them generous.",
      "They ask what others say of them, and are pleased to be told.",
      "Gratitude given in advance makes them want to deserve it.",
      "You admire the portrait, and the audience runs long.",
      "They grant small things freely to whoever thanks them well.",
      "The harder face softens when you speak as one who looks up.",
      "They finish your praise for you, modestly, and then agree.",
      "You ask their advice first, and the matter is half won.",
      "They keep you close after you say their people love them.",
      "An honest admiration disarms them faster than any argument.",
      "They like to be asked — and it shows in how quickly they answer.",
      "Called merciful, they look for a mercy to give.",
    ],
    wall: [
      "At the first hard word their chin lifts and the room goes cold.",
      "A threat makes them smile — the wrong kind of smile.",
      "You push, and they stop listening and start counting your offences.",
      "\"Or else?\" they repeat, and call the guards a step closer.",
      "A demand turns their maybe into a no they will defend to the end.",
      "They rise from the seat when you raise your voice.",
      "Challenged, they would sooner burn the thing than hand it over.",
      "Their answers get shorter with every ounce of pressure.",
      "You name a consequence, and they name a worse one.",
      "They repeat your threat to the room, so everyone knows what you dared.",
      "Shame makes them cruel, not sorry.",
      "They dig in on a point they did not care about a minute ago.",
      "An ultimatum is answered with the door — yours.",
      "They let you finish the threat, then ask if that was all.",
      "The more you force it, the more it becomes a matter of principle.",
      "They look past you, to their captain, the moment you press.",
      "A raised hand of yours, and every blade in the hall is half drawn.",
      "They quote your hard words back at you, colder.",
      "Cornered, they grow calm; it is not a good sign.",
      "They would rather be feared for refusing than thanked for giving in.",
    ],
    audience: [
      "They check who is listening before they answer.",
      "With their people in the room, every answer is a little harder.",
      "They agreed easily in the corridor; in the hall they frown at the same words.",
      "A captain steps in, and their half-smile is gone.",
      "They speak to you, but for the benefit of the benches.",
      "\"Not here,\" they say under their breath, and then louder: \"No.\"",
      "Alone, they asked your opinion; before the court they give you orders.",
      "They glance along the row of faces each time they concede a word.",
      "The more witnesses arrive, the straighter they sit.",
      "They wave the scribes out before saying anything kind.",
      "A yes of theirs is something no servant has ever seen given.",
      "They would bargain in a cellar and refuse in a throne room.",
      "Their eyes go to the gallery before they go to you.",
      "They cut you short the moment a second listener appears.",
      "In company they answer the rank, not the person.",
      "A whispered word gets further with them than a spoken one.",
      "They cannot be seen to change their mind; in private they just did.",
      "They rise to end the audience when the doors open wide.",
      "Every concession waits until the last witness has left.",
      "They ask you to walk with them — away from the others.",
    ],
    intent: [
      "They want you to ask — out loud, where it can be heard.",
      "They want it known that the decision is theirs alone.",
      "They are looking for someone to make an example of.",
      "They want to learn who sent you, and whether that one bows to them.",
      "They want this over before their rival hears of it.",
      "They mean to see how far you will bend before they answer.",
      "They want you in their debt by the time you leave.",
      "They want your name on their side, where others can see it.",
      "They are deciding whether you are a servant or a threat.",
      "They want the room to see you wait.",
      "They want something done that must not carry their seal.",
      "They mean to keep you here until someone else arrives.",
      "They want to hear you say they were right.",
      "They want to know what you fear — it is how they hold people.",
      "They are measuring whether you can be ordered, or only asked.",
      "They want a show of loyalty from someone, and you will do.",
      "They want the old insult paid for, by anyone at hand.",
      "They want you gone — but not before you have thanked them.",
      "They are testing whether their word still frightens.",
      "They want quiet in their house, and will pay for it in other people's pride.",
    ],
  },
  machiavellian: {
    desire: [
      "They ask what you know before they say what they want.",
      "A stray remark of yours is repeated back, slowly, as if being filed away.",
      "They brighten at the mention of someone else's secret.",
      "They offer help nobody asked for, and watch who takes it.",
      "Their questions circle one name and never land on it.",
      "They would rather hear who owes whom than what anything costs.",
      "A letter on the desk is turned face down, unhurriedly.",
      "They smile when two guests at the far table begin to quarrel.",
      "They keep you talking about yourself; the cup is refilled each time you stop.",
      "They collect small promises the way others collect coins.",
      "They ask what you would give to have it settled quietly.",
      "The door they stand by is the one everyone must pass.",
      "They never ask for the thing itself — only for what it would open.",
      "A debt mentioned in passing makes them look up from the page.",
      "They are glad to be underestimated, and help you do it.",
      "They want to know who you would rather not meet here.",
      "They trade a small truth of theirs for a larger one of yours.",
      "They leave a gap in the talk exactly where a confession would fit.",
      "When you hesitate, they lean in — hesitation is what they came for.",
      "They count the people in the room, and then the people each of those could reach.",
    ],
    fear: [
      "For a moment they do not have an answer ready, and it frightens them.",
      "They ask who taught you to play like that.",
      "You know something you should not, and their fingers stop moving.",
      "They laugh a beat too late at a joke about being fooled.",
      "They check the seal on a letter they sealed themselves.",
      "A plan of theirs is finished by someone else, aloud, and they go pale.",
      "They keep asking what you want, as if not knowing were unbearable.",
      "They watch your hands when you shuffle papers that are not yours.",
      "An unexpected kindness makes them look for the hook in it.",
      "They change seats so that no one sits behind them.",
      "\"Who else is in this?\" they ask, too lightly.",
      "The name of the one who once outwitted them is never spoken in this house.",
      "They go quiet when you answer a question they had not asked yet.",
      "They cannot stand a silence they did not arrange.",
      "A servant they do not recognise makes them stop mid-sentence.",
      "They ask to see the contract again, though they wrote it.",
      "They hate a game whose rules they learn last.",
      "You smile as if you knew, and they begin to wonder what.",
      "They test every gift for what it is meant to buy.",
      "They would forgive an enemy sooner than someone who saw through them.",
    ],
    price: [
      "\"Nothing now,\" they say. \"One day I'll ask you for something.\"",
      "They write nothing down, and remember everything.",
      "They wave the coin away and ask for your word instead.",
      "A favour, they explain, is worth more when it has no date on it.",
      "They ask where you can be found, a year from now.",
      "\"We'll call it a kindness between friends,\" they say, and do not smile.",
      "They want your name in their ledger, in your own hand.",
      "They tell you about the last person who owed them, and how gladly that one paid.",
      "They name no price, and somehow that is the price.",
      "They ask what you are good at, as if taking stock.",
      "\"You'll know when I need it,\" they say, already turning away.",
      "They would rather have you owing than paid up.",
      "They ask for a small thing, so that asking for a larger one will come easier.",
      "The door is held open for you, and they tell you it will not always be.",
      "They offer more than you asked for, and note that you accepted.",
      "\"Let's not speak of payment,\" they say, which is how they speak of it.",
      "They ask who else you are indebted to, and seem to weigh the queue.",
      "A token is pressed into your hand: you are to return it when asked.",
      "They do it at once — and the speed of it feels like a hook.",
      "They want one promise, unnamed, and they want it before you leave.",
    ],
    key: [
      "You admit you are out of your depth, and they relax into the chair.",
      "A small concession of yours, and they start explaining how things really work.",
      "They show a card they did not need to show, to enjoy your surprise.",
      "Let them win a point, and they hand you two without noticing.",
      "Your worry is plain on your face, and they hurry to offer a way out.",
      "They grow generous the moment they believe you need them.",
      "You ask them to teach you, and the lesson gives away the plan.",
      "A crack in your voice, and they reach for it like a hand for a purse.",
      "They cannot resist finishing the move for someone who fumbles it.",
      "Seeming helpless gets further with them than seeming clever.",
      "They boast, a little, when they think the game is already theirs.",
      "You let them correct you, and they correct you right into what you wanted.",
      "Their guard drops with the last of your pride.",
      "They take the bait because it flatters their skill.",
      "\"Poor thing,\" they say — and tell you what no one was meant to hear.",
      "An honest fear of yours buys more than a clever lie.",
      "They explain the trap to you, so sure you are already in it.",
      "You ask for mercy, and they are too pleased to refuse.",
      "They move their best piece forward once you seem beaten.",
      "Being needed by a weaker player is the one sweetness they allow themselves.",
    ],
    wall: [
      "You lay out the facts, and they rearrange them into a different story.",
      "Every question of yours is answered with a better one.",
      "Cross-examined, they become calmer, almost fond.",
      "They agree with your logic, step by step, into the opposite conclusion.",
      "You catch a contradiction; they thank you and use it.",
      "An argument is a game they have played longer than you.",
      "They watch you reason, and learn more from that than from your words.",
      "Proof is weighed, admired, and set aside.",
      "The tighter your case, the wider their smile.",
      "They concede the point and keep the prize.",
      "Pinned by a question, they answer a different one, beautifully.",
      "They ask you to define your terms, and you never get them back.",
      "Your offer is examined for what it says about your position.",
      "They would rather lose an hour in debate than give a straight reply.",
      "They let you prove it, then ask who you have proved it to.",
      "Each clever point of yours costs you something they now know.",
      "They are never more themselves than when being questioned.",
      "The trap in your reasoning is found before you close it.",
      "They nod along to the terms and leave with better ones.",
      "\"Interesting,\" they say, and you have just been read.",
    ],
    audience: [
      "They say nothing of substance until the last servant has left.",
      "In company they are charming and agree to nothing.",
      "\"Shall we walk?\" they ask, the moment the talk turns real.",
      "They lower their voice when a third person comes within earshot.",
      "A crowded room makes them vague; a closed one makes them precise.",
      "They speak in pleasantries until the door clicks shut.",
      "Witnesses are for other people's promises, never their own.",
      "They would not be seen wanting anything.",
      "With others watching, their answer is always \"we shall see\".",
      "They take your arm and steer you to the window, away from the table.",
      "An audience turns their yes into a pleasant nothing.",
      "They keep the real offer for the carriage ride.",
      "A listener at the door, and the talk becomes about the weather.",
      "They deal the way others pray: alone, and in a low voice.",
      "Asked in public, they laugh it off; asked in private, they name terms.",
      "They glance at the gallery and change the subject.",
      "What is said before others, they treat as never said.",
      "They leave the feast early, and let you know which door.",
      "They are generous with words in a hall and with deeds in a cellar.",
      "They wait for the music to start before they answer you.",
    ],
    intent: [
      "They want to learn what you know, and give nothing for it.",
      "They want you owing them before the night is over.",
      "They are finding out whose side you are on, without asking.",
      "They want you to carry a word to someone, believing it your own idea.",
      "They are stalling until a messenger comes back.",
      "They want two of their rivals at each other's throats, and you between them.",
      "They mean to find what you would lie about.",
      "They want this conversation never to have happened.",
      "They want to be the one you come to next time.",
      "They are testing whether you can keep a secret, with one that does not matter.",
      "They want to know who else has asked.",
      "They mean to leave with more than they came with, whatever is agreed.",
      "They want you to think you won.",
      "They are looking for the one thing you cannot afford to lose.",
      "They want a favour they can call in at the worst possible hour.",
      "They want to see who you look at when you are unsure.",
      "They want your trust — it spends better than coin.",
      "They are deciding whether you are a piece or a player.",
      "They want the blame for something to land elsewhere.",
      "They want to hear the offer you have not made yet.",
    ],
  },
  duelist: {
    desire: [
      "They size up everyone who enters, and look bored by most.",
      "Their hand finds the hilt whenever a famous name is spoken.",
      "They ask who the best is here — and whether that one would accept.",
      "An old scar is shown like a medal, with the story of who gave it.",
      "They brighten when you refuse to step aside.",
      "They ask whether anyone will be watching.",
      "An easy win leaves them sour for the rest of the evening.",
      "They know by name everyone who has ever bested them.",
      "Talk of a tournament pulls them forward in the chair.",
      "They toast an enemy who fought well, and mean it.",
      "They look for the crowd before they look for the exit.",
      "They ask what you are best at, hoping it is the same thing.",
      "Praise for a rival stings them into wanting a rematch.",
      "They keep a trophy where every visitor must pass it.",
      "A fair fight offered is the only gift that makes them smile.",
      "They would cross the city to be told they were the better one.",
      "They tell the tale of their hardest fight, and it is the one they nearly lost.",
      "Their eyes follow whoever moves well.",
      "They ask whether songs are made about people like you.",
      "An equal is rarer to them than a friend, and wanted more.",
    ],
    fear: [
      "You look past them at someone else, and their jaw sets.",
      "Being told \"not worth my time\" is the one thing they cannot laugh at.",
      "They stiffen when a veteran calls them \"child\".",
      "A challenge of theirs goes unanswered, and they repeat it louder.",
      "They cannot bear to be the one nobody remembers from the fight.",
      "A yawn from across the table lands harder than an insult.",
      "They ask twice whether their name was mentioned.",
      "When you decline to compete, they look almost wounded.",
      "Someone offers to \"go easy\", and the cup cracks in their grip.",
      "They hate a victory handed over more than any defeat.",
      "They keep glancing at the one person here who did not greet them.",
      "\"Who?\" asked about them in earnest drains their colour.",
      "They would take a beating over a shrug.",
      "A list of champions read aloud, and they wait for a name that does not come.",
      "They bristle when thanked for \"trying\".",
      "Pity in someone's eyes makes them reach for a blade.",
      "They ask if their old rival ever speaks of them.",
      "The seat at the lower table is refused before it is offered.",
      "They cannot stand to be watched by no one.",
      "An opponent turns their back mid-challenge, and something in them breaks.",
    ],
    price: [
      "\"Beat me at something first,\" they say, and clear the table.",
      "They ask what you can do that they cannot.",
      "They push the purse back and nod toward the yard.",
      "\"Earn it,\" they say, loud enough for the room to hear.",
      "A pair of practice blades is brought out before you finish asking.",
      "They name no sum — they name a contest.",
      "They want it done where people can see who won.",
      "They ask who here would vouch that you are worth the bout.",
      "They offer you the choice of game, and seem to mean it.",
      "\"I give nothing to those I have not measured,\" they say.",
      "They roll a sleeve, set an elbow on the table, and wait.",
      "The favour is yours, they say, if you are still standing after.",
      "They would lose gladly, as long as it was a real fight.",
      "A wager is proposed, and the stake is your request.",
      "They call the others over to watch before they hear the rest.",
      "\"Show me,\" is all they answer.",
      "They respect a price paid in sweat; gold bores them.",
      "They ask what you are willing to risk for it, in front of everyone.",
      "The door stays shut until someone has been tested.",
      "They point at the mark on the far wall and hand you a knife.",
    ],
    key: [
      "A dare makes them grin before you have finished it.",
      "\"Unless you can't,\" you say — and they are already on their feet.",
      "A hard word, said to their face, wakes them up.",
      "They answer a challenge the way others answer a greeting.",
      "You refuse to lower your eyes, and they like you for it.",
      "Told it cannot be done, they ask where and when.",
      "An open threat is taken as an invitation.",
      "They lean in when the talk turns rough.",
      "Shame them before the hall, and they will do the thing to prove you wrong.",
      "They respect a demand; a request makes them shrug.",
      "You name the stakes aloud, and they double them.",
      "A slap of the glove on the table gets you their whole attention.",
      "They cannot leave \"prove it\" unanswered.",
      "Push, and they push back with something like joy.",
      "They trust a person who will stand up to them.",
      "Honour invoked, and they have no way to say no.",
      "They warm to whoever calls them out by name.",
      "A cold stare is met, held, and then saluted.",
      "The harder you come at them, the more they listen.",
      "\"Anyone can refuse,\" you say, and they agree out of spite.",
    ],
    wall: [
      "A plea makes their lip curl.",
      "You speak of your troubles, and they look for someone else to talk to.",
      "Tears earn you a turned shoulder.",
      "They hear \"please\" as \"I am beneath you\" — and agree.",
      "Flattery slides off them; they have heard it from losers.",
      "You play small, and they treat you as small.",
      "An appeal to pity ends the audience.",
      "They have no patience for a soft voice.",
      "Kind words make them suspect a trick.",
      "Beg, and whatever respect they had for you is spent.",
      "They wave away your gratitude as if it were smoke.",
      "A trembling hand is the last thing they will bargain with.",
      "Charm leaves them cold; they have a mirror for that.",
      "They would rather be cursed than cried at.",
      "You ask for mercy, and they hear an insult to the fight.",
      "Sympathy offered to them is handed back like a bad coin.",
      "They stop listening at the first sigh.",
      "A weak excuse is punished harder than a bold lie.",
      "They turn to the window while you plead.",
      "The softer you come, the harder they get.",
    ],
    audience: [
      "A crowd gathers, and they stand a little taller.",
      "With people watching, a no becomes impossible for them.",
      "They repeat your words for the benches: \"You all heard that.\"",
      "Alone they shrug; before the hall they accept.",
      "They look for witnesses before they answer a dare.",
      "The louder the room, the bolder their promises.",
      "An audience turns your request into a challenge they must meet.",
      "They wave more people in: \"Let them see.\"",
      "In private they are almost reasonable; in public, magnificent.",
      "They cannot be seen backing away, and everyone knows it.",
      "Their answer comes quicker when the gallery leans in.",
      "They would refuse you in a corridor and oblige you in a square.",
      "Someone starts to chant their name, and the matter is decided.",
      "They speak to the back row as much as to you.",
      "A dare made quietly is a dare they can ignore.",
      "They take the floor the moment there is a floor to take.",
      "With eyes on them they keep their word to the letter.",
      "They ask you to say it again, for those who came late.",
      "An empty hall takes the fire out of them.",
      "They bow to the room before they answer you.",
    ],
    intent: [
      "They want to know if you are worth their time.",
      "They are looking for a reason to test you.",
      "They want the room to see them win something tonight.",
      "They want an old slight answered, and you will serve.",
      "They are waiting for someone here to make the first move.",
      "They want a rival's name dragged into the talk.",
      "They mean to find out how you stand when pushed.",
      "They want a story worth telling by morning.",
      "They are bored, and want you to cure it.",
      "They want to be asked for the hard thing, not the easy one.",
      "They want to see who flinches.",
      "They are deciding whether you are an opponent or an audience.",
      "They want their honour seen to be whole.",
      "They want to hear what is said about them elsewhere.",
      "They want to settle it now, in front of whoever is here.",
      "They are measuring your friends as much as you.",
      "They want a second for a quarrel that is coming.",
      "They want you to stop being polite.",
      "They want proof that the tales about you are true.",
      "They want something that cannot be bought, and are hoping you brought it.",
    ],
  },
  martyr: {
    desire: [
      "They sigh, and then check whether anyone heard.",
      "They tell you how little they slept before you have asked how they are.",
      "The heaviest tray is theirs, carried where the whole room can see.",
      "They list what they gave up, in the order it hurt.",
      "They wave thanks away, and wait for it to be offered again.",
      "They sit in the draught and mention the draught.",
      "A bandaged hand rests on the table, palm up.",
      "They want you to know it was no trouble, at length.",
      "They linger in the doorway until someone asks what is wrong.",
      "They speak of their burdens in the voice others keep for prayers.",
      "They keep count of every favour, and recite it without being asked.",
      "They choose the hardest chair and decline a cushion twice.",
      "Their smile is brave, and held a little too long.",
      "They ask who will notice when they are gone.",
      "The story they return to is always the one where they suffered for others.",
      "They do the work no one wants, slowly, in the middle of the room.",
      "They brighten when a newcomer asks about the scar.",
      "\"Don't mind me,\" they say, and stay exactly where they will be minded.",
      "They want a witness more than they want relief.",
      "They pause before the worst part, to be sure you are listening.",
    ],
    fear: [
      "You look away mid-story, and they lose the thread entirely.",
      "An unmoved face makes them try the story again, sadder.",
      "The room empties, and their shoulders drop with no one to see.",
      "\"We managed without you,\" someone says, and they go white.",
      "They cannot bear a thank-you that ends the matter.",
      "They talk faster as you reach for the door.",
      "A shrug in answer to their sacrifice silences them for the evening.",
      "They ask if anyone has asked after them.",
      "They dread being told that it never cost them anything.",
      "Left to eat alone, they do not eat.",
      "They flinch when their trouble is called small.",
      "A helper who does it quicker and says nothing is their nightmare.",
      "They keep the candle lit, in case someone comes to see them wait.",
      "They cannot stand a yawn during the telling.",
      "\"Nobody asked you to,\" lands like a blow.",
      "Their voice thins when no one protests their leaving.",
      "They watch faces for the moment the pity fades.",
      "A cheerful room unsettles them more than a cruel one.",
      "They fear the day their pain is old news.",
      "They would rather be blamed than overlooked.",
    ],
    price: [
      "They wait for you to say what it will cost them — in so many words.",
      "\"You know what this means for me,\" they say, and pause for the answer.",
      "They will do it, once you have admitted how hard it is for them.",
      "They ask you to remember this, and seem to mean for a long time.",
      "They take no coin; they take your acknowledgement, aloud.",
      "\"Say it,\" they murmur, \"so I know you understand.\"",
      "They agree, and add that they will not let you forget it.",
      "A favour from them comes with a story you will hear again.",
      "They want it said before the others what they are giving up.",
      "They name the nights it will cost, one by one, and watch your face.",
      "\"I ask for nothing,\" they say; the look says otherwise.",
      "They will carry it — and remind you who is carrying it.",
      "The yes is given like a wound shown.",
      "They want a debt of gratitude, with no end date.",
      "They ask whether you will tell people what they did.",
      "\"After this,\" they say, \"you will owe me a little kindness.\"",
      "They do not bargain; they keep a tally.",
      "They would be paid in guilt, and count it carefully.",
      "They sigh the terms rather than speak them.",
      "They need to hear that no one else would have done it.",
    ],
    key: [
      "A flat order, with no thanks, and they are already rising to do it.",
      "You say only what is expected of them, and they nod like someone relieved.",
      "Cold duty moves them where warmth only feeds the sighing.",
      "\"It has to be done, and it is yours to do,\" gets no argument.",
      "They work fastest for the one who does not look impressed.",
      "An unmoved face makes them drop the performance and pick up the task.",
      "You refuse them an audience for the sigh, and the sigh stops.",
      "They respect a demand they can suffer under.",
      "Told plainly that it is their place, they take the place.",
      "A hard word steadies them; a soft one sets them off again.",
      "They do it for the one who expects it, to be the one who always does.",
      "No thanks offered, and somehow that is what they wanted.",
      "You name the task and turn away; behind you, they begin.",
      "Stern expectation gets a straight back and no speech.",
      "They cannot refuse a burden laid on them without ceremony.",
      "\"You know your duty,\" ends the conversation in your favour.",
      "The less you seem to care, the more they must show they do.",
      "A cool demand gives them the role they are best at.",
      "They stop bargaining when you stop sympathising.",
      "Pressed without anger, they yield without a scene.",
    ],
    wall: [
      "Your sympathy makes the list of their troubles longer.",
      "You offer to help, and they explain why no one can.",
      "A kind word is the cue for a second sigh.",
      "They push the offered cushion away and suffer louder.",
      "The warmer you are, the further the matter drifts from what you asked.",
      "Comfort is taken as proof that it is as bad as they said.",
      "They refuse your help, and resent you for not insisting.",
      "Pity feeds them; nothing gets done on that meal.",
      "You say you understand, and they tell you that you cannot.",
      "A gentle plea turns the talk to what they have already given.",
      "They weep a little, and your request is forgotten in the tending.",
      "Offered rest, they speak of everything rest would leave undone.",
      "Kindness makes them the wounded one, and you the one who owes.",
      "They cannot be thanked into it; thanks only starts the story.",
      "Your charm is met with a brave, tired smile and no answer.",
      "They take your hand, and your errand goes nowhere.",
      "An apology is accepted at length and changes nothing.",
      "The more you care, the more there is to care about.",
      "They turn every warm word into a debt you already owe.",
      "Soft-hearted asking gets you an evening and not the thing.",
    ],
    audience: [
      "With people watching, they give more than was asked, and say so.",
      "A full room makes their yes easier and their sigh louder.",
      "They wait for the others to gather before they agree.",
      "Alone they hesitate; before company they offer.",
      "\"Let it be known,\" they say, and then do it.",
      "They glance round to be sure the sacrifice is seen.",
      "An onlooker's gasp is worth more to them than your thanks.",
      "They take up the burden in the middle of the hall.",
      "In private the favour is small; in public it becomes a martyrdom, gladly.",
      "They speak up when the door is open and neighbours are passing.",
      "A sacrifice no one sees is one they put off.",
      "They choose the feast day for the hard thing.",
      "Asked before witnesses, they cannot be the one who said no.",
      "They let the crowd talk them into it, and look grateful.",
      "The more eyes on them, the nobler the giving.",
      "They repeat the cost for those at the back.",
      "An empty room gets a shrug; a chapel full gets a yes.",
      "They pause until everyone has turned to look.",
      "They would give you the coat off their back, if the street were watching.",
      "They ask you to stay for supper, so the others can hear it told.",
    ],
    intent: [
      "They want you to see what it costs them.",
      "They want someone to stay and listen a while longer.",
      "They are waiting for you to ask what is wrong.",
      "They want it remembered who held this house together.",
      "They want you to feel you could have come sooner.",
      "They mean to be asked, so that giving is a gift and not a duty.",
      "They want a hard task with their name on it.",
      "They are looking for someone to be grateful.",
      "They want the others to notice how tired they are.",
      "They want to be told they have done enough — and not to believe it.",
      "They want you to refuse their help, so they can insist.",
      "They are keeping you here: an empty evening frightens them.",
      "They want an old sacrifice of theirs spoken of again.",
      "They want to carry your trouble, visibly.",
      "They want someone to say \"you shouldn't have\".",
      "They are finding out whether you would do the same for them.",
      "They want a reason to stay up waiting.",
      "They want you to leave owing them a visit.",
      "They want no one to think they complained.",
      "They want to be needed for the worst of it.",
    ],
  },
  exalted: {
    desire: [
      "They pause after every clever line, waiting for the room.",
      "Their eyes go to whoever has not looked at them yet.",
      "They know which seat catches the light.",
      "A compliment is accepted like rent that was due.",
      "They ask what people are saying about last night.",
      "They tell the story of their triumph, and add a detail each time.",
      "Their laugh is aimed at the far end of the hall.",
      "They touch the medal at their collar when the talk drifts elsewhere.",
      "They want to know if a song has been written yet.",
      "They glow when a stranger knows their name.",
      "They repeat the kindest thing ever said of them as if quoting scripture.",
      "They turn their good side to the door.",
      "An admirer's letter is left open on the table.",
      "They would rather be adored by ten than obeyed by a hundred.",
      "They ask you what you thought, and wait for only one answer.",
      "They linger where the applause was loudest.",
      "Their portrait hangs opposite the entrance.",
      "They forgive anything said by someone who is looking up at them.",
      "They enter last, so that the room is already full.",
      "They hunger for the moment a crowd says their name together.",
    ],
    fear: [
      "Someone else is praised, and their smile holds a breath too long.",
      "They ask who that newcomer is, lightly, three times.",
      "The room turns toward another voice, and they talk over it.",
      "A younger face in the doorway makes them check the mirror.",
      "They cannot stay in a room where they are not the story.",
      "They count the guests at a rival's table.",
      "A joke that lands better than theirs sours the evening.",
      "\"Before your time,\" someone says, and they go very still.",
      "They hate the quiet after a line that did not land.",
      "They move to stand between you and whoever you were admiring.",
      "Their hands shake a little when the applause is for the wrong person.",
      "They ask whether the other one was really that good.",
      "A forgotten title makes them correct you at once.",
      "They leave early from any feast they do not host.",
      "The old programme with their name at the top is kept under glass.",
      "They need to hear that no one has replaced them.",
      "They watch the door as if someone brighter might walk in.",
      "A crowd cheering in the next street draws them to the window, frowning.",
      "They dread the word \"once\".",
      "They cannot bear to be second on any list.",
    ],
    price: [
      "\"And you'll tell them it was my doing,\" they say, already pleased.",
      "They want their name spoken first when the tale is told.",
      "They ask where you will stand when they announce it.",
      "The favour is free; the credit is not.",
      "They rehearse, aloud, how you will thank them before the others.",
      "They want a toast — yours, to them, at the high table.",
      "\"Let it be said that I was generous,\" they murmur.",
      "They ask if a herald could be found by evening.",
      "They will do it, if the story has them at the centre.",
      "They want you to back their version, whatever happens.",
      "They wave away coin and ask for a public word.",
      "\"You'll wear my colours when you do it,\" they decide.",
      "They need the room to know whose idea it was.",
      "They ask whether you write, and whether you could write about this.",
      "The price is your applause, led from the front.",
      "They want it done in their name, loudly.",
      "They frown at \"we\" and wait until you say \"you\".",
      "A plaque, they suggest, would not be too much.",
      "They want to be thanked in front of the one they envy.",
      "They give gladly whatever will be remembered as theirs.",
    ],
    key: [
      "One honest word of admiration, and they are yours for the evening.",
      "You look at them as if the room were empty, and they melt.",
      "They lean into praise the way a cat leans into a hand.",
      "Ask them how they did it, and the door is open.",
      "A sigh of wonder gets you further than an hour of argument.",
      "They cannot say no to someone who has just called them brilliant.",
      "Your attention, undivided, is a coin they always take.",
      "They grow generous in the warmth of being adored.",
      "You remember a line of theirs, and they remember you.",
      "They offer more than you asked, to hear you gasp again.",
      "A request wrapped in worship is a request already granted.",
      "They turn their whole chair toward the one who admires them.",
      "\"Only you could,\" you say, and they prove it.",
      "They forgive lateness, rudeness, anything, for a sincere compliment.",
      "Sudden warmth catches them with no defence at all.",
      "They keep you beside them once you have praised them well.",
      "A fan's shy question is answered like a queen's command.",
      "They bloom when you ask for the story again.",
      "Adoration makes them want to deserve it, at once.",
      "They say yes while they are still smiling at what you said.",
    ],
    wall: [
      "A word of criticism, and the warmth leaves the room.",
      "They hear a correction as an attack.",
      "A joke at their expense is answered with ice, then with fire.",
      "You doubt them, and they will never forgive the doubt.",
      "Pushed, they make a scene of being wronged.",
      "They do not weigh a threat; they are insulted by it.",
      "Told they are wrong, they call for someone who will say they are right.",
      "A hard word turns their charm off like a lamp.",
      "They answer a challenge by turning to their admirers.",
      "Demands make them deaf, and loud.",
      "You shame them, and the whole hall hears what you are.",
      "Their voice climbs with every blunt truth.",
      "They cannot bargain while they are being judged.",
      "A sneer is repaid for years.",
      "They storm out rather than stand corrected.",
      "Pressure makes them brittle, then cruel.",
      "They gather the room against you with one wounded look.",
      "\"How dare you\" is the whole of their answer.",
      "They remember the insult long after they have forgotten the request.",
      "Any force aimed at them becomes a performance about them.",
    ],
    audience: [
      "With an audience, they give grandly and at once.",
      "A full hall makes their yes a spectacle.",
      "They look round to see who is watching before being kind.",
      "In private they haggle; in public they bestow.",
      "They raise their voice so the generosity carries.",
      "An onlooker is all it takes to make them magnanimous.",
      "They wait for the hush, then grant it with a flourish.",
      "The more faces, the larger the gift.",
      "They cannot be seen to be small.",
      "They call for wine and witnesses before they answer.",
      "Asked alone, they frown; asked before the court, they beam.",
      "They turn the favour into a speech.",
      "A gasp from the gallery doubles what they offer.",
      "They love to refuse nothing where everyone can see.",
      "They keep you waiting until the room is full.",
      "In an empty corridor they are almost stingy.",
      "They give you their own cloak, having checked the balcony.",
      "They announce the kindness before they do it.",
      "Every yes of theirs is played to the back row.",
      "The crowd's approval is the only seal their promises need.",
    ],
    intent: [
      "They want to be admired by you before anything else is discussed.",
      "They want you to tell others what you saw here.",
      "They are looking for a new face in their circle.",
      "They want the evening to be about them again.",
      "They want to hear that their rival is slipping.",
      "They mean to be thanked, publicly, for something.",
      "They want you to stay for the performance.",
      "They are fishing for a compliment, and will wait.",
      "They want their story told in a place they have never been.",
      "They want you on their arm when they enter.",
      "They want the insult from last season forgotten — or avenged.",
      "They are deciding whether you make them look better or worse.",
      "They want a gift worth showing.",
      "They want to be asked for help, so they can be gracious.",
      "They want proof they are still loved.",
      "They want the others in the room to envy this conversation.",
      "They want your loyalty, sung aloud.",
      "They are keeping you close, to keep you from someone else.",
      "They want to end the night on applause.",
      "They want one more person who will say their name with awe.",
    ],
  },
  caretaker: {
    desire: [
      "They are pouring you tea before you have sat down.",
      "They ask if you have eaten, and do not quite believe the answer.",
      "Their hands look for something to mend while you talk.",
      "They brighten when you admit you cannot manage alone.",
      "They straighten your collar without asking.",
      "A spare blanket is already folded by the door.",
      "They remember what you needed last time, and have it ready.",
      "They ask who looks after you.",
      "They hover at the edge of every task, waiting to be let in.",
      "\"Leave it with me\" comes easily, and often.",
      "They keep a list of other people's troubles, and consult it.",
      "Being thanked matters less to them than being asked again.",
      "They look lost in a room where everyone is fine.",
      "They press food into your hands as you leave.",
      "They ask what you will do when it gets cold.",
      "Their own cup has gone cold, untouched.",
      "They light up at the word \"help\".",
      "They find a reason to walk you home.",
      "They want to be the first one you think of when something breaks.",
      "They are happiest with someone else's coat over their arm.",
    ],
    fear: [
      "You hand them a gift, and they look almost frightened.",
      "They cannot let you pay; the coin is pushed back three times.",
      "A kindness done for them leaves them restless until it is returned.",
      "They keep asking what they can do for you in exchange.",
      "\"You owe me nothing\" is the one thing they cannot hear.",
      "They apologise for a favour they once accepted.",
      "A debt they have no means to repay keeps them awake.",
      "They flinch from the seat of honour.",
      "They would rather go hungry than be served first.",
      "Told to rest while others work, they cannot sit still.",
      "They count what others have done for them, and it frightens them.",
      "A rescue leaves them more shaken than the danger did.",
      "They change the subject when someone praises their own needs.",
      "They insist on carrying something, anything, on the way back.",
      "Being looked after makes their smile go tight.",
      "They ask, twice, whether you are sure they are not a burden.",
      "An unpaid kindness is written down somewhere, and reread.",
      "They cannot accept help without naming a price for themselves.",
      "They dread the day someone gives more than they can give back.",
      "They are uneasy until the scales tip back their way.",
    ],
    price: [
      "They add three things you did not ask for, and wave off your protest.",
      "\"Let me do it properly,\" they say, and the favour doubles.",
      "They will not hear of payment — only of your coming back.",
      "They ask what else you need, in a tone that will not take \"nothing\".",
      "They pack more than you can carry.",
      "\"You'll let me look in on you,\" they decide.",
      "The price is letting them fuss.",
      "They want your promise to send word when you arrive.",
      "They give, and give again, and you can feel the weight of it settle on you.",
      "They ask you to take the better room; refusing would hurt them.",
      "\"It's no trouble,\" they say, making it a great deal of trouble.",
      "They want to be told the next time, too.",
      "A second helping is not offered — it is served.",
      "They will do it, and then the thing after it, and you will owe for both.",
      "They ask who they should speak to on your behalf.",
      "They need you to accept more than is comfortable.",
      "\"Stay until you're well,\" they say; it is not a suggestion.",
      "They take the whole burden, and leave you holding the thanks.",
      "The door they open has a bed made up behind it.",
      "They ask only that you lean on them — and keep leaning.",
    ],
    key: [
      "You let your tiredness show, and they are on their feet.",
      "\"I don't know who else to ask\" opens every door they have.",
      "Your hurt becomes their task the moment you name it.",
      "They cannot watch you struggle with the clasp; they take it from you.",
      "A hint that you were let down, and they hurry to make it right.",
      "They soften at the first sign that you are alone in this.",
      "\"It would mean a great deal to me\" is an argument they cannot answer.",
      "A quiet \"I thought you would understand\" moves them at once.",
      "They say yes while still asking if you are all right.",
      "Need, plainly shown, is a call they always answer.",
      "They wince when you say you will manage somehow.",
      "Remind them someone is counting on them, and they cannot refuse.",
      "Your gratitude in advance makes them ashamed to disappoint.",
      "They reach for your hand before you have finished explaining.",
      "A child's need, or an old friend's, undoes every excuse they had.",
      "They give way the moment refusing would make them the one who walked past.",
      "Guilt sits on them quickly, and they move to be rid of it.",
      "You ask softly, and they ask what more they can do.",
      "They are easiest to move when you let them feel responsible.",
      "They cannot bear to be the reason you went without.",
    ],
    wall: [
      "You name a price, and their face closes.",
      "\"What's in it for you?\" offends them more than a curse.",
      "Coin laid on the table is looked at as if it were dirt.",
      "An offer of trade makes them stiff and formal.",
      "They give; they do not sell — and you have just called it selling.",
      "Your careful terms are heard as distrust.",
      "A contract pushed toward them is pushed gently back.",
      "They go quiet when you start listing advantages.",
      "\"It isn't about that,\" they say, and the warmth is gone.",
      "Bargaining makes them feel like a shop, and they shut it.",
      "A clever argument only proves you did not need them.",
      "They are hurt by the idea that kindness has a rate.",
      "Logic leaves them cold; they were waiting for you to ask.",
      "You weigh it out fairly, and they wonder what they did to deserve fairness.",
      "A repayment plan is the surest way to be shown the door, kindly.",
      "They hear \"deal\" and stop hearing the rest.",
      "Reasoning with them is like paying a friend for supper.",
      "They will not be bought into what they would have given.",
      "Proof that it profits them makes them want it less.",
      "They fold their hands in their lap when you speak of exchange.",
    ],
    audience: [
      "They give the same in an empty kitchen as in a full hall.",
      "Witnesses change nothing in their face.",
      "They do not look round to see who is watching.",
      "A crowd neither hurries nor slows their answer.",
      "They would help you just the same with no one to tell of it.",
      "Praise from the gallery embarrasses them a little, and that is all.",
      "In public or in private, the question they ask is the same: what do you need?",
      "They wave away the onlookers and get on with it.",
      "An audience is just more people who might be hungry.",
      "Their voice does not rise for the benches.",
      "They are as steady before the court as beside a sickbed.",
      "Being seen means nothing to them; being needed, everything.",
      "They forget the room is there.",
      "Applause finds them already busy with the next thing.",
      "They would rather the door were shut, but it makes no difference.",
      "No one watching, everyone watching: the same hands, the same care.",
      "They answer you, not the people behind you.",
      "A public plea gets what a private one would have.",
      "They do not perform their kindness, and do not hide it.",
      "The hall could empty mid-sentence and they would finish helping.",
    ],
    intent: [
      "They want to know what is wrong, and will not rest until they do.",
      "They want you fed before anything is decided.",
      "They are looking for the one in the room who needs them most.",
      "They want to be allowed to help.",
      "They want you to stay the night rather than take the road.",
      "They mean to find out who has been neglecting you.",
      "They want a promise that you will be careful.",
      "They are trying to give you something without it seeming like charity.",
      "They want someone they love kept out of this.",
      "They want to repay a kindness that has been weighing on them.",
      "They want to fix it themselves, before you ask anyone else.",
      "They want you to say you will come back.",
      "They are making room for you at their table, in their week, in their worry.",
      "They want to hear that someone they tended is well.",
      "They want to take the hard part off your hands.",
      "They want no one to leave their house cold.",
      "They are afraid you will go without asking, and are stalling.",
      "They want to be told the whole of it, not the brave half.",
      "They want to know you have somewhere to go after this.",
      "They want, very simply, to be of use to you tonight.",
    ],
  },
  dogmatic: {
    desire: [
      "They straighten the papers until every edge agrees.",
      "A rule quoted correctly earns their first nod.",
      "They ask under which article you are making your request.",
      "They are calmest while reciting.",
      "Things in their room stand in rows.",
      "They want to hear that it has always been done this way.",
      "A seal, properly placed, pleases them more than a gift.",
      "They ask for it in writing, and read the writing twice.",
      "They glow when someone else enforces the rule unprompted.",
      "An exception makes them reach for the book.",
      "They need the ritual finished before they can listen.",
      "They want a ruling, not an opinion.",
      "They ask who gave you the authority, and want a name.",
      "The bell rings the hour, and they check that it rang true.",
      "They are eased by any sentence that begins \"It is written\".",
      "They prefer a hard rule to a kind maybe.",
      "They correct the order of your words to match the formula.",
      "They want the world to hold still long enough to be measured.",
      "A confirmed precedent settles them like warm bread.",
      "They keep a list of what is permitted, and are happiest inside it.",
    ],
    fear: [
      "You ask \"are you sure?\", and their hand goes to the book.",
      "Two rules that disagree leave them unable to speak.",
      "They reread a line they have known for thirty years.",
      "A question with no precedent makes them pale.",
      "They ask you to repeat it, hoping it will sound different.",
      "\"It depends\" is said through their teeth.",
      "They cannot leave a doubt alone; it is picked at like a scab.",
      "An honest \"nobody knows\" unsettles them more than a lie.",
      "They check the lock, then check that they checked.",
      "A smudged word in the text is stared at for a long time.",
      "They grip the edge of the table when you say \"what if\".",
      "They ask a third authority, in case the first two erred.",
      "An exception proven true leaves them shaken for days.",
      "They hate the hour before a ruling more than any punishment.",
      "Their voice loses its footing on the word \"perhaps\".",
      "They cannot sleep on an unanswered question.",
      "A map with a blank space on it is turned face down.",
      "They ask what the rule is for a case the rule never imagined.",
      "Laughter at a certainty makes them look for the door.",
      "They need to be told which answer is the right one.",
    ],
    price: [
      "They slide the book toward you and wait for your hand on it.",
      "\"Swear it,\" they say, \"in the proper words.\"",
      "They will do it, once you are bound by the same rule.",
      "They ask whether you keep your oaths, and mean to find out.",
      "A candle is lit; there is a form for this.",
      "They want your word, witnessed and written.",
      "\"You will observe the law of this house,\" they say, as a condition.",
      "They name the vow, clause by clause, and watch you follow.",
      "They take no coin; they take a promise they can hold you to.",
      "They ask what you hold sacred, so they know what to bind you by.",
      "The price is a rule you must not break afterwards.",
      "They will remember the exact words you swore.",
      "\"Then you accept the penance if you fail,\" they add.",
      "They want you inside the order before they open its door.",
      "A register is opened to a clean line and turned toward you.",
      "They ask for no favour — only obedience to something larger.",
      "They hold out the pen like a blade.",
      "\"It must be done rightly, or not at all,\" they warn.",
      "They will hold you to the letter, and say so now.",
      "They want to hear you say the rule aloud, and agree to it.",
    ],
    key: [
      "You ask what if the rule is wrong, and for once they do not answer.",
      "A doubt planted firmly makes them reach for anyone who seems sure.",
      "Name a higher law, and they stand up straighter.",
      "They give way to a voice that leaves no room for doubt.",
      "Shaken, they grab the first certainty you offer.",
      "\"By whose authority do you refuse?\" lands like a hand on the shoulder.",
      "They obey a command given as if it could not be questioned.",
      "You show them the crack, then the wall beyond it, and they choose the wall.",
      "A stern \"this is required of you\" settles them.",
      "They cannot stand unsure for long; press, and they take your side to end it.",
      "Fear of error moves them faster than hope of reward.",
      "They yield to the one who speaks for something greater.",
      "A hard question, held without mercy, makes them look for a way to obey.",
      "\"Would your founders have turned us away?\" breaks the refusal.",
      "They follow firmness the way water follows a channel.",
      "An accusation of failing their own creed undoes them.",
      "They respect the one who dares to judge them.",
      "You do not argue; you rule — and they comply.",
      "Certainty in your voice is worth more than proof in your hand.",
      "Shown their duty by a harder hand, they are almost grateful.",
    ],
    wall: [
      "You reason with them, and they answer chapter and verse.",
      "Every argument of yours has a paragraph waiting for it.",
      "They have heard this objection; it was settled a century ago.",
      "Debate is their home ground, and they are tireless on it.",
      "A bribe is recorded as an offence, with your name.",
      "The cleverer your case, the more texts they bring out.",
      "They enjoy the argument, and concede nothing in it.",
      "\"That is addressed in the commentary,\" they say, already turning pages.",
      "An appeal to common sense is met with a definition of terms.",
      "They can out-wait any reasoning; the rule does not get tired.",
      "Your offer of exchange is called by its name: corruption.",
      "They correct your logic, kindly, and remain where they were.",
      "Proof of benefit means nothing against \"it is not permitted\".",
      "They grow more certain with each point you make.",
      "A loophole offered is a loophole closed, in writing.",
      "They treat persuasion as an exam, and you are failing it.",
      "Facts are filed under the rule they must not disturb.",
      "They quote the exception clause, and then the reason it does not apply.",
      "You bargain, and they recite the penalty for bargaining.",
      "An hour of argument leaves the door exactly as shut as before.",
    ],
    audience: [
      "With others present, the rule is read out in full.",
      "They glance at the acolytes before they refuse you.",
      "In the cloister they sighed over it; in the hall they do not bend.",
      "An exception cannot be made where it would be seen.",
      "They speak for the record the moment a witness appears.",
      "\"I must be seen to uphold it,\" they say, almost apologising.",
      "The stricter face goes on with the first listener.",
      "They ask you to come back after the evening office, alone.",
      "Before the congregation, every door is a wall.",
      "They would not be the one who bent it in front of the young.",
      "A crowd makes them an example, and they act like one.",
      "What might be mercy in private is scandal in public.",
      "They close the book with a snap when the others file in.",
      "In company they cite; alone, they sometimes listen.",
      "They lower their eyes to the text whenever someone watches them weigh it.",
      "A second pair of ears turns \"we shall see\" into \"it is forbidden\".",
      "They cannot give you a nod that the whole order would have to honour.",
      "They are hardest at the lectern and softest at the garden gate.",
      "Witnesses make them say the long form of no.",
      "The more robes in the room, the fewer words they will risk.",
    ],
    intent: [
      "They want to know which rule you mean to break.",
      "They want this done by the book, start to finish.",
      "They are looking for the error in your papers.",
      "They want you to admit the rule applies to you too.",
      "They want certainty before nightfall, one way or the other.",
      "They mean to refer it upward, to someone who can rule on it.",
      "They want a breach reported, and a name to report.",
      "They are testing whether you know the forms.",
      "They want the old order restored in some small matter.",
      "They want to hear you say you were wrong.",
      "They want no exception made today, on principle.",
      "They are waiting for the proper hour to answer.",
      "They want a doubt of their own put to rest.",
      "They want you gone before you raise a question they cannot answer.",
      "They mean to make you swear to something.",
      "They want the matter written down, sealed, and closed.",
      "They are deciding whether you are a penitent or a heretic.",
      "They want proof that someone above them approves.",
      "They want to correct you, for your own good.",
      "They want the world to make sense again by morning.",
    ],
  },
  hermit: {
    desire: [
      "They ask a question back, and listen to the answer with their whole body.",
      "A riddle left unfinished holds them at the table.",
      "They turn the strange coin over and over, and forget you are there.",
      "Their eyes go to the book under your arm before they go to you.",
      "They want to know how it works, not what it is worth.",
      "They come one step closer when you say \"I don't understand it either\".",
      "They keep the door on the chain, and keep asking through it.",
      "They would trade a week of company for one true answer.",
      "They ask what you saw, exactly, and in what order.",
      "A map with an unmarked road makes them reach for a pen.",
      "They listen from the next room rather than not listen at all.",
      "They copy down a word of yours they did not know.",
      "They want to understand you without being asked anything in return.",
      "The half-open notebook is angled so that you cannot read it.",
      "They brighten at a problem and dim at a greeting.",
      "They ask who taught you that, and whether that one still lives.",
      "They watch the mechanism, never the face above it.",
      "They want the missing page more than anything in your purse.",
      "They will sit in silence for an hour beside someone who is working something out.",
      "They long to know, and to stay unseen while knowing.",
    ],
    fear: [
      "You guess something true about them, and they step back.",
      "They answer a personal question with a question about the weather.",
      "A stranger who knows their name makes them check the window.",
      "They cover the page with a hand when you lean over it.",
      "\"I know what you are\" turns them grey.",
      "They cannot bear to be watched while they think.",
      "They ask how you found the house, and do not like the answer.",
      "A question they cannot answer sends them to the shelves, shaking.",
      "They keep the lamp behind them, so their face is in shadow.",
      "They flinch from a hand held out to shake.",
      "Being read aloud — their habits, their past — empties them of words.",
      "They hate a mirror in a room where others are.",
      "They ask what you intend to do with what you know.",
      "A secret of theirs spoken lightly closes the shutters.",
      "They would rather be thought mad than be understood.",
      "Not knowing what you know is the thing they cannot sit with.",
      "They burn the draft rather than let it be seen unfinished.",
      "Your steady look makes them count the steps to the door.",
      "They go silent when the talk turns to them.",
      "They dread a visitor who asks nothing and notices everything.",
    ],
    price: [
      "\"Tell me something true about yourself first,\" they say.",
      "They push the coin back and ask a question instead.",
      "They want an answer no one else has been given.",
      "\"A truth for a truth,\" they murmur, and wait.",
      "They ask what you have never told anyone, and do not blink.",
      "They will open the book if you open yourself a little.",
      "The price is one real thing, said without ornament.",
      "They can tell a made-up confession, and it costs you the door.",
      "They ask why you really came.",
      "They want to know what frightens you; it is the only coin they keep.",
      "They trade knowledge only for knowledge.",
      "\"I have answered you,\" they say. \"Now you.\"",
      "They ask for the part of the story you left out.",
      "They offer nothing until you have given up something that was hard to say.",
      "They want your reasoning, not your thanks.",
      "A secret is weighed in their hands like a stone, and found sufficient.",
      "They ask one question, and the favour depends on how honestly you answer.",
      "They would rather have your doubt than your flattery.",
      "\"What do you know that I do not?\" is their whole negotiation.",
      "They take no payment that could be counted.",
    ],
    key: [
      "A well-made question, and the chain comes off the door.",
      "You bring a puzzle, and they forget to be wary.",
      "They answer precisely what was precisely asked.",
      "An honest \"I worked out this much\" earns the rest from them.",
      "They warm to a mind at work the way others warm to a fire.",
      "Show them the flaw in your own reasoning, and they help you mend it.",
      "One exact question gets more than an hour of charm.",
      "They respect whoever has done the reading.",
      "A thing they do not know, offered freely, is a key in the lock.",
      "They lean over the diagram beside you, shoulder almost touching.",
      "Asked \"why\", carefully, they talk for the first time.",
      "They trust evidence, and whoever brings it quietly.",
      "You trade a fact for a fact, and they keep the bargain to the letter.",
      "A clever objection delights them.",
      "They open the locked cabinet for the one who asked the right thing.",
      "Reasoned with, they reason back — and end up agreeing.",
      "They say yes to what makes sense, without needing to like you.",
      "A problem shared is the only company they seek.",
      "They give the answer, then a better one, then the book.",
      "You ask to learn, not to take, and the door stays open.",
    ],
    wall: [
      "You raise your voice, and the door closes without a word.",
      "A threat gets no answer at all, only the sound of a bolt.",
      "Pressed, they simply stop being in the room.",
      "They do not argue with shouting; they leave it alone in the hall.",
      "A scene made before others sends them out the back.",
      "The harder you knock, the quieter the house.",
      "They answer a demand with a long, flat look and nothing else.",
      "Shame does not work on someone who has already left.",
      "They blow out the lamp rather than be bullied in its light.",
      "An ultimatum is met with silence that outlasts you.",
      "They shrink from force, and then they are simply gone.",
      "Your anger is noted, like weather, and waited out.",
      "They close the book on your hand, gently, and turn away.",
      "Push, and you are talking to a shut door.",
      "A crowd brought to persuade them finds an empty room.",
      "They would lose the argument sooner than stay for it.",
      "Loud words reach them the way rain reaches a cellar.",
      "They become very polite, which is how they say goodbye.",
      "Cornered, they answer nothing, to anyone, for days.",
      "Force opens every door in the house except the one that matters.",
    ],
    audience: [
      "A second visitor arrives, and their answers shrink to a word.",
      "They speak only when the others have gone.",
      "In a crowd they stand by the wall and say nothing useful.",
      "They ask whether you came alone.",
      "Watched, they lose the thread; alone with you, they find it.",
      "A full room makes them reach for their coat.",
      "They will not be asked anything before strangers.",
      "They wait on the stair until the hall has cleared.",
      "They answer the letter and refuse the audience.",
      "Every extra listener costs you a sentence.",
      "They meet at odd hours, in the reading room, by one candle.",
      "A public question is met with a private frown.",
      "They close up like a book when the door opens.",
      "They cannot think with eyes on them.",
      "They nod to end the talk the moment someone joins it.",
      "In company they agree to nothing and remember everything.",
      "They would tell you in a whisper what they will deny in a hall.",
      "Witnesses turn their knowledge into shrugs.",
      "They choose the back table, and still find it too exposed.",
      "The fewer the faces, the longer their answers.",
    ],
    intent: [
      "They want to know what you know, and how you came by it.",
      "They want to be left alone, once this one question is settled.",
      "They are deciding whether you are worth an answer.",
      "They want a look at what you carry.",
      "They want to hear the problem, not the plea.",
      "They mean to learn who sent you to their door.",
      "They want the missing piece of something they have been working on.",
      "They are testing whether you ask good questions.",
      "They want this kept between the two of you.",
      "They want you to stop looking at them and look at the page.",
      "They want to finish a thought you interrupted.",
      "They are waiting to see if you will go away by yourself.",
      "They want one honest thing from you before they give anything.",
      "They want to check your story against what they already know.",
      "They want no one to learn that you were here.",
      "They are curious, against their better judgement.",
      "They want the conversation shorter and the answer longer.",
      "They want to know what the others outside are saying about them.",
      "They want proof before they want anything else.",
      "They want to understand why it matters to you.",
    ],
  },
  broker: {
    desire: [
      "They weigh your purse with a glance before they weigh your words.",
      "A signed contract is smoothed flat with something like tenderness.",
      "They ask what you have, before asking what you want.",
      "Their abacus is never out of reach.",
      "They brighten at the words \"in exchange\".",
      "A deal closed leaves them calmer than a meal.",
      "They ask the going rate for things that are not for sale.",
      "They keep every receipt, and know where each one is.",
      "They prefer a small sure profit to a large promise.",
      "They want the terms said twice, the second time slower.",
      "A handshake is not finished until something has changed hands.",
      "Their eyes follow the ring on your finger, not your face.",
      "They ask who else is bidding.",
      "They are happiest when both columns of the page agree.",
      "They speak of a good bargain the way others speak of a good hunt.",
      "They want it settled, stamped, and put away in the box.",
      "They test the coin with a thumbnail, from habit.",
      "A profit shared fairly earns their rare smile.",
      "They would rather close a hard deal than win an easy gift.",
      "They are looking, always, for terms that leave them a little ahead.",
    ],
    fear: [
      "A debt mentioned and not settled makes them reach for the ledger.",
      "They cannot leave the table with a number still open.",
      "\"We'll sort it out later\" tightens their mouth.",
      "An old account, unpaid, is the page they keep turning back to.",
      "They flinch from a gift with no price on it.",
      "They ask, again, when exactly you intend to pay.",
      "Owing someone keeps them awake; being owed keeps them counting.",
      "A favour they cannot repay in kind sits on them like a stone.",
      "They check the sum a third time when the room goes quiet.",
      "A partner who vanishes mid-deal is the story they will not tell.",
      "They hate a promise with no date.",
      "\"Call it even\" from the wrong mouth makes them go pale.",
      "They cannot stand a line in the book with no line under it.",
      "An heir with a claim is the knock they dread.",
      "They count the coins back to you, to be sure none stays that should not.",
      "They ask whether the dead man's debts died with him.",
      "Loose ends are the only thing they cannot sell.",
      "They keep a small locked book that nobody sees, and it weighs on them.",
      "A reckoning postponed is worse to them than a loss.",
      "They would pay double to have it finished today.",
    ],
    price: [
      "They tap the table where the payment should go.",
      "\"Something real,\" they say. \"Now, not later.\"",
      "They open a hand, palm up, and say nothing else.",
      "They ask what you are carrying that is worth the asking.",
      "Promises are waved away; the scales are brought out.",
      "They name a figure without blinking, and wait.",
      "\"I don't deal in thanks,\" they say, quite kindly.",
      "They look at your sword, your ring, your horse, in that order.",
      "They want it on the table before they move.",
      "The price is fair, and it is due this minute.",
      "They ask what it is worth to you, and hold you to the answer.",
      "They push the ledger round and point at an empty line.",
      "Credit is refused with a small shake of the head.",
      "They weigh what you offer, and tell you what is still missing.",
      "\"Value for value,\" they say, and the meeting has a shape.",
      "They would take goods, service, or a name — but something, today.",
      "They count it twice in front of you, so no one can say otherwise.",
      "A tale of future gain gets you nothing; a coin on the wood gets you heard.",
      "They ask for half now, and are surprised you ask about the other half.",
      "They write the sum on a slate and turn it toward you.",
    ],
    key: [
      "You make an offer with a number in it, and they sit down.",
      "\"Here is what you gain\" gets you their full attention.",
      "A fair trade, plainly stated, is agreed almost before you finish.",
      "They respect anyone who has done the sums.",
      "Show them the profit, and the objections fall away.",
      "They lean in when you say \"terms\".",
      "A counter-offer delights them; it means you are serious.",
      "Make yes the profitable answer, and yes is what you get.",
      "They trust a contract more than a face, and say so.",
      "You offer to share the risk, and they offer to share the gain.",
      "An argument that balances gets a nod and a pen.",
      "They thaw the moment the talk becomes a negotiation.",
      "Ask them to name a price, and you have already half won.",
      "They follow good reasoning the way a ledger follows a sum.",
      "A clause that protects them makes them generous with the rest.",
      "They say \"done\" quickly when the numbers are honest.",
      "You point out what they stand to lose by refusing, and they recalculate.",
      "A straight deal relaxes them more than any kindness.",
      "They offer their hand as soon as both sides come out ahead.",
      "Proof and a fair price: that is the whole of the way in.",
    ],
    wall: [
      "You speak of friendship, and they ask what it pays.",
      "A plea is listened to politely and entered nowhere.",
      "Tears are noted as a cost of doing business — yours.",
      "\"For old times' sake\" gets a dry smile and no discount.",
      "They wait for the feeling to pass so the talk can begin.",
      "Your charm is appraised, and found to have no resale value.",
      "They do not dislike your sorrow; they just cannot bank it.",
      "An appeal to their heart is met with a glance at the clock.",
      "Flattery is taken as an attempt to lower the price.",
      "They hand you a handkerchief and repeat the figure.",
      "Guilt slides off them like rain off oilcloth.",
      "Sentiment makes them cautious: someone is trying to pay in air.",
      "You ask them to care, and they ask you to be specific.",
      "A sad story raises nothing but an eyebrow.",
      "They have a rule against deals made with wet eyes.",
      "Warmth is welcome, they say, after the signing.",
      "The more you feel at them, the more they talk about delivery dates.",
      "Your gratitude is thanked, and not accepted as payment.",
      "They are deaf to \"please\" and attentive to \"in return\".",
      "Love, loyalty, pity: none of it appears in their columns.",
    ],
    audience: [
      "They say \"not here\" and nod toward the back room.",
      "With customers in the shop, every price is the full price.",
      "They shut the ledger when a third person walks in.",
      "A deal overheard is a deal undercut; they will not risk it.",
      "In public they quote the board; in private they quote you.",
      "They lower their voice until you have to lean in.",
      "Before witnesses they give nothing away, least of all a discount.",
      "They draw the curtain before they open the strongbox.",
      "An audience makes them formal, slow, and expensive.",
      "They ask you to come after closing.",
      "Others watching, they treat you like any stranger at the counter.",
      "What they would concede across a table, they refuse across a market.",
      "They glance at the competitor by the door and say nothing useful.",
      "Terms are whispered, or not offered.",
      "A crowd is a room full of people who will want the same price.",
      "They never count money where it can be counted by others.",
      "With an eye on them, their \"no\" comes easily and their \"yes\" not at all.",
      "They write the real number on a scrap and fold it twice.",
      "They keep one voice for the floor and another for the office.",
      "Witnesses, to them, are just more parties to the contract.",
    ],
    intent: [
      "They want to know what you can pay, before what you want.",
      "They want this deal closed before the market does.",
      "They are working out who else would pay for what you just told them.",
      "They want an old account settled, and think you can help.",
      "They want better terms than the last ones.",
      "They mean to find out how badly you need it.",
      "They want your custom, regularly, at their door.",
      "They are pricing you while you speak.",
      "They want something off their shelves that has sat too long.",
      "They want to hear a number from you first.",
      "They want a rival's supplier, and wonder if you know the name.",
      "They want it in writing before the candle burns down.",
      "They are deciding whether you are a customer or a cost.",
      "They want a debt collected without their name on it.",
      "They want to sell you more than you came for.",
      "They want to know who vouches for you.",
      "They want the risk on your side of the table.",
      "They want to leave no loose end by tonight.",
      "They want proof the goods exist.",
      "They want a partner for something larger, and are sounding you out.",
    ],
  },
};
// </READ_HINTS>

/**
 * The dossier on someone. Desire and Fear are LEVERS: once the party knows
 * them (Read, or the GM tells them), an ask that plays on one gets +2 — and
 * counts as the leverage an ask against their interests needs. Face and The
 * Line are for reading and playing them.
 */
const PROFILE_POINTS = [
  {
    id: "desire",
    label: "Desire",
    icon: "fa-gem",
    placeholder: "What do they want above all?",
    hint: "What they want above all. A LEVER: once the party knows it, an ask that dangles it gets +2 — and it is leverage enough for an ask against their interests.",
  },
  {
    id: "fear",
    label: "Fear",
    icon: "fa-ghost",
    placeholder: "What do they dread losing or facing?",
    hint: "What they dread. A LEVER: once the party knows it, an ask that presses it gets +2 — and counts as leverage.",
  },
  {
    id: "mask",          // saved data keeps the id
    label: "Manner",
    icon: "fa-masks-theater",
    placeholder: "How they carry themselves, how they speak…",
    hint: "Free notes for playing them: how they carry themselves, how they speak. No rule hangs on it.",
  },
  {
    id: "line",
    label: "The Line",
    icon: "fa-hand",
    placeholder: "What will they never do?",
    hint: "What they will never do, at any price. An ask that crosses it is simply refused — no roll. Don't ask for the impossible without a plan.",
  },
];

/**
 * A bond is a TYPE — who they are to each other, set by the story (the GM, or
 * the player who invests a String in a new bond) — and a STRENGTH 0–3 ●, its
 * degree. A roll never renames it (the user, 2026-11-04: «є різні відносини і
 * крапочки просто визначають їх ступінь»). Per ●, against that person:
 *   school  — +1 on maneuvers of that approach;
 *   edge    — +1 when this skill rolls (not on top of the approach's +1);
 *   cost    — −1 when this skill rolls: what the relationship forbids;
 *   hostile — −1 on any approach but its own: they won't hear you out;
 *   guilt   — a Pressure win against them leaves you Guilty;
 *   guard   — THEIR bond toward you is their guard (v2): −1 = their guard is
 *             down for you (DC −● when you ask them), +1 = wary (DC +●).
 *   aura    — within reach of each other, in a fight or not (bond-powers.js),
 *             on the sheet by itself: `per` — its lever, +1 a ●; `plus` —
 *             one more lever, +1, from ●●; `minus` — what it costs, flat.
 *             Several bonds sum; each lever capped at ±3. No type gives
 *             attack rolls AND damage (the user, 2026-11-15: «не будеш
 *             поєднувати + до шкоди і попадання в одному, бо воно плутає»).
 *   mirror  — the type the other side holds (mentor ↔ protégé, sworn ↔ liege);
 *             the rest are the same on both sides.
 * ●● opens the type's ability (BOND_ABILITIES); ●●● its signature
 * (BOND_SIGNATURES) — each once per long rest. Restored from v1.52–v2.0.
 */
const BOND_TYPES = [
  { id: "stranger",  label: "Stranger",  icon: "fa-circle-question", statusImg: "icons/svg/mystery-man.svg",          school: null,
    hint: "Barely acquainted. No bond effect yet — invest a String to make them someone to you." },
  { id: "ally",      label: "Ally",      icon: "fa-handshake", statusImg: "icons/svg/combat.svg",                school: "order", edge: "per", cost: "dec", guard: 0,
    aura: { label: "Side by side", per: "attack", plus: { ac: 1 } },
    hint: "A shared cause. Per ●: +1 with Reason, +1 Persuasion (they trust your word), −1 Deception (they see your games)." },
  { id: "friend",    label: "Friend",    icon: "fa-mug-hot", statusImg: "icons/svg/tankard.svg",                  school: "attention", edge: "per", cost: "itm", guilt: true, guard: -1,
    aura: { label: "They have your back", per: "save", plus: { ac: 1 } },
    hint: "Genuine warmth. Per ●: +1 with Heart, +1 Persuasion, −1 Intimidation (your threats ring hollow). Pressure on a friend leaves you Guilty." },
  { id: "family",    label: "Family",    icon: "fa-house-chimney", statusImg: "icons/svg/house.svg",            school: "attention", edge: "ins", cost: "dec", guilt: true, guard: -1,
    aura: { label: "Close ranks", per: "ac", plus: { save: 1 } },
    hint: "Blood or chosen. Per ●: +1 with Heart, +1 Insight (you know them), −1 Deception (they know when you lie). Pressure on your own leaves you Guilty." },
  { id: "crush",     label: "Crush",     icon: "fa-heart-circle-exclamation", statusImg: "modules/tsl-social-conflict/icons/crush.svg", school: "attention", edge: "prf", cost: "ins", guard: -1,
    aura: { label: "Showing off", per: "damage", plus: { check: 1 } },
    hint: "Longing. Per ●: +1 with Heart, +1 Performance (you shine for them), −1 Insight (you see what you want to see)." },
  { id: "lover",     label: "Lover",     icon: "fa-heart", statusImg: "icons/svg/heal.svg",                    school: "attention", edge: "ins", cost: "itm", guilt: true, guard: -1,
    aura: { label: "For each other", per: "ac", plus: { attack: 1 } },
    hint: "Hearts entangled. Per ●: +1 with Heart, +1 Insight (you read them), −1 Intimidation (you cannot frighten them). Pressure on a lover leaves you Guilty." },
  { id: "mentor",    label: "Mentor",    icon: "fa-graduation-cap", statusImg: "icons/svg/book.svg",           school: "attention", edge: "ins", cost: "dec", mirror: "protege", guard: -1,
    aura: { label: "Their teaching", per: "attack", plus: { spellDC: 1, maneuverDC: 1 } },
    hint: "They shaped you. Per ●: +1 with Heart, +1 Insight, −1 Deception (you cannot fool your teacher)." },
  { id: "protege",   label: "Protégé",   icon: "fa-seedling", statusImg: "icons/svg/oak.svg",                 school: "attention", edge: "per", cost: "itm", guilt: true, mirror: "mentor", guard: -1,
    aura: { label: "To make them proud", per: "check", plus: { attack: 1 } },
    hint: "You shaped them. Per ●: +1 with Heart, +1 Persuasion (they listen), −1 Intimidation (menacing your ward shames you). Pressure on them leaves you Guilty." },
  { id: "rival",     label: "Rival",     icon: "fa-khanda", statusImg: "icons/svg/sword.svg",                   school: "power", hostile: true, guard: 0,
    aura: { label: "Blood up", per: "attack", plus: { init: 1 } },
    hint: "A respected opponent. Per ●: +1 with Pressure, −1 on anything else (pride won't be talked down)." },
  { id: "enemy",     label: "Enemy",     icon: "fa-skull", statusImg: "icons/svg/skull.svg",                    school: "power", hostile: true, cost: "ins", guard: 1,
    aura: { label: "Tunnel vision", per: "damage", plus: { init: 1 }, minus: { save: -1 } },
    hint: "Open hostility. Per ●: +1 with Pressure, −1 on anything else, −1 Insight (they give you nothing to read)." },
  { id: "sworn",     label: "Sworn",     icon: "fa-hand-fist", statusImg: "icons/svg/holy-shield.svg",                school: "order", edge: "per", cost: "itm", guilt: true, mirror: "liege", guard: -1,
    aura: { label: "Oathbound", per: "save", plus: { ac: 1 } },
    hint: "You gave them your word. Per ●: +1 with Reason, +1 Persuasion (you appeal to the oath), −1 Intimidation (you don't threaten the one you serve). Pressure on them leaves you Guilty." },
  { id: "liege",     label: "Liege",     icon: "fa-chess-king", statusImg: "icons/svg/castle.svg",               school: "order", edge: "itm", cost: "dec", mirror: "sworn", guard: 0,
    aura: { label: "The oath answers", per: "ac", plus: { save: 1 } },
    hint: "They swore to you. Per ●: +1 with Reason, +1 Intimidation (your word carries weight), −1 Deception (they watch you closely)." },
  { id: "confidant", label: "Confidant", icon: "fa-comment-dots", statusImg: "modules/tsl-social-conflict/icons/confidant.svg",             school: "order", edge: "ins", cost: "dec", guilt: true, guard: -1,
    aura: { label: "Shared counsel", per: "check", plus: { save: 1 } },
    hint: "They trust you with what they hide. Per ●: +1 with Reason, +1 Insight (you know their mind), −1 Deception (they'd catch your lie). Turning on them leaves you Guilty." },
];

/**
 * ●● — the bond's ability, once per long rest like everything a bond gives on
 * call (the user, 2026-11-14: «Всі здібності пов'язані на відносинах мають
 * діяти раз на довгий відпочинок, автоматизуй їх перезарядку теж»). Each one
 * does something by itself (`fx`, bond-powers.js) to the one who calls it
 * (`self`) and/or the other one (`partner`):
 *   { adv } / { bonus }  — advantage, or +N, until that one's next roll;
 *   { temp: "prof3" }    — temporary hit points: three times their proficiency bonus;
 *   { clear: true }      — one emotion let go (theirs to pick); with none to let
 *                          go, the gift's other part applies instead.
 */
const BOND_ABILITIES = {
  ally:      { label: "In sync",          text: "You set each other up: +2 on your next roll, and on theirs.",
               fx: { self: { bonus: 2 }, partner: { bonus: 2 } } },
  friend:    { label: "Steady me",        text: "A friend's word steadies you: let one emotion go. Carrying none, you take heart instead: temporary hit points, three times your proficiency bonus.",
               fx: { self: { clear: true, temp: "prof3" } } },
  family:    { label: "Blood answers",    text: "You close ranks: both of you gain temporary hit points, three times your proficiency bonus.",
               fx: { self: { temp: "prof3" }, partner: { temp: "prof3" } } },
  crush:     { label: "Look at me",       text: "With your crush watching: advantage on your next roll.",
               fx: { self: { adv: true } } },
  lover:     { label: "Wordless",         text: "A glance carries a whole sentence between you: your lover has advantage on their next roll.",
               fx: { partner: { adv: true } } },
  mentor:    { label: "Their voice",      text: "You hear what your mentor would say: +2 on your next roll.",
               fx: { self: { bonus: 2 } } },
  protege:   { label: "They emulate you", text: "Show them how it's done: your protégé has advantage on their next roll.",
               fx: { partner: { adv: true } } },
  rival:     { label: "Measure of you",   text: "You've studied each other: +2 on your next roll.",
               fx: { self: { bonus: 2 } } },
  enemy:     { label: "Forewarned",       text: "You are braced for them: temporary hit points, three times your proficiency bonus.",
               fx: { self: { temp: "prof3" } } },
  sworn:     { label: "The oath holds",   text: "You put yourself between your liege and harm: they gain temporary hit points, three times your proficiency bonus.",
               fx: { partner: { temp: "prof3" } } },
  liege:     { label: "By your leave",    text: "Your word carries them: your sworn has +2 on their next roll.",
               fx: { partner: { bonus: 2 } } },
  confidant: { label: "Unburden",         text: "You talk it through with them: let one emotion go.",
               fx: { self: { clear: true } } },
};

/**
 * ●●● — a fully realized bond's signature, once per long rest. `fx` goes on
 * the sheets and ends after that one's next roll (bond-powers.js): `self`,
 * `partner` ({ adv } or { bonus }), or a `choose` between them. Without
 * `fx` it's the GM's to play.
 */
const BOND_SIGNATURES = {
  ally:      { label: "Shoulder to shoulder", text: "You or your ally reroll one failed check or save made for your shared cause, while you stand together (the GM's call)." },
  friend:    { label: "I've got you",         text: "A word at the right moment, from anywhere: when you or your friend fail a roll, it's rolled again (the GM's call)." },
  family:    { label: "Blood shields blood",  text: "Take one hit or effect aimed at family — or they take it for you — halved (the GM's call)." },
  crush:     { label: "For their eyes",       text: "In your crush's presence, on a roll made to impress or protect them: an ordinary success becomes a critical, or a failure a bare success (the GM's call)." },
  lover:     { label: "Something to lose",    text: "When your lover falls or is in danger, act at once — an extra reaction (the GM's call) — and your next roll has advantage.",
               fx: { self: { adv: true } } },
  mentor:    { label: "The old lessons",      text: "The lesson comes back: your proficiency bonus again on your next roll.",
               fx: { self: { bonus: "prof" } } },
  protege:   { label: "Someone is watching",  text: "When your protégé can see you, one action inspires them: advantage on their next roll, and on yours.",
               fx: { self: { adv: true }, partner: { adv: true } } },
  rival:     { label: "Prove it",             text: "When you contest your rival directly, a d20 you've just rolled becomes a 15 (the GM's call)." },
  enemy:     { label: "Personal",             text: "Against this enemy, one blow lands twice as hard: advantage on your next roll — and if it's a strike, its damage doubles (the GM's call).",
               fx: { self: { adv: true } } },
  sworn:     { label: "For the oath",         text: "Act to protect or fulfil your oath to your liege: that roll has advantage and +5.",
               fx: { self: { adv: true, bonus: 5 } } },
  liege:     { label: "By my word",           text: "Call your sworn to act for you: they have advantage on the deed — or you press them: +5 on your next roll.",
               fx: { choose: [{ label: "They act — advantage", partner: { adv: true } }, { label: "I press them — +5", self: { bonus: 5 } }] } },
  confidant: { label: "A word in the dark",   text: "Their counsel: advantage on the next roll where their knowledge bears — or a shared secret becomes a strike: +5 on your next roll.",
               fx: { choose: [{ label: "Their counsel — advantage", self: { adv: true } }, { label: "A secret as a weapon — +5", self: { bonus: 5 } }] } },
};

// Legacy bond ids → their replacement (Indebted → Sworn, Creditor → Liege).
const BOND_TYPE_ALIASES = { indebted: "sworn", creditor: "liege" };

/** What the party may have learned about someone — the Read questions. */
const KNOWN_FACTS = ["desire", "fear", "key", "wall", "price", "audience"];
/** What is theirs, not their nature's: naming the nature doesn't give it away — it comes out in play. */
const PERSONAL_FACTS = ["desire", "fear"];

/**
 * Leanings — how a player character reaches for people: dots spread across the
 * three approaches (kept by the approach's school: power · attention · order),
 * TRIAD_POINT_POOL in all, at most LEANING_MAX in one. Each dot is +1 on a
 * maneuver that comes at someone that way (a lie: the way it's told). Restored
 * on 2026-11-07 (the user: «Наші крапочки архетипів теж» — v3.6 had dropped them).
 */
const TRIAD_POINT_POOL = 4;
const LEANING_MAX = 3;

class SocialArchetypeManager {
  static getFlagScope() { return SOCIAL_FENCING_SCOPE; }
  static getFlagKey()   { return "socialFencing"; }

  static getActorData(actor) {
    return actor?.getFlag?.(SOCIAL_FENCING_SCOPE, "socialFencing") ?? {};
  }

  static async setActorData(actor, data) {
    if (!actor) return;
    const current = SocialArchetypeManager.getActorData(actor);
    await actor.setFlag(SOCIAL_FENCING_SCOPE, "socialFencing",
      foundry.utils.mergeObject(current, data, { inplace: false }));
  }

  static getArchetypeById(id) {
    return SOCIAL_ARCHETYPES.find(a => a.id === id) ?? null;
  }

  static getArchetype(actor) {
    return SocialArchetypeManager.getArchetypeById(SocialArchetypeManager.getActorData(actor).archetypeId);
  }

  /** What witnesses do to an ask: +2 they bend, −2 they harden, 0 nothing. */
  static audienceOf(actor) {
    return SocialArchetypeManager.getArchetype(actor)?.audience ?? 0;
  }

  static async setArchetype(actor, archetypeId) {
    const archetype = SocialArchetypeManager.getArchetypeById(archetypeId);
    if (!actor || !archetype) return null;
    await SocialArchetypeManager.setActorData(actor, { archetypeId: archetype.id });
    return archetype;
  }

  /** The archetype is NAMED to the table — players see the whole card. */
  static isRevealed(actor) {
    return !!SocialArchetypeManager.getActorData(actor).revealed;
  }

  static async setRevealed(actor, revealed) {
    if (!actor) return;
    await SocialArchetypeManager.setActorData(actor, { revealed: !!revealed });
  }

  /**
   * What the party has learned about this person — one flag per Read
   * question (desire, fear, key, wall, price, audience). Shared by everyone at the
   * table and kept for good: knowledge of a person is campaign-long. A named nature opens its card
   * (key, wall, price, witnesses) — but what they themselves want and fear is theirs,
   * not their nature's: it still has to come out in play (the user, 2026-11-10: «страх… треба
   * показувати відіграшем»).
   */
  static getKnown(actor) {
    const k = SocialArchetypeManager.getActorData(actor).known ?? {};
    const named = SocialArchetypeManager.isRevealed(actor);
    return Object.fromEntries(KNOWN_FACTS.map(f => [f, (named && !PERSONAL_FACTS.includes(f)) || !!k[f]]));
  }

  static async setKnown(actor, patch = {}) {
    if (!actor) return;
    const cur = SocialArchetypeManager.getActorData(actor).known ?? {};
    await SocialArchetypeManager.setActorData(actor, { known: { ...cur, ...patch } });
  }

  static getCharacterNotes(actor) {
    const data = SocialArchetypeManager.getActorData(actor);
    return {
      archetypeId: data.archetypeId || null,
      intent: data.intent || "",
      notes: data.notes || "",
      title: data.title || "",   // a few words under their name on the relationship map
      triad: {
        power:     data.triad?.power     ?? 0,
        attention: data.triad?.attention ?? 0,
        order:     data.triad?.order     ?? 0,
      },
      points: Object.fromEntries(PROFILE_POINTS.map(p => [p.id, data.points?.[p.id] ?? ""])),
    };
  }

  /**
   * Which triad sharpens which everyday checks on the SHEET (v1.8–v2's "Social
   * Leanings" effect): +1 a dot, on every check with that skill — a social
   * maneuver that rolls it too. Only the four social checks, the skills of the
   * four buttons (the user, 2026-11-15: «крапки архетипів посилюють все крім
   * звичайного переконання»; no skill beyond them): v1.8's three, each triad
   * one more. A will to dominate makes threats and tricks land; living through
   * people teaches you to read them and move them; a cool head controls what
   * others get to know, and argues them round. A skill two triads share adds
   * the dots of both, up to LEANING_MAX.
   */
  static get TRIAD_SKILLS() {
    return { power: { keys: ["itm", "dec"] }, attention: { keys: ["ins", "per"] }, order: { keys: ["dec", "per"] } };
  }

  /** What a character's dots put on their sheet: { skillKey: +n }, each capped at LEANING_MAX. */
  static leaningSheet(triad = {}) {
    const out = {};
    for (const [t, m] of Object.entries(SocialArchetypeManager.TRIAD_SKILLS)) {
      const dots = Math.min(LEANING_MAX, triad[t] ?? 0);
      if (dots) for (const k of m.keys) out[k] = Math.min(LEANING_MAX, (out[k] ?? 0) + dots);
    }
    return out;
  }

  /** The triad a character leans into: a lead of 2+ dots over the others — or null (split, or none yet). */
  static rulingTriad(actor) {
    const t = SocialArchetypeManager.getCharacterNotes(actor).triad;
    const entries = Object.entries(t).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const [top, next] = entries;
    return top && (top[1] || 0) >= 2 && (top[1] || 0) > (next?.[1] || 0) ? top[0] : null;
  }

  /** What the Leanings effect adds to a skill on this sheet (read back from the effect itself). */
  static leanSkillBonus(actor, skillKey) {
    const eff = (actor?.effects ?? []).find(e => !e.disabled && e.flags?.[SOCIAL_FENCING_SCOPE]?.triadBonus);
    const ch = (eff?.changes ?? []).find(c => c.key === `system.skills.${skillKey}.bonuses.check`);
    return ch ? (parseInt(String(ch.value).replace(/\s+/g, ""), 10) || 0) : 0;
  }

  /**
   * Keep the one "Leanings" effect on a character's sheet in step with their
   * dots: +1 a dot to the social checks of each triad (TRIAD_SKILLS). Removed
   * when there are no dots. The owner or the GM writes it.
   */
  static async syncLeaningEffect(actor) {
    if (!actor || !SocialArchetypeManager.isPC(actor) || !(game.user?.isGM || actor.isOwner)) return;
    const triad = SocialArchetypeManager.getCharacterNotes(actor).triad;
    const changes = [], lines = [];
    for (const [k, n] of Object.entries(SocialArchetypeManager.leaningSheet(triad))) {
      changes.push({ key: `system.skills.${k}.bonuses.check`, mode: 2, value: `+${n}`, priority: 20 });
      lines.push(`+${n} ${SKILL_LABELS[k] ?? k}`);
    }
    const old = (actor.effects ?? []).filter(e => e.flags?.[SOCIAL_FENCING_SCOPE]?.triadBonus);
    const canon = (cs) => (cs ?? []).map(c => `${c.key}|${String(c.value)}`).join("§");
    if (old.length === 1 && changes.length && canon(old[0].changes) === canon(changes)) return;
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
    if (!changes.length) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: _t("Leanings"), img: "icons/svg/upgrade.svg", origin: `module.${SOCIAL_FENCING_SCOPE}`, disabled: false, changes,
      description: _t("Your Leanings sharpen everyday checks: {list} — on every check with that skill, social maneuvers too.", { list: lines.join(", ") }),
      flags: { [SOCIAL_FENCING_SCOPE]: { triadBonus: true } },
    }]);
  }

  /**
   * What a character's Leanings do to a maneuver of this approach: +1 a dot —
   * or −1 on a way with no dots while they lean elsewhere (foreign ground, as
   * before). 0 for NPCs and for a character with no dots yet.
   */
  static leaningMod(actor, approachId) {
    if (!SocialArchetypeManager.isPC(actor) || !approachId) return 0;
    const dots = SocialArchetypeManager.leaningDots(actor, approachId);
    if (dots) return dots;
    const total = Object.values(SocialArchetypeManager.getCharacterNotes(actor).triad).reduce((sum, v) => sum + (v || 0), 0);
    return total > 0 ? -1 : 0;
  }

  /** A character's Leaning in an approach: its dots (0–3). NPCs have natures, not Leanings. */
  static leaningDots(actor, approachId) {
    if (!SocialArchetypeManager.isPC(actor)) return 0;
    const school = APPROACHES[approachId]?.school;
    return school ? Math.max(0, Math.min(LEANING_MAX, SocialArchetypeManager.getCharacterNotes(actor).triad[school] ?? 0)) : 0;
  }

  /**
   * Set a Leaning: `value` dots in that school. Clicking the dot it already
   * has takes one off. Refused (false) past the pool — lower another first.
   */
  static async setLeaning(actor, school, value) {
    if (!actor || !["power", "attention", "order"].includes(school)) return false;
    const triad = SocialArchetypeManager.getCharacterNotes(actor).triad;
    const cur = triad[school] ?? 0;
    let next = Math.max(0, Math.min(LEANING_MAX, value | 0));
    if (next === cur) next = cur - 1;
    const others = Object.entries(triad).reduce((sum, [k, v]) => sum + (k === school ? 0 : (v || 0)), 0);
    if (next > cur && others + next > TRIAD_POINT_POOL) return false;
    await SocialArchetypeManager.setActorData(actor, { triad: { ...triad, [school]: Math.max(0, next) } });
    await SocialArchetypeManager.syncLeaningEffect(actor);
    return true;
  }

  /**
   * A player character: a "character" actor (dnd5e / a5e), or anything a player
   * owns. The type matters when the GM plays alone — nobody owns the characters.
   */
  static isPC(actor) {
    return !!actor && (actor.type === "character" || !!actor.hasPlayerOwner);
  }

  static getArchetypeOptions() {
    return SOCIAL_ARCHETYPES.map(a => ({ id: a.id, label: a.label, triad: a.triad }));
  }

  static getBondType(id) {
    const resolved = BOND_TYPE_ALIASES[id] ?? id;
    return BOND_TYPES.find(t => t.id === resolved) ?? BOND_TYPES[0];
  }

  /** The type the OTHER side of the same relationship holds. */
  static getBondMirror(id) {
    return SocialArchetypeManager.getBondType(id).mirror ?? SocialArchetypeManager.getBondType(id).id;
  }

  /** ●● — the ability a bond type opens, or null (Stranger). */
  static getBondAbility(typeId) {
    return BOND_ABILITIES[SocialArchetypeManager.getBondType(typeId).id] ?? null;
  }

  /** ●●● — the signature a bond type grants once per long rest, or null (Stranger). */
  static getBondSignature(typeId) {
    return BOND_SIGNATURES[SocialArchetypeManager.getBondType(typeId).id] ?? null;
  }

  /** The approach a bond type feeds (+● against that person), or null. */
  static bondApproach(typeId) {
    const school = SocialArchetypeManager.getBondType(typeId).school;
    return APPROACH_ORDER.find(a => APPROACHES[a].school === school) ?? null;
  }

  /** A veiled line of how this nature visibly gives way (the key landing). */
  static pickReaction(archId) {
    const pool = ARCHETYPE_REACTIONS[archId];
    return pool?.length ? _t(pool[Math.floor(Math.random() * pool.length)]) : null;
  }

  /**
   * A veiled observation about this nature: what a Read that hits also notices
   * (as in v1–v2; lost in the v3.0 rebuild, back on 2026-11-14). Evidence, never
   * the name — under a mask it is the TRUE nature that shows.
   */
  static pickTell(archId) {
    const key = SocialArchetypeManager.pickTellKey(archId);
    return key ? _t(key) : null;
  }

  /** The same, as the English line itself (the key each client reads in its own language) — one the party hasn't noticed yet, while any is left. */
  static pickTellKey(archId, seen = []) {
    const pool = ARCHETYPE_TELLS[archId] ?? [];
    const fresh = pool.filter(l => !seen.includes(l));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }

  // ── The deduction loop (v1.7–v2: tells → a guess → hints; lost in v3.0, back on 2026-11-14) ──
  // The user: «ти прибрав підказки архетипу зовсім і купу наших варіантів тексту на нього».
  // A Read notices SIGNS of their nature (never its name); the party keeps them, puts
  // forward a GUESS, and the form's marks and odds follow that guess — a theory — until
  // the dice or the talk prove it. The roll always follows the truth.

  /** How many signs the party keeps about one person (the newest). */
  static SIGNS_KEPT = 12;

  /** What the party has noticed about them: lines of ARCHETYPE_TELLS (English keys), oldest first. */
  static getSigns(actor) {
    const s = SocialArchetypeManager.getActorData(actor).signs;
    return Array.isArray(s) ? s.filter(x => typeof x === "string" && x) : [];
  }

  /** The party notices one more (GM). False when they had it already. */
  static async addSign(actor, line) {
    if (!actor || !line) return false;
    const have = SocialArchetypeManager.getSigns(actor);
    if (have.includes(line)) return false;
    await SocialArchetypeManager.setActorData(actor, { signs: [...have, line].slice(-SocialArchetypeManager.SIGNS_KEPT) });
    return true;
  }

  static async removeSign(actor, line) {
    const have = SocialArchetypeManager.getSigns(actor);
    if (!have.includes(line)) return false;
    await SocialArchetypeManager.setActorData(actor, { signs: have.filter(x => x !== line) });
    return true;
  }

  /** The party's working guess at their nature — null when there's none, or once the nature is named. */
  static getGuess(actor) {
    if (SocialArchetypeManager.isRevealed(actor)) return null;
    return SocialArchetypeManager.getArchetypeById(SocialArchetypeManager.getActorData(actor).guess);
  }

  static async setGuess(actor, id) {
    await SocialArchetypeManager.setActorData(actor, { guess: SocialArchetypeManager.getArchetypeById(id) ? id : null });
  }

  // ── On their guard (a Question that missed) ─────────────────────────────────

  /** Are they on their guard against this character? (+2 to the DC of that one's next roll against them.) */
  static isWary(npc, pcId) {
    const w = SocialArchetypeManager.getActorData(npc).wary;
    return Array.isArray(w) && w.includes(pcId);
  }

  /** Put them on their guard against a character, or let it drop (GM). */
  static async setWary(npc, pcId, on) {
    if (!npc || !pcId) return;
    const cur = SocialArchetypeManager.getActorData(npc).wary;
    const list = Array.isArray(cur) ? cur.filter(id => id !== pcId) : [];
    if (on) list.push(pcId);
    if (!on && !(Array.isArray(cur) && cur.includes(pcId))) return;
    await SocialArchetypeManager.setActorData(npc, { wary: list });
  }

  // ── Standard hints (the user, 2026-11-14: «по 20 стандартних фраз-підказок на наш інсайт
  //    на випадок якщо в чаршиті пусто, щоб гравцям було від чого відштовхуватися») ──

  /** The GM's own words for a fact, if the dossier has any: Desire, Fear, the Agenda. */
  static ownFact(actor, fact) {
    const n = SocialArchetypeManager.getCharacterNotes(actor);
    return (fact === "intent" ? n.intent : n.points?.[fact]) || "";
  }

  /**
   * A standard hint for one Read question about this nature — a line of
   * READ_HINTS (its English key), one the party hasn't seen while any is left.
   * Null when the nature has none for it.
   */
  static pickHintKey(archId, fact, seen = []) {
    const pool = (typeof READ_HINTS !== "undefined" ? READ_HINTS[archId]?.[fact] : null) ?? [];
    const fresh = pool.filter(l => !seen.includes(l));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }
}
