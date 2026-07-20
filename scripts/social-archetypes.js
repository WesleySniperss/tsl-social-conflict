/**
 * tsl-social-conflict | social-archetypes.js
 *
 * Defines NPC Archetypes, decision vulnerabilities/immunities, and Active Effects
 * used by the Social Fencing encounter system.
 */

console.log("TSL | Loading social-archetypes.js...");

const SOCIAL_FENCING_SCOPE = "tsl-social-conflict";

/**
 * The Extended Triad — three drives that rule a personality.
 * Each character can lean into several triads (0–3), but their
 * Archetype is the dominant expression of one of them.
 */
const SOCIAL_TRIADS = {
  power: {
    id: "power",
    label: "Triad of Power",
    icon: "fa-chess-king",
    color: "#e8557a",
    hint: "Control, dominance, ambition. Tyrant · Machiavellian · Duelist. They respect strength and despise servility — flattery, bait and open challenge work; raw threats usually bounce. Counter cycle: Power breaks Emotion, but Reason binds Power.",
  },
  attention: {
    id: "attention",
    label: "Triad of Emotion",
    icon: "fa-heart",
    color: "#9b6ee8",
    hint: "Attention, affection, the need to be seen. Martyr · Exalted · Caretaker. Feed or starve their hunger for attention; cold logic slides right off them. Counter cycle: Emotion cracks Reason, but Power cows Emotion.",
  },
  order: {
    id: "order",
    label: "Triad of Reason",
    icon: "fa-scale-balanced",
    color: "#55b8e8",
    hint: "Rules, systems, certainty. Dogmatic · Hermit · Broker. Exploit contradictions, information and deals; naked emotion is noise to them. Counter cycle: Reason binds Power, but Emotion cracks Reason.",
  },
};

