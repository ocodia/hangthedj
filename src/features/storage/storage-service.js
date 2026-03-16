/**
 * StorageService: facade over IndexedDB and localStorage.
 * All persistent reads/writes in the app go through here.
 */

import { dbGet, dbPut, dbDelete, dbGetAll, dbGetAllByIndex, openDatabase, STORES } from "./indexeddb.js";

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_PREFIX = "hangthedj:";
const LS_OPENAI_KEY = `${LS_PREFIX}openai_key`;
const LS_SPOTIFY_ACCESS_TOKEN = `${LS_PREFIX}spotify_access_token`;
const LS_SPOTIFY_REFRESH_TOKEN = `${LS_PREFIX}spotify_refresh_token`;
const LS_SPOTIFY_TOKEN_EXPIRY = `${LS_PREFIX}spotify_token_expiry`;
const LS_SETTINGS = `${LS_PREFIX}settings`;
const LS_SPOTIFY_CLIENT_ID = `${LS_PREFIX}spotify_client_id`;
const LS_ELEVENLABS_KEY = `${LS_PREFIX}elevenlabs_key`;
const LS_ELEVENLABS_VOICE_ID = `${LS_PREFIX}elevenlabs_voice_id`;

// ── Default settings (exported so app-store can import it) ───────────────────

export const DEFAULT_SETTINGS = {
  activePersonaId: null,
  defaultMood: "freestyle",
  schedulerConfig: { djFrequency: "every", requestBehaviour: "responsive", familySafe: true },
  audioTransition: {
    currentTrackOutroDipSeconds: 5,
    nextTrackIntroDipSeconds: 5,
  },
  keyWarningDismissed: false,
  installPromptShown: false,
  debugMode: false,
};

// ── Initialization ────────────────────────────────────────────────────────────

export async function initStorage() {
  await openDatabase();
}

// ── OpenAI key (localStorage) ─────────────────────────────────────────────────

export function setOpenAIKey(key) {
  localStorage.setItem(LS_OPENAI_KEY, key);
}

export function getOpenAIKey() {
  return localStorage.getItem(LS_OPENAI_KEY);
}

export function clearOpenAIKey() {
  localStorage.removeItem(LS_OPENAI_KEY);
}

export function hasOpenAIKey() {
  const key = getOpenAIKey();
  return key !== null && key.trim().length > 0;
}

// ── ElevenLabs key (localStorage) ─────────────────────────────────────────────

export function setElevenLabsKey(key) {
  localStorage.setItem(LS_ELEVENLABS_KEY, key);
}

export function getElevenLabsKey() {
  return localStorage.getItem(LS_ELEVENLABS_KEY);
}

export function clearElevenLabsKey() {
  localStorage.removeItem(LS_ELEVENLABS_KEY);
}

export function hasElevenLabsKey() {
  const key = getElevenLabsKey();
  return key !== null && key.trim().length > 0;
}

// ── ElevenLabs voice ID (localStorage) ────────────────────────────────────────

export function setElevenLabsVoiceId(id) {
  localStorage.setItem(LS_ELEVENLABS_VOICE_ID, id);
}

export function getElevenLabsVoiceId() {
  return localStorage.getItem(LS_ELEVENLABS_VOICE_ID);
}

export function clearElevenLabsVoiceId() {
  localStorage.removeItem(LS_ELEVENLABS_VOICE_ID);
}

// ── Spotify Client ID (localStorage) ─────────────────────────────────────────

export function setSpotifyClientId(id) {
  localStorage.setItem(LS_SPOTIFY_CLIENT_ID, id);
}

export function getSpotifyClientId() {
  return localStorage.getItem(LS_SPOTIFY_CLIENT_ID);
}

export function clearSpotifyClientId() {
  localStorage.removeItem(LS_SPOTIFY_CLIENT_ID);
}

export function hasSpotifyClientId() {
  const id = getSpotifyClientId();
  return id !== null && id.trim().length > 0;
}

// ── Spotify tokens (localStorage) ────────────────────────────────────────────

export function setSpotifyTokens(accessToken, refreshToken, expiryMs) {
  localStorage.setItem(LS_SPOTIFY_ACCESS_TOKEN, accessToken);
  localStorage.setItem(LS_SPOTIFY_REFRESH_TOKEN, refreshToken);
  localStorage.setItem(LS_SPOTIFY_TOKEN_EXPIRY, String(expiryMs));
}

