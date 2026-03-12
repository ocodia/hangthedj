/**
 * StorageService: typed facade over IndexedDB and localStorage.
 *
 * All persistent reads/writes in the app should go through here,
 * not directly to IndexedDB or localStorage.
 *
 * OpenAI key is stored in localStorage (not IndexedDB) for simplicity
 * and consistent with the no-backend, user-managed key model.
 */

import {
  dbGet,
  dbPut,
  dbDelete,
  dbGetAll,
  dbGetAllByIndex,
  openDatabase,
  STORES,
} from "./indexeddb";
import type { Persona } from "@/types/persona";
import type { ListenerRequest, RequestStatus } from "@/types/request";
import type { SessionRecord, SessionMemory } from "@/types/session";
import type { BanterHistoryRecord } from "@/types/banter";
import type { ClipMetadataRecord } from "@/types/voice";
import type { Track } from "@/types/track";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

// ──────────────────────────────────────────────────────────────────────────────
// localStorage keys
// ──────────────────────────────────────────────────────────────────────────────

const LS_PREFIX = "hangthedj:";
const LS_OPENAI_KEY = `${LS_PREFIX}openai_key`;
const LS_SPOTIFY_ACCESS_TOKEN = `${LS_PREFIX}spotify_access_token`;
const LS_SPOTIFY_REFRESH_TOKEN = `${LS_PREFIX}spotify_refresh_token`;
const LS_SPOTIFY_TOKEN_EXPIRY = `${LS_PREFIX}spotify_token_expiry`;
const LS_SETTINGS = `${LS_PREFIX}settings`;

// ──────────────────────────────────────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────────────────────────────────────

export async function initStorage(): Promise<void> {
  await openDatabase();
}

// ──────────────────────────────────────────────────────────────────────────────
// OpenAI key (localStorage)
// ──────────────────────────────────────────────────────────────────────────────

/** Store the user's OpenAI API key locally. */
export function setOpenAIKey(key: string): void {
  localStorage.setItem(LS_OPENAI_KEY, key);
}

/** Retrieve the stored OpenAI API key. Returns null if not set. */
export function getOpenAIKey(): string | null {
  return localStorage.getItem(LS_OPENAI_KEY);
}

/** Remove the stored OpenAI API key. */
export function clearOpenAIKey(): void {
  localStorage.removeItem(LS_OPENAI_KEY);
}

