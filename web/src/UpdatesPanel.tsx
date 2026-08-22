import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type UpdateStatus } from './api';
import { useDialog } from './Dialog';
import { formatDateTime } from './dateFormat';

// Owner-only app-update feature (PLANNING.md #15) - modeled directly on
// nomad-eye's own "Application Updates" card: current vs. latest for the
// selected channel, check/install/rollback, and the auto-check/auto-apply
// toggles. The actual git/docker work happens in the separate `updater`
// service (docker-compose.prod.yml); this panel just polls the combined
// /updates/status endpoint while an install is running.
export default function UpdatesPanel() {
  const { confirm, alert } = useDialog();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.updateStatus();
      setStatus(s);
      setNotConfigured(false);
      return s;
    } catch (e) {
      // UpdatesService throws this exact message when UPDATE_SHARED_SECRET
      // isn't set - the feature is simply off for this instance, not an
      // error worth alarming an owner about.
      if ((e as Error).message?.includes('not configured on this instance')) setNotConfigured(true);
      else setError((e as Error).message);
      return null;
    }
  }, []);

  const beginPoll = useCallback(() => {
    if (pollRef.current) return;
    setInstalling(true);
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > 6 * 60_000) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setInstalling(false);
        setError('Update timed out - check the VM directly (see DEPLOY.md).');
        return;
      }
      const s = await load();
      if (!s?.job) return; // updater unreachable mid-install (service restarting) - keep polling
      if (s.job.inProgress) return;
      clearInterval(pollRef.current!);
      pollRef.current = null;
      setInstalling(false);
      if (s.job.lastResult && s.job.lastResult !== 'success') {
        setError(s.job.lastResult.startsWith('error:') ? s.job.lastResult.slice(6).trim() : s.job.lastResult);
      }
      // On success the server container itself just restarted - reload so
      // the whole app (this panel included) picks up the new build.
      if (s.job.lastResult === 'success') window.location.reload();
    }, 3000);
  }, [load]);

  useEffect(() => {
    load().then((s) => {
      if (s?.job?.inProgress) beginPoll();
    });
  }, [load, beginPoll]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      await api.checkForUpdate();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function install() {
    const ok = await confirm(
      'This rebuilds and restarts the whole app - a brief outage for the whole family while it does. Continue?',
      { confirmLabel: 'Update now' },
    );
    if (!ok) return;
    setError(null);
    try {
      await api.installUpdate();
      beginPoll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rollback() {
    const ok = await confirm(
      `Roll back to the previous version (${status?.settings.previousCommit?.slice(0, 7) ?? 'unknown'})? This also rebuilds and restarts the app.`,
      { confirmLabel: 'Roll back' },
    );
    if (!ok) return;
    setError(null);
    try {
      await api.rollbackUpdate();
      beginPoll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveSettings(patch: Parameters<typeof api.saveUpdateSettings>[0]) {
    try {
      const s = await api.saveUpdateSettings(patch);
      setStatus((prev) => (prev ? { ...prev, settings: s } : prev));
    } catch (e) {
      await alert((e as Error).message || "Couldn't save - try again.");
    }
  }

  if (notConfigured) {
    return (
      <p className="text-sm text-slate-500">
        Not set up on this instance - see <code className="text-xs">.env.example</code> (<code className="text-xs">UPDATE_SHARED_SECRET</code> and
        friends) and DEPLOY.md.
      </p>
    );
  }
  if (!status) return <p className="text-sm text-slate-400">{error ?? 'Loading…'}</p>;

  const { version, settings } = status;
  const currentLabel = version ? (settings.updateChannel === 'stable' ? version.tag ?? version.shortSha : version.shortSha) : '-';
  const latestAvailable = settings.lastKnownLatest;
  const updateAvailable = !!latestAvailable && latestAvailable !== currentLabel;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Current version</span>
        <div className="text-right">
          <span className="font-mono">{currentLabel ?? '-'}</span>
          {version?.dirty && <p className="mt-0.5 text-xs text-amber-600">Locally modified - not exactly the checked-in code</p>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-slate-500">Latest available ({settings.updateChannel === 'stable' ? 'stable' : 'main branch'})</span>
        <div className="text-right">
          <span className={`font-mono ${updateAvailable ? 'text-amber-600' : ''}`}>{latestAvailable ?? '-'}</span>
          {settings.lastCheckedAt && <p className="mt-0.5 text-xs text-slate-400">Checked {formatDateTime(settings.lastCheckedAt)}</p>}
        </div>
      </div>

      {installing && (
        <div className="alert-banner p-3">
          <p className="font-medium">Update in progress - do not close this page.</p>
          <p className="mt-0.5 text-xs opacity-80">Takes a few minutes while the images rebuild. The app will restart and this page will reload on its own.</p>
        </div>
      )}
      {!installing && updateAvailable && <div className="alert-banner p-3">Update available</div>}
      {error && <p className="text-red-500">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={check} disabled={checking || installing} className="rounded border px-3 py-1.5 disabled:opacity-40 hover:bg-slate-50">
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {!installing && (updateAvailable || status.job?.inProgress) && (
          <button onClick={install} className="rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700">
            Install update
          </button>
        )}
        {!installing && settings.previousCommit && (
          <button onClick={rollback} className="rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50">
            Roll back to previous version
          </button>
        )}
      </div>

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p>Update channel</p>
            <p className="text-xs text-slate-500">Stable releases are tagged and tested; main branch has the latest changes sooner.</p>
          </div>
          <select
            value={settings.updateChannel}
            onChange={(e) => saveSettings({ updateChannel: e.target.value as 'stable' | 'latest' })}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="stable">Stable releases</option>
            <option value="latest">Main branch</option>
          </select>
        </div>

        <label className="flex items-center justify-between gap-4">
          <div>
            <p>Auto-check for updates</p>
            <p className="text-xs text-slate-500">Checks once a day and records what it finds - doesn't install anything on its own.</p>
          </div>
          <input
            type="checkbox"
            checked={settings.autoCheckEnabled}
            onChange={(e) => saveSettings({ autoCheckEnabled: e.target.checked })}
          />
        </label>

        {settings.autoCheckEnabled && (
          <>
            <div className="flex items-center justify-between gap-4 pl-4">
              <p className="text-xs text-slate-500">Check around this hour (0-23, server time)</p>
              <input
                type="number"
                min={0}
                max={23}
                value={settings.autoCheckHour}
                onChange={(e) => saveSettings({ autoCheckHour: Number(e.target.value) })}
                className="w-16 rounded border px-2 py-1 text-sm"
              />
            </div>
            <label className="flex items-center justify-between gap-4 pl-4">
              <div>
                <p>Auto-install found updates</p>
                <p className="text-xs text-amber-600">Restarts the app unattended when a newer version is found - the whole family, no confirmation.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoApplyEnabled}
                onChange={(e) => saveSettings({ autoApplyEnabled: e.target.checked })}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
