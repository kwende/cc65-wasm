import createCa65 from "./dist/ca65.js";
import createLd65 from "./dist/ld65.js";

const source = `
.segment "HEADER"
    .byte "NES", $1A
    .byte 2
    .byte 1
    .byte 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0

.segment "STARTUP"
reset:
    sei
loop:
    jmp loop

.segment "VECTORS"
    .word 0
    .word reset
    .word 0

.segment "CHARS"
    .res $2000, 0
`;

function locateDistFile(path) {
    return new URL(`./dist/${path}`, import.meta.url).pathname;
}

function makeModuleOptions(stdout, stderr) {
    return {
        locateFile: locateDistFile,
        print: (text) => stdout.push(text),
        printErr: (text) => stderr.push(text),
    };
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

function runTool(instance, name, args) {
    let result = 0;
    try {
        result = instance.callMain(args);
    } catch (error) {
        if (typeof error?.status === "number") {
            result = error.status;
        } else {
            throw error;
        }
    }

    const exitCode = typeof result === "number" ? result : instance.EXITSTATUS ?? 0;
    if (exitCode !== 0) {
        throw new Error(`${name} exited with status ${exitCode}`);
    }
}

const ca65Stdout = [];
const ca65Stderr = [];
const ca65 = await createCa65(makeModuleOptions(ca65Stdout, ca65Stderr));
mkdirp(ca65.FS, "/work");
ca65.FS.writeFile("/work/test.s", source);
runTool(ca65, "ca65", ["-t", "nes", "-o", "/work/test.o", "/work/test.s"]);
const objectBytes = ca65.FS.readFile("/work/test.o");

const ld65Stdout = [];
const ld65Stderr = [];
const ld65 = await createLd65(makeModuleOptions(ld65Stdout, ld65Stderr));
mkdirp(ld65.FS, "/work");
ld65.FS.writeFile("/work/test.o", objectBytes);
runTool(ld65, "ld65", ["-t", "nes", "-o", "/work/test.nes", "/work/test.o"]);
const romBytes = ld65.FS.readFile("/work/test.nes");

const expectedLength = 16 + 0x8000 + 0x2000;
if (romBytes.length !== expectedLength) {
    throw new Error(`Unexpected ROM length ${romBytes.length}, expected ${expectedLength}`);
}

const magic = String.fromCharCode(...romBytes.slice(0, 4));
if (magic !== "NES\u001a") {
    throw new Error(`Unexpected iNES magic ${JSON.stringify(magic)}`);
}

console.log(`OK object=${objectBytes.length} rom=${romBytes.length}`);
