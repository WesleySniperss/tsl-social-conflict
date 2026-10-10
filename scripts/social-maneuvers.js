/**
 * tsl-social-conflict | social-maneuvers.js
 *
 * Social Fencing maneuver data and roller.
 * UI is handled by SocialFencingApp / TSLConflictApp.
 *
 * Flow: rollManeuver() only rolls dice and posts the chat card (any client).
 * Effects (states, strings, composure, wounds, whispers) are applied
 * exclusively on the GM client via SocialManeuverRoller.applyOutcome(), reached
 * either directly (GM) or through the GM_ACTION socket relay (players).
 */

console.log("TSL | Loading social-maneuvers.js...");

// ─── Maneuver groups ──────────────────────────────────────────────────────────

const MANEUVER_GROUPS = [
  { id: "general",   label: "General Tactics" },
  { id: "power",     label: "Triad of Power" },
  { id: "attention", label: "Triad of Emotion" },
  { id: "order",     label: "Triad of Reason" },
];

// ─── Maneuver data ────────────────────────────────────────────────────────────
//
// Each SCHOOL has a mechanical identity, and every maneuver a distinct role:
//   General — the basics: read, jab, goad, plus three plain tones of pressure —
//             Persuade (sincere: no Answer), Intimidate (hard, risky, cows them),
//             Lie (a lever, can get you caught) — and Reassure, aimed at an ally
//   Power   — domination: tempo and pressure; hits harder, risks harder
//   Emotion — hearts: states that chain into each other
//   Order   — ledgers: economy (Strings), information, field control
//
// damage              → how much COMPOSURE a landed maneuver takes from the target
// vulnerabilityTags ∩ archetype.vulnerabilities → Advantage, +1 damage
// immunityTags      ∩ archetype.immunities      → auto-fail, target Defiant
// applyOnSuccess      → the STATE it puts on them (see SOCIAL_CONDITIONS)
// reveals: true       → success whispers a TELL of their nature to the roller
// failCost            → how much of the ATTACKER's own composure a miss costs
//                       (default 1). Risky moves cost more to fumble.
// skill2              → the SUPPORT skill: if you're trained in it, your
//                       proficiency bonus rides on top of the main roll.
// failText            → flavour only — the card appends the real composure cost.

