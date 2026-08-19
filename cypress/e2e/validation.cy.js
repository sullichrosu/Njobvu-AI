describe('Validation Mode E2E Tests', () => {
  beforeEach(() => {
    cy.setCookie('Username', 'testadmin');
  });

  it('should render validation home page (/homeV)', () => {
    cy.visit('/homeV');
    cy.get('body').should('exist');
    cy.contains('Switch to Labeling').should('exist');
  });

  it('should render validation project view (/projectV)', () => {
    cy.visit('/projectV');
    cy.get('body').should('exist');
  });

  it('should render validation config page (/configV)', () => {
    cy.visit('/configV');
    cy.get('body').should('exist');
  });

  it('should render validation stats page (/statsV)', () => {
    cy.visit('/statsV');
    cy.get('body').should('exist');
  });
});
