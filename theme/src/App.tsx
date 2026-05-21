import React, { useEffect, useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { Toaster } from "react-hot-toast";

import { theme } from "./theme";
import "./theme/tokens.css";

import { Shell, NavId } from "./components";

import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import LeadsList from "./components/LeadsList";
import CampaignTemplates from "./components/CampaignTemplates";
import EmailCampaign from "./components/EmailCampaign";
import History from "./components/History";
import Settings from "./components/Settings";
import Pricing from "./components/Pricing";
import AdminTenants from "./components/AdminTenants";
import { api, authStorage } from "./services/api";

/**
 * App — root wired with SendMaster theme + Shell.
 *
 * This is the drop-in replacement for the old App.tsx. The visible diff:
 *   – AppBar/Tabs/Toolbar are gone.
 *   – Routing-by-tab is now routing-by-Shell (left nav).
 *   – All Page components keep the SAME public API; only how they're
 *     framed changed.
 *
 * Keep this file thin. Anything visual lives inside Shell/Sidebar/etc.
 */
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [active, setActive] = useState<NavId>("dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState({
    name: "Loading…", email: "", initials: "··",
  });
  const [campaignLeadIds, setCampaignLeadIds] = useState<number[]>([]);

  useEffect(() => {
    const bootstrap = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      try {
        const u = await api.me();
        setIsAuthenticated(true);
        setIsAdmin(u.is_admin ?? false);
        setUser({
          name: u.full_name ?? u.email,
          email: u.email,
          initials: deriveInitials(u.full_name ?? u.email),
        });
      } catch {
        authStorage.clearToken();
        setIsAuthenticated(false);
      }
    };
    bootstrap();
  }, []);

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* no-op */ }
    authStorage.clearToken();
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const handleSendToSelected = (ids: number[]) => {
    setCampaignLeadIds(ids);
    setActive("broadcast");
  };

  const screen = (() => {
    switch (active) {
      case "dashboard": return <Dashboard onShowHistory={() => setActive("history")} />;
      case "leads":     return <LeadsList onSendToSelected={handleSendToSelected} />;
      case "templates": return <CampaignTemplates />;
      case "broadcast": return <EmailCampaign key={campaignLeadIds.join(",")} initialSelectedIds={campaignLeadIds} />;
      case "history":   return <History />;
      case "settings":  return <Settings />;
      case "pricing":   return <Pricing />;
      case "admin":     return isAdmin ? <AdminTenants /> : null;
    }
  })();

  const crumb = ({
    dashboard: "Dashboard",
    leads:     "Leads",
    templates: "Templates",
    broadcast: "Broadcast",
    history:   "Sent history",
    settings:  "Settings",
    pricing:   "Plan & billing",
    admin:     "Admin · Tenants",
  } as const)[active];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster position="top-right" />
      {isAuthenticated ? (
        <Shell
          active={active}
          onNavigate={setActive}
          isAdmin={isAdmin}
          user={user}
          workspace={{ name: "UnionLogix workspace" }}
          usage={{ sent: 72, cap: 200, planLabel: "Free plan" }}
          onLogout={handleLogout}
          crumb={crumb}
          flush={active === "broadcast"}
        >
          {screen}
        </Shell>
      ) : (
        <Login onAuthSuccess={() => setIsAuthenticated(true)} />
      )}
    </ThemeProvider>
  );
};

function deriveInitials(s: string): string {
  return s
    .split(/[\s.@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "··";
}

export default App;
