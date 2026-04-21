import { Statement, DoStatement, DataRef, Expr, RangeLoopControl, ActionStatement, AssignmentStatement, ArraySubscriptExpr, BinaryOperator } from "@specs-feup/metafor/api/Joinpoints.js";

export default class ISLLoopBuilder {
    private domains: string[] = [];
    private schedules: string[] = [];
    private reads: string[] = [];
    private writes: string[] = [];

    private parameters: string[] = [];
    private privates: string[] = [];
    private scalars: string[] = [];
    private stmts: Statement[] = [];

    private jp: DoStatement;

    constructor(jp: DoStatement) {
        this.jp = jp;
    }

    private processLoopBound(bound: Expr): string {
        if (bound instanceof DataRef) {
            const code = bound.code.trim();
            if (!this.parameters.includes(code)) this.parameters.push(code);
        }
        return bound.code.trim();
    }

    private extractLoopInfos(stmt: Statement): Array<{ var: string; lower: string; upper: string }> {
        let curr: DoStatement | null = stmt.getAncestor("doStatement") as DoStatement;
        const res = [];

        while (curr !== null) {
            const control = curr.control as RangeLoopControl;
            const varName = control.var.code.trim();
            const lower = this.processLoopBound(control.lower);
            const upper = this.processLoopBound(control.upper);

            if (!this.privates.includes(varName)) this.privates.push(varName);
            res.unshift({ var: varName, lower, upper });

            if (curr.equals(this.jp)) break;
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
                    if (!this.scalars.includes(varName)) this.scalars.push(varName);
                    this.writes.push(ISLLoopBuilder.buildScalarRelation(assignment.variable as DataRef, loopInfos, statementId));
                }

                for (const read of assignment.expr.descendants.filter(d => d instanceof DataRef) as DataRef[]) {
                    if (read instanceof ArraySubscriptExpr) {
                        this.reads.push(ISLLoopBuilder.buildAccessRelation(read as ArraySubscriptExpr, loopInfos, statementId));
                    } else if (!(read.parent instanceof ArraySubscriptExpr)) {
                        const varName = read.code.trim();
                        if (!this.scalars.includes(varName)) this.scalars.push(varName);
                        this.reads.push(ISLLoopBuilder.buildScalarRelation(read, loopInfos, statementId));
                    }
                }

                this.stmts.push(assignment);
                statementId++;
            }
        }
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
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number,
        maxDepth: number
    ): string {
        const dims = loopInfos.map(loop => `${loop.var}, ${statementId - 1}`);

        while (dims.length < maxDepth) {
            dims.push("0, 0");
        }

        return `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> [${dims.join(", ")}]`;
    }

    private static buildAccessRelation(
        arrayExpr: ArraySubscriptExpr,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const arrayName = arrayExpr.var.code.trim();
        const subscripts = arrayExpr.subscripts.map(sub => sub.code).join(", ");

        return `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> ${arrayName}[${subscripts}]`;
    }

    private static buildScalarRelation(
        ref: DataRef,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        return `S${statementId}[${loopInfos.map(l => l.var).join(", ")}] -> ${ref.code.trim()}[0]`;
    }

    public static isReductionCandidate(stmt: AssignmentStatement): boolean {
        if (stmt.variable instanceof ArraySubscriptExpr || !(stmt.expr instanceof BinaryOperator)) {
            return false;
        }

        const lhsVar = stmt.variable.code.trim();
        const binaryExpr = stmt.expr as BinaryOperator;
        
        return binaryExpr.left.code.trim() === lhsVar || binaryExpr.right.code.trim() === lhsVar;
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
            reads: this.reads,
            writes: this.writes,
            parameters: this.parameters,
            privates: this.privates,
            scalars: this.scalars
        };
    }
}