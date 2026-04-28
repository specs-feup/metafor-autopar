import { parse, type MathNode, OperatorNode, SymbolNode, simplify } from 'mathjs';

export default class SymbolicAnalysis {
    public static isNonAffine(expression: string, iterators: string[]): boolean {
        const node = simplify(parse(expression));
        let nonAffineFound = false;

        node.traverse((child: MathNode) => {
            if (child.type === 'FunctionNode') {
                nonAffineFound = true;
            }

            if (child.type === 'OperatorNode') {
                const opNode = child as OperatorNode;

                // ISL only allows (Integer * Symbol). 
                // (Parameter * Parameter) or (Parameter * Iterator) is a syntax error.
                if (opNode.op === '*') {
                    const leftHasSymbol = opNode.args[0]!.filter(n => n.type === 'SymbolNode').length > 0;
                    const rightHasSymbol = opNode.args[1]!.filter(n => n.type === 'SymbolNode').length > 0;

                    // If both sides have symbols (parameters or iterators), ISL can't parse it
                    if (leftHasSymbol && rightHasSymbol) {
                        nonAffineFound = true;
                    }
                }

                if (opNode.op === '^' || opNode.op === '/') {
                    // Check if denominator or exponent contains symbols
                    const hasSymbols = opNode.args[1]!.filter(n => n.type === 'SymbolNode').length > 0;
                    if (hasSymbols) nonAffineFound = true;
                }
            }
        });

        return nonAffineFound;
    }

    private static fortranToMathJS(expression: string): string {
        return expression
            .replace(/\.and\./gi, ' and ')
            .replace(/\.or\./gi, ' or ')
            .replace(/\.not\./gi, ' not ')
            .replace(/\.eq\./gi, ' == ')
            .replace(/\.ne\./gi, ' != ')
            .replace(/\.gt\./gi, ' > ')
            .replace(/\.ge\./gi, ' >= ')
            .replace(/\.lt\./gi, ' < ')
            .replace(/\.le\./gi, ' <= ')
            .replace(/\*\*/g, '^')     // Power operator
            .replace(/\/=/g, ' != ')   // Alternative Fortran not equal
            .replace(/==/g, ' == ')    // Ensure spacing for ==
            .trim();
    }

    public static getISLReadyCondition(condition: string): string | null {
        // 1. Convert Fortran to MathJS compatible syntax (==, !=, etc.)
        const mathJSSyntax = this.fortranToMathJS(condition);
        
        try {
            const node = simplify(parse(mathJSSyntax));

            if (this.hasNonAffineTerms(node)) return null;

            return this.mathJSToISL(node.toString());
        } catch (e) {
            return null;
        }
    }

    private static mathJSToISL(simplifiedExpr: string): string {
        return simplifiedExpr
            .replace(/==/g, '=')
            .replace(/and/g, ' and ')
            .replace(/or/g, ' or ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private static hasNonAffineTerms(node: MathNode): boolean {
        let nonAffineFound = false;

        node.traverse((child: MathNode) => {
            // 1. Block function calls (sin(i), my_func(j))
            if (child.type === 'FunctionNode') {
                nonAffineFound = true;
            }

            if (child.type === 'OperatorNode') {
                const opNode = child as OperatorNode;

                // 2. Block Non-Linear Multiplication (i * j or n * i)
                // ISL only allows (Constant * Symbol)
                if (opNode.op === '*') {
                    const leftSymbols = opNode.args[0]!.filter(n => n.type === 'SymbolNode');
                    const rightSymbols = opNode.args[1]!.filter(n => n.type === 'SymbolNode');
                    
                    if (leftSymbols.length > 0 && rightSymbols.length > 0) {
                        nonAffineFound = true;
                    }
                }

                // 3. Block Symbolic Division/Powers (n / i or i ^ n)
                if (opNode.op === '^' || opNode.op === '/') {
                    const rightSymbols = opNode.args[1]!.filter(n => n.type === 'SymbolNode');
                    if (rightSymbols.length > 0) nonAffineFound = true;
                }
                
                // 4. Block Bitwise/Unsupported operators for ISL strings
                const unsupported = ['|', '&', '<<', '>>', '%'];
                if (unsupported.includes(opNode.op)) {
                    nonAffineFound = true;
                }
            }
        });

        return nonAffineFound;
    }
}