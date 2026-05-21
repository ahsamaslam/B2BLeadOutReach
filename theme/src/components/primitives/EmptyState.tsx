import React from "react";
import { Box, Typography } from "@mui/material";
import { AutoAwesomeOutlined } from "@mui/icons-material";
import { colors, StatusTone, toneColor } from "../../theme/tokens";

export interface EmptyStateProps {
  /** A single MUI icon component, e.g. `<EmailOutlined />`. */
  icon: React.ReactNode;
  tone?: Exclude<StatusTone, "default">;
  title: string;
  /** One sentence under the title, max 440px wide. */
  description: string;
  /** Primary action button — pass a `<Button>`. */
  primaryAction?: React.ReactNode;
  /** Optional secondary action. */
  secondaryAction?: React.ReactNode;
}

/**
 * EmptyState — the friendly first-touch surface for any list that has no rows yet.
 *
 * Used by Leads · Templates · History · any future list. Always pairs a
 * specific icon (matching the page's domain), a single sentence, and a
 * CTA that takes the user to the next step.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon, tone = "brand", title, description, primaryAction, secondaryAction,
}) => {
  const palette = toneColor[tone];
  return (
    <Box sx={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      px: 2.5, py: "60px", textAlign: "center",
    }}>
      <Box sx={{ position: "relative", mb: 3 }}>
        <Box sx={{
          width: 88, height: 88, borderRadius: 3,
          background: `linear-gradient(155deg, ${palette.bg}, ${colors.bgElev})`,
          border: `1px solid ${colors.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: palette.fg, boxShadow: "var(--sh-1)",
          "& > *": { fontSize: 32 },
        }}>
          {icon}
        </Box>
        <Box sx={{
          position: "absolute", top: -6, right: -8,
          width: 22, height: 22, borderRadius: 0.75,
          bgcolor: colors.bgElev, border: `1px solid ${colors.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--sh-1)",
        }}>
          <AutoAwesomeOutlined sx={{ fontSize: 11, color: colors.brand }}/>
        </Box>
      </Box>
      <Typography variant="h2" sx={{ mb: 0.75 }}>{title}</Typography>
      <Typography variant="body2" sx={{ maxWidth: 440, mb: 2.75 }}>{description}</Typography>
      <Box sx={{ display: "flex", gap: 1.25 }}>
        {primaryAction}
        {secondaryAction}
      </Box>
    </Box>
  );
};
