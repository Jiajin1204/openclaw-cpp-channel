/**
 * cpp-channel - Standard OpenClaw Channel Plugin (Phase 3)
 * 
 * Implementing dispatchInboundDirectDmWithRuntime for OpenClaw session management.
 * Phase 3: Integrate with OpenClaw's session system for proper history management.
 */

import { createServer, type Socket } from "net";
import type { ChannelId } from "openclaw/plugin-sdk";
import type { ChannelPlugin, ChannelMessageActionAdapter } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { createTopLevelChannelConfigAdapter } from "openclaw/plugin-sdk/channel-config-helpers";
import { createComputedAccountStatusAdapter } from "openclaw/plugin-sdk/status-helpers";
import { createDefaultChannelRuntimeState } from "openclaw/plugin-sdk/direct-dm";
import {
  dispatchInboundDirectDmWithRuntime,
  resolveInboundDirectDmAccessWithRuntime,
} from "openclaw/plugin-sdk/direct-dm";
import type { DirectDmCommandAuthorizationRuntime } from "openclaw/plugin-sdk/direct-dm";

import type { CppChannelConfig, CppInboundMessage } from "./types.js";
import { getCppChannelRuntime } from "./runtime.js";

// ============================================================================
// Constants
// ============================================================================

const CHANNEL_ID: ChannelId = "cpp-channel";
const DEFAULT_SOCKET_PATH = "/tmp/openclaw.sock";

// ============================================================================
// Configuration
// ============================================================================

function resolveCppChannelConfig(cfg: any): CppChannelConfig {
  const channels = cfg?.channels ?? {};
  return channels[CHANNEL_ID] ?? {};
}

function resolveSocketPath(cfg: any): string {
  const config = resolveCppChannelConfig(cfg);
  return config.socketPath ?? DEFAULT_SOCKET_PATH;
}

function resolveStreamEnabled(cfg: any): boolean {
  const config = resolveCppChannelConfig(cfg);
  return config.stream !== false;
}

function resolveDmPolicy(cfg: any): "open" | "pairing" | "allowlist" | "disabled" {
  const config = resolveCppChannelConfig(cfg);
  return config.dmPolicy ?? "open";
}

function resolveAllowFrom(cfg: any): string[] {
  const config = resolveCppChannelConfig(cfg);
  return config.allowFrom ?? ["*"];
}

// ============================================================================
// Account Resolution
// ============================================================================

interface ResolvedCppChannelAccount {
  accountId: string;
  configured: boolean;
  config: {
    socketPath: string;
    stream: boolean;
    dmPolicy: "open" | "pairing" | "allowlist" | "disabled";
    allowFrom: string[];
  };
}

function resolveDefaultAccountId(): string {
  return DEFAULT_ACCOUNT_ID;
}

function resolveAccount(cfg: any, accountId?: string): ResolvedCppChannelAccount {
  const config = resolveCppChannelConfig(cfg);
  return {
    accountId: accountId ?? DEFAULT_ACCOUNT_ID,
    configured: true,
    config: {
      socketPath: config.socketPath ?? DEFAULT_SOCKET_PATH,
      stream: config.stream !== false,
      dmPolicy: config.dmPolicy ?? "open",
      allowFrom: config.allowFrom ?? ["*"],
    },
  };
}

// ============================================================================
// Socket Communication
// ============================================================================

let cppSocket: Socket | null = null;
let messageBuffer = "";
let server: ReturnType<typeof createServer> | null = null;

function sendToSocket(to: string, type: string, text?: string) {
  if (!cppSocket) return;
  
  const msg: any = { type, to };
  if (text !== undefined) msg.text = text;
  
  cppSocket.write(JSON.stringify(msg) + "\n");
}

function isCppSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  for (const entry of allowFrom) {
    if (entry === "*" || entry === senderId) return true;
  }
  return false;
}

