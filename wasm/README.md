# cc65 wasm build

This folder builds the host-side `ca65` assembler and `ld65` linker as
Emscripten ES modules for browser or worker use.

## Build

```sh
./wasm/build.sh
```

The script sources `/home/brush/repos/emsdk/emsdk_env.sh` by default. Override
that location with `EMSDK_ENV=/path/to/emsdk_env.sh` if needed.

Generated files are written to `wasm/dist/`:

- `ca65.js`
- `ca65.wasm`
- `ld65.js`
- `ld65.wasm`

## Smoke test

```sh
source /home/brush/repos/emsdk/emsdk_env.sh
node wasm/smoke-test.mjs
```

The test writes a tiny NES assembly file into Emscripten MEMFS, runs `ca65`,
passes the object bytes to `ld65`, and checks that a valid iNES byte stream is
produced.

## Browser demo

```sh
python3 -m http.server 8765 --bind 127.0.0.1 -d .
```

Then open:

```text
http://127.0.0.1:8765/wasm/demo/
```

The demo accepts a `ca65` source file and an `ld65` config file, runs both
tools in browser MEMFS, and renders the linked output bytes as a hex dump.

## Browser usage shape

Blazor should import a small JavaScript wrapper that imports `ca65.js` and
`ld65.js`, writes input files to MEMFS, calls `callMain(...)`, and returns the
output bytes. Blazor does not reference these wasm files as .NET assemblies;
JavaScript is the bridge between the Blazor runtime and the Emscripten modules.
