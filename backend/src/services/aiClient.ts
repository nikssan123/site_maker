import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  /** Output token budget; codegen needs more than chat. */
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionWithUsage {
  text: string;
  usage: TokenUsage;
  /** Provider label for accounting: "anthropic" | "openai". */
  provider: 'anthropic' | 'openai';
  /** Concrete model id that handled the request. */
  model: string;
}

interface AIProvider {
  complete(messages: ChatMessage[], system: string, options?: CompleteOptions): Promise<string>;
  /** Same as complete() but also returns token usage + provider/model for accounting. */
  completeWithUsage(
    messages: ChatMessage[],
    system: string,
    options?: CompleteOptions,
  ): Promise<CompletionWithUsage>;
  stream(
    messages: ChatMessage[],
    system: string,
    onToken: (token: string) => void,
  ): Promise<string>;
}

const ANTHROPIC_TIMEOUT_MS = parseInt(process.env.ANTHROPIC_TIMEOUT_MS ?? '600000', 10);

class ClaudeProvider implements AIProvider {
  private client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: ANTHROPIC_TIMEOUT_MS,
  });
  /** Override with `CLAUDE_CODE_MODEL` if your account uses a different id. Default: Opus (see Anthropic models docs). */
  private model = process.env.CLAUDE_CODE_MODEL ?? 'claude-opus-4-7';

  async complete(messages: ChatMessage[], system: string, options?: CompleteOptions): Promise<string> {
    return (await this.completeWithUsage(messages, system, options)).text;
  }

  async completeWithUsage(
    messages: ChatMessage[],
    system: string,
    options?: CompleteOptions,
  ): Promise<CompletionWithUsage> {
    const maxTokens = options?.maxTokens ?? parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '8192', 10);
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    return {
      text,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      provider: 'anthropic',
      model: this.model,
    };
  }

  async stream(
    messages: ChatMessage[],
    system: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    let full = '';
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '8192', 10),
      system,
      messages,
    });
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        full += event.delta.text;
        onToken(event.delta.text);
      }
    }
    return full;
  }
}

class OpenAIProvider implements AIProvider {
  private client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: parseInt(process.env.OPENAI_TIMEOUT_MS ?? '600000', 10),
  });
  private model: string;

  constructor(model?: string) {
    this.model = model ?? 'gpt-4o';
  }

  async complete(messages: ChatMessage[], system: string, options?: CompleteOptions): Promise<string> {
    return (await this.completeWithUsage(messages, system, options)).text;
  }

  async completeWithUsage(
    messages: ChatMessage[],
    system: string,
    options?: CompleteOptions,
  ): Promise<CompletionWithUsage> {
    const maxTokens = options?.maxTokens ?? parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? '8192', 10);
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    });
    const text = response.choices[0]?.message?.content ?? '';
    return {
      text,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      provider: 'openai',
      model: this.model,
    };
  }

  async stream(
    messages: ChatMessage[],
    system: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    let full = '';
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
    });
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) {
        full += token;
        onToken(token);
      }
    }
    return full;
  }
}

// GPT-4o for conversational planning — fast and cost-effective
const chatClient = new OpenAIProvider();

/**
 * Stronger OpenAI model for iteration clarify / scope / file exploration.
 * Override with OPENAI_ITERATE_MODEL (e.g. gpt-4.1, gpt-4o).
 */
const iterateAssistClient = new OpenAIProvider(
  process.env.OPENAI_ITERATE_MODEL?.trim() || 'gpt-4.1',
);

// Claude Opus for code generation, fixing, and iteration — higher quality by default
const codeClient = new ClaudeProvider();

export function getChatClient(): AIProvider {
  return chatClient;
}

/** OpenAI calls used only in the improvement pipeline (clarify, scope, explore). */
export function getIterateAssistClient(): AIProvider {
  return iterateAssistClient;
}

export function getCodeClient(): AIProvider {
  return codeClient;
}
