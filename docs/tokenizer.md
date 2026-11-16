# tokenizer.md — The Tokenizer Class, Explained Like You're 5 (and then like you're a grown-up)

This document explains **one single file**: `src/tokenizer.js` from
the Mini LLM project. It covers:

- What "tokenizing" even means, in the simplest possible terms
- Every notation/symbol used, explained in plain words
- The regular expression (regex) that splits text apart, exploded
  piece by piece
- Every method/function the `Tokenizer` class has — what you give it
  (input), what you get back (output), the logic behind it, and a
  hand-checkable worked example
- Step-by-step walkthroughs you could redo yourself with pen and paper

---

## Part 1: What is Tokenizing? (Explain Like I'm 5)

A neural network cannot read words. It only understands **numbers**.
So before we can show it a sentence like `"Hi there!"`, we need to
chop that sentence into little pieces and give each piece its own
ID number — like giving every kid in a classroom their own student ID
number so the school computer can keep track of them without needing
to understand English names.

**Tokenizing** = chopping text into pieces (called **tokens**).
**Encoding** = turning those pieces into ID numbers.
**Decoding** = turning ID numbers back into readable text.

```
"Hi there!"
     |  (tokenize: chop into pieces)
     v
["hi", "there", "!"]
     |  (encode: look up each piece's ID number)
     v
[6, 7, 8]
```

And going backward:

```
[6, 7, 8]
     |  (decode: look up each ID's word)
     v
["hi", "there", "!"]
     |  (join back into a sentence)
     v
"hi there!"
```

**ELI5:** Imagine a magic dictionary where every word (and every
punctuation mark, like `!` or `?`) has its own numbered coat hook in a
coat closet. To "encode" a sentence, you walk through it word by word
and write down which coat hook number each word hangs on. To "decode,"
you do the opposite: given a list of hook numbers, you go grab the
word hanging on each hook and read them out loud in order.

### Why not just use the whole word as-is, no numbers?

Because absolutely everything inside a neural network — every
calculation, every "weight," every prediction — is built entirely out
of numbers and matrices (see `matrix.md`). A network has no idea what
the *letters* "c-a-t" mean. But if we say "cat is always number 42,"
the network CAN learn things like "number 42 tends to show up near
number 17 (`the`) and number 88 (`meow`)" — and that pattern-learning
is really the entire secret behind how language models work.

---

## Part 2: Notation Cheat-Sheet

| Notation | Read it as | Meaning |
|---|---|---|
| `token` | "token" | One chopped-up piece of text — usually one word, or one punctuation mark |
| `id` | "id" (short for "identifier") | The whole-number label assigned to one specific token |
| `vocabulary` / `vocab` | "vocabulary" | The complete list of every token the tokenizer knows about, each with its own id |
| `vocabSize` | "vocab size" | How many total tokens are in the vocabulary (a count) |
| `wordToId` | "word to id" | A lookup table: give it a word, it gives you back that word's id number |
| `idToWord` | "id to word" | The reverse lookup table: give it an id number, it gives you back the word |
| `encode` | "encode" | Text → array of id numbers |
| `decode` | "decode" | Array of id numbers → text |
| `corpus` | "corpus" | A fancy word for "a big collection of training text" |
| `regex` / regular expression | "regex" | A tiny pattern-matching language used to search/split text by rules (explained fully in Part 4) |
| `\w`, `\s` | "word character", "whitespace character" | Special regex shorthand codes, explained in Part 4 |
| `<PAD>`, `<BOS>`, `<SEP>`, `<EOS>`, `<UNK>` | "special tokens" | Five made-up "words" that aren't real English — they're control signals, explained in Part 3 |

That's every symbol you'll see. No calculus, nothing scary — just text
chopping and lookup tables (which are really just two-column
lists: "word" on one side, "number" on the other).

---

## Part 3: The Five Special Tokens

Before touching any code, we need to understand five fake "words" this
project invents and sprinkles into every training example. Real
English text never contains these — we make them up on purpose, as
special signal flags for the network.

