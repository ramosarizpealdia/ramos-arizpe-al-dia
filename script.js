document.addEventListener("DOMContentLoaded", () => {
  const masthead = document.querySelector(".masthead");
  const toggle = document.querySelector(".menu-toggle");
  if (masthead && toggle) {
    toggle.addEventListener("click", () => {
      const open = masthead.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll(".nav-more-button").forEach(button => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const parent = button.closest(".nav-more");
      const open = parent.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-more")) {
      document.querySelectorAll(".nav-more.open").forEach(el => {
        el.classList.remove("open");
        const btn = el.querySelector(".nav-more-button");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
    }
  });
});
