// Define the types for message endpoints.
// Requests and Responses should be formatted in accordance with Anthropic API doc
// found through guide: https://subtoapi.app/blog/claude-api-typescript-client-library-setup

// these types mirror the Claude messages shape, working whether you call anthropic directly or a wrapper service.

interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

type TextBlock = { type: "text"; text: string};

type ToolUseBlock = {     // sent by the "assistant", identifying the tool to use and inputs
  type: "tool_use"; id: string; name: string; input: Record<string, unknown> 
}

type ToolResultBlock = {  // sent by the "user", after assistant ToolUseBlock, identifying the result of the tool use block
 type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean;
};

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// potentially split into UserContentBlock and AssistantContentBlock as both have restrictions - i.e. an assistant content block
// shouldn't contain a ToolResultBlock

type StopReason =     // et: normal case, natural finish; mt: hard limit cutoff, mid sentence or tool-call; ss: custom string to cause stoppage;
// tu: model wants to run tools, run them, send back tool_result_block, call again; pt: long-running turn like web-search paused, send response back as-is to continue;
// r: declined response for safety reasons - distinct outcome not error.
  | "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal";

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
  stop_reason: StopReason | null; 
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}


export type { MessageParam, ContentBlock, ToolDefinition, MessageResponse, ToolResultBlock, ToolUseBlock}