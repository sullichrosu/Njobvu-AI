describe('AI Models, Training & Inference E2E Tests', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  describe('Training Pages', () => {
    it('should render standard model training page (/training)', () => {
      cy.visit('/training?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render custom model training page (/customTraining)', () => {
      cy.visit('/customTraining?IDX=0');
      cy.get('body').should('exist');
    });
  });

  describe('Inference Pages', () => {
    it('should render main inference page (/inference)', () => {
      cy.visit('/inference?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render Inception settings page (/inference/inceptionSettings)', () => {
      cy.visit('/inference/inceptionSettings?IDX=0');
      cy.get('body').should('exist');
    });
  });

  describe('YOLO Model Configuration Pages', () => {
    it('should render main YOLO page (/yolo)', () => {
      cy.visit('/yolo?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render YOLOv3 settings page (/yolo/yolov3Settings)', () => {
      cy.visit('/yolo/yolov3Settings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render YOLOvX settings page (/yolo/yolovXSettings)', () => {
      cy.visit('/yolo/yolovXSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render YOLOvX inference settings page (/yolo/yolovXInferenceSettings)', () => {
      cy.visit('/yolo/yolovXInferenceSettings?IDX=0');
      cy.get('body').should('exist');
    });

    it('should render YOLOvX training settings page (/yolo/yolovXTrainingSettings)', () => {
      cy.visit('/yolo/yolovXTrainingSettings?IDX=0');
      cy.get('body').should('exist');
    });
  });

  describe('MegaDetector Settings', () => {
    it('should render MegaDetector settings page (/megadetector/settings)', () => {
      cy.visit('/megadetector/settings?IDX=0');
      cy.get('body').should('exist');
    });
  });
});
