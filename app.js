const APP_VERSION = "0.3.2";

let catalog = null;

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

let currentFighter = null;
let currentOpponentFighter = null;
let currentBook = null;
let currentActions = [];
let selectedAction = null;

let gameMode = "duel";
let soloOpponentAction = null;

let sizeModifier = 0;

let myMaxBody = 0;
let myCurrentBody = 0;
let opponentMaxBody = 0;
let opponentCurrentBody = 0;

let lastDamage = null;
let damageAlreadyApplied = false;
let pendingOpponentInstruction = "";

let currentPlayerName = "";
let currentExperience = 0;
let currentSpentExperience = 0;
let currentProfileKey = "";
let currentActionBonuses = {};
let currentBodyBonus = 0;

let currentDuelSaveKey = "lw_current_duel_state";
let duelFinished = false;
let victoryXpAwarded = false;

const charactersIndexKey = "lw_saved_characters_index";
const lastCharacterKey = "lw_last_character_id";

/* ============================================================
   MODALES
   ============================================================ */

  let appModalResolver = null;
  
  function openAppModal(title, message, options) {
    const modal = document.getElementById("appModal");
    const titleElement = document.getElementById("appModalTitle");
    const textElement = document.getElementById("appModalText");
    const cancelButton = document.getElementById("appModalCancelButton");
    const okButton = document.getElementById("appModalOkButton");
  
    if (!modal || !titleElement || !textElement || !cancelButton || !okButton) {
      return Promise.resolve(window.confirm(message));
    }
  
    const mode = options && options.mode ? options.mode : "alert";
  
    titleElement.textContent = title || "Message";
    textElement.textContent = message || "";
  
    cancelButton.style.display = mode === "confirm" ? "block" : "none";
    okButton.textContent = mode === "confirm" ? "Confirmer" : "OK";
  
    modal.style.display = "flex";
  
    return new Promise(function(resolve) {
      appModalResolver = resolve;
    });
  }
  
  function closeAppModal(result) {
    const modal = document.getElementById("appModal");
  
    if (modal) {
      modal.style.display = "none";
    }
  
    if (appModalResolver) {
      appModalResolver(result);
      appModalResolver = null;
    }
  }
  
  function appAlert(message, title) {
    return openAppModal(title || "Message", message, { mode: "alert" });
  }
  
  function appConfirm(message, title) {
    return openAppModal(title || "Confirmation", message, { mode: "confirm" });
  }

async function loadJson(path) {
  const response = await fetch(path + "?v=" + Date.now());

  if (!response.ok) {
    throw new Error("Impossible de charger : " + path);
  }

  return await response.json();
}

function fighterLabel(fighter) {
  return fighter.shortName || fighter.fullName || fighter.id;
}

function fillSelect(selectId, fighters) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = "";

  fighters.forEach(function(fighter) {
    const option = document.createElement("option");
    option.value = fighter.id;
    option.textContent = fighterLabel(fighter);
    select.appendChild(option);
  });
}

function findCatalogEntry(id) {
  const activeCatalog = catalog || fallbackCatalog;

  return activeCatalog.fighters.find(function(fighter) {
    return fighter.id === id;
  });
}

/* ============================================================
   PROFILS / PJ SAUVEGARDÉS
   ============================================================ */

