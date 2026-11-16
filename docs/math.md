# math.md — Every Formula Used In This Project

This document explains, with real numbers, every piece of math this
project relies on. Each section says **what** the math does, **why**
we need it, and walks through a **small worked example** you could
compute by hand.

---

## 1. Vectors and Matrices

A **vector** is just a list of numbers, e.g. `[0.2, -0.5, 1.3]`. In
this project, every word is represented as a vector (called an
**embedding**) — a list of numbers that (after training) captures
something about that word's meaning.

A **matrix** is a grid of numbers — rows and columns. We store a whole
sequence of words as a matrix: one row per word, one column per
"feature" of the embedding.

Example: the sentence "hi there" with a 4-dimensional embedding might
become the 2x4 matrix:

```
        col0   col1   col2   col3
"hi"  [ 0.10, -0.20,  0.05,  0.30 ]
"there"[ 0.40,  0.10, -0.15,  0.05 ]
```

This is implemented by the `Matrix` class in `src/matrix.js`.

---

## 2. Matrix Multiplication

Matrix multiplication is how information from one representation gets
mixed into another — it's the single most-used operation in the whole
project (used to apply weights, compute attention scores, etc).

**Rule:** to multiply matrix A (n x m) by matrix B (m x p), the number
of *columns* of A must equal the number of *rows* of B. The result is
n x p, where each entry is a **dot product** of a row of A with a
column of B:

```
result[i][j] = sum over k of ( A[i][k] * B[k][j] )
```

### Worked example

```
A (2x2)          B (2x2)          A * B (2x2)
[1, 2]           [5, 6]           [1*5+2*7, 1*6+2*8]   [19, 22]
[3, 4]    x      [7, 8]     =     [3*5+4*7, 3*6+4*8] = [43, 50]
```

Check the top-left entry by hand: `1*5 + 2*7 = 5 + 14 = 19`. ✓.

In code: `Matrix.multiply(A, B)` in `src/matrix.js`.

---

## 3. Embeddings

An embedding layer is a **lookup table**: row `i` is the learned vector
for token id `i`. "Looking up" a word's embedding is literally just
reading a row out of a matrix — no multiplication needed. This is
implemented in `src/layers/embedding.js`.

### Worked example

Suppose our whole vocabulary is `{0: "<PAD>", 1: "hi", 2: "there"}` and
we use a 3-dimensional embedding. The embedding table might be:

```
id 0 (<PAD>): [ 0.00,  0.00,  0.00 ]
id 1 ("hi"):  [ 0.12, -0.05,  0.33 ]
id 2 ("there"):[ 0.40,  0.10, -0.15 ]
```

Encoding the sentence "hi there" (ids `[1, 2]`) produces the matrix:

```
[ 0.12, -0.05,  0.33 ]
[ 0.40,  0.10, -0.15 ]
```

During training, gradient descent adjusts these rows so that words
used in similar contexts end up with similar vectors.

### Positional embeddings

Because attention (below) has no built-in sense of word order, we add
a **second** embedding table — one row per *position* (0, 1, 2, ...)
— and simply add it to the token embedding:

```
final_input = token_embedding + position_embedding
```

This is why position 0's vector and position 1's vector differ even
for the identical word, letting the model tell "hi there" apart from
a hypothetical "there hi".

---

## 4. Dense (Linear) Layers

A dense layer transforms every row of an input matrix the same way:

```
output = input * W + b
```

- `W` (weights): learned during training
- `b` (bias): learned during training, added to every row

### Worked example

Input `X` = `[[1, 2]]` (one word, 2 features). Weight `W` (2x2) =
`[[0.5, 0.1], [0.2, 0.3]]`. Bias `b` = `[0.0, 0.1]`.

```
X * W = [1*0.5 + 2*0.2,  1*0.1 + 2*0.3] = [0.9, 0.7]
output = [0.9, 0.7] + [0.0, 0.1] = [0.9, 0.8]
```

In code: `src/layers/dense.js`.

---

## 5. Activation Functions

Without a non-linear function between layers, stacking many dense
layers would be mathematically identical to just ONE dense layer (a
composition of linear functions is still linear!). Non-linearity is
what lets a network learn complex patterns.

### ReLU

```
relu(x) = x if x > 0, otherwise 0
```

### Leaky ReLU (what this project actually uses)

```
leakyRelu(x) = x if x > 0, otherwise 0.01 * x
```

