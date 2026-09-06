import { describe, expect, test } from "bun:test";

import { DeepSeekChatProvider, OpenAIResponsesProvider } from "../../src/server/ai/companion";

describe("OpenAI companion adapter", () => {
  test("sends bounded text, optional PNG input, strict JSON schema, and store false", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ status: "completed", error: null, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "Grounded answer", citations: [{ pageNumber: 1 }], supplementary: false, insufficientContext: false }) }] }] }), { status: 200 });
      },
    });
    const answer = await provider.answer({ question: "Explain this", mode: "explain", context: "[Page 1]\nbounded", allowedPages: [1], selection: { text: "bounded", pageNumber: 1, rectangles: [], regionImageDataUrl: "data:image/png;base64,AA==" } });
    expect(answer.answer).toBe("Grounded answer");
    expect(requestBody?.store).toBe(false);
    expect(requestBody?.model).toBe("test-model");
    const input = requestBody?.input as Array<{ content: Array<Record<string, string>> }>;
    expect(input[0]?.content.some((part) => part.type === "input_image")).toBe(true);
    const text = requestBody?.text as { format: { type: string; name: string; strict: boolean } };
    expect(text.format).toMatchObject({ type: "json_schema", name: "mneme_companion_answer", strict: true });
  });

  test("rejects incomplete, refusal, and malformed responses", async () => {
    const responses = [
      { status: "incomplete", output: [] },
      { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] },
      { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] },
    ];
    for (const body of responses) {
      const provider = new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }) });
      await expect(provider.answer({ question: "Explain", mode: "explain", context: "[Page 1]\ntext", allowedPages: [1] })).rejects.toThrow("live companion");
    }
  });

  test("rejects citations outside the explicit supplied page set", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "Ungrounded", citations: [{ pageNumber: 2 }], supplementary: false, insufficientContext: false }) }] }] }), { status: 200 }),
    });
    await expect(provider.answer({ question: "Explain", mode: "explain", context: "[Page 1]\ntext", allowedPages: [1] })).rejects.toThrow("ungrounded");
  });

  test("sends DeepSeek JSON mode and switches to the experimental vision model for a region", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new DeepSeekChatProvider({
      apiKey: "deepseek-test-key",
      model: "deepseek-v4-flash",
      visionModel: "deepseek-v4-flash-vision-exp",
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "A visual answer", citations: [{ pageNumber: 2 }], supplementary: false, insufficientContext: false }) } }] }), { status: 200 });
      },
    });
    const answer = await provider.answer({ question: "Explain", mode: "explain", context: "[Page 2]\nformula", allowedPages: [2], selection: { text: "", pageNumber: 2, rectangles: [], regionImageDataUrl: "data:image/png;base64,AA==" } });
    expect(answer.answer).toBe("A visual answer");
    expect(requestBody?.model).toBe("deepseek-v4-flash-vision-exp");
    expect(requestBody?.response_format).toEqual({ type: "json_object" });
    const messages = requestBody?.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]?.role).toBe("system");
    expect(JSON.stringify(messages[1]?.content)).toContain("image_url");
    expect(requestBody?.thinking).toEqual({ type: "disabled" });
  });

  test("rejects a DeepSeek HTTP failure without exposing provider details", async () => {
    const provider = new DeepSeekChatProvider({ apiKey: "deepseek-test-key", model: "deepseek-v4-flash", fetchImpl: async () => new Response("upstream detail", { status: 500 }) });
    await expect(provider.answer({ question: "Explain", mode: "explain", context: "[Page 1]\ntext", allowedPages: [1] })).rejects.toThrow("live companion is unavailable");
  });
});
