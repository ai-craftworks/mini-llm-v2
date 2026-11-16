# matrix.md — The Matrix Class, Explained Like You're 5 (and then like you're a grown-up)

This document explains **one single file**: `src/matrix.js` from the
Mini LLM project. It covers:

- What a matrix even *is*, in the simplest possible terms
- Every notation/symbol used, explained in plain words
- Every method the `Matrix` class has — what you give it (input), what
  you get back (output), the math formula behind it, and a
  hand-checkable worked example
- Step-by-step walkthroughs you could redo yourself with pen and paper

---

## Part 1: What is a Matrix? (Explain Like I'm 5)

Imagine a grid of boxes, like a mini crossword puzzle or a seating
chart at school. Each box holds one number.

```
┌───┬───┬───┐
│ 1 │ 2 │ 3 │   <- row 0 (the first row of seats)
├───┼───┼───┤
│ 4 │ 5 │ 6 │   <- row 1 (the second row of seats)
└───┴───┴───┘
  ↑   ↑   ↑
 col0 col1 col2
```

That grid is a **matrix**. That's it. That's the whole idea.

- A **row** is one horizontal line of boxes (like one row of chairs).
- A **column** is one vertical line of boxes (like one line of chairs
  going front-to-back).
- We say this grid is "**2 x 3**" (read: "2 by 3") because it has
  **2 rows** and **3 columns**. The row count always comes first.

To find one specific box, you say which row and which column, like
giving directions: "row 1, column 2" points at the number `6` above.
In code and math we start counting from **0**, not 1 (this is called
"0-indexing" — very common in programming), so:

- `data[0][0]` = the box in row 0, column 0 = `1`
- `data[1][2]` = the box in row 1, column 2 = `6`

### Why do we even need this?

