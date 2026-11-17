import { createCharacter, getPath, normalizeCharacter, setPath } from "./state.js";
import { pointBudget, validateCharacter } from "./rules.js";
import { downloadCharacter, readCharacterFile } from "./serialization.js";

const [campaignRules, characteristics, defenseRules, complicationRules] = await Promise.all([
  "campaign.json", "characteristics.json", "defenses.json", "complications.json"
].map(async file => {
  const response = await fetch(`./data/${file}`);
  if (!response.ok) throw new Error(`Impossible de charger ${file}.`);
  return response.json();
}));

let character = createCharacter(campaignRules);
let toastTimer;

const $ = selector => document.querySelector(selector);
const form = $("#character-form");
const toast = $("#toast");
const themeToggle = $("#theme-toggle");
const tabButtons = [...document.querySelectorAll("[role=tab]")];
const tabPanels = [...document.querySelectorAll("[role=tabpanel]")];

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.querySelector(".theme-symbol").textContent = isDark ? "☼" : "☾";
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#111815" : "#ffffff";
}

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
applyTheme("light");

function activateTab(panelId, focusTab = false) {
  const activeButton = tabButtons.find(button => button.dataset.tab === panelId);
  if (!activeButton) return;
  for (const button of tabButtons) {
    const isActive = button === activeButton;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of tabPanels) panel.hidden = panel.id !== panelId;
  if (focusTab) activeButton.focus();
}

