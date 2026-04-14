#!/usr/bin/env bash
# ==========================================================================
# Hermes Desktop — full pre-build bundling script (macOS)
#
# Creates a self-contained resource tree under desktop/build/ containing:
#   - Python 3.11 (relocatable, via uv)
#   - hermes-venv with all dependencies (via uv sync)
#   - hermes-agent source code
#   - External binaries: ripgrep, Node.js, ffmpeg
#   - node_modules (agent-browser, camoufox)
#   - Bundled skills
#
# Run from the repo root:
#   bash desktop/scripts/bundle-all.sh
# ==========================================================================

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$REPO_ROOT/desktop/build"
ARCH="$(uname -m)"

echo ""
echo -e "${CYAN}⚕ Hermes Desktop — Full Bundle Build${NC}"
echo -e "  Arch: ${ARCH}"
echo -e "  Repo: ${REPO_ROOT}"
echo -e "  Build dir: ${BUILD_DIR}"
echo ""

# ==========================================================================
# 0. Prerequisites
# ==========================================================================

if ! command -v uv &>/dev/null; then
    echo -e "${RED}✗ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh${NC}"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo -e "${RED}✗ npm not found. Install Node.js before bundling the Hermes dashboard.${NC}"
    exit 1
fi

# ==========================================================================
# 1. Clean previous build
# ==========================================================================

echo -e "${CYAN}→${NC} Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{bin,python,hermes-venv,hermes-agent,skills,node_modules}

# ==========================================================================
# 2. Python 3.11 via uv (downloads python-build-standalone)
# ==========================================================================

echo -e "${CYAN}→${NC} Installing Python 3.11 via uv..."
uv python install 3.11

PYTHON_PATH="$(uv python find 3.11)"
PYTHON_DIR="$(dirname "$(dirname "$PYTHON_PATH")")"
echo -e "${GREEN}✓${NC} Python found at: $PYTHON_PATH"

