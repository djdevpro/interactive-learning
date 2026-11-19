import { invoke } from '@tauri-apps/api/core';
import { createGuide, type GuideDocument } from '@interactive-learning/protocol';
import {
  addMarker,
  clampDuration,
  editMarker,
  moveMarker,
  moveStep,
  removeMarker,
  removeStep,
  stepStarts,
  updateStep,
} from '../editing';
import { THEME_COLORS, library, partsOf, tutorialStatus, type ThemeColor } from '../library';
import { isMessageKey, t, type MessageKey } from '../i18n';
import { canRecord, noRecording } from '../platform';
import { describeGuide, describeStep, markerAt, pointOf, pointedStep, stepAt } from './steps';
import type { AgentContext, EditorAgent, Summary, Tool, ToolArgs } from './types';

/** Where the agent script points in the window, in CSS pixels, and what it found there. */
interface Target {
  x: number;
  y: number;
  name: string;
  role: string;
  covered_by?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function text(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function required(args: ToolArgs, key: string): string {
  const value = text(args, key)?.trim();
  if (!value) throw new Error(`${key} is missing.`);
  return value;
}

function editorOf(context: AgentContext): EditorAgent {
  const editor = context.host.editor();
  if (editor) return editor;
  throw new Error(
    'No tutorial is open. Call create_tutorial or open_tutorial first: the browser of the studio lives in its editor.',
  );
}

function guideOf(editor: EditorAgent): GuideDocument {
  const guide = editor.guide();
  if (guide) return guide;
  throw new Error('The tutorial is still opening. Call the tool again in a moment.');
}

function notRecording(editor: EditorAgent): void {
  if (editor.recording()) {
    throw new Error('The studio is recording, in its Site view. Call stop_recording first.');
  }
}

/** Shows the browser, and waits for the page to stand over its frame. */
async function showSite(editor: EditorAgent): Promise<void> {
  if (editor.stage() !== 'recorder') {
    editor.show('recorder');
    await sleep(400);
  }
  if (!/^https?:\/\//.test(editor.page()?.url ?? '')) {
    throw new Error('No page is open in the browser of the studio. Call open_page first.');
  }
}

/**
 * Waits for the page after an action that may leave it: until a load it started ends, or a
 * quiet moment when nothing loads, such as a change of view in a single-page application.
 */
async function settle(editor: EditorAgent, quiet = 700, limit = 15_000): Promise<void> {
  const start = Date.now();
  let loaded = false;
  while (Date.now() - start < limit) {
    if (editor.page()?.loading) loaded = true;
    else if (loaded || Date.now() - start >= quiet) break;
    await sleep(100);
  }
  await sleep(250);
}

const where = () => invoke<Record<string, unknown>>('site_where').catch(() => null);

function lastStep(guide: GuideDocument) {
  const index = guide.steps.length - 1;
  const step = guide.steps[index];
  return step ? describeStep(guide, step, index) : null;
}

function changeStep(
  editor: EditorAgent,
  number: unknown,
  edit: (step: GuideDocument['steps'][number]) => GuideDocument['steps'][number],
  label: MessageKey,
) {
  const guide = guideOf(editor);
  const { step, index } = stepAt(guide, number);
  editor.change(updateStep(guide, step.id, edit), label);
  const next = guideOf(editor);
  return { index, step: describeStep(next, next.steps[index] ?? step, index) };
}

export const tools: Record<string, Tool> = {
  async studio_status(_args, context) {
    const info = await invoke<{ version: string; library: string }>('app_info');
    const editor = context.host.editor();
    const guide = editor?.guide();
    return {
      data: {
        version: info.version,
        library: info.library,
        view: context.host.view(),
        open: editor
          ? {
              tutorial: editor.path,
              title: guide?.title ?? '',
              steps: guide?.steps.length ?? 0,
              recording: editor.recording(),
              view: editor.stage(),
              page: editor.page()?.url ?? null,
              site: editor.site()?.name ?? null,
              publishes_to: editor.site()?.publishTo ?? null,
            }
          : null,
        can_record: canRecord,
      },
    };
  },

  async list_library(_args, context) {
    const sites = await library.scan();
    return {
      data: {
        library: await library.root(),
        open: context.host.editor()?.path ?? null,
        sites: sites.map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          publish_to: site.publishTo,
          themes: site.themes.map((theme) => ({
            id: theme.id,
            name: theme.name,
            color: theme.color,
            tutorials: theme.tutorials.map((tutorial) => ({
              path: tutorial.path,
              title: tutorial.title,
              steps: tutorial.steps,
              duration_ms: tutorial.durationMs,
              status: tutorialStatus(tutorial),
              updated_at: tutorial.updatedAt,
              published_at: tutorial.publishedAt,
              made_by: tutorial.agent,
            })),
          })),
        })),
      },
    };
  },

  async create_site(args) {
    const name = required(args, 'name');
    const address = required(args, 'address');
    const publishTo = text(args, 'publish_to')?.trim() || null;
    const site = await library.saveSite({ name, address, publishTo });
    const general = t('library.generalTheme');
    const theme = await library.saveTheme(site, { name: general, color: 'blue' });
    return {
      data: { site, themes: [{ id: theme, name: general }], address, publish_to: publishTo },
      summary: { key: 'activity.createdSite', params: { name } },
    };
  },

  async update_site(args, context) {
    const id = required(args, 'site');
    const site = (await library.scan()).find((entry) => entry.id === id);
    if (!site) throw new Error(`There is no site ${id}. list_library gives the ids of the sites.`);
    const name = text(args, 'name')?.trim() || site.name;
    const address = text(args, 'address')?.trim() ?? site.address;
    const publishTo =
      args.publish_to === undefined ? site.publishTo : text(args, 'publish_to')?.trim() || null;
    const editor = context.host.editor();
    // A new name renames the folder of the site, under the tutorial open in the editor.
    if (editor && partsOf(editor.path).site === site.id && name !== site.name) {
      await context.host.closeEditor();
    }
    const saved = await library.saveSite({ id: site.id, name, address, publishTo });
    await context.host.editor()?.refresh();
    return {
      data: { site: saved, name, address, publish_to: publishTo },
      summary: { key: 'activity.updatedSite', params: { name } },
    };
  },

  async create_theme(args) {
    const id = required(args, 'site');
    const name = required(args, 'name');
    const site = (await library.scan()).find((entry) => entry.id === id);
    if (!site) throw new Error(`There is no site ${id}. list_library gives the ids of the sites.`);
    const wanted = text(args, 'color') as ThemeColor | undefined;
    const used = new Set(site.themes.map((theme) => theme.color));
    const color =
      wanted && THEME_COLORS.includes(wanted)
        ? wanted
        : (THEME_COLORS.find((candidate) => !used.has(candidate)) ?? 'blue');
    const theme = await library.saveTheme(site.id, { name, color });
    return {
      data: { site: site.id, theme, color },
      summary: { key: 'activity.createdTheme', params: { name } },
    };
  },

  async create_tutorial(args, context) {
    const id = required(args, 'site');
    const title = required(args, 'title');
    const site = (await library.scan()).find((entry) => entry.id === id);
    if (!site) throw new Error(`There is no site ${id}. list_library gives the ids of the sites.`);
    let theme = text(args, 'theme')?.trim();
    if (theme && !site.themes.some((entry) => entry.id === theme)) {
      const names = site.themes.map((entry) => entry.id).join(', ') || 'none yet';
      throw new Error(`The site ${site.name} has no theme ${theme}. Its themes: ${names}.`);
    }
    theme ||=
      site.themes[0]?.id ??
      (await library.saveTheme(site.id, { name: t('library.generalTheme'), color: 'blue' }));
    const guide = createGuide(title, text(args, 'description')?.trim() ?? '');
    const path = await library.createTutorial(site.id, theme, guide, context.agent);
    const editor = await context.host.open(path, 'record');
    await settle(editor, 800, 20_000);
    return {
      data: {
        tutorial: path,
        site: site.id,
        theme,
        page: editor.page()?.url ?? null,
        next: editor.page()
          ? 'The browser shows the site. open_page on the first page of the flow if needed, then start_recording.'
          : 'The site has no address. Call open_page, then start_recording.',
      },
      summary: { key: 'activity.createdTutorial', params: { title } },
      tutorial: path,
    };
  },

  async open_tutorial(args, context) {
    const path = required(args, 'path');
    const editor = await context.host.open(path, 'edit');
    const guide = guideOf(editor);
    return {
      data: {
        tutorial: path,
        title: guide.title,
        steps: guide.steps.length,
        page: editor.page()?.url ?? null,
      },
      summary: { key: 'activity.openedTutorial', params: { title: guide.title } },
      tutorial: path,
    };
  },

  async read_tutorial(args, context) {
    const path = text(args, 'path')?.trim();
    const editor = context.host.editor();
    if (path && editor?.path !== path) {
      return { data: describeGuide(await library.readTutorial(path), path), tutorial: path };
    }
    const open = editorOf(context);
    return { data: describeGuide(guideOf(open), open.path), tutorial: open.path };
  },

  async update_tutorial(args, context) {
    const editor = editorOf(context);
    const guide = guideOf(editor);
    const title = text(args, 'title')?.trim() || guide.title;
    const description = text(args, 'description')?.trim() ?? guide.description;
    editor.change({ ...guide, title, description }, 'history.renameTutorial');
    return {
      data: { title, description },
      summary: { key: 'activity.renamedTutorial', params: { title } },
      tutorial: editor.path,
    };
  },

  async open_page(args, context) {
    const url = required(args, 'url');
    const editor = editorOf(context);
    editor.show('recorder');
    await editor.navigate(url);
    await settle(editor, 0, 20_000);
    const page = await where();
    return {
      data: { ...page, still_loading: Boolean(editor.page()?.loading) },
      summary: { key: 'activity.openedPage', params: { url } },
      tutorial: editor.path,
    };
  },

  async look(args, context) {
    const editor = editorOf(context);
    await showSite(editor);
    const { image, ...page } = await invoke<Record<string, unknown> & { image?: string }>(
      'site_look',
      { screenshot: args.screenshot !== false },
    );
    return {
      data: { ...page, recording: editor.recording(), steps: guideOf(editor).steps.length },
      images: image ? [image] : [],
    };
  },

  async click(args, context) {
    const ref = required(args, 'ref');
    const editor = editorOf(context);
    await showSite(editor);
    let target = await invoke<Target>('site_target', { target: ref });
    const recording = editor.recording();
    const before = guideOf(editor).steps.length;
    if (recording) {
      // The step shows the screen just before the click: the page as it is now, and the point
      // where the element stands once the picture is taken.
      await editor.renew();
      target = await invoke<Target>('site_target', { target: ref });
    }
    await invoke('site_click', { x: target.x, y: target.y });
    let step = null;
    if (recording) {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline && (editor.guide()?.steps.length ?? 0) <= before)
        await sleep(100);
      await editor.idle();
      const guide = guideOf(editor);
      if (guide.steps.length > before) step = lastStep(guide);
    }
    await settle(editor);
    const name = target.name || target.role;
    return {
      data: {
        clicked: name,
        ...(target.covered_by
          ? {
              warning: `“${target.covered_by}” covered the element, so the click may have reached it instead.`,
            }
          : {}),
        ...(recording
          ? {
              step:
                step ??
                'No step was recorded: the studio did not see the click. Look, then try again.',
            }
          : {}),
        page: await where(),
      },
      summary: (step
        ? { key: 'activity.recordedStep', params: { number: step.number, title: step.title } }
        : { key: 'activity.clicked', params: { name } }) satisfies Summary as Summary,
      tutorial: editor.path,
    };
  },

  async type_text(args, context) {
    const ref = required(args, 'ref');
    const value = text(args, 'text');
    if (value === undefined) throw new Error('text is missing.');
    const editor = editorOf(context);
    await showSite(editor);
    const submit = args.submit === true;
    const result = await invoke<Record<string, unknown>>('site_type', {
      target: ref,
      text: value,
      submit,
    });
    if (submit) await settle(editor);
    // The journal never keeps what was typed.
    return {
      data: { ...result, page: await where() },
      summary: { key: submit ? 'activity.filledAndSubmitted' : 'activity.filled' },
      tutorial: editor.path,
    };
  },

  async press_key(args, context) {
    const key = required(args, 'key');
    const editor = editorOf(context);
    await showSite(editor);
    const result = await invoke<Record<string, unknown>>('site_key', { key });
    await settle(editor, 500);
    return {
      data: { ...result, page: await where() },
      summary: { key: 'activity.pressed', params: { key } },
      tutorial: editor.path,
    };
  },

  async scroll(args, context) {
    const editor = editorOf(context);
    await showSite(editor);
    const by = Number(args.by);
    const page = await invoke<Record<string, unknown>>('site_scroll', {
      target: text(args, 'ref')?.trim() || null,
      to: text(args, 'to') ?? null,
      by: Number.isFinite(by) ? by : null,
    });
    await sleep(300);
    return { data: page, summary: { key: 'activity.scrolled' }, tutorial: editor.path };
  },

  async go_back(_args, context) {
    const editor = editorOf(context);
    await showSite(editor);
    await invoke('site_history', { action: 'back' });
    await settle(editor);
    return { data: await where(), summary: { key: 'activity.wentBack' }, tutorial: editor.path };
  },

  async start_recording(_args, context) {
    if (!canRecord) throw new Error(`${noRecording()}.`);
    const editor = editorOf(context);
    await editor.record(true);
    if (!editor.recording()) {
      throw new Error('The studio could not start recording. Open a page with open_page first.');
    }
    return {
      data: {
        recording: true,
        steps: guideOf(editor).steps.length,
        page: editor.page()?.url ?? null,
      },
      summary: { key: 'activity.startedRecording' },
      tutorial: editor.path,
    };
  },

  async stop_recording(_args, context) {
    const editor = editorOf(context);
    await editor.record(false);
    await editor.idle();
    const guide = guideOf(editor);
    return {
      data: { recording: false, steps: guide.steps.length, last_step: lastStep(guide) },
      summary: { key: 'activity.stoppedRecording', params: { count: guide.steps.length } },
      tutorial: editor.path,
    };
  },

  async capture_step(args, context) {
    if (!canRecord) throw new Error(`${noRecording()}.`);
    const editor = editorOf(context);
    await showSite(editor);
    const ref = text(args, 'ref')?.trim();
    const target = ref ? await invoke<Target>('site_target', { target: ref }) : null;
    if (target) await sleep(150);
    const shot = await editor.capture();
    const next = pointedStep(guideOf(editor), shot, target, {
      title: text(args, 'title'),
      text: text(args, 'text'),
      markerTitle: text(args, 'marker_title') ?? target?.name,
      markerText: text(args, 'marker_text'),
    });
    editor.change(next, 'history.captureStep');
    const step = lastStep(next);
    if (next.steps.at(-1)) editor.select(next.steps.at(-1)!.id);
    return {
      data: { step },
      summary: {
        key: 'activity.capturedStep',
        params: { number: step?.number ?? next.steps.length, title: step?.title ?? '' },
      },
      tutorial: editor.path,
    };
  },

  async update_step(args, context) {
    const editor = editorOf(context);
    const title = text(args, 'title');
    const body = text(args, 'text');
    const duration = args.duration_ms === undefined ? undefined : Number(args.duration_ms);
    const transition =
      args.transition === 'fade' || args.transition === 'cut' ? args.transition : undefined;
    if (duration !== undefined && !Number.isFinite(duration))
      throw new Error('duration_ms is a number of milliseconds.');
    const { index, step } = changeStep(
      editor,
      args.step,
      (current) => ({
        ...current,
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(body !== undefined ? { description: body.trim() } : {}),
        ...(duration !== undefined ? { durationMs: clampDuration(duration) } : {}),
        ...(transition ? { transition } : {}),
      }),
      'history.editStep',
    );
    return {
      data: { step },
      summary: { key: 'activity.editedStep', params: { number: index + 1, title: step.title } },
      tutorial: editor.path,
    };
  },

  async add_marker(args, context) {
    const editor = editorOf(context);
    const point = pointOf(args.x, args.y);
    const title = required(args, 'title');
    const { index, step } = changeStep(
      editor,
      args.step,
      (current) => {
        const added = addMarker(current, point);
        return editMarker(added.step, added.id, { title, body: text(args, 'text')?.trim() ?? '' });
      },
      'history.addMarker',
    );
    return {
      data: { step },
      summary: { key: 'activity.addedMarker', params: { title, number: index + 1 } },
      tutorial: editor.path,
    };
  },

  async update_marker(args, context) {
    const editor = editorOf(context);
    const guide = guideOf(editor);
    const found = stepAt(guide, args.step);
    const { marker } = markerAt(found.step, args.marker, found.index + 1);
    const title = text(args, 'title');
    const body = text(args, 'text');
    const moves = args.x !== undefined || args.y !== undefined;
    const point = moves ? pointOf(args.x ?? marker.x, args.y ?? marker.y) : null;
    const { index, step } = changeStep(
      editor,
      args.step,
      (current) => {
        let edited = editMarker(current, marker.id, {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(body !== undefined ? { body: body.trim() } : {}),
        });
        if (point) edited = moveMarker(edited, marker.id, point);
        return edited;
      },
      'history.editMarker',
    );
    return {
      data: { step },
      summary: { key: 'activity.editedMarker', params: { number: index + 1 } },
      tutorial: editor.path,
    };
  },

  async remove_marker(args, context) {
    const editor = editorOf(context);
    const guide = guideOf(editor);
    const found = stepAt(guide, args.step);
    const { marker } = markerAt(found.step, args.marker, found.index + 1);
    const { index, step } = changeStep(
      editor,
      args.step,
      (current) => removeMarker(current, marker.id),
      'history.deleteMarker',
    );
    return {
      data: { step },
      summary: { key: 'activity.removedMarker', params: { number: index + 1 } },
      tutorial: editor.path,
    };
  },

  async move_step(args, context) {
    const editor = editorOf(context);
    const guide = guideOf(editor);
    const { index } = stepAt(guide, args.step);
    const to = Number(args.to) - 1;
    if (!Number.isInteger(to) || to < 0 || to >= guide.steps.length) {
      throw new Error(`to is a step number from 1 to ${guide.steps.length}.`);
    }
    editor.change(moveStep(guide, index, to), 'history.moveStep');
    const next = guideOf(editor);
    return {
      data: {
        steps: next.steps.map((step, position) => ({ number: position + 1, title: step.title })),
      },
      summary: { key: 'activity.movedStep', params: { from: index + 1, to: to + 1 } },
      tutorial: editor.path,
    };
  },

  async delete_step(args, context) {
    const editor = editorOf(context);
    const guide = guideOf(editor);
    const { step, index } = stepAt(guide, args.step);
    editor.change(removeStep(guide, step.id), 'history.deleteStep');
    const next = guideOf(editor);
    editor.select(next.steps[Math.min(index, next.steps.length - 1)]?.id ?? null);
    return {
      data: { deleted: index + 1, steps: next.steps.length },
      summary: { key: 'activity.deletedStep', params: { number: index + 1, title: step.title } },
      tutorial: editor.path,
    };
  },

  async undo(_args, context) {
    const editor = editorOf(context);
    const label = editor.undo();
    return {
      data: {
        undone: label && isMessageKey(label) ? t(label) : (label ?? null),
        steps: guideOf(editor).steps.length,
      },
      summary: label
        ? { key: 'activity.undid', params: { action: label } }
        : { key: 'activity.nothingToUndo' },
      tutorial: editor.path,
    };
  },

  async show_step(args, context) {
    const editor = editorOf(context);
    notRecording(editor);
    const guide = guideOf(editor);
    const { step, index } = stepAt(guide, args.step);
    editor.show('canvas');
    editor.select(step.id);
    // The canvas draws the screenshot and its markers before the picture is taken.
    await sleep(700);
    const image = await invoke<string>('studio_snapshot');
    return {
      data: { step: describeStep(guide, step, index) },
      images: [image],
      tutorial: editor.path,
    };
  },

  async play_tutorial(args, context) {
    const editor = editorOf(context);
    notRecording(editor);
    const guide = guideOf(editor);
    if (!guide.steps.length) throw new Error('The tutorial has no step to play yet.');
    const from = args.from_step === undefined ? 0 : stepAt(guide, args.from_step).index;
    editor.play(stepStarts(guide).starts[from] ?? 0);
    return {
      data: { playing: true, from_step: from + 1, duration_ms: stepStarts(guide).total },
      tutorial: editor.path,
    };
  },

  async publish_tutorial(args, context) {
    const path = text(args, 'path')?.trim();
    const editor = context.host.editor();
    let destination: string;
    if (path && editor?.path !== path) destination = await library.publish(path);
    else destination = await editorOf(context).publish();
    const published = path || editor?.path || null;
    return {
      data: { tutorial: published, published_to: destination },
      summary: { key: 'activity.published', params: { folder: destination } },
      tutorial: published,
    };
  },

  async export_tutorial(args, context) {
    const target = required(args, 'target');
    if (!/\.zip$/i.test(target)) throw new Error('target is a path that ends in .zip.');
    const path = text(args, 'path')?.trim();
    const open = context.host.editor();
    if (path && open?.path !== path) await library.exportZip(path, target);
    else await editorOf(context).exportTo(target);
    const exported = path || open?.path || null;
    return {
      data: { tutorial: exported, archive: target },
      summary: { key: 'activity.exported', params: { file: target } },
      tutorial: exported,
    };
  },
};
