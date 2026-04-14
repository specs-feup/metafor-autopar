PROGRAM nested_loop_example
   integer :: n = 10
   integer :: m = 10
   integer :: sum = 2
   double precision :: a(n,m)
   double precision :: b(n,m)
   double precision :: c(n,m)
   integer :: i, j
   DO i = 1, n
   DO j = 1, m
   b(i, j) = 0.0
   a(i, j) = 0.0
   c(i, j) = 0.0
   
   END DO
   
   END DO
   !DIR$ scop
   DO i = 1, n
   DO j = 1, m
   a(i, j) = b(i, j) + 1.0
   c(i, j) = a(i + j, j + 1 + 2 + 3) * 2.0
   
   END DO
   
   END DO
   !DIR$ end scop
   PRINT *, "Calculation complete."
   PRINT *, "Value of C(5, 5): ", c(5, 5)
END PROGRAM nested_loop_example
