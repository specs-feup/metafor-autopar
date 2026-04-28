program if_parallel_test
    implicit none
    integer :: n = 100
    double precision :: x(n)
    integer :: i

    x = 0.0

    !DIR$ scop
    do i = 1, n
        ! If this IF wasn't here, at i=21 we would write x(21).
        ! But at i=1, we already read x(21). That's a WAR dependency!
        !
        ! BUT: Because we stop writing at i=20, the set of 
        ! indices written {1...20} and the set of indices 
        ! read {21...40} are DISJOINT.
        if (i <= 20) x(i) = x(i + 20) + 1.0
    end do
    !DIR$ end scop

    print *, x(1)
end program if_parallel_test