const tablist = document.querySelector("[role=tablist]");
tablist.addEventListener("click", event => {
  const button = event.target.closest("[role=tab]");
  if (button) activateTab(button.dataset.tab);
});
tablist.addEventListener("keydown", event => {
  const currentIndex = tabButtons.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  let nextIndex = currentIndex;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabButtons.length;
  else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabButtons.length - 1;
  else return;
  event.preventDefault();
  activateTab(tabButtons[nextIndex].dataset.tab, true);
});
form.addEventListener("click", event => {
  const button = event.target.closest("[data-tab-target]");
  if (button) activateTab(button.dataset.tabTarget, true);
});
form.addEventListener("click", event => {
  const button = event.target.closest("[data-step], [data-rank-step]");
  if (!button) return;
  const input = button.closest(".number-stepper, .rank-stepper")?.querySelector('input[type="number"]');
  if (!input) return;
  const current = input.value === ""
    ? input.dataset.path === "campaign.startingPowerPoints" ? pointBudget(character, campaignRules) : 0
    : Number(input.value);
  const step = Number(input.step) || 1;
  const min = input.min === "" ? 0 : Number(input.min);
  const max = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
  const direction = Number(button.dataset.step ?? button.dataset.rankStep);
  input.value = String(Math.min(max, Math.max(min, current + direction * step)));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

function setInputValue(input, value) {
  input.value = value ?? "";
}

function syncForm() {
  for (const input of form.querySelectorAll("[data-path]")) setInputValue(input, getPath(character, input.dataset.path));
  renderCharacteristics();
  renderDefenses();
  renderComplications();
  render();
}

function renderCharacteristics() {
  $("#characteristic-fields").innerHTML = characteristics.map(trait => `
    <div class="trait-card">
      <span><span class="trait-name">${trait.label} <small>${trait.shortLabel}</small></span><span class="trait-description">${trait.description}</span></span>
      <span class="trait-control"><span class="rank-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${trait.label} d’un rang">−</button><input type="number" min="${trait.minRank}" max="${trait.maxRank}" step="1" value="${character.characteristics[trait.id]}" data-rank="characteristics.${trait.id}" aria-label="Rang de ${trait.label}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${trait.label} d’un rang">+</button></span><span class="trait-cost" data-cost="characteristics.${trait.id}">0 PP</span></span>
    </div>`).join("");
}

function renderDefenses() {
  $("#defense-fields").innerHTML = defenseRules.map(defense => `
    <div class="trait-card">
      <span><span class="trait-name">${defense.id === "protection" ? "Protection" : defense.label} <small>${defense.shortLabel}</small></span><span class="trait-description">${defense.id === "protection" ? "Rangs de l’effet Protection" : `Base : ${characteristics.find(trait => trait.id === defense.baseFrom).label}`}</span></span>
      <span class="trait-control"><span class="rank-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${defense.label} d’un rang">−</button><input type="number" min="0" max="20" step="1" value="${character.defenses[defense.id]}" data-rank="defenses.${defense.id}" aria-label="Rang acheté de ${defense.label}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${defense.label} d’un rang">+</button></span><span class="trait-cost" data-cost="defenses.${defense.id}">0 PP</span></span>
    </div>`).join("");
}

function renderComplications() {
  const list = $("#complication-list");
  list.innerHTML = character.complications.map(item => `
    <div class="complication-row" data-complication="${item.id}">
      <select aria-label="Type de complication" data-complication-type="${item.id}">${complicationRules.types.map(type => `<option value="${type.id}" ${type.id === item.type ? "selected" : ""}>${type.label}</option>`).join("")}</select>
      <textarea rows="2" placeholder="Décrivez cette complication…" aria-label="Description de la complication" data-complication-description="${item.id}">${escapeHtml(item.description)}</textarea>
      <button class="remove-complication" type="button" data-remove-complication="${item.id}" aria-label="Supprimer la complication">×</button>
    </div>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function render() {
  const result = validateCharacter(character, campaignRules, characteristics, defenseRules, complicationRules);
  const maxBudget = Math.max(0, result.budget);
  const progress = maxBudget ? Math.max(0, Math.min(100, result.costs.total / maxBudget * 100)) : 0;
  $("#summary-name").textContent = character.identity.heroName.trim() || "Nouveau héros";
  $("#summary-level").textContent = `Niveau de puissance ${character.campaign.powerLevel}`;
  $("#spent-points").textContent = result.costs.total;
  $("#remaining-points").textContent = result.remaining;
  $("#remaining-label").textContent = result.remaining < 0 ? "Dépassement" : "Disponibles";
  $("#budget-progress").style.width = `${progress}%`;
  $("#budget-progress").classList.toggle("over-budget", result.remaining < 0);
  $("#budget-detail").textContent = character.campaign.startingPowerPoints === null
    ? `Budget initial : ${result.budget} PP`
    : "Budget personnalisé";
  $("#budget-hint").textContent = character.campaign.startingPowerPoints === null
    ? `Par défaut : ${character.campaign.powerLevel} × ${campaignRules.defaultPointsPerPowerLevel} = ${pointBudget(character, campaignRules)} PP.`
    : "Budget personnalisé pour cette campagne.";
  $("#cost-breakdown").innerHTML = [
    ["Caractéristiques", result.costs.characteristics], ["Défenses achetées", result.costs.defenses], ["Protection", result.costs.protection]
  ].map(([label, cost]) => `<div class="breakdown-line"><span>${label}</span><strong>${cost} PP</strong></div>`).join("");
  $("#defense-summary").innerHTML = defenseRules.map(defense => {
    const key = defense.id === "protection" ? "toughness" : defense.id;
    return `<span class="defense-chip">${defense.id === "protection" ? "Robustesse" : defense.label}<strong>${result.defenses[key]}</strong></span>`;
  }).join("");
  for (const trait of characteristics) $( `[data-cost="characteristics.${trait.id}"]`).textContent = `${Number(character.characteristics[trait.id]) * trait.costPerRank} PP`;
  for (const defense of defenseRules) $( `[data-cost="defenses.${defense.id}"]`).textContent = `${Number(character.defenses[defense.id]) * defense.costPerRank} PP`;

  const list = $("#validation-list");
  list.innerHTML = [...result.issues.map(message => ({ message, kind: "issue" })), ...result.info.map(message => ({ message, kind: "info" }))]
    .map(({ message, kind }) => `<li class="${kind}">${escapeHtml(message)}</li>`).join("");
  const hasIssues = result.issues.length > 0;
  $("#status-dot").classList.toggle("has-issues", hasIssues);
  $("#validation-title").textContent = hasIssues ? `${result.issues.length} alerte${result.issues.length === 1 ? "" : "s"}` : "Aucune alerte";
  syncStepperButtons();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function readInputValue(input) {
  if (input.type !== "number") return input.value;
  if (input.value !== "") return Number(input.value);
  return input.dataset.path === "campaign.startingPowerPoints" ? null : 0;
}

function syncStepperButtons() {
  for (const wrapper of document.querySelectorAll(".number-stepper, .rank-stepper")) {
    const input = wrapper.querySelector('input[type="number"]');
    const value = input.value === ""
      ? input.dataset.path === "campaign.startingPowerPoints" ? pointBudget(character, campaignRules) : 0
      : Number(input.value);
    const min = input.min === "" ? 0 : Number(input.min);
    const max = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
    wrapper.querySelector('[data-step="-1"], [data-rank-step="-1"]').disabled = value <= min;
    wrapper.querySelector('[data-step="1"], [data-rank-step="1"]').disabled = value >= max;
  }
}

form.addEventListener("input", event => {
  const input = event.target;
  if (input.dataset.path) {
    setPath(character, input.dataset.path, readInputValue(input));
    render();
  } else if (input.dataset.rank) {
    const [group, id] = input.dataset.rank.split(".");
    character[group][id] = input.value === "" ? 0 : Number(input.value);
    render();
  }
});

form.addEventListener("change", event => {
  const input = event.target;
  if (input.dataset.path) {
    setPath(character, input.dataset.path, readInputValue(input));
    render();
  } else if (input.dataset.rank) {
    const [group, id] = input.dataset.rank.split(".");
    character[group][id] = input.value === "" ? 0 : Number(input.value);
    render();
  }
});

$("#complication-list").addEventListener("input", event => {
  const id = event.target.dataset.complicationDescription;
  if (!id) return;
  const item = character.complications.find(complication => complication.id === id);
  if (item) item.description = event.target.value;
  render();
});

$("#complication-list").addEventListener("change", event => {
  const id = event.target.dataset.complicationType;
  if (!id) return;
  const item = character.complications.find(complication => complication.id === id);
  if (item) item.type = event.target.value;
  render();
});

$("#complication-list").addEventListener("click", event => {
  const id = event.target.dataset.removeComplication;
  if (!id) return;
  character.complications = character.complications.filter(item => item.id !== id);
  renderComplications();
  render();
});

$("#add-complication").addEventListener("click", () => {
  character.complications.push({ id: crypto.randomUUID(), type: "other", description: "" });
  renderComplications();
  render();
  const fields = $("#complication-list").querySelectorAll("textarea");
  fields[fields.length - 1]?.focus();
});

$("#export-button").addEventListener("click", () => {
  downloadCharacter(character);
  showToast("Sauvegarde JSON téléchargée.");
});

$("#import-button").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    character = normalizeCharacter(await readCharacterFile(file), campaignRules, complicationRules);
    syncForm();
    showToast("Personnage importé.");
  } catch (error) {
    showToast(error.message || "Import impossible.");
  } finally {
    event.target.value = "";
  }
});

syncForm();
