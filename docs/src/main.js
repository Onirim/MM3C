import { createCharacter, getPath, normalizeCharacter, setPath } from "./state.js";
import { pointBudget, validateCharacter } from "./rules.js";
import { downloadCharacter, readCharacterFile } from "./serialization.js";

const [campaignRules, characteristics, defenseRules, skillRules, talentRules, complicationRules] = await Promise.all([
  "campaign.json", "characteristics.json", "defenses.json", "skills.json", "talents.json", "complications.json"
].map(async file => {
  const response = await fetch(`./data/${file}`);
  if (!response.ok) throw new Error(`Impossible de charger ${file}.`);
  return response.json();
}));

let character = createCharacter(campaignRules, skillRules, talentRules);
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
  const addButton = event.target.closest("[data-add-specialization]");
  if (addButton) {
    const skillId = addButton.dataset.addSpecialization;
    const field = form.querySelector(`[data-new-specialization="${skillId}"]`);
    const name = field?.value.trim();
    if (!name) {
      field?.focus();
      return;
    }
    character.skills[skillId].specializations.push({ id: crypto.randomUUID(), name, ranks: 0 });
    renderSkills();
    render();
    return;
  }
  const removeButton = event.target.closest("[data-remove-specialization]");
  if (removeButton) {
    const { removeSpecialization: skillId, specializationId } = removeButton.dataset;
    character.skills[skillId].specializations = character.skills[skillId].specializations.filter(item => item.id !== specializationId);
    renderSkills();
    render();
  }
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
  renderSkills();
  renderTalents();
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
  $("#defense-fields").innerHTML = defenseRules.map(defense => {
    const baseLabel = characteristics.find(trait => trait.id === defense.baseFrom).label;
    const controls = defense.buyable === false
      ? `<span class="defense-source-note">${defense.description}</span>`
      : `<span class="trait-control"><span class="rank-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${defense.label} d’un rang">−</button><input type="number" min="0" max="20" step="1" value="${character.defenses[defense.id]}" data-rank="defenses.${defense.id}" aria-label="Rangs achetés de ${defense.label}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${defense.label} d’un rang">+</button></span><span class="trait-cost" data-cost="defenses.${defense.id}">0 PP</span></span>`;
    return `
      <div class="trait-card defense-card">
        <span><span class="trait-name">${defense.label} <small>${defense.shortLabel}</small></span><span class="trait-description">Base : ${baseLabel}${defense.buyable === false ? "" : ` · ${defense.description}`}</span></span>
        <div class="defense-card-bottom">
          <span class="defense-total"><small>Total</small><strong data-defense-total="${defense.id}">0</strong></span>
          ${controls}
        </div>
      </div>`;
  }).join("");
}

