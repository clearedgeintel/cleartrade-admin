/**
 * Lists the bot image versions available in the registry so the admin can roll
 * the fleet forward or back. Reads the public GHCR image anonymously (the
 * Docker Registry v2 API) — no GitHub token required.
 */

const DEFAULT_IMAGE = 'ghcr.io/clearedgeintel/alpaca-trader:latest';

export interface Release {
  image: string; // full pinned ref, e.g. ghcr.io/.../alpaca-trader:sha-abc
  tag: string; // sha-abc…
  shortSha: string; // abc1234
  isLatest: boolean; // same digest as :latest
}

/** Full image ref the provisioner deploys for new bots (the moving :latest). */
export function latestImageRef(): string {
  return process.env.BOT_DOCKER_IMAGE ?? DEFAULT_IMAGE;
}

/** Repo part without the tag, e.g. ghcr.io/clearedgeintel/alpaca-trader. */
export function baseImageRef(): string {
  const ref = latestImageRef();
  const c = ref.lastIndexOf(':');
  return c > ref.lastIndexOf('/') ? ref.slice(0, c) : ref;
}

/** GHCR registry path, e.g. clearedgeintel/alpaca-trader. */
function registryPath(): string {
  return baseImageRef().replace(/^ghcr\.io\//, '');
}

/** Validate an image ref is one of OUR registry's tags (never deploy arbitrary images). */
export function isAllowedImage(image: string): boolean {
  return image === latestImageRef() || image.startsWith(`${baseImageRef()}:`);
}

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(',');

async function anonToken(repo: string): Promise<string> {
  const res = await fetch(
    `https://ghcr.io/token?scope=repository:${repo}:pull&service=ghcr.io`
  );
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('could not get GHCR pull token');
  return body.token;
}

async function listTags(repo: string, token: string): Promise<string[]> {
  const res = await fetch(`https://ghcr.io/v2/${repo}/tags/list`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GHCR tags/list failed (${res.status})`);
  const body = (await res.json()) as { tags?: string[] };
  return body.tags ?? [];
}

async function manifestDigest(
  repo: string,
  token: string,
  tag: string
): Promise<string | null> {
  const res = await fetch(`https://ghcr.io/v2/${repo}/manifests/${tag}`, {
    method: 'HEAD',
    headers: { authorization: `Bearer ${token}`, accept: MANIFEST_ACCEPT },
  });
  return res.ok ? res.headers.get('docker-content-digest') : null;
}

/**
 * Returns the available `:sha-…` releases, with the one matching `:latest`
 * flagged. Best-effort and bounded — there are only a handful of tags.
 */
export async function listReleases(): Promise<Release[]> {
  const repo = registryPath();
  const base = baseImageRef();
  const token = await anonToken(repo);

  const tags = await listTags(repo, token);
  const shaTags = tags.filter((t) => t.startsWith('sha-')).slice(0, 30);

  const latestDigest = await manifestDigest(repo, token, 'latest').catch(
    () => null
  );

  const releases = await Promise.all(
    shaTags.map(async (tag) => {
      const digest = await manifestDigest(repo, token, tag).catch(() => null);
      return {
        image: `${base}:${tag}`,
        tag,
        shortSha: tag.replace(/^sha-/, '').slice(0, 7),
        isLatest: !!latestDigest && digest === latestDigest,
      };
    })
  );

  // latest first; the rest in whatever order the registry returned.
  releases.sort((a, b) => Number(b.isLatest) - Number(a.isLatest));
  return releases;
}

/**
 * Resolves the moving `:latest` tag to the immutable `:sha-…` ref it currently
 * points at, so a freshly provisioned bot is pinned to an exact commit. Falls
 * back to `:latest` if the registry can't be read.
 */
export async function resolveLatestImage(): Promise<string> {
  try {
    const releases = await listReleases();
    return releases.find((r) => r.isLatest)?.image ?? latestImageRef();
  } catch {
    return latestImageRef();
  }
}

/** Short, human label for an image ref stored on a tenant. */
export function imageLabel(image: string | null | undefined): string {
  if (!image) return 'unknown';
  const tag = image.slice(image.lastIndexOf(':') + 1);
  if (tag === 'latest') return 'latest';
  if (tag.startsWith('sha-')) return tag.replace(/^sha-/, '').slice(0, 7);
  return tag;
}
