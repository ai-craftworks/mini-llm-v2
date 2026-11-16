/**
 * matrix.js
 * ---------
 * A from-scratch 2D Matrix class. Every number that flows through our
 * neural network (inputs, weights, activations, gradients) is stored
 * and manipulated as a Matrix. No external math library is used.
 *
 * A Matrix is just an array of rows, where each row is an array of numbers:
 *   [[1, 2, 3],
 *    [4, 5, 6]]   <-- a 2x3 matrix (2 rows, 3 columns)
 *
 * See math.md for the mathematical explanation of every operation here.
 */

class Matrix {
  // The random-number source used by Matrix.random(). Defaults to Math.random;
  // swap it for a seeded generator (see src/util/random.js) to make training reproducible.
  static rng = Math.random;

  constructor(rows, cols, data = null) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      this.data = data;
    } else {
      this.data = [];
      for (let i = 0; i < rows; i++) {
        this.data.push(new Array(cols).fill(0));
      }
    }
  }

  // ---- Construction helpers ----

  static zeros(rows, cols) {
    return new Matrix(rows, cols);
  }

  static random(rows, cols, scale = 0.1) {
    const m = new Matrix(rows, cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        // uniform in [-scale, scale]
        m.data[i][j] = (Matrix.rng() * 2 - 1) * scale;
      }
    }
    return m;
  }

  static fromArray2D(arr) {
    const rows = arr.length;
    const cols = arr[0].length;
    return new Matrix(rows, cols, arr.map((row) => row.slice()));
  }

  static fromRowVector(arr) {
    return new Matrix(1, arr.length, [arr.slice()]);
  }

  clone() {
    return new Matrix(this.rows, this.cols, this.data.map((row) => row.slice()));
  }

  // Overwrite this matrix's contents with another matrix's contents,
  // WITHOUT changing this matrix's own object identity. This matters
  // because other code (like the optimizer) may be holding a reference
  // to this exact object — reassigning `this.dW = newMatrix` elsewhere
  // would silently break that reference. copyFrom() keeps the same
  // object alive and just updates what's inside it.
  copyFrom(other) {
    this.rows = other.rows;
    this.cols = other.cols;
    this.data = other.data;
    return this;
  }

  toArray() {
    return this.data.map((row) => row.slice());
  }

  // ---- Core operations ----

  static multiply(a, b) {
    if (a.cols !== b.rows) {
      throw new Error(
        `Matrix multiply shape mismatch: (${a.rows}x${a.cols}) x (${b.rows}x${b.cols})`
      );
    }
    const result = new Matrix(a.rows, b.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let k = 0; k < a.cols; k++) {
        const aVal = a.data[i][k];
        if (aVal === 0) continue; // small speed win, harmless
        const bRow = b.data[k];
        const rRow = result.data[i];
        for (let j = 0; j < b.cols; j++) {
          rRow[j] += aVal * bRow[j];
        }
      }
    }
    return result;
  }

  static add(a, b) {
    // Supports element-wise add, or broadcasting a (1 x cols) row vector
    // across every row of a (rows x cols) matrix.
    if (a.rows === b.rows && a.cols === b.cols) {
      const result = new Matrix(a.rows, a.cols);
      for (let i = 0; i < a.rows; i++) {
        for (let j = 0; j < a.cols; j++) {
          result.data[i][j] = a.data[i][j] + b.data[i][j];
        }
      }
      return result;
    }
    if (b.rows === 1 && b.cols === a.cols) {
      const result = new Matrix(a.rows, a.cols);
      for (let i = 0; i < a.rows; i++) {
        for (let j = 0; j < a.cols; j++) {
          result.data[i][j] = a.data[i][j] + b.data[0][j];
        }
      }
      return result;
    }
    throw new Error(
      `Matrix add shape mismatch: (${a.rows}x${a.cols}) + (${b.rows}x${b.cols})`
    );
  }

  static subtract(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error(
        `Matrix subtract shape mismatch: (${a.rows}x${a.cols}) - (${b.rows}x${b.cols})`
      );
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] - b.data[i][j];
      }
    }
    return result;
  }

  static hadamard(a, b) {
    // element-wise multiply
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error(
        `Matrix hadamard shape mismatch: (${a.rows}x${a.cols}) .* (${b.rows}x${b.cols})`
      );
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] * b.data[i][j];
      }
    }
    return result;
  }

  static transpose(a) {
    const result = new Matrix(a.cols, a.rows);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[j][i] = a.data[i][j];
      }
    }
    return result;
  }

  static scale(a, scalar) {
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] * scalar;
      }
    }
    return result;
  }

  map(fn) {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j], i, j);
      }
    }
    return result;
  }

  sumRows() {
    // returns 1 x cols matrix, summing down each column
    const result = new Matrix(1, this.cols);
    for (let j = 0; j < this.cols; j++) {
      let s = 0;
      for (let i = 0; i < this.rows; i++) s += this.data[i][j];
      result.data[0][j] = s;
    }
    return result;
  }

  print(label = "") {
    if (label) console.log(label);
    console.log(this.data.map((r) => r.map((v) => v.toFixed(4))));
  }
}

module.exports = Matrix;
