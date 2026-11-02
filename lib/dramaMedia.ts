import { getUrlSigner } from "@/lib/b2";
import type { DramaCard, DramaDetail, EpisodeItem } from "@/lib/types";

/**
 * The dramas bucket is private: covers, episode videos and thumbnails are
 * served with signed links (valid for at least a day), like reels. Links that
 * aren't in the bucket pass through unchanged.
 */

/** Public lists/details: covers replaced with signed links. */
export async function signDramaCovers<T extends Pick<DramaCard, "cover">>(items: T[]): Promise<T[]> {
  const sign = await getUrlSigner("dramas", items.map((d) => d.cover || ""));
  return items.map((d) => ({ ...d, cover: d.cover ? sign(d.cover) : d.cover }));
}

export async function signDramaDetail(drama: DramaDetail): Promise<DramaDetail> {
  return (await signDramaCovers([drama]))[0];
}

/** Public episode list: video and thumbnail links replaced with signed ones. */
export async function signEpisodes(episodes: EpisodeItem[]): Promise<EpisodeItem[]> {
  const sign = await getUrlSigner("dramas", episodes.flatMap((e) => [e.playUrl || "", e.thumbnailUrl || ""]));
  return episodes.map((e) => ({
    ...e,
    playUrl: e.playUrl ? sign(e.playUrl) : e.playUrl,
    thumbnailUrl: e.thumbnailUrl ? sign(e.thumbnailUrl) : e.thumbnailUrl,
  }));
}

/**
 * Console: the stored links stay as they are (forms save them back) and signed
 * copies are added as preview fields for display.
 */
export async function withEpisodePreviews(episodes: EpisodeItem[]): Promise<EpisodeItem[]> {
  const sign = await getUrlSigner("dramas", episodes.flatMap((e) => [e.playUrl || "", e.thumbnailUrl || ""]));
  return episodes.map((e) => ({
    ...e,
    previewUrl: e.playUrl ? sign(e.playUrl) : null,
    previewThumbnailUrl: e.thumbnailUrl ? sign(e.thumbnailUrl) : null,
  }));
}

export async function withCoverPreviews<T extends { cover: string | null }>(items: T[]): Promise<(T & { previewCover: string | null })[]> {
  const sign = await getUrlSigner("dramas", items.map((d) => d.cover || ""));
  return items.map((d) => ({ ...d, previewCover: d.cover ? sign(d.cover) : null }));
}
