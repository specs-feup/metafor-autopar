program nested_loop_example

    ! Parameters for loop bounds
    integer :: N = 16
    integer :: M = 32
    
    ! Array declarations
    double precision :: A(N, M)
    double precision :: B(N, M)
    double precision :: C(N, M)
    integer :: i, j, temp

    ! --- INITIALIZATION ---
    do i = 1, 16
        do j = 1, 32
            B(i, j) = 1.0
            A(i, j) = 0.0
            C(i, j) = 0.0
        end do
    end do

    ! --- TARGET LOOP NEST ---
    ! This is the part your tool should analyze.
    ! It is a perfectly nested loop with two statements (S1 and S2).
    !DIR$ scop
    do i = 1, N

        do j = 1, 32
            ! Statement S1: Writes A(i, j), Reads B(i, j)
            A(i, j) = B(i, j) + 1.0

            temp = A(i, j) + 1

            B(i, j) = temp + 1
            
            ! Statement S2: Writes C(i, j), Reads A(i, j)
            C(i, j) = A(i, j) * 2.0
        end do
    end do
    !DIR$ end scop

    ! --- OUTPUT ---
    ! Just to verify the program works
    print *, "Calculation complete."
    print *, "Value of C(5, 5): ", C(5, 5)

end program nested_loop_example