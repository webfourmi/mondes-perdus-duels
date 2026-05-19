const APP_VERSION = "0.5.8";

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
let currentPlayerBook = null;
let currentActions = [];
let selectedAction = null;

let gameMode = "duel";
let soloOpponentAction = null;
let soloOpponentRestriction = "none";

let sizeModifier = 0;

let myMaxBody = 0;
let myCurrentBody = 0;
let opponentMaxBody = 0;
let opponentCurrentBody = 0;

let lastDamage = null;
let damageAlreadyApplied = false;
let pendingOpponentInstruction = "";
let pendingPlayerInstruction = "";

let currentPlayerName = "";
let currentExperience = 0;
let currentSpentExperience = 0;
let currentProfileKey = "";
let currentActionBonuses = {};
let currentBodyBonus = 0;

let currentDuelSaveKey = "lw_current_duel_state";
let duelFinished = false;
let victoryXpAwarded = false;
let currentTurnNumber = 1;

const charactersIndexKey = "lw_saved_characters_index";



let combatLog = [];
let lastResolutionLogKey = "";
/* ============================================================
   AUDIO
   ============================================================ */

const audioStorageKey = "lw_audio_enabled";
const musicStorageKey = "lw_music_enabled";

let audioEnabled = localStorage.getItem(audioStorageKey) === "true";
let musicEnabled = localStorage.getItem(musicStorageKey) === "true";

let audioInitialized = false;
let sfxBank = {};
let combatMusic = null;

const audioFiles = {
  click: "audio/click.mp3",
  hit: "audio/hit.mp3",
  victory: "audio/victory.mp3",
  defeat: "audio/defeat.mp3",
  death: "audio/death.mp3",
  flee: "audio/flee.mp3"
};

function initAudioSystem() {
  if (audioInitialized) return;

  Object.keys(audioFiles).forEach(function(key) {
    const sound = new Audio(audioFiles[key]);
    sound.preload = "auto";
    sound.volume = 0.65;
    sfxBank[key] = sound;
  });

  combatMusic = new Audio("audio/combat-loop.mp3");
  combatMusic.preload = "auto";
  combatMusic.loop = true;
  combatMusic.volume = 0.28;

  audioInitialized = true;
  updateAudioButtons();
}

function updateAudioButtons() {
  const audioButtons = [
    document.getElementById("audioToggleButton"),
    document.getElementById("duelAudioToggleButton")
  ];

  const musicButtons = [
    document.getElementById("musicToggleButton"),
    document.getElementById("duelMusicToggleButton")
  ];

  audioButtons.forEach(function(button) {
    if (!button) return;
    button.textContent = audioEnabled ? "Son : ON" : "Son : OFF";
    button.classList.toggle("active", audioEnabled);
  });

  musicButtons.forEach(function(button) {
    if (!button) return;
    button.textContent = musicEnabled ? "Musique : ON" : "Musique : OFF";
    button.classList.toggle("active", musicEnabled);
  });
}

function toggleAudio() {
  initAudioSystem();

  audioEnabled = !audioEnabled;
  localStorage.setItem(audioStorageKey, audioEnabled ? "true" : "false");

  updateAudioButtons();

  if (audioEnabled) {
    playSfx("click");
  }
}

function toggleMusic() {
  initAudioSystem();

  musicEnabled = !musicEnabled;
  localStorage.setItem(musicStorageKey, musicEnabled ? "true" : "false");

  updateAudioButtons();

  if (musicEnabled && currentFighter && !duelFinished) {
    startCombatMusic();
  } else {
    stopCombatMusic();
  }
}

function playSfx(name) {
  if (!audioEnabled) return;

  initAudioSystem();

  const sound = sfxBank[name];

  if (!sound) return;

  try {
    sound.currentTime = 0;
    sound.play().catch(function() {});
  } catch (error) {}
}

function startCombatMusic() {
  if (!musicEnabled) return;

  initAudioSystem();

  if (!combatMusic) return;

  combatMusic.play().catch(function() {});
}

