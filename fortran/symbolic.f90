program symbolic_test
    integer :: N = 1000
    integer :: NX = 50, NY = 20
    double precision, dimension(N, N) :: a
    double precision, dimension(N) :: b, x
    integer, dimension(N+1) :: rowstr
    integer :: i, j, res

    ! 1. Replace Implied-DO with a standard loop
    do i = 1, N + 1
        rowstr(i) = i
    end do

    a = 0.0d0
    b = 0.0d0
    x = 1.0d0

    call test_affine_params(NX, NY, a)
    call test_non_affine_sparse(N, rowstr, a, x, b)
    call test_stencil_wavefront(N, a)

contains

    subroutine test_affine_params(nx, ny, arr)
        integer, intent(in) :: nx, ny
        integer :: i
        ! Use explicit bounds instead of NX*NY
        double precision :: arr(1000, 1000) 
        
        continue
        !DIR$ scop
        do i = 1, nx * ny
            arr(i, 1) = arr(i, 1) * 2.0d0
        end do
        !DIR$ end scop
    end subroutine test_affine_params

    subroutine test_non_affine_sparse(n, rstr, val, x_vec, b_vec)
        integer, intent(in) :: n
        integer :: rstr(n+1)
        ! 2. Explicitly size these to help the analyzer
        double precision :: val(n*n), x_vec(n*n), b_vec(n)
        integer :: i, j
        
        continue
        !DIR$ scop
        do i = 1, n
            ! rowstr(i) is the non-affine bound your tool should catch
            do j = rstr(i), rstr(i+1) - 1
                b_vec(i) = b_vec(i) + val(j) * x_vec(j)
            end do
        end do
        !DIR$ end scop
    end subroutine test_non_affine_sparse

    subroutine test_stencil_wavefront(n, arr)
        integer, intent(in) :: n
        double precision :: arr(n, n)
        integer :: i, j
        
        continue
        !DIR$ scop
        do i = 2, n - 1
            do j = 2, n - 1
                arr(j, i) = (arr(j-1, i-1) + arr(j, i-1) + arr(j+1, i-1) + &
                             arr(j-1, i)   + arr(j, i)   + arr(j+1, i)   + &
                             arr(j-1, i+1) + arr(j, i+1) + arr(j+1, i+1)) / 9.0d0
            end do
        end do
        !DIR$ end scop
    end subroutine test_stencil_wavefront

end program symbolic_test