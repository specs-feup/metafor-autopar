import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CompilerDirective, DoStatement } from "@specs-feup/metafor/api/Joinpoints.js";
import ISLLoopBuilder from "../dist/ISLLoopBuilder.js";
import ISLCaller from "../dist/ISLCaller.js";
import DependencyAnalysis from "../dist/DependencyAnalysis.js";

async function analyseLoopNest(jp) {
    const loopBuilder = new ISLLoopBuilder(jp);
    loopBuilder.buildStatements();

    console.log(loopBuilder.toJSON());

    const result = await ISLCaller.spawnPython(loopBuilder.toJSON());

    console.log(JSON.stringify(result, null, 2));

    const analysis = new DependencyAnalysis(jp, result.detailed_dependencies, loopBuilder.getScalars(), loopBuilder.getPrivates(), loopBuilder.getStatements());
    analysis.wrapOpenMP();
}

for (const dir of Query.search(CompilerDirective, { directiveString: "scop"})) {

    console.log("THIS HAPPENED");
    let curr = dir;

    console.log(curr.rightJp);

    while (curr.rightJp) {
        if (curr.rightJp instanceof CompilerDirective && curr.rightJp.directiveString === "end scop") {
            break;
        }

        console.log(DoStatement.name);

        if (curr.rightJp instanceof DoStatement) {
            analyseLoopNest(curr.rightJp);
        }

        curr = curr.rightJp;
    }
}