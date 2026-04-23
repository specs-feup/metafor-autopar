import FortranJoinPoints from "@specs-feup/metafor/api/FortranJoinPoints.js";
import { OmpDataSharingClause, OmpClause, OmpLoopConstruct } from "@specs-feup/metafor/api/Joinpoints.js";

export default class PostProcessing {
    public static mergeParallelRegions(loops: OmpLoopConstruct[]) {
        const neighbors = this.identifyNeighbors(loops);
        for (const cluster of neighbors) {
            this.mergeNeighbors(cluster);
        }
    }

    private static identifyNeighbors(loops: OmpLoopConstruct[]): OmpLoopConstruct[][] {
        if (loops.length < 2) return [];

        const clusters: OmpLoopConstruct[][] = [];
        let currentCluster: OmpLoopConstruct[] = [loops[0] as OmpLoopConstruct];

        for (let i = 1; i < loops.length; i++) {
            const prev = loops[i - 1] as OmpLoopConstruct;
            const curr = loops[i] as OmpLoopConstruct;

            if (prev?.rightJp.equals(curr)) {
                currentCluster.push(curr);
            } else {
                if (currentCluster.length > 1) {
                    clusters.push(currentCluster);
                }
                currentCluster = [curr];
            }
        }

        if (currentCluster.length > 1) {
            clusters.push(currentCluster);
        }

        return clusters;
    }

    private static mergeNeighbors(cluster: OmpLoopConstruct[]) {
        if (cluster.length < 2) return;

        const outerClauses: OmpDataSharingClause[] = [];
        for (const loop of cluster) {
            const newClauses: OmpClause[] = [];
            for (const clause of loop.clauses) {
                if (clause instanceof OmpDataSharingClause) {
                    if (outerClauses.map(c => c.code).includes(clause.code)) {
                        continue;
                    }
                    else {
                        outerClauses.push(clause);
                    }
                }
                else {
                    newClauses.push(clause);
                }
            }

            loop.setClauses(newClauses);
        }

        const regionJp = FortranJoinPoints.emptyOmpBlockConstruct();
        regionJp.setClauses(outerClauses);

        const firstLoop = cluster[0] as OmpLoopConstruct;

        firstLoop.replaceWith(regionJp);
        
        const execution = FortranJoinPoints.execution(cluster);
        regionJp.setBody(execution);
    }
}