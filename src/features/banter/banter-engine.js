/**
 * BanterEngine: generates short DJ scripts using OpenAI Chat Completions.
 * Uses fetch() directly — no npm dependency needed.
 */

// Simple fingerprint: first 40 chars of the text lowercased with whitespace removed
function makeFingerprint(text) {
  return text.toLowerCase().replace(/\s+/g, '').slice(0, 40);
}

const WORDS_PER_SECOND = 2.5;

// ── Segment type → user instruction ──────────────────────────────────────────

function buildUserPrompt(req) {
  const parts = [];

  const mood = req.stationMood ? `Station mood: ${req.stationMood}.` : '';
  if (mood) parts.push(mood);

  if (req.currentTrack) {
    const trackLabel =
      req.segmentType === 'transition'
        ? `Just finished playing: "${req.currentTrack.title}" by ${req.currentTrack.artistName}.`
        : `Now playing: "${req.currentTrack.title}" by ${req.currentTrack.artistName}.`;
    parts.push(trackLabel);
  }

  if (req.recentTracks.length > 0) {
    const recent = req.recentTracks
      .slice(0, 3)
      .map((t) => `"${t.title}" by ${t.artistName}`)
      .join(', ');
    parts.push(`Recent tracks: ${recent}.`);
  }

  if (req.requestSummary.length > 0) {
    parts.push(`Listener requests: ${req.requestSummary.join('; ')}.`);
  }

  if (req.recentBanterSummaries.length > 0) {
    parts.push(`Avoid repeating these recent topics/phrases: ${req.recentBanterSummaries.slice(0, 5).join('; ')}.`);
  }

  switch (req.segmentType) {
    case 'transition':
      if (req.nextTrack) {
        parts.push(
          `Up next is "${req.nextTrack.title}" by ${req.nextTrack.artistName}. ` +
            'Deliver a brief between-track DJ comment about the track that just played, ' +
            'then hype the upcoming track. Keep it natural and conversational.',
        );
      } else {
        parts.push(
          'Deliver a brief between-track DJ comment about the track that just played. ' +
            'React to it, share a quick thought, or hype the vibe. ' +
            'Do NOT announce or name the next track — you don\'t know what it is. Keep it natural.',
        );
      }
      break;
    case 'requestAcknowledgement':
      parts.push('Acknowledge the listener request warmly. Mention the caller name and/or artist if available.');
      break;
    case 'requestRefusal':
      parts.push('Decline a listener request in character — politely but with personality. Don\'t be rude.');
      break;
    case 'requestDeferment':
      parts.push('Acknowledge a request but don\'t commit — keep it vague and in character.');
      break;
    case 'vibeSetting':
      parts.push('Set the vibe for this moment with a short atmospheric line. No track introduction needed.');
      break;
    case 'stationIdent':
      parts.push('Deliver a brief station ident — who you are, what the station is. Keep it punchy.');
      break;
    case 'artistIntroduction':
      parts.push('Introduce the current or next artist. Keep it exciting and personal.');
      break;
    case 'signOff':
      parts.push(
        'The show is ending. Deliver a warm, memorable sign-off. ' +
          'Thank listeners for tuning in, mention any highlights from the session, and say goodbye in character. Keep it heartfelt and punchy.',
      );
      break;
  }

  parts.push(`Keep it under ${req.constraints.maxWords} words. Spoken audio only — no stage directions.`);

  if (req.constraints.factualityMode === 'grounded') {
    parts.push('Keep factual claims accurate — don\'t invent facts about artists.');
  } else if (req.constraints.factualityMode === 'playful') {
    parts.push('Prioritize personality over factual accuracy — make it fun.');
  }

  return parts.join('\n');
}

// ── BanterEngine ──────────────────────────────────────────────────────────────

class BanterEngineImpl {
  constructor(apiKey, personaService) {
    this.apiKey = apiKey;
    this.personaService = personaService;
  }

  async generate(req) {
    const systemPrompt = this.personaService.resolveSystemPrompt(req.persona);
    const userPrompt = buildUserPrompt(req);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.85,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data.choices[0]?.message?.content?.trim() ?? '';

    if (!text) throw new Error('BanterEngine: empty response from OpenAI');

    const wordCount = text.split(/\s+/).length;
    const estimatedDurationSeconds = Math.round(wordCount / WORDS_PER_SECOND);
    const tags = [req.segmentType, req.stationMood ?? ''].filter(Boolean);
    const fingerprint = makeFingerprint(text);

    return { text, estimatedDurationSeconds, tags, fingerprint, systemPrompt, userPrompt };
  }
}

export function createBanterEngine(apiKey, personaService) {
  return new BanterEngineImpl(apiKey, personaService);
}
