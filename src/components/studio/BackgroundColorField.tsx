import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const FALLBACK_HEX = "#18181b";

interface Props {
  label: string;
  /** A CSS color, "transparent", or unset (shown as the fallback shade). */
  value: string | undefined;
  onChange: (value: string) => void;
}

/** A background color picker with a "transparent" option. */
export function BackgroundColorField({ label, value, onChange }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const transparent = value === "transparent";
  // The last solid color picked, restored when "transparent" is unticked.
  const lastHexRef = useRef(toHexColor(value));
  if (!transparent) lastHexRef.current = toHexColor(value);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="color"
        className="h-8 w-full p-1 disabled:opacity-40"
        value={lastHexRef.current}
        disabled={transparent}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center gap-1.5">
        <Checkbox
          id={id}
          checked={transparent}
          onCheckedChange={(checked) =>
            onChange(checked === true ? "transparent" : lastHexRef.current)
          }
        />
        <Label htmlFor={id} className="cursor-pointer text-[11px] font-normal">
          {t("editor.theme.elements.transparent")}
        </Label>
      </div>
    </div>
  );
}

/** A color <input> needs a #rrggbb value; falls back to a neutral dark shade for rgba()/named/unset colors. */
function toHexColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_HEX;
}
