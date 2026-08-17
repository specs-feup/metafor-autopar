import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Statement, DoStatement, DataRef, Expr, RangeLoopControl, ActionStatement, AssignmentStatement, ArraySubscriptExpr, BinaryOperator, Joinpoint, IfStatement, IfConstruct, ProgramUnit, TypeDeclarationStatement, ParameterKeyword, ExprInitialization, IntLiteral } from "@specs-feup/metafor/api/Joinpoints.js";
import SymbolicAnalysis from "./SymbolicAnalysis.js";

interface AccessRelation {
    relation: string,
    variable: string,
}

interface Condition {
    expression: string,
    negated: boolean,
}

export default class ISLLoopBuilder {
    private domains: string[] = [];
    private schedules: string[] = [];
    private reads: AccessRelation[] = [];
    private writes: AccessRelation[] = [];
    private conditions: Map<string, Condition[]> = new Map();

    private parameters: string[] = [];
    private privates: string[] = [];
    private scalars: string[] = [];
    private stmts: Statement[] = [];

    private paramDecls: string[] = [];

    private jp: DoStatement;

    constructor(jp: DoStatement) {
        this.jp = jp;
        this.findParamDecls();
    }

    private findParamDecls() {
        const unit = this.jp.getAncestor("programUnit") as ProgramUnit;

        for (const decl of Query.searchFrom(unit.specification, TypeDeclarationStatement)) {
            if (decl.attrs.some(attr => attr instanceof ParameterKeyword)) {
                for (const entity of decl.decls) {
                    const init = Query.searchFrom(entity, ExprInitialization).first();

                    if (init && init.expr instanceof IntLiteral) {
                        const name = entity.name;
                        const value = init.expr.code.trim();

                        this.paramDecls.push(`${name} = ${value}`);
                    }
                }
            }
        }
    }

    private processLoopBound(bound: Expr, iterators: string[]): string {
        let rawCode = bound.code.trim();

        if (SymbolicAnalysis.isNonAffine(rawCode, iterators)) {
            const surrogate = "p_" + rawCode.replace(/[^a-zA-Z0-9]/g, '_');
            if (!this.parameters.includes(surrogate)) {
                this.parameters.push(surrogate);
            }
            return surrogate;
        }

        for (const ref of Query.searchFromInclusive(bound, DataRef)) {
            const code = ref.code.trim();
            if (!this.parameters.includes(code)) this.parameters.push(code);
        }
        return bound.code.trim();
    }

    private static loopIndexHelper(stmt: Statement, loop: DoStatement): number {
        let curr: any = stmt;

        while (curr.parent !== null && !curr.parent.equals(loop.body)) {
            curr = curr.parent;
        }

        return curr.indexOfSelf;
    }

    private static findNextInfoAncestor(stmt: Statement): DoStatement | IfConstruct {
        let curr: any = stmt;

        while (curr.parent !== null) {
            if (curr.parent instanceof DoStatement || curr.parent instanceof IfConstruct) {
                return curr.parent;
            }
            curr = curr.parent;
        }

        throw new Error(`[ISLLoopBuilder] No ancestor loop or if construct found for statement ${stmt.code}`);
    }

    private extractGuards(stmt: Statement, construct: IfConstruct, statementId: number) {
        if (construct.ifThenBlock.body.contains(stmt)) {
            this.extractCondition(construct.ifThenBlock.header.condition, statementId);
            return;
        }
        else {
            this.extractCondition(construct.ifThenBlock.header.condition, statementId, true);
        }

        for (const elseIf of construct.elseIfBlocks) {
            if (elseIf.body.contains(stmt)) {
                this.extractCondition(elseIf.header.condition, statementId);
                return;
            }
            else {
                this.extractCondition(elseIf.header.condition, statementId, true);
            }
        }
    }

    private extractLoopInfos(stmt: Statement, statementId: number): Array<{ var: string; lower: string; upper: string, index: number }> {
        let curr: DoStatement | IfConstruct | null = ISLLoopBuilder.findNextInfoAncestor(stmt);
        let prev = stmt;
        const res = [];
        const loops: DoStatement[] = [];
        const iterators: string[] = [];
        const indices: number[] = [];

        while (curr !== null) {
            if (curr instanceof DoStatement) {
                loops.unshift(curr);
                indices.push(ISLLoopBuilder.loopIndexHelper(prev, curr));
            }
            else if (curr instanceof IfConstruct) {
                this.extractGuards(stmt, curr, statementId);
            }
            
            if (curr.equals(this.jp)) break;
            prev = curr;
            curr = ISLLoopBuilder.findNextInfoAncestor(curr);
        }

        for (const loop of loops) {
            const control = loop.control as RangeLoopControl;
            const varName = control.var.code.trim();
            iterators.push(varName);
            const lower = this.processLoopBound(control.lower, iterators);
            const upper = this.processLoopBound(control.upper, iterators);

            if (!this.privates.includes(varName)) this.privates.push(varName);
            res.push({ var: varName, lower, upper , index: indices.pop()! });
        }

        return res;
    }

    private extractCondition(condition: Expr, statementId: number, negated: boolean = false) {
        const rawCond = condition.code.trim();
    
        const islReady = SymbolicAnalysis.getISLReadyCondition(rawCond);
        
        if (islReady) {
            const stmtName = ISLLoopBuilder.getStatementName(statementId);
            if (!this.conditions.has(stmtName)) {
                this.conditions.set(stmtName, []);
            }
            this.conditions.get(stmtName)!.push({expression: islReady, negated});
        }
    }

