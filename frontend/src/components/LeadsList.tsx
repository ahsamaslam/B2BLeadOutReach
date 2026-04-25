import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Business,
  Delete,
  Download,
  Email,
  FilterList,
  Store,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface Contact {
  id: number;
  role: string;
  name: string | null;
  email: string | null;
}

interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  niche: string | null;
  location: string | null;
  address: string | null;
  business_type: string | null;
  phone: string | null;
  contacts: Contact[];
}

const STATUS_COLORS: Record<
  string,
  "default" | "primary" | "secondary" | "success" | "warning" | "error"
> = {
  created: "default",
  scraping: "primary",
  data_parsed: "secondary",
  drafted: "warning",
  approved: "success",
  sent: "success",
  error: "error",
};

interface LeadsListProps {
  onSendToSelected?: (ids: number[]) => void;
}

const LeadsList: React.FC<LeadsListProps> = ({ onSendToSelected }) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterNiche, setFilterNiche] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Manual lead creation dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: "",
    website: "",
    niche: "",
    location: "",
    address: "",
    business_type: "independent",
    phone: "",
    ceo_name: "",
    ceo_email: "",
    ceo_phone: "",
    email_subject: "",
    email_body: "",
  });

  const handleManualField = (key: string, value: string) =>
    setManualForm((prev) => ({ ...prev, [key]: value }));

  const createManualMutation = useMutation({
    mutationFn: () =>
      api.createManualLead({
        name: manualForm.name,
        website: manualForm.website || undefined,
        niche: manualForm.niche || undefined,
        location: manualForm.location || undefined,
        address: manualForm.address || undefined,
        business_type: manualForm.business_type || "independent",
        phone: manualForm.phone || undefined,
        ceo_name: manualForm.ceo_name || undefined,
        ceo_email: manualForm.ceo_email || undefined,
        ceo_phone: manualForm.ceo_phone || undefined,
        email_subject: manualForm.email_subject || undefined,
        email_body: manualForm.email_body || undefined,
      }),
    onSuccess: () => {
      toast.success("Lead created");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setCreateOpen(false);
      setManualForm({
        name: "",
        website: "",
        niche: "",
        location: "",
        address: "",
        business_type: "independent",
        phone: "",
        ceo_name: "",
        ceo_email: "",
        ceo_phone: "",
        email_subject: "",
        email_body: "",
      });
    },
    onError: () => toast.error("Failed to create lead"),
  });

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.getCompanies(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Lead deleted");
    },
    onError: () => toast.error("Failed to delete lead"),
  });

  const filtered = companies.filter((c) => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterNiche && c.niche !== filterNiche) return false;
    if (filterLocation && c.location !== filterLocation) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !c.website.toLowerCase().includes(q) &&
        !(c.address || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const niches = Array.from(
    new Set(companies.map((c) => c.niche).filter(Boolean)),
  ) as string[];
  const locations = Array.from(
    new Set(companies.map((c) => c.location).filter(Boolean)),
  ) as string[];

  const allSelected =
    filtered.length > 0 && filtered.every((c) => selected.includes(c.id));
  const someSelected = filtered.some((c) => selected.includes(c.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) =>
        prev.filter((id) => !filtered.find((c) => c.id === id)),
      );
    } else {
      setSelected((prev) =>
        Array.from(new Set([...prev, ...filtered.map((c) => c.id)])),
      );
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      const filters = {
        ...(filterNiche ? { niche: filterNiche } : {}),
        ...(filterLocation ? { location: filterLocation } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      };
      const response = await api.exportLeadsBlob(format, filters);
      const blob = new Blob([response.data], {
        type:
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const getPrimaryContact = (contacts: Contact[]) => {
    return (
      contacts.find((c) => c.role === "CEO") ||
      contacts.find((c) => c.role === "CTO") ||
      contacts.find((c) => c.role === "CFO") ||
      contacts[0] ||
      null
    );
  };

  if (isLoading) return <Typography sx={{ p: 4 }}>Loading leads…</Typography>;

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h5" fontWeight="bold">
          Leads ({filtered.length})
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          {/* Add Manual Lead */}
          <Button
            variant="contained"
            color="success"
            startIcon={<Add />}
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            Add Lead
          </Button>
          {/* Export */}
          <Button
            variant="outlined"
            startIcon={<Download />}
            size="small"
            onClick={() => handleExport("csv")}
          >
            Export CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            size="small"
            onClick={() => handleExport("xlsx")}
          >
            Export XLSX
          </Button>
          {/* Send selected */}
          {selected.length > 0 && onSendToSelected && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<Email />}
              size="small"
              onClick={() => onSendToSelected(selected)}
            >
              Email {selected.length} selected
            </Button>
          )}
        </Box>
      </Box>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <FilterList color="action" />
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 180 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filterStatus}
              label="Status"
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {[
                "created",
                "scraping",
                "drafted",
                "approved",
                "sent",
                "error",
              ].map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Niche</InputLabel>
            <Select
              value={filterNiche}
              label="Niche"
              onChange={(e) => setFilterNiche(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {niches.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Location</InputLabel>
            <Select
              value={filterLocation}
              label="Location"
              onChange={(e) => setFilterLocation(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {locations.map((l) => (
                <MenuItem key={l} value={l}>
                  {l}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {(filterStatus || filterNiche || filterLocation || search) && (
            <Button
              size="small"
              onClick={() => {
                setFilterStatus("");
                setFilterNiche("");
                setFilterLocation("");
                setSearch("");
              }}
            >
              Clear
            </Button>
          )}
        </Box>
      </Paper>

      {selected.length > 0 && (
        <Toolbar
          variant="dense"
          sx={{
            bgcolor: "primary.light",
            borderRadius: 1,
            mb: 1,
            color: "primary.contrastText",
          }}
        >
          <Typography variant="body2" sx={{ flex: 1 }}>
            {selected.length} lead{selected.length > 1 ? "s" : ""} selected
          </Typography>
          <Button size="small" color="inherit" onClick={() => setSelected([])}>
            Deselect all
          </Button>
        </Toolbar>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected && !allSelected}
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </TableCell>
              <TableCell>Company</TableCell>
              <TableCell>Niche</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Owner / Contact</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  align="center"
                  sx={{ py: 4, color: "text.secondary" }}
                >
                  No leads found
                </TableCell>
              </TableRow>
            )}
            {filtered.map((company) => {
              const primary = getPrimaryContact(company.contacts);
              const isSelected = selected.includes(company.id);
              return (
                <TableRow
                  key={company.id}
                  hover
                  selected={isSelected}
                  sx={{ cursor: "pointer" }}
                  onClick={() => toggle(company.id)}
                >
                  <TableCell
                    padding="checkbox"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggle(company.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {company.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {company.website.replace(/^https?:\/\//, "")}
                      </a>
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {company.niche ? (
                      <Chip
                        label={company.niche}
                        size="small"
                        variant="outlined"
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{company.location || "—"}</TableCell>
                  <TableCell
                    sx={{
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Tooltip title={company.address || ""}>
                      <span>{company.address || "—"}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {primary ? (
                      <>
                        <Typography variant="body2">
                          {primary.name || "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {primary.role}
                        </Typography>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {primary?.email ? (
                      <a
                        href={`mailto:${primary.email}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {primary.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {company.business_type === "franchise" ? (
                      <Chip
                        label="Franchise"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="Independent"
                        size="small"
                        color="default"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>{company.phone || "—"}</TableCell>
                  <TableCell>
                    <Chip
                      label={company.status}
                      size="small"
                      color={STATUS_COLORS[company.status] || "default"}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Delete lead">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          if (window.confirm(`Delete ${company.name}?`)) {
                            deleteMutation.mutate(company.id);
                            setSelected((prev) =>
                              prev.filter((id) => id !== company.id),
                            );
                          }
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {/* ── Manual Lead Creation Dialog ─────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" alignItems="center" gap={1}>
            {manualForm.business_type === "franchise" ? (
              <Store color="warning" />
            ) : (
              <Business color="primary" />
            )}
            Add Lead Manually
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {/* ── Step 1: Business Type selector (always first) ── */}
          <Typography variant="overline" color="primary" display="block" mb={1}>
            Step 1 — Business Type
          </Typography>
          <Box display="flex" gap={2} mb={1}>
            <Paper
              variant="outlined"
              onClick={() => handleManualField("business_type", "independent")}
              sx={{
                flex: 1,
                p: 2,
                cursor: "pointer",
                borderColor:
                  manualForm.business_type === "independent"
                    ? "primary.main"
                    : "divider",
                bgcolor:
                  manualForm.business_type === "independent"
                    ? "primary.50"
                    : "background.paper",
                borderWidth: manualForm.business_type === "independent" ? 2 : 1,
              }}
            >
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <Business
                  fontSize="small"
                  color={
                    manualForm.business_type === "independent"
                      ? "primary"
                      : "disabled"
                  }
                />
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    manualForm.business_type === "independent"
                      ? "primary"
                      : "text.secondary"
                  }
                >
                  Independent / Small Business
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Locally owned — owner name appears on their website
              </Typography>
            </Paper>
            <Paper
              variant="outlined"
              onClick={() => handleManualField("business_type", "franchise")}
              sx={{
                flex: 1,
                p: 2,
                cursor: "pointer",
                borderColor:
                  manualForm.business_type === "franchise"
                    ? "warning.main"
                    : "divider",
                bgcolor:
                  manualForm.business_type === "franchise"
                    ? "warning.50"
                    : "background.paper",
                borderWidth: manualForm.business_type === "franchise" ? 2 : 1,
              }}
            >
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <Store
                  fontSize="small"
                  color={
                    manualForm.business_type === "franchise"
                      ? "warning"
                      : "disabled"
                  }
                />
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    manualForm.business_type === "franchise"
                      ? "warning.dark"
                      : "text.secondary"
                  }
                >
                  Franchise / Corporate Chain
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Brand-owned site — local owner is hidden in LLC registry
              </Typography>
            </Paper>
          </Box>

          {/* ── Pipeline indicator — changes by type ── */}
          <Alert
            severity={
              manualForm.business_type === "franchise" ? "warning" : "info"
            }
            icon={false}
            sx={{ mb: 3, py: 0.5 }}
          >
            <Typography variant="caption" fontWeight={600}>
              Enrichment pipeline:{" "}
            </Typography>
            {manualForm.business_type === "franchise" ? (
              <Typography variant="caption">
                <strong>SOS Registry</strong> (finds local franchisee owner) →{" "}
                <strong>Hunter.io</strong> (finds their email) →{" "}
                <strong>Web Search</strong> → <strong>Claude AI</strong>
                {" · "}
                <em>
                  Website scraping is skipped — franchise sites belong to
                  corporate HQ
                </em>
              </Typography>
            ) : (
              <Typography variant="caption">
                <strong>Website Scrape</strong> (follows real page links) →{" "}
                <strong>SOS Registry</strong> (validates owner name) →{" "}
                <strong>Hunter.io</strong> (finds personal email) →{" "}
                <strong>Web Search</strong> → <strong>Claude AI</strong>
              </Typography>
            )}
          </Alert>

          <Divider sx={{ mb: 2 }} />

          {/* ── Step 2: Company Info ── */}
          <Typography variant="overline" color="primary" display="block" mb={1}>
            Step 2 — Company Info
          </Typography>
          <Box display="flex" flexDirection="column" gap={2} mb={3}>
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                required
                label={
                  manualForm.business_type === "franchise"
                    ? "Franchise Location Name"
                    : "Company Name"
                }
                placeholder={
                  manualForm.business_type === "franchise"
                    ? "e.g. Dogtopia Towson MD"
                    : "e.g. Smith Veterinary Clinic"
                }
                helperText={
                  manualForm.business_type === "franchise"
                    ? "Include the brand name + city/location for accurate SOS registry matching"
                    : ""
                }
                value={manualForm.name}
                onChange={(e) => handleManualField("name", e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label={
                  manualForm.business_type === "franchise"
                    ? "Franchise Website (optional)"
                    : "Website"
                }
                placeholder="https://example.com"
                helperText={
                  manualForm.business_type === "franchise"
                    ? "Used for web search context only — not scraped for owner info"
                    : ""
                }
                value={manualForm.website}
                onChange={(e) => handleManualField("website", e.target.value)}
                size="small"
              />
            </Box>
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                label="Industry / Niche"
                value={manualForm.niche}
                onChange={(e) => handleManualField("niche", e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label="Location"
                placeholder="e.g. Baltimore, MD"
                helperText={
                  manualForm.business_type === "franchise"
                    ? "Helps narrow SOS registry search to the right state"
                    : ""
                }
                value={manualForm.location}
                onChange={(e) => handleManualField("location", e.target.value)}
                size="small"
              />
            </Box>
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                label="Address"
                value={manualForm.address}
                onChange={(e) => handleManualField("address", e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label="Phone"
                value={manualForm.phone}
                onChange={(e) => handleManualField("phone", e.target.value)}
                size="small"
              />
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* ── Step 3: Contact — label differs by type ── */}
          <Typography variant="overline" color="primary" display="block" mb={1}>
            Step 3 —{" "}
            {manualForm.business_type === "franchise"
              ? "Local Franchisee / Owner (if already known)"
              : "CEO / Owner (if already known)"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mb={2}
          >
            {manualForm.business_type === "franchise"
              ? "Leave blank — the pipeline will find the local owner from the SOS registry and Hunter.io automatically."
              : "Leave blank — the pipeline will find the owner name and personal email automatically."}
          </Typography>
          <Box display="flex" flexDirection="column" gap={2} mb={3}>
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                label={
                  manualForm.business_type === "franchise"
                    ? "Franchisee Full Name"
                    : "Owner / CEO Full Name"
                }
                value={manualForm.ceo_name}
                onChange={(e) => handleManualField("ceo_name", e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label="Personal Email"
                type="email"
                value={manualForm.ceo_email}
                onChange={(e) => handleManualField("ceo_email", e.target.value)}
                size="small"
                helperText="Personal email (firstname@domain.com) gives best deliverability"
              />
            </Box>
            <TextField
              label="Contact Phone"
              value={manualForm.ceo_phone}
              onChange={(e) => handleManualField("ceo_phone", e.target.value)}
              size="small"
              sx={{ maxWidth: "50%" }}
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* ── Step 4: Email Draft ── */}
          <Typography variant="overline" color="primary" display="block" mb={1}>
            Step 4 — Email Draft (optional — skip to draft later)
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              fullWidth
              label="Email Subject"
              value={manualForm.email_subject}
              onChange={(e) =>
                handleManualField("email_subject", e.target.value)
              }
              size="small"
            />
            <TextField
              fullWidth
              multiline
              minRows={5}
              label="Email Body (HTML or plain text)"
              value={manualForm.email_body}
              onChange={(e) => handleManualField("email_body", e.target.value)}
              size="small"
              placeholder={`Hi {{ceo_name}},\n\nI noticed that...\n\nBest regards,\n{{sender_name}}`}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={
              manualForm.business_type === "franchise" ? "warning" : "success"
            }
            onClick={() => createManualMutation.mutate()}
            disabled={!manualForm.name || createManualMutation.isPending}
          >
            {createManualMutation.isPending ? "Creating…" : "Create Lead"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LeadsList;
