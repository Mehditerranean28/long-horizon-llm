/// <reference types="cypress" />

describe('theme switcher', () => {
  it('is visible on the homepage', () => {
    cy.visit('/');
    cy.get('[title="Select Theme"]').should('be.visible');
  });
});
