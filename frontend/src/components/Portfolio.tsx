import React, { useRef } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface PortfolioFile {
  filename: string;
  stored_name: string;
  size: number;
  url: string;
}

export default function Portfolio() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useQuery<PortfolioFile[]>({
    queryKey: ["portfolio"],
    queryFn: () => api.listPortfolio(),
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => api.uploadPortfolio(formData),
    onSuccess: () => {
      toast.success("Files uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: () => toast.error("Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (storedName: string) => api.deletePortfolio(storedName),
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    for (const file of Array.from(selectedFiles)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" is not an allowed file type`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds the 10 MB limit`);
        return;
      }
    }

    const formData = new FormData();
    for (const file of Array.from(selectedFiles)) {
      formData.append("files", file);
    }
    uploadMutation.mutate(formData);
    // Reset input so the same file can be re-uploaded if deleted
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles.length) return;
    const formData = new FormData();
    for (const file of Array.from(droppedFiles)) {
      formData.append("files", file);
    }
    uploadMutation.mutate(formData);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", mt: 4, px: 2 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Portfolio Files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload your company portfolio, case studies, or brochures here. These
        files can be automatically attached to outreach emails.
      </Typography>

      {/* Drop zone */}
      <Card
        variant="outlined"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        sx={{
          mb: 3,
          borderStyle: "dashed",
          borderWidth: 2,
          borderColor: "primary.light",
          backgroundColor: "action.hover",
          cursor: "pointer",
          "&:hover": { borderColor: "primary.main" },
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent sx={{ textAlign: "center", py: 4 }}>
          <UploadFileIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
          <Typography variant="body1" fontWeight={500}>
            Drag & drop files here, or click to browse
          </Typography>
          <Typography variant="caption" color="text.secondary">
            PDF, DOCX, PPTX, PNG, JPG — max 10 MB each
          </Typography>
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {uploadMutation.isPending && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Uploading…</Typography>
        </Box>
      )}

      {/* File list */}
      {isLoading ? (
        <CircularProgress />
      ) : files.length === 0 ? (
        <Typography color="text.secondary">
          No portfolio files uploaded yet.
        </Typography>
      ) : (
        <List disablePadding>
          {files.map((file) => (
            <ListItem
              key={file.stored_name}
              divider
              secondaryAction={
                <Box>
                  <Tooltip title="Download">
                    <IconButton
                      component="a"
                      href={`http://localhost:8000${file.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteMutation.mutate(file.stored_name)}
                      disabled={deleteMutation.isPending}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            >
              <ListItemIcon>
                <InsertDriveFileIcon />
              </ListItemIcon>
              <ListItemText
                primary={file.filename}
                secondary={formatBytes(file.size)}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Box sx={{ mt: 3 }}>
        <Chip
          label={`${files.length} file${files.length !== 1 ? "s" : ""} stored`}
          color="primary"
          variant="outlined"
          size="small"
        />
      </Box>
    </Box>
  );
}
