import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import packageMetadata from '../package.json' with { type: 'json' };
import { GuideExporter } from './guide-exporter.js';
import { RecorderError } from './errors.js';
import { RecordingSession } from './recording-session.js';
import {
  agentSkillPath,
  assetAvailable,
  bundledAssetPath,
  installSkill,
} from './bundled-assets.js';

export interface CliOutput {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultOutput: CliOutput = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

const help = {
  name: 'interactive-learning',
  version: packageMetadata.version,
  description: 'Create and edit guides from imported screenshots. This CLI never drives a browser.',
  commands: [
    'create --title <title> --out <guide.json> [--description <text>]',
    'capture add --guide <guide.json> --image <image> [--title <title>] [--description <text>] [--x <0..1> --y <0..1>] [--duration-ms <400..120000>]',
    'capture replace --guide <guide.json> --step <step-id> --image <image>',
    'annotate --guide <guide.json> --step <step-id> --x <0..1> --y <0..1> --title <title> [--body <text>]',
    'validate --guide <guide.json>',
    'export --guide <guide.json> --out <new-directory> [--embed]',
    'extension path',
    'skill path',
    'skill install --agent <claude|codex>',
    'skill install --out <new-directory>',
    'doctor',
  ],
};

type CliValues = Record<string, string | boolean | undefined>;

function options(args: string[], strings: string[], booleans: string[] = []): CliValues {
  const definitions: NonNullable<ParseArgsConfig['options']> = {};
  for (const name of strings) definitions[name] = { type: 'string' };
  for (const name of booleans) definitions[name] = { type: 'boolean' };
  try {
    const parsed = parseArgs({
      args,
      options: definitions,
      strict: true,
      allowPositionals: false,
    }).values;
    const values: CliValues = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) throw new Error(`Option --${name} accepts a single value.`);
      values[name] = value;
    }
    return values;
  } catch (error) {
    throw new RecorderError(
      'INVALID_ARGUMENT',
      error instanceof Error ? error.message : 'Invalid arguments.',
    );
  }
}

function required(values: CliValues, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RecorderError('MISSING_ARGUMENT', `Option --${key} is required.`);
  }
  return value;
}

function optional(values: CliValues, key: string): string | undefined {
  return typeof values[key] === 'string' ? values[key] : undefined;
}

function numeric(values: CliValues, key: string): number {
  const text = required(values, key);
  const number = Number(text);
  if (!Number.isFinite(number))
    throw new RecorderError('INVALID_ARGUMENT', `Option --${key} must be a finite number.`);
  return number;
}

