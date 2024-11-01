import { OpenAI } from 'openai'

import { EmbeddingModel } from '../../types/embedding'
import {
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
} from '../llm/exception'
import { NoStainlessOpenAI } from '../llm/ollama'

export const getEmbeddingModel = (
  name: string,
  apiKeys: {
    openAIApiKey: string
  },
  ollamaBaseUrl: string,
): EmbeddingModel => {
  switch (name) {
    case 'text-embedding-3-small': {
      const openai = new OpenAI({
        apiKey: apiKeys.openAIApiKey,
        dangerouslyAllowBrowser: true,
      })
      return {
        name: 'text-embedding-3-small',
        dimension: 1536,
        getEmbedding: async (text: string) => {
          if (!openai.apiKey) {
            throw new LLMAPIKeyNotSetException(
              'OpenAI API key is missing. Please set it in settings menu.',
            )
          }
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
          })
          return embedding.data[0].embedding
        },
      }
    }
    case 'text-embedding-3-large': {
      const openai = new OpenAI({
        apiKey: apiKeys.openAIApiKey,
        dangerouslyAllowBrowser: true,
      })
      return {
        name: 'text-embedding-3-large',
        dimension: 3072,
        getEmbedding: async (text: string) => {
          if (!openai.apiKey) {
            throw new LLMAPIKeyNotSetException(
              'OpenAI API key is missing. Please set it in settings menu.',
            )
          }
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: text,
          })
          return embedding.data[0].embedding
        },
      }
    }
    case 'nomic-embed-text': {
      const openai = new NoStainlessOpenAI({
        apiKey: '',
        dangerouslyAllowBrowser: true,
        baseURL: `${ollamaBaseUrl}/v1`,
      })
      return {
        name: 'nomic-embed-text',
        dimension: 768,
        getEmbedding: async (text: string) => {
          if (!ollamaBaseUrl) {
            throw new LLMBaseUrlNotSetException(
              'Ollama Address is missing. Please set it in settings menu.',
            )
          }
          const embedding = await openai.embeddings.create({
            model: 'nomic-embed-text',
            input: text,
          })
          return embedding.data[0].embedding
        },
      }
    }
    case 'mxbai-embed-large': {
      const openai = new NoStainlessOpenAI({
        apiKey: '',
        dangerouslyAllowBrowser: true,
        baseURL: `${ollamaBaseUrl}/v1`,
      })
      return {
        name: 'mxbai-embed-large',
        dimension: 1024,
        getEmbedding: async (text: string) => {
          if (!ollamaBaseUrl) {
            throw new LLMBaseUrlNotSetException(
              'Ollama Address is missing. Please set it in settings menu.',
            )
          }
          const embedding = await openai.embeddings.create({
            model: 'mxbai-embed-large',
            input: text,
          })
          return embedding.data[0].embedding
        },
      }
    }
    case 'bge-m3': {
      const openai = new NoStainlessOpenAI({
        apiKey: '',
        dangerouslyAllowBrowser: true,
        baseURL: `${ollamaBaseUrl}/v1`,
      })
      return {
        name: 'bge-m3',
        dimension: 1024,
        getEmbedding: async (text: string) => {
          if (!ollamaBaseUrl) {
            throw new LLMBaseUrlNotSetException(
              'Ollama Address is missing. Please set it in settings menu.',
            )
          }
          const embedding = await openai.embeddings.create({
            model: 'bge-m3',
            input: text,
          })
          return embedding.data[0].embedding
        },
      }
    }
    default:
      throw new Error('Invalid embedding model')
  }
}
