const charactersIndexKey = "lw_saved_characters_index";
const lastCharacterKey = "lw_last_character_id";
const currentDuelSaveKey = "lw_current_duel_state";

let currentSheetCharacter = null;
let currentSheetProfile = null;
let currentSheetFighter = null;
let currentSheetActions = [];

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

function goBackToDuel() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "duel.html";
  }
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
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveSavedCharacters(characters) {
  localStorage.setItem(charactersIndexKey, JSON.stringify(characters));
}

function getQueryCharacterId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || localStorage.getItem(lastCharacterKey) || "";
}

async function loadJson(path) {
  const response = await fetch(path + "?v=" + Date.now());

  if (!response.ok) {
    throw new Error("Impossible de charger : " + path);
  }

  return await response.json();
}

async function loadCatalog() {
  try {
    return await loadJson("data/catalog.json");
  } catch (error) {
    return fallbackCatalog;
  }
}

function findCatalogEntry(catalog, id) {
  return catalog.fighters.find(function(fighter) {
    return fighter.id === id;
  });
}

function loadProfile(character) {
  const profileKey = getPlayerProfileKey(character.fighterId, character.name);
  const raw = localStorage.getItem(profileKey);

  if (!raw) {
    return {
      fighterId: character.fighterId,
      name: character.name,
      experience: character.experience || 0,
      spentExperience: character.spentExperience || 0,
      actionBonuses: {},
      bodyBonus: 0
    };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return {
      fighterId: character.fighterId,
      name: character.name,
      experience: character.experience || 0,
      spentExperience: character.spentExperience || 0,
      actionBonuses: {},
      bodyBonus: 0
    };
  }
}

function actionLabel(action) {
  if (action.category) {
    return action.category + " " + action.name;
  }

  return action.name;
}

function getAllActions(fighter) {
  const closeActions = (fighter.actions || []).map(function(action) {
    return Object.assign({}, action, { modeLabel: "Rapproché" });
  });

  const distanceActions = (fighter.distanceActions || []).map(function(action) {
    return Object.assign({}, action, { modeLabel: "Distance" });
  });

  return closeActions.concat(distanceActions);
}

function getColorLabel(color) {
  const labels = {
    rouge: "Rouge",
    orange: "Orange",
    bleu: "Bleu",
    jaune: "Jaune",
    vert: "Vert",
    marron: "Marron"
  };

  return labels[color] || color || "-";
}

const trophiesByColor = {
  rouge: {
    icon: "🩸",
    title: "Lame écarlate",
    text: "Toutes les actions rouges sont maîtrisées."
  },
  orange: {
    icon: "🔥",
    title: "Briseur d’élan",
    text: "Toutes les actions orange sont maîtrisées."
  },
  bleu: {
    icon: "🛡️",
    title: "Garde d’azur",
    text: "Toutes les actions bleues sont maîtrisées."
  },
  jaune: {
    icon: "⚡",
    title: "Feinteur d’or",
    text: "Toutes les actions jaunes sont maîtrisées."
  },
  vert: {
    icon: "🌿",
    title: "Gardien du cercle",
    text: "Toutes les actions vertes sont maîtrisées."
  },
  marron: {
    icon: "🏹",
    title: "Maître de la distance",
    text: "Toutes les actions marron sont maîtrisées."
  }
};

function getBonus(profile, actionId) {
  return Number((profile.actionBonuses || {})[actionId] || 0);
}

function computeColorSummary(actions, profile) {
  const byColor = {};

  actions.forEach(function(action) {
    if (!action.color) return;

    if (!byColor[action.color]) {
      byColor[action.color] = [];
    }

    byColor[action.color].push(action);
  });

  return Object.keys(byColor).sort().map(function(color) {
    const colorActions = byColor[color];

    let minBonus = Infinity;
    let improvedCount = 0;

    colorActions.forEach(function(action) {
      const bonus = getBonus(profile, action.id);
      minBonus = Math.min(minBonus, bonus);

      if (bonus > 0) {
        improvedCount += 1;
      }
    });

    if (minBonus === Infinity) {
      minBonus = 0;
    }

    return {
      color: color,
      total: colorActions.length,
      improved: improvedCount,
      minBonus: minBonus,
      complete: improvedCount === colorActions.length && colorActions.length > 0
    };
  });
}

