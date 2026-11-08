import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ env: {
  IMAGE_PROVIDER: "openai",
  IMAGE_API_KEY: "test-image-key-long-enough",
  IMAGE_MODEL: "gpt-image-2.5-flare",
  IMAGE_GENERATION_ENABLED: "true",
  IMAGE_MONTHLY_BUDGET_CENTS: "10000",
  IMAGE_WORKSPACE_MONTHLY_BUDGET_CENTS: "1000",
  IMAGE_PROVIDER_COST_CENTS_PER_IMAGE: "10",
  IMAGE_CUSTOMER_PRICE_CENTS_PER_IMAGE: "25"
} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ env: mocked.env }));
import { getManagedImageConfiguration, OpenAiImageAdapter } from "@/lib/providers/image-adapters";

const context = { tenantId: "00000000-0000-0000-0000-000000000001", correlationId: "image-test", idempotencyKey: "image-test-1", liveActionsEnabled: true };
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function pngFixture(width: number, height: number, colorType = 6, bitDepth = 8) {
  const channels = colorType === 2 ? 3 : 4;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  const rowLength = 1 + width * channels;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(rowLength * height))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const png = pngFixture(1024, 1024);

describe("OpenAI image adapter", () => {
  beforeEach(() => { mocked.env.IMAGE_GENERATION_ENABLED = "true"; mocked.env.IMAGE_MODEL = "gpt-image-2.5-flare"; mocked.env.IMAGE_API_KEY = "test-image-key-long-enough"; mocked.env.IMAGE_CUSTOMER_PRICE_CENTS_PER_IMAGE = "25"; });
  afterEach(() => vi.restoreAllMocks());
  it("requires explicit current model, activation, caps, and profitable pricing", () => {
    expect(getManagedImageConfiguration()?.providerKey).toBe("openai_image");
    mocked.env.IMAGE_MODEL = "old-image-model";
    expect(getManagedImageConfiguration()).toBeNull();
    mocked.env.IMAGE_MODEL = "gpt-image-2.5-flare";
    mocked.env.IMAGE_CUSTOMER_PRICE_CENTS_PER_IMAGE = "10";
    expect(getManagedImageConfiguration()).toBeNull();
  });
  it("submits a current explicit model and returns validated PNG bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5, input_tokens_details: { text_tokens: 2, image_tokens: 0 }, output_tokens_details: { text_tokens: 0, image_tokens: 3 }, arbitrary: "discard-me" } }), { status: 200, headers: { "x-request-id": "req_123" } }));
    const result = await new OpenAiImageAdapter(fetchMock).createImage(context, { prompt: "A truthful roofing service image advertisement.", size: "1024x1024" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({ model: "gpt-image-2.5-flare", size: "1024x1024", output_format: "png", quality: "medium" });
    expect(request.safety_identifier).toMatch(/^[a-f0-9]{64}$/);
    if (!result.ok) throw new Error("expected successful image fixture");
    expect(result.data.usage.metadata?.providerUsageEvidence).toMatchObject({ input_tokens: 2, output_tokens: 3, total_tokens: 5 });
    expect(JSON.stringify(result.data.usage.metadata)).not.toContain("discard-me");
  });
  it("rejects prompts, source assets, invalid payloads, and disabled configuration without a request", async () => {
    const fetchMock = vi.fn();
    const adapter = new OpenAiImageAdapter(fetchMock);
    expect((await adapter.createImage(context, { prompt: "short" })).ok).toBe(false);
    expect((await adapter.createImage(context, { prompt: "A sufficiently descriptive prompt", assets: ["https://example.com/a.png"] })).ok).toBe(false);
    mocked.env.IMAGE_GENERATION_ENABLED = "false";
    expect((await adapter.createImage(context, { prompt: "A sufficiently descriptive prompt" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("maps timeouts and provider errors without leaking raw details", async () => {
    const timedOut = new OpenAiImageAdapter(vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")));
    expect(await timedOut.createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "provider_timeout", retryable: true });
    const moderated = new OpenAiImageAdapter(vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "content_policy", message: "secret internal detail" } }), { status: 400 })));
    expect(await moderated.createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "provider_moderation", retryable: false });
  });
  it("rejects a forged PNG signature with malformed image content", async () => {
    const malformed = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("not-a-png")]);
    const adapter = new OpenAiImageAdapter(vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: malformed.toString("base64") }] }), { status: 200 })));
    expect(await adapter.createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "invalid_provider_response", retryable: true });
  });
  it("rejects dimension mismatches and unsupported PNG encodings", async () => {
    for (const invalid of [pngFixture(1, 1), pngFixture(1024, 1024, 0, 8), pngFixture(1024, 1024, 6, 16)]) {
      const adapter = new OpenAiImageAdapter(vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: invalid.toString("base64") }] }), { status: 200 })));
      expect(await adapter.createImage(context, { prompt: "A sufficiently descriptive prompt", size: "1024x1024" })).toMatchObject({ ok: false, errorCategory: "invalid_provider_response" });
    }
  });
  it("bounds response buffering and treats oversize or malformed JSON as unknown exposure", async () => {
    const oversized = new OpenAiImageAdapter(vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "x".repeat(128) }] }), { status: 200 })), 64);
    expect(await oversized.createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "invalid_provider_response", retryable: true });
    const malformed = new OpenAiImageAdapter(vi.fn().mockResolvedValue(new Response("{not-json", { status: 200 })), 64);
    expect(await malformed.createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "provider_transport_unknown", retryable: true });
  });

  it("keeps timeout handling active while the response body is being consumed", async () => {
    const body = new ReadableStream<Uint8Array>({ pull() { throw new DOMException("Timed out while reading body", "TimeoutError"); } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    expect(await new OpenAiImageAdapter(fetchMock).createImage(context, { prompt: "A sufficiently descriptive prompt" })).toMatchObject({ ok: false, errorCategory: "provider_timeout", retryable: true });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
