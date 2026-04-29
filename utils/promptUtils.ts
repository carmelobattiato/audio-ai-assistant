import { SystemPrompt } from '../types';

export function resolvePrompt(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.split(`{{${key}}}`).join(val),
    template
  );
}

export function getSystemPrompt(systemPrompts: SystemPrompt[], id: string): SystemPrompt | undefined {
  return systemPrompts.find(p => p.id === id);
}

export function getPromptText(systemPrompts: SystemPrompt[], id: string): string {
  return systemPrompts.find(p => p.id === id)?.text ?? '';
}
