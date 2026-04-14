import { DoStatement } from "@specs-feup/metafor/api/Joinpoints.js";
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

    constructor(jp: DoStatement, deps: Dependency[], scalars: string[]) {
        this.jp = jp;
        this.deps = deps;
        this.scalars = scalars;
        
        this.analyze();
    }

    private analyze() {
        for (const dep of this.deps) {
            const isScalar = this.scalars.includes(dep.var);

            if (!isScalar) {
                if (dep.distance.length > 0 && dep.distance[0] !== 0) {
                    this.isParallel = false;
                    
                    console.log(`[DependencyAnalysis] Parallelism broken by Array: ${dep.var}`);
                    console.log(` -> Type: ${dep.type}, Source: [${dep.source}], Sink: [${dep.sink}], Distance: [${dep.distance}]`);
                    
                   // break; maybe?
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
            const tempJp = this.jp;

            this.jp.replaceWith(pragma);
            pragma.setLoop(tempJp);
        } else {
            //console.log(`[DependencyAnalysis] Loop at line ${this.jp.line} is sequential.`);
        }
    }
}