import { createServer } from "net";
import { createServer as createHttpServer } from "http";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

interface CppChannelConfig {
  socketPath: string;
  httpPort?: number;
  gatewayUrl?: string;
  gatewayToken?: string;
  accounts?: Record<string, { enabled?: boolean }>;
}

interface CppMessage {
  type: string;
  from?: string;
  to?: string;
  text?: string;
  id?: number;
}

let socketServer: ReturnType<typeof createServer> | null = null;
let httpServer: ReturnType<typeof createHttpServer> | null = null;
let cppClient: any = null;
let pluginConfig: CppChannelConfig | null = null;
let apiInstance: OpenClawPluginApi | null = null;

// 发送消息给 C++ 客户端
function sendToCpp(obj: any) {
  if (cppClient) {
    cppClient.write(JSON.stringify(obj) + "\n");
  }
}

// 调用 Gateway 的 /agent 接口发送消息到 Agent
async function injectToAgent(from: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!pluginConfig || !apiInstance) {
    return { ok: false, error: "Plugin not initialized" };
  }
  
  const gatewayUrl = pluginConfig.gatewayUrl || "http://127.0.0.1:18789";
  const gatewayToken = pluginConfig.gatewayToken;
  
  try {
    const response = await fetch(`${gatewayUrl}/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gatewayToken ? { "Authorization": `Bearer ${gatewayToken}` } : {}),
      },
      body: JSON.stringify({
        message: text,
        channel: "cpp-channel",
        sessionKey: `cpp:${from}`,
        idempotencyKey: `cpp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }),
    });
    
    if (response.ok) {
      const result = await response.json();
      apiInstance.logger.info(`Message injected to agent: ${JSON.stringify(result)}`);
      return { ok: true };
    } else {
      const error = await response.text();
      apiInstance.logger.error(`Failed to inject message: ${response.status} ${error}`);
      return { ok: false, error: `HTTP ${response.status}: ${error}` };
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    apiInstance.logger.error(`Failed to inject message: ${error}`);
    return { ok: false, error };
  }
}

// 创建 Channel Plugin
function createCppChannelPlugin(api: OpenClawPluginApi): ChannelPlugin {
  pluginConfig = api.pluginConfig as CppChannelConfig || {
    socketPath: "/tmp/openclaw.sock",
    httpPort: 18999,
  };
  apiInstance = api;

  // 从全局 config 获取 gateway token
  const cfg = api.config as OpenClawConfig;
  const gatewayToken = cfg.gateway?.auth?.token;
  
  // 如果配置中没有 token，使用全局配置的
  if (!pluginConfig.gatewayToken && gatewayToken) {
    pluginConfig.gatewayToken = gatewayToken;
  }

  return {
    id: "cpp-channel",
    meta: {
      id: "cpp-channel",
      label: "C++ Channel",
      selectionLabel: "C++ Channel (Unix Socket)",
      docsPath: "/channels/cpp-channel",
      blurb: "Unix Socket channel for C++ Native service integration",
      aliases: ["cpp", "cppchannel"],
    },
    capabilities: {
      chatTypes: ["direct"],
      media: [],
      reactions: false,
      threads: false,
    },
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => ({ accountId: "default" }),
    },
    outbound: {
      deliveryMode: "direct",
      sendText: async ({ text, to }) => {
        // Agent 回复 -> 发送给 C++
        sendToCpp({ type: "reply", to, text });
        return { ok: true, messageId: `msg-${Date.now()}` };
      },
    },
    lifecycle: {
      start: async () => {
        const socketPath = pluginConfig?.socketPath || "/tmp/openclaw.sock";
        
        // ========== 1. 启动 Unix Socket Server ==========
        socketServer = createServer((socket) => {
          api.logger.info("C++ client connected");
          cppClient = socket;

          let buffer = "";
          socket.on("data", (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg: CppMessage = JSON.parse(line);
                handleCppMessage(msg, api);
              } catch (e) {
                api.logger.error("Failed to parse message:", e);
              }
            }
          });

          socket.on("close", () => {
            api.logger.info("C++ client disconnected");
            cppClient = null;
          });

          socket.on("error", (err) => {
            api.logger.error("Socket error:", err);
          });
        });

        socketServer.listen(socketPath, () => {
          api.logger.info(`Unix Socket server: ${socketPath}`);
        });

        socketServer.on("error", (err) => {
          api.logger.error("Socket server error:", err);
        });

        // ========== 2. 启动 HTTP Server (用于注入消息到 Agent) ==========
        const httpPort = pluginConfig?.httpPort || 18999;
        
        httpServer = createHttpServer(async (req, res) => {
          // CORS 头
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          
          if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
          }
          
          if (req.method === "POST" && req.url === "/inject") {
            let body = "";
            for await (const chunk of req) {
              body += chunk;
            }
            
            try {
              const data = JSON.parse(body);
              const { from, text } = data;
              
              api.logger.info(`HTTP inject: from=${from} text=${text}`);
              
              // 注入到 Agent
              const result = await injectToAgent(from, text);
              
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(result));
            } catch (e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
            }
          } else {
            res.writeHead(404);
            res.end("Not found");
          }
        });
        
        httpServer.listen(httpPort, () => {
          api.logger.info(`HTTP server for message injection: http://localhost:${httpPort}/inject`);
        });
        
        httpServer.on("error", (err) => {
          api.logger.error("HTTP server error:", err);
        });
      },
      stop: async () => {
        if (socketServer) {
          socketServer.close();
          socketServer = null;
        }
        if (httpServer) {
          httpServer.close();
          httpServer = null;
        }
        if (cppClient) {
          cppClient.end();
          cppClient = null;
        }
        pluginConfig = null;
        apiInstance = null;
      },
    },
  };
}

// 处理来自 C++ 的消息
async function handleCppMessage(msg: CppMessage, api: OpenClawPluginApi) {
  if (msg.type === "send") {
    api.logger.info(`Received from C++: ${msg.from} - ${msg.text}`);
    
    // 注入消息到 Agent 处理流程
    const result = await injectToAgent(msg.from || "unknown", msg.text || "");
    
    if (result.ok) {
      api.logger.info("Message injected to agent successfully");
    } else {
      api.logger.error(`Failed to inject message: ${result.error}`);
    }
    
    // 发送确认
    sendToCpp({ type: "ack", id: msg.id });
  } else if (msg.type === "ping") {
    sendToCpp({ type: "pong" });
  }
}

// 插件入口
export default defineChannelPluginEntry({
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration with HTTP injection",
  plugin: {} as ChannelPlugin,
  register(api) {
    // 注册 Channel
    const channel = createCppChannelPlugin(api);
    api.registerChannel({ plugin: channel as any });

    // 注册工具：C++ 发送消息
    api.registerTool({
      name: "cpp_send",
      description: "Send message to C++ client via Unix socket",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Target user ID" },
          text: { type: "string", description: "Message text" },
        },
        required: ["to", "text"],
      },
      handler: async ({ to, text }: { to: string; text: string }) => {
        sendToCpp({ type: "reply", to, text });
        return { ok: true, sent: true };
      },
    });
  },
});