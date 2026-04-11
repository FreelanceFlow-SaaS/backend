// Test file to demonstrate pre-commit hooks
const badlyFormatted = { message: 'This will be auto-formatted' };
console.log('This console.log will trigger ESLint warning');

export class TestPreCommitHooks {
  private value: string = 'poorly formatted';

  getMessage() {
    return badlyFormatted.message;
  }
}
