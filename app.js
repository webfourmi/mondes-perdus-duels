const APP_VERSION = "1.0.2-solo-balance";

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
let soloDifficultyLevel = 0;

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

const currentDuelSaveKey = "lw_current_duel_state";
const charactersIndexKey = "lw_saved_characters_index";
const lastCharacterKey = "lw_last_character_id";
const resumeDuelAfterSheetKey = "lw_resume_duel_after_sheet";

let duelFinished = false;
let victoryXpAwarded = false;
let currentTurnNumber = 1;
let currentVictories = 0;

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

/* ============================================================
   OUTILS JSON / CATALOGUE
   ============================================================ */

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

function ensureSetupSelectorsVisible() {
  const selectors = [
    document.getElementById("playerSheet"),
    document.getElementById("opponentBook")
  ];

  selectors.forEach(function(select) {
    if (!select) return;

    select.classList.remove("hidden-action-select");
    select.classList.remove("hidden-game-mode-select");
    select.style.display = "";
  });
}

function refreshSetupSelectionDisplays() {
  const playerSelect = document.getElementById("playerSheet");
  const opponentSelect = document.getElementById("opponentBook");

  const playerEntry = playerSelect ? findCatalogEntry(playerSelect.value) : null;
  const opponentEntry = opponentSelect ? findCatalogEntry(opponentSelect.value) : null;

  const playerLabels = [
    document.getElementById("currentSheet"),
    document.getElementById("selectedPlayerSheet"),
    document.getElementById("playerSheetDisplay")
  ];

  const opponentLabels = [
    document.getElementById("currentBook"),
    document.getElementById("selectedOpponentBook"),
    document.getElementById("opponentBookDisplay"),
    document.getElementById("bookChoiceDisplay")
  ];

  playerLabels.forEach(function(element) {
    if (!element || !playerEntry) return;
    element.textContent = playerEntry.fullName || playerEntry.shortName || playerEntry.id;
  });

  opponentLabels.forEach(function(element) {
    if (!element || !opponentEntry) return;
    element.textContent = opponentEntry.fullName || opponentEntry.shortName || opponentEntry.id;
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
    .replace(/\"/g, "&quot;")
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
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.warn("Index PJ invalide :", parsed);
      return [];
    }

    return parsed.filter(function(character) {
      return (
        character &&
        character.id &&
        character.fighterId &&
        character.name
      );
    });
  } catch (error) {
    console.error("Index PJ illisible :", error, raw);
    return [];
  }
}

function saveSavedCharacters(characters) {
  localStorage.setItem(charactersIndexKey, JSON.stringify(characters));
}

function refreshSavedCharactersSelect() {
  const select = document.getElementById("savedCharacterSelect");
  const newButton = document.getElementById("newCharacterButton");
  const deleteButton = document.getElementById("deleteCharacterButton");
  const creationFields = document.getElementById("characterCreationFields");
  const sheetButton = document.getElementById("characterSheetButton");

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
    if (sheetButton) sheetButton.style.display = "none";
    if (creationFields) creationFields.style.display = "block";

    const playerNameInput = document.getElementById("playerName");
    if (playerNameInput) playerNameInput.value = "";

    currentPlayerName = "";
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
    currentVictories = 0;
    currentProfileKey = "";

    updateExperienceDisplay();

    return;
  }

  if (newButton) newButton.style.display = "inline-block";
  if (deleteButton) deleteButton.style.display = "block";
  if (sheetButton) sheetButton.style.display = "inline-block";
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
      " XP utilisées" +
      " — " +
      Number(character.victories || 0) +
      " victoire(s)";

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
  const fighterSelect = document.getElementById("playerSheet");
  const nameInput = document.getElementById("playerName");

  if (!fighterSelect || !nameInput) return null;

  const fighterId = fighterSelect.value;
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
    spentExperience: currentSpentExperience || 0,
    victories: currentVictories || 0,
    level: getCurrentPlayerLevel()
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

  const sheetButton = document.getElementById("characterSheetButton");
  if (sheetButton) {
    sheetButton.style.display = "inline-block";
  }

  currentPlayerName = character.name;
  loadPlayerProfile(character.fighterId, character.name);
  updateEvolutionPanel();
}

function openCharacterSheetPage() {
  if (currentFighter && currentOpponentFighter) {
    saveCurrentDuelState();
  }

  let characterId = "";

  if (currentFighter && currentPlayerName) {
    characterId = makeCharacterId(currentFighter.id, currentPlayerName);
  } else {
    const select = document.getElementById("savedCharacterSelect");

    if (select && select.value) {
      characterId = select.value;
    } else {
      characterId = localStorage.getItem(lastCharacterKey) || "";
    }
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

  if (sheetButton) sheetButton.style.display = "none";
  if (creationFields) creationFields.style.display = "block";
  if (select) select.value = "";
  if (playerNameInput) playerNameInput.value = "";
  if (playerSheetSelect) playerSheetSelect.value = "chevalier";

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentVictories = 0;
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

  if (creationFields) creationFields.style.display = "none";

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
    appAlert("Choisis d’abord un PJ sauvegardé à supprimer.", "PJ à supprimer");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    appAlert("PJ introuvable.", "PJ introuvable");
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

  if (!confirmed) return;

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
  if (playerNameInput) playerNameInput.value = "";

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentVictories = 0;
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
    const victories = Number(character.victories || 0);

    profile = {
      fighterId: character.fighterId,
      name: character.name,
      experience: character.experience || 0,
      spentExperience: character.spentExperience || 0,
      actionBonuses: {},
      bodyBonus: 0,
      victories: victories,
      level: getPlayerLevelFromVictories(victories)
    };
  }

  profile.victories = getVictoriesCompatibleWithStoredLevel(profile);
  profile.level = getPlayerLevelFromVictories(profile.victories);

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

    const victories = Number(
      importedProfile.victories || importedCharacter.victories || 0
    );

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
      spentExperience: Number(importedProfile.spentExperience || importedCharacter.spentExperience || 0),
      victories: victories,
      level: getPlayerLevelFromVictories(victories)
    };

    const cleanProfile = {
      fighterId: cleanCharacter.fighterId,
      name: cleanCharacter.name,
      experience: cleanCharacter.experience,
      spentExperience: cleanCharacter.spentExperience,
      actionBonuses: importedProfile.actionBonuses || {},
      bodyBonus: Number(importedProfile.bodyBonus || 0),
      victories: cleanCharacter.victories,
      level: cleanCharacter.level
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
    currentVictories = 0;
    updateExperienceDisplay();
    return;
  }

  try {
    const profile = JSON.parse(raw);

    currentExperience = Number(profile.experience || 0);
    currentSpentExperience = Number(profile.spentExperience || 0);
    currentActionBonuses = profile.actionBonuses || {};
    currentVictories = getVictoriesCompatibleWithStoredLevel(profile);
    currentBodyBonus = Number(profile.bodyBonus || 0);

    if (currentFighter) {
      recomputeCurrentBodyBonus();
    }
  } catch (error) {
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
    currentVictories = 0;
  }

  updateExperienceDisplay();
}

function savePlayerProfile() {
  if (!currentProfileKey) return;

  const fighterSelect = document.getElementById("playerSheet");

  const fighterId = currentFighter
    ? currentFighter.id
    : fighterSelect
      ? fighterSelect.value
      : "";

  if (!fighterId) return;

  const fighterEntry = findCatalogEntry(fighterId);

  if (currentFighter) {
    recomputeCurrentBodyBonus();
  }

  const profile = {
    fighterId: fighterId,
    name: currentPlayerName,
    experience: currentExperience,
    spentExperience: currentSpentExperience,
    actionBonuses: currentActionBonuses,
    bodyBonus: currentBodyBonus,
    victories: currentVictories,
    level: getCurrentPlayerLevel()
  };

  localStorage.setItem(currentProfileKey, JSON.stringify(profile));

  if (currentPlayerName) {
    saveCharacterToIndex({
      id: makeCharacterId(fighterId, currentPlayerName),
      fighterId: fighterId,
      fighterName: fighterEntry ? fighterEntry.shortName : fighterId,
      name: currentPlayerName,
      experience: currentExperience,
      spentExperience: currentSpentExperience,
      victories: currentVictories,
      level: getCurrentPlayerLevel()
    });
  }
}

function hideDuelXpPanels() {
  const xpPanel = document.getElementById("xpPanel");
  if (xpPanel) xpPanel.style.display = "none";

  document.querySelectorAll(".xp-panel").forEach(function(panel) {
    panel.style.display = "none";
  });
}

function updateExperienceDisplay() {
  const display = document.getElementById("xpDisplay");
  if (display) {
    display.textContent =
      currentExperience + " dispo / " + currentSpentExperience + " utilisées";
  }

  updateEvolutionPanel();
}

/* ============================================================
   ÉVOLUTION DU PERSONNAGE
   ============================================================ */


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
      "Coup plongeant violent",
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

function getVictoriesCompatibleWithStoredLevel(profile) {
  const victories = Number(profile && profile.victories !== undefined ? profile.victories : 0);
  const storedLevel = Number(profile && profile.level !== undefined ? profile.level : 0);
  const computedLevel = getPlayerLevelFromVictories(victories);

  if (storedLevel > computedLevel && playerLevelVictoryThresholds[storedLevel] !== undefined) {
    return playerLevelVictoryThresholds[storedLevel];
  }

  return victories;
}

function getCurrentPlayerLevel() {
  return getPlayerLevelFromVictories(currentVictories);
}

