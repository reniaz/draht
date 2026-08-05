import type { FC } from '../../../lib/teact/teact';
import { useState } from '../../../lib/teact/teact';

import type { ThemeSeed } from './themes';

import { DEFAULT_SEED, SEED_LABELS, THEMES } from './themes';
import { convertZedTheme } from './zedTheme';

import Button from '../../../components/ui/Button';

import './ThemeEditor.scss';

type OwnProps = {
  value: string;
  setValue: (value: string) => void;
};

function parseSeed(raw: string): ThemeSeed {
  try {
    const parsed = JSON.parse(raw);
    // Merge over the default so a partial or older saved seed still yields every key.
    return { ...DEFAULT_SEED, ...parsed };
  } catch {
    return DEFAULT_SEED;
  }
}

/**
 * Colour-by-colour editor for the custom theme.
 *
 * Editing raw theme JSON is a poor way to choose colours — you cannot see what you are
 * picking. Ten native colour inputs cover the whole palette because everything else is
 * derived (see `buildThemeVars`).
 *
 * Importing a Zed theme is kept, but demoted to one way of *filling in* the swatches
 * rather than the only way to define a theme.
 */
const ThemeEditor: FC<OwnProps> = ({ value, setValue }) => {
  const seed = parseSeed(value);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | undefined>();
  const [isImportOpen, setIsImportOpen] = useState(false);

  function update(key: keyof ThemeSeed, colour: string) {
    setValue(JSON.stringify({ ...seed, [key]: colour }));
  }

  function loadPreset(presetSeed: ThemeSeed) {
    setValue(JSON.stringify(presetSeed));
  }

  function runImport() {
    try {
      loadPreset(convertZedTheme(importText));
      setImportError(undefined);
      setIsImportOpen(false);
      setImportText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that theme');
    }
  }

  return (
    <div className="draht-theme-editor">
      {(Object.keys(SEED_LABELS) as (keyof ThemeSeed)[]).map((key) => (
        <label key={key} className="draht-swatch-row">
          <input
            type="color"
            className="draht-swatch"
            value={seed[key]}
            onChange={(e) => update(key, (e.currentTarget as HTMLInputElement).value)}
          />
          <span className="draht-swatch-label">{SEED_LABELS[key]}</span>
          <span className="draht-swatch-hex">{seed[key]}</span>
        </label>
      ))}

      <div className="draht-theme-actions">
        {THEMES.map((theme) => (
          <Button
            key={theme.id}
            size="tiny"
            isText
            onClick={() => loadPreset(theme.seed)}
          >
            {`Start from ${theme.label}`}
          </Button>
        ))}
        <Button size="tiny" isText onClick={() => setIsImportOpen(!isImportOpen)}>
          {isImportOpen ? 'Cancel import' : 'Import Zed theme'}
        </Button>
      </div>

      {isImportOpen && (
        <div className="draht-theme-import">
          <textarea
            className="form-control"
            rows={4}
            placeholder="Paste a Zed theme JSON to fill in the swatches"
            value={importText}
            onChange={(e) => setImportText((e.currentTarget as HTMLTextAreaElement).value)}
          />
          {importError && <p className="draht-theme-error">{importError}</p>}
          <Button size="tiny" onClick={runImport} disabled={!importText.trim()}>
            Load colours
          </Button>
        </div>
      )}
    </div>
  );
};

export default ThemeEditor;
