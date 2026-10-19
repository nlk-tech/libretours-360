import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImageUp, Map, MapPinOff, Plus, Trash2 } from "lucide-react";
import type { Floorplan, FloorplanCorner, FloorplanOffset, Scene } from "@/types/tour";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Formats accepted for floor plan images. */
const FLOORPLAN_ACCEPT = "image/png,image/svg+xml,image/jpeg,image/webp";
const FLOORPLAN_MIME_PATTERN = /image\/(png|svg\+xml|jpeg|webp)/;

/** Common storeys; any other level can still come from an imported project. */
const FLOORPLAN_LEVELS: { value: number; key: string }[] = [
  { value: -2, key: "basement2" },
  { value: -1, key: "basement" },
  { value: -0.5, key: "lowerGround" },
  { value: 0, key: "ground" },
  { value: 0.5, key: "raised" },
  { value: 1, key: "first" },
  { value: 2, key: "second" },
  { value: 3, key: "third" },
  { value: 4, key: "fourth" },
];

const CORNERS: FloorplanCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

interface Props {
  /** Sorted by level. */
  floorplans: Floorplan[];
  floorplanUrls: Record<string, string>;
  scenes: Scene[];
  activeScene: Scene | null;
  showInExport: boolean;
  corner: FloorplanCorner;
  onAdd: (file: File) => void;
  onChange: (id: string, patch: Partial<Pick<Floorplan, "name" | "level">>) => void;
  onReplaceImage: (id: string, file: File) => void;
  onDelete: (id: string) => void;
  onShowInExportChange: (value: boolean) => void;
  onCornerChange: (corner: FloorplanCorner) => void;
  offset: FloorplanOffset;
  onOffsetChange: (patch: Partial<FloorplanOffset>) => void;
  /** Puts the active scene on a floor (in the middle, to be moved on the minimap) or removes it. */
  onSceneFloorChange: (floorplanId: string | null) => void;
}

