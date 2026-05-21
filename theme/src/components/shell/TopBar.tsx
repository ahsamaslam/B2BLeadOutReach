import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { NotificationsNoneOutlined, SearchOutlined } from "@mui/icons-material";
import { colors } from "../../theme/tokens";

interface TopBarProps {
  /** Last segment of the breadcrumb — the bold one. */
  crumb: string;
  /** Right-aligned actions (buttons, chips). */
  actions?: React.ReactNode;
  /** Hide the search box (e.g. on dense screens like Broadcast). */
  hideSearch?: boolean;
}

/**
 * TopBar — fixed-height bar at the top of every authed screen.
 * Sits inside the main column to the right of <Sidebar/>.
 */
export const TopBar: React.FC<TopBarProps> = ({ crumb, actions, hideSearch }) => (
  <Box
    sx={{
      height: 56, px: 3.5, gap: 1.75,
      borderBottom: `1px solid ${colors.border}`,
      display: "flex", alignItems: "center",
      bgcolor: colors.bg,
    }}
  >
    <Typography sx={{ fontSize: 13, color: colors.ink3 }}>
      SendMaster <Box component="span" sx={{ mx: 1, color: colors.ink4 }}>/</Box>
      <Box component="span" sx={{ color: colors.ink1, fontWeight: 500 }}>{crumb}</Box>
    </Typography>

    <Box sx={{ flex: 1 }} />

    {!hideSearch && (
      <Box sx={{
        display: "flex", alignItems: "center", gap: 1,
        height: 32, px: 1.25, borderRadius: 1,
        bgcolor: colors.bgElev, border: `1px solid ${colors.border}`,
        width: 240, color: colors.ink3, fontSize: 12.5, cursor: "pointer",
      }}>
        <SearchOutlined sx={{ fontSize: 13 }} />
        Search anything…
      </Box>
    )}

    <IconButton size="small" sx={{ color: colors.ink2 }}>
      <NotificationsNoneOutlined sx={{ fontSize: 18 }} />
    </IconButton>

    {actions}
  </Box>
);
