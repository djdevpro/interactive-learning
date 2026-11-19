import { shallowRef } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import catalog from './tools.json';
import { tools } from './tools';
import type { AgentHost, Summary } from './types';
import { isMessageKey, t, type Params } from '../i18n';
import { notify } from '../ui';

/**
 * A sentence of the journal in the language of the interface. A parameter that is itself a key
 * of the catalog, such as the name of an undone action, is written in that language too. Entries
 * of older versions were plain text, kept as they are.
 */
export function summaryText(summary: Summary | string | null | undefined): string {
  if (!summary) return '';
  if (typeof summary === 'string') return summary;
  if (!isMessageKey(summary.key)) return '';
  const params: Params = {};
  for (const [name, value] of Object.entries(summary.params ?? {})) {
    params[name] = isMessageKey(value) ? t(value) : value;
  }
  return t(summary.key, params);
}

interface AgentCall {
  id: number;
  name: string;
  arguments: Record<string, unknown> | null;
  /** The name of the agent, such as Claude Code. */
  agent: string;
}

/** The agent at work, while it calls tools and a few seconds after, for the window to show it. */
export const presence = shallowRef<{ agent: string; tool: string } | null>(null);
const PRESENCE_MS = 12_000;

const readOnly = new Set(
  catalog
    .filter(
      (tool) => (tool as { annotations?: { readOnlyHint?: boolean } }).annotations?.readOnlyHint,
    )
    .map((tool) => tool.name),
);

export function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return typeof cause === 'string' && cause ? cause : 'The studio could not do it.';
}

/**
 * Carries out the tools that agents call through the MCP server of the studio, one at a time, in
 * the order they come, and answers each of them.
 */
export async function startBridge(host: AgentHost): Promise<UnlistenFn> {
  let queue: Promise<unknown> = Promise.resolve();
  let fading: ReturnType<typeof setTimeout> | undefined;

  async function answer(call: AgentCall): Promise<void> {
    clearTimeout(fading);
    presence.value = { agent: call.agent, tool: call.name };
    let reply: Record<string, unknown>;
    try {
      const tool = tools[call.name];
      if (!tool) throw new Error(`The studio has no tool named ${call.name}.`);
      const result = await tool(call.arguments ?? {}, { host, agent: call.agent });
      reply = {
        ok: true,
        data: result.data ?? null,
        images: result.images ?? [],
        summary: result.summary ?? null,
        tutorial: result.tutorial ?? null,
      };
      if (!readOnly.has(call.name)) {
        host.libraryChanged();
        const sentence = summaryText(result.summary);
        if (sentence) notify(`${call.agent} · ${sentence}`);
      }
    } catch (cause) {
      reply = { ok: false, error: messageOf(cause), data: null };
    }
    await invoke('agent_reply', { id: call.id, reply }).catch(() => undefined);
    fading = setTimeout(() => (presence.value = null), PRESENCE_MS);
  }

  const stop = await listen<AgentCall>('agent-call', ({ payload }) => {
    queue = queue.then(() => answer(payload)).catch(() => undefined);
  });
  await invoke('agent_ready');
  return stop;
}
