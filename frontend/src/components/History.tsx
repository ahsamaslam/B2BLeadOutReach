import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { PageHeader, StatCard, StatusChip, EmptyState } from "./primitives";
import { colors } from "../theme/tokens";
import {
  Search,
  MarkEmailRead,
  MarkEmailUnread,
  TrendingUp,
  Visibility,
  Close,
  DeleteOutline,
  ForwardToInbox,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";

type SentLead = {
  id: number;
  name: string;
  website: string;
  niche: string | null;
  location: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  last_open_user_agent: string | null;
};

/** Parse a raw User-Agent string into a human-readable mail client name. */
function parseMailClient(ua: string | null): string {
  if (!ua) return "Unknown client";
  const s = ua.toLowerCase();
  if (s.includes("googleimageproxy") || s.includes("google image proxy"))
    return "Gmail (image proxy)";
  if (s.includes("gmail")) return "Gmail";
  if (s.includes("outlook") || s.includes("microsoft.outlook"))
    return "Outlook";
  if (s.includes("apple mail") || s.includes("applemail")) return "Apple Mail";
  if (s.includes("yahoo")) return "Yahoo Mail";
  if (s.includes("thunderbird")) return "Thunderbird";
  if (s.includes("protonmail")) return "ProtonMail";
  if (s.includes("samsung")) return "Samsung Email";
  if (s.includes("spark")) return "Spark";
  if (s.includes("airmail")) return "Airmail";
  if (s.includes("superhuman")) return "Superhuman";
  if (s.includes("mozilla/5.0") && s.includes("gecko")) return "Web browser";
  return "Email client";
}

// â”€â”€ Detail Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Follow-ups Dialog ────────────────────────────────────────────────────────────────────────
type FollowUpEntry = {
  id: number;
  round_number: number;
  status: string;
  subject: string | null;
  body: string | null;
  recipient_email: string;
  recipient_name: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  error_message: string | null;
};

const STATUS_COLOR: Record<
  string,
  "default" | "warning" | "success" | "error" | "info"
> = {
  pending: "warning",
  sent: "success",
  failed: "error",
  skipped: "default",
};

const FollowUpsDialog: React.FC<{
  lead: SentLead | null;
  onClose: () => void;
}> = ({ lead, onClose }) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: followUps, isLoading } = useQuery<FollowUpEntry[]>({
    queryKey: ["followups", lead?.id],
    queryFn: () => api.getFollowUps(lead!.id),
    enabled: !!lead,
  });

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";

  if (!lead) return null;

  return (
    <Dialog open={!!lead} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Follow-ups — {lead.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Original: {lead.subject || "—"}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : !followUps || followUps.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            py={5}
            gap={1}
          >
            <ForwardToInbox sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography color="text.secondary">
              No follow-ups scheduled for this lead.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Follow-ups are scheduled automatically when you send an email with
              Follow-up Automation enabled in Settings.
            </Typography>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2}>
            {followUps.map((fu) => (
              <Paper
                key={fu.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderColor:
                    fu.status === "sent"
                      ? "success.light"
                      : fu.status === "failed"
                        ? "error.light"
                        : fu.status === "skipped"
                          ? "grey.300"
                          : "warning.light",
                  bgcolor:
                    fu.status === "sent"
                      ? "#f1f8e9"
                      : fu.status === "failed"
                        ? "#fff3f3"
                        : fu.status === "pending"
                          ? "#fffde7"
                          : "grey.50",
                }}
              >
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb={1}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <StatusChip
                      tone="brand"
                      label={`Round ${fu.round_number}`}
                    />
                    <StatusChip
                      tone={
                        fu.status === "sent"
                          ? "green"
                          : fu.status === "failed"
                            ? "red"
                            : fu.status === "pending"
                              ? "amber"
                              : "default"
                      }
                      dot
                      label={
                        fu.status.charAt(0).toUpperCase() + fu.status.slice(1)
                      }
                    />
                    {fu.opened_at && (
                      <StatusChip
                        tone="green"
                        dot
                        label={
                          fu.open_count > 1
                            ? `Opened ×${fu.open_count}`
                            : "Opened"
                        }
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {fu.status === "pending"
                      ? `Scheduled: ${fmt(fu.scheduled_at)}`
                      : fu.status === "sent"
                        ? `Sent: ${fmt(fu.sent_at)}`
                        : fu.status === "skipped"
                          ? `Skipped (${fu.error_message || "replied"})`
                          : `Failed: ${fu.error_message || "unknown error"}`}
                  </Typography>
                </Box>

                {fu.subject && (
                  <Typography variant="body2" fontWeight={600} mb={0.5}>
                    Subject: {fu.subject}
                  </Typography>
                )}

                {fu.body && (
                  <Box>
                    <Button
                      size="small"
                      variant="text"
                      sx={{ px: 0, textTransform: "none", fontSize: 12 }}
                      onClick={() =>
                        setExpandedId(expandedId === fu.id ? null : fu.id)
                      }
                    >
                      {expandedId === fu.id
                        ? "▲ Hide body"
                        : "▼ Show email body"}
                    </Button>
                    {expandedId === fu.id && (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          mt: 0.5,
                          maxHeight: 320,
                          overflowY: "auto",
                          bgcolor: "#fff",
                        }}
                      >
                        <div
                          dangerouslySetInnerHTML={{ __html: fu.body }}
                          style={{
                            fontSize: 13,
                            lineHeight: 1.6,
                            fontFamily: "inherit",
                          }}
                        />
                      </Paper>
                    )}
                  </Box>
                )}

                {fu.status === "pending" && !fu.body && (
                  <Typography variant="caption" color="text.secondary">
                    Body will be AI-generated at send time.
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

const DetailDialog: React.FC<{
  lead: SentLead | null;
  onClose: () => void;
}> = ({ lead, onClose }) => {
  if (!lead) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return "â€”";
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    });
  };

  return (
    <Dialog open={!!lead} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight="bold">
            {lead.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {lead.website}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {/* â”€â”€ Meta grid â”€â”€ */}
        <Grid container spacing={2} mb={3}>
          {[
            { label: "Recipient", value: lead.recipient_name || "â€”" },
            { label: "Email Address", value: lead.recipient_email || "â€”" },
            { label: "Niche", value: lead.niche || "â€”" },
            { label: "Location", value: lead.location || "â€”" },
            { label: "Sent At", value: formatDate(lead.sent_at) },
            {
              label: "Open Status",
              value: lead.opened_at
                ? `Opened ${lead.open_count > 1 ? `Ã—${lead.open_count}` : ""} Â· First: ${formatDate(lead.opened_at)}`
                : "Not Opened",
            },
            ...(lead.opened_at
              ? [
                  {
                    label: "Mail Client",
                    value: parseMailClient(lead.last_open_user_agent),
                  },
                ]
              : []),
          ].map(({ label, value }) => (
            <Grid item xs={12} sm={6} key={label}>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                {label}
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>

        {/* â”€â”€ Subject â”€â”€ */}
        <Typography variant="caption" color="text.secondary">
          Subject
        </Typography>
        <Paper
          variant="outlined"
          sx={{ p: 1.5, mb: 2, bgcolor: "grey.50", borderRadius: 1 }}
        >
          <Typography variant="body2" fontWeight="medium">
            {lead.subject || "â€”"}
          </Typography>
        </Paper>

        {/* â”€â”€ Body â”€â”€ */}
        <Typography variant="caption" color="text.secondary">
          Email Body
        </Typography>
        {lead.body ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mt: 0.5,
              borderRadius: 1,
              maxHeight: 420,
              overflowY: "auto",
              bgcolor: "#fff",
            }}
          >
            <div
              // biome-ignore lint: intentional HTML rendering of trusted AI-generated email body
              dangerouslySetInnerHTML={{ __html: lead.body }}
              style={{ fontFamily: "inherit", fontSize: 14, lineHeight: 1.6 }}
            />
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 2, mt: 0.5, bgcolor: "grey.50" }}>
            <Typography variant="body2" color="text.secondary">
              Body not available for emails sent before this feature was added.
            </Typography>
          </Paper>
        )}
      </DialogContent>
    </Dialog>
  );
};

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const History: React.FC = () => {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<SentLead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SentLead | null>(null);
  const [viewingFollowUps, setViewingFollowUps] = useState<SentLead | null>(
    null,
  );

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sent-history"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      setConfirmDelete(null);
    },
  });

  const { data, isLoading } = useQuery<{ items: SentLead[]; total: number }>({
    queryKey: ["sent-history"],
    queryFn: () => api.getSentHistory(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const allLeads = data?.items ?? [];

  const filtered = allLeads.filter((lead) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      lead.name.toLowerCase().includes(q) ||
      (lead.niche ?? "").toLowerCase().includes(q) ||
      (lead.location ?? "").toLowerCase().includes(q) ||
      (lead.recipient_email ?? "").toLowerCase().includes(q) ||
      (lead.recipient_name ?? "").toLowerCase().includes(q) ||
      (lead.subject ?? "").toLowerCase().includes(q)
    );
  });

  const openedCount = filtered.filter((l) => l.opened_at).length;
  const notOpenedCount = filtered.length - openedCount;
  const openRate =
    filtered.length > 0 ? Math.round((openedCount / filtered.length) * 100) : 0;

  const formatDate = (iso: string | null) => {
    if (!iso) return "â€”";
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Pipeline"
        title="Sent History"
        description="Leads whose emails have been sent · auto-refreshes every 30 s"
      />

      {/* Stats bar */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} md={3}>
          <StatCard label="Total Sent" value={filtered.length} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            label="Opened"
            value={openedCount}
            delta={`${openRate}%`}
            deltaTone="green"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Not Opened" value={notOpenedCount} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Open Rate" value={`${openRate}%`} />
        </Grid>
      </Grid>

      {/* â”€â”€ Search â”€â”€ */}
      <TextField
        fullWidth
        placeholder="Search by company, recipient, subject, niche, locationâ€¦"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
        }}
      />

      {isLoading ? (
        <Box display="flex" justifyContent="center" mt={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    fontWeight: 600,
                    bgcolor: colors.bgSunken,
                    color: colors.ink3,
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  },
                }}
              >
                <TableCell>Company</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell>Email Address</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Niche</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Sent At</TableCell>
                <TableCell align="center">Open Status</TableCell>
                <TableCell align="center">View</TableCell>
                <TableCell align="center">Follow-ups</TableCell>
                <TableCell align="center">Delete</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                    <EmptyState
                      icon={<MarkEmailRead />}
                      tone="brand"
                      title={
                        search
                          ? "No results match your search"
                          : "No sent emails yet"
                      }
                      description={
                        search
                          ? "Try a different keyword."
                          : "Start a broadcast campaign to see your outreach history here."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    hover
                    sx={
                      lead.opened_at
                        ? {
                            borderLeft: `3px solid ${colors.green}`,
                            "& td:first-of-type": { pl: "calc(16px - 3px)" },
                          }
                        : {}
                    }
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {lead.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {lead.website}
                      </Typography>
                    </TableCell>
                    <TableCell>{lead.recipient_name || "â€”"}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {lead.recipient_email || "â€”"}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Typography variant="body2" title={lead.subject ?? ""}>
                        {lead.subject || "â€”"}
                      </Typography>
                    </TableCell>
                    <TableCell>{lead.niche || "â€”"}</TableCell>
                    <TableCell>{lead.location || "â€”"}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {formatDate(lead.sent_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {lead.opened_at ? (
                        <Tooltip
                          title={
                            <Box>
                              <Typography variant="caption" display="block">
                                <strong>First opened:</strong>{" "}
                                {formatDate(lead.opened_at)}
                              </Typography>
                              <Typography variant="caption" display="block">
                                <strong>Opens:</strong> {lead.open_count}
                              </Typography>
                              <Typography variant="caption" display="block">
                                <strong>Client:</strong>{" "}
                                {parseMailClient(lead.last_open_user_agent)}
                              </Typography>
                            </Box>
                          }
                          arrow
                        >
                          <span>
                            <StatusChip
                              tone="green"
                              dot
                              label={
                                lead.open_count > 1
                                  ? `Opened ×${lead.open_count}`
                                  : "Opened"
                              }
                            />
                          </span>
                        </Tooltip>
                      ) : (
                        <StatusChip tone="red" dot label="Not Opened" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View email details">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setViewing(lead)}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View follow-ups">
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => setViewingFollowUps(lead)}
                        >
                          <ForwardToInbox fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Delete lead">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setConfirmDelete(lead)}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DetailDialog lead={viewing} onClose={() => setViewing(null)} />
      <FollowUpsDialog
        lead={viewingFollowUps}
        onClose={() => setViewingFollowUps(null)}
      />

      {/* ── Delete confirmation ── */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete lead?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{confirmDelete?.name}</strong>{" "}
            and all associated email logs. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDelete(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() =>
              confirmDelete && deleteMutation.mutate(confirmDelete.id)
            }
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default History;
