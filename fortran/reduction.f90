program nested_loop_example

    ! Parameters for loop bounds
    integer :: N = 16
    integer :: M = 32
    
    ! Array declarations
    integer :: A(N)
    integer :: B(N)
    integer :: i, j, temp

    ! --- INITIALIZATION ---
    do i = 1, 16
        B(i) = 1
        A(i) = 0
    end do

    ! --- TARGET LOOP NEST ---
    ! This is the part your tool should analyze.
    ! It is a perfectly nested loop with two statements (S1 and S2).
    !DIR$ scop
    do i = 1, N
        temp = temp + i
        A(i) = temp + 1
    end do
    !DIR$ end scop

    ! --- OUTPUT ---
    ! Just to verify the program works
    print *, "Calculation complete."

end program nested_loop_example