function renderHeader(character, profile, fighter) {
  const xpAvailable = Number(profile.experience || 0);
  const xpSpent = Number(profile.spentExperience || 0);
  const xpTotal = xpAvailable + xpSpent;
  const bodyBonus = Number(profile.bodyBonus || 0);
  const bodyStart = Number(fighter.bodyPointsStart || 0) + bodyBonus;

  const fighterName =
    character.fighterName ||
    fighter.shortName ||
    character.fighterId ||
    "Combattant";

  const nameElement = document.getElementById("sheetCharacterName");
  if (nameElement) {
    nameElement.textContent = character.name || "Personnage";
  }

  const typeElement = document.getElementById("sheetCharacterType");
  if (typeElement) {
    typeElement.textContent = fighterName;
  }

  const fighterNameElement = document.getElementById("sheetFighterName");
  if (fighterNameElement) {
    fighterNameElement.textContent = fighterName;
  }

  document.getElementById("sheetXpAvailable").textContent = xpAvailable;
  document.getElementById("sheetXpSpent").textContent = xpSpent;
  document.getElementById("sheetXpTotal").textContent = xpTotal;

  document.getElementById("sheetBodyBonus").textContent =
    bodyBonus >= 0 ? "+" + bodyBonus : String(bodyBonus);

  document.getElementById("sheetBodyStart").textContent = bodyStart;
}

function renderColorSummary(actions, profile) {
  const container = document.getElementById("colorSummary");
  const summaries = computeColorSummary(actions, profile);

  container.innerHTML = "";

  summaries.forEach(function(summary) {
    const item = document.createElement("div");
    item.className = "color-summary-item evo-color-" + summary.color;

    item.innerHTML =
      "<strong>" +
      getColorLabel(summary.color) +
      "</strong>" +
      "<span>" +
      summary.improved +
      " / " +
      summary.total +
      " améliorée(s)</span>" +
      "<em>Bonus couleur : +" +
      summary.minBonus +
      "</em>";

    container.appendChild(item);
  });
}

function renderTrophies(actions, profile) {
  const container = document.getElementById("trophyGrid");
  if (!container) return;

  const summaries = computeColorSummary(actions, profile);

  container.innerHTML = "";

  summaries.forEach(function(summary) {
    const trophy = trophiesByColor[summary.color] || {
      icon: "🏆",
      title: getColorLabel(summary.color),
      text: "Couleur maîtrisée."
    };

    const colorLevel = Math.min(5, Math.max(0, Number(summary.minBonus || 0)));
    const unlocked = colorLevel >= 1;

    const item = document.createElement("div");

    item.className =
      "trophy-card " +
      "trophy-" +
      summary.color +
      " " +
      (unlocked ? "trophy-unlocked" : "trophy-locked");

    let levelHtml = "";

    if (unlocked) {
      levelHtml =
        '<div class="trophy-level">' +
        "<strong>" +
        getTrophyLevelLabel(colorLevel) +
        "</strong>" +
        "<span>" +
        getTrophyCups(colorLevel) +
        "</span>" +
        "</div>";
    }

    item.innerHTML =
      '<div class="trophy-icon">' +
      (unlocked ? getTrophyCups(colorLevel) : trophy.icon) +
      "</div>" +
      '<div class="trophy-content">' +
      "<strong>" +
      trophy.title +
      "</strong>" +
      "<span>" +
      (unlocked
        ? trophy.text
        : "Encore verrouillé") +
      "</span>" +
      "<em>" +
      summary.improved +
      " / " +
      summary.total +
      " actions améliorées" +
      "</em>" +
      "<em>Niveau couleur : +" +
      colorLevel +
      " / +5</em>" +
      levelHtml +
      "</div>";

    container.appendChild(item);
  });
}

