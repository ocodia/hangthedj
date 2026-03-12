/** A music track as represented in HangTheDJ. */
export interface Track {
  /** Spotify track ID */
  id: string;
  title: string;
  artistName: string;
  albumName?: string;
  durationMs?: number;
  artworkUrl?: string;
  /** Spotify URI e.g. spotify:track:xxx */
  uri?: string;
}