function renderSkills() {
  $("#skill-fields").innerHTML = skillRules.categories.map(category => {
    const cards = skillRules.skills.filter(skill => skill.category === category.id).map(skill => {
      const value = character.skills[skill.id];
      const flags = [
        skill.untrained ? "Sans qualification possible" : "Qualification requise",
        skill.interaction ? "Interaction" : "",
        skill.manipulation ? "Manipulation" : "",
        skill.tools ? "Outils requis" : ""
      ].filter(Boolean).map(flag => `<span>${flag}</span>`).join("");
      const stat = characteristics.find(trait => trait.id === skill.baseFrom);
      const specializationContent = skill.specialization
        ? `<div class="skill-specialization-label">Spécialités · ${skill.specialization.label}</div><div class="skill-specialization-list">${value.specializations.length
          ? value.specializations.map(item => `<div class="skill-specialization-row">
              <label class="visually-hidden" for="skill-${skill.id}-${item.id}">Spécialité ${skill.label}</label>
              <input id="skill-${skill.id}-${item.id}" class="skill-specialization-name" type="text" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(skill.specialization.placeholder)}" data-skill-specialization-name="${skill.id}" data-specialization-id="${item.id}">
              <span class="skill-bonus">Test <strong data-skill-bonus="${skill.id}" data-specialization-id="${item.id}">+0</strong></span>
              <span class="rank-stepper skill-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${skill.label} ${escapeHtml(item.name)} d’un rang">−</button><input type="number" min="0" step="1" value="${item.ranks}" data-skill-rank="${skill.id}" data-specialization-id="${item.id}" aria-label="Rangs de ${skill.label} ${escapeHtml(item.name)}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${skill.label} ${escapeHtml(item.name)} d’un rang">+</button></span>
              <span class="trait-cost" data-skill-cost="${skill.id}" data-specialization-id="${item.id}">0 PP</span>
              <button class="remove-specialization" type="button" data-remove-specialization="${skill.id}" data-specialization-id="${item.id}" aria-label="Supprimer cette spécialité">×</button>
            </div>`).join("")
          : `<p class="empty-specializations">Aucune spécialité achetée pour le moment.</p>`}</div>
          <div class="add-specialization"><input type="text" placeholder="${escapeHtml(skill.specialization.placeholder)}" aria-label="Nouvelle spécialité de ${skill.label}" data-new-specialization="${skill.id}"><button class="button button-secondary" type="button" data-add-specialization="${skill.id}">Ajouter</button></div>`
        : `<div class="skill-purchase-row">
            <span class="skill-bonus">Test <strong data-skill-bonus="${skill.id}">+0</strong></span>
            <span class="rank-stepper skill-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${skill.label} d’un rang">−</button><input type="number" min="0" step="1" value="${value.ranks}" data-skill-rank="${skill.id}" aria-label="Rangs de ${skill.label}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${skill.label} d’un rang">+</button></span>
            <span class="trait-cost" data-skill-cost="${skill.id}">0 PP</span>
          </div>`;
      return `<article class="skill-card">
        <div class="skill-card-heading"><div><h3>${skill.label} <small>${skill.shortLabel}</small></h3><p>${skill.description}</p></div><span class="skill-ability">${stat.shortLabel}</span></div>
        <div class="skill-flags">${flags}<span>Action : ${skill.action}</span></div>
        ${specializationContent}
      </article>`;
    }).join("");
    return `<section class="skill-category"><h3 class="skill-category-title">${category.label}</h3><div class="skill-grid">${cards}</div></section>`;
  }).join("");
}

function renderTalents(query = $("#talent-search").value) {
  const search = query.trim().toLocaleLowerCase();
  const categories = talentRules.categories.map(category => {
    const categoryShortLabel = category.label.replace(/^Talents (de )?/, "");
    const entries = talentRules.talents.filter(talent => talent.category === category.id &&
      (!search || `${talent.label} ${talent.description} ${category.label}`.toLocaleLowerCase().includes(search)));
    if (!entries.length) return "";
    const cards = entries.map(talent => {
      const value = character.talents[talent.id];
      const maximum = getTalentMaxRanks(talent);
      const countLabel = talent.rankable ? "Rangs" : "Acquisitions";
      const notes = talent.choiceLabel
        ? `<label class="talent-choice"><span>${talent.choiceLabel}</span><input type="text" value="${escapeHtml(value.notes)}" placeholder="Précisez le choix retenu…" data-talent-notes="${talent.id}"></label>`
        : "";
      return `<article class="talent-card">
        <div class="talent-heading"><div><h3>${talent.label}</h3><p>${talent.description}</p></div><span class="talent-category-tag">${categoryShortLabel}</span></div>
        ${notes}
        <div class="talent-purchase-row"><span class="talent-count-label">${countLabel}</span>
          <span class="rank-stepper talent-stepper"><button class="rank-stepper-button" type="button" data-rank-step="-1" aria-label="Diminuer ${countLabel.toLocaleLowerCase()} de ${talent.label}">−</button><input type="number" min="0" ${maximum === null ? "" : `max="${maximum}"`} step="1" value="${value.ranks}" data-talent-rank="${talent.id}" aria-label="${countLabel} de ${talent.label}"><button class="rank-stepper-button" type="button" data-rank-step="1" aria-label="Augmenter ${countLabel.toLocaleLowerCase()} de ${talent.label}">+</button></span>
          <span class="trait-cost" data-talent-cost="${talent.id}">0 PP</span>
        </div>
      </article>`;
    }).join("");
    return `<section class="talent-category"><h3 class="talent-category-title">${category.label}</h3><div class="talent-grid">${cards}</div></section>`;
  }).join("");
  $("#talent-fields").innerHTML = categories || `<p class="empty-talents">Aucun talent ne correspond à cette recherche.</p>`;
  render();
}

