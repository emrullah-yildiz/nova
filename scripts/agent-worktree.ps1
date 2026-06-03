<#
.SYNOPSIS
  Manage per-agent git worktrees so multiple agents can work the same repo at once
  without colliding. See docs/ENGINEERING.md section 3.

.DESCRIPTION
  Each "lane" is a sibling folder (..\nova-<lane>) checked out on its own holder
  branch (lane/<lane>) off develop. An agent opens that folder as its own VS Code
  window and works there. Inside the lane it still branches per task off develop
  (git switch -c feat/x develop); the lane branch just lets develop stay free.

.EXAMPLE
  scripts\agent-worktree.ps1 add ai          # create ..\nova-ai  on branch lane/ai
  scripts\agent-worktree.ps1 list            # show all worktrees
  scripts\agent-worktree.ps1 remove ai       # remove the ..\nova-ai worktree
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('add', 'remove', 'list')]
  [string]$Action,

  [Parameter(Position = 1)]
  [string]$Lane,

  # Branch the new lane should be created from.
  [string]$From = 'develop'
)

$ErrorActionPreference = 'Stop'

# Resolve repo root from this script's location (scripts/ is at the repo root).
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$parent   = Split-Path $repoRoot -Parent

function Require-Lane {
  if ([string]::IsNullOrWhiteSpace($Lane)) {
    throw "A <lane> name is required, e.g. 'ai', 'geometry', 'platform'."
  }
}

switch ($Action) {
  'list' {
    git -C $repoRoot worktree list
    break
  }

  'add' {
    Require-Lane
    $path   = Join-Path $parent "nova-$Lane"
    $branch = "lane/$Lane"

    if (Test-Path $path) { throw "Folder already exists: $path" }

    # Reuse the branch if it already exists, otherwise create it from $From.
    $exists = (git -C $repoRoot branch --list $branch)
    if ($exists) {
      git -C $repoRoot worktree add $path $branch
    }
    else {
      git -C $repoRoot fetch origin $From 2>$null
      git -C $repoRoot worktree add $path -b $branch $From
    }

    Write-Host ""
    Write-Host "Worktree ready: $path  (branch $branch)" -ForegroundColor Green
    Write-Host "Next:" -ForegroundColor Cyan
    Write-Host "  1. Open the folder as its own VS Code window."
    Write-Host "  2. Run 'claude' there and pick the matching agent (.claude/agents)."
    Write-Host "  3. Per task: git switch -c type/task-name $From   (then merge back, see ENGINEERING.md)."
    Write-Host "  4. Claim your owned paths in docs/agent-workboard.md before editing."
    break
  }

  'remove' {
    Require-Lane
    $path = Join-Path $parent "nova-$Lane"
    git -C $repoRoot worktree remove $path
    Write-Host "Removed worktree: $path" -ForegroundColor Green
    Write-Host "Note: the lane/$Lane branch still exists. Delete it with: git branch -d lane/$Lane" -ForegroundColor DarkGray
    break
  }
}
