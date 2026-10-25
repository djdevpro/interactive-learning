import { browser } from 'wxt/browser';
import { RecorderController } from '../lib/recorder-controller';
import { CHANNEL, isCommand, type Reply } from '../lib/messages';

export default defineBackground(() => {
  const controller = new RecorderController();

  // Each panel belongs to the tab where the icon was clicked, and hides on other tabs.
  // The click also grants activeTab on that tab. Chrome keeps the panel behavior between
  // sessions, so the global panel of earlier versions is turned off explicitly.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  void browser.sidePanel.setOptions({ enabled: false }).catch(() => {});
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // Both calls stay synchronous: open() needs the click gesture.
    void browser.sidePanel
      .setOptions({
        tabId: tab.id,
        path: `sidepanel.html?tab=${tab.id}`,
        enabled: true,
      })
      .catch(() => {});
    void browser.sidePanel.open({ tabId: tab.id }).catch(() => {});
    // An open panel reads the tab again: the click may have restored access to it.
    void browser.runtime
      .sendMessage({ channel: CHANNEL, type: 'tab-access', tabId: tab.id })
      .catch(() => {});
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isCommand(message) || sender.id !== browser.runtime.id) return;
    const task =
      message.type === 'observation'
        ? controller.observe(message, sender.tab?.id, sender.frameId)
        : sender.tab
          ? Promise.reject(new Error('This command is reserved for the extension panel.'))
          : controller.command(message);
    void task.then(
      (state) => sendResponse({ ok: true, state } satisfies Reply),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies Reply),
    );
    return true;
  });

  const navigation = (details: { tabId: number; frameId: number; url: string }) => {
    if (details.frameId === 0)
      void controller.navigation(details.tabId, details.url).catch(() => {});
  };
  browser.webNavigation.onCompleted.addListener(navigation);
  browser.webNavigation.onHistoryStateUpdated.addListener(navigation);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(navigation);
  browser.tabs.onRemoved.addListener((tabId) => {
    void controller.tabClosed(tabId);
  });
});
