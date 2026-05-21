import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { PageHeader, EmptyState } from "./primitives";
import { colors } from "../theme/tokens";
import {
  Add,
  Delete,
  Edit,
  Email,
  SmartToy,
  ContentCopy,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface CampaignTemplate {
  id: number;
  name: string;
  subject_template: string;
  body_template: string;
  instructions: string | null;
  attach_portfolio: boolean;
  created_at: string;
  updated_at: string;
}

const PLACEHOLDER_HINTS = [
  "{{company_name}}",
  "{{owner_name}}",
  "{{address}}",
  "{{niche}}",
  "{{location}}",
];

const EMPTY_FORM = {
  name: "",
  subject_template: "",
  body_template: "",
  instructions: "",
  attach_portfolio: false,
};

const CampaignTemplates: React.FC = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CampaignTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: templates = [], isLoading } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
  });

  const createMutation = useMutation({
    mutationFn: api.createCampaignTemplate,
    onSuccess: () => {
      toast.success("Template created");
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      handleClose();
    },
    onError: () => toast.error("Failed to create template"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_FORM }) =>
      api.updateCampaignTemplate(id, data),
    onSuccess: () => {
      toast.success("Template updated");
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      handleClose();
    },
    onError: () => toast.error("Failed to update template"),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteCampaignTemplate,
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
    },
    onError: () => toast.error("Failed to delete template"),
  });

  const handleOpen = (tmpl?: CampaignTemplate) => {
    if (tmpl) {
      setEditTarget(tmpl);
      setForm({
        name: tmpl.name,
        subject_template: tmpl.subject_template,
        body_template: tmpl.body_template,
        instructions: tmpl.instructions ?? "",
        attach_portfolio: tmpl.attach_portfolio,
      });
    } else {
      setEditTarget(null);
      setForm(EMPTY_FORM);
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.subject_template.trim() || !form.body_template.trim()) {
      toast.error("Name, subject and body are required");
      return;
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const insertPlaceholder = (ph: string) => {
    setForm((prev) => ({ ...prev, body_template: prev.body_template + ph }));
  };

  if (isLoading)
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography color="text.secondary">Loading templates...</Typography>
      </Box>
    );

  return (
    <Box>
      <PageHeader
        eyebrow="Pipeline"
        title="Campaign Templates"
        description="Reusable email templates. AI personalizes each one when sending to your leads."
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
            New Template
          </Button>
        }
      />

      {/* Empty State */}
      {templates.length === 0 && (
        <EmptyState
          icon={<Email />}
          tone="brand"
          title="No templates yet"
          description="Create your first campaign template to start sending personalized outreach emails."
          primaryAction={
            <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
              Create First Template
            </Button>
          }
        />
      )}

        {/* Template Grid */}
        <Grid container spacing={3}>
          {templates.map((tmpl) => (
            <Grid item xs={12} md={6} lg={4} key={tmpl.id}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  border: `1px solid ${colors.border}`,
                  bgcolor: colors.bgElev,
                  "&:hover": {
                    borderColor: colors.brand,
                    "& .action-buttons": { opacity: 1 },
                  },
                }}
              >
                <CardContent sx={{ flex: 1 }}>
                  <Typography variant="h5" gutterBottom sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", mb: 2 }}>
                    {tmpl.name}
                  </Typography>
                  {/* Subject */}
                  <Box
                    sx={{
                      mb: 2, p: 1.5,
                      bgcolor: colors.brandSoft,
                      borderRadius: 1,
                      borderLeft: `3px solid ${colors.brand}`,
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Email sx={{ fontSize: 16, color: colors.brand }} />
                      <Typography variant="overline">Subject</Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.primary"
                      fontWeight={500}
                      sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      {tmpl.subject_template}
                    </Typography>
                  </Box>

                  {/* Body Preview */}
                  <Box mb={2}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.5} display="block" mb={1}>
                      Email Body
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        whiteSpace: "pre-wrap",
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontSize: "0.85rem",
                        lineHeight: 1.6,
                      }}
                    >
                      {tmpl.body_template}
                    </Typography>
                  </Box>

                  {/* AI Instructions */}
                  {tmpl.instructions && (
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: colors.greenSoft,
                        borderRadius: 1,
                        borderLeft: `3px solid ${colors.green}`,
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <SmartToy sx={{ fontSize: 16, color: colors.green }} />
                        <Typography variant="overline">AI Instructions</Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.85rem", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {tmpl.instructions}
                      </Typography>
                    </Box>
                  )}
                </CardContent>

                <CardActions
                  className="action-buttons"
                  sx={{ justifyContent: "flex-end", p: 2, pt: 0, opacity: 0.7, transition: "opacity 0.2s" }}
                >
                  <Tooltip title="Edit template">
                    <IconButton size="small" onClick={() => handleOpen(tmpl)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete template">
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (window.confirm(`Delete template "${tmpl.name}"?`)) {
                          deleteMutation.mutate(tmpl.id);
                        }
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onClose={handleClose} maxWidth="md" fullWidth>
          <DialogTitle sx={{ pb: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="h6" fontWeight={700}>
              {editTarget ? "Edit Template" : "New Campaign Template"}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {editTarget ? "Update your email template" : "Create a reusable email template for your campaigns"}
            </Typography>
          </DialogTitle>

          <DialogContent sx={{ pt: 3 }}>
            <Box display="flex" flexDirection="column" gap={3}>
              <TextField
                fullWidth
                label="Template Name"
                placeholder="e.g. AI Automation Outreach — UK Law Firms"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <TextField
                fullWidth
                label="Subject Template"
                placeholder="e.g. AI automation for {{company_name}}"
                value={form.subject_template}
                onChange={(e) => setForm((p) => ({ ...p, subject_template: e.target.value }))}
                helperText="Placeholders will be filled per lead during sending"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <Box>
                <Typography variant="body2" fontWeight={600} color="text.secondary" mb={1.5}>
                  Quick Insert Placeholders:
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {PLACEHOLDER_HINTS.map((ph) => (
                    <Chip
                      key={ph}
                      label={ph}
                      size="small"
                      clickable
                      icon={<ContentCopy sx={{ fontSize: 14 }} />}
                      onClick={() => insertPlaceholder(ph)}
                    />
                  ))}
                </Box>
              </Box>

              <TextField
                fullWidth
                multiline
                minRows={10}
                label="Email Body Template"
                placeholder={`Hi {{owner_name}},\n\nI came across {{company_name}} and noticed...`}
                value={form.body_template}
                onChange={(e) => setForm((p) => ({ ...p, body_template: e.target.value }))}
                helperText="AI will use this as a style guide and personalize it with each company's data"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, fontFamily: "monospace", fontSize: "0.9rem" } }}
              />

              <TextField
                fullWidth
                multiline
                minRows={4}
                label="AI Instructions (Optional)"
                placeholder={`e.g. Keep the tone professional and concise. Focus on cost-saving benefits. Always end with a specific call-to-action.`}
                value={form.instructions}
                onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
                helperText="Guide the AI on tone, focus areas, structure, or things to avoid"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 3, pt: 2, borderTop: `1px solid ${colors.border}` }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editTarget ? "Save Changes" : "Create Template"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default CampaignTemplates;
