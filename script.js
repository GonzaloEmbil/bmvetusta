document.addEventListener('DOMContentLoaded', function() {
    console.log('Página cargada correctamente');

    // Highlight active nav link based on current page (desktop underline)
    (function highlightActiveNav() {
        // Extract the folder name from the URL path (e.g. /equipos/ → 'equipos', /noticias/article.html → 'noticias')
        var pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
        var currentFolder = pathParts[pathParts.length - 1] || '';
        // If we're on a specific article page inside noticias/, detect the parent folder
        if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'noticias' && currentFolder !== 'noticias') {
            currentFolder = 'noticias';
        }
        var clubPages = ['noticias', 'historia', 'organigrama', 'enprensa'];

        // Direct nav links (EQUIPOS, ABÓNATE, PATROCINADORES, CONTACTO)
        document.querySelectorAll('.nav > a').forEach(function(link) {
            var href = link.getAttribute('href');
            if (href) {
                var hrefParts = href.replace(/\/+$/, '').split('/');
                var linkFolder = hrefParts[hrefParts.length - 1] || '';
                if (linkFolder && linkFolder === currentFolder) {
                    link.classList.add('nav-active');
                }
            }
        });

        // If current page is under CLUB dropdown, highlight the CLUB toggle
        if (clubPages.indexOf(currentFolder) !== -1) {
            var dropdown = document.querySelector('.nav-dropdown');
            if (dropdown) {
                dropdown.classList.add('nav-active');
            }
        }
    })();

    // Loading screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        window.addEventListener('load', () => {
            loadingScreen.classList.add('fade-out');
            loadingScreen.addEventListener('transitionend', () => {
                loadingScreen.style.display = 'none';
            });
        });
    }
    
    // REGLA PERMANENTE: El borde superior de las imágenes del carrusel de equipos
    // debe quedar EXACTAMENTE en el límite inferior del viewport al cargar la página.
    // Esto debe funcionar en cualquier navegador y resolución desktop.
    //
    // Approach: The .above-fold div contains the news carousel + buttons.
    // We set its height so that the .carousel-container starts right at
    // window.innerHeight (below the sticky header + match banner).
    var _adjusting = false;
    function adjustCarouselPosition() {
        if (_adjusting) return;
        _adjusting = true;

        var aboveFold = document.querySelector('.above-fold');
        var carouselContainer = document.querySelector('.carousel-container');
        var header = document.querySelector('.header');
        var matchBanner = document.querySelector('.match-banner');

        if (!aboveFold || !carouselContainer) { _adjusting = false; return; }

        // Only apply the fixed-height constraint on desktop (>768px).
        // On mobile the rule doesn't apply — use natural flow.
        if (window.innerWidth <= 768) {
            aboveFold.style.height = 'auto';
            _adjusting = false;
            return;
        }

        // Reset to auto to measure natural content height
        aboveFold.style.height = 'auto';
        aboveFold.offsetHeight; // force reflow

        // Available space = viewport - header (sticky) - matchBanner - carousel-section padding-top
        var headerH = header ? header.offsetHeight : 0;
        var matchH = matchBanner ? matchBanner.offsetHeight : 0;
        var carouselSection = document.querySelector('.carousel-section');
        var csPadTop = carouselSection ? parseInt(getComputedStyle(carouselSection).paddingTop) || 0 : 0;
        var available = window.innerHeight - headerH - matchH - csPadTop;

        // ALWAYS set to exactly 'available' so the team carousel top sits at the viewport bottom.
        // The flex-shrink chain inside above-fold will compress the news image to fit.
        aboveFold.style.height = Math.max(0, available) + 'px';

        _adjusting = false;
    }

    // Debounced version for observers
    var _adjustTimer = null;
    function debouncedAdjust() {
        clearTimeout(_adjustTimer);
        _adjustTimer = setTimeout(adjustCarouselPosition, 50);
    }

    // Run immediately on DOMContentLoaded (now)
    adjustCarouselPosition();

    // Run again on full load (all images, fonts, iframes done)
    window.addEventListener('load', function() {
        adjustCarouselPosition();
        setTimeout(adjustCarouselPosition, 300);
        setTimeout(adjustCarouselPosition, 800);
        setTimeout(adjustCarouselPosition, 2000);
    });

    // Re-run on resize (debounced)
    window.addEventListener('resize', debouncedAdjust);

    // Re-run whenever any image finishes loading
    document.querySelectorAll('img').forEach(function(img) {
        if (!img.complete) {
            img.addEventListener('load', adjustCarouselPosition);
        }
    });
    
    // Carrusel infinito suave con JavaScript
    function setupInfiniteCarousel() {
        const track = document.querySelector('.carousel-track');
        const cards = document.querySelectorAll('.carousel-card');
        
        if (track && cards.length > 0) {
            // Calcular el ancho de una tarjeta + gap
            const cardWidth = 300; // ancho fijo de cada tarjeta
            const gap = 30; // gap entre tarjetas
            const cardTotalWidth = cardWidth + gap;
            
            // Número de tarjetas originales (mitad del total)
            const originalCardsCount = cards.length / 2;
            
            // Ancho total a desplazar para volver al inicio
            const resetPoint = originalCardsCount * cardTotalWidth;
            
            let currentTranslate = 0;
            const speed = 0.5; // píxeles por frame (ajustar para velocidad)
            
            function animate() {
                currentTranslate += speed;
                
                // Si llegamos al punto de reset, volver al inicio sin salto visible
                if (currentTranslate >= resetPoint) {
                    currentTranslate = 0;
                }
                
                track.style.transform = `translateX(-${currentTranslate}px)`;
                requestAnimationFrame(animate);
            }
            
            // Iniciar la animación
            animate();
            
            // Pausar al hacer hover
            track.addEventListener('mouseenter', () => {
                track.style.animationPlayState = 'paused';
            });
            
            track.addEventListener('mouseleave', () => {
                track.style.animationPlayState = 'running';
            });
        }
    }
    
    // Carrusel infinito de patrocinadores (sentido inverso)
    function setupSponsorsCarousel() {
        const track = document.querySelector('.sponsors-carousel-track');
        const cards = track ? track.querySelectorAll('.sponsor-link') : [];
        
        if (track && cards.length > 0) {
            const cardWidth = 220; // ancho fijo de cada tarjeta (matches CSS)
            const gap = 30; // gap entre tarjetas
            const cardTotalWidth = cardWidth + gap;
            
            const originalCardsCount = cards.length / 2;
            const resetPoint = originalCardsCount * cardTotalWidth;
            
            // Empezar desplazado (para moverse hacia la derecha)
            let currentTranslate = resetPoint;
            const speed = 0.5; // misma velocidad que el carrusel de equipos
            
            function animate() {
                currentTranslate -= speed; // sentido inverso (derecha a izquierda → izquierda a derecha)
                
                if (currentTranslate <= 0) {
                    currentTranslate = resetPoint;
                }
                
                track.style.transform = `translateX(-${currentTranslate}px)`;
                requestAnimationFrame(animate);
            }
            
            animate();
            
            track.addEventListener('mouseenter', () => {
                track.style.animationPlayState = 'paused';
            });
            
            track.addEventListener('mouseleave', () => {
                track.style.animationPlayState = 'running';
            });
        }
    }

    // Iniciar carruseles infinitos al cargar
    window.addEventListener('load', function() {
        setupInfiniteCarousel();
        setupSponsorsCarousel();
    });
    
    // Menú hamburguesa
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('.nav');
    
    if (hamburger && nav) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            nav.classList.toggle('active');
        });
        
        // Cerrar menú al hacer clic en un enlace (excepto dropdown toggles)
        const navLinks = document.querySelectorAll('.nav a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                nav.classList.remove('active');
            });
        });
    }

    // Dropdown "El Club" — toggle only on desktop (mobile is always expanded via CSS)
    const dropdownToggle = document.querySelector('.nav-dropdown-toggle');
    const navDropdown = document.querySelector('.nav-dropdown');
    
    if (dropdownToggle && navDropdown) {
        dropdownToggle.addEventListener('click', function(e) {
            if (window.innerWidth > 768) {
                e.preventDefault();
                e.stopPropagation();
                navDropdown.classList.toggle('active');
            }
        });

        // Cerrar dropdown al hacer clic fuera (solo desktop)
        document.addEventListener('click', function(e) {
            if (window.innerWidth > 768 && !navDropdown.contains(e.target)) {
                navDropdown.classList.remove('active');
            }
        });
    }
    
    // Carrusel táctil solo en móvil
    const carouselContainer = document.querySelector('.carousel-container');
    const carouselTrack = document.querySelector('.carousel-track');
    
    if (window.innerWidth <= 768 && carouselContainer && carouselTrack) {
        let isDown = false;
        let startX;
        let scrollLeft;
        let currentTransform = 0;
        
        // Habilitar scroll horizontal
        carouselContainer.style.overflowX = 'auto';
        carouselContainer.style.cursor = 'grab';
        
        // Detener la animación en móvil
        carouselTrack.style.animation = 'none';
        
        carouselContainer.addEventListener('mousedown', (e) => {
            isDown = true;
            carouselContainer.style.cursor = 'grabbing';
            startX = e.pageX - carouselContainer.offsetLeft;
            scrollLeft = carouselContainer.scrollLeft;
        });
        
        carouselContainer.addEventListener('mouseleave', () => {
            isDown = false;
            carouselContainer.style.cursor = 'grab';
        });
        
        carouselContainer.addEventListener('mouseup', () => {
            isDown = false;
            carouselContainer.style.cursor = 'grab';
        });
        
        carouselContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carouselContainer.offsetLeft;
            const walk = (x - startX) * 2;
            carouselContainer.scrollLeft = scrollLeft - walk;
        });
        
        // Touch events para móvil
        carouselContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].pageX - carouselContainer.offsetLeft;
            scrollLeft = carouselContainer.scrollLeft;
        });
        
        carouselContainer.addEventListener('touchmove', (e) => {
            const x = e.touches[0].pageX - carouselContainer.offsetLeft;
            const walk = (x - startX) * 2;
            carouselContainer.scrollLeft = scrollLeft - walk;
        });
    }

    // News Carousel (Homepage)
    (function setupNewsCarousel() {
        const viewport = document.querySelector('.news-carousel-viewport');
        const slidesContainer = document.querySelector('.news-carousel-slides');
        const slides = document.querySelectorAll('.news-carousel-slide');
        const prevBtn = document.querySelector('.news-carousel-prev');
        const nextBtn = document.querySelector('.news-carousel-next');
        const dotsContainer = document.querySelector('.news-carousel-dots');

        if (!slidesContainer || slides.length === 0) return;

        let currentIndex = 0;
        const totalSlides = slides.length;
        const autoPlayInterval = 8000; // 8 seconds
        let autoPlayTimer;

        // Create dots
        slides.forEach(function(_, i) {
            const dot = document.createElement('button');
            dot.classList.add('news-carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.setAttribute('aria-label', 'Noticia ' + (i + 1));
            dot.addEventListener('click', function() {
                goToSlide(i);
                resetAutoPlay();
            });
            dotsContainer.appendChild(dot);
        });

        function goToSlide(index) {
            currentIndex = index;
            slidesContainer.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
            // Update dots
            var dots = dotsContainer.querySelectorAll('.news-carousel-dot');
            dots.forEach(function(d, i) {
                d.classList.toggle('active', i === currentIndex);
            });
        }

        function nextSlide() {
            goToSlide((currentIndex + 1) % totalSlides);
        }

        function prevSlide() {
            goToSlide((currentIndex - 1 + totalSlides) % totalSlides);
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                nextSlide();
                resetAutoPlay();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                prevSlide();
                resetAutoPlay();
            });
        }

        function startAutoPlay() {
            autoPlayTimer = setInterval(nextSlide, autoPlayInterval);
        }

        function resetAutoPlay() {
            clearInterval(autoPlayTimer);
            startAutoPlay();
        }

        // Start auto-play
        startAutoPlay();

        // Pause on hover
        if (viewport) {
            viewport.addEventListener('mouseenter', function() {
                clearInterval(autoPlayTimer);
            });
            viewport.addEventListener('mouseleave', function() {
                startAutoPlay();
            });
        }

        // Swipe support for mobile
        var touchStartX = 0;
        var touchEndX = 0;

        if (viewport) {
            viewport.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            viewport.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].screenX;
                var diff = touchStartX - touchEndX;
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        nextSlide();
                    } else {
                        prevSlide();
                    }
                    resetAutoPlay();
                }
            }, { passive: true });
        }
    })();
});
