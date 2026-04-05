/**
 * cpp-channel - Standard OpenClaw Channel Plugin
 * 
 * 遵循 OpenClaw 标准：使用 handleInboundMessage 让 OpenClaw 管理会话历史
 */

import { createServer, type Socket } from "net";
import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import { setCppChannelRuntime, getCppChannelRuntime } from "./runtime.js";

// Local runtime state (used when receiving messages before runtime is set)
let cppChannelRuntime: any = null;

import type { CppChannelConfig, CppInboundMessage } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const CHANNEL_ID = "cpp-channel";
const DEFAULT_SOCKET_PATH = "/tmp/openclaw.sock";

// ============================================================================
// Configuration
// ============================================================================

function resolveCppChannelConfig(cfg: any): CppChannelConfig {
  const channels = cfg?.channels ?? {};
  return channels[CHANNEL_ID] ?? {};
}

function resolveSocketPath(cfg: any): string {
  return resolveCppChannelConfig(cfg).socketPath ?? DEFAULT_SOCKET_PATH;
}

function resolveTcpPort(cfg: any): number {
  return resolveCppChannelConfig(cfg).tcpPort ?? 8022;
}

function resolveStreamEnabled(cfg: any): boolean {
  return resolveCppChannelConfig(cfg).stream ?? true;
}

function resolveAccount(cfg: any, accountId: string = DEFAULT_ACCOUNT_ID): any {
  const accounts = cfg?.accounts ?? {};
  return accounts[accountId] ?? {};
}

function resolveDmPolicy(account: any): string {
  return account.config?.dmPolicy ?? "allow";
}

function resolveAllowFrom(account: any): string[] {
  return account.config?.allowFrom ?? [];
}

// Check if sender is allowed
function isCppSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  for (const entry of allowFrom) {
    if (entry === "*" || entry === senderId) return true;
  }
  return false;
}

// ============================================================================
// Socket Server
// ============================================================================

let cppSocket: Socket | null = null;
const senderSockets = new Map<string, Socket>(); // senderId -> Socket

function startSocketServer(cfg: any, accountId: string = DEFAULT_ACCOUNT_ID) {
  const socketPath = resolveSocketPath(cfg);
  
  // Close existing server
  if (cppSocket) {
    cppSocket.close();
    cppSocket = null;
  }
  
  const server = createServer((socket) => {
    console.log(`[cpp-channel] Client connected from ${socket.remoteAddress}`);
    
    let buffer = "";
    
    socket.on("data", async (data) => {
      buffer += data.toString();
      
      // Process complete JSON messages (split by newlines)
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const msg = JSON.parse(line) as CppInboundMessage;
          console.log("[cpp-channel] Raw message:", line);
          console.log("[cpp-channel] Parsed msg:", JSON.stringify(msg));
          // Store socket before processing
          const senderId = msg.from || "unknown";
          senderSockets.set(senderId, socket);
          await handleCppMessage(socket, msg, cfg, accountId);
        } catch (e) {
          console.error("[cpp-channel] Failed to parse message:", e);
        }
      }
    });
    
    socket.on("close", () => {
      console.log(`[cpp-channel] Client disconnected`);
    });
    
    socket.on("error", (err) => {
      console.error("[cpp-channel] Socket error:", err);
    });
  });
  
  // Clean up old socket file
  try { require("fs").unlinkSync(socketPath); } catch {}
  
  // Listen on Unix socket
  server.listen(socketPath, () => {
    console.log(`[cpp-channel] [${accountId}] Unix socket server listening on ${socketPath}`);
  });
  
  cppSocket = server as unknown as Socket;
}

