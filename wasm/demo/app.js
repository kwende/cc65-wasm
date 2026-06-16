import createCa65 from "../dist/ca65.js";
import createLd65 from "../dist/ld65.js";

const sourceInput = document.querySelector("#sourceInput");
const linkerInput = document.querySelector("#linkerInput");
const ca65Flags = document.querySelector("#ca65Flags");
const ld65Flags = document.querySelector("#ld65Flags");
const buildButton = document.querySelector("#buildButton");
const downloadButton = document.querySelector("#downloadButton");
const statusText = document.querySelector("#statusText");
const sizeText = document.querySelector("#sizeText");
const hexOutput = document.querySelector("#hexOutput");
const diagnostics = document.querySelector("#diagnostics");

let lastOutput = null;

const defaultSource = `.segment "CODE"

reset:
    lda #$01
    sta $0200
    inx
    jmp reset
`;

const defaultConfig = `MEMORY {
    ROM: file = %O, start = $8000, size = $0010, fill = yes, fillval = $EA;
}

SEGMENTS {
    CODE: load = ROM, type = ro;
}
`;

sourceInput.value = defaultSource;
linkerInput.value = defaultConfig;
hexOutput.textContent = "";
diagnostics.textContent = "";

buildButton.addEventListener("click", () => {
    assemble().catch((error) => {
        setFailed(error.message || String(error));
    });
});

downloadButton.addEventListener("click", () => {
    if (!lastOutput) {
        return;
    }

    const blob = new Blob([lastOutput], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "output.bin";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

async function assemble() {
    setBusy();

    const caOut = [];
    const caErr = [];
    const ca65 = await createCa65(makeModuleOptions(caOut, caErr));
    mkdirp(ca65.FS, "/work");
    ca65.FS.writeFile("/work/input.s", sourceInput.value);
    runTool(ca65, "ca65", [
        ...splitArgs(ca65Flags.value),
        "-o",
        "/work/input.o",
        "/work/input.s",
    ]);
    const objectBytes = ca65.FS.readFile("/work/input.o");

    const ldOut = [];
    const ldErr = [];
    const ld65 = await createLd65(makeModuleOptions(ldOut, ldErr));
    mkdirp(ld65.FS, "/work");
    ld65.FS.writeFile("/work/input.o", objectBytes);
    ld65.FS.writeFile("/work/linker.cfg", linkerInput.value);
    runTool(ld65, "ld65", [
        "-C",
        "/work/linker.cfg",
        ...splitArgs(ld65Flags.value),
        "-o",
        "/work/output.bin",
        "/work/input.o",
    ]);

    lastOutput = ld65.FS.readFile("/work/output.bin");
    const outputLog = formatDiagnostics([
        ["ca65 stdout", caOut],
        ["ca65 stderr", caErr],
        ["ld65 stdout", ldOut],
        ["ld65 stderr", ldErr],
    ]);

    statusText.textContent = "Built";
    sizeText.textContent = `${lastOutput.length} bytes`;
    hexOutput.textContent = hexDump(lastOutput);
    diagnostics.classList.remove("error");
    diagnostics.textContent = outputLog || "No diagnostics";
    downloadButton.disabled = false;
    buildButton.disabled = false;
}

function makeModuleOptions(stdout, stderr) {
    return {
        locateFile: (path) => new URL(`../dist/${path}`, import.meta.url).href,
        print: (text) => stdout.push(text),
        printErr: (text) => stderr.push(text),
    };
}

function runTool(instance, name, args) {
    let result = 0;

    try {
        result = instance.callMain(args);
    } catch (error) {
        if (typeof error?.status === "number") {
            result = error.status;
        } else {
            throw new Error(`${name}: ${error.message || error}`);
        }
    }

    const exitCode = typeof result === "number" ? result : instance.EXITSTATUS ?? 0;
    if (exitCode !== 0) {
        throw new Error(`${name} exited with status ${exitCode}`);
    }
}

function mkdirp(FS, path) {
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
        current += `/${part}`;
        if (!FS.analyzePath(current).exists) {
            FS.mkdir(current);
        }
    }
}

function splitArgs(value) {
    const args = [];
    let current = "";
    let quote = "";
    let escaped = false;

    for (const char of value.trim()) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) {
                quote = "";
            } else {
                current += char;
            }
            continue;
        }
        if (char === "\"" || char === "'") {
            quote = char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current) {
                args.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }

    if (escaped) {
        current += "\\";
    }
    if (quote) {
        throw new Error("Unterminated quote in flags");
    }
    if (current) {
        args.push(current);
    }
    return args;
}

function hexDump(bytes) {
    const rows = [];
    for (let offset = 0; offset < bytes.length; offset += 16) {
        const chunk = bytes.slice(offset, offset + 16);
        const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, "0").toUpperCase());
        const ascii = Array.from(chunk, printableAscii).join("");
        rows.push(`${offset.toString(16).padStart(6, "0").toUpperCase()}  ${hex.join(" ").padEnd(47, " ")}  ${ascii}`);
    }
    return rows.join("\n");
}

function printableAscii(byte) {
    return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : ".";
}

function formatDiagnostics(groups) {
    const lines = [];
    for (const [title, entries] of groups) {
        if (entries.length) {
            lines.push(`[${title}]`);
            lines.push(...entries);
            lines.push("");
        }
    }
    return lines.join("\n").trim();
}

function setBusy() {
    lastOutput = null;
    statusText.textContent = "Building";
    sizeText.textContent = "";
    hexOutput.textContent = "";
    diagnostics.classList.remove("error");
    diagnostics.textContent = "";
    buildButton.disabled = true;
    downloadButton.disabled = true;
}

function setFailed(message) {
    lastOutput = null;
    statusText.textContent = "Failed";
    sizeText.textContent = "";
    hexOutput.textContent = "";
    diagnostics.classList.add("error");
    diagnostics.textContent = message;
    buildButton.disabled = false;
    downloadButton.disabled = true;
}
