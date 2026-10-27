/**
 * The studio runs in WebView2 on Windows and in WebKitGTK on Linux. Recording reads pages through
 * the DevTools protocol of WebView2, so only the Windows build records for now.
 */
const onWindows = navigator.userAgent.includes('Windows');

export const canRecord = onWindows;
export const NO_RECORDING = 'Recording works on Windows for now';

/** The bin and the file manager, as the system names them. */
export const bin = onWindows ? 'recycle bin' : 'trash';
export const revealLabel = onWindows ? 'Show in Explorer' : 'Open folder';
