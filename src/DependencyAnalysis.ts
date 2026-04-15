import { AssignmentStatement, DoStatement, OmpClause } from "@specs-feup/metafor/api/Joinpoints.js";
import FortranJoinPoints from "@specs-feup/metafor/api/FortranJoinPoints.js";
import ISLLoopBuilder from "./ISLLoopBuilder.js";

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

    constructor(jp: DoStatement, deps: Dependency[], scalars: string[]) {
        this.jp = jp;
        this.deps = deps;
        this.scalars = scalars;

        this.analyze();
    }

    private analyze() {
        for (const dep of this.deps) {
            const isScalar = this.scalars.includes(dep.var);
            const isOuterCarried = dep.distance.length > 0 && dep.distance[0] !== 0;

            if (!isScalar) {
                if (isOuterCarried) {
                    this.isParallel = false;
                    
                    console.log(`[DependencyAnalysis] Parallelism broken by Array: ${dep.var}`);
                    console.log(` -> Type: ${dep.type}, Source: [${dep.source}], Sink: [${dep.sink}], Distance: [${dep.distance}]`);
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
                        console.log(` -> Type: ${dep.type}, Source: [${dep.source}], Sink: [${dep.sink}], Distance: [${dep.distance}]`);
                    }
                }
                else {
                    this.privates.add(dep.var);
                }
            }
        }

        for (const [varName, cond] of this.reductionPotentials.entries()) {
            if (cond.RAW === 1 && cond.WAR === 1 && cond.WAW === 1) {
                console.log(`[DependencyAnalysis] Variable ${varName} is a possible reduction variable.`);
                console.log(cond.statement);
                console.log(this.jp.body.executableStmts[parseInt(cond.statement.slice(1))-1]?.code);

                if (ISLLoopBuilder.isReductionCandidate(this.jp.body.executableStmts[parseInt(cond.statement.slice(1))-1] as AssignmentStatement)) {
                    this.confirmedReductions.add(varName);
                    console.log(`[DependencyAnalysis] Variable ${varName} is a confirmed reduction variable.`);
                }
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
        } else {
            //console.log(`[DependencyAnalysis] Loop at line ${this.jp.line} is sequential.`);
        }
    }
}