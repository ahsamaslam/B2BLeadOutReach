import React, { useEffect, useState } from "react";
import { AppBar, Box, Button, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { Toaster } from "react-hot-toast";

import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import Portfolio from "./components/Portfolio";
import { api, authStorage } from "./services/api";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        await api.me();
        setIsAuthenticated(true);
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
  };

  return (
    <>
      <Toaster position="top-right" />
      {isAuthenticated ? (
        <Box>
          <AppBar position="static">
            <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="h6">B2B Lead Generation</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  textColor="inherit"
                  TabIndicatorProps={{ style: { backgroundColor: "white" } }}
                >
                  <Tab label="Dashboard" />
                  <Tab label="Portfolio" />
                </Tabs>
                <Button color="inherit" onClick={handleLogout}>
                  Logout
                </Button>
              </Box>
            </Toolbar>
          </AppBar>
          {activeTab === 0 && <Dashboard />}
          {activeTab === 1 && <Portfolio />}
        </Box>
      ) : (
        <Login onAuthSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
};

export default App;