| Token | id | What it means | ELI5 |
|---|---|---|---|
| `<PAD>` | 0 | "Padding" — an empty filler, not currently used for anything active in training but reserved for the future (e.g. if you wanted to train on many sentences of different lengths at once, stacked together, you'd need to pad the short ones out to match the longest one) | Like leaving an empty chair at a table just so every table has the same number of seats |
| `<BOS>` | 1 | "Beginning Of Sequence" — marks "a new message starts right here" | Like a teacher clapping once to say "okay everyone, listen up, we're starting now!" |
| `<SEP>` | 2 | "Separator" — marks the dividing line between the user's message and the bot's reply | Like a line down the middle of a shared notebook page: "your side" / "my side" |
| `<EOS>` | 3 | "End Of Sequence" — marks "the reply is finished, stop talking now" | Like putting your pencil down and saying "I'm done!" |
| `<UNK>` | 4 | "Unknown" — the catch-all id used for any word the tokenizer has NEVER seen before | Like a substitute teacher's name tag that just says "GUEST" because the school doesn't have a specific name badge printed for them |

Notice they get id numbers **0 through 4**, always, in that exact
order — reserved before any real word gets a number. Every real word
from your training text starts getting numbered from **5** onward.

**Why do we need `<BOS>` / `<SEP>` / `<EOS>` at all?** Because the
model doesn't "know" anything except "given these tokens, predict the
next token." Wrapping every training example like this:

```
<BOS> hi <SEP> hello ! how are you ? <EOS>
```

...teaches the model a very learnable pattern: "after `<SEP>`, start
generating a reply" and "when you've said enough, output `<EOS>` so
generation knows to stop." Without these markers, the model would have
no clean way to know where the user's turn ends and its own turn
should begin, or when to stop talking.

---

## Part 4: `splitIntoWords(text)` — Chopping Text Into Pieces

This is a plain function (not a class method) that does the actual
"chopping." Every other part of the tokenizer relies on it.

### Input
`text` — any string, e.g. `"Hi there!"`

### Output
An array of small string pieces (tokens), e.g. `["hi", "there", "!"]`

### Step-by-step, exactly what the code does

**Step 1 — lowercase and trim.**
```js
const normalized = text.toLowerCase().trim();
```
`"Hi there!  "` becomes `"hi there!"`. Lowercasing means `"Hi"` and
`"hi"` and `"HI"` all get treated as the exact same word (otherwise
the tokenizer would think they're three totally different words with
three different id numbers, which would be wasteful and confusing).
`.trim()` just chops off any accidental extra spaces from the very
start/end.

**Step 2 — split using a regex pattern.**
```js
const matches = normalized.match(/\w+|[^\s\w]/g);
```

This one line is the cleverest part of the whole file, so let's take
it apart symbol by symbol, like reading a secret code.

#### What is a regex, ELI5?

A regular expression ("regex") is a tiny search pattern made of
special symbols, kind of like a treasure-hunt clue that says "find me
anything that looks like THIS shape," instead of searching for one
exact word.

#### Decoding `/\w+|[^\s\w]/g` piece by piece

| Piece | Name | Meaning |
|---|---|---|
| `/  /` | slashes | Just the "start and end" wrapper that says "this is a regex pattern" |
| `\w` | "word character" | Matches any single letter (a-z), digit (0-9), or underscore (`_`) |
| `\w+` | "one or more word characters" | The `+` means "one or more in a row" — so this matches a WHOLE run of letters/digits stuck together, like `"hello"` or `"123"`, all as ONE match |
| `\|` | "OR" | Try the left pattern first; if it doesn't match here, try the right pattern instead |
| `\s` | "whitespace character" | Matches a space, tab, or newline |
| `[^\s\w]` | "anything that is NOT whitespace and NOT a word character" | The `[^ ... ]` box means "NOT any of these"; so this matches exactly ONE punctuation-ish character, like `!`, `?`, `,`, `.` |
| `g` | "global" flag | Don't stop after the first match — find EVERY match in the whole string |

**Put together in plain English:** *"Walk through the text. Every time
you find a run of letters/digits, grab the whole run as one token.
Every time you find something that's neither a letter/digit nor a
space (i.e., punctuation), grab just that one character as its own
separate token. Skip over plain spaces entirely — don't turn them into
tokens at all."*

#### Worked example, character by character

Text: `"hi there!"`

Walking through it left to right:
- `h`, `i` → letters, keep grabbing letters → forms the token `"hi"`
- ` ` (space) → not a word character, but IS whitespace, so `[^\s\w]`
  does NOT match it either → skipped entirely, no token created
- `t`, `h`, `e`, `r`, `e` → letters, keep grabbing → forms the token
  `"there"`
- `!` → not a letter/digit, not whitespace → matches `[^\s\w]` →
  becomes its own one-character token `"!"`

**Result:** `["hi", "there", "!"]`

```js
splitIntoWords("Hi there!");
// ["hi", "there", "!"]
```

#### One more worked example, to really nail it down

Text: `"What's up, Bob?"`

- `"what's"` — wait, careful here! The apostrophe `'` is NOT a `\w`
  character (it's not a letter, digit, or underscore), so `\w+`
  will stop right before it.
  - `w,h,a,t` → token `"what"`
  - `'` → its own token, `"'"`
  - `s` → token `"s"`
- ` ` → skipped (whitespace)
- `u,p` → token `"up"`
- `,` → its own token, `","`
- ` ` → skipped
- `B,o,b` → lowercased already, token `"bob"`
- `?` → its own token, `"?"`

**Result:**
```js
splitIntoWords("What's up, Bob?");
// ["what", "'", "s", "up", ",", "bob", "?"]
```

**ELI5:** Imagine you're sorting a jar of mixed beads and buttons.
Every time you find a run of same-colored beads touching each other,
you scoop them up as one group. Every time you find a lone button
(punctuation), you pick it up all by itself. You completely ignore
and skip over any empty gaps (spaces) between them.

#### The "or nothing" fallback

```js
return matches || [];
```
`.match()` returns `null` (not an empty array) if the text had
literally nothing to match — for example, an empty string `""`, or a
string that's only spaces. This line just says "if that happened,
give back an empty array instead of `null`," so the rest of the code
never has to worry about `null` sneaking in.

```js
splitIntoWords("");      // []
splitIntoWords("   ");   // []
```

---

## Part 5: The `Tokenizer` Class — Big Picture

Every `Tokenizer` object stores two lookup tables (the "coat closet"
from Part 1), which are always exact mirror images of each other:

```js
tokenizer.wordToId   // { "<PAD>": 0, "<BOS>": 1, ..., "hi": 5, "there": 6, ... }
tokenizer.idToWord   // { 0: "<PAD>", 1: "<BOS>", ..., 5: "hi", 6: "there", ... }
```

`wordToId` is used for **encoding** (word → number).
`idToWord` is used for **decoding** (number → word).

We keep BOTH directions stored, rather than building one and searching
through it backward every time, purely for speed: looking a word up
directly by its key (`wordToId["hi"]`) is instant, while searching
through every entry to find which one has value `"hi"` would be slow.
This tradeoff — using a little extra memory to make lookups instant —
is extremely common in programming.

---

## Part 6: `new Tokenizer()` — The Constructor

### Input
None — you just write `new Tokenizer()`.

### Output
A brand-new Tokenizer object, pre-loaded with ONLY the 5 special
tokens from Part 3 (no real words yet).

### Step by step

```js
constructor() {
  this.wordToId = {};
  this.idToWord = {};
  SPECIAL_TOKENS.forEach((tok, i) => {
    this.wordToId[tok] = i;
    this.idToWord[i] = tok;
  });
}
```

1. Start with two completely empty lookup tables.
2. Walk through the list `["<PAD>", "<BOS>", "<SEP>", "<EOS>", "<UNK>"]`
   one at a time. `i` here is simply "which position in the list are
   we at" — so `<PAD>` is at position `0`, `<BOS>` is at position `1`,
   and so on.
3. For each one, save it into BOTH tables: `wordToId["<PAD>"] = 0` AND
   `idToWord[0] = "<PAD>"`.

### Worked example

```js
const t = new Tokenizer();

console.log(t.wordToId);
// { "<PAD>": 0, "<BOS>": 1, "<SEP>": 2, "<EOS>": 3, "<UNK>": 4 }

console.log(t.idToWord);
// { 0: "<PAD>", 1: "<BOS>", 2: "<SEP>", 3: "<EOS>", 4: "<UNK>" }
```

**ELI5:** It's like setting up a brand-new, empty coat closet, but
before anyone's coats arrive, you screw in 5 permanently-labeled hooks
first: "PAD," "BOS," "SEP," "EOS," and "UNK." Every future real word's
hook gets added AFTER these 5.

---

## Part 7: `tokenizer.buildVocab(corpusTexts)` — Learning the Vocabulary

This is how the tokenizer "learns" every word it'll ever be able to
recognize, by reading through your whole training dataset once.

### Input
`corpusTexts` — an array of plain strings, e.g.
`["hi", "hello there !"]` — usually every sentence in your training
data, all mixed together.

### Output
Nothing is returned — instead, it fills in `this.wordToId` and
`this.idToWord` with every unique word/punctuation mark it found.

### Step by step

```js
buildVocab(corpusTexts) {
  let nextId = SPECIAL_TOKENS.length;     // starts at 5
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
```

1. Start a counter `nextId` at `5` (since ids `0`-`4` are already
   permanently taken by the special tokens).
2. Go through every string in `corpusTexts`, one at a time.
3. For each string, chop it into tokens using `splitIntoWords` (Part
   4).
4. For each token: **if we've never seen this exact word before**,
   give it the next available id number and bump the counter up by 1
   for next time. **If we HAVE seen it before**, do nothing — it
   already has an id, we don't want to give the same word two
   different numbers!

### Worked example

```js
const t = new Tokenizer();
t.buildVocab(["hi", "hello there !", "hi there"]);
```

Let's trace through this by hand:

- `nextId` starts at `5`
- Text 1: `"hi"` → tokens: `["hi"]`
  - `"hi"` — never seen → assign id `5`. `nextId` becomes `6`.
- Text 2: `"hello there !"` → tokens: `["hello", "there", "!"]`
  - `"hello"` — never seen → assign id `6`. `nextId` becomes `7`.
  - `"there"` — never seen → assign id `7`. `nextId` becomes `8`.
  - `"!"` — never seen → assign id `8`. `nextId` becomes `9`.
- Text 3: `"hi there"` → tokens: `["hi", "there"]`
  - `"hi"` — **already seen** (it's id `5`) → skip, don't reassign!
  - `"there"` — **already seen** (it's id `7`) → skip!

**Final vocabulary:**

```
{
  "<PAD>": 0, "<BOS>": 1, "<SEP>": 2, "<EOS>": 3, "<UNK>": 4,
  "hi": 5, "hello": 6, "there": 7, "!": 8
}
```

**ELI5:** Imagine walking down a hallway handing out numbered name
tags to students as you meet them for the first time. If you bump
into a student you've already tagged, you don't give them a second,
different name tag — they keep the one they already have. By the end
of your walk, every unique student has exactly one number, handed out
in the order you first met them.

---

## Part 8: `tokenizer.vocabSize` — Counting the Vocabulary

### Input
None — this is a "getter," which means you read it like a plain
property, without parentheses: `tokenizer.vocabSize`, not
`tokenizer.vocabSize()`.

### Output
A single number: how many total tokens (special tokens + real words)
are currently known.

### The formula

```
vocabSize = number of keys currently in wordToId
```

### Worked example

Using the tokenizer we just built above (5 special tokens + 4 real
words: `"hi"`, `"hello"`, `"there"`, `"!"`):

```js
console.log(t.vocabSize);
// 9
```

**ELI5:** It's like counting how many labeled hooks are currently
screwed into the coat closet wall, in total — the 5 permanent ones
plus however many new ones you added while learning new words.

**Why do we need this?** The rest of the neural network needs to know
exactly how many different "columns" its output should have (one
column per possible word it could predict) — `vocabSize` is that
number.

---

## Part 9: `tokenizer.encode(text)` — Text → Numbers

### Input
`text` — any string, e.g. `"hi there"`

### Output
An array of numbers (ids), e.g. `[5, 7]`

### Step by step

```js
encode(text) {
  return splitIntoWords(text).map((word) =>
    word in this.wordToId ? this.wordToId[word] : this.wordToId["<UNK>"]
  );
}
```

1. Chop the text into tokens using `splitIntoWords` (Part 4).
2. For each token, look it up in `wordToId`.
   - **If it's a word we've seen before** (it exists as a key in
     `wordToId`), use its real id number.
   - **If it's a brand-new word we've never seen** (maybe it wasn't in
     the training data at all), we can't just make up a new number for
     it on the spot — the network was never trained to understand a
     number that large. Instead we substitute the `<UNK>` ("unknown")
     id.

### Worked example (using our vocabulary from Part 7)

```
vocab: { "<PAD>":0, "<BOS>":1, "<SEP>":2, "<EOS>":3, "<UNK>":4,
         "hi":5, "hello":6, "there":7, "!":8 }
```

```js
t.encode("hi there!");
// tokens: ["hi", "there", "!"]
// "hi"    -> 5 (known)
// "there" -> 7 (known)
// "!"     -> 8 (known)
// => [5, 7, 8]
```

Now let's try a word it's never seen, like `"bye"`:

```js
t.encode("bye hi");
// tokens: ["bye", "hi"]
// "bye" -> not in wordToId -> substitute <UNK> id, which is 4
// "hi"  -> 5 (known)
// => [4, 5]
```

**ELI5:** You walk into the coat closet holding a coat (a word) and
look for the hook with that exact word's name on it. If you find it,
you hang the coat there and remember that hook's number. If there's no
hook for that word at all (because nobody with that name has ever come
through before), you just use the always-available "GUEST" hook
(`<UNK>`) instead, so nothing gets left on the floor.

---

## Part 10: `tokenizer.decode(ids)` — Numbers → Text

### Input
`ids` — an array of numbers, e.g. `[5, 7, 8]`

### Output
A single readable string, e.g. `"hi there!"`

### Step by step

```js
decode(ids) {
  const words = ids
    .map((id) => this.idToWord[id])
    .filter((w) => !SPECIAL_TOKENS.includes(w));

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
```

**Step A — turn each id back into its word.**
```js
ids.map((id) => this.idToWord[id])
```
This is just the reverse lookup: for id `5`, check `idToWord[5]`,
which gives back `"hi"`.

**Step B — throw away any special tokens.**
```js
.filter((w) => !SPECIAL_TOKENS.includes(w))
```
We don't want the final sentence a human reads to contain the literal
text `"<BOS>"` or `"<EOS>"` — those are just internal control signals
for the model, not real words. `filter` keeps only the words that are
**NOT** in the special tokens list.

**Step C — carefully glue the words back into one sentence.**

This is the fiddly part: if we just joined every token with a plain
space, we'd get ugly results like `"hi there !"` (with an awkward
space before the `!`) instead of the natural `"hi there!"`.

So the code keeps a list of "characters that should NOT have a space
put in front of them": `.`, `,`, `!`, `?`, `'`, `:`, `;`. For every
word:
- If it's the very FIRST word (`out.length === 0`), or it's one of
  those no-space-before punctuation marks → just glue it on directly,
  no space.
- Otherwise → add one space, THEN glue the word on.

### Worked example

```
ids: [5, 7, 8]     (using our vocab: 5="hi", 7="there", 8="!")
```

- id `5` → word `"hi"` → not a special token, keep it
- id `7` → word `"there"` → keep it
- id `8` → word `"!"` → keep it

`words = ["hi", "there", "!"]`

Now glue them together, one at a time:
- `"hi"`: `out` is currently empty → glue directly → `out = "hi"`
- `"there"`: `out` is NOT empty, and `"there"` is not in the
  no-space-before set → add a space first → `out = "hi there"`
- `"!"`: `out` is NOT empty, but `"!"` IS in the no-space-before set →
  glue directly, no space → `out = "hi there!"`

**Final result:** `"hi there!"`

```js
t.decode([5, 7, 8]);
// "hi there!"
```

### A second worked example, showing special tokens getting dropped

```js
t.decode([1, 5, 7, 3]);
// id 1 = "<BOS>" -> dropped (it's a special token)
// id 5 = "hi"    -> kept
// id 7 = "there" -> kept
// id 3 = "<EOS>" -> dropped (it's a special token)
// words = ["hi", "there"]
// => "hi there"
```

**ELI5:** Imagine you're handed a stack of numbered claim tickets from
a coat closet. For each ticket, you go grab the matching coat (word).
But if a ticket happens to be one of the 5 special "staff-only" tags
(not a real coat), you just skip it — customers don't want to see
those. Then you lay all the real coats out in a row to make one
outfit (sentence), being careful not to leave an awkward gap right
before a comma or exclamation mark, the same way you wouldn't normally
write `"Hello !"` with a space before the `!` in natural writing.

---

## Part 11: `tokenizer.id(specialToken)` — Looking Up a Special Token's Number

### Input
`specialToken` — the exact string of one of the 5 special tokens, e.g.
`"<BOS>"`

### Output
That token's id number.

### The code

```js
id(specialToken) {
  return this.wordToId[specialToken];
}
```

This is really just a tiny, friendlier shortcut for
`tokenizer.wordToId["<BOS>"]`, used elsewhere in the project so the
training and chat code can say things like:

```js
const BOS = tokenizer.id("<BOS>");
const SEP = tokenizer.id("<SEP>");
const EOS = tokenizer.id("<EOS>");
```

...to build a full training sequence:
```
[BOS, ...encode(userText), SEP, ...encode(botText), EOS]
```

### Worked example

```js
t.id("<BOS>");   // 1
t.id("<SEP>");   // 2
t.id("<EOS>");   // 3
```

**ELI5:** Instead of remembering "the BOS hook is number 1" by heart
every single time, you just ask the closet attendant "hey, which hook
number is BOS again?" and they tell you.

---

## Part 12: `tokenizer.toJSON()` and `tokenizer.loadJSON(obj)` — Saving and Loading

These two methods let you save a trained tokenizer's vocabulary to a
file, and load it back later — important because once you've trained
a model, you need the EXACT same word-to-number mapping every time you
use it, or all the numbers would mean completely different words!

### `toJSON()`

**Input:** none
**Output:** a plain object containing just the `wordToId` table (we
don't even need to save `idToWord` — it can always be rebuilt from
`wordToId`, so saving both would just be wasted duplicate data).

```js
toJSON() {
  return { wordToId: this.wordToId };
}
```

### Worked example

```js
t.toJSON();
// { wordToId: { "<PAD>":0, "<BOS>":1, ..., "hi":5, "there":7, "!":8 } }
```

This plain object can then be turned into text and saved to a file
with `JSON.stringify(...)`, exactly like the project's `train.js` does
when it saves `models/weights.json`.

### `loadJSON(obj)`

**Input:** `obj` — an object shaped like what `toJSON()` produces,
e.g. loaded back from a saved file
**Output:** nothing returned — it fills in `this.wordToId` AND rebuilds
`this.idToWord` from scratch

```js
loadJSON(obj) {
  this.wordToId = obj.wordToId;
  this.idToWord = {};
  for (const [word, id] of Object.entries(this.wordToId)) {
    this.idToWord[id] = word;
  }
}
```

**Step by step:**
1. Directly copy over the saved `wordToId` table — no work needed
   there, it's already exactly what we want.
2. Rebuild `idToWord` completely from scratch by walking through every
   `[word, id]` pair inside the freshly-loaded `wordToId`, and setting
   `idToWord[id] = word` for each one. This is necessary because we
   only bothered saving `wordToId` in `toJSON()` — so after loading,
   we have to reconstruct the reverse-lookup table ourselves.

### Worked example

```js
const saved = t.toJSON();
// saved = { wordToId: { "<PAD>":0, ..., "hi":5, "there":7 } }

const t2 = new Tokenizer();
t2.loadJSON(saved);

t2.wordToId["hi"];    // 5   (loaded correctly)
t2.idToWord[5];        // "hi" (correctly rebuilt!)
```

**ELI5:** `toJSON()` is like photographing your coat closet's hook
labels and saving the photo. `loadJSON()` is like handing that photo
to a brand-new, empty closet and having someone screw in all the same
labeled hooks in all the same spots — AND, since the photo only showed
"word → hook number," they also have to work out "hook number → word"
themselves by just reading the photo backward, one label at a time.

---

## Part 13: Quick Reference Table

| Method / Function | Input | Output | One-line description |
|---|---|---|---|
| `splitIntoWords(text)` | a string | array of token strings | Lowercase + chop text into words and punctuation, using regex `/\w+\|[^\s\w]/g` |
| `new Tokenizer()` | none | a Tokenizer object | Creates empty vocab, pre-loaded with the 5 special tokens (ids 0-4) |
| `tokenizer.buildVocab(corpusTexts)` | array of strings | nothing (fills in vocab) | Scans all training text once, assigns each new unique token the next available id |
| `tokenizer.vocabSize` | none (getter) | a number | How many total tokens (special + real) are known |
| `tokenizer.encode(text)` | a string | array of numbers | Text → token ids, using `<UNK>` (id 4) for never-seen words |
| `tokenizer.decode(ids)` | array of numbers | a string | Token ids → text, dropping special tokens and spacing punctuation correctly |
| `tokenizer.id(specialToken)` | one of `"<PAD>"`, `"<BOS>"`, `"<SEP>"`, `"<EOS>"`, `"<UNK>"` | a number | Convenience lookup for a special token's id |
| `tokenizer.toJSON()` | none | `{ wordToId }` | Package the vocabulary up for saving to a file |
| `tokenizer.loadJSON(obj)` | `{ wordToId }` | nothing (fills in vocab) | Restore a vocabulary from a previously-saved file |

---

## Part 14: Putting It All Together — One Full End-to-End Example

Let's trace one complete round trip, the exact way the rest of the
project actually uses this class, so you can see every piece working
together.

```js
const { Tokenizer } = require("./src/tokenizer");

// --- Step 1: create a tokenizer and teach it some words ---
const tokenizer = new Tokenizer();
tokenizer.buildVocab([
  "hi",
  "hello ! how are you ?",
  "thank you",
  "you are welcome !",
]);

console.log(tokenizer.vocabSize);
// 5 special tokens + these unique real words:
// "hi","hello","!","how","are","you","?","thank","welcome"
// = 5 + 9 = 14

// --- Step 2: build one full training sequence, the way train.js does ---
const BOS = tokenizer.id("<BOS>");
const SEP = tokenizer.id("<SEP>");
const EOS = tokenizer.id("<EOS>");

const userText = "thank you";
const botText  = "you are welcome !";

const sequence = [
  BOS,
  ...tokenizer.encode(userText),
  SEP,
  ...tokenizer.encode(botText),
  EOS,
];
console.log(sequence);
// e.g. [1, 10, 6, 2, 6, 11, 12, 3, 3]
// (exact numbers depend on the order words were first seen in buildVocab,
//  but the STRUCTURE is always: BOS, user words..., SEP, bot words..., EOS)

// --- Step 3: later, decode a model's generated reply back to text ---
// Suppose the model generated these ids after the <SEP> token:
const generatedIds = [6, 11, 12]; // e.g. ids for "you", "are", "welcome"
console.log(tokenizer.decode(generatedIds));
// "you are welcome"

// --- Step 4: save + reload the vocabulary, exactly like train.js / chat.js do ---
const saved = JSON.stringify(tokenizer.toJSON());
// ... later, in a different program run ...
const reloadedTokenizer = new Tokenizer();
reloadedTokenizer.loadJSON(JSON.parse(saved));
reloadedTokenizer.encode("thank you");
// produces the EXACT same ids as before saving, since the vocabulary was preserved
```

This is genuinely the entire journey: **raw text → tokens → ids → (the
neural network does its thing) → ids → tokens → readable text again**,
with the special `<BOS>`/`<SEP>`/`<EOS>` markers acting as the
"punctuation" that teaches the model where a user's turn ends and its
own reply should begin and end.
