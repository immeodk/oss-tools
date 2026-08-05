# Git Utils

Common git validation utilities for platform engineering tools.

## Purpose

This module provides reusable git operations and validation functions that work with any git repository. It's designed to be shared across multiple platform engineering tools to ensure consistent git state validation.

## Features

- Basic git state validation (unstaged/uncommitted/untracked changes)
- Remote synchronization checks
- Cross-platform git command execution
- Verbose logging support
- Consistent error messages

## Installation

```bash
npm install @immeodk/git-utils
```

## Usage

```javascript
import {
  validateGitState,
  getCurrentBranch,
  getCurrentCommit,
  executeGitCommand,
} from '@immeodk/git-utils';

// Validate git state with options
await validateGitState({
  allowDirty: false,
  allowOutdated: false,
  verbose: true,
});

// Get current branch
const branch = await getCurrentBranch({ verbose: true });

// Execute custom git commands
const output = await executeGitCommand(['status', '--porcelain'], { verbose: true });
```

## Functions

- `validateBasicGitState(options)` - Check for unstaged/uncommitted/untracked changes
- `validateGitState(options)` - Full validation including remote sync
- `getCurrentBranch(options)` - Get current branch name
- `getCurrentCommit(short, options)` - Get current commit hash
- `checkUntrackedFiles(options)` - Check for untracked files (throws error if found)
- `checkBranchUpToDate(branch, remote, options)` - Verify branch is up-to-date
- `executeGitCommand(args, options)` - Execute git commands with error handling

## Dependencies

- `execa` - Cross-platform command execution
