# cpp-channel 项目开发日志

## 项目概述

cpp-channel 是一个标准的 OpenClaw Channel Plugin，通过 Unix Domain Socket 与 C++ Native 服务双向通信。

**目标**：让 C++ 应用（如 Android 手机上的服务）能接入 OpenClaw Gateway，实现 AI 对话功能。

**仓库**：https://github.com/Jiajin1204/openclaw-cpp-channel

---

## 当前状态 (2026-03-29 晚)

## 🔴 最新发现：JSON 解析失败

**日志证据**：
```
[cpp-channel] Failed to parse message: SyntaxError: Bad control character in string literal in JSON at position 38 (line 1 column 39)
```

**原因**：C++ 客户端发送的 JSON 消息包含控制字符（可能是 `\r` 或其他不可见字符），导致 JSON.parse 失败。

**下一步**：
1. 检查 C++ 客户端发送消息时是否正确处理了特殊字符
2. 在插件端增加更健壮的 JSON 解析（忽略控制字符）
3. 或者在 C++ 端确保消息格式正确

**现象**：C++ 客户端发送消息后，AI 回复为空（没有任何输出）。

**已验证**：
- ✅ Socket 通信正常（客户端连接、数据接收都有日志）
- ✅ 消息解析正常（JSON parse 成功）
- ✅ runtime 已正确获取（channel.reply 存在）
- ✅ handleInboundMessage 被调用（有日志）

**问题**：调用 `runtime.channel.reply.handleInboundMessage()` 后，回调函数没有被执行。

---

## 已尝试的方案

### 方案 1：直接调用 OpenClaw API（回退可用）
```typescript
// 直接 fetch /v1/chat/completions，手动管理历史
const messages = [
  { role: "system", content: "你是一个助手..." },
  ...history,
  { role: "user", content: msg.text }
];
const response = await fetch(gatewayUrl + "/v1/chat/completions", {...});
```
**状态**：之前验证过可以工作，但不符合"让 OpenClaw 管理会话历史"的标准做法。

### 方案 2：使用 runtime.channel.reply.handleInboundMessage（当前尝试）
```typescript
await runtime.channel.reply.handleInboundMessage({
  channel: CHANNEL_ID,
  accountId,
  senderId,
  chatType: "direct",
  chatId: senderId,
  text: msg.text,
  reply: async (responseText: string) => {
    sendToSocket(senderId, "reply", responseText);
  },
});
```
**状态**：handleInboundMessage 被调用，但没有触发 reply 回调。

---

## 关键发现

### 1. runtime 获取方式不同导致结果不同

| 获取方式 | 是否有 channel.reply |
|---------|---------------------|
| `api.runtime` (register 传入) | ❌ 空对象 |
| `ctx.runtime` (startAccount 传入) | ✅ 有完整对象 |

**结论**：必须通过 `gateway.startAccount` 的 `ctx.runtime` 获取 runtime。

### 2. 飞书/nostr 插件的差异

飞书插件使用 `core.channel.reply.dispatchReplyFromConfig()`，这是一个更底层的 API。

但 nostr 插件也用 `handleInboundMessage`，所以这个 API 应该是存在的。

### 3. 插件反复重启的问题

**原因**：`gateway.startAccount` 返回的函数（stop）没有被正确等待，导致超时后再次启动。

**现象**：日志中不断出现 "Starting C++ Channel socket server" 和 "auto-restart attempt"。

---

## 技术细节

### 关键文件

- `plugin/src/channel.ts` - 主插件代码
- `plugin/src/runtime.ts` - runtime 存储
- `plugin/src/types.ts` - 类型定义
- `client/src/openclaw_client.cpp` - C++ 客户端

### 协议格式

**发送消息（C++ → Plugin）**：
```json
{"type": "send", "from": "android_user", "text": "我喜欢足球", "id": 123}
```

**接收回复（Plugin → C++）**：
```json
{"type": "reply", "to": "android_user", "content": "足球很棒！"}
```

---

## 下一步计划

1. **调试 handleInboundMessage 无响应问题**
   - 检查 OpenClaw 的 handleInboundMessage 实现
   - 查看是否有 sessionKey 参数缺失
   - 检查是否需要额外的上下文参数

2. **如果 handleInboundMessage 确实无法工作**
   - 回退到直接调用 API 的方案
   - 同时保持代码结构清晰，方便以后迁移

3. **测试会话历史功能**
   - 确保 AI 能记住之前的对话

---

## 相关文档

- [IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) - 实现计划
- [README.md](./README.md) - 项目说明

---

## 开发环境

- **手机**：Android + Termux + Node.js
- **Socket 路径**：`/data/data/com.termux/files/home/openclaw.sock`
- **SSH**：`sshpass -p qazwsx ssh -o StrictHostKeyChecking=no u0_a259@192.168.1.136 -p 8022`
- **Gateway 端口**：18790

---

_最后更新：2026-03-29 23:06_