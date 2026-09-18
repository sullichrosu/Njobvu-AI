describe('Home Dashboard E2E Tests', () => {
  beforeEach(() => {
    cy.setCookie('Username', 'testadmin');
  });

  it('should render the main home dashboard and controls', () => {
    cy.visit('/home');
    cy.get('#home').should('exist');
    cy.get('#project-search').should('be.visible').and('have.attr', 'placeholder', 'Search projects by name or admin...');
    cy.get('#project-sort-by').should('be.visible');
    cy.get('#project-sort-order').should('be.visible');
    cy.get('#project-review-filter').should('be.visible');
  });

  it('should allow searching and filtering projects', () => {
    cy.visit('/home');
    cy.get('#project-search').type('demo-project{enter}');
    cy.url().should('include', 'search=demo-project');
  });

  it('should support changing sort parameters', () => {
    cy.visit('/home');
    cy.get('#project-sort-by').select('numImages');
    cy.url().should('include', 'sortBy=numImages');

    cy.get('#project-sort-order').select('desc');
    cy.url().should('include', 'sortOrder=desc');
  });

  it('should display the Import Project modal when clicking import button', () => {
    cy.visit('/home');
    cy.get('#importbtn').click();
    cy.get('#import_modal').should('exist');
    cy.get('#project_name').should('be.visible');
    cy.get('#upload_project').should('be.visible');
    cy.get('#import_modal button.close').click({ force: true });
  });

  it('should navigate to project creation page', () => {
    cy.visit('/home');
    cy.contains('button', 'Create Project').click();
    cy.url().should('match', /\/(create|projects\/create)/);
  });

  it('should navigate to validation home page', () => {
    cy.visit('/home');
    cy.contains('button', 'Switch to Validation').click();
    cy.url().should('match', /\/(homeV|validation\/home)/);
  });
});