echo -e "${CYAN}→${NC} Copying Python to build dir..."
cp -a "$PYTHON_DIR" "$BUILD_DIR/python-src"
# Flatten: we want build/python/bin/python3 etc
mv "$BUILD_DIR/python-src"/* "$BUILD_DIR/python/" 2>/dev/null || cp -a "$BUILD_DIR/python-src/"* "$BUILD_DIR/python/"
rm -rf "$BUILD_DIR/python-src"
echo -e "${GREEN}✓${NC} Python copied"

# ==========================================================================
# 3. Create venv and install all dependencies
# ==========================================================================

echo -e "${CYAN}→${NC} Creating venv..."
"$BUILD_DIR/python/bin/python3" -m venv "$BUILD_DIR/hermes-venv"
echo -e "${GREEN}✓${NC} Venv created"

echo -e "${CYAN}→${NC} Installing hermes-agent dependencies (uv sync)..."
cd "$REPO_ROOT"

# Use uv pip install into the venv directly
VENV_PIP="$BUILD_DIR/hermes-venv/bin/pip"
VENV_PYTHON="$BUILD_DIR/hermes-venv/bin/python3"

# Install the project and all deps
UV_PROJECT_ENVIRONMENT="$BUILD_DIR/hermes-venv" uv sync --all-extras --locked 2>/dev/null || {
    echo -e "${YELLOW}⚠${NC} uv sync failed, falling back to pip install..."
    "$VENV_PIP" install --no-cache-dir -e ".[all]"
}
echo -e "${GREEN}✓${NC} Dependencies installed"

# Install desktop server deps
echo -e "${CYAN}→${NC} Installing desktop server dependencies..."
"$VENV_PIP" install --no-cache-dir fastapi "uvicorn[standard]" websockets 2>/dev/null || \
    uv pip install --python "$VENV_PYTHON" fastapi "uvicorn[standard]" websockets
echo -e "${GREEN}✓${NC} Server deps installed"

# ==========================================================================
# 4. Build Hermes web dashboard
# ==========================================================================

echo -e "${CYAN}→${NC} Building Hermes web dashboard..."
cd "$REPO_ROOT"
npm --prefix "$REPO_ROOT/web" install
npm --prefix "$REPO_ROOT/web" run build
echo -e "${GREEN}✓${NC} Dashboard built"

# ==========================================================================
# 5. Copy hermes-agent source
# ==========================================================================

echo -e "${CYAN}→${NC} Copying hermes-agent source..."

# Core Python files
CORE_FILES=(
    run_agent.py model_tools.py toolsets.py cli.py
    hermes_constants.py hermes_state.py hermes_time.py hermes_logging.py
    utils.py batch_runner.py mcp_serve.py
    toolset_distributions.py trajectory_compressor.py
)

for f in "${CORE_FILES[@]}"; do
    if [ -f "$REPO_ROOT/$f" ]; then
        cp "$REPO_ROOT/$f" "$BUILD_DIR/hermes-agent/"
    fi
done

# Core packages
CORE_DIRS=(agent tools hermes_cli gateway cron acp_adapter plugins)
for d in "${CORE_DIRS[@]}"; do
    if [ -d "$REPO_ROOT/$d" ]; then
        cp -a "$REPO_ROOT/$d" "$BUILD_DIR/hermes-agent/"
    fi
done

# pyproject.toml needed for package metadata
cp "$REPO_ROOT/pyproject.toml" "$BUILD_DIR/hermes-agent/"

echo -e "${GREEN}✓${NC} Source copied"

# ==========================================================================
# 6. Copy skills
# ==========================================================================

echo -e "${CYAN}→${NC} Copying skills..."
if [ -d "$REPO_ROOT/skills" ]; then
    cp -a "$REPO_ROOT/skills/"* "$BUILD_DIR/skills/" 2>/dev/null || true
fi
if [ -d "$REPO_ROOT/optional-skills" ]; then
    cp -a "$REPO_ROOT/optional-skills/"* "$BUILD_DIR/skills/" 2>/dev/null || true
fi
echo -e "${GREEN}✓${NC} Skills copied"

# ==========================================================================
# 7. External binaries
# ==========================================================================

echo -e "${CYAN}→${NC} Downloading external binaries for macOS ${ARCH}..."

# --- ripgrep ---
echo -e "  ${CYAN}→${NC} ripgrep..."
RG_VERSION="14.1.1"
if [ "$ARCH" = "arm64" ]; then
    RG_TARGET="aarch64-apple-darwin"
else
    RG_TARGET="x86_64-apple-darwin"
fi
RG_URL="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_TARGET}.tar.gz"
curl -fsSL "$RG_URL" | tar xz -C /tmp/
cp "/tmp/ripgrep-${RG_VERSION}-${RG_TARGET}/rg" "$BUILD_DIR/bin/rg"
chmod +x "$BUILD_DIR/bin/rg"
rm -rf "/tmp/ripgrep-${RG_VERSION}-${RG_TARGET}"
echo -e "  ${GREEN}✓${NC} ripgrep ${RG_VERSION}"

# --- Node.js ---
echo -e "  ${CYAN}→${NC} Node.js..."
NODE_VERSION="22.14.0"
if [ "$ARCH" = "arm64" ]; then
    NODE_TARGET="darwin-arm64"
else
    NODE_TARGET="darwin-x64"
fi
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_TARGET}.tar.gz"
curl -fsSL "$NODE_URL" | tar xz -C /tmp/
cp "/tmp/node-v${NODE_VERSION}-${NODE_TARGET}/bin/node" "$BUILD_DIR/bin/node"
# Also grab npm/npx for node_modules resolution
cp -a "/tmp/node-v${NODE_VERSION}-${NODE_TARGET}/lib" "$BUILD_DIR/bin/lib" 2>/dev/null || true
chmod +x "$BUILD_DIR/bin/node"
rm -rf "/tmp/node-v${NODE_VERSION}-${NODE_TARGET}"
echo -e "  ${GREEN}✓${NC} Node.js ${NODE_VERSION}"

# --- ffmpeg ---
echo -e "  ${CYAN}→${NC} ffmpeg..."
# Use evermeet.cx static builds for macOS (widely used, single binary)
FFMPEG_URL="https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
curl -fsSL "$FFMPEG_URL" -o /tmp/ffmpeg.zip 2>/dev/null && {
    unzip -o /tmp/ffmpeg.zip -d "$BUILD_DIR/bin/" 2>/dev/null
    chmod +x "$BUILD_DIR/bin/ffmpeg"
    rm -f /tmp/ffmpeg.zip
    echo -e "  ${GREEN}✓${NC} ffmpeg"
} || {
    echo -e "  ${YELLOW}⚠${NC} ffmpeg download failed (TTS/voice features will use system ffmpeg if available)"
}

# ==========================================================================
# 8. Node modules for browser tools
# ==========================================================================

echo -e "${CYAN}→${NC} Installing browser tool node_modules..."
cd "$BUILD_DIR"

# Create a minimal package.json for the bundled node_modules
cat > "$BUILD_DIR/package.json" << 'PKGJSON'
{
  "name": "hermes-desktop-resources",
  "private": true,
  "dependencies": {
    "agent-browser": "^0.13.0",
    "@askjo/camoufox-browser": "^1.0.0"
  }
}
PKGJSON

PATH="$BUILD_DIR/bin:$PATH" "$BUILD_DIR/bin/node" "$(which npm 2>/dev/null || echo /usr/local/bin/npm)" install --prefer-offline --no-audit 2>/dev/null || {
    echo -e "${YELLOW}⚠${NC} npm install failed, trying with system npm..."
    npm install --prefix "$BUILD_DIR" --prefer-offline --no-audit 2>/dev/null || {
        echo -e "${YELLOW}⚠${NC} Browser tool node_modules not installed (browser tools will be unavailable)"
    }
}
rm -f "$BUILD_DIR/package.json" "$BUILD_DIR/package-lock.json"
echo -e "${GREEN}✓${NC} Node modules installed"

# ==========================================================================
# 9. Strip unnecessary files (reduces codesign time dramatically)
# ==========================================================================

echo -e "${CYAN}→${NC} Stripping unnecessary files from bundle..."

STRIPPED=0

# __pycache__ and .pyc — not needed at runtime (Python regenerates them)
while IFS= read -r -d '' d; do
    rm -rf "$d"
    STRIPPED=$((STRIPPED + 1))
done < <(find "$BUILD_DIR/python" "$BUILD_DIR/hermes-venv" -type d -name "__pycache__" -print0 2>/dev/null)

find "$BUILD_DIR/python" "$BUILD_DIR/hermes-venv" -name "*.pyc" -delete 2>/dev/null || true

# Test directories inside site-packages
while IFS= read -r -d '' d; do
    rm -rf "$d"
    STRIPPED=$((STRIPPED + 1))
done < <(find "$BUILD_DIR/hermes-venv/lib" -type d \( -name "tests" -o -name "test" -o -name "testing" \) -print0 2>/dev/null)

# Static libraries (.a) — only needed for linking, not runtime
find "$BUILD_DIR/python" "$BUILD_DIR/hermes-venv" -name "*.a" -delete 2>/dev/null || true

# Python stdlib test suite (large, never used)
rm -rf "$BUILD_DIR/python/lib/python"*/test 2>/dev/null || true
rm -rf "$BUILD_DIR/python/lib/python"*/unittest 2>/dev/null || true