const SOCIAL_ARCHETYPES = [
  // ── Triad of Power ──────────────────────────────────────────────────────────
  {
    id: "tyrant",
    label: "Tyrant",
    triad: "power",
    vulnerabilities: ["appease", "flattery"],
    immunities: ["intimidate"],
    description: "Control-focused antagonist who resists force and bends only to praise.",
    hint: "Feed the ego, never confront it head-on. Flattery opens doors; threats slam them shut.",
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
    label: "Machiavellian",
    triad: "power",
    vulnerabilities: ["deceive", "feigned weakness"],
    immunities: ["pure logic", "shameless"],
    description: "A covert manipulator who is vulnerable to subtle deception.",
    hint: "Let them think they're winning. Feigned weakness baits them; guilt and clean logic are games they've already won.",
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
    vulnerabilities: ["challenge", "glory"],
    immunities: ["scorn for weakness"],
    description: "A proud contender who must answer any worthy challenge — and despises cheap tricks.",
    hint: "Honor is the lever. A worthy challenge excites them; playing weak earns only contempt.",
    craves: "A worthy opponent and public glory",
    dreads: "Being dismissed as unworthy",
    tells: [
      "Takes every dare personally",
      "Keeps score of slights and victories",
      "Despises trickery, loves an audience",
    ],
  },

  // ── Triad of Emotion ────────────────────────────────────────────────────────
  {
    id: "martyr",
    label: "Martyr",
    triad: "attention",
    vulnerabilities: ["stone-walling", "ignore"],
    immunities: ["persuade", "sympathy"],
    description: "Seeks attention through suffering and recoils from sympathy.",
    hint: "Sympathy feeds the martyrdom. Starve them of attention — it is the only currency they fear losing.",
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
    label: "Exalted",
    triad: "attention",
    vulnerabilities: ["love bombing"],
    immunities: ["sow doubt", "criticism"],
    description: "Thrives on worship and resists attacks on their ego.",
    hint: "Worship works, criticism doesn't. They cannot resist adoration — or forgive doubt.",
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
    vulnerabilities: ["guilt", "obligation"],
    immunities: ["selfless focus"],
    description: "Needs to be needed. Obligation and guilt move them; being ignored does not.",
    hint: "They need to be needed. Guilt and duty steer them; the cold shoulder means nothing to someone who gives, not takes.",
    craves: "Being needed",
    dreads: "A debt they cannot repay",
    tells: [
      "Feeds, mends and fixes before being asked",
      "Apologizes for other people's failings",
      "Cannot watch someone struggle alone",
    ],
  },

  // ── Triad of Reason ──────────────────────────────────────────────────────────
  {
    id: "dogmatic",
    label: "Dogmatic",
    triad: "order",
    vulnerabilities: ["gaslighting", "exploiting dogma"],
    immunities: ["bribes", "emotions"],
    description: "Trusts rules and ritual more than people, and can be shaken by contradiction.",
    hint: "Quote their own scripture back at them. Bribes and tears are just noise against doctrine.",
    craves: "Order upheld and confirmed",
    dreads: "A contradiction inside the doctrine",
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
    vulnerabilities: ["information deficit", "logic puzzles"],
    immunities: ["emotional intimidation"],
    description: "Withdrawn and wary, they can be drawn out by clever reasoning.",
    hint: "Bring puzzles, not pressure. They open up for knowledge and shut down for shouting.",
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
    vulnerabilities: ["deal", "greed"],
    immunities: ["ledger mind"],
    description: "A pragmatist who trusts contracts over feelings and weighs every word for profit.",
    hint: "Everything is a trade. Put a real offer on the table; sentiment discounts nothing.",
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
 * ARCHETYPE_REACTIONS — how each archetype VISIBLY cracks when a maneuver
 * lands (public outcome card). 20 per type, all VEILED: they describe the
 * reaction, never name the nature — so they read as evidence, not answers.
 * A repeating signature makes them a richer deduction stream than reads alone.
 * The card shows one of these + the maneuver's own mechanical tail.
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
    "A quiet, martyred sigh — of course it would come to this.",
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
 * ARCHETYPE_TELLS — the whispered clue a successful Read Them hands the
 * reader (private to them + GM). 20 per type. Read Them is cast most, so
 * this pool is the deepest: sensory observations that POINT at the nature
 * without naming it — deduction fuel, refreshed every read.
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
    "Neglect them and watch the martyrdom find fresh fuel.",
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

/**
 * Profiling points — the "main points" of a dossier.
 * Each has a play-facing hint shown as a tooltip.
 */
const PROFILE_POINTS = [
  {
    id: "desire",
    label: "Desire",
    icon: "fa-gem",
    placeholder: "What do they want above all?",
    hint: "What they want above all. Leverage (once per encounter): dangle it in a duel for Advantage and +1 extra Resolve damage on success.",
  },
  {
    id: "fear",
    label: "Fear",
    icon: "fa-ghost",
    placeholder: "What do they dread losing or facing?",
    hint: "What they dread losing or facing. Leverage (once per encounter): press it for +3 on the roll — but if you fail, the threat costs them 1 extra Patience.",
  },
  {
    id: "weakness",
    label: "Weakness",
    icon: "fa-heart-crack",
    placeholder: "Vice, blind spot, or a person they can't refuse…",
    hint: "A vice, blind spot, or person they can't refuse. Leverage (once per encounter): expose it to turn a neutral maneuver into a vulnerability strike.",
  },
  {
    id: "mask",
    label: "Mask",
    icon: "fa-masks-theater",
    placeholder: "How they present vs who they are…",
    hint: "The face they show the world — and what it hides. Strip the mask in public to shake their footing.",
  },
  {
    id: "line",
    label: "The Line",
    icon: "fa-hand",
    placeholder: "What will they never do?",
    hint: "What they will never do, no matter the price. Push them across it and the conversation is over — permanently.",
  },
];

/** Bond types for the Chronicle of Bonds, each with a table-facing hint. */
// A bond is a TYPE + a STRENGTH (0–3 ●) and gives scaled buffs/debuffs:
//   `school`  — YOUR bond toward them is your weapon: that school's maneuvers
//               get +STRENGTH against them (hearts respond to hearts,
//               rivalries to power plays, debts to bargains).
//   `guardDc` — THEIR bond toward you is their guard: −1 = open (DC drops by
//               their strength), +1 = wary (DC rises), 0 = neutral.
//   `guilt`   — the cost of closeness: landing a POWER-school maneuver on
//               someone you hold this bond toward wounds YOU (Guilty).
//   `skills`  — what this KIND of relationship does to specific skills used
//               against that person, ±per ● (the maneuver's primary skill).
//               This is what makes the TYPE matter and not just its school:
//               you can't threaten a friend, can't lie to your own blood,
//               can't sweet-talk hatred. Every type has an edge AND a cost.
// Hint format, kept tight: fiction · Weapon (your +● school) · Skills · Guard · Guilt.
const BOND_TYPES = [
  { id: "stranger", label: "Stranger",  icon: "fa-circle-question", school: null,        guardDc: 0,  guilt: false, skills: {},
    hint: "Barely acquainted. No bond effects yet." },
  { id: "ally",     label: "Ally",      icon: "fa-handshake",       school: "order",     guardDc: 0,  guilt: false, skills: { Persuasion: 1, Deception: -1 },
    hint: "Shared cause. Weapon: +● Reason. Skills: +● Persuasion (they trust your word), −● Deception (they see your games)." },
  { id: "friend",   label: "Friend",    icon: "fa-mug-hot",         school: "attention", guardDc: -1, guilt: true,  skills: { Persuasion: 1, Intimidation: -1 },
    hint: "Genuine warmth. Weapon: +● Emotion. Skills: +● Persuasion, −● Intimidation (your threats ring hollow). Guard: DC −●. Guilt: a Power play on a friend leaves YOU Guilty." },
  { id: "family",   label: "Family",    icon: "fa-house-chimney",   school: "attention", guardDc: -1, guilt: true,  skills: { Insight: 1, Deception: -1 },
    hint: "Blood or chosen. Weapon: +● Emotion. Skills: +● Insight (you know them), −● Deception (they know when you lie). Guard: DC −●. Guilt: raising a hand against your own leaves YOU Guilty." },
  { id: "crush",    label: "Crush",     icon: "fa-heart-circle-exclamation", school: "attention", guardDc: -1, guilt: false, skills: { Performance: 1, Deception: -1 },
    hint: "Longing. Weapon: +● Emotion. Skills: +● Performance (you shine for them), −● Deception (you're transparent around them). Guard: DC −●." },
  { id: "lover",    label: "Lover",     icon: "fa-heart",           school: "attention", guardDc: -1, guilt: true,  skills: { Insight: 1, Intimidation: -1 },
    hint: "Hearts entangled. Weapon: +● Emotion. Skills: +● Insight (you read them), −● Intimidation (you cannot frighten them). Guard: DC −●. Guilt: a Power play on a lover leaves YOU Guilty." },
  { id: "mentor",   label: "Mentor",    icon: "fa-graduation-cap",  school: "attention", guardDc: -1, guilt: false, mirror: "protege",  skills: { Insight: 1, Deception: -1 },
    hint: "They shaped you. Weapon: +● Emotion. Skills: +● Insight, −● Deception (you cannot fool your teacher). Guard: DC −●." },
  { id: "protege",  label: "Protégé",   icon: "fa-seedling",        school: "attention", guardDc: -1, guilt: true,  mirror: "mentor",   skills: { Persuasion: 1, Intimidation: -1 },
    hint: "You shaped them. Weapon: +● Emotion. Skills: +● Persuasion (they listen), −● Intimidation (menacing your ward shames you). Guard: DC −●. Guilt: turning Power on your ward leaves YOU Guilty." },
  { id: "rival",    label: "Rival",     icon: "fa-khanda",          school: "power",     guardDc: 0,  guilt: false, skills: { Performance: 1, Deception: -1 },
    hint: "A respected opponent. Weapon: +● Power. Skills: +● Performance (they rise to a show), −● Deception (they have studied your tricks)." },
  { id: "enemy",    label: "Enemy",     icon: "fa-skull",           school: "power",     guardDc: 1,  guilt: false, skills: { Intimidation: 1, Persuasion: -1 },
    hint: "Open hostility. Weapon: +● Power. Skills: +● Intimidation, −● Persuasion — you can't charm hatred, only lean on it. Guard: DC +●." },
  { id: "indebted", label: "Indebted",  icon: "fa-scale-unbalanced", school: "order",    guardDc: -1, guilt: false, mirror: "creditor", skills: { Persuasion: 1, Intimidation: -1 },
    hint: "You owe them. Weapon: +● Reason. Skills: +● Persuasion (you can appeal), −● Intimidation (a debtor has no standing to threaten). Guard: DC −●." },
  { id: "creditor", label: "Creditor",  icon: "fa-scale-unbalanced-flip", school: "order", guardDc: 0, guilt: false, mirror: "indebted", skills: { Intimidation: 1, Deception: -1 },
    hint: "They owe you. Weapon: +● Reason. Skills: +● Intimidation (the ledger speaks with your voice), −● Deception (they watch you closely now)." },
];

/**
 * Social Fencing statuses. Applied as Active Effects; every one of them
 * has a real mechanical bite that assess()/rollManeuver() reads:
 *
 *   rattled   — DC to sway them drops by 5 (their guard is down). Lasts the scene.
 *   smitten   — the charmer's Persuasion maneuvers roll with Advantage. Lasts the scene.
 *   provoked  — one-shot: the NEXT maneuver against them gains +2, then fades.
 *   guilted   — one-shot: the guilter's next maneuver rolls with Advantage, then fades.
 *   desperate — one-shot: the next attention maneuver (Flatter, Charm)
 *               by anyone rolls with Advantage, then fades.
 *   defiant   — walls off ALL maneuvers for an hour. The price of hitting an immunity.
 *
 * oneShot statuses are consumed automatically by applyOutcome after the roll
 * they influenced.
 */
const SOCIAL_CONDITIONS = {
  // Icons are core Foundry status icons (icons/svg/*) — present in every install.
  // `combat` — the rider that matters if talk turns to steel: it goes into the
  // Active Effect's description so the debuff follows them into the fight.
  // `midiChanges` — automation for dnd5e tables running midi-qol (harmless
  // no-ops elsewhere).
  // `links` — matching SYSTEM status ids added to the effect's `statuses`,
  //   so a5e/dnd5e native condition automation (e.g. A5E's own Rattled)
  //   picks the status up as if applied from the core list.
  // `dnd5eChanges` — plain numeric Active Effect changes for dnd5e.
  // `a5eChanges` — Level Up (standalone a5e) changes via the system's own
  //   roll-mode flags (value 1 = advantage, −1 = disadvantage, mode OVERRIDE),
  //   the same encoding a5e's built-in conditions use.
  rattled: {
    id: "rattled",
    label: "Rattled",
    icon: "icons/svg/daze.svg",
    color: "#9b6ee8",
    seconds: 3600,
    oneShot: false,
    description: "Composure cracked: the DC to sway them is reduced by 5. No reactions or expertise dice.",
    combat: "Shaken: −2 on saving throws (disadvantage on A5E), no expertise dice, no reactions (standard A5E Rattled).",
    links: ["rattled"],
    // Flat numbers apply on dnd5e core with no midi needed; a5e reads its own
    // roll-mode flags natively — both hit real saves outside the module.
    dnd5eChanges: [{ key: "system.bonuses.abilities.save", mode: 2, value: "-2" }],
    a5eChanges: [
      { key: "flags.a5e.effects.expertiseDice", mode: 5, value: 0, priority: 200 },
      { key: "flags.a5e.effects.rollMode.savingThrow.all", mode: 5, value: -1, priority: 50 },
    ],
  },
  smitten: {
    id: "smitten",
    label: "Smitten",
    icon: "icons/svg/regen.svg",
    color: "#e8557a",
    seconds: 3600,
    oneShot: false,
    description: "Charmed: cannot act against the charmer, and the charmer's Persuasion maneuvers roll with Advantage.",
    combat: "Cannot attack or knowingly harm the charmer (A5E Charmed). Once while smitten, the charmer may press ONE plausible demand — WIS save or comply. GM: if the charmer's side harms them, love curdles — Smitten breaks into Provoked against the charmer.",
    links: ["charmed"],
  },
  provoked: {
    id: "provoked",
    label: "Provoked",
    icon: "icons/svg/fire.svg",
    color: "#e8a855",
    seconds: 600,
    oneShot: true,
    description: "Off balance with anger: the next maneuver against them gains +2, then this fades.",
    combat: "Red mist — fixated on the provoker (A5E Fixated: they must move toward them, and can barely notice anyone else). GM: advantage / +2 attacking the PROVOKER, disadvantage / −2 attacking anyone else. Their guard drops: −2 AC (automatic).",
    links: ["fixated"],
    dnd5eChanges: [{ key: "system.attributes.ac.bonus", mode: 2, value: "-2" }],
    a5eChanges: [{ key: "system.attributes.ac.changes.bonuses.value", mode: 2, value: "-2" }],
  },
  guilted: {
    id: "guilted",
    label: "Guilted",
    icon: "icons/svg/net.svg",
    color: "#c07ce8",
    seconds: 600,
    oneShot: true,
    description: "Weighed down by obligation: the guilter's next maneuver rolls with Advantage, then this fades.",
    combat: "The weight drags every swing: −2 on their weapon attacks (disadvantage on A5E). GM: no reactions against the one they owe; if that one draws blood, Guilted collapses into Rattled.",
    dnd5eChanges: [
      { key: "system.bonuses.mwak.attack", mode: 2, value: "-2" },
      { key: "system.bonuses.rwak.attack", mode: 2, value: "-2" },
    ],
    a5eChanges: [{ key: "flags.a5e.effects.rollMode.attack.all", mode: 5, value: -1, priority: 50 }],
  },
  desperate: {
    id: "desperate",
    label: "Desperate",
    icon: "icons/svg/falling.svg",
    color: "#5588e8",
    seconds: 600,
    oneShot: true,
    description: "Starved and grasping: the next Flatter or Charm against them rolls with Advantage, and a Bargain cashes it for an extra String. Fades once used.",
    combat: "All-in: +2 on their weapon attacks (advantage on A5E) and they CRIT on a 19–20 (auto on dnd5e; on A5E lower their weapon's crit threshold to 19). But they've thrown away defense — −2 AC, and attacks against them have advantage too (A5E). A drowning swing that lands, lands hard.",
    dnd5eChanges: [
      { key: "system.bonuses.mwak.attack", mode: 2, value: "+2" },
      { key: "system.bonuses.rwak.attack", mode: 2, value: "+2" },
      { key: "system.attributes.ac.bonus", mode: 2, value: "-2" },
      { key: "flags.dnd5e.weaponCriticalThreshold", mode: 6, value: "19" },
    ],
    a5eChanges: [
      { key: "flags.a5e.effects.rollMode.attack.all", mode: 5, value: 1, priority: 50 },
      { key: "flags.a5e.effects.grants.rollMode.attack.all", mode: 5, value: 1, priority: 50 },
      { key: "system.attributes.ac.changes.bonuses.value", mode: 2, value: "-2" },
    ],
  },
  defiant: {
    id: "defiant",
    label: "Defiant",
    icon: "icons/svg/holy-shield.svg",
    color: "#e8c855",
    seconds: 600,
    oneShot: false,
    description: "Walls up: immune to social maneuvers (only Read Them slips through — and a successful read breaks the wall). Triggered by striking an archetype's immunity.",
    combat: "Dug in: +2 on their saving throws (advantage on A5E) — charm and fear break against the wall — but they cannot willingly retreat, disengage, or be talked out of the confrontation.",
    dnd5eChanges: [{ key: "system.bonuses.abilities.save", mode: 2, value: "+2" }],
    a5eChanges: [{ key: "flags.a5e.effects.rollMode.savingThrow.all", mode: 5, value: 1, priority: 50 }],
  },
};

/** Total Extended Triad points a character may distribute across the three triads. */
const TRIAD_POINT_POOL = 4;

/** Status ids in display order. */
const SOCIAL_CONDITION_ORDER = ["rattled", "smitten", "provoked", "guilted", "desperate", "defiant"];

class SocialArchetypeManager {
  static getFlagScope() {
    return SOCIAL_FENCING_SCOPE;
  }

  static getFlagKey() {
    return "socialFencing";
  }

  static getActorData(actor) {
    return actor?.getFlag(SocialArchetypeManager.getFlagScope(), SocialArchetypeManager.getFlagKey()) ?? {};
  }

  static async setActorData(actor, data) {
    if (!actor) return;
    const current = SocialArchetypeManager.getActorData(actor);
    await actor.setFlag(
      SocialArchetypeManager.getFlagScope(),
      SocialArchetypeManager.getFlagKey(),
      foundry.utils.mergeObject(current, data, { inplace: false })
    );
  }

  static getArchetypeById(id) {
    return SOCIAL_ARCHETYPES.find((archetype) => archetype.id === id) || null;
  }

  static getArchetype(actor) {
    const data = SocialArchetypeManager.getActorData(actor);
    return SocialArchetypeManager.getArchetypeById(data.archetypeId) || null;
  }

  static async setArchetype(actor, archetypeId) {
    const archetype = SocialArchetypeManager.getArchetypeById(archetypeId);
    if (!actor || !archetype) return;
    await SocialArchetypeManager.setActorData(actor, { archetypeId: archetype.id });
    return archetype;
  }

  static getCharacterNotes(actor) {
    const data = SocialArchetypeManager.getActorData(actor);
    return {
      archetypeId: data.archetypeId || null,
      motivation: data.motivation || "",
      personality: data.personality || "",
      psychotype: data.psychotype || "",
      intent: data.intent || "",
      notes: data.notes || "",
      triad: {
        power:     data.triad?.power     ?? 0,
        attention: data.triad?.attention ?? 0,
        order:     data.triad?.order     ?? 0,
      },
      points: Object.fromEntries(
        PROFILE_POINTS.map(p => [p.id, data.points?.[p.id] ?? ""])
      ),
    };
  }

  static async setCharacterNotes(actor, notes) {
    if (!actor) return;
    const payload = {
      archetypeId: notes.archetypeId || null,
      motivation: notes.motivation || "",
      personality: notes.personality || "",
      psychotype: notes.psychotype || "",
      notes: notes.notes || "",
    };
    if (notes.triad)  payload.triad  = notes.triad;
    if (notes.points) payload.points = notes.points;
    await SocialArchetypeManager.setActorData(actor, payload);
  }

  /**
   * The DEFENSIVE identity of a dots-built character (a PC). NPCs defend
   * with an archetype; a PC defends with the triad THEY built:
   *   ruling — unique maximum of 2+ dots, or null (a split build has no
   *            ruling nature: no home ground, no Answer — but no counter
   *            school reads them either).
   * Used for the counter cycle, "home ground" DC, blind spots and the Answer.
   */
  static getDefensiveProfile(actor) {
    const triad = SocialArchetypeManager.getCharacterNotes(actor).triad ?? {};
    const dots  = { power: triad.power ?? 0, attention: triad.attention ?? 0, order: triad.order ?? 0 };
    const total = dots.power + dots.attention + dots.order;
    const max   = Math.max(dots.power, dots.attention, dots.order);
    const leaders = Object.keys(dots).filter(k => dots[k] === max);
    const ruling  = (max >= 2 && leaders.length === 1) ? leaders[0] : null;
    return { dots, total, ruling };
  }

  static getArchetypeOptions() {
    return SOCIAL_ARCHETYPES.map((arch) => ({ id: arch.id, label: arch.label, triad: arch.triad }));
  }

  static getBondType(id) {
    return BOND_TYPES.find(t => t.id === id) ?? BOND_TYPES[0];
  }

  /**
   * The counterpart type from the OTHER side of the same relationship. Most
   * bonds are symmetric (friend↔friend, enemy↔enemy); the directional pairs
   * flip (mentor↔protégé, indebted↔creditor). Used to keep a single shared
   * bond synced on both actors' records.
   */
  static getBondMirror(id) {
    return SocialArchetypeManager.getBondType(id).mirror ?? id;
  }

  /** A random veiled reaction line for how this archetype cracks (or null). */
  static pickReaction(archId) {
    const pool = ARCHETYPE_REACTIONS[archId];
    return pool?.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** A random whispered Read Them tell for this archetype (or null). */
  static pickTell(archId) {
    const pool = ARCHETYPE_TELLS[archId];
    return pool?.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  static buildConditionEffect(conditionId, sourceActor = null) {
    const meta = SOCIAL_CONDITIONS[conditionId];
    if (!meta) return null;
    const sourceName = sourceActor?.name || "Social Fencing";

    // The combat rider travels with the effect — if talk turns to steel, the
    // debuff is already on the token. Numeric changes + midi flags automate
    // it on dnd5e; a5eChanges use Level Up's own roll-mode flags; `links`
    // hooks the system's own conditions (A5E Rattled, charmed) so native
    // automation treats it as the real thing.
    const description = meta.combat
      ? `${meta.description}<br><b>Combat:</b> ${meta.combat}`
      : meta.description;
    const changes = game.system.id === "dnd5e"
      ? foundry.utils.deepClone([...(meta.dnd5eChanges ?? []), ...(meta.midiChanges ?? [])])
      : game.system.id === "a5e"
        ? foundry.utils.deepClone(meta.a5eChanges ?? [])
        : [];

    return {
      name:  `${meta.label} (${sourceName})`,
      img:   meta.icon,
      icon:  meta.icon,
      origin: `module.${SocialArchetypeManager.getFlagScope()}`,
      disabled: false,
      duration: { seconds: meta.seconds ?? 3600 },
      statuses: [`tsl-${conditionId}`, ...(meta.links ?? [])],
      flags: {
        [SocialArchetypeManager.getFlagScope()]: {
          condition: conditionId,
          source: sourceName,
          sourceActorId: sourceActor?.id ?? null,
        },
      },
      changes,
      description,
    };
  }

  /** Apply a fencing status. No duplicates — re-applying refreshes the source. */
  static async applyCondition(actor, conditionId, sourceActor = null) {
    if (!actor) return;
    const existing = SocialArchetypeManager.getActiveCondition(actor, conditionId);
    if (existing) {
      // Refresh the source so combo checks (smitten/guilted) point at the newest actor
      if (sourceActor) {
        await existing.update({
          [`flags.${SocialArchetypeManager.getFlagScope()}.sourceActorId`]: sourceActor.id,
          [`flags.${SocialArchetypeManager.getFlagScope()}.source`]: sourceActor.name,
        });
      }
      return existing;
    }
    const effectData = SocialArchetypeManager.buildConditionEffect(conditionId, sourceActor);
    if (!effectData) return;
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return effectData;
  }

  static async removeCondition(actor, conditionId) {
    if (!actor) return;
    // Match flag OR statuses set, like getActiveCondition — a status toggled
    // from the token HUD must be consumable/removable exactly like ours.
    const alias = SOCIAL_CONDITIONS[conditionId]?.nativeAlias;
    const toRemove = actor.effects.filter((effect) =>
      effect.flags?.[SocialArchetypeManager.getFlagScope()]?.condition === conditionId
      || effect.statuses?.has?.(`tsl-${conditionId}`)
      || (alias && effect.statuses?.has?.(alias))
    );
    if (!toRemove.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map((e) => e.id));
  }

  /**
   * The ActiveEffect for a fencing status on this actor, or null.
   * Matches both module-applied effects (flag) and ones toggled from the
   * token HUD's main status list (statuses set `tsl-<id>`).
   */
  static getActiveCondition(actor, conditionId) {
    // nativeAlias: on systems whose OWN condition covers ours (A5E Rattled)
    // we register no duplicate — the native status counts as the social one.
    const alias = SOCIAL_CONDITIONS[conditionId]?.nativeAlias;
    return actor?.effects.find(e =>
      !e.disabled && (
        e.flags?.[SocialArchetypeManager.getFlagScope()]?.condition === conditionId
        || e.statuses?.has?.(`tsl-${conditionId}`)
        || (alias && e.statuses?.has?.(alias))
      )
    ) ?? null;
  }

  /** All active fencing statuses on this actor: [{ meta, effect, sourceActorId }]. */
  static getActiveConditions(actor) {
    if (!actor) return [];
    const scope = SocialArchetypeManager.getFlagScope();
    return SOCIAL_CONDITION_ORDER
      .map(id => {
        const effect = SocialArchetypeManager.getActiveCondition(actor, id);
        return effect
          ? { meta: SOCIAL_CONDITIONS[id], effect, sourceActorId: effect.flags?.[scope]?.sourceActorId ?? null }
          : null;
      })
      .filter(Boolean);
  }

  /**
   * Which maneuvers cut deep / bounce off for a given archetype — by NAME,
   * computed from the shared tag lists. This is the single source of truth
   * the UI uses to explain the archetype ↔ maneuver matrix.
   */
  static getManeuverRelationsFor(archetype) {
    if (!archetype || typeof SOCIAL_MANEUVERS === "undefined") return { vulnerable: [], immune: [] };
    return {
      vulnerable: SOCIAL_MANEUVERS.filter(m => m.vulnerabilityTags.some(t => archetype.vulnerabilities.includes(t))),
      immune:     SOCIAL_MANEUVERS.filter(m => m.immunityTags.some(t => archetype.immunities.includes(t))),
    };
  }

  /** Inverse lookup: which archetypes are vulnerable / immune to a maneuver. */
  static getArchetypeRelationsFor(maneuver) {
    return {
      vulnerable: SOCIAL_ARCHETYPES.filter(a => maneuver.vulnerabilityTags.some(t => a.vulnerabilities.includes(t))),
      immune:     SOCIAL_ARCHETYPES.filter(a => maneuver.immunityTags.some(t => a.immunities.includes(t))),
    };
  }

  /**
   * Extended Triad dots also sharpen the matching STANDARD skill checks:
   *   Power ● → Intimidation · Emotion ● → Insight · Order ● → Deception
   * Implemented as one module-managed Active Effect (+1 per dot on the
   * skill's check bonus), rebuilt whenever the dots change. PCs only —
   * NPCs have no dots. The aligned maneuver of your own school counting
   * the dot twice (skill bonus + school leaning) is intentional: that is
   * your signature move.
   */
  static async syncTriadBonusEffect(actor) {
    if (!actor) return;
    const scope = SocialArchetypeManager.getFlagScope();
    const stale = actor.effects.filter(e => e.flags?.[scope]?.triadBonus);
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
    if (!actor.hasPlayerOwner) return;

    const TRIAD_SKILLS = {
      power:     { dnd5e: "itm", a5e: "intimidation", label: "Intimidation" },
      attention: { dnd5e: "ins", a5e: "insight",      label: "Insight" },
      order:     { dnd5e: "dec", a5e: "deception",    label: "Deception" },
    };
    const triad   = SocialArchetypeManager.getCharacterNotes(actor).triad ?? {};
    const isDnd5e = game.system.id === "dnd5e";
    const changes = [];
    const lines   = [];
    for (const [t, m] of Object.entries(TRIAD_SKILLS)) {
      const dots = triad[t] ?? 0;
      if (!dots) continue;
      const key = isDnd5e ? `system.skills.${m.dnd5e}.bonuses.check` : `system.skills.${m.a5e}.bonuses.check`;
      changes.push({ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: `+${dots}`, priority: 20 });
      lines.push(`+${dots} ${m.label}`);
    }
    if (!changes.length) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Social Leanings",
      img: "icons/svg/upgrade.svg",
      origin: `module.${scope}`,
      disabled: false,
      changes,
      description: `Extended Triad leanings sharpen everyday social checks: ${lines.join(", ")} (Power → Intimidation, Emotion → Insight, Order → Deception; +1 per dot).`,
      flags: { [scope]: { triadBonus: true } },
    }]);
  }
}
