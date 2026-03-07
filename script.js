document.addEventListener('DOMContentLoaded', function() {
    console.log('Página cargada correctamente');

    // Highlight active nav link based on current page (desktop underline)
    (function highlightActiveNav() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const clubPages = ['noticias.html', 'historia.html', 'organigrama.html', 'enprensa.html'];

        // Direct nav links (EQUIPOS, ABÓNATE, PATROCINADORES, CONTACTO)
        document.querySelectorAll('.nav > a').forEach(function(link) {
            const href = link.getAttribute('href');
            if (href) {
                const linkPage = href.split('/').pop();
                if (linkPage === currentPage) {
                    link.classList.add('nav-active');
                }
            }
        });

        // If current page is under CLUB dropdown, highlight the CLUB toggle
        if (clubPages.indexOf(currentPage) !== -1) {
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
    
    // Ajuste dinámico del espaciador para que el borde superior de las imágenes
    // del carrusel quede justo en el límite inferior del viewport
    function adjustCarouselPosition() {
        const spacer = document.querySelector('.carousel-spacer');
        const header = document.querySelector('.header');
        const matchBanner = document.querySelector('.match-banner');
        const abonamientoBanner = document.querySelector('.abonamiento-banner');
        const carouselSection = document.querySelector('.carousel-section');
        
        if (spacer && header) {
            // Altura del viewport
            const viewportHeight = window.innerHeight;
            
            // Obtener la altura real del header sticky
            const headerHeight = header.offsetHeight;
            
            // Obtener la altura del banner de próximo partido (si existe)
            const matchBannerHeight = matchBanner ? matchBanner.offsetHeight : 0;
            
            // Obtener la altura del banner de abonamiento (si existe)
            const bannerHeight = abonamientoBanner ? abonamientoBanner.offsetHeight : 0;
            
            // Padding-top del carousel-section
            const paddingTop = carouselSection ? parseInt(getComputedStyle(carouselSection).paddingTop) || 0 : 0;
            
            // El área visible debajo del header sticky = viewportHeight - headerHeight
            // Esa área debe contener: matchBanner + spacer + buttons + carousel padding
            // El borde superior de las imágenes queda justo al final del viewport
            const spacerHeight = viewportHeight - headerHeight - matchBannerHeight - bannerHeight - paddingTop;
            
            spacer.style.height = `${Math.max(0, spacerHeight)}px`;
        }
    }
    
    // Ejecutar después de que todo el contenido esté cargado
    window.addEventListener('load', adjustCarouselPosition);
    
    // Reajustar al cambiar el tamaño de la ventana
    window.addEventListener('resize', adjustCarouselPosition);
    
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
    
    // Iniciar carrusel infinito al cargar
    window.addEventListener('load', setupInfiniteCarousel);
    
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
});
