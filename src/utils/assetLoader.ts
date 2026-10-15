import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const JSDELIVR_BASE_URL = 'https://cdn.jsdelivr.net/gh/jamilorain2-netizen/comic-assets@main/';
export const RAW_GITHUB_BASE_URL = 'https://raw.githubusercontent.com/jamilorain2-netizen/comic-assets/main/';

export type ClipLoadStatus = 'loaded' | 'failed' | 'loading';

export interface ClipAttempt {
  url: string;
  status?: number;
  error?: string;
}

export interface ClipStatusInfo {
  name: string;
  status: ClipLoadStatus;
  resolvedUrl?: string;
  resolvedFile?: string;
  error?: string;
  attempts: ClipAttempt[];
}

// Global clip status tracker so UI / Dev Menu / Console can display load results
const clipStatusRegistry: Record<string, ClipStatusInfo> = {};

// Tracks files that failed all attempts so they are NEVER retried again during this session
const failedSessionFiles = new Set<string>();

// Cache resolved GLTF objects so successful files are loaded once and shared
const gltfCache = new Map<string, { gltf: any; fileName: string; url: string }>();

// Deduplicate concurrent in-flight load requests for the same file
const inFlightRequests = new Map<string, Promise<{ gltf: any; fileName: string; url: string } | null>>();

export function getClipStatuses(): Record<string, ClipStatusInfo> {
  return { ...clipStatusRegistry };
}

export function getClipStatus(name: string): ClipStatusInfo | undefined {
  const cleanName = name.replace(/\.glb(\.glb)?$/, '');
  return clipStatusRegistry[cleanName];
}

export function registerClipStatus(
  name: string,
  status: ClipLoadStatus,
  resolvedFile?: string,
  resolvedUrl?: string,
  error?: string,
  attempts?: ClipAttempt[]
) {
  const cleanName = name.replace(/\.glb(\.glb)?$/, '');
  const existing = clipStatusRegistry[cleanName] || { name: cleanName, status: 'loading', attempts: [] };
  clipStatusRegistry[cleanName] = {
    name: cleanName,
    status,
    resolvedFile: resolvedFile || existing.resolvedFile,
    resolvedUrl: resolvedUrl || existing.resolvedUrl,
    error: error || existing.error,
    attempts: attempts || existing.attempts,
  };
}

// Remembers which source worked for each file so we try it first next time
const successfulSourceMap = new Map<string, 'jsdelivr' | 'raw_github'>();

export function getSuccessfulSource(cleanName: string): 'jsdelivr' | 'raw_github' | undefined {
  return successfulSourceMap.get(cleanName);
}

export function setSuccessfulSource(cleanName: string, source: 'jsdelivr' | 'raw_github') {
  successfulSourceMap.set(cleanName, source);
}

export async function preloadEssentialAssets(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const files = [
    'dad_walk',
    'dad_sitdown',
    'dad_sitidle',
    'dad_yell',
    'dad_work',
    'monster_walk',
    'monster_run',
    'monster_roar',
    'monster_attack',
    'run',
    'ty_injured_walk',
    'ty_fall',
    'talk'
  ];
  let loaded = 0;
  await Promise.all(
    files.map(async (file) => {
      try {
        await loadGltfWithFallback(loader, file);
      } catch (err) {
        // ignore individual load errors
      } finally {
        loaded++;
        onProgress?.(loaded, files.length);
      }
    })
  );
}

let essentialsLoadedState = false;
let essentialsPreloadPromise: Promise<void> | null = null;

export function isEssentialsReady(): boolean {
  return essentialsLoadedState;
}

export function startEssentialsPreload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  if (essentialsPreloadPromise) return essentialsPreloadPromise;
  essentialsPreloadPromise = preloadEssentialAssets((l, t) => {
    if (l >= t) essentialsLoadedState = true;
    onProgress?.(l, t);
  }).then(() => {
    essentialsLoadedState = true;
  });
  return essentialsPreloadPromise;
}

/**
 * Robust asynchronous loader with HTTP status inspection, fallback handling,
 * and size error detection:
 *  1. raw.githubusercontent.com .glb FIRST if jsDelivr rejected as too large or previously successful on raw github.
 *  2. Otherwise jsDelivr .glb / .glb.glb first, then raw.githubusercontent.com fallback.
 */
