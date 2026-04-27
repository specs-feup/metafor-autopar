program kernel_test
  integer :: n = 20, i, j
  double precision :: a(n), b(n), c(n), x(n,n), y(n,n)

  continue
  !DIR$ scop
  do i = 1, n
     ! S1: Direct child of i-loop (Index should be 0)
     a(i) = 0.0d0

     ! First J-loop: Second child of i-loop (Index should be 1)
     do j = 1, n
        ! S2: First child of first j-loop (Index 0)
        x(j, i) = b(i) + dble(j)
        
        ! S3: Second child of first j-loop (Index 1)
        c(i) = c(i) + x(j, i)
     end do

     ! Second J-loop: Third child of i-loop (Index should be 2)
     do j = 1, n
        ! S4: First child of second j-loop (Index 0)
        y(j, i) = x(j, i) * 2.0d0
     end do
  end do
  !DIR$ end scop
end program