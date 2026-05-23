import React from "react";
import { Box, Typography, Avatar, alpha, IconButton } from "@mui/material";
import {
  DashboardOutlined,
  StorageOutlined,
  ArticleOutlined,
  SendOutlined,
  HistoryOutlined,
  SettingsOutlined,
  SellOutlined,
  PeopleOutlined,
  SearchOutlined,
  LogoutOutlined,
  AutoAwesomeOutlined,
  CloseOutlined,
  ExpandMore,
} from "@mui/icons-material";
import { colors } from "../../theme/tokens";

/**
 * Sidebar — left navigation for SendMaster.
 *
 * Pattern: replaces the old `<AppBar><Tabs>` top-bar in App.tsx with a
 * dedicated left nav. Routes are passed in by the parent so this stays
 * presentational and reusable.
 */
export type NavId =
  | "dashboard"
  | "leads"
  | "templates"
  | "broadcast"
  | "history"
  | "settings"
  | "pricing"
  | "admin";

export interface SidebarProps {
  active: NavId;
  onNavigate: (id: NavId) => void;
  isAdmin?: boolean;
  user: { name: string; email: string; initials: string };
  workspace: { name: string; tagline?: string };
  usage?: { sent: number; cap: number | null; planLabel: string };
  onLogout: () => void;
  adminTenantCount?: number;
  onClose?: () => void;
}

const PIPELINE: {
  id: NavId;
  label: string;
  Icon: typeof DashboardOutlined;
  badge?: string;
}[] = [
  { id: "dashboard", label: "Dashboard", Icon: DashboardOutlined },
  { id: "leads", label: "Leads", Icon: StorageOutlined },
  { id: "templates", label: "Templates", Icon: ArticleOutlined },
  { id: "broadcast", label: "Broadcast", Icon: SendOutlined },
  { id: "history", label: "Sent history", Icon: HistoryOutlined },
];

const WORKSPACE: {
  id: NavId;
  label: string;
  Icon: typeof DashboardOutlined;
}[] = [
  { id: "settings", label: "Settings", Icon: SettingsOutlined },
  { id: "pricing", label: "Plan & billing", Icon: SellOutlined },
];

const SECTION_TITLE_SX = {
  px: 1.25,
  pt: 1.75,
  pb: 0.75,
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: colors.ink4,
  fontWeight: 500,
};

