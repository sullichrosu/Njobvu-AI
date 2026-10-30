const { parseMultipartFormData } = require('../support/multipart');

function getMultipartFields(request) {
  return parseMultipartFormData(request.body, request.headers['content-type']);
}

describe('Inference workflows - network mocking', () => {
  beforeEach(() => {
    cy.setupProjectContext();
  });

  describe('MegaDetector inference (/megadetector-inf)', () => {
    beforeEach(() => {
      cy.visit('/megadetector/settings?IDX=0');
      cy.injectSelectOption('#Inference_md', 'sample-video.mp4');
    });

    it('fires the inference request with model + confidence/fps hyperparameters', () => {
      cy.intercept('POST', '/megadetector-inf', {
        statusCode: 200,
        body: { Success: 'MegaDetector Inference Started' },
      }).as('megadetectorInf');

      cy.get('#model').select('MDV5B');
      cy.get('#threshold').clear().type('0.45');
      cy.get('#fps').clear().type('2.5');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#megadetector-inf button[type=submit]').click();

      cy.wait('@megadetectorInf').then(({ request }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.include('/megadetector-inf');

        const fields = getMultipartFields(request);
        expect(fields.PName).to.eq('e2e-demo-project');
        expect(fields.Admin).to.eq('testadmin');
        expect(fields.model).to.eq('MDV5B');
        expect(fields.threshold).to.eq('0.45');
        expect(fields.fps).to.eq('2.5');
        expect(fields.inference_file).to.eq('sample-video.mp4');
      });

      cy.get('@alertStub').should('have.been.calledWith', 'MegaDetector Inference Started');
    });

    it('surfaces a backend error via the same alert-based UI feedback', () => {
      cy.intercept('POST', '/megadetector-inf', {
        statusCode: 200,
        body: { Success: 'ERROR! inference failed to start' },
      }).as('megadetectorInfError');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#megadetector-inf button[type=submit]').click();

      cy.wait('@megadetectorInfError');
      cy.get('@alertStub').should('have.been.calledWith', 'ERROR! inference failed to start');
    });
  });

  describe('Inception inference (/inception-inf)', () => {
    beforeEach(() => {
      cy.visit('/inference/inceptionSettings?IDX=0');
      cy.injectSelectOption('#Weights_inf', 'inception-e2e.pt');
      cy.injectSelectOption('#Inference', 'sample-image.jpg');
    });

    it('fires the inference request with weights + top-K payload', () => {
      cy.intercept('POST', '/inception-inf', {
        statusCode: 200,
        body: { Success: 'Inception Inference Started' },
      }).as('inceptionInf');

      cy.get('#TopK').clear().type('5');
      cy.get('#ImageNet').check({ force: true });

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#inception-inf button[type=submit]').click();

      cy.wait('@inceptionInf').then(({ request }) => {
        expect(request.method).to.eq('POST');
        expect(request.url).to.include('/inception-inf');

        const fields = getMultipartFields(request);
        expect(fields.PName).to.eq('e2e-demo-project');
        expect(fields.Admin).to.eq('testadmin');
        expect(fields.weights).to.eq('inception-e2e.pt');
        expect(fields.inference_file).to.eq('sample-image.jpg');
        expect(fields.topK).to.eq('5');
        expect(fields.using_imagenet_classes).to.eq('true');
      });

      cy.get('@alertStub').should('have.been.calledWith', 'Inception Inference Started');
    });

    it('surfaces a backend error via the same alert-based UI feedback', () => {
      cy.intercept('POST', '/inception-inf', {
        statusCode: 200,
        body: { Success: 'ERROR! inference failed to start' },
      }).as('inceptionInfError');

      cy.window().then((win) => cy.stub(win, 'alert').as('alertStub'));

      cy.get('#inception-inf button[type=submit]').click();

      cy.wait('@inceptionInfError');
      cy.get('@alertStub').should('have.been.calledWith', 'ERROR! inference failed to start');
    });
  });
});
