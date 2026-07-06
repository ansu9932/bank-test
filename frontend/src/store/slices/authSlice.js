import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import appStorage from '../../services/appStorage';
import toast from 'react-hot-toast';

const getStoredUser = () => {
  try { return JSON.parse(appStorage.getItem('user')); }
  catch { return null; }
};

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    appStorage.setItem('token', data.data.token);
    appStorage.setItem('user', JSON.stringify(data.data.user));
    // Rotating refresh token — silently exchanged for new 15-min access JWTs
    // by the api.js response interceptor. Lives in Keystore-encrypted storage
    // on the native app; wiped on logout and on any auth failure.
    if (data.data.refreshToken) appStorage.setItem('refreshToken', data.data.refreshToken);
    // Absolute-session marker: the precise ms the current session began. The
    // customer-side session engine enforces a hard 1-hour lifespan from here.
    appStorage.setItem('loginTime', String(Date.now()));
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try { await api.post('/auth/logout'); } catch {}
  // Full memory wipe: every session artifact goes, including the refresh
  // token (also revoked server-side by the logout endpoint above).
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
  appStorage.removeItem('user');
  appStorage.removeItem('loginTime');
});

export const getMe = createAsyncThunk('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me');
    appStorage.setItem('user', JSON.stringify(data.data.user));
    return data.data.user;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const sendOTP = createAsyncThunk('auth/sendOTP', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/send-otp', payload);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to send OTP');
  }
});

export const verifyOTP = createAsyncThunk('auth/verifyOTP', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/verify-otp', payload);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'OTP verification failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: getStoredUser(),
    token: appStorage.getItem('token'),
    isAuthenticated: !!appStorage.getItem('token'),
    loading: false,
    error: null,
    otpSent: false,
    otpVerified: false,
  },
  reducers: {
    clearError: (state) => { state.error = null; },
    resetOTP: (state) => { state.otpSent = false; state.otpVerified = false; },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      appStorage.setItem('user', JSON.stringify(state.user));
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(login.fulfilled, (s, a) => {
        s.loading = false;
        s.isAuthenticated = true;
        s.user = a.payload.user;
        s.token = a.payload.token;
      })
      .addCase(login.rejected, (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(logout.fulfilled, (s) => { s.user = null; s.token = null; s.isAuthenticated = false; })
      .addCase(getMe.fulfilled, (s, a) => { s.user = a.payload; })
      .addCase(sendOTP.fulfilled, (s) => { s.otpSent = true; })
      .addCase(sendOTP.rejected, (s, a) => { s.error = a.payload; })
      .addCase(verifyOTP.fulfilled, (s) => { s.otpVerified = true; })
      .addCase(verifyOTP.rejected, (s, a) => { s.error = a.payload; });
  },
});

export const { clearError, resetOTP, updateUser } = authSlice.actions;
export default authSlice.reducer;
