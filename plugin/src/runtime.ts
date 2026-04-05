/**
 * cpp-channel runtime management
 * 
 * Manages the runtime state for the C++ Channel plugin.
 * Uses OpenClaw's createPluginRuntimeStore for standard runtime management.
 */

// We store the channelRuntime directly during startAccount
// This is different from createPluginRuntimeStore which has different content
let cppChannelRuntime: any = null;
let cppChannelReady = false;

function setCppChannelRuntime(runtime: any) {
  cppChannelRuntime = runtime;
  cppChannelReady = true;
  console.log("[cpp-channel] Runtime ready, keys:", Object.keys(runtime));
}

function getCppChannelRuntime() {
  return cppChannelRuntime;
}

export { getCppChannelRuntime, setCppChannelRuntime };