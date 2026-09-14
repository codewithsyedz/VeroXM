// Media items embedded in content relations (icon/image/favicon/ogimage
// fields) only carry raw storage metadata (name, disk, dimensions) -- no
// ready-made URL, unlike MediaResource.list()'s MediaItem which has
// fullUrl/thumbUrl built in. This mirrors apps/api's LocalStorageProvider
// (apps/api/src/media/storage/local-storage.provider.ts): urlFor() ==
// `${APP_URL}/uploads/{projectUuid}/{filename}`, thumbUrlFor() adds
// `/thumb` before the project UUID. APP_URL in this deployment is the
// real production media host, reachable directly from the browser (CORS
// blocks fetch() to it, but plain <img> tags load it fine).
const MEDIA_HOST = "https://cms.node2cloud.com";

export interface RawMediaRef {
  id: number;
  name: string;
  disk: string;
  type: string;
  width: number | null;
  height: number | null;
  size: number | null;
  caption: string | null;
}

export function mediaUrl(projectUuid: string, media: RawMediaRef | null | undefined): string | null {
  if (!media) return null;
  return `${MEDIA_HOST}/uploads/${projectUuid}/${media.name}`;
}

export function mediaThumbUrl(projectUuid: string, media: RawMediaRef | null | undefined): string | null {
  if (!media) return null;
  return `${MEDIA_HOST}/uploads/thumb/${projectUuid}/${media.name}`;
}
