import { ShareGPTSubmitBodyInterface } from '@type/api';
import {
  ConfigInterface,
  MessageInterface,
} from '@type/chat';
import { isAzureEndpoint } from '@utils/api';
import {
  officialAPIEndpoint,
  customAPIEndpoint,
  openRouterAPIEndpoint,
  anthropicEndpoint,
} from '@constants/auth';
import { ModelOptions } from '@utils/modelReader';

function preprocess(
  endpoint: string,
  config: ConfigInterface,
): {
  endpoint: string,
  config: ConfigInterface,
  isOfficialOAIEndpoint: boolean,
  isOpenRouterEndpoint: boolean,
  isAnthropicEndpoint: boolean,
} {
  endpoint = endpoint.trim();
  config = structuredClone(config);

  const isOfficialOAIEndpoint = endpoint === officialAPIEndpoint || endpoint === customAPIEndpoint;
  const isOpenRouterEndpoint = endpoint === openRouterAPIEndpoint;
  const isAnthropicEndpoint = endpoint === anthropicEndpoint;

  if (!isOpenRouterEndpoint) {
    config.model = config.model.split('/').slice(1).join('/');
  }

  return {
    endpoint,
    config,
    isOfficialOAIEndpoint,
    isOpenRouterEndpoint,
    isAnthropicEndpoint,
  }
}

function assemblePayload(
  messages: MessageInterface[],
  config: ConfigInterface,
  isOfficialOAIEndpoint: boolean,
  isOpenRouterEndpoint: boolean,
  isAnthropicEndpoint: boolean,
  stream: boolean=false,
): string {
  const maxTokens = isOfficialOAIEndpoint || isOpenRouterEndpoint || isAnthropicEndpoint || config.model.startsWith('gemini-') ? undefined : 32768;
  const isGemini25ProPaidAndOpenRouterEndpoint = config.model.startsWith('google/gemini-2.5-pro');

  if (isOpenRouterEndpoint) {
    var { reasoning_effort: reasoningEffort, ...modifiedConfig }: any = config;
    if (reasoningEffort === 'none') {
      modifiedConfig.reasoning = { enabled: false };
    } else {
      modifiedConfig.reasoning = { effort: reasoningEffort };
    }
  } else if (isAnthropicEndpoint) {
    var { reasoning_effort: reasoningEffort, ...modifiedConfig }: any = config;
    let thinkingBudget: { type: string, budget_tokens?: number };
    switch (reasoningEffort) {
      case 'none':
        thinkingBudget = { 'type': 'disabled' };
        break;
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
      default:
        throw Error(`Invalid reasoning effort: ${reasoningEffort}`);
    }
    modifiedConfig.thinking = thinkingBudget;
  } else {
    var modifiedConfig: any = config;
    if (modifiedConfig.reasoning_effort === 'none') {
      modifiedConfig.reasoning_effort = 'minimal';
    }
  }

  return JSON.stringify({
    messages: messages.map(({ id, reasoning_content, ...rest }) => rest),
    ...modifiedConfig,
    max_tokens: isOfficialOAIEndpoint ? undefined : maxTokens,
    max_completion_tokens: isOfficialOAIEndpoint ? maxTokens : undefined,
    provider: isGemini25ProPaidAndOpenRouterEndpoint ? {ignore: ['google-ai-studio']} : undefined,
    stream,
  })
}

export const getChatCompletion = async (
  endpoint: string,
  messages: MessageInterface[],
  config: ConfigInterface,
  apiKey?: string,
  customHeaders?: Record<string, string>,
  apiVersionToUse?: string,
) => {
  var { endpoint, config, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint } = preprocess(endpoint, config);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const modelmapping: Partial<Record<ModelOptions, string>> = {
      'gpt-3.5-turbo': 'gpt-35-turbo',
      'gpt-3.5-turbo-16k': 'gpt-35-turbo-16k',
      'gpt-3.5-turbo-1106': 'gpt-35-turbo-1106',
      'gpt-3.5-turbo-0125': 'gpt-35-turbo-0125',
    };

    const model = modelmapping[config.model] || config.model;

    // set api version to 2023-07-01-preview for gpt-4 and gpt-4-32k, otherwise use 2023-03-15-preview
    const apiVersion =
      apiVersionToUse ??
      (model === 'gpt-4' || model === 'gpt-4-32k'
        ? '2023-07-01-preview'
        : '2023-03-15-preview');

    const path = `openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: assemblePayload(messages, config, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint),
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
  var { endpoint, config, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint } = preprocess(endpoint, config);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isAzureEndpoint(endpoint) && apiKey) {
    headers['api-key'] = apiKey;

    const modelmapping: Partial<Record<ModelOptions, string>> = {
      'gpt-3.5-turbo': 'gpt-35-turbo',
      'gpt-3.5-turbo-16k': 'gpt-35-turbo-16k',
    };

    const model = modelmapping[config.model] || config.model;

    // set api version to 2023-07-01-preview for gpt-4 and gpt-4-32k, otherwise use 2023-03-15-preview
    const apiVersion =
      apiVersionToUse ??
      (model === 'gpt-4' || model === 'gpt-4-32k'
        ? '2023-07-01-preview'
        : '2023-03-15-preview');
    const path = `openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    if (!endpoint.endsWith(path)) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += path;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: assemblePayload(messages, config, isOfficialOAIEndpoint, isOpenRouterEndpoint, isAnthropicEndpoint, true),
  });
  if (response.status === 404 || response.status === 405) {
    const text = await response.text();

    if (text.includes('model_not_found')) {
      throw new Error(
        text + '\nMessage from Better ChatGPT:\nPlease ensure that you have access to the GPT-4 API!'
      );
    } else {
      throw new Error(
        'Message from Better ChatGPT:\nInvalid API endpoint! We recommend you to check your free API endpoint.'
      );
    }
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
