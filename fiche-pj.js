const charactersIndexKey = "lw_saved_characters_index";
const lastCharacterKey = "lw_last_character_id";
const currentDuelSaveKey = "lw_current_duel_state";
const resumeDuelAfterSheetKey = "lw_resume_duel_after_sheet";

let currentSheetCharacter = null;
let currentSheetProfile = null;
let currentSheetFighter = null;
let currentSheetActions = [];
let currentSheetLevel = 0;

const fallbackCatalog = {
  fighters: [
    {
      id: "chevalier",
      shortName: "Chevalier",
      fullName: "Homme en cotte de mailles avec épée et bouclier",
      sheetFile: "data/fighters/chevalier.json",
      bookFile: "data/books/chevalier.json",
      imageFolder: "images/chevalier/"
    },
    {
      id: "squelette",
      shortName: "Squelette",
      fullName: "Squelette avec cimeterre et bouclier",
      sheetFile: "data/fighters/squelette.json",
      bookFile: "data/books/squelette.json",
      imageFolder: "images/squelette/"
    }
  ]
};

/* ============================================================
   NIVEAUX / DÉBLOCAGE DES ACTIONS
   ============================================================ */

const playerLevelTitles = [
  "Novice",
  "Aguerri",
  "Combattant",
  "Bretteur",
  "Champion",
  "Idole",
  "Vétéran"
];

const playerLevelVictoryThresholds = [0, 5, 15, 30, 50, 75, 105];

const actionUnlocksByFighter = {
  chevalier: {
    0: [
      "Coup latéral haut",
      "Coup latéral bas",
      "Coup de bouclier haut",
      "Bond en arrière"
    ],
    1: [
      "Coup plongeant violent",
      "Estoc haut",
      "Attaque protégée latérale",
      "Bond esquive"
    ],
    2: [
      "Estoc bas",
      "Coup de bouclier bas",
      "Feinte basse",
      "Attaque protégée estoc"
    ],
    3: [
      "Feinte haute",
      "Feinte estoc",
      "Attaque protégée plongeante",
      "Bond en hauteur"
    ],
    4: [
      "Coup plongeant puissant",
      "Coup de pied",
      "Désarmer",
      "Récupérer arme"
    ],
    5: [
      "Feinte coup latéral",
      "Coup latéral féroce",
      "Bond esquive basse"
    ],
    6: []
  },

  squelette: {
    0: [
      "Coup plongeant violent",
      "Coup latéral bas",
      "Coup de bouclier bas",
      "Bond esquive",
      "Récupérer arme"
    ],
    1: [
      "Coup latéral haut",
      "Estoc bas",
      "Coup de bouclier haut",
      "Bond en arrière"
    ],
    2: [
      "Coup plongeant puissant",
      "Estoc haut",
      "Feinte basse",
      "Attaque protégée latérale"
    ],
    3: [
      "Feinte estoc",
      "Attaque protégée plongeante",
      "Bond esquive basse",
      "Coup de pied"
    ],
    4: [
      "Feinte haute",
      "Désarmer",
      "Récupérer arme",
      "Coup latéral féroce"
    ],
    5: [
      "Feinte coup latéral",
      "Attaque protégée estoc",
      "Bond en hauteur"
    ],
    6: [
      "Bloque et approche",
      "Esquive",
      "Bond en arrière"
    ]
  }
};

const colorOrder = ["rouge", "orange", "vert", "jaune", "bleu", "marron"];
const colorLabels = {
  rouge: "Rouge",
  orange: "Orange",
  vert: "Vert",
  jaune: "Jaune",
  bleu: "Bleu",
  marron: "Marron"
};

/* ============================================================
   OUTILS GÉNÉRAUX
   ============================================================ */

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadJson(path) {
  const response = await fetch(path + "?v=" + Date.now());

  if (!response.ok) {
    throw new Error("Impossible de charger : " + path);
  }

  return await response.json();
}

