/* ==========================================
   Image Hover Swap
========================================== */

function initImageHover() {
  const images = document.querySelectorAll(".product-image");

  images.forEach((image) => {
    const primary = image.dataset.primary;
    const hover = image.dataset.hover;

    image.addEventListener("mouseenter", () => {
      image.src = hover;
    });

    image.addEventListener("mouseleave", () => {
      image.src = primary;
    });

    // Touch devices
    image.addEventListener(
      "touchstart",
      () => {
        image.src = hover;
      },
      { passive: true }
    );

    image.addEventListener(
      "touchend",
      () => {
        image.src = primary;
      },
      { passive: true }
    );
  });
}

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
        slidesPerView: 5,
        spaceBetween: 24,

        speed: 500,

        mousewheel: {
          forceToAxis: true,
        },

        keyboard: {
          enabled: true,
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
   Initialize App
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  initImageHover();
  initShowMore();
  initSwiper();

  window.addEventListener("resize", () => {
    initSwiper();
  });
});