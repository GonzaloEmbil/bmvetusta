// Cloudflare Rocket Loader, activo en la zona, vuelve a disparar
// DOMContentLoaded y load cuando termina con los scripts que aún gestiona.
// Este archivo ya no pasa por él (data-cfasync="false") y arranca solo, así
// que sin esta guarda todo se iniciaba dos veces: el menú hamburguesa se
// abría y cerraba en el mismo toque, el carrusel doblaba sus temporizadores…
document.addEventListener('DOMContentLoaded', function() {
    if (window.__bmvIniciado) return;
    window.__bmvIniciado = true;
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
        var clubPages = ['noticias', 'historia', 'organigrama', 'enprensa', 'contacto'];

        // Direct nav links (EQUIPOS, CANTERA, ABÓNATE, PATROCINIOS)
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
    // Pantalla de carga: se quita en cuanto lo de arriba está listo, no cuando
    // ha bajado la página entera (antes esperaba al evento load, es decir, a
    // todas las imágenes, también las que no se ven: varios segundos en
    // móvil). «Listo» es el HTML ya montado (estamos en DOMContentLoaded) y,
    // si la hay, la foto de la noticia visible del carrusel. Como mucho se
    // espera 1,5 s por esa foto; el evento load queda de red de seguridad.
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        let quitada = false;
        const quitar = () => {
            if (quitada) return;
            quitada = true;
            loadingScreen.classList.add('fade-out');
            loadingScreen.addEventListener('transitionend', () => {
                loadingScreen.style.display = 'none';
            });
        };
        const foto = document.querySelector('.news-carousel-slide.active img');
        if (!foto || foto.complete) {
            quitar();
        } else {
            foto.addEventListener('load', quitar);
            foto.addEventListener('error', quitar);
            setTimeout(quitar, 1500);
        }
        window.addEventListener('load', quitar);
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

        // Measure where the teams carousel actually starts and grow/shrink the
        // above-fold so its top edge lands exactly at the viewport bottom.
        // Measuring the real position (instead of summing header + banner +
        // paddings) self-corrects sub-pixel/margin drift that was leaving a
        // thin sliver of the teams carousel visible on load.
        // Use a scroll-independent position (rect.top is viewport-relative, so
        // adding scrollY gives the absolute document Y). Without this, a
        // recalculation triggered while the page is scrolled computed a wrong
        // height and broke the layout on scroll up/down.
        var foldHeight = aboveFold.getBoundingClientRect().height;
        var containerTop = carouselContainer.getBoundingClientRect().top + window.scrollY;
        var newHeight = foldHeight + (window.innerHeight - containerTop);
        aboveFold.style.height = Math.max(0, newHeight) + 'px';

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
    }, { once: true });

    // Re-run on resize (debounced)
    window.addEventListener('resize', debouncedAdjust);

    // Re-run whenever any image finishes loading
    document.querySelectorAll('img').forEach(function(img) {
        if (!img.complete) {
            img.addEventListener('load', adjustCarouselPosition);
        }
    });
    
    // Fit carousel titles to one line using fixed size steps
    var titleSteps = [18, 14, 11];
    document.querySelectorAll('.carousel-title').forEach(function(el) {
        for (var i = 0; i < titleSteps.length; i++) {
            el.style.fontSize = titleSteps[i] + 'px';
            if (el.scrollWidth <= el.clientWidth) break;
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

    // Inject sponsors carousel on all pages except patrocinadores
    function injectSponsorsCarousel() {
        // Skip if already present or if on patrocinadores page
        if (document.querySelector('.sponsors-carousel-section')) return;
        var path = window.location.pathname.toLowerCase();
        if (path.indexOf('/patrocinadores') !== -1) return;

        // Determine asset base path
        var scriptTags = document.querySelectorAll('script[src*="script.js"]');
        var assetBase = 'src/assets/';
        if (scriptTags.length > 0) {
            var src = scriptTags[0].getAttribute('src');
            if (src && src.indexOf('../') === 0) {
                assetBase = '../src/assets/';
            }
        }

        var sponsors = [
            { href: 'https://www.autocenterprincipado.com/', img: 'autocenterprincipado.png', alt: 'Autocenter Principado' },
            { href: 'https://go-fit.es/centros/go-fit-oviedo/', img: 'gofit1.jpeg', alt: 'GoFit' },
            { href: 'https://www.cajaruraldeasturias.com/es', img: 'cajarural.jpg', alt: 'Caja Rural' },
            { href: 'https://seinte.es/', img: 'seinteenergia.png', alt: 'Seinte Energía' },
            { href: 'https://www.autocaresepifanio.com/', img: 'autocaresepifanio.webp', alt: 'Autocares Epifanio' },
            { href: 'https://legea.com/es', img: 'legea.svg', alt: 'Legea' },
            { href: 'https://cluber.es/', img: 'cluber.svg', alt: 'Cluber' },
            { href: 'https://www.dominospizza.es/es/', img: 'dominospizza.svg', alt: "Domino's Pizza" },
            { href: 'https://asadoselmaizal.com/', img: 'elmaizal.png', alt: 'El Maizal' },
            { href: 'https://elpichote.com/', img: 'elpichote.webp', alt: 'El Pichote' },
            { href: 'https://loscorzos.com/', img: 'loscorzoslogo.png', alt: 'Los Corzos' },
            { href: 'https://lasguelas.com/', img: 'sidrerialasguelas.png', alt: 'Sidrería Las Güelas' },
            { href: 'https://www.instagram.com/ovicentfisioterapia/', img: 'ovicent.jpg', alt: 'Ovicent Fisioterapia' },
            { href: 'https://braserialokal.com/', img: 'lokalcerveceria.jpg', alt: 'Lokal Cervecería' },
            { href: 'https://tabernazingara.es/', img: 'latabernazingara.png', alt: 'La Taberna Zíngara' },
            { href: 'https://elpiguena.com/', img: 'elpigueña.png', alt: 'El Pigüeña' },
            { href: 'https://www.administraciones-lorca.es/', img: 'administracioneslorca.png', alt: 'Administraciones Lorca' },
            { href: 'https://maps.app.goo.gl/gmJEMYNMoNBPEAov5', img: 'cafegernika.jpg', alt: 'Café Gernika' },
            { href: 'https://www.instagram.com/continentallugones/', img: 'cafecontinental.jpg', alt: 'Café Continental' },
            { href: 'https://www.google.com/maps/search/?api=1&amp;query=Cafeter%C3%ADa+Moon+Calle+Cudillero+8+Oviedo', img: 'cafeteriamoonlogo.jpg', alt: 'Cafetería Moon' }
        ];

        function buildLinks() {
            return sponsors.map(function(s) {
                return '<a href="' + s.href + '" target="_blank" rel="noopener noreferrer" class="sponsor-link sponsor-card">' +
                    '<img src="' + assetBase + s.img + '" alt="' + s.alt + '" class="sponsor-logo sponsor-logo-colaborador">' +
                '</a>';
            }).join('\n');
        }

        var linksHTML = buildLinks();
        var html = '<section class="sponsors-carousel-section">' +
            '<div class="sponsors-carousel-container">' +
                '<div class="sponsors-carousel-track">' +
                    linksHTML +
                    '<!-- Duplicado para efecto infinito -->' +
                    linksHTML +
                '</div>' +
            '</div>' +
        '</section>';

        var footer = document.querySelector('.footer');
        if (footer) {
            footer.insertAdjacentHTML('beforebegin', html);
        }
    }

    // Inject sponsors carousel on non-homepage pages, then start all carousels
    injectSponsorsCarousel();

    // Iniciar carruseles infinitos al cargar
    // { once: true }: Rocket Loader repite el evento load y los carruseles
    // se montarían dos veces.
    window.addEventListener('load', function() {
        setupInfiniteCarousel();
        setupSponsorsCarousel();
    }, { once: true });
    
    // Menú hamburguesa
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('.nav');
    const header = document.querySelector('.header');
    const navDropdown = document.querySelector('.nav-dropdown');
    const dropdownToggle = document.querySelector('.nav-dropdown-toggle');

    function isMobileNav() {
        return window.innerWidth <= 768;
    }

    // El panel arranca justo debajo del header, cuya altura cambia con el
    // breakpoint (60px de logo en móvil), así que se mide en vez de fijarla.
    function syncNavTop() {
        if (!nav || !header) return;
        nav.style.setProperty('--nav-top', Math.round(header.getBoundingClientRect().height) + 'px');
    }

    function closeNav() {
        if (!hamburger || !nav) return;
        hamburger.classList.remove('active');
        nav.classList.remove('active');
        document.body.classList.remove('nav-open');
        if (navDropdown && isMobileNav()) navDropdown.classList.remove('active');
    }

    // Cada subentrada del desplegable lleva icono y descripción. Se inyectan
    // aquí y no en el HTML para no repetirlos en las 46 páginas; la clave es
    // el final del href, que es igual en las dos variantes de ruta
    // ("./noticias/" en la raíz, "../noticias/" en subpáginas).
    const SUBNAV_META = {
        'noticias/': {
            label: 'Noticias',
            desc: 'Toda la actualidad del club',
            icon: '<path d="M4 6h11a1 1 0 0 1 1 1v11H6a2 2 0 0 1-2-2V6Z"/><path d="M16 9h3a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2"/><path d="M7 9.5h6M7 12.5h6M7 15.5h4"/>'
        },
        'historia/': {
            label: 'Historia',
            desc: 'El camino del club: temporada a temporada',
            icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'
        },
        'enprensa/': {
            label: 'Prensa',
            desc: 'Los medios hablan del Vetusta',
            icon: '<path d="M4 9.5v5h2.5L11 18V6L6.5 9.5H4Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a8 8 0 0 1 0 10"/>'
        },
        'contacto/': {
            label: 'Contacto',
            desc: 'Dónde estamos y cómo escribirnos',
            icon: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7.5 8 5.5 8-5.5"/>'
        }
    };

    function decorateSubnav() {
        if (!navDropdown) return;
        navDropdown.querySelectorAll('.nav-dropdown-menu a').forEach(function(link) {
            if (link.dataset.decorated) return;
            const key = Object.keys(SUBNAV_META).find(function(k) {
                return (link.getAttribute('href') || '').endsWith(k);
            });
            if (!key) return;
            const meta = SUBNAV_META[key];
            const icon = document.createElement('span');
            icon.className = 'nav-sub-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + meta.icon + '</svg>';
            // El HTML trae el texto en mayúsculas (estilo del nav de escritorio);
            // con descripción debajo se lee mejor en caja baja, así que se
            // reemplaza por la etiqueta de la tabla envuelta en su propio span.
            const title = document.createElement('span');
            title.className = 'nav-sub-title';
            title.textContent = meta.label;
            link.textContent = '';
            link.appendChild(title);
            const desc = document.createElement('span');
            desc.className = 'nav-sub-desc';
            desc.textContent = meta.desc;
            link.insertBefore(icon, link.firstChild);
            link.appendChild(desc);
            link.dataset.decorated = '1';
        });
    }

    if (navDropdown && dropdownToggle) {
        decorateSubnav();
        // Chevron del toggle (sólo visible en móvil vía CSS).
        if (!dropdownToggle.querySelector('.nav-chevron')) {
            const chevron = document.createElement('span');
            chevron.className = 'nav-chevron';
            chevron.setAttribute('aria-hidden', 'true');
            dropdownToggle.appendChild(chevron);
        }
        dropdownToggle.setAttribute('role', 'button');
        dropdownToggle.setAttribute('tabindex', '0');
        dropdownToggle.setAttribute('aria-expanded', isMobileNav() ? 'true' : 'false');

        const dropdownMenu = navDropdown.querySelector('.nav-dropdown-menu');

        // Anima la apertura midiendo la altura real del contenido y liberando
        // el límite al terminar, para que nada lo recorte después (carga de
        // fuentes, giro de pantalla, tamaño de texto del sistema).
        function releaseHeight() {
            if (dropdownMenu) dropdownMenu.style.maxHeight = '';
        }

        function animateDropdown(expanded) {
            if (!dropdownMenu || !isMobileNav()) { releaseHeight(); return; }
            clearTimeout(dropdownMenu._heightTimer);
            if (expanded) {
                // La clase `active` ya está puesta, así que el padding abierto
                // cuenta en la medición.
                dropdownMenu.style.maxHeight = 'none';
                const target = dropdownMenu.scrollHeight;
                dropdownMenu.style.maxHeight = '0px';
                void dropdownMenu.offsetHeight;
                dropdownMenu.style.maxHeight = target + 'px';
                dropdownMenu._heightTimer = setTimeout(releaseHeight, 320);
            } else {
                dropdownMenu.style.maxHeight = dropdownMenu.scrollHeight + 'px';
                void dropdownMenu.offsetHeight;
                dropdownMenu.style.maxHeight = '0px';
                dropdownMenu._heightTimer = setTimeout(releaseHeight, 320);
            }
        }

        function toggleDropdown(e) {
            e.preventDefault();
            e.stopPropagation();
            const expanded = !navDropdown.classList.contains('active');
            navDropdown.classList.toggle('active', expanded);
            dropdownToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            animateDropdown(expanded);
        }

        // Expuesto para que el botón de la hamburguesa lo reutilice.
        navDropdown._releaseHeight = releaseHeight;

        dropdownToggle.addEventListener('click', toggleDropdown);
        dropdownToggle.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') toggleDropdown(e);
        });

        // Cerrar al hacer clic fuera — sólo en desktop, donde el desplegable
        // flota sobre la página; en móvil vive dentro del panel.
        document.addEventListener('click', function(e) {
            if (!isMobileNav() && !navDropdown.contains(e.target)) {
                navDropdown.classList.remove('active');
                dropdownToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    if (hamburger && nav) {
        syncNavTop();
        window.addEventListener('resize', syncNavTop);

        hamburger.addEventListener('click', function() {
            const opening = !nav.classList.contains('active');
            syncNavTop();
            hamburger.classList.toggle('active', opening);
            nav.classList.toggle('active', opening);
            // Bloquear el scroll del fondo mientras el panel está abierto.
            document.body.classList.toggle('nav-open', opening && isMobileNav());
            // CLUB entra desplegado cada vez que se abre el panel. En
            // escritorio no se toca, porque allí `active` abre el menú
            // flotante sobre la página.
            if (navDropdown && isMobileNav()) {
                navDropdown.classList.toggle('active', opening);
                if (dropdownToggle) {
                    dropdownToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
                }
                // Aquí no se anima: el submenú entra ya desplegado junto con el
                // panel, así que se deja sin altura en línea y manda el
                // `max-height: none` del CSS. Así el estado por defecto no
                // depende de ninguna medición.
                if (navDropdown._releaseHeight) navDropdown._releaseHeight();
            }
        });

        // Cerrar al navegar. El toggle de CLUB no es un enlace, así que no
        // entra aquí y el desplegable puede abrirse sin cerrar el panel.
        document.querySelectorAll('.nav a').forEach(function(link) {
            link.addEventListener('click', closeNav);
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && nav.classList.contains('active')) closeNav();
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

    // ── Data-driven components: Clasificación, Próximos, Goleadores ──

    // Temporada en curso. La usan el bloque de la liga y el banner del próximo
    // partido; las anteriores sólo existen como JSON estáticos.
    var TEMPORADA_ACTUAL = '2627';

    // Datos de la liga: primero el worker (/api, renovado cada 15 minutos) y,
    // si no responde en 5 s o falla, el JSON estático que deja la tarea de
    // GitHub. Devuelve la respuesta buena de las dos, así quien llama la trata
    // igual que antes.
    // Un partido se da por «en juego» desde una hora antes del inicio hasta
    // una hora después del final, contando dos horas de partido. Lo usan el
    // icono de directo de los próximos partidos y la pastilla del banner.
    function enDirecto(fechaStr) {
        if (!fechaStr) return false;
        var inicio = new Date(String(fechaStr).replace(' ', 'T')).getTime();
        if (isNaN(inicio)) return false;
        var ahora = Date.now();
        return ahora >= inicio - 60 * 60000 && ahora <= inicio + 3 * 60 * 60000;
    }

    // ── Escudos de la federación ──
    // La federación los sirve en JPG enormes (hasta 3.000 px y 1 MB) y aquí
    // se pintan a 18–40 px. scripts/escudos.py (lo ejecuta la Action con los
    // datos) deja en src/assets/escudos/ dos miniaturas de 96 px de cada uno,
    // con el nombre sacado de la URL: .jpg con su fondo, para los paneles
    // oscuros de la liga, y .png sin fondo, para la tira blanca de la semana.
    // Si una miniatura aún no existe, se usa la imagen original.
    var RAIZ_WEB = (function() {
        var s = document.querySelector('script[src*="script.js"]');
        return s && /^\.\.\//.test(s.getAttribute('src') || '') ? '../' : '';
    })();
    function escudoLocal(u, ext) {
        var m = /^https:\/\/balonmano\.isquad\.es\/images\/afiliacion_clubs\/(\d+)\/(?:square_)?(\w+)\.(?:jpe?g|png|gif|webp)$/i.exec(u || '');
        return m ? RAIZ_WEB + 'src/assets/escudos/' + m[1] + '_' + m[2] + '.' + (ext || 'jpg') : null;
    }
    function imgEscudo(u, clase, porDefecto) {
        var atr = ' alt="" class="' + clase + '" loading="lazy" decoding="async">';
        if (!u) return porDefecto ? '<img src="' + porDefecto + '"' + atr : '';
        var local = escudoLocal(u, 'jpg');
        if (!local) return '<img src="' + u + '"' + atr;
        return '<img src="' + local + '" data-orig="' + u + '" onerror="this.onerror=null;this.src=this.getAttribute(\'data-orig\')"' + atr;
    }

    function conRespaldo(api, estatico) {
        var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tope = control ? setTimeout(function() { control.abort(); }, 5000) : null;
        return fetch(api, control ? { signal: control.signal } : {})
            .then(function(r) { if (!r.ok) throw new Error('api ' + r.status); return r; })
            .catch(function() { return fetch(estatico); })
            .then(function(r) { if (tope) clearTimeout(tope); return r; });
    }

    (function loadLeagueData() {
        // Sólo la portada tiene la sección; en las demás páginas no hay nada
        // que pintar y no se pide nada al worker.
        if (!document.getElementById('standings-table')) return;
        var TEAM_NAME = 'AUTO-CENTER PRINCIPADO';

        function normaliseName(name) {
            return (name || '').trim().toUpperCase();
        }

        /**
         * Format "SURNAME, NAME" → "N. Surname" for compact display
         */
        function formatPlayerName(raw) {
            var parts = raw.split(',');
            if (parts.length < 2) return raw;
            var surname = parts[0].trim();
            var firstName = parts[1].trim();
            // Capitalize properly
            function capitalize(s) {
                return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            }
            var surnameFormatted = surname.split(/\s+/).map(capitalize).join(' ');
            var initial = firstName.charAt(0).toUpperCase();
            return initial + '. ' + surnameFormatted;
        }

        /**
         * Format date string "2026-03-21 17:30:00" to Spanish display.
         */
        function formatDateSpanish(dateStr) {
            // Sin fecha asignada por la federación: se dice así, en las dos líneas.
            if (!dateStr || dateStr.trim() === '') return { date: 'Fecha', time: 'por definir', pendiente: true };
            var d = new Date(dateStr.replace(' ', 'T'));
            if (isNaN(d.getTime())) return { date: dateStr, time: '' };

            var days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

            var dayName = days[d.getDay()];
            var dayNum = d.getDate();
            var month = months[d.getMonth()];
            var hours = String(d.getHours()).padStart(2, '0');
            var mins = String(d.getMinutes()).padStart(2, '0');

            return {
                date: dayName + ' ' + dayNum + ' ' + month,
                // La federación pone 00:00 cuando aún no hay hora.
                time: hours === '00' && mins === '00' ? 'Hora por definir' : hours + ':' + mins + 'h'
            };
        }

        // ── Standings ──
        function renderStandings(data) {
            var tbody = document.querySelector('#standings-table tbody');
            if (!tbody || !Array.isArray(data)) return;

            tbody.innerHTML = '';
            data.forEach(function(team) {
                var tr = document.createElement('tr');
                // Prefer the stable es_vetusta flag (the club's display name
                // changes per season); fall back to name match for safety.
                var isVetusta = team.es_vetusta === true ||
                    normaliseName(team.nombre) === normaliseName(TEAM_NAME);
                if (isVetusta) tr.classList.add('st-highlight');

                // Color-coded DIF class
                var difClass = 'st-dif-zero';
                var difText = '0';
                if (team.DIF > 0) { difClass = 'st-dif-pos'; difText = '+' + team.DIF; }
                else if (team.DIF < 0) { difClass = 'st-dif-neg'; difText = '' + team.DIF; }

                tr.innerHTML =
                    '<td class="st-pos">' + team.posicion + '</td>' +
                    '<td><div class="st-team-cell">' +
                        (team.escudo ? imgEscudo(team.escudo, 'st-team-badge') : '') +
                        '<span class="st-team-name">' + (team.nombre || '') + '</span>' +
                    '</div></td>' +
                    '<td>' + team.PJ + '</td>' +
                    '<td>' + team.PG + '</td>' +
                    '<td>' + team.PE + '</td>' +
                    '<td>' + team.PP + '</td>' +
                    '<td class="st-hide-mobile">' + team.GF + '</td>' +
                    '<td class="st-hide-mobile">' + team.GC + '</td>' +
                    '<td class="' + difClass + '">' + difText + '</td>' +
                    '<td><strong>' + team.puntos + '</strong></td>';

                tbody.appendChild(tr);
            });
        }

        // ── Upcoming matches (max 3 for side panel) ──
        // El enlace al directo de cada tarjeta sólo existe (y late) mientras
        // se juega el partido: la clase va en la tarjeta y el CSS lo enseña.
        function refrescarDirectos() {
            document.querySelectorAll('.proximos-card[data-inicio]').forEach(function(el) {
                el.classList.toggle('en-directo', enDirecto(el.getAttribute('data-inicio')));
            });
        }
        setInterval(refrescarDirectos, 60000);

        function renderProximos(data) {
            var container = document.getElementById('proximos-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay partidos próximos programados.</p>';
                return;
            }

            var maxItems = 3;
            data.slice(0, maxItems).forEach(function(match) {
                var dt = formatDateSpanish(match.fecha);
                var localidad = match.es_local ? 'Local' : 'Visitante';
                var localidadClass = match.es_local ? 'proximos-localidad-local' : 'proximos-localidad-away';
                var cardSideClass = match.es_local ? 'proximos-card-local' : 'proximos-card-away';

                var card = document.createElement('div');
                card.className = 'proximos-card ' + cardSideClass;

                // El enlace al directo sólo se ve mientras se juega el partido
                // (ver enDirecto); refrescarDirectos() lo revisa cada minuto
                // por si la página se queda abierta.
                var streamingHTML = '';
                if (match.url_streaming) {
                    card.setAttribute('data-inicio', match.fecha || '');
                    if (enDirecto(match.fecha)) card.classList.add('en-directo');
                    streamingHTML =
                        '<div class="proximos-streaming">' +
                            '<a href="' + match.url_streaming + '" target="_blank" rel="noopener noreferrer" title="Ver en directo">' +
                                '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
                            '</a>' +
                        '</div>';
                }

                card.innerHTML =
                    '<div class="proximos-jornada">J<span>' + (match.jornada || '') + '</span></div>' +
                    imgEscudo(match.escudo_rival, 'proximos-badge', 'src/assets/escudo.png') +
                    '<div class="proximos-info">' +
                        '<div class="proximos-rival">' + (match.rival || 'Rival') + '</div>' +
                        '<div class="proximos-localidad ' + localidadClass + '">' + localidad + '</div>' +
                        ((match.pabellon || match.sede) ? '<div class="proximos-sede" title="' + (match.pabellon || match.sede) + '">' + (match.pabellon || match.sede) + '</div>' : '') +
                    '</div>' +
                    '<div class="proximos-datetime' + (dt.pendiente ? ' sin-fecha' : '') + '">' +
                        '<span class="proximos-date">' + dt.date + '</span>' +
                        (dt.time ? '<span class="proximos-time">' + dt.time + '</span>' : '') +
                    '</div>' +
                    streamingHTML;

                container.appendChild(card);
            });
        }

        // ── Recent results (max 3 for side panel) ──
        function renderResultados(data) {
            var container = document.getElementById('resultados-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay resultados disponibles.</p>';
                return;
            }

            data.forEach(function(match) {
                var localidad = match.es_local ? 'Local' : 'Visitante';
                var localidadClass = match.es_local ? 'proximos-localidad-local' : 'proximos-localidad-away';
                var cardSideClass = match.es_local ? 'proximos-card-local' : 'proximos-card-away';

                var resultClass = 'resultados-score-empate';
                if (match.resultado === 'V') resultClass = 'resultados-score-victoria';
                else if (match.resultado === 'D') resultClass = 'resultados-score-derrota';

                var scoreText = match.es_local
                    ? match.goles_vetusta + ' - ' + match.goles_rival
                    : match.goles_rival + ' - ' + match.goles_vetusta;

                var card = document.createElement('div');
                card.className = 'proximos-card ' + cardSideClass;

                card.innerHTML =
                    '<div class="proximos-jornada">J<span>' + (match.jornada || '') + '</span></div>' +
                    imgEscudo(match.escudo_rival, 'proximos-badge', 'src/assets/escudo.png') +
                    '<div class="proximos-info">' +
                        '<div class="proximos-rival">' + (match.rival || 'Rival') + '</div>' +
                        '<div class="proximos-localidad ' + localidadClass + '">' + localidad + '</div>' +
                    '</div>' +
                    '<div class="resultados-score ' + resultClass + '">' + scoreText + '</div>';

                container.appendChild(card);
            });
        }

        // ── Top scorers (max 10 for side panel) ──
        function renderGoleadores(data) {
            var container = document.getElementById('goleadores-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay datos de goleadores disponibles.</p>';
                return;
            }

            var maxItems = 5;
            // Default placeholder photo — generic user silhouette SVG as data URI
            var defaultPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 4v2h16v-2c0-1-2-4-8-4z"/></svg>');

            data.slice(0, maxItems).forEach(function(player, i) {
                var card = document.createElement('div');
                card.className = 'goleadores-card';

                var photoSrc = player.foto || defaultPhoto;

                card.innerHTML =
                    '<div class="goleadores-pos"><span>' + (i + 1) + '</span></div>' +
                    '<img src="' + photoSrc + '" alt="" class="goleadores-photo" loading="lazy">' +
                    '<div class="goleadores-info">' +
                        '<div class="goleadores-name">' + formatPlayerName(player.nombre) + '</div>' +
                        '<div class="goleadores-stats">' + player.partidos + ' partidos · ' + player.media + ' goles/partido</div>' +
                    '</div>' +
                    '<div class="goleadores-goals">' +
                        '<span class="goleadores-goals-count">' + player.goles + '</span>' +
                        '<span class="goleadores-goals-label">goles</span>' +
                    '</div>';

                container.appendChild(card);
            });
        }

        // ── Season selector ──
        // Group ids per season, to point the external "Clasificación" link
        // at the right isquad group.
        var CURRENT_SEASON = TEMPORADA_ACTUAL;
        var SEASON_GROUP = {
            '2122': '1007844', '2223': '1012866', '2324': '1018089',
            '2425': '1023856', '2526': '1031242', '2627': '1038396'
        };

        function setLoading() {
            var std = document.querySelector('#standings-table tbody');
            if (std) std.innerHTML = '<tr><td colspan="10"><div class="liga-loading"><div class="liga-loading-spinner"></div></div></td></tr>';
            ['resultados-list', 'goleadores-list', 'proximos-list'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="liga-loading"><div class="liga-loading-spinner"></div></div>';
            });
        }

        // ── Categorías ──
        // La sección enseña cualquier equipo del club. El selector de categoría
        // elige el equipo; el de temporada sólo existe para el primer equipo
        // (las anteriores son JSON estáticos) y el de fase aparece cuando la
        // liga de cantera va por fases. Todo lo de la temporada en curso llega
        // en un solo paquete por equipo: /api/equipo (el worker) y, de
        // respaldo, data/<temporada>/equipos/<id>.json.
        var PRIMER_EQUIPO = '209500';
        var categoriaSelect = document.getElementById('categoria-select');
        var faseSelect = document.getElementById('fase-select');
        var faseWrap = document.getElementById('fase-wrap');
        var temporadaWrap = document.getElementById('temporada-wrap');
        var goleadoresPanel = document.getElementById('goleadores-panel');
        var proximosPanel = document.getElementById('proximos-panel');
        var seasonSelect = document.getElementById('season-select');
        var equipoActual = PRIMER_EQUIPO;

        function mostrar(el, si) { if (el) el.hidden = !si; }

        // El texto visible del selector de categoría (el <select> va invisible
        // encima): el nombre de la opción elegida.
        var categoriaTexto = document.getElementById('categoria-texto');
        function pintarCategoria() {
            if (categoriaTexto && categoriaSelect && categoriaSelect.options.length) {
                categoriaTexto.textContent = categoriaSelect.options[categoriaSelect.selectedIndex].textContent;
            }
        }

        function enlaceClasificacion(id, grupo) {
            var extLink = document.getElementById('standings-external-link');
            if (extLink && grupo) {
                extLink.href = 'https://resultadosbalonmano.isquad.es/equipo.php?seleccion=0&id_equipo=' + id + '&id=' + grupo + '&id_superficie=1';
            }
        }

        function mensajeClasificacion(texto) {
            var tbody = document.querySelector('#standings-table tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="padding:30px 20px;color:#555;text-align:center;font-size:0.85rem;">' + texto + '</td></tr>';
        }

        // Temporada en curso de cualquier equipo (y, si se pide, de un grupo
        // concreto de los suyos). `alCargar` recibe el paquete ya pintado.
        function cargarEquipo(id, grupo, alCargar) {
            setLoading();
            var api = '/api/equipo/' + CURRENT_SEASON + '/' + id + '.json' + (grupo ? '?grupo=' + grupo : '');
            conRespaldo(api, './data/' + CURRENT_SEASON + '/equipos/' + id + '.json?v=' + Date.now())
                .then(function(r) { if (!r.ok) throw new Error('datos ' + r.status); return r.json(); })
                .then(function(j) {
                    // El banner del próximo partido viene en el paquete de Primera.
                    if (j['proximo-partido'] !== undefined) pintarBanner(j['proximo-partido']);
                    if (id !== equipoActual) return;   // se ha cambiado de categoría mientras cargaba

                    // El selector de categorías se rellena con la lista del paquete.
                    if (categoriaSelect && j.equipos && categoriaSelect.options.length < j.equipos.length) {
                        categoriaSelect.innerHTML = j.equipos.map(function(e) {
                            return '<option value="' + e.id + '">' + e.nombre + '</option>';
                        }).join('');
                        categoriaSelect.value = id;
                    }
                    pintarCategoria();


                    // Fases: sólo si el equipo tiene más de un grupo de liga.
                    var conFases = (j.grupos || []).length > 1;
                    mostrar(faseWrap, conFases);
                    if (conFases && faseSelect) {
                        faseSelect.innerHTML = j.grupos.map(function(g) {
                            return '<option value="' + g.id + '">' + g.nombre + '</option>';
                        }).join('');
                        faseSelect.value = j.grupo;
                    }
                    mostrar(temporadaWrap, id === PRIMER_EQUIPO);
                    if (proximosPanel) proximosPanel.style.display = '';
                    enlaceClasificacion(id, j.grupo);

                    if (!j.grupo) {
                        mensajeClasificacion('Todavía no hay competición de liga publicada.');
                        renderResultados([]);
                        renderProximos([]);
                        mostrar(goleadoresPanel, false);
                    } else {
                        renderStandings(j.clasificacion);
                        renderResultados(j.resultados);
                        renderProximos(j.calendario);
                        mostrar(goleadoresPanel, !!j.goleadores);
                        if (j.goleadores) renderGoleadores(j.goleadores);
                    }
                    if (alCargar) alCargar(j);
                })
                .catch(function(err) {
                    console.warn('Failed to load team data:', err);
                    if (id === equipoActual) mensajeClasificacion('No se han podido cargar los datos.');
                    if (alCargar) alCargar(null);
                });
        }

        // Temporadas anteriores: sólo del primer equipo y de los JSON estáticos
        // (no cambian). La actual va por cargarEquipo.
        function loadSeason(code) {
            if (code === CURRENT_SEASON) { cargarEquipo(PRIMER_EQUIPO, null); return; }

            var basePath = './data/' + code + '/';
            var cacheBust = '?v=' + Date.now();
            mostrar(faseWrap, false);
            mostrar(goleadoresPanel, true);
            if (proximosPanel) proximosPanel.style.display = 'none';
            if (SEASON_GROUP[code]) enlaceClasificacion(PRIMER_EQUIPO, SEASON_GROUP[code]);
            setLoading();

            function pedir(nombre) {
                return fetch(basePath + nombre + cacheBust)
                    .then(function(r) { return r.ok ? r.json() : []; })
                    .catch(function() { return []; });
            }
            Promise.all([pedir('clasificacion.json'), pedir('resultados.json'), pedir('goleadores.json')])
                .then(function(results) {
                    renderStandings(results[0]);
                    renderResultados(results[1]);
                    renderGoleadores(results[2]);
                }).catch(function(err) {
                    console.warn('Failed to load league data:', err);
                });
        }

        function seasonBefore(code) {
            var a = parseInt(code.slice(0, 2), 10) - 1;
            var b = parseInt(code.slice(2), 10) - 1;
            return (a < 10 ? '0' : '') + a + (b < 10 ? '0' : '') + b;
        }

        if (seasonSelect) {
            seasonSelect.addEventListener('change', function() { loadSeason(seasonSelect.value); });
        }
        if (categoriaSelect) {
            categoriaSelect.addEventListener('change', function() {
                pintarCategoria();
                equipoActual = categoriaSelect.value;
                if (seasonSelect) seasonSelect.value = CURRENT_SEASON;
                cargarEquipo(equipoActual, null);
            });
        }
        if (faseSelect) {
            faseSelect.addEventListener('change', function() { cargarEquipo(equipoActual, faseSelect.value); });
        }

        // La temporada que sale por defecto se decide sola: la actual en
        // cuanto el primer equipo tiene algún resultado, y la anterior mientras
        // tanto. Así en pretemporada no se enseña una clasificación a ceros, y
        // el día del primer partido se cambia sin tocar el HTML.
        pintarCategoria();
        cargarEquipo(PRIMER_EQUIPO, null, function(j) {
            // Si el paquete no ha llegado, o no trae el próximo partido (un
            // respaldo antiguo), el banner se pide aparte.
            if (!j || j['proximo-partido'] === undefined) cargarBannerAparte();
            if (!j || (j.resultados && j.resultados.length)) return;
            var code = seasonBefore(CURRENT_SEASON);
            if (seasonSelect) seasonSelect.value = code;
            loadSeason(code);
        });
    })();

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
        const autoPlayInterval = window.innerWidth <= 768 ? 8000 : 10000;
        let autoPlayTimer;

        // ── Detalles visuales ──
        // Cada diapositiva lleva la pastilla de su etiqueta (la de su tarjeta
        // en las cajas de etiquetas) junto a la fecha, y cada tarjeta de las
        // cajas, la fecha corta de su noticia.
        var MESES_C = { enero: 'ene', febrero: 'feb', marzo: 'mar', abril: 'abr', mayo: 'may', junio: 'jun', julio: 'jul', agosto: 'ago', septiembre: 'sep', octubre: 'oct', noviembre: 'nov', diciembre: 'dic' };
        function fechaCorta(t) {
            var m = /^(\d+) de ([a-záéíóú]+) de (\d{4})$/i.exec(String(t || '').trim());
            return m ? m[1] + ' ' + (MESES_C[m[2].toLowerCase()] || m[2].slice(0, 3)) + '. ' + m[3] : t;
        }
        var etiquetas = {}, fechas = {};
        document.querySelectorAll('.tag-card').forEach(function(c) {
            var t = c.querySelector('.news-tag');
            if (!t) return;
            var clase = (t.className.match(/news-tag-([a-z-]+)/) || [])[1] || '';
            etiquetas[c.getAttribute('href')] = { clase: clase, texto: t.textContent };
        });
        slides.forEach(function(sl) {
            var cont = sl.querySelector('.news-carousel-slide-content');
            var fecha = sl.querySelector('.news-carousel-slide-date');
            if (!cont || !fecha) return;
            fechas[sl.getAttribute('href')] = fecha.textContent;
            var meta = document.createElement('div');
            meta.className = 'news-carousel-slide-meta';
            var e = etiquetas[sl.getAttribute('href')];
            if (e) {
                var pill = document.createElement('span');
                pill.className = 'nc-tag ' + e.clase;
                pill.textContent = e.texto;
                meta.appendChild(pill);
            }
            cont.insertBefore(meta, fecha);
            meta.appendChild(fecha);
        });
        document.querySelectorAll('.tag-card').forEach(function(c) {
            var f = fechas[c.getAttribute('href')], body = c.querySelector('.tag-card-body');
            if (!f || !body) return;
            var sp = document.createElement('span');
            sp.className = 'tag-card-fecha';
            sp.textContent = fechaCorta(f);
            body.appendChild(sp);
        });

        // Barra de progreso del avance automático.
        var barra = null;
        if (viewport) {
            var progreso = document.createElement('div');
            progreso.className = 'news-carousel-progreso';
            barra = document.createElement('span');
            progreso.appendChild(barra);
            viewport.appendChild(progreso);
        }
        function arrancarBarra() {
            if (!barra) return;
            barra.style.animation = 'none';
            void barra.offsetWidth;
            barra.style.animation = 'ncProgreso ' + autoPlayInterval + 'ms linear forwards';
        }
        function pararBarra() {
            if (!barra) return;
            barra.style.animation = 'none';
            barra.style.width = '0';
        }

        // Create dots — the homepage has no dots container (navigation is by
        // arrows only), so this is optional.
        if (dotsContainer) {
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
        }

        function goToSlide(index) {
            currentIndex = index;
            // Crossfade: toggle .active instead of translating the strip, so
            // wrapping from the last slide to the first is a plain fade.
            slides.forEach(function(s, i) {
                s.classList.toggle('active', i === currentIndex);
            });
            // Update dots (if this page has them)
            if (dotsContainer) {
                dotsContainer.querySelectorAll('.news-carousel-dot').forEach(function(d, i) {
                    d.classList.toggle('active', i === currentIndex);
                });
            }
            arrancarBarra();
            // Let the per-tag mini-carousels advance in lockstep with this one.
            document.dispatchEvent(new CustomEvent('newsCarouselChange', {
                detail: { index: currentIndex }
            }));
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
            arrancarBarra();
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
                pararBarra();
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

    // ── Recuadro «Esta semana» (portada, escritorio ancho) ──
    // Los partidos de la semana de todos los equipos del club. Sólo se piden
    // cuando el recuadro se ve (desde 1440px); si la ventana crece después,
    // se cargan entonces. Igual que todo lo demás: el worker primero y el JSON
    // estático de respaldo.
    (function cargarSemana() {
        var caja = document.getElementById('home-semana');
        var lista = document.getElementById('home-semana-lista');
        if (!caja || !lista) return;
        var cargado = false;
        var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

        // «GRUPO EGIDO BM PINTO» → «Grupo Egido BM Pinto»; «IES JOVELLANOS» →
        // «IES Jovellanos»; «C.P.GESTA» → «C.P.Gesta».
        var SIGLAS = ['ies', 'ceip', 'cp', 'cd', 'sd', 'sdc', 'sc', 'bm', 'ud', 'ad', 'cb', 'hc', 'bf', 'rgcc', 'ctd'];
        // Preposiciones y conjunciones van en minúscula; los artículos, no:
        // forman parte del nombre («La Carisa», «El Vallín»).
        var MENUDAS = ['de', 'del', 'y', 'e'];
        var ARTICULOS = ['el', 'la', 'los', 'las'];
        function bonito(s) {
            function trozo(t, primero) {
                if (!t) return t;
                if (ARTICULOS.indexOf(t) >= 0) return t.charAt(0).toUpperCase() + t.slice(1);
                if (SIGLAS.indexOf(t) >= 0 || (t.length <= 2 && MENUDAS.indexOf(t) < 0)) return t.toUpperCase();
                if (!primero && MENUDAS.indexOf(t) >= 0) return t;
                // La mayúscula va en la primera letra, aunque la palabra abra
                // con comillas o paréntesis: «yago» → «Yago».
                return t.replace(/^(["“«(]?)(.)/, function(_, a, b) { return a + b.toUpperCase(); });
            }
            return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').map(function(w, i) {
                // Guiones y puntos se respetan: «c.p.gesta» → «C.P.Gesta», «gonzalez-c.p.» → «Gonzalez-C.P.»
                return w.split('-').map(function(parte) {
                    return parte.split('.').map(function(t, j) { return trozo(t, i === 0 && j === 0); }).join('.');
                }).join('-');
            }).join(' ');
        }
        function escapar(s) { return String(s || '').replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

        // Los escudos de la federación son JPG con fondo blanco o negro. Se
        // piden a través del propio dominio (/api/escudo), se les quita el
        // fondo en un lienzo (lo mismo que hace la imagen para redes del área
        // privada) y se muestran en PNG. Si algo falla, el JPG original.
        var escudosPng = {};
        function escudoPng(u) {
            if (!escudosPng[u]) escudosPng[u] = new Promise(function(listo) {
                var im = new Image();
                im.onload = function() {
                    try {
                        var c = quitarFondo(im);
                        if (!c || !c.getContext) {
                            c = document.createElement('canvas');
                            c.width = im.naturalWidth; c.height = im.naturalHeight;
                            c.getContext('2d').drawImage(im, 0, 0);
                        }
                        listo(aTamano(c).toDataURL('image/png'));
                    } catch (e) { listo(u); }
                };
                im.onerror = function() { listo(u); };
                im.src = '/api/escudo?u=' + encodeURIComponent(u);
            });
            return escudosPng[u];
        }
        // El escudo, cuadrado y reducido por mitades (cada paso con suavizado
        // de calidad) hasta el tamaño en el que se pinta en pantalla: 18px
        // por la densidad de la pantalla, y como poco el doble. Así el
        // navegador no tiene que encogerlo de golpe y no sale borroso.
        function aTamano(c) {
            var lado = Math.round(18 * Math.max(2, window.devicePixelRatio || 1));
            var w = c.width, h = c.height, m = Math.max(w, h);
            var cuadro = document.createElement('canvas');
            cuadro.width = cuadro.height = m;
            cuadro.getContext('2d').drawImage(c, (m - w) / 2, (m - h) / 2);
            var actual = cuadro;
            while (actual.width / 2 >= lado) {
                var mitad = document.createElement('canvas');
                mitad.width = mitad.height = Math.round(actual.width / 2);
                var cx = mitad.getContext('2d');
                cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
                cx.drawImage(actual, 0, 0, mitad.width, mitad.height);
                actual = mitad;
            }
            if (actual.width === lado) return actual;
            var fin = document.createElement('canvas');
            fin.width = fin.height = lado;
            var fx = fin.getContext('2d');
            fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high';
            fx.drawImage(actual, 0, 0, lado, lado);
            return fin;
        }

        // Los nombres que no caben en su línea bajan de tamaño (hasta 9px);
        // si aun así no caben, se cortan con «…» y el nombre entero queda en
        // el title.
        function ajustarNombres() {
            Array.prototype.forEach.call(lista.querySelectorAll('.st-nombre'), function(n) {
                n.style.fontSize = '';
                var t = parseFloat(getComputedStyle(n).fontSize);
                while (n.scrollWidth > n.clientWidth + 0.5 && t > 9) {
                    t -= 0.5;
                    n.style.fontSize = t + 'px';
                }
            });
        }

        // La miniatura PNG sin fondo de scripts/escudos.py; si no existe
        // todavía, la original pasada por el lienzo (escudoPng).
        function cargarEscudos() {
            Array.prototype.forEach.call(lista.querySelectorAll('img[data-escudo]'), function(img) {
                var u = img.getAttribute('data-escudo');
                img.removeAttribute('data-escudo');
                var local = escudoLocal(u, 'png');
                if (!local) { escudoPng(u).then(function(src) { img.src = src; }); return; }
                img.addEventListener('error', function fallo() {
                    img.removeEventListener('error', fallo);
                    escudoPng(u).then(function(src) { img.src = src; });
                });
                img.src = local;
            });
        }
        function quitarFondo(img){
          if (!img) return null;
          var r = Math.min(1, 240 / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * r)), h = Math.max(1, Math.round(img.height * r));
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var cx = c.getContext('2d');
          cx.drawImage(img, 0, 0, w, h);
          var datos;
          try { datos = cx.getImageData(0, 0, w, h); } catch (e) { return img; }
          var px = datos.data, n = w * h;
          var DURO = 38, SUAVE = 140;
          // Distancia de un píxel al blanco (1) o al negro (2).
          function dist(i, ref){
            var a = px[i * 4], b = px[i * 4 + 1], d = px[i * 4 + 2];
            return ref === 1 ? 255 - Math.min(a, b, d) : Math.max(a, b, d);
          }
          function anillo(t){
            var a = [];
            for (var x = t; x < w - t; x++) { a.push(t * w + x, (h - 1 - t) * w + x); }
            for (var y = t + 1; y < h - 1 - t; y++) { a.push(y * w + t, y * w + w - 1 - t); }
            return a;
          }
          var transparente = anillo(0).some(function(i){ return px[i * 4 + 3] < 250; });
          if (!transparente && w > 8 && h > 8) {
            var fondo = new Uint8Array(n), cola = [], lisos = 0;
            // Qué fondo podría ser cada píxel: 1 blanco, 2 negro, 0 ninguno.
            var tipo = new Uint8Array(n);
            for (var t = 0; t < n; t++) tipo[t] = dist(t, 1) < DURO ? 1 : dist(t, 2) < DURO ? 2 : 0;
            // 3 = marco: se quita, pero no tiñe el filo.
            anillo(0).concat(anillo(1)).forEach(function(i){ fondo[i] = 3; });
            // Distancia de cada píxel de fondo al escudo, en píxeles. El relleno sólo
            // avanza por donde hay más de HOLGURA, para no colarse por una rendija
            // del contorno y vaciar el escudo por dentro (el blanco interior del de
            // Atlético Valladolid, por ejemplo); luego crece HOLGURA píxeles para
            // llegar hasta el borde del escudo.
            var HOLGURA = 3, lejos = new Uint16Array(n), i, m, xx, yy;
            for (i = 0; i < n; i++) lejos[i] = tipo[i] || fondo[i] ? 9999 : 0;
            for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) {
              i = yy * w + xx; if (!lejos[i]) continue; m = lejos[i];
              if (xx > 0) m = Math.min(m, lejos[i - 1] + 1);
              if (yy > 0) {
                m = Math.min(m, lejos[i - w] + 1);
                if (xx > 0) m = Math.min(m, lejos[i - w - 1] + 1);
                if (xx < w - 1) m = Math.min(m, lejos[i - w + 1] + 1);
              }
              lejos[i] = m;
            }
            for (yy = h - 1; yy >= 0; yy--) for (xx = w - 1; xx >= 0; xx--) {
              i = yy * w + xx; if (!lejos[i]) continue; m = lejos[i];
              if (xx < w - 1) m = Math.min(m, lejos[i + 1] + 1);
              if (yy < h - 1) {
                m = Math.min(m, lejos[i + w] + 1);
                if (xx < w - 1) m = Math.min(m, lejos[i + w + 1] + 1);
                if (xx > 0) m = Math.min(m, lejos[i + w - 1] + 1);
              }
              lejos[i] = m;
            }
            var borde = anillo(2);
            borde.forEach(function(i){
              if (fondo[i] || !tipo[i]) return;
              lisos++;
              if (lejos[i] > HOLGURA) { fondo[i] = tipo[i]; cola.push(i); }
            });
            if (lisos < borde.length * 0.6) return img;
            function vecinos(i){
              var x = i % w, v = [];
              for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
                if ((dx || dy) && x + dx >= 0 && x + dx < w && i + dy * w >= 0 && i + dy * w < n) v.push(i + dy * w + dx);
              }
              return v;
            }
            // Relleno desde los bordes: cada píxel hereda el color de fondo del que viene.
            for (var q = 0; q < cola.length; q++) {
              vecinos(cola[q]).forEach(function(j){
                if (fondo[j] || tipo[j] !== fondo[cola[q]] || lejos[j] <= HOLGURA) return;
                fondo[j] = tipo[j]; cola.push(j);
              });
            }
            var frente = cola.slice(), quitados = cola.length;
            for (var vuelta = 0; vuelta < HOLGURA; vuelta++) {
              var nuevo = [];
              frente.forEach(function(p){
                vecinos(p).forEach(function(j){
                  if (fondo[j] || tipo[j] !== fondo[p]) return;
                  fondo[j] = tipo[j]; nuevo.push(j);
                });
              });
              quitados += nuevo.length; frente = nuevo;
            }
            if (quitados > n * 0.9) return img;
            // El filo entre el escudo y el fondo se funde: transparencia parcial y
            // se le quita el tinte del fondo, para que no quede un halo.
            for (var k = 0; k < n; k++) {
              if (fondo[k]) { px[k * 4 + 3] = 0; continue; }
              var kx = k % w, junto = 0;
              if (kx > 0 && fondo[k - 1]) junto = fondo[k - 1];
              else if (kx < w - 1 && fondo[k + 1]) junto = fondo[k + 1];
              else if (k >= w && fondo[k - w]) junto = fondo[k - w];
              else if (k + w < n && fondo[k + w]) junto = fondo[k + w];
              if (!junto || junto === 3) continue;
              var d = dist(k, junto);
              if (d >= SUAVE) continue;
              var alfa = Math.max(0.05, (d - DURO) / (SUAVE - DURO));
              for (var ch = 0; ch < 3; ch++) {
                var val = px[k * 4 + ch];
                val = junto === 1 ? 255 - (255 - val) / alfa : val / alfa;
                px[k * 4 + ch] = Math.max(0, Math.min(255, Math.round(val)));
              }
              px[k * 4 + 3] = Math.round(255 * alfa);
            }
            cx.putImageData(datos, 0, 0);
          }
          // Recorte a lo que se ve.
          var x0 = w, y0 = h, x1 = -1, y1 = -1;
          for (var p = 0; p < n; p++) {
            if (px[p * 4 + 3] < 24) continue;
            var pxx = p % w, pyy = (p - pxx) / w;
            if (pxx < x0) x0 = pxx; if (pxx > x1) x1 = pxx;
            if (pyy < y0) y0 = pyy; if (pyy > y1) y1 = pyy;
          }
          if (x1 < 0) return img;
          var recorte = document.createElement('canvas');
          recorte.width = x1 - x0 + 1; recorte.height = y1 - y0 + 1;
          recorte.getContext('2d').drawImage(c, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
          return recorte;
        }

        var VACIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        var izq = caja.querySelector('.home-semana-flecha.izq');
        var der = caja.querySelector('.home-semana-flecha.der');
        // Cada flecha sólo aparece si se puede ir hacia su lado.
        function flechas() {
            var max = lista.scrollWidth - lista.clientWidth;
            if (izq) izq.hidden = lista.scrollLeft <= 2;
            if (der) der.hidden = lista.scrollLeft >= max - 2;
        }

        function pintar(j) {
            // De mayor a menor categoría (orden = puesto del equipo en la
            // lista del club) y, a igual categoría, por fecha.
            var partidos = (j.partidos || []).slice().sort(function(a, b) {
                return (a.orden - b.orden) || String(a.fecha).localeCompare(String(b.fecha));
            });
            if (!partidos.length) {
                lista.innerHTML = '<p class="home-semana-vacio">Ningún equipo del club juega esta semana.</p>';
                flechas();
                return;
            }
            // El escudo del club, en amarillo dentro de un círculo negro: una
            // versión pequeña (64px) con el trazo algo más grueso para que se
            // lea a 16px.
            var ESCUDO = 'src/assets/escudo_mini.png';
            // Nuestro lado se llama como su categoría; las escuelas, con el
            // colegio detrás («Alevín Villafría - Germán Fdez. Ramos»).
            function nombreNuestro(categoria) {
                return String(categoria || '').split(' · ').join(' ');
            }
            function equipo(nombre, escudo, nuestro, goles, gana) {
                var img = nuestro
                    ? '<img class="st-escudo club" src="' + ESCUDO + '" alt="">'
                    : '<img class="st-escudo" src="' + VACIO + '"' + (escudo ? ' data-escudo="' + escapar(escudo) + '"' : '') + ' alt="">';
                return '<div class="st-equipo' + (nuestro ? ' nuestro' : '') + (gana ? ' gana' : '') + '">' + img +
                    '<span class="st-nombre" title="' + escapar(nombre) + '">' + escapar(nombre) + '</span>' +
                    (goles === null ? '' : '<span class="st-goles">' + goles + '</span>') +
                '</div>';
            }
            lista.innerHTML = partidos.map(function(p) {
                var f = String(p.fecha || ''), partesFecha = f.slice(0, 10).split('-'), hora = f.slice(11, 16);
                var d = new Date(+partesFecha[0], +partesFecha[1] - 1, +partesFecha[2]);
                var jugado = p.estado === 'Finalizado' && p.goles_local !== null && p.goles_visitante !== null;
                var dos = p.nuestro_local && p.nuestro_visitante;
                var nombreLocal = p.nuestro_local ? nombreNuestro(p.equipo_local || p.equipo) : bonito(p.local);
                var nombreVisitante = p.nuestro_visitante ? nombreNuestro(p.equipo_visitante || p.equipo) : bonito(p.visitante);
                var gl = jugado ? p.goles_local : null, gv = jugado ? p.goles_visitante : null;
                var lugar = bonito(p.pabellon);
                var horaTxt = hora && hora !== '00:00' ? hora : 'Por definir';
                // La tarjeta del primer equipo guarda la hora de inicio: mientras
                // se juega, la hora pasa a ser la pastilla roja del directo.
                var primera = !dos && (p.nuestro_local ? p.equipo_local : p.equipo_visitante) === 'Primera Nacional' && !jugado;
                return '<div class="semana-tarjeta' + (jugado ? ' jugado' : '') + '"' + (primera ? ' data-primera="1" data-inicio="' + escapar(f) + '"' : '') + '>' +
                    // «Sábado, 21/11 · 10:00» (o «· Final» si ya se jugó). La hora
                    // va en su propio span para que el directo pueda cambiarla.
                    '<div class="st-cab"><span class="st-fecha">' +
                        DIAS[d.getDay()] + ', ' + d.getDate() + '/' + (d.getMonth() + 1) + ' · ' +
                        (jugado ? '<span class="st-final">Final</span>' : '<span class="st-hora">' + horaTxt + '</span>') +
                    '</span></div>' +
                    equipo(nombreLocal, p.escudo_local, p.nuestro_local, gl, jugado && gl > gv) +
                    equipo(nombreVisitante, p.escudo_visitante, p.nuestro_visitante, gv, jugado && gv > gl) +
                    (lugar ? '<div class="st-lugar" title="' + escapar(lugar) + '">' + escapar(lugar) + '</div>' : '') +
                '</div>';
            }).join('');
            lista.scrollLeft = 0;
            cargarEscudos();
            actualizarDirectoTira();
            ajustarNombres();
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarNombres);
            flechas();
        }

        // Las flechas desplazan la tira una pantalla de tarjetas.
        Array.prototype.forEach.call(caja.querySelectorAll('.home-semana-flecha'), function(b) {
            b.addEventListener('click', function() {
                lista.scrollBy({ left: +b.getAttribute('data-dir') * Math.max(250, lista.clientWidth - 250), behavior: 'smooth' });
            });
        });
        lista.addEventListener('scroll', flechas, { passive: true });
        var esperaNombres = null;
        window.addEventListener('resize', function() {
            flechas();
            clearTimeout(esperaNombres);
            esperaNombres = setTimeout(ajustarNombres, 150);
        });

        function cargar() {
            if (cargado || getComputedStyle(caja).display === 'none') return;
            cargado = true;
            conRespaldo('/api/semana.json', './data/' + TEMPORADA_ACTUAL + '/semana.json?v=' + Date.now())
                .then(function(r) { if (!r.ok) throw new Error('semana ' + r.status); return r.json(); })
                .then(pintar)
                .catch(function() {
                    cargado = false;
                    lista.innerHTML = '<p class="home-semana-vacio">No se han podido cargar los partidos.</p>';
                });
        }
        // La tira se ve en todos los tamaños (en móvil sustituye al antiguo
        // banner del próximo partido), así que se carga siempre.
        cargar();
    })();

    // ── Banner del próximo partido ──
    // Sólo existe en la portada. Ahí lo pinta la sección de categorías con el
    // próximo partido que ya viene en el paquete de Primera Nacional, así que
    // no hace falta pedirlo aparte; cargarBannerAparte() queda para cuando el
    // paquete no lo trae o no llega. En las demás páginas no hay banner y no
    // se pide nada.
    var proximoPrimera = null;   // el próximo partido del primer equipo (con su directo)
    function pintarBanner(match) {
        proximoPrimera = match || null;
        actualizarDirectoTira();
        var banner = document.getElementById('match-banner');
        var bannerLink = document.getElementById('match-banner-link');
        if (!banner) return;
        if (!match) {
            // No upcoming match — hide the banner
            banner.style.display = 'none';
            return;
        }
        var vetustaEscudo = 'src/assets/escudo.png';

        // Home team
        var homeBadge = document.getElementById('match-home-badge');
        var homeNameFull = document.getElementById('match-home-name-full');
        var homeNameShort = document.getElementById('match-home-name-short');
        if (homeBadge) homeBadge.src = match.local.es_vetusta ? vetustaEscudo : (match.local.escudo || '');
        if (homeNameFull) homeNameFull.textContent = match.local.nombre || '';
        if (homeNameShort) homeNameShort.textContent = match.local.nombre_corto || '';

        // Away team
        var awayBadge = document.getElementById('match-away-badge');
        var awayNameFull = document.getElementById('match-away-name-full');
        var awayNameShort = document.getElementById('match-away-name-short');
        if (awayBadge) awayBadge.src = match.visitante.es_vetusta ? vetustaEscudo : (match.visitante.escudo || '');
        if (awayNameFull) awayNameFull.textContent = match.visitante.nombre || '';
        if (awayNameShort) awayNameShort.textContent = match.visitante.nombre_corto || '';

        // Center info. La línea del lugar guarda lo que necesita para
        // convertirse en la pastilla STREAMING mientras se juega el partido.
        var venue = document.getElementById('match-venue');
        var datetime = document.getElementById('match-datetime');
        if (venue) {
            venue.setAttribute('data-sede', match.sede || '');
            venue.setAttribute('data-inicio', match.fecha || '');
            venue.setAttribute('data-streaming', match.url_streaming ? '1' : '');
            actualizarDirectoBanner();
        }
        if (datetime) datetime.textContent = match.fecha_display || '';

        // Longer "Horario por definir" text needs smaller type
        var center = document.querySelector('.match-center');
        if (center) {
            center.classList.toggle('match-center-tbd', !!match.fecha_por_definir);
        }

        // ── Enlace al directo ──
        if (match.url_streaming) {
            if (bannerLink) bannerLink.href = match.url_streaming;
        } else if (bannerLink) {
            // No streaming URL: make banner link non-clickable
            bannerLink.removeAttribute('href');
            bannerLink.style.cursor = 'default';
        }
    }

    // Mientras se juega un partido con directo, la línea del lugar del banner
    // pasa a ser la pastilla roja STREAMING; fuera de ese rato, el lugar.
    // Se revisa cada minuto por si la página se queda abierta.
    function actualizarDirectoBanner() {
        var venue = document.getElementById('match-venue');
        if (!venue) return;
        var live = venue.getAttribute('data-streaming') === '1' && enDirecto(venue.getAttribute('data-inicio'));
        if (live) {
            if (!venue.querySelector('.match-streaming')) venue.innerHTML = '<span class="match-streaming">Streaming</span>';
        } else {
            venue.textContent = venue.getAttribute('data-sede') || '';
        }
    }
    setInterval(actualizarDirectoBanner, 60000);

    // Lo mismo en la tira de partidos de la semana: mientras se juega el
    // partido del primer equipo y hay directo, su pastilla de la hora pasa a
    // ser la roja del streaming, con el enlace al directo.
    function actualizarDirectoTira() {
        var tarjeta = document.querySelector('.semana-tarjeta[data-primera]');
        if (!tarjeta) return;
        var pastilla = tarjeta.querySelector('.st-hora, .st-directo');
        if (!pastilla) return;
        var url = proximoPrimera && proximoPrimera.url_streaming;
        var live = !!url && enDirecto(tarjeta.getAttribute('data-inicio'));
        if (live && !pastilla.classList.contains('st-directo')) {
            var a = document.createElement('a');
            a.className = 'st-directo';
            a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.textContent = 'Streaming';
            a.setAttribute('data-hora', pastilla.textContent);
            pastilla.parentNode.replaceChild(a, pastilla);
        } else if (!live && pastilla.classList.contains('st-directo')) {
            var h = document.createElement('span');
            h.className = 'st-hora';
            h.textContent = pastilla.getAttribute('data-hora') || '';
            pastilla.parentNode.replaceChild(h, pastilla);
        }
    }
    window.actualizarDirectoTira = actualizarDirectoTira;
    setInterval(actualizarDirectoTira, 60000);

    function cargarBannerAparte() {
        if (!document.getElementById('match-banner') && !document.getElementById('home-semana')) return;

        // Determine base path to data/ depending on page depth
        var scriptTags = document.querySelectorAll('script[src*="script.js"]');
        var basePath = './';
        if (scriptTags.length > 0) {
            var src = scriptTags[0].getAttribute('src');
            if (src && src.indexOf('../') === 0) {
                basePath = '../';
            }
        }

        conRespaldo('/api/liga/' + TEMPORADA_ACTUAL + '/proximo-partido.json', basePath + 'data/proximo-partido.json?v=' + Date.now())
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(pintarBanner)
            .catch(function() { /* silently ignore */ });
    }

    // ── Scroll animations (IntersectionObserver) ──
    // Delay setup until loading screen is gone so elements aren't
    // detected as visible while the page is still covered.
    function setupScrollAnimations() {
        if (!('IntersectionObserver' in window)) return;

        // Fade in for about section
        var aboutSection = document.querySelector('.about-section');
        if (aboutSection) {
            aboutSection.style.opacity = '0';
            aboutSection.style.transform = 'translateY(30px)';
            aboutSection.style.transition = 'opacity 1.2s ease, transform 1.2s ease';

            var aboutObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                        aboutObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15 });

            aboutObserver.observe(aboutSection);
        }

        // Stagger for liga panels
        var ligaPanels = document.querySelectorAll('.liga-section .liga-panel');
        if (ligaPanels.length > 0) {
            ligaPanels.forEach(function(panel) {
                panel.style.opacity = '0';
                panel.style.transform = 'translateY(25px)';
                panel.style.transition = 'opacity 1s ease, transform 1s ease';
            });

            var ligaObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        var panels = entry.target.querySelectorAll('.liga-panel');
                        panels.forEach(function(panel, i) {
                            setTimeout(function() {
                                panel.style.opacity = '1';
                                panel.style.transform = 'translateY(0)';
                            }, i * 200);
                        });
                        ligaObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.05 });

            var ligaSection = document.querySelector('.liga-section');
            if (ligaSection) ligaObserver.observe(ligaSection);
        }

        // Stagger for prensa cards
        var prensaCards = document.querySelectorAll('.prensa-featured, .prensa-thumb');
        if (prensaCards.length > 0) {
            prensaCards.forEach(function(card) {
                card.style.opacity = '0';
                card.style.transform = 'translateY(25px)';
                card.style.transition = 'opacity 1s ease, transform 1s ease';
            });

            var prensaObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        var cards = entry.target.querySelectorAll('.prensa-featured, .prensa-thumb');
                        cards.forEach(function(card, i) {
                            setTimeout(function() {
                                card.style.opacity = '1';
                                card.style.transform = 'translateY(0)';
                            }, i * 200);
                        });
                        prensaObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });

            var prensaGrid = document.querySelector('.prensa-preview-grid');
            if (prensaGrid) prensaObserver.observe(prensaGrid);
        }

        // Teams carousel: opacity-only fade (NO transform — a translate would
        // shift its measured top and break the above-fold sizing).
        var teamsCarousel = document.querySelector('.carousel-section');
        if (teamsCarousel) {
            teamsCarousel.style.opacity = '0';
            teamsCarousel.style.transition = 'opacity 1s ease';
            var teamsObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        teamsObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            teamsObserver.observe(teamsCarousel);
        }

        // Sponsors: gentle fade-up.
        var sponsors = document.querySelector('.sponsors-carousel-section');
        if (sponsors) {
            sponsors.style.opacity = '0';
            sponsors.style.transform = 'translateY(25px)';
            sponsors.style.transition = 'opacity 1s ease, transform 1s ease';
            var sponsorsObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                        sponsorsObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            sponsorsObserver.observe(sponsors);
        }
    }

    // Vídeo de la campaña: el iframe aparece sobre su miniatura cuando
    // YouTube termina de cargar (onload en el HTML). Si el aviso no llega
    // (bloqueadores, redes lentas), se muestra igualmente a los 8 s para que
    // nunca quede una miniatura que no responde.
    setTimeout(function () {
        document.querySelectorAll('.home-video iframe, .abono-video iframe').forEach(function (f) {
            f.classList.add('cargado');
        });
    }, 8000);

    // Start scroll animations after loading screen fades out
    var loadingDone = document.getElementById('loading-screen');
    if (loadingDone) {
        loadingDone.addEventListener('transitionend', setupScrollAnimations);
    } else {
        setupScrollAnimations();
    }
});

