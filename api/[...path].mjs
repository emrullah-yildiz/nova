import { createEnterpriseApiServerAsync } from '../src/enterprise/api-server.mjs';

let apiPromise;

function getApi() {
  if (!apiPromise) {
    apiPromise = createEnterpriseApiServerAsync({
      allowDevLogin: process.env.NOVA_ALLOW_DEV_LOGIN === 'true',
      corsOrigin: process.env.NOVA_CORS_ORIGIN || '*',
      databaseUrl: process.env.NOVA_DATABASE_URL || '',
      sessionSecret: process.env.NOVA_SESSION_SECRET || undefined,
      secretsKey: process.env.NOVA_SECRETS_KEY || undefined,
      githubToken: process.env.FEEDBACK_GITHUB_TOKEN || undefined,
      githubRepo: process.env.FEEDBACK_GITHUB_REPO || undefined,
      aiPolicy: resolveAiPolicy(process.env),
      objectStorageDir: process.env.NOVA_OBJECT_STORAGE_DIR || ''
    });
  }
  return apiPromise;
}

export default async function handler(req, res) {
  const { server } = await getApi();
  server.emit('request', req, res);
}

function resolveAiPolicy(env) {
  const allowedProviders = ['mock'];
  const allowedModels = {
    mock: ['nova-mock-enterprise']
  };
  if (env.NOVA_OPENAI_API_KEY) {
    allowedProviders.push('openai');
    allowedModels.openai = splitList(env.NOVA_OPENAI_MODELS || 'gpt-4o,gpt-4o-mini');
  }
  if (env.NOVA_GROQ_API_KEY) {
    allowedProviders.push('groq');
    allowedModels.groq = splitList(env.NOVA_GROQ_MODELS || 'llama-3.3-70b-versatile,llama-3.1-8b-instant');
  }
  if (env.NOVA_OPENROUTER_API_KEY) {
    allowedProviders.push('openrouter');
    allowedModels.openrouter = splitList(env.NOVA_OPENROUTER_MODELS || 'anthropic/claude-sonnet-4.6,openai/gpt-4o,openrouter/free');
  }
  return { allowedProviders, allowedModels };
}

function splitList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}