function normalizeProfileName(name) {
  return (name || "sans_nom")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getPlayerProfileKey(fighterId, playerName) {
  return "lw_profile_" + fighterId + "_" + normalizeProfileName(playerName);
}

function getSavedCharacters() {
  const raw = localStorage.getItem(charactersIndexKey);

  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveSavedCharacters(characters) {
  localStorage.setItem(charactersIndexKey, JSON.stringify(characters));
}

function makeCharacterId(fighterId, name) {
  return fighterId + "_" + normalizeProfileName(name);
}

function refreshSavedCharactersSelect() {
  const select = document.getElementById("savedCharacterSelect");
  const newButton = document.getElementById("newCharacterButton");
  const deleteButton = document.getElementById("deleteCharacterButton");
  const creationFields = document.getElementById("characterCreationFields");

  if (!select) return;

  const characters = getSavedCharacters();

  select.innerHTML = "";

  if (characters.length === 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Nouveau PJ / aucun PJ sauvegardé";
    select.appendChild(emptyOption);

    if (newButton) newButton.style.display = "none";
    if (deleteButton) deleteButton.style.display = "none";
    if (creationFields) creationFields.style.display = "block";

    const playerNameInput = document.getElementById("playerName");
    if (playerNameInput) playerNameInput.value = "";

    return;
  }

  if (newButton) newButton.style.display = "inline-block";
  if (deleteButton) deleteButton.style.display = "block";
  if (creationFields) creationFields.style.display = "none";

  characters.forEach(function(character) {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent =
      character.name +
      " — " +
      character.fighterName +
      " — " +
      (character.experience || 0) +
      " XP dispo / " +
      (character.spentExperience || 0) +
      " XP utilisées";
    select.appendChild(option);
  });

  const lastCharacterId = localStorage.getItem(lastCharacterKey);
  const lastCharacterExists = characters.some(function(character) {
    return character.id === lastCharacterId;
  });

  if (lastCharacterId && lastCharacterExists) {
    select.value = lastCharacterId;
  } else {
    select.value = characters[0].id;
    localStorage.setItem(lastCharacterKey, characters[0].id);
  }

  loadSavedCharacterFromSelect();
}

function getCurrentSetupCharacterData() {
  const fighterId = document.getElementById("playerSheet").value;
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();

  if (!name) {
    alert("Donne un nom au PJ avant de l’enregistrer.");
    return null;
  }

  const fighterEntry = findCatalogEntry(fighterId);
  const fighterName = fighterEntry ? fighterEntry.shortName : fighterId;

  return {
    id: makeCharacterId(fighterId, name),
    fighterId: fighterId,
    fighterName: fighterName,
    name: name,
    experience: currentExperience || 0,
    spentExperience: currentSpentExperience || 0
  };
}

function saveCharacterToIndex(character) {
  const characters = getSavedCharacters();

  const existingIndex = characters.findIndex(function(item) {
    return item.id === character.id;
  });

  if (existingIndex >= 0) {
    characters[existingIndex] = character;
  } else {
    characters.push(character);
  }

  characters.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  saveSavedCharacters(characters);
  localStorage.setItem(lastCharacterKey, character.id);

  refreshSavedCharactersSelect();

  const select = document.getElementById("savedCharacterSelect");
  if (select) {
    select.value = character.id;
  }
}

function saveCharacterFromSetup() {
  const character = getCurrentSetupCharacterData();
  if (!character) return;

  currentPlayerName = character.name;
  currentProfileKey = getPlayerProfileKey(character.fighterId, character.name);

  savePlayerProfile();

  alert("PJ enregistré : " + character.name);
}

function loadSavedCharacterFromSelect() {
  const select = document.getElementById("savedCharacterSelect");
  if (!select || !select.value) return;

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) return;

  localStorage.setItem(lastCharacterKey, character.id);

  const playerSheetSelect = document.getElementById("playerSheet");
  const playerNameInput = document.getElementById("playerName");

  if (playerSheetSelect) playerSheetSelect.value = character.fighterId;
  if (playerNameInput) playerNameInput.value = character.name;

  const creationFields = document.getElementById("characterCreationFields");
  if (creationFields) {
    creationFields.style.display = "none";
  }

  currentPlayerName = character.name;
  loadPlayerProfile(character.fighterId, character.name);
  updateEvolutionPanel();
}

function showNewCharacterForm() {
  const creationFields = document.getElementById("characterCreationFields");
  const select = document.getElementById("savedCharacterSelect");
  const playerNameInput = document.getElementById("playerName");
  const playerSheetSelect = document.getElementById("playerSheet");

  if (creationFields) {
    creationFields.style.display = "block";
  }

  if (select) {
    select.value = "";
  }

  if (playerNameInput) {
    playerNameInput.value = "";
  }

  if (playerSheetSelect) {
    playerSheetSelect.value = "chevalier";
  }

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentProfileKey = "";

  updateExperienceDisplay();
  updateEvolutionPanel();
}
async function deleteSelectedCharacter() {
  const select = document.getElementById("savedCharacterSelect");

  if (!select || !select.value) {
    alert("Choisis d’abord un PJ sauvegardé à supprimer.");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    alert("PJ introuvable.");
    return;
  }

  const confirmed = await appConfirm(
    "Confirmer la suppression du PJ : " +
      character.name +
      " ?\n\n" +
      "Cette action supprimera aussi son expérience et ses évolutions.\n\n" +
      "Cette action est définitive.",
    "Supprimer le PJ"
  );
  
  if (!confirmed) {
    return;
  }

  const updatedCharacters = characters.filter(function(item) {
    return item.id !== character.id;
  });

  saveSavedCharacters(updatedCharacters);

  const profileKey = getPlayerProfileKey(character.fighterId, character.name);
  localStorage.removeItem(profileKey);

  if (localStorage.getItem(lastCharacterKey) === character.id) {
    localStorage.removeItem(lastCharacterKey);
  }

  const playerNameInput = document.getElementById("playerName");
  if (playerNameInput) {
    playerNameInput.value = "";
  }

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentProfileKey = "";

  updateExperienceDisplay();
  refreshSavedCharactersSelect();

  appAlert("PJ supprimé : " + character.name, "PJ supprimé");
}

/* ============================================================
   EXPORT / IMPORT DES PJ
   ============================================================ */

function getCharacterProfileData(character) {
  const profileKey = getPlayerProfileKey(character.fighterId, character.name);
  const rawProfile = localStorage.getItem(profileKey);

  let profile = null;

  if (rawProfile) {
    try {
      profile = JSON.parse(rawProfile);
    } catch (error) {
      profile = null;
    }
  }

  if (!profile) {
    profile = {
      fighterId: character.fighterId,
      name: character.name,
      experience: character.experience || 0,
      spentExperience: character.spentExperience || 0,
      actionBonuses: {},
      bodyBonus: 0
    };
  }

  return {
    character: character,
    profile: profile
  };
}

function buildCharactersExportPayload(characters) {
  return {
    app: "Mondes Perdus - Duels",
    type: "mondes_perdus_characters_export",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    characters: characters.map(function(character) {
      return getCharacterProfileData(character);
    })
  };
}

function downloadJsonFile(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function safeFilename(text) {
  return (text || "pj")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function exportSelectedCharacter() {
  const select = document.getElementById("savedCharacterSelect");

  if (!select || !select.value) {
    alert("Choisis d’abord un PJ à exporter.");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    alert("PJ introuvable.");
    return;
  }

  const payload = buildCharactersExportPayload([character]);

  downloadJsonFile(
    "mondes_perdus_pj_" + safeFilename(character.name) + ".json",
    payload
  );
}

function exportAllCharacters() {
  const characters = getSavedCharacters();

  if (characters.length === 0) {
    alert("Aucun PJ sauvegardé à exporter.");
    return;
  }

  const payload = buildCharactersExportPayload(characters);

  downloadJsonFile("mondes_perdus_tous_les_pj.json", payload);
}

function openImportCharactersFile() {
  const input = document.getElementById("importCharactersInput");

  if (!input) {
    alert("Champ d’import introuvable.");
    return;
  }

  input.value = "";
  input.click();
}

function importCharactersFromFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(loadEvent) {
    try {
      const text = loadEvent.target.result;
      const data = JSON.parse(text);

      importCharactersData(data);
    } catch (error) {
      alert("Impossible de lire ce fichier JSON.");
    }
  };

  reader.readAsText(file);
}

function normalizeImportedCharactersData(data) {
  if (!data) return [];

  if (Array.isArray(data.characters)) {
    return data.characters;
  }

  if (data.character && data.profile) {
    return [data];
  }

  return [];
}

function importCharactersData(data) {
  const importedEntries = normalizeImportedCharactersData(data);

  if (importedEntries.length === 0) {
    alert("Ce fichier ne contient pas de PJ compatible.");
    return;
  }

  const existingCharacters = getSavedCharacters();
  let importedCount = 0;
  let lastImportedId = "";

  importedEntries.forEach(function(entry) {
    if (!entry.character || !entry.profile) return;

    const importedCharacter = entry.character;
    const importedProfile = entry.profile;

    if (!importedCharacter.fighterId || !importedCharacter.name) return;

    const characterId = makeCharacterId(
      importedCharacter.fighterId,
      importedCharacter.name
    );

    const cleanCharacter = {
      id: characterId,
      fighterId: importedCharacter.fighterId,
      fighterName: importedCharacter.fighterName || importedCharacter.fighterId,
      name: importedCharacter.name,
      experience: Number(importedProfile.experience || importedCharacter.experience || 0),
      spentExperience: Number(importedProfile.spentExperience || importedCharacter.spentExperience || 0)
    };

    const cleanProfile = {
      fighterId: cleanCharacter.fighterId,
      name: cleanCharacter.name,
      experience: cleanCharacter.experience,
      spentExperience: cleanCharacter.spentExperience,
      actionBonuses: importedProfile.actionBonuses || {},
      bodyBonus: Number(importedProfile.bodyBonus || 0)
    };

    const existingIndex = existingCharacters.findIndex(function(item) {
      return item.id === cleanCharacter.id;
    });

    if (existingIndex >= 0) {
      existingCharacters[existingIndex] = cleanCharacter;
    } else {
      existingCharacters.push(cleanCharacter);
    }

    const profileKey = getPlayerProfileKey(
      cleanCharacter.fighterId,
      cleanCharacter.name
    );

    localStorage.setItem(profileKey, JSON.stringify(cleanProfile));

    importedCount += 1;
    lastImportedId = cleanCharacter.id;
  });

  if (importedCount === 0) {
    alert("Aucun PJ valide n’a été importé.");
    return;
  }

  existingCharacters.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  saveSavedCharacters(existingCharacters);

  if (lastImportedId) {
    localStorage.setItem(lastCharacterKey, lastImportedId);
  }

  refreshSavedCharactersSelect();

  alert(importedCount + " PJ importé(s).");
}

function getPlayerNameStorageKey(fighterId) {
  return "lw_player_name_" + fighterId;
}

function loadPlayerNameForSelectedFighter() {
  const select = document.getElementById("playerSheet");
  const input = document.getElementById("playerName");

  if (!select || !input) return;

  const fighterId = select.value;
  const savedName = localStorage.getItem(getPlayerNameStorageKey(fighterId)) || "";

  input.value = savedName;
}

function savePlayerNameForSelectedFighter() {
  const select = document.getElementById("playerSheet");
  const input = document.getElementById("playerName");

  if (!select || !input) return "";

  const fighterId = select.value;
  const name = input.value.trim();

  if (name) {
    localStorage.setItem(getPlayerNameStorageKey(fighterId), name);
  } else {
    localStorage.removeItem(getPlayerNameStorageKey(fighterId));
  }

  return name;
}

function loadPlayerProfile(fighterId, playerName) {
  currentProfileKey = getPlayerProfileKey(fighterId, playerName);

  const raw = localStorage.getItem(currentProfileKey);

  if (!raw) {
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
    updateExperienceDisplay();
    return;
  }

  try {
    const profile = JSON.parse(raw);
    currentExperience = Number(profile.experience || 0);
    currentSpentExperience = Number(profile.spentExperience || 0);
    currentActionBonuses = profile.actionBonuses || {};
    currentBodyBonus = Number(profile.bodyBonus || 0);
  } catch (error) {
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
  }

  updateExperienceDisplay();
}

function savePlayerProfile() {
  if (!currentProfileKey) return;

  const fighterId = currentFighter
    ? currentFighter.id
    : document.getElementById("playerSheet").value;

  const fighterEntry = findCatalogEntry(fighterId);

  const profile = {
    fighterId: fighterId,
    name: currentPlayerName,
    experience: currentExperience,
    spentExperience: currentSpentExperience,
    actionBonuses: currentActionBonuses,
    bodyBonus: currentBodyBonus
  };

  localStorage.setItem(currentProfileKey, JSON.stringify(profile));

  if (currentPlayerName) {
    saveCharacterToIndex({
      id: makeCharacterId(fighterId, currentPlayerName),
      fighterId: fighterId,
      fighterName: fighterEntry ? fighterEntry.shortName : fighterId,
      name: currentPlayerName,
      experience: currentExperience,
      spentExperience: currentSpentExperience
    });
  }
}

function updateExperienceDisplay() {
  const display = document.getElementById("xpDisplay");
  if (!display) return;

  display.textContent =
    currentExperience + " dispo / " + currentSpentExperience + " utilisées";

  updateEvolutionPanel();
}

/* ============================================================
   ÉVOLUTION DU PERSONNAGE
   ============================================================ */

function getAllUpgradeableActions() {
  if (!currentFighter) return [];

  const allActions = []
    .concat(currentFighter.actions || [])
    .concat(currentFighter.distanceActions || []);

  return allActions.filter(function(action) {
    return action && action.id && action.color;
  });
}

function getActionUpgradeBonus(actionId) {
  return Number(currentActionBonuses[actionId] || 0);
}

function getEffectiveBodyStart() {
  if (!currentFighter) return 0;

  const baseBody = Number(currentFighter.bodyPointsStart || 0);
  return baseBody + currentBodyBonus;
}

function getNextUpgradeLevel() {
  const actions = getAllUpgradeableActions();

  if (actions.length === 0) return 1;

  let minBonus = Infinity;

  actions.forEach(function(action) {
    minBonus = Math.min(minBonus, getActionUpgradeBonus(action.id));
  });

  if (minBonus === Infinity) return 1;

  return minBonus + 1;
}

function getActionsAvailableForUpgrade() {
  const actions = getAllUpgradeableActions();
  const nextLevel = getNextUpgradeLevel();

  return actions.filter(function(action) {
    return getActionUpgradeBonus(action.id) < nextLevel;
  });
}

function computeBodyBonusFromColors() {
  const actions = getAllUpgradeableActions();
  const byColor = {};

  actions.forEach(function(action) {
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
      minColorBonus = Math.min(minColorBonus, getActionUpgradeBonus(action.id));
    });

    if (minColorBonus !== Infinity) {
      bonus += minColorBonus;
    }
  });

  return bonus;
}

