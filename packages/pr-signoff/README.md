# PR Signoff Tool

Run your CI checks locally and create Azure DevOps or GitHub status checks. Skip the queue, validate on your machine.

This package (`@immeodk/pr-signoff`) is one of three packages published from the [oss-tools](../../README.md) workspace, alongside `@immeodk/git-utils` and `@immeodk/schema-tools`.

## The Problem

You push code. You wait for a build agent. Eventually it runs. Tests fail. You fix. Push again. Wait again.

Build agents are shared resources. During busy periods, you're competing with your entire organization for compute time. Meanwhile, your laptop is sitting there with 32GB of RAM and 10 cores, mostly idle while you wait.

## The Solution

Your machine is faster than most build agents. It already has your code. It can run the same tests, linting, and builds - immediately.

PR Signoff runs your validation commands locally, then creates the Azure DevOps status check that says "yes, this passed". You become the CI.

```bash
# Instead of: push, wait, hope, fix, repeat
# You do: test, fix, push once, signoff
pr-signoff validate  # Run locally first
pr-signoff           # Create the status check (defaults to signoff)
```

This follows the same philosophy as [gh-signoff](https://github.com/basecamp/gh-signoff) for GitHub, but tailored for both Azure DevOps and Github workflows with some key differences:

- **Azure DevOps integration** - Creates status checks via Azure DevOps API
- **Built-in validation** - Unlike gh-signoff, you can't sign off unless your tests actually pass. We validate git state, run your tests, and only then create the status check
- **Folder scoping** - In monorepos, only run checks for changed areas
- **Multiple policies** - Different teams can have different validation requirements in the same repo
- **Branch policies** - Set up required status checks directly from the CLI

## How to Use It

### Basic Workflow

1. **Configure what to run** - Create `pr-signoff.yaml`:

```yaml
# Minimum tool version required
minToolVersion: '1.5.0'

# Azure DevOps connection details
azureDevOps:
  organization: your-org
  project: your-project
  tenantId: your-tenant-id # Optional, for authentication

signoff:
  # Scope signoff to the folder containing changes (useful for monorepos)
  scopeToFolder: true

  # Default validation method for new PRs
  defaultSignoffMethod: local # 'local' or 'pipeline'

  # Commands to run for validation
  commands:
    - npm install
    - npm test
    - npm run lint
```

2. **Test locally before pushing**:

```bash
pr-signoff validate
# Runs your commands, shows you what breaks
```

3. **Push and create your PR** like normal

4. **Sign off your own PR**:

```bash
pr-signoff
# Runs the checks again, creates status check
```

That's it. Your PR now has a green check. No waiting.

## When This Makes Sense

PR Signoff works best when:

- Your validation commands run reliably across different machines (Docker containers as me almost always use make this straightforward - same image everywhere)
- You trust your team to run the checks honestly (the tool enforces validation before signoff, so circumventing requires deliberate effort)
- Build agent queues are slowing you down (or the process is frustrating your developers)
- You want faster feedback loops

It's not for every situation. Critical production pipelines might still need centralized CI. But for most development? Your laptop is plenty.

## Installation

```bash
# Install globally
npm install -g @immeodk/pr-signoff

# Or run directly without installation
npx @immeodk/pr-signoff --help
```

**Uninstall:**

```bash
npm uninstall -g @immeodk/pr-signoff
```

## Advanced Configuration

### Monorepo Support

Got a monorepo? Different teams? Different standards? No problem.

Enable `scopeToFolder` to only run checks when files in that folder change:

```yaml
signoff:
  commands:
    - npm test
  scopeToFolder: true
  policyName: Frontend Team
```

Now your frontend team's `pr-signoff.yml` only triggers for frontend changes. Backend team has their own. Everyone validates their own code.

### Multiple Policies

```
repo/
├── frontend/
│   └── pr-signoff.yml  # npm test, eslint
├── backend/
│   └── pr-signoff.yml  # dotnet test
└── infrastructure/
    └── pr-signoff.yml  # terraform validate
```

Each config creates its own status check, scoped to that folder. PRs touching multiple areas need multiple signoffs. Teams stay autonomous.

## IDE Support & Schema Configuration

PR Signoff provides JSON Schema for intelligent autocomplete, validation, and documentation in YAML configuration files. This works with VS Code, Cursor, and JetBrains Rider.

### Quick Setup

**For VS Code or Cursor users:**

1. Install the "YAML Language Support by Red Hat" extension
2. Run the schema installation:

```bash
# Install for VS Code (default)
pr-signoff schema install --global

# Install for Cursor
pr-signoff schema install --global --editor cursor

# Install for all editors
pr-signoff schema install --global --all-editors
```

**For JetBrains Rider users:**

1. Run: `pr-signoff schema install --global --editor rider`
2. In Rider: File > Settings > Languages & Frameworks > Schemas and DTDs > JSON Schema Mappings
3. Click "+" to add new mapping
4. Set schema file path and file patterns as instructed

### Schema Commands

```bash
# Install schema for intellisense
pr-signoff schema install [--global] [--editor <editor>] [--all-editors]

# Check installation status for all editors
pr-signoff schema info

# Update existing schema installations
pr-signoff schema update [--global] [--editor <editor>] [--all-editors]

# Remove schema configuration
pr-signoff schema uninstall [--global] [--editor <editor>] [--all-editors]
```

**Supported editors:** `vscode`, `cursor`, `rider`

### What You Get

With schema installed, editing `pr-signoff.yaml` files provides:

- **Autocomplete** for configuration properties
- **Validation** with error highlighting for invalid values
- **Documentation** on hover for each configuration option
- **Type safety** ensuring correct YAML structure

## Commands

### validate

Test your commands locally. Shows what would run during signoff.

```bash
pr-signoff validate

# For real-time output streaming (recommended for long-running commands):
pr-signoff validate --stream-output

# With verbose logging for debugging:
pr-signoff validate --verbose
```

**Note**: Error output is always displayed. Use `--stream-output` to see command output in real-time, which is especially useful for commands that take time to execute (like bicep tests with many modules).

### status

Check PR status and who has signed off.

```bash
pr-signoff status           # Auto-detects current PR
pr-signoff status --id 123  # Specific PR
```

### signoff (default)

Run your checks and create the status check. This is the main command and the default when no command is specified.

```bash
pr-signoff

# Stream output in real-time for long-running commands:
pr-signoff --stream-output

# With verbose logging for debugging:
pr-signoff --verbose
```

Requires clean git state. Runs all configured commands, then creates a status check in Azure DevOps.

### setup-policy

Configure branch policy to require signoff.

```bash
pr-signoff setup-policy                   # Required on main
pr-signoff setup-policy --optional        # Optional signoff
pr-signoff setup-policy --branch develop  # Different branch
```

### pr create

Create a new pull request with intelligent title/description generation and signoff method.

```bash
# Create PR (uses default signoff method from config, or 'local' if not specified)
pr-signoff pr create --title "Add new feature" --target-branch main

# Create PR with explicit signoff method
pr-signoff pr create --title "Add new feature" --signoff-method pipeline

# Create draft PR with auto-complete
pr-signoff pr create --title "WIP: Feature" --draft --auto-complete

# Create PR interactively with smart suggestions (recommended)
pr-signoff pr create  # Uses branch name and commits for title/description suggestions
```

**Smart PR Creation Features:**

- **Title suggestions**: Generated from branch names (e.g., `feature/user-auth` → "User Auth")
- **PR template detection**: Automatically finds and fills PR templates from `.azuredevops/`, `docs/`, `.github/` folders
- **Description generation**: Creates structured descriptions from commit messages
- **External editor integration**: Opens VS Code or your preferred editor for description editing
- **Template intelligence**: Auto-fills placeholders and checks relevant boxes based on branch type

### pr validation-mode

Set validation mode for an existing PR.

```bash
# Switch PR to pipeline validation
pr-signoff pr validation-mode pipeline

# Switch PR to local validation
pr-signoff pr validation-mode local

# Set validation mode for specific PR
pr-signoff pr validation-mode local --id 123
```

### pr show

Show PR details including validation mode.

```bash
pr-signoff pr show           # Auto-detects current PR
pr-signoff pr show --id 123  # Specific PR
```

### setup

Configure pr-signoff components for hybrid validation.

```bash
# Generate base pr-signoff.yaml configuration
pr-signoff setup generate-config

# Generate configuration with force overwrite (if file exists)
pr-signoff setup generate-config --force

# Setup branch policy to require signoff status check
pr-signoff setup register-pr-signoff-policy --branch main

# Create pipeline YAML for hybrid validation
pr-signoff setup pr-signoff-pipeline

# Create pipeline YAML with force overwrite
pr-signoff setup pr-signoff-pipeline --force

# Register pipeline in Azure DevOps (creates both pipeline and build validation policy)
pr-signoff setup register-pr-signoff-pipeline

# Register pipeline with custom name
pr-signoff setup register-pr-signoff-pipeline --pipeline-name "Custom PR Validation"
```

## Hybrid Validation Workflow

### Overview

PR Signoff supports hybrid validation where PRs can be validated either locally (using pr-signoff) or in the pipeline, based on PR tags. This allows teams with diverse environments to use the same workflow while giving flexibility in how validation is performed.

### How It Works

1. **PR Creation**: When creating a PR, specify the signoff method:
   - `signoff-method-local` tag: PR should be validated locally using pr-signoff
   - `signoff-method-pipeline` tag: PR will be validated by the pipeline
   - Default method: Uses `defaultSignoffMethod` from config or 'local' if not specified

2. **Pipeline Behavior**: The pipeline checks for these tags:
   - If `signoff-method-local` tag is present, pipeline skips validation
   - Otherwise, pipeline runs full validation with scoped path filtering

3. **Local Validation**: For PRs tagged with `signoff-method-local`:
   - Developers run `pr-signoff` locally to create status checks
   - Pipeline shows as "skipped" with informational message
   - Faster iteration and immediate feedback

4. **Path-Scoped Validation**: Both local and pipeline validation are scoped to the folder where pr-signoff.yaml is located, making it perfect for monorepos

### Setting Up Hybrid Validation

#### Step 1: Generate Configuration

```bash
# Generate base pr-signoff.yaml configuration
pr-signoff setup generate-config
```

This creates a pr-signoff.yaml with hybrid validation configuration:

```yaml
# Minimum tool version required
minToolVersion: '1.5.0'

# Azure DevOps connection details
azureDevOps:
  organization: your-org
  project: your-project

# Signoff configuration
signoff:
  # Scope signoff to the folder containing changes (useful for monorepos)
  scopeToFolder: true

  # Default validation method for new PRs
  defaultSignoffMethod: local

  # Pipeline signoff configuration (for hybrid validation)
  pipelineSignoff:
    name: pr-signoff-pipeline
    azureDevOpsPipelineFolder: "\\\\PR Validation" # Azure DevOps pipeline folder path
    pipelineDefinition: .pipeline/pr-signoff-pipeline.yaml

  # Commands to run for validation
  commands:
    - npm install
    - npm test
    - npm run lint
```

#### Step 2: Create Pipeline YAML

```bash
# Generate pipeline YAML with hybrid validation support
pr-signoff setup pr-signoff-pipeline
```

This creates `.pipeline/pr-signoff-pipeline.yaml` with intelligent path-scoped validation.

#### Step 3: Register Pipeline and Policies

```bash
# Register pipeline in Azure DevOps and create build validation policy
pr-signoff setup register-pr-signoff-pipeline

# Register branch policy for status checks
pr-signoff setup register-pr-signoff-policy --branch main
```

This single command:

- Creates the pipeline in Azure DevOps
- Sets up build validation policy (pipeline runs on PRs)
- Configures path filtering based on your project location
- Handles all Azure DevOps integration automatically

#### Step 4: Grant Pipeline Permissions

The pipeline needs permission to create status checks on pull requests:

1. **Navigate to Repository Security:**
   - Go to **Project Settings** → **Repositories**
   - Select your repository → **Security** tab

2. **Grant Build Service Permissions:**
   - Find **"[Project Name] Build Service"** in the users list
   - Set **"Contribute to pull requests"** to **"Allow"** (green checkmark)

**Without this permission, you'll get "Forbidden" errors when the pipeline tries to create status checks.**

#### Step 5: Create PRs with Signoff Method

```bash
# Uses default from config (or 'local' if not specified)
pr-signoff pr create --title "Feature X"

# Override default for specific PRs
pr-signoff pr create --title "Feature Y" --signoff-method pipeline

# Interactive creation with smart suggestions (recommended)
pr-signoff pr create
```

### Use Cases

**Local Validation** - Best for:

- Developers with complete local environments
- Quick iteration and testing
- Reducing pipeline queue times
- Teams that trust developers to run checks

**Pipeline Validation** - Best for:

- Developers without specific tools (Docker, SDKs)
- Standardized validation environment
- Critical changes requiring centralized validation
- Teams requiring audit trails in pipeline logs

### Switching Validation Modes

You can change validation mode after PR creation:

```bash
# Switch to pipeline validation
pr-signoff pr validation-mode pipeline

# Switch to local validation
pr-signoff pr validation-mode local
```

## Troubleshooting

### Pipeline Issues

**"Forbidden" error when creating status checks:**

```
✖ Failed to create status check: Forbidden
```

**Solution:** The Build Service needs permission to contribute to pull requests:

1. Go to **Project Settings** → **Repositories** → **[Repository]** → **Security**
2. Find **"[Project] Build Service"** user
3. Set **"Contribute to pull requests"** to **"Allow"**

**Pipeline can't find pr-signoff configuration:**

```
✖ pr-signoff.yml or pr-signoff.yaml not found in repository root
```

**Solution:** The pipeline searches for config files. Ensure your `pr-signoff.yaml` exists in the solution folder and the pipeline is configured correctly.

**npm authentication issues in pipeline:**

```
npm warn Unknown user config "always-auth"
```

**Solution:** Regenerate your pipeline file with the latest template:

```bash
pr-signoff setup pr-signoff-pipeline --force
```

### Local Development Issues

**Git state warnings:**

```
⚠️ Found git state issues - these must be resolved before running signoff
```

**Solution:** Ensure clean git state:

```bash
git status  # Check for uncommitted changes
git add .   # Stage changes
git commit  # Commit changes
```

## Authentication

Uses Azure CLI. You'll be prompted to login if needed. Make sure you have access to the project.

## Development

Working on the tool itself? See the [oss-tools root CONTRIBUTING.md](../../CONTRIBUTING.md) and [this package's CONTRIBUTING.md](CONTRIBUTING.md) for the full workspace dev loop.

Quick reference, run from the **workspace root** (`oss-tools/`):

```bash
npm install                            # installs all 3 packages; auto-symlinks
                                        # @immeodk/git-utils and @immeodk/schema-tools
                                        # into this package via npm workspaces
npm run build -w @immeodk/pr-signoff
npm run test -w @immeodk/pr-signoff
npm run type-check -w @immeodk/pr-signoff
```

Or from this package's directory directly:

```bash
cd packages/pr-signoff
node pr-signoff.js validate

# Link globally for manual testing
npm link
pr-signoff validate
npm unlink -g @immeodk/pr-signoff  # when done
```

**Note:** `@immeodk/git-utils`/`@immeodk/schema-tools` resolve as workspace symlinks automatically — there's no separate linking step. If you edit their source, run `npm run build` at the workspace root before re-running this package's tests, or you'll pick up stale compiled output.
