import React from "react";
import { Box, Typography } from "@mui/material";

export interface PageHeaderProps {
  /** Small mono uppercase line above the title (e.g. "Step 1 of 3"). */
  eyebrow?: string;
  title: string;
  /** Optional one-sentence subtitle (max 540px wide). */
  description?: string;
  /** Right-aligned action area — buttons, stats, anything. */
  actions?: React.ReactNode;
}

/**
 * PageHeader — every screen starts with one of these.
 *
 * Eyebrow + h1 + description on the left, optional actions on the right.
 * Consistent vertical rhythm: 22px margin-bottom.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => (
  <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", mb: 2.75, gap: 2 }}>
    <Box>
      {eyebrow && <Typography variant="overline" sx={{ mb: 0.75, display: "block" }}>{eyebrow}</Typography>}
      <Typography variant="h2" sx={{ m: 0 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ mt: 0.75, maxWidth: 540 }}>{description}</Typography>}
    </Box>
    {actions && <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>{actions}</Box>}
  </Box>
);