function getCurrentPlayerLevelTitle() {
  return playerLevelTitles[getCurrentPlayerLevel()] || "Novice";
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

  const actionId = normalizeActionUnlockName(action.id);
  const fullLabel = normalizeActionUnlockName(actionLabel(action));
  const simpleName = normalizeActionUnlockName(action.name);
  const categoryName = normalizeActionUnlockName(
    (action.category || "") + " " + (action.name || "")
  );
  const linkedUnlockName = normalizeActionUnlockName(action.unlockName);

  return (
    actionId === wanted ||
    fullLabel === wanted ||
    simpleName === wanted ||
    categoryName === wanted ||
    linkedUnlockName === wanted
  );
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

function isRecoverWeaponAction(action) {
  return normalizeActionUnlockName(actionLabel(action)).includes("recuperer arme");
}

function isActionUnlockedForFighter(action, fighterId, level) {
  if (!action) return false;

  const unlockedNames = getUnlockedActionNamesForLevel(fighterId, level);

  return unlockedNames.some(function(name) {
    return actionMatchesUnlockName(action, name);
  });
}

function isActionUnlockedByLevel(action) {
  if (!currentFighter) return true;

  return isActionUnlockedForFighter(
    action,
    currentFighter.id,
    getCurrentPlayerLevel()
  );
}

function isDistanceModeActive() {
  const distanceModeElement = document.getElementById("distanceMode");
  const mode = distanceModeElement ? distanceModeElement.value : "normal";

  return currentTurnNumber === 1 || mode === "distance";
}

function actionLabel(action) {
  if (action.category) {
    return action.category + " " + action.name;
  }

  return action.name;
}

function getActionUpgradeKey(actionOrId) {
  if (!actionOrId) return "";

  if (typeof actionOrId === "string") {
    return actionOrId;
  }

  // Les actions de Distance Accrue peuvent être liées à une action normale
  // par unlockName. Exemple : Coup latéral haut en mêlée et en DA.
  const sourceName =
    actionOrId.unlockName ||
    actionLabel(actionOrId) ||
    actionOrId.id ||
    "";

  return normalizeActionUnlockName(sourceName).replace(/\s+/g, "_");
}

function getUniqueActionsByUpgradeKey(actions) {
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

    // Si possible, on garde comme action principale celle de mêlée.
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

function getAllUnlockedUniqueActions() {
  return getUniqueActionsByUpgradeKey(getAllUpgradeableActions());
}

function getAllUpgradeableActions() {
  if (!currentFighter) return [];

  const allActions = []
    .concat(currentFighter.actions || [])
    .concat(currentFighter.distanceActions || []);

  return allActions.filter(function(action) {
    if (!action || !action.id || !action.color) return false;

    if (isRecoverWeaponAction(action)) return true;

    return isActionUnlockedByLevel(action);
  });
}

function getActionUpgradeBonus(actionOrId) {
  const key = getActionUpgradeKey(actionOrId);

  if (!key) return 0;

  // Nouvelle sauvegarde par clé canonique.
  if (currentActionBonuses[key] !== undefined) {
    return Number(currentActionBonuses[key] || 0);
  }

  // Compatibilité avec les anciennes sauvegardes par id.
  if (
    actionOrId &&
    typeof actionOrId !== "string" &&
    actionOrId.id &&
    currentActionBonuses[actionOrId.id] !== undefined
  ) {
    return Number(currentActionBonuses[actionOrId.id] || 0);
  }

  return 0;
}

function getEffectiveBodyStart() {
  if (!currentFighter) return 0;

  const baseBody = Number(currentFighter.bodyPointsStart || 0);
  return baseBody + currentBodyBonus;
}

function getNextUpgradeLevel() {
  const uniqueActions = getAllUnlockedUniqueActions();

  if (uniqueActions.length === 0) return 1;

  let minBonus = Infinity;

  uniqueActions.forEach(function(entry) {
    minBonus = Math.min(minBonus, getActionUpgradeBonus(entry.action));
  });

  if (minBonus === Infinity) return 1;

  return minBonus + 1;
}

function getCurrentMaxActionEvolutionLevel() {
  // Exception de confort : au niveau 0, le joueur peut déjà monter
  // ses actions débloquées jusqu’à EVO +1.
  return Math.max(1, getCurrentPlayerLevel());
}

function getActionsAvailableForUpgrade() {
  const uniqueActions = getAllUnlockedUniqueActions();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();

  return uniqueActions.filter(function(entry) {
    const action = entry.action;

    return (
      isActionUnlockedByLevel(action) &&
      getActionUpgradeBonus(action) < maxEvolutionLevel
    );
  });
}

function computeBodyBonusFromColors() {
  const uniqueActions = getAllUnlockedUniqueActions();
  const byColor = {};

  uniqueActions.forEach(function(entry) {
    const action = entry.action;
    if (!action || !action.color) return;

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

function computeTotalBodyBonus() {
  // +1 PV automatique par niveau gagné,
  // puis bonus de couleur selon les actions débloquées et évoluées.
  return getCurrentPlayerLevel() + computeBodyBonusFromColors();
}

function recomputeCurrentBodyBonus() {
  currentBodyBonus = computeTotalBodyBonus();
  return currentBodyBonus;
}

function updateEvolutionPanel() {
  const panel = document.getElementById("evolutionPanel");
  const info = document.getElementById("evolutionInfo");
  const select = document.getElementById("upgradeActionChoice");

  if (!panel || !info || !select || !currentFighter) return;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();
  const playerLevel = getCurrentPlayerLevel();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();
  const availableEntries = getActionsAvailableForUpgrade();

  select.innerHTML = "";

  // Le panneau n’apparaît que si le joueur peut vraiment dépenser des XP.
  if (currentExperience < cost || availableEntries.length === 0) {
    panel.style.display = "none";
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
      action.color +
      ") : EVO +" +
      currentBonus +
      " → +" +
      nextBonus +
      (entry.variants.length > 1 ? " [mêlée + DA]" : "");

    select.appendChild(option);
  });

  info.textContent =
    currentExperience +
    " XP disponibles. Coût : " +
    cost +
    " XP. Niveau PJ : " +
    playerLevel +
    " | EVO max actuelle : +" +
    maxEvolutionLevel +
    (playerLevel === 0 ? " (exception débutant)." : ".");

  select.style.display = "block";
  panel.style.display = "block";
}

function upgradeSelectedAction() {
  const select = document.getElementById("upgradeActionChoice");
  if (!select || !select.value) return;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();

  if (currentExperience < cost) {
    appAlert("Pas assez d’expérience. Il faut au moins " + cost + " XP.", "Évolution impossible");
    return;
  }

  const actionKey = select.value;
  const entry = getActionsAvailableForUpgrade().find(function(item) {
    return item.key === actionKey;
  });

  if (!entry) {
    appAlert("Cette action ne peut pas être améliorée pour le moment.", "Évolution impossible");
    return;
  }

  const currentBonus = getActionUpgradeBonus(entry.action);
  const nextLevel = currentBonus + 1;
  const playerLevel = getCurrentPlayerLevel();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();

  if (nextLevel > maxEvolutionLevel) {
    appAlert(
      "Cette action ne peut pas dépasser l’EVO max actuelle.\n\nNiveau PJ : " +
        playerLevel +
        "\nEVO max : +" +
        maxEvolutionLevel +
        "\nEVO actuelle : +" +
        currentBonus,
      "Évolution impossible"
    );
    return;
  }

  const oldBodyBonus = currentBodyBonus;

  currentActionBonuses[actionKey] = nextLevel;

  // Nettoyage doux des anciennes sauvegardes par id pour les variantes liées.
  entry.variants.forEach(function(variant) {
    if (variant && variant.id && variant.id !== actionKey) {
      delete currentActionBonuses[variant.id];
    }
  });

  currentExperience -= cost;
  currentSpentExperience += cost;

  recomputeCurrentBodyBonus();

  const bodyIncrease = currentBodyBonus - oldBodyBonus;

  updateExperienceDisplay();
  savePlayerProfile();
  updateEvolutionPanel();

  let message =
    "Action améliorée : EVO +" +
    nextLevel +
    ".\n\nXP dépensée : " +
    cost +
    ".";

  if (entry.variants.length > 1) {
    message +=
      "\n\nCette amélioration s’applique à la version mêlée et à la version Distance Accrue.";
  }

  if (bodyIncrease > 0) {
    message +=
      "\n\nBonus de PV gagné : +" +
      bodyIncrease +
      " PV.";
  }

  appAlert(message, "Évolution du PJ");
}

/* ============================================================
   REPRISE DU DUEL
   ============================================================ */

function getSavedDuelState() {
  const raw = localStorage.getItem(currentDuelSaveKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function shouldResumeDuelAfterSheet() {
  const params = new URLSearchParams(window.location.search);

  return (
    params.get("resume") === "1" ||
    localStorage.getItem(resumeDuelAfterSheetKey) === "1"
  );
}

function applySavedDuelToSetup() {
  const state = getSavedDuelState();

  if (!state || !state.fighterId || !state.opponentId || !state.playerName) {
    return false;
  }

  const playerSheetSelect = document.getElementById("playerSheet");
  const opponentBookSelect = document.getElementById("opponentBook");
  const gameModeSelect = document.getElementById("gameMode");
  const playerNameInput = document.getElementById("playerName");
  const savedCharacterSelect = document.getElementById("savedCharacterSelect");
  const soloDifficultySelect = document.getElementById("soloDifficultyLevel");

  if (playerSheetSelect) playerSheetSelect.value = state.fighterId;
  if (opponentBookSelect) opponentBookSelect.value = state.opponentId;
  if (gameModeSelect) gameModeSelect.value = state.gameMode || "duel";
  if (playerNameInput) playerNameInput.value = state.playerName;

  if (savedCharacterSelect) {
    const characterId = makeCharacterId(state.fighterId, state.playerName);
    savedCharacterSelect.value = characterId;
    localStorage.setItem(lastCharacterKey, characterId);
  }

  if (soloDifficultySelect) {
    soloDifficultySelect.value = String(state.soloDifficultyLevel || 0);
  }

  refreshSoloDifficultyOptions();
  updateGameModeButtons();

  return true;
}

function resumeDuelAfterSheetIfNeeded() {
  if (!shouldResumeDuelAfterSheet()) return;

  localStorage.removeItem(resumeDuelAfterSheetKey);

  const restored = applySavedDuelToSetup();

  if (!restored) {
    appAlert("Aucun duel en cours à reprendre.", "Retour au duel");
    return;
  }

  setTimeout(function() {
    startDuel();
  }, 80);
}

/* ============================================================
   INITIALISATION
   ============================================================ */

async function initApp() {
  const message = document.getElementById("loadMessage");

  document.body.classList.remove("duel-active");

  const fixedHpBar = document.getElementById("fixedHpBar");
  if (fixedHpBar) fixedHpBar.style.display = "none";

  closeActionManualScreen();

  const setupPanel = document.getElementById("setupPanel");
  const duelPanel = document.getElementById("duelPanel");

  if (setupPanel) setupPanel.style.display = "block";
  if (duelPanel) duelPanel.style.display = "none";

  try {
    catalog = await loadJson("data/catalog.json");
  } catch (error) {
    console.error("Erreur chargement catalog.json :", error);
    catalog = fallbackCatalog;

    if (message) {
      message.innerHTML =
        '<span class="error">Catalogue distant non chargé, catalogue de secours utilisé. Version ' +
        APP_VERSION +
        ".</span>";
    }
  }

  fillSelect("playerSheet", catalog.fighters);
  fillSelect("opponentBook", catalog.fighters);

  ensureSetupSelectorsVisible();
  refreshSetupSelectionDisplays();
  updateOpponentBookButtons();

  const gameModeSelect = document.getElementById("gameMode");
  const playerSheetSelect = document.getElementById("playerSheet");
  const opponentBookSelect = document.getElementById("opponentBook");
  const soloDifficultySelect = document.getElementById("soloDifficultyLevel");

  if (gameModeSelect) {
    gameModeSelect.addEventListener("change", function() {
      refreshSoloDifficultyOptions();
      refreshSetupSelectionDisplays();
    });
  }

  if (playerSheetSelect) {
    playerSheetSelect.addEventListener("change", refreshSetupSelectionDisplays);
  }

  if (opponentBookSelect) {
    opponentBookSelect.addEventListener("change", function() {
      updateOpponentBookButtons();
      refreshSoloDifficultyOptions();
      refreshSetupSelectionDisplays();
    });
  }

  if (soloDifficultySelect) {
    soloDifficultySelect.addEventListener("change", refreshSoloDifficultyOptions);
  }

  refreshSoloDifficultyOptions();
  refreshSoloIntroText();

  if (message && catalog !== fallbackCatalog) {
    message.textContent =
      "Catalogue chargé : " +
      catalog.fighters.length +
      " combattants disponibles. Version " +
      APP_VERSION;
  }

  try {
    refreshSavedCharactersSelect();
  } catch (error) {
    console.error("Erreur chargement PJ sauvegardés :", error);

    if (message) {
      message.innerHTML =
        '<span class="error">Catalogue chargé, mais erreur avec les PJ sauvegardés. Version ' +
        APP_VERSION +
        ".</span>";
    }
  }

  updateAudioButtons();
  updateActionManualToggleButton();
  resumeDuelAfterSheetIfNeeded();
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

    gameMode: gameMode,
    soloDifficultyLevel:
      typeof soloDifficultyLevel !== "undefined"
        ? Number(soloDifficultyLevel || 0)
        : 0,
    soloOpponentRestriction: soloOpponentRestriction || "none",
    pendingOpponentInstruction: pendingOpponentInstruction || "",
    pendingPlayerInstruction: pendingPlayerInstruction || "",

    combatLog: combatLog,

    duelFinished: duelFinished,
    victoryXpAwarded: victoryXpAwarded,
    turnNumber: currentTurnNumber
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

    if ((state.gameMode || "duel") !== gameMode) {
      return false;
    }

    if (
      gameMode === "solo" &&
      Number(state.soloDifficultyLevel || 0) !== Number(soloDifficultyLevel || 0)
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

    gameMode = state.gameMode || gameMode || "duel";
    soloOpponentRestriction = state.soloOpponentRestriction || "none";
    pendingOpponentInstruction = state.pendingOpponentInstruction || "";
    pendingPlayerInstruction = state.pendingPlayerInstruction || "";
    soloDifficultyLevel = Number(state.soloDifficultyLevel || 0);

    combatLog = Array.isArray(state.combatLog) ? state.combatLog : [];
    lastResolutionLogKey = "";
    renderCombatLog();

    return true;
  } catch (error) {
    console.error("Duel sauvegardé illisible :", error);
    return false;
  }
}

function clearCurrentDuelState() {
  localStorage.removeItem(currentDuelSaveKey);
}

/* ============================================================
   FIN DE COMBAT
   ============================================================ */

function hasAvailableXpUpgrade() {
  if (!currentFighter) return false;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();

  return (
    currentExperience >= cost &&
    getActionsAvailableForUpgrade().length > 0
  );
}

function focusEvolutionPanel() {
  updateEvolutionPanel();

  const panel = document.getElementById("evolutionPanel");

  if (!panel || panel.style.display === "none") {
    appAlert(
      "Aucune dépense d’XP disponible pour l’instant.",
      "Évolution du PJ"
    );
    return;
  }

  panel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function showEvolutionButtonInCombatEnd() {
  const panel = document.getElementById("combatEndPanel");
  if (!panel) return;

  const oldButton = document.getElementById("combatEndUpgradeButton");
  if (oldButton) oldButton.remove();

  if (!hasAvailableXpUpgrade()) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "combatEndUpgradeButton";
  button.className = "secondary-button combat-end-upgrade-button";
  button.textContent = "Utiliser mes XP";
  button.onclick = focusEvolutionPanel;

  panel.appendChild(button);
}

function showCombatEnd(title, text, cssClass) {
  const panel = document.getElementById("combatEndPanel");
  const titleElement = document.getElementById("combatEndTitle");
  const textElement = document.getElementById("combatEndText");

  if (!panel || !titleElement || !textElement) return;

  const oldUpgradeButton = document.getElementById("combatEndUpgradeButton");
  if (oldUpgradeButton) oldUpgradeButton.remove();

  panel.className = "combat-end-panel " + cssClass;
  titleElement.textContent = title;
  textElement.textContent = text;
  panel.style.display = "block";

  const turnPanel = document.getElementById("turnPanel");
  const pgPanel = document.getElementById("pgPanel");
  const nextTurnButton = document.getElementById("nextTurnButton");
  const fleeButton = document.getElementById("fleeButton");

  if (turnPanel) turnPanel.style.display = "none";
  if (pgPanel) pgPanel.style.display = "none";
  if (nextTurnButton) nextTurnButton.style.display = "none";
  if (fleeButton) fleeButton.style.display = "none";

  stopCombatMusic();
  saveCurrentDuelState();
}

function getOpponentLevelForXpReward() {
  // En solo, le niveau de l’adversaire correspond à la difficulté choisie.
  if (gameMode === "solo") {
    return Number(soloDifficultyLevel || 0);
  }

  // En duel à deux joueurs, on n’a pas encore de vrai niveau adverse chargé.
  // On considère donc le niveau comme équivalent pour ne pas pénaliser.
  return getCurrentPlayerLevel();
}

function getVictoryXpGain() {
  const fullXpGain = Math.max(0, Number(opponentMaxBody || 0));
  const playerLevel = getCurrentPlayerLevel();
  const opponentLevel = getOpponentLevelForXpReward();

  if (opponentLevel < playerLevel) {
    return 1;
  }

  return fullXpGain;
}

function getVictoryXpRewardText() {
  const fullXpGain = Math.max(0, Number(opponentMaxBody || 0));
  const playerLevel = getCurrentPlayerLevel();
  const opponentLevel = getOpponentLevelForXpReward();

  if (opponentLevel < playerLevel) {
    return (
      "Adversaire niveau " +
      opponentLevel +
      " inférieur au PJ niveau " +
      playerLevel +
      " : gain réduit à 1 XP au lieu de " +
      fullXpGain +
      "."
    );
  }

  return "XP gagnée : " + fullXpGain + ".";
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

    const xpGain = getVictoryXpGain();
    const xpRewardText = getVictoryXpRewardText();

    if (!victoryXpAwarded) {
      const oldLevel = getCurrentPlayerLevel();

      currentExperience += xpGain;
      currentVictories += 1;

      const newLevel = getCurrentPlayerLevel();

      if (newLevel > oldLevel) {
        recomputeCurrentBodyBonus();
      }

      victoryXpAwarded = true;

      updateExperienceDisplay();
      savePlayerProfile();

      if (newLevel > oldLevel) {
        appAlert(
          currentPlayerName +
            " passe niveau " +
            newLevel +
            " : " +
            getCurrentPlayerLevelTitle() +
            " !\n\nDe nouvelles actions sont débloquées.",
          "Niveau gagné"
        );
      }
    }

    addCombatLogEntry(
      "Fin du combat - Victoire",
      [
        "L’adversaire est hors combat.",
        currentPlayerName + " gagne " + xpGain + " XP.",
        xpRewardText,
        "XP disponibles : " + currentExperience + ".",
        "Victoires : " + currentVictories + " | Niveau " + getCurrentPlayerLevel() + " - " + getCurrentPlayerLevelTitle() + "."
      ],
      "victory"
    );

    playSfx("victory");

    showCombatEnd(
      "Combat gagné",
      "Victoire ! " + xpGain + " XP ajoutée(s) à " + currentPlayerName + ".\n" + xpRewardText,
      "combat-end-victory"
    );

    updateEvolutionPanel();
    showEvolutionButtonInCombatEnd();

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
   POINTS DE CORPS / PV
   ============================================================ */

function updateBodyDisplays() {
  const myBodyDisplay = document.getElementById("myBodyDisplay");
  const opponentBodyDisplay = document.getElementById("opponentBodyDisplay");
  const fixedMyBody = document.getElementById("fixedMyBody");
  const fixedOpponentBody = document.getElementById("fixedOpponentBody");

  if (myBodyDisplay) myBodyDisplay.textContent = myCurrentBody + " / " + myMaxBody;
  if (opponentBodyDisplay) opponentBodyDisplay.textContent = opponentCurrentBody + " / " + opponentMaxBody;
  if (fixedMyBody) fixedMyBody.textContent = myCurrentBody + " / " + myMaxBody;
  if (fixedOpponentBody) fixedOpponentBody.textContent = opponentCurrentBody + " / " + opponentMaxBody;

  const status = document.getElementById("bodyStatus");
  if (!status) return;

  if (opponentCurrentBody <= -5) {
    status.innerHTML = '<span class="danger">Adversaire à -5 ou moins : mort selon les règles.</span>';
  } else if (opponentCurrentBody < 1) {
    status.innerHTML = '<span class="success">Adversaire sous 1 PV : combat terminé.</span>';
  } else if (myCurrentBody <= -5) {
    status.innerHTML = '<span class="danger">Tu es à -5 ou moins : mort selon les règles.</span>';
  } else if (myCurrentBody < 1) {
    status.innerHTML = '<span class="danger">Tu es sous 1 PV : hors combat.</span>';
  } else {
    status.textContent = "";
  }
}


function showPlayerDamageFeedback(damage) {
  const amount = Number(damage || 0);

  if (amount <= 0) return;

  const fixedBar = document.getElementById("fixedHpBar");
  const playerHpBox = fixedBar
    ? fixedBar.querySelector(".hp-box:first-child")
    : null;

  if (fixedBar) {
    fixedBar.classList.remove("hp-bar-shake");
    void fixedBar.offsetWidth;
    fixedBar.classList.add("hp-bar-shake");
  }

  if (playerHpBox) {
    playerHpBox.classList.remove("hp-damage-flash");
    void playerHpBox.offsetWidth;
    playerHpBox.classList.add("hp-damage-flash");

    const float = document.createElement("div");
    float.className = "damage-float";
    float.textContent = "-" + amount + " PV";

    playerHpBox.appendChild(float);

    setTimeout(function() {
      if (float.parentNode) {
        float.parentNode.removeChild(float);
      }
    }, 1200);
  }

  showDamageAlert(amount);
}

function showDamageAlert(damage) {
  const resultPanel = document.getElementById("resultPanel");
  if (!resultPanel) return;

  const oldAlert = document.getElementById("playerDamageAlert");

  if (oldAlert) {
    oldAlert.remove();
  }

  const alert = document.createElement("div");
  alert.id = "playerDamageAlert";
  alert.className = "damage-alert";
  alert.textContent = "Tu perds " + damage + " PV !";

  resultPanel.prepend(alert);

  setTimeout(function() {
    if (alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }, 2500);
}

function adjustMyBody() {
  const input = document.getElementById("myBodyManual");
  if (!input) return;

  const value = input.value;

  if (value === "") {
    appAlert("Entre ton nouveau total de PV.", "PV");
    return;
  }

  myCurrentBody = Number(value);
  input.value = "";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

function toggleHpTools() {
  const tools = document.getElementById("hpTools");
  if (!tools) return;

  tools.style.display = tools.style.display === "grid" ? "none" : "grid";
}

function adjustMyBodyFromTop() {
  const input = document.getElementById("myBodyManualTop");
  if (!input) return;

  const value = input.value;

  if (value === "") {
    appAlert("Entre ton nouveau total de PV.", "PV");
    return;
  }

  myCurrentBody = Number(value);
  input.value = "";

  const hpTools = document.getElementById("hpTools");
  if (hpTools) hpTools.style.display = "none";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

/* ============================================================
   ACTIONS / RESTRICTIONS
   ============================================================ */

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
      return category !== "Estoc" && !lowerName.includes("estoc") && color !== "rouge";

    case "no_thrust_blue":
      return category !== "Estoc" && !lowerName.includes("estoc") && color !== "bleu";

    case "no_lateral_red":
      return category !== "Coup latéral" && !lowerName.includes("latéral") && color !== "rouge";

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
        isRecoverWeaponAction(action) ||
        lowerName.includes("coup de pied") ||
        color === "jaune" ||
        color === "vert"
      ) && !lowerName.includes("coup latéral féroce");

    case "shield_broken":
      return category !== "Coup de bouclier" && category !== "Attaque protégée";

    default:
      return true;
  }
}

function updateDistanceButtons() {
  const distanceModeElement = document.getElementById("distanceMode");
  const normalButton = document.getElementById("btnNormalMode");
  const distanceButton = document.getElementById("btnDistanceMode");

  if (!distanceModeElement || !normalButton || !distanceButton) return;

  const mode = distanceModeElement.value;

  if (currentTurnNumber === 1) {
    distanceModeElement.value = "distance";

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
  const distanceModeElement = document.getElementById("distanceMode");
  if (!distanceModeElement) return;

  if (currentTurnNumber === 1 && mode === "normal") {
    appAlert(
      "Le premier tour doit toujours être joué en Distance Accrue.",
      "Premier tour"
    );

    distanceModeElement.value = "distance";
    updateDistanceButtons();
    refreshActionList();
    return;
  }

  distanceModeElement.value = mode;
  updateDistanceButtons();
  refreshActionList();
}

function getActionsForCurrentMode() {
  if (!currentFighter) return [];

  const distanceModeElement = document.getElementById("distanceMode");
  const distanceMode = distanceModeElement ? distanceModeElement.value : "normal";

  if (currentTurnNumber === 1) {
    if (distanceModeElement) distanceModeElement.value = "distance";
    return currentFighter.distanceActions || [];
  }

  if (distanceMode === "distance") {
    return currentFighter.distanceActions || [];
  }

  return currentFighter.actions || [];
}

function getRestrictionInfo(restriction) {
  switch (restriction) {
    case "none": return { label: "Aucune restriction", css: "restriction-none" };
    case "no_blue": return { label: "Pas de Bleu", css: "restriction-blue" };
    case "no_red": return { label: "Pas de Rouge", css: "restriction-red" };
    case "no_orange": return { label: "Pas d’Orange", css: "restriction-orange" };
    case "no_yellow": return { label: "Pas de Jaune", css: "restriction-yellow" };
    case "no_red_orange": return { label: "Pas de Rouge ni d’Orange", css: "restriction-orange" };
    case "no_blue_yellow": return { label: "Pas de Bleu ni de Jaune", css: "restriction-blue" };
    case "no_thrust": return { label: "Pas d’Estoc", css: "restriction-danger" };
    case "no_lateral": return { label: "Pas de Coup Latéral", css: "restriction-danger" };
    case "no_thrust_red": return { label: "Pas d’Estoc ni de Rouge", css: "restriction-red" };
    case "no_thrust_blue": return { label: "Pas d’Estoc ni de Bleu", css: "restriction-blue" };
    case "no_lateral_red": return { label: "Pas de Coup Latéral ni de Rouge", css: "restriction-red" };
    case "no_green_yellow": return { label: "Pas de Vert ni de Jaune", css: "restriction-danger" };
    case "only_green": return { label: "Seulement Vert", css: "restriction-green" };
    case "only_yellow": return { label: "Seulement Jaune", css: "restriction-yellow" };
    case "only_green_yellow": return { label: "Seulement Vert ou Jaune", css: "restriction-green" };
    case "only_brown": return { label: "Seulement Marron", css: "restriction-brown" };
    case "only_bond": return { label: "Seulement Bond", css: "restriction-yellow" };
    case "only_distance": return { label: "Seulement Distance Accrue", css: "restriction-brown" };
    case "disarmed": return { label: "Désarmé", css: "restriction-danger" };
    case "shield_broken": return { label: "Bouclier brisé", css: "restriction-danger" };
    default: return { label: "Aucune restriction", css: "restriction-none" };
  }
}

function restrictionFromInstructionText(instruction) {
  const text = (instruction || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (text.includes("aucune restriction")) return "none";
  if (text.includes("pas de rouge ni d'orange") || text.includes("pas de rouge ni d orange")) return "no_red_orange";
  if (text.includes("pas de bleu ni de jaune")) return "no_blue_yellow";
  if (text.includes("pas de vert ni de jaune")) return "no_green_yellow";
  if (text.includes("pas d'estoc ni de rouge") || text.includes("pas d estoc ni de rouge")) return "no_thrust_red";
  if (text.includes("pas d'estoc ni de bleu") || text.includes("pas d estoc ni de bleu")) return "no_thrust_blue";
  if (text.includes("pas de coup lateral ni de rouge")) return "no_lateral_red";
  if (text.includes("pas de rouge")) return "no_red";
  if (text.includes("pas de bleu")) return "no_blue";
  if (text.includes("pas d'orange") || text.includes("pas d orange")) return "no_orange";
  if (text.includes("pas de jaune")) return "no_yellow";
  if (text.includes("pas d'estoc") || text.includes("pas d estoc")) return "no_thrust";
  if (text.includes("pas de coup lateral")) return "no_lateral";
  if (text.includes("seulement du vert ou du jaune") || text.includes("seulement vert ou jaune")) return "only_green_yellow";
  if (text.includes("seulement du vert") || text.includes("seulement vert")) return "only_green";
  if (text.includes("seulement du jaune") || text.includes("seulement jaune")) return "only_yellow";
  if (text.includes("seulement du marron") || text.includes("seulement marron")) return "only_brown";
  if (text.includes("distance accrue") || text.includes("marron")) return "only_distance";
  if (text.includes("desarme") || text.includes("desarmé")) return "disarmed";
  if (text.includes("bouclier brise") || text.includes("bouclier brisé")) return "shield_broken";

  return "none";
}

function updateRestrictionBanner(restriction) {
  const banner = document.getElementById("restrictionBanner");
  if (!banner) return;

  const info = getRestrictionInfo(restriction);

  banner.className = "restriction-banner " + info.css;
  banner.textContent = info.label;
}

function hasPlayerActionAvailableInList(actions, restriction) {
  const activeRestriction = restriction || "none";

  return (actions || []).some(function(action) {
    if (!actionAllowedByRestriction(action, activeRestriction)) return false;

    const isAlwaysAllowedRecover =
      activeRestriction === "disarmed" && isRecoverWeaponAction(action);

    if (
      !isAlwaysAllowedRecover &&
      !isActionUnlockedByLevel(action)
    ) {
      return false;
    }

    return true;
  });
}

function refreshActionList() {
  if (!currentFighter) return;

  const restrictionElement = document.getElementById("restrictionMode");
  const distanceModeElement = document.getElementById("distanceMode");

  const restriction = restrictionElement ? restrictionElement.value : "none";

  if (restriction === "only_distance" && distanceModeElement) {
    distanceModeElement.value = "distance";
  }

  let actions = getActionsForCurrentMode();

  /*
    Sécurité de rythme :
    si le joueur est au contact, avec une restriction "seulement marron",
    et qu'il n'a aucune action marron connue disponible, on bascule
    automatiquement en Distance Accrue avant de proposer les actions.

    Cela évite de lui infliger une action de secours trop punitive au corps à corps.
  */
  if (
    restriction === "only_brown" &&
    distanceModeElement &&
    distanceModeElement.value !== "distance" &&
    !hasPlayerActionAvailableInList(actions, restriction)
  ) {
    distanceModeElement.value = "distance";
    actions = getActionsForCurrentMode();

    const hint = document.getElementById("selectedActionHint");
    if (hint) {
      hint.textContent =
        "Aucune action marron disponible au contact : passage automatique en Distance Accrue.";
    }
  }

  updateDistanceButtons();
  updateRestrictionBanner(restriction);
  fillActions(actions, restriction);
}

function selectActionCard(actionId, showManual) {
  const select = document.getElementById("actionChoice");
  const hint = document.getElementById("selectedActionHint");

  if (!select) return;

  selectedAction = currentActions.find(function(action) {
    return action.id === actionId;
  });

  if (!selectedAction) return;

  select.value = actionId;

  const cards = document.querySelectorAll(".action-card");
  cards.forEach(function(card) {
    card.classList.toggle("active", card.dataset.actionId === actionId);
  });

  const upgradeBonus = getActionUpgradeBonus(selectedAction);
  const upgradeText = upgradeBonus > 0 ? " / EVO +" + upgradeBonus : "";

  if (hint) {
    hint.textContent =
      "Action choisie : " +
      actionLabel(selectedAction) +
      " — PG " +
      selectedAction.pg +
      " / MOD " +
      selectedAction.mod +
      upgradeText;
  }

  if (showManual && actionManualAutoOpen) {
    openActionManualScreen(selectedAction);
  }
}

function fillActions(actions, restriction) {
  const select = document.getElementById("actionChoice");
  const cardsContainer = document.getElementById("actionCards");
  const hint = document.getElementById("selectedActionHint");

  if (!select) return;

  select.innerHTML = "";
  currentActions = [];

  if (cardsContainer) {
    cardsContainer.innerHTML = "";
  }

  const activeRestriction = restriction || "none";

  function addActionChoice(action) {
    if (!action || currentActions.includes(action)) return;

    currentActions.push(action);

    const upgradeBonus = getActionUpgradeBonus(action);
    const upgradeText = upgradeBonus > 0 ? " / EVO +" + upgradeBonus : "";

    const option = document.createElement("option");
    option.value = action.id;
    option.textContent =
      actionLabel(action) +
      " — PG " +
      action.pg +
      " / MOD " +
      action.mod +
      upgradeText;

    select.appendChild(option);

    if (cardsContainer) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "action-card action-card-" + (action.color || "none");
      card.dataset.actionId = action.id;

      card.innerHTML =
        "<strong>" +
        escapeHtml(actionLabel(action)) +
        "</strong>" +
        "<span>MOD " +
        escapeHtml(action.mod) +
        "</span>" +
        (upgradeBonus > 0
          ? "<span>EVO +" + escapeHtml(upgradeBonus) + "</span>"
          : "");

      card.addEventListener("click", function() {
        selectActionCard(action.id, true);
      });

      cardsContainer.appendChild(card);
    }
  }

  actions.forEach(function(action) {
    if (!actionAllowedByRestriction(action, activeRestriction)) return;

    const isAlwaysAllowedRecover =
      activeRestriction === "disarmed" && isRecoverWeaponAction(action);

    if (
      !isAlwaysAllowedRecover &&
      !isActionUnlockedByLevel(action)
    ) {
      return;
    }

    addActionChoice(action);
  });

  /*
    Sécurité anti-blocage :
    certaines restrictions peuvent ne laisser aucune action connue,
    surtout "seulement marron" en début de progression.
    Dans ce cas, on autorise une action de survie.
  */
  if (currentActions.length === 0) {
    let safetyNames = [];

    if (
      activeRestriction === "only_brown" ||
      activeRestriction === "only_distance"
    ) {
      safetyNames = [
        "Bond en arrière",
        "Esquive",
        "Bloque et approche"
      ];
    } else if (
      activeRestriction === "none" ||
      activeRestriction === "only_green" ||
      activeRestriction === "only_green_yellow" ||
      activeRestriction === "only_yellow"
    ) {
      safetyNames = [
        "Bond en arrière",
        "Coup de bouclier haut",
        "Coup de bouclier bas"
      ];
    }

    if (safetyNames.length > 0) {
      actions.forEach(function(action) {
        if (!actionAllowedByRestriction(action, activeRestriction)) return;

        const isSafetyAction = safetyNames.some(function(name) {
          return actionMatchesUnlockName(action, name);
        });

        if (!isSafetyAction) return;

        // Ici, on ignore volontairement le niveau.
        // C'est une action de secours pour éviter un tour impossible.
        addActionChoice(action);
      });
    }
  }

  if (currentActions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucune action disponible avec cette restriction";
    select.appendChild(option);

    if (cardsContainer) {
      cardsContainer.innerHTML =
        '<div class="restriction-banner restriction-danger">Aucune action disponible avec cette restriction</div>';
    }

    if (hint) {
      hint.textContent = "Aucune action disponible.";
    }

    closeActionManualScreen();
    return;
  }

  select.value = currentActions[0].id;
  selectActionCard(currentActions[0].id, false);
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
  soloDifficultyLevel = gameMode === "solo" ? getSoloDifficultyLevel() : 0;

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
      spentExperience: currentSpentExperience || 0,
      victories: currentVictories || 0,
      level: getCurrentPlayerLevel()
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

    recomputeCurrentBodyBonus();
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

      let opponentBaseBody = Number(currentOpponentFighter.bodyPointsStart || 0);

      if (
        gameMode === "solo" &&
        currentOpponentFighter &&
        currentOpponentFighter.id === "squelette"
      ) {
        opponentBaseBody = 8;
      }
      
      opponentMaxBody = getSoloDifficultyTargetBody(opponentBaseBody);
      opponentCurrentBody = opponentMaxBody;

      duelFinished = false;
      victoryXpAwarded = false;
      currentTurnNumber = 1;

      addCombatLogEntry(
        "Début du duel",
        [
          currentPlayerName + " affronte " + bookEntry.shortName + ".",
          "Tour 1 : Distance Accrue obligatoire.",
          "PV : " + myCurrentBody + " / " + myMaxBody + " contre " + opponentCurrentBody + " / " + opponentMaxBody + "."
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
    hideDuelXpPanels();
    refreshActionList();
    updateEvolutionPanel();
    renderCombatLog();

    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("duelPanel").style.display = "block";
    document.getElementById("turnPanel").style.display = "block";

    document.body.classList.add("duel-active");

    const fixedHpBar = document.getElementById("fixedHpBar");
    if (fixedHpBar) fixedHpBar.style.display = "grid";

    const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
    if (duelCharacterSheetButton) duelCharacterSheetButton.style.display = "block";

    const fleeButton = document.getElementById("fleeButton");
    if (fleeButton) fleeButton.style.display = duelFinished ? "none" : "block";

    initAudioSystem();
    updateAudioButtons();
    updateActionManualToggleButton();

    if (musicEnabled) {
      startCombatMusic();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    appAlert(
      "Erreur : " +
        error.message +
        "\n\nVérifie les fichiers JSON du combattant et du livret affiché.",
      "Erreur de chargement"
    );
  }
}

/* ============================================================
   MODE SOLO / DIFFICULTÉ
   ============================================================ */

const soloDifficultyTitles = {
  chevalier: [
    "Apprenti",
    "Écuyer",
    "Homme d’armes",
    "Chevalier",
    "Champion",
    "Vétéran"
  ],
  squelette: [
    "Osselet",
    "Serviteur d’os",
    "Guerrier squelette",
    "Garde des cryptes",
    "Champion d’os",
    "Vétéran des tombes"
  ],
  default: [
    "Niveau 0",
    "Niveau 1",
    "Niveau 2",
    "Niveau 3",
    "Niveau 4",
    "Niveau 5"
  ]
};


const soloIntroTexts = {
  chevalier: [
    "Un apprenti chevalier entre dans l’arène, la main un peu trop serrée sur son épée neuve. Il a peur, mais il avance.",
    "Un écuyer baisse la tête derrière son bouclier. Il a vu assez de coups pour savoir que le premier est souvent le pire.",
    "Un homme d’armes s’avance d’un pas lourd. Son armure grince et porte la marque de ses combats.",
    "Le chevalier abaisse sa visière. Il vient te défier. Il vient vaincre.",
    "Un champion entre dans le cercle. La foule se tait et retient son souffle.",
    "Un vétéran de mille duels lève sa lame. Son regard dur se pose sur toi et tu sens qu’il a déjà enterré des adversaires plus braves que toi."
  ],

  squelette: [
    "Un amas d’os se redresse dans un cliquetis sec. Il tient encore debout par pure rancune.",
    "Un serviteur d’os avance, cimeterre levé. Ses orbites vides semblent chercher une faute dans ta garde.",
    "Un guerrier squelette frappe son bouclier. Le son est creux, mais l’intention ne l’est pas.",
    "Un garde des cryptes surgit de l’ombre. Il porte la patience des morts et la brutalité des vivants.",
    "Un champion d’os entre dans l’arène. Chaque pas laisse sa marque sur le sable de l’arène.",
    "Un vétéran des tombes relève son cimeterre. Il a oublié son nom, mais pas comment tuer."
  ],

  default: [
    "Un adversaire inconnu entre dans l’arène.",
    "Une silhouette s’avance, prête au combat.",
    "Le duel commence à sentir la poussière, le fer et le sang.",
    "L’ennemi prend place. Le silence se resserre.",
    "La foule recule d’un pas. Ton adversaire te fixe sans ciller.",
    "L’adversaire te fixe. Ce combat sera au dernier sang."
  ]
};

function getSoloIntroText(fighterId, level) {
  const texts = soloIntroTexts[fighterId] || soloIntroTexts.default;
  const safeLevel = Math.max(0, Math.min(5, Number(level || 0)));

  return texts[safeLevel] || texts[0];
}

function refreshSoloIntroText() {
  const block = document.getElementById("soloIntroBlock");
  const title = document.getElementById("soloIntroTitle");
  const text = document.getElementById("soloIntroText");

  const modeSelect = document.getElementById("gameMode");
  const opponentSelect = document.getElementById("opponentBook");
  const difficultySelect = document.getElementById("soloDifficultyLevel");

  if (!block || !title || !text || !modeSelect || !opponentSelect) return;

  const isSolo = modeSelect.value === "solo";

  block.style.display = isSolo ? "block" : "none";

  if (!isSolo) return;

  const opponentId = opponentSelect.value || "default";
  const level = difficultySelect ? Number(difficultySelect.value || 0) : 0;

  title.textContent =
    getSoloDifficultyTitle(opponentId, level) +
    " — " +
    (opponentId === "squelette" ? "Squelette" : "Chevalier");

  text.textContent = getSoloIntroText(opponentId, level);
}

function getSoloDifficultyTitle(fighterId, level) {
  const titles = soloDifficultyTitles[fighterId] || soloDifficultyTitles.default;
  return titles[level] || titles[0];
}

function getSoloDifficultyLevel() {
  const select = document.getElementById("soloDifficultyLevel");
  if (!select) return 0;

  const value = Number(select.value || 0);
  return Math.max(0, Math.min(5, value));
}

function getSoloEffectiveDamageBonus() {
  if (gameMode !== "solo") return 0;

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const playerLevel = getCurrentPlayerLevel();

  return Math.max(0, opponentLevel - playerLevel);
}

function getSoloDifficultyTargetBody(baseBody) {
  const base = Number(baseBody || 0);

  if (gameMode !== "solo") return base;

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const playerLevel = getCurrentPlayerLevel();
  const opponentId = currentOpponentFighter ? currentOpponentFighter.id : "default";

  // Courbe spéciale pour le squelette solo : il progresse, mais son niveau 1
  // n'est plus un mur de pierre pour un chevalier niveau 1.
  if (opponentId === "squelette") {
    const skeletonBodyByLevel = [8, 12, 16, 24, 32, 40];
    return skeletonBodyByLevel[opponentLevel] !== undefined
      ? skeletonBodyByLevel[opponentLevel]
      : skeletonBodyByLevel[skeletonBodyByLevel.length - 1];
  }

  // Pour les autres adversaires, le bonus de PV ne s'applique que si
  // l'adversaire est au-dessus du niveau du PJ.
  const levelGap = Math.max(0, opponentLevel - playerLevel);
  return base + levelGap * 8;
}

function getSoloDifficultyBodyBonus(baseBody) {
  if (gameMode !== "solo") return 0;

  const base = Number(baseBody || 0);
  const target = getSoloDifficultyTargetBody(base);

  return Math.max(0, target - base);
}


function setGameMode(mode) {
  const select = document.getElementById("gameMode");

  if (!select) return;

  select.value = mode;

  updateGameModeButtons();
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
}

function updateGameModeButtons() {
  const select = document.getElementById("gameMode");
  const duoButton = document.getElementById("gameModeDuoButton");
  const soloButton = document.getElementById("gameModeSoloButton");

  if (!select) return;

  const mode = select.value || "duel";

  if (duoButton) {
    duoButton.classList.toggle("active", mode === "duel");
  }

  if (soloButton) {
    soloButton.classList.toggle("active", mode === "solo");
  }
}

function setOpponentBook(fighterId) {
  const select = document.getElementById("opponentBook");

  if (!select) return;

  select.value = fighterId;

  updateOpponentBookButtons();
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
  refreshSetupSelectionDisplays();
}

function updateOpponentBookButtons() {
  const select = document.getElementById("opponentBook");
  const chevalierButton = document.getElementById("opponentBookChevalierButton");
  const squeletteButton = document.getElementById("opponentBookSqueletteButton");

  if (!select) return;

  const value = select.value || "chevalier";

  if (chevalierButton) {
    chevalierButton.classList.toggle("active", value === "chevalier");
  }

  if (squeletteButton) {
    squeletteButton.classList.toggle("active", value === "squelette");
  }
}

function refreshSoloDifficultyOptions() {
  const block = document.getElementById("soloDifficultyBlock");
  const select = document.getElementById("soloDifficultyLevel");
  const hint = document.getElementById("soloDifficultyHint");
  const modeSelect = document.getElementById("gameMode");
  const opponentSelect = document.getElementById("opponentBook");

  if (!block || !select) return;

  const isSolo = modeSelect && modeSelect.value === "solo";
  block.style.display = isSolo ? "block" : "none";

  const opponentId = opponentSelect ? opponentSelect.value : "default";
  const oldValue = String(select.value || "0");

  select.innerHTML = "";

  for (let level = 0; level <= 5; level++) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent =
      "+" +
      level +
      " — " +
      getSoloDifficultyTitle(opponentId, level);

    select.appendChild(option);
  }

  select.value = oldValue;

  if (!select.value) {
    select.value = "0";
  }

  if (hint) {
    const level = Number(select.value || 0);

    const playerLevel = getCurrentPlayerLevel();
    const damageBonus = Math.max(0, level - playerLevel);
    const bodyText = opponentId === "squelette"
      ? "PV squelette : " + ([8, 12, 16, 24, 32, 40][level] || 40)
      : "PV bonus selon écart de niveau";

    hint.textContent =
      getSoloDifficultyTitle(opponentId, level) +
      " : bonus dégâts +" +
      damageBonus +
      " | " +
      bodyText +
      ".";
  }

  refreshSoloIntroText();
  updateOpponentBookButtons();
  refreshSetupSelectionDisplays();
}

function getSoloOpponentActions() {
  if (!currentOpponentFighter) return [];

  const distanceModeElement = document.getElementById("distanceMode");
  const distanceMode = distanceModeElement ? distanceModeElement.value : "normal";

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

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const opponentId = currentOpponentFighter.id;

  function isUsableAction(action) {
    return (
      action &&
      action.available &&
      action.pg !== undefined &&
      action.pg !== null &&
      actionAllowedByRestriction(action, soloOpponentRestriction)
    );
  }

  let availableActions = actions.filter(function(action) {
    return (
      isUsableAction(action) &&
      isActionUnlockedForFighter(action, opponentId, opponentLevel)
    );
  });

  if (availableActions.length > 0) {
    return availableActions;
  }

  // Sécurité anti-blocage solo :
  // si l’adversaire est forcé en marron / distance et n’a aucune action
  // débloquée, on lui donne une action de survie pour éviter le tour impossible.
  if (
    soloOpponentRestriction === "only_brown" ||
    soloOpponentRestriction === "only_distance" ||
    distanceMode === "distance"
  ) {
    const safetyNames = [
      "Bond en arrière",
      "Bond esquive",
      "Esquive",
      "Bloque et approche"
    ];

    availableActions = actions.filter(function(action) {
      if (!isUsableAction(action)) return false;

      return safetyNames.some(function(name) {
        return actionMatchesUnlockName(action, name);
      });
    });

    if (availableActions.length > 0) {
      return availableActions;
    }

    // Dernier filet : toute action marron légale du livret adverse.
    availableActions = actions.filter(function(action) {
      return isUsableAction(action) && action.color === "marron";
    });

    if (availableActions.length > 0) {
      return availableActions;
    }
  }

  return [];
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
      if (color === "orange" || color === "rouge") score += 10;
    }

    if (opponentRatio <= 0.35) {
      if (color === "orange" || color === "rouge") score *= 1.35;
      if (text.includes("esquive") || text.includes("bond en arriere")) score *= 0.6;
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

    if (text.includes("charge")) score += distanceMode === "distance" ? 14 : 2;
    if (text.includes("bloque")) score += distanceMode === "distance" ? 10 : 4;

    if (text.includes("esquive")) score += 3;
    if (text.includes("bond esquive")) score += 4;
    if (text.includes("bond en arriere")) score *= 0.85;
    if (text.includes("recuperer")) score *= 0.45;

    if (distanceMode === "distance") {
      if (text.includes("charge")) score *= 1.35;
      if (text.includes("bloque")) score *= 1.25;
      if (text.includes("esquive")) score *= 0.75;
    }

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

    if (opponentRatio <= 0.35) {
      if (text.includes("attaque protegee")) score *= 1.45;
      if (text.includes("coup de bouclier")) score *= 1.35;
      if (text.includes("esquive")) score *= 1.25;
      if (text.includes("bond esquive")) score *= 1.2;
      if (color === "orange" || color === "rouge") score *= 0.8;
    }

    if (opponentRatio >= 0.65 && playerRatio >= 0.5) {
      if (text.includes("attaque protegee")) score += 5;
      if (text.includes("estoc")) score += 4;
      if (text.includes("coup lateral")) score += 4;
    }

    return Math.max(1, score);
  }

  if (text.includes("attaque protegee")) score += 6;
  if (text.includes("coup lateral")) score += 5;
  if (text.includes("estoc")) score += 5;
  if (text.includes("charge") && distanceMode === "distance") score += 8;
  if (text.includes("esquive")) score *= 0.8;
  if (text.includes("recuperer")) score *= 0.5;

  if (playerRatio <= 0.35 && isClearlyOffensiveAction(action)) score *= 1.25;
  if (opponentRatio <= 0.35) {
    if (text.includes("attaque protegee") || text.includes("esquive")) score *= 1.25;
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
  const difficultyTitle = getSoloDifficultyTitle(
    currentOpponentFighter ? currentOpponentFighter.id : "default",
    soloDifficultyLevel
  );

  text.textContent =
    personality.name +
    " : " +
    difficultyTitle +
    " | dégâts +" +
    getSoloEffectiveDamageBonus() +
    " : " +
    actionLabel(action) +
    " | PG " +
    action.pg +
    " | " +
    action.color;

  panel.style.display = "block";
}

function calculateOpponentDamage(page, action) {
  const detail = getOpponentDamageDetail(page, action);

  if (!detail) {
    return null;
  }

  return detail.total;
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
  const damageDetail = getOpponentDamageDetail(page, soloOpponentAction);

  return {
    pageNumber: resultPageNumber,
    page: page,
    damage: damage,
    damageDetail: damageDetail
  };
}

function buildSoloOpponentResultHtml(soloResult) {
  // IMPORTANT : en mode solo, on n'affiche PAS une seconde image.
  // L'image visible doit rester celle du livret de l'adversaire choisi.
  // La riposte solo est affichée seulement si on clique sur "Dégâts reçus".
  if (!soloResult) return "";

  if (soloResult.error) {
    return buildDamageToggleHtml(
      "Dégâts reçus",
      "Erreur",
      '<div class="instruction-card solo-result-card">' +
        "<strong>Riposte adverse</strong><br>" +
        escapeHtml(soloResult.error).replace(/\n/g, "<br>") +
      "</div>",
      "damage-toggle-danger"
    );
  }

  let damageValue = "";

  if (soloResult.damage === null) {
    damageValue = "Aucun SCORE";
  } else {
    damageValue = String(soloResult.damage);
  }

  let damageText = "";

  if (soloResult.damage === null) {
    damageText = "Aucun SCORE contre toi.";
  } else if (soloResult.damage <= 0) {
    damageText = "L’adversaire obtient un SCORE, mais ne te fait aucun dégât.";
  } else {
    damageText = "L’adversaire te fait " + soloResult.damage + " dégât(s).";
  }

  const nextInstruction =
    soloResult.page.instruction || "Aucune restriction particulière.";

  const difficultyTitle = getSoloDifficultyTitle(
    currentOpponentFighter ? currentOpponentFighter.id : "default",
    soloDifficultyLevel
  );

  const detailHtml =
    '<div class="instruction-card solo-result-card">' +
    "<strong>Riposte adverse</strong><br>" +
    "Action adverse : " +
    escapeHtml(actionLabel(soloOpponentAction)) +
    "<br>" +
    "Niveau solo : " +
    escapeHtml(difficultyTitle) +
    " (bonus dégâts +" +
    getSoloEffectiveDamageBonus() +
    ", PV adverses " +
    opponentMaxBody +
    ")" +
    "<br>" +
    "Restriction appliquée à l’adversaire solo : " +
    escapeHtml(getRestrictionInfo(soloOpponentRestriction).label) +
    "<br><br>" +
    buildDamageFormulaHtml(soloResult.damageDetail) +
    '<div class="score-detail">' +
    escapeHtml(damageText) +
    "</div>" +
    "<br>" +
    "<strong>Restriction à appliquer à ton prochain tour</strong><br>" +
    escapeHtml(nextInstruction) +
    "</div>";

  return buildDamageToggleHtml(
    "Dégâts reçus",
    damageValue,
    detailHtml,
    soloResult.damage === null ? "no-damage" : ""
  );
}

/* ============================================================
   TOUR / RÉSOLUTION
   ============================================================ */

function chooseAction() {
  const actionSelect = document.getElementById("actionChoice");
  if (!actionSelect) return;

  const actionId = actionSelect.value;

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

  const enemyPgInput = document.getElementById("enemyPg");
  const pgToAnnounce = document.getElementById("pgToAnnounce");

  if (enemyPgInput) enemyPgInput.value = "";
  if (pgToAnnounce) pgToAnnounce.textContent = getPgDisplayForAction(selectedAction, null);

  if (gameMode === "solo") {
    const opponentAction = pickSoloOpponentAction();

    if (!opponentAction) {
      appAlert("Aucune action adverse disponible pour le mode solo.", "Mode solo");
      return;
    }

    if (enemyPgInput) enemyPgInput.value = opponentAction.pg;
    if (pgToAnnounce) pgToAnnounce.textContent = getPgDisplayForAction(selectedAction, opponentAction.pg);

    updateSoloOpponentDisplay(opponentAction);
  } else {
    updateSoloOpponentDisplay(null);
  }

  document.getElementById("pgPanel").style.display = "block";
  document.getElementById("resultPanel").style.display = "none";
}

function calculateTemporaryBonus(page, action) {
  const temporaryBonusSelect = document.getElementById("temporaryBonus");
  const bonusMode = temporaryBonusSelect ? temporaryBonusSelect.value : "none";

  if (page.score === null || page.score === undefined) return 0;

  const color = action.color || "";
  const category = action.category || "";
  const name = action.name || "";
  const label = (category + " " + name).toLowerCase();

  switch (bonusMode) {
    case "score_any": return 2;
    case "score_blue": return color === "bleu" ? 2 : 0;
    case "score_orange": return color === "orange" ? 2 : 0;
    case "score_plunge_or_lateral":
      return label.includes("coup plongeant") || label.includes("coup latéral") ? 2 : 0;
    default: return 0;
  }
}

/* ============================================================
   RESULTATS LIMPIDES - DETAILS DES CALCULS
   ============================================================ */

function formatSignedNumber(value) {
  const number = Number(value || 0);

  if (number > 0) {
    return "+" + number;
  }

  return String(number);
}

function getSizeDamageModifierForAction(action, perspective) {
  if (!action) return 0;

  if (action.color !== "orange" && action.color !== "rouge") {
    return 0;
  }

  if (perspective === "opponent") {
    return -sizeModifier;
  }

  return sizeModifier;
}

function getPlayerDamageDetail(page, action) {
  if (!page || page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score || 0);
  const mod = Number(action.mod || 0);
  const actionBonus = Number(action.bonus || 0);
  const evolutionBonus = getActionUpgradeBonus(action);
  const temporaryBonus = calculateTemporaryBonus(page, action);
  const sizeBonus = getSizeDamageModifierForAction(action, "player");

  const rawTotal =
    score +
    mod +
    actionBonus +
    evolutionBonus +
    temporaryBonus +
    sizeBonus;

  return {
    label: "Ton calcul",
    score: score,
    mod: mod,
    actionBonus: actionBonus,
    evolutionBonus: evolutionBonus,
    temporaryBonus: temporaryBonus,
    difficultyBonus: 0,
    sizeBonus: sizeBonus,
    rawTotal: rawTotal,
    total: Math.max(0, rawTotal)
  };
}

function getOpponentDamageDetail(page, action) {
  if (!page || page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score || 0);
  const mod = Number(action.mod || 0);
  const actionBonus = Number(action.bonus || 0);
  const difficultyBonus = getSoloEffectiveDamageBonus();
  const sizeBonus = getSizeDamageModifierForAction(action, "opponent");

  const rawTotal =
    score +
    mod +
    actionBonus +
    difficultyBonus +
    sizeBonus;

  return {
    label: "Calcul adverse",
    score: score,
    mod: mod,
    actionBonus: actionBonus,
    evolutionBonus: 0,
    temporaryBonus: 0,
    difficultyBonus: difficultyBonus,
    sizeBonus: sizeBonus,
    rawTotal: rawTotal,
    total: Math.max(0, rawTotal)
  };
}

function buildDamageFormulaHtml(detail) {
  if (!detail) return "";

  const parts = [
    "SCORE " + detail.score,
    "MOD " + formatSignedNumber(detail.mod)
  ];

  if (detail.actionBonus !== 0) {
    parts.push("bonus action " + formatSignedNumber(detail.actionBonus));
  }

  if (detail.evolutionBonus !== 0) {
    parts.push("évolution " + formatSignedNumber(detail.evolutionBonus));
  }

  if (detail.temporaryBonus !== 0) {
    parts.push("bonus temporaire " + formatSignedNumber(detail.temporaryBonus));
  }

  if (detail.difficultyBonus !== 0) {
    parts.push("difficulté " + formatSignedNumber(detail.difficultyBonus));
  }

  if (detail.sizeBonus !== 0) {
    parts.push("taille " + formatSignedNumber(detail.sizeBonus));
  }

  let totalText = String(detail.total);

  if (detail.rawTotal !== detail.total) {
    totalText = detail.rawTotal + ", ramené à " + detail.total;
  }

  return (
    '<div class="score-detail score-detail-clear">' +
    "<strong>" +
    detail.label +
    " :</strong> " +
    parts.join(" + ") +
    " = " +
    totalText +
    "</div>"
  );
}


function toggleDamageDetails(button) {
  if (!button) return;

  const wrapper = button.closest(".damage-toggle-wrapper");
  if (!wrapper) return;

  const detail = wrapper.querySelector(".damage-detail-collapsible");
  if (!detail) return;

  const isOpen = detail.style.display === "block";

  detail.style.display = isOpen ? "none" : "block";
  button.classList.toggle("damage-toggle-open", !isOpen);

  const hint = button.querySelector(".damage-toggle-hint");
  if (hint) {
    hint.textContent = isOpen ? "Afficher le détail" : "Masquer le détail";
  }
}

function buildDamageToggleHtml(title, value, detailHtml, cssClass) {
  const safeCssClass = cssClass || "";

  return (
    '<div class="damage-toggle-wrapper">' +
    '<button type="button" class="damage-pill damage-toggle-button ' +
    safeCssClass +
    '" onclick="toggleDamageDetails(this)">' +
    "<span>" +
    escapeHtml(title || "Dégâts") +
    "</span>" +
    "<strong>" +
    escapeHtml(value) +
    "</strong>" +
    '<em class="damage-toggle-hint">Afficher le détail</em>' +
    "</button>" +
    '<div class="damage-detail-collapsible" style="display:none;">' +
    (detailHtml || "") +
    "</div>" +
    "</div>"
  );
}

function calculateDamage(page, action) {
  const detail = getPlayerDamageDetail(page, action);

  if (!detail) {
    return null;
  }

  return detail.total;
}

function hasDaValue(action) {
  return (
    action &&
    action.da !== undefined &&
    action.da !== null &&
    action.da !== ""
  );
}

function isDistancePg(pg) {
  const value = Number(pg);
  return value >= 50;
}

function getMovementPageForAction(action, enemyPg) {
  if (!action) return "";

  const actionPg = String(action.pg);

  // Si l'action choisie est déjà une action de Distance Accrue,
  // comme PG 58, on garde son PG normal.
  if (isDistancePg(actionPg)) {
    return actionPg;
  }

  // Si l'adversaire utilise un PG de distance,
  // une action rapprochée utilise sa valeur DA.
  if (isDistancePg(enemyPg) && hasDaValue(action)) {
    return String(action.da);
  }

  return actionPg;
}

function getPgDisplayForAction(action, enemyPg) {
  if (!action) return "-";

  const normalPg = String(action.pg);

  // Une action déjà en PG 50+ reste affichée telle quelle.
  if (isDistancePg(normalPg)) {
    return normalPg;
  }

  if (isDistancePg(enemyPg) && hasDaValue(action)) {
    return String(action.da) + " (DA, depuis " + normalPg + ")";
  }

  if (hasDaValue(action)) {
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


function getPageImageSources(book, pageNumber) {
  if (!book || !pageNumber) return [];

  const bookId = book.id || book.fighterId || "";
  const rawPage = String(pageNumber);
  const page = getBookPage(book, pageNumber);
  const sources = [];

  if (page && page.image) {
    sources.push(page.image);
  }

  if (bookId) {
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage + ".png"
    );
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage.padStart(2, "0") + ".png"
    );
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage.padStart(3, "0") + ".png"
    );
  }

  return sources.filter(function(source, index) {
    return source && sources.indexOf(source) === index;
  });
}

function addCacheBusterToImage(src) {
  if (!src) return src;

  const separator = src.includes("?") ? "&" : "?";
  return src + separator + "v=" + Date.now();
}

function tryNextPageImage(image) {
  if (!image) return;

  let sources = [];

  try {
    sources = JSON.parse(image.dataset.fallbackSources || "[]");
  } catch (error) {
    sources = [];
  }

  const nextIndex = Number(image.dataset.fallbackIndex || 0) + 1;

  if (nextIndex < sources.length) {
    image.dataset.fallbackIndex = String(nextIndex);
    image.src = sources[nextIndex];
    return;
  }

  if (image.parentElement) {
    image.parentElement.style.display = "none";
  }
}

function buildPageImageHtml(book, pageNumber, label) {
  const sources = getPageImageSources(book, pageNumber).map(function(source) {
    return addCacheBusterToImage(source);
  });

  if (sources.length === 0) return "";

  const safeLabel = escapeHtml(label || "Page résultat");
  const safePage = escapeHtml(pageNumber);
  const encodedSources = escapeHtml(JSON.stringify(sources));

  return (
    '<div class="page-image-box image-priority-box">' +
    '<img class="page-image priority-image" src="' +
    escapeHtml(sources[0]) +
    '" alt="' +
    safeLabel +
    ' ' +
    safePage +
    '" data-fallback-index="0" data-fallback-sources="' +
    encodedSources +
    '" onclick="openImageOverlay(this.src)" onerror="tryNextPageImage(this)">' +
    '<button type="button" class="image-zoom-button" onclick="openImageOverlay(this.parentElement.querySelector(\'img\').src)">Agrandir l’image</button>' +
        '</div>'
  );
}

function resolveTurn() {
  const enemyPgInput = document.getElementById("enemyPg");
  const enemyPg = enemyPgInput ? enemyPgInput.value : "";

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
    appAlert("Aucune table de mouvement trouvée pour ton PG : " + myMovementPage, "Table introuvable");
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

  pendingOpponentInstruction = page.instruction || "Aucune instruction particulière.";

  const damage = calculateDamage(page, selectedAction);
  const soloOpponentResult = resolveSoloOpponentAttack();

  if (
    gameMode === "solo" &&
    soloOpponentResult &&
    !soloOpponentResult.error &&
    soloOpponentResult.page
  ) {
    pendingPlayerInstruction = soloOpponentResult.page.instruction || "Aucune restriction particulière.";
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

    addCombatLogEntry("Tour " + currentTurnNumber + " - Résolution", logLines, "turn");
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
    showPlayerDamageFeedback(soloOpponentResult.damage);
    playSfx("hit");
    saveCurrentDuelState();
  }

  lastDamage = damage;
  damageAlreadyApplied = false;

  const playerDamageDetail = getPlayerDamageDetail(page, selectedAction);

  let damageHtml = "";

  if (!playerDamageDetail) {
    damageHtml = buildDamageToggleHtml(
      "Dégâts infligés",
      "Aucun SCORE",
      '<div class="score-detail score-detail-clear">' +
        "Cette page ne donne aucun SCORE : aucun dégât à appliquer." +
      "</div>",
      "no-damage"
    );
  } else {
    damageHtml = buildDamageToggleHtml(
      "Dégâts infligés",
      String(damage),
      buildDamageFormulaHtml(playerDamageDetail),
      ""
    );
  }

  const imageHtml = buildPageImageHtml(currentBook, resultPageNumber, "Résultat");

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
    (gameMode === "solo" ? "Restriction donnée à l’adversaire solo" : "Instruction à lire à l’adversaire") +
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
    status.innerHTML = '<span class="danger">Ces dégâts ont déjà été appliqués.</span>';
    return;
  }

  opponentCurrentBody -= Number(lastDamage);
  damageAlreadyApplied = true;

  addCombatLogEntry(
    "Tour " + currentTurnNumber + " - Dégâts",
    [
      lastDamage + " dégât(s) appliqué(s) à l’adversaire.",
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
    status.innerHTML = '<span class="success">Aucun dégât. PV adverses inchangés.</span>';
  } else {
    status.innerHTML = '<span class="success">' + lastDamage + " dégât(s) appliqué(s) à l’adversaire.</span>";
  }
}

function nextTurn() {
  selectedAction = null;
  lastDamage = null;
  damageAlreadyApplied = false;
  currentTurnNumber += 1;

  const enemyPgInput = document.getElementById("enemyPg");
  if (enemyPgInput) enemyPgInput.value = "";

  soloOpponentAction = null;
  updateSoloOpponentDisplay(null);

  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("resultText").innerHTML = "";
  document.getElementById("nextTurnButton").style.display = "none";
  document.getElementById("turnPanel").style.display = "block";

  const bodyStatus = document.getElementById("bodyStatus");
  if (bodyStatus) bodyStatus.textContent = "";

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
    if (panelLabel) panelLabel.textContent = "Restrictions du prochain tour";

    document.getElementById("opponentInstructionText").textContent =
      "Vous : " + playerInfo.label + " | Adversaire solo : " + opponentInfo.label;

    document.getElementById("opponentInstructionPanel").style.display = "block";
  } else if (pendingOpponentInstruction) {
    const panelLabel = document.querySelector("#opponentInstructionPanel span");
    if (panelLabel) panelLabel.textContent = "Instruction à donner à l’adversaire";

    document.getElementById("opponentInstructionText").textContent = pendingOpponentInstruction;
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
   FUITE / NOUVEAU DUEL / RÈGLES
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
  if (fleeButton) fleeButton.style.display = "none";
}

async function newDuel() {
  const confirmed = await appConfirm(
    "Commencer un nouveau duel ?\n\nLes PV du duel en cours seront réinitialisés.",
    "Nouveau duel"
  );

  if (!confirmed) return;

  stopCombatMusic();
  clearCurrentDuelState();

  combatLog = [];
  lastResolutionLogKey = "";
  renderCombatLog();

  const combatLogPanel = document.getElementById("combatLogPanel");
  if (combatLogPanel) combatLogPanel.style.display = "none";

  const combatLogButton = document.getElementById("combatLogButton");
  if (combatLogButton) combatLogButton.classList.remove("active");

  currentFighter = null;
  currentOpponentFighter = null;
  currentBook = null;
  currentPlayerBook = null;
  currentActions = [];
  selectedAction = null;
  gameMode = "duel";
  soloOpponentAction = null;
  soloOpponentRestriction = "none";
  soloDifficultyLevel = 0;

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
  if (fixedHpBar) fixedHpBar.style.display = "none";

  const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
  if (duelCharacterSheetButton) duelCharacterSheetButton.style.display = "none";

  const hpTools = document.getElementById("hpTools");
  if (hpTools) hpTools.style.display = "none";

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
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
  updateGameModeButtons();
  refreshSetupSelectionDisplays();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openRulesPage() {
  window.open("regles.html", "_blank");
}

initApp();const APP_VERSION = "1.0.2-solo-balance";

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
let soloDifficultyLevel = 0;

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

const currentDuelSaveKey = "lw_current_duel_state";
const charactersIndexKey = "lw_saved_characters_index";
const lastCharacterKey = "lw_last_character_id";
const resumeDuelAfterSheetKey = "lw_resume_duel_after_sheet";

let duelFinished = false;
let victoryXpAwarded = false;
let currentTurnNumber = 1;
let currentVictories = 0;

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

/* ============================================================
   OUTILS JSON / CATALOGUE
   ============================================================ */

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

function ensureSetupSelectorsVisible() {
  const selectors = [
    document.getElementById("playerSheet"),
    document.getElementById("opponentBook")
  ];

  selectors.forEach(function(select) {
    if (!select) return;

    select.classList.remove("hidden-action-select");
    select.classList.remove("hidden-game-mode-select");
    select.style.display = "";
  });
}

function refreshSetupSelectionDisplays() {
  const playerSelect = document.getElementById("playerSheet");
  const opponentSelect = document.getElementById("opponentBook");

  const playerEntry = playerSelect ? findCatalogEntry(playerSelect.value) : null;
  const opponentEntry = opponentSelect ? findCatalogEntry(opponentSelect.value) : null;

  const playerLabels = [
    document.getElementById("currentSheet"),
    document.getElementById("selectedPlayerSheet"),
    document.getElementById("playerSheetDisplay")
  ];

  const opponentLabels = [
    document.getElementById("currentBook"),
    document.getElementById("selectedOpponentBook"),
    document.getElementById("opponentBookDisplay"),
    document.getElementById("bookChoiceDisplay")
  ];

  playerLabels.forEach(function(element) {
    if (!element || !playerEntry) return;
    element.textContent = playerEntry.fullName || playerEntry.shortName || playerEntry.id;
  });

  opponentLabels.forEach(function(element) {
    if (!element || !opponentEntry) return;
    element.textContent = opponentEntry.fullName || opponentEntry.shortName || opponentEntry.id;
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
    .replace(/\"/g, "&quot;")
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
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.warn("Index PJ invalide :", parsed);
      return [];
    }

    return parsed.filter(function(character) {
      return (
        character &&
        character.id &&
        character.fighterId &&
        character.name
      );
    });
  } catch (error) {
    console.error("Index PJ illisible :", error, raw);
    return [];
  }
}

function saveSavedCharacters(characters) {
  localStorage.setItem(charactersIndexKey, JSON.stringify(characters));
}

function refreshSavedCharactersSelect() {
  const select = document.getElementById("savedCharacterSelect");
  const newButton = document.getElementById("newCharacterButton");
  const deleteButton = document.getElementById("deleteCharacterButton");
  const creationFields = document.getElementById("characterCreationFields");
  const sheetButton = document.getElementById("characterSheetButton");

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
    if (sheetButton) sheetButton.style.display = "none";
    if (creationFields) creationFields.style.display = "block";

    const playerNameInput = document.getElementById("playerName");
    if (playerNameInput) playerNameInput.value = "";

    currentPlayerName = "";
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
    currentVictories = 0;
    currentProfileKey = "";

    updateExperienceDisplay();

    return;
  }

  if (newButton) newButton.style.display = "inline-block";
  if (deleteButton) deleteButton.style.display = "block";
  if (sheetButton) sheetButton.style.display = "inline-block";
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
      " XP utilisées" +
      " — " +
      Number(character.victories || 0) +
      " victoire(s)";

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
  const fighterSelect = document.getElementById("playerSheet");
  const nameInput = document.getElementById("playerName");

  if (!fighterSelect || !nameInput) return null;

  const fighterId = fighterSelect.value;
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
    spentExperience: currentSpentExperience || 0,
    victories: currentVictories || 0,
    level: getCurrentPlayerLevel()
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

  const sheetButton = document.getElementById("characterSheetButton");
  if (sheetButton) {
    sheetButton.style.display = "inline-block";
  }

  currentPlayerName = character.name;
  loadPlayerProfile(character.fighterId, character.name);
  updateEvolutionPanel();
}

function openCharacterSheetPage() {
  if (currentFighter && currentOpponentFighter) {
    saveCurrentDuelState();
  }

  let characterId = "";

  if (currentFighter && currentPlayerName) {
    characterId = makeCharacterId(currentFighter.id, currentPlayerName);
  } else {
    const select = document.getElementById("savedCharacterSelect");

    if (select && select.value) {
      characterId = select.value;
    } else {
      characterId = localStorage.getItem(lastCharacterKey) || "";
    }
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

  if (sheetButton) sheetButton.style.display = "none";
  if (creationFields) creationFields.style.display = "block";
  if (select) select.value = "";
  if (playerNameInput) playerNameInput.value = "";
  if (playerSheetSelect) playerSheetSelect.value = "chevalier";

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentVictories = 0;
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

  if (creationFields) creationFields.style.display = "none";

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
    appAlert("Choisis d’abord un PJ sauvegardé à supprimer.", "PJ à supprimer");
    return;
  }

  const characters = getSavedCharacters();

  const character = characters.find(function(item) {
    return item.id === select.value;
  });

  if (!character) {
    appAlert("PJ introuvable.", "PJ introuvable");
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

  if (!confirmed) return;

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
  if (playerNameInput) playerNameInput.value = "";

  currentPlayerName = "";
  currentExperience = 0;
  currentSpentExperience = 0;
  currentActionBonuses = {};
  currentBodyBonus = 0;
  currentVictories = 0;
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
    const victories = Number(character.victories || 0);

    profile = {
      fighterId: character.fighterId,
      name: character.name,
      experience: character.experience || 0,
      spentExperience: character.spentExperience || 0,
      actionBonuses: {},
      bodyBonus: 0,
      victories: victories,
      level: getPlayerLevelFromVictories(victories)
    };
  }

  profile.victories = getVictoriesCompatibleWithStoredLevel(profile);
  profile.level = getPlayerLevelFromVictories(profile.victories);

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

    const victories = Number(
      importedProfile.victories || importedCharacter.victories || 0
    );

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
      spentExperience: Number(importedProfile.spentExperience || importedCharacter.spentExperience || 0),
      victories: victories,
      level: getPlayerLevelFromVictories(victories)
    };

    const cleanProfile = {
      fighterId: cleanCharacter.fighterId,
      name: cleanCharacter.name,
      experience: cleanCharacter.experience,
      spentExperience: cleanCharacter.spentExperience,
      actionBonuses: importedProfile.actionBonuses || {},
      bodyBonus: Number(importedProfile.bodyBonus || 0),
      victories: cleanCharacter.victories,
      level: cleanCharacter.level
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
    currentVictories = 0;
    updateExperienceDisplay();
    return;
  }

  try {
    const profile = JSON.parse(raw);

    currentExperience = Number(profile.experience || 0);
    currentSpentExperience = Number(profile.spentExperience || 0);
    currentActionBonuses = profile.actionBonuses || {};
    currentVictories = getVictoriesCompatibleWithStoredLevel(profile);
    currentBodyBonus = Number(profile.bodyBonus || 0);

    if (currentFighter) {
      recomputeCurrentBodyBonus();
    }
  } catch (error) {
    currentExperience = 0;
    currentSpentExperience = 0;
    currentActionBonuses = {};
    currentBodyBonus = 0;
    currentVictories = 0;
  }

  updateExperienceDisplay();
}

function savePlayerProfile() {
  if (!currentProfileKey) return;

  const fighterSelect = document.getElementById("playerSheet");

  const fighterId = currentFighter
    ? currentFighter.id
    : fighterSelect
      ? fighterSelect.value
      : "";

  if (!fighterId) return;

  const fighterEntry = findCatalogEntry(fighterId);

  if (currentFighter) {
    recomputeCurrentBodyBonus();
  }

  const profile = {
    fighterId: fighterId,
    name: currentPlayerName,
    experience: currentExperience,
    spentExperience: currentSpentExperience,
    actionBonuses: currentActionBonuses,
    bodyBonus: currentBodyBonus,
    victories: currentVictories,
    level: getCurrentPlayerLevel()
  };

  localStorage.setItem(currentProfileKey, JSON.stringify(profile));

  if (currentPlayerName) {
    saveCharacterToIndex({
      id: makeCharacterId(fighterId, currentPlayerName),
      fighterId: fighterId,
      fighterName: fighterEntry ? fighterEntry.shortName : fighterId,
      name: currentPlayerName,
      experience: currentExperience,
      spentExperience: currentSpentExperience,
      victories: currentVictories,
      level: getCurrentPlayerLevel()
    });
  }
}

function hideDuelXpPanels() {
  const xpPanel = document.getElementById("xpPanel");
  if (xpPanel) xpPanel.style.display = "none";

  document.querySelectorAll(".xp-panel").forEach(function(panel) {
    panel.style.display = "none";
  });
}

function updateExperienceDisplay() {
  const display = document.getElementById("xpDisplay");
  if (display) {
    display.textContent =
      currentExperience + " dispo / " + currentSpentExperience + " utilisées";
  }

  updateEvolutionPanel();
}

/* ============================================================
   ÉVOLUTION DU PERSONNAGE
   ============================================================ */


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
      "Coup plongeant violent",
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

function getVictoriesCompatibleWithStoredLevel(profile) {
  const victories = Number(profile && profile.victories !== undefined ? profile.victories : 0);
  const storedLevel = Number(profile && profile.level !== undefined ? profile.level : 0);
  const computedLevel = getPlayerLevelFromVictories(victories);

  if (storedLevel > computedLevel && playerLevelVictoryThresholds[storedLevel] !== undefined) {
    return playerLevelVictoryThresholds[storedLevel];
  }

  return victories;
}

function getCurrentPlayerLevel() {
  return getPlayerLevelFromVictories(currentVictories);
}

function getCurrentPlayerLevelTitle() {
  return playerLevelTitles[getCurrentPlayerLevel()] || "Novice";
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

  const actionId = normalizeActionUnlockName(action.id);
  const fullLabel = normalizeActionUnlockName(actionLabel(action));
  const simpleName = normalizeActionUnlockName(action.name);
  const categoryName = normalizeActionUnlockName(
    (action.category || "") + " " + (action.name || "")
  );
  const linkedUnlockName = normalizeActionUnlockName(action.unlockName);

  return (
    actionId === wanted ||
    fullLabel === wanted ||
    simpleName === wanted ||
    categoryName === wanted ||
    linkedUnlockName === wanted
  );
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

function isRecoverWeaponAction(action) {
  return normalizeActionUnlockName(actionLabel(action)).includes("recuperer arme");
}

function isActionUnlockedForFighter(action, fighterId, level) {
  if (!action) return false;

  const unlockedNames = getUnlockedActionNamesForLevel(fighterId, level);

  return unlockedNames.some(function(name) {
    return actionMatchesUnlockName(action, name);
  });
}

function isActionUnlockedByLevel(action) {
  if (!currentFighter) return true;

  return isActionUnlockedForFighter(
    action,
    currentFighter.id,
    getCurrentPlayerLevel()
  );
}

function isDistanceModeActive() {
  const distanceModeElement = document.getElementById("distanceMode");
  const mode = distanceModeElement ? distanceModeElement.value : "normal";

  return currentTurnNumber === 1 || mode === "distance";
}

function actionLabel(action) {
  if (action.category) {
    return action.category + " " + action.name;
  }

  return action.name;
}

function getActionUpgradeKey(actionOrId) {
  if (!actionOrId) return "";

  if (typeof actionOrId === "string") {
    return actionOrId;
  }

  // Les actions de Distance Accrue peuvent être liées à une action normale
  // par unlockName. Exemple : Coup latéral haut en mêlée et en DA.
  const sourceName =
    actionOrId.unlockName ||
    actionLabel(actionOrId) ||
    actionOrId.id ||
    "";

  return normalizeActionUnlockName(sourceName).replace(/\s+/g, "_");
}

function getUniqueActionsByUpgradeKey(actions) {
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

    // Si possible, on garde comme action principale celle de mêlée.
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

function getAllUnlockedUniqueActions() {
  return getUniqueActionsByUpgradeKey(getAllUpgradeableActions());
}

function getAllUpgradeableActions() {
  if (!currentFighter) return [];

  const allActions = []
    .concat(currentFighter.actions || [])
    .concat(currentFighter.distanceActions || []);

  return allActions.filter(function(action) {
    if (!action || !action.id || !action.color) return false;

    if (isRecoverWeaponAction(action)) return true;

    return isActionUnlockedByLevel(action);
  });
}

function getActionUpgradeBonus(actionOrId) {
  const key = getActionUpgradeKey(actionOrId);

  if (!key) return 0;

  // Nouvelle sauvegarde par clé canonique.
  if (currentActionBonuses[key] !== undefined) {
    return Number(currentActionBonuses[key] || 0);
  }

  // Compatibilité avec les anciennes sauvegardes par id.
  if (
    actionOrId &&
    typeof actionOrId !== "string" &&
    actionOrId.id &&
    currentActionBonuses[actionOrId.id] !== undefined
  ) {
    return Number(currentActionBonuses[actionOrId.id] || 0);
  }

  return 0;
}

function getEffectiveBodyStart() {
  if (!currentFighter) return 0;

  const baseBody = Number(currentFighter.bodyPointsStart || 0);
  return baseBody + currentBodyBonus;
}

function getNextUpgradeLevel() {
  const uniqueActions = getAllUnlockedUniqueActions();

  if (uniqueActions.length === 0) return 1;

  let minBonus = Infinity;

  uniqueActions.forEach(function(entry) {
    minBonus = Math.min(minBonus, getActionUpgradeBonus(entry.action));
  });

  if (minBonus === Infinity) return 1;

  return minBonus + 1;
}

function getCurrentMaxActionEvolutionLevel() {
  // Exception de confort : au niveau 0, le joueur peut déjà monter
  // ses actions débloquées jusqu’à EVO +1.
  return Math.max(1, getCurrentPlayerLevel());
}

function getActionsAvailableForUpgrade() {
  const uniqueActions = getAllUnlockedUniqueActions();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();

  return uniqueActions.filter(function(entry) {
    const action = entry.action;

    return (
      isActionUnlockedByLevel(action) &&
      getActionUpgradeBonus(action) < maxEvolutionLevel
    );
  });
}

function computeBodyBonusFromColors() {
  const uniqueActions = getAllUnlockedUniqueActions();
  const byColor = {};

  uniqueActions.forEach(function(entry) {
    const action = entry.action;
    if (!action || !action.color) return;

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

function computeTotalBodyBonus() {
  // +1 PV automatique par niveau gagné,
  // puis bonus de couleur selon les actions débloquées et évoluées.
  return getCurrentPlayerLevel() + computeBodyBonusFromColors();
}

function recomputeCurrentBodyBonus() {
  currentBodyBonus = computeTotalBodyBonus();
  return currentBodyBonus;
}

function updateEvolutionPanel() {
  const panel = document.getElementById("evolutionPanel");
  const info = document.getElementById("evolutionInfo");
  const select = document.getElementById("upgradeActionChoice");

  if (!panel || !info || !select || !currentFighter) return;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();
  const playerLevel = getCurrentPlayerLevel();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();
  const availableEntries = getActionsAvailableForUpgrade();

  select.innerHTML = "";

  // Le panneau n’apparaît que si le joueur peut vraiment dépenser des XP.
  if (currentExperience < cost || availableEntries.length === 0) {
    panel.style.display = "none";
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
      action.color +
      ") : EVO +" +
      currentBonus +
      " → +" +
      nextBonus +
      (entry.variants.length > 1 ? " [mêlée + DA]" : "");

    select.appendChild(option);
  });

  info.textContent =
    currentExperience +
    " XP disponibles. Coût : " +
    cost +
    " XP. Niveau PJ : " +
    playerLevel +
    " | EVO max actuelle : +" +
    maxEvolutionLevel +
    (playerLevel === 0 ? " (exception débutant)." : ".");

  select.style.display = "block";
  panel.style.display = "block";
}

function upgradeSelectedAction() {
  const select = document.getElementById("upgradeActionChoice");
  if (!select || !select.value) return;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();

  if (currentExperience < cost) {
    appAlert("Pas assez d’expérience. Il faut au moins " + cost + " XP.", "Évolution impossible");
    return;
  }

  const actionKey = select.value;
  const entry = getActionsAvailableForUpgrade().find(function(item) {
    return item.key === actionKey;
  });

  if (!entry) {
    appAlert("Cette action ne peut pas être améliorée pour le moment.", "Évolution impossible");
    return;
  }

  const currentBonus = getActionUpgradeBonus(entry.action);
  const nextLevel = currentBonus + 1;
  const playerLevel = getCurrentPlayerLevel();
  const maxEvolutionLevel = getCurrentMaxActionEvolutionLevel();

  if (nextLevel > maxEvolutionLevel) {
    appAlert(
      "Cette action ne peut pas dépasser l’EVO max actuelle.\n\nNiveau PJ : " +
        playerLevel +
        "\nEVO max : +" +
        maxEvolutionLevel +
        "\nEVO actuelle : +" +
        currentBonus,
      "Évolution impossible"
    );
    return;
  }

  const oldBodyBonus = currentBodyBonus;

  currentActionBonuses[actionKey] = nextLevel;

  // Nettoyage doux des anciennes sauvegardes par id pour les variantes liées.
  entry.variants.forEach(function(variant) {
    if (variant && variant.id && variant.id !== actionKey) {
      delete currentActionBonuses[variant.id];
    }
  });

  currentExperience -= cost;
  currentSpentExperience += cost;

  recomputeCurrentBodyBonus();

  const bodyIncrease = currentBodyBonus - oldBodyBonus;

  updateExperienceDisplay();
  savePlayerProfile();
  updateEvolutionPanel();

  let message =
    "Action améliorée : EVO +" +
    nextLevel +
    ".\n\nXP dépensée : " +
    cost +
    ".";

  if (entry.variants.length > 1) {
    message +=
      "\n\nCette amélioration s’applique à la version mêlée et à la version Distance Accrue.";
  }

  if (bodyIncrease > 0) {
    message +=
      "\n\nBonus de PV gagné : +" +
      bodyIncrease +
      " PV.";
  }

  appAlert(message, "Évolution du PJ");
}

/* ============================================================
   REPRISE DU DUEL
   ============================================================ */

function getSavedDuelState() {
  const raw = localStorage.getItem(currentDuelSaveKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function shouldResumeDuelAfterSheet() {
  const params = new URLSearchParams(window.location.search);

  return (
    params.get("resume") === "1" ||
    localStorage.getItem(resumeDuelAfterSheetKey) === "1"
  );
}

function applySavedDuelToSetup() {
  const state = getSavedDuelState();

  if (!state || !state.fighterId || !state.opponentId || !state.playerName) {
    return false;
  }

  const playerSheetSelect = document.getElementById("playerSheet");
  const opponentBookSelect = document.getElementById("opponentBook");
  const gameModeSelect = document.getElementById("gameMode");
  const playerNameInput = document.getElementById("playerName");
  const savedCharacterSelect = document.getElementById("savedCharacterSelect");
  const soloDifficultySelect = document.getElementById("soloDifficultyLevel");

  if (playerSheetSelect) playerSheetSelect.value = state.fighterId;
  if (opponentBookSelect) opponentBookSelect.value = state.opponentId;
  if (gameModeSelect) gameModeSelect.value = state.gameMode || "duel";
  if (playerNameInput) playerNameInput.value = state.playerName;

  if (savedCharacterSelect) {
    const characterId = makeCharacterId(state.fighterId, state.playerName);
    savedCharacterSelect.value = characterId;
    localStorage.setItem(lastCharacterKey, characterId);
  }

  if (soloDifficultySelect) {
    soloDifficultySelect.value = String(state.soloDifficultyLevel || 0);
  }

  refreshSoloDifficultyOptions();
  updateGameModeButtons();

  return true;
}

function resumeDuelAfterSheetIfNeeded() {
  if (!shouldResumeDuelAfterSheet()) return;

  localStorage.removeItem(resumeDuelAfterSheetKey);

  const restored = applySavedDuelToSetup();

  if (!restored) {
    appAlert("Aucun duel en cours à reprendre.", "Retour au duel");
    return;
  }

  setTimeout(function() {
    startDuel();
  }, 80);
}

/* ============================================================
   INITIALISATION
   ============================================================ */

async function initApp() {
  const message = document.getElementById("loadMessage");

  document.body.classList.remove("duel-active");

  const fixedHpBar = document.getElementById("fixedHpBar");
  if (fixedHpBar) fixedHpBar.style.display = "none";

  closeActionManualScreen();

  const setupPanel = document.getElementById("setupPanel");
  const duelPanel = document.getElementById("duelPanel");

  if (setupPanel) setupPanel.style.display = "block";
  if (duelPanel) duelPanel.style.display = "none";

  try {
    catalog = await loadJson("data/catalog.json");
  } catch (error) {
    console.error("Erreur chargement catalog.json :", error);
    catalog = fallbackCatalog;

    if (message) {
      message.innerHTML =
        '<span class="error">Catalogue distant non chargé, catalogue de secours utilisé. Version ' +
        APP_VERSION +
        ".</span>";
    }
  }

  fillSelect("playerSheet", catalog.fighters);
  fillSelect("opponentBook", catalog.fighters);

  ensureSetupSelectorsVisible();
  refreshSetupSelectionDisplays();
  updateOpponentBookButtons();

  const gameModeSelect = document.getElementById("gameMode");
  const playerSheetSelect = document.getElementById("playerSheet");
  const opponentBookSelect = document.getElementById("opponentBook");
  const soloDifficultySelect = document.getElementById("soloDifficultyLevel");

  if (gameModeSelect) {
    gameModeSelect.addEventListener("change", function() {
      refreshSoloDifficultyOptions();
      refreshSetupSelectionDisplays();
    });
  }

  if (playerSheetSelect) {
    playerSheetSelect.addEventListener("change", refreshSetupSelectionDisplays);
  }

  if (opponentBookSelect) {
    opponentBookSelect.addEventListener("change", function() {
      updateOpponentBookButtons();
      refreshSoloDifficultyOptions();
      refreshSetupSelectionDisplays();
    });
  }

  if (soloDifficultySelect) {
    soloDifficultySelect.addEventListener("change", refreshSoloDifficultyOptions);
  }

  refreshSoloDifficultyOptions();
  refreshSoloIntroText();

  if (message && catalog !== fallbackCatalog) {
    message.textContent =
      "Catalogue chargé : " +
      catalog.fighters.length +
      " combattants disponibles. Version " +
      APP_VERSION;
  }

  try {
    refreshSavedCharactersSelect();
  } catch (error) {
    console.error("Erreur chargement PJ sauvegardés :", error);

    if (message) {
      message.innerHTML =
        '<span class="error">Catalogue chargé, mais erreur avec les PJ sauvegardés. Version ' +
        APP_VERSION +
        ".</span>";
    }
  }

  updateAudioButtons();
  updateActionManualToggleButton();
  resumeDuelAfterSheetIfNeeded();
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

    gameMode: gameMode,
    soloDifficultyLevel:
      typeof soloDifficultyLevel !== "undefined"
        ? Number(soloDifficultyLevel || 0)
        : 0,
    soloOpponentRestriction: soloOpponentRestriction || "none",
    pendingOpponentInstruction: pendingOpponentInstruction || "",
    pendingPlayerInstruction: pendingPlayerInstruction || "",

    combatLog: combatLog,

    duelFinished: duelFinished,
    victoryXpAwarded: victoryXpAwarded,
    turnNumber: currentTurnNumber
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

    if ((state.gameMode || "duel") !== gameMode) {
      return false;
    }

    if (
      gameMode === "solo" &&
      Number(state.soloDifficultyLevel || 0) !== Number(soloDifficultyLevel || 0)
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

    gameMode = state.gameMode || gameMode || "duel";
    soloOpponentRestriction = state.soloOpponentRestriction || "none";
    pendingOpponentInstruction = state.pendingOpponentInstruction || "";
    pendingPlayerInstruction = state.pendingPlayerInstruction || "";
    soloDifficultyLevel = Number(state.soloDifficultyLevel || 0);

    combatLog = Array.isArray(state.combatLog) ? state.combatLog : [];
    lastResolutionLogKey = "";
    renderCombatLog();

    return true;
  } catch (error) {
    console.error("Duel sauvegardé illisible :", error);
    return false;
  }
}

function clearCurrentDuelState() {
  localStorage.removeItem(currentDuelSaveKey);
}

/* ============================================================
   FIN DE COMBAT
   ============================================================ */

function hasAvailableXpUpgrade() {
  if (!currentFighter) return false;

  recomputeCurrentBodyBonus();

  const cost = getEffectiveBodyStart();

  return (
    currentExperience >= cost &&
    getActionsAvailableForUpgrade().length > 0
  );
}

function focusEvolutionPanel() {
  updateEvolutionPanel();

  const panel = document.getElementById("evolutionPanel");

  if (!panel || panel.style.display === "none") {
    appAlert(
      "Aucune dépense d’XP disponible pour l’instant.",
      "Évolution du PJ"
    );
    return;
  }

  panel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function showEvolutionButtonInCombatEnd() {
  const panel = document.getElementById("combatEndPanel");
  if (!panel) return;

  const oldButton = document.getElementById("combatEndUpgradeButton");
  if (oldButton) oldButton.remove();

  if (!hasAvailableXpUpgrade()) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "combatEndUpgradeButton";
  button.className = "secondary-button combat-end-upgrade-button";
  button.textContent = "Utiliser mes XP";
  button.onclick = focusEvolutionPanel;

  panel.appendChild(button);
}

function showCombatEnd(title, text, cssClass) {
  const panel = document.getElementById("combatEndPanel");
  const titleElement = document.getElementById("combatEndTitle");
  const textElement = document.getElementById("combatEndText");

  if (!panel || !titleElement || !textElement) return;

  const oldUpgradeButton = document.getElementById("combatEndUpgradeButton");
  if (oldUpgradeButton) oldUpgradeButton.remove();

  panel.className = "combat-end-panel " + cssClass;
  titleElement.textContent = title;
  textElement.textContent = text;
  panel.style.display = "block";

  const turnPanel = document.getElementById("turnPanel");
  const pgPanel = document.getElementById("pgPanel");
  const nextTurnButton = document.getElementById("nextTurnButton");
  const fleeButton = document.getElementById("fleeButton");

  if (turnPanel) turnPanel.style.display = "none";
  if (pgPanel) pgPanel.style.display = "none";
  if (nextTurnButton) nextTurnButton.style.display = "none";
  if (fleeButton) fleeButton.style.display = "none";

  stopCombatMusic();
  saveCurrentDuelState();
}

function getOpponentLevelForXpReward() {
  // En solo, le niveau de l’adversaire correspond à la difficulté choisie.
  if (gameMode === "solo") {
    return Number(soloDifficultyLevel || 0);
  }

  // En duel à deux joueurs, on n’a pas encore de vrai niveau adverse chargé.
  // On considère donc le niveau comme équivalent pour ne pas pénaliser.
  return getCurrentPlayerLevel();
}

function getVictoryXpGain() {
  const fullXpGain = Math.max(0, Number(opponentMaxBody || 0));
  const playerLevel = getCurrentPlayerLevel();
  const opponentLevel = getOpponentLevelForXpReward();

  if (opponentLevel < playerLevel) {
    return 1;
  }

  return fullXpGain;
}

function getVictoryXpRewardText() {
  const fullXpGain = Math.max(0, Number(opponentMaxBody || 0));
  const playerLevel = getCurrentPlayerLevel();
  const opponentLevel = getOpponentLevelForXpReward();

  if (opponentLevel < playerLevel) {
    return (
      "Adversaire niveau " +
      opponentLevel +
      " inférieur au PJ niveau " +
      playerLevel +
      " : gain réduit à 1 XP au lieu de " +
      fullXpGain +
      "."
    );
  }

  return "XP gagnée : " + fullXpGain + ".";
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

    const xpGain = getVictoryXpGain();
    const xpRewardText = getVictoryXpRewardText();

    if (!victoryXpAwarded) {
      const oldLevel = getCurrentPlayerLevel();

      currentExperience += xpGain;
      currentVictories += 1;

      const newLevel = getCurrentPlayerLevel();

      if (newLevel > oldLevel) {
        recomputeCurrentBodyBonus();
      }

      victoryXpAwarded = true;

      updateExperienceDisplay();
      savePlayerProfile();

      if (newLevel > oldLevel) {
        appAlert(
          currentPlayerName +
            " passe niveau " +
            newLevel +
            " : " +
            getCurrentPlayerLevelTitle() +
            " !\n\nDe nouvelles actions sont débloquées.",
          "Niveau gagné"
        );
      }
    }

    addCombatLogEntry(
      "Fin du combat - Victoire",
      [
        "L’adversaire est hors combat.",
        currentPlayerName + " gagne " + xpGain + " XP.",
        xpRewardText,
        "XP disponibles : " + currentExperience + ".",
        "Victoires : " + currentVictories + " | Niveau " + getCurrentPlayerLevel() + " - " + getCurrentPlayerLevelTitle() + "."
      ],
      "victory"
    );

    playSfx("victory");

    showCombatEnd(
      "Combat gagné",
      "Victoire ! " + xpGain + " XP ajoutée(s) à " + currentPlayerName + ".\n" + xpRewardText,
      "combat-end-victory"
    );

    updateEvolutionPanel();
    showEvolutionButtonInCombatEnd();

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
   POINTS DE CORPS / PV
   ============================================================ */

function updateBodyDisplays() {
  const myBodyDisplay = document.getElementById("myBodyDisplay");
  const opponentBodyDisplay = document.getElementById("opponentBodyDisplay");
  const fixedMyBody = document.getElementById("fixedMyBody");
  const fixedOpponentBody = document.getElementById("fixedOpponentBody");

  if (myBodyDisplay) myBodyDisplay.textContent = myCurrentBody + " / " + myMaxBody;
  if (opponentBodyDisplay) opponentBodyDisplay.textContent = opponentCurrentBody + " / " + opponentMaxBody;
  if (fixedMyBody) fixedMyBody.textContent = myCurrentBody + " / " + myMaxBody;
  if (fixedOpponentBody) fixedOpponentBody.textContent = opponentCurrentBody + " / " + opponentMaxBody;

  const status = document.getElementById("bodyStatus");
  if (!status) return;

  if (opponentCurrentBody <= -5) {
    status.innerHTML = '<span class="danger">Adversaire à -5 ou moins : mort selon les règles.</span>';
  } else if (opponentCurrentBody < 1) {
    status.innerHTML = '<span class="success">Adversaire sous 1 PV : combat terminé.</span>';
  } else if (myCurrentBody <= -5) {
    status.innerHTML = '<span class="danger">Tu es à -5 ou moins : mort selon les règles.</span>';
  } else if (myCurrentBody < 1) {
    status.innerHTML = '<span class="danger">Tu es sous 1 PV : hors combat.</span>';
  } else {
    status.textContent = "";
  }
}


function showPlayerDamageFeedback(damage) {
  const amount = Number(damage || 0);

  if (amount <= 0) return;

  const fixedBar = document.getElementById("fixedHpBar");
  const playerHpBox = fixedBar
    ? fixedBar.querySelector(".hp-box:first-child")
    : null;

  if (fixedBar) {
    fixedBar.classList.remove("hp-bar-shake");
    void fixedBar.offsetWidth;
    fixedBar.classList.add("hp-bar-shake");
  }

  if (playerHpBox) {
    playerHpBox.classList.remove("hp-damage-flash");
    void playerHpBox.offsetWidth;
    playerHpBox.classList.add("hp-damage-flash");

    const float = document.createElement("div");
    float.className = "damage-float";
    float.textContent = "-" + amount + " PV";

    playerHpBox.appendChild(float);

    setTimeout(function() {
      if (float.parentNode) {
        float.parentNode.removeChild(float);
      }
    }, 1200);
  }

  showDamageAlert(amount);
}

function showDamageAlert(damage) {
  const resultPanel = document.getElementById("resultPanel");
  if (!resultPanel) return;

  const oldAlert = document.getElementById("playerDamageAlert");

  if (oldAlert) {
    oldAlert.remove();
  }

  const alert = document.createElement("div");
  alert.id = "playerDamageAlert";
  alert.className = "damage-alert";
  alert.textContent = "Tu perds " + damage + " PV !";

  resultPanel.prepend(alert);

  setTimeout(function() {
    if (alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }, 2500);
}

function adjustMyBody() {
  const input = document.getElementById("myBodyManual");
  if (!input) return;

  const value = input.value;

  if (value === "") {
    appAlert("Entre ton nouveau total de PV.", "PV");
    return;
  }

  myCurrentBody = Number(value);
  input.value = "";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

function toggleHpTools() {
  const tools = document.getElementById("hpTools");
  if (!tools) return;

  tools.style.display = tools.style.display === "grid" ? "none" : "grid";
}

function adjustMyBodyFromTop() {
  const input = document.getElementById("myBodyManualTop");
  if (!input) return;

  const value = input.value;

  if (value === "") {
    appAlert("Entre ton nouveau total de PV.", "PV");
    return;
  }

  myCurrentBody = Number(value);
  input.value = "";

  const hpTools = document.getElementById("hpTools");
  if (hpTools) hpTools.style.display = "none";

  updateBodyDisplays();
  checkCombatEnd();
  saveCurrentDuelState();
}

/* ============================================================
   ACTIONS / RESTRICTIONS
   ============================================================ */

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
      return category !== "Estoc" && !lowerName.includes("estoc") && color !== "rouge";

    case "no_thrust_blue":
      return category !== "Estoc" && !lowerName.includes("estoc") && color !== "bleu";

    case "no_lateral_red":
      return category !== "Coup latéral" && !lowerName.includes("latéral") && color !== "rouge";

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
        isRecoverWeaponAction(action) ||
        lowerName.includes("coup de pied") ||
        color === "jaune" ||
        color === "vert"
      ) && !lowerName.includes("coup latéral féroce");

    case "shield_broken":
      return category !== "Coup de bouclier" && category !== "Attaque protégée";

    default:
      return true;
  }
}

function updateDistanceButtons() {
  const distanceModeElement = document.getElementById("distanceMode");
  const normalButton = document.getElementById("btnNormalMode");
  const distanceButton = document.getElementById("btnDistanceMode");

  if (!distanceModeElement || !normalButton || !distanceButton) return;

  const mode = distanceModeElement.value;

  if (currentTurnNumber === 1) {
    distanceModeElement.value = "distance";

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
  const distanceModeElement = document.getElementById("distanceMode");
  if (!distanceModeElement) return;

  if (currentTurnNumber === 1 && mode === "normal") {
    appAlert(
      "Le premier tour doit toujours être joué en Distance Accrue.",
      "Premier tour"
    );

    distanceModeElement.value = "distance";
    updateDistanceButtons();
    refreshActionList();
    return;
  }

  distanceModeElement.value = mode;
  updateDistanceButtons();
  refreshActionList();
}

function getActionsForCurrentMode() {
  if (!currentFighter) return [];

  const distanceModeElement = document.getElementById("distanceMode");
  const distanceMode = distanceModeElement ? distanceModeElement.value : "normal";

  if (currentTurnNumber === 1) {
    if (distanceModeElement) distanceModeElement.value = "distance";
    return currentFighter.distanceActions || [];
  }

  if (distanceMode === "distance") {
    return currentFighter.distanceActions || [];
  }

  return currentFighter.actions || [];
}

function getRestrictionInfo(restriction) {
  switch (restriction) {
    case "none": return { label: "Aucune restriction", css: "restriction-none" };
    case "no_blue": return { label: "Pas de Bleu", css: "restriction-blue" };
    case "no_red": return { label: "Pas de Rouge", css: "restriction-red" };
    case "no_orange": return { label: "Pas d’Orange", css: "restriction-orange" };
    case "no_yellow": return { label: "Pas de Jaune", css: "restriction-yellow" };
    case "no_red_orange": return { label: "Pas de Rouge ni d’Orange", css: "restriction-orange" };
    case "no_blue_yellow": return { label: "Pas de Bleu ni de Jaune", css: "restriction-blue" };
    case "no_thrust": return { label: "Pas d’Estoc", css: "restriction-danger" };
    case "no_lateral": return { label: "Pas de Coup Latéral", css: "restriction-danger" };
    case "no_thrust_red": return { label: "Pas d’Estoc ni de Rouge", css: "restriction-red" };
    case "no_thrust_blue": return { label: "Pas d’Estoc ni de Bleu", css: "restriction-blue" };
    case "no_lateral_red": return { label: "Pas de Coup Latéral ni de Rouge", css: "restriction-red" };
    case "no_green_yellow": return { label: "Pas de Vert ni de Jaune", css: "restriction-danger" };
    case "only_green": return { label: "Seulement Vert", css: "restriction-green" };
    case "only_yellow": return { label: "Seulement Jaune", css: "restriction-yellow" };
    case "only_green_yellow": return { label: "Seulement Vert ou Jaune", css: "restriction-green" };
    case "only_brown": return { label: "Seulement Marron", css: "restriction-brown" };
    case "only_bond": return { label: "Seulement Bond", css: "restriction-yellow" };
    case "only_distance": return { label: "Seulement Distance Accrue", css: "restriction-brown" };
    case "disarmed": return { label: "Désarmé", css: "restriction-danger" };
    case "shield_broken": return { label: "Bouclier brisé", css: "restriction-danger" };
    default: return { label: "Aucune restriction", css: "restriction-none" };
  }
}

function restrictionFromInstructionText(instruction) {
  const text = (instruction || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (text.includes("aucune restriction")) return "none";
  if (text.includes("pas de rouge ni d'orange") || text.includes("pas de rouge ni d orange")) return "no_red_orange";
  if (text.includes("pas de bleu ni de jaune")) return "no_blue_yellow";
  if (text.includes("pas de vert ni de jaune")) return "no_green_yellow";
  if (text.includes("pas d'estoc ni de rouge") || text.includes("pas d estoc ni de rouge")) return "no_thrust_red";
  if (text.includes("pas d'estoc ni de bleu") || text.includes("pas d estoc ni de bleu")) return "no_thrust_blue";
  if (text.includes("pas de coup lateral ni de rouge")) return "no_lateral_red";
  if (text.includes("pas de rouge")) return "no_red";
  if (text.includes("pas de bleu")) return "no_blue";
  if (text.includes("pas d'orange") || text.includes("pas d orange")) return "no_orange";
  if (text.includes("pas de jaune")) return "no_yellow";
  if (text.includes("pas d'estoc") || text.includes("pas d estoc")) return "no_thrust";
  if (text.includes("pas de coup lateral")) return "no_lateral";
  if (text.includes("seulement du vert ou du jaune") || text.includes("seulement vert ou jaune")) return "only_green_yellow";
  if (text.includes("seulement du vert") || text.includes("seulement vert")) return "only_green";
  if (text.includes("seulement du jaune") || text.includes("seulement jaune")) return "only_yellow";
  if (text.includes("seulement du marron") || text.includes("seulement marron")) return "only_brown";
  if (text.includes("distance accrue") || text.includes("marron")) return "only_distance";
  if (text.includes("desarme") || text.includes("desarmé")) return "disarmed";
  if (text.includes("bouclier brise") || text.includes("bouclier brisé")) return "shield_broken";

  return "none";
}

function updateRestrictionBanner(restriction) {
  const banner = document.getElementById("restrictionBanner");
  if (!banner) return;

  const info = getRestrictionInfo(restriction);

  banner.className = "restriction-banner " + info.css;
  banner.textContent = info.label;
}

function hasPlayerActionAvailableInList(actions, restriction) {
  const activeRestriction = restriction || "none";

  return (actions || []).some(function(action) {
    if (!actionAllowedByRestriction(action, activeRestriction)) return false;

    const isAlwaysAllowedRecover =
      activeRestriction === "disarmed" && isRecoverWeaponAction(action);

    if (
      !isAlwaysAllowedRecover &&
      !isActionUnlockedByLevel(action)
    ) {
      return false;
    }

    return true;
  });
}

function refreshActionList() {
  if (!currentFighter) return;

  const restrictionElement = document.getElementById("restrictionMode");
  const distanceModeElement = document.getElementById("distanceMode");

  const restriction = restrictionElement ? restrictionElement.value : "none";

  if (restriction === "only_distance" && distanceModeElement) {
    distanceModeElement.value = "distance";
  }

  let actions = getActionsForCurrentMode();

  /*
    Sécurité de rythme :
    si le joueur est au contact, avec une restriction "seulement marron",
    et qu'il n'a aucune action marron connue disponible, on bascule
    automatiquement en Distance Accrue avant de proposer les actions.

    Cela évite de lui infliger une action de secours trop punitive au corps à corps.
  */
  if (
    restriction === "only_brown" &&
    distanceModeElement &&
    distanceModeElement.value !== "distance" &&
    !hasPlayerActionAvailableInList(actions, restriction)
  ) {
    distanceModeElement.value = "distance";
    actions = getActionsForCurrentMode();

    const hint = document.getElementById("selectedActionHint");
    if (hint) {
      hint.textContent =
        "Aucune action marron disponible au contact : passage automatique en Distance Accrue.";
    }
  }

  updateDistanceButtons();
  updateRestrictionBanner(restriction);
  fillActions(actions, restriction);
}

function selectActionCard(actionId, showManual) {
  const select = document.getElementById("actionChoice");
  const hint = document.getElementById("selectedActionHint");

  if (!select) return;

  selectedAction = currentActions.find(function(action) {
    return action.id === actionId;
  });

  if (!selectedAction) return;

  select.value = actionId;

  const cards = document.querySelectorAll(".action-card");
  cards.forEach(function(card) {
    card.classList.toggle("active", card.dataset.actionId === actionId);
  });

  const upgradeBonus = getActionUpgradeBonus(selectedAction);
  const upgradeText = upgradeBonus > 0 ? " / EVO +" + upgradeBonus : "";

  if (hint) {
    hint.textContent =
      "Action choisie : " +
      actionLabel(selectedAction) +
      " — PG " +
      selectedAction.pg +
      " / MOD " +
      selectedAction.mod +
      upgradeText;
  }

  if (showManual && actionManualAutoOpen) {
    openActionManualScreen(selectedAction);
  }
}

function fillActions(actions, restriction) {
  const select = document.getElementById("actionChoice");
  const cardsContainer = document.getElementById("actionCards");
  const hint = document.getElementById("selectedActionHint");

  if (!select) return;

  select.innerHTML = "";
  currentActions = [];

  if (cardsContainer) {
    cardsContainer.innerHTML = "";
  }

  const activeRestriction = restriction || "none";

  function addActionChoice(action) {
    if (!action || currentActions.includes(action)) return;

    currentActions.push(action);

    const upgradeBonus = getActionUpgradeBonus(action);
    const upgradeText = upgradeBonus > 0 ? " / EVO +" + upgradeBonus : "";

    const option = document.createElement("option");
    option.value = action.id;
    option.textContent =
      actionLabel(action) +
      " — PG " +
      action.pg +
      " / MOD " +
      action.mod +
      upgradeText;

    select.appendChild(option);

    if (cardsContainer) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "action-card action-card-" + (action.color || "none");
      card.dataset.actionId = action.id;

      card.innerHTML =
        "<strong>" +
        escapeHtml(actionLabel(action)) +
        "</strong>" +
        "<span>MOD " +
        escapeHtml(action.mod) +
        "</span>" +
        (upgradeBonus > 0
          ? "<span>EVO +" + escapeHtml(upgradeBonus) + "</span>"
          : "");

      card.addEventListener("click", function() {
        selectActionCard(action.id, true);
      });

      cardsContainer.appendChild(card);
    }
  }

  actions.forEach(function(action) {
    if (!actionAllowedByRestriction(action, activeRestriction)) return;

    const isAlwaysAllowedRecover =
      activeRestriction === "disarmed" && isRecoverWeaponAction(action);

    if (
      !isAlwaysAllowedRecover &&
      !isActionUnlockedByLevel(action)
    ) {
      return;
    }

    addActionChoice(action);
  });

  /*
    Sécurité anti-blocage :
    certaines restrictions peuvent ne laisser aucune action connue,
    surtout "seulement marron" en début de progression.
    Dans ce cas, on autorise une action de survie.
  */
  if (currentActions.length === 0) {
    let safetyNames = [];

    if (
      activeRestriction === "only_brown" ||
      activeRestriction === "only_distance"
    ) {
      safetyNames = [
        "Bond en arrière",
        "Esquive",
        "Bloque et approche"
      ];
    } else if (
      activeRestriction === "none" ||
      activeRestriction === "only_green" ||
      activeRestriction === "only_green_yellow" ||
      activeRestriction === "only_yellow"
    ) {
      safetyNames = [
        "Bond en arrière",
        "Coup de bouclier haut",
        "Coup de bouclier bas"
      ];
    }

    if (safetyNames.length > 0) {
      actions.forEach(function(action) {
        if (!actionAllowedByRestriction(action, activeRestriction)) return;

        const isSafetyAction = safetyNames.some(function(name) {
          return actionMatchesUnlockName(action, name);
        });

        if (!isSafetyAction) return;

        // Ici, on ignore volontairement le niveau.
        // C'est une action de secours pour éviter un tour impossible.
        addActionChoice(action);
      });
    }
  }

  if (currentActions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucune action disponible avec cette restriction";
    select.appendChild(option);

    if (cardsContainer) {
      cardsContainer.innerHTML =
        '<div class="restriction-banner restriction-danger">Aucune action disponible avec cette restriction</div>';
    }

    if (hint) {
      hint.textContent = "Aucune action disponible.";
    }

    closeActionManualScreen();
    return;
  }

  select.value = currentActions[0].id;
  selectActionCard(currentActions[0].id, false);
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
  soloDifficultyLevel = gameMode === "solo" ? getSoloDifficultyLevel() : 0;

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
      spentExperience: currentSpentExperience || 0,
      victories: currentVictories || 0,
      level: getCurrentPlayerLevel()
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

    recomputeCurrentBodyBonus();
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

      let opponentBaseBody = Number(currentOpponentFighter.bodyPointsStart || 0);

      if (
        gameMode === "solo" &&
        currentOpponentFighter &&
        currentOpponentFighter.id === "squelette"
      ) {
        opponentBaseBody = 8;
      }
      
      opponentMaxBody = getSoloDifficultyTargetBody(opponentBaseBody);
      opponentCurrentBody = opponentMaxBody;

      duelFinished = false;
      victoryXpAwarded = false;
      currentTurnNumber = 1;

      addCombatLogEntry(
        "Début du duel",
        [
          currentPlayerName + " affronte " + bookEntry.shortName + ".",
          "Tour 1 : Distance Accrue obligatoire.",
          "PV : " + myCurrentBody + " / " + myMaxBody + " contre " + opponentCurrentBody + " / " + opponentMaxBody + "."
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
    hideDuelXpPanels();
    refreshActionList();
    updateEvolutionPanel();
    renderCombatLog();

    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("duelPanel").style.display = "block";
    document.getElementById("turnPanel").style.display = "block";

    document.body.classList.add("duel-active");

    const fixedHpBar = document.getElementById("fixedHpBar");
    if (fixedHpBar) fixedHpBar.style.display = "grid";

    const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
    if (duelCharacterSheetButton) duelCharacterSheetButton.style.display = "block";

    const fleeButton = document.getElementById("fleeButton");
    if (fleeButton) fleeButton.style.display = duelFinished ? "none" : "block";

    initAudioSystem();
    updateAudioButtons();
    updateActionManualToggleButton();

    if (musicEnabled) {
      startCombatMusic();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    appAlert(
      "Erreur : " +
        error.message +
        "\n\nVérifie les fichiers JSON du combattant et du livret affiché.",
      "Erreur de chargement"
    );
  }
}

/* ============================================================
   MODE SOLO / DIFFICULTÉ
   ============================================================ */

const soloDifficultyTitles = {
  chevalier: [
    "Apprenti",
    "Écuyer",
    "Homme d’armes",
    "Chevalier",
    "Champion",
    "Vétéran"
  ],
  squelette: [
    "Osselet",
    "Serviteur d’os",
    "Guerrier squelette",
    "Garde des cryptes",
    "Champion d’os",
    "Vétéran des tombes"
  ],
  default: [
    "Niveau 0",
    "Niveau 1",
    "Niveau 2",
    "Niveau 3",
    "Niveau 4",
    "Niveau 5"
  ]
};


const soloIntroTexts = {
  chevalier: [
    "Un apprenti chevalier entre dans l’arène, la main un peu trop serrée sur son épée neuve. Il a peur, mais il avance.",
    "Un écuyer baisse la tête derrière son bouclier. Il a vu assez de coups pour savoir que le premier est souvent le pire.",
    "Un homme d’armes s’avance d’un pas lourd. Son armure grince et porte la marque de ses combats.",
    "Le chevalier abaisse sa visière. Il vient te défier. Il vient vaincre.",
    "Un champion entre dans le cercle. La foule se tait et retient son souffle.",
    "Un vétéran de mille duels lève sa lame. Son regard dur se pose sur toi et tu sens qu’il a déjà enterré des adversaires plus braves que toi."
  ],

  squelette: [
    "Un amas d’os se redresse dans un cliquetis sec. Il tient encore debout par pure rancune.",
    "Un serviteur d’os avance, cimeterre levé. Ses orbites vides semblent chercher une faute dans ta garde.",
    "Un guerrier squelette frappe son bouclier. Le son est creux, mais l’intention ne l’est pas.",
    "Un garde des cryptes surgit de l’ombre. Il porte la patience des morts et la brutalité des vivants.",
    "Un champion d’os entre dans l’arène. Chaque pas laisse sa marque sur le sable de l’arène.",
    "Un vétéran des tombes relève son cimeterre. Il a oublié son nom, mais pas comment tuer."
  ],

  default: [
    "Un adversaire inconnu entre dans l’arène.",
    "Une silhouette s’avance, prête au combat.",
    "Le duel commence à sentir la poussière, le fer et le sang.",
    "L’ennemi prend place. Le silence se resserre.",
    "La foule recule d’un pas. Ton adversaire te fixe sans ciller.",
    "L’adversaire te fixe. Ce combat sera au dernier sang."
  ]
};

function getSoloIntroText(fighterId, level) {
  const texts = soloIntroTexts[fighterId] || soloIntroTexts.default;
  const safeLevel = Math.max(0, Math.min(5, Number(level || 0)));

  return texts[safeLevel] || texts[0];
}

function refreshSoloIntroText() {
  const block = document.getElementById("soloIntroBlock");
  const title = document.getElementById("soloIntroTitle");
  const text = document.getElementById("soloIntroText");

  const modeSelect = document.getElementById("gameMode");
  const opponentSelect = document.getElementById("opponentBook");
  const difficultySelect = document.getElementById("soloDifficultyLevel");

  if (!block || !title || !text || !modeSelect || !opponentSelect) return;

  const isSolo = modeSelect.value === "solo";

  block.style.display = isSolo ? "block" : "none";

  if (!isSolo) return;

  const opponentId = opponentSelect.value || "default";
  const level = difficultySelect ? Number(difficultySelect.value || 0) : 0;

  title.textContent =
    getSoloDifficultyTitle(opponentId, level) +
    " — " +
    (opponentId === "squelette" ? "Squelette" : "Chevalier");

  text.textContent = getSoloIntroText(opponentId, level);
}

function getSoloDifficultyTitle(fighterId, level) {
  const titles = soloDifficultyTitles[fighterId] || soloDifficultyTitles.default;
  return titles[level] || titles[0];
}

function getSoloDifficultyLevel() {
  const select = document.getElementById("soloDifficultyLevel");
  if (!select) return 0;

  const value = Number(select.value || 0);
  return Math.max(0, Math.min(5, value));
}

function getSoloEffectiveDamageBonus() {
  if (gameMode !== "solo") return 0;

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const playerLevel = getCurrentPlayerLevel();

  return Math.max(0, opponentLevel - playerLevel);
}

function getSoloDifficultyTargetBody(baseBody) {
  const base = Number(baseBody || 0);

  if (gameMode !== "solo") return base;

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const playerLevel = getCurrentPlayerLevel();
  const opponentId = currentOpponentFighter ? currentOpponentFighter.id : "default";

  // Courbe spéciale pour le squelette solo : il progresse, mais son niveau 1
  // n'est plus un mur de pierre pour un chevalier niveau 1.
  if (opponentId === "squelette") {
    const skeletonBodyByLevel = [8, 12, 16, 24, 32, 40];
    return skeletonBodyByLevel[opponentLevel] !== undefined
      ? skeletonBodyByLevel[opponentLevel]
      : skeletonBodyByLevel[skeletonBodyByLevel.length - 1];
  }

  // Pour les autres adversaires, le bonus de PV ne s'applique que si
  // l'adversaire est au-dessus du niveau du PJ.
  const levelGap = Math.max(0, opponentLevel - playerLevel);
  return base + levelGap * 8;
}

function getSoloDifficultyBodyBonus(baseBody) {
  if (gameMode !== "solo") return 0;

  const base = Number(baseBody || 0);
  const target = getSoloDifficultyTargetBody(base);

  return Math.max(0, target - base);
}


function setGameMode(mode) {
  const select = document.getElementById("gameMode");

  if (!select) return;

  select.value = mode;

  updateGameModeButtons();
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
}

function updateGameModeButtons() {
  const select = document.getElementById("gameMode");
  const duoButton = document.getElementById("gameModeDuoButton");
  const soloButton = document.getElementById("gameModeSoloButton");

  if (!select) return;

  const mode = select.value || "duel";

  if (duoButton) {
    duoButton.classList.toggle("active", mode === "duel");
  }

  if (soloButton) {
    soloButton.classList.toggle("active", mode === "solo");
  }
}

function setOpponentBook(fighterId) {
  const select = document.getElementById("opponentBook");

  if (!select) return;

  select.value = fighterId;

  updateOpponentBookButtons();
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
  refreshSetupSelectionDisplays();
}

function updateOpponentBookButtons() {
  const select = document.getElementById("opponentBook");
  const chevalierButton = document.getElementById("opponentBookChevalierButton");
  const squeletteButton = document.getElementById("opponentBookSqueletteButton");

  if (!select) return;

  const value = select.value || "chevalier";

  if (chevalierButton) {
    chevalierButton.classList.toggle("active", value === "chevalier");
  }

  if (squeletteButton) {
    squeletteButton.classList.toggle("active", value === "squelette");
  }
}

function refreshSoloDifficultyOptions() {
  const block = document.getElementById("soloDifficultyBlock");
  const select = document.getElementById("soloDifficultyLevel");
  const hint = document.getElementById("soloDifficultyHint");
  const modeSelect = document.getElementById("gameMode");
  const opponentSelect = document.getElementById("opponentBook");

  if (!block || !select) return;

  const isSolo = modeSelect && modeSelect.value === "solo";
  block.style.display = isSolo ? "block" : "none";

  const opponentId = opponentSelect ? opponentSelect.value : "default";
  const oldValue = String(select.value || "0");

  select.innerHTML = "";

  for (let level = 0; level <= 5; level++) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent =
      "+" +
      level +
      " — " +
      getSoloDifficultyTitle(opponentId, level);

    select.appendChild(option);
  }

  select.value = oldValue;

  if (!select.value) {
    select.value = "0";
  }

  if (hint) {
    const level = Number(select.value || 0);

    const playerLevel = getCurrentPlayerLevel();
    const damageBonus = Math.max(0, level - playerLevel);
    const bodyText = opponentId === "squelette"
      ? "PV squelette : " + ([8, 12, 16, 24, 32, 40][level] || 40)
      : "PV bonus selon écart de niveau";

    hint.textContent =
      getSoloDifficultyTitle(opponentId, level) +
      " : bonus dégâts +" +
      damageBonus +
      " | " +
      bodyText +
      ".";
  }

  refreshSoloIntroText();
  updateOpponentBookButtons();
  refreshSetupSelectionDisplays();
}

function getSoloOpponentActions() {
  if (!currentOpponentFighter) return [];

  const distanceModeElement = document.getElementById("distanceMode");
  const distanceMode = distanceModeElement ? distanceModeElement.value : "normal";

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

  const opponentLevel = Number(soloDifficultyLevel || 0);
  const opponentId = currentOpponentFighter.id;

  function isUsableAction(action) {
    return (
      action &&
      action.available &&
      action.pg !== undefined &&
      action.pg !== null &&
      actionAllowedByRestriction(action, soloOpponentRestriction)
    );
  }

  let availableActions = actions.filter(function(action) {
    return (
      isUsableAction(action) &&
      isActionUnlockedForFighter(action, opponentId, opponentLevel)
    );
  });

  if (availableActions.length > 0) {
    return availableActions;
  }

  // Sécurité anti-blocage solo :
  // si l’adversaire est forcé en marron / distance et n’a aucune action
  // débloquée, on lui donne une action de survie pour éviter le tour impossible.
  if (
    soloOpponentRestriction === "only_brown" ||
    soloOpponentRestriction === "only_distance" ||
    distanceMode === "distance"
  ) {
    const safetyNames = [
      "Bond en arrière",
      "Bond esquive",
      "Esquive",
      "Bloque et approche"
    ];

    availableActions = actions.filter(function(action) {
      if (!isUsableAction(action)) return false;

      return safetyNames.some(function(name) {
        return actionMatchesUnlockName(action, name);
      });
    });

    if (availableActions.length > 0) {
      return availableActions;
    }

    // Dernier filet : toute action marron légale du livret adverse.
    availableActions = actions.filter(function(action) {
      return isUsableAction(action) && action.color === "marron";
    });

    if (availableActions.length > 0) {
      return availableActions;
    }
  }

  return [];
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
      if (color === "orange" || color === "rouge") score += 10;
    }

    if (opponentRatio <= 0.35) {
      if (color === "orange" || color === "rouge") score *= 1.35;
      if (text.includes("esquive") || text.includes("bond en arriere")) score *= 0.6;
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

    if (text.includes("charge")) score += distanceMode === "distance" ? 14 : 2;
    if (text.includes("bloque")) score += distanceMode === "distance" ? 10 : 4;

    if (text.includes("esquive")) score += 3;
    if (text.includes("bond esquive")) score += 4;
    if (text.includes("bond en arriere")) score *= 0.85;
    if (text.includes("recuperer")) score *= 0.45;

    if (distanceMode === "distance") {
      if (text.includes("charge")) score *= 1.35;
      if (text.includes("bloque")) score *= 1.25;
      if (text.includes("esquive")) score *= 0.75;
    }

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

    if (opponentRatio <= 0.35) {
      if (text.includes("attaque protegee")) score *= 1.45;
      if (text.includes("coup de bouclier")) score *= 1.35;
      if (text.includes("esquive")) score *= 1.25;
      if (text.includes("bond esquive")) score *= 1.2;
      if (color === "orange" || color === "rouge") score *= 0.8;
    }

    if (opponentRatio >= 0.65 && playerRatio >= 0.5) {
      if (text.includes("attaque protegee")) score += 5;
      if (text.includes("estoc")) score += 4;
      if (text.includes("coup lateral")) score += 4;
    }

    return Math.max(1, score);
  }

  if (text.includes("attaque protegee")) score += 6;
  if (text.includes("coup lateral")) score += 5;
  if (text.includes("estoc")) score += 5;
  if (text.includes("charge") && distanceMode === "distance") score += 8;
  if (text.includes("esquive")) score *= 0.8;
  if (text.includes("recuperer")) score *= 0.5;

  if (playerRatio <= 0.35 && isClearlyOffensiveAction(action)) score *= 1.25;
  if (opponentRatio <= 0.35) {
    if (text.includes("attaque protegee") || text.includes("esquive")) score *= 1.25;
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
  const difficultyTitle = getSoloDifficultyTitle(
    currentOpponentFighter ? currentOpponentFighter.id : "default",
    soloDifficultyLevel
  );

  text.textContent =
    personality.name +
    " : " +
    difficultyTitle +
    " | dégâts +" +
    getSoloEffectiveDamageBonus() +
    " : " +
    actionLabel(action) +
    " | PG " +
    action.pg +
    " | " +
    action.color;

  panel.style.display = "block";
}

function calculateOpponentDamage(page, action) {
  const detail = getOpponentDamageDetail(page, action);

  if (!detail) {
    return null;
  }

  return detail.total;
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
  const damageDetail = getOpponentDamageDetail(page, soloOpponentAction);

  return {
    pageNumber: resultPageNumber,
    page: page,
    damage: damage,
    damageDetail: damageDetail
  };
}

function buildSoloOpponentResultHtml(soloResult) {
  // IMPORTANT : en mode solo, on n'affiche PAS une seconde image.
  // L'image visible doit rester celle du livret de l'adversaire choisi.
  // La riposte solo est affichée seulement si on clique sur "Dégâts reçus".
  if (!soloResult) return "";

  if (soloResult.error) {
    return buildDamageToggleHtml(
      "Dégâts reçus",
      "Erreur",
      '<div class="instruction-card solo-result-card">' +
        "<strong>Riposte adverse</strong><br>" +
        escapeHtml(soloResult.error).replace(/\n/g, "<br>") +
      "</div>",
      "damage-toggle-danger"
    );
  }

  let damageValue = "";

  if (soloResult.damage === null) {
    damageValue = "Aucun SCORE";
  } else {
    damageValue = String(soloResult.damage);
  }

  let damageText = "";

  if (soloResult.damage === null) {
    damageText = "Aucun SCORE contre toi.";
  } else if (soloResult.damage <= 0) {
    damageText = "L’adversaire obtient un SCORE, mais ne te fait aucun dégât.";
  } else {
    damageText = "L’adversaire te fait " + soloResult.damage + " dégât(s).";
  }

  const nextInstruction =
    soloResult.page.instruction || "Aucune restriction particulière.";

  const difficultyTitle = getSoloDifficultyTitle(
    currentOpponentFighter ? currentOpponentFighter.id : "default",
    soloDifficultyLevel
  );

  const detailHtml =
    '<div class="instruction-card solo-result-card">' +
    "<strong>Riposte adverse</strong><br>" +
    "Action adverse : " +
    escapeHtml(actionLabel(soloOpponentAction)) +
    "<br>" +
    "Niveau solo : " +
    escapeHtml(difficultyTitle) +
    " (bonus dégâts +" +
    getSoloEffectiveDamageBonus() +
    ", PV adverses " +
    opponentMaxBody +
    ")" +
    "<br>" +
    "Restriction appliquée à l’adversaire solo : " +
    escapeHtml(getRestrictionInfo(soloOpponentRestriction).label) +
    "<br><br>" +
    buildDamageFormulaHtml(soloResult.damageDetail) +
    '<div class="score-detail">' +
    escapeHtml(damageText) +
    "</div>" +
    "<br>" +
    "<strong>Restriction à appliquer à ton prochain tour</strong><br>" +
    escapeHtml(nextInstruction) +
    "</div>";

  return buildDamageToggleHtml(
    "Dégâts reçus",
    damageValue,
    detailHtml,
    soloResult.damage === null ? "no-damage" : ""
  );
}

/* ============================================================
   TOUR / RÉSOLUTION
   ============================================================ */

function chooseAction() {
  const actionSelect = document.getElementById("actionChoice");
  if (!actionSelect) return;

  const actionId = actionSelect.value;

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

  const enemyPgInput = document.getElementById("enemyPg");
  const pgToAnnounce = document.getElementById("pgToAnnounce");

  if (enemyPgInput) enemyPgInput.value = "";
  if (pgToAnnounce) pgToAnnounce.textContent = getPgDisplayForAction(selectedAction, null);

  if (gameMode === "solo") {
    const opponentAction = pickSoloOpponentAction();

    if (!opponentAction) {
      appAlert("Aucune action adverse disponible pour le mode solo.", "Mode solo");
      return;
    }

    if (enemyPgInput) enemyPgInput.value = opponentAction.pg;
    if (pgToAnnounce) pgToAnnounce.textContent = getPgDisplayForAction(selectedAction, opponentAction.pg);

    updateSoloOpponentDisplay(opponentAction);
  } else {
    updateSoloOpponentDisplay(null);
  }

  document.getElementById("pgPanel").style.display = "block";
  document.getElementById("resultPanel").style.display = "none";
}

function calculateTemporaryBonus(page, action) {
  const temporaryBonusSelect = document.getElementById("temporaryBonus");
  const bonusMode = temporaryBonusSelect ? temporaryBonusSelect.value : "none";

  if (page.score === null || page.score === undefined) return 0;

  const color = action.color || "";
  const category = action.category || "";
  const name = action.name || "";
  const label = (category + " " + name).toLowerCase();

  switch (bonusMode) {
    case "score_any": return 2;
    case "score_blue": return color === "bleu" ? 2 : 0;
    case "score_orange": return color === "orange" ? 2 : 0;
    case "score_plunge_or_lateral":
      return label.includes("coup plongeant") || label.includes("coup latéral") ? 2 : 0;
    default: return 0;
  }
}

/* ============================================================
   RESULTATS LIMPIDES - DETAILS DES CALCULS
   ============================================================ */

function formatSignedNumber(value) {
  const number = Number(value || 0);

  if (number > 0) {
    return "+" + number;
  }

  return String(number);
}

function getSizeDamageModifierForAction(action, perspective) {
  if (!action) return 0;

  if (action.color !== "orange" && action.color !== "rouge") {
    return 0;
  }

  if (perspective === "opponent") {
    return -sizeModifier;
  }

  return sizeModifier;
}

function getPlayerDamageDetail(page, action) {
  if (!page || page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score || 0);
  const mod = Number(action.mod || 0);
  const actionBonus = Number(action.bonus || 0);
  const evolutionBonus = getActionUpgradeBonus(action);
  const temporaryBonus = calculateTemporaryBonus(page, action);
  const sizeBonus = getSizeDamageModifierForAction(action, "player");

  const rawTotal =
    score +
    mod +
    actionBonus +
    evolutionBonus +
    temporaryBonus +
    sizeBonus;

  return {
    label: "Ton calcul",
    score: score,
    mod: mod,
    actionBonus: actionBonus,
    evolutionBonus: evolutionBonus,
    temporaryBonus: temporaryBonus,
    difficultyBonus: 0,
    sizeBonus: sizeBonus,
    rawTotal: rawTotal,
    total: Math.max(0, rawTotal)
  };
}

function getOpponentDamageDetail(page, action) {
  if (!page || page.score === null || page.score === undefined) {
    return null;
  }

  const score = Number(page.score || 0);
  const mod = Number(action.mod || 0);
  const actionBonus = Number(action.bonus || 0);
  const difficultyBonus = getSoloEffectiveDamageBonus();
  const sizeBonus = getSizeDamageModifierForAction(action, "opponent");

  const rawTotal =
    score +
    mod +
    actionBonus +
    difficultyBonus +
    sizeBonus;

  return {
    label: "Calcul adverse",
    score: score,
    mod: mod,
    actionBonus: actionBonus,
    evolutionBonus: 0,
    temporaryBonus: 0,
    difficultyBonus: difficultyBonus,
    sizeBonus: sizeBonus,
    rawTotal: rawTotal,
    total: Math.max(0, rawTotal)
  };
}

function buildDamageFormulaHtml(detail) {
  if (!detail) return "";

  const parts = [
    "SCORE " + detail.score,
    "MOD " + formatSignedNumber(detail.mod)
  ];

  if (detail.actionBonus !== 0) {
    parts.push("bonus action " + formatSignedNumber(detail.actionBonus));
  }

  if (detail.evolutionBonus !== 0) {
    parts.push("évolution " + formatSignedNumber(detail.evolutionBonus));
  }

  if (detail.temporaryBonus !== 0) {
    parts.push("bonus temporaire " + formatSignedNumber(detail.temporaryBonus));
  }

  if (detail.difficultyBonus !== 0) {
    parts.push("difficulté " + formatSignedNumber(detail.difficultyBonus));
  }

  if (detail.sizeBonus !== 0) {
    parts.push("taille " + formatSignedNumber(detail.sizeBonus));
  }

  let totalText = String(detail.total);

  if (detail.rawTotal !== detail.total) {
    totalText = detail.rawTotal + ", ramené à " + detail.total;
  }

  return (
    '<div class="score-detail score-detail-clear">' +
    "<strong>" +
    detail.label +
    " :</strong> " +
    parts.join(" + ") +
    " = " +
    totalText +
    "</div>"
  );
}


function toggleDamageDetails(button) {
  if (!button) return;

  const wrapper = button.closest(".damage-toggle-wrapper");
  if (!wrapper) return;

  const detail = wrapper.querySelector(".damage-detail-collapsible");
  if (!detail) return;

  const isOpen = detail.style.display === "block";

  detail.style.display = isOpen ? "none" : "block";
  button.classList.toggle("damage-toggle-open", !isOpen);

  const hint = button.querySelector(".damage-toggle-hint");
  if (hint) {
    hint.textContent = isOpen ? "Afficher le détail" : "Masquer le détail";
  }
}

function buildDamageToggleHtml(title, value, detailHtml, cssClass) {
  const safeCssClass = cssClass || "";

  return (
    '<div class="damage-toggle-wrapper">' +
    '<button type="button" class="damage-pill damage-toggle-button ' +
    safeCssClass +
    '" onclick="toggleDamageDetails(this)">' +
    "<span>" +
    escapeHtml(title || "Dégâts") +
    "</span>" +
    "<strong>" +
    escapeHtml(value) +
    "</strong>" +
    '<em class="damage-toggle-hint">Afficher le détail</em>' +
    "</button>" +
    '<div class="damage-detail-collapsible" style="display:none;">' +
    (detailHtml || "") +
    "</div>" +
    "</div>"
  );
}

function calculateDamage(page, action) {
  const detail = getPlayerDamageDetail(page, action);

  if (!detail) {
    return null;
  }

  return detail.total;
}

function hasDaValue(action) {
  return (
    action &&
    action.da !== undefined &&
    action.da !== null &&
    action.da !== ""
  );
}

function isDistancePg(pg) {
  const value = Number(pg);
  return value >= 50;
}

function getMovementPageForAction(action, enemyPg) {
  if (!action) return "";

  const actionPg = String(action.pg);

  // Si l'action choisie est déjà une action de Distance Accrue,
  // comme PG 58, on garde son PG normal.
  if (isDistancePg(actionPg)) {
    return actionPg;
  }

  // Si l'adversaire utilise un PG de distance,
  // une action rapprochée utilise sa valeur DA.
  if (isDistancePg(enemyPg) && hasDaValue(action)) {
    return String(action.da);
  }

  return actionPg;
}

function getPgDisplayForAction(action, enemyPg) {
  if (!action) return "-";

  const normalPg = String(action.pg);

  // Une action déjà en PG 50+ reste affichée telle quelle.
  if (isDistancePg(normalPg)) {
    return normalPg;
  }

  if (isDistancePg(enemyPg) && hasDaValue(action)) {
    return String(action.da) + " (DA, depuis " + normalPg + ")";
  }

  if (hasDaValue(action)) {
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


function getPageImageSources(book, pageNumber) {
  if (!book || !pageNumber) return [];

  const bookId = book.id || book.fighterId || "";
  const rawPage = String(pageNumber);
  const page = getBookPage(book, pageNumber);
  const sources = [];

  if (page && page.image) {
    sources.push(page.image);
  }

  if (bookId) {
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage + ".png"
    );
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage.padStart(2, "0") + ".png"
    );
    sources.push(
      "images/" + bookId + "/LW_" + bookId + "_" + rawPage.padStart(3, "0") + ".png"
    );
  }

  return sources.filter(function(source, index) {
    return source && sources.indexOf(source) === index;
  });
}

function addCacheBusterToImage(src) {
  if (!src) return src;

  const separator = src.includes("?") ? "&" : "?";
  return src + separator + "v=" + Date.now();
}

function tryNextPageImage(image) {
  if (!image) return;

  let sources = [];

  try {
    sources = JSON.parse(image.dataset.fallbackSources || "[]");
  } catch (error) {
    sources = [];
  }

  const nextIndex = Number(image.dataset.fallbackIndex || 0) + 1;

  if (nextIndex < sources.length) {
    image.dataset.fallbackIndex = String(nextIndex);
    image.src = sources[nextIndex];
    return;
  }

  if (image.parentElement) {
    image.parentElement.style.display = "none";
  }
}

function buildPageImageHtml(book, pageNumber, label) {
  const sources = getPageImageSources(book, pageNumber).map(function(source) {
    return addCacheBusterToImage(source);
  });

  if (sources.length === 0) return "";

  const safeLabel = escapeHtml(label || "Page résultat");
  const safePage = escapeHtml(pageNumber);
  const encodedSources = escapeHtml(JSON.stringify(sources));

  return (
    '<div class="page-image-box image-priority-box">' +
    '<img class="page-image priority-image" src="' +
    escapeHtml(sources[0]) +
    '" alt="' +
    safeLabel +
    ' ' +
    safePage +
    '" data-fallback-index="0" data-fallback-sources="' +
    encodedSources +
    '" onclick="openImageOverlay(this.src)" onerror="tryNextPageImage(this)">' +
    '<button type="button" class="image-zoom-button" onclick="openImageOverlay(this.parentElement.querySelector(\'img\').src)">Agrandir l’image</button>' +
        '</div>'
  );
}

function resolveTurn() {
  const enemyPgInput = document.getElementById("enemyPg");
  const enemyPg = enemyPgInput ? enemyPgInput.value : "";

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
    appAlert("Aucune table de mouvement trouvée pour ton PG : " + myMovementPage, "Table introuvable");
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

  pendingOpponentInstruction = page.instruction || "Aucune instruction particulière.";

  const damage = calculateDamage(page, selectedAction);
  const soloOpponentResult = resolveSoloOpponentAttack();

  if (
    gameMode === "solo" &&
    soloOpponentResult &&
    !soloOpponentResult.error &&
    soloOpponentResult.page
  ) {
    pendingPlayerInstruction = soloOpponentResult.page.instruction || "Aucune restriction particulière.";
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

    addCombatLogEntry("Tour " + currentTurnNumber + " - Résolution", logLines, "turn");
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
    showPlayerDamageFeedback(soloOpponentResult.damage);
    playSfx("hit");
    saveCurrentDuelState();
  }

  lastDamage = damage;
  damageAlreadyApplied = false;

  const playerDamageDetail = getPlayerDamageDetail(page, selectedAction);

  let damageHtml = "";

  if (!playerDamageDetail) {
    damageHtml = buildDamageToggleHtml(
      "Dégâts infligés",
      "Aucun SCORE",
      '<div class="score-detail score-detail-clear">' +
        "Cette page ne donne aucun SCORE : aucun dégât à appliquer." +
      "</div>",
      "no-damage"
    );
  } else {
    damageHtml = buildDamageToggleHtml(
      "Dégâts infligés",
      String(damage),
      buildDamageFormulaHtml(playerDamageDetail),
      ""
    );
  }

  const imageHtml = buildPageImageHtml(currentBook, resultPageNumber, "Résultat");

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
    (gameMode === "solo" ? "Restriction donnée à l’adversaire solo" : "Instruction à lire à l’adversaire") +
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
    status.innerHTML = '<span class="danger">Ces dégâts ont déjà été appliqués.</span>';
    return;
  }

  opponentCurrentBody -= Number(lastDamage);
  damageAlreadyApplied = true;

  addCombatLogEntry(
    "Tour " + currentTurnNumber + " - Dégâts",
    [
      lastDamage + " dégât(s) appliqué(s) à l’adversaire.",
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
    status.innerHTML = '<span class="success">Aucun dégât. PV adverses inchangés.</span>';
  } else {
    status.innerHTML = '<span class="success">' + lastDamage + " dégât(s) appliqué(s) à l’adversaire.</span>";
  }
}

function nextTurn() {
  selectedAction = null;
  lastDamage = null;
  damageAlreadyApplied = false;
  currentTurnNumber += 1;

  const enemyPgInput = document.getElementById("enemyPg");
  if (enemyPgInput) enemyPgInput.value = "";

  soloOpponentAction = null;
  updateSoloOpponentDisplay(null);

  document.getElementById("pgPanel").style.display = "none";
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("resultText").innerHTML = "";
  document.getElementById("nextTurnButton").style.display = "none";
  document.getElementById("turnPanel").style.display = "block";

  const bodyStatus = document.getElementById("bodyStatus");
  if (bodyStatus) bodyStatus.textContent = "";

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
    if (panelLabel) panelLabel.textContent = "Restrictions du prochain tour";

    document.getElementById("opponentInstructionText").textContent =
      "Vous : " + playerInfo.label + " | Adversaire solo : " + opponentInfo.label;

    document.getElementById("opponentInstructionPanel").style.display = "block";
  } else if (pendingOpponentInstruction) {
    const panelLabel = document.querySelector("#opponentInstructionPanel span");
    if (panelLabel) panelLabel.textContent = "Instruction à donner à l’adversaire";

    document.getElementById("opponentInstructionText").textContent = pendingOpponentInstruction;
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
   FUITE / NOUVEAU DUEL / RÈGLES
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
  if (fleeButton) fleeButton.style.display = "none";
}

async function newDuel() {
  const confirmed = await appConfirm(
    "Commencer un nouveau duel ?\n\nLes PV du duel en cours seront réinitialisés.",
    "Nouveau duel"
  );

  if (!confirmed) return;

  stopCombatMusic();
  clearCurrentDuelState();

  combatLog = [];
  lastResolutionLogKey = "";
  renderCombatLog();

  const combatLogPanel = document.getElementById("combatLogPanel");
  if (combatLogPanel) combatLogPanel.style.display = "none";

  const combatLogButton = document.getElementById("combatLogButton");
  if (combatLogButton) combatLogButton.classList.remove("active");

  currentFighter = null;
  currentOpponentFighter = null;
  currentBook = null;
  currentPlayerBook = null;
  currentActions = [];
  selectedAction = null;
  gameMode = "duel";
  soloOpponentAction = null;
  soloOpponentRestriction = "none";
  soloDifficultyLevel = 0;

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
  if (fixedHpBar) fixedHpBar.style.display = "none";

  const duelCharacterSheetButton = document.getElementById("duelCharacterSheetButton");
  if (duelCharacterSheetButton) duelCharacterSheetButton.style.display = "none";

  const hpTools = document.getElementById("hpTools");
  if (hpTools) hpTools.style.display = "none";

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
  refreshSoloDifficultyOptions();
  refreshSoloIntroText();
  updateGameModeButtons();
  refreshSetupSelectionDisplays();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openRulesPage() {
  window.open("regles.html", "_blank");
}

initApp();
