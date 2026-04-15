program nested_loop_example
    implicit none

    ! Parameters for loop bounds
    integer :: N = 16
    integer :: M = 32
    
    ! Array declarations
    integer :: A(16), B(16), C(16)
    integer :: i, j
    
    ! Variables for testing
    integer :: total, prod, peeker, oversetter, k, diff, val_max

    ! --- INITIALIZATION ---
    do i = 1, 16
        B(i) = i
        A(i) = 0
        C(i) = 0
    end do
    total = 0
    prod = 1
    peeker = 0
    oversetter = 0
    k = 0
    diff = 0
    val_max = -999

    ! --- TARGET LOOP NEST ---
    !DIR$ scop

    ! 1. VALID REDUCTION: Standard Sum
    ! Should result in: isParallel: true, suggested_reduction: [total]
    do i = 1, N
        total = total + B(i)
    end do

    ! 2. VALID REDUCTION: Standard Product
    ! Should result in: isParallel: true, suggested_reduction: [prod]
    do i = 1, N
        prod = prod * B(i)
    end do

    ! 3. INVALID REDUCTION: The "Peeking" Dependency
    ! Even though it looks like a reduction, C(i) depends on the intermediate 
    ! value of 'peeker' from the current iteration. 
    ! Should result in: isParallel: false (Source S1 -> Sink S2, RAW, distance [0])
    do i = 1, N
        peeker = peeker + B(i)
        C(i) = peeker + 1
    end do

    ! 5. INDUCTION VARIABLE: Predictable increment
    ! This is often used for indexing.
    ! Should result in: isParallel: true, suggested_private: [k]
    do i = 1, N
        k = k + 1
        A(k) = B(i) * 2
    end do

    ! 6. INVALID REDUCTION: Non-Associative Subtraction
    ! 'diff = B(i) - diff' changes result based on order ( (1-2)-3 != 1-(2-3) )
    ! Your JS AST check 'isReductionCandidate' should catch the variable being on the RHS of '-'
    ! Should result in: isParallel: false
    do i = 1, N
        diff = B(i) - diff
    end do

    !DIR$ end scop

    ! --- OUTPUT ---
    print *, "Calculation complete."
    print *, "Total:", total, "Max:", val_max

end program nested_loop_example