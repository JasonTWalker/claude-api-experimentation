// Define the types for message endpoints.
// Requests and Responses should be formatted in accordance with Anthropic API doc
// found through guide: https://subtoapi.app/blog/claude-api-typescript-client-library-setup

// these types mirror the Claude messages shape, working whether you call anthropic directly or a wrapper service.

interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface CreateMessageRequest {
  model: string;                  //    \\
  max_tokens: number;             //    | The only required parameters, rest are optional (denoted - ?)
  messages: MessageParam[];       //    //
  system?: string;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  // Other request parameters are available: #https://platform.claude.com/docs/en/api/typescript/messages/create
  // to experiment with in future, add here with ? suffix and use within ClaudeClient 'createMessage'
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface MessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type { MessageParam, ContentBlock, ToolDefinition, MessageResponse }