function normalizeProfileName(name) {
  return (name || "sans_nom")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeCharacterId(fighterId, name) {
  return fighterId + "_" + normalizeProfileName(name);
}

function getPlayerProfileKey(fighterId, playerName) {
  return "lw_profile_" + fighterId + "_" + normalizeProfileName(playerName);
}

function getSavedCharacters() {
  const raw = localStorage.getItem(charactersIndexKey);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveSavedCharacters(characters) {
  localStorage.setItem(charactersIndexKey, JSON.stringify(characters || []));
}

function actionLabel(action) {
  if (!action) return "";

  if (action.category) {
    return action.category + " " + action.name;
  }

  return action.name || action.id || "Action";
}

function normalizeActionUnlockName(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function actionMatchesUnlockName(action, unlockName) {
  const wanted = normalizeActionUnlockName(unlockName);

  const fullLabel = normalizeActionUnlockName(actionLabel(action));
  const simpleName = normalizeActionUnlockName(action.name);
  const categoryName = normalizeActionUnlockName(
    (action.category || "") + " " + (action.name || "")
  );
  const linkedUnlockName = normalizeActionUnlockName(action.unlockName);

  return (
    fullLabel.includes(wanted) ||
    simpleName.includes(wanted) ||
    categoryName.includes(wanted) ||
    linkedUnlockName.includes(wanted)
  );
}

function getPlayerLevelFromVictories(victories) {
  const total = Number(victories || 0);
  let level = 0;

  for (let i = 0; i < playerLevelVictoryThresholds.length; i++) {
    if (total >= playerLevelVictoryThresholds[i]) {
      level = i;
    }
  }

  return Math.min(6, level);
}

function getLevelTitle(level) {
  return playerLevelTitles[level] || "Novice";
}

function getNextLevelVictoryTarget(level) {
  const safeLevel = Math.max(0, Math.min(6, Number(level || 0)));

  if (safeLevel >= 6) {
    return "Max";
  }

  return playerLevelVictoryThresholds[safeLevel + 1];
}

function getUnlockedActionNamesForLevel(fighterId, level) {
  const table = actionUnlocksByFighter[fighterId] || {};
  const names = [];

  for (let currentLevel = 0; currentLevel <= level; currentLevel++) {
    (table[currentLevel] || []).forEach(function(name) {
      if (!names.includes(name)) {
        names.push(name);
      }
    });
  }

  return names;
}

function isActionUnlockedForSheet(action, fighterId, level) {
  const unlockedNames = getUnlockedActionNamesForLevel(fighterId, level);

  return unlockedNames.some(function(name) {
    return actionMatchesUnlockName(action, name);
  });
}

function getActionUpgradeKey(actionOrId) {
  if (!actionOrId) return "";

  if (typeof actionOrId === "string") {
    return actionOrId;
  }

  const sourceName =
    actionOrId.unlockName ||
    actionLabel(actionOrId) ||
    actionOrId.id ||
    "";

  return normalizeActionUnlockName(sourceName).replace(/\s+/g, "_");
}

function getUniqueSheetActionsByUpgradeKey(actions) {
  const map = {};

  (actions || []).forEach(function(action) {
    if (!action || !action.id) return;

    const key = getActionUpgradeKey(action);
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        key: key,
        action: action,
        variants: [action]
      };
      return;
    }

    map[key].variants.push(action);

    if (
      map[key].action &&
      map[key].action.color === "marron" &&
      action.color !== "marron"
    ) {
      map[key].action = action;
    }
  });

  return Object.keys(map).map(function(key) {
    return map[key];
  });
}

function getUnlockedUniqueSheetActions() {
  return getUniqueSheetActionsByUpgradeKey(getUnlockedSheetActions());
}

function getActionUpgradeBonus(actionOrId) {
  if (!currentSheetProfile || !currentSheetProfile.actionBonuses) return 0;

  const key = getActionUpgradeKey(actionOrId);

  if (!key) return 0;

  if (currentSheetProfile.actionBonuses[key] !== undefined) {
    return Number(currentSheetProfile.actionBonuses[key] || 0);
  }

  if (
    actionOrId &&
    typeof actionOrId !== "string" &&
    actionOrId.id &&
    currentSheetProfile.actionBonuses[actionOrId.id] !== undefined
  ) {
    return Number(currentSheetProfile.actionBonuses[actionOrId.id] || 0);
  }

  return 0;
}

function getAllSheetActions(fighter) {
  return []
    .concat(fighter.actions || [])
    .concat(fighter.distanceActions || [])
    .filter(function(action) {
      return action && action.id && action.available !== false;
    });
}

function getUnlockedSheetActions() {
  if (!currentSheetCharacter || !currentSheetFighter) return [];

  const fighterId = currentSheetCharacter.fighterId;
  const level = currentSheetLevel;

  return getAllSheetActions(currentSheetFighter).filter(function(action) {
    return isActionUnlockedForSheet(action, fighterId, level);
  });
}

/* ============================================================
   CHARGEMENT DE LA FICHE
   ============================================================ */

async function loadCatalog() {
  try {
    return await loadJson("data/catalog.json");
  } catch (error) {
    return fallbackCatalog;
  }
}

function getCharacterIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || localStorage.getItem(lastCharacterKey) || "";
}

