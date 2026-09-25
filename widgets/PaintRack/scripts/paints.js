/*
 * paints.js — approximate swatch colors for common Citadel paints, plus
 * starter recipes. Colors are eyeballed approximations for on-screen
 * reference, not official values. Paint names belong to Games Workshop.
 */

// name -> [hex, kind] (kind: base, layer, shade, contrast, technical, spray)
var PAINTS = {
  "Chaos Black": ["#1b1b1c", "spray"],
  "Wraithbone": ["#e6dcc0", "spray"],
  "Grey Seer": ["#a7a9a8", "spray"],
  "Abaddon Black": ["#231f20", "base"],
  "Corax White": ["#ececec", "base"],
  "Macragge Blue": ["#0f3d7c", "base"],
  "Kantor Blue": ["#0c2d5a", "base"],
  "Caledor Sky": ["#366699", "base"],
  "Mephiston Red": ["#9a1115", "base"],
  "Khorne Red": ["#6a0001", "base"],
  "Waaagh! Flesh": ["#1e4d2b", "base"],
  "Caliban Green": ["#00401f", "base"],
  "Castellan Green": ["#314821", "base"],
  "Averland Sunset": ["#fbb81c", "base"],
  "Retributor Armour": ["#c39e57", "base"],
  "Leadbelcher": ["#888d8f", "base"],
  "Balthasar Gold": ["#a47552", "base"],
  "Rhinox Hide": ["#493435", "base"],
  "Mournfang Brown": ["#6b3a1f", "base"],
  "Zandri Dust": ["#9e915c", "base"],
  "Rakarth Flesh": ["#a29e91", "base"],
  "Bugman's Glow": ["#834f44", "base"],
  "Mechanicus Standard Grey": ["#3d4b4d", "base"],
  "Naggaroth Night": ["#3d3354", "base"],
  "Incubi Darkness": ["#0b474a", "base"],
  "Nuln Oil": ["#1b1a1d", "shade"],
  "Agrax Earthshade": ["#3b2b1f", "shade"],
  "Reikland Fleshshade": ["#7a4a2b", "shade"],
  "Drakenhof Nightshade": ["#1c3a5e", "shade"],
  "Carroburg Crimson": ["#6a1a24", "shade"],
  "Biel-Tan Green": ["#1f5d3a", "shade"],
  "Seraphim Sepia": ["#d7824b", "shade"],
  "Athonian Camoshade": ["#6d8e44", "shade"],
  "Druchii Violet": ["#3d1f4e", "shade"],
  "Calgar Blue": ["#4272b8", "layer"],
  "Altdorf Guard Blue": ["#1f56a7", "layer"],
  "Fenrisian Grey": ["#6d94b3", "layer"],
  "Evil Sunz Scarlet": ["#c01411", "layer"],
  "Wild Rider Red": ["#ea2f28", "layer"],
  "Warboss Green": ["#317e57", "layer"],
  "Skarsnik Green": ["#5f9370", "layer"],
  "Moot Green": ["#52b244", "layer"],
  "Elysian Green": ["#6b8c4a", "layer"],
  "Ogryn Camo": ["#9da94b", "layer"],
  "Liberator Gold": ["#d3b587", "layer"],
  "Auric Armour Gold": ["#c79b35", "layer"],
  "Stormhost Silver": ["#bbc6c9", "layer"],
  "Runefang Steel": ["#c3cacb", "layer"],
  "Ironbreaker": ["#a1a6a9", "layer"],
  "Ushabti Bone": ["#bbbb7f", "layer"],
  "Screaming Skull": ["#d4d7a8", "layer"],
  "Cadian Fleshtone": ["#c77958", "layer"],
  "Kislev Flesh": ["#d1a570", "layer"],
  "Skrag Brown": ["#8b4806", "layer"],
  "Tyrant Skull": ["#cdc586", "layer"],
  "Dawnstone": ["#70756e", "layer"],
  "Administratum Grey": ["#949b95", "layer"],
  "Yriel Yellow": ["#ffda00", "layer"],
  "Temple Guard Blue": ["#239489", "layer"],
  "Stirland Mud": ["#492b00", "technical"],
  "Armageddon Dust": ["#d3a907", "technical"],
  "Nihilakh Oxide": ["#66b39e", "technical"],
  "Blood for the Blood God": ["#7a0a0a", "technical"],
  "Middenland Tufts": ["#8a8a3a", "technical"],
};

