/**
 * PersonaService: manages DJ personas stored in IndexedDB.
 * Each persona carries a system prompt and an optional ElevenLabs voice ID.
 */

import { savePersona, getPersona, getAllPersonas, deletePersona } from "../storage/storage-service.js";
import { generateUUID } from "../../utils.js";
import { DEFAULT_PERSONA_MANIFEST } from "./default-persona-manifest.js";

export const DEFAULT_BANTER_WORD_CAPS = Object.freeze({
  short: 25,
  medium: 45,
  long: 80,
});

// ── PersonaService ────────────────────────────────────────────────────────────

class PersonaServiceImpl {
  async seedPresets() {
    const all = await getAllPersonas();
    const presets = await loadDefaultPersonas();
    const expectedPresetIds = new Set(presets.map((preset) => preset.id));
    const expectedPresetNames = new Set(presets.map((preset) => preset.name));

    for (const persona of all) {
      const isLegacyPreset = persona.isPreset && !persona.presetKey && !expectedPresetNames.has(persona.name);
      const isRemovedDefault = persona.isPreset && persona.presetKey && !expectedPresetIds.has(persona.presetKey);
      if (isLegacyPreset || isRemovedDefault) {
        await deletePersona(persona.id);
      }
    }

    for (const preset of presets) {
      const existing = await getPersona(preset.id);
      const now = new Date().toISOString();
      await savePersona(
        normalizePersona({
          ...existing,
          ...preset,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        })
      );
    }
  }

  async getAll() {
    const personas = await getAllPersonas();
    return sortPersonas(personas.map((persona) => normalizePersona(persona)));
  }

  async getById(id) {
    const persona = await getPersona(id);
    return persona ? normalizePersona(persona) : null;
  }

  async save(data) {
    const now = new Date().toISOString();
    const persona = normalizePersona({
      ...data,
      id: generateUUID(),
      createdAt: now,
      updatedAt: now,
    });
    await savePersona(persona);
    return persona;
  }

  async update(persona) {
    const updated = normalizePersona({
      ...persona,
      updatedAt: new Date().toISOString(),
    });
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
        banterWordCaps: parseBanterWordCaps(attributes),
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
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");

  if (!normalizedMarkdown.startsWith("---\n")) {
    return { attributes: {}, body: normalizedMarkdown };
  }

  const endIndex = normalizedMarkdown.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { attributes: {}, body: normalizedMarkdown };
  }

  const rawFrontmatter = normalizedMarkdown.slice(4, endIndex);
  const body = normalizedMarkdown.slice(endIndex + 5);
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

function parseBanterWordCaps(attributes) {
  return {
    short: parsePositiveInteger(attributes.banterShortMaxWords, DEFAULT_BANTER_WORD_CAPS.short),
    medium: parsePositiveInteger(attributes.banterMediumMaxWords, DEFAULT_BANTER_WORD_CAPS.medium),
    long: parsePositiveInteger(attributes.banterLongMaxWords, DEFAULT_BANTER_WORD_CAPS.long),
  };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizePersona(persona) {
  const inputCaps = persona?.banterWordCaps ?? {};
  const short = parsePositiveInteger(inputCaps.short, DEFAULT_BANTER_WORD_CAPS.short);
  const medium = Math.max(short, parsePositiveInteger(inputCaps.medium, DEFAULT_BANTER_WORD_CAPS.medium));
  const long = Math.max(medium, parsePositiveInteger(inputCaps.long, DEFAULT_BANTER_WORD_CAPS.long));

  return {
    ...persona,
    banterWordCaps: { short, medium, long },
  };
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
