# v1.1.1
## Main Changes

### NetYieldDistributor updates

1. Enforced `totalAdvancedNetYield > totalAssetYieldSupply` invariant in several functions to prevent inconsistent state
   transitions and edge-case exploits.

### Dev Ex updates

1. Created npm scripts to run all necessary commands without hardhat cli knowledge.
1. Moved all github workflow to separate repository, for reusability.
1. Moved prettier and eslint configurations to separate repository. Use npm package for distribution.
1. Updated multiple dependencies, inculding OpenZeppelin contracts.
1. Added pre-commit hooks (using [husky](https://github.com/typicode/husky)) and lint-staged workflow, to ensure
   always-linted commits.
1. Added typechain generated types to tsconfig.
1. Added direct typescript dependency to declare our repository typescript version.
1. Fixed eslint warning and prettier format.
1. Added mocharc configuration file to integrate mocha test runner with IDEs.
1. Added link to common documentation.

## Migration steps
No special actions are required for already deployed smart contracts, just upgrade them.

# v1.1.0