// Steps: [paint, technique, tip]
var RECIPES = [
  { name: "Ultramarine Armour", group: "Space Marines", steps: [
    ["Chaos Black", "Prime", "Thin, even spray"],
    ["Macragge Blue", "Base", "Two thin coats"],
    ["Nuln Oil", "Shade", "Recesses only"],
    ["Calgar Blue", "Layer", "Raised areas"],
    ["Fenrisian Grey", "Edge", "Sharp edges and corners"]] },
  { name: "Blood Angel Red", group: "Space Marines", steps: [
    ["Chaos Black", "Prime", "Or Wraithbone for a brighter red"],
    ["Mephiston Red", "Base", "Two or three thin coats"],
    ["Carroburg Crimson", "Shade", "Recesses"],
    ["Evil Sunz Scarlet", "Layer", "Top surfaces"],
    ["Wild Rider Red", "Edge", "Fine edges only"]] },
  { name: "Ork Skin", group: "Orks", steps: [
    ["Chaos Black", "Prime", ""],
    ["Waaagh! Flesh", "Base", "Whole skin"],
    ["Biel-Tan Green", "Shade", "All over, let it pool"],
    ["Warboss Green", "Layer", "Leave the recesses dark"],
    ["Skarsnik Green", "Edge", "Knuckles, brow, nose"],
    ["Moot Green", "Highlight", "Tiny dots on the brightest spots"]] },
  { name: "Ork Rusty Metal", group: "Orks", steps: [
    ["Leadbelcher", "Base", "Messy is fine"],
    ["Agrax Earthshade", "Shade", "All over"],
    ["Skrag Brown", "Dab", "Sponge patches of rust"],
    ["Ironbreaker", "Drybrush", "Light drybrush"],
    ["Nihilakh Oxide", "Technical", "Tiny bit in recesses"]] },
  { name: "Gold Trim", group: "Metals", steps: [
    ["Retributor Armour", "Base", "Trim and eagles"],
    ["Reikland Fleshshade", "Shade", "Recesses"],
    ["Auric Armour Gold", "Layer", "Raised areas"],
    ["Liberator Gold", "Edge", ""],
    ["Stormhost Silver", "Highlight", "Points of light only"]] },
  { name: "Steel Weapons", group: "Metals", steps: [
    ["Leadbelcher", "Base", ""],
    ["Nuln Oil", "Shade", "All over"],
    ["Ironbreaker", "Layer", ""],
    ["Runefang Steel", "Edge", "Blade edges"]] },
  { name: "Bone and Parchment", group: "Details", steps: [
    ["Zandri Dust", "Base", ""],
    ["Seraphim Sepia", "Shade", "Or Agrax for grimier bone"],
    ["Ushabti Bone", "Layer", ""],
    ["Screaming Skull", "Edge", ""]] },
  { name: "Human Flesh", group: "Details", steps: [
    ["Bugman's Glow", "Base", ""],
    ["Reikland Fleshshade", "Shade", "All over"],
    ["Cadian Fleshtone", "Layer", "Leave the shade in creases"],
    ["Kislev Flesh", "Highlight", "Nose, cheeks, knuckles"]] },
  { name: "Easy Earth Base", group: "Basing", steps: [
    ["Stirland Mud", "Texture", "Spread with an old brush"],
    ["Agrax Earthshade", "Shade", "Once dry"],
    ["Tyrant Skull", "Drybrush", "Light drybrush"],
    ["Middenland Tufts", "Tufts", "Two or three per base"],
    ["Abaddon Black", "Rim", "Neat base edge"]] },
];

// Guess a swatch for a paint name that isn't in the table.
function paintInfo(name) {
  var key = Object.keys(PAINTS).find(function (k) { return k.toLowerCase() === String(name).trim().toLowerCase(); });
  if (key) return { name: key, hex: PAINTS[key][0], kind: PAINTS[key][1], known: true };
  // Unknown paint: pick a stable grey-ish hue from the name so it still reads as a swatch.
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { name: String(name).trim(), hex: "hsl(" + h + ", 25%, 45%)", kind: "", known: false };
}
