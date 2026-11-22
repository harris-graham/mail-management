import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0b3d6b', light: '#2f6698', dark: '#062a4d' },
    secondary: { main: '#b8860b' },
    background: { default: '#f4f6f9', paper: '#ffffff' },
    success: { main: '#1b7f4b' },
    warning: { main: '#b26a00' },
    error: { main: '#b3261e' },
    info: { main: '#1769aa' },
    text: { primary: '#17212b', secondary: '#5a6675' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: [
      'Inter',
      'Segoe UI',
      'Roboto',
      'Helvetica',
      'Arial',
      'sans-serif',
    ].join(','),
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: 'none', borderBottom: '1px solid #e3e8ef' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: '1px solid #e6ebf2', boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, color: '#5a6675', backgroundColor: '#f8fafc' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
  },
});

export default theme;
