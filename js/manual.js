/* ============================================================
   MANUEL D'ESCRIME
   Fichier extrait de app.js - étape 1 du découpage
   ============================================================ */

const actionManualAutoOpenStorageKey = "lw_action_manual_auto_open";
let actionManualAutoOpen = localStorage.getItem(actionManualAutoOpenStorageKey) === "true";

function getActionPreviewImageSources(action) {
  if (!currentFighter || !action) return [];

  const sources = [];

  // Option 1 : champ image directement dans le JSON de l'action.
  // Exemple : "image": "images/actions/chevalier_atk1.png"
  if (action.image) {
    sources.push(action.image);
  }

  // Option 2 : format automatique attendu.
  // Exemple : images/actions/chevalier_atk1.png
  const basePath = "images/actions/" + currentFighter.id + "_" + action.id;

  sources.push(basePath + ".png");
  sources.push(basePath + ".PNG");
  sources.push(basePath + ".jpg");
  sources.push(basePath + ".jpeg");
  sources.push(basePath + ".webp");

  // Option 3 : si action.id contient déjà le nom complet.
  // Exemple : action.id = "chevalier_atk1"
  sources.push("images/actions/" + action.id + ".png");
  sources.push("images/actions/" + action.id + ".PNG");
  sources.push("images/actions/" + action.id + ".jpg");
  sources.push("images/actions/" + action.id + ".jpeg");
  sources.push("images/actions/" + action.id + ".webp");

  return sources.filter(function(source, index) {
    return source && sources.indexOf(source) === index;
  });
}

function addCacheBusterToActionPreview(src) {
  if (!src) return src;

  const separator = src.includes("?") ? "&" : "?";
  return src + separator + "v=" + Date.now();
}

function updateActionManualToggleButton() {
  const button = document.getElementById("actionManualToggleButton");

  if (!button) return;

  button.textContent = actionManualAutoOpen ? "Auto : ON" : "Auto : OFF";
  button.classList.toggle("active", actionManualAutoOpen);
}

function toggleActionManualAutoOpen() {
  actionManualAutoOpen = !actionManualAutoOpen;
  localStorage.setItem(
    actionManualAutoOpenStorageKey,
    actionManualAutoOpen ? "true" : "false"
  );

  updateActionManualToggleButton();
}

function openSelectedActionManual() {
  if (!selectedAction) {
    appAlert("Choisis d’abord une action.", "Manuel d’escrime");
    return;
  }

  openActionManualScreen(selectedAction);
}

function openActionManualScreen(action) {
  const overlay = document.getElementById("actionManualOverlay");
  const image = document.getElementById("actionManualImage");
  const placeholder = document.getElementById("actionManualPlaceholder");
  const title = document.getElementById("actionManualTitle");

  if (!overlay || !image || !placeholder) return;

  overlay.style.display = "flex";
  overlay.classList.add("image-overlay-open");

  if (title) {
    title.textContent = action ? actionLabel(action) : "Manuel d’escrime";
  }

  if (!action) {
    image.style.display = "none";
    image.src = "";
    placeholder.style.display = "block";
    placeholder.textContent = "Bientôt dans votre manuel d’escrime";
    return;
  }

  const sources = getActionPreviewImageSources(action);

  image.onload = function() {
    image.style.display = "block";
    placeholder.style.display = "none";
  };

  image.onerror = function() {
    tryNextActionManualImage();
  };

  image.style.display = "none";
  placeholder.style.display = "block";
  placeholder.textContent = "Chargement de la carte...";

  image.dataset.previewIndex = "0";
  image.dataset.previewSources = JSON.stringify(sources);

  if (sources.length === 0) {
    placeholder.textContent = "Bientôt dans votre manuel d’escrime";
    return;
  }

  image.src = addCacheBusterToActionPreview(sources[0]);
}

function tryNextActionManualImage() {
  const image = document.getElementById("actionManualImage");
  const placeholder = document.getElementById("actionManualPlaceholder");

  if (!image || !placeholder) return;

  let sources = [];

  try {
    sources = JSON.parse(image.dataset.previewSources || "[]");
  } catch (error) {
    sources = [];
  }

  const nextIndex = Number(image.dataset.previewIndex || 0) + 1;

  if (nextIndex < sources.length) {
    image.dataset.previewIndex = String(nextIndex);
    image.src = addCacheBusterToActionPreview(sources[nextIndex]);
    return;
  }

  image.style.display = "none";
  placeholder.style.display = "block";

  const tried = sources.length > 0
    ? "\n\nChemin testé : " + sources[0]
    : "";

  placeholder.textContent =
    "Bientôt dans votre manuel d’escrime" + tried;
}

function closeActionManualScreen() {
  const overlay = document.getElementById("actionManualOverlay");
  const image = document.getElementById("actionManualImage");
  const placeholder = document.getElementById("actionManualPlaceholder");

  if (overlay) {
    overlay.classList.remove("image-overlay-open");
    overlay.style.display = "none";
  }

  if (image) {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    image.style.display = "none";
    image.dataset.previewIndex = "0";
    image.dataset.previewSources = "[]";
  }

  if (placeholder) {
    placeholder.style.display = "none";
    placeholder.textContent = "";
  }
}

// Compatibilité avec l'ancien nom : plus d'affichage sous les actions.
function updateActionPreview(action) {
  if (action) {
    openActionManualScreen(action);
  } else {
    closeActionManualScreen();
  }
}