function updateEvolutionPanel() {
  const panel = document.getElementById("evolutionPanel");
  const info = document.getElementById("evolutionInfo");
  const select = document.getElementById("upgradeActionChoice");

  if (!panel || !info || !select || !currentFighter) return;

  const cost = getEffectiveBodyStart();

  if (currentExperience < cost) {
    panel.style.display = "none";
    return;
  }

  const nextLevel = getNextUpgradeLevel();
  const availableActions = getActionsAvailableForUpgrade();

  select.innerHTML = "";

  availableActions.forEach(function(action) {
    const currentBonus = getActionUpgradeBonus(action.id);

    const option = document.createElement("option");
    option.value = action.id;
    option.textContent =
      actionLabel(action) +
      " (" +
      action.color +
      ") : +" +
      currentBonus +
      " → +" +
      nextLevel;

    select.appendChild(option);
  });

  info.textContent =
    currentExperience +
    " XP disponibles. Coût : " +
    cost +
    " XP. Niveau d’amélioration proposé : +" +
    nextLevel +
    ".";

  panel.style.display = availableActions.length > 0 ? "block" : "none";
}

function upgradeSelectedAction() {
  const select = document.getElementById("upgradeActionChoice");
  if (!select || !select.value) return;

  const cost = getEffectiveBodyStart();

  if (currentExperience < cost) {
    alert("Pas assez d’expérience.");
    return;
  }

  const actionId = select.value;
  const nextLevel = getNextUpgradeLevel();

  currentActionBonuses[actionId] = nextLevel;
  currentExperience -= cost;
  currentSpentExperience += cost;

  const oldBodyBonus = currentBodyBonus;
  currentBodyBonus = computeBodyBonusFromColors();

  const bodyIncrease = currentBodyBonus - oldBodyBonus;

  updateExperienceDisplay();
  savePlayerProfile();
  updateEvolutionPanel();

  let message = "Action améliorée à +" + nextLevel + ".";

  if (bodyIncrease > 0) {
    message +=
      "\n\nToutes les actions d’une couleur ont progressé : +" +
      bodyIncrease +
      " Point(s) de Corps de départ au prochain combat.";
  }

  alert(message);
}

