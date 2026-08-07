import { describe, test, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap, map, mapErr, type Result } from '../../lib/core/result.js';

describe('Result', () => {
  test('ok() builds a success result', () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  test('err() builds a failure result', () => {
    const e = new Error('boom');
    const r = err(e);
    expect(r).toEqual({ ok: false, error: e });
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  test('unwrap returns the value for ok', () => {
    expect(unwrap(ok('hi'))).toBe('hi');
  });

  test('unwrap throws the error for err', () => {
    const e = new Error('nope');
    expect(() => unwrap(err(e))).toThrow(e);
  });

  test('map transforms an ok value, passes err through', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
    const e = new Error('x');
    expect(map(err<Error>(e), (n: number) => n * 10)).toEqual({ ok: false, error: e });
  });

  test('mapErr transforms an err, passes ok through', () => {
    const wrapped = mapErr(err(new Error('low')), (e) => new Error(`high: ${e.message}`));
    expect(isErr(wrapped)).toBe(true);
    if (isErr(wrapped)) expect(wrapped.error.message).toBe('high: low');
    expect(mapErr(ok(5), () => new Error('unused'))).toEqual({ ok: true, value: 5 });
  });

  test('narrowing works through isOk/isErr', () => {
    const r: Result<number, Error> = ok(7);
    if (isOk(r)) {
      // r.value is number here
      expect(r.value + 1).toBe(8);
    } else {
      throw new Error('should be ok');
    }
  });
});
