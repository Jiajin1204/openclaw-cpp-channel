/**
 * cpp-channel - Standard OpenClaw Channel Plugin (Simplified + Stable)
 * 
 * Phase 2: Standard interface with dispatchInboundDirectDmWithRuntime (experimental)
 * Current fallback: HTTP API approach for stability
 */

import { createServer, type Socket } from "net";
import type { ChannelId } from "openclaw/plugin-sdk";
import type { ChannelPlugin, ChannelMessageActionAdapter } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { createTopLevelChannelConfigAdapter } from "openclaw/plugin-sdk/channel-config-helpers";
import { createComputedAccountStatusAdapter } from "openclaw/plugin-sdk/status-helpers";

import type { CppChannelConfig, CppInboundMessage } from "./types.js";
import { setCppChannelRuntime, getCppChannelRuntime } from "./runtime.js";

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

async function handleCppMessage(msg: CppInboundMessage, cfg: any) {
  const accountId = resolveDefaultAccountId();
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
  
  // Send acknowledgment immediately
  sendToSocket(senderId, "ack", undefined);
  
  // Use HTTP API (current stable approach)
  // TODO: Integrate dispatchInboundDirectDmWithRuntime for OpenClaw session management
  const streamEnabled = resolveStreamEnabled(cfg);
  const gatewayUrl = "http://127.0.0.1:18790";
  const gatewayToken = cfg?.gateway?.auth?.token;
  
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (gatewayToken) {
      headers["Authorization"] = "Bearer " + gatewayToken;
    }
    
    const response = await fetch(gatewayUrl + "/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        messages: [{ role: "user", content: msg.text }],
        stream: streamEnabled,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      sendToSocket(senderId, "reply", `[Error: HTTP ${response.status}]`);
      return;
    }
    
    if (streamEnabled) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]" || !data) continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  fullText += content;
                  sendToSocket(senderId, "chunk", content);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }
      
      sendToSocket(senderId, "done");
    } else {
      const result = await response.json();
      if (result.choices?.[0]?.message?.content) {
        sendToSocket(senderId, "reply", result.choices[0].message.content);
      } else {
        sendToSocket(senderId, "reply", "[Empty response]");
      }
    }
  } catch (e) {
    sendToSocket(senderId, "reply", `[Error: ${String(e)}]`);
  }
}

function startSocketServer(cfg: any) {
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
            // Load config from openclaw.json
            const fs = require("fs");
            let cfg = {};
            const configPaths = [
              "/data/data/com.termux/files/home/.openclaw/openclaw.json",
              "/home/jason/.openclaw/openclaw.json",
              process.env.OPENCLAW_DIR ? `${process.env.OPENCLAW_DIR}/openclaw.json` : null,
            ].filter(Boolean);
            
            for (const p of configPaths) {
              if (p && fs.existsSync(p)) {
                cfg = JSON.parse(fs.readFileSync(p, "utf8"));
                break;
              }
            }
            
            await handleCppMessage(msg, cfg);
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
        startSocketServer(nextCfg);
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
      ctx.log?.info(`[${ctx.account?.accountId ?? "default"}] Starting C++ Channel socket server`);
      
      // Initialize runtime (for future dispatchInboundDirectDmWithRuntime integration)
      setCppChannelRuntime({
        config: {
          loadConfig: () => ctx.cfg,
        },
        channel: {
          text: {
            resolveMarkdownTableMode: () => "standard",
            convertMarkdownTables: (text) => text,
          },
          commands: {
            shouldComputeCommandAuthorized: () => false,
            resolveCommandAuthorizedFromAuthorizers: () => false,
          },
        },
      } as any);
      
      startSocketServer(cfg);
    },
  },
  
  actions: {} as Record<string, ChannelMessageActionAdapter>,
};

// ============================================================================
// Exports
// ============================================================================

export type { CppChannelConfig, CppInboundMessage } from "./types.js";