function findCharacter(characterId) {
  const characters = getSavedCharacters();

  return characters.find(function(character) {
    return character.id === characterId;
  });
}

function loadProfile(character) {
  const key = getPlayerProfileKey(character.fighterId, character.name);
  const raw = localStorage.getItem(key);

  if (!raw) {
    return {
      fighterId: character.fighterId,
      name: character.name,
      experience: Number(character.experience || 0),
      spentExperience: Number(character.spentExperience || 0),
      actionBonuses: {},
      bodyBonus: 0,
      victories: Number(character.victories || 0),
      level: 0
    };
  }

  try {
    const profile = JSON.parse(raw);

    return {
      fighterId: character.fighterId,
      name: character.name,
      experience: Number(profile.experience || 0),
      spentExperience: Number(profile.spentExperience || 0),
      actionBonuses: profile.actionBonuses || {},
      bodyBonus: Number(profile.bodyBonus || 0),
      victories: Number(profile.victories || 0),
      level: Number(profile.level || 0)
    };
  } catch (error) {
    return {
      fighterId: character.fighterId,
      name: character.name,
      experience: Number(character.experience || 0),
      spentExperience: Number(character.spentExperience || 0),
      actionBonuses: {},
      bodyBonus: 0,
      victories: Number(character.victories || 0),
      level: 0
    };
  }
}

function saveCurrentSheetProfile() {
  if (!currentSheetCharacter || !currentSheetProfile) return;

  const profileKey = getPlayerProfileKey(
    currentSheetCharacter.fighterId,
    currentSheetCharacter.name
  );

  currentSheetProfile.level = getPlayerLevelFromVictories(
    currentSheetProfile.victories || 0
  );
  currentSheetProfile.bodyBonus = computeSheetTotalBodyBonus();

  localStorage.setItem(profileKey, JSON.stringify(currentSheetProfile));

  const characters = getSavedCharacters();
  const characterId = makeCharacterId(
    currentSheetCharacter.fighterId,
    currentSheetCharacter.name
  );

  const index = characters.findIndex(function(item) {
    return item.id === characterId;
  });

  const cleanCharacter = {
    id: characterId,
    fighterId: currentSheetCharacter.fighterId,
    fighterName: currentSheetCharacter.fighterName,
    name: currentSheetCharacter.name,
    experience: Number(currentSheetProfile.experience || 0),
    spentExperience: Number(currentSheetProfile.spentExperience || 0),
    victories: Number(currentSheetProfile.victories || 0),
    level: currentSheetProfile.level
  };

  if (index >= 0) {
    characters[index] = cleanCharacter;
  } else {
    characters.push(cleanCharacter);
  }

  saveSavedCharacters(characters);
  localStorage.setItem(lastCharacterKey, cleanCharacter.id);
}