/* ============================================================
   INITIALISATION
   ============================================================ */

async function initApp() {
  const message = document.getElementById("loadMessage");

  document.body.classList.remove("duel-active");
  document.getElementById("fixedHpBar").style.display = "none";
  document.getElementById("setupPanel").style.display = "block";
  document.getElementById("duelPanel").style.display = "none";

  try {
    catalog = await loadJson("data/catalog.json");

    fillSelect("playerSheet", catalog.fighters);
    fillSelect("opponentBook", catalog.fighters);

    message.textContent =
      "Catalogue chargé : " +
      catalog.fighters.length +
      " combattants disponibles. Version " +
      APP_VERSION;

    refreshSavedCharactersSelect();
  } catch (error) {
    catalog = fallbackCatalog;

    fillSelect("playerSheet", catalog.fighters);
    fillSelect("opponentBook", catalog.fighters);

    message.innerHTML =
      '<span class="error">Catalogue distant non chargé, catalogue de secours utilisé. Version ' +
      APP_VERSION +
      ".</span>";

    refreshSavedCharactersSelect();
  }
}

/* ============================================================
   SAUVEGARDE DU DUEL EN COURS
   ============================================================ */

function saveCurrentDuelState() {
  if (!currentFighter || !currentOpponentFighter) return;

  const state = {
    myCurrentBody: myCurrentBody,
    myMaxBody: myMaxBody,
    opponentCurrentBody: opponentCurrentBody,
    opponentMaxBody: opponentMaxBody,
    playerName: currentPlayerName,
    fighterId: currentFighter.id,
    opponentId: currentOpponentFighter.id,
    duelFinished: duelFinished,
    victoryXpAwarded: victoryXpAwarded
  };

  localStorage.setItem(currentDuelSaveKey, JSON.stringify(state));
}

function loadCurrentDuelStateIfMatching(fighterId, opponentId, playerName) {
  const raw = localStorage.getItem(currentDuelSaveKey);
  if (!raw) return false;

  try {
    const state = JSON.parse(raw);

    if (
      state.fighterId !== fighterId ||
      state.opponentId !== opponentId ||
      state.playerName !== playerName
    ) {
      return false;
    }

    myCurrentBody = Number(state.myCurrentBody);
    myMaxBody = Number(state.myMaxBody);
    opponentCurrentBody = Number(state.opponentCurrentBody);
    opponentMaxBody = Number(state.opponentMaxBody);
    duelFinished = Boolean(state.duelFinished);
    victoryXpAwarded = Boolean(state.victoryXpAwarded);

    return true;
  } catch (error) {
    return false;
  }
}

function clearCurrentDuelState() {
  localStorage.removeItem(currentDuelSaveKey);
}

/* ============================================================
   FIN DE COMBAT
   ============================================================ */

function showCombatEnd(title, text, cssClass) {
  const panel = document.getElementById("combatEndPanel");
  const titleElement = document.getElementById("combatEndTitle");
  const textElement = document.getElementById("combatEndText");

  if (!panel || !titleElement || !textElement) return;

  panel.className = "combat-end-panel " + cssClass;
  titleElement.textContent = title;
  textElement.textContent = text;
  panel.style.display = "block";

  document.getElementById("turnPanel").style.display = "none";
  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("nextTurnButton").style.display = "none";

  saveCurrentDuelState();
}

function checkCombatEnd() {
  if (duelFinished) return;

  const playerDead = myCurrentBody <= -5;
  const playerOut = myCurrentBody < 1;
  const opponentOut = opponentCurrentBody < 1;

  if (playerDead) {
    duelFinished = true;

    showCombatEnd(
      "Mort du PJ",
      currentPlayerName + " tombe à " + myCurrentBody + " PV. Le personnage est mort.",
      "combat-end-death"
    );

    return;
  }

  if (playerOut && opponentOut) {
    duelFinished = true;

    showCombatEnd(
      "Match nul",
      "Les deux combattants sont hors combat.",
      "combat-end-draw"
    );

    return;
  }

  if (opponentOut && !playerOut) {
    duelFinished = true;

    const xpGain = Math.max(0, Number(opponentMaxBody || 0));

    if (!victoryXpAwarded) {
      currentExperience += xpGain;
      victoryXpAwarded = true;
      updateExperienceDisplay();
      savePlayerProfile();
    }

    showCombatEnd(
      "Combat gagné",
      "Victoire ! " + xpGain + " XP ajoutée(s) à " + currentPlayerName + ".",
      "combat-end-victory"
    );

    return;
  }

  if (playerOut && !opponentOut) {
    duelFinished = true;

    showCombatEnd(
      "Combat perdu",
      currentPlayerName + " est hors combat.",
      "combat-end-defeat"
    );
  }
}