export function FloorplansPanel({
  floorplans,
  floorplanUrls,
  scenes,
  activeScene,
  showInExport,
  corner,
  onAdd,
  onChange,
  onReplaceImage,
  onDelete,
  onShowInExportChange,
  onCornerChange,
  offset,
  onOffsetChange,
  onSceneFloorChange,
}: Props) {
  const { t } = useTranslation();
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const linkedCount = (id: string) =>
    scenes.filter((s) => s.floorplanPosition?.floorplanId === id).length;
  const levelLabel = (value: number) => {
    const preset = FLOORPLAN_LEVELS.find((l) => l.value === value);
    return preset
      ? t(`editor.sidebar.floorplans.levels.${preset.key}`)
      : t("editor.sidebar.floorplans.levelCustom", { level: value });
  };
  const deleting = floorplans.find((f) => f.id === deletingId) ?? null;

  /** Only images reach the callbacks; the file input's `accept` is just a hint. */
  const withImage = (file: File | undefined, accept: (file: File) => void) => {
    if (!file) return;
    if (FLOORPLAN_MIME_PATTERN.test(file.type)) accept(file);
    else toast.error(t("editor.toasts.floorplanOnlyImages"));
  };

  const pickFile = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = "";
    input.click();
  };

  return (
    <div className="space-y-4">
      <input
        ref={addInputRef}
        type="file"
        accept={FLOORPLAN_ACCEPT}
        className="hidden"
        onChange={(e) => {
          withImage(e.target.files?.[0], onAdd);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={FLOORPLAN_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const id = replacingId;
          if (id) withImage(e.target.files?.[0], (file) => onReplaceImage(id, file));
          setReplacingId(null);
        }}
      />

      {floorplans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-panel p-6 text-center">
          <Map className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-xs font-medium">{t("editor.sidebar.floorplans.title")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("editor.sidebar.floorplans.hint")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {floorplans.map((f) => (
            <div key={f.id} className="space-y-2 rounded-lg border border-border bg-panel p-2">
              <div className="flex items-center gap-2">
                <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {floorplanUrls[f.id] ? (
                    <img
                      src={floorplanUrls[f.id]}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Map className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <Input
                  value={f.name}
                  placeholder={t("editor.sidebar.floorplans.untitled")}
                  onChange={(e) => onChange(f.id, { name: e.target.value })}
                  className="h-7 text-xs"
                  aria-label={t("editor.sidebar.floorplans.name")}
                />
              </div>
              <div className="flex items-center gap-1">
                <Select
                  value={String(f.level)}
                  onValueChange={(v) => onChange(f.id, { level: Number(v) })}
                >
                  <SelectTrigger
                    className="h-7 flex-1 text-xs"
                    aria-label={t("editor.sidebar.floorplans.level")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!FLOORPLAN_LEVELS.some((l) => l.value === f.level) && (
                      <SelectItem value={String(f.level)} className="text-xs">
                        {levelLabel(f.level)}
                      </SelectItem>
                    )}
                    {FLOORPLAN_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={String(l.value)} className="text-xs">
                        {levelLabel(l.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title={t("editor.sidebar.floorplans.replace")}
                  onClick={() => {
                    setReplacingId(f.id);
                    pickFile(replaceInputRef.current);
                  }}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  title={t("editor.sidebar.floorplans.delete")}
                  onClick={() => setDeletingId(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        onClick={() => pickFile(addInputRef.current)}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("editor.sidebar.floorplans.add")}
      </Button>

      {floorplans.length > 0 && (
        <>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("editor.sidebar.floorplans.activeScene")}
            </p>
            {activeScene ? (
              <>
                <Select
                  value={activeScene.floorplanPosition?.floorplanId ?? "none"}
                  onValueChange={(v) => onSceneFloorChange(v === "none" ? null : v)}
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label={t("editor.sidebar.floorplans.sceneFloor")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      {t("editor.sidebar.floorplans.notPlaced")}
                    </SelectItem>
                    {floorplans.map((f) => (
                      <SelectItem key={f.id} value={f.id} className="text-xs">
                        {f.name || t("editor.sidebar.floorplans.untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeScene.floorplanPosition && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full text-xs"
                    onClick={() => onSceneFloorChange(null)}
                  >
                    <MapPinOff className="mr-1.5 h-3.5 w-3.5" />
                    {t("editor.sidebar.floorplans.removeFromFloorplan")}
                  </Button>
                )}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("editor.sidebar.floorplans.placeHelp")}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("editor.sidebar.floorplans.noActiveScene")}
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="floorplan-show-export" className="text-xs">
                {t("editor.sidebar.floorplans.showInExport")}
              </Label>
              <Switch
                id="floorplan-show-export"
                checked={showInExport}
                onCheckedChange={onShowInExportChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("editor.sidebar.floorplans.corner")}</Label>
              <Select value={corner} onValueChange={(v) => onCornerChange(v as FloorplanCorner)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORNERS.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {t(`editor.sidebar.floorplans.corners.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("editor.theme.elements.offsetX")}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={offset.x}
                  onChange={(e) => onOffsetChange({ x: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("editor.theme.elements.offsetY")}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={offset.y}
                  onChange={(e) => onOffsetChange({ y: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("editor.theme.elements.unit")}</Label>
                <Select
                  value={offset.unit}
                  onValueChange={(v) => onOffsetChange({ unit: v as FloorplanOffset["unit"] })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="px">px</SelectItem>
                    <SelectItem value="%">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t("editor.sidebar.floorplans.offsetHelp")}
            </p>
          </div>
        </>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("editor.sidebar.floorplans.deleteTitle", {
                name: deleting?.name || t("editor.sidebar.floorplans.untitled"),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.sidebar.floorplans.deleteConfirm", {
                count: deleting ? linkedCount(deleting.id) : 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) onDelete(deleting.id);
                setDeletingId(null);
              }}
            >
              {t("editor.sidebar.floorplans.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