function getTalentMaxRanks(talent) {
  if (talent.maxRanksPerPowerLevelDivisor) {
    return Math.floor(Number(character.campaign.powerLevel) / talent.maxRanksPerPowerLevelDivisor);
  }
  return talent.maxRanks ?? null;
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
  const result = validateCharacter(character, campaignRules, characteristics, defenseRules, skillRules, talentRules, complicationRules);
  const maxBudget = Math.max(0, result.budget);
  const progress = maxBudget ? Math.max(0, Math.min(100, result.costs.total / maxBudget * 100)) : 0;
  $("#summary-name").textContent = character.identity.heroName.trim() || "Nouveau héros";
  $("#summary-level").textContent = `Niveau de puissance ${character.campaign.powerLevel}`;
  $("#spent-points").textContent = formatPoints(result.costs.total);
  $("#remaining-points").textContent = formatPoints(result.remaining);
  $("#remaining-label").textContent = result.remaining < 0 ? "Dépassement" : "Disponibles";
  $("#budget-progress").style.width = `${progress}%`;
  $("#budget-progress").classList.toggle("over-budget", result.remaining < 0);
  $("#budget-detail").textContent = character.campaign.startingPowerPoints === null
    ? `Budget initial : ${result.budget} PP`
    : "Budget personnalisé";
  const budgetInput = $("#power-points");
  budgetInput.placeholder = character.campaign.startingPowerPoints === null ? String(result.budget) : "";
  $("#budget-hint").textContent = character.campaign.startingPowerPoints === null
    ? `Valeur standard : ${character.campaign.powerLevel} × ${campaignRules.defaultPointsPerPowerLevel} PP. Laissez vide pour la conserver.`
    : "Budget personnalisé pour cette campagne.";
  $("#cost-breakdown").innerHTML = [
    ["Caractéristiques", result.costs.characteristics], ["Défenses achetées", result.costs.defenses], ["Compétences", result.costs.skills], ["Talents", result.costs.talents]
  ].map(([label, cost]) => `<div class="breakdown-line"><span>${label}</span><strong>${formatPoints(cost)} PP</strong></div>`).join("");
  for (const defense of defenseRules) {
    $(`[data-defense-total="${defense.id}"]`).textContent = result.defenses[defense.id];
  }
  for (const trait of characteristics) $( `[data-cost="characteristics.${trait.id}"]`).textContent = `${Number(character.characteristics[trait.id]) * trait.costPerRank} PP`;
  for (const defense of defenseRules.filter(item => item.buyable !== false)) $( `[data-cost="defenses.${defense.id}"]`).textContent = `${Number(character.defenses[defense.id]) * defense.costPerRank} PP`;
  for (const skill of skillRules.skills) {
    const value = character.skills[skill.id];
    const ranks = skill.specialization ? value.specializations : [{ id: null, ranks: value.ranks }];
    for (const item of ranks) {
      const bonus = Number(character.characteristics[skill.baseFrom] || 0) + Number(item.ranks || 0);
      const cost = Number(item.ranks || 0) / 2 * skillRules.costPerTwoRanks;
      const bonusElement = document.querySelector(`[data-skill-bonus="${skill.id}"]${item.id ? `[data-specialization-id="${item.id}"]` : ":not([data-specialization-id])"}`);
      const costElement = document.querySelector(`[data-skill-cost="${skill.id}"]${item.id ? `[data-specialization-id="${item.id}"]` : ":not([data-specialization-id])"}`);
      if (bonusElement) bonusElement.textContent = `${bonus >= 0 ? "+" : ""}${bonus}`;
      if (costElement) costElement.textContent = `${formatPoints(cost)} PP`;
    }
    const maxRanks = Math.max(0, Number(character.campaign.powerLevel) + skillRules.powerLevelCheckCapBonus - Number(character.characteristics[skill.baseFrom] || 0));
    document.querySelectorAll(`[data-skill-rank="${skill.id}"]`).forEach(input => { input.max = String(maxRanks); });
  }
  for (const talent of talentRules.talents) {
    const input = document.querySelector(`[data-talent-rank="${talent.id}"]`);
    const maxRanks = getTalentMaxRanks(talent);
    if (input) {
      if (maxRanks === null) input.removeAttribute("max");
      else input.max = String(maxRanks);
    }
    const cost = Number(character.talents[talent.id].ranks || 0) * talentRules.costPerRank;
    const costElement = document.querySelector(`[data-talent-cost="${talent.id}"]`);
    if (costElement) costElement.textContent = `${formatPoints(cost)} PP`;
  }

  const list = $("#validation-list");
  list.innerHTML = [...result.issues.map(message => ({ message, kind: "issue" })), ...result.info.map(message => ({ message, kind: "info" }))]
    .map(({ message, kind }) => `<li class="${kind}">${escapeHtml(message)}</li>`).join("");
  const hasIssues = result.issues.length > 0;
  $("#status-dot").classList.toggle("has-issues", hasIssues);
  $("#validation-title").textContent = hasIssues ? `${result.issues.length} alerte${result.issues.length === 1 ? "" : "s"}` : "Aucune alerte";
  syncStepperButtons();
}