function stopCombatMusic() {
  if (!combatMusic) return;

  combatMusic.pause();
}

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
   JOURNAL DE COMBAT
   ============================================================ */

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addCombatLogEntry(title, lines, type) {
  const entry = {
    turn: currentTurnNumber || 1,
    title: title || "Événement",
    lines: Array.isArray(lines) ? lines : [String(lines || "")],
    type: type || "normal",
    time: new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  combatLog.push(entry);

  if (combatLog.length > 80) {
    combatLog = combatLog.slice(-80);
  }

  renderCombatLog();
  saveCurrentDuelState();
}

function renderCombatLog() {
  const list = document.getElementById("combatLogList");
  if (!list) return;

  if (!combatLog || combatLog.length === 0) {
    list.innerHTML = '<p class="small">Aucune entrée pour le moment.</p>';
    return;
  }

  const html = combatLog
    .slice()
    .reverse()
    .map(function(entry) {
      const linesHtml = entry.lines
        .map(function(line) {
          return escapeHtml(line);
        })
        .join("<br>");

      return (
        '<article class="combat-log-entry combat-log-' +
        escapeHtml(entry.type) +
        '">' +
        '<div class="combat-log-entry-title">' +
        "<strong>" +
        escapeHtml(entry.title) +
        "</strong>" +
        "<span>" +
        escapeHtml(entry.time) +
        "</span>" +
        "</div>" +
        '<div class="combat-log-entry-text">' +
        linesHtml +
        "</div>" +
        "</article>"
      );
    })
    .join("");

  list.innerHTML = html;
}

function toggleCombatLog() {
  const panel = document.getElementById("combatLogPanel");
  const button = document.getElementById("combatLogButton");

  if (!panel) return;

  const isOpen = panel.style.display === "block";

  panel.style.display = isOpen ? "none" : "block";

  if (button) {
    button.classList.toggle("active", !isOpen);
  }

  if (!isOpen) {
    renderCombatLog();
    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

async function clearCombatLogFromButton() {
  const confirmed = await appConfirm(
    "Vider le journal de combat ?\n\nLes événements déjà notés seront effacés.",
    "Journal de combat"
  );

  if (!confirmed) return;

  combatLog = [];
  lastResolutionLogKey = "";

  renderCombatLog();
  saveCurrentDuelState();
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
  const sheetButton = document.getElementById("characterSheetButton");

  if (sheetButton) sheetButton.style.display = "none";
  if (sheetButton) sheetButton.style.display = "inline-block";

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
    appAlert("Donne un nom au PJ avant de l’enregistrer.", "Nom manquant");
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

  appAlert("PJ enregistré : " + character.name, "PJ sauvegardé");
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

function openCharacterSheetPage() {
  const select = document.getElementById("savedCharacterSelect");

  let characterId = "";

  if (select && select.value) {
    characterId = select.value;
  } else if (currentFighter && currentPlayerName) {
    characterId = makeCharacterId(currentFighter.id, currentPlayerName);
  } else {
    characterId = localStorage.getItem(lastCharacterKey) || "";
  }

  if (!characterId) {
    appAlert("Choisis d’abord un PJ sauvegardé.", "Fiche PJ");
    return;
  }

  localStorage.setItem(lastCharacterKey, characterId);

  window.location.href =
    "fiche-pj.html?id=" + encodeURIComponent(characterId);
}

function showNewCharacterForm() {
  const creationFields = document.getElementById("characterCreationFields");
  const select = document.getElementById("savedCharacterSelect");
  const playerNameInput = document.getElementById("playerName");
  const playerSheetSelect = document.getElementById("playerSheet");

  const sheetButton = document.getElementById("characterSheetButton");
if (sheetButton) {
  sheetButton.style.display = "none";
}

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

  const cancelButton = document.getElementById("cancelNewCharacterButton");
    if (cancelButton) {
      cancelButton.style.display = getSavedCharacters().length > 0 ? "block" : "none";
    }
}

function cancelNewCharacterForm() {
  const characters = getSavedCharacters();
  const creationFields = document.getElementById("characterCreationFields");
  const select = document.getElementById("savedCharacterSelect");

  if (characters.length === 0) {
    appAlert(
      "Aucun PJ sauvegardé pour le moment. Crée d’abord un personnage.",
      "Retour impossible"
    );
    return;
  }

  if (creationFields) {
    creationFields.style.display = "none";
  }

  const lastCharacterId = localStorage.getItem(lastCharacterKey);

  const lastCharacterExists = characters.some(function(character) {
    return character.id === lastCharacterId;
  });

  if (select) {
    if (lastCharacterId && lastCharacterExists) {
      select.value = lastCharacterId;
    } else {
      select.value = characters[0].id;
      localStorage.setItem(lastCharacterKey, characters[0].id);
    }
  }

  loadSavedCharacterFromSelect();

  const sheetButton = document.getElementById("characterSheetButton");
    if (sheetButton) {
      sheetButton.style.display = "inline-block";
    }
}

function toggleCharacterTools() {
  const panel = document.getElementById("characterToolsPanel");
  const button = document.getElementById("characterToolsButton");

  if (!panel) return;

  const isOpen = panel.style.display === "block";

  panel.style.display = isOpen ? "none" : "block";

  if (button) {
    button.classList.toggle("active", !isOpen);
  }
}

async function deleteSelectedCharacter() {
  const select = document.getElementById("savedCharacterSelect");

  if (!select || !select.value) {
    appAlert("Choisis d’abord un PJ sauvegardé à supprimer.","PJ à supprimer");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    appAlert("PJ introuvable.","Pj Introuvable");
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
    appAlert("Choisis d’abord un PJ à exporter.", "Aucun PJ sélectionné");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    appAlert("PJ introuvable.", "Export impossible");
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
    appAlert("Aucun PJ sauvegardé à exporter.", "Export impossible");
    return;
  }

  const payload = buildCharactersExportPayload(characters);

  downloadJsonFile("mondes_perdus_tous_les_pj.json", payload);
}

function openImportCharactersFile() {
  const input = document.getElementById("importCharactersInput");

  if (!input) {
    appAlert("Champ d’import introuvable.", "Import impossible");
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
      appAlert("Impossible de lire ce fichier JSON.", "Import impossible");
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
    appAlert("Ce fichier ne contient pas de PJ compatible.", "Import impossible");
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
    appAlert("Aucun PJ valide n’a été importé.", "Import impossible");
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

  appAlert(importedCount + " PJ importé(s).", "Import terminé");
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
    appAlert("Pas assez d’expérience.", "Évolution impossible");
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

  appAlert(message, "Évolution du PJ");
}

/* ============================================================
   INITIALISATION
   ============================================================ */

async function initApp() {
  const message = document.getElementById("loadMessage");

  document.body.classList.remove("duel-active");

  const fixedHpBar = document.getElementById("fixedHpBar");
  if (fixedHpBar) {
    fixedHpBar.style.display = "none";
  }

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

  updateAudioButtons();
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
    victoryXpAwarded: victoryXpAwarded,
    turnNumber: currentTurnNumber,
    combatLog: combatLog
  };

  localStorage.setItem(currentDuelSaveKey, JSON.stringify(state));
}

function loadCurrentDuelStateIfMatching(fighterId, opponentId, playerName) {
  const raw = localStorage.getItem(currentDuelSaveKey);

  if (!raw) {
    return false;
  }

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
    currentTurnNumber = Number(state.turnNumber || 1);
    
    combatLog = Array.isArray(state.combatLog) ? state.combatLog : [];
    lastResolutionLogKey = "";
    renderCombatLog();

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

  const fleeButton = document.getElementById("fleeButton");
  if (fleeButton) {
    fleeButton.style.display = "none";
  }
  stopCombatMusic();
  saveCurrentDuelState();
}

function checkCombatEnd() {
  if (duelFinished) return;

  const playerDead = myCurrentBody <= -5;
  const playerOut = myCurrentBody < 1;
  const opponentOut = opponentCurrentBody < 1;

  if (playerDead) {
    duelFinished = true;

    addCombatLogEntry(
      "Fin du combat - Mort",
      [
        currentPlayerName + " tombe à " + myCurrentBody + " PV.",
        "Le personnage est mort."
      ],
      "death"
    );

    playSfx("death");

    showCombatEnd(
      "Mort du PJ",
      currentPlayerName + " tombe à " + myCurrentBody + " PV. Le personnage est mort.",
      "combat-end-death"
    );

    return;
  }

  if (playerOut && opponentOut) {
    duelFinished = true;

    addCombatLogEntry(
      "Fin du combat - Match nul",
      [
        "Les deux combattants sont hors combat.",
        currentPlayerName + " : " + myCurrentBody + " PV.",
        "Adversaire : " + opponentCurrentBody + " PV."
      ],
      "draw"
    );

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

    addCombatLogEntry(
      "Fin du combat - Victoire",
      [
        "L’adversaire est hors combat.",
        currentPlayerName + " gagne " + xpGain + " XP.",
        "XP disponibles : " + currentExperience + "."
      ],
      "victory"
    );

    playSfx("victory");

    showCombatEnd(
      "Combat gagné",
      "Victoire ! " + xpGain + " XP ajoutée(s) à " + currentPlayerName + ".",
      "combat-end-victory"
    );

    return;
  }

  if (playerOut && !opponentOut) {
    duelFinished = true;

    addCombatLogEntry(
      "Fin du combat - Défaite",
      [
        currentPlayerName + " est hors combat.",
        "PV restants de l’adversaire : " + opponentCurrentBody + "."
      ],
      "defeat"
    );

    playSfx("defeat");

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
    appAlert("Entre ton nouveau total de Points de Corps.", "Points de Corps");
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
    appAlert("Entre ton nouveau total de Points de Corps.", "Points de Corps");
    return;
  }

  myCurrentBody = Number(value);

  document.getElementById("myBodyManualTop").value = "";
  const hpTools = document.getElementById("hpTools");
  if (hpTools) {
    hpTools.style.display = "none";
  }

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

    case "no_yellow":
      return color !== "jaune";

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

  if (currentTurnNumber === 1) {
    document.getElementById("distanceMode").value = "distance";

    normalButton.disabled = true;
    normalButton.classList.remove("active");

    distanceButton.disabled = false;
    distanceButton.classList.add("active");

    normalButton.title = "Le premier tour commence toujours en Distance Accrue.";
    distanceButton.title = "Premier tour obligatoire en Distance Accrue.";

    return;
  }

  normalButton.disabled = false;
  distanceButton.disabled = false;

  normalButton.title = "";
  distanceButton.title = "";

  normalButton.classList.toggle("active", mode === "normal");
  distanceButton.classList.toggle("active", mode === "distance");
}

function setDistanceMode(mode) {
  if (currentTurnNumber === 1 && mode === "normal") {
    appAlert(
      "Le premier tour doit toujours être joué en Distance Accrue.",
      "Premier tour"
    );

    document.getElementById("distanceMode").value = "distance";
    updateDistanceButtons();
    refreshActionList();

    return;
  }

  document.getElementById("distanceMode").value = mode;
  updateDistanceButtons();
  refreshActionList();
}

function getActionsForCurrentMode() {
  if (!currentFighter) return [];

  const distanceMode = document.getElementById("distanceMode").value;

  if (currentTurnNumber === 1) {
    document.getElementById("distanceMode").value = "distance";
    return currentFighter.distanceActions || [];
  }

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

    case "no_yellow":
      return { label: "Pas de Jaune", css: "restriction-yellow" };

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
function restrictionFromInstructionText(instruction) {
  const text = (instruction || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (text.includes("aucune restriction")) {
    return "none";
  }

  if (text.includes("pas de rouge ni d'orange") || text.includes("pas de rouge ni d orange")) {
    return "no_red_orange";
  }

  if (text.includes("pas de bleu ni de jaune")) {
    return "no_blue_yellow";
  }

  if (text.includes("pas de vert ni de jaune")) {
    return "no_green_yellow";
  }

  if (text.includes("pas d'estoc ni de rouge") || text.includes("pas d estoc ni de rouge")) {
    return "no_thrust_red";
  }

  if (text.includes("pas d'estoc ni de bleu") || text.includes("pas d estoc ni de bleu")) {
    return "no_thrust_blue";
  }

  if (text.includes("pas de coup lateral ni de rouge")) {
    return "no_lateral_red";
  }

  if (text.includes("pas de rouge")) {
    return "no_red";
  }

  if (text.includes("pas de bleu")) {
    return "no_blue";
  }

  if (text.includes("pas d'orange") || text.includes("pas d orange")) {
    return "no_orange";
  }

  if (text.includes("pas de jaune")) {
    return "no_yellow";
  }

  if (text.includes("pas d'estoc") || text.includes("pas d estoc")) {
    return "no_thrust";
  }

  if (text.includes("pas de coup lateral")) {
    return "no_lateral";
  }

  if (text.includes("seulement du vert ou du jaune") || text.includes("seulement vert ou jaune")) {
    return "only_green_yellow";
  }

  if (text.includes("seulement du vert") || text.includes("seulement vert")) {
    return "only_green";
  }

  if (text.includes("seulement du jaune") || text.includes("seulement jaune")) {
    return "only_yellow";
  }

  if (text.includes("seulement du marron") || text.includes("seulement marron")) {
    return "only_brown";
  }

  if (text.includes("distance accrue") || text.includes("marron")) {
    return "only_distance";
  }

  if (text.includes("desarme") || text.includes("desarmé")) {
    return "disarmed";
  }

  if (text.includes("bouclier brise") || text.includes("bouclier brisé")) {
    return "shield_broken";
  }

  return "none";
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
  soloOpponentRestriction = "none";

  const sheetEntry = findCatalogEntry(sheetId);
  const bookEntry = findCatalogEntry(bookId);

  if (!sheetEntry || !bookEntry) {
    appAlert("Impossible de trouver la fiche ou le livret sélectionné.", "Erreur de duel");
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
  pendingPlayerInstruction = "";
  document.getElementById("opponentInstructionPanel").style.display = "none";
  document.getElementById("opponentInstructionText").textContent = "-";

  duelFinished = false;
  victoryXpAwarded = false;
  currentTurnNumber = 1;
  
  document.getElementById("combatEndPanel").style.display = "none";
  document.getElementById("combatEndTitle").textContent = "Fin du combat";
  document.getElementById("combatEndText").textContent = "-";

  try {
    currentFighter = await loadJson(sheetEntry.sheetFile);
    currentOpponentFighter = await loadJson(bookEntry.sheetFile);
    
    currentBook = await loadJson(bookEntry.bookFile);
    currentPlayerBook = await loadJson(sheetEntry.bookFile);

    currentBodyBonus = computeBodyBonusFromColors();

    sizeModifier = Number(currentFighter.size) - Number(currentOpponentFighter.size);

    const loadedExistingDuel = loadCurrentDuelStateIfMatching(
      currentFighter.id,
      currentOpponentFighter.id,
      currentPlayerName
    );

    if (!loadedExistingDuel) {
      combatLog = [];
      lastResolutionLogKey = "";
      myMaxBody = getEffectiveBodyStart();
      myCurrentBody = myMaxBody;

      opponentMaxBody = Number(currentOpponentFighter.bodyPointsStart);
      opponentCurrentBody = opponentMaxBody;

      duelFinished = false;
      victoryXpAwarded = false;
      currentTurnNumber = 1;

      addCombatLogEntry(
        "Début du duel",
        [
          currentPlayerName + " affronte " + bookEntry.shortName + ".",
          "Tour 1 : Distance Accrue obligatoire.",
          "Points de Corps : " + myCurrentBody + " / " + myMaxBody + " contre " + opponentCurrentBody + " / " + opponentMaxBody + "."
        ],
        "start"
      );

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

    document.body.classList.add("duel-active");

    const fixedHpBar = document.getElementById("fixedHpBar");
    if (fixedHpBar) {
      fixedHpBar.style.display = "grid";
    }

    const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
    if (duelCharacterSheetButton) {
      duelCharacterSheetButton.style.display = "block";
    }

    const fleeButton = document.getElementById("fleeButton");
    if (fleeButton) {
      fleeButton.style.display = "block";
    }

    initAudioSystem();
    updateAudioButtons();

    if (musicEnabled) {
      startCombatMusic();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    appAlert(
      "Erreur : " +
        error.message +
        "\n\nPour l’instant, seul le livret Chevalier existe. Choisis Chevalier comme livret affiché pour tester.",
      "Erreur de chargement"
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

  if (
    distanceMode === "distance" ||
    soloOpponentRestriction === "only_distance" ||
    soloOpponentRestriction === "only_brown"
  ) {
    actions = currentOpponentFighter.distanceActions || [];
  } else {
    actions = currentOpponentFighter.actions || [];
  }

  return actions.filter(function(action) {
    return (
      action &&
      action.available &&
      action.pg !== undefined &&
      action.pg !== null &&
      actionAllowedByRestriction(action, soloOpponentRestriction)
    );
  });
}

/* ============================================================
   IA SOLO - PERSONNALITÉS
   ============================================================ */

const soloPersonalities = {
  squelette: {
    name: "Squelette agressif",
    style: "aggressive",
    colorWeights: {
      orange: 3.2,
      rouge: 2.8,
      jaune: 1.4,
      bleu: 1.1,
      marron: 0.8,
      vert: 0.55
    }
  },

  chevalier: {
    name: "Chevalier discipliné",
    style: "disciplined",
    colorWeights: {
      orange: 1.45,
      rouge: 1.35,
      bleu: 1.25,
      jaune: 1.0,
      marron: 1.1,
      vert: 1.45
    }
  },

  default: {
    name: "Adversaire équilibré",
    style: "balanced",
    colorWeights: {
      orange: 1.4,
      rouge: 1.3,
      jaune: 1.1,
      bleu: 1.0,
      marron: 1.0,
      vert: 0.9
    }
  }
};

function getSoloOpponentPersonality() {
  if (!currentOpponentFighter || !currentOpponentFighter.id) {
    return soloPersonalities.default;
  }

  return soloPersonalities[currentOpponentFighter.id] || soloPersonalities.default;
}

function normalizeActionText(action) {
  return (
    ((action.category || "") + " " + (action.name || ""))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

function getBodyRatio(current, max) {
  if (!max || max <= 0) return 1;
  return current / max;
}

function isClearlyOffensiveAction(action) {
  const text = normalizeActionText(action);
  const color = action.color || "";

  return (
    color === "orange" ||
    color === "rouge" ||
    text.includes("charge") ||
    text.includes("coup") ||
    text.includes("estoc") ||
    text.includes("attaque")
  );
}

function getSoloActionScore(action) {
  const personality = getSoloOpponentPersonality();
  const text = normalizeActionText(action);
  const color = action.color || "";
  const mod = Number(action.mod || 0);

  const distanceModeElement = document.getElementById("distanceMode");
  const distanceMode = distanceModeElement ? distanceModeElement.value : "normal";

  const playerRatio = getBodyRatio(myCurrentBody, myMaxBody);
  const opponentRatio = getBodyRatio(opponentCurrentBody, opponentMaxBody);

  let score = 10;

  score *= personality.colorWeights[color] || 1;
  score += Math.max(-6, Math.min(6, mod)) * 1.2;

  if (personality.style === "aggressive") {
    if (text.includes("charge")) score += 18;
    if (text.includes("coup plongeant")) score += 14;
    if (text.includes("coup lateral puissant")) score += 13;
    if (text.includes("coup lateral feroce")) score += 15;
    if (text.includes("estoc")) score += 9;
    if (text.includes("attaque protegee")) score += 7;
    if (text.includes("desarmer")) score += 3;

    if (text.includes("esquive")) score *= 0.45;
    if (text.includes("bond en arriere")) score *= 0.45;
    if (text.includes("bond esquive")) score *= 0.5;
    if (text.includes("recuperer")) score *= 0.35;
    if (text.includes("bloque")) score *= 0.65;

    if (distanceMode === "distance") {
      if (text.includes("charge")) score *= 2.2;
      if (text.includes("esquive")) score *= 0.55;
      if (text.includes("bond en arriere")) score *= 0.55;
    }

    if (playerRatio <= 0.35 && isClearlyOffensiveAction(action)) {
      score *= 1.45;

      if (color === "orange" || color === "rouge") {
        score += 10;
      }
    }

    if (opponentRatio <= 0.35) {
      if (color === "orange" || color === "rouge") {
        score *= 1.35;
      }

      if (text.includes("esquive") || text.includes("bond en arriere")) {
        score *= 0.6;
      }
    }

    return Math.max(1, score);
  }

  if (personality.style === "disciplined") {
    if (text.includes("attaque protegee")) score += 16;
    if (text.includes("coup de bouclier")) score += 13;
    if (text.includes("desarmer")) score += 11;
    if (text.includes("estoc")) score += 10;
    if (text.includes("coup lateral")) score += 8;
    if (text.includes("coup plongeant")) score += 6;

    if (text.includes("charge")) {
      score += distanceMode === "distance" ? 14 : 2;
    }

    if (text.includes("bloque")) {
      score += distanceMode === "distance" ? 10 : 4;
    }

    if (text.includes("esquive")) score += 3;
    if (text.includes("bond esquive")) score += 4;
    if (text.includes("bond en arriere")) score *= 0.85;
    if (text.includes("recuperer")) score *= 0.45;

    // Premier échange à distance : le chevalier avance avec méthode.
    if (distanceMode === "distance") {
      if (text.includes("charge")) score *= 1.35;
      if (text.includes("bloque")) score *= 1.25;
      if (text.includes("esquive")) score *= 0.75;
    }

    // Si le joueur est faible, le chevalier cherche à finir proprement.
    if (playerRatio <= 0.35 && isClearlyOffensiveAction(action)) {
      score *= 1.3;

      if (
        text.includes("estoc") ||
        text.includes("attaque protegee") ||
        text.includes("coup lateral")
      ) {
        score += 8;
      }
    }

    // Si le chevalier est blessé, il devient plus prudent.
    if (opponentRatio <= 0.35) {
      if (text.includes("attaque protegee")) score *= 1.45;
      if (text.includes("coup de bouclier")) score *= 1.35;
      if (text.includes("esquive")) score *= 1.25;
      if (text.includes("bond esquive")) score *= 1.2;

      if (color === "orange" || color === "rouge") {
        score *= 0.8;
      }
    }

    // S’il est en bonne santé, il accepte davantage le duel frontal.
    if (opponentRatio >= 0.65 && playerRatio >= 0.5) {
      if (text.includes("attaque protegee")) score += 5;
      if (text.includes("estoc")) score += 4;
      if (text.includes("coup lateral")) score += 4;
    }

    return Math.max(1, score);
  }

  // IA équilibrée par défaut
  if (text.includes("attaque protegee")) score += 6;
  if (text.includes("coup lateral")) score += 5;
  if (text.includes("estoc")) score += 5;
  if (text.includes("charge") && distanceMode === "distance") score += 8;
  if (text.includes("esquive")) score *= 0.8;
  if (text.includes("recuperer")) score *= 0.5;

  if (playerRatio <= 0.35 && isClearlyOffensiveAction(action)) {
    score *= 1.25;
  }

  if (opponentRatio <= 0.35) {
    if (text.includes("attaque protegee") || text.includes("esquive")) {
      score *= 1.25;
    }
  }

  return Math.max(1, score);
}

function pickWeightedSoloAction(actions) {
  const scoredActions = actions.map(function(action) {
    return {
      action: action,
      score: getSoloActionScore(action)
    };
  });

  const total = scoredActions.reduce(function(sum, item) {
    return sum + item.score;
  }, 0);

  let roll = Math.random() * total;

  for (let i = 0; i < scoredActions.length; i++) {
    roll -= scoredActions[i].score;

    if (roll <= 0) {
      return scoredActions[i].action;
    }
  }

  return scoredActions[scoredActions.length - 1].action;
}

function pickSoloOpponentAction() {
  const actions = getSoloOpponentActions();

  if (actions.length === 0) {
    soloOpponentAction = null;
    return null;
  }

  soloOpponentAction = pickWeightedSoloAction(actions);

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

 const personality = getSoloOpponentPersonality();

text.textContent =
  personality.name +
  " : " +
  actionLabel(action) +
  " | PG " +
  action.pg +
  " | " +
  action.color;

  panel.style.display = "block";
}

function calculateOpponentDamage(page, action) {
  if (page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score);
  const mod = Number(action.mod || 0);
  const bonus = Number(action.bonus || 0);

  let total = score + mod + bonus;

  const opponentSizeModifier = -sizeModifier;

  if (action.color === "orange" || action.color === "rouge") {
    total += opponentSizeModifier;
  }

  return Math.max(0, total);
}

function resolveSoloOpponentAttack() {
  if (gameMode !== "solo") return null;
  if (!soloOpponentAction) return null;
  if (!currentPlayerBook) return null;
  if (!selectedAction) return null;

  const opponentMovementPage = String(soloOpponentAction.pg);
  const myMovementPage = getMovementPageForAction(
    selectedAction,
    soloOpponentAction.pg
  );

  const movementTable = currentPlayerBook.movementPages[opponentMovementPage];

  if (!movementTable) {
    return {
      error: "Aucune table trouvée pour le PG adverse : " + opponentMovementPage
    };
  }

  const resultPageNumber = movementTable[myMovementPage];

  if (resultPageNumber === undefined || resultPageNumber === null) {
    return {
      error:
        "Aucun résultat adverse trouvé pour :\n" +
        "PG adverse : " +
        opponentMovementPage +
        "\nTon PG : " +
        myMovementPage
    };
  }

  const page = getBookPage(currentPlayerBook, resultPageNumber);

  if (!page) {
    return {
      error: "Page adverse manquante : " + resultPageNumber
    };
  }

  const damage = calculateOpponentDamage(page, soloOpponentAction);

  return {
    pageNumber: resultPageNumber,
    page: page,
    damage: damage
  };
}

function buildSoloOpponentResultHtml(soloResult) {
  if (!soloResult) return "";

  if (soloResult.error) {
    return (
      '<div class="instruction-card solo-result-card">' +
      "<strong>Riposte adverse</strong><br>" +
      soloResult.error +
      "</div>"
    );
  }

  let damageText = "";

  if (soloResult.damage === null) {
    damageText = "Aucun SCORE contre toi.";
  } else if (soloResult.damage <= 0) {
    damageText = "L’adversaire obtient un SCORE, mais ne te fait aucun dégât.";
  } else {
    damageText =
      "L’adversaire te fait " +
      soloResult.damage +
      " dégât(s).";
  }

  const nextInstruction =
    soloResult.page.instruction || "Aucune restriction particulière.";

  return (
    '<div class="instruction-card solo-result-card">' +
    "<strong>Riposte adverse</strong><br>" +
    "Action adverse : " +
    actionLabel(soloOpponentAction) +
    "<br>" +
    "Restriction appliquée à l’adversaire solo : " +
    getRestrictionInfo(soloOpponentRestriction).label +
    "<br>" +
    "Page résultat : " +
    soloResult.pageNumber +
    "<br>" +
    damageText +
    "<br><br>" +
    "<strong>Restriction à appliquer à votre prochain tour</strong><br>" +
    nextInstruction +
    "</div>"
  );
}

/* ============================================================
   TOUR / RÉSOLUTION
   ============================================================ */

function chooseAction() {
  const actionId = document.getElementById("actionChoice").value;

  if (!actionId) {
    appAlert("Aucune action disponible avec cette restriction.", "Action impossible");
    return;
  }

  selectedAction = currentActions.find(function(action) {
    return action.id === actionId;
  });

  if (!selectedAction) {
    appAlert("Choisis une action.", "Action manquante");
    return;
  }

  lastDamage = null;
  damageAlreadyApplied = false;

  document.getElementById("enemyPg").value = "";
  document.getElementById("pgToAnnounce").textContent =
    getPgDisplayForAction(selectedAction, null);

  if (gameMode === "solo") {
    const opponentAction = pickSoloOpponentAction();

    if (!opponentAction) {
      appAlert("Aucune action adverse disponible pour le mode solo.", "Mode solo");
      return;
    }

    document.getElementById("enemyPg").value = opponentAction.pg;

    document.getElementById("pgToAnnounce").textContent =
      getPgDisplayForAction(selectedAction, opponentAction.pg);
    
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
function isDistancePg(pg) {
  const value = Number(pg);
  return value >= 50;
}

function getMovementPageForAction(action, enemyPg) {
  if (!action) return "";

  if (isDistancePg(enemyPg) && action.da !== undefined && action.da !== null) {
    return String(action.da);
  }

  return String(action.pg);
}

function getPgDisplayForAction(action, enemyPg) {
  if (!action) return "-";

  const normalPg = String(action.pg);

  if (isDistancePg(enemyPg) && action.da !== undefined && action.da !== null) {
    return String(action.da) + " (DA, depuis " + normalPg + ")";
  }

  if (action.da !== undefined && action.da !== null) {
    return normalPg + " / DA " + action.da;
  }

  return normalPg;
}

function getBookPage(book, pageNumber) {
  if (!book || !book.pages) return null;

  const key = String(pageNumber);

  return (
    book.pages[key] ||
    book.pages[key.padStart(2, "0")] ||
    book.pages[key.padStart(3, "0")] ||
    null
  );
}
function resolveTurn() {
  const enemyPg = document.getElementById("enemyPg").value;

  if (!selectedAction) {
  appAlert("Choisis d’abord une action.", "Action manquante");
  return;
}

  if (!enemyPg) {
    appAlert("Entre le PG donné par ton adversaire.", "PG manquant");
    return;
  }

  if (!currentBook) {
    appAlert("Aucun livret chargé.", "Livret manquant");
    return;
  }

  const enemyMovementPage = String(enemyPg);
  const myMovementPage = getMovementPageForAction(selectedAction, enemyMovementPage);

  const movementTable = currentBook.movementPages[myMovementPage];

  if (!movementTable) {
    appAlert(
      "Aucune table de mouvement trouvée pour ton PG : " + myMovementPage,
      "Table introuvable"
    );
    return;
  }

  const resultPageNumber = movementTable[enemyMovementPage];

  if (resultPageNumber === undefined || resultPageNumber === null) {
    appAlert(
      "Aucun résultat trouvé pour :\n" +
        "Ton PG : " +
        myMovementPage +
        "\nPG reçu : " +
        enemyMovementPage,
      "Résultat introuvable"
    );
    return;
  }

  const page = getBookPage(currentBook, resultPageNumber);

  if (!page) {
   appAlert(
    "La page résultat " +
      resultPageNumber +
      " existe dans la table, mais pas dans la liste des pages.",
    "Page manquante"
  );
    return;
  }

  pendingOpponentInstruction =
    page.instruction || "Aucune instruction particulière.";

  const damage = calculateDamage(page, selectedAction);
  const soloOpponentResult = resolveSoloOpponentAttack();
  if (
   gameMode === "solo" &&
   soloOpponentResult &&
   !soloOpponentResult.error &&
   soloOpponentResult.page
 ) {
   pendingPlayerInstruction =
    soloOpponentResult.page.instruction || "Aucune restriction particulière.";
  } else {
   pendingPlayerInstruction = "";
 }

  const resolutionLogKey =
    currentTurnNumber +
    "|" +
    selectedAction.id +
    "|" +
    enemyMovementPage +
    "|" +
    resultPageNumber;
  
  if (resolutionLogKey !== lastResolutionLogKey) {
    const logLines = [
      "Vous : " +
        actionLabel(selectedAction) +
        " | PG utilisé " +
        myMovementPage +
        " | PG reçu " +
        enemyMovementPage,
      damage === null
        ? "Votre résultat : page " + resultPageNumber + " | aucun SCORE."
        : "Votre résultat : page " + resultPageNumber + " | " + damage + " dégât(s) à appliquer à l’adversaire.",
      "Restriction donnée à l’adversaire : " + pendingOpponentInstruction
    ];
  
    if (gameMode === "solo" && soloOpponentAction) {
      logLines.splice(
        1,
        0,
        "Adversaire solo : " +
          actionLabel(soloOpponentAction) +
          " | PG " +
          soloOpponentAction.pg
      );
  
      if (soloOpponentResult && soloOpponentResult.error) {
        logLines.push("Riposte adverse : " + soloOpponentResult.error);
      } else if (soloOpponentResult && soloOpponentResult.page) {
        const soloDamageText =
          soloOpponentResult.damage === null
            ? "aucun SCORE contre vous."
            : soloOpponentResult.damage + " dégât(s) contre vous.";
  
        logLines.push(
          "Riposte adverse : page " +
            soloOpponentResult.pageNumber +
            " | " +
            soloDamageText
        );
  
        logLines.push(
          "Restriction à appliquer à votre prochain tour : " +
            (pendingPlayerInstruction || "Aucune restriction particulière.")
        );
      }
    }
  
    addCombatLogEntry(
      "Tour " + currentTurnNumber + " - Résolution",
      logLines,
      "turn"
    );
  
    lastResolutionLogKey = resolutionLogKey;
  }

  if (
    soloOpponentResult &&
    !soloOpponentResult.error &&
    soloOpponentResult.damage !== null &&
    soloOpponentResult.damage > 0
  ) {
    myCurrentBody -= Number(soloOpponentResult.damage);
    updateBodyDisplays();
    saveCurrentDuelState();
}
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
    myMovementPage +
    "</span>" +
    "<span><strong>Reçu</strong> : " +
    enemyPg +
    "</span>" +
    "</div>" +
   imageHtml +
   damageHtml +
   buildSoloOpponentResultHtml(soloOpponentResult) +
   '<div class="instruction-card">' +
   "<strong>" +
   (gameMode === "solo"
    ? "Restriction donnée à l’adversaire solo"
     : "Instruction à lire à l’adversaire") +
    "</strong><br>" +
   pendingOpponentInstruction +
   
    "</div>" +
    applyButton +
    "</div>";

  document.getElementById("turnPanel").style.display = "none";
  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "block";
  document.getElementById("nextTurnButton").style.display = "block";
  checkCombatEnd();

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

  addCombatLogEntry(
    "Tour " + currentTurnNumber + " - Dégâts",
    [
      lastDamage +
        " dégât(s) appliqué(s) à l’adversaire.",
      "PV adversaire : " + opponentCurrentBody + " / " + opponentMaxBody + "."
    ],
    lastDamage > 0 ? "damage" : "normal"
  );
  
    if (lastDamage > 0) {
      playSfx("hit");
    } else {
      playSfx("click");
    }

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
  currentTurnNumber += 1;

  document.getElementById("enemyPg").value = "";
  soloOpponentAction = null;
  updateSoloOpponentDisplay(null);

  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("resultText").innerHTML = "";
  document.getElementById("nextTurnButton").style.display = "none";
  document.getElementById("turnPanel").style.display = "block";
  document.getElementById("bodyStatus").textContent = "";

  if (gameMode === "solo") {
  const playerRestriction = pendingPlayerInstruction
    ? restrictionFromInstructionText(pendingPlayerInstruction)
    : "none";

  soloOpponentRestriction = pendingOpponentInstruction
    ? restrictionFromInstructionText(pendingOpponentInstruction)
    : "none";

  document.getElementById("restrictionMode").value = playerRestriction;

  const playerInfo = getRestrictionInfo(playerRestriction);
  const opponentInfo = getRestrictionInfo(soloOpponentRestriction);

  const panelLabel = document.querySelector("#opponentInstructionPanel span");
  if (panelLabel) {
    panelLabel.textContent = "Restrictions du prochain tour";
  }

  document.getElementById("opponentInstructionText").textContent =
    "Vous : " +
    playerInfo.label +
    " | Adversaire solo : " +
    opponentInfo.label;

  document.getElementById("opponentInstructionPanel").style.display = "block";
} else if (pendingOpponentInstruction) {
  const panelLabel = document.querySelector("#opponentInstructionPanel span");
  if (panelLabel) {
    panelLabel.textContent = "Instruction à donner à l’adversaire";
  }

  document.getElementById("opponentInstructionText").textContent =
    pendingOpponentInstruction;

  document.getElementById("opponentInstructionPanel").style.display = "block";
}

  document.getElementById("temporaryBonus").value = "none";
  if (currentTurnNumber > 1 && document.getElementById("distanceMode").value === "distance") {
  document.getElementById("distanceMode").value = "normal";
}
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

  if (!overlay || !image) return;

  overlayZoom = 1;
  image.src = src;

  overlay.classList.add("image-overlay-open");

  updateOverlayZoom();
}

function closeImageOverlay() {
  const overlay = document.getElementById("imageOverlay");
  const image = document.getElementById("overlayImage");

  if (!overlay || !image) return;

  overlay.classList.remove("image-overlay-open");
  image.src = "";
}

function updateOverlayZoom() {
  const image = document.getElementById("overlayImage");
  if (!image) return;

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
async function fleeCombat() {
  if (duelFinished) {
    appAlert("Le combat est déjà terminé.", "Fuite impossible");
    return;
  }

  const confirmed = await appConfirm(
    "Abandonner le combat ?\n\nLe PJ prend la fuite. Aucun point d’expérience ne sera gagné.",
    "Fuite"
  );

  if (!confirmed) return;

  duelFinished = true;

  addCombatLogEntry(
    "Fin du combat - Fuite",
    [
      currentPlayerName + " abandonne le combat.",
      "Aucun XP gagné."
    ],
    "flee"
  );

  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("turnPanel").style.display = "none";
  document.getElementById("nextTurnButton").style.display = "none";
  
  playSfx("flee");
  showCombatEnd(
    "Fuite",
    currentPlayerName + " abandonne le combat. Aucun XP gagné.",
    "combat-end-flee"
  );

  clearCurrentDuelState();

  const fleeButton = document.getElementById("fleeButton");
  if (fleeButton) {
    fleeButton.style.display = "none";
  }
}


async function newDuel() {
  const confirmed = await appConfirm(
    "Commencer un nouveau duel ?\n\nLes Points de Corps du duel en cours seront réinitialisés.",
    "Nouveau duel"
  );
  
  if (!confirmed) return;

  stopCombatMusic();

  clearCurrentDuelState();

  combatLog = [];
  lastResolutionLogKey = "";
  renderCombatLog();

  const combatLogPanel = document.getElementById("combatLogPanel");
  if (combatLogPanel) {
    combatLogPanel.style.display = "none";
  }

  const combatLogButton = document.getElementById("combatLogButton");
  if (combatLogButton) {
    combatLogButton.classList.remove("active");
  }

  currentFighter = null;
  currentOpponentFighter = null;
  currentBook = null;
  currentPlayerBook = null;
  currentActions = [];
  selectedAction = null;
  gameMode = "duel";
  soloOpponentAction = null;
  soloOpponentRestriction = "none";

  myMaxBody = 0;
  myCurrentBody = 0;
  opponentMaxBody = 0;
  opponentCurrentBody = 0;

  lastDamage = null;
  damageAlreadyApplied = false;
  pendingOpponentInstruction = "";
  pendingPlayerInstruction = "";
  duelFinished = false;
  victoryXpAwarded = false;
  currentTurnNumber = 1;

  document.body.classList.remove("duel-active");

  const fixedHpBar = document.getElementById("fixedHpBar");
  if (fixedHpBar) {
    fixedHpBar.style.display = "none";
  }

  const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
  if (duelCharacterSheetButton) {
    duelCharacterSheetButton.style.display = "none";
  }
  const hpTools = document.getElementById("hpTools");
  if (hpTools) {
    hpTools.style.display = "none";
  }

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
function openRulesPage() {
  window.open("regles.html", "_blank");
}

initApp();
