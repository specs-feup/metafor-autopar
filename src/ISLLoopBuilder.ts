import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Statement, DoStatement, DataRef, Expr, RangeLoopControl, ActionStatement, AssignmentStatement, ArraySubscriptExpr, BinaryOperator, Joinpoint } from "@specs-feup/metafor/api/Joinpoints.js";

interface AccessRelation {
    relation: string,
    variable: string,
}

export default class ISLLoopBuilder {
    private domains: string[] = [];
    private schedules: string[] = [];
    private reads: AccessRelation[] = [];
    private writes: AccessRelation[] = [];

    private parameters: string[] = [];
    private privates: string[] = [];
    private scalars: string[] = [];
    private stmts: Statement[] = [];

    private jp: DoStatement;

    constructor(jp: DoStatement) {
        this.jp = jp;
    }

    private processLoopBound(bound: Expr): string {
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

    private extractLoopInfos(stmt: Statement): Array<{ var: string; lower: string; upper: string, index: number }> {
        let curr: DoStatement | null = stmt.getAncestor("doStatement") as DoStatement;
        let prev = stmt;
        const res = [];

        while (curr !== null) {
            const control = curr.control as RangeLoopControl;
            const varName = control.var.code.trim();
            const lower = this.processLoopBound(control.lower);
            const upper = this.processLoopBound(control.upper);

            if (!this.privates.includes(varName)) this.privates.push(varName);
            res.unshift({ var: varName, lower, upper , index: ISLLoopBuilder.loopIndexHelper(prev, curr) });

            if (curr.equals(this.jp)) break;
            prev = curr;
            curr = curr.getAncestor("doStatement") as DoStatement;
        }

        return res;
    }

    public buildStatements() {
        let statementId = 1;
        const actionStmts = this.jp.descendants.filter(s => s instanceof ActionStatement);

        const stmtEntries = actionStmts.map(stmt => ({
            stmt,
            loopInfos: this.extractLoopInfos(stmt)
        }));

        const maxDepth = Math.max(...stmtEntries.map(e => e.loopInfos.length), 0);

        for (const { stmt, loopInfos } of stmtEntries) {
            if (stmt instanceof AssignmentStatement) {
                const assignment = stmt as AssignmentStatement;

                this.domains.push(ISLLoopBuilder.buildDomain(assignment, loopInfos, statementId));
                
                this.schedules.push(ISLLoopBuilder.buildSchedule(assignment, loopInfos, statementId, maxDepth));

                if (assignment.variable instanceof ArraySubscriptExpr) {
                    this.writes.push(ISLLoopBuilder.buildAccessRelation(assignment.variable as ArraySubscriptExpr, loopInfos, statementId));
                } else {
                    const varName = assignment.variable.code.trim();

                    if (loopInfos.map(l => l.var).includes(varName)) {
                        continue;
                    }

                    if (!this.scalars.includes(varName)) this.scalars.push(varName);
                    if (this.parameters.includes(varName)) this.parameters = this.parameters.filter(p => p !== varName);
                    this.writes.push(ISLLoopBuilder.buildScalarRelation(assignment.variable as DataRef, loopInfos, statementId));
                }

                for (const read of assignment.expr.descendants.filter(d => d instanceof DataRef) as DataRef[]) {
                    if (read instanceof ArraySubscriptExpr) {
                        this.reads.push(ISLLoopBuilder.buildAccessRelation(read as ArraySubscriptExpr, loopInfos, statementId));
                    } else if (!(read.parent instanceof ArraySubscriptExpr)) {
                        const varName = read.code.trim();

                        if (loopInfos.map(l => l.var).includes(varName)) {
                            continue;
                        }

                        if (!this.scalars.includes(varName) && !this.parameters.includes(varName)) this.parameters.push(varName);
                        this.reads.push(ISLLoopBuilder.buildScalarRelation(read, loopInfos, statementId));
                    }
                }

                this.stmts.push(assignment);
                statementId++;
            }
        }

        const writeVariables = this.writes.map(w => w.variable);
        this.reads = this.reads.filter(r => writeVariables.includes(r.variable));
    }

    private static buildDomain(
        stmt: AssignmentStatement,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const constraints = loopInfos
            .map(loop => `${loop.lower} <= ${loop.var} <= ${loop.upper}`)
            .join(" and ");

        return `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] : ${constraints}`;
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
    
        return `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> [${dims.join(", ")}]`;
    }

    private static buildAccessRelation(
        arrayExpr: ArraySubscriptExpr,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): AccessRelation {
        const arrayName = arrayExpr.var.code.trim();
        const subscripts = arrayExpr.subscripts.map(sub => sub.code).join(", ");

        return {
            relation: `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> ${arrayName}[${subscripts}]`,
            variable: arrayName
        };
    }

    private static buildScalarRelation(
        ref: DataRef,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): AccessRelation {
        return {
            relation: `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> ${ref.code.trim()}[0]`,
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
            scalars: this.scalars
        };
    }
}