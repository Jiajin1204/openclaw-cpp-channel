/**
 * Demo program for OpenClaw C++ Client
 * 
 * 编译:
 *   mkdir build && cd build
 *   cmake .. -DBUILD_EXAMPLES=ON
 *   make
 * 
 * 运行:
 *   ./bin/demo
 * 
 * 注意: 需要先启动 OpenClaw (含 cpp-channel 插件)
 */

#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <csignal>
#include "openclaw_client.h"

using namespace openclaw;

std::atomic<bool> running(true);

void signalHandler(int signal) {
    running = false;
}

int main(int argc, char* argv[]) {
    // 捕获 Ctrl+C
    std::signal(SIGINT, signalHandler);
    
    // 默认 socket 路径
    std::string socketPath = "/tmp/openclaw.sock";
    if (argc > 1) {
        socketPath = argv[1];
    }
    
    std::cout << "OpenClaw C++ Client Demo" << std::endl;
    std::cout << "Socket: " << socketPath << std::endl;
    
    // 创建客户端
    auto client = OpenClawClient::Create(socketPath);
    
    // 设置回调
    client->onMessage([](const std::string& to, const std::string& text) {
        std::cout << "\n[收到回复] to=" << to << " text=" << text << std::endl;
        std::cout << "\n选择: " << std::flush;
    });
    
    client->onDisconnect([]() {
        std::cout << "\n[断开连接]" << std::endl;
        running = false;
    });
    
    // 连接
    std::cout << "连接中..." << std::endl;
    client->connect([](bool success) {
        if (success) {
            std::cout << "连接成功!" << std::endl;
        } else {
            std::cout << "连接失败!" << std::endl;
        }
    });
    
    // 等待连接
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    
    if (!client->isConnected()) {
        std::cerr << "无法连接到 OpenClaw，请确保插件已启动" << std::endl;
        return 1;
    }
    
    // 简单菜单循环
    int choice = -1;
    int messageId = 1;
    
    while (running && client->isConnected()) {
        std::cout << "\n===== OpenClaw Demo =====" << std::endl;
        std::cout << "1. 发送消息" << std::endl;
        std::cout << "2. 发送带 ID 的消息" << std::endl;
        std::cout << "3. 发送心跳" << std::endl;
        std::cout << "4. 查看连接状态" << std::endl;
        std::cout << "0. 退出" << std::endl;
        std::cout << "======================" << std::endl;
        std::cout << "选择: " << std::flush;
        
        if (!(std::cin >> choice)) {
            std::cin.clear();
            std::cin.ignore(1000, '\n');
            continue;
        }
        
        if (choice == 0) {
            std::cout << "退出..." << std::endl;
            break;
        }
        
        switch (choice) {
            case 1: {
                std::cout << "输入消息内容: ";
                std::string text;
                std::getline(std::cin >> std::ws, text);
                
                int id = messageId++;
                if (client->sendMessage("user1", text, id)) {
                    std::cout << "消息已发送 (id=" << id << ")" << std::endl;
                } else {
                    std::cout << "发送失败" << std::endl;
                }
                break;
            }
            case 2: {
                std::cout << "输入消息内容: ";
                std::string text;
                std::getline(std::cin >> std::ws, text);
                
                int id = messageId++;
                if (client->sendMessage("user1", text, id)) {
                    std::cout << "消息已发送 (id=" << id << ")" << std::endl;
                } else {
                    std::cout << "发送失败" << std::endl;
                }
                break;
            }
            case 3: {
                std::cout << "发送心跳..." << std::endl;
                if (client->sendPing()) {
                    std::cout << "心跳已发送" << std::endl;
                } else {
                    std::cout << "发送失败" << std::endl;
                }
                break;
            }
            case 4: {
                std::cout << "连接状态: " << (client->isConnected() ? "已连接" : "未连接") << std::endl;
                break;
            }
            default:
                std::cout << "无效选择" << std::endl;
        }
    }
    
    std::cout << "关闭连接..." << std::endl;
    client->disconnect();
    std::cout << "退出完成" << std::endl;
    return 0;
}