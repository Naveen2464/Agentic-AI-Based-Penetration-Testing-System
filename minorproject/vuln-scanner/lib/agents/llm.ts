import { ChatOpenAI } from '@langchain/openai';

const OPENROUTER_MODEL = 'openrouter/free';

function createOpenRouterModel(envKeyName: string) {
  const apiKey = process.env[envKeyName];
  if (!apiKey) {
    throw new Error(`Missing OpenRouter API key. Set ${envKeyName} in .env.local.`);
  }

  return new ChatOpenAI({
    model: OPENROUTER_MODEL,
    apiKey,
    temperature: 0,
    useResponsesApi: true,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'X-OpenRouter-Experimental-Metadata': 'enabled',
      },
    },
  });
}

export function createKey1Model() {
  return createOpenRouterModel('OPENROUTER_KEY1');
}

export function createKey2Model() {
  return createOpenRouterModel('OPENROUTER_KEY2');
}

export function createKey3Model() {
  return createOpenRouterModel('OPENROUTER_KEY3');
}
