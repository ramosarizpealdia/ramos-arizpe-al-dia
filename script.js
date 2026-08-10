const button = document.querySelector('.menu-toggle');
const shell = document.querySelector('.nav-shell');
button?.addEventListener('click', () => {
  const open = shell.classList.toggle('open');
  button.setAttribute('aria-expanded', String(open));
});
const dateEl = document.querySelector('#current-date');
if (dateEl) {
  const now = new Date();
  const text = new Intl.DateTimeFormat('es-MX', {weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now);
  dateEl.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}
