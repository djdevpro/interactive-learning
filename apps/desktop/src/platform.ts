import { t } from './i18n';

/**
 * The studio runs in WebView2 on Windows and in WebKitGTK on Linux. Recording reads pages straight
 * from either engine, through the DevTools protocol of WebView2 and the API of WebKitGTK.
 */
const onWindows = navigator.userAgent.includes('Windows');
const onLinux = navigator.userAgent.includes('Linux');

export const canRecord = onWindows || onLinux;
export const noRecording = () => t('system.noRecording');

/** The bin and the file manager, as the system names them. */
export const bin = () => t(onWindows ? 'system.binWindows' : 'system.binLinux');
export const revealLabel = () => t(onWindows ? 'system.revealWindows' : 'system.revealLinux');