**Why leaky, not plain ReLU?** With plain ReLU, if a neuron's input is
negative for every single training example, its output — and its
gradient — is *exactly* zero forever. That neuron can never recover
("dying ReLU"). Leaky ReLU keeps a tiny non-zero slope (`0.01`) for
negative inputs, so a small gradient can still flow through and the
neuron can eventually recover. We hit exactly this problem while
building this project (see development.md, "Debugging a training
plateau") — switching to Leaky ReLU was part of the fix.

Example: `leakyRelu(3) = 3`. `leakyRelu(-5) = 0.01 * -5 = -0.05`.

### Softmax

Softmax turns a row of raw numbers ("logits") into a valid probability
distribution — all values between 0 and 1, summing to exactly 1:

```
softmax(x)_i = exp(x_i) / sum_j( exp(x_j) )
```

### Worked example

Logits `[2.0, 1.0, 0.1]`:

```
exp(2.0) = 7.389
exp(1.0) = 2.718
exp(0.1) = 1.105
sum      = 11.212

softmax = [7.389/11.212, 2.718/11.212, 1.105/11.212]
        = [0.659, 0.242, 0.099]
```

These sum to 1.0 (within rounding) and the largest input (2.0) gets
the largest probability, as expected. In practice we subtract the max
value from every logit first (`x_i - max(x)`) purely to avoid
`exp()` overflowing on very large numbers — this doesn't change the
result mathematically, since it cancels out in the division.

Code: `softmaxRows()` in `src/activations.js`.

---

## 6. Self-Attention

This is the mechanism that makes a "transformer" a transformer, and
what lets the model use *context* — earlier words in the sentence —
to decide what to predict next.

### The idea

For every word, we compute three vectors by multiplying its embedding
by three learned weight matrices:

- **Query (Q)** — "what am I looking for?"
- **Key (K)** — "what do I contain?"
- **Value (V)** — "what information do I actually offer?"

```
Q = X * Wq
K = X * Wk
V = X * Wv
```

Then, for every pair of words, we compute a **similarity score** by
taking the dot product of one word's Query with another word's Key:

```
scores = Q * K^T
```

A higher score means "this word's query matches that word's key well
— pay attention to it." We scale the scores down (divide by
`sqrt(dModel)`) purely to keep the numbers in a stable range before
softmax — without this, scores can grow large as the embedding size
grows, making softmax saturate into an almost one-hot distribution
too early (see "Vanishing Gradients" below).

```
scaled_scores = scores / sqrt(dModel)
```

### The causal mask

Since we're predicting the *next* word, a word must not be allowed to
"peek" at words that come after it. We enforce this by setting every
score where `column > row` to `-Infinity` *before* the softmax — since
`exp(-Infinity) = 0`, those positions get exactly zero attention
weight.

```
for row i, column j:
    if j > i: scaled_scores[i][j] = -Infinity
```

### Turning scores into a weighted average

```
attention_weights = softmax(scaled_scores)   (row-wise)
context = attention_weights * V
output = context * Wo
```

Each word's output is now a *weighted average* of every earlier word's
Value vector, where the weights come from how relevant each earlier
word's Key was to this word's Query.

### Fully worked mini-example

Say `dModel = 2`, and we have 2 words with embeddings:

```
X = [[1, 0],      (word A)
     [0, 1]]      (word B)
```

Suppose (after some training) `Wq = Wk = Wv = identity matrix`
(`[[1,0],[0,1]]`), so `Q = K = V = X`.

```
scores = Q * K^T = [[1,0],[0,1]] * [[1,0],[0,1]]^T = [[1,0],[0,1]]
scaled = scores / sqrt(2) = [[0.707, 0], [0, 0.707]]
```

Apply the causal mask (word A, row 0, can only see itself; word B, row
1, can see both):

```
masked = [[0.707, -Infinity],
          [0,      0.707]]
```

Softmax each row:

```
row 0: softmax([0.707, -Inf]) = [1.0, 0.0]   (word A can only attend to itself)
row 1: softmax([0, 0.707])    = [0.330, 0.670]
```

`context = attention_weights * V`:

```
context row 0 = 1.0 * [1,0] + 0.0 * [0,1] = [1, 0]
context row 1 = 0.330 * [1,0] + 0.670 * [0,1] = [0.330, 0.670]
```

Word B's final representation is now a blend of both words — this is
attention actually "attending."

Code: `src/layers/selfAttention.js`.

---

## 7. Layer Normalization

Layer norm rescales each word's vector (independently) to have mean 0
and variance 1 across its own features, then applies a learned scale
(`gamma`) and shift (`beta`):

```
mean = average of the row's values
variance = average of (value - mean)^2
xhat = (value - mean) / sqrt(variance + epsilon)
output = gamma * xhat + beta
```

`epsilon` is a tiny constant (`1e-5`) purely to avoid dividing by zero
if variance happens to be exactly 0.

### Worked example

Row `[1, 2, 3, 4]`, `gamma = 1`, `beta = 0`:

