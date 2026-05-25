import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AttachFile,
  AutoAwesome,
  Bookmark,
  Check,
  Close,
  Edit,
  Refresh,
  Save,
  Send,
  Shield,
  TaskAlt,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { colors } from "../theme/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BroadcastLead {
  company_id: number;
  company_name: string;
  domain: string;
  niche: string;
  location: string;
  contact_name: string;
  contact_email: string;
  template_id: number | null;
  status: "pending" | "drafting" | "drafted" | "approved" | "rejected" | "sent";
  subject: string;
  body: string;
  filled_vars: Record<string, string>;
}

interface CampaignTemplate {
  id: number;
  name: string;
  subject_template: string;
  body_template: string;
  attach_portfolio: boolean;
  tags: string | null;
  is_default: boolean;
}

interface PortfolioFile {
  original_name: string;
  stored_name: string;
  size: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; fg: string; dot?: string }
> = {
  pending: { label: "Not generated", bg: colors.bgSunken, fg: colors.ink4 },
  drafting: {
    label: "Drafting...",
    bg: colors.brandSoft,
    fg: colors.brand,
    dot: "◇",
  },
  drafted: {
    label: "Needs review",
    bg: colors.amberSoft,
    fg: colors.amber,
    dot: "●",
  },
  approved: {
    label: "Approved",
    bg: colors.greenSoft,
    fg: colors.green,
    dot: "✓",
  },
  rejected: { label: "Rejected", bg: colors.redSoft, fg: colors.red, dot: "✕" },
  sent: { label: "Sent", bg: colors.bgSunken, fg: colors.ink3, dot: "→" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        px: "7px",
        py: "2px",
        bgcolor: cfg.bg,
        borderRadius: "6px",
        flexShrink: 0,
      }}
    >
      {cfg.dot && (
        <Box
          component="span"
          sx={{ fontSize: 10, color: cfg.fg, lineHeight: 1 }}
        >
          {cfg.dot}
        </Box>
      )}
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: cfg.fg }}>
        {cfg.label}
      </Typography>
    </Box>
  );
}

// ── Lead row in the left panel ────────────────────────────────────────────────
function LeadRow({
  lead,
  selected,
  active,
  onToggle,
  onClick,
}: {
  lead: BroadcastLead;
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        px: "12px",
        py: "10px",
        borderLeft: `3px solid ${active ? colors.brand : "transparent"}`,
        bgcolor: active ? colors.brandSoft : "transparent",
        borderBottom: `1px solid ${colors.borderSubtle}`,
        cursor: "pointer",
        transition: "all 0.1s",
        "&:hover": { bgcolor: active ? colors.brandSoft : colors.bgSunken },
      }}
    >
      <Checkbox
        checked={selected}
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        sx={{
          p: "2px",
          mt: "1px",
          flexShrink: 0,
          color: colors.ink4,
          "&.Mui-checked": { color: colors.brand },
        }}
      />
      <Box flex={1} minWidth={0}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb="2px"
        >
          <Typography
            fontWeight={600}
            fontSize={13}
            color={colors.ink1}
            noWrap
            sx={{ flex: 1, mr: "6px" }}
          >
            {lead.company_name}
          </Typography>
          <StatusBadge status={lead.status} />
        </Box>
        <Typography fontSize={12} color={colors.ink3} noWrap mb="1px">
          {lead.contact_name || "\u00a0"}
        </Typography>
        <Typography
          fontSize={11}
          color={colors.ink4}
          noWrap
          sx={{ fontFamily: "monospace" }}
        >
          {lead.contact_email || lead.domain || "\u2014"}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Email metadata row (FROM / TO / SUBJECT / ATTACH) ─────────────────────────
