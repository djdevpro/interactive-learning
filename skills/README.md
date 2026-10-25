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

Ask the agent something like "Create an interactive guide that shows how to create a project on http://localhost:3000". Claude Code also lists the skill as `/interactive-learning`.

The agent needs a browser tool that can save screenshots as files, such as Claude in Chrome. Without one, record the flow with the browser extension shipped in the recorder package. `npx -y @interactive-learning/recorder extension path` prints its folder.
