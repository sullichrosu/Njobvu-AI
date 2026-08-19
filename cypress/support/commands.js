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
