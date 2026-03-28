/**
 * 简单 Socket Server - 用于 C++ 客户端测试
 * 
 * 运行: node test-server.mjs
 * 
 * 启动后会持续监听，接受连接并 Echo 消息
 */

import { createServer } from "net";
import { unlinkSync, existsSync } from "fs";

const SOCKET_PATH = "/tmp/openclaw.sock";

if (existsSync(SOCKET_PATH)) {
    unlinkSync(SOCKET_PATH);
}

const server = createServer((socket) => {
    console.log("[Server] C++ client connected");
    
    let buffer = "";
    socket.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
                const msg = JSON.parse(line);
                console.log(`[Server] received: ${msg.type} from=${msg.from || '?'} text="${msg.text || ''}"`);
                
                // Echo 回应
                const ackText = msg.type === "send" ? "message received, id=" + msg.id : "pong";
                const response = {
                    type: msg.type === "send" ? "ack" : "echo",
                    id: msg.id,
                    from: "openclaw",
                    to: msg.from,
                    text: ackText
                };
                socket.write(JSON.stringify(response) + "\n");
                console.log(`[Server] sent: ${response.type} for id=${msg.id}`);
            } catch (e) {
                console.log("[Server] parse error:", e.message);
            }
        }
    });
    
    socket.on("close", () => {
        console.log("[Server] client disconnected");
    });
    
    socket.on("error", (err) => {
        console.log("[Server] socket error:", err.message);
    });
});

server.listen(SOCKET_PATH, () => {
    console.log(`========================================`);
    console.log(`Server listening on: ${SOCKET_PATH}`);
    console.log(`等待 C++ 客户端连接...`);
    console.log(`========================================`);
    console.log(`按 Ctrl+C 停止`);
});

server.on("error", (err) => {
    console.error("Server error:", err.message);
});

process.on("SIGINT", () => {
    console.log("\n[Server] 关闭中...");
    server.close(() => {
        if (existsSync(SOCKET_PATH)) {
            unlinkSync(SOCKET_PATH);
        }
        console.log("[Server] 已关闭");
        process.exit(0);
    });
});