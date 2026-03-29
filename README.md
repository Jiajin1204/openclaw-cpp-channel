# openclaw-cpp-channel

通过 Unix Socket 实现 OpenClaw 与 C++ Native 服务双向通信的插件。

## 功能

- ✅ Unix Socket 监听 C++ 客户端连接
- ✅ 接收 C++ 消息并转发到 OpenClaw Agent
- ✅ 将 Agent 回复发送回 C++ 客户端
- ✅ 心跳检测支持
- ✅ 提供 cpp_send 工具供 Agent 调用

## 快速开始

### 插件安装

```bash
# 复制插件到 OpenClaw 扩展目录
cp -r plugin ~/.openclaw/extensions/cpp-channel
```

### 配置 openclaw.json

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "your-gateway-token"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "cpp-channel": { "enabled": true }
    }
  }
}
```

### 启动 Gateway

```bash
openclaw gateway start
```

### 运行 C++ 客户端

```bash
# 编译客户端
cd client && mkdir -p build && cd build
cmake .. && make

# 运行聊天客户端
./bin/chat
```

## 通信协议

### 消息格式（JSON + 换行分隔）

**C++ → OpenClaw:**
```json
{"type":"send","from":"user123","text":"你好","id":1}
```

**OpenClaw → C++:**
```json
{"type":"reply","to":"user123","text":"你好，我是 AI"}
```

**心跳:**
```json
{"type":"ping"}
{"type":"pong"}
```

**确认:**
```json
{"type":"ack","id":1}
```

## Socket 路径

- **Ubuntu**: `/tmp/openclaw.sock`
- **Android/Termux**: `/data/data/com.termux/files/home/openclaw.sock`

## API

插件通过 `/v1/chat/completions` 与 OpenClaw Gateway 通信。

## 许可证

MIT