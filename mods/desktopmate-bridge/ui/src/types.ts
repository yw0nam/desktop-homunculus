export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** true if still streaming (tts_chunk 수신 중) */
  streaming?: boolean;
}

export interface Session {
  session_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DmConfig {
  user_id: string;
  agent_id: string;
  fastapi_rest_url: string;
  fastapi_ws_url: string;
  fastapi_token: string;
  homunculus_api_url: string;
  tts_reference_id: string;
}

export type ConnectionStatus = "connected" | "disconnected" | "restart-required";

export interface WindowInfo {
  id: number;
  title: string;
  appName: string;
}
