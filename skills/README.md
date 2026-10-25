# Interactive Learning skill

[`interactive-learning/SKILL.md`](interactive-learning/SKILL.md) teaches an AI agent to build a guide from real screenshots. The agent drives its own browser, saves the screenshots and assembles them with the recorder command line tool. The skill installs that tool on demand through npx, so the user installs nothing beforehand.

## Install in one line

Claude Code reads skills from `~/.claude/skills`.

```sh
npx -y @interactive-learning/recorder skill install --agent claude
```

Codex reads skills from `~/.agents/skills`.

```sh
npx -y @interactive-learning/recorder skill install --agent codex
```

To share the skill with a team through a repository, install it in the project instead, with `--out .claude/skills/interactive-learning` for Claude Code or `--out .agents/skills/interactive-learning` for Codex, then commit the folder.

The command never overwrites an existing folder. To update the skill, delete its folder and run the command again. Node.js 22.18 or later is required.

## Use it

Ask the agent something like "Create an interactive guide that shows how to create a project on http://localhost:3000". Claude Code also lists the skill as `/interactive-learning`. The agent finds the public folder of your project from its stack and writes the guide there, in `guides/<name>/guide.json` with the screenshots as separate files in `assets/`. The site then shows it with `<interactive-learning src="/guides/<name>/guide.json">`. When it is done, the agent offers to open the guide in the studio so you can finish it by hand. You can also open it yourself with `npx -y @interactive-learning/recorder studio --guide <public folder>/guides/<name>/guide.json`.

The agent takes the screenshots with the browser built into its harness, such as the browser of Claude Code or Claude in Chrome. Only when the harness has none does it use Playwright, from the project when it already depends on it, or installed in a temporary folder outside the project. You can also record the flow yourself with the browser extension shipped in the recorder package, whose folder `npx -y @interactive-learning/recorder extension path` prints.
