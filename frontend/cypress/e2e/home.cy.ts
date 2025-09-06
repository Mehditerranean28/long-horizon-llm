/// <reference types="cypress" />

describe('homepage', () => {
  it('loads the app title', () => {
    cy.visit('/');
    cy.title().should('match', /Sovereign/i);
  });
});
