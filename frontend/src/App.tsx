import React, { useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import { Toaster } from "react-hot-toast";

import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import Portfolio from "./components/Portfolio";
import NicheSearch from "./components/NicheSearch";
import LeadsList from "./components/LeadsList";
import CampaignTemplates from "./components/CampaignTemplates";
import EmailCampaign from "./components/EmailCampaign";
import Settings from "./components/Settings";
import Pricing from "./components/Pricing";
import AdminTenants from "./components/AdminTenants";
import { api, authStorage } from "./services/api";

// Tab indices
const TAB_DASHBOARD = 0;
const TAB_DISCOVER = 1;
const TAB_LEADS = 2;
const TAB_TEMPLATES = 3;
const TAB_CAMPAIGN = 4;
const TAB_PORTFOLIO = 5;
const TAB_SETTINGS = 6;
const TAB_PRICING = 7;
const TAB_ADMIN = 8; // admin only

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_DASHBOARD);
  const [isAdmin, setIsAdmin] = useState(false);
  // IDs pre-selected when navigating from LeadsList → EmailCampaign
  const [campaignLeadIds, setCampaignLeadIds] = useState<number[]>([]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const user = await api.me();
        setIsAuthenticated(true);
        setIsAdmin(user.is_admin ?? false);
      } catch {
        authStorage.clearToken();
        setIsAuthenticated(false);
      }
    };

    bootstrapAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // no-op
    }
    authStorage.clearToken();
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const handleSendToSelected = (ids: number[]) => {
    setCampaignLeadIds(ids);
    setActiveTab(TAB_CAMPAIGN);
  };

  return (
    <>
      <Toaster position="top-right" />
      {isAuthenticated ? (
        <Box>
          <AppBar position="static">
            <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="h6" sx={{ mr: 2, whiteSpace: "nowrap" }}>
                B2B Lead Generation
              </Typography>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}
              >
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  textColor="inherit"
                  TabIndicatorProps={{ style: { backgroundColor: "white" } }}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  <Tab label="Dashboard" />
                  <Tab label="Discover" />
                  <Tab label="Leads" />
                  <Tab label="Templates" />
                  <Tab label="Campaign" />
                  <Tab label="Portfolio" />
                  <Tab label="Settings" />
                  <Tab label="Pricing" />
                  {isAdmin && <Tab label="Admin" />}
                </Tabs>
                <Button
                  color="inherit"
                  onClick={handleLogout}
                  sx={{ ml: "auto", whiteSpace: "nowrap" }}
                >
                  Logout
                </Button>
              </Box>
            </Toolbar>
          </AppBar>

          {activeTab === TAB_DASHBOARD && <Dashboard />}
          {activeTab === TAB_DISCOVER && <NicheSearch />}
          {activeTab === TAB_LEADS && (
            <LeadsList onSendToSelected={handleSendToSelected} />
          )}
          {activeTab === TAB_TEMPLATES && <CampaignTemplates />}
          {activeTab === TAB_CAMPAIGN && (
            <EmailCampaign
              key={campaignLeadIds.join(",")}
              initialSelectedIds={campaignLeadIds}
            />
          )}
          {activeTab === TAB_PORTFOLIO && <Portfolio />}
          {activeTab === TAB_SETTINGS && <Settings />}
          {activeTab === TAB_PRICING && <Pricing />}
          {activeTab === TAB_ADMIN && isAdmin && <AdminTenants />}
        </Box>
      ) : (
        <Login onAuthSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
};

export default App;