function renderSpecialTrophies(actions, profile) {
  const container = document.getElementById("specialTrophyGrid");
  if (!container) return;

  const xpAvailable = Number(profile.experience || 0);
  const xpSpent = Number(profile.spentExperience || 0);
  const xpTotal = xpAvailable + xpSpent;
  const bodyBonus = Number(profile.bodyBonus || 0);

  const summaries = computeColorSummary(actions, profile);
  const completedColors = summaries.filter(function(summary) {
    return summary.complete;
  }).length;

  let improvedActions = 0;
  let maxActionBonus = 0;

  actions.forEach(function(action) {
    const bonus = getBonus(profile, action.id);

    if (bonus > 0) {
      improvedActions += 1;
    }

    maxActionBonus = Math.max(maxActionBonus, bonus);
  });

  const allActionsImproved =
    actions.length > 0 && improvedActions === actions.length;

  const allColorsCompleted =
    summaries.length > 0 && completedColors === summaries.length;

  const specialTrophies = [
    {
      icon: "🏆",
      title: "Premier sang",
      text: "Le combattant a gagné ses premiers XP.",
      unlocked: xpTotal >= 1
    },
    {
      icon: "⚔️",
      title: "Apprenti duelliste",
      text: "Le combattant a atteint 10 XP total.",
      unlocked: xpTotal >= 10
    },
    {
      icon: "🛡️",
      title: "Vétéran d’arène",
      text: "Le combattant a atteint 50 XP total.",
      unlocked: xpTotal >= 50
    },
    {
      icon: "👑",
      title: "Champion des Mondes Perdus",
      text: "Le combattant a atteint 100 XP total.",
      unlocked: xpTotal >= 100
    },
    {
      icon: "💪",
      title: "Corps endurci",
      text: "Le combattant a gagné au moins +1 Corps de départ.",
      unlocked: bodyBonus >= 1
    },
    {
      icon: "🔥",
      title: "Maître d’une couleur",
      text: "Une couleur complète a été validée.",
      unlocked: completedColors >= 1
    },
    {
      icon: "🌈",
      title: "Maître des six couleurs",
      text: "Toutes les couleurs disponibles sont validées.",
      unlocked: allColorsCompleted
    },
    {
      icon: "📚",
      title: "Élève appliqué",
      text: "Au moins 5 actions ont été améliorées.",
      unlocked: improvedActions >= 5
    },
    {
      icon: "🧠",
      title: "Tacticien",
      text: "Au moins 10 actions ont été améliorées.",
      unlocked: improvedActions >= 10
    },
    {
      icon: "⚒️",
      title: "Arsenal complet",
      text: "Toutes les actions ont été améliorées au moins une fois.",
      unlocked: allActionsImproved
    },
    {
      icon: "⭐",
      title: "Technique favorite",
      text: "Une action a atteint le niveau +2.",
      unlocked: maxActionBonus >= 2
    },
    {
      icon: "🌟",
      title: "Technique légendaire",
      text: "Une action a atteint le niveau +3.",
      unlocked: maxActionBonus >= 3
    }
  ];

  container.innerHTML = "";

  specialTrophies.forEach(function(trophy) {
    const item = document.createElement("div");

    item.className =
      "trophy-card special-trophy-card " +
      (trophy.unlocked ? "trophy-unlocked" : "trophy-locked");

    item.innerHTML =
      '<div class="trophy-icon">' +
      trophy.icon +
      "</div>" +
      '<div class="trophy-content">' +
      "<strong>" +
      trophy.title +
      "</strong>" +
      "<span>" +
      (trophy.unlocked ? trophy.text : "Encore verrouillé") +
      "</span>" +
      "</div>";

    container.appendChild(item);
  });
}

function getTrophyLevelLabel(level) {
  switch (level) {
    case 1:
      return "Trophée";
    case 2:
      return "Double trophée";
    case 3:
      return "Triple trophée";
    case 4:
      return "Quadruple trophée";
    case 5:
      return "Quintuple trophée";
    default:
      return "Trophée";
  }
}

function getTrophyCups(level) {
  let cups = "";

  for (let i = 0; i < level; i++) {
    cups += "🏆";
  }

  return cups;
}

function renderEvolutionTable(actions, profile) {
  const tbody = document.getElementById("evolutionTableBody");
  tbody.innerHTML = "";

  actions.forEach(function(action) {
    const bonus = getBonus(profile, action.id);
    const checked = bonus > 0 ? "checked" : "";
    const pgText =
      action.da !== undefined && action.da !== null
        ? action.pg + " / DA " + action.da
        : action.pg;

    const row = document.createElement("tr");

    row.innerHTML =
      "<td>" +
      '<input type="checkbox" disabled ' +
      checked +
      ">" +
      "</td>" +
      "<td>" +
      '<span class="evo-color-pill evo-color-' +
      action.color +
      '">' +
      getColorLabel(action.color) +
      "</span>" +
      "</td>" +
      "<td>" +
      "<strong>" +
      actionLabel(action) +
      "</strong>" +
      '<span class="evo-mode-label">' +
      action.modeLabel +
      "</span>" +
      "</td>" +
      "<td>" +
      pgText +
      "</td>" +
      "<td>" +
      action.mod +
      "</td>" +
      "<td>" +
      (bonus > 0 ? "+" + bonus : "-") +
      "</td>";

    tbody.appendChild(row);
  });
}

function renameCurrentCharacter() {
  if (!currentSheetCharacter || !currentSheetProfile || !currentSheetFighter) {
    window.alert("Aucun PJ chargé.");
    return;
  }

  const modal = document.getElementById("renameModal");
  const input = document.getElementById("renameCharacterInput");
  const error = document.getElementById("renameModalError");
  const title = document.getElementById("renameModalTitle");

  if (!modal || !input) return;

  if (title) {
    title.textContent = "Renommer " + currentSheetCharacter.name;
  }

  if (error) {
    error.textContent = "";
  }

  input.value = currentSheetCharacter.name || "";
  modal.style.display = "flex";

  setTimeout(function() {
    input.focus();
    input.select();
  }, 50);
}

function closeRenameModal() {
  const modal = document.getElementById("renameModal");
  const error = document.getElementById("renameModalError");

  if (modal) {
    modal.style.display = "none";
  }

  if (error) {
    error.textContent = "";
  }
}

