import sys
import json
import islpy as isl

def analyze_dependencies():
    try:
        input_data = sys.stdin.read()
        if not input_data: return
        data = json.loads(input_data)
    except Exception as e:
        print(json.dumps({"error": f"JSON Parse Error: {str(e)}"}))
        return

    ctx = isl.Context()
    params = data.get('parameters', [])
    param_header = f"[{','.join(params)}] -> " if params else ""
    #scalars = data.get('scalars', [])
    #reduction_candidates = data.get('reduction_candidates', [])

    def wrap(items):
        if isinstance(items, list):
            body = " ; ".join(items)
            return f"{param_header} {{ {body} }}"
        s = items.strip()
        if not s.startswith('{'): return f"{param_header} {{ {s} }}"
        return f"{param_header} {s}"

    try:

        param_decls = data.get('paramDecls', [])
        context = None
        if param_decls:
            context_str = f"{param_header} {{ : {' and '.join(param_decls)} }}"
            try:
                context = isl.Set.read_from_str(ctx, context_str)
            except:
                pass # fallback

        statement_conditions = data.get('conditions', {})
        all_sets = []

        for domain_str in data.get('domains', []):
            base_set = isl.Set.read_from_str(ctx, wrap(domain_str))
            
            stmt_id = base_set.get_tuple_name()
            signature = domain_str.split(':')[0].strip() 
            
            if stmt_id in statement_conditions:
                for cond in statement_conditions[stmt_id]:
                    g = cond['expression']
                    is_negated = cond.get('negated', False)
                    
                    if g.strip():
                        guard_str = wrap(f"{signature} : ({g})")
                        guard_set = isl.Set.read_from_str(ctx, guard_str)
                        
                        if is_negated:
                            universe = isl.Set.universe(guard_set.get_space())
                            guard_set = universe.subtract(guard_set)
                        
                        base_set = base_set.intersect(guard_set)
            
            all_sets.append(base_set)

        if all_sets:
            domain = isl.UnionSet.from_set(all_sets[0])
            for s in all_sets[1:]:
                domain = domain.union(isl.UnionSet.from_set(s))

            if context:
                domain = domain.intersect_params(context)
        else:
            domain = isl.UnionSet.read_from_str(ctx, f"{param_header} {{ }}")

        schedule = isl.UnionMap.read_from_str(ctx, wrap(data.get('schedules', [])))
        if context:
            schedule = schedule.intersect_params(context)
        
        read_maps_list = [isl.UnionMap.read_from_str(ctx, wrap(r)) for r in data.get('reads', [])]
        write_maps_list = [isl.UnionMap.read_from_str(ctx, wrap(w)) for w in data.get('writes', [])]

        all_reads = isl.UnionMap.read_from_str(ctx, f"{param_header} {{ }}")
        for rm in read_maps_list: 
            if context: rm = rm.intersect_params(context)
            all_reads = all_reads.union(rm)
        
        all_writes = isl.UnionMap.read_from_str(ctx, f"{param_header} {{ }}")
        for wm in write_maps_list: 
            if context: wm = wm.intersect_params(context)
            all_writes = all_writes.union(wm)

        def get_flow(sink, source):
            acc = isl.UnionAccessInfo.from_sink(sink.intersect_domain(domain))
            acc = acc.set_must_source(source.intersect_domain(domain)).set_schedule_map(schedule)
            return acc.compute_flow()

        def get_dep(flow):
            return flow.get_must_dependence()

        raw_flow = get_flow(all_reads, all_writes)
        raw = get_dep(raw_flow)
        waw = get_dep(get_flow(all_writes, all_writes))
        war = get_dep(get_flow(all_writes, all_reads))

        firstprivate = str(raw_flow.get_must_no_source())

        detailed_deps = []
        suggested_private = set()
        suggested_reduction = set()
        is_parallel = True

        def process_deps(dep_union, dep_type):
            if dep_union.is_empty(): return

            map_list = dep_union.get_map_list()
            for i in range(map_list.n_map()):
                map_part = map_list.get_map(i)
                source_stmt = map_part.get_tuple_name(isl.dim_type.in_)
                sink_stmt = map_part.get_tuple_name(isl.dim_type.out)
                
                array_name = "unknown"
                if dep_type == "RAW":
                    src_pool, sink_pool = write_maps_list, read_maps_list
                elif dep_type == "WAW":
                    src_pool, sink_pool = write_maps_list, write_maps_list
                else: # WAR
                    src_pool, sink_pool = read_maps_list, write_maps_list

                for am_sink in sink_pool:
                    mapped_sink = isl.UnionMap.from_map(map_part).apply_range(am_sink)
                    if mapped_sink.is_empty(): continue
                    
                    for am_src in src_pool:
                        if not mapped_sink.intersect(am_src).is_empty():
                            array_name = mapped_sink.get_map_list().get_map(0).get_tuple_name(isl.dim_type.out)
                            break
                    if array_name != "unknown": break
                # -----------------------------------------------------------------

                part_in_sched = map_part.apply_domain(schedule).apply_range(schedule)
                deltas = part_in_sched.deltas() # UnionSet
                
                set_list = deltas.get_set_list()
                for s_idx in range(set_list.n_set()):
                    current_set = set_list.get_set(s_idx)
                    bset_list = current_set.get_basic_set_list()
                    
                    for b_idx in range(bset_list.n_basic_set()):
                        bset = bset_list.get_basic_set(b_idx)
                        
                        vec = [bset.sample_point().get_coordinate_val(isl.dim_type.set, k).to_python() 
                            for k in range(bset.dim(isl.dim_type.set))]

                        detailed_deps.append({
                            "type": dep_type,
                            "var": array_name,
                            "source": source_stmt,
                            "sink": sink_stmt,
                            "distance": vec
                        })

        process_deps(raw, "RAW")
        process_deps(waw, "WAW")
        process_deps(war, "WAR")

        print(json.dumps({
            #"is_parallel": is_parallel,
            #"suggested_private": list(suggested_private - suggested_reduction),
            #"suggested_reduction": list(suggested_reduction),
            "detailed_dependencies": detailed_deps,
            "isl_raw": str(raw),
            "isl_waw": str(waw),
            "isl_war": str(war),
            "firstprivate": firstprivate
        }))

    except Exception as e:
        print(json.dumps({"error": f"ISL Error: {str(e)}"}))

if __name__ == "__main__":
    analyze_dependencies()