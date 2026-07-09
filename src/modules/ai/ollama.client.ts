import env from "@/app/env";

type OllamaGenerateResponse = {
  response?: string;
};

export async function generateWithOllama(prompt: string): Promise<string> {
  const response = await fetch(`${env.ai.ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ai.ollamaModel,
      prompt,
      stream: false,
      keep_alive: "10m",
      options: {
        temperature: 0.35,
        num_predict: 350,
      },
    }),
    signal: AbortSignal.timeout(env.ai.ollamaTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  const text = data.response?.trim();

  if (!text) {
    throw new Error("Ollama returned empty response");
  }

  return text;
}
