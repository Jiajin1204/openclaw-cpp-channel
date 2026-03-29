import { createServer } from "net";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

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
let cppClient: any = null;
let pluginConfig: CppChannelConfig | null = null;
let apiInstance: OpenClawPluginApi | null = null;

function sendToCpp(obj: any) {
  if (cppClient) {
    cppClient.write(JSON.stringify(obj) + "\n");
  }
}

async function handleCppMessage(msg: CppMessage, api: OpenClawPluginApi) {
  if (msg.type === "send") {
    api.logger.info("Received from C++: " + msg.from + " - " + msg.text);
    
    const gatewayUrl = pluginConfig?.gatewayUrl || "http://127.0.0.1:18790";
    const gatewayToken = pluginConfig?.gatewayToken;
    
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (gatewayToken) {
        headers["Authorization"] = "Bearer " + gatewayToken;
      }
      
      const response = await fetch(gatewayUrl + "/v1/chat/completions", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          model: "openclaw",
          messages: [
            {"role": "user", "content": msg.text}
          ],
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        api.logger.info("Message sent to Gateway");
        
        if (result.choices && result.choices[0] && result.choices[0].message) {
          const replyText = result.choices[0].message.content;
          sendToCpp({ type: "reply", to: msg.from, text: replyText });
        } else {
          sendToCpp({ type: "reply", to: msg.from, text: "[回复] " + JSON.stringify(result) });
        }
      } else {
        const errorText = await response.text();
        api.logger.warn("HTTP " + response.status + ": " + errorText);
        sendToCpp({ type: "reply", to: msg.from, text: "[错误] HTTP " + response.status });
      }
    } catch (e) {
      api.logger.error("Failed to send to Gateway:", e);
      sendToCpp({ type: "reply", to: msg.from, text: "[错误] " + String(e) });
    }
    
    sendToCpp({ type: "ack", id: msg.id });
  } else if (msg.type === "ping") {
    sendToCpp({ type: "pong" });
  }
}

const plugin = {
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration",
  configSchema: emptyPluginConfigSchema(),
  
  register(api: OpenClawPluginApi) {
    api.logger.info("=== C++ Channel plugin register called ===");
    
    pluginConfig = api.pluginConfig as CppChannelConfig || {
      socketPath: "/data/data/com.termux/files/home/openclaw.sock",
      httpPort: 19999,
    };
    apiInstance = api;
    
    const cfg = api.config as any;
    const gatewayToken = cfg?.gateway?.auth?.token;
    if (!pluginConfig.gatewayToken && gatewayToken) {
      pluginConfig.gatewayToken = gatewayToken;
    }
    
    api.logger.info("Gateway Token: " + (pluginConfig.gatewayToken ? "loaded" : "none"));
    
    const socketPath = pluginConfig.socketPath || "/data/data/com.termux/files/home/openclaw.sock";
    
    api.logger.info("C++ Channel config: socketPath=" + socketPath);
    api.logger.info("Starting Unix Socket Server...");
    
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
            api.logger.info("Socket received: " + JSON.stringify(msg));
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

    socketServer.on("error", (err) => {
      api.logger.error("Socket server error:", err);
    });

    socketServer.listen(socketPath, () => {
      api.logger.info("Unix Socket server listening on: " + socketPath);
    });
    
    api.logger.info("=== C++ Channel plugin initialization complete ===");
    
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
};

export default plugin;