import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarOpen: true,
    sidebarMobileOpen: false,
    activeModal: null,
    theme: 'dark',
  },
  reducers: {
    toggleSidebar: (s) => { s.sidebarOpen = !s.sidebarOpen; },
    toggleMobileSidebar: (s) => { s.sidebarMobileOpen = !s.sidebarMobileOpen; },
    closeMobileSidebar: (s) => { s.sidebarMobileOpen = false; },
    openModal: (s, a) => { s.activeModal = a.payload; },
    closeModal: (s) => { s.activeModal = null; },
    setTheme: (s, a) => { s.theme = a.payload; },
  },
});

export const { toggleSidebar, toggleMobileSidebar, closeMobileSidebar, openModal, closeModal, setTheme } = uiSlice.actions;
export default uiSlice.reducer;
