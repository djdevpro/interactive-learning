import type { GuideDocument } from '@interactive-learning/protocol';
import type { MessageKey, Params } from '../i18n';
import type { SiteEntry, ThemeEntry } from '../library';
import type { Capture } from '../recording';

/** What the editor of a tutorial lets an AI agent do, the way the creator does it. */
export interface EditorAgent {
  /** `site/theme/tutorial`, the tutorial being edited. */
  path: string;
  guide(): GuideDocument | null;
  site(): SiteEntry | null;
  theme(): ThemeEntry | null;
  /** Applies a change, saved on its own and undoable like any other. */
  change(next: GuideDocument, label: MessageKey): void;
  select(stepId: string | null): void;
  show(view: 'canvas' | 'recorder'): void;
  stage(): 'canvas' | 'player' | 'recorder';
  /** Opens an address in the browser of the studio; refuses one it cannot open. */
  navigate(url: string): Promise<string>;
  page(): { url: string; loading: boolean } | null;
  recording(): boolean;
  record(on: boolean): Promise<void>;
  /** A new picture of the page now, so the next click records the screen as it is. */
  renew(): Promise<void>;
  /** Resolves once the steps recorded so far are in the tutorial. */
  idle(): Promise<void>;
  /** A full-page screenshot saved in the tutorial. */
  capture(): Promise<Capture>;
  undo(): string | undefined;
  flush(): Promise<void>;
  publish(): Promise<string>;
  exportTo(target: string): Promise<void>;
  play(fromMs: number): void;
  /** Reads the site and theme of the tutorial again, after an agent changed them. */
  refresh(): Promise<void>;
}

/** What the window of the studio lets an agent do: open a tutorial, leave it, show changes. */
export interface AgentHost {
  editor(): EditorAgent | null;
  /** Opens a tutorial in the editor and resolves once it is ready. */
  open(path: string, mode: 'record' | 'edit'): Promise<EditorAgent>;
  closeEditor(): Promise<void>;
  /** The library changed: the screen that shows it reads it again. */
  libraryChanged(): void;
  view(): 'library' | 'settings' | 'editor';
}

export interface AgentContext {
  host: AgentHost;
  /** The name of the agent, such as Claude Code. */
  agent: string;
}

export interface ToolResult {
  /** What the agent reads back, as JSON. */
  data: unknown;
  /** Pictures for the agent, as data URIs. */
  images?: string[];
  /** One sentence for the journal of Settings › MCP, written in the language of the studio. */
  summary?: Summary;
  /** The tutorial the tool worked on, which the journal links to. */
  tutorial?: string | null;
}

/** A sentence of the catalog with its parameters, so the journal reads in the language of the day. */
export interface Summary {
  key: MessageKey;
  params?: Params;
}

export type ToolArgs = Record<string, unknown>;
export type Tool = (args: ToolArgs, context: AgentContext) => Promise<ToolResult>;
