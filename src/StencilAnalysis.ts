import { AssignmentStatement, DoStatement, OmpClause, OmpLoopConstruct, ProgramUnit, RangeLoopControl, Statement, UseStatement } from "@specs-feup/metafor/api/Joinpoints.js";
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
    operator: string,
}

export default class StencilAnalysis {
    private deps: Dependency[] = [];
    private jp: DoStatement;
    private loopNames: string[] = [];
    private scalars: string[];
    private statements: Statement[];
    
    private isParallel: boolean = true;
    private isOrdered: boolean = false;
    private privates: Set<string> = new Set();
    private sinks: Map<string, number[]> = new Map();

    private reductionPotentials: Map<string, ReductionConditions> = new Map();
    private confirmedReductions: Set<string> = new Set();

    constructor(jp: DoStatement, deps: Dependency[], scalars: string[], privates: string[], statements: Statement[]) {
        this.jp = jp;
        this.deps = deps;
        this.scalars = scalars;
        this.statements = statements;

        for (const loop of Query.searchFromInclusive(jp, DoStatement)) {
            this.loopNames.push((loop.control as RangeLoopControl).var.code.trim());
        }

        for (const priv of privates) {
            this.privates.add(priv);
        }

        this.analyze();
    }

    private analyze() {
        const rawSinks: number[][] = [];
    
        for (const dep of this.deps) {
            const loopDist = dep.distance.filter((_, idx) => idx % 2 === 0);
            const isCarried = loopDist.some(d => d !== 0);
    
            if (isCarried) {
                const stmtJp = this.statements[parseInt(dep.source.slice(1)) - 1];
                const operator = ISLLoopBuilder.isReductionCandidate(stmtJp as AssignmentStatement);
    
                if (operator && dep.sink === dep.source) {
                    this.trackReduction(dep, operator);
                    continue;
                }
    
                if (this.isLexicographicallyPositive(loopDist)) {
                    if (loopDist[0] === 0) continue;
    
                    // NEEDED FOR POSSIBLE LLVM BUG
                    // const clamped = loopDist.map((d, idx) => (idx > 0 && d < 0 ? 0 : d));
                    
                    if (!rawSinks.some(s => s.join(',') === clamped.join(','))) {
                        rawSinks.push(clamped);
                    }
                    this.isParallel = false;
                    this.isOrdered = true;
                } else {
                    this.isParallel = false;
                    this.isOrdered = false;
                    return; 
                }
            }
        }
    
        this.validateReductions();
        this.filterRedundantSinks(rawSinks);
    }

    private isLexicographicallyPositive(dist: number[]): boolean {
        for (const d of dist) {
            if (d !== 0) return d > 0;
        }
        return false;
    }

    private filterRedundantSinks(rawSinks: number[][]) {
        if (!this.isOrdered || !rawSinks) return;
    
        const filtered = rawSinks.filter((d2, i2) => {
            return !rawSinks.some((d1, i1) => {
                if (i1 === i2) return false;

                if (d1[0] !== d2[0]) return false;
    
                //lexicographical comparison
                for (let i = 0; i < d1.length; i++) {
                    if (d1[i]! < d2[i]!) return true; 
                    if (d1[i]! > d2[i]!) return false;
                }
                return false;
            });
        });
    
        for (const s of filtered) this.sinks.set(s.join(','), s);
    }

    private trackReduction(dep: Dependency, operator: string) {
        if (!this.reductionPotentials.has(dep.var)) {
            this.reductionPotentials.set(dep.var, { RAW: 0, WAR: 0, WAW: 0, statement: dep.source, operator });
        }
        const cond = this.reductionPotentials.get(dep.var)!;
        if (dep.type === DepType.RAW) cond.RAW++;
        if (dep.type === DepType.WAR) cond.WAR++;
        if (dep.type === DepType.WAW) cond.WAW++;
    }

    private validateReductions() {
        for (const [varName, cond] of this.reductionPotentials.entries()) {
            if (cond.RAW === 1 && cond.WAR === 1 && cond.WAW === 1) {
                this.confirmedReductions.add(varName);
                this.privates.delete(varName);
            } else if (cond.RAW > 0) {
                this.isParallel = false;
            }
        }
    }

    public wrapOpenMP(): OmpLoopConstruct | undefined {
        if (!this.isParallel && !this.isOrdered) return undefined;

        const pragma = FortranJoinPoints.emptyOmpLoopConstruct();
        const clauses: OmpClause[] = [];

        for (const priv of this.privates) clauses.push(FortranJoinPoints.ompPrivateClause([FortranJoinPoints.dataRef(priv)]));
        for (const red of this.confirmedReductions) {
            const op = this.reductionPotentials.get(red)!.operator;
            clauses.push(FortranJoinPoints.ompReductionClause(op, [FortranJoinPoints.dataRef(red)]));
        }

        if (this.isOrdered) {
            clauses.push(FortranJoinPoints.ompOrderedClause(this.loopNames.length));
            this.injectOrderedDirectives();
        }

        pragma.setClauses(clauses);
        const tempJp = this.jp;
        this.jp.replaceWith(pragma);
        pragma.setLoop(tempJp);

        this.ensureOmpLib();
        return pragma;
    }

    private injectOrderedDirectives() {
        const sinkStrings = Array.from(this.sinks.values()).map(dist => {
            return this.loopNames.map((name, idx) => {
                const d = dist[idx];
                if (d === 0) return name;
                return d! > 0 ? `${name}-${d}` : `${name}+${Math.abs(d!)}`;
            }).join(', ');
        });

        const sinkCode = `!$OMP ORDERED DEPEND(sink: ${sinkStrings.join(') DEPEND(sink: ')})`;
        const sourceCode = `!$OMP ORDERED DEPEND(source)`;

        // this.jp.body.insertBegin(sinkCode);
        // this.jp.body.insertEnd(sourceCode);
        this.statements[0]?.insert("before", sinkCode);
        this.statements[this.statements.length - 1]?.insert("after", sourceCode);
    }

    private ensureOmpLib() {
        const programUnit = this.jp.getAncestor("programUnit") as ProgramUnit;
        const hasOmpLib = Query.searchFrom(programUnit.specification, UseStatement)
            .get().some(u => (u as UseStatement).moduleName === "omp_lib");

        if (!hasOmpLib) {
            programUnit.specification.addUseStmt(FortranJoinPoints.useStatement("omp_lib"));
        }
    }
}