export async function runCli(argv: string[], output: CliOutput = defaultOutput): Promise<number> {
  const print = (result: unknown) => output.stdout(JSON.stringify(result));
  try {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
      print({ ok: true, ...help });
      return 0;
    }
    if (argv[0] === '--version') {
      print({ ok: true, name: help.name, version: help.version });
      return 0;
    }
    const [command, ...args] = argv;
    switch (command) {
      case 'create': {
        const values = options(args, ['title', 'description', 'out']);
        const session = await RecordingSession.create({
          title: required(values, 'title'),
          description: optional(values, 'description'),
          filePath: required(values, 'out'),
        });
        const guide = await session.read();
        print({ ok: true, command: 'create', guidePath: session.guidePath, guideId: guide.id });
        return 0;
      }
      case 'capture': {
        if (args[0] === 'replace') {
          const values = options(args.slice(1), ['guide', 'step', 'image']);
          const session = new RecordingSession(required(values, 'guide'));
          const result = await session.replaceCapture(required(values, 'step'), {
            imagePath: required(values, 'image'),
          });
          print({
            ok: true,
            command: 'capture.replace',
            guidePath: session.guidePath,
            stepId: result.step.id,
            assetId: result.step.assetId,
            cursorCleared: true,
            annotationsRequireReview: result.annotationsRequireReview,
            message: result.annotationsRequireReview
              ? 'Check the annotation positions on the new screenshot.'
              : 'Screenshot replaced.',
          });
          return 0;
        }
        if (args[0] !== 'add')
          throw new RecorderError('UNKNOWN_COMMAND', 'Use capture add or capture replace.');
        const values = options(args.slice(1), [
          'guide',
          'image',
          'title',
          'description',
          'x',
          'y',
          'duration-ms',
        ]);
        const hasX = values.x !== undefined;
        const hasY = values.y !== undefined;
        if (hasX !== hasY)
          throw new RecorderError('INVALID_COORDINATES', 'Provide --x and --y together.');
        const session = new RecordingSession(required(values, 'guide'));
        const step = await session.addCapture({
          imagePath: required(values, 'image'),
          title: optional(values, 'title'),
          description: optional(values, 'description'),
          ...(values['duration-ms'] !== undefined
            ? { durationMs: numeric(values, 'duration-ms') }
            : {}),
          ...(hasX
            ? {
                cursor: {
                  x: numeric(values, 'x'),
                  y: numeric(values, 'y'),
                  action: 'click' as const,
                },
              }
            : {}),
        });
        print({
          ok: true,
          command: 'capture.add',
          guidePath: session.guidePath,
          stepId: step.id,
          assetId: step.assetId,
        });
        return 0;
      }
      case 'annotate': {
        const values = options(args, ['guide', 'step', 'x', 'y', 'title', 'body']);
        const session = new RecordingSession(required(values, 'guide'));
        const stepId = required(values, 'step');
        const annotation = await session.addAnnotation(stepId, {
          x: numeric(values, 'x'),
          y: numeric(values, 'y'),
          title: required(values, 'title'),
          body: optional(values, 'body'),
        });
        print({
          ok: true,
          command: 'annotate',
          guidePath: session.guidePath,
          stepId,
          annotationId: annotation.id,
        });
        return 0;
      }
      case 'validate': {
        const values = options(args, ['guide']);
        const session = new RecordingSession(required(values, 'guide'));
        const guide = await session.validate();
        print({
          ok: true,
          command: 'validate',
          valid: true,
          guidePath: session.guidePath,
          stepCount: guide.steps.length,
          assetCount: guide.assets.length,
        });
        return 0;
      }
      case 'export': {
        const values = options(args, ['guide', 'out'], ['embed']);
        const exporter = new GuideExporter(required(values, 'guide'));
        const result = await exporter.export({
          outDirectory: required(values, 'out'),
          embed: values.embed === true,
        });
        print({ ok: true, command: 'export', ...result });
        return 0;
      }
      case 'doctor': {
        options(args, []);
        const [major, minor] = process.versions.node.split('.').map(Number);
        const nodeSupported = major > 22 || (major === 22 && minor >= 18);
        print({
          ok: nodeSupported,
          command: 'doctor',
          version: help.version,
          node: process.versions.node,
          nodeSupported,
          skillAvailable: await assetAvailable(resolve(bundledAssetPath('skill'), 'SKILL.md')),
          extensionAvailable: await assetAvailable(
            resolve(bundledAssetPath('extension'), 'manifest.json'),
          ),
          capabilities: {
            importImages: true,
            annotate: true,
            export: true,
            browserAutomation: false,
          },
          browser:
            "Screenshots come from the companion extension or from your agent's own browser tools.",
        });
        return nodeSupported ? 0 : 1;
      }
      case 'extension':
      case 'skill': {
        if (args[0] === 'path') {
          options(args.slice(1), []);
          const path = bundledAssetPath(command);
          const marker = command === 'skill' ? 'SKILL.md' : 'manifest.json';
          const available = await assetAvailable(resolve(path, marker));
          print({ ok: available, command: `${command}.path`, path, available });
          return available ? 0 : 1;
        }
        if (command === 'skill' && args[0] === 'install') {
          const values = options(args.slice(1), ['out', 'agent']);
          const agent = optional(values, 'agent');
          if (agent && values.out !== undefined) {
            throw new RecorderError('INVALID_ARGUMENT', 'Use either --agent or --out.');
          }
          const path = await installSkill(
            bundledAssetPath('skill'),
            agent ? agentSkillPath(agent) : required(values, 'out'),
          );
          print({ ok: true, command: 'skill.install', path });
          return 0;
        }
        throw new RecorderError(
          'UNKNOWN_COMMAND',
          command === 'skill'
            ? 'Use skill path, skill install --agent <claude|codex> or skill install --out <new-directory>.'
            : 'Use extension path.',
        );
      }
      default:
        throw new RecorderError(
          'UNKNOWN_COMMAND',
          `Unknown command "${command}". Run --help to list the commands.`,
        );
    }
  } catch (error) {
    const code = error instanceof RecorderError ? error.code : 'RECORDER_ERROR';
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    output.stderr(JSON.stringify({ ok: false, error: { code, message } }));
    return 1;
  }
}
