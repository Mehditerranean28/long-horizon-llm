/// <reference types="cypress" />

describe('upload page', () => {
  it('contains a file input', () => {
    cy.visit('/upload');
    cy.get('#file-input').should('exist');
  });
});
