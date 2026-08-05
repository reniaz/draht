import type {
  DefinedSettings, PluginSettingDef, SettingsDefinition, SettingsStore,
} from './types';

import { OptionType } from './types';
import { modLogger } from './Logger';

const STORAGE_KEY = 'draht-settings';

type PluginSettingsRecord = { enabled?: boolean } & Record<string, any>;

type ModSettingsShape = {
  plugins: Record<string, PluginSettingsRecord>;
};

/**
 * localStorage rather than IndexedDB, matching Vencord's synchronous
 * `VencordNative.settings.get()`.
 *
 * Plugins start during boot and must decide enabled/disabled without awaiting, so the
 * backing store has to be synchronous. This is a few KB of scalars — the message log,
 * which is neither small nor synchronous, lives in its own IndexedDB store instead.
 */
function load(): ModSettingsShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plugins: {} };

    const parsed = JSON.parse(raw);
    return { plugins: parsed?.plugins ?? {} };
  } catch (err) {
    // Corrupt settings must not brick the client; fall back to defaults.
    modLogger.error('failed to read settings, starting fresh', err);
    return { plugins: {} };
  }
}

const settings: ModSettingsShape = load();

const listeners = new Set<() => void>();

export function subscribeToModSettings(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

let flushHandle: number | undefined;

function persist() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      modLogger.error('settings listener failed', err);
    }
  });

  // Coalesce writes: dragging a slider would otherwise hit localStorage every frame.
  if (flushHandle !== undefined) return;
  flushHandle = window.setTimeout(() => {
    flushHandle = undefined;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      modLogger.error('failed to persist settings', err);
    }
  }, 100);
}

/** Registered defs, so defaults can be resolved lazily on read. */
const definitions = new Map<string, SettingsDefinition>();

export function registerSettingsDefinition(pluginName: string, def: SettingsDefinition) {
  definitions.set(pluginName, def);
}

function resolveDefault(setting: PluginSettingDef) {
  if (setting.type === OptionType.SELECT) {
    return (setting.options.find((o) => o.default) ?? setting.options[0])?.value;
  }
  return (setting as any).default;
}

export function getPluginRecord(pluginName: string): PluginSettingsRecord {
  if (!settings.plugins[pluginName]) settings.plugins[pluginName] = {};
  return settings.plugins[pluginName];
}

export function getSettingValue(pluginName: string, key: string) {
  const record = getPluginRecord(pluginName);
  if (key in record) return record[key];

  const setting = definitions.get(pluginName)?.[key];
  return setting ? resolveDefault(setting) : undefined;
}

export function setSettingValue(pluginName: string, key: string, value: any) {
  const record = getPluginRecord(pluginName);
  if (record[key] === value) return;

  record[key] = value;

  const setting = definitions.get(pluginName)?.[key];
  try {
    setting?.onChange?.(value);
  } catch (err) {
    modLogger.error(`onChange for ${pluginName}.${key} failed`, err);
  }

  persist();
}

export function isPluginEnabledInSettings(pluginName: string, enabledByDefault: boolean) {
  const record = settings.plugins[pluginName];
  return record?.enabled ?? enabledByDefault;
}

export function setPluginEnabledInSettings(pluginName: string, enabled: boolean) {
  getPluginRecord(pluginName).enabled = enabled;
  persist();
}

/**
 * Declares a plugin's settings. Holds no state itself — it is a typed view onto the
 * global settings object, resolved by plugin name once the PluginManager registers it.
 */
export function definePluginSettings<D extends SettingsDefinition>(def: D): DefinedSettings<D> {
  const defined: DefinedSettings<D> = {
    def,
    pluginName: '',
    get store() {
      if (!defined.pluginName) {
        throw new Error('Cannot access plugin settings before the plugin is registered');
      }

      const { pluginName } = defined;

      return new Proxy({} as SettingsStore<D>, {
        get: (_target, key: string) => getSettingValue(pluginName, key),
        set: (_target, key: string, value) => {
          setSettingValue(pluginName, key, value);
          return true;
        },
        has: (_target, key: string) => key in def,
        ownKeys: () => Reflect.ownKeys(def),
        getOwnPropertyDescriptor: (_target, key: string) => (key in def
          ? { enumerable: true, configurable: true, value: getSettingValue(pluginName, key) }
          : undefined),
      });
    },
  };

  return defined;
}
