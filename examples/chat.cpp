/**
 * OpenClaw Chat Demo - 实时对话客户端
 * 
 * 编译:
 *   cd client && mkdir -p build && cd build
 *   cmake .. -DBUILD_EXAMPLES=ON -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake -DANDROID_ABI=arm64-v8a
 *   make
 * 
 * 运行:
 *   ./bin/chat                    # 正常模式（不显示心跳）
 *   ./bin/chat --debug            # 调试模式（显示心跳和系统消息）
 * 
 * 功能:
 * - 实时聊天模式，输入消息直接发送
 * - 流式显示 AI 回复
 * - 心跳检测连接状态（debug 模式可见）
 * - Ctrl+C 退出
 */

#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <csignal>
#include <mutex>
#include <cstring>
#include "openclaw_client.h"

using namespace openclaw;

std::atomic<bool> running(true);
std::atomic<bool> connected(false);
std::atomic<bool> debugMode(false);
std::mutex printMutex;

// 流式输出相关
std::string currentReply;
bool waitingForInput = false;

void logDebug(const std::string& msg) {
    if (debugMode) {
        std::lock_guard<std::mutex> lock(printMutex);
        std::cout << "[DEBUG] " << msg << std::endl;
    }
}

void printPrompt() {
    std::lock_guard<std::mutex> lock(printMutex);
    std::cout << std::endl << "你: " << std::flush;
    waitingForInput = true;
}

void clearCurrentReply() {
    std::lock_guard<std::mutex> lock(printMutex);
    currentReply.clear();
}

void appendReply(const std::string& text) {
    std::lock_guard<std::mutex> lock(printMutex);
    // 流式输出前缀
    if (currentReply.empty()) {
        std::cout << "\n[AI]: ";
    }
    currentReply += text;
    std::cout << text << std::flush;
}

void finishReply() {
    std::lock_guard<std::mutex> lock(printMutex);
    waitingForInput = false;
    currentReply.clear();
    std::cout << std::endl << std::endl << "你: " << std::flush;
}

// 心跳检测线程
void heartbeatThread(OpenClawClient* client) {
    while (running && client->isConnected()) {
        std::this_thread::sleep_for(std::chrono::seconds(30));
        if (running && client->isConnected()) {
            if (client->sendPing()) {
                logDebug("心跳已发送");
            }
        }
    }
}

