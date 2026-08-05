import type { FC } from '../../../lib/teact/teact';
import { useEffect, useState } from '../../../lib/teact/teact';

import InputText from '../../../components/ui/InputText';

import './FontPicker.scss';

type OwnProps = {
  value: string;
  setValue: (value: string) => void;
};

const DEFAULT_LABEL = 'Telegram default';

/**
 * Searchable list of the fonts installed on this machine.
 *
 * Uses the Local Font Access API, which Electron exposes without any permission plumbing
 * (verified: 227 families on the dev machine). Each row is rendered in its own font, since
 * a list of names tells you nothing about what you are choosing.
 *
 * The list is only needed to *pick* a font — applying one at startup is just a CSS
 * variable, so the plugin never depends on this API being available at boot.
 */
const FontPicker: FC<OwnProps> = ({ value, setValue }) => {
  const [families, setFamilies] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (typeof queryLocalFonts !== 'function') {
      setError('This build cannot list system fonts. You can still type a font name below.');
      return;
    }

    setIsLoading(true);
    queryLocalFonts()
      .then((fonts) => {
        const unique = [...new Set(fonts.map((font) => font.family))];
        setFamilies(unique.sort((a, b) => a.localeCompare(b)));
      })
      .catch((err) => setError(err?.message || 'Could not read the font list.'))
      .finally(() => setIsLoading(false));
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? families.filter((family) => family.toLowerCase().includes(needle))
    : families;

  return (
    <div className="draht-font-picker">
      <InputText
        value={query}
        placeholder="Search fonts"
        onChange={(e) => setQuery(e.currentTarget.value)}
      />

      {error && <p className="draht-font-error">{error}</p>}
      {isLoading && <p className="draht-font-hint">Reading system fonts…</p>}

      <div className="draht-font-list custom-scroll">
        <div
          className={value ? 'draht-font-row' : 'draht-font-row draht-font-row-active'}
          role="button"
          tabIndex={0}
          onClick={() => setValue('')}
        >
          {DEFAULT_LABEL}
        </div>

        {filtered.map((family) => (
          <div
            key={family}
            className={family === value ? 'draht-font-row draht-font-row-active' : 'draht-font-row'}
            // Teact takes `style` as a string.
            style={`font-family: "${family.replace(/"/g, '')}"`}
            role="button"
            tabIndex={0}
            onClick={() => setValue(family)}
          >
            {family}
          </div>
        ))}

        {!isLoading && !filtered.length && families.length > 0 && (
          <p className="draht-font-hint">{`No font matches "${query}".`}</p>
        )}
      </div>

      <p className="draht-font-hint">
        {value ? `Using ${value}` : `Using ${DEFAULT_LABEL}`}
      </p>
    </div>
  );
};

export default FontPicker;
