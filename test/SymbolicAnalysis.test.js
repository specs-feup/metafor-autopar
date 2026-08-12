import assert from "node:assert/strict";
import { describe, it } from "node:test";

import SymbolicAnalysis from "../dist/SymbolicAnalysis.js";

describe("SymbolicAnalysis.isNonAffine", () => {
  it("accepts affine expressions", () => {
    assert.equal(SymbolicAnalysis.isNonAffine("2 * i + n - 3", ["i"]), false);
    assert.equal(SymbolicAnalysis.isNonAffine("(i + j) / 2", ["i", "j"]), false);
  });

  it("rejects products of symbols", () => {
    assert.equal(SymbolicAnalysis.isNonAffine("i * j + 1", ["i", "j"]), true);
  });

  it("rejects function calls and symbolic divisors", () => {
    assert.equal(SymbolicAnalysis.isNonAffine("sin(i)", ["i"]), true);
    assert.equal(SymbolicAnalysis.isNonAffine("i / n", ["i"]), true);
  });
});

describe("SymbolicAnalysis.getISLReadyCondition", () => {
  it("converts Fortran comparison operators to ISL syntax", () => {
    const condition = SymbolicAnalysis.getISLReadyCondition("i .eq. n");

    assert.equal(condition, "i = n");
  });

  it("accepts affine compound conditions", () => {
    const condition = SymbolicAnalysis.getISLReadyCondition(
      "i .ge. 1 .and. i .le. n",
    );

    assert.notEqual(condition, null);
    assert.match(condition, /i >= 1/);
    assert.match(condition, /i <= n/);
    assert.match(condition, /and/);
  });

  it("returns null for non-affine and invalid conditions", () => {
    assert.equal(SymbolicAnalysis.getISLReadyCondition("i * n .gt. 0"), null);
    assert.equal(SymbolicAnalysis.getISLReadyCondition("i .gt."), null);
  });
});