/* ============================================================
   POINTS DE CORPS
   ============================================================ */

function updateBodyDisplays() {
  document.getElementById("myBodyDisplay").textContent =
    myCurrentBody + " / " + myMaxBody;

  document.getElementById("opponentBodyDisplay").textContent =
    opponentCurrentBody + " / " + opponentMaxBody;

  document.getElementById("fixedMyBody").textContent =
    myCurrentBody + " / " + myMaxBody;

  document.getElementById("fixedOpponentBody").textContent =
    opponentCurrentBody + " / " + opponentMaxBody;

  const status = document.getElementById("bodyStatus");

  if (opponentCurrentBody <= -5) {
    status.innerHTML =
      '<span class="danger">Adversaire à -5 ou moins : mort selon les règles.</span>';
  } else if (opponentCurrentBody < 1) {
    status.innerHTML =
      '<span class="success">Adversaire sous 1 Point de Corps : combat terminé.</span>';
  } else if (myCurrentBody <= -5) {
    status.innerHTML =
      '<span class="danger">Tu es à -5 ou moins : mort selon les règles.</span>';
  } else if (myCurrentBody < 1) {
    status.innerHTML =
      '<span class="danger">Tu es sous 1 Point de Corps : hors combat.</span>';
  } else {
    status.textContent = "";
  }
}

