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
}