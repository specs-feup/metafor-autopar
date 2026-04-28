program logical_if_test
    implicit none
    integer :: n = 100
    double precision :: a(n), b(n), c(n)
    integer :: i

    a = 1.0
    b = 0.0
    c = 0.0

    !DIR$ scop
    do i = 1, n
        ! STATEMENT S1: Good Condition (Affine)
        ! Logic: i is an iterator, 5 is a constant. 
        ! ISL should result in: { S1[i] : 1 <= i <= n and i > 5 }
        if (i > 5) b(i) = a(i) * 2.0

        ! STATEMENT S2: Bad Condition (Data-Dependent)
        ! Logic: b(i) is an array access. ISL cannot reason about 
        ! memory values at compile time.
        ! Transpiler Strategy: Ignore condition (Conservative/Safe).
        if (b(i) > 1.0) c(i) = b(i) + a(i)
    end do
    !DIR$ end scop

    print *, b(10), c(10)
end program logical_if_test