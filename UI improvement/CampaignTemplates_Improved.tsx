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
  alpha,
  useTheme,
} from "@mui/material";
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
  const theme = useTheme();
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
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <Typography color="text.secondary">Loading templates…</Typography>
      </Box>
    );

  return (
    <Box sx={{ bgcolor: "grey.50", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Box mb={4}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            flexWrap="wrap"
            gap={2}
          >
            <Box>
              <Typography
                variant="h4"
                fontWeight={800}
                gutterBottom
                sx={{
                  background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Campaign Templates
              </Typography>
              <Typography variant="body1" color="text.secondary" maxWidth={600}>
                Create reusable email templates. AI will personalize each one when
                sending to your leads.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<Add />}
              onClick={() => handleOpen()}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1.5,
                boxShadow: theme.shadows[4],
                "&:hover": {
                  boxShadow: theme.shadows[8],
                },
              }}
            >
              New Template
            </Button>
          </Box>
        </Box>

        {/* Empty State */}
        {templates.length === 0 && (
          <Card
            sx={{
              textAlign: "center",
              py: 8,
              bgcolor: "white",
              borderRadius: 3,
              border: "2px dashed",
              borderColor: "divider",
            }}
          >
            <Email sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              No templates yet
            </Typography>
            <Typography color="text.secondary" mb={3}>
              Create your first campaign template to start sending personalized
              outreach emails
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpen()}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Create First Template
            </Button>
          </Card>
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
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  position: "relative",
                  overflow: "hidden",
                  bgcolor: "white",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: theme.shadows[8],
                    borderColor: "primary.main",
                    "& .action-buttons": {
                      opacity: 1,
                    },
                  },
                }}
              >
                {/* Decorative gradient */}
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    background: "linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)",
                  }}
                />

                <CardContent sx={{ flex: 1, pt: 3 }}>
                  {/* Template Name */}
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    gutterBottom
                    sx={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      mb: 2,
                    }}
                  >
                    {tmpl.name}
                  </Typography>

                  {/* Subject */}
                  <Box
                    sx={{
                      mb: 2,
                      p: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                      borderRadius: 1.5,
                      borderLeft: "3px solid",
                      borderColor: "primary.main",
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Email sx={{ fontSize: 16, color: "primary.main" }} />
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="primary.main"
                        textTransform="uppercase"
                        letterSpacing={0.5}
                      >
                        Subject
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.primary"
                      fontWeight={500}
                      sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {tmpl.subject_template}
                    </Typography>
                  </Box>

                  {/* Body Preview */}
                  <Box mb={2}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      textTransform="uppercase"
                      letterSpacing={0.5}
                      display="block"
                      mb={1}
                    >
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
                        bgcolor: alpha(theme.palette.success.main, 0.04),
                        borderRadius: 1.5,
                        borderLeft: "3px solid",
                        borderColor: "success.main",
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <SmartToy sx={{ fontSize: 16, color: "success.main" }} />
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="success.main"
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          AI Instructions
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          fontSize: "0.85rem",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {tmpl.instructions}
                      </Typography>
                    </Box>
                  )}
                </CardContent>

                {/* Action Buttons */}
                <CardActions
                  className="action-buttons"
                  sx={{
                    justifyContent: "flex-end",
                    p: 2,
                    pt: 0,
                    opacity: 0.7,
                    transition: "opacity 0.2s",
                  }}
                >
                  <Tooltip title="Edit template">
                    <IconButton
                      size="small"
                      onClick={() => handleOpen(tmpl)}
                      sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        "&:hover": {
                          bgcolor: alpha(theme.palette.primary.main, 0.16),
                        },
                      }}
                    >
                      <Edit fontSize="small" color="primary" />
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
                      sx={{
                        bgcolor: alpha(theme.palette.error.main, 0.08),
                        "&:hover": {
                          bgcolor: alpha(theme.palette.error.main, 0.16),
                        },
                      }}
                    >
                      <Delete fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Create / Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={handleClose}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle
            sx={{
              pb: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" fontWeight={700}>
              {editTarget ? "Edit Template" : "New Campaign Template"}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {editTarget
                ? "Update your email template"
                : "Create a reusable email template for your campaigns"}
            </Typography>
          </DialogTitle>

          <DialogContent sx={{ pt: 3 }}>
            <Box display="flex" flexDirection="column" gap={3}>
              {/* Template Name */}
              <TextField
                fullWidth
                label="Template Name"
                placeholder="e.g. AI Automation Outreach — UK Law Firms"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
              />

              {/* Subject Template */}
              <TextField
                fullWidth
                label="Subject Template"
                placeholder="e.g. AI automation for {{company_name}}"
                value={form.subject_template}
                onChange={(e) =>
                  setForm((p) => ({ ...p, subject_template: e.target.value }))
                }
                helperText="Placeholders will be filled per lead during sending"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
              />

              {/* Placeholder Inserter */}
              <Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color="text.secondary"
                  mb={1.5}
                >
                  Quick Insert Placeholders:
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {PLACEHOLDER_HINTS.map((ph) => (
                    <Chip
                      key={ph}
                      label={ph}
                      size="medium"
                      clickable
                      icon={<ContentCopy sx={{ fontSize: 16 }} />}
                      onClick={() => insertPlaceholder(ph)}
                      sx={{
                        borderRadius: 2,
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        "&:hover": {
                          bgcolor: alpha(theme.palette.primary.main, 0.12),
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>

              {/* Body Template */}
              <TextField
                fullWidth
                multiline
                minRows={10}
                label="Email Body Template"
                placeholder={`Hi {{owner_name}},\n\nI came across {{company_name}} and noticed...`}
                value={form.body_template}
                onChange={(e) =>
                  setForm((p) => ({ ...p, body_template: e.target.value }))
                }
                helperText="AI will use this as a style guide and personalize it with each company's data"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                  },
                }}
              />

              {/* AI Instructions */}
              <TextField
                fullWidth
                multiline
                minRows={4}
                label="AI Instructions (Optional)"
                placeholder={`e.g. Keep the tone professional and concise. Focus on cost-saving benefits. Always end with a specific call-to-action.`}
                value={form.instructions}
                onChange={(e) =>
                  setForm((p) => ({ ...p, instructions: e.target.value }))
                }
                helperText="Guide the AI on tone, focus areas, structure, or things to avoid"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
            <Button
              onClick={handleClose}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                borderRadius: 2,
              }}
            >
              {editTarget ? "Save Changes" : "Create Template"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default CampaignTemplates;
