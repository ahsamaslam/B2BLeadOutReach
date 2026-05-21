import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { Check, Star } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { PageHeader, StatusChip } from "./primitives";
import { colors } from "../theme/tokens";

interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  tagline: string;
  color: string;
  recommended?: boolean;
  features: string[];
  limits: Record<string, string>;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    tagline: "Try the platform with no commitment",
    color: colors.ink3,
    features: [
      "10 leads per month",
      "Basic email sending",
      "CSV export",
      "1 user",
    ],
    limits: {
      "Leads / month": "10",
      "Email campaigns": "Basic",
      "AI scraping": "Limited",
      "LinkedIn outreach": "—",
      "Portfolio uploads": "—",
      Support: "Community",
    },
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    period: "month",
    tagline: "Perfect for freelancers and small teams",
    color: colors.brand,
    features: [
      "100 leads per month",
      "Full email campaigns",
      "CSV & XLSX export",
      "PDF portfolio attachment",
      "3 users",
      "Email open tracking",
    ],
    limits: {
      "Leads / month": "100",
      "Email campaigns": "Full",
      "AI scraping": "Full",
      "LinkedIn outreach": "Manual",
      "Portfolio uploads": "5 files",
      Support: "Email",
    },
  },
  {
    id: "professional",
    name: "Professional",
    price: 149,
    period: "month",
    tagline: "For growing agencies",
    color: colors.green,
    recommended: true,
    features: [
      "500 leads per month",
      "LinkedIn outreach automation",
      "Campaign templates",
      "Advanced analytics",
      "10 users",
      "Priority support",
    ],
    limits: {
      "Leads / month": "500",
      "Email campaigns": "Full",
      "AI scraping": "Full",
      "LinkedIn outreach": "Automated",
      "Portfolio uploads": "Unlimited",
      Support: "Priority",
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    period: "month",
    tagline: "Unlimited scale, white-label ready",
    color: colors.violet,
    features: [
      "Unlimited leads",
      "White-label branding",
      "Custom AI model",
      "Multi-tenant management",
      "Unlimited users",
      "Dedicated account manager",
    ],
    limits: {
      "Leads / month": "Unlimited",
      "Email campaigns": "Full",
      "AI scraping": "Custom model",
      "LinkedIn outreach": "Automated",
      "Portfolio uploads": "Unlimited",
      Support: "Dedicated AM",
    },
  },
];

const Pricing: React.FC = () => {
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const currentPlan = settingsData?.plan ?? "free";

  return (
    <Box>
      <PageHeader
        eyebrow="Account"
        title="Pricing Plans"
        description="Choose the plan that scales with your outreach"
      />

      <Grid container spacing={3} alignItems="stretch">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <Grid item xs={12} sm={6} md={3} key={plan.id}>
              <Card
                variant="outlined"
                elevation={0}
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  border: isCurrent
                    ? `2px solid ${colors.brand}`
                    : plan.recommended
                      ? `2px solid ${colors.brand}`
                      : undefined,
                  position: "relative",
                  overflow: "visible",
                }}
              >
                {plan.recommended && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -14,
                      left: "50%",
                      transform: "translateX(-50%)",
                    }}
                  >
                    <StatusChip tone="green" label="Most Popular" />
                  </Box>
                )}
                {isCurrent && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: plan.recommended ? 18 : -14,
                      right: 12,
                    }}
                  >
                    <StatusChip tone="brand" dot label="Current Plan" />
                  </Box>
                )}
                <CardContent sx={{ flex: 1 }}>
                  <Typography
                    variant="h6"
                    fontWeight="bold"
                    color={plan.color}
                    gutterBottom
                  >
                    {plan.name}
                  </Typography>
                  <Box display="flex" alignItems="baseline" gap={0.5} mb={1}>
                    <Typography variant="h3" fontWeight="bold">
                      {plan.price === 0 ? "Free" : `$${plan.price}`}
                    </Typography>
                    {plan.price > 0 && (
                      <Typography color="text.secondary">
                        / {plan.period}
                      </Typography>
                    )}
                  </Box>
                  <Typography color="text.secondary" variant="body2" mb={2}>
                    {plan.tagline}
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <List dense disablePadding>
                    {plan.features.map((f) => (
                      <ListItem
                        key={f}
                        disableGutters
                        disablePadding
                        sx={{ py: 0.25 }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Check fontSize="small" sx={{ color: plan.color }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={f}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
                <Box px={2} pb={2}>
                  {isCurrent ? (
                    <Button
                      variant="outlined"
                      fullWidth
                      disabled
                      sx={{ borderColor: plan.color, color: plan.color }}
                    >
                      Active Plan
                    </Button>
                  ) : (
                    <Button
                      variant={plan.recommended ? "contained" : "outlined"}
                      fullWidth
                      sx={
                        plan.recommended
                          ? {
                              bgcolor: plan.color,
                              "&:hover": { bgcolor: plan.color, opacity: 0.9 },
                            }
                          : { borderColor: plan.color, color: plan.color }
                      }
                      onClick={() =>
                        alert(
                          `To upgrade to ${plan.name}, contact sales@unionlogix.com or use the admin panel.`,
                        )
                      }
                    >
                      {plan.price === 0
                        ? "Get Started"
                        : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </Box>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Feature comparison table */}
      <Box mt={8}>
        <Typography variant="h5" fontWeight="bold" textAlign="center" mb={3}>
          Feature Comparison
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    borderBottom: `2px solid ${colors.border}`,
                  }}
                >
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    style={{
                      textAlign: "center",
                      padding: "12px 16px",
                      borderBottom: `2px solid ${colors.border}`,
                      color: p.id === currentPlan ? colors.brand : colors.ink2,
                      fontWeight: p.id === currentPlan ? "bold" : "normal",
                    }}
                  >
                    {p.name}
                    {p.id === currentPlan && " ✓"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(PLANS[0].limits).map((feature, i) => (
                <tr
                  key={feature}
                  style={{
                    background: i % 2 === 0 ? colors.bgSunken : "white",
                  }}
                >
                  <td style={{ padding: "10px 16px", fontWeight: 500 }}>
                    {feature}
                  </td>
                  {PLANS.map((p) => (
                    <td
                      key={p.id}
                      style={{ textAlign: "center", padding: "10px 16px" }}
                    >
                      {p.limits[feature]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Box>
    </Box>
  );
};

export default Pricing;
