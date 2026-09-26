/*
 * srd.js — D&D 5e (2014) quick-reference text for GRIMOIRE.
 *
 * This work includes material taken from the System Reference Document 5.1
 * ("SRD 5.1") by Wizards of the Coast LLC and available at
 * https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
 * licensed under the Creative Commons Attribution 4.0 International License
 * available at https://creativecommons.org/licenses/by/4.0/legalcode.
 *
 * The rules below are condensed summaries of that material.
 * Entry: { name, tag, lines: [...] } or { name, tag, table: [[head...], [row...]...], lines? }
 */

var SRD_TABS = [
  {
    key: "conditions",
    title: "Conditions",
    entries: [
      { name: "Blinded", tag: "Condition", lines: [
        "Can't see. Automatically fails any check that needs sight.",
        "Attacks against it have advantage.",
        "Its attacks have disadvantage."] },
      { name: "Charmed", tag: "Condition", lines: [
        "Can't attack the charmer or target them with harmful abilities or magic.",
        "The charmer has advantage on checks to interact socially with it."] },
      { name: "Deafened", tag: "Condition", lines: [
        "Can't hear. Automatically fails any check that needs hearing."] },
      { name: "Exhaustion", tag: "Condition, cumulative", table: [
        ["Level", "Effect"],
        ["1", "Disadvantage on ability checks"],
        ["2", "Speed halved"],
        ["3", "Disadvantage on attacks and saving throws"],
        ["4", "Hit point maximum halved"],
        ["5", "Speed reduced to 0"],
        ["6", "Death"]], lines: [
        "Each level adds to the ones before it.",
        "A long rest with food and drink removes one level."] },
      { name: "Frightened", tag: "Condition", lines: [
        "Disadvantage on ability checks and attacks while the source of its fear is in sight.",
        "Can't willingly move closer to the source."] },
      { name: "Grappled", tag: "Condition", lines: [
        "Speed is 0 and can't benefit from bonuses to speed.",
        "Ends if the grappler is incapacitated.",
        "Ends if an effect moves it out of the grappler's reach, like being thrown by thunderwave."] },
      { name: "Incapacitated", tag: "Condition", lines: [
        "Can't take actions or reactions."] },
      { name: "Invisible", tag: "Condition", lines: [
        "Can't be seen without magic or a special sense. Counts as heavily obscured for hiding.",
        "Noise or tracks can still give away its location.",
        "Attacks against it have disadvantage. Its attacks have advantage."] },
      { name: "Paralyzed", tag: "Condition", lines: [
        "Incapacitated. Can't move or speak.",
        "Automatically fails Strength and Dexterity saves.",
        "Attacks against it have advantage.",
        "Any hit from within 5 feet is a critical hit."] },
      { name: "Petrified", tag: "Condition", lines: [
        "Turned to stone with everything it wears and carries. Weight x10, stops aging.",
        "Incapacitated, can't move or speak, unaware of its surroundings.",
        "Attacks against it have advantage. Automatically fails Strength and Dexterity saves.",
        "Resistance to all damage. Immune to poison and disease (existing ones are suspended)."] },
      { name: "Poisoned", tag: "Condition", lines: [
        "Disadvantage on attack rolls and ability checks."] },
      { name: "Prone", tag: "Condition", lines: [
        "Can only crawl unless it stands up, which costs half its speed.",
        "Its attacks have disadvantage.",
        "Attacks against it: advantage from within 5 feet, disadvantage from farther away."] },
      { name: "Restrained", tag: "Condition", lines: [
        "Speed is 0 and can't benefit from bonuses to speed.",
        "Attacks against it have advantage. Its attacks have disadvantage.",
        "Disadvantage on Dexterity saves."] },
      { name: "Stunned", tag: "Condition", lines: [
        "Incapacitated, can't move, can speak only falteringly.",
        "Automatically fails Strength and Dexterity saves.",
        "Attacks against it have advantage."] },
      { name: "Unconscious", tag: "Condition", lines: [
        "Incapacitated, can't move or speak, unaware of its surroundings.",
        "Drops what it is holding and falls prone.",
        "Automatically fails Strength and Dexterity saves.",
        "Attacks against it have advantage. Any hit from within 5 feet is a critical hit."] },
    ],
  },
  {
    key: "actions",
    title: "Actions",
    entries: [
      { name: "Attack", tag: "Action", lines: [
        "Make one melee or ranged attack.",
        "Extra Attack lets you make more than one. Grapple and shove replace one of them."] },
      { name: "Cast a Spell", tag: "Action", lines: [
        "Spells with a casting time of 1 action use this.",
        "If you cast a bonus action spell, the only other spell you can cast that turn is a cantrip with a casting time of 1 action."] },
      { name: "Dash", tag: "Action", lines: [
        "Gain extra movement equal to your speed (after modifiers) for this turn."] },
      { name: "Disengage", tag: "Action", lines: [
        "Your movement doesn't provoke opportunity attacks for the rest of the turn."] },
      { name: "Dodge", tag: "Action", lines: [
        "Until your next turn, attacks against you have disadvantage if you can see the attacker.",
        "You make Dexterity saves with advantage.",
        "Lost if you are incapacitated or your speed drops to 0."] },
      { name: "Help", tag: "Action", lines: [
        "An ally gains advantage on their next check for a task you're helping with, or",
        "on their next attack against a creature within 5 feet of you, made before your next turn."] },
      { name: "Hide", tag: "Action", lines: [
        "Make a Dexterity (Stealth) check. You can't hide from a creature that can see you clearly.",
        "If you succeed, you gain the benefits of being unseen until found or you make noise."] },
      { name: "Ready", tag: "Action", lines: [
        "Choose a trigger and an action (or move up to your speed). React to the trigger before your next turn.",
        "A readied spell is cast now and held with concentration, then released with your reaction."] },
      { name: "Search", tag: "Action", lines: [
        "Look for something: Wisdom (Perception) or Intelligence (Investigation), as the DM decides."] },
      { name: "Use an Object", tag: "Action", lines: [
        "Interact with a second object, or use one that needs your action.",
        "Each turn you get one free object interaction, like drawing a sword or opening a door."] },
      { name: "Bonus Action", tag: "Turn structure", lines: [
        "Only when a feature, spell, or ability grants one. At most one per turn.",
        "You choose when to take it during your turn."] },
      { name: "Reaction", tag: "Turn structure", lines: [
        "One per round, regained at the start of your turn.",
        "Used for opportunity attacks, readied actions, and features like Shield."] },
    ],
  },
  {
    key: "combat",
    title: "Combat",
    entries: [
      { name: "Opportunity Attack", tag: "Reaction", lines: [
        "When a hostile creature you can see moves out of your reach, make one melee attack against it.",
        "Teleporting or being moved without using movement, action, or reaction doesn't provoke."] },
      { name: "Two-Weapon Fighting", tag: "Bonus action", lines: [
        "After attacking with a light melee weapon, attack with a different light melee weapon in the other hand.",
        "Don't add your ability modifier to the bonus attack's damage unless it is negative."] },
      { name: "Grapple", tag: "Replaces one attack", lines: [
        "Target can be at most one size larger than you and within reach.",
        "Your Strength (Athletics) vs its Strength (Athletics) or Dexterity (Acrobatics).",
        "Escape: the target uses its action for the same contest."] },
      { name: "Shove", tag: "Replaces one attack", lines: [
        "Target can be at most one size larger than you and within reach.",
        "Your Strength (Athletics) vs its Strength (Athletics) or Dexterity (Acrobatics).",
        "Win: knock it prone or push it 5 feet away."] },
      { name: "Cover", tag: "AC and Dexterity saves", table: [
        ["Cover", "Blocks", "Bonus"],
        ["Half", "At least half", "+2"],
        ["Three-quarters", "About three quarters", "+5"],
        ["Total", "Completely", "Can't be targeted directly"]] },
      { name: "Death Saves", tag: "At 0 hit points", lines: [
        "Start of each turn: d20, 10 or higher succeeds. Three successes: stable. Three failures: dead.",
        "Natural 1 counts as two failures. Natural 20: regain 1 hit point.",
        "Damage at 0 HP is a failure (a critical hit is two).",
        "If damage left over after dropping to 0 equals or exceeds your hit point maximum, you die outright."] },
      { name: "Concentration", tag: "Spells", lines: [
        "Taking damage: Constitution save, DC 10 or half the damage, whichever is higher.",
        "Broken by casting another concentration spell, being incapacitated, or dying."] },
      { name: "Critical Hit", tag: "Natural 20", lines: [
        "Roll all of the attack's damage dice twice, then add modifiers once.",
        "A natural 20 always hits. A natural 1 always misses."] },
      { name: "Unseen Attackers", tag: "Visibility", lines: [
        "Attacking a target you can't see: disadvantage.",
        "Attacking while the target can't see you: advantage. Hidden attackers reveal themselves when they attack."] },
      { name: "Ranged in Melee", tag: "Ranged attacks", lines: [
        "Disadvantage on a ranged attack while a hostile creature that can see you is within 5 feet.",
        "Attacks beyond normal range (up to long range) have disadvantage."] },
      { name: "Surprise", tag: "Start of combat", lines: [
        "A surprised creature can't move or act on its first turn and can't react until that turn ends."] },
      { name: "Underwater Combat", tag: "Special cases", lines: [
        "Underwater melee without a swim speed: disadvantage unless using a dagger, javelin, shortsword, spear, or trident.",
        "Underwater ranged attacks beyond normal range miss. Creatures fully submerged have resistance to fire damage."] },
    ],
  },
  {
    key: "checks",
    title: "Checks and Travel",
    entries: [
      { name: "Typical DCs", tag: "Ability checks", table: [
        ["Task", "DC"],
        ["Very easy", "5"], ["Easy", "10"], ["Medium", "15"],
        ["Hard", "20"], ["Very hard", "25"], ["Nearly impossible", "30"]] },
      { name: "Travel Pace", tag: "Overland", table: [
        ["Pace", "Minute", "Hour", "Day", "Effect"],
        ["Fast", "400 ft", "4 miles", "30 miles", "-5 passive Perception"],
        ["Normal", "300 ft", "3 miles", "24 miles", "-"],
        ["Slow", "200 ft", "2 miles", "18 miles", "Can use stealth"]] },
      { name: "Forced March", tag: "Travel", lines: [
        "Past 8 hours of travel in a day, each extra hour: Constitution save, DC 10 + 1 per hour past 8.",
        "Fail: one level of exhaustion."] },
      { name: "Passive Checks", tag: "Ability checks", lines: [
        "10 + all modifiers that normally apply to the check.",
        "Advantage: +5. Disadvantage: -5."] },
      { name: "Contests", tag: "Ability checks", lines: [
        "Both sides roll the relevant check. Higher total wins.",
        "A tie means nothing changes: the situation stays as it was."] },
      { name: "Group Checks", tag: "Ability checks", lines: [
        "Everyone rolls. If at least half succeed, the whole group succeeds."] },
      { name: "Jumping", tag: "Movement", lines: [
        "Long jump: up to your Strength score in feet with a 10-foot run-up, half that standing.",
        "High jump: 3 + your Strength modifier in feet with a run-up, half that standing."] },
      { name: "Difficult Terrain", tag: "Movement", lines: [
        "Every foot of movement costs 1 extra foot.",
        "Another creature's space counts as difficult terrain."] },
      { name: "Climb, Swim, Crawl", tag: "Movement", lines: [
        "Each foot costs 1 extra foot (2 extra in difficult terrain) unless you have a climbing or swimming speed."] },
    ],
  },
  {
    key: "world",
    title: "Environment",
    entries: [
      { name: "Light", tag: "Vision", table: [
        ["Light", "Counts as", "Effect"],
        ["Bright", "Normal", "Most creatures see normally"],
        ["Dim", "Lightly obscured", "Disadvantage on sight-based Perception"],
        ["Darkness", "Heavily obscured", "Effectively blinded"]] },
      { name: "Darkvision", tag: "Vision", lines: [
        "Within range, dim light counts as bright and darkness as dim light.",
        "Can't see color in darkness, only shades of gray."] },
      { name: "Falling", tag: "Hazard", lines: [
        "1d6 bludgeoning damage per 10 feet fallen, up to 20d6.",
        "Lands prone unless it avoids taking damage from the fall."] },
      { name: "Suffocating", tag: "Hazard", lines: [
        "Hold breath for 1 + Constitution modifier minutes (at least 30 seconds).",
        "After that, survive a number of rounds equal to Constitution modifier (at least 1), then drop to 0 HP."] },
      { name: "Food and Water", tag: "Hazard", lines: [
        "1 pound of food and 1 gallon of water a day (2 gallons in hot weather).",
        "Without food: 3 + Constitution modifier days (at least 1), then one exhaustion level per day."] },
      { name: "Short Rest", tag: "Resting", lines: [
        "At least 1 hour of light activity.",
        "Spend Hit Dice: roll each, add Constitution modifier, regain that many hit points."] },
      { name: "Long Rest", tag: "Resting", lines: [
        "At least 8 hours, with no more than 2 hours of light activity. Only one per 24 hours.",
        "Regain all hit points and up to half your total Hit Dice (at least 1).",
        "Interrupted by 1 hour of walking, fighting, or casting: start again."] },
      { name: "Objects", tag: "Breaking things", table: [
        ["Material", "AC"],
        ["Cloth, paper, rope", "11"], ["Crystal, glass, ice", "13"], ["Wood, bone", "15"],
        ["Stone", "17"], ["Iron, steel", "19"], ["Mithral", "21"], ["Adamantine", "23"]] },
    ],
  },
];
