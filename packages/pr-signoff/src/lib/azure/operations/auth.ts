import chalk from 'chalk';
import { describeError } from '../../core/error-message.js';
import { AZURE_DEVOPS_RESOURCE_ID } from '../../core/configuration-manager.js';
import { readEnv, isAzureDevOpsPipeline } from '../../config/env.js';
import { AuthError } from '../../errors.js';
import { parseAzAccountShow, parseAzAccessToken } from '../schemas.js';
import type { AzureContext } from './context.js';

/**
 * Acquire an Azure DevOps access token.
 *
 * In a pipeline, uses `$AZURE_DEVOPS_TOKEN`. Otherwise shells out to the Azure
 * CLI: verifies the active tenant, logs in interactively if needed, then
 * requests a token scoped to Azure DevOps.
 */
export async function getAzureDevOpsToken(ctx: AzureContext): Promise<string> {
  const { logger, commandExecutor, config } = ctx;
  try {
    const pipelineToken = readEnv().AZURE_DEVOPS_TOKEN;
    if (pipelineToken && isAzureDevOpsPipeline()) {
      logger.verboseLog('Using Azure DevOps pipeline token for authentication');
      return pipelineToken;
    }

    const { tenantId } = config.azureDevOps || {};

    if (!tenantId) {
      throw new Error(
        'Azure AD tenant ID is required in pr-signoff.json configuration (azureDevOps.tenantId).',
      );
    }

    // Check if already logged in to the correct tenant
    let currentTenant: string | null;
    try {
      const accountInfo = await commandExecutor.executeCommand('az', ['account', 'show']);
      currentTenant = parseAzAccountShow(JSON.parse(accountInfo)).tenantId;
    } catch {
      currentTenant = null;
    }

    // If not logged in or wrong tenant, do interactive login
    if (!currentTenant || currentTenant.toLowerCase() !== tenantId.toLowerCase()) {
      console.log(chalk.yellow('\nNot logged in to the correct Azure tenant.'));
      console.log(chalk.cyan('Starting interactive login. Please follow the browser prompts...\n'));

      try {
        await commandExecutor.executeCommand('az', [
          'login',
          '--tenant',
          tenantId,
          '--allow-no-subscriptions',
        ]);
        console.log(chalk.green('\n✓ Successfully logged in to Azure\n'));
      } catch (error: unknown) {
        console.log(chalk.red('\n✗ Failed to log in to Azure\n'));
        throw new AuthError(`Azure login failed: ${describeError(error)}`, { cause: error });
      }
    }

    try {
      const tokenResult = await commandExecutor.executeCommand('az', [
        'account',
        'get-access-token',
        '--resource',
        AZURE_DEVOPS_RESOURCE_ID,
        '--tenant',
        tenantId,
      ]);
      return parseAzAccessToken(JSON.parse(tokenResult)).accessToken;
    } catch (error: unknown) {
      throw new AuthError(`Failed to get Azure DevOps token: ${describeError(error)}`, {
        cause: error,
      });
    }
  } catch (error: unknown) {
    // Re-throw AuthError as-is; wrap anything else (e.g. missing tenantId).
    if (error instanceof AuthError) throw error;
    throw new AuthError(`Failed to get Azure DevOps token: ${describeError(error)}`, {
      cause: error,
    });
  }
}
