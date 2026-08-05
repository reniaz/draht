import type { FC } from '../../../lib/teact/teact';
import type { ChangeEvent } from 'react';

import type { Plugin, PluginSettingDef } from '../../api/types';

import { getSettingValue, setSettingValue } from '../../api/Settings';
import { OptionType } from '../../api/types';

import Checkbox from '../../../components/ui/Checkbox';
import InputText from '../../../components/ui/InputText';
import RadioGroup from '../../../components/ui/RadioGroup';
import RangeSlider from '../../../components/ui/RangeSlider';

type OwnProps = {
  plugin: Plugin;
  settingKey: string;
  setting: PluginSettingDef;
  onChange: NoneToVoidFunction;
};

/**
 * Renders one plugin setting.
 *
 * Structurally this is Vencord's `OptionComponentMap` table lookup, but built from
 * upstream's own `src/components/ui` primitives so the screen looks like part of Telegram
 * rather than a mod bolted on.
 *
 * Every type except BOOLEAN renders as label / control / hint in that order. Booleans put
 * the checkbox first because it already carries its own label, and stacking a second one
 * above it just reads as a duplicate.
 */
const PluginSettingControl: FC<OwnProps> = ({
  plugin, settingKey, setting, onChange,
}) => {
  const value = getSettingValue(plugin.name, settingKey);
  const label = setting.displayName || settingKey;
  const disabled = Boolean(setting.disabled?.call(plugin.settings));

  const commit = (newValue: unknown) => {
    setSettingValue(plugin.name, settingKey, newValue);
    onChange();
  };

  function wrap(children: any, extraClass = '') {
    return (
      <div className={`draht-setting ${extraClass}`.trim()}>
        {children}
      </div>
    );
  }

  function labelled(control: any) {
    return wrap(
      <>
        <div className="draht-setting-label">{label}</div>
        {control}
        <p className="draht-setting-hint">{setting.description}</p>
      </>,
    );
  }

  switch (setting.type) {
    case OptionType.BOOLEAN:
      return wrap(
        <Checkbox
          label={setting.displayName || setting.description}
          subLabel={setting.displayName ? setting.description : undefined}
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => commit(e.currentTarget.checked)}
        />,
        'draht-setting-boolean',
      );

    case OptionType.SELECT:
      return labelled(
        <RadioGroup
          name={`${plugin.name}-${settingKey}`}
          options={setting.options.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          selected={String(value)}
          disabled={disabled}
          onChange={commit}
        />,
      );

    case OptionType.STRING:
      return labelled(
        setting.multiline ? (
          <textarea
            className="form-control"
            rows={3}
            value={String(value ?? '')}
            disabled={disabled}
            placeholder={setting.placeholder}
            onChange={(e) => commit((e.currentTarget as HTMLTextAreaElement).value)}
          />
        ) : (
          <InputText
            value={String(value ?? '')}
            disabled={disabled}
            placeholder={setting.placeholder}
            onChange={(e: ChangeEvent<HTMLInputElement>) => commit(e.currentTarget.value)}
          />
        ),
      );

    case OptionType.NUMBER:
      return labelled(
        <InputText
          value={String(value ?? '')}
          inputMode="numeric"
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const parsed = Number(e.currentTarget.value);
            // Ignore junk rather than persisting NaN, which would poison the setting.
            if (!Number.isNaN(parsed)) commit(parsed);
          }}
        />,
      );

    case OptionType.SLIDER: {
      const step = setting.step ?? 1;

      return wrap(
        <>
          {/*
            `step` is deliberately pinned to 1 and the snapping done here instead.
            Upstream's RangeSlider computes its fill width as
            `(value - min) / ((max - min) / step) * 100`, which divides by the *number of
            steps* rather than the range — so any step other than 1 overshoots (step 5
            over 0..40 renders the fill at 500% and it runs off the screen). Every
            upstream slider uses step 1, so the bug never surfaces there.
          */}
          <RangeSlider
            label={label}
            min={setting.min}
            max={setting.max}
            step={1}
            value={Number(value ?? setting.default)}
            disabled={disabled}
            renderValue={(v) => `${v}${setting.unit ?? ''}`}
            onChange={(raw) => commit(Math.round(raw / step) * step)}
          />
          <p className="draht-setting-hint">{setting.description}</p>
        </>,
      );
    }

    case OptionType.COMPONENT: {
      const Component = setting.component;

      // A component brings its own layout, so the explanatory line goes above it rather
      // than trailing underneath where it reads as a stray caption. A description that
      // only repeats the label says nothing and is dropped.
      return wrap(
        <>
          <div className="draht-setting-label">{label}</div>
          {setting.description !== label && (
            <p className="draht-setting-hint">{setting.description}</p>
          )}
          <Component value={value} setValue={commit} />
        </>,
      );
    }

    // CUSTOM is persisted plugin state with no UI by design.
    default:
      return undefined;
  }
};

export default PluginSettingControl;
