# TRAINING.md — teaching the neural network

The network learns **next-token prediction**: given everything so far, which word comes next?
A conversation pair `["hi", "hello ! how are you ?"]` becomes ONE sequence:

```
<BOS> hi <SEP> hello ! how are you ? <EOS>
```

At every position the model is asked for the following token ("teacher forcing"). At chat
time the same loop runs on `<BOS> your words <SEP>` and keeps predicting until `<EOS>`.

## 1. Training data

Put files in `data/` (or whatever `training.dataDir` says). Every `*.js` / `*.json` file
is loaded, sorted by name, and merged. Accepted shapes:

```json
[["what is your favorite food", "i enjoy electricity !"],
 {"user": "good evening", "bot": "good evening ! how was your day ?"}]
```

```js
// data/more.js
module.exports = [["ping pong", "table tennis is fun !"]];
```

Rules: both texts must be non-empty strings (a bad item gives an error naming the file and item number).

**Writing good data**

- Put spaces around punctuation, as the examples do (`"hello !"`). The tokenizer splits punctuation
  anyway, but consistent text is easier to read.
- Give each prompt one clear reply, or several different prompts with the same reply. Conflicting replies
  for the same prompt make the network average between them.
- Anything that needs *facts*, *math* or *state* belongs in an [ability](ABILITIES.md), not the data.

## 2. Running training

```bash
node cli.js train
node cli.js train --epochs 500 --lr 0.01 --dModel 32 --dHidden 64 --layers 2
node cli.js train --data my-data-folder --seed 42
```

| Flag | Config key | Default | Effect |
|---|---|---|---|
| `--epochs` | `training.epochs` | 700 | passes over the data (more = fits tighter) |
| `--lr` | `training.lr` | 0.008 | step size of the Adam optimizer |
| `--dModel` | `training.dModel` | 32 | size of each word vector |
| `--dHidden` | `training.dHidden` | 64 | feed-forward width |
| `--layers` | `training.layers` | 2 | stacked transformer blocks |
| `--data` | `training.dataDir` | `data` | training folder |
| `--seed` | (none) | random | same seed + same data = identical run |

The loss printed every 20 epochs is the average cross-entropy per token. It starts near
`ln(vocabSize) ≈ 5` and falls toward ~0.3–0.5 on the shipped data (see [docs/math.md](docs/math.md) §9).
Training the default model takes about 1–2 minutes on a laptop.

Output: `models/weights.json` containing the weights, the vocabulary and metadata
(`trainedAt`, `epochs`, `finalLoss`, `pairs`).

**The vocabulary is frozen at training time.** After editing the data you must retrain:
unseen words become `<UNK>` and the saved weights only fit the vocabulary they were trained with.

## 3. Using the trainer from code

```js
const { loadConversations, trainModel, saveModel } = require("./src");
const { pairs } = loadConversations("data");
const { model, tokenizer, history } = trainModel({
  pairs,
  hyper: { epochs: 300, lr: 0.01, dModel: 32, dHidden: 64, layers: 2, clipNorm: 5 },
  seed: 1,
  onEpoch: (epoch, loss) => epoch % 50 === 0 && console.log(epoch, loss),
});
saveModel("models/weights.json", model, tokenizer, { note: "my run" });

// use a model without the CLI:
const agent = await require("./src").MiniLLMAgent.create({ model, tokenizer });
```

## 4. Generation settings (not training)

`temperature`, `topK`, `maxNewTokens` and `sampler` only affect *chatting*. Try them live:

```
/set temperature 0        # always the most likely word
/set sampler topk         # sample only among the 5 most likely words
/set temperature 1.2      # wilder
/samplers                 # list strategies
```

Add your own strategy in a plugin: see [PLUGINS.md](PLUGINS.md#step-8--register-a-sampler).

## 5. Troubleshooting training

| Symptom | Cause / fix |
|---|---|
| Loss stalls early at a fixed value (e.g. ~0.38 on a tiny set) and replies are wrong | Learning rate too high for a tiny dataset. In our tests, `lr <= 0.01` converged for every seed while `lr = 0.02` stalled for some. Lower `--lr` and/or change `--seed` |
| Loss falls but replies are random | Raise `--epochs`; use `/set temperature 0` to see the "most likely" reply |
| Replies merge two answers | Two prompts with similar wording have different replies; make data less ambiguous |
| `<UNK>` in understanding | Word not in the data; add examples and retrain |
| Too slow | Lower `--epochs`, `--dModel`, `--dHidden` or `--layers`. Cost grows with all of them |
| Different result every run | Expected: random initialisation + shuffling. Use `--seed` to reproduce |

If you change the network code, run `npm run gradcheck` first: it compares every hand-written
backward pass with numerical derivatives. See [DEVELOPMENT.md](DEVELOPMENT.md#testing).

## 6. Ideas for going further

- **Multi-turn training**: build sequences like `<BOS> u1 <SEP> b1 <BOS> u2 <SEP> b2 <EOS>`
  (edit `buildSequences` in `src/engine/trainer.js` and the prompt builder in `src/engine/generator.js`),
  then raise the window (`maxLen` is computed from the longest sequence) so memory can be fed in.
- **Loss only on the bot's words**: mask the user part when computing the loss (change `softmaxCrossEntropy` usage in the trainer).
- **Multi-head attention** or **dropout**: new layers in `src/core/layers/` — verify with the gradient check.
- **Bigger data**: abilities can *generate* training data: loop over your ability's examples and write a `data/*.json`.
