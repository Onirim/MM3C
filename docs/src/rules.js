export function pointBudget(character, campaignRules) {
  const override = character.campaign.startingPowerPoints;
  return override === null || override === undefined || override === ""
    ? character.campaign.powerLevel * campaignRules.defaultPointsPerPowerLevel
    : Number(override);
}

export function calculateCosts(character, characteristics, defenses) {
  const traits = characteristics.reduce((sum, trait) => sum + Number(character.characteristics[trait.id] || 0) * trait.costPerRank, 0);
  const defenseBonuses = defenses.filter(defense => defense.id !== "protection")
    .reduce((sum, defense) => sum + Number(character.defenses[defense.id] || 0) * defense.costPerRank, 0);
  const protection = Number(character.defenses.protection || 0) * defenses.find(defense => defense.id === "protection").costPerRank;
  return { characteristics: traits, defenses: defenseBonuses, protection, total: traits + defenseBonuses + protection };
}

export function derivedDefenses(character, defenseRules) {
  return Object.fromEntries(defenseRules.map(defense => {
    const base = Number(character.characteristics[defense.baseFrom] || 0);
    const purchased = defense.id === "protection"
      ? Number(character.defenses.protection || 0)
      : Number(character.defenses[defense.id] || 0);
    return [defense.id === "protection" ? "toughness" : defense.id, base + purchased];
  }));
}

export function validateCharacter(character, campaignRules, characteristics, defenseRules, complicationRules) {
  const issues = [];
  const info = [];
  const level = Number(character.campaign.powerLevel);
  if (!Number.isInteger(level) || level < campaignRules.powerLevel.min || level > campaignRules.powerLevel.max) {
    issues.push(`Le niveau de puissance doit être compris entre ${campaignRules.powerLevel.min} et ${campaignRules.powerLevel.max}.`);
  }
  const budget = pointBudget(character, campaignRules);
  if (!Number.isFinite(budget) || budget < campaignRules.startingPoints.min || budget > campaignRules.startingPoints.max) {
    issues.push(`Le budget doit être compris entre ${campaignRules.startingPoints.min} et ${campaignRules.startingPoints.max} points.`);
  }
  for (const trait of characteristics) {
    const rank = Number(character.characteristics[trait.id]);
    if (!Number.isInteger(rank) || rank < trait.minRank || rank > trait.maxRank) issues.push(`${trait.label} doit être un rang entier entre ${trait.minRank} et ${trait.maxRank}.`);
  }
  for (const defense of defenseRules) {
    const rank = Number(character.defenses[defense.id]);
    if (!Number.isInteger(rank) || rank < 0 || rank > 20) issues.push(`${defense.label} doit être un rang entier entre 0 et 20.`);
  }

  const costs = calculateCosts(character, characteristics, defenseRules);
  const remaining = budget - costs.total;
  if (remaining < 0) issues.push(`Budget dépassé de ${Math.abs(remaining)} point${Math.abs(remaining) === 1 ? "" : "s"}.`);
  const defenses = derivedDefenses(character, defenseRules);
  if (Number.isInteger(level) && level > 0) {
    const cap = campaignRules.powerLevelLimits.defensePairMultiplier * level;
    for (const pair of campaignRules.powerLevelLimits.defensePairs) {
      const total = pair.traits.reduce((sum, id) => sum + Number(defenses[id] || 0), 0);
      if (total > cap) issues.push(`${pair.label} totalise ${total}, au-dessus de la limite ${cap} du NP ${level}.`);
    }
  }
  if (character.complications.length < complicationRules.minimumCount) {
    issues.push(`Ajoutez au moins ${complicationRules.minimumCount} complications.`);
  }
  if (!character.complications.some(item => item.type === complicationRules.requiredType)) {
    issues.push("Ajoutez une complication de type Motivation.");
  }
  if (character.complications.some(item => !item.description.trim())) {
    issues.push("Renseignez la description de chaque complication.");
  }
  info.push("Les limites Attaque + Effet et Compétence seront calculées dans les étapes correspondantes.");
  return { issues, info, costs, budget, remaining, defenses };
}
