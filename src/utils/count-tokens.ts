import { getEncoding, type Tiktoken } from "js-tiktoken";

let encoder: Tiktoken | undefined;

export function countTokens(text: string): number {
  encoder ??= getEncoding("cl100k_base");
  return encoder.encode(text).length;
}
