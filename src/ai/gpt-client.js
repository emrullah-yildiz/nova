export const GPTClient = {
  MODEL: 'anthropic/claude-sonnet-4.5',
  PROVIDERS: {
    openai: {
      name: 'OpenAI',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      keyPrefix: 'sk-',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (recommended)', free: false },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (faster, cheaper)', free: false },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', free: false },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (cheapest)', free: false }
      ]
    },
    groq: {
      name: 'Groq (Free Tier)',
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      keyPrefix: 'gsk_',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (free, fast)', free: true },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (free, fastest)', free: true },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (free)', free: true },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7b 32768 (free, 32k ctx)', free: true }
      ]
    },
    openrouter: {
      name: 'OpenRouter',
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      keyPrefix: 'sk-or-',
      models: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 ($3/M)', free: false },
        { id: 'openai/gpt-4o', name: 'GPT-4o ($2.50/M)', free: false },
        { id: 'openrouter/free', name: 'Auto-Select Free', free: true },
        { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', free: true }
      ]
    }
  },

  detectProvider(key) {
    if (!key) return 'openai';
    if (key.startsWith('sk-ant-')) return 'openrouter';
    if (key.startsWith('gsk_')) return 'groq';
    if (key.startsWith('sk-or-')) return 'openrouter';
    return 'openai';
  },

  getApiUrl(provider) {
    const prov = this.PROVIDERS[provider];
    return prov ? prov.apiUrl : this.PROVIDERS.openai.apiUrl;
  },

  isApiKeyValid(key) {
    return typeof key === 'string' && key.length > 10;
  }
};