async function initSheetPage() {
  const status = document.getElementById("sheetStatus");

  try {
    const characterId = getCharacterIdFromUrl();

    if (!characterId) {
      throw new Error("Aucun PJ sélectionné.");
    }

    const character = findCharacter(characterId);

    if (!character) {
      throw new Error("PJ introuvable dans la sauvegarde locale.");
    }

    const catalog = await loadCatalog();
    const fighterEntry = (catalog.fighters || fallbackCatalog.fighters).find(
      function(item) {
        return item.id === character.fighterId;
      }
    );

    if (!fighterEntry) {
      throw new Error("Combattant introuvable dans le catalogue.");
    }

    const fighter = await loadJson(fighterEntry.sheetFile);
    const profile = loadProfile(character);

    currentSheetCharacter = character;
    currentSheetProfile = profile;
    currentSheetFighter = fighter;
    currentSheetLevel = getPlayerLevelFromVictories(profile.victories || 0);
    currentSheetActions = getUnlockedSheetActions();

    renderHeader(character, profile, fighter);
    renderColorSummary();
    renderEvolutionTable();
    renderTrophies();

    if (status) {
      status.textContent = "";
    }
  } catch (error) {
    console.error(error);

    if (status) {
      status.innerHTML =
        '<span class="error">Erreur fiche PJ : ' +
        escapeHtml(error.message) +
        "</span>";
    }
  }
}

/* ============================================================
   DÉPENSE D'XP SUR LA FICHE
   ============================================================ */

function getSheetEffectiveBodyStart() {
  if (!currentSheetFighter || !currentSheetProfile) return 0;

  const bodyBase = Number(currentSheetFighter.bodyPointsStart || 0);
  currentSheetProfile.bodyBonus = computeSheetTotalBodyBonus();

  return bodyBase + Number(currentSheetProfile.bodyBonus || 0);
}

function getSheetAvailableUpgradeActions() {
  const playerLevel = currentSheetLevel;

  if (playerLevel <= 0) return [];

  return getUnlockedUniqueSheetActions().filter(function(entry) {
    return getActionUpgradeBonus(entry.action) < playerLevel;
  });
}

function computeSheetBodyBonusFromColors() {
  const entries = getUnlockedUniqueSheetActions();
  const byColor = {};

  entries.forEach(function(entry) {
    const action = entry.action;
    if (!action.color) return;

    if (!byColor[action.color]) {
      byColor[action.color] = [];
    }

    byColor[action.color].push(action);
  });

  let bonus = 0;

  Object.keys(byColor).forEach(function(color) {
    const colorActions = byColor[color];

    if (colorActions.length === 0) return;

    let minColorBonus = Infinity;

    colorActions.forEach(function(action) {
      minColorBonus = Math.min(minColorBonus, getActionUpgradeBonus(action));
    });

    if (minColorBonus !== Infinity) {
      bonus += minColorBonus;
    }
  });

  return bonus;
}

function computeSheetTotalBodyBonus() {
  return currentSheetLevel + computeSheetBodyBonusFromColors();
}

function ensureSheetUpgradePanel() {
  let panel = document.getElementById("sheetUpgradePanel");

  if (panel) return panel;

  panel = document.createElement("section");
  panel.id = "sheetUpgradePanel";
  panel.className = "rules-card sheet-upgrade-panel";
  panel.style.display = "none";

  panel.innerHTML =
    "<h2>Utiliser les XP</h2>" +
    '<p id="sheetUpgradeInfo" class="rules-note"></p>' +
    '<label for="sheetUpgradeActionChoice">Action à améliorer</label>' +
    '<select id="sheetUpgradeActionChoice" class="compact-select"></select>' +
    '<button type="button" onclick="upgradeSheetSelectedAction()">Améliorer cette action</button>';

  const status = document.getElementById("sheetStatus");

  if (status && status.parentNode) {
    status.parentNode.insertBefore(panel, status.nextSibling);
  } else {
    const main = document.querySelector("main");
    if (main) main.appendChild(panel);
  }

  return panel;
}

