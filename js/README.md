# tiny-voca in plain JavaScript

An experiment: the model in one script, with no libraries. No ONNX Runtime, no
WebAssembly, no npm packages. It reads one GGUF file and makes sound.

- `tiny-voca.js`: the GGUF reader and the model. Open it and read from the top.
- `index.html`: a test page. Type a text, pick a voice and the bits of the weights (4 by default), press Play.
  Each sentence plays as soon as it is made, and the whole clip can be saved as a WAV file.
- `pack.mjs`: makes a smaller GGUF with 1 to 8 bits a weight.
- `test/`: the check against PyTorch.

So far this is the model only. The page looks every word up in the dictionary
inside the GGUF; numbers and words the dictionary does not have are skipped.
The real phonemizer (dizione) is not here yet. The ten test sentences in
`test/sentences.json` were turned into phonemes by it beforehand.

## Try it

```
cd js
python3 -m http.server 8000
```

Open http://localhost:8000. The page downloads the GGUF from
[Hugging Face](https://huggingface.co/n4ze3m/tiny-voca/tree/main/gguf).
`?file=URL` uses another copy.

## Check against PyTorch

```
python js/test/reference.py --checkpoint tiny-voca.pt --output reference
node js/test/check.mjs tiny-voca-orig.gguf reference
```

The first line writes what PyTorch gives for the test sentences. The second
runs the same phonemes and the same noise through the JavaScript model and
prints, for each sentence and voice, whether the lengths are equal and how far
the waveform is.

## Smaller files

```
node js/pack.mjs tiny-voca-orig.gguf tiny-voca-2bit.gguf 2
```

The last number is the bits for each weight, 1 to 8. The 44 large matrices of
the transformer blocks are packed; everything else stays float32. The page and
the check read the result like any other file (`?file=tiny-voca-2bit.gguf`).
The page can also pack the float32 file itself: choose the bits next to the
voice. That gives the same weights as the packed file.

How a matrix is packed: every row gets one scale `s` (float32), and every
weight becomes a code `c` of that many bits. The weight is read back as
`(2c + 1 - levels) * s`, with `levels = 2^bits`. With 1 bit that is `+s` or
`-s`; with 2 bits `-3s, -s, s, 3s`. The scale is the one with the smallest
squared error for the row. In the file a packed matrix is a run of bytes (the
scales, then the codes), and the key `tiny_voca.packing` lists the packed
matrices with their bits and shape, so it is still a valid GGUF.

`node js/test/clips.mjs file.gguf folder label 1 2` writes sentences 1 and 2
as WAV files.
