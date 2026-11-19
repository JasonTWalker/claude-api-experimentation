import { ClaudeClient } from './claude-client.js';
import type { CreateMessageRequest, MessageResponse, MessageParam, ToolResultBlock, ToolUseBlock } from './types.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<string>; 

async function runWithTools(
    client: ClaudeClient,
    req: CreateMessageRequest,              // model, max_toks, messages - also holds an array of ToolDefinition[] as tools
    handlers: Record<string, ToolHandler>,  // map a tool name to the function that runs it, tools live in req.tools ^^
    maxTurns = 10,                          // hard cap so a loop without a define stop doesn't burn tokens
): Promise<MessageResponse> {
    const messages: MessageParam[] = [...req.messages];     // copies array so loop can append to it without mutation - tool responses must be unmuted

    for (let turn = 0; turn < maxTurns; turn++) {
        const res = await client.createMessage({...req, messages});   // copies original settings and messages, overrides old list
        if (res.stop_reason !== "tool_use") {           // anything other than tool use = model has no requests, end loop
            return res;
        }

        // record the assistant's turn
        messages.push( {role: "assistant", content: res.content})
        console.log(JSON.stringify(messages, null, 2))  // null replacer, 2 indentation 
    
        const results: ToolResultBlock[] = []; // store the results of our tool usage
        for (const block of res.content) {
            if (block.type !== "tool_use") continue;    // if text or otherwise, skip
            const handler = handlers[block.name]; // match handler to the used tool

            try {
                if (!handler) throw new Error(`Unknown Tool: ${block.name}`);   //if handler to match tool doesnt exist, throw error
                results.push( { type: "tool_result", tool_use_id: block.id, content: await handler(block.input) });
            } catch (err) {     // if error occured add as user message with is_error true, //error message defined above of unknown tool
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: err instanceof Error ? err.message : String(err),
                    is_error: true
                })
            }
        }
        // add tool result block as a message from user
        messages.push( {role: "user", content: results})

        // log the now updated messages with the tool response block from the user
        console.log(JSON.stringify(messages, null, 2));
    }

    throw new Error(`Tool loop exceeded ${maxTurns} turns`);
}

export { runWithTools };