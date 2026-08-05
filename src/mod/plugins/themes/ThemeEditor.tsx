import type { FC } from '../../../lib/teact/teact';
import { useEffect, useState } from '../../../lib/teact/teact';

import type { ThemeSeed } from './themes';

import { getSettingValue, setSettingValue } from '../../api/Settings';
import { DEFAULT_SEED, SEED_LABELS } from './themes';
import { apply, getAvailableThemes, loadFileThemes } from './index';
import { stringifyTheme } from './themeFile';

import Button from '../../../components/ui/Button';

import './ThemeEditor.scss';

function parseSeed(raw: string): ThemeSeed {
  try {
    // Merge over the default so a partial or older saved seed still yields every key.
    return { ...DEFAULT_SEED, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SEED;
  }
}

/**
 * Picks the active theme and edits the custom one.
 *
 * The list is built at render time rather than declared as a fixed SELECT, because it
 * grows with whatever JSON files are in the themes folder.
 */
const ThemeEditor: FC = () => {
  const [, forceUpdate] = useState(0);
  const [themesPath, setThemesPath] = useState<string | undefined>();

  const selected = String(getSettingValue('Themes', 'theme') ?? 'off');
  const seed = parseSeed(String(getSettingValue('Themes', 'customSeed') ?? ''));

  useEffect(() => {
    void window.draht?.themesDir?.().then(setThemesPath);
  }, []);

  function rerender() {
    forceUpdate((v) => v + 1);
  }

  function select(id: string) {
    setSettingValue('Themes', 'theme', id);
    apply();
    rerender();
  }

  function updateColour(key: keyof ThemeSeed, colour: string) {
    setSettingValue('Themes', 'customSeed', JSON.stringify({ ...seed, [key]: colour }));
    // Editing a colour implies you want to see it.
    if (selected !== 'custom') setSettingValue('Themes', 'theme', 'custom');
    apply();
    rerender();
  }

  function startFrom(from: ThemeSeed) {
    setSettingValue('Themes', 'customSeed', JSON.stringify(from));
    setSettingValue('Themes', 'theme', 'custom');
    apply();
    rerender();
  }

  async function refresh() {
    await loadFileThemes();
    apply();
    rerender();
  }

  function exportTheme() {
    const blob = new Blob([stringifyTheme('My theme', seed)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-theme.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const available = getAvailableThemes();

  return (
    <div className="draht-theme-editor">
      <div className="draht-theme-list">
        <div
          className={`draht-theme-row${selected === 'off' ? ' draht-theme-row-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => select('off')}
        >
          <span>Off — use Telegram&apos;s own colours</span>
          {selected === 'off' && <span className="draht-theme-tick">✓</span>}
        </div>

        {available.map((theme) => (
          <div
            key={theme.id}
            className={`draht-theme-row${selected === theme.id ? ' draht-theme-row-active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => select(theme.id)}
          >
            <span className="draht-theme-swatches">
              {(['background', 'surface', 'accent', 'text'] as const).map((key) => (
                <i key={key} style={`background:${theme.seed[key]}`} />
              ))}
            </span>
            <span className="draht-theme-name">{theme.label}</span>
            {theme.id.startsWith('file:') && <span className="draht-theme-badge">file</span>}
            {selected === theme.id && <span className="draht-theme-tick">✓</span>}
          </div>
        ))}

        <div
          className={`draht-theme-row${selected === 'custom' ? ' draht-theme-row-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => select('custom')}
        >
          <span>Custom — pick your own below</span>
          {selected === 'custom' && <span className="draht-theme-tick">✓</span>}
        </div>
      </div>

      <div className="draht-theme-actions">
        {window.draht?.openThemesFolder && (
          <Button size="tiny" isText onClick={() => window.draht!.openThemesFolder()}>
            Open themes folder
          </Button>
        )}
        <Button size="tiny" isText onClick={refresh}>Reload themes</Button>
        <Button size="tiny" isText onClick={exportTheme}>Export custom as file</Button>
      </div>

      {themesPath && (
        <p className="draht-theme-hint">
          {`Drop .json files in ${themesPath}, then Reload. The example file there shows the format.`}
        </p>
      )}

      <div className="draht-theme-colours">
        {(Object.keys(SEED_LABELS) as (keyof ThemeSeed)[]).map((key) => (
          <label key={key} className="draht-swatch-row">
            <input
              type="color"
              className="draht-swatch"
              value={seed[key]}
              onChange={(e) => updateColour(key, (e.currentTarget as HTMLInputElement).value)}
            />
            <span className="draht-swatch-label">{SEED_LABELS[key]}</span>
            <span className="draht-swatch-hex">{seed[key]}</span>
          </label>
        ))}

        <div className="draht-theme-actions">
          {available.map((theme) => (
            <Button key={theme.id} size="tiny" isText onClick={() => startFrom(theme.seed)}>
              {`Start from ${theme.label}`}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThemeEditor;
