describe('Help, Documentation & Server Stats E2E Tests', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  it('should render help page (/help)', () => {
    cy.visit('/help');
    cy.get('body').should('exist');
  });

  it('should return JSON documentation from help API endpoint (/api/v2/help)', () => {
    cy.request('/api/v2/help').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers['content-type']).to.include('application/json');
    });
  });

  it('should render server stats dashboard (/servstats)', () => {
    cy.visit('/servstats');
    cy.get('body').should('exist');
  });

  it('should render user management page (/user)', () => {
    cy.visit('/user');
    cy.get('body').should('exist');
  });

  it('should render download page (/download)', () => {
    cy.visit('/download?IDX=0');
    cy.get('body').should('exist');
  });
});
