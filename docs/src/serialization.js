export function serializeCharacter(character) {
  return JSON.stringify(character, null, 2);
}

export async function readCharacterFile(file) {
  const text = await file.text();
  try { return JSON.parse(text); }
  catch { throw new Error("Le fichier ne contient pas de JSON valide."); }
}

export function downloadCharacter(character) {
  const blob = new Blob([serializeCharacter(character)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = (character.identity.heroName || "personnage").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  anchor.href = url;
  anchor.download = `${slug || "personnage"}.mm3c.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
