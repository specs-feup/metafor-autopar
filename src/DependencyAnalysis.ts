import { AssignmentStatement, DoStatement, OmpClause, ProgramUnit, UseStatement } from "@specs-feup/metafor/api/Joinpoints.js";
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

    private reductionPotentials: Map<string, ReductionConditions> = new Map();
    private confirmedReductions: Set<string> = new Set();

    constructor(jp: DoStatement, deps: Dependency[], scalars: string[], privates: string[]) {
        this.jp = jp;
        this.deps = deps;
        this.scalars = scalars;

        for (const priv of privates) {
            this.privates.add(priv);
        }

        this.analyze();
    }

    private logDependency(dep: Dependency) {
        const sourceStmt = this.jp.body.executableStmts[parseInt(dep.source.slice(1)) - 1];
        const sinkStmt = this.jp.body.executableStmts[parseInt(dep.sink.slice(1)) - 1];

        console.log(` -> Type: ${dep.type}, Source: [${sourceStmt?.code}], Sink: [${sinkStmt?.code}], Distance: [${dep.distance}]`);
    }

    private analyze() {
        for (const dep of this.deps) {
            const isScalar = this.scalars.includes(dep.var);
            const isOuterCarried = dep.distance.length > 0 && dep.distance[0] !== 0;

            if (!isScalar) {
                if (isOuterCarried) {
                    this.isParallel = false;
                    
                    console.log(`[DependencyAnalysis] Parallelism broken by Array: ${dep.var}`);
                    this.logDependency(dep);
                }
            }

            if (isScalar) {
                if (isOuterCarried) {
                    if (!this.reductionPotentials.has(dep.var)) {
                        this.reductionPotentials.set(dep.var, {
                            RAW: 0,
                            WAR: 0,
                            WAW: 0,
                            statement: "S0",
                        });
                    }

                    const cond = this.reductionPotentials.get(dep.var)!;

                    if (dep.sink === dep.source) {
                        cond.statement = dep.source;

                        switch (dep.type) {
                            case DepType.RAW:
                                cond.RAW++;
                                break;
                            case DepType.WAR:
                                cond.WAR++;
                                break;
                            case DepType.WAW:
                                cond.WAW++;
                                break;
                        }
                    }

                    if (dep.source != dep.sink && dep.type == DepType.RAW) {
                        this.isParallel = false;

                        console.log(`[DependencyAnalysis] Parallelism broken by Scalar: ${dep.var} (RAW dependency)`);
                        this.logDependency(dep);
                    }
                }
                else {
                    this.privates.add(dep.var);
                }
            }
        }

        for (const [varName, cond] of this.reductionPotentials.entries()) {
            const stmtJp = this.jp.body.executableStmts[parseInt(cond.statement.slice(1)) - 1];
            const isCandidate = ISLLoopBuilder.isReductionCandidate(stmtJp as AssignmentStatement);

            if (isCandidate && cond.RAW === 1 && cond.WAR === 1 && cond.WAW === 1) {
                this.confirmedReductions.add(varName);
                this.privates.delete(varName);

                console.log(`[DependencyAnalysis] Variable ${varName} is a confirmed reduction variable.`);
            }
            else if (cond.RAW > 0) {
                this.isParallel = false;

                console.log(`[DependencyAnalysis] Parallelism broken by Scalar: ${varName} (Reduction candidate with RAW dependencies)`);
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
    }
}