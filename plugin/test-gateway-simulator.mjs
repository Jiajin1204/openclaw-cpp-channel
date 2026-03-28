/**
 * 模拟 Gateway /agent 接口的测试服务器
 * 
 * 运行: node test-gateway-simulator.mjs
 * 
 * 模拟 OpenClaw Gateway 的 /agent 接口
 * 监听在 18789 端口
 */

import { createServer } from "http";

const PORT = 18789;

const server = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 模拟 /agent 接口
    if (req.method === "POST" && (req.url === "/agent" || req.url?.startsWith("/agent"))) {
        let body = "";
        for await (const chunk of req) {
            body += chunk;
        }
        
        try {
            const data = JSON.parse(body);
            console.log("\n========== [模拟 Gateway] 收到消息 ==========");
            console.log(`channel: ${data.channel}`);
            console.log(`sessionKey: ${data.sessionKey}`);
            console.log(`message: ${data.message}`);
            console.log(`idempotencyKey: ${data.idempotencyKey}`);
            console.log("=============================================\n");
            
            // 模拟 Agent 处理（简单返回）
            // 实际 Gateway 会调用 LLM 处理
            
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                runId: "test-run-123",
                sessionKey: data.sessionKey,
                state: "completed",
                text: `[模拟 Agent 回复] 收到你的消息: ${data.message}`,
                reasoning: null,
            }));
        } catch (e) {
            console.error("Parse error:", e);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
    } else {
        res.writeHead(404);
        res.end("Not found");
    }
});

server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`模拟 Gateway /agent 接口`);
    console.log(`监听: http://localhost:${PORT}/agent`);
    console.log(`========================================`);
    console.log(`按 Ctrl+C 停止`);
    console.log("");
});

server.on("error", (err) => {
    console.error("Server error:", err.message);
});

process.on("SIGINT", () => {
    console.log("\n关闭模拟 Gateway...");
    server.close(() => {
        console.log("已关闭");
        process.exit(0);
    });
});