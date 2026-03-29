#include "openclaw_client.h"
#include "simple_json.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>
#include <iostream>

using namespace simple_json;

namespace openclaw {

std::unique_ptr<OpenClawClient> OpenClawClient::Create(const std::string& socketPath) {
    return std::unique_ptr<OpenClawClient>(new OpenClawClient(socketPath));
}

OpenClawClient::OpenClawClient(const std::string& socketPath)
    : socketPath_(socketPath), sockfd_(-1) {
    disconnect();
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
    if (connected_) {
        if (callback) callback(true);
        return;
    }
    
    bool success = (connectToSocket() == 0);
    connected_ = success;
    
    if (success) {
        running_ = true;
        startReadLoop();
    }
    
    if (callback) callback(success);
}

void OpenClawClient::disconnect() {
    if (!connected_) {
        return;
    }
    
    running_ = false;
    connected_ = false;
    
    // 先关闭 socket，唤醒阻塞的 read()
    if (sockfd_ >= 0) {
        shutdown(sockfd_, SHUT_RDWR);  // 关闭读写，让 read() 返回
        close(sockfd_);
        sockfd_ = -1;
    }
    
    // 等待读取线程结束
    if (readThread_.joinable()) {
        readThread_.join();
    }
    
    if (disconnectCallback_) {
        disconnectCallback_();
    }
}

void OpenClawClient::startReadLoop() {
    readThread_ = std::thread([this]() {
        char buffer[4096];
        
        while (running_ && sockfd_ >= 0) {
            ssize_t n = read(sockfd_, buffer, sizeof(buffer) - 1);
            
            if (n <= 0) {
                if (running_) {
                    connected_ = false;
                    if (disconnectCallback_) {
                        disconnectCallback_();
                    }
                }
                break;
            }
            
            buffer[n] = '\0';
            readBuffer_ += buffer;
            
            // 按行分割处理
            size_t pos;
            while ((pos = readBuffer_.find('\n')) != std::string::npos) {
                std::string line = readBuffer_.substr(0, pos);
                readBuffer_ = readBuffer_.substr(pos + 1);
                
                if (!line.empty()) {
                    handleMessage(line);
                }
            }
        }
    });
}

void OpenClawClient::handleMessage(const std::string& jsonStr) {
    try {
        Json j = Json::parse(jsonStr);
        std::string type = j.value("type", "");
        
        if (type == "reply" || type == "chunk") {
            std::string to = j.value("to", "");
            std::string text = j.value("text", "");
            
            if (type == "chunk" && chunkCallback_) {
                chunkCallback_(to, text);
            } else if (type == "reply" && messageCallback_) {
                messageCallback_(to, text);
            }
        } else if (type == "done") {
            std::string to = j.value("to", "");
            if (doneCallback_) {
                doneCallback_(to);
            }
        } else if (type == "ack") {
            int id = j.value("id", 0);
            if (ackCallback_) {
                ackCallback_(id);
            }
        } else if (type == "pong") {
            // 心跳回应
        }
    } catch (const std::exception& e) {
        std::cerr << "Failed to parse message: " << e.what() << std::endl;
    }
}

bool OpenClawClient::sendRaw(const std::string& data) {
    if (!connected_ || sockfd_ < 0) {
        return false;
    }
    
    std::lock_guard<std::mutex> lock(mutex_);
    ssize_t written = write(sockfd_, data.c_str(), data.length());
    return written == static_cast<ssize_t>(data.length());
}

bool OpenClawClient::sendMessage(const std::string& from, const std::string& text, int id) {
    if (!connected_ || sockfd_ < 0) {
        return false;
    }
    
    Json j = Json::object();
    j["type"] = Json::string("send");
    j["from"] = Json::string(from);
    j["text"] = Json::string(text);
    j["id"] = Json::number(id);
    
    std::string msg = j.dump() + "\n";
    return sendRaw(msg);
}

bool OpenClawClient::clearHistory(const std::string& from) {
    if (!connected_ || sockfd_ < 0) {
        return false;
    }
    
    Json j = Json::object();
    j["type"] = Json::string("clear");
    j["from"] = Json::string(from);
    
    std::string msg = j.dump() + "\n";
    return sendRaw(msg);
}

bool OpenClawClient::sendPing() {
    if (!connected_ || sockfd_ < 0) {
        return false;
    }
    
    Json j = Json::object();
    j["type"] = Json::string("ping");
    
    std::string msg = j.dump() + "\n";
    return sendRaw(msg);
}

void OpenClawClient::onMessage(MessageCallback callback) {
    messageCallback_ = callback;
}

void OpenClawClient::onChunk(ChunkCallback callback) {
    chunkCallback_ = callback;
}

void OpenClawClient::onDone(DoneCallback callback) {
    doneCallback_ = callback;
}

void OpenClawClient::onAck(AckCallback callback) {
    ackCallback_ = callback;
}

void OpenClawClient::onDisconnect(DisconnectCallback callback) {
    disconnectCallback_ = callback;
}

bool OpenClawClient::isConnected() const {
    return connected_;
}

} // namespace openclaw