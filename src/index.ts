import { pluginConfigJsonSchema, pluginUiHints } from './schemas';
import { registerDatagranMemoryTools } from './tools';
import type { PluginApi } from './types';

const plugin = {
  id: 'datagran-memory',
  name: 'Datagran Memory',
  configSchema: pluginConfigJsonSchema,
  uiHints: pluginUiHints,
  register(api: PluginApi) {
    registerDatagranMemoryTools(api, 'datagran-memory');
  },
};

export default plugin;
