import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchAccount = createAsyncThunk('account/fetchAccount', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/account/details');
    return data.data.account;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const updateProfile = createAsyncThunk('account/updateProfile', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.put('/account/profile', payload);
    return payload;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const accountSlice = createSlice({
  name: 'account',
  initialState: {
    account: null,
    loading: false,
    error: null,
    balanceVisible: false,
  },
  reducers: {
    toggleBalanceVisibility: (s) => { s.balanceVisible = !s.balanceVisible; },
    updateBalance: (s, a) => {
      if (s.account) {
        s.account.balance = a.payload.balance;
        s.account.available_balance = a.payload.available_balance;
      }
    },
  },
  extraReducers: (b) => {
    b
      .addCase(fetchAccount.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(fetchAccount.fulfilled, (s, a) => { s.loading = false; s.account = a.payload; })
      .addCase(fetchAccount.rejected, (s, a) => { s.loading = false; s.error = a.payload; });
  },
});

export const { toggleBalanceVisibility, updateBalance } = accountSlice.actions;
export default accountSlice.reducer;