function adjustMyBody() {
  const value = document.getElementById("myBodyManual").value;

  if (value === "") {
    alert("Entre ton nouveau total de Points de Corps.");
    return;
  }

  myCurrentBody = Number(value);
  document.getElementById("myBodyManual").value = "";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

function toggleHpTools() {
  const tools = document.getElementById("hpTools");

  if (tools.style.display === "grid") {
    tools.style.display = "none";
  } else {
    tools.style.display = "grid";
  }
}

function adjustMyBodyFromTop() {
  const value = document.getElementById("myBodyManualTop").value;

  if (value === "") {
    alert("Entre ton nouveau total de Points de Corps.");
    return;
  }

  myCurrentBody = Number(value);

  document.getElementById("myBodyManualTop").value = "";
  document.getElementById("hpTools").style.display = "none";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

/* ============================================================
   ACTIONS / RESTRICTIONS
   ============================================================ */

function actionLabel(action) {
  if (action.category) {
    return action.category + " " + action.name;
  }

  return action.name;
}

function actionAllowedByRestriction(action, restriction) {
  const color = action.color;
  const category = action.category || "";
  const name = action.name || "";
  const lowerName = name.toLowerCase();

  if (!action.available) return false;

  switch (restriction) {
    case "none":
      return true;

    case "no_blue":
      return color !== "bleu";

    case "no_red":
      return color !== "rouge";

    case "no_orange":
      return color !== "orange";

    case "no_red_orange":
      return color !== "rouge" && color !== "orange";

    case "no_blue_yellow":
      return color !== "bleu" && color !== "jaune";

    case "no_thrust":
      return category !== "Estoc" && !lowerName.includes("estoc");

    case "no_lateral":
      return category !== "Coup latéral" && !lowerName.includes("latéral");

    case "no_thrust_red":
      return (
        category !== "Estoc" &&
        !lowerName.includes("estoc") &&
        color !== "rouge"
      );

    case "no_thrust_blue":
      return (
        category !== "Estoc" &&
        !lowerName.includes("estoc") &&
        color !== "bleu"
      );

    case "no_lateral_red":
      return (
        category !== "Coup latéral" &&
        !lowerName.includes("latéral") &&
        color !== "rouge"
      );

    case "no_green_yellow":
      return color !== "vert" && color !== "jaune";

    case "only_green":
      return color === "vert";

    case "only_yellow":
      return color === "jaune";

    case "only_green_yellow":
      return color === "vert" || color === "jaune";

    case "only_brown":
      return color === "marron";

    case "only_bond":
      return category === "Bond" || lowerName.includes("bond");

    case "only_distance":
      return true;

    case "disarmed":
      return (
        lowerName.includes("coup de pied") ||
        color === "jaune" ||
        color === "vert"
      ) && !lowerName.includes("coup latéral féroce");

    case "shield_broken":
      return (
        category !== "Coup de bouclier" &&
        category !== "Attaque protégée"
      );

    default:
      return true;
  }
}

function updateDistanceButtons() {
  const mode = document.getElementById("distanceMode").value;

  const normalButton = document.getElementById("btnNormalMode");
  const distanceButton = document.getElementById("btnDistanceMode");

  if (!normalButton || !distanceButton) return;

  normalButton.classList.toggle("active", mode === "normal");
  distanceButton.classList.toggle("active", mode === "distance");
}

function setDistanceMode(mode) {
  document.getElementById("distanceMode").value = mode;
  updateDistanceButtons();
  refreshActionList();
}

function getActionsForCurrentMode() {
  const distanceMode = document.getElementById("distanceMode").value;

  if (distanceMode === "distance") {
    return currentFighter.distanceActions || [];
  }

  return currentFighter.actions || [];
}

function getRestrictionInfo(restriction) {
  switch (restriction) {
    case "none":
      return { label: "Aucune restriction", css: "restriction-none" };

    case "no_blue":
      return { label: "Pas de Bleu", css: "restriction-blue" };

    case "no_red":
      return { label: "Pas de Rouge", css: "restriction-red" };

    case "no_orange":
      return { label: "Pas d’Orange", css: "restriction-orange" };

    case "no_red_orange":
      return { label: "Pas de Rouge ni d’Orange", css: "restriction-orange" };

    case "no_blue_yellow":
      return { label: "Pas de Bleu ni de Jaune", css: "restriction-blue" };

    case "no_thrust":
      return { label: "Pas d’Estoc", css: "restriction-danger" };

    case "no_lateral":
      return { label: "Pas de Coup Latéral", css: "restriction-danger" };

    case "no_thrust_red":
      return { label: "Pas d’Estoc ni de Rouge", css: "restriction-red" };

    case "no_thrust_blue":
      return { label: "Pas d’Estoc ni de Bleu", css: "restriction-blue" };

    case "no_lateral_red":
      return { label: "Pas de Coup Latéral ni de Rouge", css: "restriction-red" };

    case "no_green_yellow":
      return { label: "Pas de Vert ni de Jaune", css: "restriction-danger" };

    case "only_green":
      return { label: "Seulement Vert", css: "restriction-green" };

    case "only_yellow":
      return { label: "Seulement Jaune", css: "restriction-yellow" };

    case "only_green_yellow":
      return { label: "Seulement Vert ou Jaune", css: "restriction-green" };

    case "only_brown":
      return { label: "Seulement Marron", css: "restriction-brown" };

    case "only_bond":
      return { label: "Seulement Bond", css: "restriction-yellow" };

    case "only_distance":
      return { label: "Seulement Distance Accrue", css: "restriction-brown" };

    case "disarmed":
      return { label: "Désarmé", css: "restriction-danger" };

    case "shield_broken":
      return { label: "Bouclier brisé", css: "restriction-danger" };

    default:
      return { label: "Aucune restriction", css: "restriction-none" };
  }
}

function updateRestrictionBanner(restriction) {
  const banner = document.getElementById("restrictionBanner");
  if (!banner) return;

  const info = getRestrictionInfo(restriction);

  banner.className = "restriction-banner " + info.css;
  banner.textContent = info.label;
}

function refreshActionList() {
  if (!currentFighter) return;

  const restriction = document.getElementById("restrictionMode").value;

  if (restriction === "only_distance") {
    document.getElementById("distanceMode").value = "distance";
  }

  const actions = getActionsForCurrentMode();

  updateDistanceButtons();
  updateRestrictionBanner(restriction);
  fillActions(actions, restriction);
}

function fillActions(actions, restriction) {
  const select = document.getElementById("actionChoice");
  select.innerHTML = "";
  currentActions = [];

  const activeRestriction = restriction || "none";

  actions.forEach(function(action) {
    if (!actionAllowedByRestriction(action, activeRestriction)) return;

    currentActions.push(action);

    const upgradeBonus = getActionUpgradeBonus(action.id);
    const upgradeText = upgradeBonus > 0 ? " / EVO +" + upgradeBonus : "";

    const option = document.createElement("option");
    option.value = action.id;
    option.textContent =
      actionLabel(action) +
      " — PG " +
      action.pg +
      " / MOD " +
      action.mod +
      upgradeText +
      " / " +
      action.color;

    select.appendChild(option);
  });

  if (currentActions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucune action disponible avec cette restriction";
    select.appendChild(option);
  }
}

/* ============================================================
   DÉMARRAGE DU DUEL
   ============================================================ */

async function startDuel() {
  const sheetId = document.getElementById("playerSheet").value;
  const bookId = document.getElementById("opponentBook").value;

  gameMode = document.getElementById("gameMode").value || "duel";
  soloOpponentAction = null;

  const sheetEntry = findCatalogEntry(sheetId);
  const bookEntry = findCatalogEntry(bookId);

  if (!sheetEntry || !bookEntry) {
    alert("Impossible de trouver la fiche ou le livret sélectionné.");
    return;
  }

  const savedPlayerName = savePlayerNameForSelectedFighter();
  currentPlayerName = savedPlayerName || sheetEntry.shortName;

  loadPlayerProfile(sheetId, currentPlayerName);

  if (savedPlayerName) {
    saveCharacterToIndex({
      id: makeCharacterId(sheetId, currentPlayerName),
      fighterId: sheetId,
      fighterName: sheetEntry.shortName,
      name: currentPlayerName,
      experience: currentExperience || 0,
      spentExperience: currentSpentExperience || 0
    });
  }

  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("soloOpponentPanel").style.display = "none";
  document.getElementById("soloOpponentActionText").textContent = "-";

  pendingOpponentInstruction = "";
  document.getElementById("opponentInstructionPanel").style.display = "none";
  document.getElementById("opponentInstructionText").textContent = "-";

  duelFinished = false;
  victoryXpAwarded = false;
  document.getElementById("combatEndPanel").style.display = "none";
  document.getElementById("combatEndTitle").textContent = "Fin du combat";
  document.getElementById("combatEndText").textContent = "-";

  try {
    currentFighter = await loadJson(sheetEntry.sheetFile);
    currentOpponentFighter = await loadJson(bookEntry.sheetFile);
    currentBook = await loadJson(bookEntry.bookFile);

    currentBodyBonus = computeBodyBonusFromColors();

    sizeModifier = Number(currentFighter.size) - Number(currentOpponentFighter.size);

    const loadedExistingDuel = loadCurrentDuelStateIfMatching(
      currentFighter.id,
      currentOpponentFighter.id,
      currentPlayerName
    );

    if (!loadedExistingDuel) {
      myMaxBody = getEffectiveBodyStart();
      myCurrentBody = myMaxBody;

      opponentMaxBody = Number(currentOpponentFighter.bodyPointsStart);
      opponentCurrentBody = opponentMaxBody;

      duelFinished = false;
      victoryXpAwarded = false;

      saveCurrentDuelState();
    }

    savePlayerProfile();

    document.getElementById("currentSheet").textContent = sheetEntry.fullName;
    document.getElementById("currentBook").textContent = bookEntry.fullName;

    document.getElementById("duelCompactSummary").textContent =
      currentPlayerName +
      " (" +
      sheetEntry.shortName +
      ") vs " +
      bookEntry.shortName +
      " | Taille " +
      (sizeModifier >= 0 ? "+" : "") +
      sizeModifier;

    document.getElementById("fixedMyName").textContent = currentPlayerName;
    document.getElementById("fixedOpponentName").textContent = bookEntry.shortName;

    document.getElementById("statSize").textContent = currentFighter.size;
    document.getElementById("statBody").textContent = getEffectiveBodyStart();
    document.getElementById("statAttacks").textContent = currentFighter.attacks;

    document.getElementById("distanceMode").value = "distance";
    document.getElementById("restrictionMode").value = "none";
    document.getElementById("temporaryBonus").value = "none";

    updateBodyDisplays();
    updateExperienceDisplay();
    refreshActionList();
    updateEvolutionPanel();

    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("duelPanel").style.display = "block";
    document.getElementById("turnPanel").style.display = "block";
    document.getElementById("fixedHpBar").style.display = "grid";

    document.body.classList.add("duel-active");

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    alert(
      "Erreur : " +
        error.message +
        "\n\nPour l’instant, seul le livret Chevalier existe. Choisis Chevalier comme livret affiché pour tester."
    );
  }
}

/* ============================================================
   MODE SOLO
   ============================================================ */

function getSoloOpponentActions() {
  if (!currentOpponentFighter) return [];

  const distanceMode = document.getElementById("distanceMode").value;

  let actions = [];

  if (distanceMode === "distance") {
    actions = currentOpponentFighter.distanceActions || [];
  } else {
    actions = currentOpponentFighter.actions || [];
  }

  return actions.filter(function(action) {
    return action && action.available && action.pg !== undefined && action.pg !== null;
  });
}

function pickSoloOpponentAction() {
  const actions = getSoloOpponentActions();

  if (actions.length === 0) {
    soloOpponentAction = null;
    return null;
  }

  const index = Math.floor(Math.random() * actions.length);
  soloOpponentAction = actions[index];

  return soloOpponentAction;
}

function updateSoloOpponentDisplay(action) {
  const panel = document.getElementById("soloOpponentPanel");
  const text = document.getElementById("soloOpponentActionText");

  if (!panel || !text) return;

  if (gameMode !== "solo" || !action) {
    panel.style.display = "none";
    text.textContent = "-";
    return;
  }

  text.textContent =
    actionLabel(action) +
    " | PG " +
    action.pg +
    " | " +
    action.color;

  panel.style.display = "block";
}

/* ============================================================
   TOUR / RÉSOLUTION
   ============================================================ */

function chooseAction() {
  const actionId = document.getElementById("actionChoice").value;

  if (!actionId) {
    alert("Aucune action disponible avec cette restriction.");
    return;
  }

  selectedAction = currentActions.find(function(action) {
    return action.id === actionId;
  });

  if (!selectedAction) {
    alert("Choisis une action.");
    return;
  }

  lastDamage = null;
  damageAlreadyApplied = false;

  document.getElementById("enemyPg").value = "";
  document.getElementById("pgToAnnounce").textContent = selectedAction.pg;

  if (gameMode === "solo") {
    const opponentAction = pickSoloOpponentAction();

    if (!opponentAction) {
      alert("Aucune action adverse disponible pour le mode solo.");
      return;
    }

    document.getElementById("enemyPg").value = opponentAction.pg;
    updateSoloOpponentDisplay(opponentAction);
  } else {
    updateSoloOpponentDisplay(null);
  }

  document.getElementById("pgPanel").style.display = "block";
  document.getElementById("resultPanel").style.display = "none";
}

function calculateTemporaryBonus(page, action) {
  const bonusMode = document.getElementById("temporaryBonus").value;

  if (page.score === null || page.score === undefined) {
    return 0;
  }

  const color = action.color || "";
  const category = action.category || "";
  const name = action.name || "";
  const label = (category + " " + name).toLowerCase();

  switch (bonusMode) {
    case "score_any":
      return 2;

    case "score_blue":
      return color === "bleu" ? 2 : 0;

    case "score_orange":
      return color === "orange" ? 2 : 0;

    case "score_plunge_or_lateral":
      return label.includes("coup plongeant") || label.includes("coup latéral")
        ? 2
        : 0;

    default:
      return 0;
  }
}

function calculateDamage(page, action) {
  if (page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score);
  const mod = Number(action.mod || 0);
  const bonus =
    Number(action.bonus || 0) +
    getActionUpgradeBonus(action.id) +
    calculateTemporaryBonus(page, action);

  let total = score + mod + bonus;

  if (action.color === "orange" || action.color === "rouge") {
    total += sizeModifier;
  }

  return Math.max(0, total);
}

function resolveTurn() {
  const enemyPg = document.getElementById("enemyPg").value;

  if (!selectedAction) {
    alert("Choisis d’abord une action.");
    return;
  }

  if (!enemyPg) {
    alert("Entre le PG donné par ton adversaire.");
    return;
  }

  if (!currentBook) {
    alert("Aucun livret chargé.");
    return;
  }

  const myMovementPage = String(selectedAction.pg);
  const enemyMovementPage = String(enemyPg);

  const movementTable = currentBook.movementPages[myMovementPage];

  if (!movementTable) {
    alert("Aucune table de mouvement trouvée pour ton PG : " + myMovementPage);
    return;
  }

  const resultPageNumber = movementTable[enemyMovementPage];

  if (resultPageNumber === undefined || resultPageNumber === null) {
    alert(
      "Aucun résultat trouvé pour :\n" +
        "Ton PG : " +
        myMovementPage +
        "\nPG reçu : " +
        enemyMovementPage
    );
    return;
  }

  const page = currentBook.pages[String(resultPageNumber)];

  if (!page) {
    alert(
      "La page résultat " +
        resultPageNumber +
        " existe dans la table, mais pas dans la liste des pages."
    );
    return;
  }

  pendingOpponentInstruction =
    page.instruction || "Aucune instruction particulière.";

  const damage = calculateDamage(page, selectedAction);
  lastDamage = damage;
  damageAlreadyApplied = false;

  let damageHtml = "";

  if (page.score === null || page.score === undefined) {
    damageHtml =
      '<div class="damage-pill no-damage">' +
      "<span>Résultat</span>" +
      "<strong>Aucun SCORE</strong>" +
      "</div>";
  } else {
    const totalBonus =
      Number(selectedAction.bonus || 0) +
      getActionUpgradeBonus(selectedAction.id) +
      calculateTemporaryBonus(page, selectedAction);

    damageHtml =
      '<div class="damage-pill">' +
      "<span>Dégâts</span>" +
      "<strong>" +
      damage +
      "</strong>" +
      "</div>" +
      '<div class="score-detail">' +
      "SCORE " +
      page.score +
      " + MOD " +
      selectedAction.mod +
      " + bonus " +
      totalBonus;

    if (selectedAction.color === "orange" || selectedAction.color === "rouge") {
      damageHtml += " + taille " + sizeModifier;
    }

    damageHtml += "</div>";
  }

  const imagePath =
    page.image ||
    "images/" +
      currentBook.id +
      "/LW_" +
      currentBook.id +
      "_" +
      resultPageNumber +
      ".png";

  const imageSrc = imagePath + "?v=" + Date.now();

  const imageHtml =
    '<div class="page-image-box image-priority-box">' +
    '<img class="page-image priority-image" src="' +
    imageSrc +
    '" alt="Page ' +
    resultPageNumber +
    '" onclick="openImageOverlay(this.src)" onerror="this.parentElement.style.display=\'none\'">' +
    '<button type="button" class="image-zoom-button" onclick="openImageOverlay(\'' +
    imageSrc +
    "')\">Agrandir l’image</button>" +
    "</div>";

  let applyButton = "";

  if (damage !== null) {
    applyButton =
      '<div class="result-actions">' +
      '<button type="button" onclick="applyDamageToOpponent()">Appliquer les dégâts à l’adversaire</button>' +
      '<p id="applyStatus" class="small"></p>' +
      "</div>";
  }

  document.getElementById("resultText").innerHTML =
    '<div class="result-card">' +
    '<div class="result-meta">' +
    "<span><strong>Action</strong> : " +
    actionLabel(selectedAction) +
    "</span>" +
    "<span><strong>PG</strong> : " +
    selectedAction.pg +
    "</span>" +
    "<span><strong>Reçu</strong> : " +
    enemyPg +
    "</span>" +
    "</div>" +
    imageHtml +
    damageHtml +
    '<div class="instruction-card">' +
    "<strong>Instruction à lire à l’adversaire</strong><br>" +
    pendingOpponentInstruction +
    "</div>" +
    applyButton +
    "</div>";

  document.getElementById("turnPanel").style.display = "none";
  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "block";
  document.getElementById("nextTurnButton").style.display = "block";

  document.getElementById("resultPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function applyDamageToOpponent() {
  const status = document.getElementById("applyStatus");

  if (!status) return;

  if (lastDamage === null || lastDamage === undefined) {
    status.innerHTML = '<span class="danger">Aucun dégât à appliquer.</span>';
    return;
  }

  if (damageAlreadyApplied) {
    status.innerHTML =
      '<span class="danger">Ces dégâts ont déjà été appliqués.</span>';
    return;
  }

  opponentCurrentBody -= Number(lastDamage);
  damageAlreadyApplied = true;

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();

  if (lastDamage === 0) {
    status.innerHTML =
      '<span class="success">Aucun dégât. Points de Corps adverses inchangés.</span>';
  } else {
    status.innerHTML =
      '<span class="success">' +
      lastDamage +
      " dégât(s) appliqué(s) à l’adversaire.</span>";
  }
}

function nextTurn() {
  selectedAction = null;
  lastDamage = null;
  damageAlreadyApplied = false;

  document.getElementById("enemyPg").value = "";
  soloOpponentAction = null;
  updateSoloOpponentDisplay(null);

  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("resultText").innerHTML = "";
  document.getElementById("nextTurnButton").style.display = "none";
  document.getElementById("turnPanel").style.display = "block";
  document.getElementById("bodyStatus").textContent = "";

  if (pendingOpponentInstruction) {
    document.getElementById("opponentInstructionText").textContent =
      pendingOpponentInstruction;
    document.getElementById("opponentInstructionPanel").style.display = "block";
  }

  document.getElementById("temporaryBonus").value = "none";

  refreshActionList();
  saveCurrentDuelState();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================================================
   ZOOM IMAGE
   ============================================================ */

let overlayZoom = 1;

function openImageOverlay(src) {
  const overlay = document.getElementById("imageOverlay");
  const image = document.getElementById("overlayImage");

  overlayZoom = 1;
  image.src = src;
  overlay.style.display = "flex";

  updateOverlayZoom();
}

function closeImageOverlay() {
  const overlay = document.getElementById("imageOverlay");
  const image = document.getElementById("overlayImage");

  overlay.style.display = "none";
  image.src = "";
}

function updateOverlayZoom() {
  const image = document.getElementById("overlayImage");
  image.style.width = overlayZoom * 100 + "%";
}

function changeOverlayZoom(delta) {
  overlayZoom = Math.max(0.5, Math.min(3, overlayZoom + delta));
  updateOverlayZoom();
}

function resetOverlayZoom() {
  overlayZoom = 1;
  updateOverlayZoom();
}

/* ============================================================
   NOUVEAU DUEL
   ============================================================ */

async function newDuel() {
  const confirmed = await appConfirm(
    "Commencer un nouveau duel ?\n\nLes Points de Corps du duel en cours seront réinitialisés.",
    "Nouveau duel"
  );
  
  if (!confirmed) return;

  clearCurrentDuelState();

  currentFighter = null;
  currentOpponentFighter = null;
  currentBook = null;
  currentActions = [];
  selectedAction = null;
  gameMode = "duel";
  soloOpponentAction = null;

  myMaxBody = 0;
  myCurrentBody = 0;
  opponentMaxBody = 0;
  opponentCurrentBody = 0;

  lastDamage = null;
  damageAlreadyApplied = false;
  pendingOpponentInstruction = "";
  duelFinished = false;
  victoryXpAwarded = false;

  document.body.classList.remove("duel-active");

  document.getElementById("fixedHpBar").style.display = "none";
  document.getElementById("hpTools").style.display = "none";

  document.getElementById("setupPanel").style.display = "block";
  document.getElementById("duelPanel").style.display = "none";
  document.getElementById("turnPanel").style.display = "block";
  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";

  document.getElementById("resultText").innerHTML = "";
  document.getElementById("nextTurnButton").style.display = "none";

  document.getElementById("opponentInstructionPanel").style.display = "none";
  document.getElementById("opponentInstructionText").textContent = "-";
  document.getElementById("combatEndPanel").style.display = "none";
  document.getElementById("combatEndTitle").textContent = "Fin du combat";
  document.getElementById("combatEndText").textContent = "-";

  document.getElementById("enemyPg").value = "";
  document.getElementById("soloOpponentPanel").style.display = "none";
  document.getElementById("soloOpponentActionText").textContent = "-";

  refreshSavedCharactersSelect();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

initApp();
