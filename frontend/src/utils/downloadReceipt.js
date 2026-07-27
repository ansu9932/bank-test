import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * Downloads a transaction receipt PDF through the authenticated axios
 * instance (Bearer token attached by the interceptor) instead of a bare
 * window.open, so the request always carries the session credentials.
 *
 * @param {string} idOrRef  Transaction UUID or reference number.
 * @param {string} [refForName]  Optional reference number for the filename.
 */
export async function downloadReceipt(idOrRef, refForName) {
  if (!idOrRef) {
    toast.error('Receipt is not available for this transaction.');
    return;
  }
  const toastId = toast.loading('Preparing your receipt...');
  try {
    const { data } = await api.get(`/transactions/${encodeURIComponent(idOrRef)}/receipt`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${refForName || idOrRef}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Receipt downloaded', { id: toastId });
  } catch (err) {
    // Blob error responses need decoding before we can show the message.
    let message = 'Could not download the receipt. Please try again.';
    try {
      const text = await err?.response?.data?.text?.();
      if (text) message = JSON.parse(text)?.message || message;
    } catch { /* keep default */ }
    toast.error(message, { id: toastId });
  }
}
