import { useEffect, useRef, useState, type DragEvent } from "react";
import { hasNativeImport, listenFileDrop } from "@/lib/panorama-import";

interface Options {
  /** Files dropped in the browser (HTML5 drag & drop). */
  onFiles: (files: File[]) => void;
  /** Files dropped from the OS in the desktop app, as paths. */
  onPaths: (paths: string[]) => void;
}

/**
 * A drop target for files, in the browser and in the desktop app.
 *
 * The desktop webview swallows HTML5 drops of OS files (onDrop never fires
 * there), so in the app the zone listens to the native drop event and
 * hit-tests its own element instead. Attach `ref` and spread `dropProps` on
 * the zone; `dragOver` is true while files hover over it.
 */
export function useFileDropZone<T extends HTMLElement = HTMLDivElement>({
  onFiles,
  onPaths,
}: Options) {
  const ref = useRef<T>(null);
  const [dragOver, setDragOver] = useState(false);
  const handlersRef = useRef({ onFiles, onPaths });
  handlersRef.current = { onFiles, onPaths };

  useEffect(() => {
    if (!hasNativeImport()) return;
    const isOver = (x: number, y: number) => {
      const rect = ref.current?.getBoundingClientRect();
      return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listenFileDrop((event) => {
      if (event.type === "leave") {
        setDragOver(false);
      } else if (event.type === "over") {
        setDragOver(isOver(event.x, event.y));
      } else {
        setDragOver(false);
        if (isOver(event.x, event.y) && event.paths.length) {
          handlersRef.current.onPaths(event.paths);
        }
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => console.warn("Could not listen to file drops", e));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) handlersRef.current.onFiles(files);
    },
  };

  return { ref, dragOver, dropProps };
}
