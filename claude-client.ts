import type { MessageResponse, CreateMessageRequest } from './types.ts'



class ClaudeClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(apiKey: string, baseUrl = "https://api.anthropic.com/v1") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    // async as must wait for response before promise is resolved 
    // seems to wrap a CreateMessageRequest type, handles error cases if fetch fails
    // returns a promise of type MessageResponse
    async createMessage(
        req: CreateMessageRequest
    ): Promise<MessageResponse> {
        const res = await fetch(`${this.baseUrl}/messages`, { // send POST req to Anthropic messages api
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01" // worth noting there's been a recent update #https://platform.claude.com/docs/en/api/versioning
                // though will not be using that for this, may update in future if this project lasts long enough
            },
            body: JSON.stringify(req), // stringify the contents of type CreateMessageRequest to send
        });

        // if response doesnt return status code 2XX (unsuccessful) 
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Claude API error ${res.status}: ${errorBody}`);
        }

        // if gets to this line then was successful
        return res.json() as Promise<MessageResponse>
    }
}

export { ClaudeClient };