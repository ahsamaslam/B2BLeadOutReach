import React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { colors } from "../../theme/tokens";

export interface PageLoaderProps {
  /** Optional label shown below the spinner. */
  label?: string;
  /** Height of the loader container. Defaults to "100%" (fills parent flex area). */
  height?: string | number;
}

/**
 * PageLoader — full-area centered spinner.
 *
 * Drop it as an early return in any component while `isLoading` is true:
 *
 *   if (isLoading) return <PageLoader />;
 */
export const PageLoader: React.FC<PageLoaderProps> = ({
  label,
  height = "100%",
}) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1.5,
      height,
      minHeight: 240,
      width: "100%",
    }}
  >
    <CircularProgress size={36} thickness={3} sx={{ color: colors.brand }} />
    {label && (
      <Typography
        sx={{
          fontSize: 13,
          color: colors.ink3,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </Typography>
    )}
  </Box>
);