In this project, a neural network works with *lists of numbers*
representing words, weights, and calculations. A **single row** of
numbers is called a **vector**. When you stack many vectors on top of
each other (like stacking many sentences' worth of word-vectors), you
get a **matrix**. It's simply a tidy, organized way to store and do
math on LOTS of numbers at once, instead of one at a time.

For example, the word "hi" might be represented as the vector
`[0.2, -0.5, 0.1]` (3 numbers describing it). If we also have the word
"there" as `[0.4, 0.1, -0.2]`, we can stack them into one matrix:

```
[[0.2, -0.5,  0.1],      <- "hi"
 [0.4,  0.1, -0.2]]      <- "there"
```

This is a 2x3 matrix: 2 words (rows), 3 numbers per word (columns).

---

## Part 2: Notation Cheat-Sheet

Before diving into the code, here's every symbol/word used throughout
this document, explained once so nothing is confusing later.

| Notation | Read it as | Meaning |
|---|---|---|
| `A`, `B`, `X` | "matrix A", "matrix B"... | A whole matrix, referred to by a capital letter |
| `rows` | "rows" | How many rows a matrix has (its height) |
| `cols` | "columns" | How many columns a matrix has (its width) |
| `n x m` | "n by m" | Shorthand for "n rows and m columns" |
| `A[i][j]` or `A.data[i][j]` | "A, row i, column j" | The single number sitting in row `i`, column `j` of matrix A |
| `i` | "i" | The row index (which row we're looking at). Always starts at 0. |
| `j` | "j" | The column index (which column we're looking at). Always starts at 0. |
| `k` | "k" | A "helper" index used only during multiplication (explained in Part 4) |
| `A^T` | "A transpose" | Matrix A with its rows and columns swapped |
| `scalar` | "scalar" | Just a single, plain number (like `5` or `-0.3`), as opposed to a whole matrix |
| `sum` | "sum" | Add a bunch of numbers together |
| `∈` | "in" / "belongs to" | Occasionally used to mean "is a member of" (not heavily used here, but you may see it in other math writing) |

That's genuinely all the notation you need. Nothing here uses
calculus, trigonometry, or anything scary — just grids of numbers and
the four operations you learned in grade school (add, subtract,
multiply, and organizing things).

---

## Part 3: The Matrix Class — Big Picture

The `Matrix` class lives in `src/matrix.js`. Every matrix object has
exactly three pieces of information:

```js
matrix.rows   // how many rows (a number, e.g. 2)
matrix.cols   // how many columns (a number, e.g. 3)
matrix.data   // the actual grid of numbers (an array of arrays)
```

`data` is stored as "an array of rows", where each row is itself an
array of numbers. So the 2x3 matrix from Part 1 is stored internally,
in real JavaScript, exactly like this:

```js
{
  rows: 2,
  cols: 3,
  data: [
    [0.2, -0.5,  0.1],
    [0.4,  0.1, -0.2]
  ]
}
```

The class has two kinds of methods:

1. **Static methods** — called on the *class itself*, like
   `Matrix.multiply(a, b)`. Think of these as "recipes that take
   matrices as ingredients and hand you a brand new matrix back."
   You'll recognize these because they're written `static` in the code
   and called with `Matrix.` in front.
2. **Instance methods** — called on a matrix you already have, like
   `myMatrix.clone()`. Think of these as "something a specific matrix
   can do to/with itself."

Below, every single method is documented in the order it appears in
the file.

---

## Part 4: The Constructor — `new Matrix(rows, cols, data)`

This is how you create a brand-new Matrix object from scratch.

### Inputs
| Parameter | Type | Required? | Meaning |
|---|---|---|---|
| `rows` | number | yes | How many rows the matrix should have |
| `cols` | number | yes | How many columns the matrix should have |
| `data` | array of arrays (or nothing) | no | The actual numbers to fill it with. If you don't provide this, it fills the matrix with all zeros. |

### Output
A new `Matrix` object with `.rows`, `.cols`, and `.data` set.

### How it works, step by step
1. Save `rows` and `cols` onto the object.
2. If you handed it `data`, just use that directly.
3. If you did NOT hand it `data`, build an empty grid: for each of the
   `rows` rows, create an array of `cols` zeros, and stack those rows
   up.

### Worked example

```js
const m = new Matrix(2, 3);
// m.data is now:
// [[0, 0, 0],
//  [0, 0, 0]]
```

```js
const m2 = new Matrix(2, 2, [[1, 2], [3, 4]]);
// m2.data is exactly:
// [[1, 2],
//  [3, 4]]
```

**ELI5:** It's like ordering an empty egg carton with `rows` x `cols`
slots. If you don't say what goes in each slot, every slot starts out
holding a `0`.

---

## Part 5: Construction Helpers

These are convenience methods for creating specific kinds of matrices
without writing the numbers out by hand.

### `Matrix.zeros(rows, cols)`

**Input:** `rows` (number), `cols` (number)
**Output:** a new Matrix, of size `rows x cols`, filled entirely with
`0`.

```js
Matrix.zeros(2, 2);
// [[0, 0],
//  [0, 0]]
```

**ELI5:** An empty egg carton — every slot is empty (zero).

Why do we need this? Neural networks need somewhere to start
collecting gradients (how much to change each weight) from zero, and
some matrices (like biases) legitimately START at zero. This is used
all over the rest of the project for exactly that purpose.

---

### `Matrix.random(rows, cols, scale = 0.1)`

**Input:**
| Parameter | Type | Required? | Meaning |
|---|---|---|---|
| `rows` | number | yes | Number of rows |
| `cols` | number | yes | Number of columns |
| `scale` | number | no (defaults to `0.1`) | How big the random numbers are allowed to be |

**Output:** a new Matrix of size `rows x cols`, filled with random
decimal numbers.

### The formula

For every single box in the grid:

```
value = (random number between 0 and 1, times 2, minus 1) * scale
```

Written more formally:

```
value_ij = (2 * r - 1) * scale        where r is a random number in [0, 1)
```

Why `(2r - 1)`? Because a plain random number `r` is always between 0
and 1. Multiplying by 2 stretches that to between 0 and 2. Subtracting
1 shifts it down to between **-1 and 1**. So `(2r - 1)` gives us a
random number that can be negative OR positive, evenly. Multiplying
that by `scale` shrinks (or grows) the range to whatever size we want
— e.g. `scale = 0.1` gives random numbers between -0.1 and 0.1.

### Worked example

```js
Matrix.random(2, 2, 0.1);
// Some possible real output (it's random, so it's different every time!):
// [[ 0.034, -0.081],
//  [-0.005,  0.092]]
```

Every value here is somewhere between -0.1 and 0.1, because we used
`scale = 0.1`.

**ELI5:** Imagine filling every box in the grid by rolling a special
die that can land anywhere between `-scale` and `+scale`, including
decimals. `Matrix.random` rolls that die once per box.

**Why do we need this?** When a neural network is first created, its
"weights" (the numbers it will learn and adjust) need to start at some
small random values — not all zero (that would make every neuron
behave identically and the network could never learn properly) and
not huge (that would make training unstable). `scale` controls how
big that initial randomness is.

---

### `Matrix.fromArray2D(arr)`

**Input:** `arr` — a plain JavaScript array of arrays, e.g.
`[[1, 2], [3, 4]]`
**Output:** a new Matrix built from that data.

### How it works
1. Count how many rows: `arr.length`
2. Count how many columns: the length of the first row, `arr[0].length`
3. Make a COPY of every row (using `.slice()`) so that changing the
   new Matrix later won't accidentally change your original array too

### Worked example

```js
const m = Matrix.fromArray2D([[1, 2], [3, 4]]);
// m.rows === 2
// m.cols === 2
// m.data === [[1, 2], [3, 4]]  (but it's a fresh copy, not the same array)
```

**ELI5:** You hand it a grid of numbers you already wrote down on
paper, and it photocopies that paper into an official `Matrix` object
so the rest of the class knows how to work with it.

---

### `Matrix.fromRowVector(arr)`

**Input:** `arr` — a plain, flat JavaScript array of numbers, e.g.
`[1, 2, 3]`
**Output:** a new Matrix with exactly **1 row** and as many columns as
the array has values.

### Worked example

```js
Matrix.fromRowVector([1, 2, 3]);
// rows: 1, cols: 3
// data: [[1, 2, 3]]
```

**ELI5:** You had a single line of numbers (not a grid). This just
wraps that single line in a 1-row "grid" so it can be used with all
the other Matrix methods, which expect grids, not flat lists.

---

## Part 6: Copying Methods

### `matrix.clone()`

**Input:** none (called on an existing matrix, e.g. `myMatrix.clone()`)
**Output:** a brand new Matrix with the exact same numbers, but
completely independent — changing the clone will NOT change the
original.

### Worked example

```js
const a = Matrix.fromArray2D([[1, 2]]);
const b = a.clone();
b.data[0][0] = 999;

console.log(a.data); // [[1, 2]]     <- unchanged!
console.log(b.data); // [[999, 2]]   <- only the clone changed
```

**ELI5:** Like photocopying a piece of paper. If you scribble on the
photocopy, the original page is untouched.

---

### `matrix.copyFrom(other)`

**Input:** `other` — another Matrix whose contents you want to copy
**Output:** returns `this` (the SAME object you called it on), but
now filled with `other`'s numbers.

This one is subtly different from `clone()`, and it matters a lot in
this project, so let's slow down.

- `clone()` makes a **brand new** object that's a copy.
- `copyFrom()` takes an **existing** object and stuffs new numbers
  into it, without ever creating a new object.

### Why does that difference matter?

Imagine you gave your friend a specific labeled box (let's call it
"Box A") to hold onto. Later, you want to update what's inside Box A.

- If you make a **new** box with the new contents and hand your
  friend the NEW box, your friend now has two different boxes lying
  around, and if anyone else was watching "Box A" specifically, they
  never see the update — they're still staring at the empty original.
- If you instead just **open up the original Box A and swap what's
  inside it**, your friend (and anyone else watching Box A) sees the
  update immediately, because it's still the same box.

In the code, some parts of the project (like the optimizer that
adjusts the network's learned numbers) hang onto a specific Matrix
object for a long time and keep reading from it every step. If some
other code accidentally replaced that object entirely instead of
updating its insides, the optimizer would keep reading stale, outdated
numbers forever. `copyFrom()` exists specifically to avoid that trap:
it updates the insides of a matrix while keeping it "the same box."

### Worked example

```js
const a = Matrix.zeros(1, 2);       // a.data = [[0, 0]]
const b = Matrix.fromArray2D([[5, 6]]);

a.copyFrom(b);
console.log(a.data);   // [[5, 6]]  <- a's insides changed
console.log(a === a);  // still the exact same object as before, just updated
```

---

### `matrix.toArray()`

**Input:** none
**Output:** a plain JavaScript array of arrays (a copy) — the same
numbers, but stripped out of the `Matrix` wrapper, as ordinary
arrays-of-arrays.

### Worked example

```js
const m = Matrix.fromArray2D([[1, 2], [3, 4]]);
m.toArray();
// [[1, 2], [3, 4]]   <- a plain array, not a Matrix object
```

**ELI5:** Takes the numbers out of their organized "Matrix folder" and
just hands you the loose papers, in case you want to use them with
regular JavaScript instead of Matrix methods.

---

## Part 7: Core Math Operations

This is the heart of the whole class. Every operation below takes one
or two matrices in, and gives you a brand new matrix back (none of
these change your original matrices — they always create a fresh
result).

### `Matrix.multiply(a, b)` — Matrix Multiplication

This is the single most important, most-used operation in the entire
project.

**Input:** two matrices, `a` and `b`
**Output:** a new matrix — the "matrix product" of `a` and `b`

### The rule about sizes (this trips everyone up at first!)

You can only multiply matrix `a` (size `n x m`) by matrix `b` if `b`
has EXACTLY `m` rows (that is, `a`'s number of *columns* must match
`b`'s number of *rows*). If `b` is size `m x p`, the result will be
size `n x p`.

```
(n x m)  *  (m x p)  =  (n x p)
   ↑ must match ↑
```

If the sizes don't match, the code throws an error rather than
silently giving you a wrong answer — that's on purpose, since a silent
wrong-size result is much harder to debug than an immediate clear
error.

### The formula

For every position `(i, j)` in the result:

```
result[i][j] = sum over k of ( a[i][k] * b[k][j] )
```

**In plain English:** to fill in one box of the answer, you walk ALONG
row `i` of `a` and DOWN column `j` of `b` **at the same time**,
multiplying matching pairs together, and adding up all those little
products into one final number.

### ELI5 version

Imagine row `i` of matrix `a` is a shopping list of "how many of each
fruit you're buying": `[2 apples, 3 bananas]`.

Imagine column `j` of matrix `b` is a price list: `[apple costs 5,
banana costs 4]`.

To get "how much money did I spend," you do:
`(2 apples * 5 each) + (3 bananas * 4 each) = 10 + 12 = 22`

That's exactly the formula above! Each entry of the output matrix is
one of these "total cost" calculations, just for a different row/price
list pairing.

### Step-by-step worked example

```
A (2x2)        B (2x2)
[1, 2]         [5, 6]
[3, 4]         [7, 8]
```

Both matrices are 2x2, so `A.cols (2) === B.rows (2)` ✓ — we're
allowed to multiply them. The result will be `2 x 2`.

**Finding result[0][0]** (row 0 of A, column 0 of B):
```
= A[0][0]*B[0][0] + A[0][1]*B[1][0]
= (1 * 5)         + (2 * 7)
= 5 + 14 = 19
```

**Finding result[0][1]** (row 0 of A, column 1 of B):
```
= A[0][0]*B[0][1] + A[0][1]*B[1][1]
= (1 * 6)         + (2 * 8)
= 6 + 16 = 22
```

**Finding result[1][0]** (row 1 of A, column 0 of B):
```
= A[1][0]*B[0][0] + A[1][1]*B[1][0]
= (3 * 5)         + (4 * 7)
= 15 + 28 = 43
```

**Finding result[1][1]** (row 1 of A, column 1 of B):
```
= A[1][0]*B[0][1] + A[1][1]*B[1][1]
= (3 * 6)         + (4 * 8)
= 18 + 32 = 50
```

**Final answer:**
```
A * B = [[19, 22],
         [43, 50]]
```

```js
const A = Matrix.fromArray2D([[1, 2], [3, 4]]);
const B = Matrix.fromArray2D([[5, 6], [7, 8]]);
Matrix.multiply(A, B).data;
// [[19, 22], [43, 50]]   <- matches our hand calculation exactly!
```

### A note about the code's `k` variable

In the formula `result[i][j] = sum over k of (a[i][k] * b[k][j])`, `k`
is just a counter that walks across row `i` of `a` AND down column `j`
of `b` at the same time, one step at a time, adding as it goes. It's
not a "real" row or column of the answer — it only exists during the
calculation, as scratch-work. The code loops `i`, then `k`, then `j`
(in that specific order, for a small speed optimization), but the math
result is identical regardless of loop order.

---

### `Matrix.add(a, b)` — Addition

**Input:** two matrices, `a` and `b`
**Output:** a new matrix, same size as `a`, where each box is the sum
of the matching boxes in `a` and `b`

### The formula (simple case: same size)

```
result[i][j] = a[i][j] + b[i][j]
```

You just add each box to the box in the exact same position.

### Worked example

```
A = [[1, 2],      B = [[10, 20],
     [3, 4]]           [30, 40]]

A + B = [[1+10, 2+20],     = [[11, 22],
         [3+30, 4+40]]        [33, 44]]
```

### The special "broadcasting" case

There's a second thing `Matrix.add` can do: if `b` is only **1 row**
tall but has the SAME number of columns as `a`, it will add that one
row to **every single row** of `a`. This is called **broadcasting** —
"stretching" a smaller matrix to match a bigger one, instead of
requiring an exact size match.

### Worked example (broadcasting)

```
A (2x3) = [[1, 2, 3],
           [4, 5, 6]]

B (1x3) = [[100, 200, 300]]     <- just one row!

A + B = [[1+100, 2+200, 3+300],      = [[101, 202, 303],
         [4+100, 5+200, 6+300]]          [104, 205, 306]]
```

Notice `B`'s single row `[100, 200, 300]` got added to BOTH rows of
`A`.

**ELI5:** Imagine every student in a classroom (each row = one
student) gets the exact same bonus points added to their score (the
single row of `B` = "the bonus"). Everyone's own individual score
stays personal, but everyone gets the same flat bonus stacked on top.

**Why do we need this?** This is exactly how "bias" works in a neural
network layer — every single input gets the same learned bias values
added to it, regardless of which input it is. Broadcasting lets us
write that as one simple `Matrix.add` call instead of a manual loop.

If neither the "same size" nor the "one row matching columns" case
applies, the code throws a clear size-mismatch error instead of
guessing.

---

### `Matrix.subtract(a, b)` — Subtraction

**Input:** two matrices, `a` and `b`, that must be the EXACT same size
(no broadcasting here)
**Output:** a new matrix, same size, where each box is `a`'s box minus
`b`'s box

### The formula

```
result[i][j] = a[i][j] - b[i][j]
```

### Worked example

```
A = [[5, 8]]
B = [[2, 3]]

A - B = [[5-2, 8-3]] = [[3, 5]]
```

**ELI5:** Line up two grids of the same shape, and in each box, do
"top number minus bottom number."

---

### `Matrix.hadamard(a, b)` — Element-wise Multiplication

**Input:** two matrices, `a` and `b`, that must be the EXACT same size
**Output:** a new matrix, same size, where each box is `a`'s box
**times** `b`'s box (NOT the same thing as `Matrix.multiply`!)

### The formula

```
result[i][j] = a[i][j] * b[i][j]
```

### Worked example

```
A = [[2, 3],
     [4, 5]]
B = [[10, 10],
     [10, 10]]

A .* B = [[2*10, 3*10],
          [4*10, 5*10]]
        = [[20, 30],
           [40, 50]]
```

### Why does this need its own name, isn't it just "multiplying"?

This is genuinely one of the most common points of confusion when
learning matrices, so let's be very explicit:

- **`Matrix.multiply`** (true matrix multiplication) combines ROWS of
  one matrix with COLUMNS of another, summing products along the way.
  The two matrices don't even need to be the same size (as long as the
  inner sizes match) — and the RESULT can be a totally different
  shape than either input.
- **`Matrix.hadamard`** (element-wise multiplication, sometimes written
  `A ⊙ B` in math textbooks) simply multiplies box-by-box, in the SAME
  position, and both matrices MUST already be the same size. The
  result is always the same shape as the inputs.

**ELI5:** `Matrix.multiply` is like a recipe where ingredients from one
list get mixed and combined with ingredients from another list.
`Matrix.hadamard` is much simpler — it's like having two identical
ice-cube trays and just multiplying whatever's in each matching cube.

---

### `Matrix.transpose(a)` — Flip Rows and Columns

**Input:** one matrix, `a`
**Output:** a new matrix where every row of `a` becomes a column, and
every column of `a` becomes a row. If `a` was `n x m`, the result is
`m x n`.

### The formula

```
result[j][i] = a[i][j]
```

(notice `i` and `j` are swapped between the two sides!)

### Worked example

```
A (2x3) = [[1, 2, 3],
           [4, 5, 6]]

A^T (3x2) = [[1, 4],
             [2, 5],
             [3, 6]]
```

Check it: the first ROW of `A` was `[1, 2, 3]`. After transposing,
that same set of numbers `1, 2, 3` becomes the first COLUMN of `A^T`
(reading down: `1, 2, 3`). ✓

### ELI5

Imagine your matrix is a photo of a marching band standing in rows.
Transposing is like rotating the photo 90 degrees and re-grouping
everyone — the people who used to stand in a horizontal ROW together
are now standing in a vertical COLUMN together instead. Nobody's
values changed, just their arrangement.

**Why do we need this?** It shows up constantly in the surrounding
project's math — for example, to multiply two matrices "the other
way around," or because many backpropagation formulas specifically
need a transposed version of a matrix to make the sizes line up
correctly for `Matrix.multiply`.

---

### `Matrix.scale(a, scalar)` — Multiply Everything by One Number

**Input:** a matrix `a`, and a plain number `scalar`
**Output:** a new matrix, same size as `a`, where every box has been
multiplied by `scalar`

### The formula

```
result[i][j] = a[i][j] * scalar
```

### Worked example

```
A = [[1, 2],
     [3, 4]]

Matrix.scale(A, 10) = [[10, 20],
                        [30, 40]]
```

```
Matrix.scale(A, 0.5) = [[0.5, 1],
                         [1.5, 2]]
```

**ELI5:** Imagine every number in the grid gets photocopied at a
specific zoom level. `scalar = 10` makes everything 10 times bigger.
`scalar = 0.5` shrinks everything to half its size. `scalar = -1`
would flip every number's sign (positive becomes negative and vice
versa).

---

## Part 8: Flexible / Utility Operations

### `matrix.map(fn)` — Apply Any Function to Every Box

**Input:** `fn`, a function you provide, which will be called on every
single box. It receives 3 things: `(value, i, j)` — the current box's
number, its row index, and its column index.
**Output:** a new matrix, same size, where every box is
`fn(originalValue, i, j)`

### The formula

```
result[i][j] = fn( a[i][j], i, j )
```

### Worked example 1 — doubling every number

```js
const A = Matrix.fromArray2D([[1, 2], [3, 4]]);
A.map((value) => value * 2).data;
// [[2, 4], [6, 8]]
```

### Worked example 2 — a "ReLU"-style function (turn negatives into 0)

```js
const A = Matrix.fromArray2D([[-3, 5], [2, -1]]);
A.map((value) => (value > 0 ? value : 0)).data;
// [[0, 5], [2, 0]]
```

**ELI5:** Imagine you walk past every single box in the grid, one at a
time, and you apply the exact same little rule to whatever's inside
("double it," "if it's negative make it zero," etc.) — `map` is just
that walk, done automatically for you across the whole grid.

**Why do we need this?** `map` is how every "activation function"
(the non-linear rules that give a neural network its real thinking
power) gets applied across a whole matrix, without writing a manual
loop every single time.

---

### `matrix.sumRows()` — Add Each Column Down Into One Row

**Input:** none (called on an existing matrix)
**Output:** a new matrix with exactly **1 row** and the same number of
columns as the original — each entry is the total of that whole
column, added up.

### The formula

```
result[0][j] = sum over i of ( a[i][j] )
```

(This sums DOWN each column `j`, across every row `i`.)

### Worked example

```
A (3x2) = [[1, 2],
           [3, 4],
           [5, 6]]

sumRows(A):
  column 0 total: 1 + 3 + 5 = 9
  column 1 total: 2 + 4 + 6 = 12

result = [[9, 12]]     <- shape is 1x2
```

**ELI5:** Imagine 3 people each wrote down 2 numbers on a sticky note
and stacked their notes in a pile. `sumRows` reads down through the
whole pile and adds up "everyone's first number" into one total, and
"everyone's second number" into another total — giving you back just
ONE sticky note with those two totals on it.

**Why do we need this?** In this project, when many different inputs
all contributed error/gradient signal to a single shared "bias" value,
we need to add up everyone's contribution into one combined total —
exactly what `sumRows` does.

---

### `matrix.print(label = "")` — Debug Printing

**Input:** `label` — an optional piece of text to print above the
matrix, just to help you tell multiple printouts apart
**Output:** nothing returned — it just prints the matrix's numbers to
the console/terminal, each rounded to 4 decimal places, so you can
visually inspect it while debugging.

### Worked example

```js
const A = Matrix.fromArray2D([[1, 2.34567], [3, 4]]);
A.print("My matrix:");

// Console output:
// My matrix:
// [ [ '1.0000', '2.3457' ], [ '3.0000', '4.0000' ] ]
```

**ELI5:** It's like holding the grid up and reading the numbers out
loud so you (the programmer) can sanity-check what's actually inside
it while you're debugging — it doesn't change or return anything, it
just shows you.

---

## Part 9: Quick Reference Table

| Method | Static or instance? | Input | Output shape | One-line description |
|---|---|---|---|---|
| `new Matrix(rows, cols, data?)` | constructor | 2 numbers + optional data | `rows x cols` | Create a matrix, zero-filled unless you provide data |
| `Matrix.zeros(rows, cols)` | static | 2 numbers | `rows x cols` | All-zero matrix |
| `Matrix.random(rows, cols, scale?)` | static | 2 numbers + optional scale | `rows x cols` | Random values between `-scale` and `+scale` |
| `Matrix.fromArray2D(arr)` | static | array of arrays | same as `arr` | Wrap a plain 2D array as a Matrix |
| `Matrix.fromRowVector(arr)` | static | flat array | `1 x arr.length` | Wrap a flat array as a single-row Matrix |
| `matrix.clone()` | instance | none | same as original | Independent copy (new object) |
| `matrix.copyFrom(other)` | instance | another Matrix | same as `other` | Overwrite contents, keep the same object identity |
| `matrix.toArray()` | instance | none | plain array of arrays | Strip out the raw numbers |
| `Matrix.multiply(a, b)` | static | 2 matrices, `a.cols === b.rows` | `a.rows x b.cols` | True matrix multiplication |
| `Matrix.add(a, b)` | static | 2 matrices (same size, or `b` is 1 row) | same as `a` | Element-wise add (with broadcasting) |
| `Matrix.subtract(a, b)` | static | 2 matrices, same size | same as `a` | Element-wise subtract |
| `Matrix.hadamard(a, b)` | static | 2 matrices, same size | same as `a` | Element-wise multiply |
| `Matrix.transpose(a)` | static | 1 matrix | `a.cols x a.rows` | Flip rows and columns |
| `Matrix.scale(a, scalar)` | static | 1 matrix + 1 number | same as `a` | Multiply every box by a constant |
| `matrix.map(fn)` | instance | a function | same as original | Apply a custom function to every box |
| `matrix.sumRows()` | instance | none | `1 x cols` | Add each column down into one row |
| `matrix.print(label?)` | instance | optional text | (nothing returned) | Print the matrix for debugging |

---

## Part 10: Putting It All Together — One Bigger Example

Let's use several methods together, the way the rest of the project
actually does, so you can see the whole flow end to end.

Say we have 2 "words," each represented by a 3-number vector, and we
want to transform them using a small "weight" matrix (this is
literally what a neural network layer does).

```js
const Matrix = require("./src/matrix");

// Our 2 words, each with 3 features (a 2x3 matrix)
const X = Matrix.fromArray2D([
  [1, 0, 1],
  [0, 1, 1],
]);

// A small learned weight matrix (3 inputs -> 2 outputs, so 3x2)
const W = Matrix.fromArray2D([
  [0.5, -0.5],
  [1.0,  0.0],
  [0.5,  0.5],
]);

// A bias to add to every word's result (1x2, one value per output)
const b = Matrix.fromRowVector([0.1, 0.2]);

// Step 1: multiply inputs by weights
const step1 = Matrix.multiply(X, W);
// X is 2x3, W is 3x2, so X.cols (3) === W.rows (3) ✓ — allowed!
// Result is 2x2:
//   row 0: [1*0.5 + 0*1.0 + 1*0.5,  1*-0.5 + 0*0.0 + 1*0.5] = [1.0, 0.0]
//   row 1: [0*0.5 + 1*1.0 + 1*0.5,  0*-0.5 + 1*0.0 + 1*0.5] = [1.5, 0.5]
// step1.data = [[1.0, 0.0], [1.5, 0.5]]

// Step 2: add the bias (broadcast across both rows)
const step2 = Matrix.add(step1, b);
// [[1.0+0.1, 0.0+0.2], [1.5+0.1, 0.5+0.2]]
// = [[1.1, 0.2], [1.6, 0.7]]

step2.print("Final result:");
```

This 3-line pipeline — `multiply`, then `add` — is the exact core
computation behind every single "dense layer" in the rest of the
project. Once you're comfortable with these Matrix building blocks,
you already understand the fundamental mechanic behind how a neural
network transforms information.