const SOCIAL_MANEUVERS = [

  // ── General Tactics ─────────────────────────────────────────────────────────

  {
    id:    "cold_reading",
    name:  "Read Them",
    skill: "Insight",
    icon:  "fa-eye",
    group: "general",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    skill2:          "Investigation",
    skillKeys2:      { dnd5e: "inv", "a5e-for-dnd5e": "investigation" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The scout. Watch the seams of their public face — no pressure, just attention.",
    howto:        "Say little, ask something easy, and watch HOW they answer, not what they say — the flicker before the words.",
    example:      "\"Your hand keeps drifting to that ring. Someone gave it to you — someone you've since lost. That's what all this bluster is really about, isn't it?\"",
    edge:         "Safe information: no blow to weigh, slips through a Defiant wall (and cracks it), whispers a tell and earns a String.",
    risk:         "Moves nothing on its own. And real people hide well — one flinch proves little; trust a pattern of tells, not a single one.",
    successText:  "A tell of their nature is whispered to you — deduce the archetype and note your guess in your Bond. You gain 1 String.",
    failText:     "The mask holds.",
    immuneText:   null,
    applyOnSuccess: null,
    grantStrings: 1,
    reveals: true,
    damage: 0,
    worksThroughDefiant: true,
  },

  {
    id:    "sow_doubt",
    name:  "Mock",
    skill: "Deception",
    icon:  "fa-theater-masks",
    group: "general",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: [],
    immunityTags:      ["sow doubt", "criticism"],   // Idol
    description:  "The jab. A joke with a razor in it — it takes them down a peg, and it cuts twice as deep into someone already off balance. Kick them while they're down.",
    howto:        "Land a joke at their expense for the room to hear — sharpest right after they've already stumbled.",
    example:      "\"A brave face, for the man who fainted at his own knighting. Does the memory still sting — or only your pride?\"",
    edge:         "Cheap pressure that leaves them Humbled (their threats and showmanship falter until they win back face) and bites harder on anyone already carrying a state (+1).",
    risk:         "Only 1 composure, and a joke needs an audience that laughs — against a proud ego it backfires.",
    successText:  "The barb lands where it hurts — Humbled: their Intimidation and Performance falter until they win back some face. Composure −1 (−2 if they were off balance).",
    failText:     "The joke dies in the air.",
    immuneText:   "They cannot imagine being the punchline.",
    applyOnSuccess: "humbled",
    grantStrings: 0,
    damage: 1,
    kickWhileDown: true,   // +1 dmg if the target has ANY fencing status (not consumed)
  },

  {
    id:    "instigate",
    name:  "Taunt",
    skill: "Performance",
    icon:  "fa-fire",
    group: "general",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    skill2:          "Intimidation",
    skillKeys2:      { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    vulnerabilityTags: [],
    immunityTags:      ["intimidate", "emotional intimidation"],  // Tyrant, Hermit
    description:  "The bait. Needle their self-control until they lash out and commit to something rash — leaving themselves wide open. You WANT them to take the swing; the value is the mistake, not the words.",
    howto:        "Jab a nerve so they REACT instead of think — you're not trying to wound them, you're trying to make them do something stupid you can punish.",
    example:      "\"You're shaking. Good. Go on — say the thing you've been swallowing all night. I dare you.\"",
    edge:         "The set-up: Provoked — they must come at YOU next and can't hold the line against you — and Humiliate cashes it for +1.",
    risk:         "Little damage by itself; the cold-blooded don't take the bait.",
    successText:  "They lose their cool — Provoked: their next maneuver must be aimed at you, and they can't hold the line against you. Composure −1.",
    failText:     "They remain unmoved.",
    immuneText:   "They answer with cold control.",
    applyOnSuccess: "provoked",
    grantStrings: 0,
    damage: 1,
  },

  {
    id:    "persuade",
    name:  "Persuade",
    skill: "Persuasion",
    icon:  "fa-comments",
    group: "general",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The honest appeal. Reason, common ground, a fair case — no tricks, no threats. Slow, but safe: an honest case that misses offends no one.",
    howto:        "Make your case plainly — appeal to what they actually care about and give them a real reason to agree.",
    example:      "\"We want the same thing here — the town safe, the road open. Help me hold the gate and everyone goes home tonight. What do you say?\"",
    edge:         "Sincere: even a bad miss draws no Answer, and it clears the Suspicion you've stirred. No nature walls it.",
    risk:         "Only 1 composure a hit: an honest case moves people slowly.",
    successText:  "Your case lands. Composure −1.",
    failText:     "They aren't convinced.",
    immuneText:   null,
    applyOnSuccess: null,
    grantStrings: 0,
    damage: 1,
    sincere: true,   // an honest case: a bad miss draws no Answer, and it clears Suspicious
  },

  {
    id:    "intimidate",
    name:  "Intimidate",
    skill: "Intimidation",
    icon:  "fa-hand-fist",
    group: "general",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The plain threat. Comply, or face what comes — quiet, personal, no crowd. HIGH-RISK basic: it hits hard (−2) and leaves them Cowed, but a threat you can't back up makes you look weak, so a miss costs YOU 2 composure. (Not Humiliate — that one's public and scars.)",
    howto:        "State the stakes and mean it — what you'll do if they don't bend. Only reach for it when you can back it up.",
    example:      "\"I know which window is your daughter's. Sign the writ, and I forget the address. It's a small thing to ask.\"",
    edge:         "The hardest basic: −2 composure and Cowed — they won't dare challenge you with Power moves or threats of their own. No nature is immune.",
    risk:         "A threat you can't back up makes you look weak — a miss costs YOU 2 composure. And you can't cow an enemy or a rival.",
    successText:  "The threat lands cold — Cowed: they won't dare challenge you with Power moves or threats. Composure −2.",
    failText:     "They call your bluff — and now you look weak.",
    immuneText:   null,
    applyOnSuccess: "cowed",
    grantStrings: 0,
    damage: 2,
    failCost: 2,   // a threat that misses makes you look weak — costs YOUR composure
  },

  {
    id:    "lie",
    name:  "Lie",
    skill: "Deception",
    icon:  "fa-user-secret",
    group: "general",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    skill2:          "Persuasion",
    skillKeys2:      { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The bald falsehood. A false promise, an invented ally, a fact that never was — believe it, and they hand you a lever. (Not Mock's jab or Undermine's slow doubt: a clean, confident lie.)",
    howto:        "Tell them one untrue thing that changes their maths, keep it simple, and let them act on it.",
    example:      "\"The magistrate already has your partner's signed confession — an hour ago. You're the only one who can still cut a deal.\"",
    edge:         "Pressure AND a lever: −1 composure and a String, against anyone.",
    risk:         "Get caught and it turns on you: a bad miss hands THEM a String on you and leaves them Suspicious of your every lie.",
    successText:  "They swallow it whole — you gain 1 String, a lever the lie hands you. Composure −1.",
    failText:     "They see straight through it.",
    caughtText:   "Caught in the lie — now they know what you are.",
    immuneText:   null,
    applyOnSuccess: null,
    grantStrings: 1,
    damage: 1,
    caughtOnBotch: true,   // a bad miss = caught lying: they take a String on you
  },

  {
    id:    "reassure",
    name:  "Reassure",
    skill: "Insight",
    icon:  "fa-hand-holding-heart",
    group: "general",
    skillKeys:       { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    skill2:          "Persuasion",
    skillKeys2:      { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: [],
    immunityTags:      [],
    description:  "The one maneuver you aim at a FRIEND. A calm word, a hand on the shoulder, the reminder of who they are — and they find their feet again.",
    howto:        "Turn to an ally mid-argument and steady them — name what they're doing right, remind them why they're here.",
    example:      "\"Breathe. You've stared down worse than him. Say it the way you said it to me last night — every word.\"",
    edge:         "Support: +1 composure back and Steadied (the next state anyone puts on them doesn't take); a clean one also makes them Undaunted (their next miss costs nothing). Against an easy mark (DC 10), and a miss costs you nothing.",
    risk:         "It moves no one on the other side — every Reassure is a turn you didn't press.",
    successText:  "They breathe again — +1 Composure, and Steadied: the next state anyone tries to put on them doesn't take.",
    critText:     "They stand taller than before — +2 Composure, Steadied, and Undaunted: their next miss costs them nothing.",
    failText:     "The words don't reach them in time.",
    immuneText:   null,
    applyOnSuccess: "steadied",
    grantStrings: 0,
    damage: 0,
    heal: 1,            // composure the ally recovers (+1 more on a clean hit)
    failCost: 0,        // a kind word that misses costs you nothing
    support: true,      // aimed at an ally: DC 10, no defence, no Answer
  },

  // ── Triad of Power — domination: hits harder, risks harder ─────────────────

  {
    id:    "flatter",
    name:  "Flatter",
    skill: "Persuasion",
    icon:  "fa-crown",
    group: "power",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    skill2:          "Deception",
    skillKeys2:      { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["appease", "flattery"],       // Tyrant → Advantage
    immunityTags:      [],
    description:  "Hold up the reflection they wish were true. Power through worship — they kneel to their own image.",
    howto:        "Praise the person they most wish they were — specific, and just believable enough that they want it to be true.",
    example:      "\"There's not another commander alive who'd have held that line. Your people followed you into hell and back — because you are worth following.\"",
    edge:         "No nature walls it; Enthralled — they can't move against you, they'd give in rather than storm off from you, and you can ask them one favor.",
    risk:         "A Reason-ruled mind sees the mirror for what it is (−2), and feeding an ego makes it bigger first.",
    successText:  "They fall for their own reflection — Enthralled: they can't move against you, and you can ask them one favor. Composure −2.",
    failText:     "The mirror shows the flattery for what it is.",
    immuneText:   null,
    applyOnSuccess: "smitten",
    grantStrings: 0,
    damage: 2,
  },

  {
    id:    "feigned_weakness",
    name:  "Play Weak",
    skill: "Deception",
    icon:  "fa-mask",
    group: "power",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: ["deceive", "feigned weakness"],  // Schemer → Advantage
    immunityTags:      ["scorn for weakness"],            // Duelist
    description:  "The deep bait. Show them your throat and count what they reveal reaching for it.",
    howto:        "Play small, cornered, harmless — let them lower their guard to help or to gloat, and note what they let slip.",
    example:      "\"You've completely outmaneuvered me — I don't even see how you did it. You'll have to explain it to me slowly; I clearly can't keep pace with someone like you.\"",
    edge:         "The deep bait: a String, and Intrigued — your next Read Them or Cross-Examine on them succeeds on its own.",
    risk:         "Only 1 composure — it's for leverage, not for winning; the proud despise weakness and it backfires.",
    successText:  "They lunge at the opening and start talking — Intrigued: your next Read Them or Cross-Examine on them succeeds on its own. You gain 1 String. Composure −1.",
    failText:     "They circle the bait, unconvinced.",
    immuneText:   "Weakness earns only their contempt.",
    applyOnSuccess: "intrigued",
    grantStrings: 1,
    damage: 1,
  },

  {
    id:    "throw_gauntlet",
    name:  "Humiliate",
    skill: "Intimidation",
    icon:  "fa-khanda",
    group: "power",
    skillKeys:       { dnd5e: "itm", "a5e-for-dnd5e": "intimidation" },
    skill2:          "Performance",
    skillKeys2:      { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    vulnerabilityTags: ["challenge", "glory"],            // Duelist → Advantage
    immunityTags:      ["emotional intimidation"],        // Hermit
    description:  "The public unmaking. Shame them before the people whose respect holds them up — strip that away and their will caves. Not a bait like Taunt: here the DAMAGE is the point, and it's heavy.",
    howto:        "Break their STANDING in front of witnesses — make the whole room watch them fall, and their confidence falls with it.",
    example:      "\"Tell them. Tell this whole room what you did at the river while your men drowned. Say it aloud — every one of us is waiting.\"",
    edge:         "The heaviest blow (−3), and the shame sticks — a lasting Shame wound; Provoked makes it −4.",
    risk:         "A miss costs you 2 composure; the shamed come back angry; someone who doesn't care about the room shrugs it off.",
    successText:  "The room turns on them. Composure −3 — and the shame doesn't wash off: a lasting Shame wound (it deepens if you shame them again).",
    failText:     "The gauntlet lies ignored, and the room saw you drop it.",
    immuneText:   "They walk away from the theatrics.",
    applyOnSuccess: null,
    grantStrings: 0,
    damage: 3,
    failCost: 2,
    // The heavy blow leaves a lasting mark, not just a dent — a public
    // humiliation plants (and, on repeat, deepens) a Shame Wound.
    woundOnSuccess: "shamed",
    combos: { provoked: { label: "They lash out into your trap — the fall is twice as public", damage: 1 } },
  },

  // ── Triad of Emotion — hearts: statuses that chain into combos ─────────────

  {
    id:    "love_bombing",
    name:  "Charm",
    skill: "Performance",
    icon:  "fa-heart",
    group: "attention",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    skill2:          "Persuasion",
    skillKeys2:      { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    vulnerabilityTags: ["love bombing"],              // Idol → Advantage
    immunityTags:      ["persuade", "sympathy"],      // Martyr
    description:  "Lay siege with sweetness. Adoration as a weapon — they open the gates themselves.",
    howto:        "Pour warm, undivided attention on them until being near you feels like the best thing in the room.",
    example:      "\"I've thought of nothing but this all week. When you walk into a room, everything else just… goes quiet. Stay a while. Talk to me.\"",
    edge:         "Enthralled plus a String — they confide in you; a Desperate target clings (+1).",
    risk:         "Only 1 composure; to someone who distrusts kindness, sweetness backfires.",
    successText:  "The gates open — Enthralled: they can't move against you, and you can ask them one favor. They confide: you gain 1 String. Composure −1.",
    failText:     "The display leaves them cold.",
    immuneText:   "Your sweetness deepens their contempt.",
    applyOnSuccess: "smitten",
    grantStrings: 1,
    damage: 1,
    combos: { desperate: { label: "Starved for warmth, they cling to the first kind word", damage: 1 } },
  },

  {
    id:    "cold_shoulder",
    name:  "Stir Jealousy",
    skill: "Performance",
    icon:  "fa-heart-circle-exclamation",
    group: "attention",
    skillKeys:       { dnd5e: "prf", "a5e-for-dnd5e": "performance" },
    skill2:          "Deception",
    skillKeys2:      { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    vulnerabilityTags: ["stone-walling", "ignore"],   // Martyr → Advantage
    immunityTags:      ["selfless focus"],            // Caretaker
    description:  "Warmth, aimed anywhere but at them. Make it clear you're wanted elsewhere — praise a rival present OR conjure one who isn't ('others would leap at this'), hint you're spoiled for choice. The rival can be real or invented; what bites is the fear of losing you to someone. They chase what they think they're losing.",
    howto:        "Turn your warmth toward someone else — real or invented — so they scramble to win your attention back.",
    example:      "\"Kaelen listens as though every word I say matters — so rare, in a man. Don't fret over it, though; I know I'm hardly a priority of yours.\"",
    edge:         "−2 composure and Desperate: they can't walk away from YOU — break them and they give in rather than storm off — and Charm or Bargain cash it.",
    risk:         "Needs a believable rival; someone who gives rather than takes won't compete.",
    successText:  "The thought of someone else in your favor gnaws at them. They talk faster, lean closer, work to win you back — Desperate: they can't walk away from you. Composure −2.",
    failText:     "They call the bluff — they don't believe in your other admirers.",
    immuneText:   "They'd rather you gave the attention to someone who needs it.",
    applyOnSuccess: "desperate",
    grantStrings: 0,
    damage: 2,
  },

  {
    id:    "guilt_trip",
    name:  "Guilt Trip",
    skill: "Persuasion",
    icon:  "fa-scale-unbalanced",
    group: "attention",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["guilt", "obligation"],       // Caretaker → Advantage
    immunityTags:      ["shameless"],                 // Schemer
    description:  "Lay out everything you gave and everything they cost you — and let the weight of it crush.",
    howto:        "Quietly recount what you gave and what it cost you, until carrying that debt becomes their problem.",
    example:      "\"I gave up everything so that you could have your chance at this. I've never once asked you to repay it — which is why I cannot fathom how you'd refuse me now.\"",
    edge:         "−2 composure and Beholden: they owe you — call the debt for a true answer or a favor, and learn one of their secrets. An Enthralled target pays a String.",
    risk:         "Needs a conscience — the shameless are untouched, and it works best on those who already owe you.",
    successText:  "The weight settles on their shoulders — Beholden: they owe you, and you can call the debt. Composure −2.",
    failText:     "They shrug the weight off.",
    immuneText:   "Shame needs a conscience.",
    applyOnSuccess: "guilted",
    grantStrings: 0,
    damage: 2,
    combos: { smitten: { label: "An enthralled heart weighs every debt double", strings: 1 } },
  },

  // ── Triad of Reason — ledgers: economy, information, field control ──────────

  {
    id:    "gaslight",
    name:  "Undermine",
    skill: "Deception",
    icon:  "fa-brain",
    group: "order",
    skillKeys:       { dnd5e: "dec", "a5e-for-dnd5e": "deception" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["gaslighting", "exploiting dogma"],  // Zealot → Advantage
    immunityTags:      ["ledger mind"],                       // Broker
    description:  "Field control. Pull one thread of what they believe and let the whole cloth loosen.",
    howto:        "Pick one thing they're sure of and calmly make them doubt it — 'are you certain that's how it went?'",
    example:      "\"That isn't how it happened, and I think you know it. You've been forgetting things lately — small things. Perhaps sit down before you say something you'll regret.\"",
    edge:         "Rattled: their next maneuver rolls with disadvantage — and Invoke Authority cashes it (+1).",
    risk:         "Only 1 composure; it fails against anyone who keeps records — doubt dies against a ledger.",
    successText:  "Their certainty frays — Rattled: their next maneuver rolls with disadvantage. Composure −1.",
    failText:     "The weave holds firm.",
    immuneText:   "They check the ledger — it says otherwise.",
    applyOnSuccess: "rattled",
    grantStrings: 0,
    damage: 1,
  },

  {
    id:    "logic_exploit",
    name:  "Cross-Examine",
    skill: "Investigation",
    icon:  "fa-puzzle-piece",
    group: "order",
    skillKeys:       { dnd5e: "inv", "a5e-for-dnd5e": "investigation" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["information deficit", "logic puzzles"],  // Hermit → Advantage
    immunityTags:      ["bribes", "emotions", "pure logic"],      // Zealot, Schemer
    description:  "The scholar's cut. Find the flaw in their reasoning and pry it open — it hurts AND it teaches.",
    howto:        "Ask precise, patient questions until a contradiction shows — then press on that exact crack.",
    example:      "\"You swore you'd never met the man. Yet here is your own seal on his letter, dated the very night you claim you were a hundred miles away. So which is lying — you, or the wax?\"",
    edge:         "Damage AND information: −2 composure, a whispered tell, a String — and Exposed: their lies stop working, and you learn their Mask.",
    risk:         "Rolls Investigation — hard for a pure charmer; a mind at home in argument out-talks you and it backfires.",
    successText:  "The flaw betrays them — Exposed: their Deception falters and their Mask is whispered to you; a tell of their nature too, and 1 String. Composure −2.",
    failText:     "Your argument doesn't land.",
    immuneText:   "They dismiss the reasoning outright.",
    applyOnSuccess: "exposed",
    grantStrings: 1,
    reveals: true,
    damage: 2,
    combos: { guilted: { label: "Beholden, they over-explain — every excuse is a loose thread", strings: 1 } },
  },

  {
    id:    "sweeten_deal",
    name:  "Bargain",
    skill: "Persuasion",
    icon:  "fa-coins",
    group: "order",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    skill2:          "Insight",
    skillKeys2:      { dnd5e: "ins", "a5e-for-dnd5e": "insight" },
    vulnerabilityTags: ["deal", "greed"],             // Broker → Advantage
    immunityTags:      ["bribes"],                    // Zealot
    description:  "Every gift is a link. Put a concrete offer on the table and watch it close around their wrist.",
    howto:        "Put a concrete offer on the table — 'I'll do X if you do Y' — and let the deal do the persuading.",
    example:      "\"Give me the ledger, and the guard captain never hears your name. One page, and you walk out of here a free man. Do we have a deal?\"",
    edge:         "The economy move: −2 composure and two Strings; a Desperate target pays one more.",
    risk:         "Every deal is a promise you'll be held to; to the incorruptible, an offer is a bribe and it backfires.",
    successText:  "They accept the terms — and the chain. You gain 2 Strings; the obligation weighs. Composure −2.",
    failText:     "Your price is wrong.",
    immuneText:   "They recoil from the offer as corruption itself.",
    applyOnSuccess: null,
    grantStrings: 2,
    damage: 2,
    combos: { desperate: { label: "A desperate soul signs anything", strings: 1 } },
  },

  {
    id:    "invoke_authority",
    name:  "Invoke Authority",
    skill: "Persuasion",
    icon:  "fa-stamp",
    group: "order",
    skillKeys:       { dnd5e: "per", "a5e-for-dnd5e": "persuasion" },
    skill2:          "History",
    skillKeys2:      { dnd5e: "his", "a5e-for-dnd5e": "history" },
    vulnerabilityTags: ["authority"],                 // Zealot → Advantage
    immunityTags:      ["sovereign"],                 // Tyrant
    description:  "Name a power above you both — a law, an order, a seal, a precedent — and make yielding to it the only proper thing to do. Not your will against theirs: the rule's.",
    howto:        "Put the higher name on the table and step behind it: 'it isn't me asking — it's the law / the Duke / the Guild'.",
    example:      "\"This is the Duke's seal. The bridge tolls were his to set, and tonight he has set them aside for us. You wouldn't defy your own lord's hand — would you?\"",
    edge:         "−2 composure, and the classic follow-up to doubt: a Rattled target grabs the certainty you offer (+1).",
    risk:         "Needs a real higher name in the fiction — a bluffed one can be checked; someone who IS the authority laughs it off and it backfires.",
    successText:  "The higher name settles it — they yield to the rule, not to you. Composure −2.",
    failText:     "They don't recognise the authority — or don't believe you speak for it.",
    immuneText:   "\"There is no authority here but mine.\"",
    applyOnSuccess: null,
    grantStrings: 0,
    damage: 2,
    combos: { rattled: { label: "Shaken by doubt, they grab the certainty you offer", damage: 1 } },
  },
];

// ─── Roller ────────────────────────────────────────────────────────────────────

/**
 * Options for every module Dialog: the `tsl-dialog` class swaps Foundry's
 * parchment for the module's own dark look, so a prompt reads as part of the
 * same table as the Chronicle and the conflict window. A fresh object each call
 * (Foundry merges options, never trust a shared one).
 */
function tslDialogOptions(extra = {}) {
  return { classes: ["dialog", "tsl-dialog"], width: 460, ...extra };
}

// A String is a TRUMP CARD: burning one is +5 — it almost always turns a
// near miss. Earned by OPENING UP at the table, by maneuvers that hand you a
// lever, and by winning an exchange. It gives NO passive edge — it is only ever
// SPENT (the post-miss gamble, or the anytime Pull +5 on any roll against that person).
const STRING_SPEND_BONUS = 5;

/**
 * The triad counter cycle — every archetype is soft-weak (+2 to the attacker)
 * against maneuvers of the school that counters its ruling triad:
 *   Power breaks Emotion  (dominance cows the needy)
 *   Emotion cracks Reason  (feelings undermine systems)
 *   Reason binds Power     (contracts and logic tie the mighty down)
 * Maps maneuver group → the defender triad it counters.
 */
const TRIAD_COUNTERS = { power: "attention", attention: "order", order: "power" };

/**
 * THE ANSWER — one rule for "don't get caught". When you fumble badly (miss
 * by 5+) or hit their immunity outright, the archetype answers in its
 * triad's own language, and the debuff lands on YOU:
 *   Power   — they tower over the misstep: YOU are Rattled.
 *   Emotion — they make your fumble about THEIR hurt: YOU are Beholden.
 *   Reason  — they file it away: a String on you.
 * Predictable if you know their nature; evidence for deduction if you don't.
 */
const TRIAD_ANSWER = {
  power:     { status: "rattled",
               risk: "you'll be Rattled",
               line: (src, tgt) => `${tgt} answers the misstep with sheer presence — <b>${src} is Rattled</b>.` },
  attention: { status: "guilted",
               risk: "you'll be Beholden to them",
               line: (src, tgt) => `${tgt} turns the fumble into THEIR wound, and the room feels it — <b>${src} is Beholden</b>: ${tgt} can call the debt.` },
  order:     { strings: 1,
               risk: "they'll gain a String on you",
               line: (src, tgt) => `${tgt} quietly files the fumble away — <b>a String on ${src}</b>.` },
};

/**
 * Hold the Line: which Wounds may be carried INSTEAD of a state — refusing it
 * turns it into the matching lasting feeling (SOCIAL_CONDITIONS[*].holdAs).
 * A state with `noHold` (protective, good, or born of the other side's
 * mistake) can't be refused.
 */
function holdOptionsFor(stateId) {
  const meta = SOCIAL_CONDITIONS[stateId];
  return (meta && !meta.noHold && !meta.positive) ? (meta.holdAs ?? []) : [];
}

/**
 * THE CIRCULATION — emotional WOUNDS (TSL Conditions) are open doors for
 * matching maneuvers: +2, NOT consumed (wounds clear through drama, not use).
 * This closes the loop TSL-style: Speak from the Heart / Hold the Line
 * inflict Conditions → Conditions open doors for the fencing → landed
 * maneuvers force new Hold-the-Line choices → new wounds, new doors.
 * Which wound you take when holding the line decides which doors open on you.
 */
const CONDITION_OPENINGS = {
  // Anger feeds the CHEAP jabs (goad + mock), NOT Humiliate — otherwise a
  // single Humiliate (which plants Angry) makes the next Humiliate +2, a
  // self-reinforcing spiral. Taunt→Humiliate stays the intended chain via
  // the Provoked combo, not via the wound.
  instigate:      { angry:    "their temper is already lit", spiteful: "their grudge makes them rash" },
  sow_doubt:      { shamed:   "shame makes every jab land", scared: "their fear makes every jab land", angry: "fury makes them careless" },
  persuade:       { grieving: "in grief, a kind and honest word reaches deep" },
  flatter:        { obsessed: "a fixated heart drinks in praise", jealous: "they ache to be the one chosen" },
  love_bombing:   { obsessed: "a fixated heart drinks in warmth", jealous: "they ache to be the one chosen", hopeless: "in the dark, any warmth will do" },
  cold_shoulder:  { jealous:  "jealousy is already gnawing at them" },
  guilt_trip:     { obsessed: "a fixated heart weighs every word", grieving: "grief makes every debt heavier", shamed: "shame makes them pay twice" },
  logic_exploit:  { scared:   "their fear makes them over-explain", doubting: "they no longer trust their own story" },
  gaslight:       { scared:   "their fear makes every doubt land", doubting: "doubt feeds on doubt" },
  sweeten_deal:   { hopeless: "in the dark, any offer glows", grieving: "grief makes any comfort worth the price" },
  invoke_authority: { scared: "fear makes them cling to the rules", doubting: "they crave someone else's certainty" },
};

/** First open wound on the target that this maneuver can walk through. */
function findOpening(targetActor, maneuver) {
  if (typeof TSLConditionEffects === "undefined") return null;
  for (const [condId, flavor] of Object.entries(CONDITION_OPENINGS[maneuver.id] ?? {})) {
    if (TSLConditionEffects.hasCondition(targetActor, condId)) return { cond: condId, flavor };
  }
  return null;
}

class SocialManeuverRoller {
  static getManeuver(id) {
    return SOCIAL_MANEUVERS.find(m => m.id === id) ?? null;
  }

  /**
   * A one-line key for the corner marks on maneuver chips — the full meaning
   * lives in each item's tooltip. The GM's marks follow the truth; a player's
   * ◎/✕/▲ follow their own read of the target (the "Read as" in their Bond),
   * ⊕ reads off visible conditions.
   */
  static chipLegend(isGM) {
    const byRead = isGM ? "" : " (by your read — it may be wrong)";
    const items = [
      ["◎", "weak spot", `Their weak spot${byRead} — cuts deep: Advantage and +1 damage.`],
      ["✕", "walled", `It bounces off${byRead} — they're walled against this approach.`],
      ["▲", "yields", `Their nature yields to this school${byRead} — +2.`],
      ["⊕", "opening", "An opening is live — a condition on them makes this maneuver stronger (a state you set up, or a lasting emotional wound they carry)."],
    ];
    return `<div class="tsl-chip-legend">${items.map(([g, w, tip]) =>
      `<span class="tsl-legend-item" data-tooltip="${tip}"><b>${g}</b> ${w}</span>`).join("")}</div>`;
  }

  /** A Scar's module-side value for this actor (0 / false when none carries it). */
  static _scarFlag(actor, field) {
    if (!actor || typeof TSLConditionEffects === "undefined") return 0;
    for (const id of TSLConditionEffects.getScars(actor)) {
      const v = TSLConditionEffects.getScarMeta(id)?.[field];
      if (v) return v;
    }
    return 0;
  }

  /** Cruelty and its kin: how much harder this actor's landed maneuvers hit. */
  static _scarHarder(actor) {
    return Number(SocialManeuverRoller._scarFlag(actor, "harder")) || 0;
  }

  /** The actor's proficiency bonus (number), with level/CR fallback. */
  static getProfBonus(actor) {
    const sys = actor.system ?? {};
    let prof = sys.attributes?.prof;
    if (typeof prof !== "number") prof = prof?.value;
    if (typeof prof !== "number") {
      const tier = sys.details?.level ?? sys.details?.cr ?? 1;
      prof = 2 + Math.floor((Math.max(1, tier) - 1) / 4);
    }
    return prof;
  }

  /** The modifier for a skillKeys map on this actor (0 if none resolves). */
  static _modForKeys(actor, skillKeys) {
    if (!skillKeys) return 0;
    // Try the system-native key first, then the other systems' keys —
    // and read whichever numeric field the system actually computes.
    const keys = [...new Set([
      skillKeys[game.system.id],
      skillKeys["a5e-for-dnd5e"],
      skillKeys["dnd5e"],
    ].filter(Boolean))];
    for (const key of keys) {
      const entry = actor.system?.skills?.[key];
      if (!entry) continue;
      // dnd5e computes .total = ability + proficiency + bonuses — trust it
      if (typeof entry.total === "number") return entry.total;
      let v = entry.mod ?? entry.value;
      if (typeof v !== "number") continue;
      // Systems without .total (a5e) expose the raw ability mod plus a
      // proficiency flag/multiplier — fold proficiency in ourselves so a
      // trained character actually rolls better than an untrained one.
      const mult = Number(entry.proficient ?? entry.prof ?? entry.proficiency ?? 0);
      if (mult > 0) v += Math.floor(SocialManeuverRoller.getProfBonus(actor) * mult);
      // …and the triad-dot "Social Leanings" bonus, which the system's own
      // roll adds from bonuses.check — so the number we show (and roll on the
      // module's own path) matches what the sheet rolls.
      v += SocialArchetypeManager.leanSkillBonus(actor, key);
      return v;
    }
    return 0;
  }

  /** The PRIMARY skill modifier (the d20 roll's own skill). */
  static getSkillMod(actor, maneuver) {
    return SocialManeuverRoller._modForKeys(actor, maneuver.skillKeys);
  }

  /**
   * The EXPLICIT part of the triad dots inside the primary skill: how much of
   * `getSkillMod` comes from the actor's "Social Leanings" effect, and which
   * triad gave it — so the bars can say "incl. +2 Power leaning".
   */
  static getLeanInSkill(actor, maneuver) {
    const key = maneuver?.skillKeys?.dnd5e;   // dnd5e and a5e share the 3-letter keys
    const value = SocialArchetypeManager.leanSkillBonus(actor, key);
    if (!value) return null;
    const triadId = Object.entries(SocialArchetypeManager.TRIAD_SKILLS).find(([, m]) => m.key === key)?.[0];
    const label = (SOCIAL_TRIADS[triadId]?.label ?? "").replace("Triad of ", "");
    return { value, triad: label, why: SocialArchetypeManager.TRIAD_SKILLS[triadId]?.why ?? "" };
  }

  /**
   * The SUPPORT skill's contribution: your proficiency bonus if you're trained
   * in it (half, rounded down, for half-proficiency), else 0. Only the TRAINING
   * counts — the ability modifier is not added a second time, so a maneuver
   * whose two skills share an ability (most CHA pairs) doesn't count CHA twice
   * and the d20 still matters against an ordinary target.
   */
  static getSupportBonus(actor, maneuver) {
    const keys = maneuver?.skillKeys2;
    if (!keys) return 0;
    const cand = [...new Set([keys[game.system.id], keys["a5e-for-dnd5e"], keys["dnd5e"]].filter(Boolean))];
    for (const key of cand) {
      const entry = actor?.system?.skills?.[key];
      if (!entry) continue;
      // dnd5e: `proficient` = the multiplier (0 / 0.5 / 1 / 2); a5e: a number
      // (0 / 1 …); older shapes may only carry prof.multiplier.
      const raw  = entry.proficient ?? entry.prof?.multiplier ?? 0;
      const mult = typeof raw === "boolean" ? (raw ? 1 : 0) : (Number(raw) || 0);
      if (mult <= 0) return 0;
      const prof = SocialManeuverRoller.getProfBonus(actor);
      return mult >= 1 ? prof : Math.floor(prof / 2);
    }
    return 0;
  }

  /** Hover text for a roll grade on the dice overlays (the dice's verdict). */
  static gradeTip(outcome, natural = null) {
    const nat = natural === 1 ? "A natural 1 always misses, whatever the total. " : "";
    return {
      crit:    "Clean hit — beat the difficulty by 5+: the maneuver lands and takes 1 more composure. (The GM confirms the final grade.)",
      success: "Hit — the maneuver lands: the target loses composure and takes its state, unless they Hold the Line against the state by carrying a Wound instead. (The GM confirms the final grade.)",
      failure: `${nat}Miss — nothing lands, and the attacker loses composure of their own.`,
      botch:   `${nat}Bad miss — 5+ under: the attacker loses composure AND the target answers in their own style (Rattled · Beholden · a String on you).`,
      immune:  "Walled off — this approach slides off their nature: no effect, it costs the attacker like a miss, and they turn Defiant.",
    }[outcome] ?? "";
  }

  /**
   * What a failed maneuver costs the ATTACKER's own composure: the maneuver's
   * `failCost` (default 1), +1 if they pressed a Fear — a threat that misses
   * backfires on the one who made it.
   */
  static missCost(maneuver, leverage = null) {
    return (maneuver?.failCost ?? 1) + (leverage === "fear" ? 1 : 0);
  }

  static getPassiveInsight(actor) {
    const skills = actor.system?.skills ?? {};
    const ins = skills.ins ?? skills.insight;
    if (typeof ins?.passive === "number") return ins.passive;
    const v = ins?.total ?? ins?.mod ?? ins?.value;
    return 10 + (typeof v === "number" ? v : 0);
  }

  /**
   * A target's SAVING-THROW modifier for an ability — their real mental
   * fortitude, proficiency baked in where they have it.
   *   dnd5e: `abilities.<key>.save` is already the numeric total.
   *   a5e / generic: reconstruct as ability mod + proficiency (if proficient
   *   in that save) — robust to a5e's field-name churn.
   */
  static getSaveMod(actor, key) {
    const ab = actor?.system?.abilities?.[key];
    if (!ab) return 0;
    if (typeof ab.save === "number") return ab.save;               // dnd5e
    const base = typeof ab.mod === "number" ? ab.mod : 0;
    const prof = (ab.save?.proficient || ab.proficient)
      ? SocialManeuverRoller.getProfBonus(actor) : 0;
    return base + prof;
  }

  /**
   * Social DC — the target defends with their TWO mental SAVING THROWS,
   * mirroring the attacker's two skills: 10 + WIS save + INT save, or passive
   * Insight when that's higher. Saves (not raw ability mods) mean a mentally
   * fortified target — one proficient in WIS/INT saves — is genuinely hard,
   * while a dim mook folds. WIS = read/willpower, INT = refusal to be fooled.
   */
  static getSocialDC(actor) {
    return Math.max(
      SocialManeuverRoller.getPassiveInsight(actor),
      10 + SocialManeuverRoller.getSaveMod(actor, "wis") + SocialManeuverRoller.getSaveMod(actor, "int")
    );
  }

  /**
   * Returns "immune" | "vulnerable" | "neutral" (archetype only, no statuses).
   * `archOverride`: undefined → use the target's REAL archetype (GM/roll);
   * an Archetype or null → use that instead (a player's GUESS for display).
   */
  static getRelation(targetActor, maneuver, archOverride = undefined) {
    const arch = archOverride !== undefined ? archOverride : SocialArchetypeManager.getArchetype(targetActor);
    if (!arch) return "neutral";
    if (maneuver.immunityTags.some(t => arch.immunities.includes(t)))           return "immune";
    if (maneuver.vulnerabilityTags.some(t => arch.vulnerabilities.includes(t))) return "vulnerable";
    return "neutral";
  }

  /**
   * The single source of truth for how a maneuver lands on a target:
   * archetype relation, states, openings, DC breakdown, advantage/disadvantage
   * and bonuses. Used by the pre-roll bar AND by the roll itself, so what the
   * player sees is exactly what the dice do.
   *
   * options.leverage — "desire" | "fear" | "weakness" | null. A dossier card
   * (VTM-style leverage), playable once per encounter:
   *   desire   — soft leverage: Advantage; on success +1 damage
   *   fear     — hard leverage: +3 to the roll; a miss costs you 1 more composure
   *   weakness — exposes the crack: a neutral maneuver counts as a vulnerability
   *
   * States work two ways (v2.0): the ones the ATTACKER carries change their own
   * roll or their choice of target (Rattled, Humbled, Exposed → disadvantage;
   * Provoked → must answer the provoker; Cowed → no Power moves or threats at
   * whoever cowed them; Enthralled → can't move against the charmer), and the
   * ones the TARGET carries open them up (Suspicious → your lies falter;
   * Intrigued → your next read lands on its own; set-ups a finisher cashes).
   *
   * Returns {
   *   arch, relation: "blocked"|"immune"|"vulnerable"|"neutral", relationReason,
   *   advantage, advantageReasons, disadvantage, disadvantageReasons,
   *   bonus, bonusReasons: [{label,value}], autoSuccess, autoReason,
   *   dc, dcBase, dcMods: [{label,value}], skillMod, consumes: [stateId], leverage,
   *   missCost, canBreak, selfThin, selfLast, support, …
   * }
   */
  static assess(sourceActor, targetActor, maneuver, options = {}) {
    const leverage = options.leverage ?? null;
    const scope    = SocialArchetypeManager.getFlagScope();
    const support  = !!maneuver.support;
    // options.archetypeOverride: a player's GUESS (or null = no guess) used for
    // the pre-roll display; leave undefined to use the REAL archetype (rolls, GM).
    const arch     = options.archetypeOverride !== undefined
      ? options.archetypeOverride
      : SocialArchetypeManager.getArchetype(targetActor);
    // Defensive identity: an NPC defends with its archetype's triad; a PC
    // (no archetype) defends with the triad THEY built from dots. A split
    // build has no ruling nature — unreadable, but answerless.
    const defProfile = arch ? null : SocialArchetypeManager.getDefensiveProfile(targetActor);
    const defTriad   = arch?.triad ?? defProfile?.ruling ?? null;
    const skillMod = SocialManeuverRoller.getSkillMod(sourceActor, maneuver);
    // States on the TARGET…
    const cond     = (id) => SocialArchetypeManager.getActiveCondition(targetActor, id);
    const condBy   = (id) => {
      const e = cond(id);
      return e && e.flags?.[scope]?.sourceActorId === sourceActor.id ? e : null;
    };
    // …and on the ATTACKER (with who put them there)
    const mine     = (id) => SocialArchetypeManager.getActiveCondition(sourceActor, id);
    const mineFrom = (id) => { const e = mine(id); return e ? (e.flags?.[scope]?.sourceActorId ?? null) : undefined; };

    // ── DC: 10 + WIS save + INT save (or passive Insight), ± bond ──────────────
    // Reassure aims at a friend: nothing to beat but nerves — DC 10.
    const dcBase = support ? 10 : SocialManeuverRoller.getSocialDC(targetActor);
    const dcMods = [];
    if (!support) {
      // THEIR bond toward you is their guard: type × strength decides whether
      // the door stands open (friend/lover: DC −strength) or barred (enemy:
      // DC +strength — you can't charm hatred).
      const theirBond = TSLBondStore.find(targetActor.id, sourceActor.id);
      if (theirBond) {
        const meta = SocialArchetypeManager.getBondType(theirBond.type);
        const str  = TSLBondStore.getStrength(targetActor.id, sourceActor.id);
        const dcFx = (meta?.guardDc ?? 0) * str;
        if (dcFx) {
          dcMods.push({
            label: dcFx < 0
              ? `their guard is down for you — ${meta.label} ${"●".repeat(str)}`
              : `they are wary of you — ${meta.label} ${"●".repeat(str)}`,
            value: dcFx,
          });
        }
      }
      // Table-wide difficulty knob (world setting) — raise it if people fold too
      // easily. A flat bump on every social DC, shown in the GM breakdown.
      let dcTable = 0;
      try { dcTable = Number(game.settings.get("tsl-social-conflict", "socialDcBonus")) || 0; } catch (e) {}
      if (dcTable) dcMods.push({ label: "table difficulty", value: dcTable });
    }
    const dc = dcMods.reduce((sum, m) => sum + m.value, dcBase);

    // Composure on both sides — what a miss costs you, and how close each is
    // to breaking. Undaunted: your next miss costs nothing.
    const enc       = SocialEncounterManager.getEncounter(targetActor);
    const srcEnc    = SocialEncounterManager.getEncounter(sourceActor);
    const undaunted = !!mine("undaunted");
    const baseCost  = SocialManeuverRoller.missCost(maneuver, leverage);
    const missCost  = undaunted ? 0 : baseCost;
    const selfThin  = srcEnc.active && srcEnc.composure <= Math.floor((srcEnc.maxComposure ?? 0) / 2);
    const selfLast  = srcEnc.active && missCost > 0 && srcEnc.composure <= missCost;

    // ── Hard walls: a finished exchange, Defiant, and the attacker's own states ──
    let relation = "neutral";
    let relationReason = null;
    const doneLabel   = (o) => o === "swayed" ? "given in" : "stormed off";
    const nameOf      = (id) => game.actors.get(id)?.name ?? "someone";
    const provokedBy  = mineFrom("provoked");
    const cowedBy     = mineFrom("cowed");
    if (enc.outcome) {
      // Once someone gives in or storms off, their exchange is OVER — no more
      // maneuvers (and no farming Strings off a finished conversation) until
      // the GM resets it or play moves to another scene.
      relation = "blocked";
      relationReason = `${targetActor.name} has ${doneLabel(enc.outcome)} — this exchange is over (the GM can reset it in their Chronicle → Fencing).`;
    } else if (srcEnc.outcome) {
      relation = "blocked";
      relationReason = `You've ${doneLabel(srcEnc.outcome)} — you're out of this exchange (the GM can reset it in your Chronicle → Fencing).`;
    } else if (provokedBy && provokedBy !== targetActor.id) {
      relation = "blocked";
      relationReason = `You're Provoked by ${nameOf(provokedBy)} — your next maneuver must be aimed at them.`;
    } else if (!support && cond("defiant") && !maneuver.worksThroughDefiant) {
      relation = "blocked";
      relationReason = "Defiant — walled off from maneuvers. A successful Read Them breaks the wall.";
    } else if (!support && mineFrom("smitten") === targetActor.id) {
      relation = "blocked";
      relationReason = "You're Enthralled by them — you can't bring yourself to move against them.";
    } else if (cowedBy === targetActor.id && (maneuver.group === "power" || maneuver.id === "intimidate")) {
      relation = "blocked";
      relationReason = "You're Cowed by them — you don't dare challenge them with Power moves or threats.";
    } else if (!support && arch && maneuver.immunityTags.some(t => arch.immunities.includes(t))) {
      relation = "immune";
      relationReason = `${arch.label}: this approach slides right off them`;
    } else if (!support && arch && maneuver.vulnerabilityTags.some(t => arch.vulnerabilities.includes(t))) {
      relation = "vulnerable";
      relationReason = `${arch.label}: this is exactly their weak spot`;
    }

    // Exposed weakness turns a neutral approach into a vulnerability strike
    if (!support && leverage === "weakness" && relation === "neutral") {
      relation = "vulnerable";
      relationReason = "Exposed weakness — the crack where pressure works";
    }

    const advantageReasons    = [];
    const disadvantageReasons = [];
    const bonusReasons        = [];
    const consumes            = [];
    let   combo               = null;
    let   kick                = false;
    let   opening             = null;
    let   autoSuccess         = false;
    let   autoReason          = null;
    let   bonusEdge           = null;   // a moment that makes this blow land twice as hard
    let   advantage           = relation === "vulnerable";
    if (advantage) advantageReasons.push(relationReason);

    if (relation !== "blocked" && relation !== "immune") {
      // Two skills, always: the maneuver rolls its PRIMARY on the d20; if you're
      // TRAINED in its support skill, your proficiency bonus rides on top (Read
      // Them = Insight, + prof if you know Investigation). Training, not the
      // ability again — so a CHA + CHA pair doesn't count CHA twice.
      if (maneuver.skill2) {
        const s2 = SocialManeuverRoller.getSupportBonus(sourceActor, maneuver);
        if (s2) bonusReasons.push({ label: `${maneuver.skill2} (trained support)`, value: s2 });
      }

      if (!support) {
        if (leverage === "desire" && !advantage) {
          advantage = true;
          advantageReasons.push("Dangling their Desire — the offer speaks for you");
        }
        if (leverage === "fear") bonusReasons.push({ label: "Pressing their Fear", value: 3 });

        // ── States on the TARGET that change how this lands ──
        // Suspicious of you: they're listening for the lie.
        if (maneuver.skill === "Deception" && condBy("suspicious"))
          disadvantageReasons.push("They're Suspicious of you — listening for the lie");
        // Intrigued: they want to know more — the next read lands on its own.
        if (maneuver.reveals && cond("intrigued")) {
          autoSuccess = true;
          autoReason  = "Intrigued — they tell you more than they meant to";
          consumes.push("intrigued");
        }
        // Named finishers: this maneuver CASHES IN a set-up state for an extra
        // effect (bonus damage / a String) on success. The state burns.
        for (const [st, meta] of Object.entries(maneuver.combos ?? {})) {
          if (!cond(st)) continue;
          combo = { status: st, label: meta.label, damage: meta.damage ?? 0, strings: meta.strings ?? 0 };
          if (!consumes.includes(st)) consumes.push(st);
          break;
        }
        // Kick them while they're down: +1 damage against a target already
        // carrying a (bad) state — nothing consumed, mockery calms no one.
        if (maneuver.kickWhileDown && SOCIAL_CONDITION_ORDER.some(id => !SOCIAL_CONDITIONS[id].positive && cond(id))) kick = true;
        // Open wounds: a matching lasting Wound is a door standing open — +2,
        // never consumed (wounds clear through drama, not through use).
        opening = findOpening(targetActor, maneuver);
        if (opening) {
          const condLabel = (typeof TSLConditionEffects !== "undefined" && TSLConditionEffects.getMeta(opening.cond)?.label) || opening.cond;
          bonusReasons.push({ label: `opening — they're carrying ${condLabel} (${opening.flavor})`, value: 2 });
        }
        // Rock-paper-scissors of schools against the defender's ruling nature:
        // the SAME school is even (0); the school that COUNTERS their nature gets
        // +2; the school their nature COUNTERS takes −2. (Power breaks Emotion
        // breaks Reason breaks Power.) General tactics are always neutral.
        if (defTriad && maneuver.group !== "general") {
          const atkShort = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
          const defShort = (SOCIAL_TRIADS[defTriad]?.label ?? "").replace("Triad of ", "");
          if (TRIAD_COUNTERS[maneuver.group] === defTriad) {
            bonusReasons.push({ label: `${atkShort} counters ${defShort} — their nature bends to this school`, value: 2, kind: "counter" });
          } else if (TRIAD_COUNTERS[defTriad] === maneuver.group) {
            bonusReasons.push({ label: `${defShort} counters ${atkShort} — their nature resists this school`, value: -2, kind: "countered" });
          }
        }
        // A dots-built defender's BLIND side: a school they never learned
        // (0 dots while invested elsewhere) finds nothing guarding the door
        if (defProfile && defProfile.total > 0 && maneuver.group !== "general"
            && (defProfile.dots[maneuver.group] ?? 0) === 0) {
          bonusReasons.push({ label: "an unguarded approach — nothing in them answers this school", value: 1 });
        }
        // YOUR bond toward them is your weapon: its school gets +STRENGTH
        const myBond = TSLBondStore.find(sourceActor.id, targetActor.id);
        const bondMeta = myBond ? SocialArchetypeManager.getBondType(myBond.type) : null;
        const myStr = TSLBondStore.getStrength(sourceActor.id, targetActor.id);
        if (bondMeta?.school && bondMeta.school === maneuver.group && myStr > 0) {
          bonusReasons.push({ label: `Bond: ${bondMeta.label} ${"●".repeat(myStr)} — this approach runs deep between you`, value: myStr });
        }
        // What this KIND of relationship does to the SKILL you're rolling — an
        // edge and a cost per type, scaled by strength, capped at ±3.
        const skillFx = (bondMeta?.skills ?? {})[maneuver.skill] ?? 0;
        if (skillFx && myStr > 0) {
          const val = Math.max(-3, Math.min(3, skillFx * myStr));
          bonusReasons.push({
            label: `${bondMeta.label} ${"●".repeat(myStr)} — ${val > 0 ? "your bond sharpens" : "your bond blunts"} ${maneuver.skill}`,
            value: val,
          });
        }
        // The attacker's Leanings (triad dots) shape their own attack style:
        // +1 per dot in the maneuver's school; a school with NO dots (while they
        // lean elsewhere) is foreign ground — −1. With no dots set, an NPC fights
        // from its ARCHETYPE's school (counts as 2●).
        if (maneuver.group !== "general") {
          const myTriad   = SocialArchetypeManager.getCharacterNotes(sourceActor).triad ?? {};
          const dots      = myTriad[maneuver.group] ?? 0;
          const totalDots = Object.values(myTriad).reduce((s, v) => s + (v || 0), 0);
          const short     = (SOCIAL_TRIADS[maneuver.group]?.label ?? "").replace("Triad of ", "");
          if (totalDots > 0) {
            if (dots > 0) bonusReasons.push({ label: `${short} leaning ${"●".repeat(dots)}`, value: dots });
            else          bonusReasons.push({ label: `Foreign ground — no ${short} leaning`, value: -1 });
          } else {
            const myArch = SocialArchetypeManager.getArchetype(sourceActor);
            if (myArch && myArch.triad === maneuver.group) {
              // Veiled label — never name the attacker's archetype to the table
              bonusReasons.push({ label: "In their element — this school comes naturally", value: 2 });
            }
          }
        }
      }

      // ── Scars: the Mask can't be read, and can't sound sincere ──
      if (!support && maneuver.reveals && SocialManeuverRoller._scarFlag(targetActor, "unreadable"))
        disadvantageReasons.push("They wear the Mask — their face gives nothing away");
      const insincere = (maneuver.sincere || support) ? SocialManeuverRoller._scarFlag(sourceActor, "insincere") : 0;
      if (insincere) bonusReasons.push({ label: "The Mask — sincerity no longer reaches your face", value: -insincere });

      // ── Moments (Ultimates, bond Signatures): an edge you hold against them,
      // a guard they hold against you, advantage on your next roll ──
      if (typeof TSLMoments !== "undefined") {
        const edge = support ? null : TSLMoments.edgeVs(sourceActor, targetActor.id);
        if (edge?.fencing.adv) { advantage = true; advantageReasons.push(`⚡ ${edge.effect.name} — your next maneuver against them`); }
        if (edge?.fencing.double) bonusEdge = edge;
        const guard = support ? null : TSLMoments.guardFor(targetActor, sourceActor.id);
        if (guard) disadvantageReasons.push(`⚡ ${guard.effect.name} — challenging them falters`);
        if (!advantage && TSLMoments.hasAdv(sourceActor)) { advantage = true; advantageReasons.push("⚡ A moment — advantage on your next roll"); }
      }

      // ── States the ATTACKER carries change their own roll ──
      if (mine("rattled"))
        disadvantageReasons.push("You're Rattled — you've lost the thread");
      if (mine("humbled") && (maneuver.skill === "Intimidation" || maneuver.skill === "Performance"))
        disadvantageReasons.push("You're Humbled — no one fears the punchline");
      if (mine("exposed") && maneuver.skill === "Deception")
        disadvantageReasons.push("You're Exposed — nobody believes you now");
    }
    const disadvantage = disadvantageReasons.length > 0;

    // How close the target is to breaking: could THIS hit do it?
    const harder    = (!support && (maneuver.damage ?? 1) > 0) ? SocialManeuverRoller._scarHarder(sourceActor) : 0;
    const estDamage = support ? 0 : ((maneuver.damage ?? 1) + (relation === "vulnerable" ? 1 : 0)
      + (combo?.damage ?? 0) + (leverage === "desire" ? 1 : 0) + (kick ? 1 : 0) + harder) * (bonusEdge ? 2 : 1);
    const canBreak  = !support && enc.active && estDamage > 0 && enc.composure <= estDamage;

    // The Answer you risk on a bad miss — worded from the same defensive
    // identity the rest of the assessment uses (truth / guess / a PC's ruling
    // triad). An honest Persuade and a kind word draw no Answer.
    const answerRisk = defTriad && relation !== "blocked" && relation !== "immune" && !support && !maneuver.sincere
      ? TRIAD_ANSWER[defTriad]?.risk ?? null
      : null;

    // How the state this maneuver would apply lands, given who they are to
    // you (their bond toward you): deep (two uses) / won't take / plain.
    const stateFx = maneuver.applyOnSuccess
      ? SocialArchetypeManager.stateBondFx(targetActor, sourceActor, maneuver.applyOnSuccess)
      : { mode: null };
    // The triad-dot part already inside the skill number — shown, not hidden.
    const leanSkill = SocialManeuverRoller.getLeanInSkill(sourceActor, maneuver);

    const bonus = bonusReasons.reduce((s, b) => s + b.value, 0);
    return {
      arch, relation, relationReason,
      advantage, advantageReasons, disadvantage, disadvantageReasons,
      bonus, bonusReasons, combo, kick, opening, answerRisk, autoSuccess, autoReason,
      missCost, baseMissCost: baseCost, undaunted, selfThin, selfLast, canBreak, estDamage, harder,
      stateFx, leanSkill, support,
      dc, dcBase, dcMods, skillMod, consumes, leverage,
    };
  }

  /**
   * The stakes of this exchange, in plain words — what a hit buys and what a
   * miss costs. Built from the SAME assessment the dice use (guess-based for
   * players), so the wager you read is the wager you make.
   * Returns { hit, miss } or null when there is nothing to weigh (walled).
   */
  static previewOutcomes(a, maneuver) {
    if (!a || a.relation === "blocked" || a.relation === "immune") return null;
    if (a.support || maneuver.support) {
      return {
        hit: `+${maneuver.heal ?? 1} composure to them · Steadied (a clean hit: Undaunted too)`,
        miss: "nothing — a kind word that misses costs you nothing",
      };
    }
    const dmg = a.estDamage ?? (maneuver.damage ?? 1);
    const strings = (maneuver.grantStrings ?? 0) + (a.combo?.strings ?? 0);
    const label   = maneuver.applyOnSuccess
      ? SOCIAL_CONDITIONS[maneuver.applyOnSuccess]?.label ?? maneuver.applyOnSuccess
      : null;
    // The bond decides how the state lands: deep (×2) or not at all.
    const applies = !label ? null
      : a.stateFx?.mode === "resist" ? `${label} won't take (${a.stateFx.label})`
      : a.stateFx?.mode === "deep"   ? `they're ${label} ×2 (${a.stateFx.label})`
      : `they're ${label}`;
    const hit = [
      a.autoSuccess ? "lands on its own (Intrigued)" : null,
      dmg ? `−${dmg} composure${a.canBreak ? " — this could break them" : ""}` : null,
      applies,
      strings ? `+${strings} String${strings > 1 ? "s" : ""}` : null,
      maneuver.reveals ? "a tell" : null,
    ].filter(Boolean).join(" · ") || "pressure";
    const cost = a.missCost ?? SocialManeuverRoller.missCost(maneuver, a.leverage);
    const miss = [
      cost ? `you lose ${cost} composure` : "it costs you nothing (Undaunted)",
      a.answerRisk ? `badly → their answer (${a.answerRisk})` : null,
      maneuver.skill === "Deception" ? "badly → they turn Suspicious of you" : null,
      maneuver.caughtOnBotch ? "and caught lying: they take a String on you" : null,
    ].filter(Boolean).join(" · ");
    return { hit, miss };
  }

  /**
   * Plain-language, VEILED breakdown of what a maneuver does against THIS
   * target right now — for the chip tooltips once a target is picked. Follows
   * the viewer's read (truth for the GM, the guess for a player) and never
   * leaks the archetype name or the DC. Returns an array of short lines.
   */
  static describeVsTarget(sourceActor, targetActor, maneuver, isGM) {
    // The GM assesses on the TRUTH. A player assesses on THEIR OWN THEORY — the
    // archetype they wrote in their Bond ("Read as") — so the weak/strong marks
    // follow their guess and are provisional: a wrong theory shows wrong marks,
    // corrected by what actually HAPPENS. With no theory yet, no marks at all.
    // (A GM-opened nature makes the truth public; the DC number stays GM-only.)
    const revealed  = isGM || SocialArchetypeManager.isRevealed(targetActor);
    const guessId   = revealed ? null : (TSLBondStore.find(sourceActor.id, targetActor.id)?.perceivedArchetypeId ?? null);
    const guessArch = guessId ? SocialArchetypeManager.getArchetypeById(guessId) : null;
    const showArch  = revealed || !!guessArch;   // marks follow truth OR the theory
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver,
      { archetypeOverride: revealed ? undefined : (guessArch ?? null) });
    const out = [];

    if (a.support) {
      out.push("♥ Aimed at an ally: DC 10, nothing to defend against, and a miss costs you nothing.");
      out.push("+1 composure back to them and Steadied — a clean hit adds Undaunted.");
    }
    // Relation — follows the read (truth for GM, theory for a player); a live
    // wall (Defiant, a finished exchange, your own states) always shows.
    if (a.relation === "blocked")           out.push(`✕ ${a.relationReason ?? "Walled off right now — nothing gets through"}`);
    else if (showArch && a.relation === "immune")     out.push("✕ Bounces off them — it fails, costs you like a miss, and they turn Defiant");
    else if (showArch && a.relation === "vulnerable") out.push("◎ Cuts deep here — Advantage and +1 damage");

    if (a.autoSuccess) out.push(`✦ ${a.autoReason}`);
    // Opening from a set-up state (observable — safe for players)
    if (a.combo) {
      const st  = SOCIAL_CONDITIONS[a.combo.status]?.label ?? a.combo.status;
      const pay = [a.combo.damage ? `+${a.combo.damage} damage` : null,
                   a.combo.strings ? `+${a.combo.strings} String` : null].filter(Boolean).join(", ");
      out.push(`⊕ Opening — they're ${st}${pay ? `: ${pay}` : ""}`);
    }
    if (a.opening) out.push(`⊕ Opening — +2 (${a.opening.flavor})`);
    if (a.kick)    out.push("⊕ Opening — they're already off balance: +1 damage");
    // What they are to you bends the state this maneuver applies
    if (a.stateFx?.mode) {
      const st = SOCIAL_CONDITIONS[maneuver.applyOnSuccess]?.label ?? maneuver.applyOnSuccess;
      out.push(a.stateFx.mode === "deep"
        ? `♥ ${a.stateFx.label} — ${st} runs deep: it lasts two uses (${a.stateFx.why})`
        : `♥ ${a.stateFx.label} — ${st} won't take from you (${a.stateFx.why})`);
    }
    if (a.leanSkill) out.push(`${maneuver.skill} includes +${a.leanSkill.value} from your ${a.leanSkill.triad} leaning`);

    // Flat bonuses. The counter (▲/▽) follows the read (truth or theory);
    // blind-side is truth-only (it reads the target's real dots, which a theory
    // can't guess); the player's OWN bonuses (skill, bond, leaning) always show.
    for (const b of a.bonusReasons) {
      if (b.kind === "counter")   { if (showArch) out.push(`▲ Their nature bends to this school — +${b.value}`); continue; }
      if (b.kind === "countered") { if (showArch) out.push(`▽ Their nature resists this school — ${b.value}`); continue; }
      if (/unguarded approach/i.test(b.label)) { if (revealed) out.push(`+${b.value} an unguarded approach`); continue; }
      const sign = b.value >= 0 ? "+" : "−";
      out.push(`${sign}${Math.abs(b.value)} ${b.label.split(" — ")[0]}`);
    }
    // Advantage / disadvantage sources that aren't the (read-gated) relation
    // itself — these come from visible states and leverage, safe either way.
    for (const r of a.advantageReasons) {
      if (r === a.relationReason) continue;
      out.push(`ADV — ${r}`);
    }
    for (const r of a.disadvantageReasons ?? []) out.push(`DIS — ${r}`);
    if (a.undaunted) out.push("✦ Undaunted — if this misses, it costs you nothing");
    if (a.harder) out.push(`🩹 Cruelty — if it lands, it takes ${a.harder} more`);
    // The GM alone sees the difficulty math
    if (isGM) for (const m of a.dcMods) out.push(`DC ${m.value > 0 ? "+" : "−"}${Math.abs(m.value)} · ${m.label}`);

    if (!out.length) out.push("No special interaction you can see — read them by rolling.");
    return out;
  }

  /**
   * The post-roll gamble: the die is cast, the DC is hidden — burn a String
   * for +5 and hope it turns the exchange? Decided AFTER seeing the total.
   */
  static async promptStringBurn(total, maneuver, heldCount) {
    return new Promise(resolve => {
      new Dialog({
        title: `${maneuver.name} — it doesn't land…`,
        content: `<div class="tsl-rollmods">
          <p>Your total is <b>${total}</b> — and it isn't enough. You hold
          ${heldCount} String${heldCount > 1 ? "s" : ""} on them.</p>
          <p class="notes">Pull the thread for +${STRING_SPEND_BONUS}? The difficulty is hidden — this is a bet.</p>
        </div>`,
        buttons: {
          burn: { icon: '<i class="fas fa-masks-theater"></i>', label: `Burn a String (+${STRING_SPEND_BONUS})`, callback: () => resolve(true) },
          keep: { label: "Let it stand", callback: () => resolve(false) },
        },
        default: "keep",
        close: () => resolve(false),
      }, tslDialogOptions()).render(true);
    });
  }

  /**
   * The pre-roll modifier prompt — same idea as the system's roll dialog:
   * a situational modifier plus advantage/disadvantage the GM calls out.
   * Resolves to { situational, mode } or null when cancelled.
   */
  static async promptRollMods(title, baseAdvantage = false) {
    const content = `
      <div class="tsl-rollmods">
        <div class="form-group">
          <label>Situational modifier</label>
          <input type="number" name="situational" value="0" step="1" autofocus>
        </div>
        <div class="form-group">
          <label>Roll mode</label>
          <select name="mode">
            <option value="normal" selected>Normal</option>
            <option value="adv">Advantage</option>
            <option value="dis">Disadvantage</option>
          </select>
        </div>
        ${baseAdvantage ? `<p class="notes">You already roll with Advantage from the situation; Disadvantage here would cancel it.</p>` : ""}
      </div>`;
    return new Promise(resolve => {
      new Dialog({
        title,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: (html) => {
              const root = html instanceof HTMLElement ? html : html[0];
              resolve({
                situational: parseInt(root.querySelector("[name='situational']")?.value) || 0,
                mode: root.querySelector("[name='mode']")?.value ?? "normal",
              });
            },
          },
          cancel: { label: "Cancel", callback: () => resolve(null) },
        },
        default: "roll",
        close: () => resolve(null),
      }, tslDialogOptions()).render(true);
    });
  }

  /**
   * Roll the maneuver and post the chat card. NO side effects here —
   * pass the returned payload to applyOutcome (GM) or the GM_ACTION relay.
   * options.stringBonus  — a String already spent on this target (+5)
   * options.situational  — flat modifier from the pre-roll dialog
   * options.mode         — "normal" | "adv" | "dis" from the pre-roll dialog
   */
  /**
   * Should this actor's maneuvers roll through the SYSTEM's own skill-check
   * dialog (A5E: advantage, expertise dice, situational mods) instead of the
   * module's plain d20 + prompt? World setting; needs the system API.
   */
  static usesSystemDialog(actor) {
    try {
      return game.settings.get("tsl-social-conflict", "useSystemRollDialog")
        && typeof actor?.rollSkillCheck === "function";
    } catch { return false; }
  }

  static async rollManeuver(sourceActor, targetActor, maneuver, options = {}) {
    let stringBonus   = options.stringBonus ?? 0;
    const situational = options.situational ?? 0;
    const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage: options.leverage ?? null });

    // Advantage / disadvantage from states + the dialog; both cancel out (5e rules)
    let wantAdv = a.advantage || options.mode === "adv";
    let wantDis = a.disadvantage || options.mode === "dis";

    let roll, rawDice, total, natural = null;
    let systemRoll = false;
    if (SocialManeuverRoller.usesSystemDialog(sourceActor)) {
      // The SYSTEM rolls the skill (its dialog owns advantage/expertise/
      // situational); our fencing extras ride along as a pre-filled
      // situational modifier. Outcome vs the hidden DC stays ours.
      systemRoll = true;
      const key   = maneuver.skillKeys?.dnd5e;   // a5e uses the same 3-letter keys
      const extra = stringBonus + a.bonus + situational;
      const advMode = wantAdv && !wantDis ? (CONFIG.A5E?.ROLL_MODE?.ADVANTAGE ?? 1)
                    : wantDis && !wantAdv ? (CONFIG.A5E?.ROLL_MODE?.DISADVANTAGE ?? -1)
                    : undefined;
      const msg = await sourceActor.rollSkillCheck(key, {
        situationalMods: extra ? `${extra >= 0 ? "+" : ""}${extra}` : "",
        ...(advMode !== undefined ? { rollMode: advMode } : {}),
      });
      roll = msg?.rolls?.[0] ?? null;
      if (!roll) return null;                    // dialog cancelled — nothing spent
      total    = roll.total;
      const results = roll.dice?.[0]?.results ?? [];
      rawDice  = results.map(r => r.result);
      wantAdv  = rawDice.length > 1;             // display only — the system already resolved it
      wantDis  = false;
      // The die that COUNTS (kh/kl mark the other one inactive)
      const live = results.filter(r => r.active !== false && !r.discarded).map(r => r.result);
      natural  = live.length ? live[0] : (rawDice[0] ?? null);
    } else {
      const die = wantAdv && wantDis ? "1d20" : wantAdv ? "2d20kh1" : wantDis ? "2d20kl1" : "1d20";
      const mod = a.skillMod + stringBonus + a.bonus + situational;
      roll = new Roll(`${die} + ${mod}`);
      await roll.evaluate();
      rawDice = roll.dice[0].results.map(r => r.result);
      total   = roll.total;
      natural = wantAdv && !wantDis ? Math.max(...rawDice)
              : wantDis && !wantAdv ? Math.min(...rawDice)
              : rawDice[0];
    }

    const isWalled = a.relation === "immune" || a.relation === "blocked";
    // A natural 1 always misses — however big the bonus, a fumble is a fumble.
    // (Unless they're Intrigued: then they talk whatever the dice say.)
    const nat1     = natural === 1;
    let   success  = !isWalled && (a.autoSuccess || (!nat1 && total >= a.dc));

    // The post-roll gamble: on a miss the roller may burn a String for +5 —
    // decided AFTER seeing the die, against a difficulty they cannot see.
    // (Not offered on a natural 1: no thread can save a fumble.)
    let spentStringPostRoll = false;
    if (!isWalled && !success && !nat1 && options.offerString) {
      const held = TSLStringStore.getList(sourceActor.id)
        .filter(e => e.targetActorId === targetActor.id).length;
      if (held > 0 && await SocialManeuverRoller.promptStringBurn(total, maneuver, held)) {
        spentStringPostRoll = true;
        stringBonus += STRING_SPEND_BONUS;
        total       += STRING_SPEND_BONUS;
        success      = total >= a.dc;
      }
    }

    // Graded outcomes — named, never numbered, so chat can't leak the DC:
    //   crit (beat it by 5+) · success · failure · botch (missed by 5+ → the Answer)
    const outcomeType = isWalled ? "immune"
      : success ? (total >= a.dc + 5 ? "crit" : "success")
      : (total <= a.dc - 5 ? "botch" : "failure");

    // The card is NOT posted here — it is posted by the GM in applyOutcome,
    // AFTER the GM confirms the outcome (so the shared card always reflects
    // the GM's final ruling, never a proposed result the GM then overrode).
    // The acting client still gets its instant dice overlay from the payload.
    return {
      sourceActorId: sourceActor.id,
      targetActorId: targetActor.id,
      maneuverId:    maneuver.id,
      outcomeType,                               // the DICE's verdict — the GM may adjust
      relation:      a.relation,
      auto:          !!a.autoSuccess && !isWalled,   // Intrigued: it lands on its own — no GM call
      consumed:      isWalled ? [] : a.consumes,
      combo:         isWalled ? null : a.combo,
      leverage:      a.leverage,
      total,
      natural,
      dc: a.dc,
      spentString: stringBonus > 0,
      spentStringPostRoll,
      // ── card payload (rebuilt & posted on the GM client) ──
      card: {
        rawDice, systemRoll,
        stringBonus, situational,
        advantage: wantAdv && !wantDis,
        disadvantage: wantDis && !wantAdv,
        rollData: systemRoll ? null : roll.toJSON(),
      },
    };
  }

  /**
   * The GM's final word: after the dice, confirm the grade against the hidden
   * DC (proposed result pre-selected). GM CLIENT ONLY; resolves to a grade
   * ("crit"|"success"|"failure"|"botch"). Skipped (returns proposed) when the
   * setting is off or the outcome is deterministic (walled).
   */
  static async promptOutcome(sourceActor, targetActor, maneuver, total, dc, proposed, opts = {}) {
    let on = true, closeOnly = true;
    try { on = game.settings.get("tsl-social-conflict", "gmDecidesOutcome") !== false; } catch {}
    try { closeOnly = game.settings.get("tsl-social-conflict", "gmConfirmCloseOnly") !== false; } catch {}
    if (!on || proposed === "immune") return proposed;
    const esc = foundry.utils.escapeHTML;
    const margin = total - dc;
    // Fewer windows: by default the GM is asked only on a CLOSE call (within 2
    // of the DC) or a natural 1 — a clear result simply applies.
    if (closeOnly && opts.natural !== 1 && Math.abs(margin) > 2) return proposed;
    const cost = opts.missCost ?? SocialManeuverRoller.missCost(maneuver);
    const tips = {
      crit:    "A decisive success (beat the number by 5+): it lands with extra bite — 1 more composure on top of the maneuver's effect.",
      success: "It lands: the target loses composure and takes the maneuver's state — unless they Hold the Line against the state by carrying a Wound instead.",
      failure: `It misses: nothing lands, and the attacker loses ${cost} composure of their own.`,
      botch:   `A bad miss (5+ under): the attacker loses ${cost} composure AND the target turns it back on them in their own style — Rattled (Power), Beholden (Emotion), or a String on them (Reason). A lie that misses this badly leaves them Suspicious.`,
    };
    const natNote = opts.natural === 1
      ? `<p class="notes"><b>Natural 1</b> — an automatic miss, whatever the total.</p>` : "";
    return new Promise(resolve => {
      new Dialog({
        title: `${sourceActor.name} → ${targetActor.name}: ${maneuver.name}`,
        content: `<div class="tsl-rollmods">
          <p>Total <b>${total}</b> vs DC <b>${dc}</b> — margin <b>${margin >= 0 ? "+" : ""}${margin}</b>.</p>${natNote}
          <p class="notes">You have the final word — the computed grade is pre-selected. Hover a button for what it does.</p>
        </div>`,
        buttons: {
          crit:    { label: "★ Clean hit", callback: () => resolve("crit") },
          success: { label: "✓ Success",   callback: () => resolve("success") },
          failure: { label: "✗ Failure",   callback: () => resolve("failure") },
          botch:   { label: "⚔ They answer", callback: () => resolve("botch") },
        },
        default: proposed,
        close: () => resolve(proposed),
        render: (html) => {
          const root = html instanceof HTMLElement ? html : html?.[0];
          root?.querySelectorAll("button[data-button]").forEach(b => {
            const t = tips[b.dataset.button];
            if (t) b.setAttribute("data-tooltip", t);
          });
        },
      }, tslDialogOptions()).render(true);
    });
  }

  /**
   * A successful read whispers one TELL of the target's real archetype to the
   * reader's owners (+GM) — evidence, not the answer. GM CLIENT ONLY.
   */
  static async whisperTell(sourceActor, targetActor) {
    if (!sourceActor || !targetActor) return;
    const esc  = foundry.utils.escapeHTML;
    const arch = SocialArchetypeManager.getArchetype(targetActor);
    const whisper = [
      ...game.users.filter(u => sourceActor.testUserPermission(u, "OWNER")).map(u => u.id),
      ...game.users.filter(u => u.isGM).map(u => u.id),
    ];
    // The deepest pool of all — Read Them is cast most, so it draws from the
    // 20-per-archetype whisper set (falling back to the old tells/craves/dreads
    // if a custom archetype has no pool).
    const tell = arch ? SocialArchetypeManager.pickTell(arch.id) : null;
    const fallback = arch
      ? [...(arch.tells ?? []), `They seem to crave: ${arch.craves ?? "?"}`, `They seem to dread: ${arch.dreads ?? "?"}`]
      : null;
    const line = tell ?? (fallback?.length ? fallback[Math.floor(Math.random() * fallback.length)] : null);
    const text = line
      ? `🔍 Reading ${esc(targetActor.name)}: <i>“${esc(line)}”</i><br><span class="tsl-mv-target">Deduce their nature and note your guess in your Bond (“Read as”).</span>`
      : `🔍 Reading ${esc(targetActor.name)}: <i>the GM should describe a tell of their nature</i> (no archetype is set).`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-outcome tsl-mv-outcome--success">${text}</div></div>`,
      whisper: [...new Set(whisper)],
    });
  }

  /**
   * Apply the mechanical consequences of a maneuver roll. GM CLIENT ONLY.
   * Players reach this through the GM_ACTION socket relay (socket.js).
   * Also logs to the shared conflict when one is running.
   */
  static async applyOutcome(payload) {
    if (!game.user.isGM) return;
    const { sourceActorId, targetActorId, maneuverId, relation, consumed, combo, leverage } = payload;
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);
    if (!sourceActor || !targetActor || !maneuver) {
      console.warn("TSL | applyOutcome: could not resolve source/target/maneuver on the GM client",
        { sourceActorId, hasSource: !!sourceActor, targetActorId, hasTarget: !!targetActor, maneuverId, hasManeuver: !!maneuver });
      return;
    }
    const scope = SocialArchetypeManager.getFlagScope();
    const esc   = foundry.utils.escapeHTML;
    const src   = esc(sourceActor.name), tgt = esc(targetActor.name);
    const stateOn = (actor, id) => SocialArchetypeManager.getActiveCondition(actor, id);
    const stateBy = (actor, id, byId) => {
      const e = stateOn(actor, id);
      return e && e.flags?.[scope]?.sourceActorId === byId ? e : null;
    };

    // No "Start Encounter" ceremony — the first maneuver between two people
    // brings BOTH sides' composure to life from their sheets.
    await SocialEncounterManager.ensureActive(targetActor);
    await SocialEncounterManager.ensureActive(sourceActor);
    const encBefore    = SocialEncounterManager.getEncounter(targetActor);
    const srcEncBefore = SocialEncounterManager.getEncounter(sourceActor);
    // A finished exchange takes no more maneuvers — the client checks this
    // before rolling, but two people acting at once can race past it.
    if (encBefore.outcome || srcEncBefore.outcome) {
      const who = encBefore.outcome ? targetActor.name : sourceActor.name;
      ui.notifications?.info?.(`TSL: ${who}'s exchange is already over — ${maneuver.name} has no effect.`);
      return;
    }

    // What a miss costs the ATTACKER's own composure (Fear leverage backfires
    // +1). Undaunted: their next miss costs nothing.
    const undaunted = !!stateOn(sourceActor, "undaunted");
    const missCost  = undaunted ? 0 : SocialManeuverRoller.missCost(maneuver, leverage);

    // The GM has the final word: confirm the grade against the hidden DC
    // (the dice's verdict is pre-selected). Walls and an Intrigued target's
    // read (it lands on its own) skip this.
    let outcomeType = payload.outcomeType;
    if (relation !== "immune" && relation !== "blocked" && !payload.auto) {
      outcomeType = await SocialManeuverRoller.promptOutcome(
        sourceActor, targetActor, maneuver, payload.total, payload.dc, payload.outcomeType,
        { natural: payload.natural, missCost });
    }
    payload.outcomeType = outcomeType;   // keep the shared log in sync

    // ONE roll, ONE card. The card is posted NOW (GM side), reflecting the GM's
    // final ruling — built from the truth-side assessment, before any state
    // burns away. Everything that follows from it (the state, a wound, their
    // Answer…) is gathered in `after` and written INTO that same card at the
    // end, in the order it happened. Only a decided exchange (gave in /
    // stormed off) gets a card of its own.
    const after = [];   // { html, tone: "good" | "bad" | "info" } — good/bad for the ATTACKER
    const note  = (html, tone = "info") => after.push({ html, tone });
    let cardMsg = null, cardData = null;
    if (payload.card) {
      const a = SocialManeuverRoller.assess(sourceActor, targetActor, maneuver, { leverage });
      const missed   = outcomeType === "failure" || outcomeType === "botch";
      const costLine = missCost ? ` ${sourceActor.name} loses ${missCost} composure.` : "";
      const nat1     = payload.natural === 1 && missed ? "A natural 1. " : "";
      const outcomeText =
        relation === "blocked" ? "Walled off — nothing gets through." :
        relation === "immune"  ? `${maneuver.immuneText ?? "This isn't the way to them — it slides off, and they're unmoved."}${costLine}` :
        outcomeType === "crit"    ? (maneuver.critText ?? `Clean through the guard. ${maneuver.successText}`) :
        outcomeType === "botch"   ? `${nat1}${maneuver.failText}${costLine}${maneuver.support || maneuver.sincere ? "" : " The opening is yours no longer — they answer."}` :
        (outcomeType === "success") ? maneuver.successText : `${nat1}${maneuver.failText}${costLine}`;
      cardData = {
        sourceActor, targetActor, maneuver, assessment: a,
        total: payload.total, outcomeType, outcomeText,
        rawDice: payload.card.rawDice, systemRoll: payload.card.systemRoll,
        stringBonus: payload.card.stringBonus, situational: payload.card.situational,
        advantage: payload.card.advantage, disadvantage: payload.card.disadvantage,
        roll: payload.card.rollData ? Roll.fromData(payload.card.rollData) : null,
      };
      cardMsg = await SocialManeuverRoller._postCard(cardData);
    }
    // A landed blow shows WHO you hit: a veiled archetype reaction (evidence,
    // never a name) — added once we know it actually landed. Read Them never
    // shows one: its clue is the private whisper.
    let landed = false;

    // Moments shaping this maneuver (read before anything is spent)
    const edge  = (typeof TSLMoments !== "undefined" && !maneuver.support) ? TSLMoments.edgeVs(sourceActor, targetActorId) : null;
    const guard = (typeof TSLMoments !== "undefined" && !maneuver.support) ? TSLMoments.guardFor(targetActor, sourceActorId) : null;

    // Off-balance check BEFORE anything burns — Mock's kick counts the state
    // the target was actually in when the words landed.
    const wasOffBalance = SOCIAL_CONDITION_ORDER.some(id =>
      !SOCIAL_CONDITIONS[id].positive && stateOn(targetActor, id));

    // Set-ups this roll cashed burn away (a deep one has two uses)
    for (const condId of consumed ?? []) await SocialArchetypeManager.spendCondition(targetActor, condId);
    // A played leverage card is spent whatever the outcome — they heard the pitch
    if (leverage) await SocialEncounterManager.markLeverageUsed(targetActor, leverage);

    // The attacker's own states settle as they act: the provocation is
    // answered, the lost thread is spent, the fearless streak is used.
    if (relation !== "blocked") {
      for (const id of ["provoked", "rattled", "undaunted"]) {
        if (stateOn(sourceActor, id)) await SocialArchetypeManager.spendCondition(sourceActor, id);
      }
    }

    const isHit = outcomeType === "success" || outcomeType === "crit";

    if (outcomeType === "immune") {
      // Pressing an immunity walls them up (Defiant), earns their Answer, and
      // costs the attacker like any miss.
      if (relation === "immune") {
        await SocialArchetypeManager.applyCondition(targetActor, "defiant", sourceActor);
        note(`🧱 <b>${tgt}</b> walls up — <b>Defiant</b>: no maneuver gets through until a successful <b>Read Them</b> cracks it.`, "bad");
        const ans = await SocialManeuverRoller._applyAnswer(sourceActor, targetActor);
        if (ans) note(ans, "bad");
        if (missCost > 0) await SocialEncounterManager.adjustComposure(sourceActor, -missCost, targetActorId);
      }
    } else if (isHit && maneuver.support) {
      // Reassure: an ally finds their feet again.
      const heal = (maneuver.heal ?? 1) + (outcomeType === "crit" ? 1 : 0);
      await SocialEncounterManager.adjustComposure(targetActor, heal, sourceActorId);
      await SocialArchetypeManager.applyStateWithBonds(targetActor, "steadied", sourceActor, { ignoreSteadied: true });
      if (outcomeType === "crit")
        await SocialArchetypeManager.applyStateWithBonds(targetActor, "undaunted", sourceActor, { ignoreSteadied: true });
    } else if (isHit) {
      // What the attacker earned stands whatever comes next — Strings, a
      // whispered tell, a cracked wall.
      if (maneuver.grantStrings > 0)
        await TSLStringStore.add(sourceActorId, targetActorId, maneuver.grantStrings);
      // A read never hands over the archetype — it whispers a TELL. The player
      // deduces the nature themselves and writes their guess into the Bond.
      if (maneuver.reveals)
        await SocialManeuverRoller.whisperTell(sourceActor, targetActor);
      // Read Them slips through the Defiant wall — and a SUCCESSFUL read
      // finds the seam and brings it down.
      if (maneuver.worksThroughDefiant && stateOn(targetActor, "defiant")) {
        await SocialArchetypeManager.removeCondition(targetActor, "defiant");
        note(`🧱 The wall cracks — <b>${tgt}</b> is no longer Defiant.`, "good");
      }
      // Landing a maneuver wins back the face a Humbled speaker lost.
      if (stateOn(sourceActor, "humbled")) {
        await SocialArchetypeManager.removeCondition(sourceActor, "humbled");
        note(`${src} wins back some face — no longer <b>Humbled</b>.`, "good");
      }
      // An honest case clears the suspicion your lies stirred.
      if (maneuver.sincere && stateBy(targetActor, "suspicious", sourceActorId)) {
        await SocialArchetypeManager.removeCondition(targetActor, "suspicious");
        note(`🤝 An honest word — <b>${tgt}</b> is no longer Suspicious of ${src}.`, "good");
      }
      // Turning Power on the one you charmed breaks the spell — it curdles.
      if (maneuver.group === "power" && stateBy(targetActor, "smitten", sourceActorId)) {
        await SocialArchetypeManager.removeCondition(targetActor, "smitten");
        await SocialArchetypeManager.applyCondition(targetActor, "provoked", sourceActor);
        note(`💢 The spell curdles — <b>${tgt}</b> is no longer Enthralled, but <b>Provoked</b> by ${src}.`, "bad");
      }

      // How hard it hits. A vulnerability strike adds +1 to the maneuver's own
      // damage; desire leverage, a clean hit and Mock's kick add more.
      let damage = (maneuver.damage ?? 1) + (relation === "vulnerable" ? 1 : 0);
      if (leverage === "desire") damage += 1;  // the offer does half the work
      if (outcomeType === "crit") damage += 1;
      // Cruelty (a Scar): every blow of theirs that lands goes 1 deeper
      if ((maneuver.damage ?? 1) > 0) damage += SocialManeuverRoller._scarHarder(sourceActor);
      if (maneuver.kickWhileDown && wasOffBalance) damage += 1;
      // A cashed finisher pays out on top: extra damage and/or a String
      if (combo) {
        damage += combo.damage ?? 0;
        if (combo.strings > 0) await TSLStringStore.add(sourceActorId, targetActorId, combo.strings);
      }
      // A moment's edge (Reckoning, an enemy's Personal signature): twice as hard
      if (edge?.fencing.double && damage > 0) {
        damage *= 2;
        note(`⚡ <b>${esc(edge.effect.name)}</b> — the blow lands twice as hard.`, "good");
      }

      // ── The state this maneuver puts on them ─────────────────────────────
      // How it lands depends on who they are to you (their bond: it runs deep
      // or won't take), on calm (Steadied shrugs it off), and on them: they may
      // HOLD THE LINE — refuse the state by carrying a lasting Wound instead.
      let stateTook = false;
      const stateId = maneuver.applyOnSuccess ?? null;
      if (stateId) {
        const stLabel = SOCIAL_CONDITIONS[stateId]?.label ?? stateId;
        const sfx     = SocialArchetypeManager.stateBondFx(targetActor, sourceActor, stateId);
        if (sfx.mode === "resist") {
          note(`♥ <b>${esc(stLabel)}</b> won't take — ${esc(sfx.label)}: ${esc(sfx.why)}.`, "bad");
        } else if (!SOCIAL_CONDITIONS[stateId]?.positive && stateOn(targetActor, "steadied")) {
          await SocialArchetypeManager.spendCondition(targetActor, "steadied");
          note(`⚓ <b>${tgt}</b> is Steadied — shrugs off <b>${esc(stLabel)}</b>.`, "bad");
        } else {
          // Anger drops the guard: no holding the line against the one who
          // provoked you. Wounds weighing 4+ (Overwhelmed) leave nothing to hold with.
          const overwhelmed  = TSLConditionEffects.isOverwhelmed(targetActor);
          const provokedByMe = !!stateBy(targetActor, "provoked", sourceActorId);
          const holdOptions  = (SocialManeuverRoller._holdLineEnabled() && !overwhelmed && !provokedByMe)
            ? holdOptionsFor(stateId).filter(w => TSLConditionEffects.getTier(targetActor, w) < 3
                && !TSLConditionEffects.isImmune(targetActor, w))   // a set Scar can't carry it
            : [];
          const meet = holdOptions.length
            ? await SocialManeuverRoller.promptHoldLine({
                defender: targetActor, attacker: sourceActor, maneuver,
                status: stateId, statusDeep: sfx.mode === "deep", holdOptions,
                stance: SocialArchetypeManager.getStance(targetActor),
              })
            : { hold: null };
          const stNote = meet.auto ? ` <i>(${esc(SocialArchetypeManager.PRESSED_STANCES[meet.stance]?.label ?? meet.stance)})</i>` : "";
          if (meet.hold) {
            const load = await TSLConditionEffects.applyOne(targetActor, meet.hold, sourceActor.name, sourceActorId);
            const wLabel = TSLConditionEffects.getMeta(meet.hold)?.label ?? meet.hold;
            note(`🛡 <b>${tgt}</b> holds the line against <b>${esc(stLabel)}</b> — and carries it as a lasting <b>${esc(wLabel)}</b> instead${stNote}.${load >= 4 ? " <b>Overwhelmed — they can't hold the line any more.</b>" : ""}`, "bad");
          } else {
            await SocialArchetypeManager.applyCondition(targetActor, stateId, sourceActor, { charges: sfx.mode === "deep" ? 2 : 1 });
            stateTook = true;
            if (sfx.mode === "deep")
              note(`♥ It runs deep — ${esc(sfx.label)}: ${esc(sfx.why)}. <b>${esc(stLabel)}</b> lasts two uses.`, "good");
            // Exposed: the one who caught them out learns their Mask.
            if (stateId === "exposed") await SocialManeuverRoller.whisperSecret(sourceActor, targetActor, ["mask"]);
          }
        }
      }

      // ── The blow itself: composure ──
      let dealt = 0;
      if (damage > 0) {
        await SocialEncounterManager.adjustComposure(targetActor, -damage, sourceActorId);
        dealt = damage;
      }
      landed = dealt > 0 || stateTook;

      // A moment's edge that leaves a wound if it lands (Turn the Tables)
      if (landed && edge?.fencing.woundOnHit && typeof TSLConditionEffects !== "undefined") {
        const w = edge.fencing.woundOnHit;
        const wl = TSLConditionEffects.getMeta(w)?.label ?? w;
        if (TSLConditionEffects.isImmune(targetActor, w)) note(`🩹 ${esc(edge.effect.name)} — <b>${tgt}</b> can't carry ${esc(wl)} any more.`, "bad");
        else { await TSLConditionEffects.applyOne(targetActor, w, sourceActor.name, sourceActorId); note(`⚡ ${esc(edge.effect.name)} — <b>${tgt}</b> carries ${esc(wl)} now.`, "good"); }
      }

      // Some blows leave a mark, not just a dent: a maneuver with
      // `woundOnSuccess` plants a lasting emotional Wound on the target
      // (Humiliate → Shame). It DEEPENS on repeat, and remembers who caused it.
      if (maneuver.woundOnSuccess && dealt > 0 && typeof TSLConditionEffects !== "undefined") {
        const wLbl    = TSLConditionEffects.getMeta(maneuver.woundOnSuccess)?.label ?? maneuver.woundOnSuccess;
        if (TSLConditionEffects.isImmune(targetActor, maneuver.woundOnSuccess)) {
          const scar = TSLConditionEffects.getScarMeta(TSLConditionEffects.scarForWound(maneuver.woundOnSuccess));
          note(`🩹 It doesn't stick — <b>${tgt}</b> wears ${esc(scar?.label ?? "a Scar")}: no fresh ${esc(wLbl)} takes hold.`, "bad");
        } else {
          const hadTier = TSLConditionEffects.getTier(targetActor, maneuver.woundOnSuccess);
          await TSLConditionEffects.applyOne(targetActor, maneuver.woundOnSuccess, sourceActor.name, sourceActorId);
          note(`❤ It sticks — <b>${tgt}</b> carries ${hadTier ? "a <b>deepening</b>" : "a lasting"} <b>${esc(wLbl)}</b> wound.`, "good");
        }
      }
      // The cost of closeness: turning POWER on someone you love costs YOU —
      // they gain a String on you (you hurt someone who cares).
      const myBond2 = TSLBondStore.find(sourceActorId, targetActorId);
      const myMeta2 = myBond2 ? SocialArchetypeManager.getBondType(myBond2.type) : null;
      if (maneuver.group === "power" && myMeta2?.guilt && typeof TSLStringStore !== "undefined") {
        await TSLStringStore.add(targetActorId, sourceActorId, 1);
        note(`💔 It worked — and it cost: turning power on someone who cares for you leaves you exposed. <b>${tgt} gains a String on ${src}.</b>`, "bad");
      }
    } else {
      // A miss costs the ATTACKER's own composure — pressing is never free
      // (risky moves cost more; a Fear that misses backfires +1). Run out and
      // YOU break: the exchange is lost. A BAD miss (5+ under) also earns
      // their Answer — except an honest case, or a kind word to a friend.
      if (outcomeType === "botch" && !maneuver.support) {
        if (!maneuver.sincere) {
          const ans = await SocialManeuverRoller._applyAnswer(sourceActor, targetActor);
          if (ans) note(ans, "bad");
        }
        // Caught in the lie: a bad miss on a Lie hands THEM a lever on you.
        if (maneuver.caughtOnBotch) {
          const got = await TSLStringStore.add(targetActorId, sourceActorId, 1);
          note(`🕵 ${esc(maneuver.caughtText ?? "Caught in the lie.")} ${got ? `<b>${tgt} gains a String on ${src}.</b>` : ""}`, "bad");
        }
        // A deception that misses this badly: they're listening for it now.
        if (maneuver.skill === "Deception") {
          await SocialArchetypeManager.applyCondition(targetActor, "suspicious", sourceActor);
          note(`👁 <b>${tgt}</b> is <b>Suspicious</b> of ${src} now — ${src}'s Deception rolls with disadvantage against them (an honest Persuade clears it).`, "bad");
        }
        // TSL's "mark XP on a miss": a spectacular social fumble feeds the
        // story. A player character who eats the Answer gains Inspiration.
        if (sourceActor.hasPlayerOwner
            && foundry.utils.getProperty(sourceActor, "system.attributes.inspiration") === false) {
          await sourceActor.update({ "system.attributes.inspiration": true });
          note(`💫 A fumble this good feeds the story — <b>${src} gains Inspiration</b>.`, "good");
        }
      }
      if (missCost > 0) await SocialEncounterManager.adjustComposure(sourceActor, -missCost, targetActorId);
      else if (undaunted) note(`✦ Undaunted — the miss costs ${src} nothing.`, "good");
    }

    // Moments are spent by the maneuver they shaped: the attacker's edge, and
    // the target's guard (this challenger has now run into it).
    if (relation !== "blocked") {
      if (edge?.effect) await sourceActor.deleteEmbeddedDocuments("ActiveEffect", [edge.effect.id]);
      if (guard?.effect?.update) await guard.effect.update({ [`flags.tsl-social-conflict.moment.fencing.used`]: [...(guard.fencing.used ?? []), sourceActorId] });
    }

    // Write what followed into the roll's own card (or one small card when
    // there's no roll card to extend).
    const reaction = (landed && !maneuver.reveals && !maneuver.support)
      ? SocialArchetypeManager.pickReaction(SocialArchetypeManager.getArchetype(targetActor)?.id)
      : null;
    await SocialManeuverRoller._finishCard(cardMsg, cardData, after, reaction, sourceActor);

    return SocialManeuverRoller._afterOutcome(payload, encBefore, srcEncBefore);
  }

  /**
   * Whisper one of the target's secrets (a filled dossier point) to the reader
   * and the GM. `prefer` — point ids to try first ("mask"); otherwise any
   * filled point at random. GM CLIENT ONLY.
   */
  static async whisperSecret(reader, target, prefer = []) {
    if (!reader || !target) return null;
    const esc    = foundry.utils.escapeHTML;
    const points = SocialArchetypeManager.getCharacterNotes(target).points ?? {};
    const filled = (typeof PROFILE_POINTS !== "undefined" ? PROFILE_POINTS : [])
      .filter(p => (points[p.id] ?? "").trim());
    const pick = filled.find(p => prefer.includes(p.id))
      ?? (filled.length ? filled[Math.floor(Math.random() * filled.length)] : null);
    const whisper = [
      ...game.users.filter(u => reader.testUserPermission(u, "OWNER")).map(u => u.id),
      ...game.users.filter(u => u.isGM).map(u => u.id),
    ];
    const line = pick
      ? `🔍 <b>${esc(target.name)}</b> — their <b>${esc(pick.label)}</b>: <i>“${esc(points[pick.id].trim())}”</i>`
      : `🔍 <b>${esc(target.name)}</b> lets something slip — but nothing you can name yet (GM: their dossier is empty — tell them something true).`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: reader }),
      content: `<div class="tsl-maneuver-card tsl-mv--success"><div class="tsl-mv-tell">${line}</div></div>`,
      whisper: [...new Set(whisper)],
    });
    return pick?.id ?? null;
  }

  /**
   * Call in a LEVER state (v2.0): the one who put it there spends it.
   *   guilted (Beholden)  — call the debt: a truthful answer or a reasonable
   *                         request, and one of their secrets is whispered.
   *   smitten (Enthralled) — ask a favor: one reasonable request, granted;
   *                         the spell ends.
   * GM CLIENT ONLY (reached through TSLGMActions "callLever").
   */
  static async callLever(holderId, targetId, stateId) {
    if (!game.user.isGM) return false;
    const holder = game.actors.get(holderId), target = game.actors.get(targetId);
    const meta   = SOCIAL_CONDITIONS[stateId];
    if (!holder || !target || !meta?.lever) return false;
    const scope = SocialArchetypeManager.getFlagScope();
    const eff   = SocialArchetypeManager.getActiveCondition(target, stateId);
    if (!eff || eff.flags?.[scope]?.sourceActorId !== holderId) {
      ui.notifications?.warn?.(`TSL: ${target.name} isn't ${meta.label} to ${holder.name}.`);
      return false;
    }
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="tsl-maneuver-card tsl-mv--success">
        <div class="tsl-mv-header"><i class="fas ${meta.lever.icon ?? "fa-hand"}"></i>
          <span class="tsl-mv-name">${esc(meta.lever.label)}</span></div>
        <div class="tsl-mv-outcome tsl-mv-outcome--success"><b>${esc(holder.name)}</b> calls it in — <b>${esc(target.name)}</b> ${esc(meta.lever.text)}.</div>
      </div>`,
    });
    if (stateId === "guilted") await SocialManeuverRoller.whisperSecret(holder, target);
    await SocialArchetypeManager.spendCondition(target, stateId);
    return true;
  }

  /**
   * Fold what followed a roll (defence, state, wound, their Answer…) into the
   * roll's own chat card. Falls back to ONE small card when the roll card
   * can't be updated (no card in the payload, or a stubbed environment).
   */
  static async _finishCard(cardMsg, cardData, after, reaction, sourceActor) {
    if (!after.length && !reaction) return;
    if (cardMsg?.update && cardData) {
      await cardMsg.update({ content: SocialManeuverRoller._cardContent({ ...cardData, after, reaction }) });
      return;
    }
    if (!after.length) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      content: `<div class="tsl-maneuver-card tsl-mv--info">${SocialManeuverRoller._afterHTML(after)}</div>`,
    });
  }

  /** The "what followed" list inside a card. */
  static _afterHTML(after) {
    if (!after?.length) return "";
    return `<ul class="tsl-mv-after">${after.map(x =>
      `<li class="tsl-mv-after-item tsl-mv-after--${x.tone ?? "info"}">${x.html}</li>`).join("")}</ul>`;
  }

  /**
   * The Answer: the archetype punishes a bad misstep (botch or immunity hit)
   * in its triad's own language — the debuff lands on the ATTACKER. Public
   * card is veiled: it's evidence of their nature, not the answer sheet.
   * Statuses know about bonds: the attacker's bond toward the one answering
   * can make it run deep — or keep it from landing at all.
   */
  static async _applyAnswer(sourceActor, targetActor) {
    // NPC: archetype's triad. PC: the ruling triad of the dots THEY built —
    // the player's chosen nature answers in its own language.
    const realArch = SocialArchetypeManager.getArchetype(targetActor);
    const triad    = realArch?.triad
      ?? SocialArchetypeManager.getDefensiveProfile(targetActor).ruling;
    const answer   = triad ? TRIAD_ANSWER[triad] : null;
    if (!answer) return null;
    const esc = foundry.utils.escapeHTML;
    let tail = "";
    if (answer.status) {
      const res = await SocialArchetypeManager.applyStateWithBonds(sourceActor, answer.status, targetActor);
      const st  = SOCIAL_CONDITIONS[answer.status]?.label ?? answer.status;
      if (res.resisted)  tail = ` <i>— but it doesn't take: ${esc(res.bondLabel)} (${esc(res.why)}).</i>`;
      else if (res.deep) tail = ` <i>— and it runs deep (${esc(res.bondLabel)}): ${esc(st)} lasts two uses.</i>`;
    }
    if (answer.strings) await TSLStringStore.add(targetActor.id, sourceActor.id, answer.strings);
    // The caller folds this line into the roll's own card (one roll, one card).
    return `⚔ ${answer.line(esc(sourceActor.name), esc(targetActor.name))}${tail}`;
  }

  static _holdLineEnabled() {
    try { return game.settings.get("tsl-social-conflict", "enableHoldLine") !== false; }
    catch { return true; }
  }

  /**
   * HOLD THE LINE (v2.0) — the one defensive choice: a state is about to be
   * put on you; accept it, or refuse it by carrying a lasting Wound instead
   * (the matching feeling — refuse Provoked and it festers as Wrath). The blow
   * itself always lands: composure has no parry.
   * o = { defender, attacker, maneuver, status, statusDeep, holdOptions, stance }.
   * Returns { hold } — a Wound id or null. "Gives ground" accepts; "Stands
   * firm" holds with a FRESH Wound while it can; "Decide each time" asks.
   */
  static async promptHoldLine(o) {
    const esc = foundry.utils.escapeHTML;
    const holds = o.status ? (o.holdOptions ?? []) : [];
    if (!holds.length) return { hold: null };
    if (o.stance && o.stance !== "ask") return SocialManeuverRoller._autoHold(o, o.stance);

    const stLabel = SOCIAL_CONDITIONS[o.status]?.label ?? o.status;
    const stDesc  = SOCIAL_CONDITIONS[o.status]?.description ?? "";
    const opts = [
      { key: "accept", label: "Accept", cost: `${stLabel}${o.statusDeep ? " ×2" : ""}`, hold: null,
        tip: `Take the ${stLabel} state: ${stDesc}${o.statusDeep ? " It runs deep through your bond — it lasts TWO uses." : ""}` },
      ...holds.map(w => {
        const m = TSLConditionEffects.getMeta(w);
        const tier = TSLConditionEffects.getTier(o.defender, w);
        return { key: `hold-${w}`, label: "Hold the line", cost: `carry ${m?.label ?? w} ${"●".repeat(Math.min(3, tier + 1))}`, hold: w,
          tip: `Refuse ${stLabel} by carrying a lasting ${m?.label ?? w} instead${tier ? ` (it deepens to ${"●".repeat(tier + 1)})` : ""}. A Wound heals through the story — a long rest only eases it one tier — and it opens matching maneuvers against you (+2). Wounds weighing 4+ make you Overwhelmed: no more holding the line.` };
      }),
    ];
    const radios = opts.map(op => `
      <label class="tsl-meet-opt" data-tooltip="${esc(op.tip)}">
        <input type="radio" name="tsl-state" value="${op.key}" ${op.key === "accept" ? "checked" : ""}>
        <span class="tsl-meet-name">${esc(op.label)}</span><span class="tsl-meet-cost">${esc(op.cost)}</span>
      </label>`).join("");

    return new Promise(resolve => {
      const read = (html) => {
        const root = html instanceof HTMLElement ? html : html?.[0];
        const sk = root?.querySelector?.('input[name="tsl-state"]:checked')?.value ?? "accept";
        return { hold: opts.find(x => x.key === sk)?.hold ?? null };
      };
      new Dialog({
        title: `${o.defender?.name ?? "Defender"} — hold the line?`,
        content: `<div class="tsl-rollmods tsl-meet">
          <p>${esc(o.attacker?.name ?? "They")}'s <b>${esc(o.maneuver?.name ?? "")}</b> lands — they'd be <b>${esc(stLabel)}</b>.</p>
          <div class="tsl-meet-row"><span class="tsl-meet-label">The state</span><div class="tsl-meet-opts">${radios}</div></div>
          <p class="notes">Hover an option for the full rule. The blow itself lands either way — this is only about the state.</p>
        </div>`,
        buttons: { ok: { icon: '<i class="fas fa-shield-halved"></i>', label: "Decide", callback: (html) => resolve(read(html)) } },
        default: "ok",
        close: () => resolve({ hold: null }),
      }, tslDialogOptions()).render(true);
    });
  }

  /**
   * How someone with a fixed "When pressed" meets a state, no window:
   *   yield — accept it;
   *   firm  — hold the line with a FRESH Wound (one they don't carry yet), else accept.
   */
  static _autoHold(o, stance) {
    if (stance === "firm") {
      const fresh = (o.holdOptions ?? []).find(w => TSLConditionEffects.getTier(o.defender, w) === 0) ?? null;
      return { hold: fresh, auto: true, stance };
    }
    return { hold: null, auto: true, stance };
  }

  /** Shared-conflict bookkeeping that runs whatever the outcome was. */
  static async _afterOutcome(payload, encBefore, srcEncBefore = null) {
    const { sourceActorId, targetActorId, maneuverId, outcomeType, spentString } = payload;
    const targetActor = game.actors.get(targetActorId);
    const sourceActor = game.actors.get(sourceActorId);
    const maneuver    = SocialManeuverRoller.getManeuver(maneuverId);
    const encNow      = SocialEncounterManager.getEncounter(targetActor);
    const srcNow      = sourceActor ? SocialEncounterManager.getEncounter(sourceActor) : null;
    // Did this exchange just end — and for whom? Either side can lose it now:
    // the target broken by the blow, or the attacker by their own misses.
    const resolved    = (!encBefore?.outcome && encNow?.outcome) ? encNow.outcome : null;
    const resolvedSrc = (srcEncBefore && !srcEncBefore.outcome && srcNow?.outcome) ? srcNow.outcome : null;

    // Broadcast a "social pulse" to every client's Scene Visualizer: who acted
    // on whom, the school, the grade, and how much composure fell (the flash).
    // Fires for EVERY maneuver — Chronicle console or conflict window — because
    // it runs before the conflict-window gate below.
    try {
      if (typeof TSLSocket !== "undefined") {
        const drop = Math.max(0, (encBefore?.composure ?? 0) - (encNow?.composure ?? 0));
        const gain = Math.max(0, (encNow?.composure ?? 0) - (encBefore?.composure ?? 0));   // Reassure
        TSLSocket.broadcastPulse({
          srcId: sourceActorId, tgtId: targetActorId,
          group: maneuver?.group ?? "general",
          outcome: outcomeType, damage: drop, heal: gain,
          // If this blow decided the exchange, the visualiser plays the
          // resolution drama on whoever lost it (gave in = warm break ·
          // stormed off = fade).
          resolved, resolvedSrc,
        });
      }
    } catch (err) { console.warn("TSL | pulse broadcast failed:", err); }

    // ── Shared conflict integration: log + advance turn ──────────────────────
    const state = ConflictStore.state;
    if (!state?.active || state.resolved) return;
    const srcIdx = state.participants.findIndex(p => p.actorId === sourceActorId);
    const tgtP   = state.participants.find(p => p.actorId === targetActorId);
    if (srcIdx === -1 || !tgtP) return;
    const srcName = state.participants[srcIdx].name;

    const typeMap = { success: "hit", crit: "hit", failure: "miss", botch: "warn", immune: "warn" };
    const spendNote = spentString ? " (String spent)" : "";
    ConflictStore.addLog(
      `${srcName} → ${tgtP.name}: ${maneuver.name}${spendNote} — ${outcomeType}`,
      typeMap[outcomeType] ?? "info"
    );

    // If this roll just decided the exchange, say so where everyone looks
    const endLine = (name, o) => o === "swayed"
      ? [`🤝 ${name}'s composure breaks — they give in.`, "kiss"]
      : [`🚪 ${name}'s composure breaks — they storm off.`, "warn"];
    if (resolved)    ConflictStore.addLog(...endLine(tgtP.name, resolved));
    if (resolvedSrc) ConflictStore.addLog(...endLine(srcName, resolvedSrc));

    // No turn advance — anyone acts from their own menu, whenever they like.
    ConflictStore._broadcast();
  }

  /** Post a roll's card; returns the ChatMessage so what follows can be folded in. */
  static async _postCard(d) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: d.sourceActor }),
      content: SocialManeuverRoller._cardContent(d),
      // A system roll already lives in the system's own message — re-attaching
      // it here would fire dice animations twice
      rolls: d.systemRoll || !d.roll ? [] : [d.roll],
    });
  }

  /** The HTML of a roll's card: the roll, the outcome, then what followed. */
  static _cardContent(d) {
    const esc  = foundry.utils.escapeHTML;
    const a    = d.assessment;
    const sign = a.skillMod >= 0 ? "+" : "";

    // What rode on top of the die — small signed chips under the roll line.
    const bonuses = [
      ...(d.stringBonus ? [{ value: d.stringBonus, label: "String" }] : []),
      ...(d.situational ? [{ value: d.situational, label: "situational" }] : []),
      ...a.bonusReasons.map(b => ({
        value: b.value,
        // Don't solve the riddle in public: veil archetype-derived
        // labels, and keep card labels SHORT (no parentheticals)
        label: b.kind === "counter"   ? "a hidden yielding"
          : b.kind === "countered" ? "a hidden resistance"
          : b.label.split(" — ")[0].replace(/\s*\(.+\)\s*$/, ""),
      })),
    ];
    // A system-dialog roll already carries its own breakdown in the system's
    // card — ours shows only what the module added on top of it (the String).
    const bonusHtml = (d.systemRoll ? bonuses.filter(b => b.label === "String") : bonuses).map(b =>
      `<span class="tsl-mv-bonus tsl-mv-bonus--${b.value >= 0 ? "pos" : "neg"}">${b.value >= 0 ? "+" : "−"}${Math.abs(b.value)} ${esc(b.label)}</span>`).join("");
    const kept = d.advantage ? Math.max(...d.rawDice)
               : d.disadvantage ? Math.min(...d.rawDice)
               : d.rawDice[0];
    let keptShown = false;   // with two equal faces, only one is "kept"
    const die = (v) => {
      const k = !keptShown && v === kept;
      if (k) keptShown = true;
      return `<span class="tsl-mv-die ${k ? "" : "tsl-mv-die--dropped"}">${v}</span>`;
    };
    const diceText = d.systemRoll
      ? `${d.rawDice.map(die).join("")}<span class="tsl-mv-mod">system check</span>`
      : `${d.rawDice.map(die).join("")}${d.rawDice.length > 1 ? `<span class="tsl-mv-mod">${d.disadvantage ? "dis" : "adv"}</span>` : ""}`
        + `<span class="tsl-mv-mod">${sign}${a.skillMod} ${esc(d.maneuver.skill ?? "")}</span>`;

    // Evidence without answers: the two dice already show the Advantage; the
    // reason lines must not name the archetype for everyone to read. Only the
    // weak spot wears ◎ (it IS the weak-spot mark); other sources say ADV.
    const reasons = a.advantageReasons.map(r => {
      const weakSpot = a.relation === "vulnerable" && r === a.relationReason;
      const text = weakSpot ? "You struck something raw — this approach truly works on them" : r;
      return `<div class="tsl-mv-reason">${weakSpot ? "◎" : `<span class="tsl-mv-adv">ADV</span>`} ${esc(text)}</div>`;
    }).join("");

    // Never bake the archetype name into the shared card — even when the GM
    // rolls, players would read it. The GM has the participant badge for that.
    const badgeHtml = a.relation !== "neutral"
      ? `<span class="tsl-mv-badge tsl-mv-badge--${a.relation === "vulnerable" ? "vulnerable" : "immune"}">${a.relation === "vulnerable" ? "◎ Vulnerable" : "✕ Walled"}</span>`
      : "";

    return `
<div class="tsl-maneuver-card tsl-mv--${d.outcomeType}">
  <div class="tsl-mv-header">
    <i class="fas ${d.maneuver.icon}"></i>
    <span class="tsl-mv-name">${esc(d.maneuver.name)}</span>
    ${badgeHtml}
  </div>
  <div class="tsl-mv-target">↳ ${esc(d.targetActor.name)}</div>
  ${reasons}
  ${a.combo ? `<div class="tsl-mv-reason">⊕ Opening — ${esc(a.combo.label)}</div>` : ""}
  <div class="tsl-mv-roll">
    <span class="tsl-mv-dice">${diceText}</span>
    <span class="tsl-mv-vs" data-tooltip="The difficulty stays with the GM — the card never shows it.">vs DC ?</span>
    <span class="tsl-mv-total tsl-mv-total--${d.outcomeType}">${d.total}</span>
  </div>
  ${bonusHtml ? `<div class="tsl-mv-bonuses">${bonusHtml}</div>` : ""}
  <div class="tsl-mv-outcome tsl-mv-outcome--${d.outcomeType}">${esc(d.outcomeText)}</div>
  ${SocialManeuverRoller._afterHTML(d.after)}
  ${d.reaction ? `<div class="tsl-mv-tell">${esc(d.reaction)}</div>` : ""}
</div>`;
  }
}