function confirmRenameCharacter() {
  const input = document.getElementById("renameCharacterInput");
  const error = document.getElementById("renameModalError");

  if (!input) return;

  const newName = input.value.trim();

  if (!newName) {
    if (error) error.textContent = "Le nom du PJ ne peut pas être vide.";
    return;
  }

  const oldName = currentSheetCharacter.name;

  if (newName === oldName) {
    closeRenameModal();
    return;
  }

  const fighterId = currentSheetCharacter.fighterId;
  const characters = getSavedCharacters();

  const oldId = currentSheetCharacter.id;
  const newId = makeCharacterId(fighterId, newName);

  const alreadyExists = characters.some(function(character) {
    return character.id === newId && character.id !== oldId;
  });

  if (alreadyExists) {
    if (error) error.textContent = "Un PJ porte déjà ce nom pour ce livret.";
    return;
  }

  const oldProfileKey = getPlayerProfileKey(fighterId, oldName);
  const newProfileKey = getPlayerProfileKey(fighterId, newName);

  const updatedProfile = Object.assign({}, currentSheetProfile, {
    fighterId: fighterId,
    name: newName
  });

  localStorage.setItem(newProfileKey, JSON.stringify(updatedProfile));

  if (oldProfileKey !== newProfileKey) {
    localStorage.removeItem(oldProfileKey);
  }

  const updatedCharacters = characters.map(function(character) {
    if (character.id !== oldId) return character;

    return Object.assign({}, character, {
      id: newId,
      name: newName,
      experience: Number(updatedProfile.experience || 0),
      spentExperience: Number(updatedProfile.spentExperience || 0)
    });
  });

  saveSavedCharacters(updatedCharacters);

  localStorage.setItem(lastCharacterKey, newId);
  localStorage.setItem("lw_player_name_" + fighterId, newName);

  updateCurrentDuelNameIfNeeded(fighterId, oldName, newName);

  currentSheetCharacter = Object.assign({}, currentSheetCharacter, {
    id: newId,
    name: newName
  });

  currentSheetProfile = updatedProfile;

  renderHeader(currentSheetCharacter, currentSheetProfile, currentSheetFighter);
  renderColorSummary(currentSheetActions, currentSheetProfile);
  renderTrophies(currentSheetActions, currentSheetProfile);
  renderSpecialTrophies(currentSheetActions, currentSheetProfile);
  renderEvolutionTable(currentSheetActions, currentSheetProfile);

  const newUrl =
    window.location.pathname +
    "?id=" +
    encodeURIComponent(newId);

  window.history.replaceState({}, "", newUrl);

  closeRenameModal();
}

function updateCurrentDuelNameIfNeeded(fighterId, oldName, newName) {
  const raw = localStorage.getItem(currentDuelSaveKey);
  if (!raw) return;

  try {
    const state = JSON.parse(raw);

    if (state.fighterId === fighterId && state.playerName === oldName) {
      state.playerName = newName;
      localStorage.setItem(currentDuelSaveKey, JSON.stringify(state));
    }
  } catch (error) {
    // Sauvegarde de duel illisible, on ignore.
  }
}

async function initSheetPage() {
  const status = document.getElementById("sheetStatus");
  const characters = getSavedCharacters();

  if (characters.length === 0) {
    status.textContent = "Aucun PJ sauvegardé sur cet appareil.";
    document.getElementById("evolutionTableBody").innerHTML =
      '<tr><td colspan="6">Aucun PJ trouvé.</td></tr>';
    return;
  }

  const characterId = getQueryCharacterId();

  let character = characters.find(function(item) {
    return item.id === characterId;
  });

  if (!character) {
    character = characters[0];
  }

  localStorage.setItem(lastCharacterKey, character.id);

  const profile = loadProfile(character);
  const catalog = await loadCatalog();
  const catalogEntry = findCatalogEntry(catalog, character.fighterId);

  if (!catalogEntry) {
    status.textContent = "Type de combattant introuvable dans le catalogue.";
    return;
  }

  try {
    const fighter = await loadJson(catalogEntry.sheetFile);
    const actions = getAllActions(fighter);

    currentSheetCharacter = character;
    currentSheetProfile = profile;
    currentSheetFighter = fighter;
    currentSheetActions = actions;

    renderHeader(character, profile, fighter);
    renderColorSummary(actions, profile);
    renderTrophies(actions, profile);
    renderSpecialTrophies(actions, profile);
    renderEvolutionTable(actions, profile);

    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
  }
}

document.addEventListener("keydown", function(event) {
  const modal = document.getElementById("renameModal");

  if (!modal || modal.style.display !== "flex") return;

  if (event.key === "Escape") {
    closeRenameModal();
  }

  if (event.key === "Enter") {
    confirmRenameCharacter();
  }
});

initSheetPage();