```
mean = (1+2+3+4)/4 = 2.5
variance = ((1-2.5)^2 + (2-2.5)^2 + (3-2.5)^2 + (4-2.5)^2)/4
         = (2.25 + 0.25 + 0.25 + 2.25)/4 = 1.25
std = sqrt(1.25 + 1e-5) ≈ 1.118

xhat = [(1-2.5)/1.118, (2-2.5)/1.118, (3-2.5)/1.118, (4-2.5)/1.118]
     ≈ [-1.342, -0.447, 0.447, 1.342]
```

The output (since gamma=1, beta=0) is just `xhat`. Notice it now has
mean ≈ 0 and spread of about 1 — regardless of the original row's
scale. This keeps numbers well-behaved as they pass through many
stacked layers.

### Pre-Norm vs Post-Norm

The original 2017 "Attention Is All You Need" transformer applied
LayerNorm *after* each residual addition ("post-norm"). Modern models
(GPT-2 and later) apply it *before* each sub-layer instead
("pre-norm"):

```
Post-norm:  out = LayerNorm(X + SubLayer(X))
Pre-norm:   out = X + SubLayer(LayerNorm(X))
```

This project uses **pre-norm**. The reason matters enough to be worth
explaining: in post-norm, EVERY path from input to output passes
through a LayerNorm, which normalizes away the magnitude of whatever
signal it receives. During development of this project, we actually
hit this exact issue (documented in development.md) — with post-norm,
loss got stuck because the network had no way to produce a
confidently-scaled output. Pre-norm keeps one path (the residual/skip
connection) completely un-normalized, so magnitude information can
always flow through untouched, all the way to the output layer.

Code: `src/layers/layerNorm.js`, `src/layers/transformerBlock.js`.

---

## 8. Residual ("Skip") Connections

Instead of `output = SubLayer(X)`, we compute:

```
output = X + SubLayer(X)
```

The sub-layer only has to learn the *difference* (the "residual")
between its input and its ideal output, rather than reconstructing the
entire input from scratch. It also gives gradients a direct, unimpeded
path backward through addition (see "Backpropagation" below — the
gradient of a `+` is just copied to both branches).

---

## 9. Cross-Entropy Loss

This measures how wrong the model's predicted probability distribution
is, compared to the actual correct next word.

```
loss = -log( predicted_probability_of_the_correct_word )
```

### Worked example

If the model assigns probability `0.8` to the correct next word:

```
loss = -log(0.8) ≈ 0.223   (low loss = good, confident and correct)
```

If it only assigns probability `0.05` to the correct word:

```
loss = -log(0.05) ≈ 2.996   (high loss = bad, confidently wrong)
```

We average this over every position in the sequence to get one number
representing "how good was this whole prediction."

### The combined softmax + cross-entropy gradient

The gradient of this loss with respect to the RAW logits (before
softmax) has a famously clean form:

```
dLoss/dLogit_j = predicted_probability_j - (1 if j is the correct word else 0)
```

### Worked example

3 possible words, model predicted `[0.7, 0.2, 0.1]`, correct word was
word index 1:

```
target one-hot = [0, 1, 0]
gradient = [0.7 - 0, 0.2 - 1, 0.1 - 0] = [0.7, -0.8, 0.1]
```

The negative value at index 1 tells gradient descent "increase this
probability"; the positive values elsewhere say "decrease these."

Code: `src/loss.js`.

---

## 10. Backpropagation (The Chain Rule)

Backpropagation is just repeated application of the calculus **chain
rule**: if `loss` depends on `y`, and `y` depends on `x`, then:

```
dLoss/dx = dLoss/dy * dy/dx
```

We compute this working **backward** through the network, one layer at
a time, because each layer only needs to know two things: the gradient
flowing IN from the layer after it, and its own local derivative.

### Example: Dense layer backward pass

Forward: `output = X * W + b`. Given the upstream gradient `dOut` (how
much the loss changes per unit change in `output`), the chain rule
gives us:

```
dW = X^T * dOut       (how much the loss changes per unit change in W)
db = sum of dOut's rows
dX = dOut * W^T        (gradient to keep passing backward)
```

These three lines (implemented in `src/layers/dense.js`) are literally
the entire "learning" mechanism for a dense layer — everything else is
using these gradients to nudge the weights.

### Example: Addition backward pass (why residuals help)

Forward: `out = A + B`. Since `d(A+B)/dA = 1` and `d(A+B)/dB = 1`, the
gradient is simply copied, unchanged, to BOTH `A` and `B`:

```
dA = dOut
dB = dOut
```

This is why residual connections are so helpful for gradient flow —
addition never shrinks or distorts the gradient passing through it.

### Verifying backprop: numerical gradient checking

