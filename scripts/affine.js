import SymbolicAnalysis from '../dist/SymbolicAnalysis.js';

// --- TEST SUITE ---
const tests = [
    // Affine Cases
    { expr: "i + 1", expected: false },
    { expr: "n - 1", expected: false },
    { expr: "2 * i + j", expected: false },
    { expr: "i + j + n + 10", expected: false },
    
    // Non-Affine Cases
    { expr: "i * j", expected: true, reason: "Variable multiplication" },
    { expr: "n * i", expected: true, reason: "Parameter * Iterator (Strict check)" },
    { expr: "rowstr(i)", expected: true, reason: "Function call" },
    { expr: "i ^ 2", expected: true, reason: "Power operator" },
    { expr: "10 / i", expected: true, reason: "Division by variable" },
    { expr: "i * j + n", expected: true, reason: "Mixed affine/non-affine" },
    { expr: "abs(i - j)", expected: true, reason: "Intrinsic function" }
];

console.log("Running Affine Analysis Tests...\n");
console.log("------------------------------------------------------------");
console.log(`${"Expression".padEnd(20)} | ${"Non-Affine?".padEnd(12)} | ${"Status"}`);
console.log("------------------------------------------------------------");

tests.forEach(t => {
    const result = SymbolicAnalysis.isNonAffine(t.expr, ['i', 'j']);
    const status = result === t.expected ? "✅ PASS" : "❌ FAIL";
    
    console.log(
        `${t.expr.padEnd(20)} | ${result.toString().padEnd(12)} | ${status} ${!t.expected && result ? "(" + t.reason + ")" : ""}`
    );
});