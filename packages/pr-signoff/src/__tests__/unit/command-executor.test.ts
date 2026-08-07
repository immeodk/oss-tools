import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa } from 'execa';
import { createCommandExecutor } from '../../lib/core/command-executor.js';
import { CommandExecutionError } from '../../lib/errors.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

function silentSpinner() {
  return {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    stop: vi.fn(),
  };
}

describe('command-executor', () => {
  const mockExeca = vi.mocked(execa);
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.restoreAllMocks();
  });

  test('executeCommand returns trimmed stdout', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '  out  ', stderr: '', exitCode: 0 } as any);
    const exec = createCommandExecutor();
    expect(await exec.executeCommand('git', ['status'])).toBe('out');
    expect(mockExeca).toHaveBeenCalledWith('git', ['status']);
  });

  test('executeCommand re-throws the original error', async () => {
    const boom = new Error('spawn failed');
    mockExeca.mockRejectedValueOnce(boom);
    const exec = createCommandExecutor();
    await expect(exec.executeCommand('git', ['x'])).rejects.toBe(boom);
  });

  test('executeCommands wraps a failing command in CommandExecutionError', async () => {
    const execaError = Object.assign(new Error('failed'), {
      exitCode: 2,
      stdout: 'partial out',
      stderr: 'the stderr',
      command: 'npm test',
    });
    mockExeca.mockRejectedValueOnce(execaError);

    const exec = createCommandExecutor();
    const error = await exec
      .executeCommands(['npm test'], silentSpinner())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommandExecutionError);
    const e = error as CommandExecutionError;
    expect(e.command).toBe('npm test');
    expect(e.exitCode).toBe(2);
    expect(e.stderr).toBe('the stderr');
    expect(e.cause).toBe(execaError);
  });

  test('executeCommands runs via cmd /c on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    const exec = createCommandExecutor();
    await exec.executeCommands(['echo hi'], silentSpinner());

    expect(mockExeca).toHaveBeenCalledWith('cmd', ['/c', 'echo hi']);
  });

  test('executeCommands runs via sh -c on non-win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

    const exec = createCommandExecutor();
    await exec.executeCommands(['echo hi'], silentSpinner());

    expect(mockExeca).toHaveBeenCalledWith('sh', ['-c', 'echo hi']);
  });

  test('executeCommands aborts on the first failing command', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any)
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { exitCode: 1 }));

    const exec = createCommandExecutor();
    await expect(
      exec.executeCommands(['first', 'second', 'third'], silentSpinner()),
    ).rejects.toBeInstanceOf(CommandExecutionError);

    // first (ok) + second (fails) = 2 calls; third never runs
    expect(mockExeca).toHaveBeenCalledTimes(2);
  });
});
