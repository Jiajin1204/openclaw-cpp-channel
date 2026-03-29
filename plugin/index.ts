/**
 * cpp-channel Plugin Entry
 * 
 * Entry point for the OpenClaw plugin system.
 * Uses the standard defineChannelPluginEntry format.
 */

import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { cppChannelPlugin } from "./src/channel.js";
import { setCppChannelRuntime } from "./src/runtime.js";

// Define the plugin entry for OpenClaw
const cppChannelEntry = defineChannelPluginEntry({
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration",
  plugin: cppChannelPlugin,
  setRuntime: setCppChannelRuntime,
});

// Default export for OpenClaw plugin loading
export default cppChannelEntry;