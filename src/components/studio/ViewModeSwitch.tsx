import { useTranslation } from "react-i18next";
import { Eye, Network, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "editor" | "preview" | "graph";

const VIEW_MODES = [
  { value: "editor", icon: Pencil, label: "editor.viewer.edit" },
  { value: "preview", icon: Eye, label: "editor.viewer.preview" },
  { value: "graph", icon: Network, label: "editor.viewer.graph" },
] as const;

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** The graph needs at least one scene. */
  graphDisabled?: boolean | undefined;
  className?: string | undefined;
}

/** Floating Edit / Preview / Graph switch, top right of the canvas. */
export function ViewModeSwitch({ value, onChange, graphDisabled, className }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-900/80 p-1 backdrop-blur-md",
        className,
      )}
    >
      {VIEW_MODES.map(({ value: mode, icon: Icon, label }) => (
        <button
          key={mode}
          type="button"
          disabled={mode === "graph" && graphDisabled}
          onClick={() => mode !== value && onChange(mode)}
          aria-pressed={mode === value}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-40",
            mode === value ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {t(label)}
        </button>
      ))}
    </div>
  );
}
