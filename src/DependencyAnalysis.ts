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

    constructor(jp: DoStatement, deps: Dependency[]) {
        this.jp = jp;
        this.deps = deps;

        console.log(this.deps);
    }

    public setIsParallel(isParallel: boolean) {
        this.isParallel = isParallel;
    }

    public wrapOpenMP() {
        if (this.isParallel) {
            const pragma = FortranJoinPoints.emptyOmpLoopConstruct();
            const tempJp = this.jp;

            this.jp.replaceWith(pragma);
            pragma.setLoop(tempJp);
        }
    }
}