export function getSpotifyTokens() {
  const accessToken = localStorage.getItem(LS_SPOTIFY_ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(LS_SPOTIFY_REFRESH_TOKEN);
  const expiryRaw = localStorage.getItem(LS_SPOTIFY_TOKEN_EXPIRY);
  return {
    accessToken,
    refreshToken,
    expiryMs: expiryRaw ? Number(expiryRaw) : null,
  };
}

export function clearSpotifyTokens() {
  localStorage.removeItem(LS_SPOTIFY_ACCESS_TOKEN);
  localStorage.removeItem(LS_SPOTIFY_REFRESH_TOKEN);
  localStorage.removeItem(LS_SPOTIFY_TOKEN_EXPIRY);
}

// ── App settings (localStorage) ───────────────────────────────────────────────

export function saveSettings(settings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(normalizeSettings(settings)));
}

export function loadSettings() {
  const raw = localStorage.getItem(LS_SETTINGS);
  if (!raw) return normalizeSettings(DEFAULT_SETTINGS);
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

export function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    schedulerConfig: {
      ...DEFAULT_SETTINGS.schedulerConfig,
      ...(settings.schedulerConfig ?? {}),
    },
    audioTransition: {
      ...DEFAULT_SETTINGS.audioTransition,
      ...(settings.audioTransition ?? {}),
    },
  };
}

// ── Personas (IndexedDB) ──────────────────────────────────────────────────────

export async function savePersona(persona) {
  await dbPut(STORES.PERSONAS, persona);
}

export async function getPersona(id) {
  return dbGet(STORES.PERSONAS, id);
}

export async function getAllPersonas() {
  return dbGetAll(STORES.PERSONAS);
}

export async function deletePersona(id) {
  await dbDelete(STORES.PERSONAS, id);
}

// ── Requests (IndexedDB) ──────────────────────────────────────────────────────

export async function saveRequest(request) {
  await dbPut(STORES.REQUESTS, request);
}

export async function getRequest(id) {
  return dbGet(STORES.REQUESTS, id);
}

export async function getRequestsBySession(sessionId) {
  return dbGetAllByIndex(STORES.REQUESTS, "sessionId", sessionId);
}

export async function updateRequestStatus(id, status, spokenAcknowledgement, promisedForLater) {
  const req = await getRequest(id);
  if (!req) return;
  const updated = {
    ...req,
    status,
    spokenAcknowledgement: spokenAcknowledgement !== undefined ? spokenAcknowledgement : req.spokenAcknowledgement,
    promisedForLater: promisedForLater !== undefined ? promisedForLater : req.promisedForLater,
  };
  await saveRequest(updated);
}

// ── Sessions (IndexedDB) ──────────────────────────────────────────────────────

export async function saveSession(session) {
  await dbPut(STORES.SESSIONS, session);
}

export async function getSession(id) {
  return dbGet(STORES.SESSIONS, id);
}

export async function getAllSessions() {
  return dbGetAll(STORES.SESSIONS);
}

// ── Session memory (IndexedDB) ────────────────────────────────────────────────

export async function saveSessionMemory(memory) {
  await dbPut(STORES.SESSION_MEMORY, memory);
}

export async function getSessionMemory(sessionId) {
  return dbGet(STORES.SESSION_MEMORY, sessionId);
}

// ── Banter history (IndexedDB) ────────────────────────────────────────────────

export async function saveBanterRecord(record) {
  await dbPut(STORES.BANTER_HISTORY, record);
}

export async function getBanterBySession(sessionId) {
  return dbGetAllByIndex(STORES.BANTER_HISTORY, "sessionId", sessionId);
}

// ── Clip metadata (IndexedDB) ─────────────────────────────────────────────────

export async function saveClipMetadata(clip) {
  await dbPut(STORES.CLIP_METADATA, clip);
}

export async function getClipMetadata(id) {
  return dbGet(STORES.CLIP_METADATA, id);
}

// ── Track history (IndexedDB) ─────────────────────────────────────────────────

export async function saveTrackHistory(record) {
  await dbPut(STORES.TRACK_HISTORY, record);
}

export async function getTrackHistoryBySession(sessionId) {
  return dbGetAllByIndex(STORES.TRACK_HISTORY, "sessionId", sessionId);
}

// ── Clear all local data ──────────────────────────────────────────────────────

export function clearAllLocalData() {
  const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  indexedDB.deleteDatabase("hangthedj");
}
