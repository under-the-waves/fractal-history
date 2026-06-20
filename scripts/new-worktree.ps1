<#
.SYNOPSIS
  Create an isolated git worktree + branch for a parallel Claude session.

.DESCRIPTION
  Each concurrent session should work in its own worktree so the sessions do not
  share a git index (which causes staging-area races) and do not push to main
  directly (which lets one broken commit block every session's deploy).

  This creates a new branch off the latest origin/main and checks it out into a
  sibling directory:  ../fractal-history-wt/<branch-with-slashes-as-dashes>

.EXAMPLE
  pwsh scripts/new-worktree.ps1 feat/anchor-generation
  pwsh scripts/new-worktree.ps1 fix/mobile-why-panel
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Branch
)

$ErrorActionPreference = 'Stop'

# Resolve the main checkout (parent of the shared .git common dir), so worktrees
# land as siblings of it regardless of which worktree this script is run from.
$commonDir = (git rev-parse --git-common-dir).Trim()
$mainRoot  = Split-Path -Parent (Resolve-Path $commonDir)
$wtRoot    = Join-Path (Split-Path -Parent $mainRoot) 'fractal-history-wt'
$dirName   = $Branch -replace '[\\/]', '-'
$wtPath    = Join-Path $wtRoot $dirName

if (Test-Path $wtPath) {
  throw "Worktree directory already exists: $wtPath"
}

Write-Host "Fetching origin..." -ForegroundColor Cyan
git fetch origin --quiet

Write-Host "Creating worktree '$Branch' at $wtPath (off origin/main)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $wtRoot | Out-Null
git worktree add $wtPath -b $Branch origin/main

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  cd `"$wtPath`""
Write-Host "  npm install        # each worktree has its own node_modules"
Write-Host ""
Write-Host "When ready to ship: push the branch and open a PR (do NOT push to main):"
Write-Host "  git push -u origin $Branch"
Write-Host "  gh pr create --fill --base main"
