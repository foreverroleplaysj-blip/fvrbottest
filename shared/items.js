// shared/items.js
//
// Canonical list of Ox_Inventory item + weapon keys, used for /giveitem
// autocomplete + validation in the bot/API.
//
// IMPORTANT: the REAL source of truth is your Ox_inventory ModuleScript
// (["Items"] and ["Wapens"] tables). Whenever you add/rename/remove an
// item there, mirror the exact same key here too.

const ITEMS = [
  // Items
  'Tiewraps', 'Telefoon', 'Contant', 'Zwartgeld', 'Identiteitskaart', 'Rijbewijs',
  'Tonnenzakjes', 'Tonnen', 'Planten', 'PlofkraakMatriaal',

  // Wapens — pistolen
  'Baretta', 'Colt M1911', 'Desert Eagle', 'Glock 17', 'Glock 17 DSI', 'Glock 17 NovaPack',
  'Glock 18', 'Glock 18 switch', 'Kerst Glock 18', 'M17', 'M1911', 'Spain M1911', 'M1911A1',
  'Sig Sauer P220', 'Taser', 'Walther P99Q NL', 'Water M1911',
  // Revolvers
  'Smith & Wesson', 'Water Smith & Wesson',
  // SMG's
  'Kerst Ump45', 'LWRC SMG .45', 'MAC-11', 'Mcx', 'Mcx NovaPack',
  'Red Tiger UMP45 Met Suppressor', 'Scorpion EVO EoTech', 'Skorpion', 'UMP45',
  'UMP45 Met Suppressor', 'MP5',
  // Assault rifles
  'AK-12 dono', 'AK-47', 'AK-47 Met Suppressor', 'AK-74U', 'HK416', 'LVOAC', 'M4A1',
  'SIG MCX VIRTUS', 'Water AK-47', 'Spain AK-47',
  // Snipers
  'ARMALITE AR50A1', 'HK G28', 'TAC-300 15x',
  // Shotguns
  'Remington 680', 'Spas-12',
  // Messen / knuppels / bijlen
  'Bayonet', 'Barbed Wirebat', 'Dark-Nova Barbed Wirebat', 'Darkmatter Barbed Wirebat',
  'Jungle Barbed Wirebat', 'Redmatter Barbed Wirebat', 'Royal Splash Barbed Wirebat',
  'Water Barbed Wirebat', 'Dark-Nova Fire Axe', 'Darkmatter Fire Axe', 'Fire Axe',
  'Jungle Fire Axe', 'Redmatter Fire Axe', 'Royal Splash Fire Axe', 'Water Fire Axe',
  // Explosieven
  'Explosief', 'Thermiet', 'Flashbang', 'Gas', 'Rook',
  // Politie / uitrusting
  'DSI Schild', 'Veiligheids touw', 'Walther P99',
  // Medisch
  'AED', 'Corpuls',
  // Tools / overig
  'Laptop', 'MEOS', 'Radio', 'AlarmPistool', 'Brandblusser',
];

function isValidItem(item) {
  return typeof item === 'string' && ITEMS.includes(item);
}

module.exports = { ITEMS, isValidItem };
