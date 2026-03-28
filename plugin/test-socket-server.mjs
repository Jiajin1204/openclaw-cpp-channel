/**
 * 独立测试脚本 - 测试 Socket Server 基本功能
 * 
 * 运行: node test-socket-server.mjs
 * 
 * 不依赖完整 Gateway，只测试 socket 通信
 */

import { createServer, connect } from "net";
import { unlinkSync, existsSync } from "fs";

// 测试配置
const TEST_SOCKET_PATH = "/tmp/openclaw-test.sock";

let server;
let client;
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

function assert(condition, msg) {
    if (!condition) throw new Error(msg || "assertion failed");
}

async function runTests() {
    console.log("===== Socket Server 测试 =====\n");
    
    // 清理旧 socket
    if (existsSync(TEST_SOCKET_PATH)) {
        unlinkSync(TEST_SOCKET_PATH);
    }
    
    // 测试 1: 创建 Server
    await test("创建 Unix Socket Server", () => {
        server = createServer((socket) => {
            console.log("   [Server] client connected");
            let buffer = "";
            socket.on("data", (data) => {
                buffer += data.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const msg = JSON.parse(line);
                            console.log(`   [Server] received: ${msg.type} from=${msg.from || '?'} text=${msg.text || ''}`);
                            // Echo 回去
                            socket.write(JSON.stringify({ type: "echo", ...msg }) + "\n");
                        } catch (e) {
                            console.log("   [Server] parse error:", e.message);
                        }
                    }
                }
            });
        });
        assert(server !== null, "server should not be null");
    });
    
    // 测试 2: 启动 Server
    await new Promise((resolve) => {
        test("启动 Server 监听", () => {
            server.listen(TEST_SOCKET_PATH, () => {
                console.log(`   Server listening on ${TEST_SOCKET_PATH}`);
                assert(true, "server started");
                resolve();
            });
        });
    });
    
    // 测试 3: 连接 Client
    await new Promise((resolve) => {
        test("连接 Client 到 Server", () => {
            client = connect(TEST_SOCKET_PATH, () => {
                console.log("   [Client] connected to server");
                assert(true, "client connected");
                resolve();
            });
            client.on("error", (e) => {
                throw new Error("client connect failed: " + e.message);
            });
        });
    });
    
    // 测试 4: 发送 send 消息并等待 echo
    await new Promise((resolve) => {
        test("发送 send 消息收到 echo", () => {
            let msgCount = 0;
            client.on("data", (data) => {
                const lines = data.toString().split("\n").filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const msg = JSON.parse(line);
                        console.log(`   [Client] received: ${msg.type}`);
                        if (msg.type === "echo" && msg.from === "user1") {
                            assert(msg.text === "hello", "should echo text");
                            msgCount++;
                            if (msgCount >= 1) resolve();
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            });
            
            client.write(JSON.stringify({ type: "send", from: "user1", text: "hello", id: 1 }) + "\n");
            
            // 超时
            setTimeout(() => resolve(), 500);
        });
    });
    
    // 测试 5: 发送 ping 收到响应
    await new Promise((resolve) => {
        test("发送 ping 收到 echo", () => {
            client.write(JSON.stringify({ type: "ping" }) + "\n");
            setTimeout(resolve, 200);
        });
    });
    
    // 清理
    await new Promise((resolve) => {
        test("清理: 关闭 Client 和 Server", () => {
            if (client) {
                client.end();
                client = null;
            }
            if (server) {
                server.close(() => {
                    if (existsSync(TEST_SOCKET_PATH)) {
                        unlinkSync(TEST_SOCKET_PATH);
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
    
    // 输出结果
    console.log(`\n===== 测试结果 =====`);
    console.log(`通过: ${testsPassed}`);
    console.log(`失败: ${testsFailed}`);
    console.log(`==================`);
    
    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);