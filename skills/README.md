# Interactive Learning skill

[`interactive-learning/SKILL.md`](interactive-learning/SKILL.md) teaches an AI agent to build a guide from real screenshots. When Interactive Learning Studio is connected to the agent, the agent makes the tutorial in the studio through its MCP server: it records in the browser of the studio while you watch, and the tutorial stays in your library, where you can come back to it. Otherwise the agent drives its own browser, saves the screenshots and assembles them with the recorder command line tool, which the skill installs on demand through npx.

## Install in one line

From the studio: Settings, then MCP, then Install the skill next to Claude Code or Codex. The same page connects the studio to the agent.

From a terminal, Claude Code reads skills from `~/.claude/skills`.

```sh
npx -y @interactive-learning/recorder skill install --agent claude
```

Codex reads skills from `~/.agents/skills`.

```sh
npx -y @interactive-learning/recorder skill install --agent codex
```

To share the skill with a team through a repository, install it in the project instead, with `--out .claude/skills/interactive-learning` for Claude Code or `--out .agents/skills/interactive-learning` for Codex, then commit the folder.

The command never overwrites an existing folder. To update the skill, delete its folder and run the command again, or update it from the studio. Node.js 22.18 or later is required for the command line.

## Use it

Ask the agent something like "Create an interactive guide that shows how to create a project on http://localhost:3000". Claude Code also lists the skill as `/interactive-learning`.

- **With the studio connected**, the agent finds or creates the site in your library, creates the tutorial, records its clicks as steps in the browser of the studio, writes the texts and markers, and publishes it to the project folder of the site. The library marks the tutorials an agent made, and Settings › MCP lists what each agent did, with a link back to each tutorial.
- **Without the studio**, the agent finds the public folder of your project from its stack and writes the guide there, in `guides/<name>/guide.json` with the screenshots as separate files in `assets/`. The site then shows it with `<interactive-learning src="/guides/<name>/guide.json">`. When it is done, the agent offers to open the guide in the web studio so you can finish it by hand. You can also open it yourself with `npx -y @interactive-learning/recorder studio --guide <public folder>/guides/<name>/guide.json`.

Without the studio, the agent takes the screenshots with the browser built into its harness, such as the browser of Claude Code or Claude in Chrome. Only when the harness has none does it use Playwright, from the project when it already depends on it, or installed in a temporary folder outside the project. You can also record the flow yourself with the browser extension shipped in the recorder package, whose folder `npx -y @interactive-learning/recorder extension path` prints.