async function handleCppMessage(msg: CppInboundMessage, cfg: any, accountId: string) {
  const senderId = msg.from || "unknown";
  const account = resolveAccount(cfg, accountId);
  
  // Check DM policy
  if (account.config.dmPolicy === "disabled") {
    sendToSocket(senderId, "reply", "[Direct messages are disabled]");
    return;
  }
  
  if (account.config.dmPolicy === "allowlist" && !isCppSenderAllowed(senderId, account.config.allowFrom)) {
    sendToSocket(senderId, "reply", "[Your ID is not in the allowlist]");
    return;
  }
  
  // Get runtime
  const runtime = getCppChannelRuntime();
  
  // Create command authorization runtime
  const commandRuntime: DirectDmCommandAuthorizationRuntime = {
    shouldComputeCommandAuthorized: () => false,
    resolveCommandAuthorizedFromAuthorizers: () => false,
  };
  
  // Resolve access policy
  const resolvedAccess = await resolveInboundDirectDmAccessWithRuntime({
    cfg,
    channel: CHANNEL_ID,
    accountId,
    dmPolicy: account.config.dmPolicy,
    allowFrom: account.config.allowFrom,
    senderId,
    rawBody: msg.text,
    isSenderAllowed: isCppSenderAllowed,
    runtime: commandRuntime,
  });
  
  if (resolvedAccess.access.decision !== "allow") {
    sendToSocket(senderId, "reply", `[Access blocked: ${resolvedAccess.access.reasonCode}]`);
    return;
  }
  
  // Send acknowledgment immediately
  sendToSocket(senderId, "ack", undefined);
  
  // Stream setting
  const streamEnabled = resolveStreamEnabled(cfg);
  
  // Dispatch to OpenClaw via standard channel interface with full session management
  await dispatchInboundDirectDmWithRuntime({
    cfg,
    runtime: runtime as any,
    channel: CHANNEL_ID,
    channelLabel: "C++",
    accountId,
    peer: { kind: "direct", id: senderId },
    senderId,
    senderAddress: `cpp:${senderId}`,
    recipientAddress: `cpp:default`,
    conversationLabel: senderId,
    rawBody: msg.text,
    messageId: `cpp-${msg.id}-${Date.now()}`,
    timestamp: Date.now(),
    commandAuthorized: resolvedAccess.commandAuthorized,
    deliver: async (payload: any) => {
      const text = typeof payload === "object" && "text" in payload
        ? String(payload.text ?? "")
        : String(payload ?? "");
      
      if (!text.trim()) return;
      
      if (streamEnabled) {
        // Stream each character
        for (const char of text) {
          sendToSocket(senderId, "chunk", char);
        }
        sendToSocket(senderId, "done");
      } else {
        sendToSocket(senderId, "reply", text);
      }
    },
    onRecordError: (err) => {
      // Error logging
    },
    onDispatchError: (err, info) => {
      sendToSocket(senderId, "reply", `[Error: ${String(err)}]`);
    },
  });
}

