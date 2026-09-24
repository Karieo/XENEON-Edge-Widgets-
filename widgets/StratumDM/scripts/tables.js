/*
 * Stratum random tables. Edit freely: one string per line, keep the commas.
 */

var COMPLICATIONS = [
  "A Compliance patrol turns the corner early. Someone in the group matches a flagged face.",
  "The Syndex terminal they need demands a biometric re-scan. It will log the attempt.",
  "Power cut on this tier. Emergency lights only, and the lift is dead between floors.",
  "A contact's handset rings mid-deal. It's Compliance, and they're asking about the party.",
  "The informant wants double. Syndex just called in their loan and they're desperate.",
  "Someone's been here first. The room is tossed and the thing they came for is gone.",
  "An Order sigil is scratched into the doorframe, fresh. It wasn't there an hour ago.",
  "A City Government inspector is on site with a clipboard and two bored enforcers.",
  "The job's client is a Null front. One of the party recognizes the shell company.",
  "Air filtration fails in the block. Masks on, visibility drops, tempers rise.",
  "A street kid lifts something small but important from a pocket and bolts for the stacks.",
  "The data drop is corrupted. What survives is half of a name and a tier number.",
  "A Syndex drone is quietly recording the whole conversation from a ceiling vent.",
  "The bridge between towers is closed for 'maintenance.' The long way runs through the deep tiers.",
  "An old debt surfaces. Someone from a character's past is running the door here.",
  "A curfew siren sounds early. Anyone caught outside after the second tone gets processed.",
  "Their credentials get flagged as cloned. Access is pending review for ten minutes.",
  "Two gangs start a turf fight in the street below. The only exit runs through it.",
  "A body in the stairwell, still warm. Compliance sirens are already on the way up.",
  "A friendly NPC sells them out, then looks genuinely sorry about it.",
  "The weather shield flickers. Acid rain for the next hour on the exposed levels.",
  "A Null agent makes contact, polite and patient. They know what the party is looking for.",
  "The fragment reacts. Whoever carries it hears a low tone nobody else can hear.",
  "A City Government ballot rally floods the plaza. Cameras everywhere, crowds shoulder to shoulder.",
  "Their ride demands a detour to pick up 'a package.' It's ticking. It's probably fine.",
  "Syndex pushes a firmware update. Every device the party carries reboots at once.",
  "A robed figure from the Order watches from across the street, then is gone.",
  "The safehouse door code has been changed. Someone inside isn't answering.",
  "An enforcer offers a quiet deal: name one contact and the rest of them walk.",
  "The lights go out across three tiers at once. In the dark, something starts moving.",
];

var NPC_FIRST = [
  "Vesna", "Idris", "Maro", "Kett", "Juno", "Tamsin", "Orrin", "Sable", "Lio", "Wren",
  "Dasha", "Cato", "Nyx", "Bram", "Ione", "Rook", "Ansel", "Mika", "Tove", "Quill",
  "Sera", "Deacon", "Lark", "Eamon", "Zora", "Pike", "Halden", "Veda", "Cress", "Obi",
];

var NPC_LAST = [
  "Varga", "Okonkwo", "Hale", "Strand", "Mercer", "Ivers", "Calloway", "Novak", "Rourke", "Tanaka",
  "Blackwood", "Sato", "Kestrel", "Duarte", "Voss", "Lindqvist", "Marsh", "Achebe", "Crane", "Oyelaran",
  "Pell", "Quade", "Rask", "Solis", "Thorne",
];

var NPC_ROLES = [
  "Syndex loan officer", "Compliance desk sergeant", "deep-tier fixer", "City Government clerk",
  "air-filter tech", "noodle stall owner", "off-duty enforcer", "data broker", "courier",
  "retired Order initiate", "clinic medic", "tower maintenance lead", "bartender", "street preacher",
  "archivist", "smuggler pilot", "pawn-shop owner", "union organizer", "junk-market runner", "night janitor",
];

var NPC_HOOKS = [
  "owes Syndex more than they'll ever earn and will sell almost anything",
  "saw the party's faces on a Compliance board this morning",
  "is running a quiet side-job for Null and wants out",
  "keeps a key to a sealed maintenance shaft in the deep tiers",
  "lost a sibling to the Order and wants to know why",
  "has a cloned credential that works exactly once",
  "is being blackmailed by a City Government councilor",
  "hears the same low tone the fragment makes, every night at 3:10",
  "knows which Compliance patrols take bribes and which ones report them",
  "was paid to watch the party and hasn't decided who to tell",
  "runs a clinic off the books and never asks questions, until now",
  "is selling a map of the old tunnels, half of it wrong",
  "has a Syndex drone's kill-switch code written on their wrist",
  "was a witness to something the Government erased from the record",
  "wants the party to deliver a sealed case, no questions",
  "remembers the city before the tiers and won't say how",
  "is secretly an Order courier and carries runes sewn into their coat",
  "just got promoted and is terrified of the people who arranged it",
  "is hiding a wanted fugitive in the back room",
  "trades rumors for rumors and keeps a very careful ledger",
];
