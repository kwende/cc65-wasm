#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
EMSDK_ENV=${EMSDK_ENV:-/home/brush/repos/emsdk/emsdk_env.sh}
BUILD_DIR=${BUILD_DIR:-"$ROOT/wasm/wrk"}
DIST_DIR=${DIST_DIR:-"$ROOT/wasm/dist"}
BUILD_ID=${BUILD_ID:-"wasm $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"}

if [[ -f "$EMSDK_ENV" ]]; then
    export EMSDK_QUIET=1
    # shellcheck disable=SC1090
    source "$EMSDK_ENV"
fi

command -v emcc >/dev/null || {
    echo "emcc not found. Set EMSDK_ENV or source emsdk_env.sh before running this script." >&2
    exit 1
}
command -v emar >/dev/null || {
    echo "emar not found. Set EMSDK_ENV or source emsdk_env.sh before running this script." >&2
    exit 1
}

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR/common" "$BUILD_DIR/ca65" "$BUILD_DIR/ld65" "$DIST_DIR"

CFLAGS=(
    -MMD
    -MP
    -O3
    -I "$ROOT/src/common"
    -Wall
    -Wextra
    -Wno-char-subscripts
    "-DCA65_INC=\"/cc65/asminc\""
    "-DCC65_INC=\"/cc65/include\""
    "-DCL65_TGT=\"/cc65/target\""
    "-DLD65_LIB=\"/cc65/lib\""
    "-DLD65_OBJ=\"/work\""
    "-DLD65_CFG=\"/cc65/cfg\""
    "-DBUILD_ID=\"$BUILD_ID\""
)

COMMON_OBJS=()
CA65_OBJS=()
LD65_OBJS=()

compile_dir() {
    local name=$1
    local out=$2
    local array_name=$3
    local src obj base

    for src in "$ROOT/src/$name"/*.c; do
        base=$(basename "$src" .c)
        obj="$BUILD_DIR/$out/$base.o"
        echo "CC $name/$base.c"
        emcc -c "${CFLAGS[@]}" -o "$obj" "$src"
        eval "$array_name+=(\"\$obj\")"
    done
}

compile_dir common common COMMON_OBJS
emar rcs "$BUILD_DIR/common/common.a" "${COMMON_OBJS[@]}"

compile_dir ca65 ca65 CA65_OBJS
echo "LINK ca65"
emcc -o "$DIST_DIR/ca65.js" \
    "${CA65_OBJS[@]}" "$BUILD_DIR/common/common.a" -lm \
    --embed-file "$ROOT/asminc@/cc65/asminc" \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sEXPORT_NAME=createCa65 \
    -sINVOKE_RUN=0 \
    -sFORCE_FILESYSTEM=1 \
    -sALLOW_MEMORY_GROWTH=1 \
    "-sEXPORTED_FUNCTIONS=['_main']" \
    "-sEXPORTED_RUNTIME_METHODS=['FS','callMain']" \
    -sENVIRONMENT=web,worker,node

compile_dir ld65 ld65 LD65_OBJS
echo "LINK ld65"
emcc -o "$DIST_DIR/ld65.js" \
    "${LD65_OBJS[@]}" "$BUILD_DIR/common/common.a" -lm \
    --embed-file "$ROOT/cfg@/cc65/cfg" \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sEXPORT_NAME=createLd65 \
    -sINVOKE_RUN=0 \
    -sFORCE_FILESYSTEM=1 \
    -sALLOW_MEMORY_GROWTH=1 \
    "-sEXPORTED_FUNCTIONS=['_main']" \
    "-sEXPORTED_RUNTIME_METHODS=['FS','callMain']" \
    -sENVIRONMENT=web,worker,node

echo "Wrote wasm artifacts to $DIST_DIR"
