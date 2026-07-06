import axios from 'axios';

/**
 * Dedicated Axios instance for the AVA chatbot.
 *
 * Deliberately SEPARATE from the shared services/api.js instance:
 *   - No request interceptor → the localStorage user/admin tokens are never
 *     attached to chat calls.
 *   - No 401 redirect interceptor → an expired chat token must never log the
 *     user out of the main app; the widget handles it in-place.
 *   - The short-lived chat token is passed explicitly per-call via the
 *     X-Chat-Token header and lives ONLY in widget memory.
 */
const avaApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.alisterbank.online/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/** Extract a friendly message from any API error. */
const errMessage = (err, fallback) =>
  err?.response?.data?.message || fallback;

/** Send a chat message. Includes the chat token when verified. */
export async function sendChatMessage(message, chatToken) {
  try {
    const headers = chatToken ? { 'X-Chat-Token': chatToken } : {};
    const { data } = await avaApi.post('/chat/message', { message }, { headers });
    return data.data;
  } catch (err) {
    if (err?.response?.status === 429) {
      return { reply: errMessage(err, 'You are sending messages too quickly. Please wait a moment.') };
    }
    return { reply: 'Sorry, I could not reach the bank right now. Please try again in a moment.' };
  }
}

/** Request an OTP for the given email. Response is identical whether or not the email exists. */
export async function sendChatOtp(email) {
  try {
    const { data } = await avaApi.post('/chat/otp/send', { email });
    return { ok: true, reply: data.data.reply };
  } catch (err) {
    return { ok: false, reply: errMessage(err, 'I could not send the code right now. Please try again.') };
  }
}

/** Verify the OTP. On success returns { pendingToken, requiresDob, firstName, reply }. */
export async function verifyChatOtp(email, otp) {
  try {
    const { data } = await avaApi.post('/chat/otp/verify', { email, otp });
    return { ok: true, ...data.data };
  } catch (err) {
    return { ok: false, reply: errMessage(err, 'Verification failed. Please try again.') };
  }
}

/** Confirm date of birth (final step). On success returns { chatToken, firstName, reply }. */
export async function verifyChatDob(dob, pendingToken) {
  try {
    const { data } = await avaApi.post('/chat/dob/verify', { dob }, { headers: { 'X-Chat-Token': pendingToken } });
    return { ok: true, ...data.data };
  } catch (err) {
    return {
      ok: false,
      // 'restart' → widget sends the user back to the email step
      restart: /start (verification )?again|expired/i.test(errMessage(err, '')),
      reply: errMessage(err, 'Verification failed. Please try again.'),
    };
  }
}
