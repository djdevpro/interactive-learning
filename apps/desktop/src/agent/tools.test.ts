import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: () => 'library://localhost/',
}));

const { tools } = await import('./tools');
const { default: catalog } = await import('./tools.json');

describe('the tools of the MCP server', () => {
  it('are all carried out by the studio, and nothing else is', () => {
    const declared = catalog.map((tool) => tool.name).sort();
    expect(Object.keys(tools).sort()).toEqual(declared);
  });

  it('describe themselves for agents', () => {
    for (const tool of catalog) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.inputSchema.type, tool.name).toBe('object');
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      for (const name of required) expect(properties, tool.name).toContain(name);
    }
  });

  it('refuse to act on the browser when no tutorial is open', async () => {
    const host = {
      editor: () => null,
      open: vi.fn(),
      closeEditor: vi.fn(),
      libraryChanged: vi.fn(),
      view: () => 'library' as const,
    };
    await expect(tools.look!({}, { host, agent: 'Claude Code' })).rejects.toThrow(
      'No tutorial is open',
    );
    await expect(tools.click!({ ref: 'e1' }, { host, agent: 'Claude Code' })).rejects.toThrow(
      'No tutorial is open',
    );
  });
});