export async function loadGltfWithFallback(
  loader: GLTFLoader,
  baseName: string
): Promise<{ gltf: any; fileName: string; url?: string } | null> {
  const cleanName = baseName.replace(/\.glb(\.glb)?$/, '');

  // If this file already failed all sources this session, never retry
  if (failedSessionFiles.has(cleanName)) {
    return null;
  }

  // If already loaded successfully and cached, return immediately
  if (gltfCache.has(cleanName)) {
    return gltfCache.get(cleanName)!;
  }

  // If currently being loaded, reuse the existing in-flight promise
  if (inFlightRequests.has(cleanName)) {
    return inFlightRequests.get(cleanName)!;
  }

  const loadPromise = (async (): Promise<{ gltf: any; fileName: string; url: string } | null> => {
    registerClipStatus(cleanName, 'loading', undefined, undefined, undefined, []);
    const attempts: ClipAttempt[] = [];

    const bestSource = successfulSourceMap.get(cleanName);
    const rawCandidate = {
      url: `${RAW_GITHUB_BASE_URL}${cleanName}.glb`,
      fileName: `${cleanName}.glb (raw.githubusercontent.com)`,
      sourceType: 'raw_github' as const,
    };
    const jsDelivrCandidates = [
      {
        url: `${JSDELIVR_BASE_URL}${cleanName}.glb`,
        fileName: `${cleanName}.glb`,
        sourceType: 'jsdelivr' as const,
      },
      {
        url: `${JSDELIVR_BASE_URL}${cleanName}.glb.glb`,
        fileName: `${cleanName}.glb.glb`,
        sourceType: 'jsdelivr' as const,
      },
    ];

    // If previously worked on raw github or marked raw github first, try raw github first
    let candidates = bestSource === 'raw_github'
      ? [rawCandidate, ...jsDelivrCandidates]
      : [...jsDelivrCandidates, rawCandidate];


    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const response = await fetch(candidate.url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const gltf = await new Promise<any>((resolve, reject) => {
            loader.parse(
              arrayBuffer,
              candidate.url,
              (parsedGltf) => resolve(parsedGltf),
              (parseErr) => reject(parseErr)
            );
          });

          if (gltf) {
            const result = { gltf, fileName: candidate.fileName, url: candidate.url };
            gltfCache.set(cleanName, result);
            successfulSourceMap.set(cleanName, candidate.sourceType);
            attempts.push({ url: candidate.url, status: response.status });
            registerClipStatus(cleanName, 'loaded', candidate.fileName, candidate.url, undefined, attempts);
            return result;
          }
        } else {
          // HTTP error: read response text (e.g. "File size exceeded the configured limit of 20 MB")
          const errorText = await response.text().catch(() => '');
          const errorSummary = errorText.trim() || response.statusText;
          attempts.push({ url: candidate.url, status: response.status, error: errorSummary });

          // Check if size error
          const isSizeError = response.status === 403 || errorSummary.toLowerCase().includes('size');
          if (isSizeError) {
            successfulSourceMap.set(cleanName, 'raw_github');
            console.warn(
              `[Asset Loader] "${cleanName}" failed on jsDelivr with size limit error: HTTP ${response.status} (${errorSummary}). Will try raw GitHub URL fallback and remember for next time.`
            );
          }
        }
      } catch (networkErr: any) {
        attempts.push({
          url: candidate.url,
          error: networkErr?.message || String(networkErr),
        });
      }
    }

    // All candidates failed: record permanent failure for the session and log one warning
    failedSessionFiles.add(cleanName);
    const lastError = attempts.map((a) => `${a.url} => ${a.status ? `HTTP ${a.status} ` : ''}${a.error || 'error'}`).join(' | ');
    console.warn(
      `[Asset Loader] Failed to load "${cleanName}" after trying jsDelivr (.glb, .glb.glb) and raw.githubusercontent.com (.glb). Never retrying during this session. Details: ${lastError}`
    );
    registerClipStatus(cleanName, 'failed', undefined, undefined, lastError, attempts);
    return null;
  })();

  inFlightRequests.set(cleanName, loadPromise);

  try {
    return await loadPromise;
  } finally {
    inFlightRequests.delete(cleanName);
  }
}

/**
 * Removes root/hips bone position tracks so clips play in place without unwanted displacement.
 * Matches tracks ending in "Hips.position" (or "Root.position"), including any "mixamorig" prefix.
 */
export function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  if (!clip || !clip.tracks) return clip;

  clip.tracks = clip.tracks.filter((track) => {
    const name = track.name;
    const lower = name.toLowerCase();

    const isRootPosTrack =
      name.endsWith('Hips.position') ||
      name.endsWith(':Hips.position') ||
      name.endsWith('Root.position') ||
      lower.endsWith('hips.position') ||
      lower.endsWith('root.position') ||
      (lower.includes('hips') && lower.endsWith('.position')) ||
      (lower.includes('root') && lower.endsWith('.position'));

    return !isRootPosTrack;
  });

  return clip;
}
