(function () {
  const navWrap = document.querySelector('.nav-wrap');
  const navToggle = document.querySelector('.nav-toggle');
  const form = document.getElementById('signtralContactForm');
  const formNote = document.getElementById('formNote');

  if (navToggle && navWrap) {
    navToggle.addEventListener('click', function () {
      const isOpen = navWrap.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  document.querySelectorAll('.site-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (navWrap) navWrap.classList.remove('open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  const routes = window.SIGNTRAL_ROUTES || {};
  const routeLinks = document.querySelectorAll('.route-link');

  routeLinks.forEach(function (link) {
    const key = link.getAttribute('data-route');
    const target = routes[key];

    if (target) {
      link.setAttribute('href', target);
    }
  });

  const contactEmail = window.SIGNTRAL_CONTACT_EMAIL || 'hello@signtral.in';

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const phone = (data.get('phone') || '').toString().trim();
      const company = (data.get('company') || '').toString().trim();
      const interest = (data.get('interest') || '').toString().trim();
      const nextStep = (data.get('nextStep') || '').toString().trim();
      const message = (data.get('message') || '').toString().trim();

      if (!name || !email || !company || !interest || !nextStep || !message) {
        if (formNote) {
          formNote.textContent = 'Please complete the required fields before sending your enquiry.';
        }
        return;
      }

      const lines = [
        'Name: ' + name,
        'Email: ' + email,
        'Company: ' + company,
        'Interest: ' + interest,
        'Preferred next step: ' + nextStep
      ];

      if (phone) {
        lines.push('Phone: ' + phone);
      }

      lines.push('', 'Message:', message);

      const subject = encodeURIComponent('Signtral enquiry — ' + interest);
      const body = encodeURIComponent(lines.join('\n'));

      window.location.href = 'mailto:' + contactEmail + '?subject=' + subject + '&body=' + body;

      if (formNote) {
        formNote.textContent = 'Your email app should open now. Update the contact email in config.js if needed.';
      }
    });
  }
})();
