#ifndef OPENCLAW_CLIENT_H
#define OPENCLAW_CLIENT_H

#include <string>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <atomic>

namespace openclaw {

/**
 * OpenClaw Client - 通过 Unix Socket 与 OpenClaw 通信
 * 
 * 用法:
 *   auto client = OpenClawClient::Create("/tmp/openclaw.sock");
 *   client->sendMessage("user1", "你好");
 *   client->onMessage([](const std::string& to, const std::string& text) { ... });
 */
class OpenClawClient {
public:
    using MessageCallback = std::function<void(const std::string& to, const std::string& text)>;
    using ConnectCallback = std::function<void(bool success)>;
    using DisconnectCallback = std::function<void()>;
    
    struct Message {
        std::string type;      // "send", "reply", "ping", "pong", "ack"
        std::string from;      // 发送者
        std::string to;        // 接收者
        std::string text;      // 消息内容
        int id = 0;           // 消息 ID
    };
    
    /**
     * 创建客户端实例
     * @param socketPath Unix socket 路径
     * @return 智能指针
     */
    static std::unique_ptr<OpenClawClient> Create(const std::string& socketPath);
    
    ~OpenClawClient();
    
    /**
     * 发送心跳 (ping)
     * @return 是否发送成功
     */
    bool sendPing();
    OpenClawClient(const OpenClawClient&) = delete;
    OpenClawClient& operator=(const OpenClawClient&) = delete;
    
    /**
     * 连接到 OpenClaw
     * @param callback 连接结果回调
     */
    void connect(ConnectCallback callback = nullptr);
    
    /**
     * 断开连接
     */
    void disconnect();
    
    /**
     * 发送消息给 OpenClaw (C++ -> OpenClaw)
     * @param from 发送者 ID
     * @param text 消息内容
     * @param id 消息 ID (用于追踪)
     * @return 是否发送成功
     */
    bool sendMessage(const std::string& from, const std::string& text, int id = 1);
    
    /**
     * 收到 OpenClaw 回复的回调 (OpenClaw -> C++)
     * @param callback 回调函数 (to, text)
     */
    void onMessage(MessageCallback callback);
    
    /**
     * 连接断开回调
     * @param callback 回调函数
     */
    void onDisconnect(DisconnectCallback callback);
    
    /**
     * 是否已连接
     */
    bool isConnected() const;
    
private:
    explicit OpenClawClient(const std::string& socketPath);
    
    int connectToSocket();
    void startReadLoop();
    void handleMessage(const std::string& json);
    bool sendRaw(const std::string& data);
    std::string encodeMessage(const Message& msg);
    Message parseMessage(const std::string& json);
    
    std::string socketPath_;
    int sockfd_ = -1;
    std::mutex mutex_;
    std::thread readThread_;
    std::atomic<bool> running_{false};
    std::atomic<bool> connected_{false};
    
    MessageCallback messageCallback_;
    DisconnectCallback disconnectCallback_;
    ConnectCallback connectCallback_;
    
    std::string readBuffer_;
};

} // namespace openclaw

#endif // OPENCLAW_CLIENT_H