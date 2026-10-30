const { parseMultipartFormData } = require('../support/multipart');

function getMultipartFields(request) {
  return parseMultipartFormData(request.body, request.headers['content-type']);
}

describe('Training workflows - network mocking', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  describe('YOLOv3 custom training (/darknet-run)', () => {
    beforeEach(() => {
      cy.visit('/yolo/yolov3Settings?IDX=0');
      cy.injectSelectOption('#Weights', 'yolov3-e2e.weights');
    });

    it('fires the training request with the expected method, URL, and hyperparameter payload', () => {
      cy.intercept('POST', '/darknet-run', {
        statusCode: 200,
        body: { Success: 'YOLO Training Started' },
      }).as('darknetRun');

      cy.get('#batch').clear().type('32');
      cy.get('#subdiv').clear().type('8');
      cy.get('#width').clear().type('320');
      cy.get('#height').clear().type('320');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#Configbtn').click();

      cy.wait('@darknetRun').then(({ request }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.include('/darknet-run');

        const fields = getMultipartFields(request);
        expect(fields.PName).to.eq('e2e-demo-project');
        expect(fields.Admin).to.eq('testadmin');
        expect(fields.weights).to.eq('yolov3-e2e.weights');
        expect(fields.batch).to.eq('32');
        expect(fields.subdiv).to.eq('8');
        expect(fields.width).to.eq('320');
        expect(fields.height).to.eq('320');
        expect(fields.yolo_version).to.eq('3');
        expect(fields.epochs).to.eq('1');
        expect(fields.device).to.eq('cpu');
      });

      cy.get('@alertStub').should('have.been.calledWith', 'YOLO Training Started');
    });

    it('surfaces a backend error via the same alert-based UI feedback', () => {
      cy.intercept('POST', '/darknet-run', {
        statusCode: 200,
        body: { Success: 'ERROR! training failed to start' },
      }).as('darknetRunError');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#Configbtn').click();

      cy.wait('@darknetRunError');
      cy.get('@alertStub').should('have.been.calledWith', 'ERROR! training failed to start');
    });
  });

  describe('YOLOvX custom training (/yolo-run)', () => {
    beforeEach(() => {
      cy.visit('/yolo/yolovXTrainingSettings?IDX=0');
      cy.injectSelectOption('#Weights', 'yolov8n-e2e.pt');
    });

    it('fires the training request with model selection and hyperparameter payload', () => {
      cy.intercept('POST', '/yolo-run', {
        statusCode: 200,
        body: { Success: 'YOLO Training Started' },
      }).as('yoloRun');

      // batch/imgsz carry HTML5 min+step constraints (16 and 640 respectively); values that
      // violate them make the browser block the native submit before any JS handler runs.
      cy.get('#batch').clear().type('32');
      cy.get('#epochs').clear().type('25');
      cy.get('#imgsz').clear().type('1280');
      cy.get('#device').clear().type('cpu');
      cy.get('#yolo_task').select('segment');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#Configbtn').click();

      cy.wait('@yoloRun').then(({ request }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.include('/yolo-run');

        const fields = getMultipartFields(request);
        expect(fields.PName).to.eq('e2e-demo-project');
        expect(fields.Admin).to.eq('testadmin');
        expect(fields.weights).to.eq('yolov8n-e2e.pt');
        expect(fields.batch).to.eq('32');
        expect(fields.epochs).to.eq('25');
        expect(fields.imgsz).to.eq('1280');
        expect(fields.device).to.eq('cpu');
        expect(fields.yolo_task).to.eq('segment');
        expect(fields.yolo_mode).to.eq('train');
        expect(fields.TrainingPercent).to.eq('70');
        expect(fields.ValPercent).to.eq('20');
        expect(fields.TestPercent).to.eq('10');

        const selectedClasses = JSON.parse(fields.selected_classes);
        expect(selectedClasses).to.include.members(['classA', 'classB']);
      });

      cy.get('@alertStub').should('have.been.calledWith', 'YOLO Training Started');
    });

    it('blocks submission client-side when no weights file is selected', () => {
      // Re-visit to get a pristine, unselected Weights dropdown.
      cy.visit('/yolo/yolovXTrainingSettings?IDX=0');

      cy.intercept('POST', '/yolo-run').as('yoloRunNotCalled');
      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#Configbtn').click();

      cy.get('@alertStub').should('have.been.calledWith', 'Must select a weights file');
      cy.get('@yoloRunNotCalled.all').should('have.length', 0);
    });
  });

  describe('Inception custom training via dataset import (/api/projects/import-dataset)', () => {
    beforeEach(() => {
      cy.visit('/createClassification');
    });

    it('fires the import request with the project + classification payload', () => {
      cy.intercept('POST', '/api/projects/import-dataset', {
        statusCode: 200,
        body: { success: true, message: 'Import complete' },
      }).as('importDataset');

      const projectName = 'e2e-inception-import';

      cy.get('#import-type').select('classification');
      cy.get('#project-name').type(projectName);
      cy.get('#dataset-file').selectFile('cypress/fixtures/images-import.zip', { force: true });
      cy.get('#import-form button[type=submit]').click();

      cy.wait('@importDataset').then(({ request }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.include('/api/projects/import-dataset');

        const fields = getMultipartFields(request);
        expect(fields['import-type']).to.eq('classification');
        expect(fields.projectName).to.eq(projectName);
        expect(fields.dbName).to.eq(projectName);
      });

      cy.get('#response-message').should('contain.text', 'Import successful');
    });

    it('renders the backend error message without redirecting', () => {
      cy.intercept('POST', '/api/projects/import-dataset', {
        statusCode: 200,
        body: { success: false, message: 'Dataset failed validation (mocked)' },
      }).as('importDatasetError');

      cy.get('#import-type').select('classification');
      cy.get('#project-name').type('e2e-inception-import-error');
      cy.get('#dataset-file').selectFile('cypress/fixtures/images-import.zip', { force: true });
      cy.get('#import-form button[type=submit]').click();

      cy.wait('@importDatasetError');
      cy.get('#response-message').should('contain.text', 'Dataset failed validation (mocked)');
    });
  });
});
