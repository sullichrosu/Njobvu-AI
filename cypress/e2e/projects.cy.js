describe('Project Management & Settings E2E Tests', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  describe('Project Creation Page (/create)', () => {
    it('should load project creation page with flow tabs', () => {
      cy.visit('/create');
      cy.get('#create').should('be.visible');
      cy.get('#tab-blank').should('be.visible').and('have.class', 'active');
      cy.get('#tab-yolo').should('be.visible');
      cy.get('#tab-kwcoco').should('be.visible');
      cy.get('#tab-ifcb').should('be.visible');
      cy.get('#tab-bootstrap').should('be.visible');
      cy.get('#tab-s3').should('be.visible');
    });

    it('should render blank project form fields correctly', () => {
      cy.visit('/create');
      cy.get('#blankForm').should('be.visible');
      cy.get('#blank_project_name').should('be.visible').and('have.attr', 'required');
      cy.get('#blank_upload_images').should('be.visible');
      cy.get('#blank_input_classes').should('be.visible').and('have.attr', 'required');
      cy.get('#blankForm input[type="submit"]').should('be.visible');
    });

    it('should switch tabs to YOLO Archive form when clicked', () => {
      cy.visit('/create');
      cy.get('#tab-yolo').click();
      cy.get('#tab-yolo').should('have.class', 'active');
      cy.get('#yoloForm').should('be.visible');
      cy.get('#yolo_project_name').should('be.visible');
      cy.get('#yolo_task_type').should('be.visible');
      cy.get('#yolo_archive').should('be.visible');
    });
  });

  describe('Classification Creation Page (/createClassification)', () => {
    it('should load classification creation page', () => {
      cy.visit('/createClassification');
      cy.get('body').should('exist');
    });
  });

  describe('Project Settings Configuration Pages (/config)', () => {
    it('should render main config page options', () => {
      cy.visit('/config?IDX=0');
      cy.get('#config').should('exist');
    });

    it('should render project settings subpage (/config/projSettings)', () => {
      cy.visit('/config/projSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render class settings subpage (/config/classSettings)', () => {
      cy.visit('/config/classSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render access settings subpage (/config/accessSettings)', () => {
      cy.visit('/config/accessSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render image settings subpage (/config/imageSettings)', () => {
      cy.visit('/config/imageSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render merge settings subpage (/config/mergeSettings)', () => {
      cy.visit('/config/mergeSettings?IDX=0');
      cy.get('body').should('exist');
    });
  });
});
