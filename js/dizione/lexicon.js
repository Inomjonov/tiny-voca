import { PHONES } from "./symbols.js";

const MARKS = ["", "ˈ", "ˌ"];
const code = (unit) => {
  const stress = Math.max(MARKS.indexOf(unit[0]), 0);
  return 1 + PHONES.indexOf(stress ? unit.slice(1) : unit) + PHONES.length * stress;
};
const unit = (byte) => MARKS[Math.floor((byte - 1) / PHONES.length)] + PHONES[(byte - 1) % PHONES.length];
const shared = (a, b) => {
  let size = 0;
  while (size < a.length && size < b.length && size < 255 && a[size] === b[size]) size++;
  return size;
};

export function packLexicon(entries) {
  const encoder = new TextEncoder(), out = [...new Uint8Array(new Uint32Array([entries.length]).buffer)];
  const words = entries.map(([word]) => encoder.encode(word)), sounds = entries.map(([, text]) => text.split(" ").map(code));
  for (const list of [words, sounds]) {
    list.forEach((item, i) => {
      const same = i ? shared(item, list[i - 1]) : 0;
      out.push(same, ...item.slice(same), 0);
    });
  }
  return Uint8Array.from(out);
}

export function unpackLexicon(bytes) {
  const count = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), decoder = new TextDecoder();
  let at = 4;
  const run = () => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const same = bytes[at++], end = bytes.indexOf(0, at), item = new Uint8Array(same + end - at);
      if (i) item.set(items[i - 1].subarray(0, same));
      item.set(bytes.subarray(at, end), same);
      items.push(item);
      at = end + 1;
    }
    return items;
  };
  const words = run().map((word) => decoder.decode(word)), sounds = run();
  return new Map(words.map((word, i) => [word, Array.from(sounds[i], unit).join(" ")]));
}

export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
