/**
 * cpp-channel runtime management
 * 
 * Manages the runtime state for the C++ Channel plugin.
 * This is required by the standard OpenClaw Channel Plugin interface.
 */

import type { CppChannelRuntime } from "./types.js";

let runtime: CppChannelRuntime | null = null;

export function setCppChannelRuntime(r: CppChannelRuntime): void {
  runtime = r;
}

export function getCppChannelRuntime(): CppChannelRuntime {
  if (!runtime) {
    throw new Error("CppChannel runtime not initialized");
  }
  return runtime;
}

export function isCppChannelRuntimeInitialized(): boolean {
  return runtime !== null;
}