// Handle incoming message from C++ client
async function handleCppMessage(
  socket: Socket,
  msg: CppInboundMessage,
  cfg: any,
  accountId: string
) {
  const senderId = msg.from || "unknown";
  
  // Store socket for this sender
  senderSockets.set(senderId, socket);
  
  const account = resolveAccount(cfg, accountId);
  
  // Check DM policy
  if (resolveDmPolicy(account) === "disabled") {
    sendToSocket(senderId, "reply", "[Direct messages are disabled]");
    return;
  }
  
  if (resolveDmPolicy(account) === "allowlist" && !isCppSenderAllowed(senderId, resolveAllowFrom(account))) {
    sendToSocket(senderId, "reply", "[Your ID is not in the allowlist]");
    return;
  }
  
  // Send acknowledgment immediately
  sendToSocket(senderId, "ack", msg.id);

  // Wait for runtime to be ready (it may take a few seconds after plugin loads)
  if (!cppChannelRuntime) {
    console.log("[cpp-channel] Waiting for runtime to be ready...");
    for (let i = 0; i < 10 && !cppChannelRuntime; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Get runtime from storage
  const runtime = cppChannelRuntime || getCppChannelRuntime();
  
  // Debug: log available runtime keys
  if (!runtime) {
    console.error("[cpp-channel] runtime is undefined!");
    sendToSocket(senderId, "reply", "[Error: runtime not ready]");
    return;
  }
  
  console.log("[cpp-channel] runtime keys:", Object.keys(runtime));
  console.log("[cpp-channel] runtime.reply:", typeof runtime.reply);
  console.log("[cpp-channel] runtime.routing:", typeof runtime.routing);
  console.log("[cpp-channel] runtime.session:", typeof runtime.session);

  // Debug: log runtime.reply available methods
  console.log("[cpp-channel] runtime.reply methods:", runtime.reply ? Object.keys(runtime.reply) : "undefined");
  console.log("[cpp-channel] runtime.outbound methods:", runtime.outbound ? Object.keys(runtime.outbound) : "undefined");

  // Access reply via runtime.reply (not runtime.channel.reply!)
  if (!runtime?.reply) {
    console.error("[cpp-channel] runtime.reply is undefined!");
    console.error("[cpp-channel] runtime keys:", Object.keys(runtime));
    sendToSocket(senderId, "reply", "[Error: channel not ready]");
    return;
  }
  
  // Forward to OpenClaw's message pipeline using runtime directly
  try {
    // Build route - peer must be { kind: "direct", id: string }
    const route = await runtime.routing.resolveAgentRoute({
      cfg,
      channel: CHANNEL_ID,
      accountId,
      peer: { kind: "direct", id: senderId },
    });

    if (!route?.agentId) {
      sendToSocket(senderId, "reply", "[Error: no agent configured]");
      return;
    }

    // Get store path for session recording
    const storeValue = typeof cfg.session?.store === "string" ? cfg.session?.store : undefined;
    const storePath = runtime.session.resolveStorePath(storeValue, { agentId: accountId });

    // Create context payload - NOTE: parameters must be PascalCase!
    const ctxPayload = runtime.reply.finalizeInboundContext({
      Body: msg.text,
      BodyForAgent: msg.text,
      RawBody: msg.text,
      From: senderId,
      To: CHANNEL_ID,
      SessionKey: route.sessionKey,
      AccountId: accountId,
      ChatType: "direct",
      ConversationLabel: senderId,
      SenderId: senderId,
      Provider: CHANNEL_ID,
      Surface: CHANNEL_ID,
      MessageSid: `cpp-${Date.now()}`,
      MessageSidFull: `cpp-${Date.now()}`,
      Timestamp: Date.now(),
      CommandAuthorized: false,
      OriginatingChannel: CHANNEL_ID,
      OriginatingTo: CHANNEL_ID,
    });

    // First, record the inbound session
    await runtime.session.recordInboundSession({
      storePath,
      sessionKey: route.sessionKey,
      ctx: ctxPayload,
      onRecordError: (err) => {
        console.error("[cpp-channel] Failed to record session:", err);
      },
    });

    // Create the deliver function for streaming responses
    const deliver = async (payload: any, info: any) => {
      // Handle streaming chunks
      if (info.kind === "chunk") {
        sendToSocket(senderId, "chunk", payload.text || "");
      }
      // Handle final message
      else if (info.kind === "final") {
        sendToSocket(senderId, "reply", payload.text);
        sendToSocket(senderId, "done", 1);
      }
    };

    // Now dispatch the reply
    console.log("[cpp-channel] Dispatching message to AI...");
    await runtime.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver,
        onError: (err, info) => {
          console.error("[cpp-channel] Dispatch error:", err, info);
        },
      },
    });
    console.log("[cpp-channel] Dispatch call completed");
  } catch (e) {
    console.error("[cpp-channel] Failed to dispatch message:", e);
    sendToSocket(senderId, "reply", "[Error: " + (e as Error).message + "]");
  }
}