function loadConfig(): any {
  const fs = require("fs");
  const configPaths = [
    "/data/data/com.termux/files/home/.openclaw/openclaw.json",
    "/home/jason/.openclaw/openclaw.json",
    process.env.OPENCLAW_DIR ? `${process.env.OPENCLAW_DIR}/openclaw.json` : null,
  ].filter(Boolean);
  
  for (const p of configPaths) {
    if (p && fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  return {};
}

function startSocketServer(cfg: any, accountId: string) {
  const socketPath = resolveSocketPath(cfg);
  
  // Close existing server and socket
  if (cppSocket) {
    cppSocket.destroy();
    cppSocket = null;
  }
  if (server) {
    server.close();
  }
  
  // Remove old socket file
  try {
    const fs = require("fs");
    fs.unlinkSync(socketPath);
  } catch (e) {
    // Ignore
  }
  
  server = createServer((socket) => {
    cppSocket = socket;
    messageBuffer = "";
    
    socket.on("data", async (data) => {
      messageBuffer += data.toString();
      const lines = messageBuffer.split("\n");
      messageBuffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const msg = JSON.parse(line) as CppInboundMessage;
          
          if (msg.type === "send") {
            await handleCppMessage(msg, cfg, accountId);
          } else if (msg.type === "ping") {
            socket.write(JSON.stringify({ type: "pong" }) + "\n");
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
    
    socket.on("close", () => {
      cppSocket = null;
    });
  });
  
  server.on("error", (err) => {
    // Server error
  });
  
  server.listen(socketPath, () => {
    // Server listening
  });
}

// ============================================================================
// Plugin Definition
// ============================================================================

export const cppChannelPlugin: ChannelPlugin = {
  id: CHANNEL_ID,
  
  meta: {
    name: "C++ Channel",
    description: "Unix Socket channel for C++ Native service integration",
  },
  
  config: createTopLevelChannelConfigAdapter({
    channelKey: CHANNEL_ID,
    resolveAccount,
    resolveDefaultAccountId,
  }),
  
  configSchema: {
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: true },
        socketPath: { 
          type: "string", 
          default: DEFAULT_SOCKET_PATH, 
          description: "Unix Socket file path",
        },
        stream: { 
          type: "boolean", 
          default: true, 
          description: "Enable streaming output",
        },
        dmPolicy: { 
          type: "string", 
          enum: ["open", "pairing", "allowlist", "disabled"],
          default: "open",
        },
        allowFrom: { 
          type: "array", 
          items: { type: "string" }, 
          default: ["*"],
        },
      },
    },
  },
  
  capabilities: {
    dm: true,
    group: false,
    inbound: true,
    outbound: true,
  },
  
  defaults: {
    queue: { debounceMs: 100 },
  },
  
  messaging: {
    normalizeTarget: ({ raw }) => ({ to: raw, chatType: "direct" as const }),
    parseExplicitTarget: ({ raw }) => ({ to: raw, chatType: "direct" as const }),
    inferTargetChatType: () => "direct" as const,
    formatTargetDisplay: ({ target }) => target,
    resolveOutboundSessionRoute: ({ to, accountId }) => ({
      channel: CHANNEL_ID,
      accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      threadId: to,
    }),
  },
  
  lifecycle: {
    onAccountConfigChanged: async ({ prevCfg, nextCfg }) => {
      const prevPath = resolveSocketPath(prevCfg);
      const nextPath = resolveSocketPath(nextCfg);
      if (prevPath !== nextPath) {
        startSocketServer(nextCfg, DEFAULT_ACCOUNT_ID);
      }
    },
  },
  
  outbound: {
    base: {
      deliveryMode: "direct",
      sendPayload: async ({ to, payload }) => {
        const text = typeof payload === "object" && "text" in payload
          ? String(payload.text ?? "")
          : String(payload ?? "");
        
        if (!cppSocket || !text.trim()) {
          return { success: false };
        }
        
        sendToSocket(to, "reply", text);
        return { success: true };
      },
    },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ to, text }) => {
        if (!cppSocket) return { success: false };
        sendToSocket(to, "reply", text);
        return { messageId: `cpp-${Date.now()}` };
      },
    },
  },
  
  status: createComputedAccountStatusAdapter({
    channelKey: CHANNEL_ID,
    resolveAccount,
    defaultAccountId: DEFAULT_ACCOUNT_ID,
  }),
  
  gateway: {
    startAccount: async (ctx) => {
      const cfg = ctx.cfg;
      const accountId = ctx.account?.accountId ?? DEFAULT_ACCOUNT_ID;
      ctx.log?.info(`[${accountId}] Starting C++ Channel socket server`);
      
      // Create default runtime for dispatchInboundDirectDmWithRuntime
      const defaultRuntime = createDefaultChannelRuntimeState(accountId);
      
      // Initialize runtime with config loader
      const { setCppChannelRuntime } = await import("./runtime.js");
      setCppChannelRuntime({
        ...defaultRuntime,
        config: {
          loadConfig: () => ctx.cfg,
        },
        channel: {
          ...defaultRuntime.channel,
          commands: {
            shouldComputeCommandAuthorized: () => false,
            resolveCommandAuthorizedFromAuthorizers: () => false,
          },
        },
      } as any);
      
      startSocketServer(cfg, accountId);
    },
  },
  
  actions: {} as Record<string, ChannelMessageActionAdapter>,
};

// ============================================================================
// Exports
// ============================================================================

export type { CppChannelConfig, CppInboundMessage } from "./types.js";