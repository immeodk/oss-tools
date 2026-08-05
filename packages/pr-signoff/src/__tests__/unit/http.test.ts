import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { httpJson } from '../../lib/platform/http.js';

function jsonResponse(body: unknown, init: { status?: number; text?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => init.text ?? JSON.stringify(body),
  } as Response;
}

const ThingSchema = z.object({ name: z.string() });
const parseThing = (raw: unknown): { name: string } => ThingSchema.parse(raw);

describe('httpJson', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('parses the response body through the parser', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'widget', extra: 1 }));
    const result = await httpJson('https://api/thing', parseThing);
    expect(result).toEqual({ name: 'widget' });
  });

  test('forwards method, headers, and body from init', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'x' }));
    await httpJson('https://api/thing', parseThing, {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      body: '{}',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api/thing',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer t' },
        body: '{}',
      }),
    );
  });

  test('throws with method, url, status, and body on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 404, text: 'Not Found' }));
    await expect(httpJson('https://api/thing', parseThing, { method: 'GET' })).rejects.toThrow(
      /GET https:\/\/api\/thing → 404.*Not Found/,
    );
  });

  test('throws with cause when the parser rejects the shape', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 42 }));
    await expect(httpJson('https://api/thing', parseThing)).rejects.toThrow(/https:\/\/api\/thing/);
    // the underlying validation error (ZodError) is preserved as cause
    try {
      mockFetch.mockResolvedValueOnce(jsonResponse({ name: 42 }));
      await httpJson('https://api/thing', parseThing);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).cause).toBeInstanceOf(Error);
      expect((e as Error).cause).toBeInstanceOf(z.ZodError);
    }
  });

  test('throws when the body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
      text: async () => 'not json',
    } as Response);
    await expect(httpJson('https://api/thing', parseThing)).rejects.toThrow(
      /not valid JSON|did not match/i,
    );
  });
});
