import plugins from '~modplugins';

import { modLogger } from './api/Logger';
import { initPlugins } from './api/PluginManager';

import './styles/mod.scss';

/**
 * Single entry point for the mod, imported once from `src/index.tsx`.
 *
 * This import sits *above* `./global/init` deliberately. Action handlers run in
 * registration order, so anything that needs to observe an update before upstream's own
 * handler mutates state — capturing a message's previous text on edit, for instance — has
 * to be registered first.
 */
initPlugins(plugins);

modLogger.info(`initialised (app ${APP_VERSION})`);
