import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchNotifications = createAsyncThunk('notification/fetch', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/transactions/notifications');
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const markAllRead = createAsyncThunk('notification/markRead', async () => {
  await api.put('/transactions/notifications/read');
});

const notificationSlice = createSlice({
  name: 'notification',
  initialState: { notifications: [], unreadCount: 0, loading: false },
  reducers: {},
  extraReducers: (b) => {
    b
      .addCase(fetchNotifications.fulfilled, (s, a) => {
        s.notifications = a.payload.notifications;
        s.unreadCount = a.payload.unreadCount;
      })
      .addCase(markAllRead.fulfilled, (s) => {
        s.unreadCount = 0;
        s.notifications = s.notifications.map(n => ({ ...n, is_read: true }));
      });
  },
});

export default notificationSlice.reducer;
