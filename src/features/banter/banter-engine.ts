/**
 * BanterEngine: generates short DJ scripts using OpenAI Chat Completions.
 *
 * The OpenAI API key is passed in at construction time (from StorageService).
 * Scripts are kept short and contextually grounded.
 *
 * TODO: Validate OpenAI CORS behaviour from browser context.
 *       The `openai` npm package should handle this correctly for browser use,
 *       but CORS errors may appear if the API changes policy.
 */

import OpenAI from "openai";
import type { BanterEngine as IBanterEngine, BanterRequest, BanterResult } from "@/types/banter";
import type { PersonaService } from "@/features/personas/persona-service";

// Simple fingerprint: first 40 chars of the text lowercased with whitespace removed
function makeFingerprint(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").slice(0, 40);
}

// Rough word-per-second estimate for spoken English
const WORDS_PER_SECOND = 2.5;

// ──────────────────────────────────────────────────────────────────────────────
// Segment type → user instruction
// ──────────────────────────────────────────────────────────────────────────────

function buildUserPrompt(req: BanterRequest): string {
  const parts: string[] = [];

  const mood = req.stationMood ? `Station mood: ${req.stationMood}.` : "";
  if (mood) parts.push(mood);

  if (req.currentTrack) {
    // For transitions, the current track is the one finishing, not starting
    const trackLabel = req.segmentType === "transition"
      ? `Just finished playing: "${req.currentTrack.title}" by ${req.currentTrack.artistName}.`
      : `Now playing: "${req.currentTrack.title}" by ${req.currentTrack.artistName}.`;
    parts.push(trackLabel);
  }

  if (req.recentTracks.length > 0) {
    const recent = req.recentTracks
      .slice(0, 3)
      .map((t) => `"${t.title}" by ${t.artistName}`)
      .join(", ");
    parts.push(`Recent tracks: ${recent}.`);
  }

  if (req.requestSummary.length > 0) {
    parts.push(`Listener requests: ${req.requestSummary.join("; ")}.`);
  }

  if (req.recentBanterSummaries.length > 0) {
    parts.push(
      `Avoid repeating these recent topics/phrases: ${req.recentBanterSummaries.slice(0, 5).join("; ")}.`
    );
  }

  // Segment type instruction
  switch (req.segmentType) {
    case "transition":
      if (req.nextTrack) {
        parts.push(
          `Up next is "${req.nextTrack.title}" by ${req.nextTrack.artistName}. ` +
          "Deliver a brief between-track DJ comment about the track that just played, " +
          "then hype the upcoming track. Keep it natural and conversational."
        );
      } else {
        parts.push(
          "Deliver a brief between-track DJ comment about the track that just played. " +
          "React to it, share a quick thought, or hype the vibe. " +
          "Do NOT announce or name the next track — you don't know what it is. Keep it natural."
        );
      }
      break;
    case "requestAcknowledgement":
      parts.push(
        "Acknowledge the listener request warmly. Mention the caller name and/or artist if available."
      );
      break;
    case "requestRefusal":
      parts.push(
        "Decline a listener request in character — politely but with personality. Don't be rude."
      );
      break;
    case "requestDeferment":
      parts.push(
        "Acknowledge a request but don't commit — keep it vague and in character."
      );
      break;
    case "vibeSetting":
      parts.push(
        "Set the vibe for this moment with a short atmospheric line. No track introduction needed."
      );
      break;
    case "stationIdent":
      parts.push(
        "Deliver a brief station ident — who you are, what the station is. Keep it punchy."
      );
      break;
    case "artistIntroduction":
      parts.push(
        "Introduce the current or next artist. Keep it exciting and personal."
      );
      break;
  }

  parts.push(
    `Keep it under ${req.constraints.maxWords} words. Spoken audio only — no stage directions.`
  );

  if (req.constraints.factualityMode === "grounded") {
    parts.push("Keep factual claims accurate — don't invent facts about artists.");
  } else if (req.constraints.factualityMode === "playful") {
    parts.push("Prioritize personality over factual accuracy — make it fun.");
  }

  return parts.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// BanterEngine implementation
// ──────────────────────────────────────────────────────────────────────────────

class BanterEngineImpl implements IBanterEngine {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private personaService: PersonaService
  ) {
    // dangerouslyAllowBrowser: true is required for direct browser use.
    // This is intentional — the key is user-supplied and user-managed.
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async generate(req: BanterRequest): Promise<BanterResult> {
    const systemPrompt = this.personaService.resolveSystemPrompt(req.persona);
    const userPrompt = buildUserPrompt(req);

    const completion = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.85,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new Error("BanterEngine: empty response from OpenAI");
    }

    const wordCount = text.split(/\s+/).length;
    const estimatedDurationSeconds = Math.round(wordCount / WORDS_PER_SECOND);

    const tags = [req.segmentType, req.stationMood ?? ""].filter(Boolean);
    const fingerprint = makeFingerprint(text);

    return { text, estimatedDurationSeconds, tags, fingerprint };
  }
}

export function createBanterEngine(
  apiKey: string,
  personaService: PersonaService
): IBanterEngine {
  return new BanterEngineImpl(apiKey, personaService);
}
