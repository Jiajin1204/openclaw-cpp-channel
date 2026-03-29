/**
 * cpp-channel Plugin Entry
 * 
 * Entry point for the OpenClaw plugin system.
 * Uses the standard defineChannelPluginEntry format.
 */

import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { cppChannelPlugin } from "./src/channel.js";
import { setCppChannelRuntime } from "./src/runtime.js";
import type { CppChannelRuntime } from "./src/types.js";

// Define the runtime initializer
function setCppChannelRuntimeFromApi(runtime: CppChannelRuntime): void {
  setCppChannelRuntime(runtime);
}

// Export the plugin
export { cppChannelPlugin } from "./src/channel.js";
export { setCppChannelRuntime, getCppChannelRuntime } from "./src/runtime.js";

// Define the plugin entry for OpenClaw
const cppChannelEntry = defineChannelPluginEntry({
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration",
  plugin: cppChannelPlugin,
  setRuntime: setCppChannelRuntimeFromApi as any,
});

// Default export for OpenClaw plugin loading
export default cppChannelEntry;