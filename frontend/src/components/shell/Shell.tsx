import React, { useState } from "react";
import { Box, Drawer, useMediaQuery, useTheme } from "@mui/material";
import { Sidebar, NavId, SidebarProps } from "./Sidebar";
import { TopBar } from "./TopBar";
import { colors } from "../../theme/tokens";

interface ShellProps extends SidebarProps {
  /** Last segment of the breadcrumb on the top bar. */
  crumb: string;
  /** Right-aligned actions in the top bar. */
  topBarActions?: React.ReactNode;
  /** Hide the top bar search input. */
  hideSearch?: boolean;
  /** Page body — your screen content goes here. */
  children: React.ReactNode;
  /** Remove the default 28px padding around children (split-view screens). */
  flush?: boolean;
  /** Badge count on the Tenants sidebar item. */
  adminTenantCount?: number;
}

/**
 * Shell — the canonical layout wrapper.
 *
 * This is the single component your screens get rendered inside. It
 * replaces the AppBar+Tabs setup in your current App.tsx.
 *
 * Example:
 *
 *   <Shell
 *     active="dashboard"
 *     onNavigate={setActiveTab}
 *     crumb="Dashboard"
 *     user={user}
 *     workspace={{ name: "UnionLogix workspace" }}
 *     usage={{ sent: 72, cap: 200, planLabel: "Free plan" }}
 *     onLogout={handleLogout}
 *   >
 *     <DashboardPage />
 *   </Shell>
 */
export const Shell: React.FC<ShellProps> = ({
  crumb,
  topBarActions,
  hideSearch,
  children,
  flush,
  adminTenantCount,
  ...sidebarProps
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100vh",
        bgcolor: colors.bg,
      }}
    >
      {/* Desktop: permanent sidebar */}
      {!isMobile && (
        <Sidebar {...sidebarProps} adminTenantCount={adminTenantCount} />
      )}

      {/* Mobile: temporary drawer */}
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { width: 232, boxSizing: "border-box" },
        }}
      >
        <Sidebar
          {...sidebarProps}
          adminTenantCount={adminTenantCount}
          onClose={() => setMobileOpen(false)}
        />
      </Drawer>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          bgcolor: colors.bg,
        }}
      >
        <TopBar
          crumb={crumb}
          actions={topBarActions}
          hideSearch={hideSearch}
          onMenuClick={isMobile ? () => setMobileOpen(true) : undefined}
        />
        <Box
          sx={{ flex: 1, overflow: "auto", p: flush ? 0 : { xs: 2, sm: 3.5 } }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export type { NavId };
