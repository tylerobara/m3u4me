/**
 * User agents a channel pool source can download with. Some providers only serve requests that
 * look like a known IPTV app or browser, so the source dialog offers these as presets.
 *
 * A source stores the string itself, not a preset name, so changing a string here doesn't
 * change existing sources: they keep the old one and the dialog shows it as "Custom".
 * An empty value is the app's default (no custom header).
 *
 * Where these come from (checked October 2026):
 * - TiviMate: real strings reported by devices on whatmyuseragent.com ("TiviMate/<version> (Android <n>)").
 * - VLC: VLC's own "VLC/<version> LibVLC/<version>" format, with the newest 3.0 release (3.0.24).
 * - Kodi: built the way Kodi's source code builds it (CSysInfo::GetUserAgent) for Kodi 21.3 on
 *   Windows, minus the build's Git date at the end.
 * - Firefox, Chrome, Safari: the browsers' standard formats with their current versions.
 * Televizo and IPTV Smarters were left out: their real strings couldn't be confirmed anywhere,
 * and a guessed string could fail a provider that checks the exact value. Custom… covers them.
 */
export const USER_AGENT_PRESETS: { label: string; value: string }[] = [
  { label: 'App default', value: '' },
  { label: 'TiviMate', value: 'TiviMate/5.3.3 (Android 13)' },
  { label: 'VLC', value: 'VLC/3.0.24 LibVLC/3.0.24' },
  { label: 'Kodi', value: 'Kodi/21.3 (Windows NT 10.0.26100; Win64; x64) App_Bitness/64 Version/21.3-(21.3.0)' },
  { label: 'Firefox', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0' },
  { label: 'Chrome', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36' },
  { label: 'Safari', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15' },
];
