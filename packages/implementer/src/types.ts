import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool as OpenAIChatCompletionTool,
  ChatCompletionMessageToolCall as OpenAIChatCompletionToolCall
} from 'openai/resources/chat/completions';

export type ChatCompletionCreateParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
export type ChatCompletionResult = ChatCompletion;
export type ChatCompletionMessage = ChatCompletionMessageParam;
export type ChatCompletionTool = OpenAIChatCompletionTool;
export type ChatCompletionToolCall = OpenAIChatCompletionToolCall;
