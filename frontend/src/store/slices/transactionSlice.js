import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchTransactions = createAsyncThunk('transaction/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/transactions', { params });
      return data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const initiateTransfer = createAsyncThunk('transaction/transfer',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/transactions/transfer', payload);
      return data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchBeneficiaries = createAsyncThunk('transaction/fetchBeneficiaries', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/transactions/beneficiaries');
    return data.data.beneficiaries;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const transactionSlice = createSlice({
  name: 'transaction',
  initialState: {
    transactions: [],
    pagination: { total: 0, page: 1, totalPages: 1 },
    beneficiaries: [],
    loading: false,
    transferLoading: false,
    error: null,
    lastTransfer: null,
  },
  reducers: {
    clearTransferState: (s) => { s.lastTransfer = null; s.error = null; },
  },
  extraReducers: (b) => {
    b
      .addCase(fetchTransactions.pending, (s) => { s.loading = true; })
      .addCase(fetchTransactions.fulfilled, (s, a) => {
        s.loading = false;
        // Normalize the timestamp field: the API returns raw Sequelize rows whose
        // auto timestamp serializes as camelCase `createdAt` (underscored:true),
        // while the UI reads `created_at`. Map it once here so every page
        // (Transactions, Dashboard, Analytics) shows the date/time correctly.
        s.transactions = (a.payload.transactions || []).map((t) => ({
          ...t,
          created_at: t.created_at || t.createdAt,
        }));
        s.pagination = a.payload.pagination;
      })
      .addCase(fetchTransactions.rejected, (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(initiateTransfer.pending, (s) => { s.transferLoading = true; s.error = null; })
      .addCase(initiateTransfer.fulfilled, (s, a) => { s.transferLoading = false; s.lastTransfer = a.payload; })
      .addCase(initiateTransfer.rejected, (s, a) => { s.transferLoading = false; s.error = a.payload; })
      .addCase(fetchBeneficiaries.fulfilled, (s, a) => { s.beneficiaries = a.payload; });
  },
});

export const { clearTransferState } = transactionSlice.actions;
export default transactionSlice.reducer;
