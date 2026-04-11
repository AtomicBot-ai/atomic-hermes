#!/usr/bin/env bash
# ==========================================================================
# Hermes Desktop — lightweight dev build
#
# Creates desktop/build/ with symlinks to repo sources and system binaries
# so that `npm run dev` picks up Python changes instantly without a full
# rebuild.  Safe to re-run: only creates what is missing.
#
# First run:  creates venv + installs deps (~30s)
# Later runs: validates symlinks (~2s)
#
# Usage (from repo root):
#   bash desktop/scripts/bundle-dev.sh
# ==========================================================================

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$REPO_ROOT/desktop/build"

echo ""
echo -e "${CYAN}⚕ Hermes Desktop — Dev Bundle${NC}"
echo -e "  ${DIM}Repo: ${REPO_ROOT}${NC}"
echo ""

# ==========================================================================
# Helpers
# ==========================================================================

ensure_dir() { mkdir -p "$1"; }

# Create or refresh a symlink. Removes stale targets.
ensure_symlink() {
    local target="$1" link="$2"
    if [ -L "$link" ]; then
        local current
        current="$(readlink "$link")"
        if [ "$current" = "$target" ]; then
            return 0
        fi
        rm "$link"
    elif [ -e "$link" ]; then
        rm -rf "$link"
    fi
    ln -s "$target" "$link"
}

# Symlink a system binary into build/bin/ if it exists.
link_system_bin() {
    local name="$1"
    local sys_path
    sys_path="$(command -v "$name" 2>/dev/null || true)"
    if [ -n "$sys_path" ]; then
        ensure_symlink "$sys_path" "$BUILD_DIR/bin/$name"
        echo -e "  ${GREEN}✓${NC} $name → $sys_path"
    else
        echo -e "  ${YELLOW}⚠${NC} $name not found in PATH (optional)"
    fi
}

# ==========================================================================
# 1. Directory structure
# ==========================================================================

echo -e "${CYAN}→${NC} Ensuring build directory structure..."
ensure_dir "$BUILD_DIR/bin"
ensure_dir "$BUILD_DIR/skills"

# ==========================================================================
# 2. Symlink hermes-agent source (instant code changes)
# ==========================================================================

echo -e "${CYAN}→${NC} Linking hermes-agent source..."

AGENT_DIR="$BUILD_DIR/hermes-agent"
ensure_dir "$AGENT_DIR"

CORE_FILES=(
    run_agent.py model_tools.py toolsets.py cli.py
    hermes_constants.py hermes_state.py hermes_time.py hermes_logging.py
    utils.py batch_runner.py mcp_serve.py
    toolset_distributions.py trajectory_compressor.py
    pyproject.toml
)

for f in "${CORE_FILES[@]}"; do
    if [ -f "$REPO_ROOT/$f" ]; then
        ensure_symlink "$REPO_ROOT/$f" "$AGENT_DIR/$f"
    fi
done

CORE_DIRS=(agent tools hermes_cli gateway cron acp_adapter plugins)
for d in "${CORE_DIRS[@]}"; do
    if [ -d "$REPO_ROOT/$d" ]; then
        ensure_symlink "$REPO_ROOT/$d" "$AGENT_DIR/$d"
    fi
done

echo -e "${GREEN}✓${NC} Source linked"

# ==========================================================================
# 3. Python venv (create once, reuse on subsequent runs)
# ==========================================================================

VENV_DIR="$BUILD_DIR/hermes-venv"

if [ -f "$VENV_DIR/bin/python3" ]; then
    echo -e "${CYAN}→${NC} Venv already exists, skipping creation"