int main(int argc, char* argv[]) {
    // 解析参数
    bool showDebug = false;
    std::string socketPath = "/data/data/com.termux/files/home/openclaw.sock";
    
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--debug") == 0 || strcmp(argv[i], "-d") == 0) {
            showDebug = true;
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            std::cout << "OpenClaw Chat Demo" << std::endl;
            std::cout << "用法: chat [选项] [socket_path]" << std::endl;
            std::cout << "选项:" << std::endl;
            std::cout << "  --debug, -d    显示调试信息（心跳等）" << std::endl;
            std::cout << "  --help, -h     显示帮助信息" << std::endl;
            std::cout << "参数:" << std::endl;
            std::cout << "  socket_path    Unix socket 路径（默认: /data/data/com.termux/files/home/openclaw.sock）" << std::endl;
            return 0;
        } else {
            socketPath = argv[i];
        }
    }
    
    debugMode = showDebug;
    
    // 捕获 Ctrl+C
    std::signal(SIGINT, [](int) {
        running = false;
        std::lock_guard<std::mutex> lock(printMutex);
        std::cout << "\n收到退出信号，正在关闭..." << std::endl;
    });
    
    std::cout << "╔══════════════════════════════════╗" << std::endl;
    std::cout << "║    OpenClaw Chat Demo           ║" << std::endl;
    std::cout << "╚══════════════════════════════════╝" << std::endl;
    std::cout << "Socket: " << socketPath << std::endl;
    std::cout << "模式: " << (showDebug ? "调试模式" : "正常模式") << std::endl;
    std::cout << "正在连接..." << std::endl;
    
    // 创建客户端
    auto client = OpenClawClient::Create(socketPath);
    
    // 设置流式输出回调 - chunk (逐字显示)
    client->onChunk([](const std::string& to, const std::string& text) {
        appendReply(text);
    });
    
    // 设置流式输出完成回调
    client->onDone([](const std::string& to) {
        finishReply();
    });
    
    // 设置消息回调 (非流式时的回复)
    client->onMessage([](const std::string& to, const std::string& text) {
        std::lock_guard<std::mutex> lock(printMutex);
        std::cout << "\n[AI]: " << text << std::endl;
        std::cout << "\n你: " << std::flush;
    });
    
    // 设置消息确认回调
    client->onAck([](int id) {
        logDebug("消息已确认 id=" + std::to_string(id));
    });
    
    // 设置断开连接回调
    client->onDisconnect([&]() {
        std::lock_guard<std::mutex> lock(printMutex);
        std::cout << "\n[系统] 连接已断开" << std::endl;
        connected = false;
        running = false;
    });
    
    // 连接
    client->connect([](bool success) {
        if (success) {
            std::cout << "✓ 连接成功!" << std::endl;
            connected = true;
        } else {
            std::cout << "✗ 连接失败!" << std::endl;
        }
    });
    
    // 等待连接
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    
    if (!client->isConnected()) {
        std::cerr << "\n错误: 无法连接到 OpenClaw" << std::endl;
        std::cerr << "请确保:" << std::endl;
        std::cerr << "  1. OpenClaw Gateway 已启动" << std::endl;
        std::cerr << "  2. cpp-channel 插件已加载" << std::endl;
        std::cerr << "  3. Socket 文件存在: " << socketPath << std::endl;
        return 1;
    }
    
    std::cout << "\n===== OpenClaw Chat =====" << std::endl;
    std::cout << "输入消息直接发送，按 Enter 发送" << std::endl;
    std::cout << "命令:" << std::endl;
    std::cout << "  :quit   - 退出聊天" << std::endl;
    std::cout << "  :ping   - 发送心跳" << std::endl;
    std::cout << "  :clear  - 清除会话历史" << std::endl;
    std::cout << "  :status - 查看连接状态" << std::endl;
    std::cout << "  :debug   - 切换调试模式" << std::endl;
    std::cout << "=========================" << std::endl;
    std::cout << "\n你: " << std::flush;
    
    // 启动心跳线程
    std::thread hb(heartbeatThread, client.get());
    hb.detach();
    
    // 主循环 - 读取输入并发送
    std::string input;
    while (running && client->isConnected()) {
        if (!std::getline(std::cin, input)) {
            break;
        }
        
        // 跳过空行
        if (input.empty()) {
            std::cout << "你: " << std::flush;
            continue;
        }
        
        // 命令处理
        if (input == ":quit" || input == ":q" || input == "/quit") {
            std::cout << "正在退出..." << std::endl;
            break;
        }
        else if (input == ":ping") {
            if (client->sendPing()) {
                logDebug("心跳已发送");
            } else {
                std::cout << "[系统] 心跳发送失败" << std::endl;
            }
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":clear") {
            if (client->clearHistory("android_user")) {
                std::cout << "[系统] 会话历史已清除" << std::endl;
            } else {
                std::cout << "[系统] 清除失败" << std::endl;
            }
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":status" || input == ":s") {
            std::cout << "[系统] 连接状态: " 
                      << (client->isConnected() ? "已连接" : "未连接") << std::endl;
            std::cout << "[系统] 调试模式: " 
                      << (debugMode ? "开启" : "关闭") << std::endl;
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":debug" || input == ":d") {
            debugMode = !debugMode;
            std::cout << "[系统] 调试模式: " 
                      << (debugMode ? "开启" : "关闭") << std::endl;
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":help" || input == ":h") {
            std::cout << "\n===== OpenClaw Chat =====" << std::endl;
            std::cout << "输入消息直接发送，按 Enter 发送" << std::endl;
            std::cout << "命令:" << std::endl;
            std::cout << "  :quit   - 退出聊天" << std::endl;
            std::cout << "  :ping   - 发送心跳" << std::endl;
            std::cout << "  :clear  - 清除会话历史" << std::endl;
            std::cout << "  :status - 查看连接状态" << std::endl;
            std::cout << "  :debug   - 切换调试模式" << std::endl;
            std::cout << "=========================" << std::endl;
            std::cout << "你: " << std::flush;
            continue;
        }
        
        // 发送消息
        const std::string userId = "android_user";
        
        if (client->sendMessage(userId, input)) {
            if (debugMode) std::cout << "[已发送] " << input << std::endl;
        } else {
            if (debugMode) std::cout << "[错误] 消息发送失败" << std::endl;
        }
        
        std::cout << "你: " << std::flush;
    }
    
    // 清理
    std::cout << "\n正在关闭连接..." << std::endl;
    client->disconnect();
    std::cout << "退出完成。" << std::endl;
    
    return 0;
}