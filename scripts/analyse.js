import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CompilerDirective, DoStatement } from "@specs-feup/metafor/api/Joinpoints.js";
import ISLLoopBuilder from "../dist/ISLLoopBuilder.js";
import ISLCaller from "../dist/ISLCaller.js";
import DependencyAnalysis from "../dist/DependencyAnalysis.js";

for (const dir of Query.search(CompilerDirective, { directiveString: "scop"})) {

    let curr = dir;

    while (curr.rightJp) {
        if (curr.rightJp instanceof CompilerDirective && curr.rightJp.directiveString === "end scop") {
            break;
        }

        console.log(DoStatement.name);

        if (curr.rightJp instanceof DoStatement) {
            const loopBuilder = new ISLLoopBuilder(curr.rightJp);
            loopBuilder.buildStatements();

            console.log(loopBuilder.toJSON());

            const result = await ISLCaller.spawnPython(loopBuilder.toJSON());

            console.log("hello");
            //console.log(result);
            console.log(JSON.stringify(result, null, 2));

            const analysis = new DependencyAnalysis(curr.rightJp, result.detailed_dependencies);
            analysis.setIsParallel(result.is_parallel);
            analysis.wrapOpenMP();
        }

        curr = curr.rightJp;
    }
}