else
    echo -e "${CYAN}→${NC} Creating dev venv (one-time)..."

    if ! command -v uv &>/dev/null; then
        echo -e "${RED}✗ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh${NC}"
        exit 1
    fi

    uv python install 3.11 2>/dev/null || true
    PYTHON_PATH="$(uv python find 3.11)"
    "$PYTHON_PATH" -m venv "$VENV_DIR"
    echo -e "${GREEN}✓${NC} Venv created"

    echo -e "${CYAN}→${NC} Installing dependencies (uv sync)..."
    cd "$REPO_ROOT"
    UV_PROJECT_ENVIRONMENT="$VENV_DIR" uv sync --all-extras 2>/dev/null || {
        echo -e "${YELLOW}⚠${NC} uv sync failed, falling back to pip..."
        "$VENV_DIR/bin/pip" install --no-cache-dir -e ".[all]"
    }

    echo -e "${CYAN}→${NC} Installing desktop server deps..."
    uv pip install --python "$VENV_DIR/bin/python3" fastapi "uvicorn[standard]" websockets 2>/dev/null || \
        "$VENV_DIR/bin/pip" install --no-cache-dir fastapi "uvicorn[standard]" websockets
    echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# ==========================================================================
# 4. Symlink Python standalone (for build/python/bin/python3 fallback path)
# ==========================================================================

PYTHON_DIR="$BUILD_DIR/python"
if [ ! -d "$PYTHON_DIR" ]; then
    echo -e "${CYAN}→${NC} Linking Python standalone..."
    PYTHON_PATH="$(uv python find 3.11 2>/dev/null || true)"
    if [ -n "$PYTHON_PATH" ]; then
        PYTHON_INSTALL_DIR="$(dirname "$(dirname "$PYTHON_PATH")")"
        ensure_symlink "$PYTHON_INSTALL_DIR" "$PYTHON_DIR"
        echo -e "${GREEN}✓${NC} Python linked → $PYTHON_INSTALL_DIR"
    else
        echo -e "${YELLOW}⚠${NC} Could not find uv Python 3.11, skipping python link"
    fi
fi

# ==========================================================================
# 5. System binaries (symlink instead of downloading)
# ==========================================================================

echo -e "${CYAN}→${NC} Linking system binaries..."
link_system_bin rg
link_system_bin node
link_system_bin ffmpeg

# ==========================================================================
# 6. Skills (symlink)
# ==========================================================================

echo -e "${CYAN}→${NC} Linking skills..."
if [ -d "$REPO_ROOT/skills" ]; then
    for skill_dir in "$REPO_ROOT/skills"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        ensure_symlink "$skill_dir" "$BUILD_DIR/skills/$skill_name"
    done
fi
if [ -d "$REPO_ROOT/optional-skills" ]; then
    for skill_dir in "$REPO_ROOT/optional-skills"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"
        ensure_symlink "$skill_dir" "$BUILD_DIR/skills/$skill_name"
    done
fi
echo -e "${GREEN}✓${NC} Skills linked"

# ==========================================================================
# 7. Node modules (install only if missing)
# ==========================================================================

if [ -d "$BUILD_DIR/node_modules" ] && [ -d "$BUILD_DIR/node_modules/agent-browser" ]; then
    echo -e "${CYAN}→${NC} Node modules already present, skipping"
else
    echo -e "${CYAN}→${NC} Installing browser tool node_modules..."
    cd "$BUILD_DIR"
    cat > "$BUILD_DIR/package.json" << 'PKGJSON'
{
  "name": "hermes-desktop-dev-resources",
  "private": true,
  "dependencies": {
    "agent-browser": "^0.13.0",
    "@askjo/camoufox-browser": "^1.0.0"
  }
}
PKGJSON
    npm install --prefer-offline --no-audit 2>/dev/null || {
        echo -e "${YELLOW}⚠${NC} npm install failed — browser tools will be unavailable"
    }
    rm -f "$BUILD_DIR/package.json" "$BUILD_DIR/package-lock.json"
    echo -e "${GREEN}✓${NC} Node modules installed"
fi

# ==========================================================================
# 8. Summary
# ==========================================================================

echo ""
echo -e "${GREEN}✓ Dev bundle ready!${NC}"
echo ""
echo -e "  ${DIM}build/hermes-agent/ → symlinks to repo source${NC}"
echo -e "  ${DIM}build/hermes-venv/  → dev Python venv${NC}"
echo -e "  ${DIM}build/bin/          → system binaries${NC}"
echo ""
echo "Next:"
echo "  cd desktop && npm install && npm run dev"
echo ""
