Cypress.Commands.add('setupProjectContext', (projectName = 'e2e-demo-project') => {
  cy.setCookie('Username', 'testadmin');
  cy.request({
    method: 'POST',
    url: '/createP',
    form: true,
    body: {
      project_name: projectName,
      input_classes: 'classA,classB',
    },
    failOnStatusCode: false,
  });
});

// Ensures `sample.png` exists in the given (already-created) project's image library, via
// the real /addImages upload UI. addImages() is a no-op for filenames that already exist in
// the project (routes/projects/addImages.js), so re-running this across specs/reruns is safe
// and leaves exactly one copy of the fixture image.
Cypress.Commands.add('seedProjectImage', (idx = 0) => {
  cy.setCookie('Username', 'testadmin');
  cy.visit(`/config/imageSettings?IDX=${idx}`);
  cy.get('#upload_images').selectFile('cypress/fixtures/images-import.zip', { force: true });
  cy.get('#addImagesForm button[type=submit]').click();
  // The success handler expects JSON but the endpoint replies with plain text (pre-existing
  // app quirk), so the page-level alert/redirect never fires. The upload + DB insert already
  // completed server-side by the time the response lands, so just wait for that response.
  cy.wait(1000);
});

// Several training/inference <select> elements are populated server-side from files the
// project doesn't have yet in a fresh e2e project (uploaded weights, inference uploads).
// Their submit handlers hard-block on an empty value, so tests inject a realistic option
// to exercise the real submit path instead of re-implementing upload flows for every model.
Cypress.Commands.add('injectSelectOption', (selector, value, label = value) => {
  cy.get(selector).then(($select) => {
    if ($select.find(`option[value="${value}"]`).length === 0) {
      $select.append(new Option(label, value));
    }
  });
  cy.get(selector).select(value);
});
