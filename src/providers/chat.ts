export interface ChatProvider {
  complete(prompt: string, opts?: { system?: string }): Promise<string>;
}

class AnthropicProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: opts?.system,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { content: { type: string; text: string }[] };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  }
}

class OpenAIChatProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? '';
  }
}

class GrokProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROK_API_KEY ?? ''}`
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`Grok API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? '';
  }
}

export function createChatProvider(providerName: string = process.env.CHAT_PROVIDER ?? 'anthropic'): ChatProvider {
  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIChatProvider();
    case 'grok':
      return new GrokProvider();
    default:
      throw new Error(`unknown chat provider: ${providerName}`);
  }
}
