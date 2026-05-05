program phantom_dep_test
    implicit none
    ! These are the parameters your TS will extract as 'n = 16'
    integer, parameter :: n = 16
    integer :: offset = 20
    double precision :: a(100), b(100)
    integer :: i

    a = 0.0
    b = 0.0

    !DIR$ scop
    do i = 1, n
        ! S1: Write to a(i)
        a(i) = 1.0

        ! S2: Read from a(i + offset)
        ! SYMBOLIC ANALYSIS: 
        ! There is a potential RAW dependency because S1 writes to 'a' 
        ! and S2 reads from 'a'. If 'offset' were negative or zero, 
        ! this would be a real dependency.

        ! CONSTANT-FOLDED ANALYSIS (with n=16, offset=20):
        ! S1 writes to indices [1, 2, ..., 16].
        ! S2 reads from indices [21, 22, ..., 36].
        ! 
        ! The sets {1...16} and {21...36} are DISJOINT.
        ! Result: Zero dependencies. Parallel!
        b(i) = a(i + offset) + 2.0
    end do
    !DIR$ end scop

    print *, b(1)
end program phantom_dep_test