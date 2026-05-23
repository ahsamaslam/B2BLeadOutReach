import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  AlternateEmail,
  Check,
  Close,
  ContentCopy,
  Delete,
  Edit,
  Save,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { PageLoader } from "./primitives";
import { colors, shadow } from "../theme/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CampaignTemplate {
  id: number;
  name: string;
  subject_template: string;
  body_template: string;
  instructions: string | null;
  attach_portfolio: boolean;
  tags: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  sent_count: number;
  open_rate: number;
  reply_rate: number;
}

// ── Statics ───────────────────────────────────────────────────────────────────
const PLACEHOLDER_KEYS = [
  "{{company_name}}",
  "{{owner_name}}",
  "{{niche}}",
  "{{location}}",
  "{{address}}",
];

const STARTER_TEMPLATES: Omit<
  CampaignTemplate,
  "id" | "created_at" | "updated_at" | "sent_count" | "open_rate" | "reply_rate"
>[] = [
  {
    name: "Cold outreach \u2014 AI automation",
    subject_template:
      "Quick thought on {{company_name}}\u2019s {{specific_page}} process",
    body_template:
      "Hi {{owner_name}},\n\nI was exploring {{company_name}}\u2019s {{specific_page}} and noticed you\u2019re\u2026\n\n[AI continues with one personalized observation per lead]\n\nWould love to share a quick idea \u2014 would a 15-min call this week work?\n\nBest,",
    instructions:
      "Keep it under 90 words. Reference one concrete thing from the company\u2019s website. Friendly but not salesy. Always end with a single soft question \u2014 never a CTA button.",
    attach_portfolio: false,
    tags: '["Cold outreach","AI"]',
    is_default: true,
  },
  {
    name: "Franchise \u2014 operations pilot",
    subject_template: "Reducing onboarding time at {{company}} by ~40%",
    body_template:
      "Hi {{owner_name}},\n\nFranchise operations at {{company_name}} look impressive. We help multi-location brands cut onboarding time by ~40% using AI-driven workflow automation.\n\nHappy to share a 2-minute overview \u2014 would that be useful?",
    instructions: "Professional and concise. Focus on ROI. No jargon.",
    attach_portfolio: false,
    tags: '["Franchise","Operations"]',
    is_default: false,
  },
  {
    name: "Warm reply nudge",
    subject_template: "Re: {{previous_subject}} \u2014 quick follow-up",
    body_template:
      "Hi {{owner_name}},\n\nJust circling back on my last note \u2014 did it land at a good time?\n\nHappy to share a concrete example relevant to {{niche}} if helpful.",
    instructions: "Short. Warm. No pressure. Max 50 words.",
    attach_portfolio: false,
    tags: '["Follow-up"]',
    is_default: false,
  },
  {
    name: "Event invite \u2014 demo",
    subject_template: "30-min live walkthrough \u2014 {{date}}",
    body_template:
      "Hi {{owner_name}},\n\nI\u2019m hosting a short walkthrough for {{niche}} teams on {{date}}. It\u2019s a no-deck session \u2014 just a live demo of how we helped similar companies.\n\nWant a spot? I can send the link now.",
    instructions:
      "Conversational. Urgency but no pressure. Keep it to 60 words.",
    attach_portfolio: false,
    tags: '["Event"]',
    is_default: false,
  },
  {
    name: "Portfolio showcase",
    subject_template: "Case study relevant to {{company_name}}",
    body_template:
      "Hi {{owner_name}},\n\nI put together a short portfolio of work we\u2019ve done for companies like {{company_name}} in {{niche}}.\n\nWould it be useful to see how we approached a similar challenge?",
    instructions: "Lead with social proof. Keep curiosity high. One CTA only.",
    attach_portfolio: true,
    tags: '["Portfolio"]',
    is_default: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`;
  return `${Math.floor(d / 2592000)}mo ago`;
}

const TAG_PALETTE: Record<string, { bg: string; fg: string }> = {
  "Cold outreach": { bg: colors.brandSoft, fg: colors.brandInk },
  AI: { bg: colors.violetSoft, fg: colors.violet },
  Franchise: { bg: colors.amberSoft, fg: colors.amber },
  Operations: { bg: colors.tealSoft, fg: colors.teal },
  "Follow-up": { bg: colors.greenSoft, fg: colors.green },
  Event: { bg: colors.redSoft, fg: colors.red },
  Portfolio: { bg: colors.brandSoft, fg: colors.brand },
};

function TagPill({ tag }: { tag: string }) {
  const c = TAG_PALETTE[tag] ?? { bg: colors.bgSunken, fg: colors.ink3 };
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: "8px",
        py: "2px",
        bgcolor: c.bg,
        borderRadius: "6px",
        lineHeight: 1,
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 500, color: c.fg }}>
        {tag}
      </Typography>
    </Box>
  );
}

// Highlight {{placeholders}} in amber
function SubjectPreview({
  text,
  fontSize = 12,
}: {
  text: string;
  fontSize?: number;
}) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <Box component="span">
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <Box
            key={i}
            component="span"
            sx={{
              color: colors.amber,
              fontFamily: "monospace",
              fontSize: fontSize - 1,
            }}
          >
            {p}
          </Box>
        ) : (
          <Box key={i} component="span" sx={{ color: colors.ink2, fontSize }}>
            {p}
          </Box>
        ),
      )}
    </Box>
  );
}

// ── TemplateCard ──────────────────────────────────────────────────────────────
function TemplateCard({
  tmpl,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  tmpl: CampaignTemplate;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tags = parseTags(tmpl.tags);
  const neverSent = tmpl.sent_count === 0;

  return (
    <Box
      onClick={onSelect}
      sx={{
        borderLeft: `3px solid ${selected ? colors.brand : "transparent"}`,
        border: `1px solid ${selected ? colors.brand : colors.border}`,
        borderLeftWidth: 3,
        borderRadius: "12px",
        bgcolor: selected ? colors.brandSoft : colors.bgElev,
        px: "14px",
        pt: "12px",
        pb: "10px",
        cursor: "pointer",
        mb: "10px",
        transition: "border-color 0.12s, background-color 0.12s",
        "&:hover": {
          borderColor: colors.brand,
          bgcolor: colors.brandSoft,
        },
      }}
    >
      {/* ── row 1: name + badge + actions ── */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        mb="4px"
      >
        <Box display="flex" alignItems="center" gap="8px" flex={1} minWidth={0}>
          <Typography
            fontWeight={700}
            fontSize={14}
            color={colors.ink1}
            noWrap
            sx={{ flex: 1, minWidth: 0 }}
          >
            {tmpl.name}
          </Typography>
          {tmpl.is_default && (
            <Box
              sx={{
                px: "7px",
                py: "2px",
                bgcolor: colors.bgSunken,
                border: `1px solid ${colors.border}`,
                borderRadius: "5px",
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{ fontSize: 10, fontWeight: 600, color: colors.ink3 }}
              >
                Default
              </Typography>
            </Box>
          )}
        </Box>

        <Box
          display="flex"
          gap="2px"
          flexShrink={0}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Duplicate">
            <IconButton
              size="small"
              onClick={onDuplicate}
              sx={{
                color: colors.ink4,
                "&:hover": { color: colors.ink2 },
                p: "4px",
              }}
            >
              <ContentCopy sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={onSelect}
              sx={{
                color: colors.ink4,
                "&:hover": { color: colors.brand },
                p: "4px",
              }}
            >
              <Edit sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{
                color: colors.ink4,
                "&:hover": { color: colors.red },
                p: "4px",
              }}
            >
              <Delete sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── row 2: subject line ── */}
      <Box display="flex" alignItems="flex-start" gap="6px" mb="8px">
        <AlternateEmail
          sx={{ fontSize: 12, color: colors.ink4, mt: "2px", flexShrink: 0 }}
        />
        <SubjectPreview text={tmpl.subject_template} fontSize={12} />
      </Box>

      {/* ── row 3: tag pills ── */}
      {tags.length > 0 && (
        <Box display="flex" gap="6px" flexWrap="wrap" mb="10px">
          {tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </Box>
      )}

      {/* ── row 4: stats ── */}
      <Box display="flex" gap="20px" mb="8px">
        {[
          { label: "SENT", value: String(tmpl.sent_count), color: colors.ink1 },
          {
            label: "OPEN RATE",
            value: neverSent ? "\u2014" : `${tmpl.open_rate}%`,
            color: colors.green,
          },
          {
            label: "REPLY RATE",
            value: neverSent ? "\u2014" : `${tmpl.reply_rate}%`,
            color: colors.brand,
          },
        ].map(({ label, value, color }) => (
          <Box key={label}>
            <Typography
              sx={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: colors.ink4,
                lineHeight: 1.3,
              }}
            >
              {label}
            </Typography>
            <Typography
              sx={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1.2 }}
            >
              {value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── row 5: footer ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 11, color: colors.ink4 }}>
          {neverSent
            ? "Draft \u00b7 never sent"
            : `Edited ${timeAgo(tmpl.updated_at)} by you`}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 500,
            color: colors.brand,
            cursor: "pointer",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          Open in editor &#8594;
        </Typography>
      </Box>
    </Box>
  );
}

// ── Editor panel ──────────────────────────────────────────────────────────────
function EditorPanel({
  template,
  isNew,
  onSaved,
  onClose,
}: {
  template: CampaignTemplate | null;
  isNew: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    name: template?.name ?? "",
    subject_template: template?.subject_template ?? "",
    body_template: template?.body_template ?? "",
    instructions: template?.instructions ?? "",
    tags: template?.tags ?? "",
    is_default: template?.is_default ?? false,
    attach_portfolio: template?.attach_portfolio ?? false,
  });
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    body: string;
  } | null>(null);

  const set = (key: keyof typeof form, val: string | boolean) =>
    setForm((p) => ({ ...p, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: () =>
      isNew
        ? api.createCampaignTemplate({
            name: form.name,
            subject_template: form.subject_template,
            body_template: form.body_template,
            instructions: form.instructions || undefined,
            tags: form.tags || undefined,
            is_default: form.is_default,
            attach_portfolio: form.attach_portfolio,
          })
        : api.updateCampaignTemplate(template!.id, {
            name: form.name,
            subject_template: form.subject_template,
            body_template: form.body_template,
            instructions: form.instructions || undefined,
            tags: form.tags || undefined,
            is_default: form.is_default,
            attach_portfolio: form.attach_portfolio,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      setSavedState("saved");
      setTimeout(() => setSavedState("idle"), 2800);
      if (isNew) {
        toast.success("Template created");
        onSaved();
      }
    },
    onError: () => {
      toast.error("Failed to save");
      setSavedState("idle");
    },
  });

  const handleSave = () => {
    if (
      !form.name.trim() ||
      !form.subject_template.trim() ||
      !form.body_template.trim()
    ) {
      toast.error("Name, subject and body are required");
      return;
    }
    setSavedState("saving");
    saveMutation.mutate();
  };

  const handlePreview = async () => {
    if (!template) {
      toast("Save the template first to preview it");
      return;
    }
    try {
      const data = await api.previewCampaignTemplate(template.id);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch {
      toast.error("Preview failed");
    }
  };

  const insertPH = (ph: string) => {
    const el = bodyRef.current;
    if (el) {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      const next =
        form.body_template.slice(0, s) + ph + form.body_template.slice(e);
      set("body_template", next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + ph.length;
        el.focus();
      });
    } else {
      set("body_template", form.body_template + ph);
    }
  };

  const tagsDisplay = (() => {
    try {
      const arr = JSON.parse(form.tags);
      return Array.isArray(arr) ? arr.join(", ") : form.tags;
    } catch {
      return form.tags;
    }
  })();

  const inputSx = {
    width: "100%",
    height: 34,
    px: "10px",
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    bgcolor: colors.bgElev,
    fontSize: 13,
    color: colors.ink1,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
    "&:focus": {
      borderColor: colors.brand,
      boxShadow: `0 0 0 2px ${colors.brandRing}`,
    },
    "&::placeholder": { color: colors.ink4 },
  };

  const textareaSx = {
    width: "100%",
    px: "10px",
    py: "8px",
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    bgcolor: colors.bgElev,
    fontSize: 13,
    color: colors.ink1,
    outline: "none",
    fontFamily: "inherit",
    resize: "vertical" as const,
    lineHeight: 1.6,
    display: "block",
    boxSizing: "border-box" as const,
    "&:focus": {
      borderColor: colors.brand,
      boxShadow: `0 0 0 2px ${colors.brandRing}`,
    },
    "&::placeholder": { color: colors.ink4 },
  };

  const labelSx = {
    fontSize: 11,
    fontWeight: 600,
    color: colors.ink3,
    mb: "5px",
    display: "block",
  };

  return (
    <Box
      sx={{
        width: { xs: "100%", md: 360 },
        flexShrink: 0,
        borderLeft: { xs: "none", md: `1px solid ${colors.border}` },
        borderTop: { xs: `1px solid ${colors.border}`, md: "none" },
        bgcolor: colors.bgElev,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Panel header */}
      <Box
        sx={{
          px: "20px",
          pt: "14px",
          pb: "12px",
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb="3px"
        >
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.ink3,
            }}
          >
            {isNew ? "New template" : "Editing"}
          </Typography>
          <Box display="flex" alignItems="center" gap="6px">
            {savedState === "saved" && (
              <Box
                display="flex"
                alignItems="center"
                gap="4px"
                sx={{
                  px: "8px",
                  py: "2px",
                  bgcolor: colors.greenSoft,
                  borderRadius: "6px",
                }}
              >
                <Check sx={{ fontSize: 11, color: colors.green }} />
                <Typography
                  sx={{ fontSize: 11, fontWeight: 600, color: colors.green }}
                >
                  Saved
                </Typography>
              </Box>
            )}
            {savedState === "saving" && (
              <Typography sx={{ fontSize: 11, color: colors.ink4 }}>
                Saving&#8230;
              </Typography>
            )}
            <Tooltip title="Close panel">
              <IconButton
                size="small"
                onClick={onClose}
                sx={{
                  color: colors.ink4,
                  "&:hover": { color: colors.ink1 },
                  p: "4px",
                }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Typography fontWeight={700} fontSize={15} color={colors.ink1} noWrap>
          {form.name || "(untitled)"}
        </Typography>
      </Box>

      {/* Scrollable form */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: "20px",
          py: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Template name */}
        <Box>
          <Box component="label" sx={labelSx}>
            Template name
          </Box>
          <Box
            component="input"
            value={form.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("name", e.target.value)
            }
            placeholder="e.g. B2B AI & Automation Outreach"
            sx={inputSx}
          />
        </Box>

        {/* Subject line */}
        <Box>
          <Box component="label" sx={labelSx}>
            Subject line
          </Box>
          <Box
            component="input"
            value={form.subject_template}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set("subject_template", e.target.value)
            }
            placeholder="Quick thought on {{company_name}}'s..."
            sx={inputSx}
          />
          <Typography sx={{ fontSize: 11, color: colors.brand, mt: "4px" }}>
            Placeholders fill per-lead before sending.
          </Typography>
        </Box>

        {/* Quick-insert placeholders */}
        <Box>
          <Box component="label" sx={labelSx}>
            Quick-insert placeholders
          </Box>
          <Box display="flex" flexWrap="wrap" gap="6px">
            {PLACEHOLDER_KEYS.map((ph) => (
              <Box
                key={ph}
                component="button"
                onClick={() => insertPH(ph)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  px: "8px",
                  py: "3px",
                  cursor: "pointer",
                  bgcolor: colors.bgSunken,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: colors.ink2,
                  transition: "all 0.1s",
                  "&:hover": {
                    bgcolor: colors.brandSoft,
                    borderColor: colors.brand,
                    color: colors.brandInk,
                  },
                }}
              >
                <ContentCopy sx={{ fontSize: 9 }} />
                {ph}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Email body */}
        <Box>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mb="5px"
          >
            <Typography
              sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3 }}
            >
              Email body
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: colors.ink4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {form.body_template.length} chars
            </Typography>
          </Box>

          {/* Minimal toolbar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              px: "8px",
              py: "4px",
              bgcolor: colors.bgSunken,
              border: `1px solid ${colors.border}`,
              borderBottom: "none",
              borderRadius: "8px 8px 0 0",
            }}
          >
            {(["B", "I", "U"] as const).map((t) => (
              <Box
                key={t}
                component="button"
                sx={{
                  width: 22,
                  height: 22,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  bgcolor: colors.bgElev,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: t === "B" ? 700 : 400,
                  fontStyle: t === "I" ? "italic" : "normal",
                  textDecoration: t === "U" ? "underline" : "none",
                  color: colors.ink2,
                  "&:hover": { bgcolor: colors.brandSoft },
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t}
              </Box>
            ))}
            <Box sx={{ flex: 1 }} />
            {["Attach", "Variable"].map((lbl) => (
              <Box
                key={lbl}
                component="button"
                sx={{
                  px: "6px",
                  py: "2px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  bgcolor: colors.bgElev,
                  cursor: "pointer",
                  fontSize: 10,
                  color: colors.ink3,
                  "&:hover": { bgcolor: colors.brandSoft },
                }}
              >
                {lbl}
              </Box>
            ))}
          </Box>
          <Box
            component="textarea"
            ref={bodyRef}
            value={form.body_template}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              set("body_template", e.target.value)
            }
            rows={9}
            placeholder={
              "Hi {{owner_name}},\n\nI was exploring {{company_name}}'s site and noticed..."
            }
            sx={{ ...textareaSx, borderRadius: "0 0 8px 8px" }}
          />
        </Box>

        {/* AI instructions */}
        <Box>
          <Box component="label" sx={labelSx}>
            AI instructions{" "}
            <Box component="span" sx={{ fontWeight: 400, color: colors.ink4 }}>
              tone, focus, things to avoid
            </Box>
          </Box>
          <Box
            component="textarea"
            value={form.instructions}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              set("instructions", e.target.value)
            }
            rows={4}
            placeholder="Keep it under 90 words. Reference one concrete thing from the company's website..."
            sx={textareaSx}
          />
        </Box>

        {/* Tags */}
        <Box>
          <Box component="label" sx={labelSx}>
            Tags{" "}
            <Box component="span" sx={{ fontWeight: 400, color: colors.ink4 }}>
              (comma-separated)
            </Box>
          </Box>
          <Box
            component="input"
            value={tagsDisplay}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const arr = e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
              set("tags", arr.length ? JSON.stringify(arr) : "");
            }}
            placeholder="Cold outreach, AI"
            sx={inputSx}
          />
        </Box>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: "20px",
          py: "14px",
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <Button
          variant="contained"
          size="small"
          fullWidth
          disabled={saveMutation.isPending}
          onClick={handleSave}
          startIcon={<Save sx={{ fontSize: "13px !important" }} />}
          sx={{
            textTransform: "none",
            fontSize: 13,
            fontWeight: 600,
            py: "8px",
            bgcolor: colors.brand,
            "&:hover": { bgcolor: colors.brandInk },
            borderRadius: "8px",
          }}
        >
          {isNew ? "Create template" : "Save template"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          disabled={isNew || !template}
          onClick={handlePreview}
          sx={{
            textTransform: "none",
            fontSize: 12,
            borderColor: colors.border,
            color: colors.ink2,
            borderRadius: "8px",
            "&:hover": { borderColor: colors.borderStrong },
          }}
        >
          Preview with sample lead
        </Button>
      </Box>

      {/* Preview modal */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: "14px" } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15, pb: 1 }}>
          Preview with sample lead
        </DialogTitle>
        <DialogContent>
          {previewData && (
            <Box>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.ink3,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  mb: "4px",
                }}
              >
                Subject
              </Typography>
              <Box
                sx={{
                  p: "12px",
                  bgcolor: colors.bgSunken,
                  borderRadius: "8px",
                  mb: "16px",
                }}
              >
                <Typography fontSize={13} fontWeight={500} color={colors.ink1}>
                  {previewData.subject}
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.ink3,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  mb: "4px",
                }}
              >
                Body
              </Typography>
              <Box
                sx={{
                  p: "12px",
                  bgcolor: colors.bgSunken,
                  borderRadius: "8px",
                  whiteSpace: "pre-wrap",
                }}
              >
                <Typography fontSize={13} color={colors.ink1} lineHeight={1.65}>
                  {previewData.body}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setPreviewOpen(false)}
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const CampaignTemplates: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [starterOpen, setStarterOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCampaignTemplate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      if (selectedId === id) setSelectedId(null);
      toast.success("Template deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.duplicateCampaignTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      toast.success("Duplicated");
    },
    onError: () => toast.error("Duplicate failed"),
  });

  const createStarterMutation = useMutation({
    mutationFn: (t: (typeof STARTER_TEMPLATES)[number]) =>
      api.createCampaignTemplate(t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
    },
  });

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const isNew = selectedId === "new";

  if (isLoading) return <PageLoader label="Loading templates…" />;

  return (
    /* The Shell is in flush mode for this page — no outer padding */
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        height: { xs: "auto", md: "calc(100vh - 56px)" },
        minHeight: { xs: "100%", md: "unset" },
        overflow: { xs: "visible", md: "hidden" },
        bgcolor: colors.bg,
      }}
    >
      {/* ── Left: library list ── */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          px: "28px",
          pt: "24px",
          pb: "40px",
        }}
      >
        {/* Library label */}
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.ink3,
            mb: "8px",
          }}
        >
          Library &middot; {templates.length} template
          {templates.length !== 1 ? "s" : ""}
        </Typography>

        {/* Page title */}
        <Typography
          variant="h2"
          fontWeight={800}
          color={colors.ink1}
          lineHeight={1.2}
          mb="6px"
        >
          Email templates
        </Typography>
        <Typography
          fontSize={14}
          color={colors.ink3}
          mb="24px"
          maxWidth={520}
          lineHeight={1.55}
        >
          Write the bones once. The AI personalizes each draft with the
          lead&apos;s company, niche and decision-maker &mdash; you stay in the
          seat for the final word.
        </Typography>

        {/* Action bar */}
        <Box display="flex" gap="8px" mb="24px">
          <Button
            variant="outlined"
            size="small"
            sx={{
              textTransform: "none",
              fontSize: 12,
              borderColor: colors.border,
              color: colors.ink2,
              borderRadius: "8px",
              "&:hover": { borderColor: colors.borderStrong },
            }}
          >
            Import
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Add sx={{ fontSize: "14px !important" }} />}
            onClick={() => setSelectedId("new")}
            sx={{
              textTransform: "none",
              fontSize: 12,
              fontWeight: 600,
              px: "14px",
              bgcolor: colors.brand,
              "&:hover": { bgcolor: colors.brandInk },
              borderRadius: "8px",
            }}
          >
            New template
          </Button>
        </Box>

        {/* Loading */}
        {isLoading && <LinearProgress sx={{ borderRadius: 999, mb: "16px" }} />}

        {/* Cards */}
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            tmpl={t}
            selected={selectedId === t.id}
            onSelect={() => setSelectedId(t.id)}
            onDuplicate={() => duplicateMutation.mutate(t.id)}
            onDelete={() => {
              if (window.confirm(`Delete "${t.name}"?`))
                deleteMutation.mutate(t.id);
            }}
          />
        ))}

        {/* Start new card */}
        <Box
          onClick={() => setSelectedId("new")}
          sx={{
            border: `2px dashed ${colors.border}`,
            borderRadius: "12px",
            bgcolor: colors.bgSunken,
            py: "24px",
            textAlign: "center",
            cursor: "pointer",
            mt: "4px",
            transition: "all 0.12s",
            "&:hover": { borderColor: colors.brand, bgcolor: colors.brandSoft },
          }}
        >
          <Add sx={{ fontSize: 22, color: colors.ink4, mb: "4px" }} />
          <Typography
            fontSize={13}
            fontWeight={500}
            color={colors.ink2}
            mb="2px"
          >
            Start a new template
          </Typography>
          <Typography
            fontSize={12}
            color={colors.brand}
            onClick={(e) => {
              e.stopPropagation();
              setStarterOpen(true);
            }}
            sx={{
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            Or pick from {STARTER_TEMPLATES.length} starter templates
          </Typography>
        </Box>
      </Box>

      {/* ── Right: editor panel ── */}
      {selectedId !== null && (
        <EditorPanel
          key={selectedId === "new" ? "__new__" : String(selectedId)}
          template={selectedTemplate}
          isNew={isNew}
          onSaved={() => setSelectedId(null)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Starter templates picker */}
      <Dialog
        open={starterOpen}
        onClose={() => setStarterOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: "14px" } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15, pb: 1 }}>
          Starter templates
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box display="flex" flexDirection="column" gap="12px">
            {STARTER_TEMPLATES.map((s, i) => (
              <Box
                key={i}
                onClick={async () => {
                  await createStarterMutation.mutateAsync(s);
                  setStarterOpen(false);
                  toast.success(`"${s.name}" added`);
                }}
                sx={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: "10px",
                  p: "12px 14px",
                  cursor: "pointer",
                  "&:hover": {
                    borderColor: colors.brand,
                    bgcolor: colors.brandSoft,
                  },
                }}
              >
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb="4px"
                >
                  <Typography
                    fontWeight={600}
                    fontSize={13}
                    color={colors.ink1}
                  >
                    {s.name}
                  </Typography>
                  <Box display="flex" gap="4px">
                    {parseTags(s.tags).map((t) => (
                      <TagPill key={t} tag={t} />
                    ))}
                  </Box>
                </Box>
                <SubjectPreview text={s.subject_template} fontSize={12} />
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setStarterOpen(false)}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CampaignTemplates;
