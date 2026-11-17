import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readGGUF } from "../tiny-voca.js";
import { fromGGUF } from "../dizione/engine.js";
import { Model } from "../dizione/g2p.js";
import { toText } from "../dizione/convert.js";
import { packLexicon, unpackLexicon, gunzip } from "../dizione/lexicon.js";

const [path, output = "dictionary.json"] = process.argv.slice(2);
const file = readGGUF(new Uint8Array(readFileSync(path)).buffer), phonemizer = fromGGUF(file);
const raw = file.files["phonemizer/lexicon.tsv"], entries = [...phonemizer.lexicon], gzip = (bytes) => gzipSync(bytes, { level: 9 });
const report = {};
const say = (name, value) => { report[name] = value; console.log(`${name}: ${value}`); };
const same = (map) => map.size === entries.length && entries.every(([word, text]) => map.get(word) === text);

say("words", entries.length);
say("dictionary as it is, bytes", raw.length);
say("a. gzip, bytes", gzip(raw).length);
const packed = packLexicon(entries), small = gzip(packed);
say("b. packed, bytes", packed.length);
say("b. packed + gzip, bytes", small.length);
let started = performance.now();
const back = unpackLexicon(await gunzip(small));
say("b. unpack in ms", (performance.now() - started).toFixed(0));
say("b. every word and pronunciation comes back the same", same(back));

const model16 = new Model(phonemizer.model.settings, (name) => {
  const { shape, data } = file.tensors["g2p/" + name];
  return { shape, data: new Float32Array(new Float16Array(data)) };
});
started = performance.now();
const guesses = [], exceptions = [];
let different16 = 0;
entries.forEach(([word, text], i) => {
  const symbols = phonemizer.model.predict(word);
  if (model16.predict(word).join(" ") !== symbols.join(" ")) different16++;
  const guess = toText(phonemizer.guess(word));
  guesses.push(guess);
  if (guess !== text) exceptions.push([word, text]);
  if (i % 20000 === 0) console.log(`  ${i} words, ${((performance.now() - started) / 1000).toFixed(0)} s`);
});
const modelSeconds = (performance.now() - started) / 1000;
say("16-bit model: dictionary words with other phonemes", different16);
say("c. words the model already gets right", entries.length - exceptions.length);
say("c. entries left as exceptions", exceptions.length);
const wordList = packLexicon(entries.map(([word, text], i) => [word, guesses[i] === text ? "ə" : "ɐ"]));
const reduced = gzip(Buffer.concat([wordList, packLexicon(exceptions)]));
say("c. all words (to know what is a word) + exceptions, packed + gzip, bytes", reduced.length);
const kept = new Map(exceptions);
const lookup = (word) => kept.get(word) ?? toText(phonemizer.guess(word));
say("c. every word still comes out the same", entries.every(([word, text]) => lookup(word) === text));
started = performance.now();
for (const [word] of entries) phonemizer.lexicon.get(word);
const direct = (performance.now() - started) / entries.length;
say("c. a lookup in the full dictionary, microseconds", (1000 * direct).toFixed(2));
say("c. a lookup that needs the model, microseconds", (1e6 * modelSeconds / entries.length / 3).toFixed(0));
writeFileSync(output, JSON.stringify(report, null, 1) + "\n");
