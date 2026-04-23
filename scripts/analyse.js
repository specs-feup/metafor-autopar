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
    return analysis.wrapOpenMP();
}

async function recursiveParallelize(loopJp, parallelizedLoops) { 
    const pragmaJp = await analyseLoopNest(loopJp);

    if (pragmaJp) {
        console.log(`   [SUCCESS] Parallelized outer loop.`);
        parallelizedLoops.push(pragmaJp);
    } else {
        console.log(`   [FAIL] Outer loop is sequential. Checking inner loops...`);
        
        for (const child of loopJp.body.children) {
            if (child instanceof DoStatement) {
                await recursiveParallelize(child, parallelizedLoops);
            }
        }
    }
}

for (const dir of Query.search(CompilerDirective, { directiveString: "scop"})) {

    const parallelizedLoops = []

    let curr = dir;
    while (curr.rightJp) {
        if (curr.rightJp instanceof CompilerDirective && curr.rightJp.directiveString === "end scop") {
            break;
        }
        
        if (curr.rightJp instanceof DoStatement) {
            await recursiveParallelize(curr.rightJp, parallelizedLoops);
        }

        curr = curr.rightJp;
    }
}