function renderSheetUpgradePanel() {
  const panel = ensureSheetUpgradePanel();
  const info = document.getElementById("sheetUpgradeInfo");
  const select = document.getElementById("sheetUpgradeActionChoice");

  if (!panel || !info || !select || !currentSheetProfile) return;

  const xp = Number(currentSheetProfile.experience || 0);
  const cost = getSheetEffectiveBodyStart();
  const playerLevel = currentSheetLevel;
  const availableEntries = getSheetAvailableUpgradeActions();

  select.innerHTML = "";

  if (playerLevel <= 0) {
    info.textContent =
      "Le PJ est niveau 0 : il doit gagner des victoires pour passer niveau 1 avant d’améliorer ses actions.";
    panel.style.display = "block";
    select.style.display = "none";
    return;
  }

  if (xp < cost) {
    info.textContent =
      xp +
      " XP disponibles. Il faut au moins " +
      cost +
      " XP (PV max actuels) pour ajouter +1 à une action.";
    panel.style.display = "block";
    select.style.display = "none";
    return;
  }

  availableEntries.forEach(function(entry) {
    const action = entry.action;
    const currentBonus = getActionUpgradeBonus(action);
    const nextBonus = currentBonus + 1;

    const option = document.createElement("option");
    option.value = entry.key;
    option.textContent =
      actionLabel(action) +
      " (" +
      (action.color || "-") +
      ") : EVO +" +
      currentBonus +
      " → +" +
      nextBonus +
      (entry.variants.length > 1 ? " [mêlée + DA]" : "");

    select.appendChild(option);
  });

  if (availableEntries.length === 0) {
    info.textContent =
      "Aucune action ne peut être améliorée : les EVO des actions débloquées ont déjà atteint le niveau actuel du PJ.";
    panel.style.display = "block";
    select.style.display = "none";
    return;
  }

  info.textContent =
    xp +
    " XP disponibles. Coût : " +
    cost +
    " XP. Une action peut monter jusqu’au niveau actuel du PJ. Niveau actuel : " +
    playerLevel +
    ".";

  select.style.display = "block";
  panel.style.display = "block";
}

function upgradeSheetSelectedAction() {
  const select = document.getElementById("sheetUpgradeActionChoice");

  if (!select || !select.value || !currentSheetProfile) return;

  const xp = Number(currentSheetProfile.experience || 0);
  const cost = getSheetEffectiveBodyStart();
  const actionKey = select.value;

  const entry = getSheetAvailableUpgradeActions().find(function(item) {
    return item.key === actionKey;
  });

  if (!entry) {
    alert("Cette action ne peut pas être améliorée pour le moment.");
    return;
  }

  const currentBonus = getActionUpgradeBonus(entry.action);
  const nextBonus = currentBonus + 1;

  if (xp < cost) {
    alert("Pas assez d’expérience. Il faut au moins " + cost + " XP.");
    return;
  }

  if (currentSheetLevel <= 0) {
    alert("Le PJ est niveau 0 : il doit passer niveau 1 avant d’améliorer ses actions.");
    return;
  }

  if (nextBonus > currentSheetLevel) {
    alert("Cette action ne peut pas dépasser le niveau actuel du PJ.");
    return;
  }

  if (!currentSheetProfile.actionBonuses) {
    currentSheetProfile.actionBonuses = {};
  }

  currentSheetProfile.actionBonuses[actionKey] = nextBonus;

  entry.variants.forEach(function(variant) {
    if (variant && variant.id && variant.id !== actionKey) {
      delete currentSheetProfile.actionBonuses[variant.id];
    }
  });

  currentSheetProfile.experience = xp - cost;
  currentSheetProfile.spentExperience =
    Number(currentSheetProfile.spentExperience || 0) + cost;

  currentSheetProfile.bodyBonus = computeSheetTotalBodyBonus();

  saveCurrentSheetProfile();

  renderHeader(currentSheetCharacter, currentSheetProfile, currentSheetFighter);
  renderColorSummary();
  renderEvolutionTable();
  renderTrophies();
  renderSheetUpgradePanel();

  alert(
    "Action améliorée : EVO +" +
      nextBonus +
      (entry.variants.length > 1
        ? "\\n\\nCette amélioration s’applique à la version mêlée et à la version Distance Accrue."
        : "")
  );
}