    public buildStatements() {
        const actionStmts = this.jp.descendants.filter(s => s instanceof ActionStatement);

        const stmtEntries = actionStmts.map((stmt, idx) => ({
            stmt,
            idx: idx+1,
            loopInfos: this.extractLoopInfos(stmt, idx+1)
        }));

        const maxDepth = Math.max(...stmtEntries.map(e => e.loopInfos.length), 0);

        for (const { stmt, idx, loopInfos } of stmtEntries) {
            if (stmt instanceof AssignmentStatement) {
                const assignment = stmt as AssignmentStatement;

                if (assignment.parent instanceof IfStatement) {
                    this.extractCondition(assignment.parent.condition, idx);
                }

                this.domains.push(ISLLoopBuilder.buildDomain(assignment, loopInfos, idx));
                
                this.schedules.push(ISLLoopBuilder.buildSchedule(assignment, loopInfos, idx, maxDepth));

                if (assignment.variable instanceof ArraySubscriptExpr) {
                    this.writes.push(ISLLoopBuilder.buildAccessRelation(assignment.variable as ArraySubscriptExpr, loopInfos, idx));
                } else {
                    const varName = assignment.variable.code.trim();

                    if (loopInfos.map(l => l.var).includes(varName)) {
                        continue;
                    }

                    if (!this.scalars.includes(varName)) this.scalars.push(varName);
                    if (this.parameters.includes(varName)) this.parameters = this.parameters.filter(p => p !== varName);
                    this.writes.push(ISLLoopBuilder.buildScalarRelation(assignment.variable as DataRef, loopInfos, idx));
                }

                for (const read of assignment.expr.descendants.filter(d => d instanceof DataRef) as DataRef[]) {
                    if (read instanceof ArraySubscriptExpr) {
                        this.reads.push(ISLLoopBuilder.buildAccessRelation(read as ArraySubscriptExpr, loopInfos, idx));
                    } else if (!(read.parent instanceof ArraySubscriptExpr)) {
                        const varName = read.code.trim();

                        if (loopInfos.map(l => l.var).includes(varName)) {
                            continue;
                        }

                        if (!this.scalars.includes(varName) && !this.parameters.includes(varName)) this.parameters.push(varName);
                        this.reads.push(ISLLoopBuilder.buildScalarRelation(read, loopInfos, idx));
                    }
                }

                this.stmts.push(assignment);
            }
            else {
                console.warn(`[ISLLoopBuilder] Unsupported statement: ${stmt.code}. Statement will be ignored.`);
            }
        }

        const writeVariables = this.writes.map(w => w.variable);
        this.reads = this.reads.filter(r => writeVariables.includes(r.variable));
    }

    private static getStatementName(statementId: number): string {
        return `S${statementId}`;
    }

    private static buildDomain(
        stmt: AssignmentStatement,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const constraints = loopInfos
            .map(loop => `${loop.lower} <= ${loop.var} <= ${loop.upper}`)
            .join(" and ");

        return `${this.getStatementName(statementId)}[${loopInfos.map(l => l.var).join(", ")}] : ${constraints}`;
    }

    private static buildSchedule(
        stmt: AssignmentStatement,
        loopInfos: Array<{ var: string; lower: string; upper: string; index: number }>,
        statementId: number,
        maxDepth: number
    ): string {
        const dims = loopInfos.map(loop => `${loop.var}, ${loop.index}`);
    
        while (dims.length < maxDepth) {
            dims.push("0, 0");
        }
    
        return `${this.getStatementName(statementId)}[${loopInfos.map(l => l.var).join(", ")}] -> [${dims.join(", ")}]`;
    }

    private static buildAccessRelation(
        arrayExpr: ArraySubscriptExpr,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): AccessRelation {
        const arrayName = arrayExpr.var.code.trim();
        const subscripts = arrayExpr.subscripts.map(sub => sub.code).join(", ");

        return {
            relation: `${this.getStatementName(statementId)}[${loopInfos.map(l => l.var).join(", ")}] -> ${arrayName}[${subscripts}]`,
            variable: arrayName
        };
    }

    private static buildScalarRelation(
        ref: DataRef,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): AccessRelation {
        return {
            relation: `${this.getStatementName(statementId)}[${loopInfos.map(l => l.var).join(", ")}] -> ${ref.code.trim()}[0]`,
            variable: ref.code.trim()
        };
    }

    public static isReductionCandidate(stmt: AssignmentStatement): string | undefined {
        if (!(stmt.expr instanceof BinaryOperator)) {
            return undefined;
        }

        const lhsVar = stmt.variable.code.trim();
        const binaryExpr = stmt.expr as BinaryOperator;
        const allowedOperators = ["ADD", "MUL"];

        if (binaryExpr.left.code.trim() === lhsVar || binaryExpr.right.code.trim() === lhsVar) {
            if (allowedOperators.includes(binaryExpr.kind)) {
                return binaryExpr.kind;
            }
        }

        return undefined;
    }

    public getScalars(): string[] {
        return this.scalars;
    }

    public getPrivates(): string[] {
        return this.privates;
    }

    public getStatements(): Statement[] {
        return this.stmts;
    }

    public toJSON(): object {
        return {
            domains: this.domains,
            schedules: this.schedules,
            reads: this.reads.map(r => r.relation),
            writes: this.writes.map(w => w.relation),
            //WORKS FOR NOW BUT MAY BREAK WITH MORE FEATURES
            parameters: this.parameters.filter(p => !this.privates.includes(p)),
            privates: this.privates,
            scalars: this.scalars,
            conditions: Object.fromEntries(this.conditions),
            paramDecls: this.paramDecls,
        };
    }
}