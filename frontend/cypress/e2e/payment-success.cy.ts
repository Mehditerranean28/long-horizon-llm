/// <reference types="cypress" />

describe('payment success page', () => {
  it('shows confirmation text', () => {
    cy.visit('/payment-success');
    cy.contains(/Payment Confirmed/i).should('be.visible');
  });
});
