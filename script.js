document.addEventListener('DOMContentLoaded', function() {
    console.log('Página cargada correctamente');

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
    
    // Ajuste dinámico del carrusel para desktop y móvil
    function adjustCarouselPosition() {
        const carouselSection = document.querySelector('.carousel-section');
        const header = document.querySelector('.header');
        const abonamientoBanner = document.querySelector('.abonamiento-banner');
        
        if (carouselSection && header) {
            // Altura del viewport
            const viewportHeight = window.innerHeight;
            
            // Obtener la altura real del header sticky
            const headerHeight = header.offsetHeight;
            
            // Obtener la altura del banner de abonamiento (si existe)
            const bannerHeight = abonamientoBanner ? abonamientoBanner.offsetHeight : 0;
            
            // Obtener el padding-top de carousel-section (40px)
            const paddingTop = 40;
            
            // Calcular la altura de la imagen del carrusel según el breakpoint
            // Desktop: tarjetas de 300px de ancho; Móvil: 250px
            const cardWidth = window.innerWidth > 768 ? 300 : 250;
            const imageHeight = cardWidth * (9 / 16);
            
            // Calcular el margin-top necesario
            const marginTop = viewportHeight - headerHeight - bannerHeight - paddingTop - imageHeight;
            
            // Aplicar el margin-top calculado con !important para sobrescribir CSS
            carouselSection.style.setProperty('margin-top', `${marginTop}px`, 'important');
            
            // Log para debug
            console.log(`Viewport: ${viewportHeight}px, Header: ${headerHeight}px, Banner: ${bannerHeight}px, CardWidth: ${cardWidth}px, ImageHeight: ${imageHeight}px, Calculated margin-top: ${marginTop}px`);
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
        
        // Cerrar menú al hacer clic en un enlace
        const navLinks = document.querySelectorAll('.nav a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                nav.classList.remove('active');
            });
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
