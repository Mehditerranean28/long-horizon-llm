/// <reference types="cypress" />

describe('query input', () => {
  it('accepts typing', () => {
    cy.visit('/');
    cy.get('textarea[aria-label="Query Input"]').type('hello');
    cy.get('textarea[aria-label="Query Input"]').should('have.value', 'hello');
  });
});
