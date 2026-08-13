// shared/jobs.js
//
// Canonical list of Forever RP jobs, used for validation in both the bot
// and the API so a job name can never be typed/guessed that doesn't
// actually exist in-game.
//
// IMPORTANT: the REAL source of truth is your Roblox `setjobconfig`
// ModuleScript (ServerScriptService.setjobconfig). Whenever you add,
// rename, or remove a job there, mirror the exact same key (same spelling,
// same casing) in the list below — otherwise /setjob will reject it here
// even though it exists in-game, or vice versa.

const JOBS = [
  // Overheid — uitdienst
  'offpolice', 'offkmar', 'offambulance', 'offmechanic', 'offadvocaat', 'offbrandweer',

  // Overheid — indienst
  'kmar', 'police', 'dsi', 'recherche', 'mechanic', 'ambulance', 'dji', 'kct',
  'brandweer', 'taxi', 'security',

  'hrb', 'bot',

  // Werkloos
  'unemployed',

  // Non-whitelisted jobs
  'postnl', 'technician', 'Vakkenvuller', 'duiker', 'poolcleaner', 'vuilnisman', 'thuisbezorgd',

  // Whitelisted burger jobs
  'luxury', 'advocaat', 'vliegschool',

  // Gang jobs
  'gang_bratva', 'gang_gaviao', 'gang_brigazi', 'gang_grmc', 'gang_gsf', 'gang_kaibiles',
  'gang_kozlov', 'gang_lostmc', 'gang_medellin', 'gang_menendez', 'gang_mercy', 'gang_laicona',
  'gang_yakuza', 'gang_netas', 'gang_reznikov', 'gang_saints', 'gang_scc', 'gang_soulz',
  'gang_traids', 'gang_santos', 'gang_ww', 'gang_yt', 'gang_zone6', 'gang_bloods', 'gang_blockp',
  'gang_bandoleros', 'gang_alba', 'gang_akatsuki', 'gang_14k', 'gang_handz', 'gang_montana',
  'gang_cali', 'gang_sinaloa', 'gang_santosboss', 'lafamboss', 'gang_ms_13', 'gang_kitty',
  'gang_sc', 'gang_laonda', 'gang_crips', 'gang_muertos', 'gang_tijuana', 'gang_satudarah',
  'kerstpack', 'mocro', 'wapendealer', 'Owner',

  // Onderwereld
  'gang_narcos', 'gang_lafamilia', 'gang_young',
  'union', 'Hitman', 'hellokitty', 'Onderwereld',
];

function isValidJob(job) {
  return typeof job === 'string' && JOBS.includes(job);
}

module.exports = { JOBS, isValidJob };
