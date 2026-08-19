import './commands';

// Ignore uncaught application exceptions so E2E navigation & rendering assertions do not fail on front-end script issues
Cypress.on('uncaught:exception', (err, runnable) => {
  return false;
});
