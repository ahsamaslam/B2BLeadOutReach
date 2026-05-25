import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import {
  MenuOutlined,
  NotificationsNoneOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import { colors } from "../../theme/tokens";

interface TopBarProps {
  crumb: string;
  actions?: React.ReactNode;
  hideSearch?: boolean;
  onMenuClick?: () => void;
  onOpenSearch?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  crumb,
  actions,
  hideSearch,
  onMenuClick,
  onOpenSearch,
}) => (
  <Box
    sx={{
      height: 56,
      px: { xs: 2, sm: 3.5 },
      gap: 1.25,
      borderBottom: `1px solid ${colors.border}`,
      display: "flex",
      alignItems: "center",
      bgcolor: colors.bg,
      flexShrink: 0,
    }}
  >
    {onMenuClick && (
      <IconButton
        onClick={onMenuClick}
        size="small"
        sx={{ color: colors.ink2, flexShrink: 0 }}
      >
        <MenuOutlined sx={{ fontSize: 20 }} />
      </IconButton>
    )}

    <Typography noWrap sx={{ fontSize: 13, color: colors.ink3, minWidth: 0 }}>
      <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
        SendMaster{" "}
        <Box component="span" sx={{ mx: 1, color: colors.ink4 }}>
          /
        </Box>
      </Box>
      <Box component="span" sx={{ color: colors.ink1, fontWeight: 500 }}>
        {crumb}
      </Box>
    </Typography>

    <Box sx={{ flex: 1 }} />

    {!hideSearch && (
      <Box
        onClick={onOpenSearch}
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          gap: 1,
          height: 32,
          px: 1.25,
          borderRadius: 1,
          bgcolor: colors.bgElev,
          border: `1px solid ${colors.border}`,
          width: 240,
          color: colors.ink3,
          fontSize: 12.5,
          cursor: "pointer",
          "&:hover": { borderColor: colors.borderStrong },
        }}
      >
        <SearchOutlined sx={{ fontSize: 13 }} />
        Search anything...
      </Box>
    )}

    <IconButton size="small" sx={{ color: colors.ink2, flexShrink: 0 }}>
      <NotificationsNoneOutlined sx={{ fontSize: 18 }} />
    </IconButton>

    {actions}
  </Box>
);
