import { browser } from 'wxt/browser';
import { RecorderController } from '../lib/recorder-controller';
import { isCommand, type Reply } from '../lib/messages';

export default defineBackground(() => {
  const controller = new RecorderController();

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isCommand(message) || sender.id !== browser.runtime.id) return;
    const task =
      message.type === 'observation'
        ? controller.observe(message, sender.tab?.id, sender.frameId)
        : sender.tab
          ? Promise.reject(new Error('Commande réservée au popup.'))
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
