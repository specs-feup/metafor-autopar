# Metafor-AutoPar

Metafor-AutoPar is a parallelization library built for the Metafor Fortran source-to-source compiler. It can be used by Metafor scripts to parallelize loops using OpenMP directives, if no problematic data dependencies are identified.

# Requirements

- Node.JS 22
- Python (tested with version 3.14)

The `setup.js` script configures a virtual environment and installs the dependencies of the Python component. It can be executed with `node setup.js`.

# Usage

The sample script `scripts/affine.js` selects loop nests placed in between specific compiler directives and attempts to parallelize them. It can be used, for example, with the command `npx metafor classic scripts/analyse.js -p <Fortran file>`.
