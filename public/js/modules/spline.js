// Add cubic spline implementation
class CubicSpline {
  constructor(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) {
      throw new Error("Cubic spline needs at least 2 points and equal-length arrays");
    }

    // Sort points by x if needed
    const points = xs.map((x, i) => ({ x, y: ys[i] })).sort((a, b) => a.x - b.x);
    this.xs = points.map(p => p.x);
    this.ys = points.map(p => p.y);

    const n = this.xs.length;

    // Build the tridiagonal system
    // h[i] = x[i+1] - x[i]
    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = this.xs[i + 1] - this.xs[i];
      if (h[i] <= 0) {
        throw new Error("Cubic spline needs strictly increasing x values");
      }
    }

    // alpha[i] = 3/h[i] * (y[i+1] - y[i]) - 3/h[i-1] * (y[i] - y[i-1])
    const alpha = new Array(n - 1).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = 3 / h[i] * (this.ys[i + 1] - this.ys[i]) -
                 3 / h[i - 1] * (this.ys[i] - this.ys[i - 1]);
    }

    // Solve the tridiagonal system
    // Initialize arrays
    this.c = new Array(n).fill(0);  // Natural boundary conditions: c[0] = c[n-1] = 0
    const l = new Array(n).fill(0);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);

    // Forward sweep
    l[0] = 1;
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (this.xs[i + 1] - this.xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n - 1] = 1;

    // Back substitution
    for (let j = n - 2; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
    }

    // Calculate the remaining coefficients
    this.b = new Array(n - 1);
    this.d = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
      this.b[i] = (this.ys[i + 1] - this.ys[i]) / h[i] -
                 h[i] * (this.c[i + 1] + 2 * this.c[i]) / 3;
      this.d[i] = (this.c[i + 1] - this.c[i]) / (3 * h[i]);
    }

    console.log("Cubic spline coefficients calculated");
  }

  // Evaluate spline at point x
  at(x) {
    // Handle out-of-range x values
    if (x <= this.xs[0]) return this.ys[0];
    if (x >= this.xs[this.xs.length - 1]) return this.ys[this.ys.length - 1];

    // Binary search to find the correct interval
    let i = 0;
    let j = this.xs.length - 1;

    while (j - i > 1) {
      const m = Math.floor((i + j) / 2);
      if (this.xs[m] > x) {
        j = m;
      } else {
        i = m;
      }
    }

    // Now xs[i] <= x < xs[i+1]
    const dx = x - this.xs[i];

    // Evaluate cubic polynomial
    return this.ys[i] +
           this.b[i] * dx +
           this.c[i] * dx * dx +
           this.d[i] * dx * dx * dx;
  }
}

export { CubicSpline }; 