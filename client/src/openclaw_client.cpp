#include "openclaw_client.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>
#include <errno.h>
#include <iostream>

namespace openclaw {

std::unique_ptr<OpenClawClient> OpenClawClient::Create(const std::string& socketPath) {
    return std::unique_ptr<OpenClawClient>(new OpenClawClient(socketPath));
}

OpenClawClient::OpenClawClient(const std::string& socketPath)
    : socketPath_(socketPath), sockfd_(-1) {
}

OpenClawClient::~OpenClawClient() {
    disconnect();
}

int OpenClawClient::connectToSocket() {
    sockfd_ = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sockfd_ < 0) {
        return -1;
    }
    
    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socketPath_.c_str(), sizeof(addr.sun_path) - 1);
    
    if (::connect(sockfd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(sockfd_);
        sockfd_ = -1;
        return -1;
    }
    
    return 0;
}

void OpenClawClient::connect(ConnectCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (connected_) {
        if (callback) callback(true);
        return;
    }
    
    bool success = (connectToSocket() == 0);
    connected_ = success;
    
    if (success) {
        running_ = true;
        readThread_ = std::thread(&OpenClawClient::startReadLoop, this);
    }
    
    if (callback) callback(success);
}

void OpenClawClient::disconnect() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    running_ = false;
    connected_ = false;
    
    if (readThread_.joinable()) {
        readThread_.join();
    }
    
    if (sockfd_ >= 0) {
        close(sockfd_);
        sockfd_ = -1;
    }
    
    if (disconnectCallback_) {
        disconnectCallback_();
    }
}

bool OpenClawClient::sendMessage(const std::string& from, const std::string& text) {
    Message msg;
    msg.type = "send";
    msg.from = from;
    msg.text = text;
    msg.id = 1;  // TODO: 生成唯一 ID
    
    return sendRaw(encodeMessage(msg));
}

void OpenClawClient::startReadLoop() {
    char buffer[4096];
    
    while (running_) {
        ssize_t n = read(sockfd_, buffer, sizeof(buffer) - 1);
        
        if (n <= 0) {
            // 连接断开
            break;
        }
        
        buffer[n] = '\0';
        readBuffer_ += buffer;
        
        // 按行分割
        size_t pos;
        while ((pos = readBuffer_.find('\n')) != std::string::npos) {
            std::string line = readBuffer_.substr(0, pos);
            readBuffer_ = readBuffer_.substr(pos + 1);
            
            if (!line.empty()) {
                handleMessage(line);
            }
        }
    }
    
    // 连接断开
    connected_ = false;
    if (disconnectCallback_) {
        disconnectCallback_();
    }
}

void OpenClawClient::handleMessage(const std::string& json) {
    try {
        Message msg = parseMessage(json);
        
        if (msg.type == "reply" && messageCallback_) {
            messageCallback_(msg.to, msg.text);
        }
        // 其他类型处理: ack, pong 等
    } catch (const std::exception& e) {
        std::cerr << "Parse message error: " << e.what() << std::endl;
    }
}

bool OpenClawClient::sendRaw(const std::string& data) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (!connected_ || sockfd_ < 0) {
        return false;
    }
    
    ssize_t written = write(sockfd_, data.c_str(), data.length());
    return written == static_cast<ssize_t>(data.length());
}

std::string OpenClawClient::encodeMessage(const Message& msg) {
    // 简单实现，实际可用 JSON 库
    std::string json = "{\"type\":\"" + msg.type + "\"";
    
    if (!msg.from.empty()) {
        json += ",\"from\":\"" + msg.from + "\"";
    }
    if (!msg.to.empty()) {
        json += ",\"to\":\"" + msg.to + "\"";
    }
    if (!msg.text.empty()) {
        json += ",\"text\":\"" + msg.text + "\"";
    }
    if (msg.id > 0) {
        json += ",\"id\":" + std::to_string(msg.id);
    }
    
    json += "}\n";
    return json;
}

OpenClawClient::Message OpenClawClient::parseMessage(const std::string& json) {
    Message msg;
    
    // 简单解析，实际可用 JSON 库 (nlohmann/json)
    // 格式: {"type":"xxx","from":"xxx","text":"xxx",...}
    
    // 提取 type
    size_t typePos = json.find("\"type\":\"");
    if (typePos != std::string::npos) {
        size_t start = typePos + 8;
        size_t end = json.find("\"", start);
        if (end != std::string::npos) {
            msg.type = json.substr(start, end - start);
        }
    }
    
    // 提取 from
    size_t fromPos = json.find("\"from\":\"");
    if (fromPos != std::string::npos) {
        size_t start = fromPos + 8;
        size_t end = json.find("\"", start);
        if (end != std::string::npos) {
            msg.from = json.substr(start, end - start);
        }
    }
    
    // 提取 to
    size_t toPos = json.find("\"to\":\"");
    if (toPos != std::string::npos) {
        size_t start = toPos + 6;
        size_t end = json.find("\"", start);
        if (end != std::string::npos) {
            msg.to = json.substr(start, end - start);
        }
    }
    
    // 提取 text
    size_t textPos = json.find("\"text\":\"");
    if (textPos != std::string::npos) {
        size_t start = textPos + 8;
        size_t end = json.find("\"", start);
        if (end != std::string::npos) {
            msg.text = json.substr(start, end - start);
        }
    }
    
    // 提取 id
    size_t idPos = json.find("\"id\":");
    if (idPos != std::string::npos) {
        size_t start = idPos + 5;
        size_t end = json.find(",", start);
        if (end == std::string::npos) {
            end = json.find("}", start);
        }
        if (end != std::string::npos) {
            msg.id = std::stoi(json.substr(start, end - start));
        }
    }
    
    return msg;
}

void OpenClawClient::onMessage(MessageCallback callback) {
    messageCallback_ = callback;
}

void OpenClawClient::onDisconnect(DisconnectCallback callback) {
    disconnectCallback_ = callback;
}

bool OpenClawClient::isConnected() const {
    return connected_;
}

} // namespace openclaw