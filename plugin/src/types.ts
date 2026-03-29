/**
 * cpp-channel TypeScript type definitions
 * 
 * Types for the standard OpenClaw Channel Plugin interface.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import type { DirectDmCommandAuthorizationRuntime } from "openclaw/plugin-sdk/direct-dm";

// ============================================================================
// Account Types
// ============================================================================

export interface CppChannelAccount {
  accountId: string;
  configured: boolean;
  config: CppChannelAccountConfig;
}

export interface CppChannelAccountConfig {
  socketPath: string;
  stream: boolean;
  dmPolicy: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
}

// ============================================================================
// Config Types
// ============================================================================

export interface CppChannelConfig {
  enabled?: boolean;
  socketPath?: string;
  stream?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom?: string[];
}

export interface CppChannelFullConfig {
  channels?: {
    "cpp-channel"?: CppChannelConfig;
  };
}

// ============================================================================
// Runtime Types - For dispatchInboundDirectDmWithRuntime
// ============================================================================

export interface CppChannelDirectDmRuntime {
  channel: {
    routing: {
      resolveAgentRoute: (params: {
        cfg: OpenClawConfig;
        channel: string;
        accountId: string;
        peer: { kind: "direct"; id: string };
      }) => {
        channel: string;
        accountId: string;
        agentId?: string;
        sessionKey: string;
        threadId?: string;
      };
    };
    session: {
      resolveStorePath: (params: {
        store?: string;
        sessionKey: string;
      }) => string;
      readSessionUpdatedAt: (params: {
        storePath: string;
        sessionKey: string;
      }) => number | undefined;
      recordInboundSession: (params: {
        storePath: string;
        sessionKey: string;
        messageId: string;
        from: string;
        body: string;
        timestamp: number;
      }) => Promise<void>;
    };
    reply: {
      resolveEnvelopeFormatOptions: (cfg: OpenClawConfig) => {
        preferBlockquote: boolean;
        preferItalics: boolean;
        preferCodeBlock: boolean;
        preferDiff: boolean;
      };
      formatAgentEnvelope: (params: {
        role: string;
        body: string;
        options?: any;
      }) => { content?: string; reasoning?: string };
      finalizeInboundContext: (params: any) => any;
      dispatchReplyWithBufferedBlockDispatcher: (params: any) => Promise<void>;
    };
  };
}

// ============================================================================
// Command Authorization Runtime
// ============================================================================

export function createCppChannelCommandRuntime(): DirectDmCommandAuthorizationRuntime {
  return {
    shouldComputeCommandAuthorized: () => false,
    resolveCommandAuthorizedFromAuthorizers: () => false,
  };
}

// ============================================================================
// Message Types
// ============================================================================

export interface CppInboundMessage {
  type: "send";
  from: string;
  text: string;
  id: number;
}

export interface CppOutboundChunk {
  type: "chunk";
  to: string;
  text: string;
}

export interface CppOutboundReply {
  type: "reply";
  to: string;
  text: string;
}

export interface CppOutboundDone {
  type: "done";
  to: string;
}

export interface CppOutboundAck {
  type: "ack";
  id: number;
}

export type CppMessage = CppInboundMessage | CppOutboundChunk | CppOutboundReply | CppOutboundDone | CppOutboundAck;