# .dist-info directories (pip metadata, not needed at runtime)
while IFS= read -r -d '' d; do
    rm -rf "$d"
    STRIPPED=$((STRIPPED + 1))
done < <(find "$BUILD_DIR/hermes-venv/lib" -type d -name "*.dist-info" -print0 2>/dev/null)

# Fake .app directories in node_modules (e.g. puppeteer-extra-plugin-stealth/evasions/chrome.app).
# macOS codesign treats any *.app directory as an app bundle and fails if it isn't one.
while IFS= read -r -d '' d; do
    if [ ! -f "$d/Contents/Info.plist" ]; then
        NEWNAME="${d%.app}.app-dir"
        echo -e "  ${YELLOW}⚠${NC} Renaming fake .app bundle: $(basename "$d")"
        mv "$d" "$NEWNAME"
        STRIPPED=$((STRIPPED + 1))
    fi
done < <(find "$BUILD_DIR/node_modules" -type d -name "*.app" -print0 2>/dev/null)

# Broken symlinks — codesign --verify --deep --strict rejects bundles containing them.
# Python venvs create symlinks with absolute paths that break after relocation.
BROKEN_LINKS=0
while IFS= read -r -d '' link; do
    rm -f "$link"
    BROKEN_LINKS=$((BROKEN_LINKS + 1))
done < <(find "$BUILD_DIR" -type l ! -exec test -e {} \; -print0 2>/dev/null)
if [ "$BROKEN_LINKS" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} Removed $BROKEN_LINKS broken symlinks"
fi

echo -e "${GREEN}✓${NC} Stripped $STRIPPED directories, $BROKEN_LINKS broken symlinks"

# ==========================================================================
# 10. Patch venv for relocatability
# ==========================================================================

echo -e "${CYAN}→${NC} Patching venv for relocatable paths..."

# Patch pyvenv.cfg to use relative paths
PYVENV_CFG="$BUILD_DIR/hermes-venv/pyvenv.cfg"
if [ -f "$PYVENV_CFG" ]; then
    # Replace absolute home with a placeholder that python-bridge.ts resolves
    sed -i '' "s|home = .*|home = ../python/bin|" "$PYVENV_CFG" 2>/dev/null || true
fi

# Patch shebangs in venv bin scripts
for script in "$BUILD_DIR/hermes-venv/bin/"*; do
    if [ -f "$script" ] && head -1 "$script" | grep -q "^#!.*python"; then
        sed -i '' "1s|^#!.*|#!/usr/bin/env python3|" "$script" 2>/dev/null || true
    fi
done

echo -e "${GREEN}✓${NC} Paths patched"

# Final pass: remove any broken symlinks created by patching or relocation.
# codesign --verify --deep --strict rejects bundles with dangling symlinks.
FINAL_BROKEN=0
while IFS= read -r -d '' link; do
    rm -f "$link"
    FINAL_BROKEN=$((FINAL_BROKEN + 1))
done < <(find "$BUILD_DIR" -type l ! -exec test -e {} \; -print0 2>/dev/null)
if [ "$FINAL_BROKEN" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} Removed $FINAL_BROKEN broken symlinks (post-patch)"
fi

# ==========================================================================
# 11. Summary
# ==========================================================================

echo ""
echo -e "${GREEN}✓ Bundle build complete!${NC}"
echo ""
echo "Contents of $BUILD_DIR:"
du -sh "$BUILD_DIR"/* 2>/dev/null | sort -rh
echo ""
TOTAL=$(du -sh "$BUILD_DIR" 2>/dev/null | cut -f1)
echo -e "Total bundle size: ${CYAN}${TOTAL}${NC}"
echo ""
echo "Next steps:"
echo "  cd desktop && npm install && npm run build:ts"
echo "  npm start   # to test"
echo "  npm run dist # to build .app/.dmg"
echo ""
