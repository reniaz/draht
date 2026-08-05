import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * A settings screen is only usable once four separate upstream files know about it: the
 * enum, the router, the header, and the back-navigation map. Missing the last one is
 * silent — the screen opens and looks right, and the back arrow closes settings instead of
 * going up a level, which is exactly how it shipped the first time.
 *
 * These are source assertions rather than behavioural ones because there is no Teact
 * component harness here. They cost nothing and they guard the step that gets forgotten.
 */
const SCREENS = ['ModPlugins', 'ModTheme', 'ModPluginList', 'ModGeneral'];

const FILES = {
  enum: 'src/types/index.ts',
  router: 'src/components/left/settings/Settings.tsx',
  header: 'src/components/left/settings/SettingsHeader.tsx',
  back: 'src/components/left/LeftColumn.tsx',
};

function read(file: string) {
  return readFileSync(file, 'utf8');
}

describe('mod settings screens', () => {
  it.each(Object.entries(FILES))('%s knows every mod screen', (_name, file) => {
    const source = read(file);

    for (const screen of SCREENS) {
      expect(source).toContain(screen);
    }
  });

  it('sends the sub-screens back to the Draht menu, not out of settings', () => {
    const source = read(FILES.back);

    // The two sub-screens share one case block, so the parent is whatever the first
    // `openSettingsScreen` after them says.
    const index = source.indexOf('SettingsScreens.ModTheme');
    expect(index).toBeGreaterThan(-1);

    const after = source.slice(index, index + 300);
    expect(after).toContain('SettingsScreens.ModPluginList');
    expect(after).toMatch(/openSettingsScreen\(\{ screen: SettingsScreens\.ModPlugins \}\)/);
  });

  it('sends the Draht menu itself back to the settings root', () => {
    const source = read(FILES.back);

    const index = source.indexOf('case SettingsScreens.ModPlugins:');
    expect(index).toBeGreaterThan(-1);

    const after = source.slice(index, index + 200);
    expect(after).toMatch(/openSettingsScreen\(\{ screen: SettingsScreens\.Main \}\)/);
  });
});
