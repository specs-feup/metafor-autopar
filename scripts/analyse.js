import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CompilerDirective, DoStatement, Execution, Subroutine, UseStatement } from "@specs-feup/metafor/api/Joinpoints.js";
import ISLLoopBuilder from "../dist/ISLLoopBuilder.js";
import ISLCaller from "../dist/ISLCaller.js";
import DependencyAnalysis from "../dist/DependencyAnalysis.js";
import PostProcessing from "../dist/PostProcessing.js";
import FortranJoinPoints from "@specs-feup/metafor/api/FortranJoinPoints.js";

async function analyseLoopNest(jp) {
    const loopBuilder = new ISLLoopBuilder(jp);
    loopBuilder.buildStatements();

    console.dir(loopBuilder.toJSON(), { depth: null });

    const result = await ISLCaller.spawnPython(loopBuilder.toJSON());

    if (result && result.error) {
        console.error(`[ISL-BRIDGE-FAILURE]: ${result.error}`);
        return undefined;
    }

    console.log(JSON.stringify(result, null, 2));

    const analysis = new DependencyAnalysis(
        jp, 
        result.detailed_dependencies, 
        loopBuilder.getScalars(), 
        loopBuilder.getPrivates(), 
        loopBuilder.getStatements()
    );
    
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

    PostProcessing.mergeParallelRegions(parallelizedLoops);
}
/*
for (const dir of Query.search(Subroutine, {moduleName: "init_array"})) {
    const parallelizedLoops = []

    let curr = Query.searchFrom(dir, Execution).first().executableStmts[0];
    let next = null;

    while (curr) {
        next = curr.rightJp;

        if (curr instanceof DoStatement) {
            await recursiveParallelize(curr, parallelizedLoops);
        }

        curr = next;
    }

    PostProcessing.mergeParallelRegions(parallelizedLoops);
}
*/

for (const dir of Query.search(CompilerDirective, { directiveString: "forced"})) {
    const loop = dir.rightJp;

    const ref = FortranJoinPoints.dataRef("k");
    const clause = FortranJoinPoints.ompPrivateClause([ref]);
    const pragma = FortranJoinPoints.emptyOmpLoopConstruct();
    pragma.setClauses([clause]);

    const tempJp = loop;

    loop.replaceWith(pragma);
    pragma.setLoop(tempJp);

    const programUnit = loop.getAncestor("programUnit");
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
}