function formatPoints(points) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(points);
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
  } else if (input.dataset.skillRank) {
    updateSkillRank(input);
    render();
  } else if (input.dataset.skillSpecializationName) {
    updateSpecializationName(input);
  } else if (input.dataset.talentRank) {
    character.talents[input.dataset.talentRank].ranks = input.value === "" ? 0 : Number(input.value);
    render();
  } else if (input.dataset.talentNotes) {
    character.talents[input.dataset.talentNotes].notes = input.value;
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
  } else if (input.dataset.skillRank) {
    updateSkillRank(input);
    render();
  } else if (input.dataset.skillSpecializationName) {
    updateSpecializationName(input);
  } else if (input.dataset.talentRank) {
    character.talents[input.dataset.talentRank].ranks = input.value === "" ? 0 : Number(input.value);
    render();
  } else if (input.dataset.talentNotes) {
    character.talents[input.dataset.talentNotes].notes = input.value;
  }
});

$("#talent-search").addEventListener("input", event => renderTalents(event.target.value));

function updateSkillRank(input) {
  const skill = character.skills[input.dataset.skillRank];
  if (input.dataset.specializationId) {
    const specialization = skill.specializations.find(item => item.id === input.dataset.specializationId);
    if (specialization) specialization.ranks = input.value === "" ? 0 : Number(input.value);
  } else {
    skill.ranks = input.value === "" ? 0 : Number(input.value);
  }
}

function updateSpecializationName(input) {
  const specialization = character.skills[input.dataset.skillSpecializationName].specializations
    .find(item => item.id === input.dataset.specializationId);
  if (specialization) specialization.name = input.value;
  render();
}

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
    character = normalizeCharacter(await readCharacterFile(file), campaignRules, complicationRules, skillRules, talentRules);
    syncForm();
    showToast("Personnage importé.");
  } catch (error) {
    showToast(error.message || "Import impossible.");
  } finally {
    event.target.value = "";
  }
});

syncForm();
