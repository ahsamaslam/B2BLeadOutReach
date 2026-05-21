import React from "react";
import { Box, Typography, Chip } from "@mui/material";
import { ArrowUpward, ArrowDownward } from "@mui/icons-material";
import { colors } from "../../theme/tokens";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** "+8.4%" — number prepended automatically. */
  delta?: string;
  deltaTone?: "green" | "red";
  /** Faint tertiary line under the value. */
  sub?: string;
  /** Inline SVG path for a 120×24 sparkline. */
  sparkline?: string;
}

/**
 * StatCard — KPI card used on the Dashboard, History summary and Admin.
 *
 * Visual contract: 30px display number, mono delta chip in upper right,
 * optional 120×24 sparkline at the bottom. All tones come from the theme.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label, value, delta, deltaTone = "green", sub, sparkline,
}) => (
  <Box sx={{
    p: 2.25, borderRadius: 1.75,
    border: `1px solid ${colors.border}`,
    bgcolor: colors.bgElev,
    display: "flex", flexDirection: "column", gap: 1.25,
    minHeight: 116,
  }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="overline" sx={{ lineHeight: 1 }}>{label}</Typography>
      {delta && (
        <Chip
          size="small"
          color={deltaTone === "green" ? "success" : "error"}
          icon={deltaTone === "green" ? <ArrowUpward sx={{ fontSize: 11 }}/> : <ArrowDownward sx={{ fontSize: 11 }}/>}
          label={delta}
          sx={{ height: 20, fontSize: 11 }}
        />
      )}
    </Box>
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
      <Typography sx={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.022em", lineHeight: 1 }}>
        {value}
      </Typography>
      {sub && <Typography variant="caption">{sub}</Typography>}
    </Box>
    {sparkline && (
      <Box sx={{ mt: "auto" }}>
        <svg viewBox="0 0 120 24" preserveAspectRatio="none" style={{ width: "100%", height: 24 }}>
          <path d={sparkline} fill="none" stroke={colors.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          <path d={`${sparkline} L 120 24 L 0 24 Z`} fill={colors.brandSoft} opacity={0.5}/>
        </svg>
      </Box>
    )}
  </Box>
);
