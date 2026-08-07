import { createLogger } from '../core/logger.js';
import { httpJson } from '../platform/http.js';
import { parseGitHubRulesetList, parseGitHubRuleset, type GitHubRuleset } from './schemas.js';
import type { PolicyAdapter } from '../platform/platform-adapter.js';
import type { Repository, PolicyCreationResult } from '../platform/types.js';

const GITHUB_API = 'https://api.github.com';

export interface GitHubPolicyManagerOptions {
  verbose?: boolean;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * GitHub implementation of {@link PolicyAdapter}.
 *
 * Maps the AzDO "branch policy of type Status check" concept onto a
 * GitHub Repository Ruleset with a `required_status_checks` rule.
 *
 * Folder-scoped policies: GitHub Rulesets don't have a true per-path
 * required-status-check semantic. Path scoping happens at signoff time
 * (the orchestrator checks PR-changed files against the configured folder
 * before creating the status), so the ruleset itself targets the whole
 * branch regardless of `scopedFolder`.
 */
export function createGitHubPolicyManager(
  owner: string,
  repo: string,
  options: GitHubPolicyManagerOptions = {},
): PolicyAdapter {
  const logger = createLogger(options.verbose || false);

  return {
    logger,

    async setupPolicy(
      token,
      repoInfo: Repository,
      contextName: string,
      opts,
    ): Promise<PolicyCreationResult> {
      const { targetBranch, required = true, scopedFolder } = opts;

      if (scopedFolder) {
        logger.verboseLog(
          `scopedFolder='${scopedFolder}' ignored at the ruleset layer; ` +
            'scope filtering happens at signoff time via PR file-diff check.',
        );
      }

      const existing = await listRulesets(token);
      const match = existing.find((r) => r.name === contextName);

      const body = buildRulesetBody(contextName, targetBranch, required);

      if (match) {
        const updated = await httpJson(
          `${GITHUB_API}/repos/${owner}/${repo}/rulesets/${match.id}`,
          parseGitHubRuleset,
          {
            method: 'PUT',
            headers: {
              ...authHeaders(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );
        return {
          action: 'updated',
          policyId: updated.id || match.id,
          repository: repoInfo.name,
          targetBranch,
          required,
        };
      }

      const created = await httpJson(
        `${GITHUB_API}/repos/${owner}/${repo}/rulesets`,
        parseGitHubRuleset,
        {
          method: 'POST',
          headers: {
            ...authHeaders(token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      return {
        action: 'created',
        policyId: created.id,
        repository: repoInfo.name,
        targetBranch,
        required,
      };
    },
  };

  async function listRulesets(token: string): Promise<GitHubRuleset[]> {
    return httpJson(`${GITHUB_API}/repos/${owner}/${repo}/rulesets`, parseGitHubRulesetList, {
      headers: authHeaders(token),
    });
  }

  function buildRulesetBody(contextName: string, targetBranch: string, required: boolean) {
    return {
      name: contextName,
      target: 'branch',
      enforcement: required ? 'active' : 'evaluate',
      conditions: {
        ref_name: {
          include: [`refs/heads/${targetBranch}`],
          exclude: [],
        },
      },
      rules: [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [{ context: contextName }],
            strict_required_status_checks_policy: false,
          },
        },
      ],
    };
  }
}
