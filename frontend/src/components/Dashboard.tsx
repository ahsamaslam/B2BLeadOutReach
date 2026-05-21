import React from "react";
import {
  Box,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowForward, Email } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { PageHeader, StatCard, StatusChip, EmptyState } from "./primitives";
import { colors } from "../theme/tokens";

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

const Dashboard: React.FC<DashboardProps> = ({ onShowHistory }) => {
  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });
  const { data: sentData } = useQuery<{ items: SentLead[]; total: number }>({
    queryKey: ["sent-history"],
    queryFn: () => api.getSentHistory(50),
  });
  const recentlySent = sentData?.items ?? [];

  const totalEnriched =
    (analytics?.companies_by_status?.data_parsed || 0) +
    (analytics?.companies_by_status?.drafted || 0) +
    (analytics?.companies_by_status?.approved || 0) +
    (analytics?.companies_by_status?.sent || 0);

  return (
    <Box>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Live snapshot of your lead generation pipeline."
        actions={
          <Button
            variant="outlined"
            endIcon={<ArrowForward />}
            onClick={onShowHistory}
          >
            Sent history
          </Button>
        }
      />

      {/* Primary KPIs */}
      <Grid container spacing={2} mb={2.5}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Total Leads"
            value={analytics?.total_companies ?? 0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Emails Sent"
            value={analytics?.total_emails_sent ?? 0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Open Rate"
            value={`${(analytics?.email_open_rate ?? 0).toFixed(0)}%`}
            sub="Last 30 days"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Enrichment Success"
            value={`${(analytics?.scraping_success_rate ?? 0).toFixed(0)}%`}
            sub="Data enrichment"
          />
        </Grid>
      </Grid>

      {/* Secondary KPIs */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Enriched" value={totalEnriched} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Drafted"
            value={analytics?.companies_by_status?.drafted ?? 0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Awaiting Approval"
            value={analytics?.companies_by_status?.approved ?? 0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Errors"
            value={analytics?.companies_by_status?.error ?? 0}
            deltaTone="red"
          />
        </Grid>
      </Grid>

      {/* Recently sent table */}
      <Box
        sx={{
          border: `1px solid ${colors.border}`,
          borderRadius: 1.75,
          overflow: "hidden",
          bgcolor: colors.bgElev,
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h4">Recently Sent Emails</Typography>
            <Typography variant="body2">
              Latest {Math.min(recentlySent.length, 50)} outreach emails
            </Typography>
          </Box>
          <Button
            variant="outlined"
            endIcon={<ArrowForward />}
            onClick={onShowHistory}
            size="small"
          >
            View All ({sentData?.total ?? 0})
          </Button>
        </Box>

        {recentlySent.length === 0 ? (
          <EmptyState
            icon={<Email />}
            tone="brand"
            title="No emails sent yet"
            description="Start a broadcast campaign to see your outreach history here."
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    "& th": {
                      bgcolor: colors.bgSunken,
                      fontWeight: 600,
                      fontSize: 12,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: colors.ink3,
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
                {recentlySent.map((lead) => (
                  <TableRow key={lead.id} hover sx={{ "& td": { py: 1.5 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {lead.name}
                      </Typography>
                      <Typography variant="caption" sx={{ display: "block" }}>
                        {lead.website}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {lead.recipient_name || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ display: "block" }}>
                        {lead.recipient_email || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        title={lead.subject ?? ""}
                      >
                        {lead.subject || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
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
                      <StatusChip
                        tone={lead.opened_at ? "green" : "brand"}
                        dot
                        label={lead.opened_at ? "Opened" : "Sent"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default Dashboard;