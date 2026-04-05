/**
 * cpp-channel Plugin Entry
 * 
 * 遵循 nostr 插件的标准做法：通过 register() 接收 runtime
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { cppChannelPlugin } from "./src/channel.js";
import { setCppChannelRuntime } from "./src/runtime.js";

const plugin = {
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 接收 OpenClaw 传入的 runtime
    setCppChannelRuntime(api.runtime);
    
    // 注册 channel
    api.registerChannel({ plugin: cppChannelPlugin });
  },
};

export default plugin;