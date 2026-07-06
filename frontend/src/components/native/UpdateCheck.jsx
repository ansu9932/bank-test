import { useEffect, useState } from 'react';
import { RiDownloadCloud2Line, RiCloseLine } from 'react-icons/ri';
import api from '../../services/api';
import { isNativeApp } from '../../services/biometric';

/**
 * Native-app update gate. On launch (native builds only) fetches
 * GET /api/version and compares `latestVersion` with the installed app
 * version (from the Capacitor App plugin). Shows an update dialog when a
 * newer APK is available; blocks the app entirely when forceUpdate is true.
 * Renders nothing on the web build.
 */

// '1.2.10' vs '1.3.0' → negative when a is older than b.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export default function UpdateCheck() {
  const [update, setUpdate] = useState(null); // { latestVersion, apkUrl, forceUpdate }
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const info = await CapApp.getInfo(); // { version: '1.0.0', ... }
        const { data } = await api.get('/version');
        const latest = data?.latestVersion;
        if (latest && compareVersions(info.version, latest) < 0) {
          setUpdate({ ...data, installed: info.version });
        }
      } catch {
        /* Version check is best-effort — never block launch on a network error. */
      }
    })();
  }, []);

  if (!update || (dismissed && !update.forceUpdate)) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="App update available"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#111318] border border-white/10 p-6 text-center">
        <RiDownloadCloud2Line className="mx-auto text-5xl text-[#FF3333] mb-3" aria-hidden="true" />
        <h2 className="text-white text-lg font-semibold mb-1">Update available</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-5">
          A new version of Alister Bank ({update.latestVersion}) is available.
          You have {update.installed}.
          {update.forceUpdate && ' This update is required to continue.'}
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={update.apkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-[#CC0000] text-white font-semibold text-sm hover:bg-[#B00000] transition-colors"
          >
            Download update
          </a>
          {!update.forceUpdate && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="w-full py-3 rounded-xl border border-white/15 text-white/70 font-medium text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <RiCloseLine aria-hidden="true" /> Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
