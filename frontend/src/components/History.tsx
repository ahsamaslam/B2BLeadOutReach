import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
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
import {
  Search,
  MarkEmailRead,
  MarkEmailUnread,
  TrendingUp,
  Visibility,
  Close,
  DeleteOutline,
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
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* â”€â”€ Header â”€â”€ */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Sent History
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Leads whose emails have been sent Â· auto-refreshes every 30 s
          </Typography>
        </Box>
        <Chip
          label={`${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* â”€â”€ Stats bar â”€â”€ */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        {[
          {
            label: "Total Sent",
            value: filtered.length,
            color: "#1976d2",
            bg: "#e3f2fd",
          },
          {
            label: "Opened",
            value: openedCount,
            color: "#2e7d32",
            bg: "#e8f5e9",
            icon: <MarkEmailRead fontSize="small" />,
          },
          {
            label: "Not Opened",
            value: notOpenedCount,
            color: "#c62828",
            bg: "#ffebee",
            icon: <MarkEmailUnread fontSize="small" />,
          },
          {
            label: "Open Rate",
            value: `${openRate}%`,
            color: "#6a1b9a",
            bg: "#f3e5f5",
            icon: <TrendingUp fontSize="small" />,
          },
        ].map((stat) => (
          <Paper
            key={stat.label}
            variant="outlined"
            sx={{
              flex: "1 1 160px",
              p: 2,
              borderRadius: 2,
              borderColor: stat.color,
              bgcolor: stat.bg,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            {stat.icon && <Box sx={{ color: stat.color }}>{stat.icon}</Box>}
            <Box>
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{ color: stat.color, lineHeight: 1 }}
              >
                {stat.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stat.label}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

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
                sx={{ "& th": { fontWeight: "bold", bgcolor: "grey.50" } }}
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
                <TableCell align="center">Delete</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="text.secondary" py={4}>
                      {search
                        ? "No results match your search"
                        : "No sent emails yet"}
                    </Typography>
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
                            borderLeft: "3px solid #2e7d32",
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
                          <Chip
                            icon={<MarkEmailRead fontSize="small" />}
                            label={
                              lead.open_count > 1
                                ? `Opened Ã—${lead.open_count}`
                                : "Opened"
                            }
                            color="success"
                            size="small"
                            sx={{ cursor: "help", fontWeight: 600 }}
                          />
                        </Tooltip>
                      ) : (
                        <Chip
                          icon={<MarkEmailUnread fontSize="small" />}
                          label="Not Opened"
                          size="small"
                          variant="outlined"
                          color="error"
                        />
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
    </Container>
  );
};

export default History;