/* ============================================================
   RENDU EN-TÊTE / RÉSUMÉ
   ============================================================ */

function renderHeader(character, profile, fighter) {
  const xpAvailable = Number(profile.experience || 0);
  const xpSpent = Number(profile.spentExperience || 0);
  const xpTotal = xpAvailable + xpSpent;

  profile.bodyBonus = computeSheetTotalBodyBonus();
  const bodyBonus = Number(profile.bodyBonus || 0);
  const bodyBase = Number(fighter.bodyPointsStart || 0);
  const bodyMax = bodyBase + bodyBonus;

  const victories = Number(profile.victories || 0);
  const level = getPlayerLevelFromVictories(victories);
  const levelTitle = getLevelTitle(level);
  const nextTarget = getNextLevelVictoryTarget(level);

  const fighterName =
    character.fighterName ||
    fighter.shortName ||
    character.fighterId ||
    "Combattant";

  setText("sheetCharacterName", character.name || "Personnage");
  setText(
    "sheetCharacterType",
    fighterName + " - Niveau " + level + " : " + levelTitle
  );

  setText("sheetFighterName", fighterName);
  setText("sheetLevel", level + " - " + levelTitle);
  setText("sheetVictories", victories);
  setText("sheetNextLevel", nextTarget);

  setText("sheetXpAvailable", xpAvailable);
  setText("sheetXpSpent", xpSpent);
  setText("sheetXpTotal", xpTotal);

  setText("sheetBodyStart", bodyBase);
  setText("sheetBodyBonus", bodyBonus >= 0 ? "+" + bodyBonus : bodyBonus);
  setText("sheetCurrentPv", bodyMax);
}

/* ============================================================
   RÉSUMÉ PAR COULEUR
   ============================================================ */

function renderColorSummary() {
  const container = document.getElementById("colorSummary");
  if (!container) return;

  const entries = getUnlockedUniqueSheetActions();

  const html = colorOrder.map(function(color) {
    const colorEntries = entries.filter(function(entry) {
      return entry.action.color === color;
    });

    const improved = colorEntries.filter(function(entry) {
      return getActionUpgradeBonus(entry.action) > 0;
    });

    let minBonus = 0;

    if (colorEntries.length > 0) {
      minBonus = Math.min.apply(
        null,
        colorEntries.map(function(entry) {
          return getActionUpgradeBonus(entry.action);
        })
      );
    }

    return (
      '<article class="color-summary-item evo-color-' +
      escapeHtml(color) +
      '">' +
      "<strong>" +
      escapeHtml(colorLabels[color] || color) +
      "</strong>" +
      "<span>" +
      improved.length +
      " / " +
      colorEntries.length +
      " améliorée(s)</span>" +
      "<em>Bonus couleur : +" +
      minBonus +
      "</em>" +
      "</article>"
    );
  }).join("");

  container.innerHTML = html;
}

/* ============================================================
   TABLEAU DES ÉVOLUTIONS
   ============================================================ */

