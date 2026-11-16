/**
 * tokenizer.js
 * ------------
 * A simple word-level tokenizer. Real LLMs use sub-word tokenizers
 * (like BPE), but word-level tokenization is far easier to understand
 * and is plenty for a small learning project.
 *
 * Steps:
 *   1. Lowercase the text
 *   2. Split into words and punctuation marks separately, e.g.
 *        "Hi there!" -> ["hi", "there", "!"]
 *   3. Build a vocabulary: a unique integer id for every distinct token
 *      seen across the whole training set, plus 4 special tokens:
 *        <PAD> (id 0) - padding, unused positions
 *        <BOS> (id 1) - "beginning of sequence"
 *        <SEP> (id 2) - separates the user's turn from the bot's turn
 *        <EOS> (id 3) - "end of sequence", model stops generating here
 *        <UNK> (id 4) - any word not seen during training
 *
 * See math.md -> "Tokenization & Vocabulary" and development.md step 2.
 */

const SPECIAL_TOKENS = ["<PAD>", "<BOS>", "<SEP>", "<EOS>", "<UNK>"];

function splitIntoWords(text) {
  const normalized = text.toLowerCase().trim();
  // \w+ groups letters/digits/underscore into one token,
  // [^\s\w] captures punctuation as its own token.
  const matches = normalized.match(/\w+|[^\s\w]/g);
  return matches || [];
}

class Tokenizer {
  constructor() {
    this.wordToId = {};
    this.idToWord = {};
    SPECIAL_TOKENS.forEach((tok, i) => {
      this.wordToId[tok] = i;
      this.idToWord[i] = tok;
    });
  }

  // corpusTexts: array of raw strings to learn the vocabulary from
  buildVocab(corpusTexts) {
    let nextId = SPECIAL_TOKENS.length;
    for (const text of corpusTexts) {
      for (const word of splitIntoWords(text)) {
        if (!(word in this.wordToId)) {
          this.wordToId[word] = nextId;
          this.idToWord[nextId] = word;
          nextId++;
        }
      }
    }
  }

  get vocabSize() {
    return Object.keys(this.wordToId).length;
  }

  // Encode raw text into an array of token ids (no special tokens added).
  encode(text) {
    return splitIntoWords(text).map((word) =>
      word in this.wordToId ? this.wordToId[word] : this.wordToId["<UNK>"]
    );
  }

  // Decode an array of token ids back into a human-readable string.
  decode(ids) {
    const words = ids
      .map((id) => this.idToWord[id])
      .filter((w) => !SPECIAL_TOKENS.includes(w));
    // Join words with spaces, but don't put a space before punctuation.
    let out = "";
    const noSpaceBefore = new Set([".", ",", "!", "?", "'", ":", ";"]);
    for (const w of words) {
      if (out.length === 0 || noSpaceBefore.has(w)) {
        out += w;
      } else {
        out += " " + w;
      }
    }
    return out;
  }

  id(specialToken) {
    return this.wordToId[specialToken];
  }

  toJSON() {
    return { wordToId: this.wordToId };
  }

  loadJSON(obj) {
    this.wordToId = obj.wordToId;
    this.idToWord = {};
    for (const [word, id] of Object.entries(this.wordToId)) {
      this.idToWord[id] = word;
    }
  }
}

module.exports = { Tokenizer, SPECIAL_TOKENS, splitIntoWords };