function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: 36,
        borderBottom: `1px solid ${colors.borderSubtle}`,
        px: "20px",
      }}
    >
      <Typography
        sx={{
          width: 60,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.ink4,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box flex={1}>{children}</Box>
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const EmailBroadcast: React.FC<{ initialSelectedIds?: number[]; initialTemplateId?: number | null }> = ({
  initialSelectedIds = [],
  initialTemplateId = null,
}) => {
  const queryClient = useQueryClient();

  // ── Data queries ──
  const { data: rawCompanies = [] } = useQuery({
    queryKey: ["companies", "broadcast"],
    queryFn: () => api.getCompanies({ limit: 500 }),
    staleTime: 30_000,
  });

  const { data: campaignTemplates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
    staleTime: 60_000,
  });

  const { data: portfolioFiles = [] } = useQuery<PortfolioFile[]>({
    queryKey: ["portfolio"],
    queryFn: api.listPortfolio,
    staleTime: 60_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 120_000,
  });

  // ── State ──
  const [leads, setLeads] = useState<BroadcastLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(
    new Set(initialSelectedIds),
  );
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | "">(initialTemplateId ?? "");
  const [attachPortfolio, setAttachPortfolio] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({
    done: 0,
    total: 0,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);

  // Initialise leads list from companies
  useEffect(() => {
    const companies: any[] = Array.isArray(rawCompanies)
      ? rawCompanies
      : ((rawCompanies as any)?.companies ?? []);

    const initialLeads: BroadcastLead[] = companies.map((c: any) => ({
      company_id: c.id,
      company_name: c.name,
      domain: (c.website || "").replace(/https?:\/\//, "").split("/")[0],
      niche: c.niche || "",
      location: c.location || "",
      contact_name: c.contacts?.[0]?.name || "",
      contact_email: c.contacts?.[0]?.email || "",
      template_id: null,
      status: "pending" as const,
      subject: "",
      body: "",
      filled_vars: {},
    }));
    setLeads(initialLeads);

    if (initialSelectedIds.length > 0) {
      setSelectedLeadIds(new Set(initialSelectedIds));
    } else if (initialLeads.length > 0) {
      // Select all by default
      setSelectedLeadIds(new Set(initialLeads.map((l) => l.company_id)));
    }
  }, [rawCompanies]); // eslint-disable-line

  // Default template selection
  useEffect(() => {
    if (campaignTemplates.length > 0 && selectedTemplateId === "") {
      const def =
        campaignTemplates.find((t) => t.is_default) ?? campaignTemplates[0];
      setSelectedTemplateId(def.id);
      setAttachPortfolio(def.attach_portfolio ?? false);
    }
  }, [campaignTemplates]); // eslint-disable-line

  // Attach-portfolio default from template
  useEffect(() => {
    if (selectedTemplateId !== "") {
      const t = campaignTemplates.find((t) => t.id === selectedTemplateId);
      if (t) setAttachPortfolio(t.attach_portfolio ?? false);
    }
  }, [selectedTemplateId]); // eslint-disable-line

  const senderName =
    settingsData?.values?.SENDER_FULL_NAME ||
    settingsData?.values?.SMTP_FROM_NAME ||
    "Sender";
  const senderEmail =
    settingsData?.values?.SMTP_FROM_EMAIL || "sender@example.com";

  const activeLead = leads.find((l) => l.company_id === activeLeadId) ?? null;

  const approvedIds = leads
    .filter((l) => l.status === "approved" && l.template_id !== null)
    .map((l) => l.template_id as number);

  const selectedList = leads.filter((l) => selectedLeadIds.has(l.company_id));

  // ── Save campaign ──
  const handleSaveCampaign = async () => {
    if (!campaignName.trim()) return;
    setIsSavingCampaign(true);
    try {
      await api.createCampaign({
        name: campaignName.trim(),
        template_id: selectedTemplateId ? (selectedTemplateId as number) : null,
        company_ids: Array.from(selectedLeadIds),
        use_ai: useAi,
      });
      toast.success(`Campaign "${campaignName.trim()}" saved!`);
      setSaveDialogOpen(false);
      setCampaignName("");
    } catch {
      toast.error("Failed to save campaign");
    } finally {
      setIsSavingCampaign(false);
    }
  };

  // ── Stop generation ──
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // ── Generate mutation ──
  const handleGenerate = useCallback(async () => {
    if (!selectedTemplateId) {
      toast.error("Select a template first");
      return;
    }
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) {
      toast.error("Select at least one lead");
      return;
    }

    // Set up abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Start elapsed timer
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    setIsGenerating(true);
    setGenerateProgress({ done: 0, total: ids.length });

    // Mark all selected as "drafting"
    setLeads((prev) =>
      prev.map((l) =>
        selectedLeadIds.has(l.company_id) ? { ...l, status: "drafting" } : l,
      ),
    );

    try {
      const res = await api.broadcastGenerate({
        company_ids: ids,
        campaign_template_id: selectedTemplateId as number,
        attach_portfolio: attachPortfolio,
        use_ai: useAi,
      }, controller.signal);

      setGenerateProgress({ done: res.generated, total: ids.length });

      // Merge results into leads
      const byCompany = Object.fromEntries(
        res.results.map((r) => [r.company_id, r]),
      );
      setLeads((prev) =>
        prev.map((l) => {
          const r = byCompany[l.company_id];
          if (!r) return l;
          return {
            ...l,
            template_id: r.template_id,
            status: "drafted" as const,
            subject: r.subject,
            body: r.body,
            contact_name: r.contact_name || l.contact_name,
            contact_email: r.contact_email || l.contact_email,
            domain: r.domain || l.domain,
            niche: r.niche || l.niche,
            location: r.location || l.location,
            filled_vars: r.filled_vars || {},
          };
        }),
      );

      // Auto-select first draft
      if (res.results.length > 0 && !activeLeadId) {
        setActiveLeadId(res.results[0].company_id);
      }
      toast.success(
        `${res.generated} draft${res.generated !== 1 ? "s" : ""} generated`,
      );
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") {
        toast("Generation stopped", { icon: "⏹" });
      } else {
        toast.error(err?.response?.data?.detail || "Generation failed");
      }
      setLeads((prev) =>
        prev.map((l) =>
          selectedLeadIds.has(l.company_id) && l.status === "drafting"
            ? { ...l, status: "pending" }
            : l,
        ),
      );
    } finally {
      setIsGenerating(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      abortControllerRef.current = null;
    }
  }, [
    selectedTemplateId,
    selectedLeadIds,
    attachPortfolio,
    useAi,
    activeLeadId,
  ]);

  // ── Approve ──
  const approveMutation = useMutation({
    mutationFn: (templateId: number) => api.approveEmail(templateId),
    onSuccess: (_, templateId) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.template_id === templateId ? { ...l, status: "approved" } : l,
        ),
      );
      toast.success("Approved");
      goNext();
    },
    onError: () => toast.error("Approve failed"),
  });

  // ── Reject ──
  const rejectMutation = useMutation({
    mutationFn: (templateId: number) => api.rejectEmailTemplate(templateId),
    onSuccess: (_, templateId) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.template_id === templateId ? { ...l, status: "rejected" } : l,
        ),
      );
      goNext();
    },
    onError: () => toast.error("Reject failed"),
  });

  // ── Save edit ──
  const saveMutation = useMutation({
    mutationFn: ({
      id,
      subject,
      body,
    }: {
      id: number;
      subject: string;
      body: string;
    }) => api.updateEmailTemplate(id, { subject, body }),
    onSuccess: (data, vars) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.template_id === vars.id
            ? { ...l, subject: vars.subject, body: vars.body }
            : l,
        ),
      );
      setEditMode(false);
      toast.success("Saved");
    },
    onError: () => toast.error("Save failed"),
  });

  // ── Send approved ──
  const sendMutation = useMutation({
    mutationFn: () =>
      api.broadcastSendApproved({
        template_ids: approvedIds,
        attach_portfolio: attachPortfolio,
      }),
    onSuccess: (res) => {
      toast.success(`Sent ${res.sent} email${res.sent !== 1 ? "s" : ""}`);
      setLeads((prev) =>
        prev.map((l) =>
          l.status === "approved" ? { ...l, status: "sent" } : l,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["emailLogs"] });
    },
    onError: () => toast.error("Send failed"),
  });

  // ── Regenerate single ──
  const regenerateOne = useCallback(async () => {
    if (!activeLead || !selectedTemplateId) return;
    setLeads((prev) =>
      prev.map((l) =>
        l.company_id === activeLead.company_id
          ? { ...l, status: "drafting" }
          : l,
      ),
    );
    try {
      const res = await api.broadcastGenerate({
        company_ids: [activeLead.company_id],
        campaign_template_id: selectedTemplateId as number,
        attach_portfolio: attachPortfolio,
        use_ai: useAi,
      });
      if (res.results.length > 0) {
        const r = res.results[0];
        setLeads((prev) =>
          prev.map((l) =>
            l.company_id === r.company_id
              ? {
                  ...l,
                  template_id: r.template_id,
                  status: "drafted",
                  subject: r.subject,
                  body: r.body,
                  filled_vars: r.filled_vars,
                }
              : l,
          ),
        );
        setEditMode(false);
      }
    } catch {
      toast.error("Regenerate failed");
      setLeads((prev) =>
        prev.map((l) =>
          l.company_id === activeLead.company_id
            ? { ...l, status: "drafted" }
            : l,
        ),
      );
    }
  }, [activeLead, selectedTemplateId, attachPortfolio, useAi]);

  // ── Navigate to next unreviewed lead ──
  const goNext = useCallback(() => {
    const order = selectedList.filter((l) => l.status === "drafted");
    if (order.length > 0) {
      setActiveLeadId(order[0].company_id);
    }
    setEditMode(false);
  }, [selectedList]);

  // ── Edit mode sync ──
  useEffect(() => {
    if (activeLead) {
      setEditSubject(activeLead.subject);
      setEditBody(
        activeLead.body.startsWith("<")
          ? stripHtml(activeLead.body)
          : activeLead.body,
      );
      setEditMode(false);
    }
  }, [activeLeadId]); // eslint-disable-line

  // ── Selection helpers ──
  const toggleLead = (id: number) =>
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.company_id)));
    }
  };

  const selectedTemplate = campaignTemplates.find(
    (t) => t.id === selectedTemplateId,
  );
  const portfolioFilename = portfolioFiles[0]?.original_name ?? null;
  const draftedCount = leads.filter(
    (l) => selectedLeadIds.has(l.company_id) && l.status === "drafted",
  ).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        bgcolor: colors.bg,
      }}
    >
      {/* ── Page header ── */}
      <Box sx={{ px: "28px", pt: "20px", pb: "4px", flexShrink: 0 }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.ink4,
            mb: "4px",
          }}
        >
          Step 3 of 3 &middot; Review &amp; Send
        </Typography>
        {/* Generating status bar — shown above header row when active */}
        {isGenerating && (() => {
          const total = generateProgress.total || selectedLeadIds.size;
          const secsPerLead = useAi ? 25 : 3;
          const estTotal = total * secsPerLead;
          const remaining = Math.max(0, estTotal - elapsedSeconds);
          const fmt = (s: number) => s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mb: "10px" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  px: "12px",
                  py: "6px",
                  bgcolor: colors.brandSoft,
                  border: `1px solid ${colors.brand}`,
                  borderRadius: "8px",
                  flexShrink: 0,
                }}
              >
                <CircularProgress size={10} sx={{ color: colors.brand }} />
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.brand, whiteSpace: "nowrap" }}>
                  Generating {generateProgress.done}/{total}
                </Typography>
                <Typography sx={{ fontSize: 11, color: colors.brandInk, opacity: 0.75, whiteSpace: "nowrap" }}>
                  &nbsp;·&nbsp;{fmt(elapsedSeconds)} elapsed · ~{fmt(remaining)} left
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={handleStopGeneration}
                sx={{
                  textTransform: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#ef4444",
                  borderColor: "#ef4444",
                  borderRadius: "8px",
                  py: "5px",
                  px: "10px",
                  flexShrink: 0,
                  "&:hover": { bgcolor: "#fff0f0", borderColor: "#dc2626" },
                }}
              >
                ⏹ Stop
              </Button>
            </Box>
          );
        })()}

        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography
              variant="h2"
              fontWeight={800}
              color={colors.ink1}
              lineHeight={1.2}
            >
              Broadcast
            </Typography>
            <Typography
              fontSize={13}
              color={colors.ink3}
              mt="3px"
              maxWidth={500}
            >
              The AI generates a personalized email per lead from your template.
              Review each draft, tweak what you want, then send.
            </Typography>
          </Box>
          {/* Top-right actions */}
          <Box display="flex" alignItems="center" gap="8px">
            {!isGenerating && draftedCount > 0 && (
              <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
                {draftedCount} need{draftedCount !== 1 ? "" : "s"} review
              </Typography>
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<Bookmark sx={{ fontSize: "13px !important" }} />}
              disabled={selectedLeadIds.size === 0 || !selectedTemplateId}
              onClick={() => { setCampaignName(""); setSaveDialogOpen(true); }}
              sx={{
                textTransform: "none",
                fontSize: 12,
                borderColor: colors.border,
                color: colors.ink2,
                borderRadius: "8px",
                "&:hover": { borderColor: colors.borderStrong },
              }}
            >
              Save as campaign
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={approvedIds.length === 0 || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
              startIcon={<Send sx={{ fontSize: "13px !important" }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                bgcolor: colors.brand,
                "&:hover": { bgcolor: colors.brandInk },
                "&:disabled": {
                  bgcolor: colors.brandSoft,
                  color: colors.brandInk,
                },
                borderRadius: "8px",
              }}
            >
              {approvedIds.length > 0
                ? `Send ${approvedIds.length} approved`
                : "Send approved"}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Controls bar ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          px: "28px",
          py: "10px",
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Template selector */}
        <Box display="flex" alignItems="center" gap="6px">
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: colors.brand,
              flexShrink: 0,
            }}
          />
          <Select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value as number)}
            size="small"
            displayEmpty
            renderValue={(v) =>
              !v ? "Select template" : (selectedTemplate?.name ?? "Template")
            }
            sx={{
              fontSize: 12,
              fontWeight: 500,
              color: colors.ink1,
              bgcolor: colors.bgElev,
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              minWidth: 200,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            }}
          >
            {campaignTemplates.map((t) => (
              <MenuItem key={t.id} value={t.id} sx={{ fontSize: 13 }}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* Mode */}
        <Box display="flex" alignItems="center" gap="6px">
          <Select
            value="same"
            size="small"
            sx={{
              fontSize: 12,
              color: colors.ink2,
              bgcolor: colors.bgElev,
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              minWidth: 180,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            }}
          >
            <MenuItem value="same" sx={{ fontSize: 13 }}>
              Same template for all &mdash; {selectedLeadIds.size} lead
              {selectedLeadIds.size !== 1 ? "s" : ""}
            </MenuItem>
          </Select>
        </Box>

        {/* AI toggle */}
        <Tooltip
          title={
            useAi
              ? "AI will deeply personalize each draft"
              : "Fast: substitutes placeholders only"
          }
        >
          <Box
            display="flex"
            alignItems="center"
            gap="4px"
            sx={{ cursor: "pointer" }}
            onClick={() => setUseAi((p) => !p)}
          >
            <AutoAwesome
              sx={{
                fontSize: 14,
                color: useAi ? colors.violet : colors.ink4,
                transition: "color 0.15s",
              }}
            />
            <Typography
              sx={{
                fontSize: 12,
                color: useAi ? colors.violet : colors.ink3,
                fontWeight: useAi ? 600 : 400,
                transition: "color 0.15s",
              }}
            >
              AI personalize
            </Typography>
            <Switch
              checked={useAi}
              size="small"
              sx={{
                "& .MuiSwitch-thumb": {
                  bgcolor: useAi ? colors.violet : undefined,
                },
                "& .Mui-checked + .MuiSwitch-track": { bgcolor: colors.violet },
              }}
            />
          </Box>
        </Tooltip>

        {/* Portfolio toggle */}
        <Box display="flex" alignItems="center" gap="4px">
          <Switch
            checked={attachPortfolio}
            size="small"
            onChange={(e) => setAttachPortfolio(e.target.checked)}
            sx={{
              "& .Mui-checked + .MuiSwitch-track": { bgcolor: colors.brand },
            }}
          />
          <AttachFile sx={{ fontSize: 13, color: colors.ink3 }} />
          <Typography sx={{ fontSize: 12, color: colors.ink2 }}>
            Attach portfolio
            {attachPortfolio && portfolioFilename && (
              <Box
                component="span"
                sx={{ color: colors.brand, ml: "4px", fontWeight: 500 }}
              >
                &middot; {portfolioFilename}
              </Box>
            )}
          </Typography>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Generate / Regenerate all */}
        <Button
          variant="outlined"
          size="small"
          disabled={
            isGenerating || !selectedTemplateId || selectedLeadIds.size === 0
          }
          onClick={handleGenerate}
          startIcon={
            isGenerating ? (
              <CircularProgress size={12} />
            ) : (
              <Refresh sx={{ fontSize: "14px !important" }} />
            )
          }
          sx={{
            textTransform: "none",
            fontSize: 12,
            borderColor: colors.border,
            color: colors.ink2,
            borderRadius: "8px",
            "&:hover": { borderColor: colors.borderStrong },
          }}
        >
          {isGenerating ? "Generating\u2026" : "Generate drafts"}
        </Button>
      </Box>

      {/* ── Two-panel body ── */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Left: lead list ── */}
        <Box
          sx={{
            width: 268,
            flexShrink: 0,
            borderRight: `1px solid ${colors.border}`,
            bgcolor: colors.bgElev,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* List header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              px: "12px",
              py: "8px",
              borderBottom: `1px solid ${colors.border}`,
              flexShrink: 0,
            }}
          >
            <Checkbox
              checked={
                leads.length > 0 && selectedLeadIds.size === leads.length
              }
              indeterminate={
                selectedLeadIds.size > 0 && selectedLeadIds.size < leads.length
              }
              size="small"
              onChange={toggleAll}
              sx={{
                p: "2px",
                color: colors.ink4,
                "&.Mui-checked": { color: colors.brand },
              }}
            />
            <Typography fontSize={12} fontWeight={600} color={colors.ink1}>
              {selectedLeadIds.size} selected
            </Typography>
            <Typography fontSize={12} color={colors.ink4}>
              of {leads.length}
            </Typography>
          </Box>

          {/* Lead rows */}
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            {leads.length === 0 && (
              <Box sx={{ px: "16px", pt: "24px", textAlign: "center" }}>
                <Typography fontSize={13} color={colors.ink4}>
                  No leads loaded
                </Typography>
              </Box>
            )}
            {leads.map((lead) => (
              <LeadRow
                key={lead.company_id}
                lead={lead}
                selected={selectedLeadIds.has(lead.company_id)}
                active={lead.company_id === activeLeadId}
                onToggle={() => toggleLead(lead.company_id)}
                onClick={() => setActiveLeadId(lead.company_id)}
              />
            ))}
          </Box>
        </Box>

        {/* ── Right: email preview ── */}
        {!activeLead ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              bgcolor: colors.bg,
            }}
          >
            {leads.filter(
              (l) => l.status === "pending" || l.status === "drafted",
            ).length === 0 && leads.length > 0 ? (
              <>
                <TaskAlt sx={{ fontSize: 40, color: colors.green }} />
                <Typography fontSize={15} fontWeight={600} color={colors.ink2}>
                  All leads reviewed
                </Typography>
                <Typography fontSize={13} color={colors.ink4}>
                  {approvedIds.length} approved &mdash; ready to send.
                </Typography>
              </>
            ) : (
              <>
                <AutoAwesome sx={{ fontSize: 36, color: colors.ink4 }} />
                <Typography fontSize={15} fontWeight={600} color={colors.ink2}>
                  {leads.length === 0
                    ? "Loading leads\u2026"
                    : "Select a lead to preview its draft"}
                </Typography>
                {leads.filter((l) => l.status === "pending").length > 0 && (
                  <Button
                    variant="contained"
                    size="small"
                    disabled={
                      isGenerating ||
                      !selectedTemplateId ||
                      selectedLeadIds.size === 0
                    }
                    onClick={handleGenerate}
                    startIcon={<Refresh sx={{ fontSize: "14px !important" }} />}
                    sx={{
                      textTransform: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      mt: "8px",
                      bgcolor: colors.brand,
                      "&:hover": { bgcolor: colors.brandInk },
                      borderRadius: "8px",
                    }}
                  >
                    Generate drafts
                  </Button>
                )}
              </>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              bgcolor: colors.bgElev,
            }}
          >
            {/* Company header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: "20px",
                py: "12px",
                borderBottom: `1px solid ${colors.border}`,
                flexShrink: 0,
              }}
            >
              <Box display="flex" alignItems="center" gap="12px">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    bgcolor: colors.brand,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{ fontSize: 14, fontWeight: 700, color: "#fff" }}
                  >
                    {initials(activeLead.company_name)}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    fontWeight={700}
                    fontSize={15}
                    color={colors.ink1}
                  >
                    {activeLead.company_name}
                  </Typography>
                  <Typography fontSize={12} color={colors.ink3}>
                    {[activeLead.domain, activeLead.niche, activeLead.location]
                      .filter(Boolean)
                      .join(" \u00b7 ")}
                  </Typography>
                </Box>
              </Box>

              <Box display="flex" gap="6px">
                <Tooltip title="Regenerate draft">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={regenerateOne}
                    disabled={isGenerating || !selectedTemplateId}
                    startIcon={<Refresh sx={{ fontSize: "13px !important" }} />}
                    sx={{
                      textTransform: "none",
                      fontSize: 12,
                      borderColor: colors.border,
                      color: colors.ink2,
                      borderRadius: "8px",
                      "&:hover": { borderColor: colors.borderStrong },
                    }}
                  >
                    Regenerate
                  </Button>
                </Tooltip>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    if (editMode && activeLead.template_id) {
                      saveMutation.mutate({
                        id: activeLead.template_id,
                        subject: editSubject,
                        body: editBody,
                      });
                    } else {
                      setEditMode(true);
                    }
                  }}
                  startIcon={
                    editMode ? (
                      <Save sx={{ fontSize: "13px !important" }} />
                    ) : (
                      <Edit sx={{ fontSize: "13px !important" }} />
                    )
                  }
                  sx={{
                    textTransform: "none",
                    fontSize: 12,
                    borderColor: editMode ? colors.brand : colors.border,
                    color: editMode ? colors.brand : colors.ink2,
                    borderRadius: "8px",
                    "&:hover": {
                      borderColor: editMode
                        ? colors.brandInk
                        : colors.borderStrong,
                    },
                  }}
                >
                  {editMode ? "Save" : "Edit"}
                </Button>
                {editMode && (
                  <IconButton
                    size="small"
                    onClick={() => setEditMode(false)}
                    sx={{ color: colors.ink4 }}
                  >
                    <Close sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Box>
            </Box>

            {/* Email meta rows */}
            <Box sx={{ flexShrink: 0, bgcolor: colors.bgElev }}>
              <MetaRow label="From">
                <Typography fontSize={13} color={colors.ink1}>
                  {senderName}&nbsp;
                  <Box component="span" sx={{ color: colors.ink3 }}>
                    &lt;{senderEmail}&gt;
                  </Box>
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    float: "right",
                    fontSize: 11,
                    color: colors.brand,
                    cursor: "pointer",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Change sender &darr;
                </Typography>
              </MetaRow>

              <MetaRow label="To">
                <Typography fontSize={13} color={colors.ink1}>
                  {activeLead.contact_name ? `${activeLead.contact_name} ` : ""}
                  <Box component="span" sx={{ color: colors.ink3 }}>
                    &lt;{activeLead.contact_email || activeLead.domain}&gt;
                  </Box>
                </Typography>
              </MetaRow>

              <MetaRow label="Subject">
                {editMode ? (
                  <Box
                    component="input"
                    value={editSubject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditSubject(e.target.value)
                    }
                    sx={{
                      width: "100%",
                      border: `1px solid ${colors.brand}`,
                      borderRadius: "6px",
                      px: "8px",
                      py: "3px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.ink1,
                      bgcolor: colors.bgElev,
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box" as const,
                    }}
                  />
                ) : (
                  <Typography
                    fontSize={13}
                    fontWeight={600}
                    color={colors.ink1}
                  >
                    {activeLead.subject || "(no subject)"}
                  </Typography>
                )}
              </MetaRow>

              {attachPortfolio && portfolioFilename && (
                <MetaRow label="Attach">
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      px: "8px",
                      py: "2px",
                      bgcolor: colors.bgSunken,
                      border: `1px solid ${colors.border}`,
                      borderRadius: "6px",
                    }}
                  >
                    <AttachFile sx={{ fontSize: 12, color: colors.ink3 }} />
                    <Typography sx={{ fontSize: 12, color: colors.ink2 }}>
                      {portfolioFilename}
                      {portfolioFiles[0]?.size
                        ? ` \u00b7 ${fmtBytes(portfolioFiles[0].size)}`
                        : ""}
                    </Typography>
                  </Box>
                </MetaRow>
              )}
            </Box>

            {/* Email body */}
            <Box sx={{ flex: 1, overflowY: "auto" }}>
              {activeLead.status === "drafting" ? (
                <Box
                  sx={{
                    px: "24px",
                    py: "32px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <CircularProgress size={18} sx={{ color: colors.brand }} />
                  <Typography fontSize={13} color={colors.ink3}>
                    Generating draft with AI\u2026
                  </Typography>
                </Box>
              ) : activeLead.status === "pending" || !activeLead.subject ? (
                <Box sx={{ px: "24px", py: "32px" }}>
                  <Typography fontSize={13} color={colors.ink4}>
                    No draft yet \u2014 click &quot;Generate drafts&quot; above.
                  </Typography>
                </Box>
              ) : editMode ? (
                <Box sx={{ px: "20px", py: "16px" }}>
                  <Box
                    component="textarea"
                    value={editBody}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setEditBody(e.target.value)
                    }
                    rows={20}
                    sx={{
                      width: "100%",
                      border: `1px solid ${colors.brand}`,
                      borderRadius: "8px",
                      px: "14px",
                      py: "12px",
                      fontSize: 13,
                      color: colors.ink1,
                      bgcolor: colors.bgElev,
                      outline: "none",
                      fontFamily: "inherit",
                      resize: "vertical" as const,
                      lineHeight: 1.65,
                      boxSizing: "border-box" as const,
                    }}
                  />
                </Box>
              ) : (
                <Box
                  sx={{
                    position: "relative",
                    px: "24px",
                    py: "20px",
                    bgcolor: colors.bg,
                  }}
                >
                  {/* AI badge */}
                  {activeLead.body?.includes("<") || activeLead.body ? (
                    <Box
                      sx={{
                        position: "absolute",
                        top: "12px",
                        right: "16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                        px: "7px",
                        py: "2px",
                        bgcolor: colors.violetSoft,
                        borderRadius: "6px",
                      }}
                    >
                      <AutoAwesome
                        sx={{ fontSize: 10, color: colors.violet }}
                      />
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: colors.violet,
                        }}
                      >
                        AI generated
                      </Typography>
                    </Box>
                  ) : null}

                  {/* Rendered body */}
                  {activeLead.body?.includes("<") ? (
                    <Box
                      sx={{
                        fontSize: 14,
                        color: colors.ink1,
                        lineHeight: 1.7,
                        "& p": { mb: "12px" },
                        "& strong": { fontWeight: 600 },
                        "& a": { color: colors.brand },
                      }}
                      dangerouslySetInnerHTML={{ __html: activeLead.body }}
                    />
                  ) : (
                    <Typography
                      sx={{
                        fontSize: 14,
                        color: colors.ink1,
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        pr: "80px",
                      }}
                    >
                      {activeLead.body}
                    </Typography>
                  )}
                </Box>
              )}

              {/* Filled-from-lead-data chips */}
              {!editMode &&
                activeLead.filled_vars &&
                Object.keys(activeLead.filled_vars).length > 0 && (
                  <Box
                    sx={{
                      px: "20px",
                      py: "10px",
                      bgcolor: colors.bgSunken,
                      borderTop: `1px solid ${colors.borderSubtle}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: colors.ink4,
                        flexShrink: 0,
                      }}
                    >
                      Filled from lead data
                    </Typography>
                    {Object.entries(activeLead.filled_vars)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <Box
                          key={k}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            px: "7px",
                            py: "2px",
                            bgcolor: colors.bgElev,
                            border: `1px solid ${colors.border}`,
                            borderRadius: "5px",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontFamily: "monospace",
                              color: colors.amber,
                            }}
                          >
                            {`{{${k}}}`}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: colors.ink3 }}>
                            \u00b7
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: colors.ink2 }}>
                            {v}
                          </Typography>
                        </Box>
                      ))}
                  </Box>
                )}
            </Box>

            {/* ── Bottom footer: deliverability + actions ── */}
            <Box
              sx={{
                borderTop: `1px solid ${colors.border}`,
                px: "20px",
                py: "10px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexShrink: 0,
              }}
            >
              {/* Deliverability check */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <Shield sx={{ fontSize: 16, color: colors.green, mt: "1px" }} />
                <Box>
                  <Typography
                    fontSize={12}
                    fontWeight={600}
                    color={colors.ink1}
                  >
                    Deliverability check passed
                  </Typography>
                  <Typography fontSize={11} color={colors.ink4}>
                    SPF &middot; DKIM &middot; DMARC valid &middot; no spam
                    triggers &middot;{" "}
                    {activeLead.body
                      ? `${stripHtml(activeLead.body).trim().split(/\s+/).length} words`
                      : "0 words"}
                    {attachPortfolio ? " \u00b7 1 attachment" : ""}
                    &nbsp;&nbsp;
                    <Box
                      component="span"
                      sx={{
                        color: colors.brand,
                        cursor: "pointer",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      Details &rarr;
                    </Box>
                  </Typography>
                </Box>
              </Box>

              {/* Actions */}
              <Button
                variant="outlined"
                size="small"
                disabled={
                  !activeLead.template_id ||
                  rejectMutation.isPending ||
                  activeLead.status === "pending" ||
                  activeLead.status === "drafting"
                }
                onClick={() =>
                  activeLead.template_id &&
                  rejectMutation.mutate(activeLead.template_id)
                }
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderColor: colors.border,
                  color: colors.red,
                  borderRadius: "8px",
                  "&:hover": {
                    borderColor: colors.red,
                    bgcolor: colors.redSoft,
                  },
                }}
              >
                Reject
              </Button>

              <Button
                variant="contained"
                size="small"
                disabled={
                  !activeLead.template_id ||
                  approveMutation.isPending ||
                  activeLead.status === "pending" ||
                  activeLead.status === "drafting" ||
                  activeLead.status === "approved"
                }
                onClick={() =>
                  activeLead.template_id &&
                  approveMutation.mutate(activeLead.template_id)
                }
                startIcon={<Check sx={{ fontSize: "13px !important" }} />}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  bgcolor:
                    activeLead.status === "approved"
                      ? colors.green
                      : colors.brand,
                  "&:hover": {
                    bgcolor:
                      activeLead.status === "approved"
                        ? colors.green
                        : colors.brandInk,
                  },
                  borderRadius: "8px",
                }}
              >
                {activeLead.status === "approved"
                  ? "Approved \u2713"
                  : "Approve & next"}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>

    {/* ── Save as Campaign dialog ──────────────────────────────────────────── */}
    <Dialog
      open={saveDialogOpen}
      onClose={() => setSaveDialogOpen(false)}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 15, pb: 1 }}>
        Save as campaign
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Typography fontSize={12} color={colors.ink3} mb="12px">
          Saving <strong>{selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? "s" : ""}</strong> with the selected template. You can reopen this campaign anytime from the Campaigns page to send or follow up.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Campaign name"
          placeholder="e.g. Furniture Lahore May 2025"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && campaignName.trim()) handleSaveCampaign();
          }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px" } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: "8px" }}>
        <Button
          onClick={() => setSaveDialogOpen(false)}
          sx={{ textTransform: "none", fontSize: 12, color: colors.ink3 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!campaignName.trim() || isSavingCampaign}
          onClick={handleSaveCampaign}
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 600,
            bgcolor: colors.brand,
            "&:hover": { bgcolor: colors.brandInk },
            borderRadius: "8px",
          }}
        >
          {isSavingCampaign ? "Saving…" : "Save campaign"}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default EmailBroadcast;
