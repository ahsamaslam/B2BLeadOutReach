import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Save,
  Business,
  Email,
  TrackChanges,
  ScheduleSend,
  CheckCircle,
  ExpandMore,
  Info,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import Portfolio from "./Portfolio";

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  branding: {
    label: "Company Branding",
    icon: <Business />,
    color: "#1976d2",
  },
  email: { label: "Email / SMTP", icon: <Email />, color: "#2e7d32" },
  tracking: {
    label: "Email Tracking",
    icon: <TrackChanges />,
    color: "#9c27b0",
  },
  followup: {
    label: "Follow-up Automation",
    icon: <ScheduleSend />,
    color: "#ed6c02",
  },
};

const PLAN_COLORS: Record<
  string,
  "default" | "primary" | "secondary" | "success" | "warning"
> = {
  free: "default",
  starter: "primary",
  professional: "success",
  enterprise: "warning",
};

// Category Section Component
const CategorySection: React.FC<{
  title: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}> = ({ title, icon, color, children }) => {
  const theme = useTheme();
  
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        transition: "all 0.2s",
        "&:hover": {
          borderColor: alpha(color, 0.5),
          boxShadow: `0 4px 12px ${alpha(color, 0.1)}`,
        },
      }}
    >
      {/* Category Header */}
      <Box
        px={3}
        py={2}
        display="flex"
        alignItems="center"
        gap={1.5}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          background: `linear-gradient(135deg, ${alpha(color, 0.05)} 0%, ${alpha(color, 0.02)} 100%)`,
        }}
      >
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: alpha(color, 0.1),
            color: color,
            display: "flex",
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" fontWeight={700} color={color}>
          {title}
        </Typography>
      </Box>
      
      {/* Fields */}
      <Box p={3}>{children}</Box>
    </Paper>
  );
};

