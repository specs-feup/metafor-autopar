import { AssignmentStatement, DoStatement, OmpClause, ProgramUnit, Statement, UseStatement } from "@specs-feup/metafor/api/Joinpoints.js";
import FortranJoinPoints from "@specs-feup/metafor/api/FortranJoinPoints.js";
import ISLLoopBuilder from "./ISLLoopBuilder.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

enum DepType {
    RAW = "RAW",
    WAR = "WAR",
    WAW = "WAW",
}

interface Dependency {
    type: DepType,
    source: string,
    sink: string,
    var: string,
    distance: number[],
}   

interface ReductionConditions {
    RAW: number,
    WAR: number,
    WAW: number,
    statement: string,
}

export default class DependencyAnalysis {
    private deps: Dependency[] = [];
    private isParallel: boolean = true;
    private jp: DoStatement;
    private scalars: string[];
    private privates: Set<string> = new Set();
    private statements: Statement[] = [];

    private reductionPotentials: Map<string, ReductionConditions> = new Map();
    private confirmedReductions: Set<string> = new Set();

    constructor(jp: DoStatement, deps: Dependency[], scalars: string[], privates: string[], statements: Statement[]) {
        this.jp = jp;
        this.deps = deps;
        this.scalars = scalars;
        this.statements = statements;

        for (const priv of privates) {
            this.privates.add(priv);
        }

        this.analyze();
    }

    private logDependency(dep: Dependency) {
        const sourceStmt = this.statements[parseInt(dep.source.slice(1)) - 1];
        const sinkStmt = this.statements[parseInt(dep.sink.slice(1)) - 1];

        console.log(` -> Type: ${dep.type}, Source: [${sourceStmt?.code}], Sink: [${sinkStmt?.code}], Distance: [${dep.distance}]`);
    }

    private analyze() {
        for (const dep of this.deps) {
            const loopIndex = 0; // Current loop level
            const isOuterCarried = dep.distance.length > loopIndex && dep.distance[loopIndex] !== 0;
    
            if (isOuterCarried) {
                // Identify if the statement is a reduction (e.g., y(i) = y(i) + ...)
                const stmtJp = this.statements[parseInt(dep.source.slice(1)) - 1];
                const isCandidate = ISLLoopBuilder.isReductionCandidate(stmtJp as AssignmentStatement);
    
                // If it's a self-dependency on a candidate statement, we track it
                if (isCandidate && dep.sink === dep.source) {
                    if (!this.reductionPotentials.has(dep.var)) {
                        this.reductionPotentials.set(dep.var, {
                            RAW: 0, WAR: 0, WAW: 0,
                            statement: dep.source,
                        });
                    }
    
                    const cond = this.reductionPotentials.get(dep.var)!;
                    if (dep.type === DepType.RAW) cond.RAW++;
                    if (dep.type === DepType.WAR) cond.WAR++;
                    if (dep.type === DepType.WAW) cond.WAW++;
    
                } else {
                    // Not a reduction self-dependency? Then it's a real race condition.
                    this.isParallel = false;
                    console.log(`[DependencyAnalysis] Parallelism broken by ${dep.var}`);
                    this.logDependency(dep);
                }
            } else {
                // No loop-carried dependency? Standard private variable logic.
                // (Only for scalars, as arrays are usually shared unless specifically private)
                if (this.scalars.includes(dep.var)) {
                    this.privates.add(dep.var);
                }
            }
        }
    
        // Final Validation of Reductions
        for (const [varName, cond] of this.reductionPotentials.entries()) {
            const isScalar = this.scalars.includes(varName);
    
            // Standard reduction "Gold Standard": 1 RAW, 1 WAR, 1 WAW
            if (cond.RAW === 1 && cond.WAR === 1 && cond.WAW === 1) {
                this.confirmedReductions.add(varName);
                this.privates.delete(varName); // Don't make it private; it's a reduction!
                console.log(`[DependencyAnalysis] ${isScalar ? 'Scalar' : 'Array'} ${varName} confirmed as reduction.`);
            } else if (cond.RAW > 0) {
                // If it had a RAW dependency but didn't meet reduction criteria, it's sequential.
                this.isParallel = false;
                console.log(`[DependencyAnalysis] Parallelism broken by ${varName} (Failed reduction check)`);
            }
        }
    }

    public getIsParallel(): boolean {
        return this.isParallel;
    }

    public wrapOpenMP() {
        if (this.isParallel) {
            //console.log(`[DependencyAnalysis] Loop at line ${this.jp.line} is parallel! Wrapping...`);
            const pragma = FortranJoinPoints.emptyOmpLoopConstruct();
            const clauses: OmpClause[] = [];

            for (const priv of this.privates) {
                const ref = FortranJoinPoints.dataRef(priv);
                const clause = FortranJoinPoints.ompPrivateClause([ref]);

                clauses.push(clause);
            }

            pragma.setClauses(clauses);

            const tempJp = this.jp;

            this.jp.replaceWith(pragma);
            pragma.setLoop(tempJp);

            //Insert "use omp_lib if absent"

            const programUnit = this.jp.getAncestor("programUnit") as ProgramUnit;
            let hasOmpLib = false;

            for (const useStmt of Query.searchFrom(programUnit.specification, UseStatement)) {
                if (useStmt.moduleName === "omp_lib") {
                    hasOmpLib = true;
                    break;
                }
            }

            if (!hasOmpLib) {
                const ompLibUse = FortranJoinPoints.useStatement("omp_lib");
                programUnit.specification.addUseStmt(ompLibUse);
            }
        } else {
            //console.log(`[DependencyAnalysis] Loop at line ${this.jp.line} is sequential.`);
        }

        return this.isParallel;
    }
}