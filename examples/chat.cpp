/**
 * OpenClaw Chat Demo - 实时对话客户端
 * 
 * 编译:
 *   cd client && mkdir -p build && cd build
 *   cmake .. -DBUILD_EXAMPLES=ON
 *   make
 * 
 * 运行:
 *   ./bin/chat
 * 
 * 功能:
 * - 实时聊天模式，输入消息直接发送
 * - 显示 AI 回复
 * - 心跳检测连接状态
 * - Ctrl+C 退出
 */

#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <csignal>
#include <queue>
#include <mutex>
#include "openclaw_client.h"

using namespace openclaw;

std::atomic<bool> running(true);
std::atomic<bool> connected(false);
std::mutex printMutex;

// 心跳检测线程
void heartbeatThread(OpenClawClient* client) {
    while (running && client->isConnected()) {
        std::this_thread::sleep_for(std::chrono::seconds(30));
        if (running && client->isConnected()) {
            std::lock_guard<std::mutex> lock(printMutex);
            if (client->sendPing()) {
                std::cout << "\n[心跳] OK" << std::endl << "你: " << std::flush;
            }
        }
    }
}

// 显示帮助
void printHelp() {
    std::cout << "\n===== OpenClaw Chat =====" << std::endl;
    std::cout << "输入消息直接发送，按 Enter 发送" << std::endl;
    std::cout << "命令:" << std::endl;
    std::cout << "  :quit   - 退出聊天" << std::endl;
    std::cout << "  :ping   - 发送心跳" << std::endl;
    std::cout << "  :status - 查看连接状态" << std::endl;
    std::cout << "=========================" << std::endl;
}

int main(int argc, char* argv[]) {
    // 捕获 Ctrl+C
    std::signal(SIGINT, [](int) {
        running = false;
        std::cout << "\n收到退出信号，正在关闭..." << std::endl;
    });
    
    // 默认 socket 路径
    std::string socketPath = "/data/data/com.termux/files/home/openclaw.sock";
    if (argc > 1) {
        socketPath = argv[1];
    }
    
    // 从环境变量读取 socket 路径（可选）
    char* envSocketPath = std::getenv("OPENCLAW_SOCKET");
    if (envSocketPath) {
        socketPath = envSocketPath;
    }
    
    std::cout << "╔══════════════════════════════════╗" << std::endl;
    std::cout << "║    OpenClaw Chat Demo            ║" << std::endl;
    std::cout << "╚══════════════════════════════════╝" << std::endl;
    std::cout << "Socket: " << socketPath << std::endl;
    std::cout << "正在连接..." << std::endl;
    
    // 创建客户端
    auto client = OpenClawClient::Create(socketPath);
    
    // 设置消息回调 - 显示 AI 回复
    client->onMessage([](const std::string& to, const std::string& text) {
        std::lock_guard<std::mutex> lock(printMutex);
        std::cout << "\n[AI] " << text << std::endl;
        std::cout << "\n你: " << std::flush;
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
    std::this_thread::sleep_for(std::chrono::milliseconds(800));
    
    if (!client->isConnected()) {
        std::cerr << "\n错误: 无法连接到 OpenClaw" << std::endl;
        std::cerr << "请确保:" << std::endl;
        std::cerr << "  1. OpenClaw Gateway 已启动" << std::endl;
        std::cerr << "  2. cpp-channel 插件已加载" << std::endl;
        std::cerr << "  3. Socket 文件存在: " << socketPath << std::endl;
        return 1;
    }
    
    // 打印帮助
    printHelp();
    
    // 启动心跳线程
    std::thread hb(heartbeatThread, client.get());
    hb.detach();
    
    std::cout << "\n你: " << std::flush;
    
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
                std::cout << "[系统] 心跳已发送" << std::endl;
            } else {
                std::cout << "[系统] 心跳发送失败" << std::endl;
            }
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":status" || input == ":s") {
            std::cout << "[系统] 连接状态: " 
                      << (client->isConnected() ? "已连接" : "未连接") << std::endl;
            std::cout << "你: " << std::flush;
            continue;
        }
        else if (input == ":help" || input == ":h") {
            printHelp();
            std::cout << "你: " << std::flush;
            continue;
        }
        
        // 发送消息
        // 使用固定的 user ID，实际应用中可以从参数或配置获取
        const std::string userId = "android_user";
        
        if (client->sendMessage(userId, input)) {
            std::cout << "[已发送] " << input << std::endl;
        } else {
            std::cout << "[错误] 消息发送失败" << std::endl;
        }
        
        std::cout << "你: " << std::flush;
    }
    
    // 清理
    std::cout << "\n正在关闭连接..." << std::endl;
    client->disconnect();
    std::cout << "退出完成。" << std::endl;
    
    return 0;
}