// Animaciones que se comportan como una imagen animada (el carnet de abonado):
// sin sonido, en bucle y sin controles. El archivo no se descarga hasta que
// la animación está a punto de verse —en móvil suele quedar lejos, y en
// escritorio la de la portada ni se muestra—, y se pausa al salir de pantalla
// para no gastar batería. Se anima también con «Reducir movimiento» activado
// en el sistema: así lo ha decidido el club para la campaña de abonados.
(function () {
    var videos = document.querySelectorAll('video.anim-auto');
    if (!videos.length) return;

    var aLaVista = [];        // los que están en pantalla (o a punto)
    var esperandoToque = false;

    // Descarga: el archivo se pide antes de que se vea, para que esté listo.
    function cargar(v) {
        if (v.getAttribute('src')) return;
        v.preload = 'auto';
        v.src = v.dataset.src;
    }

    function arrancar(v) {
        cargar(v);
        v.muted = true;                  // sin esto los navegadores no dejan arrancarlo solo
        if (!v.paused) return;
        var p = v.play();
        if (p && p.catch) p.catch(function () {
            // El iPhone en modo de ahorro de batería (o con la reproducción
            // automática desactivada) no deja arrancar un vídeo solo, pero sí
            // dentro de un toque: se reintenta en el siguiente.
            alSiguienteToque();
        });
    }

    function reanudar() {
        if (document.hidden) return;
        aLaVista.forEach(arrancar);
    }

    function alSiguienteToque() {
        if (esperandoToque) return;
        esperandoToque = true;
        function alTocar() {
            esperandoToque = false;
            document.removeEventListener('touchend', alTocar, true);
            document.removeEventListener('click', alTocar, true);
            reanudar();
        }
        document.addEventListener('touchend', alTocar, { capture: true, passive: true });
        document.addEventListener('click', alTocar, true);
    }

    // Safari pausa los vídeos al cambiar de app, bloquear el móvil o volver
    // a la página desde el historial, y al regresar no los reanuda; como la
    // animación sigue en pantalla, el observador no vuelve a avisar y se
    // quedaba congelada. Se reanudan aquí.
    document.addEventListener('visibilitychange', reanudar);
    window.addEventListener('pageshow', reanudar);
    window.addEventListener('focus', reanudar);

    videos.forEach(function (v) {
        // Por si el bucle falla (algún Safari se para al final en vez de
        // volver al principio).
        v.addEventListener('ended', function () {
            v.currentTime = 0;
            if (aLaVista.indexOf(v) >= 0) arrancar(v);
        });
    });

    if (!('IntersectionObserver' in window)) {
        videos.forEach(function (v) { aLaVista.push(v); arrancar(v); });
        return;
    }
    // Dos observadores: uno descarga el vídeo cuando está a 300 px de verse y
    // otro lo arranca sólo cuando ya asoma en pantalla. El iPhone no deja
    // arrancar solo un vídeo que aún no se ve (rechaza el play()), y como el
    // de la portada se pedía 300 px antes, se quedaba quieto hasta tocar la
    // pantalla. Con varios umbrales, el de visibilidad avisa varias veces
    // mientras el vídeo entra, y cada aviso es un nuevo intento.
    // Un vídeo oculto con display:none nunca cruza el viewport, así que la
    // versión que no toca en cada tamaño de pantalla no llega a descargarse.
    var cerca = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
            if (e.isIntersecting) { cargar(e.target); cerca.unobserve(e.target); }
        });
    }, { rootMargin: '300px 0px' });
    var vista = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
            var v = e.target, i = aLaVista.indexOf(v);
            if (e.isIntersecting) {
                if (i < 0) aLaVista.push(v);
                arrancar(v);
            } else {
                if (i >= 0) aLaVista.splice(i, 1);
                if (!v.paused) v.pause();
            }
        });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    videos.forEach(function (v) { cerca.observe(v); vista.observe(v); });
})();
