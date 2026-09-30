import type { AssetMeta } from '@/lib/assets';

/**
 * The local JSON API `interactive-demo dev` mounts under `/__demo/editor/`.
 * Every editor write goes through here; there is no other persistence.
 */
export const EDITOR_API_BASE = '/__demo/editor';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function demoPath(slug: string, resource: string): string {
  return `${EDITOR_API_BASE}/demos/${slug.split('/').map(encodeURIComponent).join('/')}/${resource}`;
}

export interface DemoSummary {
  slug: string;
  title: string;
}

export async function listDemos(): Promise<DemoSummary[]> {
  return json<DemoSummary[]>(await fetch('/__demo/demos', { cache: 'no-store' }));
}

export async function getDemoFiles(slug: string): Promise<{ files: Record<string, string>; binary: string[] }> {
  return json(await fetch(demoPath(slug, 'files'), { cache: 'no-store' }));
}

/** Browsers only honour `keepalive` for bodies up to 64 KB. */
const KEEPALIVE_MAX_BYTES = 60_000;

export async function putDemoFiles(
  slug: string,
  files: Record<string, string>,
  deletions: string[] = [],
  options: { keepalive?: boolean } = {},
): Promise<void> {
  const body = JSON.stringify({ files, delete: deletions });
  await json<{ ok: true }>(
    await fetch(demoPath(slug, 'files'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      // Lets a save started from pagehide outlive the page.
      keepalive: Boolean(options.keepalive) && body.length <= KEEPALIVE_MAX_BYTES,
    }),
  );
}

export interface EmbedSnippets {
  /** Where the built page lands once `dist/` is deployed (host is a placeholder). */
  pageUrl: string;
  inline: string;
  popup: { loader: string; triggers: Record<'html' | 'react' | 'next' | 'vue' | 'svelte', string> };
}

/** The embed snippets for the demo's static build, from the same builders the CLI uses. */
export async function getDemoEmbed(slug: string): Promise<EmbedSnippets> {
  return json(await fetch(demoPath(slug, 'embed'), { cache: 'no-store' }));
}

export async function listDemoAssets(slug: string): Promise<AssetMeta[]> {
  const body = await json<{ assets: AssetMeta[] }>(
    await fetch(demoPath(slug, 'assets'), { cache: 'no-store' }),
  );
  return body.assets ?? [];
}

export async function uploadDemoAsset(args: {
  slug: string;
  name: string;
  blob: Blob;
  contentType: string;
  kind?: string;
}): Promise<AssetMeta> {
  const query = new URLSearchParams({ name: args.name });
  if (args.kind) query.set('kind', args.kind);
  const body = await json<{ ok: true; asset: AssetMeta }>(
    await fetch(`${demoPath(args.slug, 'assets')}?${query.toString()}`, {
      method: 'POST',
      headers: { 'content-type': args.contentType || 'application/octet-stream' },
      body: args.blob,
    }),
  );
  return body.asset;
}

/** One text-to-speech voice a host offers for generated voiceovers. */
export interface HostVoice {
  id: string;
  name: string;
  /** Short character description shown under the name. */
  descriptor: string;
  /** Country/accent the voice reads in; voices are grouped by it. */
  country: string;
  /** A short sample clip the editor can play without generating anything. */
  previewUrl: string;
  isDefault?: boolean;
}

/**
 * Optional features the host serving the editor offers. The CLI's `dev`
 * server offers none (`{}`); a hosting service may advertise more. Every
 * key is optional and the editor hides a feature whose key is absent.
 */
export interface HostCapabilities {
  voiceover?: { voices: HostVoice[]; maxChars: number };
}

function parseHostVoice(value: unknown): HostVoice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  const str = (x: unknown, fallback: string) => (typeof x === 'string' ? x : fallback);
  return {
    id: v.id,
    name: str(v.name, v.id),
    descriptor: str(v.descriptor, ''),
    country: str(v.country, ''),
    previewUrl: str(v.previewUrl, ''),
    ...(v.isDefault === true ? { isDefault: true } : {}),
  };
}

/**
 * What the host offers beyond the file API. Never throws: an older CLI
 * without the endpoint answers with the editor's own `index.html` (200,
 * text/html), and any failure means "no optional features".
 */
export async function getHostCapabilities(): Promise<HostCapabilities> {
  try {
    const res = await fetch(`${EDITOR_API_BASE}/capabilities`, { cache: 'no-store' });
    if (!res.ok) return {};
    if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return {};
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== 'object') return {};
    const caps: HostCapabilities = {};
    const voiceover = (body as { voiceover?: unknown }).voiceover;
    if (voiceover && typeof voiceover === 'object') {
      const raw = (voiceover as { voices?: unknown }).voices;
      const voices = Array.isArray(raw)
        ? raw.map(parseHostVoice).filter((v): v is HostVoice => v !== null)
        : [];
      const maxChars = Number((voiceover as { maxChars?: unknown }).maxChars);
      if (voices.length > 0) {
        caps.voiceover = {
          voices,
          maxChars: Number.isFinite(maxChars) && maxChars > 0 ? maxChars : Infinity,
        };
      }
    }
    return caps;
  } catch {
    return {};
  }
}

/**
 * Ask the host to synthesize `text` in `voiceId` for one step. The host
 * stores the audio as an asset of the demo and returns it, plus the text
 * split into the sentences it read (for caption cues).
 */
export async function generateVoiceover(
  slug: string,
  args: { stepId: string; text: string; voiceId: string },
): Promise<{ asset: AssetMeta; sentences: string[] }> {
  return json(
    await fetch(demoPath(slug, 'voiceover'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    }),
  );
}
