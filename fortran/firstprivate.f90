program test_privatization
    integer :: n = 100
    double precision :: a(n), b(n), c(n)
    double precision :: offset, temp
    integer :: i

    !a = [(dble(i), i=1, n)]
    offset = 10.0  ! Initial value to be used inside the loop

    ! --- CASE 1: FIRSTPRIVATE candidate ---
    ! 'offset' is READ before it is WRITTEN.
    ! It needs its initial value (10.0) from outside.
    !DIR$ scop
    do i = 1, n
       b(i) = a(i) + offset
       offset = offset * 0.99  ! Value is modified locally
    end do
    !DIR$ end scop

    ! --- CASE 2: PRIVATE candidate ---
    ! 'temp' is WRITTEN before it is READ.
    ! Its initial value from outside (if any) doesn't matter.
    !DIR$ scop
    do i = 1, n
       temp = a(i) ** 2
       c(i) = temp + 1.0
    end do
    !DIR$ end scop

    print *, b(1), c(1)
end program test_privatization