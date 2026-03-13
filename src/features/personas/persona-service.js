/**
 * PersonaService: manages DJ personas stored in IndexedDB.
 * Each persona carries a system prompt and an optional ElevenLabs voice ID.
 */

import {
  savePersona,
  getPersona,
  getAllPersonas,
  deletePersona,
} from '../storage/storage-service.js';
import { generateUUID } from '../../utils.js';

// ── Preset personas ───────────────────────────────────────────────────────────

const PRESETS = [
  {
    name: 'DJ Pirate',
    systemPrompt:
      'Gritty pirate radio DJ broadcasting from a hidden studio.\n' +
      'Tone: mischievous, rebellious, underground.\n' +
      'Delivery: relaxed but edgy pacing with attitude.\n' +
      'Keep responses 30–50 words.\n\n' +
      "Sound like you're broadcasting illegal late-night underground music.",
    elevenLabsVoiceId: '7ktJCfz71Z44ppWOelh3',
    voice: 'onyx',
    speechRate: 1.0,
    isPreset: true,
  },
  {
    name: 'DJ Classic Rock',
    systemPrompt:
      'Loud, charismatic 1980s rock station DJ.\n' +
      'Tone: confident, bold, slightly over-the-top.\n' +
      'Delivery: dramatic emphasis, punchy rhythm.\n' +
      'Keep responses 30–50 words.\n\n' +
      'Sound like a classic rock station host introducing a stadium anthem.',
    elevenLabsVoiceId: 'mKoqwDP2laxTdq1gEgU6',
    voice: 'echo',
    speechRate: 1.0,
    isPreset: true,
  },
];

// ── PersonaService ────────────────────────────────────────────────────────────

class PersonaServiceImpl {
  async seedPresets() {
    const all = await getAllPersonas();
    const existingPresets = all.filter((p) => p.isPreset).map((p) => p.name);

    for (const preset of PRESETS) {
      if (!existingPresets.includes(preset.name)) {
        const now = new Date().toISOString();
        await savePersona({
          ...preset,
          id: generateUUID(),
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async getAll() {
    return getAllPersonas();
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
      throw new Error('Cannot delete preset personas');
    }
    await deletePersona(id);
  }

  resolveSystemPrompt(persona) {
    const lines = [
      `You are ${persona.name}, a radio DJ.`,
      '',
      persona.systemPrompt,
      '',
      'Output rules:',
      '- Speak directly as the DJ with no stage directions, markdown, or quotes.',
      '- Do not explain what you are doing — just deliver the line.',
      '- Do not start with \'I\' or the DJ name.',
      '- Sound natural and spoken, not written.',
    ];

    return lines.join('\n');
  }
}

export function createPersonaService() {
  return new PersonaServiceImpl();
}
