document.addEventListener("DOMContentLoaded", () => {
  const masthead = document.querySelector(".masthead");
  const menuToggle = document.querySelector(".menu-toggle");

  if (masthead && menuToggle) {
    menuToggle.addEventListener("click", () => {
      const open = masthead.classList.toggle("menu-open");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  const moreMenus = document.querySelectorAll(".nav-more");

  moreMenus.forEach(menu => {
    const button = menu.querySelector(".nav-more-button");
    if (!button) return;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const willOpen = !menu.classList.contains("open");

      moreMenus.forEach(otherMenu => {
        otherMenu.classList.remove("open");
        const otherButton = otherMenu.querySelector(".nav-more-button");
        if (otherButton) otherButton.setAttribute("aria-expanded", "false");
      });

      if (willOpen) {
        menu.classList.add("open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", event => {
    if (event.target.closest(".nav-more")) return;

    moreMenus.forEach(menu => {
      menu.classList.remove("open");
      const button = menu.querySelector(".nav-more-button");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    moreMenus.forEach(menu => {
      menu.classList.remove("open");
      const button = menu.querySelector(".nav-more-button");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  });
});
