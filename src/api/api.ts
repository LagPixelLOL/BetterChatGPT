import { ShareGPTSubmitBodyInterface } from '@type/api';
import {
  ConfigInterface,
  MessageInterface,
  isTextContent,
} from '@type/chat';
import {
  officialAPIEndpoint,
  openRouterAPIEndpoint,
  anthropicEndpoint,
} from '@constants/auth';
import { ModelOptions } from '@utils/modelReader';
import { checkIsResponsesApi } from '@utils/api';

function preprocess(
  endpoint: string,
  config: ConfigInterface,
): {
  endpoint: string,
  config: ConfigInterface,
  isResponsesApi: boolean,
  isOfficialOAIEndpoint: boolean,
  isOpenRouterEndpoint: boolean,
  isAnthropicEndpoint: boolean,
} {
  endpoint = endpoint.trim();
  config = structuredClone(config);

  const isResponsesApi = checkIsResponsesApi(endpoint);

  let isOfficialOAIEndpoint = false;
  let isOpenRouterEndpoint = false;
  let isAnthropicEndpoint = false;

  switch (endpoint) {
    case officialAPIEndpoint:
      isOfficialOAIEndpoint = true;
      break;
    case openRouterAPIEndpoint:
      isOpenRouterEndpoint = true;
      break;
    case anthropicEndpoint:
      isAnthropicEndpoint = true;
      break;
    default:
      break;
  }

  if (!isOpenRouterEndpoint) {
    config.model = config.model.split('/').slice(1).join('/');
  }

  return {
    endpoint,
    config,
    isResponsesApi,
    isOfficialOAIEndpoint,
    isOpenRouterEndpoint,
    isAnthropicEndpoint,
  }
}

function assemblePayload(
  messages: MessageInterface[],
  config: ConfigInterface,
  isResponsesApi: boolean,
  isOfficialOAIEndpoint: boolean,
  isOpenRouterEndpoint: boolean,
  isAnthropicEndpoint: boolean,
  stream: boolean=false,
): string {
  const maxTokens = isOfficialOAIEndpoint || isOpenRouterEndpoint || isAnthropicEndpoint || config.model.startsWith('gemini-') ? undefined : 65536;
  const isGeminiAndOpenRouterEndpoint = config.model.startsWith('google/gemini-');
  let modifiedMessages: any[] = messages.map(({ id, reasoning_content, ...rest }) => rest);

  if (isResponsesApi) {
    if (!isOfficialOAIEndpoint) throw Error('Only the official OpenAI API endpoint is supported for the responses API format!');
    modifiedMessages = modifiedMessages.map(({ ...message }) => {
      message.content = message.content.map(({ ...content }) => {
        switch (content.type) {
          case 'text':
            content.type = message.role === 'assistant' ? 'output_text' : 'input_text';
            break;
          case 'image_url':
            content.type = 'input_image';
            let { url, detail } = content.image_url;
            content.image_url = url;
            content.detail = detail;
        }
        return content
      });
      return message
    });
    var { reasoning_effort: reasoningEffort, presence_penalty: _, frequency_penalty: _, ...modifiedConfig }: any = config;
    if (modifiedConfig.model.startsWith('gpt-') && modifiedConfig.model.endsWith('-chat')) {
      modifiedConfig.model += '-latest';
    }
    if (reasoningEffort !== 'null') {
      modifiedConfig.reasoning = { effort: reasoningEffort, summary: 'auto' };
    }
    if (stream) {
      modifiedConfig.stream_options = { include_obfuscation: false };
    }
    modifiedConfig.store = false;
  } else {
    modifiedMessages = modifiedMessages.map(({ ...message }) => {
      let content = message.content;
      if (content.length === 1 && isTextContent(content[0])) {
        message.content = content[0].text;
      }
      return message
    });
    if (isOpenRouterEndpoint) {
      var { reasoning_effort: reasoningEffort, ...modifiedConfig }: any = config;
      if (reasoningEffort === 'null') {
        modifiedConfig.reasoning = { enabled: false };
      } else {
        modifiedConfig.reasoning = { effort: reasoningEffort };
      }
    } else if (isAnthropicEndpoint) {
      var { reasoning_effort: reasoningEffort, ...modifiedConfig }: any = config;
      let thinkingBudget: { type: string, budget_tokens?: number };
      switch (reasoningEffort) {
        case 'null':
        case 'none':
        case 'minimal':
          thinkingBudget = { 'type': 'disabled' };
          break;
        case 'low':
          thinkingBudget = { 'type': 'enabled', 'budget_tokens': 1024 };
          break;
        case 'medium':
          thinkingBudget = { 'type': 'enabled', 'budget_tokens': 4096 };
          break;
        case 'high':
          thinkingBudget = { 'type': 'enabled', 'budget_tokens': 32768 };
          break;
        case 'xhigh':
          thinkingBudget = { 'type': 'enabled', 'budget_tokens': 65536 };
          break;
        case 'max':
          thinkingBudget = { 'type': 'enabled', 'budget_tokens': 128000 };
          break;
        default:
          throw Error(`Invalid reasoning effort: ${reasoningEffort}`);
      }
      modifiedConfig.thinking = thinkingBudget;
    } else {
      var { ...modifiedConfig }: any = config;
      if (modifiedConfig.reasoning_effort === 'null') {
        modifiedConfig.reasoning_effort = undefined;
      }
    }
  }

  delete modifiedConfig.max_tokens;
  if (modifiedConfig.temperature == 1) {
    delete modifiedConfig.temperature;
  }
  if (modifiedConfig.top_p == 1) {
    delete modifiedConfig.top_p;
  }
  if (modifiedConfig.presence_penalty == 0) {
    delete modifiedConfig.presence_penalty;
  }
  if (modifiedConfig.frequency_penalty == 0) {
    delete modifiedConfig.frequency_penalty;
  }

  let payload = {
    ...modifiedConfig,
    provider: isGeminiAndOpenRouterEndpoint ? { ignore: ['google-ai-studio'] } : undefined,
    stream,
  };

  if (isResponsesApi) {
    payload.input = modifiedMessages;
    payload.max_output_tokens = maxTokens;
  } else {
    payload.messages = modifiedMessages;
    payload.max_completion_tokens = maxTokens;
  }

  return JSON.stringify(payload)
}

export const getChatCompletion = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
) => {
  var { endpoint, config, isResponsesApi, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint } = preprocess(endpoint, config);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: assemblePayload(messages, config, isResponsesApi, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint),
  });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return data;
};

export const getChatCompletionStream = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
) => {
  var { endpoint, config, isResponsesApi, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint } = preprocess(endpoint, config);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: assemblePayload(messages, config, isResponsesApi, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint, true),
  });
  if (response.status === 404 || response.status === 405) {
    const text = await response.text();
    throw new Error(text);
  }

  if (response.status === 429 || !response.ok) {
    const text = await response.text();
    let error = text;
    if (text.includes('insufficient_quota')) {
      error += '\nMessage from Better ChatGPT:\nWe recommend changing your API endpoint or API key';
    } else if (response.status === 429) {
      error += '\nRate limited!';
    }
    throw new Error(error);
  }

  const stream = response.body;
  return stream;
};

export const submitShareGPT = async (body: ShareGPTSubmitBodyInterface) => {
  const request = await fetch('https://sharegpt.com/api/conversations', {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const response = await request.json();
  const { id } = response;
  const url = `https://shareg.pt/${id}`;
  window.open(url, '_blank');
};
