import { DoStatement, OmpClause } from "@specs-feup/metafor/api/Joinpoints.js";
import FortranJoinPoints from "@specs-feup/metafor/api/FortranJoinPoints.js";

enum DepType {
    RAW,
    WAR,
    WAW,
}

interface Dependency {
    type: DepType,
    source: number,
    sink: number,
    var: string,
    distance: number[],
}   

export default class DependencyAnalysis {
    private deps: Dependency[] = [];
    private isParallel: boolean = true;
    private jp: DoStatement;
    private scalars: string[];
    private privates: Set<string> = new Set();

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
                    
                   // break; maybe?
                }
            }
            if (isScalar) {
                if (dep.type === DepType.RAW && isOuterCarried) {
                    this.isParallel = false; 

                    console.log(`[DependencyAnalysis] Parallelism broken by Scalar: ${dep.var}`);
                    console.log(` -> Type: ${dep.type}, Source: [${dep.source}], Sink: [${dep.sink}], Distance: [${dep.distance}]`);
                } else {
                    this.privates.add(dep.var);
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