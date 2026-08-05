import { beforeAll, describe, expect, it } from 'vitest';

import type { ApiMessage } from '../../api/types';

import { runMessageClassNames } from './Seams';
import { definePlugin } from './types';
import {
  getPlugins, initPlugins, isPluginEnabled, setPluginEnabled, startPlugin, stopPlugin,
} from './PluginManager';

/**
 * Covers the properties that make this a plugin *system* rather than a hardcoded call:
 * plugins register independently, enable/disable takes effect without a reload, and
 * stopping a plugin genuinely removes what it registered.
 *
 * The last one is the reason the ActionBus exists at all — upstream has no
 * `removeActionHandler`, so "disabled" would otherwise mean "still running".
 */

const alpha = definePlugin({
  name: 'TestAlpha',
  description: 'first test plugin',
  enabledByDefault: true,
  seams: {
    messageClassNames: () => 'alpha-class',
  },
});

const beta = definePlugin({
  name: 'TestBeta',
  description: 'second test plugin',
  enabledByDefault: false,
  seams: {
    messageClassNames: () => 'beta-class',
  },
});

const required = definePlugin({
  name: 'TestRequired',
  description: 'cannot be turned off',
  required: true,
});

const message = { id: 1 } as ApiMessage;

describe('PluginManager', () => {
  beforeAll(() => {
    localStorage.clear();
    initPlugins({ alpha, beta, required } as any);
  });

  it('registers every plugin in the registry', () => {
    expect(Object.keys(getPlugins()).sort()).toEqual(['TestAlpha', 'TestBeta', 'TestRequired']);
  });

  it('honours enabledByDefault', () => {
    expect(alpha.started).toBe(true);
    expect(beta.started).toBe(false);
  });

  it('only applies seams from started plugins', () => {
    expect(runMessageClassNames(message, {})).toBe('alpha-class');
  });

  it('enables a plugin at runtime without a reload', () => {
    setPluginEnabled('TestBeta', true);

    expect(beta.started).toBe(true);
    // Both seams now contribute, and their output is concatenated.
    expect(runMessageClassNames(message, {})).toBe('alpha-class beta-class');
  });

  it('removes a stopped plugin\'s seams', () => {
    setPluginEnabled('TestAlpha', false);

    expect(alpha.started).toBe(false);
    expect(runMessageClassNames(message, {})).toBe('beta-class');
  });

  it('persists the enabled state', () => {
    expect(isPluginEnabled('TestAlpha')).toBe(false);
    expect(isPluginEnabled('TestBeta')).toBe(true);
  });

  it('refuses to disable a required plugin', () => {
    setPluginEnabled('TestRequired', false);

    expect(isPluginEnabled('TestRequired')).toBe(true);
  });

  it('is idempotent across repeated start/stop', () => {
    setPluginEnabled('TestBeta', true);
    startPlugin(beta);
    startPlugin(beta);

    // A second registration would duplicate the seam and double the class name.
    expect(runMessageClassNames(message, {})).toBe('beta-class');

    stopPlugin(beta);
    stopPlugin(beta);
    expect(runMessageClassNames(message, {})).toBeUndefined();
  });
});