// Send message to C++ client
function sendToSocket(senderId: string, type: string, content?: string | number) {
  const socket = senderSockets.get(senderId);
  if (!socket || socket.destroyed || !socket.writable) return;
  
  const msg: Record<string, unknown> = {
    type,
    to: senderId,
    timestamp: Date.now(),
  };
  
  if (content !== undefined) {
    // 兼容 C++ 客户端: reply/chunk 用 text，ack 用 content/id
    if (type === "reply" || type === "chunk") {
      msg.text = content;
    } else {
      msg.content = content;
    }
  }
  
  try {
    socket.write(JSON.stringify(msg) + "\n");
  } catch (e) {
    console.error("[cpp-channel] Socket write error:", e);
  }
}

// ============================================================================
// Plugin Definition
// ============================================================================

export const cppChannelPlugin: ChannelPlugin = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "C++ Channel",
    selectionLabel: "C++",
    docsPath: "/channels/cpp-channel",
    docsLabel: "cpp-channel",
    blurb: "Unix Socket channel for C++ Native service integration",
    order: 100,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
  },
  reload: { configPrefixes: ["channels.cpp-channel"] },
  configSchema: buildChannelConfigSchema({
    type: "object",
    additionalProperties: false,
    properties: {
      socketPath: { type: "string", default: DEFAULT_SOCKET_PATH },
      stream: { type: "boolean", default: true },
    },
  }),

  config: {
    listAccountIds: (cfg) => Object.keys(cfg?.accounts ?? {}).length ? Object.keys(cfg.accounts) : [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: () => true,
    describeAccount: (account) => ({
      accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
      name: "C++ Channel",
      enabled: account.enabled ?? true,
      configured: true,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => resolveAllowFrom(resolveAccount(cfg, accountId)),
    formatAllowFrom: ({ allowFrom }) => allowFrom.map(String),
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

  status: {},

  gateway: {
    startAccount: async (ctx) => {
      const cfg = ctx.cfg;
      const accountId = ctx.account?.accountId ?? DEFAULT_ACCOUNT_ID;
      ctx.log?.info(`[${accountId}] Starting C++ Channel socket server`);

      // Debug: log what's in ctx
      console.log("[cpp-channel] ctx keys:", Object.keys(ctx));
      console.log("[cpp-channel] ctx.runtime:", ctx.runtime ? "defined" : "undefined");
      console.log("[cpp-channel] ctx.channelRuntime:", ctx.channelRuntime ? "defined" : "undefined");

      // Try to find the correct runtime - check both ctx.runtime and ctx.channelRuntime
      const possibleRuntime = ctx.channelRuntime || ctx.runtime;
      if (possibleRuntime) {
        console.log("[cpp-channel] Found runtime with keys:", Object.keys(possibleRuntime));
        console.log("[cpp-channel] runtime.reply:", typeof possibleRuntime.reply);
        console.log("[cpp-channel] runtime.channel:", possibleRuntime.channel ? Object.keys(possibleRuntime.channel) : "undefined");
      } else {
        console.log("[cpp-channel] WARNING: No runtime found in ctx!");
      }

      // Set runtime - note: ctx.runtime and ctx.channelRuntime may have different structures
      // ctx.runtime has reply, routing, session directly
      // ctx.channelRuntime may have them under channel or directly
      setCppChannelRuntime(possibleRuntime);
      cppChannelRuntime = possibleRuntime;

      startSocketServer(cfg, accountId);
      
      // Return cleanup function
      return {
        stop: () => {
          cppSocket?.close();
          cppSocket = null;
          senderSockets.clear();
          ctx.log?.info(`[${accountId}] C++ Channel socket server stopped`);
        },
      };
    },
  },

  // actions are optional - don't define empty object, let the framework handle it
};

// ============================================================================
// Exports
// ============================================================================

export type { CppChannelConfig, CppInboundMessage } from "./types.js";