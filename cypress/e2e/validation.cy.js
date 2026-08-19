describe('Validation Mode E2E Tests', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  it('should render validation home page (/homeV)', () => {
    cy.visit('/homeV');
    cy.get('body').should('exist');
    cy.contains('Switch to Labeling').should('exist');
  });

  it('should render validation project view (/projectV)', () => {
    cy.visit('/projectV?IDX=0');
    cy.get('body').should('exist');
  });

  it('should render validation config page (/configV)', () => {
    cy.visit('/configV?IDX=0');
    cy.get('body').should('exist');
  });

  it('should render validation stats page (/statsV)', () => {
    cy.visit('/statsV?IDX=0');
    cy.get('body').should('exist');
  });
});