function renderEvolutionTable() {
  const body = document.getElementById("evolutionTableBody");
  if (!body) return;

  const entries = getUnlockedUniqueSheetActions();

  if (entries.length === 0) {
    body.innerHTML =
      '<tr><td colspan="4">Aucune action débloquée pour ce niveau.</td></tr>';
    return;
  }

  const sortedEntries = entries.slice().sort(function(a, b) {
    const colorA = colorOrder.indexOf(a.action.color);
    const colorB = colorOrder.indexOf(b.action.color);

    if (colorA !== colorB) {
      return colorA - colorB;
    }

    return actionLabel(a.action).localeCompare(actionLabel(b.action));
  });

  body.innerHTML = sortedEntries.map(function(entry) {
    const action = entry.action;
    const bonus = getActionUpgradeBonus(action);
    const checked = bonus > 0 ? "checked" : "";
    const color = action.color || "none";
    const label = actionLabel(action);
    const mod = Number(action.mod || 0);
    const modeLabel =
      entry.variants.length > 1
        ? "Mêlée + Distance Accrue"
        : action.unlockName
          ? "Distance liée : " + action.unlockName
          : "";

    return (
      '<tr class="evolution-row evolution-row-' +
      escapeHtml(color) +
      '">' +
      '<td><input type="checkbox" disabled ' +
      checked +
      "></td>" +
      '<td><span class="evo-action-name evo-text-' +
      escapeHtml(color) +
      '">' +
      escapeHtml(label) +
      "</span>" +
      (modeLabel
        ? '<span class="evo-mode-label">' + escapeHtml(modeLabel) + "</span>"
        : "") +
      "</td>" +
      "<td>" +
      escapeHtml(mod >= 0 ? "+" + mod : String(mod)) +
      "</td>" +
      "<td>+" +
      bonus +
      "</td>" +
      "</tr>"
    );
  }).join("");
}

/* ============================================================
   TROPHÉES
   ============================================================ */

function getTrophyIconForLevel(level) {
  const safeLevel = Math.max(0, Math.min(5, Number(level || 0)));

  if (safeLevel <= 0) return "◇";
  return "🏆".repeat(safeLevel);
}

function renderTrophies() {
  renderColorTrophies();
  renderSpecialTrophies();
}

function renderColorTrophies() {
  const grid = document.getElementById("trophyGrid");
  if (!grid) return;

  const entries = getUnlockedUniqueSheetActions();

  grid.innerHTML = colorOrder.map(function(color) {
    const colorEntries = entries.filter(function(entry) {
      return entry.action.color === color;
    });

    let minBonus = 0;

    if (colorEntries.length > 0) {
      minBonus = Math.min.apply(
        null,
        colorEntries.map(function(entry) {
          return getActionUpgradeBonus(entry.action);
        })
      );
    }

    const unlocked = minBonus > 0;
    const icon = getTrophyIconForLevel(minBonus);

    return (
      '<article class="trophy-card trophy-' +
      escapeHtml(color) +
      " " +
      (unlocked ? "trophy-unlocked" : "trophy-locked") +
      '">' +
      '<div class="trophy-icon">' +
      icon +
      "</div>" +
      '<div class="trophy-content">' +
      "<strong>" +
      escapeHtml(colorLabels[color] || color) +
      "</strong>" +
      "<span>Niveau couleur : +" +
      minBonus +
      "</span>" +
      "<em>" +
      colorEntries.length +
      " action(s) débloquée(s)</em>" +
      "</div>" +
      "</article>"
    );
  }).join("");
}

function renderSpecialTrophies() {
  const grid = document.getElementById("specialTrophyGrid");
  if (!grid) return;

  const victories = Number(currentSheetProfile.victories || 0);
  const level = getPlayerLevelFromVictories(victories);
  const entries = getUnlockedUniqueSheetActions();
  const actions = entries.map(function(entry) { return entry.action; });
  const improvedActions = entries.filter(function(entry) {
    return getActionUpgradeBonus(entry.action) > 0;
  });

  const trophies = [
    {
      name: "Première victoire",
      icon: "⚔️",
      unlocked: victories >= 1,
      text: victories + " victoire(s)"
    },
    {
      name: "Combattant aguerri",
      icon: "🛡️",
      unlocked: level >= 2,
      text: "Niveau " + level + " - " + getLevelTitle(level)
    },
    {
      name: "Maître des gestes connus",
      icon: "📜",
      unlocked: actions.length > 0 && improvedActions.length === actions.length,
      text: improvedActions.length + " / " + actions.length + " action(s)"
    },
    {
      name: "Vétéran de l’arène",
      icon: "👑",
      unlocked: level >= 6,
      text: victories + " victoire(s)"
    }
  ];

  grid.innerHTML = trophies.map(function(trophy) {
    return (
      '<article class="trophy-card special-trophy-card ' +
      (trophy.unlocked ? "trophy-unlocked" : "trophy-locked") +
      '">' +
      '<div class="trophy-icon">' +
      trophy.icon +
      "</div>" +
      '<div class="trophy-content">' +
      "<strong>" +
      escapeHtml(trophy.name) +
      "</strong>" +
      "<span>" +
      escapeHtml(trophy.text) +
      "</span>" +
      "</div>" +
      "</article>"
    );
  }).join("");
}

