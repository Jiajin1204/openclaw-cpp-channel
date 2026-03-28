import { createServer, net } from "net";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

interface CppChannelConfig {
  socketPath: string;
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
let cppClient: any = null;

// 发送消息给 C++ 客户端
function sendToCpp(obj: any) {
  if (cppClient) {
    cppClient.write(JSON.stringify(obj) + "\n");
  }
}

// 创建 Channel Plugin
function createCppChannelPlugin(api: OpenClawPluginApi): ChannelPlugin {
  const config: CppChannelConfig = api.pluginConfig as CppChannelConfig || {
    socketPath: "/tmp/openclaw.sock",
  };

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
        // 启动 Unix Socket Server
        const socketPath = config.socketPath || "/tmp/openclaw.sock";
        
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
          api.logger.error("Server error:", err);
        });
      },
      stop: async () => {
        if (socketServer) {
          socketServer.close();
          socketServer = null;
        }
        if (cppClient) {
          cppClient.end();
          cppClient = null;
        }
      },
    },
  };
}

// 处理来自 C++ 的消息
async function handleCppMessage(msg: CppMessage, api: OpenClawPluginApi) {
  if (msg.type === "send") {
    api.logger.info(`Received from C++: ${msg.from} - ${msg.text}`);
    
    // TODO: 注入消息到 agent 处理流程
    // 这需要通过 channel 的 inbound 机制或直接调用 runtime
    
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
  description: "Unix Socket channel for C++ Native service integration",
  plugin: {} as ChannelPlugin, // 动态创建
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