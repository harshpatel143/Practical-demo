/* ==========================================
   Reduced Motion Preference
========================================== */

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/* ==========================================
   Mobile Show More / Show Less
========================================== */

function initShowMore() {
  const button = document.getElementById("showMoreBtn");

  if (!button) return;

  let expanded = false;

  button.addEventListener("click", () => {
    expanded = !expanded;

    const hiddenProducts =
      document.querySelectorAll(".mobile-hidden");

    hiddenProducts.forEach((product) => {
      product.classList.toggle("show");
    });

    button.textContent = expanded
      ? "Show Less"
      : "Show More";

    button.setAttribute(
      "aria-expanded",
      expanded.toString()
    );
  });
}

/* ==========================================
   Desktop Swiper
========================================== */

let swiper = null;

function initSwiper() {
  if (window.innerWidth >= 768) {

    if (!swiper) {

      swiper = new Swiper(".productSwiper", {

        slidesPerView: 4.8,
        spaceBetween: 24,

        speed: prefersReducedMotion
          ? 0
          : 500,

        mousewheel: {
          forceToAxis: true,
        },

        keyboard: {
          enabled: true,
          onlyInViewport: true,
        },

        a11y: {
          enabled: true,
        },

        scrollbar: {
          el: ".swiper-scrollbar",
          draggable: true,
          hide: false,
        },

        watchOverflow: true,

        observer: true,
        observeParents: true,

      });

    }

  } else {

    if (swiper) {
      swiper.destroy(true, true);
      swiper = null;
    }

  }
}

/* ==========================================
   Resize Handler
========================================== */

function handleResize() {
  initSwiper();
}

window.addEventListener("resize", handleResize);

/* ==========================================
   Initialize Application
========================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initShowMore();

    initSwiper();

  }
);