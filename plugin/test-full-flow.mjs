/**
 * 完整测试流程模拟
 * 
 * 运行: node test-full-flow.mjs
 * 
 * 测试流程:
 * 1. 启动模拟 Gateway (端口 18789)
 * 2. 启动 Socket Server (端口 /tmp/openclaw.sock)
 * 3. 模拟 C++ 客户端连接并发送消息
 * 4. 验证消息能正确传递到 Gateway
 */

import { createServer as createHttpServer } from "http";
import { createServer as createSocketServer, connect } from "net";
import { unlinkSync, existsSync } from "fs";

const SOCKET_PATH = "/tmp/openclaw.sock";
const GATEWAY_PORT = 18789;

let gatewayServer;
let socketServer;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    return new Promise((resolve) => {
        try {
            fn();
            console.log(`✅ ${name}`);
            testsPassed++;
            resolve();
        } catch (e) {
            console.log(`❌ ${name}: ${e.message}`);
            testsFailed++;
            resolve();
        }
    });
}

// ========== 1. 启动模拟 Gateway ==========
async function startGateway() {
    return new Promise((resolve) => {
        gatewayServer = createHttpServer(async (req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            
            if (req.method === "OPTIONS") {
                res.writeHead(200);
                res.end();
                return;
            }
            
            if (req.method === "POST" && req.url === "/agent") {
                let body = "";
                for await (const chunk of req) {
                    body += chunk;
                }
                
                const data = JSON.parse(body);
                console.log(`   [Gateway] 收到消息: channel=${data.channel}, message="${data.message}"`);
                
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    ok: true,
                    runId: "test-run-123",
                    text: `模拟回复: ${data.message}`,
                }));
            }
        });
        
        gatewayServer.listen(GATEWAY_PORT, () => {
            console.log(`   Gateway 模拟服务器: http://localhost:${GATEWAY_PORT}`);
            resolve();
        });
    });
}

// ========== 2. 启动 Socket Server ==========
async function startSocketServer() {
    return new Promise((resolve) => {
        if (existsSync(SOCKET_PATH)) {
            unlinkSync(SOCKET_PATH);
        }
        
        socketServer = createSocketServer((socket) => {
            console.log("   [Socket] C++ 客户端连接");
            
            let buffer = "";
            socket.on("data", (data) => {
                buffer += data.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const msg = JSON.parse(line);
                        console.log(`   [Socket] 收到: type=${msg.type}, from=${msg.from}, text="${msg.text}"`);
                        
                        // 模拟调用 Gateway
                        callGateway(msg).then(() => {
                            // 发送 ack
                            socket.write(JSON.stringify({ type: "ack", id: msg.id }) + "\n");
                        });
                    } catch (e) {
                        console.log("   [Socket] 解析错误:", e.message);
                    }
                }
            });
            
            socket.on("close", () => {
                console.log("   [Socket] 客户端断开");
            });
        });
        
        socketServer.listen(SOCKET_PATH, () => {
            console.log(`   Socket 服务器: ${SOCKET_PATH}`);
            resolve();
        });
    });
}

// ========== 3. 调用 Gateway ==========
async function callGateway(msg) {
    return new Promise((resolve) => {
        const options = {
            hostname: "localhost",
            port: GATEWAY_PORT,
            path: "/agent",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        };
        
        const req = require("http").request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                console.log(`   [Gateway] 返回: ${data.substring(0, 100)}`);
                resolve();
            });
        });
        
        req.write(JSON.stringify({
            message: msg.text,
            channel: "cpp-channel",
            sessionKey: `cpp:${msg.from}`,
            idempotencyKey: `test-${Date.now()}`,
        }));
        req.end();
    });
}

// ========== 4. 模拟 C++ 客户端发送消息 ==========
async function simulateCppClient() {
    return new Promise((resolve) => {
        const client = connect(SOCKET_PATH, () => {
            console.log("\n   [C++] 连接到 Socket Server");
            
            // 发送测试消息
            const msg = {
                type: "send",
                from: "user123",
                text: "你好，OpenClaw！",
                id: 1,
            };
            
            client.write(JSON.stringify(msg) + "\n");
            console.log(`   [C++] 发送: ${JSON.stringify(msg)}`);
        });
        
        client.on("data", (data) => {
            const response = data.toString().trim();
            if (response) {
                console.log(`   [C++] 收到回复: ${response}`);
            }
        });
        
        client.on("close", () => {
            console.log("   [C++] 连接关闭");
            resolve();
        });
        
        client.on("error", (err) => {
            console.log("   [C++] 错误:", err.message);
            resolve();
        });
        
        // 超时自动关闭
        setTimeout(() => {
            client.end();
            resolve();
        }, 2000);
    });
}

// ========== 运行测试 ==========
async function runTests() {
    console.log("\n========== 完整流程测试 ==========\n");
    
    // 测试 1: 启动 Gateway
    await test("启动模拟 Gateway", () => startGateway());
    
    // 测试 2: 启动 Socket Server
    await test("启动 Socket Server", () => startSocketServer());
    
    // 测试 3: 模拟 C++ 客户端发送消息
    await test("模拟 C++ 发送消息并收到回复", () => simulateCppClient());
    
    // 清理
    await test("清理", () => {
        if (socketServer) socketServer.close();
        if (gatewayServer) gatewayServer.close();
        if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
    });
    
    // 结果
    console.log(`\n========== 测试结果 ==========`);
    console.log(`通过: ${testsPassed}`);
    console.log(`失败: ${testsFailed}`);
    console.log(`==============================\n`);
    
    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);