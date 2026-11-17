import { readFileSync, writeFileSync } from "node:fs";
import { readGGUF, pack, packable } from "./tiny-voca.js";

const [input, output, bits] = process.argv.slice(2);
if (!output || !(bits >= 1 && bits <= 8)) {
  console.error("usage: node pack.mjs tiny-voca-orig.gguf out.gguf BITS    (BITS: 1 to 8)");
  process.exit(1);
}
const file = readGGUF(new Uint8Array(readFileSync(input)).buffer);
if (file.meta["tiny_voca.packing"]) throw new Error("the input is packed already: start from the float32 file");

const encoder = new TextEncoder();
const u32 = (n) => new Uint8Array(new Uint32Array([n]).buffer);
const u64 = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);
const string = (text) => { const bytes = encoder.encode(text); return [u64(bytes.length), bytes]; };
const padded = (size) => Math.ceil(size / 32) * 32;

const packing = {}, infos = [], blobs = [];
let offset = 0, packedBytes = 0;
for (const [name, { shape, data }] of Object.entries(file.tensors)) {
  const small = !packable(name, shape);
  const bytes = small ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : pack(data, shape, Number(bits));
  if (!small) { packing[name] = { bits: Number(bits), shape }; packedBytes += bytes.length; }
  const dims = small ? [...shape].reverse() : [bytes.length];
  infos.push(...string(name), u32(dims.length), ...dims.map(u64), u32(small ? 0 : 24), u64(offset));
  blobs.push(bytes, new Uint8Array(padded(bytes.length) - bytes.length));
  offset += padded(bytes.length);
}
const header = [u32(0x46554747), u32(3), u64(Object.keys(file.tensors).length), u64(file.keys.count + 1), file.keys.bytes,
                ...string("tiny_voca.packing"), u32(8), ...string(JSON.stringify(packing)), ...infos];
const size = header.reduce((sum, part) => sum + part.length, 0);
const out = Buffer.concat([...header, new Uint8Array(padded(size) - size), ...blobs]);
writeFileSync(output, out);
console.log(`${output}: ${out.length} bytes, ${Object.keys(packing).length} matrices at ${bits} bits in ${packedBytes} bytes`);
