/**
 * cpp-channel TypeScript type definitions
 * 
 * Types for the standard OpenClaw Channel Plugin interface.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";

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
// Runtime Types
// ============================================================================

export interface CppChannelTextRuntime {
  resolveMarkdownTableMode(params: {
    cfg: OpenClawConfig;
    channel: string;
    accountId: string;
  }): "standard" | "github" | "none";
  
  convertMarkdownTables(text: string, tableMode: string): string;
}

export interface CppChannelSocketRuntime {
  sendToClient(clientId: string, text: string, mode: "single" | "streaming"): void;
  broadcast(text: string): void;
}

export interface CppChannelRuntime {
  config: {
    loadConfig(): OpenClawConfig;
  };
  channel: {
    text: CppChannelTextRuntime;
    cpp: CppChannelSocketRuntime;
    commands: {
      shouldComputeCommandAuthorized(rawBody: string, cfg: OpenClawConfig): boolean;
      resolveCommandAuthorizedFromAuthorizers(params: {
        useAccessGroups: boolean;
        authorizers: Array<{ configured: boolean; allowed: boolean }>;
        modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
      }): boolean;
    };
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

// ============================================================================
// Plugin Types (for reference)
// ============================================================================

export type { ChannelPlugin };