const Item: React.FC<{
  active?: boolean;
  label: string;
  Icon: typeof DashboardOutlined;
  badge?: string;
  onClick?: () => void;
}> = ({ active, label, Icon, badge, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.25,
      py: 0.875,
      px: 1.25,
      borderRadius: 0.75,
      fontSize: 13.5,
      color: active ? colors.ink1 : colors.ink2,
      cursor: "pointer",
      bgcolor: active ? colors.bgElev : "transparent",
      boxShadow: active ? "var(--sh-1)" : "none",
      fontWeight: active ? 500 : 450,
      "&:hover": {
        bgcolor: active ? colors.bgElev : colors.bgSunken,
        color: colors.ink1,
      },
    }}
  >
    <Icon sx={{ fontSize: 16, opacity: 0.85 }} />
    <Box sx={{ flex: 1 }}>{label}</Box>
    {badge && (
      <Box
        sx={{
          fontSize: 11,
          color: colors.ink3,
          fontFamily: "var(--font-mono)",
        }}
      >
        {badge}
      </Box>
    )}
  </Box>
);

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  onNavigate,
  isAdmin,
  user,
  workspace,
  usage,
  onLogout,
  adminTenantCount,
  onClose,
}) => {
  return (
    <Box
      component="aside"
      sx={{
        width: 232,
        flexShrink: 0,
        bgcolor: colors.bg,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Mobile close button */}
      {onClose && (
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            top: 10,
            right: 10,
            color: colors.ink3,
            zIndex: 1,
          }}
        >
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      {/* Brand */}
      <Box
        sx={{
          p: "16px 14px 12px",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            background: "linear-gradient(155deg, #6b6fe3, #4044b9)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(60,60,150,0.25)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="m2 4 6 4 6-4" />
            <path d="M2 4v8h12V4" />
            <path d="m10.5 8 2.5 2.5L10.5 13" />
          </svg>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            SendMaster
          </Typography>
          <Typography
            sx={{ fontSize: 11.5, color: colors.ink3, lineHeight: 1.2 }}
          >
            {workspace.name}
          </Typography>
        </Box>
        <ExpandMore sx={{ fontSize: 16, color: colors.ink3 }} />
      </Box>

      {/* Quick find */}
      <Box sx={{ px: 1.5, pb: 0.5 }}>
        <Box
          sx={{
            height: 32,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            borderRadius: 1,
            bgcolor: colors.bgSunken,
            color: colors.ink3,
            fontSize: 12.5,
            cursor: "pointer",
            "&:hover": { bgcolor: colors.border },
          }}
        >
          <SearchOutlined sx={{ fontSize: 14 }} />
          <span>Quick find</span>
          <Box
            sx={{
              ml: "auto",
              display: "flex",
              gap: 0.25,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
            }}
          >
            <Box
              sx={{
                px: 0.6,
                py: 0.1,
                bgcolor: colors.bgElev,
                border: `1px solid ${colors.border}`,
                borderRadius: 0.5,
              }}
            >
              ⌘
            </Box>
            <Box
              sx={{
                px: 0.6,
                py: 0.1,
                bgcolor: colors.bgElev,
                border: `1px solid ${colors.border}`,
                borderRadius: 0.5,
              }}
            >
              K
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Pipeline */}
      <Box
        sx={{
          p: "6px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "1px",
        }}
      >
        <Box sx={SECTION_TITLE_SX}>Pipeline</Box>
        {PIPELINE.map((i) => (
          <Item
            key={i.id}
            {...i}
            active={active === i.id}
            onClick={() => onNavigate(i.id)}
          />
        ))}
      </Box>

      {/* Workspace */}
      <Box
        sx={{
          p: "6px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "1px",
        }}
      >
        <Box sx={SECTION_TITLE_SX}>Workspace</Box>
        {WORKSPACE.map((i) => (
          <Item
            key={i.id}
            {...i}
            active={active === i.id}
            onClick={() => onNavigate(i.id)}
          />
        ))}
      </Box>

      {/* Admin */}
      {isAdmin && (
        <Box
          sx={{
            p: "6px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
          }}
        >
          <Box sx={{ ...SECTION_TITLE_SX, color: colors.violet }}>
            Admin · internal
          </Box>
          <Item
            label="Tenants"
            Icon={PeopleOutlined}
            active={active === "admin"}
            badge={
              adminTenantCount !== undefined
                ? String(adminTenantCount)
                : undefined
            }
            onClick={() => onNavigate("admin")}
          />
        </Box>
      )}

      <Box sx={{ flex: 1 }} />

      {/* Plan card */}
      {usage && (
        <Box
          sx={{
            mx: 1.25,
            mb: 1.25,
            p: "10px 12px",
            borderRadius: 1.25,
            bgcolor: colors.brandSoft,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
            <AutoAwesomeOutlined
              sx={{ fontSize: 13, color: colors.brandInk }}
            />
            <Typography
              sx={{ fontSize: 12.5, fontWeight: 600, color: colors.brandInk }}
            >
              {usage.planLabel}
            </Typography>
          </Box>
          <Typography
            sx={{ fontSize: 11.5, color: colors.brandInk, opacity: 0.8, mb: 1 }}
          >
            {usage.cap === null
              ? `${usage.sent} emails sent this month · Unlimited`
              : `${usage.sent} of ${usage.cap} emails sent this month`}
          </Typography>
          {usage.cap !== null && (
            <Box
              sx={{
                height: 6,
                bgcolor: alpha(colors.brand, 0.18),
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  width: `${Math.min(100, (usage.sent / usage.cap) * 100)}%`,
                  bgcolor: colors.brand,
                }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* User */}
      <Box
        sx={{
          m: 1,
          p: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          borderRadius: 1,
          cursor: "pointer",
          "&:hover": { bgcolor: colors.bgSunken },
        }}
      >
        <Avatar
          sx={{
            width: 28,
            height: 28,
            fontSize: 11,
            fontWeight: 600,
            background: "linear-gradient(135deg, #d6c8b0, #b39d76)",
          }}
        >
          {user.initials}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.2 }}>
            {user.name}
          </Typography>
          <Typography
            sx={{
              fontSize: 11,
              color: colors.ink3,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </Typography>
        </Box>
        <LogoutOutlined
          sx={{ fontSize: 14, color: colors.ink3 }}
          onClick={onLogout}
        />
      </Box>
    </Box>
  );
};