How do we know our hand-derived backward-pass formulas are actually
correct? We check them **numerically**. The definition of a derivative
is:

```
df/dx ≈ ( f(x + epsilon) - f(x - epsilon) ) / (2 * epsilon)
```

So for any single weight, we can: nudge it up slightly, measure the
loss; nudge it down slightly, measure the loss; the difference (scaled
appropriately) approximates the true gradient. We then compare that
number to what our analytical `backward()` code computed. This project
includes `test/gradcheck.js`, which does exactly this for every layer
and confirms the two match to within a tiny relative error — this is
the standard way any neural network library validates its own math.

---

## 11. Gradient Descent & the Adam Optimizer

Once we know the gradient (which direction increases the loss), we
move every parameter a small step in the OPPOSITE direction:

```
weight = weight - learning_rate * gradient
```

This is plain **gradient descent**. This project instead uses
**Adam**, which additionally tracks a running average of the gradient
(`m`, momentum) and of the *squared* gradient (`v`), and uses them to
adapt the effective step size per-parameter:

```
m = beta1 * m + (1 - beta1) * gradient
v = beta2 * v + (1 - beta2) * gradient^2

m_hat = m / (1 - beta1^t)      (bias correction for early steps)
v_hat = v / (1 - beta2^t)

weight = weight - learning_rate * m_hat / (sqrt(v_hat) + epsilon)
```

Typical values (used in this project): `beta1 = 0.9`, `beta2 = 0.999`,
`epsilon = 1e-8`. `t` is the step number, starting at 1.

Intuition: `v` estimates how large/noisy each parameter's gradients
have recently been. Dividing by `sqrt(v_hat)` means parameters with
consistently small gradients get a *relatively bigger* nudge, and
parameters with wildly large gradients get a *relatively smaller* one
— this is why Adam tends to train faster and more reliably than plain
gradient descent, especially on small/noisy datasets like ours.

Code: `src/optimizer.js`.

---

## 12. Vanishing Gradients & Gradient Clipping

While building this project, we ran into a real, textbook example of
a **vanishing gradient**: when self-attention's scores get large, the
softmax output saturates toward a "hard" one-hot distribution (e.g.
`[0.9999, 0.0001, ...]` instead of a soft blend). Look at the softmax
backward formula:

```
dInput_j = output_j * (dOutput_j - sum_k(dOutput_k * output_k))
```

If `output_j` is essentially 0 or 1 for every `j`, this expression
collapses to (almost) exactly zero for every entry — the gradient
vanishes, and that layer effectively stops learning, no matter how
many more training steps you run.

**Gradient clipping** helps prevent this from happening in the first
place: before every optimizer step, we compute the combined size
("L2 norm") of every gradient across the whole model:

```
norm = sqrt( sum of every_gradient_value^2 )
```

If `norm` exceeds some maximum (we use `5.0`), we shrink every
gradient by the same proportion so the new norm equals exactly the
maximum:

```
if norm > maxNorm:
    scale = maxNorm / norm
    every_gradient *= scale
```

This keeps any single training step from being so large that it
suddenly pushes attention scores into the saturated, zero-gradient
regime.

Code: `clipGradients()` in `src/optimizer.js`.

---

## 13. Autoregressive Generation (Chatting)

"Autoregressive" means: predict one word, then feed your OWN
prediction back in as part of the input to predict the next one, and
repeat.

```
sequence = [<BOS>, ...user's words, <SEP>]
repeat until <EOS> or max length:
    logits = model.forward(sequence)
    probs = softmax(logits' last row)
    next_word = sample_from(probs)
    sequence = sequence + [next_word]
```

### Temperature sampling

Rather than always picking the single highest-probability word
(which tends to make replies repetitive and identical every time), we
usually **sample** — pick randomly, weighted by probability. A
"temperature" controls how sharp or flat that weighting is:

```
adjusted_probability_i = probability_i ^ (1 / temperature)
(then renormalize so they sum to 1 again)
```

- `temperature = 1.0`: unchanged — sample exactly from the model's
  own distribution
- `temperature < 1.0` (e.g. `0.5`): sharpens the distribution — makes
  likely words even more likely, reduces randomness
- `temperature > 1.0`: flattens the distribution — increases
  randomness/creativity, but also increases nonsense

### Worked example

Probabilities `[0.7, 0.2, 0.1]`, `temperature = 0.5` (so exponent =
`1/0.5 = 2`):

```
adjusted = [0.7^2, 0.2^2, 0.1^2] = [0.49, 0.04, 0.01]
sum = 0.54
normalized = [0.907, 0.074, 0.019]
```

Notice the top choice went from 70% likely to 90.7% likely — lowering
the temperature made the model MORE confident/predictable.

Code: `sampleFromDistribution()` in `chat.js`.
