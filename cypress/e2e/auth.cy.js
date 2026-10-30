describe('Authentication and User Onboarding E2E Tests', () => {
  beforeEach(() => {
    // Clear cookies before each test to ensure fresh session state
    cy.clearCookies();
  });

  it('should render the login page correctly', () => {
    cy.visit('/');
    cy.get('#login').should('be.visible');
    cy.get('#usernameLabel').should('contain.text', 'Username');
    cy.get('#username').should('be.visible').and('have.attr', 'required');
    cy.get('#passwordLabel').should('contain.text', 'Password');
    cy.get('#password').should('be.visible').and('have.attr', 'type', 'password');
    cy.get('#Login').should('be.visible').and('have.value', 'Log In');
    cy.get('#signup').should('be.visible').and('contain.text', 'Signup');
  });

  it('should navigate to the signup page when clicking the signup link', () => {
    cy.visit('/');
    cy.get('#signup').click();
    cy.url().should('include', '/signup');
    cy.get('#signupForm').should('be.visible');
  });

  it('should render all required fields on the signup page', () => {
    cy.visit('/signup');
    cy.get('#Fname').should('be.visible').and('have.attr', 'required');
    cy.get('#Lname').should('be.visible').and('have.attr', 'required');
    cy.get('#email').should('be.visible').and('have.attr', 'required');
    cy.get('#username').should('be.visible').and('have.attr', 'required');
    cy.get('#password').should('be.visible').and('have.attr', 'required');
    cy.get('input[type="submit"]').should('be.visible').and('have.value', 'submit');
  });

  it('should alert on invalid username format during signup', () => {
    cy.visit('/signup');
    cy.get('#Fname').type('Test');
    cy.get('#Lname').type('User');
    cy.get('#email').type('testuser@example.com');
    cy.get('#username').type('invalid@user!');
    cy.get('#password').type('password123');

    const stub = cy.stub();
    cy.on('window:alert', stub);

    cy.get('#signupForm').submit().then(() => {
      expect(stub.getCall(0)).to.be.calledWith('Invalid username!\n Username must be alphanumeric without white space');
    });
  });

  it('should alert on invalid email format during signup', () => {
    cy.visit('/signup');
    cy.get('#Fname').type('Test');
    cy.get('#Lname').type('User');
    cy.get('#email').type('invalid-email-no-at');
    cy.get('#username').type('validuser123');
    cy.get('#password').type('password123');

    const stub = cy.stub();
    cy.on('window:alert', stub);

    cy.get('#signupForm').submit().then(() => {
      expect(stub.getCall(0)).to.be.calledWith('Invalid Email!');
    });
  });
});
