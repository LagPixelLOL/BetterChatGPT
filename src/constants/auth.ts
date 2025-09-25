export const officialAPIEndpoint = 'https://api.openai.com/v1/responses';
export const openRouterAPIEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
export const anthropicEndpoint = 'https://api.anthropic.com/v1/chat/completions';
export const defaultAPIEndpoint = import.meta.env.VITE_DEFAULT_API_ENDPOINT || officialAPIEndpoint;

export const availableEndpoints = [officialAPIEndpoint, openRouterAPIEndpoint];