export function hasOpenAIKey(): boolean {
  const key = getOpenAIKey();
  return key !== null && key.trim().length > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Spotify tokens (localStorage)
// ──────────────────────────────────────────────────────────────────────────────

export function setSpotifyTokens(
  accessToken: string,
  refreshToken: string,
  expiryMs: number
): void {
  localStorage.setItem(LS_SPOTIFY_ACCESS_TOKEN, accessToken);
  localStorage.setItem(LS_SPOTIFY_REFRESH_TOKEN, refreshToken);
  localStorage.setItem(LS_SPOTIFY_TOKEN_EXPIRY, String(expiryMs));
}

export function getSpotifyTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
  expiryMs: number | null;
} {
  const accessToken = localStorage.getItem(LS_SPOTIFY_ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(LS_SPOTIFY_REFRESH_TOKEN);
  const expiryRaw = localStorage.getItem(LS_SPOTIFY_TOKEN_EXPIRY);
  return {
    accessToken,
    refreshToken,
    expiryMs: expiryRaw ? Number(expiryRaw) : null,
  };
}

export function clearSpotifyTokens(): void {
  localStorage.removeItem(LS_SPOTIFY_ACCESS_TOKEN);
  localStorage.removeItem(LS_SPOTIFY_REFRESH_TOKEN);
  localStorage.removeItem(LS_SPOTIFY_TOKEN_EXPIRY);
}

// ──────────────────────────────────────────────────────────────────────────────
// App settings (localStorage — lightweight, survives IndexedDB wipe)
// ──────────────────────────────────────────────────────────────────────────────

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(LS_SETTINGS);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Personas (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function savePersona(persona: Persona): Promise<void> {
  await dbPut<Persona>(STORES.PERSONAS, persona);
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  return dbGet<Persona>(STORES.PERSONAS, id);
}

export async function getAllPersonas(): Promise<Persona[]> {
  return dbGetAll<Persona>(STORES.PERSONAS);
}

export async function deletePersona(id: string): Promise<void> {
  await dbDelete(STORES.PERSONAS, id);
}

// ──────────────────────────────────────────────────────────────────────────────
// Requests (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveRequest(request: ListenerRequest): Promise<void> {
  await dbPut<ListenerRequest>(STORES.REQUESTS, request);
}

export async function getRequest(id: string): Promise<ListenerRequest | undefined> {
  return dbGet<ListenerRequest>(STORES.REQUESTS, id);
}

export async function getRequestsBySession(sessionId: string): Promise<ListenerRequest[]> {
  return dbGetAllByIndex<ListenerRequest>(STORES.REQUESTS, "sessionId", sessionId);
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
  spokenAcknowledgement?: boolean,
  promisedForLater?: boolean
): Promise<void> {
  const req = await getRequest(id);
  if (!req) return;
  const updated: ListenerRequest = {
    ...req,
    status,
    spokenAcknowledgement:
      spokenAcknowledgement !== undefined ? spokenAcknowledgement : req.spokenAcknowledgement,
    promisedForLater:
      promisedForLater !== undefined ? promisedForLater : req.promisedForLater,
  };
  await saveRequest(updated);
}

// ──────────────────────────────────────────────────────────────────────────────
// Sessions (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveSession(session: SessionRecord): Promise<void> {
  await dbPut<SessionRecord>(STORES.SESSIONS, session);
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return dbGet<SessionRecord>(STORES.SESSIONS, id);
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  return dbGetAll<SessionRecord>(STORES.SESSIONS);
}

// ──────────────────────────────────────────────────────────────────────────────
// Session memory (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveSessionMemory(memory: SessionMemory): Promise<void> {
  await dbPut<SessionMemory>(STORES.SESSION_MEMORY, memory);
}

export async function getSessionMemory(sessionId: string): Promise<SessionMemory | undefined> {
  return dbGet<SessionMemory>(STORES.SESSION_MEMORY, sessionId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Banter history (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveBanterRecord(record: BanterHistoryRecord): Promise<void> {
  await dbPut<BanterHistoryRecord>(STORES.BANTER_HISTORY, record);
}

export async function getBanterBySession(sessionId: string): Promise<BanterHistoryRecord[]> {
  return dbGetAllByIndex<BanterHistoryRecord>(STORES.BANTER_HISTORY, "sessionId", sessionId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Clip metadata (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveClipMetadata(clip: ClipMetadataRecord): Promise<void> {
  await dbPut<ClipMetadataRecord>(STORES.CLIP_METADATA, clip);
}

export async function getClipMetadata(id: string): Promise<ClipMetadataRecord | undefined> {
  return dbGet<ClipMetadataRecord>(STORES.CLIP_METADATA, id);
}

// ──────────────────────────────────────────────────────────────────────────────
// Track history (IndexedDB)
// ──────────────────────────────────────────────────────────────────────────────

/** Storage-layer augmentation of Track: adds session context and play timestamp. */
export interface TrackHistoryRecord extends Track {
  sessionId: string;
  playedAt: string;
}

export async function saveTrackHistory(record: TrackHistoryRecord): Promise<void> {
  await dbPut<TrackHistoryRecord>(STORES.TRACK_HISTORY, record);
}

export async function getTrackHistoryBySession(sessionId: string): Promise<TrackHistoryRecord[]> {
  return dbGetAllByIndex<TrackHistoryRecord>(STORES.TRACK_HISTORY, "sessionId", sessionId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Clear all local data
// ──────────────────────────────────────────────────────────────────────────────

export function clearAllLocalData(): void {
  // Clear localStorage entries
  const keysToRemove = Object.keys(localStorage).filter((k) =>
    k.startsWith(LS_PREFIX)
  );
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // IndexedDB data is cleared by deleting the database
  indexedDB.deleteDatabase("hangthedj");
}
