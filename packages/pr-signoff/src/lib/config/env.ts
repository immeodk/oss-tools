/**
 * Validated view of the environment variables this tool reads.
 *
 * All reads of CI/auth env vars go through here so there's a single typed
 * surface (see the `runtime-safety` skill). `readEnv()` re-reads `process.env`
 * on every call — it must not memoize, since tests and long-running processes
 * can mutate the environment.
 */
import { z } from 'zod';

const EnvSchema = z
  .object({
    // Azure DevOps pipeline context
    TF_BUILD: z.string().optional(),
    BUILD_REASON: z.string().optional(),
    AZURE_DEVOPS_TOKEN: z.string().optional(),
    SYSTEM_PULLREQUEST_PULLREQUESTID: z.string().optional(),
    SYSTEM_PULLREQUEST_SOURCEBRANCHNAME: z.string().optional(),
    BUILD_SOURCEVERSION: z.string().optional(),
    // GitHub Actions context
    GITHUB_ACTIONS: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    GH_TOKEN: z.string().optional(),
    GITHUB_EVENT_NAME: z.string().optional(),
    GITHUB_HEAD_REF: z.string().optional(),
    // Editor selection (PR description editing)
    EDITOR: z.string().optional(),
    VISUAL: z.string().optional(),
  })
  // zod strips unknown keys by default, so `process.env`'s other keys are dropped.
  .partial();

export type Env = z.infer<typeof EnvSchema>;

export function readEnv(): Env {
  return EnvSchema.parse(process.env);
}

/** True when running inside a GitHub Actions runner. */
export function isGitHubActions(): boolean {
  return readEnv().GITHUB_ACTIONS === 'true';
}

/** True when running inside an Azure DevOps pipeline. */
export function isAzureDevOpsPipeline(): boolean {
  const env = readEnv();
  return Boolean(env.TF_BUILD || env.BUILD_REASON);
}
