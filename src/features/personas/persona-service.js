/**
 * PersonaService: manages DJ personas stored in IndexedDB.
 * Each persona carries a system prompt and an optional ElevenLabs voice ID.
 */

import { savePersona, getPersona, getAllPersonas, deletePersona } from "../storage/storage-service.js";
import { generateUUID } from "../../utils.js";
import { DEFAULT_PERSONA_MANIFEST } from "./default-persona-manifest.js";

const LEGACY_PRESET_NAMES = new Set(["DJ Pirate", "DJ Classic Rock"]);

// ── PersonaService ────────────────────────────────────────────────────────────

class PersonaServiceImpl {
  async seedPresets() {
    const all = await getAllPersonas();
    const presets = await loadDefaultPersonas();
    const expectedPresetIds = new Set(presets.map((preset) => preset.id));

    for (const persona of all) {
      const isLegacyPreset = persona.isPreset && LEGACY_PRESET_NAMES.has(persona.name);
      const isRemovedDefault = persona.isPreset && persona.presetKey && !expectedPresetIds.has(persona.presetKey);
      if (isLegacyPreset || isRemovedDefault) {
        await deletePersona(persona.id);
      }
    }

    for (const preset of presets) {
      const existing = await getPersona(preset.id);
      if (!existing) {
        const now = new Date().toISOString();
        await savePersona({
          ...preset,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async getAll() {
    const personas = await getAllPersonas();
    return sortPersonas(personas);
  }

  async getById(id) {
    return getPersona(id);
  }

  async save(data) {
    const now = new Date().toISOString();
    const persona = {
      ...data,
      id: generateUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await savePersona(persona);
    return persona;
  }

  async update(persona) {
    const updated = {
      ...persona,
      updatedAt: new Date().toISOString(),
    };
    await savePersona(updated);
    return updated;
  }

  async remove(id) {
    const persona = await getPersona(id);
    if (persona?.isPreset) {
      throw new Error("Cannot delete preset personas");
    }
    await deletePersona(id);
  }

  resolveSystemPrompt(persona) {
    const lines = [
      `You are ${persona.name}, a radio DJ.`,
      "",
      persona.systemPrompt,
      "",
      "Output rules:",
      "- Speak directly as the DJ with no stage directions, markdown, or quotes.",
      "- Do not explain what you are doing — just deliver the line.",
      "- Do not start with 'I' or the DJ name.",
      "- Sound natural and spoken, not written.",
    ];

    return lines.join("\n");
  }
}

export function createPersonaService() {
  return new PersonaServiceImpl();
}

async function loadDefaultPersonas() {
  const presets = await Promise.all(
    DEFAULT_PERSONA_MANIFEST.map(async (entry) => {
      const response = await fetch(entry.path);
      if (!response.ok) {
        throw new Error(`Failed to load persona prompt: ${entry.path}`);
      }

      const markdown = await response.text();
      const { attributes, body } = parseFrontmatter(markdown);

      return {
        id: attributes.personaId || entry.fallbackId,
        presetKey: attributes.personaId || entry.fallbackId,
        name: attributes.name || entry.fallbackName,
        systemPrompt: body.trim(),
        elevenLabsVoiceId: attributes.elevenLabsVoiceId || "",
        voice: attributes.voice || "nova",
        speechRate: parseSpeechRate(attributes.speechRate),
        isPreset: true,
        presetOrder: entry.order,
        promptPath: entry.path,
      };
    })
  );

  return presets;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return { attributes: {}, body: markdown };
  }

  const endIndex = markdown.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { attributes: {}, body: markdown };
  }

  const rawFrontmatter = markdown.slice(4, endIndex);
  const body = markdown.slice(endIndex + 5);
  const attributes = {};

  for (const line of rawFrontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    attributes[key] = stripQuotes(value);
  }

  return { attributes, body };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSpeechRate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 1.0;
}

function sortPersonas(personas) {
  return [...personas].sort((a, b) => {
    if (a.isPreset && b.isPreset) {
      return (a.presetOrder ?? Number.MAX_SAFE_INTEGER) - (b.presetOrder ?? Number.MAX_SAFE_INTEGER);
    }
    if (a.isPreset) return -1;
    if (b.isPreset) return 1;

    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
}
