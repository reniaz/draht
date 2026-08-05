import type { FC } from '../../../lib/teact/teact';
import { useEffect, useState } from '../../../lib/teact/teact';

import type { ThemeSeed } from './themes';

import { getGlobal } from '../../../global';

import { getUserFullName } from '../../../global/helpers';
import { selectUser } from '../../../global/selectors';
import { getSettingValue, setSettingValue } from '../../api/Settings';
import { SEED_LABELS, TELEGRAM_DARK } from './themes';
import { apply, findTheme, getAvailableThemes, loadFileThemes } from './index';
import { stringifyTheme } from './themeFile';

import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import ExportThemeDialog from './ExportThemeDialog';

import './ThemeEditor.scss';

function readSeed(raw: unknown): ThemeSeed | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return { ...TELEGRAM_DARK, ...JSON.parse(raw) };
  } catch {
    return undefined;
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
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const selected = String(getSettingValue('Themes', 'theme') ?? 'off');
  const seed = readSeed(getSettingValue('Themes', 'customSeed')) ?? TELEGRAM_DARK;

  useEffect(() => {
    void window.draht?.themesDir?.().then(setThemesPath);
  }, []);

  function rerender() {
    forceUpdate((v) => v + 1);
  }

  function select(id: string) {
    // Switching to Custom carries over whatever is on screen, so the pickers open on the
    // colours you were just looking at rather than on an unrelated palette. Existing
    // custom colours are kept — losing hand-picked work to a stray click would be worse
    // than starting from the default, and Reset covers starting over deliberately.
    if (id === 'custom' && !readSeed(getSettingValue('Themes', 'customSeed'))) {
      const from = selected === 'off' ? TELEGRAM_DARK : (findTheme(selected)?.seed ?? TELEGRAM_DARK);
      setSettingValue('Themes', 'customSeed', JSON.stringify(from));
    }

    setSettingValue('Themes', 'theme', id);
    apply();
    rerender();
  }

  function updateColour(key: keyof ThemeSeed, colour: string) {
    setSettingValue('Themes', 'customSeed', JSON.stringify({ ...seed, [key]: colour }));
    apply();
    rerender();
  }

  function resetColours() {
    setSettingValue('Themes', 'customSeed', JSON.stringify(TELEGRAM_DARK));
    apply();
    setIsResetOpen(false);
    rerender();
  }

  async function refresh() {
    await loadFileThemes();
    apply();
    rerender();
  }

  /** Whatever is on screen: the custom colours, or the selected theme's own. */
  function currentSeed() {
    if (isCustom) return seed;
    if (selected === 'off') return TELEGRAM_DARK;

    return findTheme(selected)?.seed ?? TELEGRAM_DARK;
  }

  function currentName() {
    if (isCustom) return 'My theme';
    if (selected === 'off') return 'Telegram Dark';

    return findTheme(selected)?.label ?? 'My theme';
  }

  /** Your own display name, as the most likely answer to "who made this". */
  function defaultAuthor() {
    try {
      const global = getGlobal();
      const user = global.currentUserId ? selectUser(global, global.currentUserId) : undefined;

      return getUserFullName(user) || '';
    } catch {
      return '';
    }
  }

  function exportTheme(name: string, author: string) {
    const blob = new Blob([stringifyTheme(name, currentSeed(), author)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // A theme called "Tokyo Night" should not download as my-theme.json.
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setIsExportOpen(false);
  }

  const available = getAvailableThemes();
  const isCustom = selected === 'custom';

  return (
    <div className="draht-theme-editor">
      <div className="draht-theme-list">
        <div
          className={`draht-theme-row${selected === 'off' ? ' draht-theme-row-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => select('off')}
        >
          <span className="draht-theme-swatches">
            {(['background', 'surface', 'accent', 'text'] as const).map((key) => (
              <i key={key} style={`background:${TELEGRAM_DARK[key]}`} />
            ))}
          </span>
          <span className="draht-theme-name">Default</span>
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
          className={`draht-theme-row${isCustom ? ' draht-theme-row-active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => select('custom')}
        >
          <span className="draht-theme-swatches">
            {(['background', 'surface', 'accent', 'text'] as const).map((key) => (
              <i key={key} style={`background:${seed[key]}`} />
            ))}
          </span>
          <span className="draht-theme-name">Custom</span>
          {isCustom && <span className="draht-theme-tick">✓</span>}
        </div>
      </div>

      <div className="draht-theme-actions">
        {window.draht?.openThemesFolder && (
          <Button size="tiny" isText onClick={() => window.draht!.openThemesFolder()}>
            Open themes folder
          </Button>
        )}
        <Button size="tiny" isText onClick={refresh}>Reload themes</Button>
        {/* Not only for the custom theme: exporting a bundled one is how you start from
            something close and edit the file. */}
        <Button size="tiny" isText onClick={() => setIsExportOpen(true)}>Export theme…</Button>
      </div>

      {themesPath && (
        <p className="draht-theme-hint">
          {`Drop .json files in ${themesPath}, then Reload. The example file there shows the format.`}
        </p>
      )}

      {/* The pickers only edit the custom theme, so showing them while a bundled or file
          theme is selected would imply edits that go nowhere. */}
      {isCustom && (
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
            <Button size="tiny" isText color="danger" onClick={() => setIsResetOpen(true)}>
              Reset colours
            </Button>
          </div>
        </div>
      )}

      <ExportThemeDialog
        isOpen={isExportOpen}
        defaultName={currentName()}
        defaultAuthor={defaultAuthor()}
        onExport={exportTheme}
        onClose={() => setIsExportOpen(false)}
      />

      <ConfirmDialog
        isOpen={isResetOpen}
        title="Reset colours"
        text={'Every custom colour goes back to Telegram\'s dark theme. '
          + 'This cannot be undone — save the current colours as a file first if you want to keep them.'}
        confirmLabel="Reset"
        confirmIsDestructive
        confirmHandler={resetColours}
        onClose={() => setIsResetOpen(false)}
      />
    </div>
  );
};

export default ThemeEditor;
