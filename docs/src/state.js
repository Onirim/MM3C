export function createCharacter(campaignRules, skillRules, talentRules) {
  return {
    format: "mm3c-character",
    schemaVersion: 3,
    catalogVersion: "mm3e-fr-core-3",
    campaign: {
      powerLevel: campaignRules.defaultPowerLevel,
      startingPowerPoints: null
    },
    identity: {
      heroName: "", playerName: "", identity: "secrete", origin: "", age: "",
      affiliation: "", height: "", weight: "", eyes: "", hair: "", base: "",
      appearance: "", background: ""
    },
    characteristics: Object.fromEntries(["strength", "stamina", "dexterity", "agility", "fighting", "intellect", "awareness", "presence"].map(id => [id, 0])),
    defenses: { dodge: 0, parry: 0, fortitude: 0, will: 0 },
    skills: Object.fromEntries(skillRules.skills.map(skill => [skill.id, { ranks: 0, specializations: [] }])),
    talents: Object.fromEntries(talentRules.talents.map(talent => [talent.id, { ranks: 0, notes: "" }])),
    complications: [
      { id: crypto.randomUUID(), type: "motivation", description: "" },
      { id: crypto.randomUUID(), type: "other", description: "" }
    ]
  };
}

export function normalizeCharacter(input, campaignRules, complicationRules, skillRules, talentRules) {
  if (!input || input.format !== "mm3c-character") throw new Error("Ce fichier n’est pas une sauvegarde MM3C.");
  if (![1, 2, 3].includes(input.schemaVersion)) throw new Error(`Version de sauvegarde non prise en charge : ${input.schemaVersion ?? "inconnue"}.`);
  const fresh = createCharacter(campaignRules, skillRules, talentRules);
  const output = { ...fresh, ...input };
  output.schemaVersion = fresh.schemaVersion;
  output.catalogVersion = fresh.catalogVersion;
  output.campaign = { ...fresh.campaign, ...(input.campaign ?? {}) };
  output.identity = { ...fresh.identity, ...(input.identity ?? {}) };
  output.characteristics = { ...fresh.characteristics, ...(input.characteristics ?? {}) };
  output.defenses = { ...fresh.defenses, ...(input.defenses ?? {}) };
  delete output.defenses.protection;
  output.skills = Object.fromEntries(skillRules.skills.map(skill => {
    const previous = input.skills?.[skill.id] ?? {};
    const specializations = skill.specialization && Array.isArray(previous.specializations)
      ? previous.specializations.map(item => ({
        id: typeof item?.id === "string" ? item.id : crypto.randomUUID(),
        name: typeof item?.name === "string" ? item.name : "",
        ranks: Number.isFinite(Number(item?.ranks)) ? Number(item.ranks) : 0
      }))
      : [];
    return [skill.id, {
      ranks: skill.specialization ? 0 : Number.isFinite(Number(previous.ranks)) ? Number(previous.ranks) : 0,
      specializations
    }];
  }));
  output.talents = Object.fromEntries(talentRules.talents.map(talent => {
    const previous = input.talents?.[talent.id] ?? {};
    return [talent.id, {
      ranks: Number.isFinite(Number(previous.ranks)) ? Number(previous.ranks) : 0,
      notes: typeof previous.notes === "string" ? previous.notes : ""
    }];
  }));
  if (!Array.isArray(input.complications)) throw new Error("La liste des complications est absente ou invalide.");
  const validTypes = new Set(complicationRules.types.map(type => type.id));
  output.complications = input.complications.map(item => ({
    id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
    type: validTypes.has(item.type) ? item.type : "other",
    description: typeof item.description === "string" ? item.description : ""
  }));
  if (output.campaign.startingPowerPoints === "" || output.campaign.startingPowerPoints === undefined) output.campaign.startingPowerPoints = null;
  return output;
}

export function setPath(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let object = target;
  for (const key of keys) object = object[key];
  object[last] = value;
}

export function getPath(target, path) {
  return path.split(".").reduce((object, key) => object?.[key], target);
}
