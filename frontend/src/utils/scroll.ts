export function scrollToElement(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

export function scrollToContact() {
  scrollToElement('contact');
}
