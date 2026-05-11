import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import {
  ArrowForward,
  TrendingUp,
  TrendingDown,
  Email,
  CheckCircle,
  Error as ErrorIcon,
  Drafts,
  Send,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  contacts: Contact[];
}

interface Contact {
  id: number;
  role: string;
  name: string;
  email: string;
  linkedin_url?: string;
}

interface EmailTemplate {
  id: number;
  company_id: number;
  subject: string;
  body: string;
  status: string;
}

type SentLead = {
  id: number;
  name: string;
  website: string;
  niche: string | null;
  location: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  subject: string | null;
  sent_at: string | null;
  opened_at: string | null;
};

interface DashboardProps {
  onShowHistory?: () => void;
}

// Stat Card Component with better visual hierarchy
const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color?: string;
  subtitle?: string;
  emphasized?: boolean;
}> = ({ title, value, icon, trend, color = "#1976d2", subtitle, emphasized = false }) => {
  const theme = useTheme();
  
  return (
    <Card
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        border: emphasized ? `2px solid ${color}` : "1px solid",
        borderColor: emphasized ? color : "divider",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: emphasized ? theme.shadows[8] : theme.shadows[4],
        },
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 120,
          height: 120,
          borderRadius: "50%",
          bgcolor: alpha(color, 0.05),
        }}
      />
      
      <CardContent sx={{ position: "relative", height: "100%" }}>
        <Stack spacing={2}>
          {/* Header with icon */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Typography
              variant="body2"
              color="text.secondary"
              fontWeight={500}
              letterSpacing={0.5}
              textTransform="uppercase"
              fontSize="0.75rem"
            >
              {title}
            </Typography>
            <Box
              sx={{
                p: 1,
                borderRadius: 2,
                bgcolor: alpha(color, 0.1),
                color: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {icon}
            </Box>
          </Box>

          {/* Main value */}
          <Box>
            <Typography
              variant="h3"
              fontWeight={700}
              sx={{
                background: emphasized
                  ? `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.7)} 100%)`
                  : "inherit",
                backgroundClip: emphasized ? "text" : "inherit",
                WebkitBackgroundClip: emphasized ? "text" : "inherit",
                WebkitTextFillColor: emphasized ? "transparent" : "inherit",
                mb: subtitle ? 0.5 : 0,
              }}
            >
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>

          {/* Trend indicator */}
          {trend && (
            <Box display="flex" alignItems="center" gap={0.5}>
              {trend.isPositive ? (
                <TrendingUp sx={{ fontSize: 16, color: "success.main" }} />
              ) : (
                <TrendingDown sx={{ fontSize: 16, color: "error.main" }} />
              )}
              <Typography
                variant="caption"
                fontWeight={600}
                color={trend.isPositive ? "success.main" : "error.main"}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs last month
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ onShowHistory }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();

  // Fetch analytics
  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });
  const { data: sentData } = useQuery<{ items: SentLead[]; total: number }>({
    queryKey: ["sent-history"],
    queryFn: () => api.getSentHistory(50),
  });
  const recentlySent = sentData?.items ?? [];

  // Calculate derived metrics
  const totalEnriched =
    (analytics?.companies_by_status?.data_parsed || 0) +
    (analytics?.companies_by_status?.drafted || 0) +
    (analytics?.companies_by_status?.approved || 0) +
    (analytics?.companies_by_status?.sent || 0);

  return (
    <Box sx={{ bgcolor: "grey.50", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Box mb={4}>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={800}
            gutterBottom
            sx={{
              background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Overview of your lead generation pipeline
          </Typography>
        </Box>

        {/* Primary Metrics - Emphasized */}
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Leads"
              value={analytics?.total_companies || 0}
              icon={<Email />}
              color="#1976d2"
              emphasized
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Emails Sent"
              value={analytics?.total_emails_sent || 0}
              icon={<Send />}
              color="#2e7d32"
              emphasized
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Open Rate"
              value={`${analytics?.email_open_rate?.toFixed(0) || 0}%`}
              icon={<CheckCircle />}
              color="#ed6c02"
              emphasized
              subtitle="Last 30 days"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Success Rate"
              value={`${analytics?.scraping_success_rate?.toFixed(0) || 0}%`}
              icon={<TrendingUp />}
              color="#9c27b0"
              emphasized
              subtitle="Data enrichment"
            />
          </Grid>
        </Grid>

        {/* Secondary Metrics - Normal cards */}
        <Grid container spacing={2} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Enriched"
              value={totalEnriched}
              icon={<CheckCircle sx={{ fontSize: 20 }} />}
              color="#388e3c"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Emails Drafted"
              value={analytics?.companies_by_status?.drafted || 0}
              icon={<Drafts sx={{ fontSize: 20 }} />}
              color="#1976d2"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Awaiting Approval"
              value={analytics?.companies_by_status?.approved || 0}
              icon={<CheckCircle sx={{ fontSize: 20 }} />}
              color="#ed6c02"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Errors"
              value={analytics?.companies_by_status?.error || 0}
              icon={<ErrorIcon sx={{ fontSize: 20 }} />}
              color="#d32f2f"
            />
          </Grid>
        </Grid>

        {/* Recently Sent Section */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {/* Section Header */}
          <Box
            sx={{
              p: 3,
              bgcolor: "white",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap={2}
            >
              <Box>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Recently Sent Emails
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Latest {Math.min(recentlySent.length, 50)} outreach emails
                </Typography>
              </Box>
              <Button
                variant="outlined"
                endIcon={<ArrowForward />}
                onClick={onShowHistory}
                sx={{
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                View All ({sentData?.total ?? 0})
              </Button>
            </Box>
          </Box>

          {/* Table */}
          <TableContainer sx={{ bgcolor: "white" }}>
            <Table>
              <TableHead>
                <TableRow
                  sx={{
                    bgcolor: "grey.50",
                    "& th": {
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "text.secondary",
                      py: 2,
                    },
                  }}
                >
                  <TableCell>Company</TableCell>
                  <TableCell>Recipient</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Sent</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentlySent.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                      <Box>
                        <Email sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
                        <Typography color="text.secondary" fontWeight={500}>
                          No emails sent yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" mt={1}>
                          Start a campaign to see your sent emails here
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  recentlySent.map((lead) => (
                    <TableRow
                      key={lead.id}
                      hover
                      sx={{
                        "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.02) },
                        "& td": { py: 2 },
                      }}
                    >
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {lead.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.25 }}
                          >
                            {lead.website}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {lead.recipient_name || "—"}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.25 }}
                          >
                            {lead.recipient_email || "—"}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={lead.subject ?? ""}
                        >
                          {lead.subject || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {lead.sent_at
                            ? new Date(lead.sent_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {lead.opened_at ? (
                          <Chip
                            label="Opened"
                            size="small"
                            sx={{
                              bgcolor: alpha("#2e7d32", 0.1),
                              color: "#2e7d32",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                            }}
                          />
                        ) : (
                          <Chip
                            label="Sent"
                            size="small"
                            variant="outlined"
                            sx={{
                              fontWeight: 600,
                              fontSize: "0.75rem",
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
};

export default Dashboard;
