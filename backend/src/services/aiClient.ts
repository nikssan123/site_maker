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

/** Schema description for a single tool the model is forced to call. */
export interface ToolSchema<_T> {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

export interface CompleteStructuredOptions extends CompleteOptions {
  /** Cache the system prompt for reuse (5 min TTL). Default true. */
  cacheSystem?: boolean;
}

export interface StructuredResult<T> {
  input: T;
  usage: TokenUsage;
  provider: 'anthropic' | 'openai';
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
  /**
   * Force the model to emit a single tool call matching the given schema and return
   * its parsed input. Eliminates JSON-extraction failures from preamble/markdown.
   */
  completeStructured<T>(
    messages: ChatMessage[],
    system: string,
    tool: ToolSchema<T>,
    options?: CompleteStructuredOptions,
  ): Promise<StructuredResult<T>>;
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
  private model: string;

  constructor(model?: string) {
    /** Override with `CLAUDE_CODE_MODEL` if your account uses a different id. Default: Opus (see Anthropic models docs). */
    this.model = model ?? process.env.CLAUDE_CODE_MODEL ?? 'claude-opus-4-7';
  }

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

  async completeStructured<T>(
    messages: ChatMessage[],
    system: string,
    tool: ToolSchema<T>,
    options?: CompleteStructuredOptions,
  ): Promise<StructuredResult<T>> {
    const maxTokens = options?.maxTokens ?? parseInt(process.env.CLAUDE_MAX_OUTPUT_TOKENS ?? '8192', 10);
    const cacheSystem = options?.cacheSystem !== false;

    // System block array form is required to attach cache_control. Tool definition
    // is also cached so the schema doesn't recount toward input tokens on each call.
    const systemParam = cacheSystem
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : system;

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: maxTokens,
      system: systemParam,
      messages,
      tools: [{
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        ...(cacheSystem ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }],
      tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
    });

    const final = await stream.finalMessage();
    const toolBlock = final.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error(
        `Claude did not emit a tool_use block (stop_reason=${final.stop_reason ?? 'unknown'})`,
      );
    }

    return {
      input: toolBlock.input as T,
      usage: {
        inputTokens: final.usage?.input_tokens ?? 0,
        outputTokens: final.usage?.output_tokens ?? 0,
      },
      provider: 'anthropic',
      model: this.model,
    };
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

  async completeStructured<T>(
    _messages: ChatMessage[],
    _system: string,
    _tool: ToolSchema<T>,
    _options?: CompleteStructuredOptions,
  ): Promise<StructuredResult<T>> {
    // Codegen / fixer / iterator are Claude-only paths today; if you wire OpenAI
    // into one of those, implement this with `tools` + `tool_choice` on chat.completions.
    throw new Error('completeStructured is not implemented for the OpenAI provider');
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

// Claude Opus for initial code generation and fixing — highest quality by default
const codeClient = new ClaudeProvider();

/**
 * Faster Claude (Sonnet 4.6 by default) for the iteration codegen.
 * Iterations are small targeted edits; Sonnet is ~2-3x faster than Opus and easily good
 * enough. The iterator falls back to the Opus `codeClient` on retry when this fails.
 * Override with CLAUDE_ITERATE_MODEL.
 */
const iterateCodeClient = new ClaudeProvider(
  process.env.CLAUDE_ITERATE_MODEL?.trim() || 'claude-sonnet-4-6',
);

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

/** Faster Claude for the iterator's structured codegen. Falls back to getCodeClient() on retry. */
export function getIterateCodeClient(): AIProvider {
  return iterateCodeClient;
}
