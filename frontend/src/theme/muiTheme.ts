/**
 * SendMaster — MUI theme override
 *
 * Drops MUI's blue defaults and the "card" feel of MUI 5 for a warm,
 * Notion/Stripe-adjacent look. Re-uses tokens from tokens.ts so that
 * the same constants drive both CSS and the MUI runtime.
 */

import { createTheme, alpha } from "@mui/material/styles";
import { colors, radius, shadow, typography } from "./tokens";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: colors.brand,
      dark: colors.brandInk,
      light: colors.brandSoft,
      contrastText: "#ffffff",
    },
    secondary: {
      main: colors.ink1,
      light: colors.ink3,
      dark: "#000000",
      contrastText: "#ffffff",
    },
    success: { main: colors.green, light: colors.greenSoft, dark: "#226e48" },
    warning: { main: colors.amber, light: colors.amberSoft, dark: "#955a0d" },
    error: { main: colors.red, light: colors.redSoft, dark: "#9b342f" },
    info: { main: colors.violet, light: colors.violetSoft, dark: "#5d3995" },
    background: {
      default: colors.bg,
      paper: colors.bgElev,
    },
    text: {
      primary: colors.ink1,
      secondary: colors.ink2,
      disabled: colors.ink4,
    },
    divider: colors.border,
    grey: {
      50: colors.bgTinted,
      100: colors.bgSunken,
      200: colors.borderSubtle,
      300: colors.border,
      400: colors.borderStrong,
      500: colors.ink4,
      600: colors.ink3,
      700: colors.ink2,
      900: colors.ink1,
    },
  },

  typography: {
    fontFamily: typography.sans,
    htmlFontSize: 16,
    h1: {
      fontSize: 36,
      lineHeight: 1.1,
      letterSpacing: "-0.025em",
      fontWeight: 600,
    },
    h2: {
      fontSize: 28,
      lineHeight: 1.15,
      letterSpacing: "-0.022em",
      fontWeight: 600,
    },
    h3: {
      fontSize: 20,
      lineHeight: 1.25,
      letterSpacing: "-0.014em",
      fontWeight: 600,
    },
    h4: {
      fontSize: 16,
      lineHeight: 1.35,
      letterSpacing: "-0.008em",
      fontWeight: 600,
    },
    h5: { fontSize: 14, lineHeight: 1.4, fontWeight: 600 },
    body1: { fontSize: 14, lineHeight: 1.5 },
    body2: { fontSize: 13, lineHeight: 1.45, color: colors.ink2 },
    caption: { fontSize: 12, lineHeight: 1.4, color: colors.ink3 },
    overline: {
      fontFamily: typography.mono,
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: colors.ink3,
      fontWeight: 500,
    },
    button: {
      textTransform: "none",
      fontWeight: 500,
      letterSpacing: "-0.005em",
    },
  },

  shape: { borderRadius: radius.md },

  shadows: [
    "none",
    shadow.sh1,
    shadow.sh1,
    shadow.sh1,
    shadow.sh2,
    shadow.sh2,
    shadow.sh2,
    shadow.sh2,
    shadow.sh3,
    shadow.sh3,
    shadow.sh3,
    shadow.sh3,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
    shadow.shPop,
  ] as any,

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: colors.bg, color: colors.ink1 },
      },
    },

    /* Buttons — match the design system: ghost / brand / quiet / danger */
    MuiButton: {
      defaultProps: { disableElevation: true, variant: "outlined" },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          fontWeight: 500,
          fontSize: 13.5,
          height: 36,
          paddingInline: 14,
          textTransform: "none",
          letterSpacing: "-0.005em",
          boxShadow: shadow.sh1,
        },
        sizeSmall: {
          height: 30,
          paddingInline: 10,
          fontSize: 12.5,
          borderRadius: radius.sm,
        },
        sizeLarge: { height: 42, paddingInline: 18, fontSize: 14.5 },
        outlined: {
          backgroundColor: colors.bgElev,
          color: colors.ink1,
          borderColor: colors.border,
          "&:hover": {
            backgroundColor: colors.bgTinted,
            borderColor: colors.borderStrong,
          },
        },
        contained: {
          backgroundColor: colors.ink1,
          color: "#fdfcf9",
          "&:hover": { backgroundColor: "#2a2824" },
        },
        containedPrimary: {
          backgroundColor: colors.brand,
          color: "#ffffff",
          "&:hover": { backgroundColor: colors.brandInk },
        },
        text: {
          color: colors.ink2,
          boxShadow: "none",
          "&:hover": { backgroundColor: colors.bgSunken, color: colors.ink1 },
        },
      },
    },

    /* Inputs — flat, soft borders, brand focus ring */
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          backgroundColor: colors.bgElev,
          fontSize: 13.5,
          "& fieldset": { borderColor: colors.border },
          "&:hover fieldset": { borderColor: colors.borderStrong },
          "&.Mui-focused fieldset": {
            borderColor: colors.brand,
            borderWidth: 1,
          },
          "&.Mui-focused": { boxShadow: `0 0 0 3px ${colors.brandRing}` },
          "&.Mui-error.Mui-focused": {
            boxShadow: `0 0 0 3px ${alpha(colors.red, 0.12)}`,
          },
        },
        input: { padding: "10px 12px", height: "auto" },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: 12.5, color: colors.ink2, fontWeight: 500 },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },

    /* Paper / Card — flat with subtle border */
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: colors.bgElev,
        },
        outlined: { borderColor: colors.border },
        elevation0: { border: `1px solid ${colors.border}` },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          borderRadius: radius.lg,
          borderColor: colors.border,
          backgroundImage: "none",
        },
      },
    },

    /* Chips — status pills */
    MuiChip: {
      styleOverrides: {
        root: {
          height: 22,
          paddingInline: 4,
          fontSize: 11.5,
          fontWeight: 500,
          borderRadius: 999,
          "&.MuiChip-colorDefault": {
            backgroundColor: colors.bgSunken,
            color: colors.ink2,
          },
          "&.MuiChip-colorPrimary": {
            backgroundColor: colors.brandSoft,
            color: colors.brandInk,
          },
          "&.MuiChip-colorSuccess": {
            backgroundColor: colors.greenSoft,
            color: colors.green,
          },
          "&.MuiChip-colorWarning": {
            backgroundColor: colors.amberSoft,
            color: colors.amber,
          },
          "&.MuiChip-colorError": {
            backgroundColor: colors.redSoft,
            color: colors.red,
          },
          "&.MuiChip-colorInfo": {
            backgroundColor: colors.violetSoft,
            color: colors.violet,
          },
        },
        sizeSmall: { height: 22 },
        outlined: {
          backgroundColor: "transparent",
          borderColor: colors.borderStrong,
          color: colors.ink2,
        },
      },
    },

    /* Tables — soft header, hover row */
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: colors.bgTinted,
            color: colors.ink3,
            fontWeight: 500,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            borderBottom: `1px solid ${colors.border}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${colors.borderSubtle}`,
          padding: "14px",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { "&:hover": { backgroundColor: colors.bgTinted } },
      },
    },

    /* Dialog / Tooltip */
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radius.lg, boxShadow: shadow.shPop },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.ink1,
          fontSize: 11.5,
          padding: "6px 8px",
          borderRadius: radius.sm,
        },
        arrow: { color: colors.ink1 },
      },
    },

    /* AppBar / Tabs — neutralized, so the old MUI nav at least stops looking childish during migration */
    MuiAppBar: {
      defaultProps: { color: "transparent", elevation: 0 },
      styleOverrides: {
        root: {
          background: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
          color: colors.ink1,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 500, minHeight: 44 },
      },
    },

    /* Misc */
    MuiDivider: {
      styleOverrides: { root: { borderColor: colors.borderSubtle } },
    },
    MuiSwitch: {
      styleOverrides: {
        track: { backgroundColor: colors.borderStrong, opacity: 1 },
        switchBase: {
          "&.Mui-checked + .MuiSwitch-track": {
            backgroundColor: colors.brand,
            opacity: 1,
          },
        },
      },
    },
  },
});
