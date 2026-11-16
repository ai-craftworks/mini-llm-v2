/**
 * layerNorm.js
 * ------------
 * Layer normalization re-centers and re-scales each token's vector so
 * it has mean 0 and variance 1 across its own features, then applies
 * a learned per-feature scale (gamma) and shift (beta). This keeps
 * numbers well-behaved as they flow through many stacked layers.
 *
 * See math.md -> "Layer Normalization".
 */

const Matrix = require("../matrix");

class LayerNorm {
  constructor(dModel, eps = 1e-5) {
    this.dModel = dModel;
    this.eps = eps;
    this.gamma = new Matrix(1, dModel, [new Array(dModel).fill(1)]);
    this.beta = Matrix.zeros(1, dModel);
    this.dGamma = Matrix.zeros(1, dModel);
    this.dBeta = Matrix.zeros(1, dModel);
  }

  forward(X) {
    const n = X.rows;
    const d = X.cols;
    this.mean = new Array(n);
    this.variance = new Array(n);
    this.xhat = new Matrix(n, d);
    const out = new Matrix(n, d);

    for (let i = 0; i < n; i++) {
      let mean = 0;
      for (let j = 0; j < d; j++) mean += X.data[i][j];
      mean /= d;

      let variance = 0;
      for (let j = 0; j < d; j++) variance += (X.data[i][j] - mean) ** 2;
      variance /= d;

      this.mean[i] = mean;
      this.variance[i] = variance;
      const std = Math.sqrt(variance + this.eps);

      for (let j = 0; j < d; j++) {
        const xhat = (X.data[i][j] - mean) / std;
        this.xhat.data[i][j] = xhat;
        out.data[i][j] = this.gamma.data[0][j] * xhat + this.beta.data[0][j];
      }
    }
    return out;
  }

  backward(dOut) {
    const n = dOut.rows;
    const d = dOut.cols;
    const dX = new Matrix(n, d);
    const dGamma = Matrix.zeros(1, d);
    const dBeta = Matrix.zeros(1, d);

    for (let i = 0; i < n; i++) {
      const std = Math.sqrt(this.variance[i] + this.eps);
      const dxhat = new Array(d);

      for (let j = 0; j < d; j++) {
        dxhat[j] = dOut.data[i][j] * this.gamma.data[0][j];
        dGamma.data[0][j] += dOut.data[i][j] * this.xhat.data[i][j];
        dBeta.data[0][j] += dOut.data[i][j];
      }

      let sumDxhat = 0;
      let sumDxhatXhat = 0;
      for (let j = 0; j < d; j++) {
        sumDxhat += dxhat[j];
        sumDxhatXhat += dxhat[j] * this.xhat.data[i][j];
      }

      for (let j = 0; j < d; j++) {
        dX.data[i][j] =
          (1 / (d * std)) *
          (d * dxhat[j] - sumDxhat - this.xhat.data[i][j] * sumDxhatXhat);
      }
    }
    this.dGamma.copyFrom(dGamma);
    this.dBeta.copyFrom(dBeta);
    return dX;
  }

  getParams() {
    return [
      { matrix: this.gamma, grad: this.dGamma },
      { matrix: this.beta, grad: this.dBeta },
    ];
  }
}

module.exports = LayerNorm;
