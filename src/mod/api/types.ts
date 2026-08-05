import type { FC } from '../../lib/teact/teact';
import type { GlobalState } from '../../global/types';
import type {
  BeforeDeleteMessages, ChatMenuItems, MessageClassNames, MessageMenuItems,
} from './Seams';

/**
 * The plugin contract, adapted from Vencord's `PluginDef` (src/utils/types.ts:126).
 *
 * Two deliberate departures:
 *
 *  - **No `patches`.** Vencord string-patches Discord's webpack module factories at
 *    runtime. telegram-tt is native ESM with no module registry, so there is nothing to
 *    hook — extension points are compiled in as seams instead.
 *  - **`flux` splits into `actions` / `apiUpdates` / `onGlobalChange`.** Discord has one
 *    dispatcher; telegram-tt has a multi-subscriber action bus plus a global-change
 *    callback, and collapsing them would hide which one a plugin actually wants.
 */

export const enum OptionType {
  STRING,
  NUMBER,
  BOOLEAN,
  SELECT,
  SLIDER,
  COMPONENT,
  CUSTOM,
}

type SettingCommon<D> = {
  description: string;
  displayName?: string;
  placeholder?: string;
  onChange?: (newValue: any) => void;
  /** Shown as a "reload required" hint. Seam-registering changes never need this. */
  restartNeeded?: boolean;
  disabled?: (this: D) => boolean;
  hidden?: (this: D) => boolean;
};

export type StringSetting<D = any> = SettingCommon<D> & {
  type: OptionType.STRING;
  default?: string;
  multiline?: boolean;
  isValid?: (this: D, value: string) => boolean | string;
};

export type NumberSetting<D = any> = SettingCommon<D> & {
  type: OptionType.NUMBER;
  default?: number;
  min?: number;
  max?: number;
  isValid?: (this: D, value: number) => boolean | string;
};

export type BooleanSetting<D = any> = SettingCommon<D> & {
  type: OptionType.BOOLEAN;
  default?: boolean;
};

export type SelectSetting<D = any> = SettingCommon<D> & {
  type: OptionType.SELECT;
  options: readonly { label: string; value: string; default?: boolean }[];
};

export type SliderSetting<D = any> = SettingCommon<D> & {
  type: OptionType.SLIDER;
  default: number;
  min: number;
  max: number;
  /** Values snap to multiples of this. Any value is safe — see PluginSettingControl. */
  step?: number;
  /** Appended to the displayed value, e.g. '%'. */
  unit?: string;
};

export type ComponentSetting<D = any> = SettingCommon<D> & {
  type: OptionType.COMPONENT;
  component: FC<{ value: any; setValue: (v: any) => void }>;
};

/** Persisted, but with no generated UI — plugin-managed state. */
export type CustomSetting<D = any> = SettingCommon<D> & {
  type: OptionType.CUSTOM;
  default?: any;
};

export type PluginSettingDef<D = any> =
  | StringSetting<D>
  | NumberSetting<D>
  | BooleanSetting<D>
  | SelectSetting<D>
  | SliderSetting<D>
  | ComponentSetting<D>
  | CustomSetting<D>;

export type SettingsDefinition = Record<string, PluginSettingDef>;

/** Maps a setting definition to the type of the value it stores. */
export type SettingValue<S extends PluginSettingDef> =
  S extends StringSetting ? string :
    S extends NumberSetting ? number :
      S extends BooleanSetting ? boolean :
        S extends SelectSetting ? S['options'][number]['value'] :
          S extends SliderSetting ? number :
            any;

export type SettingsStore<D extends SettingsDefinition> = {
  [K in keyof D]: SettingValue<D[K]>;
};

export type DefinedSettings<D extends SettingsDefinition = SettingsDefinition> = {
  def: D;
  /** Live read/write view. Writing persists. */
  store: SettingsStore<D>;
  /** Filled in by the PluginManager at registration. */
  pluginName: string;
};

export type ModActionHandler = (
  global: GlobalState,
  actions: any,
  payload: any,
) => GlobalState | void | Promise<void>;

export type ApiUpdateHandler = (
  global: GlobalState,
  update: any,
) => GlobalState | void;

export type PluginSeams = {
  beforeDeleteMessages?: BeforeDeleteMessages;
  messageClassNames?: MessageClassNames;
  messageMenuItems?: MessageMenuItems;
  chatMenuItems?: ChatMenuItems;
};

export type PluginDef = {
  name: string;
  description: string;
  authors?: string[];

  /** Cannot be disabled by the user. */
  required?: boolean;
  /** Enabled on first run, but the user may turn it off. */
  enabledByDefault?: boolean;
  /** Hidden from the plugin list (API/support plugins). */
  hidden?: boolean;

  settings?: DefinedSettings<any>;

  /** Compiled-in extension points. Registered on start, removed on stop. */
  seams?: PluginSeams;

  /** Extra `addActionHandler` subscriptions, keyed by action name. */
  actions?: Record<string, ModActionHandler>;
  /** Sugar over the `apiUpdate` action, keyed by `update['@type']`. */
  apiUpdates?: Record<string, ApiUpdateHandler>;
  /** Runs on every global-state change (throttled to tick end). */
  onGlobalChange?: (global: GlobalState) => void;

  start?: () => void;
  stop?: () => void;
};

export type Plugin = PluginDef & {
  started: boolean;
};

/**
 * Identity function. Exists purely so plugin objects get checked against `PluginDef`
 * while keeping their literal types for settings inference.
 */
export function definePlugin<P extends PluginDef>(plugin: P & Record<string, any>) {
  return plugin as P & Plugin;
}
