/**
 * Importing panoramas into a project.
 *
 *  - Native dialog (`pickPanoramaPaths` + `importPanoramaPaths`, only where
 *    `hasNativeImport()`): the user picks files with the OS dialog, which grants
 *    access to exactly those files; each one is copied natively straight into
 *    the project's panoramas folder, so the image never travels through the
 *    WebView's memory.
 *    Files dropped onto the desktop window arrive as paths too
 *    (`listenFileDrop`) and take the same route.
 *  - Browser drag & drop and the file input (`importPanoramaFiles`): File
 *    objects are read into memory and stored through `putBlob`.
 *
 * Both work with whatever storage driver is active. A JPEG thumbnail is
 * generated for every imported panorama. A failed thumbnail never fails the
 * import; it is reported in the result instead.
 */
import { uid } from "@/types/tour";
import { deleteBlobs, getBlob, putBlob } from "./assets";
import { makeAssetRef, parseAssetRef } from "./storage-layout";
import { getStorageProvider, type FileDropEvent } from "./storage-provider";
import { generateThumbnail } from "./thumbnails";

export const PANORAMA_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const UNSUPPORTED_MESSAGE = "Only JPG, PNG or WebP panoramas are supported.";

export interface ImportedPanorama {
  /** Reference to store in Scene.panoramaUrl ("tauri:<key>", see storage-layout.ts). */
  ref: string;
  /** Suggested scene name (file name without extension). */
  name: string;
  /** True if the panorama was imported but its dashboard thumbnail could not be made. */
  thumbnailFailed: boolean;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function extensionOf(fileName: string): string | null {
  const ext = fileName.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return ext && PANORAMA_EXTENSIONS.includes(ext) ? ext : null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/** Generates and stores the thumbnail of a stored panorama; false on failure. */
export async function makeThumbnail(
  projectId: string,
  ref: string,
  source: Blob,
): Promise<boolean> {
  const key = parseAssetRef(ref);
  if (!key) return true; // not stored in the project: nothing to preview
  try {
    await getStorageProvider().writeThumbnail(projectId, key, await generateThumbnail(source));
    return true;
  } catch (e) {
    console.warn(`[storage] Could not create a thumbnail for ${ref}:`, e);
    return false;
  }
}

async function rollback(projectId: string, refs: string[]) {
  await deleteBlobs(projectId, refs).catch((e) =>
    console.warn("[storage] Could not remove partially imported panoramas:", e),
  );
}

/** Called before each file is imported: `current` is 1-based. */
export type ImportProgress = (current: number, total: number, name: string) => void;

/** True where the OS can pick and copy files for us (the desktop app). */
export function hasNativeImport(): boolean {
  return getStorageProvider().nativeImport !== undefined;
}

/**
 * Opens the native file dialog. Returns the chosen paths, or null if the user
 * cancelled. Only meaningful where `hasNativeImport()`.
 */
export async function pickPanoramaPaths(): Promise<string[] | null> {
  const native = getStorageProvider().nativeImport;
  if (!native) throw new Error("Native file import is not available here");
  return await native.pick();
}

/**
 * Listens to files dropped onto the desktop window (see NativeImport.listenFileDrop).
 * Only meaningful where `hasNativeImport()`.
 */
export async function listenFileDrop(handler: (event: FileDropEvent) => void): Promise<() => void> {
  const native = getStorageProvider().nativeImport;
  if (!native) throw new Error("Native file import is not available here");
  return await native.listenFileDrop(handler);
}

/** Reads a file dropped onto the desktop window into memory (small files only, e.g. a logo). */
export async function readDroppedFile(path: string): Promise<File> {
  const native = getStorageProvider().nativeImport;
  if (!native) throw new Error("Native file import is not available here");
  return await native.readDroppedFile(path);
}

/**
 * Imports panoramas chosen with the native dialog (or dropped onto the window) by copying the files natively.
 * All-or-nothing: if one file fails, the ones already copied are removed.
 */
export async function importPanoramaPaths(
  projectId: string,
  paths: string[],
  onProgress?: ImportProgress,
): Promise<ImportedPanorama[]> {
  const supported = paths.filter((p) => extensionOf(baseName(p)));
  if (!supported.length) throw new Error(UNSUPPORTED_MESSAGE);

  const native = getStorageProvider().nativeImport;
  if (!native) throw new Error("Native file import is not available here");

  const imported: ImportedPanorama[] = [];
  try {
    for (const [i, path] of supported.entries()) {
      const fileName = baseName(path);
      onProgress?.(i + 1, supported.length, fileName);
      const ext = extensionOf(fileName)!.replace("jpeg", "jpg");
      const key = `${uid("pano")}.${ext}`;
      const ref = makeAssetRef(key);

      await native.copyIntoProject(projectId, path, key);
      imported.push({ ref, name: stripExtension(fileName), thumbnailFailed: true });

      // Thumbnails are best-effort: read the copy back and downscale it.
      const copy = await getBlob(projectId, ref).catch(() => null);
      imported[imported.length - 1]!.thumbnailFailed = !(
        copy && (await makeThumbnail(projectId, ref, copy))
      );
    }
  } catch (e) {
    await rollback(
      projectId,
      imported.map((i) => i.ref),
    );
    throw e;
  }
  return imported;
}

/**
 * Imports File objects (drag & drop, browser file input). Files are read into
 * memory, so where a native dialog exists prefer it for large panoramas.
 * All-or-nothing, like importPanoramaPaths.
 */
export async function importPanoramaFiles(
  projectId: string,
  files: File[],
  onProgress?: ImportProgress,
): Promise<ImportedPanorama[]> {
  const imported: ImportedPanorama[] = [];
  try {
    for (const [i, file] of files.entries()) {
      onProgress?.(i + 1, files.length, file.name);
      const ref = await putBlob(projectId, uid("pano"), file);
      const ok = await makeThumbnail(projectId, ref, file);
      imported.push({ ref, name: stripExtension(file.name), thumbnailFailed: !ok });
    }
  } catch (e) {
    await rollback(
      projectId,
      imported.map((i) => i.ref),
    );
    throw e;
  }
  return imported;
}
