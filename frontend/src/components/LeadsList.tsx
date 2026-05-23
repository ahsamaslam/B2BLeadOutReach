import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add,
  ArrowBack,
  ArrowForward,
  AutoFixHigh,
  CloudUpload,
  Delete,
  Download,
  Edit,
  ExpandMore,
  Send,
  Search,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { StatusChip, PageLoader } from "./primitives";
import { colors, shadow } from "../theme/tokens";
import {
  BROADCAST_LEADS_STORAGE_KEY,
  type BroadcastLeadPayload,
} from "../broadcastLeads";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Contact {
  id: number;
  role: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
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
interface LeadsListProps {
  onSendToSelected?: (ids: number[]) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PER_PAGE = 10;

const STATUS_LABEL: Record<string, string> = {
  created:     "Created",
  scraping:    "Enriching\u2026",
  data_parsed: "Enriched",
  drafted:     "Drafted",
  approved:    "Approved",
  sent:        "Sent",
  error:       "Missing data",
};
const STATUS_TONE: Record<string, "default" | "green" | "brand" | "amber" | "red"> = {
  created:     "default",
  scraping:    "brand",
  data_parsed: "green",
  drafted:     "brand",
  approved:    "amber",
  sent:        "brand",
  error:       "red",
};

const AVATAR_COLORS = [
  colors.brand, colors.green, colors.violet, colors.amber,
  colors.teal,  colors.red,   colors.brandInk,
];
function avatarColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function cleanDomain(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
function getPrimary(contacts: Contact[]) {
  return (
    contacts.find((c) => c.role?.toUpperCase() === "CEO") ||
    contacts.find((c) => c.role?.toUpperCase() === "CTO") ||
    contacts.find((c) => c.role?.toUpperCase() === "CFO") ||
    contacts[0] || null
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────
function FilterPill({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  return (
    <>
      <Button
        variant="outlined"
        size="small"
        endIcon={<ExpandMore sx={{ fontSize: "14px !important" }} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          textTransform: "none",
          fontSize: 12,
          fontWeight: 500,
          color: value ? colors.brand : colors.ink2,
          borderColor: value ? colors.brand : colors.border,
          borderRadius: "8px",
          px: 1.5,
          py: 0.5,
          bgcolor: value ? colors.brandSoft : "transparent",
          "&:hover": { borderColor: colors.borderStrong },
        }}
      >
        {label} {value ? `\u00b7 ${value}` : "\u00b7 All"}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { borderRadius: "10px", border: `1px solid ${colors.border}`, boxShadow: shadow.sh2, minWidth: 160 } }}
      >
        <MenuItem
          dense
          selected={!value}
          onClick={() => { onChange(""); setAnchor(null); }}
          sx={{ fontSize: 13, color: !value ? colors.brand : colors.ink1 }}
        >
          All
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o}
            dense
            selected={value === o}
            onClick={() => { onChange(o); setAnchor(null); }}
            sx={{ fontSize: 13, color: value === o ? colors.brand : colors.ink1 }}
          >
            {o}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const LeadsList: React.FC<LeadsListProps> = ({ onSendToSelected }) => {
  const queryClient = useQueryClient();

  // Enrichment polling
  const [scrapingTaskId, setScrapingTaskId]   = useState<string | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState(0);
  const [scrapingTotal, setScrapingTotal]     = useState(0);
  const [scrapingDomain, setScrapingDomain]   = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!scrapingTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getScrapingStatus(scrapingTaskId);
        setScrapingProgress(s.processed_companies ?? 0);
        setScrapingTotal(s.total_companies ?? 0);
        setScrapingDomain(s.current_domain ?? "");
        if (s.status === "completed") {
          clearInterval(pollRef.current!);
          setScrapingTaskId(null);
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          queryClient.invalidateQueries({ queryKey: ["company-stats"] });
          toast.success(`Enrichment done: ${s.successful_companies} succeeded, ${s.failed_companies} failed`);
        }
      } catch { clearInterval(pollRef.current!); setScrapingTaskId(null); }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [scrapingTaskId, queryClient]);

  // Filters + pagination
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNiche, setFilterNiche]   = useState("");
  const [filterLoc, setFilterLoc]       = useState("");
  const [filterBizType, setFilterBizType] = useState("");
  const [page, setPage]                 = useState(1);
  const [selected, setSelected]         = useState<Set<number>>(new Set());

  // Last upload info (localStorage)
  const [lastUploadName, setLastUploadName] = useState(() => localStorage.getItem("last_upload_name") || "");
  const [lastUploadTime, setLastUploadTime] = useState(() => localStorage.getItem("last_upload_time") || "");

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error("Please drop a .csv or .xlsx file");
      return;
    }
    uploadMutation.mutate(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit dialog
  const [editOpen, setEditOpen]     = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", website: "", niche: "", location: "",
    address: "", business_type: "independent", phone: "",
    ceo_name: "", ceo_email: "",
  });

  // Add lead dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", website: "", niche: "", location: "",
    address: "", business_type: "independent", phone: "",
    ceo_name: "", ceo_email: "", ceo_phone: "",
    email_subject: "", email_body: "",
  });

  // Queries
  const { data: statsData } = useQuery({
    queryKey: ["company-stats"],
    queryFn: api.getCompanyStats,
    refetchInterval: 15_000,
  });

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["companies", filterStatus, filterNiche, filterLoc, filterBizType, search],
    queryFn: () => api.getCompanies({
      status:        filterStatus   || undefined,
      search:        search         || undefined,
      niche:         filterNiche    || undefined,
      location:      filterLoc      || undefined,
      business_type: filterBizType  || undefined,
      limit: 500,
    }),
    keepPreviousData: true,
  } as any);

  // Unique filter options
  const allCompanies = useQuery<Company[]>({ queryKey: ["companies"], queryFn: () => api.getCompanies({ limit: 500 }) });
  const niches       = Array.from(new Set((allCompanies.data ?? []).map((c) => c.niche).filter(Boolean))) as string[];
  const locations    = Array.from(new Set((allCompanies.data ?? []).map((c) => c.location).filter(Boolean))) as string[];
  const bizTypes     = ["independent", "franchise"];
  const statusOptions = ["created", "scraping", "data_parsed", "drafted", "approved", "sent", "enriched", "pending", "error"];

  // Pagination
  const totalCount = companies.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const paginated  = companies.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Selection
  const allPageSelected = paginated.length > 0 && paginated.every((c) => selected.has(c.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) paginated.forEach((c) => next.delete(c.id));
      else paginated.forEach((c) => next.add(c.id));
      return next;
    });
  };
  const toggleRow = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Mutations
  const enrichMutation = useMutation({
    mutationFn: (ids?: number[]) => api.startScraping(ids),
    onSuccess: (data) => {
      if (data.task_id) {
        setScrapingTaskId(data.task_id);
        setScrapingProgress(0);
        setScrapingTotal(data.total_companies);
        toast.success(`Enrichment started for ${data.total_companies} leads\u2026`);
      } else {
        toast("No leads to enrich");
      }
    },
    onError: () => toast.error("Failed to start enrichment"),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadExcel(file),
    onSuccess: (data, file) => {
      const added   = data?.companies_added ?? 0;
      const skipped = data?.companies_skipped ?? 0;
      toast.success(`Upload done: ${added} added, ${skipped} skipped`);
      if (data?.errors?.length) toast.error(`${data.errors.length} row(s) had errors`);
      const now = new Date().toLocaleString();
      localStorage.setItem("last_upload_name", file.name);
      localStorage.setItem("last_upload_time", now);
      setLastUploadName(file.name);
      setLastUploadTime(now);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-stats"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCompany(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["companies"] }); queryClient.invalidateQueries({ queryKey: ["company-stats"] }); toast.success("Lead deleted"); },
    onError: () => toast.error("Delete failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => api.bulkDeleteCompanies(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-stats"] });
      setSelected(new Set());
      toast.success("Leads deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.updateCompany(editCompany!.id, {
      name: editForm.name, website: editForm.website || undefined,
      niche: editForm.niche || undefined, location: editForm.location || undefined,
      address: editForm.address || undefined,
      business_type: editForm.business_type || "independent",
      phone: editForm.phone || undefined,
      ceo_name: editForm.ceo_name || undefined,
      ceo_email: editForm.ceo_email || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditOpen(false);
      toast.success("Lead updated");
    },
    onError: () => toast.error("Update failed"),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createManualLead({
      name: addForm.name, website: addForm.website || undefined,
      niche: addForm.niche || undefined, location: addForm.location || undefined,
      address: addForm.address || undefined,
      business_type: addForm.business_type || "independent",
      phone: addForm.phone || undefined,
      ceo_name: addForm.ceo_name || undefined,
      ceo_email: addForm.ceo_email || undefined,
      ceo_phone: addForm.ceo_phone || undefined,
      email_subject: addForm.email_subject || undefined,
      email_body: addForm.email_body || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-stats"] });
      setAddOpen(false);
      setAddForm({ name: "", website: "", niche: "", location: "", address: "", business_type: "independent", phone: "", ceo_name: "", ceo_email: "", ceo_phone: "", email_subject: "", email_body: "" });
      toast.success("Lead added");
    },
    onError: () => toast.error("Failed to add lead"),
  });

  const openEdit = (co: Company) => {
    const p = getPrimary(co.contacts);
    setEditCompany(co);
    setEditForm({ name: co.name, website: co.website || "", niche: co.niche || "", location: co.location || "", address: co.address || "", business_type: co.business_type || "independent", phone: co.phone || "", ceo_name: p?.name || "", ceo_email: p?.email || "" });
    setEditOpen(true);
  };

  const handleExport = async (fmt: "csv" | "xlsx") => {
    try {
      const res = await api.exportLeadsBlob(fmt, {
        ...(filterNiche    ? { niche: filterNiche } : {}),
        ...(filterLoc      ? { location: filterLoc } : {}),
        ...(filterStatus   ? { status: filterStatus } : {}),
      });
      const blob = new Blob([res.data], {
        type: fmt === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `leads.${fmt}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.downloadLeadsTemplateBlob();
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "leads_template.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download template"); }
  };

  const handleBroadcast = () => {
    if (!onSendToSelected) return;
    const selectedCos = companies.filter((c) => selected.has(c.id));
    const payloads: BroadcastLeadPayload[] = selectedCos.map((c) => {
      const p = getPrimary(c.contacts);
      return { id: c.id, company_name: c.name, niche: c.niche ?? "", domain: c.website ?? "", location: c.location ?? "", platform: c.business_type ?? "", decision_maker: p?.name ?? "", owner_name: p?.name ?? "", role: p?.role ?? "", linkedin: "", email_pattern: "", ai_gap: "", remarks: "", email: p?.email ?? undefined };
    });
    try { localStorage.setItem(BROADCAST_LEADS_STORAGE_KEY, JSON.stringify(payloads)); } catch { /* ignore */ }
    onSendToSelected(Array.from(selected));
  };

  const stats = statsData ?? { total: 0, enriched: 0, pending: 0, errors: 0 };
  const enrichingName = scrapingTaskId ? `Enriching leads` : "";
  const enrichPct = scrapingTotal > 0 ? (scrapingProgress / scrapingTotal) * 100 : 0;

  if (isLoading) return <PageLoader label="Loading leads…" />;

  return (
    <Box>
      {/* Step indicator */}
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.ink3, mb: 1 }}>
        Step 1 of 3 &middot; Pipeline source
      </Typography>

      {/* Title row */}
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2.5}>
        <Box>
          <Typography variant="h2" fontWeight={800} color={colors.ink1} lineHeight={1.2} mb={0.5}>
            Leads
          </Typography>
          <Typography fontSize={14} color={colors.ink3}>
            Upload a CSV or XLSX, enrich each row with public data, then queue selected leads for broadcast.
          </Typography>
        </Box>
        {/* Stats badges */}
        <Box display="flex" gap={3} sx={{ border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, px: 2.5, py: 1.5, flexShrink: 0 }}>
          {[
            { label: "Total",    value: stats.total,    color: colors.ink1 },
            { label: "Enriched", value: stats.enriched, color: colors.green },
            { label: "Pending",  value: stats.pending,  color: colors.amber },
            { label: "Errors",   value: stats.errors,   color: colors.red },
          ].map(({ label, value, color }) => (
            <Box key={label} textAlign="center">
              <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: colors.ink3 }}>{label}</Typography>
              <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Step 1 + Step 2 cards */}
      <Box display="flex" gap={2} mb={3} sx={{ flexDirection: { xs: "column", md: "row" } }}>
        {/* Step 1: Upload */}
        <Box sx={{ flex: "0 0 calc(44% - 8px)", border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, p: "20px 22px" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: colors.ink3, mb: 0.5 }}>Step 1</Typography>
          <Typography fontWeight={700} fontSize={15} color={colors.ink1} mb={1}>Upload a spreadsheet</Typography>
          <Typography fontSize={12} color={colors.ink3} mb={1.5}>
            Required columns:{" "}
            <Box component="span" sx={{ fontWeight: 600, color: colors.ink2 }}>Company_Name</Box> and{" "}
            <Box component="span" sx={{ fontWeight: 600, color: colors.ink2 }}>Website</Box>.
            {" "}Optional: Niche, Location, Address, Business_Type.
          </Typography>

          {/* Drop zone */}
          <Box
            ref={dropRef}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onDrop(file);
            }}
            sx={{
              border: `2px dashed ${isDragging ? colors.brand : colors.border}`,
              borderRadius: "10px",
              bgcolor: isDragging ? colors.brandSoft : colors.bgSunken,
              p: 3,
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.15s",
              mb: 1.5,
              "&:hover": { borderColor: colors.brand, bgcolor: colors.brandSoft },
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onDrop(f); e.target.value = ""; }}
            />
            <CloudUpload sx={{ fontSize: 28, color: uploadMutation.isPending ? colors.brand : colors.ink4, mb: 0.5 }} />
            {uploadMutation.isPending ? (
              <>
                <Typography fontSize={13} fontWeight={500} color={colors.brand}>Uploading\u2026</Typography>
                <LinearProgress sx={{ mt: 1, borderRadius: 999 }} />
              </>
            ) : (
              <>
                <Typography fontSize={13} fontWeight={500} color={colors.ink2}>Drop your CSV or XLSX here</Typography>
                <Typography fontSize={12} color={colors.ink3}>or <Box component="span" sx={{ color: colors.brand, fontWeight: 600 }}>browse files</Box> &middot; max 5MB</Typography>
              </>
            )}
          </Box>

          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download sx={{ fontSize: "14px !important" }} />}
              onClick={handleDownloadTemplate}
              sx={{ fontSize: 12, textTransform: "none", borderColor: colors.border, color: colors.ink2, borderRadius: "8px", "&:hover": { borderColor: colors.borderStrong } }}
            >
              Download template
            </Button>
            {lastUploadName && (
              <Typography fontSize={11} color={colors.ink4} noWrap maxWidth={160} title={lastUploadName}>
                Last upload &middot; {lastUploadName} &middot; {lastUploadTime}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Step 2: Enrich */}
        <Box sx={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, p: "20px 22px" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: colors.ink3, mb: 0.5 }}>Step 2</Typography>
          <Typography fontWeight={700} fontSize={15} color={colors.ink1} mb={1}>Enrich with public data</Typography>
          <Typography fontSize={12} color={colors.ink3} mb={2}>
            We scrape each company&#39;s site for decision makers, contact info, location and business type. Average time per lead: <Box component="span" fontWeight={600} color={colors.ink2}>~6 seconds</Box>.
          </Typography>

          {scrapingTaskId ? (
            <Box>
              <Box display="flex" justifyContent="space-between" mb={0.75}>
                <Typography fontSize={13} fontWeight={500} color={colors.ink1}>{enrichingName}</Typography>
                <Typography fontSize={13} fontWeight={600} color={colors.ink1}>{scrapingProgress} / {scrapingTotal}</Typography>
              </Box>
              <LinearProgress variant="determinate" value={enrichPct} sx={{ height: 6, borderRadius: 999, bgcolor: colors.bgSunken, "& .MuiLinearProgress-bar": { bgcolor: colors.brand, borderRadius: 999 } }} />
              {scrapingDomain && (
                <Typography fontSize={12} color={colors.ink3} mt={0.75}>
                  Now processing &middot; <Box component="span" fontWeight={500} color={colors.ink2}>{scrapingDomain}</Box>
                </Typography>
              )}
            </Box>
          ) : (
            <Box display="flex" gap={1.5}>
              <Button
                variant="contained"
                size="small"
                startIcon={<AutoFixHigh sx={{ fontSize: "14px !important" }} />}
                disabled={enrichMutation.isPending}
                onClick={() => enrichMutation.mutate(selected.size > 0 ? Array.from(selected) : undefined)}
                sx={{ textTransform: "none", fontSize: 12, fontWeight: 600, px: 2, bgcolor: colors.brand, "&:hover": { bgcolor: colors.brandInk }, borderRadius: "8px" }}
              >
                {selected.size > 0 ? `Enrich ${selected.size} selected` : "Enrich all"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download sx={{ fontSize: "14px !important" }} />}
                onClick={() => handleExport("csv")}
                sx={{ textTransform: "none", fontSize: 12, borderColor: colors.border, color: colors.ink2, borderRadius: "8px" }}
              >
                Export CSV
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download sx={{ fontSize: "14px !important" }} />}
                onClick={() => handleExport("xlsx")}
                sx={{ textTransform: "none", fontSize: 12, borderColor: colors.border, color: colors.ink2, borderRadius: "8px" }}
              >
                Export XLSX
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Filters row */}
      <Box display="flex" gap={1} mb={1.5} flexWrap="wrap" alignItems="center">
        {/* Search */}
        <Box sx={{ position: "relative", flex: { xs: "1 1 100%", sm: "0 0 280px" } }}>
          <Search sx={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: colors.ink4 }} />
          <Box
            component="input"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by company, website, contact\u2026"
            sx={{
              width: "100%",
              height: 34,
              pl: "32px",
              pr: "32px",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              bgcolor: colors.bgElev,
              fontSize: 12,
              color: colors.ink1,
              outline: "none",
              fontFamily: "inherit",
              "&:focus": { borderColor: colors.brand, boxShadow: `0 0 0 2px ${colors.brandRing}` },
              "&::placeholder": { color: colors.ink4 },
            }}
          />
          <Typography sx={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: colors.ink4, fontFamily: "monospace", lineHeight: 1, border: `1px solid ${colors.border}`, borderRadius: "4px", px: 0.5, py: 0.25 }}>
            /
          </Typography>
        </Box>

        <FilterPill label="Status"        value={filterStatus}  options={statusOptions.map((s) => STATUS_LABEL[s] ?? s)} onChange={(v) => { setFilterStatus(Object.entries(STATUS_LABEL).find(([, l]) => l === v)?.[0] ?? v); setPage(1); }} />
        <FilterPill label="Niche"         value={filterNiche}   options={niches}    onChange={(v) => { setFilterNiche(v); setPage(1); }} />
        <FilterPill label="Location"      value={filterLoc}     options={locations} onChange={(v) => { setFilterLoc(v); setPage(1); }} />
        <FilterPill label="Business type" value={filterBizType} options={bizTypes}  onChange={(v) => { setFilterBizType(v); setPage(1); }} />

        <Box flex={1} />

        <Button
          variant="contained"
          size="small"
          startIcon={<Add sx={{ fontSize: "14px !important" }} />}
          onClick={() => setAddOpen(true)}
          sx={{ textTransform: "none", fontSize: 12, fontWeight: 600, px: 2, bgcolor: colors.brand, "&:hover": { bgcolor: colors.brandInk }, borderRadius: "8px", flexShrink: 0 }}
        >
          Add lead
        </Button>
      </Box>

      {/* Selection bar */}
      {selected.size > 0 && (
        <Box
          display="flex"
          alignItems="center"
          gap={1.5}
          sx={{
            px: 2,
            py: 1,
            mb: 1,
            bgcolor: colors.brandSoft,
            border: `1px solid ${colors.brandSoft2}`,
            borderRadius: "10px",
          }}
        >
          <Typography fontSize={13} fontWeight={500} color={colors.brandInk}>
            {selected.size} lead{selected.size !== 1 ? "s" : ""} selected &middot; of {totalCount} total
          </Typography>
          <Box flex={1} />
          <Button
            size="small"
            variant="contained"
            startIcon={<AutoFixHigh sx={{ fontSize: "13px !important" }} />}
            disabled={enrichMutation.isPending}
            onClick={() => enrichMutation.mutate(Array.from(selected))}
            sx={{ textTransform: "none", fontSize: 12, bgcolor: colors.green, "&:hover": { bgcolor: "#24714a" }, borderRadius: "7px", px: 1.5 }}
          >
            Enrich selected
          </Button>
          {onSendToSelected && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Send sx={{ fontSize: "13px !important" }} />}
              onClick={handleBroadcast}
              sx={{ textTransform: "none", fontSize: 12, borderColor: colors.brand, color: colors.brand, borderRadius: "7px", px: 1.5 }}
            >
              Send to broadcast
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<Delete sx={{ fontSize: "13px !important" }} />}
            onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
            sx={{ textTransform: "none", fontSize: 12, borderColor: colors.red, color: colors.red, borderRadius: "7px", px: 1.5 }}
          >
            Delete
          </Button>
        </Box>
      )}

      {/* Table */}
      <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, overflow: "hidden", boxShadow: shadow.sh1 }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ pl: 2, bgcolor: colors.bgSunken }}>
                  <Checkbox size="small" checked={allPageSelected} indeterminate={selected.size > 0 && !allPageSelected} onChange={toggleAll} sx={{ color: colors.border, "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: colors.brand } }} />
                </TableCell>
                {["Company", "Niche", "Location", "Owner / Contact", "Email", "Type", "Status", "", ""].map((h, i) => (
                  <TableCell key={i} sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.ink3, py: 1.25, bgcolor: colors.bgSunken, whiteSpace: "nowrap" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 4 }}>
                    <LinearProgress sx={{ borderRadius: 999 }} />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6, color: colors.ink4, fontSize: 13 }}>
                    {search || filterStatus || filterNiche || filterLoc || filterBizType
                      ? "No leads match your filters."
                      : "No leads yet \u2014 upload a spreadsheet to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((co) => {
                  const primary = getPrimary(co.contacts);
                  const inits   = initials(co.name);
                  const bg      = avatarColor(inits);
                  const domain  = cleanDomain(co.website || "");
                  const statusLabel = STATUS_LABEL[co.status] ?? co.status;
                  const tone = STATUS_TONE[co.status] ?? "default";
                  return (
                    <TableRow
                      key={co.id}
                      hover
                      selected={selected.has(co.id)}
                      sx={{ "& td": { py: 1.25, borderBottom: `1px solid ${colors.borderSubtle}` }, cursor: "default" }}
                    >
                      <TableCell padding="checkbox" sx={{ pl: 2 }}>
                        <Checkbox size="small" checked={selected.has(co.id)} onChange={() => toggleRow(co.id)} sx={{ color: colors.border, "&.Mui-checked": { color: colors.brand } }} />
                      </TableCell>

                      {/* Company */}
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1.25}>
                          <Box sx={{ width: 30, height: 30, borderRadius: "8px", bgcolor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{inits}</Typography>
                          </Box>
                          <Box minWidth={0}>
                            <Typography fontSize={13} fontWeight={500} color={colors.ink1} noWrap>{co.name}</Typography>
                            <Typography fontSize={11} color={colors.ink4} noWrap>{domain}</Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Niche */}
                      <TableCell>
                        {co.niche ? (
                          <Box sx={{ display: "inline-block", px: 1, py: 0.25, bgcolor: colors.bgSunken, border: `1px solid ${colors.border}`, borderRadius: "6px" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 500, color: colors.ink2, whiteSpace: "nowrap" }}>{co.niche}</Typography>
                          </Box>
                        ) : <Typography fontSize={12} color={colors.ink4}>\u2014</Typography>}
                      </TableCell>

                      {/* Location */}
                      <TableCell>
                        <Typography fontSize={12} color={colors.ink2} noWrap>{co.location || "\u2014"}</Typography>
                      </TableCell>

                      {/* Owner / Contact */}
                      <TableCell>
                        {primary ? (
                          <>
                            <Typography fontSize={13} fontWeight={500} color={colors.ink1} noWrap>{primary.name || "\u2014"}</Typography>
                            <Typography fontSize={11} color={colors.ink3} noWrap>{primary.role}</Typography>
                          </>
                        ) : <Typography fontSize={12} color={colors.ink4}>\u2014</Typography>}
                      </TableCell>

                      {/* Email */}
                      <TableCell sx={{ maxWidth: 180 }}>
                        <Typography fontSize={12} color={colors.ink2} noWrap title={primary?.email || ""}>{primary?.email || "\u2014"}</Typography>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <Box sx={{ display: "inline-block", px: 1, py: 0.25, bgcolor: co.business_type === "franchise" ? colors.amberSoft : colors.bgSunken, border: `1px solid ${co.business_type === "franchise" ? colors.amberSoft : colors.border}`, borderRadius: "6px" }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 500, color: co.business_type === "franchise" ? colors.amber : colors.ink3, whiteSpace: "nowrap" }}>
                            {co.business_type === "franchise" ? "Franchise" : "Independent"}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusChip tone={tone} dot label={statusLabel} />
                      </TableCell>

                      {/* Edit */}
                      <TableCell sx={{ width: 36, pr: 0 }}>
                        <IconButton size="small" onClick={() => openEdit(co)} sx={{ color: colors.ink4, "&:hover": { color: colors.ink2 } }}>
                          <Edit sx={{ fontSize: 15 }} />
                        </IconButton>
                      </TableCell>

                      {/* Delete */}
                      <TableCell sx={{ width: 36, pl: 0 }}>
                        <IconButton size="small" onClick={() => deleteMutation.mutate(co.id)} sx={{ color: colors.ink4, "&:hover": { color: colors.red } }}>
                          <Delete sx={{ fontSize: 15 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, py: 1.5, borderTop: `1px solid ${colors.border}` }}>
          <Typography fontSize={12} color={colors.ink3}>
            Showing {Math.min((page - 1) * PER_PAGE + 1, totalCount)}&ndash;{Math.min(page * PER_PAGE, totalCount)} of {totalCount} leads
          </Typography>
          <Box display="flex" alignItems="center" gap={0.5}>
            <IconButton size="small" disabled={page === 1} onClick={() => setPage((p) => p - 1)} sx={{ color: colors.ink3, "&:disabled": { opacity: 0.35 } }}>
              <ArrowBack sx={{ fontSize: 15 }} />
            </IconButton>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return (
                <Button
                  key={p}
                  size="small"
                  onClick={() => setPage(p)}
                  sx={{
                    minWidth: 30, height: 30, p: 0, fontSize: 12, fontWeight: 500, borderRadius: "7px",
                    bgcolor: p === page ? colors.brand : "transparent",
                    color: p === page ? "#fff" : colors.ink2,
                    "&:hover": { bgcolor: p === page ? colors.brandInk : colors.bgSunken },
                  }}
                >
                  {p}
                </Button>
              );
            })}
            <IconButton size="small" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} sx={{ color: colors.ink3, "&:disabled": { opacity: 0.35 } }}>
              <ArrowForward sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "14px" } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, pb: 1 }}>Edit lead</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            {[
              { key: "name",     label: "Company name",  required: true },
              { key: "website",  label: "Website" },
              { key: "niche",    label: "Niche" },
              { key: "location", label: "Location" },
              { key: "phone",    label: "Phone" },
              { key: "ceo_name", label: "Contact name" },
              { key: "ceo_email",label: "Contact email" },
            ].map(({ key, label, required }) => (
              <TextField
                key={key}
                size="small"
                label={label}
                required={required}
                value={(editForm as any)[key]}
                onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editForm.name} sx={{ textTransform: "none", bgcolor: colors.brand, "&:hover": { bgcolor: colors.brandInk } }}>
            {updateMutation.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add lead dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "14px" } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, pb: 1 }}>Add lead manually</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            {[
              { key: "name",          label: "Company name",  required: true },
              { key: "website",       label: "Website" },
              { key: "niche",         label: "Niche" },
              { key: "location",      label: "Location" },
              { key: "phone",         label: "Phone" },
              { key: "ceo_name",      label: "Contact name" },
              { key: "ceo_email",     label: "Contact email" },
              { key: "email_subject", label: "Email subject (optional)" },
              { key: "email_body",    label: "Email body (optional)", multiline: true },
            ].map(({ key, label, required, multiline }) => (
              <TextField
                key={key}
                size="small"
                label={label}
                required={required}
                multiline={multiline}
                minRows={multiline ? 3 : undefined}
                value={(addForm as any)[key]}
                onChange={(e) => setAddForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !addForm.name} sx={{ textTransform: "none", bgcolor: colors.brand, "&:hover": { bgcolor: colors.brandInk } }}>
            {createMutation.isPending ? "Adding\u2026" : "Add lead"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeadsList;