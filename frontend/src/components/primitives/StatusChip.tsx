import React from "react";
import { Chip, ChipProps } from "@mui/material";
import { StatusTone, toneColor } from "../../theme/tokens";

interface StatusChipProps extends Omit<ChipProps, "color"> {
  tone?: StatusTone;
  /** Pulse a dot before the label (e.g. "Live"). */
  dot?: boolean;
}

/**
 * StatusChip — single source of truth for status pills across the app.
 *
 * Replaces MUI Chip's default tone palette with our 6 brand-aligned
 * tones. Pass `tone="green"` for Enriched, "amber" for Needs review,
 * "red" for Bounced/Error, "violet" for Replied/AI, "teal" for Independent.
 */
export const StatusChip: React.FC<StatusChipProps> = ({ tone = "default", dot, label, sx, ...rest }) => {
  const palette = tone !== "default" ? toneColor[tone] : null;
  return (
    <Chip
      size="small"
      label={
        dot ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
            {label}
          </span>
        ) : (
          label
        )
      }
      sx={{
        ...(palette ? { bgcolor: palette.bg, color: palette.fg } : {}),
        ...sx,
      }}
      {...rest}
    />
  );
};
