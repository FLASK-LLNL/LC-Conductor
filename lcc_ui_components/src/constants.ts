import { BackendOption, MoleculeNameOption } from './types';

export const BACKEND_OPTIONS: BackendOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano']
  },
  {
    value: 'livai',
    label: 'LivAI',
    defaultUrl: '',
    models: ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'claude-sonnet-4.5', 'claude-sonnet-3.7']
  },
  {
    value: 'llamame',
    label: 'LLamaMe',
    defaultUrl: '',
    models: ['openai/gpt-oss-120b', 'meta-llama/Llama-3.3-70B-Instruct']
  },
  {
    value: 'alcf',
    label: 'ALCF Sophia',
    defaultUrl: '',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'meta-llama/Llama-4-Scout-17B-16E-Instruct']
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1',
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro']
  },
  {
    value: 'ollama',
    label: 'Ollama',
    defaultUrl: '',
    models: ['gpt-oss:latest', 'gpt-oss-120b', 'gpt-oss-20b']
  },
  {
    value: 'vllm',
    label: 'vLLM',
    defaultUrl: '',
    models: ['gpt-oss-120b', 'gpt-oss-20b']
  },
  {
    value: 'huggingface',
    label: 'HuggingFace Local',
    defaultUrl: '',
    models: ['']
  },
  {
    value: 'custom',
    label: 'Custom URL',
    defaultUrl: 'http://localhost:8000',
    models: ['']
  },
];

export const MOLECULE_NAME_OPTIONS: MoleculeNameOption[] = [
  { value: 'brand', label: 'Brand/Common Name' },
  { value: 'iupac', label: 'IUPAC Name' },
  { value: 'formula', label: 'Chemical Formula' },
  { value: 'smiles', label: 'SMILES' }
];