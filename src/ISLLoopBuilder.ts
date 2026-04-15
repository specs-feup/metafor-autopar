import { Statement, DoStatement, DataRef, Expr, RangeLoopControl, ActionStatement, AssignmentStatement, ArraySubscriptExpr, BinaryOperator } from "@specs-feup/metafor/api/Joinpoints.js";

export default class ISLLoopBuilder {
    //private loopInfos: Array<{ var: string; lower: string; upper: string }> = [];
    private domains: string[] = [];
    private schedules: string[] = [];
    private reads: string[] = [];
    private writes: string[] = [];

    private parameters: string[] = [];
    private privates: string[] = [];
    private scalars: string[] = [];
    //private reductionCandidates: string[] = [];

    private stmts: Statement[] = [];

    private jp: DoStatement;

    constructor(jp: DoStatement) {
        this.jp = jp;
    }

    private processLoopBound(bound: Expr): string {
        if (bound instanceof DataRef) {
            if (!this.parameters.includes(bound.code.trim())) this.parameters.push(bound.code.trim());
        }

        return bound.code.trim();
    }

    private extractLoopInfos(stmt: Statement) : Array<{ var: string; lower: string; upper: string }> {
        let curr: DoStatement = stmt.getAncestor("doStatement") as DoStatement;

        const res = [];

        do {
            const control = curr.control as RangeLoopControl;
            const varName = control.var.code.trim();
            const lower = this.processLoopBound(control.lower);
            const upper = this.processLoopBound(control.upper);

            if (!this.privates.includes(varName)) this.privates.push(varName);
            res.unshift({ var: varName, lower, upper });

            if (curr.equals(this.jp)) break;
            curr = curr.getAncestor("doStatement") as DoStatement;
        } while (true);

        return res;
    }

    public buildStatements() {
        let statementId = 1;

        for (const stmt of this.jp.descendants.filter(s => s instanceof ActionStatement)) {

            const loopInfos: Array<{ var: string; lower: string; upper: string }> = this.extractLoopInfos(stmt);

            if (stmt instanceof AssignmentStatement) {
                const assignment = stmt as AssignmentStatement;

                this.domains.push(ISLLoopBuilder.buildDomain(assignment, loopInfos, statementId));
                this.schedules.push(ISLLoopBuilder.buildSchedule(assignment, loopInfos, statementId));

                if (assignment.variable instanceof ArraySubscriptExpr) {
                    const arrayExpr = assignment.variable as ArraySubscriptExpr;

                    this.writes.push(ISLLoopBuilder.buildAccessRelation(arrayExpr, loopInfos, statementId));
                }
                else {
                    if (!this.scalars.includes(assignment.variable.code.trim())) this.scalars.push(assignment.variable.code.trim());
                    this.writes.push(ISLLoopBuilder.buildScalarRelation(assignment.variable as DataRef, loopInfos, statementId));
                }

                for (const read of assignment.expr.descendants.filter(d => d instanceof DataRef)) {
                    if (read instanceof ArraySubscriptExpr) {
                        this.reads.push(ISLLoopBuilder.buildAccessRelation(read as ArraySubscriptExpr, loopInfos, statementId));
                    }
                    //THIS ONLY WORKS FOR NOW 
                    else if (!(read.parent instanceof ArraySubscriptExpr)) {
                        if (!this.scalars.includes(read.code.trim())) this.scalars.push(read.code.trim());
                        this.reads.push(ISLLoopBuilder.buildScalarRelation(read, loopInfos, statementId));
                    }
                }

                // THIS WILL PROBABLY NEED TO BE MOVED
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
            .map(loop => {
                const { var: loopVar, lower, upper } = loop;
                return `${lower} <= ${loopVar} <= ${upper}`;
            })
            .join(" and ");
    
        const domain = `S${statementId}[${loopInfos
            .map(loop => loop.var)
            .join(", ")}] : ${constraints}`;
    
        return domain;
    }

    private static buildSchedule(
        stmt: AssignmentStatement,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const schedule = `S${statementId}[${loopInfos
            .map(loop => loop.var)
            .join(", ")}] -> [${loopInfos.map(loop => `${loop.var}, ${statementId - 1}`).join(", ")}]`;
    
        return schedule;
    }

    private static buildAccessRelation(
        arrayExpr: ArraySubscriptExpr,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const arrayName = arrayExpr.var.code.trim();
        const subscripts = arrayExpr.subscripts.map(sub => sub.code).join(", ");
    
        const accessRelation = `S${statementId}[${loopInfos
            .map(loop => loop.var)
            .join(", ")}] -> ${arrayName}[${subscripts}]`;
    
        return accessRelation;
    }

    private static buildScalarRelation(
        ref: DataRef,
        loopInfos: Array<{ var: string; lower: string; upper: string }>,
        statementId: number
    ): string {
        const varName = ref.code.trim();

        const scalarRelation = `S${statementId}[${loopInfos
            .map(loop => loop.var)
            .join(", ")}] -> ${varName}[0]`;
    
        return scalarRelation;
    }

    public static isReductionCandidate(stmt: AssignmentStatement): boolean {
        if (stmt.variable instanceof ArraySubscriptExpr) {
            return false;
        }
    
        const lhsVar = stmt.variable.code.trim();
    
        if (!(stmt.expr instanceof BinaryOperator)) {
            return false;
        }

        const binaryExpr = stmt.expr as BinaryOperator;
    
        const leftOperand = binaryExpr.left.code.trim();
        const rightOperand = binaryExpr.right.code.trim();
    
        return leftOperand === lhsVar || rightOperand === lhsVar;
    }

    public getScalars(): string[] {
        return this.scalars;
    }

    public toJSON(): object {
        return {
            domains: this.domains,
            schedules: this.schedules,
            reads: this.reads,
            writes: this.writes,
            parameters: this.parameters,
            privates: this.privates,
            scalars: this.scalars,
            //"reduction_candidates": this.reductionCandidates
        };
    }
}