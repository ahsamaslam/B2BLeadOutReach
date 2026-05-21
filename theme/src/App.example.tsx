/**
 * Example: src/App.tsx after migration
 *
 * Shows the canonical wiring: theme + Shell + page routing. Replace
 * each <Placeholder> with the corresponding page component once
 * migrated. Page components stay the same — only the chrome around
 * them changes.
 */

import React, { useEffect, useState } from "react";
import { ThemeProvider, CssBaseline, Box, Typography } from "@mui/material";
import { Toaster } from "react-hot-toast";

import { theme } from "./theme";
import { Shell, NavId } from "./components/shell";

// Existing page components — unchanged
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

const CRUMB: Record<NavId, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  templates: "Templates",
  broadcast: "Broadcast",
  history: "Sent history",
  settings: "Settings",
  pricing: "Plan & billing",
  admin: "Admin · Tenants",
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<NavId>("dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState({ name: "Syed Ahsam", email: "sales@unionlogix.com", initials: "SA" });
  const [campaignLeadIds, setCampaignLeadIds] = useState<number[]>([]);

  useEffect(() => {
    (async () => {
      const token = authStorage.getToken();
      if (!token) return setIsAuthenticated(false);
      try {
        const u = await api.me();
        setIsAuthenticated(true);
        setIsAdmin(u.is_admin ?? false);
        if (u.name)  setUser((s) => ({ ...s, name: u.name }));
        if (u.email) setUser((s) => ({ ...s, email: u.email, initials: initials(u.name ?? u.email) }));
      } catch {
        authStorage.clearToken();
        setIsAuthenticated(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    authStorage.clearToken();
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const handleSendToSelected = (ids: number[]) => {
    setCampaignLeadIds(ids);
    setActiveTab("broadcast");
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster position="top-right" />
      {!isAuthenticated ? (
        <Login onAuthSuccess={() => setIsAuthenticated(true)} />
      ) : (
        <Shell
          active={activeTab}
          onNavigate={setActiveTab}
          isAdmin={isAdmin}
          user={user}
          workspace={{ name: "UnionLogix workspace" }}
          usage={{ sent: 72, cap: 200, planLabel: "Free plan" }}
          onLogout={handleLogout}
          crumb={CRUMB[activeTab]}
        >
          {activeTab === "dashboard" && <Dashboard onShowHistory={() => setActiveTab("history")} />}
          {activeTab === "leads"     && <LeadsList onSendToSelected={handleSendToSelected} />}
          {activeTab === "templates" && <CampaignTemplates />}
          {activeTab === "broadcast" && <EmailCampaign key={campaignLeadIds.join(",")} initialSelectedIds={campaignLeadIds} />}
          {activeTab === "history"   && <History />}
          {activeTab === "settings"  && <Settings />}
          {activeTab === "pricing"   && <Pricing />}
          {activeTab === "admin"     && isAdmin && <AdminTenants />}
        </Shell>
      )}
    </ThemeProvider>
  );
};

function initials(s: string): string {
  return s.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default App;
