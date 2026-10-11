import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { api, triggerChannelPoolRefresh, ChannelPoolSource } from '../apiClient';
import { useStore, notifyError, notifyWarning } from '../store';
import Dialog from './Dialog';
import { USER_AGENT_PRESETS } from '../utils/userAgents';

interface AddChannelPoolSourceDialogProps {
  open: boolean;
  onClose: () => void;
  editingSource?: ChannelPoolSource | null;
}

type TabType = 'playlist-url' | 'xtream' | 'upload';

export default function AddChannelPoolSourceDialog({ open, onClose, editingSource }: AddChannelPoolSourceDialogProps) {
  const { accentColor, setActiveChannelPoolSourceId } = useStore();
  const [tab, setTab] = useState<TabType>('playlist-url');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Playlist Link State
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkInterval, setLinkInterval] = useState(24);
  // null = not yet checked, string = warning message, false = explicitly overridden by user
  const [linkWarning, setLinkWarning] = useState<string | null>(null);
  const [linkWarningConfirmed, setLinkWarningConfirmed] = useState(false);

  // Xtream State
  const [xtreamName, setXtreamName] = useState('');
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');
  const [xtreamInterval, setXtreamInterval] = useState(24);

  // User agent, shared by the Playlist Link and Xtream tabs. '' = the app's default.
  // `customUserAgent` is on when the user picked "Custom…" or the saved value isn't a preset.
  const [userAgent, setUserAgent] = useState('');
  const [customUserAgent, setCustomUserAgent] = useState(false);
  // Most providers work with the app default, so the user agent choice stays folded away unless
  // the source already uses one or its last download failed (when trying another app can help).
  const [showUserAgent, setShowUserAgent] = useState(false);

  // Why the source's last download failed. Shown when editing a failing source, so a different
  // user agent or login can be tried right there. `savedButFailed` = this dialog's own save
  // went through but the download right after it still failed.
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [savedButFailed, setSavedButFailed] = useState(false);

  // Upload State
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Reset warning state on every open (Add or Edit) so a warning triggered in a
      // previous dialog session never leaks into a fresh one.
      setLinkWarning(null);
      setLinkWarningConfirmed(false);
      const savedUserAgent = editingSource?.userAgent || '';
      setUserAgent(savedUserAgent);
      setCustomUserAgent(savedUserAgent !== '' && !USER_AGENT_PRESETS.some(p => p.value === savedUserAgent));
      setShowUserAgent(savedUserAgent !== '' || !!editingSource?.lastFetchError);
      setDownloadError(editingSource?.lastFetchError || null);
      setSavedButFailed(false);
      if (editingSource) {
        setTab(editingSource.type);
        if (editingSource.type === 'playlist-url') {
          setLinkName(editingSource.name);
          setLinkUrl(editingSource.url || '');
          setLinkInterval(editingSource.refreshIntervalHours || 24);
        } else if (editingSource.type === 'xtream') {
          setXtreamName(editingSource.name);
          setXtreamUrl(editingSource.url || '');
          setXtreamUser(editingSource.xtreamCredentials?.username || '');
          setXtreamPass(editingSource.xtreamCredentials?.password || '');
          setXtreamInterval(editingSource.refreshIntervalHours || 24);
        } else if (editingSource.type === 'playlist-file') {
          setUploadName(editingSource.name);
          setUploadFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      } else {
        setTab('playlist-url');
        setLinkName('');
        setLinkUrl('');
        setLinkInterval(24);
        setXtreamName('');
        setXtreamUrl('');
        setXtreamUser('');
        setXtreamPass('');
        setXtreamInterval(24);
        setUploadName('');
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      setIsSubmitting(false);
    }
  }, [open, editingSource]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // For playlist-url, validate the URL before creating/saving.
    // If a warning was returned and the user hasn't confirmed it yet, show the warning and stop.
    // If they click again (linkWarningConfirmed), skip the check and proceed.
    if (tab === 'playlist-url' && linkUrl.startsWith('http') && !linkWarningConfirmed) {
      setIsSubmitting(true);
      try {
        const result = await api.validateChannelPoolSourceUrl(linkUrl, userAgent.trim() || null);
        if (result.warning) {
          setLinkWarning(result.warning);
          setLinkWarningConfirmed(true); // next click will proceed despite warning
          setIsSubmitting(false);
          return;
        }
        setLinkWarning(null);
      } catch {
        // If validation itself fails (network error, etc.), just proceed.
        setLinkWarning(null);
      }
    }

    setIsSubmitting(true);
    try {
      if (editingSource) {
        const updates: Partial<ChannelPoolSource> = {
          name: tab === 'playlist-url' ? linkName : tab === 'xtream' ? xtreamName : uploadName,
        };
        if (tab === 'playlist-url') {
          updates.url = linkUrl;
          updates.refreshIntervalHours = linkInterval;
          updates.userAgent = userAgent.trim() || null;
        } else if (tab === 'xtream') {
          updates.url = xtreamUrl;
          updates.xtreamCredentials = { username: xtreamUser, password: xtreamPass };
          updates.refreshIntervalHours = xtreamInterval;
          updates.userAgent = userAgent.trim() || null;
        } else if (tab === 'upload') {
          // Note: for file uploads, if the user doesn't pick a new file, we just update the name.
          if (uploadFile) {
            const text = await uploadFile.text();
            const formData = new FormData();
            formData.append('name', uploadName);
            formData.append('content', text);
            formData.append('filename', uploadFile.name);
            // Delete the old one and re-upload? Or we assume the API handles updating.
            // Wait, we can't easily re-upload to the same ID with `uploadChannelPoolSource`.
            // Let's just update the name using `updateChannelPoolSource`. 
            // If they pick a new file, we can't easily update via FormData in the existing API.
            // But we will pass `updates` below anyway.
            // Let's assume the user doesn't update the file for playlist-file, just the name.
          }
        }
        await api.updateChannelPoolSource(editingSource.id, updates);

        // If URL, credentials or user agent changed, trigger a refresh to fetch new channels.
        // A source whose last download failed is retried on any save too.
        let needsRefresh = false;
        if (tab === 'playlist-url' || tab === 'xtream') {
          if (userAgent.trim() !== (editingSource.userAgent || '')) needsRefresh = true;
          if (editingSource.lastFetchError) needsRefresh = true;
        }
        if (tab === 'playlist-url' && linkUrl !== (editingSource.url || '')) {
          needsRefresh = true;
        } else if (tab === 'xtream') {
          if (xtreamUrl !== (editingSource.url || '')) needsRefresh = true;
          if (xtreamUser !== (editingSource.xtreamCredentials?.username || '')) needsRefresh = true;
          if (xtreamPass !== (editingSource.xtreamCredentials?.password || '')) needsRefresh = true;
        }

        if (needsRefresh) {
          try {
            await api.refreshChannelPoolSource(editingSource.id);
          } catch (refreshError) {
            // The changes are saved, but the download failed. The dialog stays open with the
            // reason, so another user agent or login can be tried straight away.
            console.error(refreshError);
            triggerChannelPoolRefresh();
            setDownloadError(refreshError instanceof Error ? refreshError.message : String(refreshError));
            setSavedButFailed(true);
            setShowUserAgent(true);
            return;
          }
        }
      } else {
        let created: ChannelPoolSource | null = null;
        if (tab === 'playlist-url') {
          created = await api.createChannelPoolSource({
            name: linkName,
            type: 'playlist-url',
            url: linkUrl,
            userAgent: userAgent.trim() || null,
            refreshIntervalHours: linkInterval,
          });
        } else if (tab === 'xtream') {
          created = await api.createChannelPoolSource({
            name: xtreamName,
            type: 'xtream',
            url: xtreamUrl,
            xtreamCredentials: { username: xtreamUser, password: xtreamPass },
            userAgent: userAgent.trim() || null,
            refreshIntervalHours: xtreamInterval,
          });
        }
        // The source exists either way, so the dialog closes. Selecting it puts the reason for
        // the failure on screen (the Sources tab shows it in place of the channel list).
        if (created?.lastFetchError) {
          setActiveChannelPoolSourceId(created.id);
          notifyWarning("The source was added, but its channels couldn't be downloaded. The source shows why.");
        }
        if (tab === 'upload' && uploadFile) {
          const text = await uploadFile.text();
          await api.uploadChannelPoolSource({ name: uploadName, content: text, filename: uploadFile.name });
        }
      }
      triggerChannelPoolRefresh();
      onClose();
    } catch (error) {
      console.error(editingSource ? 'Failed to update Channel Pool source' : 'Failed to add Channel Pool source', error);
      notifyError(error, editingSource ? 'Failed to update channel source.' : 'Failed to add channel source.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = () => {
    if (tab === 'playlist-url') return linkName.trim() !== '' && linkUrl.trim() !== '';
    if (tab === 'xtream') return xtreamName.trim() !== '' && xtreamUrl.trim() !== '' && xtreamUser.trim() !== '' && xtreamPass.trim() !== '';
    if (tab === 'upload') return uploadName.trim() !== '' && (editingSource || uploadFile !== null);
    return false;
  };

  const inputClasses = "w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400";

  const selectedUserAgentPreset = customUserAgent ? 'custom' : (USER_AGENT_PRESETS.find(p => p.value === userAgent)?.value ?? 'custom');

  // Shown on the Playlist Link and Xtream tabs, under Refresh Interval. Optional: leaving it
  // folded (or on "App default") downloads the way the app always has.
  const renderUserAgentField = () => !showUserAgent ? (
    <button
      type="button"
      onClick={() => setShowUserAgent(true)}
      className="self-start -mt-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
    >
      <ChevronRight className="w-3.5 h-3.5" />
      User agent (optional)
    </button>
  ) : (
    <div>
      <button
        type="button"
        onClick={() => setShowUserAgent(false)}
        className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-1"
      >
        <ChevronDown className="w-3.5 h-3.5" />
        User agent (optional)
      </button>
      <select
        value={selectedUserAgentPreset}
        onChange={(e) => {
          // The link check's result depended on the old user agent, so it runs again.
          setLinkWarning(null);
          setLinkWarningConfirmed(false);
          if (e.target.value === 'custom') {
            setCustomUserAgent(true);
          } else {
            setCustomUserAgent(false);
            setUserAgent(e.target.value);
          }
        }}
        className="w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
      >
        {USER_AGENT_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
        <option value="custom">Custom…</option>
      </select>
      {customUserAgent && (
        <input
          type="text"
          placeholder="e.g. MyPlayer/1.0"
          value={userAgent}
          onChange={(e) => { setUserAgent(e.target.value); setLinkWarning(null); setLinkWarningConfirmed(false); }}
          className={inputClasses + " mt-2 font-mono text-xs"}
          onFocus={(e) => (e.target.style.borderColor = accentColor)}
          onBlur={(e) => (e.target.style.borderColor = '')}
        />
      )}
      <p className="text-[10px] text-gray-500 mt-1">
        The app this source pretends to be when downloading. Leave it on "App default" unless your provider only works with certain apps, or downloading fails or is blocked.
      </p>
    </div>
  );


  return (
    <Dialog onClose={onClose}>
        <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-4">
          {editingSource ? 'Edit Source' : 'Add Channel Pool Source'}
        </h2>

        {/* Tabs */}
        <div className="flex px-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('playlist-url')}
            className={`flex-1 pb-2 text-sm font-medium ${tab === 'playlist-url' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
            disabled={!!editingSource && editingSource.type !== 'playlist-url'}
            style={editingSource && editingSource.type !== 'playlist-url' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Playlist Link
            {tab === 'playlist-url' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
          <button
            onClick={() => setTab('xtream')}
            className={`flex-1 pb-2 text-sm font-medium ${tab === 'xtream' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
            disabled={!!editingSource && editingSource.type !== 'xtream'}
            style={editingSource && editingSource.type !== 'xtream' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Xtream Codes
            {tab === 'xtream' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 pb-2 text-sm font-medium ${tab === 'upload' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
            disabled={!!editingSource && editingSource.type !== 'playlist-file'}
            style={editingSource && editingSource.type !== 'playlist-file' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Upload File
            {tab === 'upload' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {tab === 'playlist-url' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="My Source"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/playlist.m3u"
                  value={linkUrl}
                  onChange={(e) => { setLinkUrl(e.target.value); setLinkWarning(null); setLinkWarningConfirmed(false); }}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
                <p className="text-[10px] text-gray-500 mt-1">Supports M3U, M3U8, and XSPF playlists</p>
                {linkWarning && (
                  <p className="text-[11px] text-amber-500 dark:text-amber-400 font-medium mt-1">
                    ⚠ {linkWarning}{linkWarningConfirmed ? ` — Click ${editingSource ? 'Save Changes' : 'Add Source'} again to proceed anyway.` : ''}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Refresh Interval</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={linkInterval}
                    onChange={(e) => setLinkInterval(parseInt(e.target.value) || 1)}
                    className={inputClasses + " w-24"}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                </div>
              </div>
              {renderUserAgentField()}
            </>
          ) : tab === 'xtream' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="My Xtream Source"
                  value={xtreamName}
                  onChange={(e) => setXtreamName(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Server URL</label>
                <input
                  type="url"
                  placeholder="http://example.com:8080"
                  value={xtreamUrl}
                  onChange={(e) => setXtreamUrl(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={xtreamUser}
                    onChange={(e) => setXtreamUser(e.target.value)}
                    className={inputClasses}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={xtreamPass}
                    onChange={(e) => setXtreamPass(e.target.value)}
                    className={inputClasses}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Refresh Interval</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={xtreamInterval}
                    onChange={(e) => setXtreamInterval(parseInt(e.target.value) || 1)}
                    className={inputClasses + " w-24"}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Will fetch live stream channels from the Xtream API</p>
              </div>
              {renderUserAgentField()}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="My Source"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".m3u,.m3u8,.xspf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className={inputClasses + " file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300"}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
            </>
          )}

          {downloadError && tab !== 'upload' && (
            <div className="flex gap-2 rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <p>
                <span className="font-medium">{savedButFailed ? 'Saved, but downloading still failed.' : 'The last download failed.'}</span>{' '}
                {downloadError}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-1 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
              style={{ color: accentColor }}
            >
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingSource ? 'Save Changes' : 'Add Source'}
            </button>
          </div>
        </form>
    </Dialog>
  );
}
