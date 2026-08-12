document.addEventListener("DOMContentLoaded", () => {
  const masthead = document.querySelector(".masthead");
  const menuToggle = document.querySelector(".menu-toggle");

  if (masthead && menuToggle) {
    menuToggle.addEventListener("click", () => {
      const open = masthead.classList.toggle("menu-open");
      menuToggle.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll(".nav-more").forEach(menu => {
    const button = menu.querySelector(".nav-more-button");
    const panel = menu.querySelector(".nav-more-menu");
    if (!button || !panel) return;

    // Garantiza que las secciones nunca aparezcan sueltas en la barra.
    panel.hidden = true;
    menu.classList.remove("open");
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const willOpen = panel.hidden;

      document.querySelectorAll(".nav-more").forEach(other => {
        const otherButton = other.querySelector(".nav-more-button");
        const otherPanel = other.querySelector(".nav-more-menu");
        other.classList.remove("open");
        if (otherPanel) otherPanel.hidden = true;
        if (otherButton) otherButton.setAttribute("aria-expanded", "false");
      });

      if (willOpen) {
        panel.hidden = false;
        menu.classList.add("open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });

  function closeMoreMenus() {
    document.querySelectorAll(".nav-more").forEach(menu => {
      const button = menu.querySelector(".nav-more-button");
      const panel = menu.querySelector(".nav-more-menu");
      menu.classList.remove("open");
      if (panel) panel.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".nav-more")) closeMoreMenus();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMoreMenus();
  });
});
