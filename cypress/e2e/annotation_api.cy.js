// The annotate page's Save button is a plain <form method="post"> submission (no fetch/XHR,
// no enctype override -- see views/annotate.ejs), so the browser encodes it as
// application/x-www-form-urlencoded instead of the multipart bodies used by the
// training/inference forms. Parse accordingly.
function parseUrlEncodedFields(request) {
  const raw = request.body;

  if (typeof raw !== 'string') {
    return raw || {};
  }

  const params = new URLSearchParams(raw);
  const fields = {};

  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      fields[key] = [].concat(fields[key], value);
    } else {
      fields[key] = value;
    }
  }

  return fields;
}

const PROJECT_NAME = 'e2e-demo-project';
const IMAGE_NAME = 'sample.png';

describe('Annotation save/update workflow - network mocking', () => {
  before(() => {
    cy.setupProjectContext(PROJECT_NAME);
    cy.seedProjectImage(0);

    // Seed one real label via the real (unmocked) endpoint so the annotate page has an
    // existing bounding box to re-save, giving the network-mocked test below a realistic,
    // non-empty payload to assert on.
    cy.request({
      method: 'POST',
      url: '/updateLabels',
      form: true,
      failOnStatusCode: false,
      body: {
        PName: PROJECT_NAME,
        Admin: 'testadmin',
        user: 'testadmin',
        IDX: '0',
        IName: IMAGE_NAME,
        rev_image: '0',
        prev_IName: '-1',
        next_IName: '-1',
        origin_image_width: '4',
        image_width: '4',
        labels_counter: '0',
        curr_class: 'classA',
        CName: 'classA',
        X: '1',
        Y: '1',
        W: '2',
        H: '2',
        // updateLabels() only inserts as many labels as LabelingID entries it receives (an
        // empty string is falsy and normalizes to a zero-length array, silently skipping the
        // insert) -- the actual value is unused for the insert itself, so any non-empty
        // placeholder works.
        LabelingID: '0',
        form_action: 'save',
      },
    });
  });

  beforeEach(() => {
    cy.setCookie('Username', 'testadmin');
    cy.visit(`/project/annotate?IDX=0&IName=${IMAGE_NAME}&curr_class=classA`);
  });

  it('fires the save request with the annotation payload and follows a successful redirect', () => {
    cy.intercept('POST', '/updateLabels', {
      statusCode: 302,
      headers: {
        location: `/project/annotate?IDX=0&IName=${IMAGE_NAME}&curr_class=classA&mocked=success`,
      },
    }).as('updateLabels');

    cy.get('#form-save').click();

    cy.wait('@updateLabels').then(({ request }) => {
      expect(request.method).to.eq('POST');
      expect(request.url).to.include('/updateLabels');

      const fields = parseUrlEncodedFields(request);
      expect(fields.PName).to.eq(PROJECT_NAME);
      expect(fields.Admin).to.eq('testadmin');
      expect(fields.IName).to.eq(IMAGE_NAME);
      expect(fields.curr_class).to.eq('classA');
      expect(fields.form_action).to.eq('save');
      expect(fields.labels_counter).to.eq('1');
      expect(fields.CName).to.eq('classA');
      expect(fields.X).to.eq('1');
      expect(fields.Y).to.eq('1');
      expect(fields.W).to.eq('2');
      expect(fields.H).to.eq('2');
    });

    cy.url().should('include', 'mocked=success');
  });

  it('renders the backend error response when the save fails', () => {
    // The real backend's error path is a 500 (routes/labelling/updateLabels.js), but stubbing
    // a non-2xx response for this full-page form navigation makes Chrome's page-load event
    // hang under Cypress's network layer. Stubbing 200 with the same error body still proves
    // the frontend has no client-side handling for this path -- it just renders whatever the
    // server sends back, success or failure alike.
    cy.intercept('POST', '/updateLabels', {
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      body: 'Error updating labels (mocked)',
    }).as('updateLabelsError');

    cy.get('#form-save').click();

    cy.wait('@updateLabelsError');
    cy.contains('Error updating labels (mocked)').should('be.visible');
  });
});
