import type { Plugin } from './types';

import {
  attachAction, attachApiUpdate, attachGlobalChange,
  detachAction, detachApiUpdate, detachGlobalChange,
} from './ActionBus';
import { modLogger } from './Logger';
import {
  isPluginEnabledInSettings, registerSettingsDefinition, setPluginEnabledInSettings,
} from './Settings';
import { addSeam, removeSeam } from './Seams';

const logger = modLogger.scoped('PluginManager');

/** Populated from the build-time `~modplugins` virtual module. */
const plugins: Record<string, Plugin> = {};

export function getPlugins() {
  return plugins;
}

export function getPlugin(name: string): Plugin | undefined {
  return plugins[name];
}

export function isPluginEnabled(name: string) {
  const plugin = plugins[name];
  if (!plugin) return false;
  if (plugin.required) return true;

  return isPluginEnabledInSettings(name, plugin.enabledByDefault ?? false);
}

/**
 * Wires up everything a plugin declared.
 *
 * Registration and teardown are kept deliberately symmetric — every `attach*`/`addSeam`
 * here has its mirror in `stopPlugin`. That symmetry is what makes a plugin genuinely
 * hot-toggleable instead of "disabled until reload".
 */
export function startPlugin(plugin: Plugin) {
  if (plugin.started) return true;

  try {
    plugin.start?.();
  } catch (err) {
    logger.error(`${plugin.name}: start() failed`, err);
    return false;
  }

  if (plugin.seams) {
    for (const [name, fn] of Object.entries(plugin.seams)) {
      if (fn) addSeam(name as any, fn as any);
    }
  }

  if (plugin.actions) {
    for (const [name, handler] of Object.entries(plugin.actions)) {
      attachAction(name, handler);
    }
  }

  if (plugin.apiUpdates) {
    for (const [type, handler] of Object.entries(plugin.apiUpdates)) {
      attachApiUpdate(type, handler);
    }
  }

  if (plugin.onGlobalChange) {
    attachGlobalChange(plugin.onGlobalChange);
  }

  plugin.started = true;
  logger.info(`started ${plugin.name}`);
  return true;
}

export function stopPlugin(plugin: Plugin) {
  if (!plugin.started) return true;

  if (plugin.seams) {
    for (const [name, fn] of Object.entries(plugin.seams)) {
      if (fn) removeSeam(name as any, fn as any);
    }
  }

  if (plugin.actions) {
    for (const [name, handler] of Object.entries(plugin.actions)) {
      detachAction(name, handler);
    }
  }

  if (plugin.apiUpdates) {
    for (const [type, handler] of Object.entries(plugin.apiUpdates)) {
      detachApiUpdate(type, handler);
    }
  }

  if (plugin.onGlobalChange) {
    detachGlobalChange(plugin.onGlobalChange);
  }

  plugin.started = false;

  try {
    plugin.stop?.();
  } catch (err) {
    logger.error(`${plugin.name}: stop() failed`, err);
    return false;
  }

  logger.info(`stopped ${plugin.name}`);
  return true;
}

/** Toggle from the settings UI. Returns the state actually reached. */
export function setPluginEnabled(name: string, enabled: boolean) {
  const plugin = plugins[name];
  if (!plugin || plugin.required) return isPluginEnabled(name);

  setPluginEnabledInSettings(name, enabled);

  if (enabled) {
    if (!startPlugin(plugin)) {
      // Roll the setting back so the UI never claims a plugin is on when it failed.
      setPluginEnabledInSettings(name, false);
      return false;
    }
  } else {
    stopPlugin(plugin);
  }

  return enabled;
}

export function initPlugins(registry: Record<string, Plugin>) {
  for (const plugin of Object.values(registry)) {
    if (plugins[plugin.name]) {
      logger.error(`duplicate plugin name '${plugin.name}' — ignoring the second one`);
      continue;
    }

    plugin.started = false;
    plugins[plugin.name] = plugin;

    if (plugin.settings) {
      // The settings object is name-agnostic until now; this is what lets
      // `settings.store` resolve to the right record.
      plugin.settings.pluginName = plugin.name;
      registerSettingsDefinition(plugin.name, plugin.settings.def);
    }
  }

  for (const plugin of Object.values(plugins)) {
    if (isPluginEnabled(plugin.name)) startPlugin(plugin);
  }

  const enabled = Object.values(plugins).filter((p) => p.started).length;
  logger.info(`${enabled}/${Object.keys(plugins).length} plugins started`);
}
