program parallel_partition_test
    implicit none
    integer :: n=100, m=100, l=100
    double precision :: data_grid(n,m,l), results(n,m)
    integer :: i, j, k
    double precision :: avg

    data_grid = 1.0
    results = 0.0

    !DIR$ scop
    do i = 1, n
        ! The loop is parallel because the 'if/else' prevents any 
        ! overlap in the first dimension 'i' of data_grid.
        if (i <= 50) then
            ! --- BLOCK A: Data Initialization (Depth 3) ---
            ! Writes to data_grid(1:50, :, :)
            do j = 1, m
                do k = 1, l
                    data_grid(i, j, k) = dble(i + j + k) + 1.0
                end do
            end do
        else
            ! --- BLOCK B: Result Aggregation (Depth 2) ---
            ! Reads from data_grid(51:100, :, 1)
            ! Even though S1 writes to 'data_grid' and S2 reads from it,
            ! the 'i' indices [1...50] and [51...100] never intersect.
            do j = 1, m
                avg = data_grid(i, j, 1) + 10.0
                results(i, j) = avg + 1.0
            end do
        end if
    end do
    !DIR$ end scop

    print *, results(100, m)
end program parallel_partition_test