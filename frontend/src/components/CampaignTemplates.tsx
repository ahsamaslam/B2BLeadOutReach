import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Delete, Edit } from "@mui/icons-material";
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
    if (
      !form.name.trim() ||
      !form.subject_template.trim() ||
      !form.body_template.trim()
    ) {
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
    return <Typography sx={{ p: 4 }}>Loading templates…</Typography>;

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Campaign Templates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Reusable email templates. AI will personalise each one when sending.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpen()}
        >
          New Template
        </Button>
      </Box>

      {templates.length === 0 && (
        <Alert severity="info">
          No campaign templates yet. Create one to start sending personalised
          outreach emails.
        </Alert>
      )}

      <Grid container spacing={2}>
        {templates.map((tmpl) => (
          <Grid item xs={12} md={6} key={tmpl.id}>
            <Card
              variant="outlined"
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <CardContent sx={{ flex: 1 }}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="flex-start"
                >
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {tmpl.name}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Subject:</strong> {tmpl.subject_template}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "pre-wrap",
                    maxHeight: 120,
                    overflow: "hidden",
                    color: "text.secondary",
                    fontSize: "0.8rem",
                  }}
                >
                  {tmpl.body_template}
                </Typography>
                {tmpl.instructions && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography
                      variant="caption"
                      color="primary.main"
                      fontWeight={600}
                      display="block"
                    >
                      AI Instructions:
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: "0.8rem",
                        mt: 0.25,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {tmpl.instructions}
                    </Typography>
                  </>
                )}
              </CardContent>
              <CardActions sx={{ justifyContent: "flex-end", pt: 0 }}>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleOpen(tmpl)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    color="error"
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

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editTarget ? "Edit Template" : "New Campaign Template"}
        </DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <TextField
              fullWidth
              label="Template Name"
              placeholder="e.g. AI Automation Outreach — UK Law Firms"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <TextField
              fullWidth
              label="Subject Template"
              placeholder="e.g. AI automation for {{company_name}}"
              value={form.subject_template}
              onChange={(e) =>
                setForm((p) => ({ ...p, subject_template: e.target.value }))
              }
              helperText="Placeholders will be filled per lead during sending"
            />

            {/* Placeholder inserter */}
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mb={0.5}
              >
                Insert placeholder into body:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {PLACEHOLDER_HINTS.map((ph) => (
                  <Chip
                    key={ph}
                    label={ph}
                    size="small"
                    clickable
                    variant="outlined"
                    onClick={() => insertPlaceholder(ph)}
                  />
                ))}
              </Box>
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={10}
              label="Body Template"
              placeholder={`Hi {{owner_name}},\n\nI came across {{company_name}} and noticed...`}
              value={form.body_template}
              onChange={(e) =>
                setForm((p) => ({ ...p, body_template: e.target.value }))
              }
              helperText="AI will use this as a style guide and personalise it with each company's data"
            />

            <TextField
              fullWidth
              multiline
              minRows={4}
              label="AI Instructions (optional)"
              placeholder={`e.g. Keep the tone professional and concise. Focus on cost-saving benefits. Always end with a specific call-to-action. Avoid mentioning pricing.`}
              value={form.instructions}
              onChange={(e) =>
                setForm((p) => ({ ...p, instructions: e.target.value }))
              }
              helperText="Guidance for the AI agent when personalising this template — tone, focus areas, things to avoid, structure hints"
            />
          </Box>
        </DialogContent>
        <DialogActions>
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
    </Container>
  );
};

export default CampaignTemplates;
