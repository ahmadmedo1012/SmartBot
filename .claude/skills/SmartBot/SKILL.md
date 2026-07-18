```markdown
# SmartBot Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the SmartBot repository, a TypeScript codebase with no detected framework. You'll learn file naming, import/export styles, commit message habits, and how to write and run tests. This guide also provides suggested commands for common workflows.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `messageHandler.ts`, `userSession.test.ts`

### Import Style
- Use **aliased imports** for modules.
  - Example:
    ```typescript
    import utils from './utils'
    import db from '../database'
    ```

### Export Style
- Use **default exports** for modules.
  - Example:
    ```typescript
    const processMessage = (msg: string) => { /* ... */ }
    export default processMessage
    ```

### Commit Patterns
- Commit messages are **freeform**, sometimes prefixed with `restore`.
- Average commit message length: ~70 characters.
  - Example:
    ```
    restore previous session handling logic for user reconnects
    ```

## Workflows

### Restoring Previous Code
**Trigger:** When you need to revert to or restore previous logic or files.
**Command:** `/restore`

1. Identify the file or logic to restore.
2. Use version control (e.g., `git checkout <commit> <file>`) to retrieve previous code.
3. Test the restored code to ensure it works as expected.
4. Commit the change with a message prefixed by `restore`.
   - Example: `restore message parsing logic to previous version`

### Adding a New Module
**Trigger:** When adding new features or utilities.
**Command:** `/add-module`

1. Create a new file using camelCase naming (e.g., `featureX.ts`).
2. Write your module logic.
3. Use default export at the end of the file.
4. Import the module elsewhere using an alias.
   - Example:
     ```typescript
     import featureX from './featureX'
     ```
5. Add or update tests in a corresponding `.test.ts` file.

### Writing Tests
**Trigger:** When testing new or existing modules.
**Command:** `/write-test`

1. Create a test file named `moduleName.test.ts`.
2. Write test cases for your module.
   - Example:
     ```typescript
     import featureX from './featureX'

     test('should process input correctly', () => {
       expect(featureX('input')).toBe('expectedOutput')
     })
     ```
3. Run the test using your preferred test runner (framework not specified).

## Testing Patterns

- **Test files** use the pattern `*.test.*` (e.g., `userSession.test.ts`).
- The testing framework is **unknown**, but standard TypeScript test syntax applies.
- Place tests alongside or near the modules they test.
- Example test file:
  ```typescript
  import processMessage from './processMessage'

  test('handles empty message', () => {
    expect(processMessage('')).toBeFalsy()
  })
  ```

## Commands
| Command      | Purpose                                       |
|--------------|-----------------------------------------------|
| /restore     | Restore previous code or logic                |
| /add-module  | Add a new module following conventions        |
| /write-test  | Create and run tests for a module             |
```
