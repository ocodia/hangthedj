/**
 * PersonaService: manages DJ personas stored in IndexedDB.
 * Resolves persona fields into a system prompt block for the banter engine.
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
    name: 'Nova Nightshift',
    summary: 'A smooth late-night DJ with dry wit and a love of album deep cuts.',
    tone: 'dry',
    humourLevel: 'medium',
    energyLevel: 'low',
    verbosity: 'brief',
    factuality: 'balanced',
    voice: 'nova',
    speechRate: 0.95,
    expressiveness: 'calm and understated',
    profanityPolicy: 'none',
    familySafe: true,
    isPreset: true,
  },
  {
    name: 'Hype Machine',
    summary: 'An energetic tastemaker who lives for new discoveries and big moments.',
    tone: 'enthusiastic',
    humourLevel: 'high',
    energyLevel: 'high',
    verbosity: 'moderate',
    factuality: 'playful',
    voice: 'echo',
    speechRate: 1.15,
    expressiveness: 'upbeat and expressive',
    profanityPolicy: 'none',
    familySafe: true,
    isPreset: true,
  },
  {
    name: 'The Curator',
    summary: 'A thoughtful, slightly nerdy music presenter who knows everything about artists.',
    tone: 'warm',
    humourLevel: 'low',
    energyLevel: 'medium',
    verbosity: 'moderate',
    factuality: 'grounded',
    voice: 'fable',
    speechRate: 1.0,
    expressiveness: 'considered and warm',
    profanityPolicy: 'none',
    familySafe: true,
    isPreset: true,
  },
];

// ── Verbosity → word count mapping ───────────────────────────────────────────

const VERBOSITY_WORDS = {
  brief: 'under 30 words',
  moderate: '30–50 words',
  verbose: '50–80 words',
};

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
      `You are ${persona.name}, a radio DJ. ${persona.summary}`,
      '',
      `Style: ${persona.tone} tone, ${persona.humourLevel} humour, ${persona.energyLevel} energy.`,
      `Delivery: ${persona.expressiveness ?? 'natural and engaging'}.`,
      `Keep responses ${VERBOSITY_WORDS[persona.verbosity]}.`,
    ];

    if (persona.accent) {
      lines.push(`Accent/regional style: ${persona.accent}.`);
    }

    if (persona.profanityPolicy === 'none') {
      lines.push('Use no profanity or offensive language.');
    } else if (persona.profanityPolicy === 'mild') {
      lines.push('Mild language is acceptable but keep it tasteful.');
    }

    if (persona.familySafe) {
      lines.push('Keep all content family-friendly and suitable for all ages.');
    }

    if (persona.catchphrases && persona.catchphrases.length > 0) {
      lines.push(`You occasionally use these expressions: ${persona.catchphrases.join(', ')}.`);
    }

    if (persona.disallowedTopics && persona.disallowedTopics.length > 0) {
      lines.push(`Never discuss: ${persona.disallowedTopics.join(', ')}.`);
    }

    lines.push(
      '',
      'Output rules:',
      '- Speak directly as the DJ with no stage directions, markdown, or quotes.',
      '- Do not explain what you are doing — just deliver the line.',
      '- Do not start with \'I\' or the DJ name.',
      '- Sound natural and spoken, not written.',
    );

    return lines.join('\n');
  }
}

export function createPersonaService() {
  return new PersonaServiceImpl();
}