function toggleTrophyPanel() {
  const panel = document.getElementById("trophyPanel");
  const button = document.getElementById("toggleTrophiesButton");

  if (!panel) return;

  const isOpen = panel.style.display === "block";

  panel.style.display = isOpen ? "none" : "block";

  if (button) {
    button.textContent = isOpen ? "Afficher les trophées" : "Masquer les trophées";
  }
}

/* ============================================================
   RENOMMER LE PJ
   ============================================================ */

function renameCurrentCharacter() {
  const modal = document.getElementById("renameModal");
  const input = document.getElementById("renameCharacterInput");
  const error = document.getElementById("renameModalError");

  if (!currentSheetCharacter) return;

  if (input) {
    input.value = currentSheetCharacter.name || "";
  }

  if (error) {
    error.textContent = "";
  }

  if (modal) {
    modal.style.display = "flex";
  }

  setTimeout(function() {
    if (input) input.focus();
  }, 50);
}

function closeRenameModal() {
  const modal = document.getElementById("renameModal");
  if (modal) modal.style.display = "none";
}

function confirmRenameCharacter() {
  const input = document.getElementById("renameCharacterInput");
  const error = document.getElementById("renameModalError");

  if (!currentSheetCharacter || !currentSheetProfile || !input) return;

  const newName = input.value.trim();

  if (!newName) {
    if (error) error.textContent = "Le nom ne peut pas être vide.";
    return;
  }

  const oldName = currentSheetCharacter.name;
  const fighterId = currentSheetCharacter.fighterId;

  if (newName === oldName) {
    closeRenameModal();
    return;
  }

  const oldId = makeCharacterId(fighterId, oldName);
  const newId = makeCharacterId(fighterId, newName);

  const characters = getSavedCharacters();

  const duplicate = characters.some(function(character) {
    return character.id === newId && character.id !== oldId;
  });

  if (duplicate) {
    if (error) error.textContent = "Un PJ porte déjà ce nom pour ce livret.";
    return;
  }

  const oldProfileKey = getPlayerProfileKey(fighterId, oldName);
  const newProfileKey = getPlayerProfileKey(fighterId, newName);

  currentSheetCharacter.name = newName;
  currentSheetCharacter.id = newId;
  currentSheetProfile.name = newName;

  const updatedCharacters = characters.map(function(character) {
    if (character.id !== oldId) return character;

    return {
      id: newId,
      fighterId: fighterId,
      fighterName: character.fighterName,
      name: newName,
      experience: Number(currentSheetProfile.experience || 0),
      spentExperience: Number(currentSheetProfile.spentExperience || 0),
      victories: Number(currentSheetProfile.victories || 0),
      level: getPlayerLevelFromVictories(currentSheetProfile.victories || 0)
    };
  });

  localStorage.removeItem(oldProfileKey);
  localStorage.setItem(newProfileKey, JSON.stringify(currentSheetProfile));
  saveSavedCharacters(updatedCharacters);
  localStorage.setItem(lastCharacterKey, newId);

  renderHeader(currentSheetCharacter, currentSheetProfile, currentSheetFighter);
  closeRenameModal();

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("id", newId);
  window.history.replaceState({}, "", currentUrl.toString());
}

/* ============================================================
   RETOUR AU DUEL
   ============================================================ */

function goBackToDuel() {
  localStorage.setItem(resumeDuelAfterSheetKey, "1");
  window.location.href = "duel.html?resume=1";
}

/* ============================================================
   LANCEMENT
   ============================================================ */

document.addEventListener("DOMContentLoaded", initSheetPage);