const Settings: React.FC = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [settingsTab, setSettingsTab] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  useEffect(() => {
    if (data?.values) {
      setFormValues({ ...data.values });
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateSettings(formValues),
    onSuccess: () => {
      toast.success("Settings saved successfully");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleShow = (key: string) =>
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  const schema = data?.schema ?? {};

  return (
    <Box sx={{ bgcolor: "grey.50", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="lg">
        {/* Tabs */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
            mb: 4,
          }}
        >
          <Tabs
            value={settingsTab}
            onChange={(_, v) => setSettingsTab(v)}
            sx={{
              bgcolor: "white",
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                fontSize: "1rem",
                py: 2,
              },
            }}
          >
            <Tab label="Configuration" />
            <Tab label="Portfolio" />
          </Tabs>
        </Paper>

        {/* Portfolio Tab */}
        {settingsTab === 1 && <Portfolio />}

        {/* Configuration Tab */}
        {settingsTab === 0 && (
          <>
            {/* Header */}
            <Box mb={4}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="flex-start"
                flexWrap="wrap"
                gap={2}
                mb={2}
              >
                <Box>
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    gutterBottom
                    sx={{
                      background:
                        "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Settings
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1.5} mt={1}>
                    <Typography color="text.secondary" fontWeight={500}>
                      {data?.tenant_name}
                    </Typography>
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        bgcolor: "text.secondary",
                      }}
                    />
                    <Chip
                      label={data?.plan?.toUpperCase() ?? "FREE"}
                      color={PLAN_COLORS[data?.plan ?? "free"]}
                      size="small"
                      sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                    />
                  </Box>
                </Box>
                
                <Button
                  variant="contained"
                  size="large"
                  startIcon={
                    saveMutation.isPending ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <Save />
                    )
                  }
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                  sx={{
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                    px: 3,
                    boxShadow: dirty ? theme.shadows[4] : "none",
                    "&:hover": {
                      boxShadow: theme.shadows[8],
                    },
                  }}
                >
                  {saveMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </Box>

              {/* Info Alert */}
              <Alert
                severity="info"
                icon={<Info />}
                sx={{
                  borderRadius: 2,
                  "& .MuiAlert-message": { width: "100%" },
                }}
              >
                <Typography variant="body2" fontWeight={500}>
                  Settings saved here override global environment variables for
                  your workspace.
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={0.5}>
                  Leave a field blank to fall back to the server-level default.
                </Typography>
              </Alert>
            </Box>

            {/* Settings Categories */}
            <Box display="flex" flexDirection="column" gap={3}>
              {Object.entries(schema).map(([category, fields]) => {
                const meta = CATEGORY_META[category] ?? {
                  label: category,
                  icon: <Business />,
                  color: "#333",
                };

                return (
                  <CategorySection
                    key={category}
                    title={meta.label}
                    icon={meta.icon}
                    color={meta.color}
                  >
                    <Grid container spacing={2}>
                      {(
                        fields as Array<{
                          key: string;
                          label: string;
                          type: string;
                        }>
                      ).map((field) => {
                        const isPassword = field.type === "password";
                        const show = showPasswords[field.key] ?? false;
                        
                        return (
                          <Grid item xs={12} md={6} key={field.key}>
                            <TextField
                              fullWidth
                              label={field.label}
                              type={isPassword && !show ? "password" : "text"}
                              value={formValues[field.key] ?? ""}
                              onChange={(e) =>
                                handleChange(field.key, e.target.value)
                              }
                              size="small"
                              sx={{
                                "& .MuiOutlinedInput-root": {
                                  borderRadius: 1.5,
                                },
                              }}
                              InputProps={
                                isPassword
                                  ? {
                                      endAdornment: (
                                        <InputAdornment position="end">
                                          <IconButton
                                            onClick={() => toggleShow(field.key)}
                                            edge="end"
                                            size="small"
                                          >
                                            {show ? (
                                              <VisibilityOff fontSize="small" />
                                            ) : (
                                              <Visibility fontSize="small" />
                                            )}
                                          </IconButton>
                                        </InputAdornment>
                                      ),
                                    }
                                  : undefined
                              }
                            />
                          </Grid>
                        );
                      })}
                    </Grid>
                  </CategorySection>
                );
              })}

              {/* DNS Notice - After Email Category */}
              {schema.email && (
                <Paper
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    overflow: "hidden",
                    border: "2px solid",
                    borderColor: "warning.light",
                  }}
                >
                  <Box
                    px={3}
                    py={2}
                    display="flex"
                    alignItems="center"
                    gap={1.5}
                    sx={{
                      background:
                        "linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)",
                    }}
                  >
                    <Box
                      sx={{
                        fontSize: 28,
                      }}
                    >
                      ⚠️
                    </Box>
                    <Box>
                      <Typography
                        variant="h6"
                        fontWeight={700}
                        color="warning.dark"
                      >
                        DNS & Deliverability — Required for Inbox Delivery
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        mt={0.5}
                      >
                        Configure these at your domain registrar or DNS provider to
                        ensure emails reach inboxes
                      </Typography>
                    </Box>
                  </Box>

                  <Box p={3}>
                    {[
                      {
                        label: "SPF Record",
                        code: "v=spf1 include:your-smtp-provider.com ~all",
                        desc: "Add as a TXT record on your sending domain. Authorizes which IPs can send on your behalf.",
                        color: "#1976d2",
                      },
                      {
                        label: "DKIM Signing",
                        code: "Enable in your SMTP provider dashboard (Hostinger, Google Workspace, etc.)",
                        desc: "Cryptographically signs outgoing emails. Your provider generates the DNS record.",
                        color: "#2e7d32",
                      },
                      {
                        label: "DMARC Record",
                        code: "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com",
                        desc: "Add as a TXT record at _dmarc.yourdomain.com. Ties SPF + DKIM together.",
                        color: "#9c27b0",
                      },
                    ].map(({ label, code, desc, color }) => (
                      <Box key={label} mb={3}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <CheckCircle
                            sx={{ fontSize: 20, color: color }}
                          />
                          <Typography
                            variant="subtitle1"
                            fontWeight={700}
                            color={color}
                          >
                            {label}
                          </Typography>
                        </Box>
                        
                        <Box
                          component="code"
                          sx={{
                            display: "block",
                            bgcolor: alpha(color, 0.05),
                            px: 2,
                            py: 1.5,
                            borderRadius: 1.5,
                            fontFamily: "monospace",
                            fontSize: 13,
                            wordBreak: "break-all",
                            mb: 1,
                            border: "1px solid",
                            borderColor: alpha(color, 0.2),
                            color: "text.primary",
                          }}
                        >
                          {code}
                        </Box>
                        
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ pl: 3.5 }}
                        >
                          {desc}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Settings;
