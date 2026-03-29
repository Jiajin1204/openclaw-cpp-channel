/**
 * cpp-channel runtime management
 * 
 * Manages the runtime state for the C++ Channel plugin.
 * Uses OpenClaw's createPluginRuntimeStore for standard runtime management.
 */

import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { CppChannelRuntime } from "./types.js";

// Create standard OpenClaw runtime store
const { setRuntime: setCppChannelRuntime, getRuntime: getCppChannelRuntime } =
  createPluginRuntimeStore<CppChannelRuntime>("CppChannel runtime not initialized");

export { getCppChannelRuntime, setCppChannelRuntime };
export type { CppChannelRuntime } from "./types.js";