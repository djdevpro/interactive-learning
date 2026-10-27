/**
 * The studio runs in WebView2 on Windows and in WebKitGTK on Linux. Recording reads pages straight
 * from either engine, through the DevTools protocol of WebView2 and the API of WebKitGTK.
 */
const onWindows = navigator.userAgent.includes('Windows');
const onLinux = navigator.userAgent.includes('Linux');

export const canRecord = onWindows || onLinux;
export const NO_RECORDING = 'Recording works on Windows and Linux';

/** The bin and the file manager, as the system names them. */
export const bin = onWindows ? 'recycle bin' : 'trash';
export const revealLabel = onWindows ? 'Show in Explorer' : 'Open folder';
